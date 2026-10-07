// Renderer bootstrap: wire UI modules to the store.
import { initMediaPool, importPaths } from './ui/mediaPool.js';
import { initTimeline } from './audio/timeline.js';
import { state, updateSettings } from './state.js';

initMediaPool();
initTimeline();

// Headless smoke test support (BVAPE_SMOKE=1 in main): auto-import files and report state.
const smoke = await window.bvape.smokeFiles();
if (smoke.length) {
  await importPaths(smoke);
  const v = state.videos.find((x) => x.probe), m = state.music.find((x) => !x.error);
  if (v && m) {
    updateSettings(v.id, { musicId: m.id, offsetMs: 1500, origVol: 0.5, musicVol: 1.5 });
    const { engine } = await import('./audio/engine.js');
    await new Promise((r) => setTimeout(r, 1500));
    engine.play();
    await new Promise((r) => setTimeout(r, 800));
    const blk = document.getElementById('music-block');
    console.log('SMOKE_TL ' + JSON.stringify({ playing: engine.playing, pos: +engine.position.toFixed(2), dur: engine.duration,
      block: { hidden: blk.hidden, left: blk.style.left, width: blk.style.width, trimmed: !document.getElementById('trimmed-badge').hidden },
      time: document.getElementById('time-display').textContent }));
    engine.pause();
  }
  console.log('SMOKE ' + JSON.stringify({
    videos: state.videos.map((x) => ({ n: x.name, d: x.probe?.duration, thumb: !!x.thumb, err: x.error })),
    music: state.music.map((x) => ({ n: x.name, d: x.duration, err: x.error })),
    selected: state.selectedVideoId,
  }));
}
console.log('BOOT_OK');
