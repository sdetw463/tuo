/* Star wish modal, launch animation and star-field rendering.
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
const STAR_WISH_FLIGHT_DURATION = 1050;
const STAR_WISH_SAFE_X_MIN = 12;
const STAR_WISH_SAFE_X_SPAN = 76;
const STAR_WISH_SAFE_Y_MIN = 10;
const STAR_WISH_SAFE_Y_SPAN = 76;
const STAR_WISH_BLOCKER_CLEARANCE = 30;
const STAR_WISH_BLOCKER_SELECTORS = [
    '#main-card',
    '#ai-entry-card',
    '#diary-card',
    '.music-player-pro',
    '.age-selector',
    '.dots-container',
    '.star-trigger-btn',
    '.chat-bubble-btn',
    '#ws-status'
];
const pendingStarWishBirths = new Map();
const starWishReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function toggleWishModal() {
    if (!chatNickname) { document.getElementById('star-login-overlay').classList.add('show'); return; }
    const m = document.getElementById('wish-modal');
    m.style.display = m.style.display==='flex' ? 'none' : 'flex';
}

function enterStarName() {
    const n=document.getElementById('star-nickname-input').value.trim();
    if(n){
        chatNickname=n;
        localStorage.setItem('chat_nickname',n);
        chatAvatar = n.charAt(0) || ' ✨ ';
        localStorage.setItem('chat_avatar', chatAvatar);
        document.getElementById('star-login-overlay').classList.remove('show');
        if(chatSocket)chatSocket.close();
        connectWebSocket(false);
        toggleWishModal();
    }
}

function getStarWishAnimationKey(data) {
    return [data.name || '', data.time || '', data.msgType || '', data.msg || ''].join('|');
}

function getStarWishHash(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function mixStarWishHash(value) {
    let hash = value >>> 0;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d);
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x846ca68b);
    hash ^= hash >>> 16;
    return hash >>> 0;
}

function isFirstHundredDayAdminWish(data) {
    const name = String(data && data.name || '').trim().toLowerCase();
    const message = String(data && data.msg || '').replace(/\s+/g, '');
    return name === 'admin'
        && message.includes('第一个100天啦')
        && message.includes('布满整个星空');
}

function getHashedStarWishCandidate(seed, attempt) {
    const step = attempt + 1;
    const xHash = mixStarWishHash(seed + Math.imul(step, 0x9e3779b1));
    const yHash = mixStarWishHash(seed ^ Math.imul(step, 0x85ebca6b));
    return {
        left: STAR_WISH_SAFE_X_MIN + (xHash % (STAR_WISH_SAFE_X_SPAN * 100 + 1)) / 100,
        top: STAR_WISH_SAFE_Y_MIN + (yHash % (STAR_WISH_SAFE_Y_SPAN * 100 + 1)) / 100
    };
}

function isStarWishPositionClear(pos, fieldRect) {
    const pointX = fieldRect.left + fieldRect.width * pos.left / 100;
    const pointY = fieldRect.top + fieldRect.height * pos.top / 100;

    return STAR_WISH_BLOCKER_SELECTORS.every(selector => {
        const blocker = document.querySelector(selector);
        if (!blocker) return true;
        const rect = blocker.getBoundingClientRect();
        if (!rect.width || !rect.height) return true;
        return pointX < rect.left - STAR_WISH_BLOCKER_CLEARANCE
            || pointX > rect.right + STAR_WISH_BLOCKER_CLEARANCE
            || pointY < rect.top - STAR_WISH_BLOCKER_CLEARANCE
            || pointY > rect.bottom + STAR_WISH_BLOCKER_CLEARANCE;
    });
}

function getStarWishPosition(data) {
    const field = document.getElementById('star-field');
    const fieldRect = field && field.getBoundingClientRect();
    const hasUsableField = fieldRect && fieldRect.width > 0 && fieldRect.height > 0;

    // Keep the first 100-day wish at a deliberate, memorable position away
    // from the lower-left album card. The fallback candidates cover narrow
    // mobile layouts where another control may occupy the preferred point.
    const preferred = isFirstHundredDayAdminWish(data)
        ? [
            { left: 68, top: 30 },
            { left: 74, top: 38 },
            { left: 62, top: 24 }
        ]
        : [];

    if (!hasUsableField) return preferred[0] || { left: 50, top: 36 };

    for (const candidate of preferred) {
        if (isStarWishPositionClear(candidate, fieldRect)) return candidate;
    }

    const seed = getStarWishHash([
        data && data.name || '',
        data && data.msg || '',
        data && data.time || ''
    ].join('|'));
    for (let attempt = 0; attempt < 32; attempt++) {
        const candidate = getHashedStarWishCandidate(seed, attempt);
        if (isStarWishPositionClear(candidate, fieldRect)) return candidate;
    }

    // Extremely crowded small screens still get a point safely inset from
    // every edge, rather than falling back to the old lower-left range.
    return { left: 72, top: 52 };
}

function launchStarWish(data, sourceRect) {
    if (starWishReduceMotion) return;

    const field = document.getElementById('star-field');
    if (!field) return;

    const pos = getStarWishPosition(data);
    const fieldRect = field.getBoundingClientRect();
    const startX = sourceRect ? sourceRect.left + sourceRect.width / 2 : window.innerWidth / 2;
    const startY = sourceRect ? sourceRect.top + sourceRect.height / 2 : window.innerHeight * 0.68;
    const targetX = fieldRect.left + fieldRect.width * pos.left / 100;
    const targetY = fieldRect.top + fieldRect.height * pos.top / 100;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    const key = getStarWishAnimationKey(data);
    const startedAt = performance.now();

    pendingStarWishBirths.set(key, {
        revealAt: startedAt + STAR_WISH_FLIGHT_DURATION,
        pos
    });

    const flyingStar = document.createElement('div');
    flyingStar.className = 'star-wish-flight';
    flyingStar.setAttribute('aria-hidden', 'true');
    flyingStar.style.left = `${startX}px`;
    flyingStar.style.top = `${startY}px`;
    document.body.appendChild(flyingStar);

    if (typeof flyingStar.animate === 'function') {
        const animation = flyingStar.animate([
            {
                opacity: 0,
                transform: 'translate(-50%, -50%) translate(0px, 0px) scale(0.35)'
            },
            {
                offset: 0.12,
                opacity: 1,
                transform: 'translate(-50%, -50%) translate(0px, -12px) scale(1)'
            },
            {
                offset: 0.58,
                opacity: 1,
                transform: `translate(-50%, -50%) translate(${deltaX * 0.56}px, ${deltaY * 0.56 - 42}px) scale(1.35)`
            },
            {
                offset: 0.86,
                opacity: 1,
                transform: `translate(-50%, -50%) translate(${deltaX}px, ${deltaY}px) scale(1.1)`
            },
            {
                opacity: 0,
                transform: `translate(-50%, -50%) translate(${deltaX}px, ${deltaY}px) scale(0.18)`
            }
        ], {
            duration: STAR_WISH_FLIGHT_DURATION,
            easing: 'cubic-bezier(0.22, 0.72, 0.24, 1)',
            fill: 'forwards'
        });

        animation.finished.catch(() => {}).finally(() => flyingStar.remove());
    } else {
        window.setTimeout(() => flyingStar.remove(), STAR_WISH_FLIGHT_DURATION);
    }

    window.setTimeout(() => {
        if (pendingStarWishBirths.get(key)?.revealAt === startedAt + STAR_WISH_FLIGHT_DURATION) {
            pendingStarWishBirths.delete(key);
        }
    }, 15000);
}

function sendStarWish() {
    const input = document.getElementById('wish-input');
    const btn = document.getElementById('star-send-btn');
    const content = input.value.trim();
    if (!content) return;

    const t = new Date();
    const timeStr = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    const payload = {
        name: chatNickname || getConnectName(),
        avatar: chatAvatar || ' ✨ ',
        time: timeStr,
        msgType: 'star',
        msg: content
    };

    const sourceRect = btn.getBoundingClientRect();
    launchStarWish(payload, sourceRect);
    wsSend(payload);

    input.value = '';
    btn.innerText = '放飞祝福';
    toggleWishModal();
}

function addStar(data) {
    const key = getMessageKey(data);
    if (starMessageKeys.has(key)) return;
    starMessageKeys.add(key);

    const field = document.getElementById('star-field');
    const star = document.createElement('div');
    star.className = 'star-wish';
    const pos = getStarWishPosition(data);
    star.style.left = pos.left + '%';
    star.style.top = pos.top + '%';
    star.innerHTML = `
        <div class="star-tooltip">
            <b>${escapeHtml(data.name)}:</b> ${escapeHtml(data.msg)}
        </div>
    `;

    const animationKey = getStarWishAnimationKey(data);
    const pendingBirth = pendingStarWishBirths.get(animationKey);
    if (pendingBirth && !starWishReduceMotion) {
        star.classList.add('star-wish--birth-pending');
    }

    field.appendChild(star);

    if (pendingBirth && !starWishReduceMotion) {
        const wait = Math.max(0, pendingBirth.revealAt - performance.now());
        window.setTimeout(() => {
            if (!star.isConnected) return;
            star.classList.remove('star-wish--birth-pending');
            star.classList.add('star-wish--birthing');
            pendingStarWishBirths.delete(animationKey);
        }, wait);
    }

    const stars = field.getElementsByClassName('star-wish');
    if (stars.length > 50) {
        field.removeChild(stars[0]);
    }
}
