/* ============================================================
   chat.js - 聊天室 UI 逻辑
============================================================ */

// 切换聊天窗口显示
function toggleChat(e) {
    if (e) e.stopPropagation();
    const win = document.getElementById('chat-window');
    if (!win) return;

    if (!win.classList.contains('show')) {
        if (!chatNickname) {
            document.getElementById('chat-login-overlay').classList.add('show');
            return;
        }
        win.classList.add('show');
        isChatWindowOpen = true;
        unreadCount = 0;
        updateBadgeDisplay();
        setTimeout(() => {
            const el = messagesEl();
            if (el) el.scrollTop = el.scrollHeight;
        }, 100);
    } else {
        win.classList.remove('show');
        isChatWindowOpen = false;
        const emojiPicker = document.getElementById('emoji-picker');
        if (emojiPicker) emojiPicker.style.display = 'none';
    }
}

// 登录聊天室
function enterChat() {
    const n = document.getElementById('nickname-input').value.trim();
    if (!n) return;

    chatNickname = n;
    chatAvatar = n.charAt(0) || ' 🐰 ';
    sessionStorage.setItem('chat_nickname', n);
    sessionStorage.setItem('chat_avatar', chatAvatar);

    document.getElementById('chat-login-overlay').classList.remove('show');
    if (chatSocket) chatSocket.close();
    connectWebSocket(false);
    toggleChat();
}

// 回车登录
function handleLoginKey(e) {
    if (e.key === 'Enter') enterChat();
}

// 回车发送消息
function handleInputKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
    }
}

// 插入表情
function insertEmoji(e) {
    const input = document.getElementById('chat-input');
    if (input) input.value += e;
    const picker = document.getElementById('emoji-picker');
    if (picker) picker.style.display = 'none';
}

// 切换表情选择器
function toggleEmojiPicker() {
    const p = document.getElementById('emoji-picker');
    if (p) p.style.display = p.style.display === 'grid' ? 'none' : 'grid';
}

// 发送文字消息
function sendTextMessage() {
    const i = document.getElementById('chat-input');
    if (!i || !i.value.trim()) return;
    sendChatPayload({ type: 'text', content: i.value });
    i.value = '';
    autoResize(i);
}

// 构造并发送聊天消息
function sendChatPayload(p) {
    const t = new Date();
    const ts = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
    wsSend({
        name: chatNickname,
        avatar: chatAvatar,
        time: ts,
        msgType: p.type,
        msg: p.content
    });
}

// 添加消息到聊天界面
function addChatMessage(data) {
    const key = getMessageKey(data);
    if (chatMessageKeys.has(key)) return;
    chatMessageKeys.add(key);

    const isMe = data.name === chatNickname;
    const content = data.msgType === 'image'
        ? `<img src="${escapeAttr(data.msg)}" class="message-image" onclick="openFull(this.src)">`
        : `<div class="message-bubble">${escapeHtml(data.msg)}</div>`;

    const timeHtml = data.time
        ? `<div style="font-size:10px;color:#bbb;margin-top:4px;padding:0 4px;text-align:${isMe ? 'right' : 'left'};">${escapeHtml(data.time)}</div>`
        : '';

    const html = `
        <div class="message-item ${isMe ? 'right' : ''}">
            <div class="message-avatar">${escapeHtml(data.avatar || ' 🐰 ')}</div>
            <div class="message-content">
                <div class="message-name">${escapeHtml(data.name)}</div>
                ${content}
                ${timeHtml}
            </div>
        </div>
    `;

    const el = messagesEl();
    if (el) {
        el.insertAdjacentHTML('beforeend', html);
        el.scrollTop = el.scrollHeight;
    }
}

// 初始化表情选择器
function initEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    if (!picker) return;
    emojiList.forEach(e => {
        const s = document.createElement('span');
        s.style.cursor = 'pointer';
        s.style.fontSize = '20px';
        s.innerText = e;
        s.onclick = () => insertEmoji(e);
        picker.appendChild(s);
    });
}

// 初始化聊天界面
function initChat() {
    initEmojiPicker();

    // 全局点击关闭表情选择器
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('emoji-picker');
        if (picker && picker.style.display === 'grid' && !picker.contains(e.target) && !e.target.closest('.chat-toolbar')) {
            picker.style.display = 'none';
        }
    });
}
