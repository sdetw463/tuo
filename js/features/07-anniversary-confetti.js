/* 100-day canvas-confetti ceremony, continuous heart rain and click interactions. */
(function initAnniversaryConfetti() {
    const canvas = document.getElementById('anniversary-confetti-canvas');
    const enterBtn = document.getElementById('anniversary-enter-btn');
    const loveDaysEl = document.getElementById('love-days');
    const anniversaryCard = document.querySelector('#main-card .love-anniversary-card');
    const confettiLib = window.confetti;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!canvas || typeof confettiLib !== 'function' || reduceMotion) return;

    const fire = confettiLib.create(canvas, {
        resize: true,
        useWorker: true
    });

    const colors = ['#fff6fa', '#ffd8e8', '#ffb6d1', '#efc9ed', '#f8e8dd'];
    const heartPath = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
    const heartShape = typeof confettiLib.shapeFromPath === 'function'
        ? confettiLib.shapeFromPath({ path: heartPath })
        : 'circle';

    let ceremonyPlayed = false;
    let heartRainRunning = false;
    let lastMiniBurstAt = 0;

    function getLoveDays() {
        const start = new Date('2026-04-11');
        return Math.max(0, Math.floor((new Date() - start) / 86400000));
    }

    function effectsPaused() {
        return document.hidden
            || document.body.classList.contains('anniversary-intro-active')
            || document.body.classList.contains('home-rendering-paused');
    }

    function sideBurst(originX, angle, particleCount, velocity) {
        fire({
            particleCount,
            angle,
            spread: 84,
            startVelocity: velocity,
            decay: 0.925,
            gravity: 0.72,
            ticks: 225,
            scalar: 0.9,
            drift: originX < 0.5 ? 0.24 : -0.24,
            colors,
            shapes: [heartShape, 'circle'],
            origin: { x: originX, y: 0.88 },
            disableForReducedMotion: true
        });
    }

    function startHeartRain() {
        if (heartRainRunning) return;
        heartRainRunning = true;

        function drop() {
            if (!effectsPaused()) {
                const x = 0.02 + Math.random() * 0.96;
                const drift = (Math.random() - 0.5) * 1.05;
                const scalar = 0.52 + Math.random() * 0.42;

                fire({
                    particleCount: Math.random() > 0.78 ? 2 : 1,
                    startVelocity: 0,
                    spread: 24,
                    gravity: 0.25 + Math.random() * 0.14,
                    drift,
                    decay: 0.974,
                    ticks: 360,
                    scalar,
                    colors,
                    shapes: [heartShape],
                    origin: { x, y: -0.05 },
                    disableForReducedMotion: true
                });

                if (Math.random() > 0.62) {
                    fire({
                        particleCount: 1,
                        startVelocity: 0,
                        gravity: 0.22,
                        drift: -drift * 0.4,
                        decay: 0.978,
                        ticks: 330,
                        scalar: 0.28 + Math.random() * 0.2,
                        colors: ['#fffafc', '#ffe7f0', '#f1e5fa'],
                        shapes: ['circle'],
                        origin: {
                            x: Math.min(0.99, Math.max(0.01, x + (Math.random() - 0.5) * 0.14)),
                            y: -0.03
                        },
                        disableForReducedMotion: true
                    });
                }
            }

            window.setTimeout(drop, effectsPaused() ? 520 : 135 + Math.random() * 115);
        }

        drop();
    }

    function runFullCeremony() {
        if (ceremonyPlayed || getLoveDays() !== 100) return;
        ceremonyPlayed = true;

        sideBurst(0.02, 54, 78, 54);
        sideBurst(0.98, 126, 78, 54);

        window.setTimeout(() => {
            sideBurst(0.055, 62, 48, 43);
            sideBurst(0.945, 118, 48, 43);
        }, 170);

        window.setTimeout(() => {
            fire({
                particleCount: 58,
                angle: 90,
                spread: 124,
                startVelocity: 42,
                decay: 0.925,
                gravity: 0.68,
                ticks: 230,
                scalar: 0.82,
                colors,
                shapes: [heartShape, 'circle'],
                origin: { x: 0.5, y: 0.94 },
                disableForReducedMotion: true
            });
        }, 360);

        window.setTimeout(startHeartRain, 540);
    }

    function runMiniBurst() {
        if (getLoveDays() < 100) return;

        const now = performance.now();
        if (now - lastMiniBurstAt < 2000) return;
        lastMiniBurstAt = now;

        const rect = loveDaysEl.getBoundingClientRect();
        const originX = Math.min(0.96, Math.max(0.04, (rect.left + rect.width / 2) / window.innerWidth));
        const originY = Math.min(0.92, Math.max(0.08, (rect.top + rect.height / 2) / window.innerHeight));

        fire({
            particleCount: 48,
            angle: 90,
            spread: 112,
            startVelocity: 32,
            decay: 0.915,
            gravity: 0.76,
            ticks: 200,
            scalar: 0.74,
            colors,
            shapes: [heartShape, 'circle'],
            origin: { x: originX, y: originY },
            disableForReducedMotion: true
        });
    }

    function runPointerBurst(event) {
        if (getLoveDays() < 100 || effectsPaused()) return;
        if (event.target === loveDaysEl) return;
        if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
        if (event.clientX === 0 && event.clientY === 0) return;

        const originX = Math.min(0.995, Math.max(0.005, event.clientX / window.innerWidth));
        const originY = Math.min(0.98, Math.max(0.02, event.clientY / window.innerHeight));

        fire({
            particleCount: 18,
            angle: 90,
            spread: 88,
            startVelocity: 22,
            decay: 0.92,
            gravity: 0.7,
            drift: (Math.random() - 0.5) * 0.3,
            ticks: 190,
            scalar: 0.62 + Math.random() * 0.12,
            colors,
            shapes: [heartShape],
            origin: { x: originX, y: originY },
            disableForReducedMotion: true
        });
    }

    if (getLoveDays() >= 100 && anniversaryCard && loveDaysEl) {
        anniversaryCard.classList.add('is-confetti-enabled');
        loveDaysEl.setAttribute('role', 'button');
        loveDaysEl.setAttribute('tabindex', '0');
        loveDaysEl.setAttribute('aria-label', '播放第一百天纪念彩蛋');
        loveDaysEl.addEventListener('click', runMiniBurst);
        loveDaysEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                runMiniBurst();
            }
        });
        document.addEventListener('click', runPointerBurst, { passive: true });
    }

    if (enterBtn) {
        enterBtn.addEventListener('click', () => {
            if (getLoveDays() !== 100) return;
            window.setTimeout(runFullCeremony, 420);
        });
    }

    window.tuotuoAnniversaryConfetti = {
        celebrate: runFullCeremony,
        burst: runMiniBurst,
        startHeartRain
    };
})();
