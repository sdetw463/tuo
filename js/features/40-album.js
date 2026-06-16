/* Album, Xiamen modal, likes, uploads
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
function openAlbum(type,title) { currentOpenAlbumType=type; document.getElementById('album-title').innerText=title; renderAlbumGrid(); document.getElementById('album-modal').classList.add('show'); }
function closeAlbum() { document.getElementById('album-modal').classList.remove('show'); currentOpenAlbumType=''; }

function openXiamenModal() {
    let modal = document.getElementById('xiamen-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'xiamen-modal-overlay';
        modal.id = 'xiamen-modal';
        modal.onclick = (e) => { if (e.target === modal) closeXiamenModal(); };

        let html = `
            <div class="xiamen-modal-content">
                <div class="xiamen-header">
                    <h2 style="margin: 0; color: #d94686; font-size: 24px;">🏖️ 我们的厦门回忆录</h2>
                    <button class="xiamen-close" onclick="closeXiamenModal()">×</button>
                </div>
                <div class="xiamen-scroll-area">
        `;

        const days = ['Day 0', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6'];
        days.forEach((dayTitle, i) => {
            html += `<div class="xiamen-day-section">
                <div class="xiamen-day-title">${dayTitle}</div>
                <div class="xiamen-photo-grid">`;
            for (let j = 1; j <= 4; j++) {
                const rot = (Math.random() * 8 - 4).toFixed(1);
                html += `<div class="xiamen-polaroid" style="--r: ${rot}deg">
                    <div class="polaroid-img-box">
                        <img src="./xiamen/day${i}-${j}中.jpeg" alt="Day ${i} 照片 ${j}" onerror="this.src='https://via.placeholder.com/200x260/ffc0cb/ffffff?text=Day${i}-${j}'">
                    </div>
                </div>`;
            }
            html += `</div></div>`;
        });

        html += `</div></div>`;
        modal.innerHTML = html;
        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    setTimeout(() => { modal.classList.add('show'); }, 10);
}

function closeXiamenModal() {
    const modal = document.getElementById('xiamen-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 300);
    }
}
function scrollGallery(dir) { document.getElementById('album-grid').scrollBy({left:dir*256,behavior:'smooth'}); }
function toggleHeart(e,imgId,albumType) {
    e.stopPropagation();
    const imgObj=albumData[albumType].find(img=>img.id===imgId); if(!imgObj) return;
    const myName = getStableUserName();
    if(!imgObj.likedBy) imgObj.likedBy=new Set();
    if(imgObj.likedBy.has(myName)){imgObj.likedBy.delete(myName);imgObj.myLike=false;}else{imgObj.likedBy.add(myName);imgObj.myLike=true;}
    imgObj.likes=imgObj.likedBy.size; renderAlbumGrid();
    wsSend({name:myName,msgType:'album_like',albumType,imgId,isLike:imgObj.myLike});
}
function handleAlbumLike(data) {
    if(!albumData[data.albumType]) return;
    const imgObj=albumData[data.albumType].find(img=>img.id===data.imgId); if(!imgObj) return;
    if(!imgObj.likedBy) imgObj.likedBy=new Set();
    if(data.isLike) imgObj.likedBy.add(data.name); else imgObj.likedBy.delete(data.name);
    imgObj.likes=imgObj.likedBy.size;
    imgObj.myLike = imgObj.likedBy.has(getStableUserName());
    if(currentOpenAlbumType===data.albumType) renderAlbumGrid();
}
function renderAlbumGrid() {
    const grid = document.getElementById('album-grid');
    grid.innerHTML = '';
    const up = document.createElement('div');
    up.className = 'album-item upload-card';
    up.onclick = () => document.getElementById('album-file-input').click();
    up.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        <span style="font-size:14px;color:white;font-weight:bold;">上传照片</span>
    `;
    grid.appendChild(up);
    (albumData[currentOpenAlbumType] || []).forEach(img => {
        const div = document.createElement('div');
        div.className = 'album-item';
        const lc = img.likes || 0;
        const lClass = img.myLike ? 'liked' : '';
        const fa = img.myLike ? 'currentColor' : 'none';
        const safeSrc = escapeAttr(img.src);
        const safeId = escapeAttr(img.id);
        const safeType = escapeAttr(currentOpenAlbumType);
        div.innerHTML = `
            <img src="${safeSrc}" onclick="openFull(this.src)">
            <div class="album-date">${escapeHtml(img.date)}</div>
            <div class="heart-icon ${lClass}" onclick="toggleHeart(event,'${safeId}','${safeType}')">
                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="${fa}">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span class="heart-count">${lc > 0 ? lc : '赞'}</span>
            </div>
        `;
        grid.appendChild(div);
    });
}
function addAlbumImage(data) {
    const type=data.msgType; if(!albumData[type]) albumData[type]=[];
    const imgId=data.id||getImgId(data.msg); if(albumData[type].find(i=>i.id===imgId)) return;
    albumData[type].unshift({id:imgId,src:data.msg,date:data.time||'刚刚',likes:0,myLike:false,likedBy:new Set()});
    if(currentOpenAlbumType===type) renderAlbumGrid();
}
function handleAlbumUpload(e) {
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{ const img=new Image(); img.onload=()=>{ const canvas=document.createElement('canvas'); const MAX=1000; let w=img.width,h=img.height; if(w>MAX||h>MAX){if(w>h){h*=(MAX/w);w=MAX;}else{w*=(MAX/h);h=MAX;}} canvas.width=w;canvas.height=h; canvas.getContext('2d').drawImage(img,0,0,w,h); sendAlbumImage(canvas.toDataURL('image/jpeg',0.85)); }; img.src=ev.target.result; };
    reader.readAsDataURL(file); e.target.value='';
}
function sendAlbumImage(base64) {
    const t = new Date();
    const dateStr = `${t.getFullYear()}.${String(t.getMonth()+1).padStart(2,'0')}.${String(t.getDate()).padStart(2,'0')}`;
    wsSend({
        name: getStableUserName(),
        avatar: chatAvatar || ' 🌸 ',
        time: dateStr,
        msgType: currentOpenAlbumType,
        msg: base64
    });
}

