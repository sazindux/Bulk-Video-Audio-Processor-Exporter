// Renderer bootstrap: wire UI modules to the store.
import { initMediaPool, importPaths } from './ui/mediaPool.js';
import { state } from './state.js';

initMediaPool();

// Headless smoke test support (BVAPE_SMOKE=1 in main): auto-import files and report state.
const smoke = await window.bvape.smokeFiles();
if (smoke.length) {
  await importPaths(smoke);
  console.log('SMOKE ' + JSON.stringify({
    videos: state.videos.map((v) => ({ n: v.name, d: v.probe?.duration, thumb: !!v.thumb, err: v.error })),
    music: state.music.map((m) => ({ n: m.name, d: m.duration, err: m.error })),
    selected: state.selectedVideoId,
  }));
}
console.log('BOOT_OK');
