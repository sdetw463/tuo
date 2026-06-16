/* GPT sidebar, mode, attachment and ratio UI
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
function toggleGPTSidebar() {
    const container = document.getElementById('gpt-fullscreen');
    container.classList.toggle('sidebar-collapsed');
}

function toggleGPTSearch() {
    const box = document.getElementById('gpt-sidebar-search');
    const input = document.getElementById('gpt-history-search');
    if (!box) return;

    box.classList.toggle('show');

    if (box.classList.contains('show') && input) {
        setTimeout(() => input.focus(), 50);
    } else if (input) {
        input.value = '';
        renderHistoryList();
    }
}

function getTuoTimeGreeting() {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) return '深夜了哦，还在陪TuoTuo吗？';
    if (hour >= 5 && hour < 11) return '早上好呀，想和TuoTuo聊点什么吗？';
    if (hour >= 11 && hour < 13) return '中午好呀，想和TuoTuo聊点什么吗？';
    if (hour >= 13 && hour < 18) return '下午好呀，想和TuoTuo聊点什么吗？';
    return '晚上好呀，想和TuoTuo聊点什么吗？';
}

function toggleAttachmentMenu(e) {
    e.stopPropagation();
    document.getElementById('gpt-attachment-menu').classList.toggle('show');
}

document.addEventListener('click', (e) => {
    const attachMenu = document.getElementById('gpt-attachment-menu');
    if (attachMenu && !e.target.closest('#gpt-attachment-menu') && !e.target.closest('.gpt-attach-btn')) {
        attachMenu.classList.remove('show');
    }
    const ratioMenu = document.getElementById('gpt-ratio-menu');
    if (ratioMenu && !e.target.closest('#gpt-ratio-menu') && !e.target.closest('.gpt-image-select-btn')) {
        ratioMenu.classList.remove('show');
    }
});

function ratioToIconClass(ratio) {
    return 'ratio-' + String(ratio || 'auto').replace(':', '-');
}

function ratioLabel(ratio) {
    const labels = { auto: '自动', '1:1': '方形 1:1', '3:4': '竖版 3:4', '9:16': '故事版 9:16', '4:3': '横版 4:3', '16:9': '宽屏 16:9' };
    return labels[ratio] || labels.auto;
}

function toggleImageRatioMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('gpt-ratio-menu');
    if (menu) menu.classList.toggle('show');
}

function setImageRatio(ratio) {
    currentImageRatio = ['auto', '1:1', '3:4', '9:16', '4:3', '16:9'].includes(ratio) ? ratio : 'auto';
    const chipText = document.getElementById('gpt-ratio-chip-text');
    const chipIcon = document.getElementById('gpt-ratio-chip-icon');
    if (chipText) chipText.textContent = ratioLabel(currentImageRatio);
    if (chipIcon) chipIcon.className = `gpt-ratio-icon ${ratioToIconClass(currentImageRatio)}`;
    document.querySelectorAll('.gpt-image-option[data-ratio]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ratio === currentImageRatio);
    });
    const menu = document.getElementById('gpt-ratio-menu');
    if (menu) menu.classList.remove('show');
}

function updateImageSettingsVisibility() {
    const settings = document.getElementById('gpt-image-settings');
    if (settings) settings.classList.toggle('show', currentGPTMode === 'image');
    setImageRatio(currentImageRatio);
}

function setGPTModeChipContent(label, variant = 'reasoning') {
    const chip = document.getElementById('gpt-mode-chip');
    if (!chip) return;
    chip.classList.toggle('is-image-mode', variant === 'image');
    if (variant === 'image') {
        chip.innerHTML = `
            <span class="gpt-mode-inline-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="5" width="14" height="14" rx="2.6"></rect>
                    <path d="M3 14l4-4a2 2 0 0 1 2.8 0l4.2 4.2"></path>
                    <circle cx="7.5" cy="9.5" r="1.5"></circle>
                    <path d="M19 3v4"></path>
                    <path d="M21 5h-4"></path>
                    <path d="M21 12v3"></path>
                    <path d="M22.5 13.5h-3"></path>
                </svg>
            </span>
            <span id="gpt-mode-chip-text">${escapeHtml(label)}</span>
        `;
    } else {
        chip.innerHTML = `
            <span id="gpt-mode-chip-text">${escapeHtml(label)}</span>
            <button type="button" class="gpt-mode-exit" onclick="setGPTReasoningMode('normal')" title="退出当前模式">×</button>
        `;
    }
}

function setGPTReasoningMode(mode) {
    if (!['normal', 'think', 'research'].includes(mode)) mode = 'normal';
    currentReasoningMode = mode;
    if (currentGPTMode === 'image') switchToChatMode();

    const thinkItem = document.getElementById('gpt-menu-think');
    const researchItem = document.getElementById('gpt-menu-research');
    if (thinkItem) thinkItem.classList.toggle('active', mode === 'think');
    if (researchItem) researchItem.classList.toggle('active', mode === 'research');

    const chip = document.getElementById('gpt-mode-chip');
    if (chip) {
        if (mode === 'normal') {
            chip.classList.remove('show', 'is-image-mode');
            setGPTModeChipContent('普通', 'reasoning');
        } else {
            chip.classList.add('show');
            setGPTModeChipContent(mode === 'think' ? '思考一下' : '深度研究', 'reasoning');
        }
    }

    const menu = document.getElementById('gpt-attachment-menu');
    if (menu) menu.classList.remove('show');
}

function triggerFileUpload() {
    const uploadInput = document.getElementById('gpt-image-upload');
    if (currentGPTMode === 'image') {
        uploadInput.accept = 'image/*';
    } else {
        uploadInput.accept = 'image/*,.txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.html,.htm,.css,.js,.mjs,.cjs,.ts,.tsx,.jsx,.xml,.yaml,.yml,.py,.java,.c,.cpp,.h,.hpp,.cs,.go,.rs,.php,.rb,.swift,.kt,.sql,.sh,.bat,.ps1,.ini,.toml,.log,.doc,.docx,.xls,.xlsx,.pptx,.pdf';
    }

    uploadInput.click();
    document.getElementById('gpt-attachment-menu').classList.remove('show');
}

function switchToImageMode() {
    currentGPTMode = 'image';
    currentReasoningMode = 'normal';
    document.getElementById('gpt-input-el').placeholder = '让全能画家 TuoTuo 来帮你实现愿望吧...';
    document.getElementById('gpt-fullscreen')?.classList.add('gpt-image-mode');
    document.getElementById('gpt-menu-chat-mode').style.display = 'flex';
    document.getElementById('gpt-top-title').innerHTML = 'TuoTuo <span style="font-size:12px;color:#FFB6C1;background:#FFF0F5;padding:2px 8px;border-radius:10px;margin-left:6px;font-weight:normal;">绘画模式</span>';
    const chip = document.getElementById('gpt-mode-chip');
    if (chip) {
        chip.classList.add('show', 'is-image-mode');
        setGPTModeChipContent('图片', 'image');
    }
    updateImageSettingsVisibility();
    const thinkItem = document.getElementById('gpt-menu-think');
    const researchItem = document.getElementById('gpt-menu-research');
    if (thinkItem) thinkItem.classList.remove('active');
    if (researchItem) researchItem.classList.remove('active');
    clearGPTFile();
    document.getElementById('gpt-attachment-menu').classList.remove('show');
}

function switchToChatMode() {
    currentGPTMode = 'chat';
    document.getElementById('gpt-input-el').placeholder = '有什么想问 TuoTuo 的？';
    document.getElementById('gpt-fullscreen')?.classList.remove('gpt-image-mode');
    document.getElementById('gpt-menu-chat-mode').style.display = 'none';
    document.getElementById('gpt-top-title').innerHTML = 'TuoTuo';
    updateImageSettingsVisibility();
    const chip = document.getElementById('gpt-mode-chip');
    if (chip) {
        chip.classList.remove('is-image-mode');
        if (currentReasoningMode === 'normal') {
            chip.classList.remove('show');
            setGPTModeChipContent('普通', 'reasoning');
        } else {
            chip.classList.add('show');
            setGPTModeChipContent(currentReasoningMode === 'think' ? '思考一下' : '深度研究', 'reasoning');
        }
    }
    document.getElementById('gpt-attachment-menu').classList.remove('show');
}

