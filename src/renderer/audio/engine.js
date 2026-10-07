// Web Audio preview engine: original audio (proxy) + music, each through its own GainNode.
// Playback is scheduled from AudioBufferSourceNodes; a timeline position is derived from ctx.currentTime.
import { musicBlock } from './clamp.js';

const api = window.bvape;
const ctx = new AudioContext({ sampleRate: 48000 });
const decodeCache = new Map(); // path -> Promise<AudioBuffer>

/** Decode a file path (through IPC ArrayBuffer) into an AudioBuffer, cached by path. */
export function decodeFile(path) {
  if (!decodeCache.has(path)) {
    decodeCache.set(path, (async () => {
      const r = await api.readFile(path);
      if (!r.ok) throw new Error(r.error);
      return ctx.decodeAudioData(r.value);
    })().catch((e) => { decodeCache.delete(path); throw e; }));
  }
  return decodeCache.get(path);
}

/** Decode the small audio proxy of a video (extracted by ffmpeg in main). */
export async function decodeVideoAudio(videoPath) {
  const r = await api.audioProxy(videoPath);
  if (!r.ok) throw new Error(r.error);
  return decodeFile(r.value);
}

export function forgetDecoded(path) { decodeCache.delete(path); }

const gainOrig = ctx.createGain();
const gainMusic = ctx.createGain();
gainOrig.connect(ctx.destination);
gainMusic.connect(ctx.destination);

const s = {
  origBuf: null, musicBuf: null,
  videoDur: 0, offset: 0,
  playing: false,
  pos: 0,            // timeline position (s) when paused
  startedAt: 0,      // ctx.currentTime at which pos was 0 (while playing)
  srcOrig: null, srcMusic: null,
  listeners: new Set(),
};

export const engine = {
  get playing() { return s.playing; },
  get duration() { return s.videoDur; },
  /** Current timeline position in seconds. */
  get position() {
    if (!s.playing) return s.pos;
    return Math.min(s.videoDur, ctx.currentTime - s.startedAt);
  },
  onChange(fn) { s.listeners.add(fn); return () => s.listeners.delete(fn); },

  /** Load buffers for the selected video. Either buffer may be null. */
  load({ origBuf, musicBuf, videoDur, offset }) {
    const wasPlaying = s.playing;
    const pos = this.position;
    stopSources();
    s.origBuf = origBuf; s.musicBuf = musicBuf; s.videoDur = videoDur || 0; s.offset = offset || 0;
    s.pos = Math.min(pos, s.videoDur);
    s.playing = false;
    if (wasPlaying && s.videoDur > 0) this.play();
    emit();
  },

  setVolumes(orig, music) {
    gainOrig.gain.setTargetAtTime(orig, ctx.currentTime, 0.01);
    gainMusic.gain.setTargetAtTime(music, ctx.currentTime, 0.01);
  },

  /** Change music offset; reschedules the music source if playing. */
  setOffset(offset) {
    s.offset = offset;
    if (s.playing) { const p = this.position; stopSources(); startSources(p); }
  },

  play() {
    if (s.playing || s.videoDur <= 0) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (s.pos >= s.videoDur - 0.01) s.pos = 0;
    startSources(s.pos);
    s.playing = true;
    emit();
    tick();
  },

  pause() {
    if (!s.playing) return;
    s.pos = this.position;
    stopSources();
    s.playing = false;
    emit();
  },

  toggle() { s.playing ? this.pause() : this.play(); },

  stop() { this.pause(); s.pos = 0; emit(); },

  seek(sec) {
    sec = Math.max(0, Math.min(s.videoDur, sec));
    if (s.playing) { stopSources(); startSources(sec); } else { s.pos = sec; }
    emit();
  },
};

function emit() { for (const fn of s.listeners) fn(engine); }

function stopSources() {
  for (const k of ['srcOrig', 'srcMusic']) {
    if (s[k]) { try { s[k].onended = null; s[k].stop(); } catch { /* already stopped */ } s[k] = null; }
  }
}

/** Start both sources so that timeline position `pos` plays now. */
function startSources(pos) {
  const now = ctx.currentTime;
  s.startedAt = now - pos;
  const remainingVideo = s.videoDur - pos;
  if (remainingVideo <= 0) return;

  if (s.origBuf) {
    const src = ctx.createBufferSource();
    src.buffer = s.origBuf; src.connect(gainOrig);
    if (pos < s.origBuf.duration) src.start(now, pos, Math.min(remainingVideo, s.origBuf.duration - pos));
    s.srcOrig = src;
  }
  if (s.musicBuf) {
    const blk = musicBlock(s.offset, s.musicBuf.duration, s.videoDur);
    const src = ctx.createBufferSource();
    src.buffer = s.musicBuf; src.connect(gainMusic);
    if (pos < blk.start) {
      // Music begins in the future.
      src.start(now + (blk.start - pos), 0, blk.visibleDur);
    } else if (pos < blk.endsAt) {
      const into = pos - blk.start;
      src.start(now, into, blk.visibleDur - into);
    }
    s.srcMusic = src;
  }
}

/** rAF loop: emit position updates and auto-stop at the end of the video. */
function tick() {
  if (!s.playing) return;
  if (engine.position >= s.videoDur) { stopSources(); s.playing = false; s.pos = s.videoDur; emit(); return; }
  emit();
  requestAnimationFrame(tick);
}

/** Compute min/max peaks per column for waveform drawing. */
export function peaks(buffer, columns, fromFrac = 0, toFrac = 1) {
  if (!buffer || columns <= 0) return null;
  const chs = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chs.push(buffer.getChannelData(c));
  // Optional sub-range of the buffer (used to draw only the audible slice of a trimmed track).
  const s0 = Math.max(0, Math.min(buffer.length, Math.floor(fromFrac * buffer.length)));
  const s1 = Math.max(s0, Math.min(buffer.length, Math.floor(toFrac * buffer.length)));
  const step = (s1 - s0) / columns;
  const out = new Float32Array(columns * 2);
  for (let i = 0; i < columns; i++) {
    const a = s0 + Math.floor(i * step), b = Math.min(s1, s0 + Math.floor((i + 1) * step) || a + 1);
    let min = 1, max = -1;
    for (const d of chs) for (let j = a; j < b; j += 1) { const v = d[j]; if (v < min) min = v; if (v > max) max = v; }
    out[i * 2] = min; out[i * 2 + 1] = max;
  }
  return out;
}
