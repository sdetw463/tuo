/* ============================================================
   music.js - 音乐播放器逻辑
============================================================ */

let currentSongIdx = 0;
let isPlaying = false;

// DOM 元素缓存
const bgm = () => document.getElementById('bgm');
const songTitleText = () => document.getElementById('song-title');
const playIconSvg = () => document.getElementById('play-icon-svg');

const SVG_PLAY = '<path d="M8 5v14l11-7z"/>';
const SVG_PAUSE = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';

// 加载歌曲
function loadSong(i) {
    const audio = bgm();
    const title = songTitleText();
    if (!audio || !title) return;

    currentSongIdx = i;
    audio.src = playlist[i].src;
    title.innerText = playlist[i].title;
    title.style.animation = 'none';
    void title.offsetWidth;
    title.style.animation = 'marquee 8s linear infinite';
}

// 播放 / 暂停
function togglePlay() {
    const audio = bgm();
    const svg = playIconSvg();
    if (!audio || !svg) return;

    if (audio.paused) {
        audio.play();
        svg.innerHTML = SVG_PAUSE;
        isPlaying = true;
    } else {
        audio.pause();
        svg.innerHTML = SVG_PLAY;
        isPlaying = false;
    }
}

// 下一首
function nextSong() {
    currentSongIdx = (currentSongIdx + 1) % playlist.length;
    loadSong(currentSongIdx);
    const audio = bgm();
    const svg = playIconSvg();
    if (audio) audio.play();
    if (svg) svg.innerHTML = SVG_PAUSE;
    isPlaying = true;
}

// 上一首
function prevSong() {
    currentSongIdx = (currentSongIdx - 1 + playlist.length) % playlist.length;
    loadSong(currentSongIdx);
    const audio = bgm();
    const svg = playIconSvg();
    if (audio) audio.play();
    if (svg) svg.innerHTML = SVG_PAUSE;
    isPlaying = true;
}

// 初始化音乐播放器
function initMusic() {
    const audio = bgm();
    if (audio) {
        audio.addEventListener('ended', nextSong);
    }
    loadSong(currentSongIdx);
}
