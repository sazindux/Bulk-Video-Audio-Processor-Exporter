// Central store. Mutate via the exported functions only; UI modules subscribe.
import { basename, stripExt, newId } from './util.js';

export const VIDEO_EXT = ['mp4', 'mov', 'mkv'];
export const MUSIC_EXT = ['mp3', 'wav', 'm4a'];

/** Per-video settings defaults (spec: Task 2). */
export function defaultSettings(filePath) {
  return {
    musicId: null,       // id of a music pool entry or null
    origVol: 1,          // 0..2 (0-200%)
    musicVol: 1,         // 0..2
    offsetMs: 0,         // music start offset in ms
    outputName: stripExt(basename(filePath)),
    status: 'queued',    // queued | processing | done | failed
    progress: 0,         // 0..1 during export
    error: null,         // message when failed
    outputPath: null,    // final path when done
  };
}

export const state = {
  videos: [],          // { id, path, name, probe|null, thumb|null (data url), error|null, settings }
  music: [],           // { id, path, name, probe|null, duration, error|null }
  selectedVideoId: null,
  outputDir: null,
  exporting: false,
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let scheduled = false;
/** Batch notifications into one microtask so many mutations trigger one render. */
export function notify(what = 'all') {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; for (const fn of listeners) fn(what); });
}

export function addVideo(path) {
  if (state.videos.some((v) => v.path === path)) return null;
  const v = { id: newId('v'), path, name: basename(path), probe: null, thumb: null, error: null, settings: defaultSettings(path) };
  state.videos.push(v);
  notify('videos');
  return v;
}

export function removeVideo(id) {
  state.videos = state.videos.filter((v) => v.id !== id);
  if (state.selectedVideoId === id) state.selectedVideoId = state.videos[0]?.id ?? null;
  notify('videos');
}

export function clearVideos() { state.videos = []; state.selectedVideoId = null; notify('videos'); }

export function addMusic(path) {
  if (state.music.some((m) => m.path === path)) return null;
  const m = { id: newId('m'), path, name: basename(path), probe: null, duration: 0, error: null };
  state.music.push(m);
  notify('music');
  return m;
}

export function removeMusic(id) {
  state.music = state.music.filter((m) => m.id !== id);
  for (const v of state.videos) if (v.settings.musicId === id) v.settings.musicId = null;
  notify('music');
}

export function clearMusic() {
  state.music = [];
  for (const v of state.videos) v.settings.musicId = null;
  notify('music');
}

export function selectVideo(id) {
  if (state.selectedVideoId === id) return;
  state.selectedVideoId = id;
  notify('selection');
}

export const getVideo = (id) => state.videos.find((v) => v.id === id) || null;
export const getMusic = (id) => state.music.find((m) => m.id === id) || null;
export const selectedVideo = () => getVideo(state.selectedVideoId);

export function updateSettings(videoId, patch) {
  const v = getVideo(videoId);
  if (!v) return;
  Object.assign(v.settings, patch);
  notify('settings');
}

/** Apply one or more settings keys from the source video to every video. */
export function applyToAll(fromVideoId, keys) {
  const src = getVideo(fromVideoId);
  if (!src) return;
  for (const v of state.videos) for (const k of keys) v.settings[k] = src.settings[k];
  notify('settings');
}

export function setOutputDir(dir) { state.outputDir = dir; notify('output'); }
