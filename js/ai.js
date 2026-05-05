/* ============================================================
   ai.js - Smart TuoTuo 全屏 AI 对话逻辑
============================================================ */

// ===================== 状态变量 =====================
let chatSessions = [];
let currentSessionId = null;
let currentGPTMode = 'chat'; // 'chat' | 'image'
let gptPendingFiles = [];
let gptIsSending = false;
let gptAbortController = null;

// ===================== localForage 配置 =====================
localforage.config({
    name: 'TuoTuoDimension',
    storeName: 'gpt_sessions_db'
});

// 异步预加载历史记录
localforage.getItem('tuotuo_gpt_sessions').then(data => {
    if (data && Array.isArray(data)) {
        chatSessions = data.map(s => ({
            pinned: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...s
        }));
    }
}).catch(err => console.error("读取历史记录失败:", err));

// ===================== 辅助函数 =====================
function getSortedSessions() {
    return [...chatSessions].sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
}

function getCurrentSession() {
    return chatSessions.find(s => s.id === currentSessionId);
}

let saveSessionsTimer = null;
function saveSessions() {
    clearTimeout(saveSessionsTimer);
    saveSessionsTimer = setTimeout(() => {
        localforage.setItem('tuotuo_gpt_sessions', chatSessions).catch(err => {
            console.error("IndexedDB 保存失败:", err);
            alert('聊天记录保存失败啦，可能是浏览器存储空间不足~');
        });
    }, 250);
}

// ===================== 界面控制 =====================
function toggleGPTSidebar() {
    const container = document.getElementById('gpt-fullscreen');
    if (container) container.classList.toggle('sidebar-collapsed');
}

function toggleAttachmentMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('gpt-attachment-menu');
    if (menu) menu.classList.toggle('show');
}

// 全局点击关闭附件菜单
document.addEventListener('click', (e) => {
    const attachMenu = document.getElementById('gpt-attachment-menu');
    if (attachMenu && !e.target.closest('#gpt-attachment-menu') && !e.target.closest('.gpt-attach-btn')) {
        attachMenu.classList.remove('show');
    }
});

// 切换到绘图模式
function switchToImageMode() {
    currentGPTMode = 'image';
    const input = document.getElementById('gpt-input-el');
    const chatMode = document.getElementById('gpt-menu-chat-mode');
    const title = document.getElementById('gpt-top-title');

    if (input) input.placeholder = '让全能画家 TuoTuo 来帮你实现愿望吧...';
    if (chatMode) chatMode.style.display = 'flex';
    if (title) title.innerHTML = 'TuoTuo <span style="font-size:12px;color:#FFB6C1;background:#FFF0F5;padding:2px 8px;border-radius:10px;margin-left:6px;font-weight:normal;">绘画模式</span>';

    clearGPTFile();
    const menu = document.getElementById('gpt-attachment-menu');
    if (menu) menu.classList.remove('show');
}

// 切换到聊天模式
function switchToChatMode() {
    currentGPTMode = 'chat';
    const input = document.getElementById('gpt-input-el');
    const chatMode = document.getElementById('gpt-menu-chat-mode');
    const title = document.getElementById('gpt-top-title');

    if (input) input.placeholder = '有什么想问 TuoTuo 的？';
    if (chatMode) chatMode.style.display = 'none';
    if (title) title.innerHTML = 'TuoTuo';
    if (menu = document.getElementById('gpt-attachment-menu')) menu.classList.remove('show');
}

// ===================== 打开 / 关闭全屏 AI =====================
async function toggleFullScreenGPT() {
    const win = document.getElementById('gpt-fullscreen');
    win.classList.toggle('show');

    if (win.classList.contains('show')) {
        // 手机端默认收起侧栏
        if (window.innerWidth <= 768) {
            win.classList.add('sidebar-collapsed');
        }

        // 再次确认数据已加载
        try {
            const data = await localforage.getItem('tuotuo_gpt_sessions');
            if (data && Array.isArray(data)) {
                chatSessions = data;
            }
        } catch (e) { }

        renderHistoryList();

        if (chatSessions.length === 0) {
            startNewGPTChat();
        } else if (!currentSessionId) {
            const first = getSortedSessions()[0];
            if (first) loadSession(first.id);
        } else {
            renderCurrentChat();
        }
    }
}

