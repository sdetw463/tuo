/* GPT session tree and history helpers
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
let chatSessions = [];
let currentSessionId = null;
let currentGPTMode = 'chat';
let currentReasoningMode = 'normal';
let currentImageRatio = 'auto';
let gptSessionsLoaded = false;
let gptSessionsLoadPromise = null;
const GPT_LOCAL_SESSIONS_KEY = 'tuotuo_local_ai_sessions_v1';

function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeBranchText(text, maxLength = 20) {
    const plain = String(text || '')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, '图片')
        .replace(/\[[^\]]+\]\([^)]+\)/g, '$1')
        .replace(/[#>*`_~-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!plain) return '新的分叉';
    return plain.length > maxLength ? `${plain.slice(0, maxLength)}...` : plain;
}

function deepCloneSessionMessages(messages) {
    return JSON.parse(JSON.stringify(Array.isArray(messages) ? messages : []));
}

function normalizeSessionRecord(raw = {}) {
    const session = {
        ...raw,
        id: String(raw.id || generateSessionId()),
        title: String(raw.title || '新聊天'),
        pinned: !!raw.pinned,
        createdAt: Number(raw.createdAt) || Date.now(),
        updatedAt: Number(raw.updatedAt) || Date.now(),
        messages: Array.isArray(raw.messages) ? raw.messages : [],
        parentSessionId: raw.parentSessionId ? String(raw.parentSessionId) : null,
        rootSessionId: raw.rootSessionId ? String(raw.rootSessionId) : null,
        branchDepth: Number.isFinite(raw.branchDepth) ? Number(raw.branchDepth) : 0,
        branchedFromMessageIndex: Number.isInteger(raw.branchedFromMessageIndex) ? raw.branchedFromMessageIndex : null,
        branchedFromMessagePreview: String(raw.branchedFromMessagePreview || ''),
        needsHistorySeed: !!raw.needsHistorySeed
    };
    return session;
}

function repairSessionTree() {
    const sessionMap = new Map(chatSessions.map(session => [session.id, session]));

    function resolveSessionMeta(session, trail = new Set()) {
        if (trail.has(session.id)) {
            session.parentSessionId = null;
            session.rootSessionId = session.id;
            session.branchDepth = 0;
            session.__treeResolved = true;
            return;
        }

        if (!session.parentSessionId) {
            session.rootSessionId = session.id;
            session.branchDepth = 0;
            session.__treeResolved = true;
            return;
        }

        const parent = sessionMap.get(session.parentSessionId);
        if (!parent || parent.id === session.id) {
            session.parentSessionId = null;
            session.rootSessionId = session.id;
            session.branchDepth = 0;
            session.__treeResolved = true;
            return;
        }

        if (!parent.__treeResolved) {
            const nextTrail = new Set(trail);
            nextTrail.add(session.id);
            resolveSessionMeta(parent, nextTrail);
        }

        session.rootSessionId = parent.rootSessionId || parent.id;
        session.branchDepth = Math.min((parent.branchDepth || 0) + 1, 12);
        session.__treeResolved = true;
    }

    chatSessions.forEach(session => {
        delete session.__treeResolved;
    });

    chatSessions.forEach(session => {
        if (!session.__treeResolved) resolveSessionMeta(session);
    });

    chatSessions.forEach(session => {
        delete session.__treeResolved;
    });
}

function createSessionRecord(overrides = {}) {
    const session = normalizeSessionRecord({
        id: generateSessionId(),
        title: '新聊天',
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        parentSessionId: null,
        rootSessionId: null,
        branchDepth: 0,
        branchedFromMessageIndex: null,
        branchedFromMessagePreview: '',
        needsHistorySeed: false,
        ...overrides
    });
    if (!session.rootSessionId) session.rootSessionId = session.parentSessionId || session.id;
    return session;
}

function getSessionById(id) {
    return chatSessions.find(session => session.id === id);
}

function getDirectChildSessions(parentId) {
    return chatSessions.filter(session => session.parentSessionId === parentId);
}

function getDescendantSessionIds(sessionId) {
    const descendants = [];
    const stack = [sessionId];
    while (stack.length) {
        const current = stack.pop();
        const children = getDirectChildSessions(current);
        children.forEach(child => {
            descendants.push(child.id);
            stack.push(child.id);
        });
    }
    return descendants;
}

function getOrderedSessions() {
    repairSessionTree();
    const sessionMap = new Map(chatSessions.map(session => [session.id, session]));
    const childrenMap = new Map();
    const roots = [];

    chatSessions.forEach(session => {
        childrenMap.set(session.id, []);
    });

    chatSessions.forEach(session => {
        if (session.parentSessionId && sessionMap.has(session.parentSessionId)) {
            childrenMap.get(session.parentSessionId).push(session);
        } else {
            roots.push(session);
        }
    });

    const sortRoots = (a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0);
    };

    const sortChildren = (a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return (a.createdAt || 0) - (b.createdAt || 0) || (a.updatedAt || 0) - (b.updatedAt || 0);
    };

    roots.sort(sortRoots);
    childrenMap.forEach(children => children.sort(sortChildren));

    const ordered = [];
    function walk(session) {
        ordered.push(session);
        (childrenMap.get(session.id) || []).forEach(walk);
    }
    roots.forEach(walk);
    return ordered;
}

function ensureGPTSessionsLoaded() {
    if (gptSessionsLoaded) return Promise.resolve();
    if (gptSessionsLoadPromise) return gptSessionsLoadPromise;
    gptSessionsLoadPromise = Promise.resolve().then(() => {
        const raw = localStorage.getItem(GPT_LOCAL_SESSIONS_KEY);
        const savedSessions = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(savedSessions)) return;
        const localSessions = chatSessions
            .map(s => normalizeSessionRecord(s))
            .filter(s => s && s.id);
        const loadedSessions = savedSessions.map(s => normalizeSessionRecord(s));
        const loadedIds = new Set(loadedSessions.map(s => s.id));
        localSessions.forEach(session => {
            if (!loadedIds.has(session.id)) loadedSessions.unshift(session);
        });
        chatSessions = loadedSessions;
        repairSessionTree();
        if (document.getElementById('gpt-fullscreen').classList.contains('show')) {
            renderHistoryList();
            if (!currentSessionId && chatSessions.length > 0) loadSession(getOrderedSessions()[0].id);
        }
    })
        .catch(err => console.error('读取本地 AI 历史失败:', err))
        .finally(() => {
            gptSessionsLoaded = true;
        });
    return gptSessionsLoadPromise;
}
