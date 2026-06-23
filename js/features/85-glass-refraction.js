/* ============================================================
   glass-refraction.js — DOM-based chromatic aberration & refraction
   
   Approach: 100% CORS-free and file://-compatible.
   Instead of reading pixels of cross-origin backgrounds, we generate
   a local normal map (a gradient-colored rounded rectangle based on
   SDF) dynamically on a clean, in-memory canvas. This data URL is
   injected into an SVG filter with <feDisplacementMap> representing
   physical light refraction bending at the edge of the glass cards.
   
   To simulate chromatic aberration (color splitting), the filter uses
   different displacement scales for Red, Green, and Blue channels.
   
   To avoid sharp edge clipping, the filter itself uses the alpha
   channel of the normal map as a gradient mask to fade the refraction
   out smoothly towards the center of the card.
   
   Structure:
   - Wrapper (.glass-ca-wrap): static, inset: 0, clipped by the card.
     Has the SVG filter applied and stays locked to the card edge.
   - Scaler (.glass-refract-scaler): static child of wrapper.
   - Background layers (.glass-refract-bg): two viewport-sized mirrors
     of #img1 and #img2, updated every frame so slideshow zoom and
     crossfade stay perfectly in sync while the refraction boundary is fixed.
   ============================================================ */

(function initGlassRefraction() {
    'use strict';
    const TAG = '[glass-refraction]';

    // ==================== CONFIG ====================
    const EDGE_WIDTH      = 28;    // px — visible refraction zone width
    const OUTSET          = 0;     // px — inward refraction no longer needs an outside sampling margin
    const LENS_SCALE      = 50;    // Main same-channel lens displacement
    const CHROMA_SPREAD   = 3;     // Small RGB separation around the lens displacement
    const WRAPPER_OPACITY = 0.96;  // overall strength of effect
    const TARGET_REFRESH_MS = 500;
    const LAYOUT_REFRESH_MS = 250;

    const GLASS_TARGETS = [
        '#ai-entry-card',
        '#diary-card',
        '#main-card',
        '.age-btn',
        '.dot',
        '.music-player-pro',
        '.star-trigger-btn',
        '#chat-window',
        '.chat-header-close',
        '.chat-send-btn'
    ];
    const mapCache = {};
    const elementIds = new WeakMap();
    const elementStates = new WeakMap();
    let nextElementId = 1;
    let cachedTargets = [];
    let targetsDirty = true;
    let lastTargetRefresh = 0;
    let lastViewportKey = '';
    let syncRafId = 0;
    let syncRunning = false;

    // ==================== SDF & NORMAL MAP GENERATION ====================

    /** Create a normal map for a card of size w x h with radius r, edgeWidth and outset. */
    function createNormalMap(w, h, r, edgeWidth, outset) {
        const canvasW = w + 2 * outset;
        const canvasH = h + 2 * outset;

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(canvasW, canvasH);
        const data = imgData.data;

        const halfW = w / 2;
        const halfH = h / 2;

        for (let y = 0; y < canvasH; y++) {
            for (let x = 0; x < canvasW; x++) {
                const idx = (y * canvasW + x) * 4;

                // Default: neutral grey, transparent (alpha 0)
                let rVal = 128;
                let gVal = 128;
                let aVal = 0;

                // Translate coordinates relative to card center
                const px = x - (halfW + outset);
                const py = y - (halfH + outset);

                const maxR = Math.min(r, halfW, halfH);

                // Coordinates relative to corner centers of the card
                const qx = Math.abs(px) - (halfW - maxR);
                const qy = Math.abs(py) - (halfH - maxR);

                let dist = 0;
                let nx = 0;
                let ny = 0;

                if (qx > 0 && qy > 0) {
                    // Corner region
                    const d = Math.sqrt(qx * qx + qy * qy);
                    dist = d - maxR;
                    if (d > 0) {
                        nx = (qx / d) * Math.sign(px);
                        ny = (qy / d) * Math.sign(py);
                    }
                } else if (qx > 0) {
                    // Left/Right edges
                    dist = qx - maxR;
                    nx = Math.sign(px);
                    ny = 0;
                } else if (qy > 0) {
                    // Top/Bottom edges
                    dist = qy - maxR;
                    nx = 0;
                    ny = Math.sign(py);
                } else {
                    // Interior
                    dist = Math.max(qx, qy) - maxR;
                    if (qx > qy) {
                        nx = Math.sign(px);
                        ny = 0;
                    } else {
                        nx = 0;
                        ny = Math.sign(py);
                    }
                }

                // If inside the refraction band, write the normal map color and alpha gradient
                if (dist > -edgeWidth && dist <= 0) {
                    const t = Math.max(0, Math.min(1, (dist + edgeWidth) / edgeWidth));
                    const smooth = t * t * t * (t * (t * 6 - 15) + 10);
                    const profile = 0.18 * smooth + 0.82 * Math.pow(smooth, 0.54);

                    // Inward refraction samples pixels from inside the card.
                    // This avoids transparent/out-of-bounds sampling at rounded edges.
                    rVal = 128 - 127 * nx * profile;
                    gVal = 128 - 127 * ny * profile;
                    aVal = Math.round(255 * Math.pow(smooth, 0.58)); // Opaque at edge, fades to 0 inwards
                }

                data[idx]     = Math.round(rVal);
                data[idx + 1] = Math.round(gVal);
                data[idx + 2] = 0;
                data[idx + 3] = aVal; 
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL();
    }

    function getNormalMap(w, h, r, edgeWidth, outset) {
        const key = `${w}x${h}x${r}x${edgeWidth}x${outset}`;
        if (mapCache[key]) return mapCache[key];
        const url = createNormalMap(w, h, r, edgeWidth, outset);
        mapCache[key] = url;
        return url;
    }

    // ==================== SVG FILTER INJECTION ====================

    function getElementKey(el) {
        if (el.id) return el.id;
        if (!elementIds.has(el)) {
            elementIds.set(el, 'auto-' + nextElementId++);
        }
        return elementIds.get(el);
    }

    function glassElements() {
        const now = performance.now();
        if (!targetsDirty && now - lastTargetRefresh < TARGET_REFRESH_MS) {
            return cachedTargets;
        }

        const seen = new Set();
        const elements = [];
        GLASS_TARGETS.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                if (!seen.has(el)) {
                    seen.add(el);
                    elements.push(el);
                }
            });
        });
        cachedTargets = elements;
        targetsDirty = false;
        lastTargetRefresh = now;
        return cachedTargets;
    }

    function injectSVGFilter(elementKey, dataUrl, w, h, strength) {
        const filterId = 'refract-filter-' + elementKey;
        const scaleLens = Math.max(4, Math.round(LENS_SCALE * strength));
        const scaleR = Math.max(2, Math.round((LENS_SCALE - CHROMA_SPREAD) * strength));
        const scaleG = scaleLens;
        const scaleB = Math.max(4, Math.round((LENS_SCALE + CHROMA_SPREAD) * strength));
        let svg = document.getElementById('refract-svg-' + elementKey);
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'refract-svg-' + elementKey;
            svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
            document.body.appendChild(svg);
        }
        svg.innerHTML = `
          <defs>
            <filter id="${filterId}" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
              <feImage href="${dataUrl}" x="0" y="0" width="${w}" height="${h}" result="mapRaw" />
              <feGaussianBlur in="mapRaw" stdDeviation="0.45" result="map" />

              <!-- Primary lens: a same-channel displacement that creates the thick-glass magnification. -->
              <feDisplacementMap in="SourceGraphic" in2="map" scale="${scaleLens}" xChannelSelector="R" yChannelSelector="G" result="lensBase" />
              <feComposite in="lensBase" in2="map" operator="in" result="lensMasked" />
              
              <!-- Secondary chromatic separation: subtle color fringe around the main lens distortion. -->
              <feDisplacementMap in="SourceGraphic" in2="map" scale="${scaleR}" xChannelSelector="R" yChannelSelector="G" result="dispR" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="${scaleG}" xChannelSelector="R" yChannelSelector="G" result="dispG" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="${scaleB}" xChannelSelector="R" yChannelSelector="G" result="dispB" />
              
              <!-- Isolate colors -->
              <feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="redOnly" />
              <feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="greenOnly" />
              <feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blueOnly" />
              
              <!-- Recombine channels via screen blending -->
              <feBlend mode="screen" in="redOnly" in2="greenOnly" result="rg" />
              <feBlend mode="screen" in="rg" in2="blueOnly" result="rgb" />
              
              <!-- Smooth edge fade: multiply output with normal map alpha, then keep color fringe subtle. -->
              <feComposite in="rgb" in2="map" operator="in" result="chromaMasked" />
              <feComponentTransfer in="chromaMasked" result="chromaSoft">
                <feFuncA type="linear" slope="0.22" />
              </feComponentTransfer>

              <feMerge>
                <feMergeNode in="lensMasked" />
                <feMergeNode in="chromaSoft" />
              </feMerge>
            </filter>
          </defs>`;
    }

    // ==================== DOM SETUP & LIVE BACKGROUND SYNC ====================

    function setStyle(el, prop, value) {
        if (el.style[prop] !== value) el.style[prop] = value;
    }

    function isHomeRenderingPaused() {
        return document.body.classList.contains('home-rendering-paused');
    }

    function scheduleSync() {
        if (!syncRunning) return;
        syncRafId = requestAnimationFrame(syncGlassLayers);
    }

    function startSync() {
        if (syncRunning || document.hidden || isHomeRenderingPaused()) return;
        syncRunning = true;
        scheduleSync();
    }

    function stopSync() {
        syncRunning = false;
        if (syncRafId) {
            cancelAnimationFrame(syncRafId);
            syncRafId = 0;
        }
    }

    function updateFilterForSize(el, state, w, h) {
        const computed = window.getComputedStyle(el);
        const radius = parseInt(computed.borderRadius) || Math.min(w, h) / 2;
        const minDim = Math.min(w, h);
        const edgeWidth = Math.max(4, Math.min(EDGE_WIDTH, Math.floor(minDim * 0.62)));
        const strength = Math.max(0.26, Math.min(1, minDim / 42));
        const sizeKey = `${w}x${h}x${radius}x${edgeWidth}x${strength.toFixed(2)}`;
        if (state.sizeKey !== sizeKey) {
            const elementKey = getElementKey(el);
            const normalMapUrl = getNormalMap(w, h, radius, edgeWidth, OUTSET);
            injectSVGFilter(elementKey, normalMapUrl, w, h, strength);
            setStyle(state.wrap, 'filter', 'url(#refract-filter-' + elementKey + ') saturate(1.08) contrast(1.10) brightness(1.03)');
            state.sizeKey = sizeKey;
        }
    }

    function getLayoutSize(el) {
        const rect = el.getBoundingClientRect();
        const w = Math.round(el.offsetWidth || rect.width);
        const h = Math.round(el.offsetHeight || rect.height);
        return { w, h, rect };
    }

    function ensureGlassLayer(el) {
        const { w, h } = getLayoutSize(el);
        if (w < 8 || h < 8) return null;

        const oldClipper = el.querySelector('.glass-ca-clipper');
        if (oldClipper) oldClipper.remove();
        const oldCaustic = el.querySelector('.glass-ca-caustic');
        if (oldCaustic) oldCaustic.remove();

        const computed = window.getComputedStyle(el);
        if (computed.position === 'static') {
            el.style.position = 'relative';
        }

        const elementKey = getElementKey(el);
        let state = elementStates.get(el);

        if (!state || !state.wrap || !el.contains(state.wrap)) {
            const old = el.querySelector('.glass-ca-wrap');
            if (old) old.remove();

            const wrap = document.createElement('div');
            wrap.className = 'glass-ca-wrap';
            wrap.style.cssText =
                'position:absolute;inset:0;z-index:0;pointer-events:none;' +
                'border-radius:inherit;overflow:hidden;opacity:' + WRAPPER_OPACITY + ';' +
                'filter:none;';

            const scaler = document.createElement('div');
            scaler.className = 'glass-refract-scaler';
            scaler.style.cssText = 'position:absolute;inset:0;';

            const bgEls = [0, 1].map((i) => {
                const bgEl = document.createElement('div');
                bgEl.className = 'glass-refract-bg glass-refract-bg-' + (i + 1);
                bgEl.style.cssText =
                    'position:absolute;' +
                    'background-size:cover;' +
                    'background-position:center center;' +
                    'background-repeat:no-repeat;' +
                    'will-change:transform,opacity;';
                scaler.appendChild(bgEl);
                return bgEl;
            });

            wrap.appendChild(scaler);
            el.insertBefore(wrap, el.firstChild);
            state = {
                wrap,
                scaler,
                bgEls,
                sizeKey: '',
                lastLayoutAt: 0,
                lastRectKey: '',
                lastViewportKey: '',
                sourceKeys: ['', '']
            };
            elementStates.set(el, state);
        }

        updateFilterForSize(el, state, w, h);

        return state;
    }

    function updateLayout(el, state, now, viewportKey, vpW, vpH) {
        if (
            state.lastViewportKey === viewportKey &&
            now - state.lastLayoutAt < LAYOUT_REFRESH_MS
        ) {
            return;
        }

        const { w, h, rect } = getLayoutSize(el);
        const rectKey = `${Math.round(rect.left)}:${Math.round(rect.top)}:${w}:${h}`;
        if (state.lastRectKey !== rectKey || state.lastViewportKey !== viewportKey) {
            updateFilterForSize(el, state, w, h);
            const origin = (vpW / 2) + 'px ' + (vpH / 2) + 'px';
            state.bgEls.forEach((bgEl) => {
                setStyle(bgEl, 'left', (-rect.left) + 'px');
                setStyle(bgEl, 'top', (-rect.top) + 'px');
                setStyle(bgEl, 'width', vpW + 'px');
                setStyle(bgEl, 'height', vpH + 'px');
                setStyle(bgEl, 'transformOrigin', origin);
            });
            state.lastRectKey = rectKey;
            state.lastViewportKey = viewportKey;
        }
        state.lastLayoutAt = now;
    }

    function syncGlassLayers() {
        if (!syncRunning) return;
        if (document.hidden || isHomeRenderingPaused()) {
            stopSync();
            return;
        }

        const sources = [document.getElementById('img1'), document.getElementById('img2')];
        const sourceStyles = sources.map((source) => {
            if (!source) return null;
            const style = window.getComputedStyle(source);
            return {
                backgroundImage: style.backgroundImage,
                opacity: style.opacity,
                transform: style.transform === 'none' ? '' : style.transform,
                key: style.backgroundImage + '|' + style.opacity + '|' + (style.transform === 'none' ? '' : style.transform)
            };
        });
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        const viewportKey = vpW + 'x' + vpH;
        if (lastViewportKey !== viewportKey) {
            targetsDirty = true;
            lastViewportKey = viewportKey;
        }
        const now = performance.now();

        glassElements().forEach(function (el) {
            if (el.offsetWidth > 0) {
                let state = elementStates.get(el);
                if (!state || !state.wrap || !el.contains(state.wrap)) {
                    state = ensureGlassLayer(el);
                }
                if (!state) return;

                updateLayout(el, state, now, viewportKey, vpW, vpH);

                state.bgEls.forEach((bgEl, i) => {
                    const sourceStyle = sourceStyles[i];
                    if (!sourceStyle || !sourceStyle.backgroundImage || sourceStyle.backgroundImage === 'none') {
                        setStyle(bgEl, 'opacity', '0');
                        return;
                    }

                    if (state.sourceKeys[i] !== sourceStyle.key) {
                        setStyle(bgEl, 'backgroundImage', sourceStyle.backgroundImage);
                        setStyle(bgEl, 'opacity', sourceStyle.opacity);
                        setStyle(bgEl, 'transform', sourceStyle.transform);
                        state.sourceKeys[i] = sourceStyle.key;
                    }
                });
            }
        });
        scheduleSync();
    }

    // ==================== INIT ====================

    function init() {
        console.log(TAG, 'init (CORS-free live refraction sync)');
        const observer = new MutationObserver(() => {
            targetsDirty = true;
        });
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', () => {
            targetsDirty = true;
            lastViewportKey = '';
        }, { passive: true });
        document.addEventListener('tuotuo:home-rendering-paused', stopSync);
        document.addEventListener('tuotuo:home-rendering-resumed', () => {
            targetsDirty = true;
            lastViewportKey = '';
            startSync();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopSync();
            else startSync();
        });
        startSync();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        requestAnimationFrame(() => { requestAnimationFrame(init); });
    }
})();
