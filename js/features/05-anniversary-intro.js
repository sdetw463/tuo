/* 100-day anniversary opening sequence. Isolated from the existing home features. */
(function initAnniversaryIntro() {
    const intro = document.getElementById('anniversary-intro');
    const stars = document.getElementById('anniversary-intro-stars');
    const numberEl = document.getElementById('anniversary-day-number');
    const enterBtn = document.getElementById('anniversary-enter-btn');

    if (!intro || !numberEl || !enterBtn) return;

    document.body.classList.add('anniversary-intro-active');

    function createStars() {
        if (!stars) return;
        const count = Math.max(72, Math.min(140, Math.round(window.innerWidth / 10)));
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < count; i++) {
            const star = document.createElement('span');
            const size = (Math.random() * 1.65 + 0.65).toFixed(2);
            const opacity = (Math.random() * 0.5 + 0.28).toFixed(2);
            const duration = (Math.random() * 4.5 + 3.2).toFixed(2);
            const delay = (Math.random() * -7).toFixed(2);

            star.className = 'anniversary-intro__star';
            if (Math.random() > 0.82) star.classList.add('is-accent');
            star.style.left = `${(Math.random() * 100).toFixed(2)}%`;
            star.style.top = `${(Math.random() * 100).toFixed(2)}%`;
            star.style.setProperty('--star-size', `${size}px`);
            star.style.setProperty('--star-opacity', opacity);
            star.style.setProperty('--star-duration', `${duration}s`);
            star.style.setProperty('--star-delay', `${delay}s`);
            fragment.appendChild(star);
        }

        stars.replaceChildren(fragment);
    }

    function runCounter() {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) {
            numberEl.textContent = '100';
            intro.classList.add('is-counted', 'is-ready');
            return;
        }

        const duration = 2450;
        const startTime = performance.now();

        function tick(now) {
            const progress = Math.min(1, (now - startTime) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = Math.max(1, Math.min(100, Math.floor(1 + eased * 99)));
            numberEl.textContent = String(value);

            if (progress < 1) {
                requestAnimationFrame(tick);
                return;
            }

            numberEl.textContent = '100';
            intro.classList.add('is-counted');
            window.setTimeout(() => intro.classList.add('is-ready'), 620);
        }

        requestAnimationFrame(tick);
    }

    function enterHome() {
        if (intro.classList.contains('is-leaving')) return;
        intro.classList.add('is-leaving');
        document.body.classList.remove('anniversary-intro-active');

        window.setTimeout(() => {
            intro.remove();
        }, 1250);
    }

    createStars();
    enterBtn.addEventListener('click', enterHome);

    window.setTimeout(runCounter, 2450);
})();
