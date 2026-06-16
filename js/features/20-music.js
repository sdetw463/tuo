/* Music playlist and controls
   Split from legacy js/app.js; loaded as a classic script to preserve inline handler compatibility. */
const playlist = [
    { title: "Nintendo-Sound-Team-Welcome-Horizons", src: "bgm.mp3" },
    { title: "Oneul-Morning-Peppermint", src: "bgm2.mp3" },
    { title: "선샤인(Sunshine) - 圣诞快乐", src: "bgm3.mp3" }
];
let currentSongIdx = 0;
const bgm = document.getElementById('bgm'), songTitleText = document.getElementById('song-title'), playIconSvg = document.getElementById('play-icon-svg');
const svgPlay='<path d="M8 5v14l11-7z"/>', svgPause='<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
function loadSong(i) { bgm.src=playlist[i].src; songTitleText.innerText=playlist[i].title; songTitleText.style.animation='none'; void songTitleText.offsetWidth; songTitleText.style.animation='marquee 8s linear infinite'; }
function togglePlay() { if(bgm.paused){bgm.play();playIconSvg.innerHTML=svgPause;}else{bgm.pause();playIconSvg.innerHTML=svgPlay;} }
function nextSong() { currentSongIdx=(currentSongIdx+1)%playlist.length; loadSong(currentSongIdx); bgm.play(); playIconSvg.innerHTML=svgPause; }
function prevSong() { currentSongIdx=(currentSongIdx-1+playlist.length)%playlist.length; loadSong(currentSongIdx); bgm.play(); playIconSvg.innerHTML=svgPause; }
bgm.addEventListener('ended',nextSong); loadSong(currentSongIdx);