// ===================== 历史记录 =====================
function renderHistoryList() {
    const listEl = document.getElementById('gpt-history-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const sorted = getSortedSessions();
    sorted.forEach(session => {
        const item = document.createElement('div');
        item.className = `gpt-history-item ${session.id === currentSessionId ? 'active' : ''}`;
        item.onclick = () => loadSession(session.id);

        item.innerHTML = `
            <div class="gpt-history-title-text" title="${escapeHtml(session.title)}">
                ${session.pinned ? '<span class="gpt-pin-mark">📌</span>' : ''}
                ${escapeHtml(session.title)}
            </div>
            <button class="gpt-history-more" title="更多" onclick="toggleSessionMenu(event, '${session.id}')">⋯</button>
        `;
        listEl.appendChild(item);
    });
}

function closeAllSessionMenus() {
    document.querySelectorAll('.gpt-session-menu').forEach(menu => menu.remove());
}

function toggleSessionMenu(e, id) {
    e.stopPropagation();
    closeAllSessionMenus();

    const session = chatSessions.find(s => s.id === id);
    if (!session) return;

    const menu = document.createElement('div');
    menu.className = 'gpt-session-menu show';
    menu.innerHTML = `
        <button onclick="pinSession(event, '${id}')">${session.pinned ? '取消置顶' : '置顶'}</button>
        <button onclick="renameSession(event, '${id}')">重命名</button>
        <button class="danger" onclick="deleteSession(event, '${id}')">删除</button>
    `;
    document.body.appendChild(menu);

    const rect = e.currentTarget.getBoundingClientRect();
    menu.style.left = Math.min(rect.left - 92, window.innerWidth - 135) + 'px';
    menu.style.top = rect.bottom + 6 + 'px';
}

function pinSession(e, id) {
    e.stopPropagation();
    const session = chatSessions.find(s => s.id === id);
    if (!session) return;
    session.pinned = !session.pinned;
    session.updatedAt = Date.now();
    saveSessions();
    closeAllSessionMenus();
    renderHistoryList();
}

function renameSession(e, id) {
    e.stopPropagation();
    const session = chatSessions.find(s => s.id === id);
    if (!session) return;
    const newTitle = prompt('给这段聊天起个新名字吧~', session.title);
    if (newTitle === null) return;
    const title = newTitle.trim();
    if (!title) return;
    session.title = title.length > 30 ? title.slice(0, 30) + '...' : title;
    session.updatedAt = Date.now();
    saveSessions();
    closeAllSessionMenus();
    renderHistoryList();
}

function deleteSession(e, id) {
    if (e) e.stopPropagation();
    if (!confirm('确定要删除这段聊天吗？')) return;
    chatSessions = chatSessions.filter(s => s.id !== id);
    saveSessions();
    closeAllSessionMenus();

    if (currentSessionId === id) {
        if (chatSessions.length > 0) {
            loadSession(getSortedSessions()[0].id);
        } else {
            startNewGPTChat();
        }
    } else {
        renderHistoryList();
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.gpt-session-menu') && !e.target.closest('.gpt-history-more')) {
        closeAllSessionMenus();
    }
});

// ===================== 会话管理 =====================
function startNewGPTChat() {
    currentSessionId = 'session_' + Date.now();
    chatSessions.unshift({
        id: currentSessionId,
        title: '新聊天',
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
    });
    saveSessions();
    renderHistoryList();
    renderCurrentChat();
    clearGPTFile();
}

function loadSession(id) {
    currentSessionId = id;
    renderHistoryList();
    renderCurrentChat();
    clearGPTFile();
}

