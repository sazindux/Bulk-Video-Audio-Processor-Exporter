// Muted video preview card that follows the Web Audio engine (master clock). Never used for export.
import { subscribe, selectedVideo } from '../state.js';
import { engine } from '../audio/engine.js';
import { decide, aspectRatio } from './sync.js';
import { toast } from '../util.js';

const api = window.bvape;
const $ = (id) => document.getElementById(id);
const ui = {};
let shown = { videoId: null, path: null, proxied: false }; // what the <video> currently displays
let loadToken = 0;
let last = { playing: false, pos: 0 };

function apply(actions) {
  const v = ui.video;
  for (const a of actions) {
    if (a.type === 'seek') { if (Number.isFinite(v.duration) || v.readyState > 0) v.currentTime = a.time; else v.dataset.pendingSeek = String(a.time); }
    else if (a.type === 'play') v.play().catch(() => {});
    else if (a.type === 'pause') v.pause();
  }
}

const ctx = () => ({
  enginePlaying: engine.playing, enginePos: engine.position,
  videoTime: ui.video.currentTime, videoPlaying: !ui.video.paused && !ui.video.ended, videoEnded: ui.video.ended,
});

function setStatus(text) { ui.status.textContent = text || ''; ui.status.hidden = !text; }

function clearVideo() {
  ui.video.pause();
  ui.video.removeAttribute('src'); ui.video.removeAttribute('poster'); ui.video.load();
  shown = { videoId: null, path: null, proxied: false };
  ui.card.classList.add('empty'); setStatus('');
}

/** Point the <video> at the selected video (or clear it). Called on selection/videos changes. */
async function loadSelection() {
  const v = selectedVideo();
  const token = ++loadToken;
  if (!v || !v.probe) { if (shown.videoId) api.cancelPreview(); clearVideo(); return; }
  if (shown.videoId === v.id && shown.path === v.path) { if (v.thumb && !ui.video.poster) ui.video.poster = v.thumb; return; }
  if (shown.videoId) api.cancelPreview();
  shown = { videoId: v.id, path: v.path, proxied: false };
  ui.card.classList.remove('empty');
  ui.video.style.aspectRatio = aspectRatio(v.probe.width, v.probe.height);
  if (v.thumb) ui.video.poster = v.thumb;
  setStatus('');
  const r = await api.previewUrl(v.path);
  if (token !== loadToken) return;
  if (!r.ok) { setStatus('Preview unavailable'); return; }
  ui.video.src = r.value;
  apply(decide('select', ctx()));
}

/** Chromium cannot decode the source (HEVC, odd MKV codec): build a small H.264 proxy in main. */
async function fallbackToProxy() {
  const v = selectedVideo();
  if (!v || shown.videoId !== v.id || shown.proxied) { setStatus('Preview unavailable'); return; }
  shown.proxied = true;
  const token = loadToken;
  setStatus('Preparing preview…');
  const r = await api.previewProxy(v.path);
  if (token !== loadToken || shown.videoId !== v.id) return;
  if (!r.ok) { setStatus('Preview unavailable'); if (r.error !== 'cancelled') toast(`Video preview failed: ${r.error}`, 'warn'); return; }
  setStatus('');
  ui.video.src = r.value;
  apply(decide(engine.playing ? 'play' : 'select', ctx()));
}

function onEngine() {
  const playing = engine.playing, pos = engine.position;
  let event = 'tick';
  if (playing !== last.playing) event = playing ? 'play' : (pos >= (selectedVideo()?.probe?.duration || Infinity) ? 'engine-end' : 'pause');
  else if (!playing && pos !== last.pos) event = 'seek';
  last = { playing, pos };
  if (!ui.video.src || ui.card.hidden) return;
  apply(decide(event, ctx()));
}

function setHidden(hidden, persist) {
  ui.card.hidden = hidden;
  ui.toggle.classList.toggle('active', !hidden);
  ui.toggle.title = hidden ? 'Show the muted video preview' : 'Hide the video preview';
  if (persist) api.setPrefs({ previewHidden: hidden });
  if (!hidden) apply(decide(engine.playing ? 'play' : 'select', ctx()));
}

export function initPreview() {
  Object.assign(ui, { card: $('preview-card'), video: $('preview-video'), status: $('preview-status'), toggle: $('btn-preview') });
  ui.video.muted = true; ui.video.defaultMuted = true; ui.video.volume = 0;
  ui.video.addEventListener('volumechange', () => { if (!ui.video.muted) ui.video.muted = true; });
  ui.video.addEventListener('loadedmetadata', () => {
    // Undecodable video codec with a decodable audio track (e.g. HEVC): no error event, but no video dimensions.
    if (!ui.video.videoWidth && !ui.video.videoHeight) return fallbackToProxy();
    if (ui.video.dataset.pendingSeek) { ui.video.currentTime = Number(ui.video.dataset.pendingSeek); delete ui.video.dataset.pendingSeek; }
  });
  ui.video.addEventListener('error', () => { if (ui.video.src) fallbackToProxy(); });
  ui.video.addEventListener('ended', () => apply(decide('ended', ctx())));
  ui.card.addEventListener('click', () => { if (selectedVideo()?.probe) engine.toggle(); });
  ui.toggle.addEventListener('click', () => setHidden(!ui.card.hidden, true));
  api.getPrefs().then((p) => setHidden(!!(p && p.previewHidden), false)).catch(() => {});

  engine.onChange(onEngine);
  subscribe((what) => { if (what === 'selection' || what === 'videos' || what === 'all') loadSelection(); });
  clearVideo();
  loadSelection();
}
