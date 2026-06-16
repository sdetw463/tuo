/* Floating chat widget, login, emoji, message rendering
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
function toggleChat(e) {
    if(e) e.stopPropagation();
    const win=document.getElementById('chat-window');
    if(!win.classList.contains('show')){
        if(!chatNickname){document.getElementById('chat-login-overlay').classList.add('show');return;}
        win.classList.add('show'); isChatWindowOpen=true; unreadCount=0; updateBadgeDisplay();
        setTimeout(()=>messagesEl.scrollTop=messagesEl.scrollHeight,100);
    } else { win.classList.remove('show'); isChatWindowOpen=false; document.getElementById('emoji-picker').style.display='none'; }
}
function enterChat() {
    const n=document.getElementById('nickname-input').value.trim();
    if(n){
        chatNickname=n;
        chatAvatar = n.charAt(0) || ' 🐰 ';
        localStorage.setItem('chat_nickname',n);
        localStorage.setItem('chat_avatar',chatAvatar);
        document.getElementById('chat-login-overlay').classList.remove('show');
        if(chatSocket)chatSocket.close();
        connectWebSocket(false);
        toggleChat();
    }
}
function updateBadgeDisplay() { if(unreadCount>0){badge.style.display='flex';badge.innerText=unreadCount>99?'99+':unreadCount;}else{badge.style.display='none';} }
function insertEmoji(e) { document.getElementById('chat-input').value+=e; document.getElementById('emoji-picker').style.display='none'; }
function toggleEmojiPicker() { const p=document.getElementById('emoji-picker'); p.style.display=p.style.display==='grid'?'none':'grid'; }
function autoResize(el) { el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }
function handleInputKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendTextMessage();} }
function handleLoginKey(e) { if(e.key==='Enter') enterChat(); }
function sendTextMessage() { const i=document.getElementById('chat-input'); if(i.value.trim()){sendChatPayload({type:'text',content:i.value});i.value='';i.style.height='auto';} }
function sendChatPayload(p) { const t=new Date(); const ts=`${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`; wsSend({name:chatNickname,avatar:chatAvatar,time:ts,msgType:p.type,msg:p.content}); }
function addChatMessage(data) {
    const key = getMessageKey(data);
    if (chatMessageKeys.has(key)) return;
    chatMessageKeys.add(key);

    const isMe = data.name === chatNickname;
    const content = data.msgType === 'image'
        ? `<img src="${escapeAttr(data.msg)}" class="message-image" onclick="openFull(this.src)">`
        : `<div class="message-bubble">${escapeHtml(data.msg)}</div>`;

    const timeHtml = data.time
        ? `<div style="font-size:10px;color:#bbb;margin-top:4px;padding:0 4px;text-align:${isMe?'right':'left'};">${escapeHtml(data.time)}</div>`
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
    messagesEl.insertAdjacentHTML('beforeend', html);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}
function handleImageUpload(e) { const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=(ev)=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');const MAX=800;let w=img.width,h=img.height;if(w>MAX){h*=(MAX/w);w=MAX;}canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);sendChatPayload({type:'image',content:canvas.toDataURL('image/jpeg',0.9)});};img.src=ev.target.result;};reader.readAsDataURL(file); }

const diaryStore = {};
let diaryCurrentDateKey = '';
let diaryViewYear = 0;
let diaryViewMonth = 0;
let diaryPendingImgs = [];

