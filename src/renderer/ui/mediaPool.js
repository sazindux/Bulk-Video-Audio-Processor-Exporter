// Media pool: import (dialog + drag-and-drop), video list with thumbnails, music list with preview.
import {
  state, subscribe, addVideo, addMusic, removeVideo, removeMusic, clearVideos, clearMusic,
  selectVideo, VIDEO_EXT, MUSIC_EXT,
} from '../state.js';
import { notify } from '../state.js';
import { el, extOf, fmtTime, toast, blobUrl } from '../util.js';
import { isFileDrag } from '../audio/clamp.js';
import { beginMusicDrag, endMusicDrag } from './musicDrag.js';

const api = window.bvape;
const $ = (id) => document.getElementById(id);

/* ---------- import ---------- */

export async function importPaths(paths) {
  const videos = paths.filter((p) => VIDEO_EXT.includes(extOf(p)));
  const music = paths.filter((p) => MUSIC_EXT.includes(extOf(p)));
  const skipped = paths.length - videos.length - music.length;
  if (skipped) toast(`${skipped} file(s) skipped (unsupported type)`, 'warn');
  const added = [...videos.map((p) => ({ p, v: addVideo(p) })).filter((x) => x.v), ...music.map((p) => ({ p, m: addMusic(p) })).filter((x) => x.m)];
  // Probe sequentially-ish (3 at a time) to keep the main process responsive.
  const queue = added.slice();
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item.v) await loadVideo(item.v); else await loadMusic(item.m);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (!state.selectedVideoId && state.videos.length) selectVideo(state.videos[0].id);
}

async function loadVideo(v) {
  const r = await api.probe(v.path);
  if (!r.ok) { v.error = r.error; notify('videos'); toast(`${v.name}: ${r.error}`, 'error', 8000); return; }
  if (!r.value.hasVideo) { removeVideo(v.id); toast(`${v.name}: no video stream, skipped`, 'warn'); return; }
  v.probe = r.value;
  notify('videos');
  const t = await api.thumbnail(v.path, v.probe.duration);
  if (t.ok) {
    const buf = await api.readFile(t.value);
    if (buf.ok) v.thumb = blobUrl(buf.value, 'image/jpeg');
  }
  notify('videos');
}

async function loadMusic(m) {
  const r = await api.probe(m.path);
  if (!r.ok || !r.value.hasAudio) { m.error = r.ok ? 'no audio stream' : r.error; toast(`${m.name}: ${m.error}`, 'error', 8000); }
  else { m.probe = r.value; m.duration = r.value.duration; }
  notify('music');
}

/* ---------- drag & drop ---------- */

