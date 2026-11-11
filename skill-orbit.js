/**
 * Interactive 3D Skill Universe Orbit Engine
 * Custom Crimson Cosmic Edition for Joy Patel's Portfolio
 */

(function () {
    const SKILLS = [
        // Ring 1: Languages
        { name: 'C',            category: 'Language',  icon: 'devicon-c-plain colored',               desc: 'Foundation of systems programming. Used for low-level memory management, OS kernels and performance-critical applications.' },
        { name: 'C++',          category: 'Language',  icon: 'devicon-cplusplus-plain colored',        desc: 'OOP powerhouse for competitive programming, game engines and high-performance software with fine-grained memory control.' },
        { name: 'Java',         category: 'Language',  icon: 'devicon-java-plain colored',             desc: 'Platform-independent language used for backend services, Android development and enterprise-scale systems.' },
        { name: 'Python',       category: 'Language',  icon: 'devicon-python-plain colored',           desc: 'Versatile scripting language used for automation, data science, AI/ML pipelines and rapid prototyping.' },
        { name: 'JavaScript',   category: 'Language',  icon: 'devicon-javascript-plain colored',       desc: 'The language of the web. Powers dynamic UIs, server-side logic with Node.js and everything in between.' },
        { name: 'TypeScript',   category: 'Language',  icon: 'devicon-typescript-plain colored',       desc: 'Typed superset of JavaScript that catches bugs at compile time and scales large codebases with confidence.' },
        { name: 'HTML',         category: 'Language',  icon: 'devicon-html5-plain colored',            desc: 'Semantic markup language forming the structural backbone of every web page and application.' },
        { name: 'CSS',          category: 'Language',  icon: 'devicon-css3-plain colored',             desc: 'Styling language for crafting responsive, animated and visually polished user interfaces.' },

        // Ring 2: Frameworks
        { name: 'React.js',     category: 'Framework', icon: 'devicon-react-original colored',         desc: 'Component-based UI library for building fast, declarative and reusable front-end interfaces at scale.' },
        { name: 'Node.js',      category: 'Framework', icon: 'devicon-nodejs-plain colored',           desc: 'JavaScript runtime for building scalable server-side applications and REST APIs with non-blocking I/O.' },
        { name: 'Express.js',   category: 'Framework', icon: 'devicon-express-original colored',       desc: 'Minimal Node.js web framework for building robust APIs and server logic with clean routing patterns.' },
        { name: 'Tailwind CSS', category: 'Framework', icon: 'devicon-tailwindcss-plain colored',      desc: 'Utility-first CSS framework enabling rapid UI development without ever leaving your HTML markup.' },
        { name: 'Socket.IO',    category: 'Framework', icon: 'devicon-socketio-original colored',      desc: 'Real-time bidirectional event-based communication for live chats, dashboards and multiplayer apps.' },

        // Ring 3: Tools & Databases
        { name: 'MongoDB',      category: 'Database',  icon: 'devicon-mongodb-plain colored',          desc: 'NoSQL document database for flexible schema design, horizontal scaling and JSON-native data storage.' },
        { name: 'PostgreSQL',   category: 'Database',  icon: 'devicon-postgresql-plain colored',       desc: 'Advanced relational database with full ACID compliance, complex queries and powerful extensions.' },
        { name: 'Prisma ORM',   category: 'Database',  icon: 'devicon-prisma-original colored',        desc: 'Type-safe ORM for Node.js that auto-generates queries and migrations from a declarative schema file.' },
        { name: 'MySQL',        category: 'Database',  icon: 'devicon-mysql-plain colored',            desc: 'Most popular open-source relational database, widely used in web apps and data warehousing.' },
        { name: 'Git',          category: 'Tool',      icon: 'devicon-git-plain colored',              desc: 'Distributed version control system for tracking changes, branching workflows and team collaboration.' },
        { name: 'GitHub',       category: 'Tool',      icon: 'devicon-github-original colored',        desc: 'Cloud platform for hosting repositories, code reviews, CI/CD pipelines and open-source contributions.' },
        { name: 'AWS',          category: 'Cloud',     icon: 'devicon-amazonwebservices-plain colored', desc: 'Amazon cloud platform offering compute, storage and AI services powering millions of applications globally.' },
        { name: 'Linux',        category: 'Tool',      icon: 'devicon-linux-plain colored',            desc: 'Open-source OS kernel preferred for servers, development environments and DevOps workflows.' },
        { name: 'OpenAI API',   category: 'AI',        icon: 'devicon-fastapi-plain colored',          desc: 'Integrated GPT models for intelligent features including smart search, summarization and chat functionality.' },
        { name: 'JWT Auth',     category: 'Security',  icon: 'devicon-nodejs-plain colored',           desc: 'Stateless authentication using signed JSON tokens for secure and scalable user session management.' },
        { name: 'OAuth 2.0',    category: 'Security',  icon: 'devicon-google-plain colored',           desc: 'Industry-standard authorization protocol enabling secure third-party login via Google, GitHub and more.' },
        { name: 'DSA',          category: 'Core CS',   icon: 'devicon-vitejs-plain colored',           desc: 'Solved 180+ problems across arrays, trees, graphs, DP and more. Strong algorithmic thinking for system design.' }
    ];

    const ZOOM = 2.4;
    let zoomMode = false;
    let currentIdx = 0;
    let isAnimating = false;
    let wheelLocked = false;
    let allIcons = [];

    // DOM UI Overlays for Cinematic Zoom
    const label = document.createElement('div');
    label.className = 'skill-planet-label';
    label.innerHTML = `
        <div class="spl-category"></div>
        <div class="spl-name"></div>
        <div class="spl-desc"></div>
        <div class="spl-counter"><span class="spl-cur">1</span>&nbsp;/&nbsp;<span class="spl-tot">${SKILLS.length}</span></div>
    `;

    const exitBtn = document.createElement('button');
    exitBtn.className = 'skill-planet-exit';
    exitBtn.innerHTML = '<i class="fas fa-compress-alt"></i>&nbsp;EXIT UNIVERSE';

    const hint = document.createElement('div');
    hint.className = 'skill-planet-hint';
    hint.textContent = '↓ Scroll / Arrow Keys to travel · ESC to exit';

    [label, exitBtn, hint].forEach(el => {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        document.body.appendChild(el);
    });

    function initOrbit() {
        const scene = document.querySelector('.orbiting-scene');
        const center = document.getElementById('orbitCenter');
        if (!scene || !center) return;

        // Continuous Orbital Rotation Engine
        const rings = [
            { el: document.querySelector('.orbit-ring-1'), speed: 0.38, dir:  1, _paused: false },
            { el: document.querySelector('.orbit-ring-2'), speed: 0.24, dir: -1, _paused: false },
            { el: document.querySelector('.orbit-ring-3'), speed: 0.15, dir:  1, _paused: false },
        ];
        window._orbitRings = rings;

        rings.forEach(ring => {
            if (!ring.el) return;
            const icons = Array.from(ring.el.querySelectorAll('.orbit-icon'));
            ring.icons = icons.map((el, i) => ({ el, angle: (i / icons.length) * Math.PI * 2 }));
        });

        let lastTs = null;
        function orbitTick(ts) {
            const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
            lastTs = ts;

            rings.forEach(ring => {
                if (!ring.el || ring._paused) return;
                const rx = ring.el.offsetWidth  / 2;
                const ry = ring.el.offsetHeight / 2;
                ring.icons.forEach(ic => {
                    ic.angle += ring.speed * ring.dir * dt;
                    ic.el.style.left = (rx + rx * Math.cos(ic.angle)) + 'px';
                    ic.el.style.top  = (ry + ry * Math.sin(ic.angle)) + 'px';
                    ic.el.style.transform = 'translate(-50%, -50%)';
                });
            });

            requestAnimationFrame(orbitTick);
        }
        requestAnimationFrame(orbitTick);

        // Build flat indexed icon list for exploration
        setTimeout(() => {
            ['orbit-ring-1', 'orbit-ring-2', 'orbit-ring-3'].forEach(cls => {
                const ring = document.querySelector('.' + cls);
                if (!ring) return;
                ring.querySelectorAll('.orbit-icon').forEach(el => {
                    const span = el.querySelector('span');
                    const name = span ? span.textContent.trim() : '';
                    const skill = SKILLS.find(s => s.name === name) || { name, category: 'Tech', desc: 'Core engineering skill and capability.' };
                    allIcons.push({ el, skill });

                    // Clicking any individual planet directly enters zoom focusing that planet
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const idx = allIcons.findIndex(item => item.el === el);
                        if (idx !== -1) {
                            if (!zoomMode) {
                                enterZoom(idx);
                            } else {
                                currentIdx = idx;
                                flyToIcon(idx);
                            }
                        }
                    });
                });
            });
            label.querySelector('.spl-tot').textContent = allIcons.length;
        }, 500);

        // Camera flight to specific skill planet
        function flyToIcon(idx, dur = 0.8) {
            if (!allIcons[idx] || typeof gsap === 'undefined') return;
            const { el, skill } = allIcons[idx];

            allIcons.forEach(o => {
                o.el.classList.remove('skill-planet-focus');
            });

            const vw = window.innerWidth;
            const vh = window.innerHeight;

            const curX = gsap.getProperty(scene, 'x') || 0;
            const curY = gsap.getProperty(scene, 'y') || 0;
            const curS = gsap.getProperty(scene, 'scale') || 1;

            const ir = el.getBoundingClientRect();
            const iconCX = ir.left + ir.width  / 2;
            const iconCY = ir.top  + ir.height / 2;

            const sr = scene.getBoundingClientRect();
            const sceneCX = sr.left + sr.width  / 2;
            const sceneCY = sr.top  + sr.height / 2;

            const dxScaled = iconCX - sceneCX;
            const dyScaled = iconCY - sceneCY;

            const dxRaw = dxScaled / curS;
            const dyRaw = dyScaled / curS;

            const sceneCX0 = sceneCX - curX;
            const sceneCY0 = sceneCY - curY;

            // Target viewport position: centered horizontally, slightly elevated vertically to clear HUD
            const targetCenterY = vh * 0.42;
            const newTx = (vw / 2) - sceneCX0 - dxRaw * ZOOM;
            const newTy = targetCenterY - sceneCY0 - dyRaw * ZOOM;

            gsap.to(scene, {
                scale: ZOOM,
                x: newTx,
                y: newTy,
                duration: dur,
                ease: 'power3.inOut',
                onComplete: () => {
                    isAnimating = false;
                    el.classList.add('skill-planet-focus');
                }
            });

            updateLabel(skill, idx);
        }

        function updateLabel(skill, idx) {
            if (typeof gsap === 'undefined') return;
            gsap.to(label, {
                opacity: 0, y: -10, duration: 0.16,
                onComplete: () => {
                    label.querySelector('.spl-category').textContent = skill.category;
                    label.querySelector('.spl-name').textContent = skill.name;
                    label.querySelector('.spl-desc').textContent = skill.desc;
                    label.querySelector('.spl-cur').textContent = idx + 1;
                    gsap.fromTo(label,
                        { opacity: 0, y: 12 },
                        { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' }
                    );
                }
            });
        }

        function enterZoom(targetIndex = 0) {
            if (zoomMode || allIcons.length === 0 || typeof gsap === 'undefined') return;
            zoomMode = true;
            currentIdx = targetIndex;
            isAnimating = true;

            rings.forEach(r => r._paused = true);
            document.body.style.overflow = 'hidden';
            document.body.classList.add('skill-zoom-active');

            // Hide page surroundings for deep space immersion
            gsap.to('.nav-wrap, #hero, #journey, #experience, #projects, .skills-grid, #education, #contact, .footer-line, #companion-character, .companion-badge', {
                opacity: 0,
                duration: 0.35,
                pointerEvents: 'none'
            });

            [exitBtn, hint, label].forEach(el => {
                el.style.pointerEvents = 'all';
            });

            gsap.to(scene, {
                scale: 1.8,
                x: 0,
                y: 0,
                duration: 0.5,
                ease: 'power2.in',
                onComplete: () => flyToIcon(currentIdx, 0.8)
            });

            gsap.to([exitBtn, hint], { opacity: 1, duration: 0.4, delay: 0.6 });
        }

        function exitZoom() {
            if (!zoomMode || typeof gsap === 'undefined') return;
            zoomMode = false;
            isAnimating = true;

            gsap.to([label, exitBtn, hint], { opacity: 0, duration: 0.25 });
            [exitBtn, hint, label].forEach(el => el.style.pointerEvents = 'none');

            allIcons.forEach(o => o.el.classList.remove('skill-planet-focus'));

            const targetScale = window.innerWidth <= 360 ? 0.40 : (window.innerWidth <= 420 ? 0.48 : (window.innerWidth <= 650 ? 0.60 : (window.innerWidth <= 850 ? 0.82 : (window.innerWidth <= 1100 ? 1.02 : (window.innerWidth <= 1440 ? 1.25 : 1.45)))));

            gsap.to(scene, {
                scale: targetScale,
                x: 0,
                y: 0,
                duration: 0.7,
                ease: 'power3.inOut',
                onComplete: () => {
                    isAnimating = false;
                    document.body.style.overflow = '';
                    document.body.classList.remove('skill-zoom-active');
                    gsap.set(scene, { clearProps: 'transform' });
                    rings.forEach(r => r._paused = false);

                    // Restore surroundings
                    gsap.to('.nav-wrap, #hero, #journey, #experience, #projects, .skills-grid, #education, #contact, .footer-line, #companion-character, .companion-badge', {
                        opacity: 1,
                        duration: 0.4,
                        pointerEvents: 'all'
                    });
                }
            });
        }

        function navigate(dir) {
            if (!zoomMode || isAnimating) return;
            const next = currentIdx + dir;
            if (next < 0) {
                isAnimating = false;
                return;
            }
            if (next >= allIcons.length) {
                exitZoom();
                return;
            }
            isAnimating = true;
            currentIdx = next;
            flyToIcon(currentIdx);
        }

        // Event Listeners
        center.addEventListener('click', () => enterZoom(0));
        exitBtn.addEventListener('click', exitZoom);

        window.addEventListener('wheel', e => {
            if (!zoomMode) return;
            e.preventDefault();
            if (wheelLocked) return;
            wheelLocked = true;
            setTimeout(() => { wheelLocked = false; }, 650);
            navigate(e.deltaY > 0 ? 1 : -1);
        }, { passive: false });

        document.addEventListener('keydown', e => {
            if (!zoomMode) return;
            if (e.key === 'Escape') exitZoom();
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') navigate(1);
            if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  navigate(-1);
        });

        let touchStartY = 0;
        window.addEventListener('touchstart', e => {
            if (e.touches && e.touches[0]) {
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });

        window.addEventListener('touchend', e => {
            if (!zoomMode) return;
            if (e.changedTouches && e.changedTouches[0]) {
                const dy = touchStartY - e.changedTouches[0].clientY;
                if (Math.abs(dy) > 35) navigate(dy > 0 ? 1 : -1);
            }
        }, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOrbit);
    } else {
        initOrbit();
    }
})();
