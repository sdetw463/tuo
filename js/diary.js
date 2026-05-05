/* ============================================================
   diary.js - 日记本核心逻辑
============================================================ */

let diaryCurrentDateKey = '';
let diaryViewYear = 0;
let diaryViewMonth = 0;
let diaryPendingImgs = [];

const MONTHS_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

// 初始化日历
function initDiaryCalendar() {
    const now = new Date();
    diaryViewYear = now.getFullYear();
    diaryViewMonth = now.getMonth();
    renderDiaryCalendar();
}

// 渲染日历
function renderDiaryCalendar() {
    const yearEl = document.getElementById('diary-cal-year');
    const monthEl = document.getElementById('diary-cal-month');
    const container = document.getElementById('diary-cal-days');

    if (yearEl) yearEl.textContent = diaryViewYear + '年';
    if (monthEl) monthEl.textContent = MONTHS_CN[diaryViewMonth];
    if (!container) return;

    container.innerHTML = '';

    const today = new Date();
    const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const firstDay = new Date(diaryViewYear, diaryViewMonth, 1).getDay();
    const daysInMonth = new Date(diaryViewYear, diaryViewMonth + 1, 0).getDate();

    // 空白格子
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'diary-day empty';
        container.appendChild(empty);
    }

    // 日期格子
    for (let d = 1; d <= daysInMonth; d++) {
        const key = dateKey(diaryViewYear, diaryViewMonth, d);
        const hasDiary = diaryStore[key] && diaryStore[key].length > 0;
        const isToday = key === todayKey;
        const dayOfWeek = new Date(diaryViewYear, diaryViewMonth, d).getDay();

        const cell = document.createElement('div');
        let cls = 'diary-day';
        if (hasDiary) cls += ' has-diary';
        if (isToday) cls += ' today';
        if (dayOfWeek === 0) cls += ' sun';
        if (dayOfWeek === 6) cls += ' sat';
        cell.className = cls;
        cell.dataset.key = key;
        cell.dataset.d = d;
        cell.onclick = () => openDiaryModal(key, d);

        cell.innerHTML = `<div class="diary-day-num">${d}</div><div class="diary-day-dot"></div>`;
        container.appendChild(cell);
    }
}

// 月份导航
function diaryNavMonth(dir) {
    diaryViewMonth += dir;
    if (diaryViewMonth > 11) { diaryViewMonth = 0; diaryViewYear++; }
    if (diaryViewMonth < 0) { diaryViewMonth = 11; diaryViewYear--; }
    renderDiaryCalendar();
}

// 打开日记弹窗
function openDiaryModal(key, day) {
    diaryCurrentDateKey = key;
    const [y, m, d_] = key.split('-');

    const titleEl = document.getElementById('diary-modal-title');
    const dateEl = document.getElementById('diary-modal-date');
    if (titleEl) titleEl.textContent = `📖 ${y}年${MONTHS_CN[parseInt(m) - 1]} ${parseInt(d_)}日`;
    if (dateEl) dateEl.textContent = `${y}.${m}.${d_}`;

    const today = new Date();
    const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const composeArea = document.getElementById('diary-compose-area');
    if (composeArea) composeArea.style.display = (key === todayKey) ? 'block' : 'none';

    const savedAuthor = localStorage.getItem('diary_author') || '';
    const authorInput = document.getElementById('diary-author-input');
    const textInput = document.getElementById('diary-text-input');
    if (authorInput) authorInput.value = savedAuthor;
    if (textInput) { textInput.value = ''; updateDiaryCharCount(textInput); }

    diaryPendingImgs = [];
    renderDiaryImgPreview();
    renderDiaryEntries(key);
    document.getElementById('diary-overlay').classList.add('show');
}

// 关闭日记弹窗
function closeDiaryModal() {
    document.getElementById('diary-overlay').classList.remove('show');
    const emojiPicker = document.getElementById('diary-emoji-picker');
    if (emojiPicker) emojiPicker.style.display = 'none';
}