// ===================== 文件处理 =====================
function triggerFileUpload() {
    const uploadInput = document.getElementById('gpt-image-upload');
    if (!uploadInput) return;

    if (currentGPTMode === 'image') {
        uploadInput.accept = 'image/*';
    } else {
        uploadInput.accept = 'image/*,.txt,.doc,.docx,.xls,.xlsx,.csv';
    }
    uploadInput.click();

    const menu = document.getElementById('gpt-attachment-menu');
    if (menu) menu.classList.remove('show');
}

// 处理图片（聊天模式：压缩；绘图模式：裁剪为正方形）
async function processImageAsync(file, mode) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (mode === 'image') {
                    const size = 1024;
                    canvas.width = size;
                    canvas.height = size;
                    let sx = 0, sy = 0, sw = img.width, sh = img.height;
                    if (sw > sh) { sx = (sw - sh) / 2; sw = sh; }
                    else { sy = (sh - sw) / 2; sh = sw; }
                    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
                    const imageBase64 = canvas.toDataURL('image/png');
                    resolve({ image: imageBase64, mask: imageBase64 });
                } else {
                    let w = img.width, h = img.height;
                    if (w > 800 || h > 800) {
                        if (w > h) { h *= 800 / w; w = 800; }
                        else { w *= 800 / h; h = 800; }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve({ image: canvas.toDataURL('image/jpeg', 0.85) });
                }
            };
            img.onerror = reject;
            img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 处理文件选择
async function handleGPTFileSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    if (gptPendingFiles.length + files.length > 5) {
        alert('最多只能同时上传 5 个附件哦~');
        e.target.value = '';
        return;
    }

    for (const file of files) {
        const name = file.name;
        const ext = name.split('.').pop().toLowerCase();

        if (currentGPTMode === 'image' && !file.type.startsWith('image/')) {
            alert(`画图模式下只能识别图片哦~已为你跳过了不支持的文件：${name}`);
            continue;
        }

        try {
            if (file.type.startsWith('image/')) {
                const processed = await processImageAsync(file, currentGPTMode);
                if (currentGPTMode === 'image') {
                    gptPendingFiles.push({ type: 'image', data: processed.image, mask: processed.mask, name });
                } else {
                    gptPendingFiles.push({ type: 'image', data: processed.image, name });
                }
            } else if (ext === 'txt' || ext === 'csv') {
                const text = await file.text();
                gptPendingFiles.push({ type: 'document', data: text, name });
            } else if (ext === 'doc') {
                alert(`啊呀！TuoTuo 发现【${name}】是一个老版本的 Word (.doc) 文件！目前我只能看懂较新的 .docx 格式哦。请把它另存为 .docx 后再重新发给我吧~`);
                continue;
            } else if (ext === 'docx') {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                gptPendingFiles.push({ type: 'document', data: result.value, name });
            } else if (ext === 'xlsx' || ext === 'xls') {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                let extractedText = '';
                workbook.SheetNames.forEach(sheetName => {
                    extractedText += `\n--- 表格标签页: ${sheetName} ---\n`;
                    extractedText += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
                });
                gptPendingFiles.push({ type: 'document', data: extractedText, name });
            } else {
                alert(`文件 ${name} 格式不支持，建议上传图片、TXT、Word 或 Excel。`);
            }
        } catch (err) {
            console.error("文件解析失败", err);
            alert(`文件 ${name} 读取失败！`);
        }
    }

    renderGPTFilePreview();
    e.target.value = '';
}

