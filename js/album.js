/* ============================================================
   album.js - 相册逻辑
============================================================ */

let currentOpenAlbumType = '';

// 打开相册
function openAlbum(type, title) {
    currentOpenAlbumType = type;
    const titleEl = document.getElementById('album-title');
    if (titleEl) titleEl.innerText = title;
    renderAlbumGrid();
    document.getElementById('album-modal').classList.add('show');
}

// 关闭相册
function closeAlbum() {
    document.getElementById('album-modal').classList.remove('show');
    currentOpenAlbumType = '';
}

// 左右滚动相册
function scrollGallery(dir) {
    const grid = document.getElementById('album-grid');
    if (grid) grid.scrollBy({ left: dir * 256, behavior: 'smooth' });
}

// 点赞 / 取消点赞
function toggleHeart(e, imgId, albumType) {
    e.stopPropagation();
    const imgObj = albumData[albumType].find(img => img.id === imgId);
    if (!imgObj) return;

    const myName = getStableUserName();
    if (!imgObj.likedBy) imgObj.likedBy = new Set();

    if (imgObj.likedBy.has(myName)) {
        imgObj.likedBy.delete(myName);
        imgObj.myLike = false;
    } else {
        imgObj.likedBy.add(myName);
        imgObj.myLike = true;
    }
    imgObj.likes = imgObj.likedBy.size;
    renderAlbumGrid();

    wsSend({ name: myName, msgType: 'album_like', albumType, imgId, isLike: imgObj.myLike });
}

// 处理收到的点赞消息
function handleAlbumLike(data) {
    if (!albumData[data.albumType]) return;
    const imgObj = albumData[data.albumType].find(img => img.id === data.imgId);
    if (!imgObj) return;

    if (!imgObj.likedBy) imgObj.likedBy = new Set();
    if (data.isLike) imgObj.likedBy.add(data.name);
    else imgObj.likedBy.delete(data.name);

    imgObj.likes = imgObj.likedBy.size;
    imgObj.myLike = imgObj.likedBy.has(getStableUserName());

    if (currentOpenAlbumType === data.albumType) renderAlbumGrid();
}

// 渲染相册网格
function renderAlbumGrid() {
    const grid = document.getElementById('album-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 上传卡片
    const up = document.createElement('div');
    up.className = 'album-item upload-card';
    up.onclick = () => document.getElementById('album-file-input').click();
    up.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        <span style="font-size:14px;color:white;font-weight:bold;">上传照片</span>
    `;
    grid.appendChild(up);

    // 相册图片
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

// 处理收到的新相册图片
function addAlbumImage(data) {
    const type = data.msgType;
    if (!albumData[type]) albumData[type] = [];
    const imgId = data.id || getImgId(data.msg);
    if (albumData[type].find(i => i.id === imgId)) return;

    albumData[type].unshift({
        id: imgId,
        src: data.msg,
        date: data.time || '刚刚',
        likes: 0,
        myLike: false,
        likedBy: new Set()
    });

    if (currentOpenAlbumType === type) renderAlbumGrid();
}

// 处理相册文件上传
function handleAlbumUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 1000;
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) {
                if (w > h) { h *= (MAX / w); w = MAX; }
                else { w *= (MAX / h); h = MAX; }
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            sendAlbumImage(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

// 发送相册图片到服务器
function sendAlbumImage(base64) {
    const t = new Date();
    const dateStr = `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, '0')}.${String(t.getDate()).padStart(2, '0')}`;
    wsSend({
        name: getStableUserName(),
        avatar: chatAvatar || ' 🌸 ',
        time: dateStr,
        msgType: currentOpenAlbumType,
        msg: base64
    });
}
