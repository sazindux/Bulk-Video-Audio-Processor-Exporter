// Audio-only timeline: waveform of the original audio, draggable music block, playhead, transport.
import { state, subscribe, selectedVideo, getMusic, updateSettings } from '../state.js';
import { engine, decodeVideoAudio, decodeFile, peaks } from './engine.js';
import { musicBlock, clampStart, pxToSec, secToPx, toMs } from './clamp.js';
import { fmtTime, toast } from '../util.js';

const $ = (id) => document.getElementById(id);
const ui = {};
let loadToken = 0;             // guards against out-of-order async loads
let cur = { videoId: null, musicId: null, origBuf: null, musicBuf: null, origPeaks: null, musicPeaks: null };

/* ---------- drawing ---------- */

function fitCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return { w, h, dpr };
}

function drawWave(canvas, pk, color, emptyText) {
  const { w, h } = fitCanvas(canvas);
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  if (!pk) {
    if (emptyText) {
      g.fillStyle = '#8b93a7'; g.font = `${12 * (window.devicePixelRatio || 1)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(emptyText, w / 2, h / 2);
    }
    return;
  }
  const cols = pk.length / 2, mid = h / 2;
  g.fillStyle = color;
  for (let i = 0; i < cols; i++) {
    const x = (i / cols) * w;
    const y1 = mid + pk[i * 2] * mid * 0.95, y2 = mid + pk[i * 2 + 1] * mid * 0.95;
    g.fillRect(x, Math.min(y1, y2), Math.max(1, w / cols), Math.max(1, Math.abs(y2 - y1)));
  }
  g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(0, mid, w, 1);
}

function drawRuler(videoDur) {
  const r = ui.ruler; r.replaceChildren();
  if (videoDur <= 0) return;
  const w = r.clientWidth, targetPx = 80;
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((st) => secToPx(st, w, videoDur) >= targetPx) || steps.at(-1);
  for (let t = 0; t <= videoDur + 1e-6; t += step) {
    const sp = document.createElement('span');
    sp.style.left = `${secToPx(t, w, videoDur)}px`; sp.textContent = fmtTime(t);
    r.append(sp);
  }
}

/** Reposition the music block for the current settings (cheap; called on drag and settings change). */
function layoutMusicBlock() {
  const v = selectedVideo();
  const m = v && getMusic(v.settings.musicId);
  if (!v || !v.probe || !m || !m.duration) { ui.block.hidden = true; return; }
  const lane = ui.lane.clientWidth, vd = v.probe.duration;
  const blk = musicBlock(v.settings.offsetMs / 1000, m.duration, vd);
  ui.block.hidden = false;
  // Negative start: the audible slice begins at x=0 and the skipped part is "off-screen" to the left.
  ui.block.style.left = `${secToPx(blk.visibleStart, lane, vd)}px`;
  ui.block.style.width = `${Math.max(4, secToPx(blk.visibleDur, lane, vd))}px`;
  ui.block.classList.toggle('trimmed-start', blk.trimmedStart);
  ui.block.classList.toggle('trimmed-end', blk.trimmedEnd);
  ui.block.classList.toggle('silent', blk.visibleDur <= 1e-6);
  ui.trimmed.hidden = !blk.trimmedEnd;
  ui.trimmedStart.hidden = !blk.trimmedStart;
  if (blk.trimmedStart) ui.trimmedStart.textContent = `◀ skips ${fmtTime(blk.skip)}`;
  ui.musicLabel.textContent = m.name;
  ui.block.title = blk.trimmedStart
    ? `${m.name}\nStarts ${fmtTime(blk.skip)} into the track (music start ${blk.start.toFixed(1)} s). Drag right to hear the beginning.`
    : `${m.name}\nMusic start ${blk.start.toFixed(1)} s. Drag left past 0 to skip the beginning of the track.`;
  // Music waveform: draw the audible slice [skip, skip+visibleDur] of the track stretched to the block width.
  if (cur.musicBuf) {
    const { w } = fitCanvas(ui.musicCanvas);
    const cols = Math.max(1, Math.round(w));
    const fromFrac = Math.min(1, blk.skip / m.duration), toFrac = Math.min(1, (blk.skip + blk.visibleDur) / m.duration);
    if (!cur.musicPeaks || cur.musicPeaks.cols !== cols || cur.musicPeaks.fromFrac !== fromFrac || cur.musicPeaks.toFrac !== toFrac) {
      cur.musicPeaks = { cols, fromFrac, toFrac, data: peaks(cur.musicBuf, cols, fromFrac, toFrac) };
    }
    drawWave(ui.musicCanvas, cur.musicPeaks.data, 'rgba(245,165,36,.75)');
  } else drawWave(ui.musicCanvas, null, '', '');
}

function redrawAll() {
  const v = selectedVideo();
  const vd = v?.probe?.duration || 0;
  ui.empty.hidden = !!(v && v.probe);
  ui.title.textContent = v ? v.name : 'No video selected';
  ui.play.disabled = ui.stop.disabled = !(v && v.probe);
  if (!v || !v.probe) { ui.playhead.hidden = true; ui.block.hidden = true; drawWave(ui.waveCanvas, null); ui.ruler.replaceChildren(); return; }
  const { w } = fitCanvas(ui.waveCanvas);
  if (cur.origBuf && (!cur.origPeaks || cur.origPeaks.length !== w * 2)) cur.origPeaks = peaks(cur.origBuf, w);
  drawWave(ui.waveCanvas, cur.origBuf ? cur.origPeaks : null, 'rgba(79,140,255,.8)',
    v.probe.hasAudio ? (cur.origBuf ? '' : 'loading…') : 'no audio track');
  drawRuler(vd);
  layoutMusicBlock();
  updatePlayhead();
}

function updatePlayhead() {
  const v = selectedVideo();
  const vd = v?.probe?.duration || 0;
  const pos = engine.position;
  ui.time.textContent = `${fmtTime(pos)} / ${fmtTime(vd)}`;
  ui.play.innerHTML = engine.playing ? '&#10074;&#10074;' : '&#9654;';
  if (vd <= 0) { ui.playhead.hidden = true; return; }
  ui.playhead.hidden = false;
  const laneRect = ui.lane.getBoundingClientRect(), bodyRect = ui.body.getBoundingClientRect();
  ui.playhead.style.left = `${laneRect.left - bodyRect.left + secToPx(pos, laneRect.width, vd)}px`;
}

/* ---------- loading ---------- */

async function loadSelection() {
  const v = selectedVideo();
  const token = ++loadToken;
  const musicId = v?.settings.musicId || null;
  const m = musicId ? getMusic(musicId) : null;
  const videoChanged = cur.videoId !== (v?.id ?? null);
  if (videoChanged) { cur.origBuf = null; cur.origPeaks = null; engine.stop(); }
  if (cur.musicId !== musicId) { cur.musicBuf = null; cur.musicPeaks = null; }
  cur.videoId = v?.id ?? null; cur.musicId = musicId;
  redrawAll();
  if (!v || !v.probe) { engine.load({ origBuf: null, musicBuf: null, videoDur: 0, offset: 0 }); return; }

  const [orig, music] = await Promise.all([
    !cur.origBuf && v.probe.hasAudio ? decodeVideoAudio(v.path).catch((e) => { toast(`Audio preview failed: ${e.message}`, 'error'); return null; }) : cur.origBuf,
    !cur.musicBuf && m && !m.error ? decodeFile(m.path).catch((e) => { toast(`Music decode failed: ${e.message}`, 'error'); return null; }) : cur.musicBuf,
  ]);
  if (token !== loadToken) return; // selection changed meanwhile
  cur.origBuf = orig; cur.musicBuf = music; cur.origPeaks = null; cur.musicPeaks = null;
  engine.load({ origBuf: orig, musicBuf: music, videoDur: v.probe.duration, offset: v.settings.offsetMs / 1000 });
  engine.setVolumes(v.settings.origVol, v.settings.musicVol);
  redrawAll();
}

/* ---------- interaction ---------- */

function setupDrag() {
  let drag = null;
  ui.block.addEventListener('pointerdown', (e) => {
    const v = selectedVideo(); const m = v && getMusic(v.settings.musicId);
    if (!v || !m) return;
    e.preventDefault(); e.stopPropagation();
    ui.block.setPointerCapture(e.pointerId);
    drag = { x0: e.clientX, start0: v.settings.offsetMs / 1000, v, m };
    ui.block.classList.add('dragging');
  });
  ui.block.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const vd = drag.v.probe.duration;
    const dx = pxToSec(e.clientX - drag.x0, ui.lane.clientWidth, vd);
    // Range is [-musicDur, maxStart]: dragging left past 0 skips the beginning of the track.
    const start = clampStart(drag.start0 + dx, drag.m.duration, vd);
    updateSettings(drag.v.id, { offsetMs: toMs(start) });
    engine.setOffset(start);
    layoutMusicBlock();
  });
  const end = () => { if (drag) { ui.block.classList.remove('dragging'); drag = null; } };
  ui.block.addEventListener('pointerup', end);
  ui.block.addEventListener('pointercancel', end);
}

function seekFromEvent(e) {
  const v = selectedVideo(); if (!v || !v.probe) return;
  const r = ui.lane.getBoundingClientRect();
  engine.seek(pxToSec(e.clientX - r.left, r.width, v.probe.duration));
}

export function initTimeline() {
  Object.assign(ui, {
    title: $('timeline-title'), play: $('btn-play'), stop: $('btn-stop'), time: $('time-display'),
    body: $('timeline-body'), waveCanvas: $('wave-canvas'), lane: $('music-lane'), block: $('music-block'),
    musicCanvas: $('music-canvas'), musicLabel: $('music-label'), trimmed: $('trimmed-badge'), trimmedStart: $('trimmed-start-badge'),
    ruler: $('ruler'), playhead: $('playhead'), empty: $('timeline-empty'),
  });
  ui.play.addEventListener('click', () => engine.toggle());
  ui.stop.addEventListener('click', () => engine.stop());
  ui.waveCanvas.addEventListener('pointerdown', seekFromEvent);
  ui.lane.addEventListener('pointerdown', seekFromEvent);
  ui.ruler.addEventListener('pointerdown', seekFromEvent);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) { e.preventDefault(); engine.toggle(); }
  });
  setupDrag();
  engine.onChange(updatePlayhead);
  new ResizeObserver(() => redrawAll()).observe(ui.body);

  subscribe((what) => {
    const v = selectedVideo();
    if (what === 'selection' || what === 'videos' || what === 'music' || what === 'all') return loadSelection();
    if (what === 'settings' && v) {
      if (v.settings.musicId !== cur.musicId) return loadSelection();
      engine.setVolumes(v.settings.origVol, v.settings.musicVol);
      engine.setOffset(v.settings.offsetMs / 1000);
      layoutMusicBlock();
    }
  });
  loadSelection();
}