/** OS-file import drop zone. Internal drags (music -> timeline) carry no "Files" type and are ignored here. */
function setupDrop(target, filterExt) {
  let depth = 0;
  target.addEventListener('dragenter', (e) => { if (!isFileDrag(e.dataTransfer.types)) return; e.preventDefault(); depth++; target.classList.add('over'); });
  target.addEventListener('dragover', (e) => { if (!isFileDrag(e.dataTransfer.types)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  target.addEventListener('dragleave', (e) => { if (!isFileDrag(e.dataTransfer.types)) return; if (--depth <= 0) { depth = 0; target.classList.remove('over'); } });
  target.addEventListener('drop', (e) => {
    if (!isFileDrag(e.dataTransfer.types)) return;
    e.preventDefault(); e.stopPropagation(); depth = 0; target.classList.remove('over');
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    const filtered = filterExt ? paths.filter((p) => filterExt.includes(extOf(p))) : paths;
    if (filterExt && filtered.length !== paths.length) toast(`${paths.length - filtered.length} file(s) ignored: wrong type for this list`, 'warn');
    importPaths(filtered);
  });
}

/* ---------- music preview ---------- */

const preview = { audio: new Audio(), id: null, url: null };
preview.audio.addEventListener('ended', () => stopPreview());
preview.audio.addEventListener('error', () => { toast('Cannot play this track', 'error'); stopPreview(); });

export function stopPreview() {
  preview.audio.pause();
  if (preview.url) URL.revokeObjectURL(preview.url);
  preview.url = null; preview.id = null;
  notify('music');
}

async function togglePreview(m) {
  if (preview.id === m.id) return stopPreview();
  stopPreview();
  const r = await api.readFile(m.path);
  if (!r.ok) return toast(r.error, 'error');
  preview.url = blobUrl(r.value, 'audio/*');
  preview.id = m.id;
  preview.audio.src = preview.url;
  preview.audio.play().catch(() => stopPreview());
  notify('music');
}

/* ---------- rendering ---------- */

const STATUS_BADGE = { processing: 'processing', done: 'ok', failed: 'error' };

function renderVideos() {
  const list = $('video-list');
  list.replaceChildren(...state.videos.map((v) => {
    const s = v.settings;
    const sub = v.error ? v.error : v.probe
      ? `${fmtTime(v.probe.duration)} · ${v.probe.vcodec || '?'}${v.probe.hasAudio ? '' : ' · no audio'}`
      : 'probing…';
    const badges = [];
    if (v.probe && !v.probe.mp4Compatible) badges.push(el('span', { class: 'badge warn', text: extOf(v.path), title: 'Codec not MP4-compatible: source container is kept' }));
    if (s.status !== 'queued') badges.push(el('span', { class: `badge ${STATUS_BADGE[s.status] || ''}`, text: s.status, title: s.error || s.outputPath || '' }));
    if (s.status === 'done' && s.verification && !s.verification.clean) badges.push(el('span', { class: 'badge warn', text: 'tags', title: 'Metadata left in output: ' + s.verification.issues.join('; ') }));
    const meta = el('div', { class: 'meta' },
      el('span', { class: 'name ellipsis', text: v.name, title: v.path }),
      el('span', { class: 'sub ellipsis', text: sub, title: sub }),
      s.status === 'processing' ? el('div', { class: 'mini-progress' }, el('div', { style: `width:${Math.round(s.progress * 100)}%` })) : null);
    const thumb = v.thumb ? el('img', { class: 'thumb', src: v.thumb, alt: '' })
      : el('div', { class: 'thumb placeholder', text: v.error ? '!' : '…' });
    return el('li', {
      class: `item${v.id === state.selectedVideoId ? ' selected' : ''}${v.error ? ' has-error' : ''}`,
      onclick: () => selectVideo(v.id),
    }, thumb, meta, ...badges,
    el('button', { class: 'remove', title: 'Remove', text: '✕', onclick: (e) => { e.stopPropagation(); removeVideo(v.id); } }));
  }));
  $('video-count').textContent = state.videos.length;
}

function renderMusic() {
  const list = $('music-list');
  list.replaceChildren(...state.music.map((m) => {
    const playing = preview.id === m.id;
    const sub = m.error ? m.error : m.probe ? `${fmtTime(m.duration)} · ${m.probe.acodec} · ${m.probe.sampleRate} Hz` : 'probing…';
    const draggable = !m.error && m.duration > 0;
    return el('li', {
      class: `item${draggable ? ' draggable' : ''}`, draggable: draggable ? 'true' : 'false',
      title: draggable ? 'Drag onto the timeline to use this track' : '',
      ondragstart: (e) => { if (!draggable) return e.preventDefault(); beginMusicDrag(e, m.id); e.currentTarget.classList.add('dragging'); },
      ondragend: (e) => { endMusicDrag(); e.currentTarget.classList.remove('dragging'); },
    },
      el('button', { class: `play${playing ? ' playing' : ''}`, title: playing ? 'Stop' : 'Preview', text: playing ? '■' : '▶', disabled: !!m.error,
        onclick: (e) => { e.stopPropagation(); togglePreview(m); } }),
      el('div', { class: 'meta' },
        el('span', { class: 'name ellipsis', text: m.name, title: m.path }),
        el('span', { class: 'sub ellipsis', text: sub })),
      el('button', { class: 'remove', title: 'Remove', text: '✕', onclick: () => { if (preview.id === m.id) stopPreview(); removeMusic(m.id); } }));
  }));
  $('music-count').textContent = state.music.length;
}

export function initMediaPool() {
  $('btn-add-videos').addEventListener('click', async () => importPaths(await api.openFiles('video')));
  $('btn-add-music').addEventListener('click', async () => importPaths(await api.openFiles('music')));
  $('btn-clear-videos').addEventListener('click', () => { if (!state.exporting) clearVideos(); });
  $('btn-clear-music').addEventListener('click', () => { stopPreview(); clearMusic(); });
  setupDrop($('video-drop').parentElement, VIDEO_EXT);
  setupDrop($('music-drop').parentElement, MUSIC_EXT);
  setupDrop(document.getElementById('timeline'), null); // anywhere else: auto-sort by extension
  // Block the default navigate-on-drop everywhere else.
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  subscribe((what) => {
    if (what === 'videos' || what === 'selection' || what === 'settings' || what === 'all') renderVideos();
    if (what === 'music' || what === 'all') renderMusic();
  });
  renderVideos(); renderMusic();
}