// 渲染文件预览
function renderGPTFilePreview() {
    const previewWrap = document.getElementById('gpt-image-preview');
    if (!previewWrap) return;

    previewWrap.innerHTML = '';

    if (gptPendingFiles.length === 0) {
        previewWrap.style.display = 'none';
        autoResizeGPT(document.getElementById('gpt-input-el'));
        return;
    }

    previewWrap.style.display = 'flex';

    gptPendingFiles.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'gpt-preview-card';

        if (file.type === 'image') {
            card.innerHTML = `
                <img src="${file.data}" alt="预览">
                <button class="gpt-preview-remove" onclick="removeGPTFile(${index})" title="移除">×</button>
            `;
        } else {
            card.innerHTML = `
                <div class="file-icon-box">📄 <span>${escapeHtml(file.name)}</span></div>
                <button class="gpt-preview-remove" onclick="removeGPTFile(${index})" title="移除">×</button>
            `;
        }
        previewWrap.appendChild(card);
    });

    autoResizeGPT(document.getElementById('gpt-input-el'));
}

// 移除单个文件
function removeGPTFile(index) {
    gptPendingFiles.splice(index, 1);
    renderGPTFilePreview();
}

// 清空所有文件
function clearGPTFile() {
    gptPendingFiles = [];
    renderGPTFilePreview();
}

// ===================== 聊天消息渲染 =====================
function renderCurrentChat() {
    const chatArea = document.getElementById('gpt-chat-area');
    if (!chatArea) return;
    chatArea.innerHTML = '';

    const session = getCurrentSession();

    if (!session || session.messages.length === 0) {
        chatArea.innerHTML = `
            <div class="gpt-msg-container ai">
                <div class="gpt-avatar gpt-avatar-ai">
                    <img src="assets/images/ai-avatar.png" alt="AI" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.src='';this.alt='AI';this.style.background='transparent';">
                </div>
                <div class="gpt-content markdown-body">
                    你好呀~我是TuoTuo，一个基于目前世界上最强大的语言模型打造的全能AI小助手~想和我聊聊天吗？
                </div>
            </div>
        `;
    } else {
        session.messages.forEach(msg => {
            appendGPTMessageToDOM(msg, false);
        });
    }

    setTimeout(() => { chatArea.scrollTop = chatArea.scrollHeight; }, 50);
}

function appendGPTMessageToDOM(msg, shouldScroll = true) {
    const chatArea = document.getElementById('gpt-chat-area');
    if (!chatArea) return;

    if (msg.role === 'user') {
        let mediaHtml = msg.mediaHtml || '';

        if (!mediaHtml) {
            if (msg.image) mediaHtml += `<img src="${msg.image}" class="gpt-user-image" onclick="openFull('${msg.image}')">`;
            if (msg.fileName) mediaHtml += `<div class="gpt-user-file-card">📄 ${escapeHtml(msg.fileName)}</div>`;
        }

        chatArea.insertAdjacentHTML('beforeend', `
            <div class="gpt-msg-container user">
                <div class="gpt-content">${mediaHtml}${escapeHtml(msg.userText || msg.content || '')}</div>
            </div>
        `);

    } else if (msg.role === 'assistant') {
        chatArea.insertAdjacentHTML('beforeend', `
            <div class="gpt-msg-container ai">
                <div class="gpt-avatar gpt-avatar-ai">
                    <img src="assets/images/ai-avatar.png" alt="AI" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.src='';this.alt='AI';this.style.background='transparent';">
                </div>
                <div class="gpt-content markdown-body">${renderMarkdownSafe(msg.content || '')}</div>
            </div>
        `);
    }

    if (shouldScroll) {
        chatArea.scrollTop = chatArea.scrollHeight;
    }
}

// ===================== 输入框控制 =====================
function autoResizeGPT(el) {
    if (!el) return;

    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';

    const btn = document.getElementById('gpt-send-btn');
    if (!btn) return;

    const svgSend = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg>';
    const svgStop = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"/></svg>';

    if (gptIsSending) {
        btn.innerHTML = svgStop;
        btn.disabled = false;
        btn.style.opacity = '1';
    } else {
        btn.innerHTML = svgSend;
        if (el.value.trim().length > 0 || gptPendingFiles.length > 0) {
            btn.disabled = false;
            btn.style.opacity = '1';
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.6';
        }
    }
}

function handleGPTKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendGPTMessage();
    }
}

// ===================== 思考动画 =====================
function getThinkingSteps(text, files) {
    if (currentGPTMode === 'image') {
        return ['正在准备画笔和颜料 🎨', '正在构思唯美的画面 ✨', '正在为您渲染高质量图像 🖼️'];
    }

    const steps = [];
    if (files.length > 0) steps.push(`正在处理你上传的 ${files.length} 个文件`);
    steps.push('正在理解你的问题');
    steps.push('正在结合上下文进行分析');

    const maybeNeedSearch = /最新|今天|现在|实时|新闻|搜索|联网|查一下|资料|价格|天气|官网|当前/i.test(text || '');
    if (maybeNeedSearch) {
        steps.push('正在判断是否需要搜索网络');
        steps.push('正在搜索网络相关信息');
    }
    steps.push('正在组织清晰的回答');
    return steps;
}

// 彩虹重力光环动画（Canvas 版）
function startThinkingRing(avatarEl) {
    const DPR = window.devicePixelRatio || 1;
    const CSS_SIZE = 56;
    const SIZE = CSS_SIZE * DPR;
    const R = (18 + 2.5) * DPR;
    const LINE_W = 2.8 * DPR;

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.className = 'thinking-ring-canvas';
    canvas.style.width = CSS_SIZE + 'px';
    canvas.style.height = CSS_SIZE + 'px';
    avatarEl.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const cx = SIZE / 2, cy = SIZE / 2;

    let phase = 0;
    let angle = -Math.PI / 2;
    let loopCount = 0;
    let arcLen = 0.18;
    const arcLen0Start = 0.18;
    const arcLen0End = Math.PI * 1.2;
    const arcLen1 = Math.PI * 1.5;
    let rafId = null;
    let running = true;
    let transitPhase = -1;
    let transitProgress = 0;
    const TRANSIT_SPEED = 0.04;
    let renderArcLen = arcLen;
    let colorBlend = 0;
    let totalAngleTraveled = 0;

    function gravitySpeed(a) {
        const base = 0.028;
        const amp = 0.038;
        return base + amp * (1 + Math.sin(a)) * 0.5;
    }

    function lerpColor(c0, c1, t) {
        return [
            Math.round(c0[0] * (1 - t) + c1[0] * t),
            Math.round(c0[1] * (1 - t) + c1[1] * t),
            Math.round(c0[2] * (1 - t) + c1[2] * t),
        ];
    }

    function getColors(p0prog, blend) {
        const blue = [30, 120, 255];
        const green = [0, 200, 80];
        const red = [255, 50, 30];
        const yellow = [255, 210, 0];
        const t = Math.max(0, (p0prog - 0.5) * 2);
        const p0Head = blue;
        const p0Tail = lerpColor(blue, green, t);
        const p1Head = red;
        const p1Tail = yellow;
        const head = lerpColor(p0Head, p1Head, blend);
        const tail = lerpColor(p0Tail, p1Tail, blend);
        return { head, tail };
    }

    function draw() {
        if (!running) return;
        ctx.clearRect(0, 0, SIZE, SIZE);

        const speed = gravitySpeed(angle);

        if (transitPhase >= 0) {
            transitProgress += TRANSIT_SPEED;
            const targetLen = transitPhase === 1 ? arcLen1 : arcLen0Start;
            renderArcLen = arcLen * (1 - transitProgress) + targetLen * transitProgress;
            colorBlend = transitPhase === 1 ? transitProgress : 1 - transitProgress;

            if (transitProgress >= 1) {
                phase = transitPhase;
                transitPhase = -1;
                transitProgress = 0;
                arcLen = phase === 1 ? arcLen1 : arcLen0Start;
                renderArcLen = arcLen;
                colorBlend = phase === 1 ? 1 : 0;
                totalAngleTraveled = 0;
                loopCount = 0;
            }
        } else if (phase === 0) {
            angle += speed;
            totalAngleTraveled += speed;

            if (totalAngleTraveled >= Math.PI * 2 * (loopCount + 1)) loopCount++;
            const phase0Progress = Math.min(totalAngleTraveled / (Math.PI * 4), 1);
            arcLen = arcLen0Start + (arcLen0End - arcLen0Start) * phase0Progress;
            renderArcLen = arcLen;
            colorBlend = 0;

            if (loopCount >= 2) {
                transitPhase = 1;
                transitProgress = 0;
            }
        } else {
            angle += speed;
            totalAngleTraveled += speed;
            renderArcLen = arcLen1;
            colorBlend = 1;

            if (totalAngleTraveled >= Math.PI * 2) {
                transitPhase = 0;
                transitProgress = 0;
            }
        }

        if (transitPhase >= 0) angle += speed;

        const headA = angle;
        const tailA = angle - renderArcLen;
        const { head, tail } = getColors(0, colorBlend);

        ctx.beginPath();
        ctx.arc(cx, cy, R, tailA, headA, false);
        ctx.lineWidth = LINE_W;
        ctx.lineCap = 'butt';

        const grad = ctx.createLinearGradient(
            cx + R * Math.cos(tailA), cy + R * Math.sin(tailA),
            cx + R * Math.cos(headA), cy + R * Math.sin(headA)
        );
        grad.addColorStop(0, `rgb(${tail[0]},${tail[1]},${tail[2]})`);
        grad.addColorStop(1, `rgb(${head[0]},${head[1]},${head[2]})`);
        ctx.strokeStyle = grad;
        ctx.stroke();

        rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);

    return function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
    };
}

