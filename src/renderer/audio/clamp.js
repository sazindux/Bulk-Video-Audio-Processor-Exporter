// Pure math for the music block placement (no DOM). Unit-tested in test/clamp.test.mjs.
// Convention: `start` = where music time 0 lands on the video timeline (seconds).
//   start > 0 -> music begins after the video start (silence before it; export uses adelay)
//   start < 0 -> the first |start| seconds of the music are skipped so a later section lines up
//                with the video start (export uses atrim). Allowed down to -musicDur (nothing audible).

/** Smallest allowed start: the whole track may be shifted before the video start. */
export const minStart = (musicDur) => -Math.max(0, Number(musicDur) || 0);

/** Largest allowed start: music that fits must end by the video end; longer music may start anywhere in [.., videoDur]. */
export function maxStart(musicDur, videoDur) {
  videoDur = Math.max(0, Number(videoDur) || 0);
  musicDur = Math.max(0, Number(musicDur) || 0);
  return Math.max(0, musicDur <= videoDur ? videoDur - musicDur : videoDur);
}

/**
 * Clamp a desired music start (seconds) to [-musicDur, maxStart].
 */
export function clampStart(start, musicDur, videoDur) {
  if (!Number.isFinite(start)) start = 0;
  const v = Math.min(Math.max(minStart(musicDur), start), maxStart(musicDur, videoDur));
  return v === 0 ? 0 : v; // normalize -0
}

/**
 * Geometry of the music block for a given start.
 * Returns { start, visibleStart, visibleDur, trimmed, trimmedStart, trimmedEnd, skip, endsAt }.
 * - visibleStart: where the audible part begins on the video timeline (= max(0, start))
 * - visibleDur:   how much of the music is heard (clipped to [0, videoDur])
 * - skip:         seconds skipped at the beginning of the track (= -start when start < 0)
 * - trimmedStart / trimmedEnd: which side(s) are cut; trimmed = either
 */
export function musicBlock(start, musicDur, videoDur) {
  videoDur = Math.max(0, Number(videoDur) || 0);
  musicDur = Math.max(0, Number(musicDur) || 0);
  const s = clampStart(start, musicDur, videoDur);
  const visibleStart = Math.max(0, s);
  const end = Math.min(videoDur, s + musicDur);
  const visibleDur = Math.max(0, end - visibleStart);
  const trimmedStart = s < -1e-6;
  const trimmedEnd = s + musicDur > videoDur + 1e-6;
  return {
    start: s, visibleStart, visibleDur, skip: trimmedStart ? -s : 0,
    trimmed: trimmedStart || trimmedEnd, trimmedStart, trimmedEnd, endsAt: visibleStart + visibleDur,
  };
}

/** Convert a pixel x inside a lane of width w to seconds. */
export const pxToSec = (x, w, videoDur) => (w > 0 ? (x / w) * videoDur : 0);
export const secToPx = (sec, w, videoDur) => (videoDur > 0 ? (sec / videoDur) * w : 0);

/**
 * Placement for a track dropped from the pool at pointer x (px, relative to the lane's left edge).
 * The block's LEFT edge follows the pointer; start is clamped to [0, maxStart] (a drop never skips
 * the beginning of the track). Returns { start, left, width } with left/width in px.
 */
export function dropPlacement(x, laneW, videoDur, musicDur) {
  videoDur = Math.max(0, Number(videoDur) || 0);
  musicDur = Math.max(0, Number(musicDur) || 0);
  if (laneW <= 0 || videoDur <= 0 || musicDur <= 0) return { start: 0, left: 0, width: 0 };
  const start = Math.max(0, clampStart(pxToSec(x, laneW, videoDur), musicDur, videoDur));
  const width = Math.min(musicDur, videoDur - start);
  return { start, left: secToPx(start, laneW, videoDur), width: Math.max(0, secToPx(width, laneW, videoDur)) };
}

/** True when a DataTransfer type list belongs to an OS file drag (import), false for internal drags. */
export const isFileDrag = (types) => Array.from(types || []).includes('Files');

/** Round to ms, avoiding float noise in the offset field (sign preserved). */
export const toMs = (sec) => Math.round(sec * 1000);
