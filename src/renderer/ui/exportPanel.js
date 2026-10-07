// Export bar: builds the queue payload from state, mirrors main-process events
// into per-video settings (status/progress) and the overall progress bar.
import { state, subscribe, getMusic, updateSettings, notify } from '../state.js';
import { outputExt } from './inspector.js';
import { toast } from '../util.js';
import { engine } from '../audio/engine.js';

const $ = (id) => document.getElementById(id);
const api = window.bvape;
let total = 0;

/** Videos that can be exported (probed, have a video stream). */
export function exportableVideos() {
  return state.videos.filter((v) => v.probe && v.probe.hasVideo && !v.error);
}

export function buildPayload() {
  return {
    outputDir: state.outputDir,
    items: exportableVideos().map((v) => {
      const m = v.settings.musicId ? getMusic(v.settings.musicId) : null;
      return {
        id: v.id,
        video: v.path,
        music: m && !m.error ? m.path : null,
        hasAudio: !!v.probe.hasAudio,
        duration: v.probe.duration,
        origVol: v.settings.origVol,
        musicVol: v.settings.musicVol,
        offsetMs: v.settings.offsetMs,
        outputName: v.settings.outputName,
        ext: outputExt(v),
      };
    }),
  };
}

function renderOverall() {
  const wrap = $('overall-progress');
  const items = state.videos.filter((v) => v.settings.status !== 'queued' || state.exporting);
  const show = state.exporting || items.some((v) => v.settings.status === 'done' || v.settings.status === 'failed');
  wrap.hidden = !show;
  $('btn-cancel').hidden = !state.exporting;
  $('btn-open-folder').hidden = state.exporting || !state.videos.some((v) => v.settings.status === 'done');
  if (!show) return;
  const n = total || exportableVideos().length || 1;
  const sum = state.videos.reduce((acc, v) => {
    const s = v.settings.status;
    return acc + (s === 'done' || s === 'failed' ? 1 : s === 'processing' ? v.settings.progress : 0);
  }, 0);
  const finished = state.videos.filter((v) => v.settings.status === 'done' || v.settings.status === 'failed').length;
  $('overall-bar').style.width = `${Math.round((sum / n) * 100)}%`;
  $('overall-label').textContent = state.exporting ? `Exporting ${Math.min(finished + 1, n)} / ${n}` : `Finished ${finished} / ${n}`;
}

async function startExport() {
  if (state.exporting) return;
  const payload = buildPayload();
  if (!payload.outputDir) return toast('Choose an output folder first', 'warn');
  if (!payload.items.length) return toast('No exportable videos', 'warn');
  engine.pause();
  for (const v of state.videos) Object.assign(v.settings, { status: 'queued', progress: 0, error: null, outputPath: null, verification: null });
  total = payload.items.length;
  state.exporting = true;
  notify('export');
  const r = await api.startExport(payload);
  if (!r.ok) { state.exporting = false; notify('export'); toast(r.error || 'Export failed to start', 'error'); }
}

function onEvent(channel, data) {
  if (channel === 'export:progress') {
    const v = state.videos.find((x) => x.id === data.id);
    if (v) { v.settings.progress = data.progress; notify('export'); }
  } else if (channel === 'export:item') {
    const patch = { status: data.status };
    if (data.status === 'processing') Object.assign(patch, { progress: 0, error: null, outputPath: data.outputPath });
    if (data.status === 'done') Object.assign(patch, { progress: 1, outputPath: data.outputPath, verification: data.verification || null });
    if (data.status === 'failed') Object.assign(patch, { error: data.error || 'Unknown error' });
    if (data.status === 'queued') Object.assign(patch, { progress: 0 });
    updateSettings(data.id, patch);
  } else if (channel === 'export:done') {
    state.exporting = false;
    notify('export');
    const msg = `Export finished: ${data.ok} done, ${data.failed} failed${data.cancelled ? ' (cancelled)' : ''}`;
    toast(data.error ? `${msg} — ${data.error}` : msg, data.failed || data.error ? 'warn' : 'ok', 8000);
    console.log('EXPORT_DONE ' + JSON.stringify(data));
  }
}

export function initExportPanel() {
  $('btn-export').addEventListener('click', startExport);
  $('btn-cancel').addEventListener('click', () => { $('btn-cancel').disabled = true; api.cancelExport(); });
  $('btn-open-folder').addEventListener('click', async () => {
    const r = await api.openFolder(state.outputDir);
    if (!r.ok) toast(r.error, 'error');
  });
  api.onExportEvent(onEvent);
  subscribe(() => { $('btn-cancel').disabled = false; renderOverall(); });
  renderOverall();
}