// 创建思考中消息
function createThinkingMessage(text, files) {
    const chatArea = document.getElementById('gpt-chat-area');
    if (!chatArea) return;
    const id = 'gpt_thinking_' + Date.now();
    const steps = getThinkingSteps(text, files);
    let index = 0;
    const titleText = currentGPTMode === 'image' ? 'TuoTuo正在竭力创作中' : 'TuoTuo正在努力思考ing';

    chatArea.insertAdjacentHTML('beforeend', `
        <div class="gpt-msg-container ai" id="${id}">
            <div class="gpt-avatar gpt-avatar-ai thinking-mode">
                <img src="assets/images/ai-avatar.png" alt="AI" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.src='';this.alt='AI';this.style.background='transparent';">
            </div>
            <div class="gpt-content gpt-thinking-content">
                <div class="gpt-thinking-title">
                    ${titleText}<span class="gpt-thinking-dot"></span>
                </div>
                <div class="gpt-thinking-detail">${escapeHtml(steps[index])}</div>
            </div>
        </div>
    `);

    chatArea.scrollTop = chatArea.scrollHeight;

    const el = document.getElementById(id);
    const avatarEl = el ? el.querySelector('.gpt-avatar-ai') : null;
    const stopRing = avatarEl ? startThinkingRing(avatarEl) : () => { };

    const timer = setInterval(() => {
        if (index < steps.length - 1) {
            index++;
            if (el) {
                const detailEl = el.querySelector('.gpt-thinking-detail');
                if (detailEl) detailEl.textContent = steps[index];
            }
        }
    }, 1600);

    return {
        id,
        el,
        avatarEl,
        contentBox: el ? el.querySelector('.gpt-content') : null,
        detailEl: el ? el.querySelector('.gpt-thinking-detail') : null,
        stop() { clearInterval(timer); stopRing(); }
    };
}

// 准备 AI 输出区域
function prepareAssistantOutput(thinkingObj) {
    thinkingObj.stop();
    if (thinkingObj.avatarEl) {
        thinkingObj.avatarEl.classList.remove('thinking-mode');
    }
    const contentBox = thinkingObj.contentBox;
    if (contentBox) {
        contentBox.className = 'gpt-content markdown-body';
        contentBox.innerHTML = '';
    }
    return contentBox;
}

