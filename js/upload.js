/* ============================================================
   upload.js - 图片上传逻辑（聊天 / 相册通用）
============================================================ */

// 聊天发送图片
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 800;
            let w = img.width, h = img.height;
            if (w > MAX) { h *= (MAX / w); w = MAX; }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            sendChatPayload({ type: 'image', content: canvas.toDataURL('image/jpeg', 0.9) });
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

// 初始化上传监听（挂载到 DOM）
function initUpload() {
    // 相册上传 input 的 onchange 已在 HTML 中通过 onchange="handleAlbumUpload(event)" 绑定
    // 聊天图片上传的 onchange 同样在 HTML 中绑定
    // 此文件负责纯函数逻辑，DOM 事件绑定由 HTML / main.js 负责
}
