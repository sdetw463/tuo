/* GPT chat, files, extraction, streaming and message rendering
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
let gptPendingFiles = [];
let gptIsSending = false;
let gptAbortController = null;

function getCurrentSession() {
    return getSessionById(currentSessionId);
}

function buildGPTContextMessages(session, excludeLastCount = 0) {
    if (!session || !Array.isArray(session.messages)) return [];

    const end = Math.max(0, session.messages.length - excludeLastCount);
    return session.messages
        .slice(0, end)
        .filter(msg => msg && (msg.role === 'user' || msg.role === 'assistant'))
        .slice(-18)
        .map(msg => {
            const generatedFiles = normalizeGeneratedFiles(msg.generatedFiles || msg.files || []);
            const fileContext = generatedFiles.length
                ? '\n\n【这条回复生成的文件】\n' + generatedFiles
                    .map(file => `- ${file.filename || '未命名文件'}${file.url ? `：${file.url}` : ''}`)
                    .join('\n')
                : '';
            return {
                role: msg.role,
                content: `${String(msg.content || msg.userText || '').trim()}${fileContext}`.slice(0, 24000)
            };
        })
        .filter(msg => msg.content);
}

function collectGPTSessionFiles(session, maxFiles = 12) {
    if (!session || !Array.isArray(session.messages)) return [];
    const found = [];
    const seen = new Set();

    session.messages.forEach((msg, messageIndex) => {
        const files = normalizeGeneratedFiles(msg.generatedFiles || msg.files || []);
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

    return found.slice(-maxFiles);
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
function buildSessionsSavePayload() {
    return JSON.stringify({
        sessions: chatSessions,
        clientLoadedAllSessions: !!gptSessionsLoaded
    });
}

function saveSessions() {
    if (typeof ensureGPTSessionsLoaded === 'function' && !gptSessionsLoaded) {
        ensureGPTSessionsLoaded().then(saveSessions);
        return;
    }

    clearTimeout(saveSessionsTimer);
    saveSessionsTimer = setTimeout(() => {
        repairSessionTree();
        tuoApiFetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: buildSessionsSavePayload()
        })
            .then(async res => {
                const text = await res.text();
                let data = null;
                try { data = text ? JSON.parse(text) : null; } catch {}
                if (!res.ok || (data && data.success === false)) {
                    throw new Error((data && (data.error || data.msg)) || text || `HTTP ${res.status}`);
                }
            })
            .catch(err => console.error("同步到云端数据库失败:", err));
    }, 1000); // 稍微防抖，避免高频发请求
}

window.addEventListener('pagehide', () => {
    if (!gptSessionsLoaded || chatSessions.length === 0) return;
    clearTimeout(saveSessionsTimer);
    const payload = buildSessionsSavePayload();
    // Beacon cannot attach the private Authorization header, so use the authenticated fetch path.
    tuoApiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
    }).catch(() => {});
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
    const codeInterpreterExts = new Set([
        'c','cpp','csv','css','docx','gif','html','java','jpeg','jpg','js','json','md',
        'pdf','php','png','pptx','py','rb','tar','tex','ts','txt','xlsx','xml','zip'
    ]);
    return codeInterpreterExts.has(ext) || file.type === 'application/pdf';
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

    const maxAttachments = currentGPTMode === 'image' ? 5 : 3;
    const remainingSlots = maxAttachments - gptPendingFiles.length;
    if (remainingSlots <= 0) {
        alert(`最多只能同时上传 ${maxAttachments} 个附件哦～`);
        if (e.target) e.target.value = '';
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

        if (file.size > 10 * 1024 * 1024) {
            alert(`文件 ${name} 太大啦，请尽量控制在 10MB 以内。`);
            continue;
        }
        if (currentGPTMode !== 'image' && pendingBytes + file.size > 20 * 1024 * 1024) {
            alert('本轮聊天附件合计不能超过 20MB。');
            continue;
        }

        try {
            if (file.type.startsWith('image/')) {
                showGPTTransientStatus(`正在处理图片：${name}`);
                const processed = await processImageAsync(file, currentGPTMode);
                gptPendingFiles.push({ type: 'image', data: processed.image, mask: processed.mask || null, width: processed.width || null, height: processed.height || null, size: file.size || 0, name });
            } else {
                if (shouldSendAsRawInputFile(file, ext)) {
                    showGPTTransientStatus(`正在上传原始文件：${name}`);
                    const fileData = await readFileAsDataUrl(file);
                    gptPendingFiles.push({
                        type: 'document',
                        data: fileData,
                        fileData,
                        mimeType: file.type || 'application/pdf',
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
    if (e.target) e.target.value = '';
}


function normalizeGeneratedFiles(files) {
    const seen = new Set();
    return (Array.isArray(files) ? files : [])
        .map(file => {
            if (!file) return null;
            let url = String(file.url || file.downloadUrl || '').trim();
            const filename = String(file.filename || file.name || file.fileName || 'agent-output').trim();
            const downloadId = String(file.downloadId || '').trim();
            if (/sandbox:/i.test(url)) {
                url = '';
            }
            if (url.startsWith('/api/')) {
                url = `${TUOTUO_API_BASE}${url}`;
            }
            const safeDownloadUrl = /^https?:\/\/[^/]+\/api\/ai-agent-file\/[^/?#]+(?:\?[^#]*)?$/i.test(url);
            if (!safeDownloadUrl) url = '';
            const key = url || downloadId || filename;
            if (!key || seen.has(key)) return null;
            seen.add(key);
            return { url, filename, downloadId, type: file.type || 'file' };
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

function getThinkingSteps(text, files) {
    if (currentGPTMode === 'image') {
        return ['正在准备画笔和颜料', '正在构思唯美的画面', '正在后台努力画画'];
    }

    const steps = [];
    if (files.length > 0) steps.push(`正在处理你上传的 ${files.length} 个文件`);

    if (currentReasoningMode === 'research') {
        steps.push('正在制定研究计划');
        steps.push('正在联网搜索可靠资料');
        steps.push('正在交叉整理来源');
        steps.push('正在生成带来源的研究结论');
        return steps;
    }

    if (currentReasoningMode === 'think') {
        steps.push('正在认真拆解问题');
        steps.push('正在进行更谨慎的推理');
        steps.push('正在自检答案是否完整');
        steps.push('正在组织清晰的回答');
        return steps;
    }

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

function startThinkingRing(avatarEl) {
    if (!avatarEl) return function stop() {};
    const DPR = window.devicePixelRatio || 1;
    const CSS_SIZE = 56; // CSS显示尺寸（px）
    const SIZE = CSS_SIZE * DPR; // 实际canvas像素

    const R = (18 + 2.5) * DPR;
    const LINE_W = 2.8 * DPR; // 线宽跟随DPR缩放

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

    let transitPhase = -1; // 即将进入的phase
    let transitProgress = 0;
    const TRANSIT_SPEED = 0.04; // 每帧过渡进度，约25帧完成

    let renderArcLen = arcLen;
    let colorBlend = 0;

    let phase0Progress = 0;
    let totalAngleTraveled = 0;

    function gravitySpeed(a) {
        const base = 0.028;
        const amp = 0.038;
        return base + amp * (1 + Math.sin(a)) * 0.5;
    }

    function lerpColor(c0, c1, t) {
        return [
            Math.round(c0[0] * (1-t) + c1[0] * t),
            Math.round(c0[1] * (1-t) + c1[1] * t),
            Math.round(c0[2] * (1-t) + c1[2] * t),
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
            renderArcLen = arcLen + (transitPhase === 1 ? arcLen1 : arcLen0Start) * transitProgress
                           - arcLen * transitProgress;
            const targetLen = transitPhase === 1 ? arcLen1 : arcLen0Start;
            renderArcLen = arcLen * (1 - transitProgress) + targetLen * transitProgress;
            colorBlend = transitPhase === 1
                ? transitProgress
                : 1 - transitProgress;

            if (transitProgress >= 1) {
                phase = transitPhase;
                transitPhase = -1;
                transitProgress = 0;
                arcLen = phase === 1 ? arcLen1 : arcLen0Start;
                renderArcLen = arcLen;
                colorBlend = phase === 1 ? 1 : 0;
                totalAngleTraveled = 0;
                loopCount = 0;
                phase0Progress = phase === 0 ? 0 : phase0Progress;
            }
        } else if (phase === 0) {
            angle += speed;
            totalAngleTraveled += speed;

            if (totalAngleTraveled >= Math.PI * 2 * (loopCount + 1)) {
                loopCount++;
            }
            phase0Progress = Math.min(totalAngleTraveled / (Math.PI * 4), 1);
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

        if (transitPhase >= 0) {
            angle += speed;
        }

        const headA = angle;
        const tailA = angle - renderArcLen;

        const { head, tail } = getColors(phase0Progress, colorBlend);

        ctx.beginPath();
        ctx.arc(cx, cy, R, tailA, headA, false);
        ctx.lineWidth = LINE_W;
        ctx.lineCap = 'butt'; // 修复2：平头，不加圆点

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

function createThinkingMessage(text, files) {
    const chatArea = document.getElementById('gpt-chat-area');
    const id = 'gpt_thinking_' + Date.now();

    chatArea.insertAdjacentHTML('beforeend', `
        <div class="gpt-msg-container ai gpt-thinking-message" id="${id}">
            <div class="gpt-thinking-dot-avatar" aria-hidden="true">
                <div class="gpt-thinking-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
            <div class="gpt-ai-message-shell">
                <div class="gpt-content gpt-thinking-content" aria-live="polite">
                    <span class="gpt-thinking-step-text" hidden></span>
                </div>
            </div>
        </div>
    `);

    chatArea.scrollTop = chatArea.scrollHeight;

    const el = document.getElementById(id);
    const avatarEl = el ? el.querySelector('.gpt-thinking-dot-avatar, .gpt-avatar-ai') : null;
    const detailEl = el ? el.querySelector('.gpt-thinking-step-text') : null;

    return {
        id,
        el,
        avatarEl,
        contentBox: el ? el.querySelector('.gpt-content') : null,
        detailEl,
        stop() {}
    };
}

function updateThinkingStep(thinkingObj, text) {
    const step = thinkingObj && thinkingObj.detailEl;
    const value = String(text || '').trim();
    if (!step || !value) return;
    step.textContent = value;
    step.hidden = false;
    step.classList.add('show');
}

function prepareAssistantOutput(thinkingObj) {
    if (thinkingObj && typeof thinkingObj.stop === 'function') thinkingObj.stop();
    if (thinkingObj && thinkingObj.el) {
        thinkingObj.el.classList.remove('gpt-thinking-message');
    }
    if (thinkingObj && thinkingObj.avatarEl) {
        thinkingObj.avatarEl.classList.remove('gpt-thinking-dot-avatar');
        thinkingObj.avatarEl.classList.add('gpt-avatar', 'gpt-avatar-ai');
        thinkingObj.avatarEl.innerHTML = `<img src="ai-avatar.png" alt="AI" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.src='';this.alt='AI';this.style.background='transparent';">`;
    }
    const contentBox = thinkingObj && thinkingObj.contentBox;
    if (!contentBox) return document.createElement('div');
    contentBox.className = 'gpt-content markdown-body';
    contentBox.removeAttribute('aria-live');
    contentBox.innerHTML = '';
    return contentBox;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function typewriterMarkdown(targetEl, fullText) {
    const chars = Array.from(fullText || '');
    let current = '';
    for (let i = 0; i < chars.length; i++) {
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
        if (!force && now - lastRender < 95) return;

        if (!streamState.outputEl) {
            streamState.outputEl = prepareAssistantOutput(thinkingObj);
        }

        const isScrolledUp = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight > 15;

        streamState.outputEl.innerHTML = renderAssistantMessageHtml(streamState.fullText, streamState.sources || [], streamState.generatedFiles || []);

        if (!isScrolledUp || force) {
            chatArea.scrollTop = chatArea.scrollHeight;
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
                const payload = trimmed.startsWith('data:')
                    ? trimmed.slice(5).trim()
                    : trimmed;

                if (!payload || payload === '[DONE]') continue;

                try {
                    const obj = JSON.parse(payload);
                    if (obj.error) throw new Error(String(obj.error));
                    const liveStatus = obj.status || obj.thinking || obj.progress || obj.stage || '';
                    if (liveStatus) updateThinkingStep(thinkingObj, liveStatus);
                    if (obj.delta) {
                        streamState.fullText += obj.delta;
                        render();
                    } else if (obj.reply) {
                        streamState.fullText += obj.reply;
                        render();
                    } else if (obj.content) {
                        streamState.fullText += obj.content;
                        render();
                    } else if (obj.sources && Array.isArray(obj.sources) && obj.sources.length > 0) {
                        streamState.sources = mergeAssistantSources(streamState.sources || [], obj.sources);
                        render(true);
                    } else if ((obj.files || obj.generatedFiles || obj.attachments) && Array.isArray(obj.files || obj.generatedFiles || obj.attachments)) {
                        streamState.generatedFiles = mergeGeneratedFiles(streamState.generatedFiles || [], obj.files || obj.generatedFiles || obj.attachments);
                        render(true);
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
    return {
        text: streamState.fullText,
        sources: normalizeAssistantSources(streamState.sources || []),
        files: normalizeGeneratedFiles(streamState.generatedFiles || [])
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

async function sendGPTMessage() {
    const inputEl = document.getElementById('gpt-input-el');
    if (gptIsSending) {
        if (gptAbortController) gptAbortController.abort();
        return;
    }

    const text = inputEl.value.trim();
    if (!text && gptPendingFiles.length === 0) return;

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
            if (f.fileData) documentPayload.fileData = f.fileData;
            if (f.content) documentPayload.content = f.content;
            documentsToSend.push(documentPayload);
            docsText += `\n\n【用户上传了附件：${f.name}】`;
            mediaHtml += `<div class="gpt-user-file-card">📄 ${escapeHtml(f.name)}</div>`;
        }
    });

    const textToSendToBackend = text + docsText;
    const cleanMessageToBackend = text || (documentsToSend.length ? '请分析我上传的附件。' : '');
    session.messages.push({ role: 'user', content: textToSendToBackend, userText: text, mediaHtml });
    session.updatedAt = Date.now();
    saveSessions();
    renderHistoryList();

    inputEl.value = '';
    clearGPTFile();
    renderCurrentChat();

    const thinkingObj = createThinkingMessage(textToSendToBackend, filesSnapshot);
    gptIsSending = true;
    gptAbortController = new AbortController();
    autoResizeGPT(inputEl);

    let finalReply = '';
    let finalSources = [];
    let finalGeneratedFiles = [];
    let outputEl = null;
    const streamState = { outputEl: null, fullText: '', sources: [], generatedFiles: [] };

    try {
        if (modeAtSend === 'image') {
            const imageTimeout = setTimeout(() => {
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
                if (fetchErr.name === 'AbortError') throw new Error('图片生成超时了（已等待约 10 分钟）。如果上传了参考图，请先换一张更小的图，或先不要上传参考图直接画。');
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
            const response = await tuoApiFetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: gptAbortController.signal,
                body: JSON.stringify({
                    message: cleanMessageToBackend,
                    sessionId: currentSessionId,
                    historyMessages: buildGPTContextMessages(session, 1),
                    sessionFiles: collectGPTSessionFiles(session),
                    images: imagesToSend,
                    documents: documentsToSend,
                    stream: true,
                    reasoningMode: currentReasoningMode
                })
            });
            if (!response.ok) throw new Error(await getErrorMessageFromResponse(response, '网络请求失败'));

            if ((response.headers.get('content-type') || '').includes('application/json')) {
                outputEl = prepareAssistantOutput(thinkingObj);
                const data = await response.json();
                finalReply = data.reply || '';
                finalSources = normalizeAssistantSources(data.sources || []);
                finalGeneratedFiles = normalizeGeneratedFiles(data.files || data.generatedFiles || data.attachments || []);
                await typewriterMarkdown(outputEl, finalReply);
                outputEl.innerHTML = renderAssistantMessageHtml(finalReply, finalSources, finalGeneratedFiles);
            } else {
                const streamResult = await consumeGPTStream(response, thinkingObj, streamState);
                finalReply = streamResult.text || '';
                finalSources = normalizeAssistantSources(streamResult.sources || []);
                finalGeneratedFiles = normalizeGeneratedFiles(streamResult.files || []);
            }
        }
    } catch (err) {
        thinkingObj.stop();
        if (err.name === 'AbortError') {
            outputEl = streamState.outputEl || outputEl || prepareAssistantOutput(thinkingObj);
            finalSources = normalizeAssistantSources(streamState.sources || []);
            finalReply = (streamState.fullText || outputEl.innerText || '') + "\n\n*[已停止生成]*";
            outputEl.innerHTML = renderMarkdownSafe(finalReply, finalSources);
        } else {
            if (thinkingObj.el) thinkingObj.el.remove();
            const chatArea = document.getElementById('gpt-chat-area');
            const rawErrorMsg = err.message || '请求失败，请稍后再试';
            const safeMsg = escapeHtml(rawErrorMsg);
            const isFilter = /content management policy|content_filter|filtered|内容过滤|400/i.test(rawErrorMsg);
            const isAccountError = /账号|用户名|密码|访问验证|登录|注册/i.test(rawErrorMsg);
            const suggestion = isFilter
                ? '这通常是 Azure 内容过滤误伤。请点击左侧【新聊天】后重试，或换成“请客观描述图片中的场景、人物姿态、物品和文字”。'
                : isAccountError
                    ? '请确认用户名和个人密码；若仍然失败，请在 Azure App Service 的日志流中搜索页面显示的错误编号。'
                    : '可以试试：新开一个聊天、减少图片数量、换一句更具体的提示词，或稍后重试。';
            if (chatArea) {
                chatArea.insertAdjacentHTML('beforeend', `<div class="gpt-msg-container ai"><div class="gpt-avatar" style="color:#ff4d4f;background:#ffe4e6;">⚠️</div><div class="gpt-content" style="color:#ff4d4f;"><b>任务失败啦：</b><br>${safeMsg}<div class="gpt-error-actions">${escapeHtml(suggestion)}</div></div></div>`);
                chatArea.scrollTop = chatArea.scrollHeight;
            }
        }
    } finally {
        gptIsSending = false;
        autoResizeGPT(inputEl);
        if (finalReply) {
            finalReply = removeSandboxDownloadLinks(finalReply);
            session.needsHistorySeed = false;
            session.messages.push({ role: 'assistant', content: finalReply, sources: finalSources, generatedFiles: finalGeneratedFiles });
            const assistantMessageIndex = session.messages.length - 1;
            attachAssistantActionsToLiveMessage(thinkingObj, session, assistantMessageIndex);
            session.updatedAt = Date.now();
            saveSessions();
            renderHistoryList();
        }
    }
}

(function initGPTDragAndPasteUpload() {
    const main = document.querySelector('.gpt-main');
    const input = document.getElementById('gpt-input-el');
    if (!main || !input) return;

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
