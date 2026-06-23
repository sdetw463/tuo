/* Home slideshow, global emoji picker, bubbles and startup
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
const albums2 = { 22:['22-1.webp','22-2.webp','22-3.webp','22-4.webp','22-5.webp'], 21:['21-1.webp','21-2.webp','21-3.webp','21-4.webp'], 20:['20-1.webp','20-2.webp'], 19:['19-1.webp'] };
let currentAge=22, currentImages=albums2[currentAge], idx=0, cur=document.getElementById('img1'), nxt=document.getElementById('img2'), slideTimer=null, fadeTimer=null, bubbleTimer=null;
const SLIDE_INTERVAL=18000;
let homeRenderingPaused=false;

function isSmartTuoTuoOpen(){ return document.getElementById('gpt-fullscreen')?.classList.contains('show'); }
function isHomeRenderingPaused(){ return homeRenderingPaused || document.hidden || isSmartTuoTuoOpen(); }
function renderDots() { const dc=document.getElementById('dynamic-dots');dc.innerHTML='';if(currentImages.length>1){dc.style.display='flex';for(let i=0;i<currentImages.length;i++){const d=document.createElement('div');d.className='dot';d.onclick=()=>goTo(i);dc.appendChild(d);}}else dc.style.display='none'; }
function updateDots(ai) { document.querySelectorAll('.dot').forEach((d,i)=>d.classList.toggle('active',i===ai)); }

function stopSlideshowTimer(){ if(slideTimer){ clearInterval(slideTimer); slideTimer=null; } }
function startSlideshowTimer(){ stopSlideshowTimer(); if(!isHomeRenderingPaused() && currentImages.length>1) slideTimer=setInterval(sw,SLIDE_INTERVAL); }
function stopBubbleTimer(removeExisting=false){ if(bubbleTimer){ clearInterval(bubbleTimer); bubbleTimer=null; } if(removeExisting) document.querySelectorAll('.floating-bubble').forEach(b=>b.remove()); }
function startBubbleTimer(){ stopBubbleTimer(false); if(isHomeRenderingPaused()) return; bubbleTimer=setInterval(()=>{if(isHomeRenderingPaused())return;const c=Math.floor(Math.random()*2)+1;for(let i=0;i<c;i++)createBubble();},1000); }
function setHomeRenderingPaused(paused){
    const next=Boolean(paused);
    homeRenderingPaused=next;
    document.body.classList.toggle('home-rendering-paused', next);
    document.dispatchEvent(new CustomEvent(next ? 'tuotuo:home-rendering-paused' : 'tuotuo:home-rendering-resumed'));
    if(next){
        stopSlideshowTimer();
        if(fadeTimer){ clearTimeout(fadeTimer); fadeTimer=null; }
        stopBubbleTimer(true);
    }else{
        startSlideshowTimer();
        startBubbleTimer();
    }
}
window.setHomeRenderingPaused=setHomeRenderingPaused;

function sw() {
    if(isHomeRenderingPaused()) return;
    nxt.style.backgroundImage=`url('${currentImages[idx]}')`;
    nxt.style.animation='none';
    void nxt.offsetWidth;
    nxt.style.animation=`imageZoom ${SLIDE_INTERVAL+500}ms ease-out forwards`;
    cur.style.opacity=0;
    nxt.style.opacity=1;
    updateDots(idx);
    if(fadeTimer)clearTimeout(fadeTimer);
    const old=cur;
    fadeTimer=setTimeout(()=>{
        old.style.backgroundImage='none';
        old.style.animation='none';
        fadeTimer=null;
    },1500);
    let t=cur;cur=nxt;nxt=t;
    if(currentImages.length>1)idx=(idx+1)%currentImages.length;
}
function goTo(n) { stopSlideshowTimer();idx=n;sw();startSlideshowTimer(); }
function switchAge(age) { if(currentAge===age)return;currentAge=age;currentImages=albums2[age];document.querySelectorAll('.age-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.age)===age));stopSlideshowTimer();idx=0;renderDots();sw();startSlideshowTimer(); }

const emojiList = "😀,😁,😂,🤣,😊,🥰,😍,🤩,😘,😗,😋,😛,😜,🤪,😝,🤑,🤗,🤭,🤫,🤔,🤐,🤨,😐,😑,😶,😏,😒,🙄,😬,🤥,😌,😔,😪,🤤,😴,😷,🤒,🤕,🤢,🤮,🤧,🥵,🥶,🥴,😵,🤯,🤠,🥳,😎,🤓,🧐,😕,😟,🙁,☹️,😮,😯,😲,😳,🥺,😦,😧,😨,😰,😥,😢,😭,😱,😖,😣,😞,😓,😩,😫,🥱,😤,😡,😠,🤬,😈,👿,💀,☠️,💩,🤡,👹,👺,👻,👽,👾,🤖,❤️,✨,🐱,🐶".split(',');
const emojiPicker = document.getElementById('emoji-picker');
emojiList.forEach(e=>{const s=document.createElement('span');s.style.cursor='pointer';s.style.fontSize='20px';s.innerText=e;s.onclick=()=>insertEmoji(e);emojiPicker.appendChild(s);});

function createBubble(){if(isHomeRenderingPaused())return;const app=document.getElementById('app');if(!app)return;const bubble=document.createElement('div');bubble.className='floating-bubble';const size=Math.random()*30+15;bubble.style.width=size+'px';bubble.style.height=size+'px';bubble.style.left=Math.random()*window.innerWidth+'px';const dur=Math.random()*4+6;bubble.style.animationDuration=dur+'s';bubble.addEventListener('mouseenter',()=>{bubble.style.animation='none';bubble.style.transition='all 0.15s ease-out';bubble.style.transform='scale(1.5)';bubble.style.opacity='0';setTimeout(()=>{if(bubble.parentElement)bubble.remove();},150);});app.appendChild(bubble);setTimeout(()=>{if(bubble.parentElement)bubble.remove();},dur*1000);}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (document.getElementById('diary-overlay').classList.contains('show')) { closeDiaryModal(); return; }
        if (document.getElementById('album-modal').classList.contains('show')) { closeAlbum(); return; }
        if (document.getElementById('gpt-fullscreen').classList.contains('show')) { toggleFullScreenGPT(); return; }
    }
});

document.addEventListener('visibilitychange',()=>{
    if(document.hidden){ stopSlideshowTimer(); stopBubbleTimer(true); }
    else if(!homeRenderingPaused){ startSlideshowTimer(); startBubbleTimer(); }
});

window.onload = () => {
    renderDots(); sw();
    startSlideshowTimer();
    startBubbleTimer();
    connectWebSocket(false);
    initDiaryCalendar();
    requestAnimationFrame(() => { requestAnimationFrame(positionLeftCards); });
};
window.addEventListener('resize', positionLeftCards);
