/* ============================================================
   main.js - 幻灯片 & 全局初始化
============================================================ */

// ===================== 幻灯片状态 =====================
let currentAge = 22;
let currentImages = albums2[currentAge];
let idx = 0;
let cur = null;
let nxt = null;
let slideTimer = null;
let fadeTimer = null;

// ===================== 渲染圆点 =====================
function renderDots() {
    const dc = document.getElementById('dynamic-dots');
    if (!dc) return;
    dc.innerHTML = '';

    if (currentImages.length > 1) {
        dc.style.display = 'flex';
        for (let i = 0; i < currentImages.length; i++) {
            const d = document.createElement('div');
            d.className = 'dot';
            d.onclick = () => goTo(i);
            dc.appendChild(d);
        }
    } else {
        dc.style.display = 'none';
    }
}

function updateDots(ai) {
    document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === ai));
}

// ===================== 切换幻灯片 =====================
function sw() {
    if (!cur || !nxt) return;

    nxt.style.backgroundImage = `url('${currentImages[idx]}')`;
    nxt.style.animation = 'none';
    void nxt.offsetWidth;
    nxt.style.animation = `imageZoom ${9000 + 500}ms ease-out forwards`;
    cur.style.opacity = 0;
    nxt.style.opacity = 1;
    updateDots(idx);

    if (fadeTimer) clearTimeout(fadeTimer);
    const old = cur;
    fadeTimer = setTimeout(() => {
        old.style.backgroundImage = 'none';
        old.style.animation = 'none';
    }, 1500);

    let t = cur;
    cur = nxt;
    nxt = t;

    if (currentImages.length > 1) idx = (idx + 1) % currentImages.length;
}

// 跳转到指定幻灯片
function goTo(n) {
    clearInterval(slideTimer);
    idx = n;
    sw();
    if (currentImages.length > 1) slideTimer = setInterval(sw, SLIDE_INTERVAL);
}

// 切换年龄/相册
function switchAge(age) {
    if (currentAge === age) return;
    currentAge = age;
    currentImages = albums2[age];
    document.querySelectorAll('.age-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.age) === age));
    clearInterval(slideTimer);
    idx = 0;
    renderDots();
    sw();
    if (currentImages.length > 1) slideTimer = setInterval(sw, SLIDE_INTERVAL);
}

// ===================== 左侧卡片定位 =====================
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

// ===================== 全局初始化 =====================
window.onload = () => {
    // 缓存幻灯片 DOM 引用
    cur = document.getElementById('img1');
    nxt = document.getElementById('img2');

    // 初始化各模块
    renderDots();
    sw();
    if (currentImages.length > 1) slideTimer = setInterval(sw, SLIDE_INTERVAL);
    connectWebSocket(false);
    initDiaryCalendar();
    initChat();
    initMusic();
    initEffects();
    initAI();
    updateLoveDays();

    // 延迟定位卡片，等待 DOM 稳定
    requestAnimationFrame(() => {
        requestAnimationFrame(positionLeftCards);
    });
};

// 响应式窗口调整
window.addEventListener('resize', positionLeftCards);
