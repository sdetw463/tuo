/* Gentle 100-day home celebration effects. */
(function initAnniversaryHomeEffects() {
    const app = document.getElementById('app');
    if (!app || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const field = document.createElement('div');
    field.className = 'anniversary-ribbon-field';
    field.setAttribute('aria-hidden', 'true');

    const palettes = [
        ['rgba(255, 231, 240, 0.58)', 'rgba(255, 164, 200, 0.40)'],
        ['rgba(244, 229, 255, 0.48)', 'rgba(203, 168, 229, 0.36)'],
        ['rgba(255, 242, 231, 0.48)', 'rgba(247, 194, 179, 0.34)'],
        ['rgba(235, 241, 255, 0.45)', 'rgba(182, 197, 232, 0.32)']
    ];

    const ribbonCount = window.innerWidth <= 640 ? 13 : 20;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < ribbonCount; i++) {
        const ribbon = document.createElement('span');
        const isThread = i % 4 === 0;
        const palette = palettes[i % palettes.length];
        const width = isThread ? (Math.random() * 1.6 + 1.1) : (Math.random() * 7 + 5);
        const height = Math.random() * 28 + 30;
        const duration = Math.random() * 10 + 17;
        const delay = -(Math.random() * duration);
        const swayDuration = Math.random() * 3.4 + 5.2;
        const rotation = Math.random() * 16 - 8;
        const spin = Math.random() * 30 - 15;
        const drift = Math.random() * 12 - 6;
        const sway = Math.random() * 2.5 + 0.8;

        ribbon.className = `anniversary-ribbon${isThread ? ' is-thread' : ''}`;
        ribbon.style.setProperty('--ribbon-left', `${(Math.random() * 104 - 2).toFixed(2)}%`);
        ribbon.style.setProperty('--ribbon-width', `${width.toFixed(2)}px`);
        ribbon.style.setProperty('--ribbon-height', `${height.toFixed(2)}vh`);
        ribbon.style.setProperty('--ribbon-opacity', (Math.random() * 0.16 + 0.13).toFixed(2));
        ribbon.style.setProperty('--ribbon-duration', `${duration.toFixed(2)}s`);
        ribbon.style.setProperty('--ribbon-delay', `${delay.toFixed(2)}s`);
        ribbon.style.setProperty('--ribbon-sway-duration', `${swayDuration.toFixed(2)}s`);
        ribbon.style.setProperty('--ribbon-sway-delay', `${(-Math.random() * swayDuration).toFixed(2)}s`);
        ribbon.style.setProperty('--ribbon-rotation', `${rotation.toFixed(2)}deg`);
        ribbon.style.setProperty('--ribbon-spin', `${spin.toFixed(2)}deg`);
        ribbon.style.setProperty('--ribbon-drift', `${drift.toFixed(2)}vw`);
        ribbon.style.setProperty('--ribbon-sway', `${sway.toFixed(2)}vw`);
        ribbon.style.setProperty('--ribbon-blur', `${(Math.random() * 0.35).toFixed(2)}px`);
        ribbon.style.setProperty('--ribbon-a', palette[0]);
        ribbon.style.setProperty('--ribbon-b', palette[1]);
        fragment.appendChild(ribbon);
    }

    field.appendChild(fragment);
    app.appendChild(field);
})();
