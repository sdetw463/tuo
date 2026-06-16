/* Diary calendar, modal, entries, emoji and images
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
function initDiaryCalendar() {
    const now = new Date();
    diaryViewYear = now.getFullYear();
    diaryViewMonth = now.getMonth();
    renderDiaryCalendar();
}

function positionLeftCards() {
    const mainCard = document.getElementById('main-card');
    const diaryCard = document.getElementById('diary-card');
    const aiCard = document.getElementById('ai-entry-card');
    if (!mainCard) return;

    if (window.innerWidth > 768) {
        const gap = 10;
        const mainRect = mainCard.getBoundingClientRect();

        if (diaryCard) {
            diaryCard.style.top = Math.max(10, mainRect.top - diaryCard.offsetHeight - gap) + 'px';
            diaryCard.style.left = mainCard.style.left || '30px';

            if (aiCard) {
                const diaryRect = diaryCard.getBoundingClientRect();
                aiCard.style.top = Math.max(10, diaryRect.top - aiCard.offsetHeight - gap) + 'px';
                aiCard.style.left = diaryCard.style.left || '30px';
            }
        }
    }
}

function renderDiaryCalendar() {
    const MONTHS_CN = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    document.getElementById('diary-cal-year').textContent = diaryViewYear + '年';
    document.getElementById('diary-cal-month').textContent = MONTHS_CN[diaryViewMonth];

    const container = document.getElementById('diary-cal-days');
    container.innerHTML = '';

    const today = new Date();
    const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const firstDay = new Date(diaryViewYear, diaryViewMonth, 1).getDay();
    const daysInMonth = new Date(diaryViewYear, diaryViewMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'diary-day empty';
        container.appendChild(empty);
    }

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

function dateKey(y, m, d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

function diaryNavMonth(dir) {
    diaryViewMonth += dir;
    if (diaryViewMonth > 11) { diaryViewMonth = 0; diaryViewYear++; }
    if (diaryViewMonth < 0) { diaryViewMonth = 11; diaryViewYear--; }
    renderDiaryCalendar();
}

function openDiaryModal(key, day) {
    diaryCurrentDateKey = key;
    const [y, m, d_] = key.split('-');
    const MONTHS_CN = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    document.getElementById('diary-modal-title').textContent = `📖 ${y}年${MONTHS_CN[parseInt(m)-1]} ${parseInt(d_)}日`;
    document.getElementById('diary-modal-date').textContent = `${y}.${m}.${d_}`;

    const today = new Date();
    const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const composeArea = document.getElementById('diary-compose-area');

    const savedAuthor = localStorage.getItem('diary_author') || '';
    document.getElementById('diary-author-input').value = savedAuthor;
    document.getElementById('diary-text-input').value = '';
    updateDiaryCharCount(document.getElementById('diary-text-input'));

    diaryPendingImgs = [];
    renderDiaryImgPreview();

    renderDiaryEntries(key);
    document.getElementById('diary-overlay').classList.add('show');
}

function closeDiaryModal() {
    document.getElementById('diary-overlay').classList.remove('show');
    document.getElementById('diary-emoji-picker').style.display = 'none';
}

function renderDiaryEntries(key) {
    const inner = document.getElementById('diary-entries-inner');
    const empty = document.getElementById('diary-empty');
    const entries = diaryStore[key] || [];

    inner.innerHTML = '';
    inner.appendChild(empty);

    if (entries.length === 0) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    entries.forEach(entry => {
        const el = buildDiaryEntryEl(entry, key);
        inner.appendChild(el);
    });

    const diaryEntriesEl = document.getElementById('diary-entries');
    setTimeout(() => { diaryEntriesEl.scrollTop = diaryEntriesEl.scrollHeight; }, 50);
}

function buildDiaryEntryEl(entry, key) {
    const div = document.createElement('div');
    div.className = 'diary-entry';
    div.id = 'diary-entry-' + entry.id;

    const myName = chatNickname || localStorage.getItem('diary_author') || '';
    const likedByMe = entry.likedBy && entry.likedBy.includes(myName);
    const likeCount = entry.likes || 0;

    let imagesHtml = '';
    let imgList = entry.imgs || [];
    if (imgList.length === 0 && entry.img) { imgList = [entry.img]; }

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
            <button class="diary-like-btn ${likedByMe?'liked':''}" onclick="toggleDiaryLike('${key}','${entry.id}',this)">
                <span class="like-heart">${likedByMe?'❤️':'🤍'}</span>
                <span class="like-num">${likeCount > 0 ? likeCount : ''}</span>
            </button>
        </div>
    `;
    return div;
}

function submitDiaryEntry() {
    const author = document.getElementById('diary-author-input').value.trim();
    const text = document.getElementById('diary-text-input').value.trim();
    if (!author) { alert('请先输入你的名字哦~'); document.getElementById('diary-author-input').focus(); return; }
    if (!text && diaryPendingImgs.length === 0) { alert('写点什么再发布吧~'); document.getElementById('diary-text-input').focus(); return; }

    const btn = document.getElementById('diary-submit-btn');
    btn.disabled = true; btn.textContent = '发布中...';

    const now = new Date();
    const timeStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const entryId = 'de_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);

    const payload = {
        msgType: 'diary', dateKey: diaryCurrentDateKey, id: entryId, author: author, text: text, imgs: [...diaryPendingImgs], time: timeStr, likes: 0, likedBy: []
    };

    wsSend(payload);
    localStorage.setItem('diary_author', author);

    receiveDiaryEntry(payload);
    renderDiaryCalendar();

    document.getElementById('diary-text-input').value = '';
    updateDiaryCharCount(document.getElementById('diary-text-input'));

    diaryPendingImgs = [];
    renderDiaryImgPreview();

    btn.disabled = false; btn.textContent = '发布';
}

function receiveDiaryEntry(data) {
    const key = data.dateKey;
    if (!key) return;
    if (!diaryStore[key]) diaryStore[key] = [];
    if (diaryStore[key].find(e => e.id === data.id)) return;
    diaryStore[key].push({ id: data.id, author: data.author, text: data.text, img: data.img || null, imgs: data.imgs || [], time: data.time, likes: data.likes || 0, likedBy: data.likedBy || [] });
    if (diaryCurrentDateKey === key && document.getElementById('diary-overlay').classList.contains('show')) { renderDiaryEntries(key); }
    renderDiaryCalendar();
}

function toggleDiaryLike(key, entryId, btn) {
    const entries = diaryStore[key];
    if (!entries) return;
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    const myName = getStableUserName();
    if (!entry.likedBy) entry.likedBy = [];

    const alreadyLiked = entry.likedBy.includes(myName);
    if (alreadyLiked) { entry.likedBy = entry.likedBy.filter(n => n !== myName); entry.likes = Math.max(0, (entry.likes||1) - 1); }
    else { entry.likedBy.push(myName); entry.likes = (entry.likes||0) + 1; }

    const isLiked = !alreadyLiked;
    btn.className = 'diary-like-btn' + (isLiked ? ' liked' : '');
    btn.querySelector('.like-heart').textContent = isLiked ? '❤️' : '🤍';
    btn.querySelector('.like-num').textContent = entry.likes > 0 ? entry.likes : '';

    wsSend({ msgType: 'diary_like', dateKey: key, entryId: entryId, name: myName, isLike: isLiked });
}

function receiveDiaryLike(data) {
    const entries = diaryStore[data.dateKey];
    if (!entries) return;
    const entry = entries.find(e => e.id === data.entryId);
    if (!entry) return;
    if (!entry.likedBy) entry.likedBy = [];
    if (data.isLike) { if (!entry.likedBy.includes(data.name)) entry.likedBy.push(data.name); }
    else { entry.likedBy = entry.likedBy.filter(n => n !== data.name); }
    entry.likes = entry.likedBy.length;

    if (diaryCurrentDateKey === data.dateKey && document.getElementById('diary-overlay').classList.contains('show')) {
        const entryEl = document.getElementById('diary-entry-' + data.entryId);
        if (entryEl) {
            const myName = chatNickname || localStorage.getItem('diary_author') || '';
            const isLiked = entry.likedBy.includes(myName);
            const likeBtn = entryEl.querySelector('.diary-like-btn');
            if (likeBtn) {
                likeBtn.className = 'diary-like-btn' + (isLiked ? ' liked' : '');
                likeBtn.querySelector('.like-heart').textContent = isLiked ? '❤️' : '🤍';
                likeBtn.querySelector('.like-num').textContent = entry.likes > 0 ? entry.likes : '';
            }
        }
    }
}

function updateDiaryCharCount(el) {
    const count = el.value.length;
    document.getElementById('diary-char-count').textContent = `${count} / 500`;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

function saveDiaryAuthor(val) { localStorage.setItem('diary_author', val.trim()); }

function handleDiaryImgSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (diaryPendingImgs.length + files.length > 10) { alert('最多只能上传 10 张图片哦~'); files.splice(10 - diaryPendingImgs.length); }

    let loadedCount = 0;
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 1000; let w = img.width, h = img.height;
                if (w > MAX || h > MAX) { if(w>h){h*=(MAX/w);w=MAX;}else{w*=(MAX/h);h=MAX;}}
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                diaryPendingImgs.push(canvas.toDataURL('image/jpeg', 0.82));
                loadedCount++;
                if (loadedCount === files.length) { renderDiaryImgPreview(); }
            };
            img.onerror = () => {
                loadedCount++;
                if (loadedCount === files.length) {
                    renderDiaryImgPreview();
                }
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

function renderDiaryImgPreview() {
    const container = document.getElementById('diary-img-preview');
    container.innerHTML = '';
    if (diaryPendingImgs.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    diaryPendingImgs.forEach((src, idx) => {
        const div = document.createElement('div');
        div.className = 'diary-preview-item';
        div.innerHTML = `<img src="${src}" alt="预览" onclick="openFull('${src}')"><button class="diary-img-remove" onclick="removeDiaryImg(${idx})">✕</button>`;
        container.appendChild(div);
    });
}

function removeDiaryImg(index) {
    if (index !== undefined) { diaryPendingImgs.splice(index, 1); } else { diaryPendingImgs = []; }
    renderDiaryImgPreview();
}

const diaryEmojiList = "😀,😂,🥰,😍,🤩,😘,😋,😎,🥳,😭,😱,🤔,🤗,😴,🥺,😤,🙄,💀,🔥,✨,💕,❤️,🌸,🌙,⭐,🎉,🎊,🍜,🍦,🎂,🍰,☕,🌈,🐱,🐰,🐶,🌷,🌻,💐,🎵,📷,✈️,🏖️,🌅,🌃,🎬,📚,🎮,🌿".split(',');
const diaryEmojiPicker = document.getElementById('diary-emoji-picker');
diaryEmojiList.forEach(em => {
    const s = document.createElement('span');
    s.style.cssText = 'cursor:pointer;font-size:18px;padding:3px;border-radius:6px;transition:0.15s;display:inline-block;';
    s.textContent = em;
    s.onmouseenter = () => s.style.background = 'rgba(255,105,180,0.1)';
    s.onmouseleave = () => s.style.background = '';
    s.onclick = () => { const ta = document.getElementById('diary-text-input'); ta.value += em; updateDiaryCharCount(ta); document.getElementById('diary-emoji-picker').style.display = 'none'; };
    diaryEmojiPicker.appendChild(s);
});
function toggleDiaryEmoji() { const p = document.getElementById('diary-emoji-picker'); p.style.display = p.style.display === 'grid' ? 'none' : 'grid'; }

document.addEventListener('click', (e) => {
    const ep = document.getElementById('diary-emoji-picker');
    if (ep && ep.style.display === 'grid' && !ep.contains(e.target) && !e.target.closest('.diary-tool-btn')) { ep.style.display = 'none'; }
});

