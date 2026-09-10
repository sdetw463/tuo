/* TuoTuo progress UI. No dependencies, no raw reasoning, no simulated stages. */
(function (global) {
    'use strict';
    var MAX_ENTRIES = 32, MAX_TEXT = 1600, MAX_MS = 86400000;
    function text(value) {
        return typeof value === 'string' ? value.replace(/\u0000/g, '').slice(0, MAX_TEXT) : '';
    }
    function ms(value) { return Math.max(0, Math.min(MAX_MS, Number(value) || 0)); }
    function escape(value) {
        return String(value).replace(/[&<>"']/g, function (c) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });
    }
    function duration(value) {
        var seconds = Math.floor(ms(value) / 1000);
        if (seconds < 1) return '不到 1 秒';
        if (seconds < 60) return seconds + ' 秒';
        return Math.floor(seconds / 60) + ' 分 ' + (seconds % 60) + ' 秒';
    }
    function normalize(raw) {
        if (!raw || typeof raw !== 'object' || raw.version !== 1) return null;
        var entries = Array.isArray(raw.entries) ? raw.entries.slice(-MAX_ENTRIES) : [];
        entries = entries.filter(function (e) { return e && text(e.text).trim(); }).map(function (e) {
            return {kind:e.kind === 'summary' ? 'summary' : 'status', text:text(e.text), atMs:ms(e.atMs),
                key: typeof e.key === 'string' ? e.key.slice(0, 180) : ''};
        });
        return {version:1, status:raw.status === 'error' || raw.status === 'stopped' ? raw.status : 'completed',
            elapsedMs:ms(raw.elapsedMs), entries:entries};
    }
    function finalLabel(state) {
        return (state.status === 'error' ? '未完成' : state.status === 'stopped' ? '已停止' : '已完成') +
            ' · 用时 ' + duration(state.elapsedMs);
    }
    function itemsHtml(entries) {
        return entries.map(function (e) {
            return '<li class="tt-progress-entry tt-progress-' + e.kind + '">' +
                (e.kind === 'summary' ? '<span class="tt-progress-kind">思考摘要</span>' : '') +
                '<p>' + escape(e.text) + '</p></li>';
        }).join('');
    }
    function markup(label, entries, running) {
        return '<details class="tt-progress' + (running ? ' is-running' : '') + '"' + (running ? ' open' : '') + '>' +
            '<summary class="tt-progress-toggle" title="从本轮请求开始到结束的实际用时，包含网络等待、工具执行和回答生成；不是模型内部推理计时。">' +
            '<span class="tt-progress-title">' + escape(label) + '</span>' +
            '<span class="tt-progress-clock" aria-hidden="true"></span>' +
            '<svg class="tt-progress-chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
            '<path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</summary><div class="tt-progress-panel"><ol class="tt-progress-list">' + itemsHtml(entries) +
            '</ol></div></details>';
    }
    function historyHtml(raw) {
        var state = normalize(raw);
        return state ? markup(finalLabel(state), state.entries, false) : '';
    }
    function create(shell, options) {
        options = options || {};
        var now = options.now || function () { return global.performance && global.performance.now ? global.performance.now() : Date.now(); };
        var started = now(), state = {version:1, status:'running', elapsedMs:0, entries:[]};
        var phase = options.image ? '正在生成图片' : '正在思考';
        var lastStatus = '', finished = false, renderTimer = null;
        shell.insertAdjacentHTML('afterbegin', markup(phase, [], true));
        var details = shell.querySelector('.tt-progress');
        var title = details.querySelector('.tt-progress-title');
        var clock = details.querySelector('.tt-progress-clock');
        var list = details.querySelector('.tt-progress-list');
        var announcer = document.createElement('span');
        announcer.className = 'tt-progress-sr';
        announcer.setAttribute('role', 'status');
        announcer.setAttribute('aria-live', 'polite');
        shell.appendChild(announcer);
        function elapsed() { return ms(now() - started); }
        function tick() { if (!finished) clock.textContent = duration(elapsed()); }
        function paint() {
            renderTimer = null;
            // Only the log changes. Never replace <details>: keyboard focus and the user's open state survive.
            var nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 36;
            list.innerHTML = itemsHtml(state.entries);
            if (nearBottom) list.scrollTop = list.scrollHeight;
        }
        function schedulePaint() {
            if (renderTimer === null) renderTimer = global.setTimeout(paint, 100);
        }
        function setPhase(value) {
            if (phase === value) return;
            phase = value;
            title.textContent = phase;
            announcer.textContent = phase;
        }
        function addStatus(value, tool) {
            if (finished) return;
            var valueText = text(value).replace(/\s+/g, ' ').trim();
            if (!valueText || valueText === lastStatus) return;
            lastStatus = valueText;
            state.entries.push({kind:'status', text:valueText, atMs:elapsed(), key:''});
            if (state.entries.length > MAX_ENTRIES) state.entries.shift();
            if (tool === 'web_search' || /搜索|检索/.test(valueText)) setPhase('正在检索资料');
            else if (tool === 'code_interpreter' || /文件|附件|上传/.test(valueText)) setPhase('正在处理文件');
            else if (tool === 'mcp' || tool === 'function') setPhase('正在使用工具');
            else if (/生成回答|输出回答/.test(valueText)) setPhase('正在回答');
            else if (/图片|画图/.test(valueText)) setPhase('正在生成图片');
            else setPhase('正在思考');
            schedulePaint();
        }
        function summary(key, value, replace) {
            if (finished || typeof value !== 'string' || !value) return;
            key = String(key || 'summary').slice(0, 180);
            var entry = null;
            for (var i = 0; i < state.entries.length; i++) {
                if (state.entries[i].kind === 'summary' && state.entries[i].key === key) entry = state.entries[i];
            }
            if (!entry) {
                entry = {kind:'summary', text:'', atMs:elapsed(), key:key};
                state.entries.push(entry);
                if (state.entries.length > MAX_ENTRIES) state.entries.shift();
            }
            entry.text = text(replace ? value : entry.text + value);
            setPhase('正在思考');
            schedulePaint();
        }
        function finish(status) {
            if (finished) return snapshot();
            finished = true;
            state.status = status === 'error' || status === 'stopped' ? status : 'completed';
            state.elapsedMs = elapsed();
            global.clearInterval(timer);
            if (renderTimer !== null) global.clearTimeout(renderTimer);
            paint();
            details.classList.remove('is-running');
            details.setAttribute('data-result', state.status);
            details.open = false;
            title.textContent = finalLabel(state);
            clock.textContent = '';
            announcer.textContent = finalLabel(state);
            return snapshot();
        }
        function snapshot() {
            return normalize({version:1, status:state.status, elapsedMs:finished ? state.elapsedMs : elapsed(), entries:state.entries});
        }
        var timer = global.setInterval(tick, 1000);
        tick();
        addStatus(options.image ? '已提交图片生成请求，等待服务返回图片。' : '已开始处理本轮请求，等待服务响应。');
        return {status:addStatus, summary:summary, answering:function () { if (!finished) setPhase('正在回答'); },
            finish:finish, snapshot:snapshot, element:details};
    }
    global.GPTProgress = {create:create, normalize:normalize, historyHtml:historyHtml, duration:duration};
})(window);
