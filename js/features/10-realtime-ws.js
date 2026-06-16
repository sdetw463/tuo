/* Shared WebSocket connection, message queue, realtime dispatch
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
let chatSocket = null;
let chatNickname = localStorage.getItem('chat_nickname') || '';
let chatAvatar = localStorage.getItem('chat_avatar') || '';
let unreadCount = 0, isChatWindowOpen = false, reconnectTimer = null;

const badge = document.getElementById('msg-badge');
const messagesEl = document.getElementById('chat-messages');
const wsStatusEl = document.getElementById('ws-status');
const wsStatusTextEl = document.getElementById('ws-status-text');

const albumData = { 'album_food': [], 'album_scenery': [], 'album_portrait': [] };
let currentOpenAlbumType = '';

const pendingWsQueue = [];
const chatMessageKeys = new Set();
const starMessageKeys = new Set();

function getMessageKey(data) {
    return [
        data.id || '',
        data.name || '',
        data.time || '',
        data.msgType || '',
        data.msg || ''
    ].join('|');
}

function flushPendingWsQueue() {
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) return;
    while (pendingWsQueue.length > 0) {
        chatSocket.send(pendingWsQueue.shift());
    }
}

function getConnectName() {
    return chatNickname || TUOTUO_GUEST_ID;
}
function getImgId(src) { let h=0; for(let i=0;i<src.length;i++){h=((h<<5)-h)+src.charCodeAt(i);h=h&h;} return 'img_'+Math.abs(h); }
function setWsStatus(state,text) { wsStatusEl.className=state; wsStatusTextEl.textContent=text; }

function connectWebSocket(isGuest) {
    if (chatSocket && (chatSocket.readyState===WebSocket.CONNECTING||chatSocket.readyState===WebSocket.OPEN)) return;
    clearTimeout(reconnectTimer);
    const name = isGuest ? getConnectName() : (chatNickname||getConnectName());
    setWsStatus('connecting','连接中...');
    const proto = location.protocol==='https:'?'wss':'ws';
    chatSocket = new WebSocket(`${proto}://${CHAT_CONFIG.wsHost}/socket/${encodeURIComponent(name)}`);

    chatSocket.onopen = () => {
        setWsStatus('connected', '已连接');
        flushPendingWsQueue();
        const wishInput = document.getElementById('wish-input');
        const starBtn = document.getElementById('star-send-btn');
        if (wishInput) wishInput.value = '';
        if (starBtn) starBtn.innerText = '放飞心愿';
        setTimeout(() => {
            wsStatusEl.style.opacity = '0';
            wsStatusEl.style.pointerEvents = 'none';
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
                if (res.type === 'message' && !isChatWindowOpen && m.name !== chatNickname) {
                    unreadCount++;
                    updateBadgeDisplay();
                }
            }
        };

        if (res.type === 'history') {
            if (Array.isArray(res.data)) {
                res.data.forEach(handleOneMessage);
            }
        } else if (res.type === 'userlist') {
            const onlineEl = document.getElementById('online-count');
            if (onlineEl && Array.isArray(res.data)) {
                onlineEl.innerText = res.data.length;
            }
        } else if (res.type === 'message') {
            handleOneMessage(res);
        }
    };

    chatSocket.onclose = () => {
        setWsStatus('disconnected','已断线，重连中...');
        wsStatusEl.style.opacity='1'; wsStatusEl.style.pointerEvents='auto';
        reconnectTimer = setTimeout(()=>connectWebSocket(false), CHAT_CONFIG.reconnectInterval);
    };
    chatSocket.onerror = () => { setWsStatus('disconnected','连接失败'); wsStatusEl.style.opacity='1'; wsStatusEl.style.pointerEvents='auto'; };
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

