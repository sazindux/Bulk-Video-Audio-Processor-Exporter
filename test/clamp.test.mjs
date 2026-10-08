import test from 'node:test';
import assert from 'node:assert';
import { clampStart, musicBlock, pxToSec, secToPx, toMs, minStart, maxStart, dropPlacement, isFileDrag } from '../src/renderer/audio/clamp.js';

test('clampStart: music shorter than video (right bound unchanged)', () => {
  assert.strictEqual(clampStart(20, 10, 60), 20);
  assert.strictEqual(clampStart(55, 10, 60), 50);   // start + 10 <= 60
  assert.strictEqual(clampStart(999, 10, 60), 50);
});

test('clampStart: negative starts are allowed down to -musicDur', () => {
  assert.strictEqual(clampStart(-5, 10, 60), -5);
  assert.strictEqual(clampStart(-10.5, 30, 60), -10.5);
  assert.strictEqual(clampStart(-10, 10, 60), -10);
  assert.strictEqual(clampStart(-11, 10, 60), -10);
  assert.strictEqual(clampStart(-999, 120, 60), -120);
  assert.strictEqual(minStart(42), -42);
  assert.strictEqual(maxStart(10, 60), 50);
  assert.strictEqual(maxStart(120, 60), 60);
});

test('clampStart: music equal to video length ranges -dur..0', () => {
  assert.strictEqual(clampStart(5, 60, 60), 0);
  assert.strictEqual(clampStart(-30, 60, 60), -30);
});

test('clampStart: music longer than video allows -musicDur..videoDur', () => {
  assert.strictEqual(clampStart(30, 120, 60), 30);
  assert.strictEqual(clampStart(70, 120, 60), 60);
  assert.strictEqual(clampStart(-1, 120, 60), -1);
});

test('clampStart: bad inputs are safe', () => {
  assert.strictEqual(clampStart(NaN, 10, 60), 0);
  assert.strictEqual(clampStart(5, NaN, NaN), 0);
  assert.strictEqual(clampStart(5, 10, 0), 0);
  assert.strictEqual(clampStart(-5, NaN, 60), 0);
});

test('musicBlock: positive start, trimmed-end flag and visible duration', () => {
  const b = musicBlock(10, 20, 60);
  assert.deepStrictEqual([b.start, b.visibleStart, b.visibleDur, b.trimmed, b.trimmedStart, b.trimmedEnd, b.skip, b.endsAt], [10, 10, 20, false, false, false, 0, 30]);
  const t = musicBlock(0, 120, 60);
  assert.deepStrictEqual([t.start, t.visibleDur, t.trimmed, t.trimmedEnd, t.endsAt], [0, 60, true, true, 60]);
  const u = musicBlock(40, 120, 60);
  assert.deepStrictEqual([u.start, u.visibleDur, u.trimmedEnd, u.endsAt], [40, 20, true, 60]);
  // Shorter music dragged to the end is clamped, not trimmed
  const c = musicBlock(59, 20, 60);
  assert.deepStrictEqual([c.start, c.visibleDur, c.trimmed, c.endsAt], [40, 20, false, 60]);
});

test('musicBlock: negative start trims the beginning of the track', () => {
  const b = musicBlock(-5, 20, 60);
  assert.deepStrictEqual([b.start, b.visibleStart, b.visibleDur, b.skip, b.trimmedStart, b.trimmedEnd, b.trimmed, b.endsAt], [-5, 0, 15, 5, true, false, true, 15]);
  // Long track shifted left: trimmed on both sides, audible for the whole video
  const l = musicBlock(-30, 120, 60);
  assert.deepStrictEqual([l.start, l.visibleStart, l.visibleDur, l.skip, l.trimmedStart, l.trimmedEnd, l.endsAt], [-30, 0, 60, 30, true, true, 60]);
  // Fully shifted out: nothing audible
  const z = musicBlock(-20, 20, 60);
  assert.deepStrictEqual([z.start, z.visibleDur, z.skip, z.endsAt], [-20, 0, 20, 0]);
  // Over-shift is clamped to -musicDur
  assert.strictEqual(musicBlock(-50, 20, 60).start, -20);
});

test('px <-> sec conversions and ms rounding (sign preserved)', () => {
  assert.strictEqual(pxToSec(500, 1000, 60), 30);
  assert.strictEqual(pxToSec(-100, 1000, 60), -6);
  assert.strictEqual(secToPx(30, 1000, 60), 500);
  assert.strictEqual(pxToSec(10, 0, 60), 0);
  assert.strictEqual(secToPx(10, 100, 0), 0);
  assert.strictEqual(toMs(1.23456), 1235);
  assert.strictEqual(toMs(-10.5), -10500);
});

test('dropPlacement: left edge follows pointer, clamped to the lane', () => {
  // lane 600px, video 60s -> 10px/s; music 10s
  assert.deepStrictEqual(dropPlacement(200, 600, 60, 10), { start: 20, left: 200, width: 100 });
  assert.deepStrictEqual(dropPlacement(-50, 600, 60, 10), { start: 0, left: 0, width: 100 });  // never < 0
  assert.deepStrictEqual(dropPlacement(590, 600, 60, 10), { start: 50, left: 500, width: 100 }); // short music fits
});

test('dropPlacement: long music is trimmed at the video end', () => {
  const g = dropPlacement(300, 600, 60, 120);
  assert.strictEqual(g.start, 30);
  assert.strictEqual(g.width, 300); // remaining 30 s
  assert.deepStrictEqual(dropPlacement(900, 600, 60, 120), { start: 60, left: 600, width: 0 });
});

test('dropPlacement: degenerate inputs are safe', () => {
  assert.deepStrictEqual(dropPlacement(10, 0, 60, 10), { start: 0, left: 0, width: 0 });
  assert.deepStrictEqual(dropPlacement(10, 600, 0, 10), { start: 0, left: 0, width: 0 });
  assert.deepStrictEqual(dropPlacement(10, 600, 60, 0), { start: 0, left: 0, width: 0 });
});

test('isFileDrag: only OS file drags contain "Files"', () => {
  assert.strictEqual(isFileDrag(['Files']), true);
  assert.strictEqual(isFileDrag(['application/x-bvape-music']), false);
  assert.strictEqual(isFileDrag([]), false);
  assert.strictEqual(isFileDrag(undefined), false);
});
