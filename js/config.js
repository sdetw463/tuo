/* ============================================================
   config.js - 全局配置常量
============================================================ */

// 固定游客 ID：避免游客每次刷新/点赞都变成不同人
const TUOTUO_GUEST_ID = (() => {
    let id = localStorage.getItem('tuotuo_guest_id');
    if (!id) {
        id = 'guest_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('tuotuo_guest_id', id);
    }
    return id;
})();

// WebSocket 配置
const CHAT_CONFIG = {
    wsHost: 'tuotuo-c2bvb3agbqh0c3ce.eastasia-01.azurewebsites.net',
    reconnectInterval: 3000
};

// AI API 配置
const AI_CONFIG = {
    chatApi: 'https://tuotuo-c2bvb3agbqh0c3ce.eastasia-01.azurewebsites.net/api/ai-chat',
    imageApi: 'https://tuotuo-c2bvb3agbqh0c3ce.eastasia-01.azurewebsites.net/api/ai-image'
};

// 相册数据（本地内存）
const albumData = {
    'album_food': [],
    'album_scenery': [],
    'album_portrait': []
};

// 日记数据存储（本地内存）
const diaryStore = {};

// 聊天表情列表
const emojiList = "😀,😁,😂,🤣,😊,🥰,😍,🤩,😘,😗,😋,😛,😜,🤪,😝,🤑,🤗,🤭,🤫,🤔,🤐,🤨,😐,😑,😶,😏,😒,🙄,😬,🤥,😌,😔,😪,🤤,😴,😷,🤒,🤕,🤢,🤮,🤧,🥵,🥶,🥴,😵,🤯,🤠,🥳,😎,🤓,🧐,😕,😟,🙁,☹️,😮,😯,😲,😳,🥺,😦,😧,😨,😰,😥,😢,😭,😱,😖,😣,😞,😓,😩,😫,🥱,😤,😡,😠,🤬,😈,👿,💀,☠️,💩,🤡,👹,👺,👻,👽,👾,🤖,❤️,✨,🐱,🐶".split(',');

// 日记表情列表
const diaryEmojiList = "😀,😂,🥰,😍,🤩,😘,😋,😎,🥳,😭,😱,🤔,🤗,😴,🥺,😤,🙄,💀,🔥,✨,💕,❤️,🌸,🌙,⭐,🎉,🎊,🍜,🍦,🎂,🍰,☕,🌈,🐱,🐰,🐶,🌷,🌻,💐,🎵,📷,✈️,🏖️,🌅,🌃,🎬,📚,🎮,🌿".split(',');

// 音乐播放列表
const playlist = [
    { title: "Nintendo-Sound-Team-Welcome-Horizons", src: "assets/audio/bgm.mp3" },
    { title: "Oneul-Morning-Peppermint", src: "assets/audio/bgm2.mp3" },
    { title: "선샤인(Sunshine) - 圣诞快乐", src: "assets/audio/bgm3.mp3" }
];

// 幻灯片数据（年份对应图片列表）
const albums2 = {
    22: ['assets/images/22-1.webp', 'assets/images/22-2.webp', 'assets/images/22-3.webp', 'assets/images/22-4.webp', 'assets/images/22-5.webp'],
    21: ['assets/images/21-1.webp', 'assets/images/21-2.webp', 'assets/images/21-3.webp', 'assets/images/21-4.webp'],
    20: ['assets/images/20-1.webp', 'assets/images/20-2.webp'],
    19: ['assets/images/19-1.webp']
};

// 幻灯片配置
const SLIDE_INTERVAL = 9000;

// SVG 图标模板
const SVG_ICONS = {
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
    prev: '<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>',
    next: '<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>',
    send: '<path d="M12 4l-8 8h6v8h4v-8h6z"/>',
    stop: '<path d="M6 6h12v12H6z"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    star: '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>',
    upload: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>'
};
