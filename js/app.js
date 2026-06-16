/*
TuoTuo front-end script manifest.

Runtime code is split into ordered classic scripts loaded by index.html.
Classic scripts are kept intentionally because index.html still contains inline event handlers.
Do not load this file together with split scripts, otherwise code will run twice.
*/
// core/00-core-utils.js — Core constants, HTML escaping, markdown/math rendering, image viewer, love-day counter
// config.js — Backend and runtime configuration. Values intentionally kept unchanged.
// features/10-realtime-ws.js — Shared WebSocket connection, message queue, realtime dispatch
// features/20-music.js — Music playlist and controls
// features/30-star-wishes.js — Star wish modal and star-field rendering
// features/40-album.js — Album, Xiamen modal, likes, uploads
// features/50-chat.js — Floating chat widget, login, emoji, message rendering
// features/60-diary.js — Diary calendar, modal, entries, emoji and images
// features/70-gpt-sessions.js — GPT session tree and history helpers
// features/72-gpt-ui.js — GPT sidebar, mode, attachment and ratio UI
// features/74-gpt-chat.js — GPT chat, files, extraction, streaming and message rendering
// features/90-home.js — Home slideshow, global emoji picker, bubbles and startup