// 渲染日记条目列表
function renderDiaryEntries(key) {
    const inner = document.getElementById('diary-entries-inner');
    const empty = document.getElementById('diary-empty');
    const entries = diaryStore[key] || [];

    if (!inner) return;
    inner.innerHTML = '';
    if (empty) inner.appendChild(empty);

    if (entries.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    entries.forEach(entry => {
        const el = buildDiaryEntryEl(entry, key);
        inner.appendChild(el);
    });

    const diaryEntriesEl = document.getElementById('diary-entries');
    setTimeout(() => { if (diaryEntriesEl) diaryEntriesEl.scrollTop = diaryEntriesEl.scrollHeight; }, 50);
}

// 构建单个日记条目元素
function buildDiaryEntryEl(entry, key) {
    const div = document.createElement('div');
    div.className = 'diary-entry';
    div.id = 'diary-entry-' + entry.id;

    const myName = chatNickname || localStorage.getItem('diary_author') || '';
    const likedByMe = entry.likedBy && entry.likedBy.includes(myName);
    const likeCount = entry.likes || 0;

    let imagesHtml = '';
    let imgList = entry.imgs || [];
    if (imgList.length === 0 && entry.img) imgList = [entry.img];

    if (imgList.length > 0) {
        imagesHtml = '<div class="diary-entry-imgs">';
        imgList.forEach(src => {
            imagesHtml += `<img src="${escapeAttr(src)}" onclick="openFull(this.src)">`;
        });
        imagesHtml += '</div>';
    }

    const firstChar = (entry.author || '?').charAt(0).toUpperCase();

    div.innerHTML = `
        <div class="diary-entry-header">
            <div class="diary-entry-avatar">${firstChar}</div>
            <div class="diary-entry-meta">
                <div class="diary-entry-name">${escapeHtml(entry.author)}</div>
                <div class="diary-entry-time">${entry.time}</div>
            </div>
        </div>
        <div class="diary-entry-body">${escapeHtml(entry.text)}</div>
        ${imagesHtml}
        <div class="diary-entry-footer">
            <button class="diary-like-btn ${likedByMe ? 'liked' : ''}" onclick="toggleDiaryLike('${key}','${entry.id}',this)">
                <span class="like-heart">${likedByMe ? '❤️' : '🤍'}</span>
                <span class="like-num">${likeCount > 0 ? likeCount : ''}</span>
            </button>
        </div>
    `;
    return div;
}

// 发布日记
function submitDiaryEntry() {
    const authorInput = document.getElementById('diary-author-input');
    const textInput = document.getElementById('diary-text-input');
    const author = authorInput ? authorInput.value.trim() : '';
    const text = textInput ? textInput.value.trim() : '';

    if (!author) { alert('请先输入你的名字哦~'); if (authorInput) authorInput.focus(); return; }
    if (!text && diaryPendingImgs.length === 0) { alert('写点什么再发布吧~'); if (textInput) textInput.focus(); return; }

    const btn = document.getElementById('diary-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '发布中...'; }

    const now = new Date();
    const timeStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const entryId = 'de_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    const payload = {
        msgType: 'diary',
        dateKey: diaryCurrentDateKey,
        id: entryId,
        author: author,
        text: text,
        imgs: [...diaryPendingImgs],
        time: timeStr,
        likes: 0,
        likedBy: []
    };

    wsSend(payload);
    localStorage.setItem('diary_author', author);
    receiveDiaryEntry(payload);
    renderDiaryCalendar();

    if (textInput) { textInput.value = ''; updateDiaryCharCount(textInput); }
    diaryPendingImgs = [];
    renderDiaryImgPreview();

    if (btn) { btn.disabled = false; btn.textContent = '发布'; }
}

// 收到日记条目
function receiveDiaryEntry(data) {
    const key = data.dateKey;
    if (!key) return;
    if (!diaryStore[key]) diaryStore[key] = [];
    if (diaryStore[key].find(e => e.id === data.id)) return;

    diaryStore[key].push({
        id: data.id,
        author: data.author,
        text: data.text,
        img: data.img || null,
        imgs: data.imgs || [],
        time: data.time,
        likes: data.likes || 0,
        likedBy: data.likedBy || []
    });

    if (diaryCurrentDateKey === key && document.getElementById('diary-overlay').classList.contains('show')) {
        renderDiaryEntries(key);
    }
    renderDiaryCalendar();
}

// 切换日记点赞
function toggleDiaryLike(key, entryId, btn) {
    const entries = diaryStore[key];
    if (!entries) return;
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    const myName = getStableUserName();
    if (!entry.likedBy) entry.likedBy = [];

    const alreadyLiked = entry.likedBy.includes(myName);
    if (alreadyLiked) {
        entry.likedBy = entry.likedBy.filter(n => n !== myName);
        entry.likes = Math.max(0, (entry.likes || 1) - 1);
    } else {
        entry.likedBy.push(myName);
        entry.likes = (entry.likes || 0) + 1;
    }

    const isLiked = !alreadyLiked;
    if (btn) {
        btn.className = 'diary-like-btn' + (isLiked ? ' liked' : '');
        const heart = btn.querySelector('.like-heart');
        const num = btn.querySelector('.like-num');
        if (heart) heart.textContent = isLiked ? '❤️' : '🤍';
        if (num) num.textContent = entry.likes > 0 ? entry.likes : '';
    }

    wsSend({ msgType: 'diary_like', dateKey: key, entryId: entryId, name: myName, isLike: isLiked });
}

// 收到日记点赞消息
function receiveDiaryLike(data) {
    const entries = diaryStore[data.dateKey];
    if (!entries) return;
    const entry = entries.find(e => e.id === data.entryId);
    if (!entry) return;

    if (!entry.likedBy) entry.likedBy = [];
    if (data.isLike) {
        if (!entry.likedBy.includes(data.name)) entry.likedBy.push(data.name);
    } else {
        entry.likedBy = entry.likedBy.filter(n => n !== data.name);
    }
    entry.likes = entry.likedBy.length;

    if (diaryCurrentDateKey === data.dateKey && document.getElementById('diary-overlay').classList.contains('show')) {
        const entryEl = document.getElementById('diary-entry-' + data.entryId);
        if (entryEl) {
            const myName = chatNickname || localStorage.getItem('diary_author') || '';
            const isLiked = entry.likedBy.includes(myName);
            const likeBtn = entryEl.querySelector('.diary-like-btn');
            if (likeBtn) {
                likeBtn.className = 'diary-like-btn' + (isLiked ? ' liked' : '');
                const heart = likeBtn.querySelector('.like-heart');
                const num = likeBtn.querySelector('.like-num');
                if (heart) heart.textContent = isLiked ? '❤️' : '🤍';
                if (num) num.textContent = entry.likes > 0 ? entry.likes : '';
            }
        }
    }
}

// 更新字数统计
function updateDiaryCharCount(el) {
    if (!el) return;
    const count = el.value.length;
    const counter = document.getElementById('diary-char-count');
    if (counter) counter.textContent = `${count} / 500`;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

// 保存日记作者名
function saveDiaryAuthor(val) {
    localStorage.setItem('diary_author', val.trim());
}

// 处理日记图片选择
function handleDiaryImgSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    if (diaryPendingImgs.length + files.length > 10) {
        alert('最多只能上传 10 张图片哦~');
        files.splice(10 - diaryPendingImgs.length);
    }

    let loadedCount = 0;
    const totalFiles = files.length;

    files.forEach(file => {
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
                diaryPendingImgs.push(canvas.toDataURL('image/jpeg', 0.82));
                loadedCount++;
                if (loadedCount === totalFiles) renderDiaryImgPreview();
            };
            img.onerror = () => {
                loadedCount++;
                if (loadedCount === totalFiles) renderDiaryImgPreview();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

// 渲染日记图片预览
function renderDiaryImgPreview() {
    const container = document.getElementById('diary-img-preview');
    if (!container) return;

    container.innerHTML = '';
    if (diaryPendingImgs.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    diaryPendingImgs.forEach((src, idx) => {
        const div = document.createElement('div');
        div.className = 'diary-preview-item';
        div.innerHTML = `<img src="${src}" alt="预览" onclick="openFull('${src}')"><button class="diary-img-remove" onclick="removeDiaryImg(${idx})">✕</button>`;
        container.appendChild(div);
    });
}

// 删除日记待上传图片
function removeDiaryImg(index) {
    if (index !== undefined) {
        diaryPendingImgs.splice(index, 1);
    } else {
        diaryPendingImgs = [];
    }
    renderDiaryImgPreview();
}

// 初始化日记表情选择器
function initDiaryEmojiPicker() {
    const picker = document.getElementById('diary-emoji-picker');
    if (!picker) return;

    diaryEmojiList.forEach(em => {
        const s = document.createElement('span');
        s.style.cssText = 'cursor:pointer;font-size:18px;padding:3px;border-radius:6px;transition:0.15s;display:inline-block;';
        s.textContent = em;
        s.onmouseenter = () => s.style.background = 'rgba(255,105,180,0.1)';
        s.onmouseleave = () => s.style.background = '';
        s.onclick = () => {
            const ta = document.getElementById('diary-text-input');
            if (ta) { ta.value += em; updateDiaryCharCount(ta); }
            picker.style.display = 'none';
        };
        picker.appendChild(s);
    });
}

// 切换日记表情选择器
function toggleDiaryEmoji() {
    const p = document.getElementById('diary-emoji-picker');
    if (p) p.style.display = p.style.display === 'grid' ? 'none' : 'grid';
}

// 初始化日记模块
function initDiary() {
    initDiaryEmojiPicker();

    // 全局点击关闭日记表情选择器
    document.addEventListener('click', (e) => {
        const ep = document.getElementById('diary-emoji-picker');
        if (ep && ep.style.display === 'grid' && !ep.contains(e.target) && !e.target.closest('.diary-tool-btn')) {
            ep.style.display = 'none';
        }
    });
}
