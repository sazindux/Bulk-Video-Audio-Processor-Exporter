// Renderer bootstrap: wire UI modules to the store.
import { initMediaPool, importPaths } from './ui/mediaPool.js';
import { initInspector } from './ui/inspector.js';
import { initExportPanel } from './ui/exportPanel.js';
import { initTimeline } from './audio/timeline.js';
import { initPreview } from './preview/preview.js';
import { engine } from './audio/engine.js';
import { state, setOutputDir } from './state.js';

initMediaPool();
initTimeline();
initInspector();
initExportPanel();
try { initPreview(); } catch (e) { console.error('preview init failed', e); } // preview must never block the rest of the UI

// Headless smoke test support (BVAPE_SMOKE=1 in main): auto-import files and report state.
const smoke = await window.bvape.smokeFiles();
if (smoke.length) {
  await importPaths(smoke);
  const v = state.videos.find((x) => x.probe), m = state.music.find((x) => !x.error);
  if (v && m) {
    const sel = document.getElementById('in-music');
    sel.value = m.id; sel.dispatchEvent(new Event('change'));
    const off = document.getElementById('in-offset'); off.value = '99'; off.dispatchEvent(new Event('change'));
    const vol = document.getElementById('in-orig-vol'); vol.value = '150'; vol.dispatchEvent(new Event('input'));
    const name = document.getElementById('in-output-name'); name.value = 'bad:name.'; name.dispatchEvent(new Event('input'));
    const nameErr = document.getElementById('in-output-name-error').textContent;
    name.dispatchEvent(new Event('blur'));
    document.querySelector('.apply-all[data-apply="music"]').click();
    await new Promise((r) => setTimeout(r, 1200));
    const blk = document.getElementById('music-block');
    console.log('SMOKE_INSPECTOR ' + JSON.stringify({ settings: v.settings, nameErr, allMusic: state.videos.map((x) => x.settings.musicId === m.id),
      block: { hidden: blk.hidden, left: blk.style.left, trimmed: !document.getElementById('trimmed-badge').hidden },
      info: document.getElementById('in-info').textContent.slice(0, 160) }));
    // Smoke export: BVAPE_SMOKE_OUT=<dir> runs the real queue and logs EXPORT_DONE from exportPanel.
    const smokeOut = new URLSearchParams(location.search).get('out');
    if (smokeOut) {
      setOutputDir(smokeOut);
      await new Promise((r) => setTimeout(r, 50));
      document.getElementById('btn-export').click();
      await new Promise((r) => { const t = setInterval(() => { if (!state.exporting) { clearInterval(t); r(); } }, 200); });
      console.log('SMOKE_EXPORT ' + JSON.stringify(state.videos.map((x) => ({ n: x.name, s: x.settings.status, p: x.settings.progress, out: x.settings.outputPath, err: x.settings.error }))));
    }
  }
  // Preview check: the real #preview-video loads via bvape-media:// and follows engine seeks (Range requests).
  if (v) {
    const vid = document.getElementById('preview-video'), card = document.getElementById('preview-card');
    if (card.hidden) document.getElementById('btn-preview').click();
    await new Promise((r) => { const t = setInterval(() => { if (vid.videoWidth && document.getElementById('preview-status').hidden) { clearInterval(t); r(); } }, 100); setTimeout(() => { clearInterval(t); r(); }, 6000); });
    engine.seek(3);
    await new Promise((r) => { vid.onseeked = r; setTimeout(r, 2000); });
    console.log('SMOKE_PREVIEW ' + JSON.stringify({ url: vid.src.slice(0, 16), hidden: card.hidden, muted: vid.muted, duration: vid.duration,
      size: `${vid.videoWidth}x${vid.videoHeight}`, ratio: vid.style.aspectRatio, error: vid.error?.code ?? null, seeked: vid.currentTime, paused: vid.paused }));
  }
  console.log('SMOKE ' + JSON.stringify({
    videos: state.videos.map((x) => ({ n: x.name, d: x.probe?.duration, thumb: !!x.thumb, err: x.error })),
    music: state.music.map((x) => ({ n: x.name, d: x.duration, err: x.error })),
    selected: state.selectedVideoId, outputDir: state.outputDir,
  }));
}
console.log('BOOT_OK');
