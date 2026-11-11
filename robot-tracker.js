/**
 * Cursor-Tracking 3D Robot Head Component
 * Dependency-free, vanilla ES-module, Canvas 2D image sequence renderer.
 * 
 * Features:
 * - Exponential frame-rate independent damping
 * - Piecewise asymmetric frame mapping
 * - Touch pan-y pass-through & touch idle sweep
 * - Zero idle CPU when settled
 * - Vertical parallax & resting breathing bob
 * - Prefers-reduced-motion, VisibilityState, and IntersectionObserver support
 * - Dynamic DPR handling & cached layout rects
 * - Debug HUD toggleable via 'D' key
 */

export class RobotTracker {
  constructor(container, options = {}) {
    if (!container) {
      throw new Error('[RobotTracker] A valid container element is required.');
    }

    this.container = container;
    this.options = Object.assign(
      {
        frameCount: 97,
        framePath: (idx) => `assets/frames/f_${String(idx).padStart(3, '0')}.webp`,
        posterPath: 'assets/frames/poster.webp',
        frontFrame: 56,
        trackingRange: 0.5,
        smoothing: 0.12,
        leaveBehavior: 'return-to-front', // 'return-to-front' | 'stay'
        idleReturnMs: 2500,
        background: 'transparent',
        verticalParallax: true,
        maxTranslateY: 6,
        maxScale: 1.02,
        breathingBob: true,
        invert: false,
        easeCurve: 'smoothstep', // 'smoothstep' | 'gentle' | 'linear'
        screenBlend: false,
        enableDebugHUD: false,
        touchIdleScan: true,
        onReady: null,
        onFrameChange: null,
      },
      options
    );

    // Frame storage
    this.frames = new Array(this.options.frameCount).fill(null);
    this.posterBitmap = null;
    this.loadedCount = 0;
    this.isReady = false;
    this.isDestroyed = false;

    // Animation state
    this.currentFrame = this.options.frontFrame;
    this.targetFrame = this.options.frontFrame;
    this.lastDrawnFrame = -1;

    this.currentTranslateY = 0;
    this.targetTranslateY = 0;
    this.currentScale = 1;
    this.targetScale = 1;

    this.dx = 0;
    this.dy = 0;
    this.lastPointerMoveTime = performance.now();
    this.isPointerOver = false;
    this.isIdle = true;
    this.idleScanAngle = 0;

    // Performance & rAF
    this.rafId = null;
    this.lastTime = performance.now();
    this.fps = 60;
    this.frameCountSinceFps = 0;
    this.lastFpsUpdate = performance.now();
    this.isPaused = false;
    this.isVisible = true;

    // Cached geometry
    this.cachedRect = { left: 0, top: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Check media queries
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    this._initDOM();
    this._initEvents();
    this._startPreload();
  }

  _initDOM() {
    this.container.classList.add('robot-tracker-container');
    if (this.options.screenBlend) {
      this.container.classList.add('screen-blend');
    }

    // Inner wrapper for vertical parallax & breathing transforms
    this.innerWrapper = document.createElement('div');
    this.innerWrapper.className = 'robot-tracker-inner';

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'robot-tracker-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Interactive 3D robot mascot head that follows your cursor');
    this.ctx = this.canvas.getContext('2d', { alpha: true });

    this.innerWrapper.appendChild(this.canvas);
    this.container.appendChild(this.innerWrapper);

    // Minimal loader indicator
    this.loader = document.createElement('div');
    this.loader.className = 'robot-tracker-loader';
    this.container.appendChild(this.loader);

    // Debug HUD
    this.debugHUD = document.createElement('div');
    this.debugHUD.className = 'robot-tracker-debug-hud';
    this.debugHUD.style.display = this.options.enableDebugHUD ? 'block' : 'none';
    this.container.appendChild(this.debugHUD);

    this._updateGeometry();
  }

