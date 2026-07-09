/* Core constants, HTML escaping, markdown/math rendering, image viewer, love-day counter
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
const TUOTUO_GUEST_ID = (() => {
    let id = localStorage.getItem('tuotuo_guest_id');
    if (!id) {
        id = 'guest_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('tuotuo_guest_id', id);
    }
    return id;
})();

function getStableUserName() {
    return chatNickname || localStorage.getItem('diary_author') || TUOTUO_GUEST_ID;
}

function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
}

function escapeAttr(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function protectMathSegments(text) {
    const math = [];
    let protectedText = String(text || '');
    const stash = (display, content) => {
        const token = `@@MATH_${math.length}@@`;
        math.push({ display, content });
        return token;
    };

    protectedText = protectedText.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => stash(true, expr));
    protectedText = protectedText.replace(/\\\[([\s\S]+?)\\\]/g, (_, expr) => stash(true, expr));
    protectedText = protectedText.replace(/\\\(([\s\S]+?)\\\)/g, (_, expr) => stash(false, expr));
    protectedText = protectedText.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (m, prefix, expr) => `${prefix}${stash(false, expr)}`);
    return { protectedText, math };
}

function renderMathHtml(expr, display) {
    const source = String(expr || '').trim();
    if (!source) return '';
    if (!window.katex) return display ? `$$${escapeHtml(source)}$$` : `$${escapeHtml(source)}$`;
    try {
        return `<span class="${display ? 'math-block' : 'math-inline'}">${katex.renderToString(source, { displayMode: display, throwOnError: false, strict: false })}</span>`;
    } catch {
        return display ? `$$${escapeHtml(source)}$$` : `$${escapeHtml(source)}$`;
    }
}

async function copyCodeBlock(btn) {
    const wrap = btn && btn.closest('.code-block-wrap');
    const code = wrap && wrap.querySelector('pre code');
    if (!code) return;
    try {
        await navigator.clipboard.writeText(code.innerText || code.textContent || '');
        btn.textContent = '已复制';
        setTimeout(() => { btn.textContent = '复制'; }, 1400);
    } catch {
        btn.textContent = '复制失败';
        setTimeout(() => { btn.textContent = '复制'; }, 1400);
    }
}

function enhanceCodeBlocks(root) {
    if (!root) return;
    root.querySelectorAll('pre > code').forEach(code => {
        if (code.closest('.code-block-wrap')) return;
        const pre = code.parentElement;
        const langClass = Array.from(code.classList).find(cls => cls.startsWith('language-')) || '';
        const lang = (langClass.replace('language-', '') || 'text').toLowerCase();
        if (window.hljs) {
            try { hljs.highlightElement(code); } catch {}
        }

        const wrap = document.createElement('div');
        wrap.className = 'code-block-wrap';
        const header = document.createElement('div');
        header.className = 'code-block-header';
        const label = document.createElement('span');
        label.className = 'code-block-lang';
        label.textContent = lang;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-copy-btn';
        btn.textContent = '复制';
        btn.setAttribute('onclick', 'copyCodeBlock(this)');
        header.appendChild(label);
        header.appendChild(btn);
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(header);
        wrap.appendChild(pre);
    });
}

function escapeMarkdownLinkText(text) {
    return String(text || '').replace(/[\[\]]/g, '\\$&');
}

function normalizeAssistantSources(sources) {
    if (!Array.isArray(sources)) return [];
    const seen = new Set();
    return sources.map((src, index) => {
        if (!src || typeof src !== 'object') return null;
        const url = typeof src.url === 'string' && /^https?:\/\//i.test(src.url) ? src.url : '';
        const title = String(src.title || src.url || src.type || `来源 ${index + 1}`).trim();
        const key = `${url}::${title}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return { title: title.slice(0, 180), url, type: src.type || '' };
    }).filter(Boolean);
}

function mergeAssistantSources(existingSources, incomingSources) {
    return normalizeAssistantSources([...(existingSources || []), ...(incomingSources || [])]);
}

function buildAssistantSourcesMarkdown(sources) {
    const normalizedSources = normalizeAssistantSources(sources);
    if (!normalizedSources.length) return '';
    const lines = normalizedSources.map((src, index) => {
        const title = escapeMarkdownLinkText(src.title || src.url || src.type || `来源 ${index + 1}`);
        return src.url ? `${index + 1}. [${title}](${src.url})` : `${index + 1}. ${title}`;
    });
    return `**参考来源**\n${lines.join('\n')}`;
}

function replaceCitationPlaceholders(text, sources) {
    const normalizedSources = normalizeAssistantSources(sources);
    if (!text) return '';

    let cursor = 0;
    const refMap = new Map();

    function getReferenceEntry(refId) {
        const key = refId || `__auto_${cursor}`;
        if (refMap.has(key)) return refMap.get(key);
        const source = normalizedSources[cursor] || null;
        const entry = source ? { ...source, index: cursor + 1 } : null;
        refMap.set(key, entry);
        if (source) cursor += 1;
        return entry;
    }

    function buildCitationMarkdown(refIds) {
        const ids = Array.isArray(refIds) ? refIds.filter(Boolean) : [];
        const entries = (ids.length ? ids : [null])
            .map(id => getReferenceEntry(id))
            .filter(Boolean);
        if (!entries.length) return '';
        return entries.map(entry => entry.url ? `[${entry.index}](${entry.url})` : `[${entry.index}]`).join(' ');
    }

    let output = String(text);

    output = output.replace(/cite([^]+)|(?:\[\s*)?cite\s+turn\d+\w+\d+(?:\s*(?:,|，)?\s*cite\s+turn\d+\w+\d+)*\s*\]?/gi, (match, refChunk) => {
        const refs = refChunk
            ? String(refChunk || '').split('').map(item => item.trim()).filter(Boolean)
            : (match.match(/turn\d+\w+\d+/gi) || []);
        return buildCitationMarkdown(refs);
    });

    output = output.replace(/\(\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*\)/g, '[$1]($2)');
    output = output.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    return output.trim();
}

function renderMarkdownSafe(text, sources = []) {
    const normalizedSources = normalizeAssistantSources(sources);
    const replacedText = replaceCitationPlaceholders(text || '', normalizedSources);
    const renderedMarkdown = normalizedSources.length && !/(\*\*参考来源\*\*|(?:^|\n)参考来源(?:\n|$))/m.test(replacedText)
        ? `${replacedText}\n\n${buildAssistantSourcesMarkdown(normalizedSources)}`.trim()
        : replacedText;
    const { protectedText, math } = protectMathSegments(renderedMarkdown);
    if (window.marked) {
        marked.setOptions({ breaks: true, gfm: true, mangle: false, headerIds: false });
    }
    let raw = marked.parse(protectedText || '');
    raw = raw.replace(/@@MATH_(\d+)@@/g, (_, index) => {
        const item = math[Number(index)];
        return item ? renderMathHtml(item.content, item.display) : '';
    });

    const safe = window.DOMPurify
        ? DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel', 'class', 'data-language'], ADD_TAGS: ['span'] })
        : raw;

    const holder = document.createElement('div');
    holder.innerHTML = safe;
    holder.querySelectorAll('a[href]').forEach(a => {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
    });
    enhanceCodeBlocks(holder);
    return holder.innerHTML;
}

function openFull(src) {
    const img = document.getElementById('full-image');
    img.src = src || '';
    document.getElementById('image-viewer').style.display = 'flex';
}

const TUOTUO_API_TOKEN_KEY = 'tuotuo_personal_api_token';
let tuoApiAccessValidated = false;
let tuoApiAccessPromise = null;

function getTuoApiToken() {
    return sessionStorage.getItem(TUOTUO_API_TOKEN_KEY) || '';
}

function clearTuoApiAccess() {
    tuoApiAccessValidated = false;
    sessionStorage.removeItem(TUOTUO_API_TOKEN_KEY);
}

async function fetchTuoApiAccessSession(token) {
    return fetch(`${TUOTUO_API_BASE}/api/auth/session`, {
        headers: { Authorization: `Bearer ${token}` }
    });
}

async function ensureTuoApiAccess() {
    if (tuoApiAccessValidated) return;
    if (tuoApiAccessPromise) return tuoApiAccessPromise;

    tuoApiAccessPromise = (async () => {
        const existingToken = getTuoApiToken();
        if (existingToken) {
            const sessionResponse = await fetchTuoApiAccessSession(existingToken);
            if (sessionResponse.ok) {
                tuoApiAccessValidated = true;
                return;
            }
            clearTuoApiAccess();
        }

        const username = String(window.prompt('请输入用户名（3-24 位；可用小写字母、数字、中文、下划线或连字符）') || '').trim().toLowerCase();
        if (!username) throw new Error('未提供用户名。');
        const password = window.prompt('请输入你的个人密码（首次使用会创建账号，至少 8 个字符）');
        if (!password) throw new Error('未提供个人密码。');

        let loginResponse = await fetch(`${TUOTUO_API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        let loginData = await loginResponse.json().catch(() => ({}));
        if (loginResponse.status === 404) {
            const shouldRegister = window.confirm(`用户名“${username}”尚未注册。要用此用户名创建新账号吗？`);
            if (!shouldRegister) throw new Error('未创建账号。');
            loginResponse = await fetch(`${TUOTUO_API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            loginData = await loginResponse.json().catch(() => ({}));
        }
        if (!loginResponse.ok || !loginData.accessToken) {
            throw new Error(loginData.error || '账号验证失败。');
        }
        sessionStorage.setItem(TUOTUO_API_TOKEN_KEY, loginData.accessToken);
        tuoApiAccessValidated = true;
    })();

    try {
        await tuoApiAccessPromise;
    } finally {
        tuoApiAccessPromise = null;
    }
}

async function tuoApiFetch(path, options = {}, retried = false) {
    await ensureTuoApiAccess();
    const token = getTuoApiToken();
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    const response = await fetch(`${TUOTUO_API_BASE}${path}`, { ...options, headers });
    if (response.status === 401 && !retried) {
        clearTuoApiAccess();
        return tuoApiFetch(path, options, true);
    }
    return response;
}

(function(){
    const s = new Date('2026-04-11');
    const d = Math.max(0, Math.floor((new Date() - s) / 86400000));
    const el = document.getElementById('love-days');
    if (el) el.textContent = d;
})();
