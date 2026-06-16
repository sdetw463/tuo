/* Star wish modal and star-field rendering
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
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
function sendStarWish() {
    const input = document.getElementById('wish-input');
    const btn = document.getElementById('star-send-btn');
    const content = input.value.trim();
    if (!content) return;
    const t = new Date();
    const timeStr = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
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
function getHashPos(str) { let h=0; for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h); return{left:5+Math.abs(h%90),top:5+Math.abs((h>>8)%60)}; }
function addStar(data) {
    const key = getMessageKey(data);
    if (starMessageKeys.has(key)) return;
    starMessageKeys.add(key);

    const field = document.getElementById('star-field');
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
    const stars = field.getElementsByClassName('star-wish');
    if (stars.length > 50) {
        field.removeChild(stars[0]);
    }
}

