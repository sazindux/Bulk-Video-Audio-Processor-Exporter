// Inspector: per-video settings bound to the selected video, "Apply to all", output folder.
import { state, subscribe, selectedVideo, getMusic, updateSettings, applyToAll, setOutputDir } from '../state.js';
import { clampStart, toMs } from '../audio/clamp.js';
import { validateName, sanitizeName } from '../../shared/filename.js';
import { fmtTime, extOf, toast } from '../util.js';

const api = window.bvape;
const $ = (id) => document.getElementById(id);
const f = {};

/** Output extension for a video: .mp4 unless the codec is not MP4-compatible (keep source container). */
export function outputExt(v) {
  return v.probe && !v.probe.mp4Compatible ? `.${extOf(v.path)}` : '.mp4';
}

function pct(x) { return `${Math.round(x * 100)}%`; }

function fillMusicSelect(sel, currentId) {
  const opts = [new Option('(none)', '')];
  for (const m of state.music) if (!m.error) opts.push(new Option(`${m.name} (${fmtTime(m.duration)})`, m.id));
  sel.replaceChildren(...opts);
  sel.value = currentId && getMusic(currentId) ? currentId : '';
}

function render() {
  const v = selectedVideo();
  f.empty.hidden = !!v;
  f.form.hidden = !v;
  if (!v) return;
  const s = v.settings;
  if (document.activeElement !== f.name) { f.name.value = s.outputName; showNameError(validateName(s.outputName)); }
  f.ext.textContent = outputExt(v);
  fillMusicSelect(f.music, s.musicId);
  f.origVol.value = Math.round(s.origVol * 100); f.outOrig.textContent = pct(s.origVol);
  f.musicVol.value = Math.round(s.musicVol * 100); f.outMusic.textContent = pct(s.musicVol);
  if (document.activeElement !== f.offset) f.offset.value = (s.offsetMs / 1000).toFixed(1);
  const m = getMusic(s.musicId);
  f.offset.disabled = !m;
  f.offset.max = v.probe ? (m && m.duration <= v.probe.duration ? v.probe.duration - m.duration : v.probe.duration).toFixed(1) : 0;

  const p = v.probe;
  f.info.replaceChildren();
  if (p) {
    const rows = [
      ['Duration', fmtTime(p.duration)],
      ['Video', `${p.vcodec || '?'} ${p.width}×${p.height}`],
      ['Audio', p.hasAudio ? `${p.acodec} · ${p.sampleRate} Hz · ${p.channels} ch` : 'none (silence will be used)'],
      ['Output', `copy video · AAC 192k · no metadata`],
    ];
    if (!p.mp4Compatible) rows.push(['Warning', `Codec ${p.vcodec} is not MP4-compatible; keeping ${outputExt(v)} container`]);
    if (m && v.probe && m.duration > v.probe.duration - s.offsetMs / 1000) rows.push(['Note', 'Music is trimmed at the video end']);
    if (s.status === 'done' && s.outputPath) rows.push(['Exported', s.outputPath]);
    if (s.status === 'done' && s.verification) rows.push(['Metadata', s.verification.clean ? 'verified clean' : `leftover: ${s.verification.issues.join('; ')}`]);
    if (s.status === 'failed' && s.error) rows.push(['Error', s.error]);
    for (const [k, val] of rows) { const d = document.createElement('div'); d.append(Object.assign(document.createElement('b'), { textContent: k + ': ' }), val); f.info.append(d); }
  } else f.info.textContent = v.error || 'probing…';
}

function showNameError(msg) {
  f.nameErr.hidden = !msg; f.nameErr.textContent = msg || '';
  f.name.classList.toggle('invalid', !!msg);
}

function renderOutput() {
  f.outDir.textContent = state.outputDir || 'not set';
  f.outDir.title = state.outputDir || '';
  f.export.disabled = state.exporting || !state.outputDir || !state.videos.some((v) => v.probe);
}

