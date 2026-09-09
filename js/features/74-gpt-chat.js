/* GPT chat, files, extraction, streaming and message rendering
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
let gptPendingFiles = [];
let gptIsSending = false;
let gptAbortController = null;
let gptActiveMessage = null;

function getCurrentSession() {
    return getSessionById(currentSessionId);
}

function buildGPTContextMessages(session, excludeLastCount = 0) {
    if (!session || !Array.isArray(session.messages)) return [];

    const end = Math.max(0, session.messages.length - excludeLastCount);
    return session.messages
        .slice(0, end)
        .filter(msg => msg && (msg.role === 'user' || msg.role === 'assistant'))
        .slice(-60)
        .map(msg => {
            const generatedFiles = normalizeGeneratedFiles(msg.generatedFiles || msg.files || []);
            const fileContext = generatedFiles.length
                ? '\n\n【这条回复生成的文件】\n' + generatedFiles
                    .map(file => `- ${file.filename || '未命名文件'}`)
                    .join('\n')
                : '';
            return {
                id: msg.id || msg.messageId || '',
                role: msg.role,
                content: `${String(msg.content || msg.userText || '').trim()}${fileContext}`.slice(0, 24000),
                createdAt: msg.createdAt || 0
            };
        })
        .filter(msg => msg.content);
}

function collectGPTSessionFiles(session, maxFiles = 80) {
    if (!session || !Array.isArray(session.messages)) return [];
    const found = normalizeGeneratedFiles(session.fileRefs || []);
    const seen = new Set();

    session.messages.forEach((msg, messageIndex) => {
        const files = mergeGeneratedFiles(
            normalizeGeneratedFiles(msg.generatedFiles || msg.files || []),
            normalizeGeneratedFiles(msg.sessionFiles || [])
        );
        files.forEach(file => {
            const key = file.url || `${file.downloadId || ''}:${file.filename || ''}`;
            if (!key || seen.has(key)) return;
            seen.add(key);
            found.push({
                filename: file.filename || 'agent-output',
                url: file.url || '',
                downloadId: file.downloadId || '',
                type: file.type || 'file',
                messageIndex
            });
        });
    });

    return normalizeGeneratedFiles(found).slice(-maxFiles);
}

async function toggleFullScreenGPT() {
    const win = document.getElementById('gpt-fullscreen');
    const willShow = !win.classList.contains('show');
    win.classList.toggle('show', willShow);

    if (typeof window.setHomeRenderingPaused === 'function') {
        window.setHomeRenderingPaused(willShow);
    } else {
        document.body.classList.toggle('home-rendering-paused', willShow);
        document.dispatchEvent(new CustomEvent(willShow ? 'tuotuo:home-rendering-paused' : 'tuotuo:home-rendering-resumed'));
    }

    if (willShow) {
        if (window.innerWidth <= 768) {
            win.classList.add('sidebar-collapsed');
        }

        if (typeof ensureGPTSessionsLoaded === 'function') {
            await ensureGPTSessionsLoaded();
        }

        renderHistoryList();

        if (chatSessions.length === 0) {
            startNewGPTChat();
        } else if (!currentSessionId) {
            const first = getOrderedSessions()[0];
            loadSession(first.id);
        } else {
            renderCurrentChat();
        }
    }
}

function renderHistoryList() {
    const listEl = document.getElementById('gpt-history-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    const query = (document.getElementById('gpt-history-search')?.value || '').trim().toLowerCase();
    const sorted = getOrderedSessions().filter(session => {
        if (!query) return true;

        const title = String(session.title || '').toLowerCase();
        const content = (session.messages || [])
            .map(msg => `${msg.userText || ''} ${msg.content || ''}`)
            .join(' ')
            .toLowerCase();

        return title.includes(query) || content.includes(query);
    });

    if (sorted.length === 0) {
        listEl.innerHTML = '<div style="padding:12px;color:#8a7180;font-size:13px;">没有找到相关聊天</div>';
        return;
    }

    sorted.forEach(session => {
        const node = document.createElement('div');
        node.className = `gpt-history-node ${session.parentSessionId ? 'branch-child' : 'branch-root'}`;
        node.style.setProperty('--branch-depth', String(session.branchDepth || 0));

        const item = document.createElement('div');
        item.className = `gpt-history-item ${session.id === currentSessionId ? 'active' : ''}`;
        item.onclick = () => loadSession(session.id);

        const safeId = escapeAttr(session.id);
        item.innerHTML = `
            <div class="gpt-history-title-text" title="${escapeAttr(session.title)}">
                ${session.pinned ? '<span class="gpt-pin-mark">📌</span>' : ''}
                ${escapeHtml(session.title)}
            </div>
            <button class="gpt-history-more" title="更多" onclick="toggleSessionMenu(event, '${safeId}')">⋯</button>
        `;

        node.appendChild(item);
        listEl.appendChild(node);
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
    const newTitle = prompt('给这段聊天起个新名字吧～', session.title);
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
    const descendantIds = getDescendantSessionIds(id);
    const deleteCount = descendantIds.length + 1;
    const confirmText = deleteCount > 1
        ? `确定要删除这段聊天以及它的 ${descendantIds.length} 个分叉子聊天吗？`
        : '确定要删除这段聊天吗？';
    if (!confirm(confirmText)) return;
    const blockedIds = new Set([id, ...descendantIds]);
    chatSessions = chatSessions.filter(s => !blockedIds.has(s.id));
    deleteGPTSessionsFromServer([...blockedIds]);
    saveSessions();
    closeAllSessionMenus();
    if (blockedIds.has(currentSessionId)) {
        if (chatSessions.length > 0) {
            loadSession(getOrderedSessions()[0].id);
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

async function startNewGPTChat() {
    if (typeof ensureGPTSessionsLoaded === 'function' && !gptSessionsLoaded) {
        await ensureGPTSessionsLoaded();
    }

    const session = createSessionRecord();
    currentSessionId = session.id;
    chatSessions.unshift(session);
    saveSessions();
    renderHistoryList();
    renderCurrentChat();
    clearGPTFile();
}

function loadSession(id) {
    if (!getSessionById(id)) return;
    currentSessionId = id;
    renderHistoryList();
    renderCurrentChat();
    clearGPTFile();
}

let saveSessionsTimer = null;
function persistSessionsToBrowser() {
    repairSessionTree();
    const compact = chatSessions.map(session => ({
        ...session,
        messages: (session.messages || []).map(message => ({
            ...message,
            mediaHtml: String(message.mediaHtml || '').replace(/<img\b[^>]*src=["']data:[^"']+["'][^>]*>/gi, '<div class="gpt-user-file-card">🖼️ 已上传图片</div>')
        }))
    }));
    localStorage.setItem(GPT_LOCAL_SESSIONS_KEY, JSON.stringify(compact));
}

function saveSessions() {
    if (typeof ensureGPTSessionsLoaded === 'function' && !gptSessionsLoaded) {
        ensureGPTSessionsLoaded().then(saveSessions);
        return;
    }

    clearTimeout(saveSessionsTimer);
    saveSessionsTimer = setTimeout(() => {
        try {
            persistSessionsToBrowser();
        } catch (err) {
            console.error('保存本地 AI 历史失败:', err);
            showGPTTransientStatus('浏览器历史缓存已满，正在尝试保存到云端，请勿清除网站数据。');
        }
        // A localStorage quota error must not prevent durable cloud saving.
        syncChangedGPTSessions();
    }, 1000); // 稍微防抖，避免高频发请求
}

window.addEventListener('pagehide', () => {
    if (!gptSessionsLoaded || chatSessions.length === 0) return;
    clearTimeout(saveSessionsTimer);
    try { persistSessionsToBrowser(); } catch {}
});

function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function loadImageFromDataURL(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });
}

async function processImageAsync(file, mode) {
    const dataUrl = await fileToDataURL(file);
    const img = await loadImageFromDataURL(dataUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });

    if (mode === 'image') {
        const maxSide = 1024;
        let w = img.width;
        let h = img.height;
        if (w > maxSide || h > maxSide) {
            if (w > h) { h = Math.round(h * maxSide / w); w = maxSide; }
            else { w = Math.round(w * maxSide / h); h = maxSide; }
        }
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return { image: canvas.toDataURL('image/jpeg', 0.86), width: w, height: h };
    }

    const maxSide = 1568;
    let w = img.width;
    let h = img.height;
    if (w > maxSide || h > maxSide) {
        if (w > h) { h = Math.round(h * maxSide / w); w = maxSide; }
        else { w = Math.round(w * maxSide / h); h = maxSide; }
    }
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    return { image: canvas.toDataURL('image/jpeg', 0.82) };
}

function showGPTTransientStatus(message) {
    const previewWrap = document.getElementById('gpt-image-preview');
    if (!previewWrap) return;
    const pill = document.createElement('div');
    pill.className = 'gpt-status-pill';
    pill.textContent = message;
    previewWrap.style.display = 'flex';
    previewWrap.appendChild(pill);
    setTimeout(() => {
        if (pill.parentElement) pill.remove();
        if (gptPendingFiles.length === 0) renderGPTFilePreview();
    }, 2200);
}

const GPT_TEXT_FILE_EXTS = new Set([
    'txt','md','markdown','csv','tsv','json','jsonl','html','htm','css','js','mjs','cjs','ts','tsx','jsx','xml','yaml','yml',
    'py','java','c','cpp','h','hpp','cs','go','rs','php','rb','swift','kt','sql','sh','bash','zsh','bat','ps1','ini','toml','log','env','gitignore'
]);

function normalizeExtractedDocumentText(text, name, maxChars = 180000) {
    const body = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!body) throw new Error('没有读取到可分析的文本内容');
    return `【文件名：${name}】\n${body}`.slice(0, maxChars);
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

function removeSandboxDownloadLinks(text) {
    return String(text || '')
        .replace(/\[([^\]]+)\]\(sandbox:[^)]+\)/gi, '$1')
        .replace(/sandbox:\/?\/?[^\s)]+/gi, '');
}

function shouldSendAsRawInputFile(file, ext) {
    // Preserve original bytes. The server handles Azure's extension allowlist;
    // browser text extraction loses formatting and rejects archives/binary files.
    return true;
}

const GPT_CHAT_FILE_LIMIT = 200 * 1024 * 1024;
const GPT_CHAT_TOTAL_LIMIT = 500 * 1024 * 1024;

function isGPTVisualImage(file) {
    return /^(image\/(png|jpeg|webp|gif))$/i.test(file.type || '')
        || /\.(png|jpe?g|webp|gif)$/i.test(file.name || '');
}

async function extractPdfText(file) {
    if (!window.pdfjsLib) throw new Error('PDF 解析库尚未加载，请稍后重试');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    const maxPages = Math.min(pdf.numPages, 30);
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(`--- PDF 第 ${i} 页 ---\n` + content.items.map(item => item.str || '').join(' '));
    }
    if (pdf.numPages > maxPages) pages.push(`\n[提示：PDF 共 ${pdf.numPages} 页，已读取前 ${maxPages} 页。]`);
    return pages.join('\n\n');
}

async function extractPptxText(file) {
    if (!window.JSZip) throw new Error('PPTX 解析库尚未加载，请稍后重试');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slideFiles = Object.keys(zip.files)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] || 0));
    const slides = [];
    for (const slideName of slideFiles.slice(0, 80)) {
        const xml = await zip.files[slideName].async('text');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const texts = Array.from(doc.getElementsByTagName('a:t')).map(n => n.textContent || '').filter(Boolean);
        if (texts.length) slides.push(`--- ${slideName.replace('ppt/slides/', '')} ---\n${texts.join('\n')}`);
    }
    return slides.join('\n\n');
}

async function extractDocumentTextFromFile(file, ext, name) {
    if (GPT_TEXT_FILE_EXTS.has(ext) || file.type.startsWith('text/')) {
        return normalizeExtractedDocumentText(await file.text(), name);
    }

    if (ext === 'docx') {
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        return normalizeExtractedDocumentText(result.value || '', name);
    }

    if (ext === 'xlsx' || ext === 'xls') {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        let extractedText = '';
        workbook.SheetNames.forEach(sheetName => {
            extractedText += `\n--- 表格标签页: ${sheetName} ---\n`;
            extractedText += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        });
        return normalizeExtractedDocumentText(extractedText, name);
    }

    if (ext === 'pdf') return normalizeExtractedDocumentText(await extractPdfText(file), name);
    if (ext === 'pptx') return normalizeExtractedDocumentText(await extractPptxText(file), name);

    if (ext === 'doc') {
        throw new Error('老版 Word .doc 是二进制格式，浏览器里无法稳定解析。请另存为 .docx 或 PDF 后上传。');
    }

    throw new Error('暂时无法解析这个文件格式。建议转成 TXT、PDF、DOCX、XLSX、PPTX、HTML 或代码文本文件。');
}

async function handleGPTFileSelect(e) {
    const files = Array.from(e.target?.files || e.dataTransfer?.files || []);
    if (!files.length) return;

    const maxAttachments = currentGPTMode === 'image' ? 5 : 10;
    const remainingSlots = maxAttachments - gptPendingFiles.length;
    if (remainingSlots <= 0) {
        alert(`最多只能同时上传 ${maxAttachments} 个附件哦～`);
        if (e.target?.type === 'file') e.target.value = '';
        return;
    }

    const selectedFiles = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) showGPTTransientStatus(`已自动保留前 ${remainingSlots} 个附件`);
    let pendingBytes = gptPendingFiles.reduce((sum, pending) => sum + Number(pending.size || 0), 0);

    for (const file of selectedFiles) {
        const name = file.name || '未命名文件';
        const ext = (name.split('.').pop() || '').toLowerCase();

        if (currentGPTMode === 'image' && !file.type.startsWith('image/')) {
            alert(`画图模式下只能添加图片作为参考哦～已跳过：${name}`);
            continue;
        }

        const fileLimit = currentGPTMode === 'image' ? 10 * 1024 * 1024 : GPT_CHAT_FILE_LIMIT;
        if (file.size > fileLimit) {
            alert(`文件 ${name} 太大啦，单个文件最多 ${fileLimit / 1024 / 1024}MB。`);
            continue;
        }
        if (currentGPTMode !== 'image' && pendingBytes + file.size > GPT_CHAT_TOTAL_LIMIT) {
            alert('本轮聊天附件合计不能超过 500MB。');
            continue;
        }

        try {
            if (currentGPTMode === 'image' || (isGPTVisualImage(file) && file.size <= 20 * 1024 * 1024)) {
                showGPTTransientStatus(`正在处理图片：${name}`);
                const processed = await processImageAsync(file, currentGPTMode);
                gptPendingFiles.push({ type: 'image', data: processed.image, mask: processed.mask || null, width: processed.width || null, height: processed.height || null, size: file.size || 0, name });
            } else {
                if (shouldSendAsRawInputFile(file, ext)) {
                    showGPTTransientStatus(`已选择文件：${name}，发送时分块上传`);
                    gptPendingFiles.push({
                        type: 'document',
                        rawFile: file,
                        mimeType: file.type || 'application/octet-stream',
                        size: file.size || 0,
                        name
                    });
                } else {
                    showGPTTransientStatus(`正在解析文件：${name}`);
                    const extractedText = await extractDocumentTextFromFile(file, ext, name);
                    gptPendingFiles.push({
                        type: 'document',
                        data: extractedText,
                        content: extractedText,
                        mimeType: file.type || 'text/plain',
                        size: file.size || 0,
                        name
                    });
                }
            }
            pendingBytes += file.size;
        } catch (err) {
            console.error('文件解析失败', err);
            alert(`文件 ${name} 读取失败：${err.message || '未知错误'}`);
        }
    }

    renderGPTFilePreview();
    // When a file is dragged onto the textarea, event.target is the textarea.
    // Only reset the hidden file picker; never clear the user's in-progress draft.
    if (e.target?.type === 'file') e.target.value = '';
}


function normalizeGeneratedFiles(files) {
    const seen = new Set();
    return (Array.isArray(files) ? files : [])
        .map(file => {
            if (!file) return null;
            let url = String(file.url || file.downloadUrl || '').trim();
            const filename = String(file.filename || file.name || file.fileName || 'agent-output').trim();
            const downloadId = String(file.downloadId || '').trim();
            const storageId = String(file.storageId || file.fileId || '').trim();
            if (!url && downloadId) url = `${TUOTUO_API_BASE}/api/ai-agent-file/${encodeURIComponent(downloadId)}`;
            if (/sandbox:/i.test(url)) {
                url = '';
            }
            if (url.startsWith('/api/')) {
                url = `${TUOTUO_API_BASE}${url}`;
            }
            const safeDownloadUrl = /^https?:\/\/[^/]+\/api\/ai-agent-file\/[^/?#]+(?:\?[^#]*)?$/i.test(url);
            if (!safeDownloadUrl) url = '';
            const key = storageId || downloadId || url || filename;
            if (!key || seen.has(key)) return null;
            seen.add(key);
            return { url, filename, downloadId, storageId, type: file.type || 'file', persistent: file.persistent === true };
        })
        .filter(file => file && file.url);
}

function mergeGeneratedFiles(existing, incoming) {
    return normalizeGeneratedFiles([...(existing || []), ...(incoming || [])]);
}

function renderGeneratedFilesHtml(files) {
    const normalized = normalizeGeneratedFiles(files);
    if (!normalized.length) return '';
    const items = normalized.map(file => {
        const label = escapeHtml(file.filename || '下载文件');
        const href = escapeAttr(file.url || '#');
        const safeFilename = escapeAttr(file.filename || 'agent-output');
        const disabledClass = file.url ? '' : ' is-disabled';
        const disabledAttrs = file.url
            ? ` data-download-url="${href}" data-download-name="${safeFilename}" onclick="downloadGeneratedFile(event, this.dataset.downloadUrl, this.dataset.downloadName)"`
            : ' aria-disabled="true" onclick="event.preventDefault()"';
        const title = file.url ? '下载文件' : '文件安全访问已过期，请重新生成一次文件';
        return `<a class="gpt-generated-file-card${disabledClass}" href="${href}" download title="${escapeAttr(title)}"${disabledAttrs}>📎 <span>${label}</span></a>`;
    }).join('');
    return `<div class="gpt-generated-files"><div class="gpt-generated-files-title">生成的文件</div>${items}</div>`;
}

async function downloadGeneratedFile(event, url, filename) {
    event.preventDefault();
    try {
        const base = String(TUOTUO_API_BASE || '').replace(/\/+$/, '');
        const path = String(url || '').startsWith(base) ? String(url).slice(base.length) : String(url || '');
        if (!path.startsWith('/api/ai-agent-file/')) throw new Error('无效的文件下载地址。');
        const response = await tuoApiFetch(path);
        if (!response.ok) throw new Error(await getErrorMessageFromResponse(response, '下载文件失败'));
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename || 'agent-output';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
        alert(`文件下载失败：${error.message || '未知错误'}`);
    }
}

function renderAssistantMessageHtml(text, sources = [], files = []) {
    return renderMarkdownSafe(removeSandboxDownloadLinks(text || ''), sources || []) + renderGeneratedFilesHtml(files || []);
}

function renderGPTFilePreview() {
    const previewWrap = document.getElementById('gpt-image-preview');
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

function removeGPTFile(index) {
    gptPendingFiles.splice(index, 1);
    renderGPTFilePreview();
}

function clearGPTFile() {
    gptPendingFiles = [];
    renderGPTFilePreview();
}

function renderCurrentChat() {
    const chatArea = document.getElementById('gpt-chat-area');
    const shell = document.getElementById('gpt-fullscreen');
    if (!chatArea) return;

    chatArea.innerHTML = '';

    const session = getCurrentSession();
    const isEmpty = !session || session.messages.length === 0;
    if (shell) shell.classList.toggle('gpt-empty', isEmpty);

    if (isEmpty) {
        chatArea.innerHTML = `
            <div class="gpt-empty-hero">
                <div class="gpt-empty-title">${escapeHtml(getTuoTimeGreeting())}</div>
            </div>
        `;
    } else {
        session.messages.forEach((msg, index) => {
            appendGPTMessageToDOM(msg, false, session, index);
        });
    }

    // Reattach the same live node when returning to an in-flight conversation.
    if (gptActiveMessage && gptActiveMessage.sessionId === currentSessionId) {
        chatArea.appendChild(gptActiveMessage.el);
    }
    setTimeout(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
    }, 50);
}

function buildAssistantActionButton(action, label, sessionId, messageIndex) {
    const safeSessionId = escapeAttr(sessionId);
    const icon = action === 'copy'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h9v11H9z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7v10a2 2 0 0 0 2 2h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 7h7a3 3 0 0 1 3 3v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 7L4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    const handler = action === 'copy' ? 'copyAssistantMessage' : 'branchSessionFromReply';
    return `
        <button class="gpt-msg-action-btn" type="button" onclick="${handler}(event, '${safeSessionId}', ${messageIndex})" aria-label="${label}" data-tip="${label}">
            ${icon}
            <span class="gpt-msg-action-tip">${label}</span>
        </button>
    `;
}

function attachAssistantActionsToLiveMessage(thinkingObj, session, messageIndex) {
    if (!thinkingObj || !thinkingObj.el || !session || messageIndex < 0) return;
    const shell = thinkingObj.el.querySelector('.gpt-ai-message-shell') || thinkingObj.el;
    if (!shell || shell.querySelector('.gpt-msg-actions')) return;
    shell.insertAdjacentHTML('beforeend', `
        <div class="gpt-msg-actions">
            ${buildAssistantActionButton('copy', '复制', session.id, messageIndex)}
            ${buildAssistantActionButton('branch', '分叉', session.id, messageIndex)}
        </div>
    `);
}

function appendGPTMessageToDOM(msg, shouldScroll = true, session = null, messageIndex = -1) {
    const chatArea = document.getElementById('gpt-chat-area');

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
        const actionsHtml = session && messageIndex >= 0 ? `
            <div class="gpt-msg-actions">
                ${buildAssistantActionButton('copy', '复制', session.id, messageIndex)}
                ${buildAssistantActionButton('branch', '分叉', session.id, messageIndex)}
            </div>
        ` : '';
        chatArea.insertAdjacentHTML('beforeend', `
            <div class="gpt-msg-container ai">
                <div class="gpt-avatar gpt-avatar-ai">
                    <img src="ai-avatar.png" alt="AI" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.src='';this.alt='AI';this.style.background='transparent';">
                </div>
                <div class="gpt-ai-message-shell">
                    ${GPTProgress.historyHtml(msg.progress)}
                    <div class="gpt-content markdown-body">${renderAssistantMessageHtml(msg.content || '', msg.sources || [], msg.generatedFiles || msg.files || [])}</div>
                    ${actionsHtml}
                </div>
            </div>
        `);
    }

    if (shouldScroll) {
        chatArea.scrollTop = chatArea.scrollHeight;
    }
}

function flashMessageAction(button, text) {
    if (!button) return;
    const tip = button.querySelector('.gpt-msg-action-tip');
    button.dataset.tip = text;
    if (tip) tip.textContent = text;
    clearTimeout(button.__actionTimer);
    button.__actionTimer = setTimeout(() => {
        const fallback = button.getAttribute('aria-label') || text;
        button.dataset.tip = fallback;
        if (tip) tip.textContent = fallback;
    }, 1400);
}

async function copyAssistantMessage(event, sessionId, messageIndex) {
    event.preventDefault();
    event.stopPropagation();
    const session = getSessionById(sessionId);
    const message = session && session.messages && session.messages[messageIndex];
    if (!message || message.role !== 'assistant') return;

    try {
        await navigator.clipboard.writeText(String(message.content || '').trim());
        flashMessageAction(event.currentTarget, '已复制');
    } catch {
        flashMessageAction(event.currentTarget, '复制失败');
    }
}

function branchSessionFromReply(event, sessionId, messageIndex) {
    event.preventDefault();
    event.stopPropagation();

    const parentSession = getSessionById(sessionId);
    const sourceMessage = parentSession && parentSession.messages && parentSession.messages[messageIndex];
    if (!parentSession || !sourceMessage || sourceMessage.role !== 'assistant') return;

    const siblingCount = getDirectChildSessions(parentSession.id).length + 1;
    const branchSession = createSessionRecord({
        title: `${parentSession.title} · 分叉 ${siblingCount}`,
        messages: deepCloneSessionMessages(parentSession.messages.slice(0, messageIndex + 1)),
        parentSessionId: parentSession.id,
        rootSessionId: parentSession.rootSessionId || parentSession.id,
        branchDepth: (parentSession.branchDepth || 0) + 1,
        branchedFromMessageIndex: messageIndex,
        branchedFromMessagePreview: summarizeBranchText(sourceMessage.content, 36),
        needsHistorySeed: true
    });

    chatSessions.push(branchSession);
    currentSessionId = branchSession.id;
    saveSessions();
    renderHistoryList();
    renderCurrentChat();
    clearGPTFile();
    flashMessageAction(event.currentTarget, '已分叉');
}

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
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendGPTMessage();
    }
}

function createThinkingMessage(text, files, imageMode = false) {
    const chatArea = document.getElementById('gpt-chat-area');
    const el = document.createElement('div');
    el.className = 'gpt-msg-container ai tt-progress-message';
    el.innerHTML = `
        <div class="gpt-avatar gpt-avatar-ai">
            <img src="ai-avatar.png" alt="AI" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">
        </div>
        <div class="gpt-ai-message-shell">
            <div class="gpt-content markdown-body" hidden></div>
        </div>`;
    const shell = el.querySelector('.gpt-ai-message-shell');
    const progress = GPTProgress.create(shell, { image: imageMode });
    chatArea.appendChild(el);
    chatArea.scrollTop = chatArea.scrollHeight;
    return {
        el, progress, sessionId: currentSessionId,
        contentBox: shell.querySelector('.gpt-content'),
        stop(status = 'completed') { return progress.finish(status); }
    };
}

function updateThinkingStep(thinkingObj, text, tool = '') {
    if (thinkingObj && thinkingObj.progress) thinkingObj.progress.status(text, tool);
}

function prepareAssistantOutput(thinkingObj) {
    const contentBox = thinkingObj && thinkingObj.contentBox;
    if (!contentBox) return document.createElement('div');
    contentBox.hidden = false;
    // Progress stays a sibling of the answer, including tool calls after text starts.
    thinkingObj.progress.answering();
    return contentBox;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function typewriterMarkdown(targetEl, fullText, signal) {
    const chars = Array.from(fullText || '');
    let current = '';
    for (let i = 0; i < chars.length; i++) {
        if (signal && signal.aborted) throw new DOMException('已停止生成', 'AbortError');
        current += chars[i];
        if (i % 8 === 0 || i === chars.length - 1) {
            targetEl.innerHTML = renderMarkdownSafe(current);
            const chatArea = document.getElementById('gpt-chat-area');
            const isScrolledUp = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight > 15;
            if(!isScrolledUp) chatArea.scrollTop = chatArea.scrollHeight;
        }
        const delay = chars[i] === '\n' ? 16 : 8;
        await sleep(delay);
    }
    targetEl.innerHTML = renderMarkdownSafe(fullText || '');
}

const GPT_STREAM_IDLE_TIMEOUT_MS = 90_000;

async function readGPTStreamChunk(reader) {
    let timeoutId;
    try {
        return await Promise.race([
            reader.read(),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    const error = new Error('流式连接超过 90 秒没有收到任何数据。已保留当前内容，请重试。');
                    error.name = 'StreamIdleError';
                    reject(error);
                }, GPT_STREAM_IDLE_TIMEOUT_MS);
            })
        ]);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function consumeGPTStream(response, thinkingObj, streamState) {
    if (!response.body) throw new Error('浏览器没有收到可读取的流式响应。');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const contentType = response.headers.get('content-type') || '';
    const isSSE = contentType.includes('text/event-stream');

    let buffer = '';
    let dataLines = [];
    let lastRender = 0;
    const chatArea = document.getElementById('gpt-chat-area');

    function render(force = false) {
        const now = Date.now();
        if (!force && now - lastRender < 95) return;

        if (!streamState.outputEl) {
            streamState.outputEl = prepareAssistantOutput(thinkingObj);
        }

        const isScrolledUp = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight > 15;
        streamState.outputEl.innerHTML = renderAssistantMessageHtml(
            streamState.fullText,
            streamState.sources || [],
            streamState.generatedFiles || []
        );

        if (!isScrolledUp && gptActiveMessage && gptActiveMessage.sessionId === currentSessionId) {
            chatArea.scrollTop = chatArea.scrollHeight;
        }

        lastRender = now;
    }

    function updateLiveStatus(value, tool = '') {
        const status = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
        if (!status) return;
        updateThinkingStep(thinkingObj, status, tool);
    }

    function appendText(value) {
        if (typeof value !== 'string' || !value) return;
        thinkingObj.progress.answering();
        streamState.liveStatus = '';
        streamState.fullText += value;
        render();
    }

    function processSSEPayload(payload) {
        if (!payload) return;
        if (payload === '[DONE]') {
            streamState.receivedDone = true;
            streamState.liveStatus = '';
            return;
        }

        let obj;
        try {
            obj = JSON.parse(payload);
        } catch {
            appendText(payload);
            return;
        }

        if (!obj || typeof obj !== 'object') return;
        if (obj.error) throw new Error(String(obj.error));
        if (obj.done) {
            streamState.receivedDone = true;
            streamState.liveStatus = '';
        }

        // Heartbeats prove connectivity; they do not represent new thinking steps.
        const liveStatus = obj.status || obj.progress || obj.stage || '';
        if (liveStatus && !obj.ping) updateLiveStatus(liveStatus, obj.tool || '');
        if (typeof obj.summaryDelta === 'string') {
            thinkingObj.progress.summary(obj.summaryKey, obj.summaryDelta, false);
        }
        if (typeof obj.summaryText === 'string') {
            thinkingObj.progress.summary(obj.summaryKey, obj.summaryText, true);
        }
        if (typeof obj.delta === 'string') appendText(obj.delta);
        else if (typeof obj.reply === 'string') appendText(obj.reply);
        else if (typeof obj.content === 'string') appendText(obj.content);
        if (Array.isArray(obj.sources) && obj.sources.length) {
            streamState.sources = mergeAssistantSources(streamState.sources || [], obj.sources);
            render(true);
        }
        const files = obj.files || obj.generatedFiles || obj.attachments;
        if (Array.isArray(files)) {
            streamState.generatedFiles = mergeGeneratedFiles(streamState.generatedFiles || [], files);
            render(true);
        }
        if (Array.isArray(obj.sessionFiles)) {
            streamState.sessionFiles = mergeGeneratedFiles(streamState.sessionFiles || [], obj.sessionFiles);
        }
    }

    function flushSSEEvent() {
        if (!dataLines.length) return;
        const payload = dataLines.join('\n');
        dataLines = [];
        processSSEPayload(payload);
    }

    function processSSELine(line) {
        if (line === '') { flushSSEEvent(); return; }
        if (line.startsWith(':')) return;
        if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).replace(/^ /, ''));
        }
        // event:, id: and retry: are metadata, never answer text.
    }

    try {
        while (true) {
            const { value, done } = await readGPTStreamChunk(reader);
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            if (isSSE) {
                buffer += chunk;
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';

                for (const line of lines) processSSELine(line);
            } else {
                appendText(chunk);
            }
        }

        const trailing = decoder.decode();
        if (trailing) {
            if (isSSE) buffer += trailing;
            else appendText(trailing);
        }
        if (isSSE) {
            if (buffer) processSSELine(buffer.replace(/\r$/, ''));
            flushSSEEvent();
        }

        if (isSSE && !streamState.receivedDone) {
            throw new Error(streamState.fullText
                ? '流式连接在完成标记到达前中断。已保留当前内容，请重试。'
                : '流式连接提前中断，未收到有效回答，请重试。');
        }
    } catch (error) {
        try { await reader.cancel(); } catch {}
        throw error;
    }

    streamState.liveStatus = '';
    render(true);
    return {
        text: streamState.fullText,
        sources: normalizeAssistantSources(streamState.sources || []),
        files: normalizeGeneratedFiles(streamState.generatedFiles || []),
        sessionFiles: normalizeGeneratedFiles(streamState.sessionFiles || [])
    };
}

function getErrorMessageFromResponse(response, fallback) {
    return response.text().then(text => {
        if (!text) return fallback;
        try {
            const obj = JSON.parse(text);
            return obj.error || obj.message || text;
        } catch {
            return text;
        }
    });
}

async function uploadGPTFileChunks(file, sessionId, signal, onProgress) {
    const headers = { 'Content-Type': 'application/json', 'X-Client-ID': getGPTClientId() };
    const check = async response => {
        if (!response.ok) throw new Error(await getErrorMessageFromResponse(response, '文件上传失败'));
        return response.json();
    };
    const start = await check(await tuoApiFetch('/api/ai-chat/uploads', {
        method: 'POST', headers, signal,
        body: JSON.stringify({ sessionId, name: file.name, size: file.size, mimeType: file.type })
    }));
    const route = `/api/ai-chat/uploads/${encodeURIComponent(start.uploadId)}`;
    try {
        for (let offset = 0; offset < file.size; offset += start.chunkBytes) {
            const end = Math.min(file.size, offset + start.chunkBytes);
            await check(await tuoApiFetch(`${route}/chunks?offset=${offset}`, {
                method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, signal,
                body: file.slice(offset, end)
            }));
            if (onProgress) onProgress(Math.round(end / file.size * 100));
        }
        return await check(await tuoApiFetch(`${route}/complete`, { method: 'POST', headers, signal, body: '{}' }));
    } catch (error) {
        // Cancellation also releases server-side temporary chunks. Durable
        // files already completed remain attached to the conversation.
        await tuoApiFetch(route, { method: 'DELETE', headers, signal: AbortSignal.timeout(5000) }).catch(() => {});
        throw error;
    }
}

async function sendGPTMessage() {
    const inputEl = document.getElementById('gpt-input-el');
    if (gptIsSending) {
        if (gptAbortController) gptAbortController.abort();
        return;
    }

    const text = inputEl.value.trim();
    if (!text && gptPendingFiles.length === 0) return;

    if (!aiAccessToken || chatNickname !== '拖' || localStorage.getItem('tuotuo_chat_entry_name') !== '拖') {
        const area = document.getElementById('gpt-chat-area');
        if (area) {
            area.querySelector('.gpt-service-unavailable')?.remove();
            area.insertAdjacentHTML('beforeend', '<div class="gpt-msg-container ai gpt-service-unavailable"><div class="gpt-content">当前服务暂时不可用，请稍后再试。</div></div>');
            area.scrollTop = area.scrollHeight;
        }
        return;
    }

    if (typeof ensureGPTSessionsLoaded === 'function') {
        await ensureGPTSessionsLoaded();
    }

    if (!currentSessionId || !getCurrentSession()) {
        const newSession = createSessionRecord();
        currentSessionId = newSession.id;
        chatSessions.unshift(newSession);
        saveSessions();
        renderHistoryList();
    }

    const session = getCurrentSession();
    if (!session) return;

    const modeAtSend = currentGPTMode;
    const requestId = (window.crypto && typeof window.crypto.randomUUID === 'function')
        ? window.crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const imageRatioAtSend = currentImageRatio;
    const filesSnapshot = [...gptPendingFiles];

    if (session.messages.length === 0) {
        const titleText = text || (filesSnapshot.length ? `上传了 ${filesSnapshot.length} 个附件` : '新聊天');
        session.title = titleText.length > 18 ? titleText.substring(0, 18) + '...' : titleText;
    }

    let imagesToSend = [];
    let documentsToSend = [];
    let docsText = '';
    let mediaHtml = '';

    filesSnapshot.forEach(f => {
        if (f.type === 'image') {
            if (modeAtSend === 'image') {
                const imagePayload = { image: f.data, name: f.name };
                if (f.mask) imagePayload.mask = f.mask;
                if (f.width && f.height) {
                    imagePayload.width = f.width;
                    imagePayload.height = f.height;
                }
                imagesToSend.push(imagePayload);
            } else imagesToSend.push(f.data);
            mediaHtml += `<img src="${escapeAttr(f.data)}" class="gpt-user-image" onclick="openFull(this.src)">`;
        } else if (f.type === 'document') {
            const documentPayload = {
                name: f.name,
                mimeType: f.mimeType || 'application/octet-stream',
                size: f.size || 0
            };
            if (f.rawFile) documentPayload.rawFile = f.rawFile;
            else if (f.fileData) documentPayload.fileData = f.fileData;
            if (f.content) documentPayload.content = f.content;
            documentsToSend.push(documentPayload);
            docsText += `\n\n【用户上传了附件：${f.name}】`;
            mediaHtml += `<div class="gpt-user-file-card">📄 ${escapeHtml(f.name)}</div>`;
        }
    });

    const textToSendToBackend = text + docsText;
    const cleanMessageToBackend = text || (documentsToSend.length ? '请分析我上传的附件。' : '');
    session.messages.push({ id: `${requestId}:user`, role: 'user', content: textToSendToBackend, userText: text, mediaHtml, createdAt: Date.now() });
    session.updatedAt = Date.now();
    saveSessions();
    renderHistoryList();

    inputEl.value = '';
    clearGPTFile();
    renderCurrentChat();

    const thinkingObj = createThinkingMessage(textToSendToBackend, filesSnapshot, modeAtSend === 'image');
    gptActiveMessage = thinkingObj;
    gptIsSending = true;
    gptAbortController = new AbortController();
    autoResizeGPT(inputEl);

    let resultStatus = 'completed';
    let finalReply = '';
    let finalSources = [];
    let finalGeneratedFiles = [];
    let finalSessionFiles = [];
    let outputEl = null;
    const streamState = {
        outputEl: null,
        fullText: '',
        sources: [],
        generatedFiles: [],
        sessionFiles: [],
        liveStatus: '',
        receivedDone: false
    };

    try {
        if (modeAtSend === 'image') {
            let imageTimedOut = false;
            const imageTimeout = setTimeout(() => {
                imageTimedOut = true;
                if (gptAbortController) gptAbortController.abort();
            }, 600000);
            let response;
            try {
                response = await tuoApiFetch('/api/ai-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: gptAbortController.signal,
                    body: JSON.stringify({
                        prompt: textToSendToBackend,
                        images: imagesToSend,
                        ratio: imageRatioAtSend
                    })
                });
            } catch (fetchErr) {
                if (fetchErr.name === 'AbortError') {
                    if (imageTimedOut) throw new Error('图片生成超时了（已等待约 10 分钟），请稍后重试。');
                    throw fetchErr;
                }
                const refSizeText = imagesToSend.length ? `参考图已压缩后发送，约 ${Math.round(JSON.stringify(imagesToSend).length / 1024)}KB。` : '';
                const browserError = fetchErr.message ? `浏览器错误：${fetchErr.message}。` : '';
                throw new Error(`画图请求连接失败。${refSizeText}${browserError}可能是后端正在重启、接口网关中断，或 Azure 图片接口长时间未响应。请刷新后重试；如果仍失败，可以先不要上传参考图直接画。`);
            } finally {
                clearTimeout(imageTimeout);
            }
            if (!response.ok) throw new Error(await getErrorMessageFromResponse(response, '画图请求失败'));
            const data = await response.json();
            if (!data.url) throw new Error('模型没有返回有效图片，请换一个提示词再试。');

            outputEl = prepareAssistantOutput(thinkingObj);
            const imgHtml = `<img src="${escapeAttr(data.url)}" class="message-image" onclick="openFull(this.src)" style="max-width: min(420px, 82vw); max-height: 420px; object-fit: contain; border-radius: 14px; margin-bottom: 10px; cursor: zoom-in; box-shadow: 0 8px 28px rgba(0,0,0,0.12);">`;
            if (outputEl) outputEl.innerHTML = imgHtml;

            const chatArea = document.getElementById('gpt-chat-area');
            if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
            const metaText = data.size ? `${data.size} / ${data.ratio || imageRatioAtSend}` : (data.ratio || imageRatioAtSend || 'auto');
            finalReply = `![TuoTuo为你绘制的画作](${data.url})${data.revised_prompt ? `\n\n*💡 提示词: ${data.revised_prompt}*` : ''}\n\n*🖼️ ${metaText}*`;
        } else {
            for (const doc of documentsToSend) {
                if (!doc.rawFile) continue;
                updateThinkingStep(thinkingObj, `正在上传附件：${doc.name}`, 'upload');
                const saved = await uploadGPTFileChunks(doc.rawFile, session.id, gptAbortController.signal);
                updateThinkingStep(thinkingObj, `附件上传完成：${doc.name}`, 'upload');
                doc.uploadToken = saved.downloadId;
                delete doc.rawFile;
                // Keep the durable reference even if the subsequent model call fails.
                session.fileRefs = [...(session.fileRefs || []), saved];
                if (session.messages.length) {
                    const sent = session.messages.find(m => m.id === `${requestId}:user`);
                    if (sent) sent.sessionFiles = [...(sent.sessionFiles || []), saved];
                }
                saveSessions();
            }
            const response = await tuoApiFetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: gptAbortController.signal,
                body: JSON.stringify({
                    message: cleanMessageToBackend,
                    clientId: getGPTClientId(),
                    sessionId: session.id,
                    requestId,
                    historyMessages: buildGPTContextMessages(session, 1),
                    sessionFiles: collectGPTSessionFiles(session),
                    images: imagesToSend,
                    documents: documentsToSend,
                    stream: true,
                    reasoningMode: currentReasoningMode
                })
            });
            if (!response.ok) {
                const errorMessage = await getErrorMessageFromResponse(response, '网络请求失败');
                throw new Error(errorMessage);
            }

            if ((response.headers.get('content-type') || '').includes('application/json')) {
                outputEl = prepareAssistantOutput(thinkingObj);
                const data = await response.json();
                finalReply = data.reply || '';
                finalSources = normalizeAssistantSources(data.sources || []);
                finalGeneratedFiles = normalizeGeneratedFiles(data.files || data.generatedFiles || data.attachments || []);
                finalSessionFiles = normalizeGeneratedFiles(data.sessionFiles || []);
                streamState.fullText = finalReply;
                streamState.sources = finalSources;
                streamState.generatedFiles = finalGeneratedFiles;
                streamState.sessionFiles = finalSessionFiles;
                await typewriterMarkdown(outputEl, finalReply, gptAbortController.signal);
                outputEl.innerHTML = renderAssistantMessageHtml(finalReply, finalSources, finalGeneratedFiles);
            } else {
                const streamResult = await consumeGPTStream(response, thinkingObj, streamState);
                finalReply = streamResult.text || '';
                finalSources = normalizeAssistantSources(streamResult.sources || []);
                finalGeneratedFiles = normalizeGeneratedFiles(streamResult.files || []);
                finalSessionFiles = normalizeGeneratedFiles(streamResult.sessionFiles || []);
            }
        }
    } catch (err) {
        resultStatus = err.name === 'AbortError' ? 'stopped' : 'error';
        thinkingObj.stop(resultStatus);
        if (err.name === 'AbortError') {
            outputEl = streamState.outputEl || outputEl || prepareAssistantOutput(thinkingObj);
            finalSources = normalizeAssistantSources(streamState.sources || []);
            finalGeneratedFiles = normalizeGeneratedFiles(streamState.generatedFiles || []);
            finalSessionFiles = normalizeGeneratedFiles(streamState.sessionFiles || []);
            finalReply = (streamState.fullText || outputEl.innerText || '') + "\n\n*[已停止生成]*";
            outputEl.innerHTML = renderAssistantMessageHtml(finalReply, finalSources, finalGeneratedFiles);
        } else {
            const rawErrorMsg = err.message || '请求失败，请稍后再试';
            const partialText = String(streamState.fullText || '').trim();
            if (partialText) {
                outputEl = streamState.outputEl || outputEl || prepareAssistantOutput(thinkingObj);
                finalSources = normalizeAssistantSources(streamState.sources || []);
                finalGeneratedFiles = normalizeGeneratedFiles(streamState.generatedFiles || []);
                finalSessionFiles = normalizeGeneratedFiles(streamState.sessionFiles || []);
                finalReply = `${streamState.fullText}\n\n> ⚠️ 流式生成未正常结束：${rawErrorMsg}`;
                outputEl.innerHTML = renderAssistantMessageHtml(finalReply, finalSources, finalGeneratedFiles);
            } else {
                outputEl = prepareAssistantOutput(thinkingObj);
                const isFilter = /content management policy|content_filter|responsible ai|jailbreak|filtered by|内容过滤/i.test(rawErrorMsg);
                const isDatabaseError = /cosmos|documents\.azure\.com|composite index|throughput|ru\/s/i.test(rawErrorMsg);
                const isAccountError = /账号|用户名|密码|访问验证|登录|注册/i.test(rawErrorMsg);
                const suggestion = isFilter
                    ? '这通常是 Azure 内容过滤误伤。请点击左侧【新聊天】后重试，或换成“请客观描述图片中的场景、人物姿态、物品和文字”。'
                    : isDatabaseError
                        ? '这是聊天历史数据库错误，不是内容过滤。请稍后重试；若持续出现，请检查后端部署版本和 /api/status。'
                    : isAccountError
                        ? '请确认用户名和个人密码；若仍然失败，请在 Azure App Service 的日志流中搜索页面显示的错误编号。'
                        : '可以试试：新开一个聊天、减少图片数量、换一句更具体的提示词，或稍后重试。';
                finalReply = `> ⚠️ 本次未完成：${rawErrorMsg}\n\n${suggestion}`;
                outputEl.innerHTML = renderAssistantMessageHtml(finalReply, [], []);

            }
        }
    } finally {
        thinkingObj.stop(resultStatus);
        gptActiveMessage = null;
        gptAbortController = null;
        gptIsSending = false;
        autoResizeGPT(inputEl);
        const durableRefs = mergeGeneratedFiles(finalSessionFiles, finalGeneratedFiles);
        if (durableRefs.length) {
            session.fileRefs = mergeGeneratedFiles(session.fileRefs || [], durableRefs);
            const userMessage = session.messages.find(message => message.id === `${requestId}:user`);
            if (userMessage) userMessage.attachments = mergeGeneratedFiles(userMessage.attachments || [], finalSessionFiles);
        }
        if (finalReply) {
            finalReply = removeSandboxDownloadLinks(finalReply);
            session.needsHistorySeed = false;
            session.messages.push({
                id: `${requestId}:assistant`,
                role: 'assistant',
                content: finalReply,
                sources: finalSources,
                generatedFiles: finalGeneratedFiles,
                sessionFiles: finalSessionFiles,
                progress: thinkingObj.progress.snapshot(),
                createdAt: Date.now()
            });
            const assistantMessageIndex = session.messages.length - 1;
            attachAssistantActionsToLiveMessage(thinkingObj, session, assistantMessageIndex);
            session.updatedAt = Date.now();
            saveSessions();
            renderHistoryList();
        } else if (durableRefs.length) {
            session.updatedAt = Date.now();
            saveSessions();
        }
    }
}

(function initGPTDragAndPasteUpload() {
    const main = document.querySelector('.gpt-main');
    const input = document.getElementById('gpt-input-el');
    if (!main || !input) return;

    // A drop on a textarea has a native default action that can replace its
    // value. Handle file drops at the input itself so the draft is preserved.
    ['dragenter', 'dragover', 'drop'].forEach(type => {
        input.addEventListener(type, e => {
            if (!e.dataTransfer?.files?.length) return;
            e.preventDefault();
            if (type === 'drop') {
                e.stopPropagation();
                main.classList.remove('drag-over');
                handleGPTFileSelect(e);
            }
        });
    });

    ['dragenter', 'dragover'].forEach(type => {
        main.addEventListener(type, e => {
            if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
            e.preventDefault();
            main.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(type => {
        main.addEventListener(type, e => {
            if (type === 'drop' && e.dataTransfer && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                handleGPTFileSelect(e);
            }
            main.classList.remove('drag-over');
        });
    });

    input.addEventListener('paste', e => {
        const files = Array.from(e.clipboardData?.files || []);
        if (files.length > 0) {
            e.preventDefault();
            handleGPTFileSelect({ dataTransfer: { files } });
        }
    });
})();
