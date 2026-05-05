/* ============================================================
   utils.js - 通用工具函数
============================================================ */

// 稳定用户名（优先用聊天昵称，其次日记作者，最后游客ID）
function getStableUserName() {
    return window.chatNickname || localStorage.getItem('diary_author') || TUOTUO_GUEST_ID;
}

// HTML 文本转义
function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
}

// HTML 属性转义
function escapeAttr(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// 安全 Markdown 渲染：marked + DOMPurify
function renderMarkdownSafe(text) {
    const raw = marked.parse(text || '');
    if (window.DOMPurify) {
        return DOMPurify.sanitize(raw, {
            ADD_ATTR: ['target', 'rel'],
        });
    }
    return raw;
}

// 打开大图预览
function openFull(src) {
    const img = document.getElementById('full-image');
    img.src = src || '';
    document.getElementById('image-viewer').style.display = 'flex';
}

// 根据内容生成唯一消息 key（用于去重）
function getMessageKey(data) {
    return [
        data.id || '',
        data.name || '',
        data.time || '',
        data.msgType || '',
        data.msg || ''
    ].join('|');
}

// 星空位置哈希（保证同一内容落在屏幕固定位置）
function getHashPos(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return {
        left: 5 + Math.abs(h % 90),
        top: 5 + Math.abs((h >> 8) % 60)
    };
}

// 图片 ID 哈希
function getImgId(src) {
    let h = 0;
    for (let i = 0; i < src.length; i++) {
        h = ((h << 5) - h) + src.charCodeAt(i);
        h = h & h;
    }
    return 'img_' + Math.abs(h);
}

// 日期字符串 key（YYYY-MM-DD）
function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 获取连接用的昵称
function getConnectName() {
    return window.chatNickname || TUOTUO_GUEST_ID;
}

// sleep 工具
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 设置恋爱天数显示
function updateLoveDays() {
    const s = new Date('2026-04-11');
    const d = Math.max(0, Math.floor((new Date() - s) / 86400000));
    const el = document.getElementById('love-days');
    if (el) el.textContent = d;
}

// 自动调整 textarea 高度
function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

// 设置 textarea 高度（带上限）
function autoResizeWithLimit(el, maxHeight) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
}