export function initInspector() {
  Object.assign(f, {
    empty: $('inspector-empty'), form: $('inspector-form'), name: $('in-output-name'), ext: $('in-output-ext'),
    nameErr: $('in-output-name-error'), music: $('in-music'), origVol: $('in-orig-vol'), musicVol: $('in-music-vol'),
    outOrig: $('out-orig-vol'), outMusic: $('out-music-vol'), offset: $('in-offset'), info: $('in-info'),
    outDir: $('output-dir-label'), export: $('btn-export'),
  });

  f.name.addEventListener('input', () => {
    const v = selectedVideo(); if (!v) return;
    const err = validateName(f.name.value);
    showNameError(err);
    if (!err) updateSettings(v.id, { outputName: f.name.value.trim() });
  });
  f.name.addEventListener('blur', () => {
    const v = selectedVideo(); if (!v) return;
    if (validateName(f.name.value)) { f.name.value = sanitizeName(f.name.value); showNameError(null); updateSettings(v.id, { outputName: f.name.value }); }
  });
  f.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') f.name.blur(); });

  f.music.addEventListener('change', () => {
    const v = selectedVideo(); if (!v) return;
    const musicId = f.music.value || null;
    const m = getMusic(musicId);
    // Re-clamp the offset for the new track length.
    const offsetMs = m && v.probe ? toMs(clampStart(v.settings.offsetMs / 1000, m.duration, v.probe.duration)) : v.settings.offsetMs;
    updateSettings(v.id, { musicId, offsetMs });
  });

  f.origVol.addEventListener('input', () => { const v = selectedVideo(); if (v) updateSettings(v.id, { origVol: f.origVol.value / 100 }); });
  f.musicVol.addEventListener('input', () => { const v = selectedVideo(); if (v) updateSettings(v.id, { musicVol: f.musicVol.value / 100 }); });

  const commitOffset = () => {
    const v = selectedVideo(); const m = v && getMusic(v.settings.musicId);
    if (!v || !v.probe || !m) return;
    const sec = clampStart(parseFloat(f.offset.value), m.duration, v.probe.duration);
    f.offset.value = sec.toFixed(1);
    updateSettings(v.id, { offsetMs: toMs(sec) });
  };
  f.offset.addEventListener('change', commitOffset);
  f.offset.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commitOffset(); f.offset.blur(); } });

  for (const btn of document.querySelectorAll('.apply-all')) {
    btn.addEventListener('click', () => {
      const v = selectedVideo(); if (!v) return;
      const key = btn.dataset.apply;
      if (key === 'music') {
        // Assign the same track to all, re-clamping each video's offset.
        const m = getMusic(v.settings.musicId);
        for (const o of state.videos) {
          const offsetMs = m && o.probe ? toMs(clampStart(o.settings.offsetMs / 1000, m.duration, o.probe.duration)) : o.settings.offsetMs;
          updateSettings(o.id, { musicId: v.settings.musicId, offsetMs });
        }
      } else if (key === 'offsetMs') {
        for (const o of state.videos) {
          const m = getMusic(o.settings.musicId);
          updateSettings(o.id, { offsetMs: m && o.probe ? toMs(clampStart(v.settings.offsetMs / 1000, m.duration, o.probe.duration)) : v.settings.offsetMs });
        }
      } else applyToAll(v.id, [key]);
      toast(`Applied to ${state.videos.length} video(s)`, 'ok', 2000);
    });
  }

  $('btn-output-dir').addEventListener('click', async () => {
    const dir = await api.openFolder();
    if (dir) { setOutputDir(dir); api.setPrefs({ outputDir: dir }); }
  });

  subscribe((what) => {
    if (what !== 'output') render();
    renderOutput();
  });
  api.getPrefs().then((p) => { if (p && p.outputDir) setOutputDir(p.outputDir); });
  render(); renderOutput();
}