// 打字机效果渲染 Markdown
async function typewriterMarkdown(targetEl, fullText) {
    const chars = Array.from(fullText || '');
    let current = '';
    for (let i = 0; i < chars.length; i++) {
        current += chars[i];
        if (i % 3 === 0 || i === chars.length - 1) {
            targetEl.innerHTML = renderMarkdownSafe(current);
            const chatArea = document.getElementById('gpt-chat-area');
            if (chatArea) {
                const isScrolledUp = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight > 15;
                if (!isScrolledUp) chatArea.scrollTop = chatArea.scrollHeight;
            }
        }
        const delay = chars[i] === '\n' ? 16 : 8;
        await sleep(delay);
    }
    if (targetEl) targetEl.innerHTML = renderMarkdownSafe(fullText || '');
}

// ===================== 流式消息处理 =====================
async function consumeGPTStream(response, thinkingObj, streamState) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const contentType = response.headers.get('content-type') || '';
    const isSSE = contentType.includes('text/event-stream');

    let buffer = '';
    let lastRender = 0;
    const chatArea = document.getElementById('gpt-chat-area');

    function render(force = false) {
        const now = Date.now();
        if (!force && now - lastRender < 60) return;

        if (!streamState.outputEl) {
            streamState.outputEl = prepareAssistantOutput(thinkingObj);
        }

        if (streamState.outputEl) {
            streamState.outputEl.innerHTML = renderMarkdownSafe(streamState.fullText);
        }

        if (chatArea) {
            const isScrolledUp = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight > 15;
            if (!isScrolledUp || force) {
                chatArea.scrollTop = chatArea.scrollHeight;
            }
        }

        lastRender = now;
    }

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (isSSE) {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;

                if (!payload || payload === '[DONE]') continue;

                try {
                    const obj = JSON.parse(payload);
                    if (obj.status && thinkingObj.detailEl) {
                        thinkingObj.detailEl.textContent = obj.status;
                    }
                    if (obj.tool === 'search' && thinkingObj.detailEl) {
                        thinkingObj.detailEl.textContent = '正在搜索网络';
                    }
                    if (obj.delta) {
                        streamState.fullText += obj.delta;
                        render();
                    } else if (obj.reply) {
                        streamState.fullText += obj.reply;
                        render();
                    } else if (obj.content) {
                        streamState.fullText += obj.content;
                        render();
                    }
                } catch {
                    streamState.fullText += payload;
                    render();
                }
            }
        } else {
            streamState.fullText += chunk;
            render();
        }
    }

    render(true);
    return streamState.fullText;
}

