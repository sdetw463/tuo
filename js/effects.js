/* ============================================================
   effects.js - 视觉特效（星空寄语、鼠标气泡等）
============================================================ */

// ===================== 星空寄语 =====================

// 切换许愿弹窗
function toggleWishModal() {
    if (!chatNickname) {
        document.getElementById('star-login-overlay').classList.add('show');
        return;
    }
    const m = document.getElementById('wish-modal');
    if (m) m.style.display = m.style.display === 'flex' ? 'none' : 'flex';
}

// 输入星空名字并下一步
function enterStarName() {
    const n = document.getElementById('star-nickname-input').value.trim();
    if (!n) return;

    chatNickname = n;
    sessionStorage.setItem('chat_nickname', n);
    chatAvatar = n.charAt(0) || ' ✨ ';
    sessionStorage.setItem('chat_avatar', chatAvatar);

    document.getElementById('star-login-overlay').classList.remove('show');
    if (chatSocket) chatSocket.close();
    connectWebSocket(false);
    toggleWishModal();
}

// 发送星空心愿
function sendStarWish() {
    const input = document.getElementById('wish-input');
    const btn = document.getElementById('star-send-btn');
    if (!input || !btn) return;

    const content = input.value.trim();
    if (!content) return;

    const t = new Date();
    const timeStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;

    wsSend({
        name: chatNickname || getConnectName(),
        avatar: chatAvatar || ' ✨ ',
        time: timeStr,
        msgType: 'star',
        msg: content
    });

    input.value = '';
    btn.innerText = '放飞心愿';
    toggleWishModal();
}

// 添加星星到页面
function addStar(data) {
    const key = getMessageKey(data);
    if (starMessageKeys.has(key)) return;
    starMessageKeys.add(key);

    const field = document.getElementById('star-field');
    if (!field) return;

    const star = document.createElement('div');
    star.className = 'star-wish';
    const pos = getHashPos((data.name || '') + (data.msg || '') + (data.time || ''));
    star.style.left = pos.left + '%';
    star.style.top = pos.top + '%';
    star.innerHTML = `
        <div class="star-tooltip">
            <b>${escapeHtml(data.name)}:</b> ${escapeHtml(data.msg)}
        </div>
    `;
    field.appendChild(star);

    // 最多保留 50 颗星星
    const stars = field.getElementsByClassName('star-wish');
    if (stars.length > 50) {
        field.removeChild(stars[0]);
    }
}

// ===================== 浮动气泡 =====================

let bubbleTimer = null;

function createBubble() {
    const bubble = document.createElement('div');
    bubble.className = 'floating-bubble';
    const size = Math.random() * 30 + 15;
    bubble.style.width = size + 'px';
    bubble.style.height = size + 'px';
    bubble.style.left = Math.random() * window.innerWidth + 'px';
    const dur = Math.random() * 4 + 6;
    bubble.style.animationDuration = dur + 's';

    bubble.addEventListener('mouseenter', () => {
        bubble.style.animation = 'none';
        bubble.style.transition = 'all 0.15s ease-out';
        bubble.style.transform = 'scale(1.5)';
        bubble.style.opacity = '0';
        setTimeout(() => { if (bubble.parentElement) bubble.remove(); }, 150);
    });

    const app = document.getElementById('app');
    if (app) app.appendChild(bubble);
    setTimeout(() => { if (bubble.parentElement) bubble.remove(); }, dur * 1000);
}

function startBubbleEffect() {
    if (bubbleTimer) clearInterval(bubbleTimer);
    bubbleTimer = setInterval(() => {
        const c = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < c; i++) createBubble();
    }, 1000);
}

// ===================== Esc 关闭弹窗 =====================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (document.getElementById('diary-overlay') && document.getElementById('diary-overlay').classList.contains('show')) {
            closeDiaryModal();
            return;
        }
        if (document.getElementById('album-modal') && document.getElementById('album-modal').classList.contains('show')) {
            closeAlbum();
            return;
        }
        if (document.getElementById('gpt-fullscreen') && document.getElementById('gpt-fullscreen').classList.contains('show')) {
            toggleFullScreenGPT();
            return;
        }
    }
});

// 初始化特效
function initEffects() {
    startBubbleEffect();
}