  _initEvents() {
    // Bound handlers
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerLeave = this._handlePointerLeave.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onVisibilityChange = this._handleVisibilityChange.bind(this);
    this._onResize = this._handleResize.bind(this);
    this._onScroll = this._handleScroll.bind(this);

    // Window pointer events (passive)
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this._onPointerDown, { passive: true });
    window.addEventListener('pointerup', this._onPointerUp, { passive: true });
    document.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
    window.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget && !e.toElement) {
        this._onPointerLeave();
      }
    }, { passive: true });

    // Keyboard shortcut for debug HUD
    window.addEventListener('keydown', this._onKeyDown);

    // Visibility & Lifecycle
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // ResizeObserver on container
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this._onResize());
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this._onResize, { passive: true });
    }

    // Scroll listener (passive) to refresh cached rect without layout thrashing
    window.addEventListener('scroll', this._onScroll, { passive: true });

    // IntersectionObserver to pause loop when completely off-screen
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        this.isVisible = entry.isIntersecting;
        if (this.isVisible) {
          this._resumeLoop();
        }
      }, { threshold: 0.05 });
      this.intersectionObserver.observe(this.container);
    }

    // Media query listener
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', (e) => {
        this.reducedMotion = e.matches;
      });
    }
  }

  _updateGeometry() {
    const rect = this.container.getBoundingClientRect();
    this.cachedRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(rect.width * this.dpr);
    const pixelHeight = Math.round(rect.height * this.dpr);

    if (pixelWidth > 0 && pixelHeight > 0) {
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
        this.lastDrawnFrame = -1; // Force redraw on resize
        this._drawCurrentFrame();
      }
    }
  }

  _handleResize() {
    this._updateGeometry();
    this._resumeLoop();
  }

  _handleScroll() {
    // Fast update of bounding rect position without forcing sync style calculation
    const rect = this.container.getBoundingClientRect();
    this.cachedRect.left = rect.left;
    this.cachedRect.top = rect.top;
    this.cachedRect.centerX = rect.left + rect.width / 2;
    this.cachedRect.centerY = rect.top + rect.height / 2;
  }

  _handleVisibilityChange() {
    if (document.hidden) {
      this.isPaused = true;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    } else {
      this.isPaused = false;
      this.lastTime = performance.now();
      this._resumeLoop();
    }
  }

  _handleKeyDown(e) {
    if ((e.key === 'd' || e.key === 'D') && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      this.options.enableDebugHUD = !this.options.enableDebugHUD;
      this.debugHUD.style.display = this.options.enableDebugHUD ? 'block' : 'none';
      if (this.options.enableDebugHUD) {
        this._resumeLoop();
      }
    }
  }

  async _startPreload() {
    // Show loader only if loading takes more than 400ms
    const loaderTimer = setTimeout(() => {
      if (!this.isReady && !this.isDestroyed) {
        this.loader.classList.add('visible');
      }
    }, 400);

    // 1. First, quickly load the poster frame for instantaneous first paint
    try {
      const posterPath = typeof this.options.posterPath === 'function'
        ? this.options.posterPath()
        : this.options.posterPath;

      const posterImg = await this._loadSingleImageBitmap(posterPath);
      if (posterImg && !this.isDestroyed) {
        this.posterBitmap = posterImg;
        this.frames[this.options.frontFrame] = posterImg;
        this._drawBitmap(posterImg);
      }
    } catch (err) {
      console.warn('[RobotTracker] Poster image load failed, continuing frame preloading...', err);
    }

    // 2. Preload all 97 frames in parallel
    const framePromises = [];
    for (let i = 0; i < this.options.frameCount; i++) {
      const path = typeof this.options.framePath === 'function'
        ? this.options.framePath(i)
        : this.options.framePath.replace('{n}', String(i).padStart(3, '0'));

      framePromises.push(
        this._loadSingleImageBitmap(path)
          .then((bitmap) => {
            if (this.isDestroyed) return;
            this.frames[i] = bitmap;
            this.loadedCount++;
          })
          .catch((err) => {
            console.warn(`[RobotTracker] Failed loading frame ${i}:`, err);
          })
      );
    }

    await Promise.all(framePromises);
    clearTimeout(loaderTimer);

    if (this.isDestroyed) return;

    this.loader.classList.remove('visible');
    this.isReady = true;

    // Fill missing frames with nearest neighbors
    this._repairMissingFrames();

    // Redraw initial front frame
    this._drawCurrentFrame();

    if (typeof this.options.onReady === 'function') {
      this.options.onReady(this);
    }

    this._resumeLoop();
  }

  async _loadSingleImageBitmap(url) {
    if ('createImageBitmap' in window) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      return await createImageBitmap(blob);
    } else {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    }
  }

  _repairMissingFrames() {
    let lastValid = this.posterBitmap;
    for (let i = 0; i < this.options.frameCount; i++) {
      if (this.frames[i]) {
        lastValid = this.frames[i];
      } else if (lastValid) {
        this.frames[i] = lastValid;
      }
    }
    // Backward pass
    for (let i = this.options.frameCount - 1; i >= 0; i--) {
      if (this.frames[i]) {
        lastValid = this.frames[i];
      } else if (lastValid) {
        this.frames[i] = lastValid;
      }
    }
  }

  _handlePointerMove(e) {
    this.lastPointerMoveTime = performance.now();
    this.isPointerOver = true;
    this.isIdle = false;

    const cursorX = e.clientX;
    const cursorY = e.clientY;

    this._computeTrackingTarget(cursorX, cursorY);
    this._resumeLoop();
  }

  _handlePointerDown(e) {
    this.lastPointerMoveTime = performance.now();
    this.isPointerOver = true;
    this.isIdle = false;
    this._computeTrackingTarget(e.clientX, e.clientY);
    this._resumeLoop();
  }

  _handlePointerUp() {
    if (this.isTouchDevice && this.options.leaveBehavior === 'return-to-front') {
      this.targetFrame = this.options.frontFrame;
      this.targetTranslateY = 0;
      this.targetScale = 1;
      this._resumeLoop();
    }
  }

  _handlePointerLeave() {
    this.isPointerOver = false;
    if (this.options.leaveBehavior === 'return-to-front') {
      this.targetFrame = this.options.frontFrame;
      this.targetTranslateY = 0;
      this.targetScale = 1;
      this._resumeLoop();
    }
  }

  _computeTrackingTarget(cursorX, cursorY) {
    const vpWidth = window.innerWidth || document.documentElement.clientWidth || 1000;
    const vpHeight = window.innerHeight || document.documentElement.clientHeight || 800;

    // 1. Horizontal mapping relative to robot's center
    const rangePx = vpWidth * this.options.trackingRange;
    let rawDx = (cursorX - this.cachedRect.centerX) / rangePx;
    let clampedDx = Math.max(-1, Math.min(1, rawDx));

    if (this.options.invert) {
      clampedDx = -clampedDx;
    }

    this.dx = clampedDx;

    // Apply ease curve to dx
    let easedDx = clampedDx;
    const sign = Math.sign(clampedDx);
    const absDx = Math.abs(clampedDx);

    if (this.options.easeCurve === 'smoothstep') {
      easedDx = sign * (absDx * absDx * (3 - 2 * absDx));
    } else if (this.options.easeCurve === 'gentle') {
      easedDx = sign * Math.pow(absDx, 1.25);
    }

    // Piecewise asymmetric mapping:
    // dx < 0 (cursor to LEFT of robot): targetFrame = frontFrame + dx * frontFrame
    // dx >= 0 (cursor to RIGHT of robot): targetFrame = frontFrame + dx * (lastFrame - frontFrame)
    const front = this.options.frontFrame;
    const last = this.options.frameCount - 1;

    if (easedDx < 0) {
      this.targetFrame = front + easedDx * front;
    } else {
      this.targetFrame = front + easedDx * (last - front);
    }
    this.targetFrame = Math.max(0, Math.min(last, this.targetFrame));

    // 2. Vertical Parallax (subtle translateY up to ±maxTranslateY & tiny scale)
    if (this.options.verticalParallax) {
      const rawDy = (cursorY - this.cachedRect.centerY) / (vpHeight * 0.5);
      const clampedDy = Math.max(-1, Math.min(1, rawDy));
      this.dy = clampedDy;

      this.targetTranslateY = clampedDy * this.options.maxTranslateY;
      this.targetScale = 1 + Math.abs(clampedDy) * (this.options.maxScale - 1);
    }
  }

  _resumeLoop() {
    if (this.isDestroyed || this.isPaused || !this.isVisible) return;
    if (!this.rafId) {
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this._tick.bind(this));
    }
  }

  _tick(now) {
    this.rafId = null;
    if (this.isDestroyed || this.isPaused || !this.isVisible) return;

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.05) dt = 0.05; // clamp to 50ms to survive tab switches / frame drops

    // Update FPS calculation for debug overlay
    this.frameCountSinceFps++;
    if (now - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCountSinceFps * 1000) / (now - this.lastFpsUpdate));
      this.frameCountSinceFps = 0;
      this.lastFpsUpdate = now;
    }

    // Idle return check
    const timeSinceMove = now - this.lastPointerMoveTime;
    if (this.options.idleReturnMs > 0 && timeSinceMove > this.options.idleReturnMs && !this.isIdle) {
      this.isIdle = true;
      if (this.options.leaveBehavior === 'return-to-front') {
        this.targetFrame = this.options.frontFrame;
        this.targetTranslateY = 0;
        this.targetScale = 1;
      }
    }

    // Touch idle "look around" scan (sine sweep between ~frames 35 and 75)
    if (this.isTouchDevice && this.options.touchIdleScan && this.isIdle && !this.reducedMotion) {
      this.idleScanAngle += dt * 0.9;
      const scanOffset = Math.sin(this.idleScanAngle) * 20;
      this.targetFrame = this.options.frontFrame + scanOffset;
    }

    // Frame-rate independent exponential damping:
    // current += (target - current) * (1 - Math.exp(-dt / tau))
    const tau = Math.max(0.01, this.options.smoothing);
    const dampingFactor = this.reducedMotion ? 1.0 : (1 - Math.exp(-dt / tau));

    this.currentFrame += (this.targetFrame - this.currentFrame) * dampingFactor;
    this.currentTranslateY += (this.targetTranslateY - this.currentTranslateY) * dampingFactor;
    this.currentScale += (this.targetScale - this.currentScale) * dampingFactor;

    // Breathing bob when at rest
    const frameDiff = Math.abs(this.targetFrame - this.currentFrame);
    const isAtRest = frameDiff < 0.05;
    let bobY = 0;

    if (this.options.breathingBob && isAtRest && !this.reducedMotion) {
      // 4-second period gentle sine wave: ±2px
      bobY = Math.sin(now * 0.00157) * 2;
    }

    // Apply CSS transform to inner wrapper
    const totalY = this.currentTranslateY + bobY;
    this.innerWrapper.style.transform = `translate3d(0, ${totalY.toFixed(2)}px, 0) scale(${this.currentScale.toFixed(4)})`;

    // Canvas draw: only redraw when rounded frame index actually changes
    const roundedFrame = Math.round(this.currentFrame);
    if (roundedFrame !== this.lastDrawnFrame) {
      this._drawFrameIndex(roundedFrame);
      this.lastDrawnFrame = roundedFrame;
      if (typeof this.options.onFrameChange === 'function') {
        this.options.onFrameChange(roundedFrame);
      }
    }

    // Update Debug HUD if open
    if (this.options.enableDebugHUD) {
      this._updateDebugHUD();
    }

    // Settled condition: stop loop if near zero motion to achieve ZERO IDLE CPU
    const transDiff = Math.abs(this.targetTranslateY - this.currentTranslateY);
    const scaleDiff = Math.abs(this.targetScale - this.currentScale);
    const canSleep = frameDiff < 0.01 && transDiff < 0.05 && scaleDiff < 0.001 && !this.options.enableDebugHUD;

    if (canSleep && (!this.options.breathingBob || this.reducedMotion)) {
      // Snap to target and sleep
      this.currentFrame = this.targetFrame;
      this.currentTranslateY = this.targetTranslateY;
      this.currentScale = this.targetScale;
      return; // Stop rAF loop
    }

    // Continue loop
    this.rafId = requestAnimationFrame(this._tick.bind(this));
  }

  _drawFrameIndex(frameIdx) {
    if (!this.canvas || !this.ctx) return;
    const bitmap = this.frames[frameIdx] || this.posterBitmap;
    if (bitmap) {
      this._drawBitmap(bitmap);
    }
  }

  _drawCurrentFrame() {
    const rounded = Math.round(this.currentFrame);
    this._drawFrameIndex(rounded);
    this.lastDrawnFrame = rounded;
  }

  _drawBitmap(bitmap) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    this.ctx.clearRect(0, 0, w, h);
    if (this.options.background && this.options.background !== 'transparent') {
      this.ctx.fillStyle = this.options.background;
      this.ctx.fillRect(0, 0, w, h);
    }
    this.ctx.drawImage(bitmap, 0, 0, w, h);
  }

  _updateDebugHUD() {
    this.debugHUD.innerHTML = `
      <div>ROBOT TRACKER HUD [Toggle 'D']</div>
      <div>FPS: <span class="val">${this.fps}</span></div>
      <div>Frame: <span class="val">${this.currentFrame.toFixed(1)}</span> / target: <span class="val">${this.targetFrame.toFixed(1)}</span></div>
      <div>Rounded Frame: <span class="val">${Math.round(this.currentFrame)}</span> / ${this.options.frameCount - 1}</div>
      <div>dx: <span class="val">${this.dx.toFixed(3)}</span> | dy: <span class="val">${this.dy.toFixed(3)}</span></div>
      <div>TranslateY: <span class="val">${this.currentTranslateY.toFixed(2)}px</span></div>
      <div>Scale: <span class="val">${this.currentScale.toFixed(3)}</span></div>
      <div>Status: <span class="val">${this.isIdle ? 'IDLE' : 'TRACKING'}</span></div>
      <div>Loaded: <span class="val">${this.loadedCount}</span> / ${this.options.frameCount}</div>
    `;
  }

  // Public API methods
  setTargetFrame(frameIndex) {
    this.targetFrame = Math.max(0, Math.min(this.options.frameCount - 1, frameIndex));
    this.isIdle = false;
    this._resumeLoop();
  }

  resetToFront() {
    this.targetFrame = this.options.frontFrame;
    this.targetTranslateY = 0;
    this.targetScale = 1;
    this.isIdle = true;
    this._resumeLoop();
  }

  destroy() {
    this.isDestroyed = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
    document.removeEventListener('pointerleave', this._onPointerLeave);
    window.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('scroll', this._onScroll);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', this._onResize);
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    // Clean up bitmaps if supported
    for (let i = 0; i < this.frames.length; i++) {
      if (this.frames[i] && typeof this.frames[i].close === 'function') {
        this.frames[i].close();
      }
    }
    if (this.posterBitmap && typeof this.posterBitmap.close === 'function') {
      this.posterBitmap.close();
    }

    this.container.innerHTML = '';
    this.container.classList.remove('robot-tracker-container', 'screen-blend');
  }
}

/**
 * Factory function for easy mounting
 */
export function createRobotTracker(containerElement, options = {}) {
  return new RobotTracker(containerElement, options);
}

// Attach to window for non-module script tag usage
if (typeof window !== 'undefined') {
  window.createRobotTracker = createRobotTracker;
  window.RobotTracker = RobotTracker;
}

