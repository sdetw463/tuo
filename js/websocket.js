/* ============================================================
   websocket.js - WebSocket 连接与消息处理
============================================================ */

// ===================== 共享状态（显式挂载到 window，确保跨文件可访问）=====================
window.chatSocket = null;
window.chatNickname = sessionStorage.getItem('chat_nickname') || '';
window.chatAvatar = sessionStorage.getItem('chat_avatar') || '';
window.unreadCount = 0;
window.isChatWindowOpen = false;
window.reconnectTimer = null;

// WebSocket 待发送队列：断线/连接中时不会丢消息
window.pendingWsQueue = [];

// 普通聊天消息去重 Set
window.chatMessageKeys = new Set();

// 星空消息去重 Set
window.starMessageKeys = new Set();

// DOM 元素缓存
const badge = () => document.getElementById('msg-badge');
const messagesEl = () => document.getElementById('chat-messages');
const wsStatusEl = () => document.getElementById('ws-status');
const wsStatusTextEl = () => document.getElementById('ws-status-text');
const onlineCountEl = () => document.getElementById('online-count');

function setWsStatus(state, text) {
    const el = wsStatusEl();
    const txt = wsStatusTextEl();
    if (!el) return;
    el.className = state;
    if (txt) txt.textContent = text;
}

function updateBadgeDisplay() {
    const b = badge();
    if (!b) return;
        if (window.unreadCount > 0) {
        b.style.display = 'flex';
        b.innerText = window.unreadCount > 99 ? '99+' : window.unreadCount;
    } else {
        b.style.display = 'none';
    }
}

function flushPendingWsQueue() {
    if (!window.chatSocket || window.chatSocket.readyState !== WebSocket.OPEN) return;
    while (window.pendingWsQueue.length > 0) {
        window.chatSocket.send(window.pendingWsQueue.shift());
    }
}

function connectWebSocket(isGuest) {
    if (window.chatSocket && (window.chatSocket.readyState === WebSocket.CONNECTING || window.chatSocket.readyState === WebSocket.OPEN)) return;
    clearTimeout(window.reconnectTimer);

    const name = isGuest ? getConnectName() : (window.chatNickname || getConnectName());
    setWsStatus('connecting', '连接中...');

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    window.chatSocket = new WebSocket(`${proto}://${CHAT_CONFIG.wsHost}/socket/${encodeURIComponent(name)}`);

    window.chatSocket.onopen = () => {
        setWsStatus('connected', '已连接');
        flushPendingWsQueue();

        const wishInput = document.getElementById('wish-input');
        const starBtn = document.getElementById('star-send-btn');
        if (wishInput) wishInput.value = '';
        if (starBtn) starBtn.innerText = '放飞心愿';

        setTimeout(() => {
            const el = wsStatusEl();
            if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
        }, 3000);
    };

    chatSocket.onmessage = (ev) => {
        let res;
        try {
            res = JSON.parse(ev.data);
        } catch (err) {
            console.warn('收到非 JSON WebSocket 消息：', ev.data);
            return;
        }

        const handleOneMessage = (m) => {
            if (!m) return;

            if (m.msgType === 'star') {
                addStar(m);
            } else if (m.msgType === 'album_like') {
                handleAlbumLike(m);
            } else if (m.msgType && m.msgType.startsWith('album_')) {
                addAlbumImage(m);
            } else if (m.msgType === 'diary') {
                receiveDiaryEntry(m);
            } else if (m.msgType === 'diary_like') {
                receiveDiaryLike(m);
            } else {
                addChatMessage(m);
                if (res.type === 'message' && !window.isChatWindowOpen && m.name !== window.chatNickname) {
                    window.unreadCount++;
                    updateBadgeDisplay();
                }
            }
        };

        if (res.type === 'history') {
            if (Array.isArray(res.data)) {
                res.data.forEach(handleOneMessage);
            }
        } else if (res.type === 'userlist') {
            const onlineEl = onlineCountEl();
            if (onlineEl && Array.isArray(res.data)) {
                onlineEl.innerText = res.data.length;
            }
        } else if (res.type === 'message') {
            handleOneMessage(res);
        }
    };

    window.chatSocket.onclose = () => {
        setWsStatus('disconnected', '已断线，重连中...');
        const el = wsStatusEl();
        if (el) { el.style.opacity = '1'; el.style.pointerEvents = 'auto'; }
        window.reconnectTimer = setTimeout(() => connectWebSocket(false), CHAT_CONFIG.reconnectInterval);
    };

    window.chatSocket.onerror = () => {
        setWsStatus('disconnected', '连接失败');
        const el = wsStatusEl();
        if (el) { el.style.opacity = '1'; el.style.pointerEvents = 'auto'; }
    };
}

function wsSend(payload) {
    const s = JSON.stringify(payload);
    if (!chatSocket || chatSocket.readyState === WebSocket.CLOSED) {
        pendingWsQueue.push(s);
        connectWebSocket(false);
    } else if (chatSocket.readyState === WebSocket.CONNECTING) {
        pendingWsQueue.push(s);
    } else if (chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(s);
    } else {
        pendingWsQueue.push(s);
    }
}
