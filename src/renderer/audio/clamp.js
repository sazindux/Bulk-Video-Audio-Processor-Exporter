// Pure math for the music block placement (no DOM). Unit-tested in test/clamp.test.mjs.

/**
 * Clamp a desired music start (seconds) to the valid range.
 * - start >= 0
 * - music shorter than (or equal to) video: start + musicDur <= videoDur
 * - music longer than video: start in [0, videoDur]; the block is trimmed at the video end
 */
export function clampStart(start, musicDur, videoDur) {
  if (!Number.isFinite(start)) start = 0;
  videoDur = Math.max(0, Number(videoDur) || 0);
  musicDur = Math.max(0, Number(musicDur) || 0);
  const max = musicDur <= videoDur ? videoDur - musicDur : videoDur;
  return Math.min(Math.max(0, start), Math.max(0, max));
}

/**
 * Geometry of the music block for a given start.
 * Returns { start, visibleDur, trimmed, endsAt }.
 * visibleDur = how much of the music is heard before the video ends.
 */
export function musicBlock(start, musicDur, videoDur) {
  const s = clampStart(start, musicDur, videoDur);
  const remaining = Math.max(0, videoDur - s);
  const trimmed = musicDur > remaining + 1e-6;
  const visibleDur = trimmed ? remaining : musicDur;
  return { start: s, visibleDur, trimmed, endsAt: s + visibleDur };
}

/** Convert a pixel x inside a lane of width w to seconds. */
export const pxToSec = (x, w, videoDur) => (w > 0 ? (x / w) * videoDur : 0);
export const secToPx = (sec, w, videoDur) => (videoDur > 0 ? (sec / videoDur) * w : 0);

/** Round to ms, avoiding float noise in the offset field. */
export const toMs = (sec) => Math.round(sec * 1000);