// ===================== 发送消息 =====================
async function sendGPTMessage() {
    const inputEl = document.getElementById('gpt-input-el');
    if (gptIsSending) {
        if (gptAbortController) gptAbortController.abort();
        return;
    }
    const text = inputEl ? inputEl.value.trim() : '';
    if ((!text && gptPendingFiles.length === 0) || !currentSessionId) return;

    const session = getCurrentSession();
    if (!session) return;
    const filesSnapshot = [...gptPendingFiles];

    if (session.messages.length === 0) {
        let titleText = text || (filesSnapshot.length ? `上传了 ${filesSnapshot.length} 个附件` : '新聊天');
        session.title = titleText.length > 12 ? titleText.substring(0, 12) + '...' : titleText;
    }

    let imagesToSend = [];
    let docsText = "";
    let mediaHtml = "";

    filesSnapshot.forEach(f => {
        if (f.type === 'image') {
            if (currentGPTMode === 'image') {
                imagesToSend.push({ image: f.data, mask: f.mask });
            } else {
                imagesToSend.push(f.data);
            }
            mediaHtml += `<img src="${f.data}" class="gpt-user-image" onclick="openFull('${f.data}')">`;
        } else if (f.type === 'document') {
            docsText += `\n\n【用户上传了附件：${f.name}】\n内容如下：\n${f.data}`;
            mediaHtml += `<div class="gpt-user-file-card">📄 ${escapeHtml(f.name)}</div>`;
        }
    });

    let textToSendToBackend = text + docsText;
    session.messages.push({ role: 'user', content: textToSendToBackend, userText: text, mediaHtml });
    session.updatedAt = Date.now();
    saveSessions();
    renderHistoryList();

    if (inputEl) { inputEl.value = ''; }
    clearGPTFile();
    renderCurrentChat();

    const thinkingObj = createThinkingMessage(textToSendToBackend, filesSnapshot);
    gptIsSending = true;
    gptAbortController = new AbortController();
    if (inputEl) autoResizeGPT(inputEl);

    let finalReply = '';
    const streamState = { outputEl: null, fullText: '' };

    try {
        if (currentGPTMode === 'image') {
            const response = await fetch(AI_CONFIG.imageApi, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: gptAbortController.signal,
                body: JSON.stringify({ prompt: textToSendToBackend, images: imagesToSend })
            });
            if (!response.ok) throw new Error((await response.json()).error || '画图请求失败');
            const data = await response.json();

            const outputEl = prepareAssistantOutput(thinkingObj);
            const imgHtml = `<img src="${data.url}" class="message-image" onclick="openFull(this.src)" style="max-width: 300px; max-height: 300px; object-fit: contain; border-radius: 12px; margin-bottom: 10px; cursor: zoom-in; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">`;
            const promptHtml = renderMarkdownSafe(`*💡 **优化提示词:** ${data.revised_prompt || ''}*`);

            if (outputEl) outputEl.innerHTML = imgHtml + promptHtml;
            const chatArea = document.getElementById('gpt-chat-area');
            if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;

            finalReply = `![TuoTuo为你绘制的画作](${data.url})\n\n*💡 提示词: ${data.revised_prompt}*`;

        } else {
            const response = await fetch(AI_CONFIG.chatApi, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: gptAbortController.signal,
                body: JSON.stringify({ message: textToSendToBackend, sessionId: currentSessionId, images: imagesToSend, stream: true })
            });
            if (!response.ok) throw new Error(await response.text() || '网络请求失败');

            if ((response.headers.get('content-type') || '').includes('application/json')) {
                const outputEl = prepareAssistantOutput(thinkingObj);
                finalReply = (await response.json()).reply || '';
                await typewriterMarkdown(outputEl, finalReply);
            } else {
                finalReply = await consumeGPTStream(response, thinkingObj, streamState);
            }
        }
    } catch (err) {
        thinkingObj.stop();
        if (err.name === 'AbortError') {
            const outputEl = streamState.outputEl || prepareAssistantOutput(thinkingObj);
            finalReply = (streamState.fullText || (outputEl ? outputEl.innerText : '')) + "\n\n*[已停止生成]*";
            if (outputEl) outputEl.innerHTML = renderMarkdownSafe(finalReply);
        } else {
            if (thinkingObj.el) thinkingObj.el.remove();
            const chatArea = document.getElementById('gpt-chat-area');
            if (chatArea) {
                chatArea.insertAdjacentHTML('beforeend', `<div class="gpt-msg-container ai"><div class="gpt-avatar" style="color:#ff4d4f;background:#ffe4e6;">⚠️</div><div class="gpt-content" style="color:#ff4d4f;"><b>任务失败啦：</b><br>${escapeHtml(err.message)}</div></div>`);
                chatArea.scrollTop = chatArea.scrollHeight;
            }
        }
    } finally {
        gptIsSending = false;
        if (inputEl) autoResizeGPT(inputEl);
        if (finalReply) {
            session.messages.push({ role: 'assistant', content: finalReply });
            session.updatedAt = Date.now();
            saveSessions();
            renderHistoryList();
        }
    }
}

// ===================== 初始化 =====================
function initAI() {
    // AI 模块初始化（localForage 配置已在模块顶部执行）
}
