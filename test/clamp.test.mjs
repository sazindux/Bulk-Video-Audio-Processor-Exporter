import test from 'node:test';
import assert from 'node:assert';
import { clampStart, musicBlock, pxToSec, secToPx, toMs } from '../src/renderer/audio/clamp.js';

test('clampStart: music shorter than video', () => {
  assert.strictEqual(clampStart(-5, 10, 60), 0);
  assert.strictEqual(clampStart(20, 10, 60), 20);
  assert.strictEqual(clampStart(55, 10, 60), 50);   // start + 10 <= 60
  assert.strictEqual(clampStart(999, 10, 60), 50);
});

test('clampStart: music equal to video length pins at 0', () => {
  assert.strictEqual(clampStart(5, 60, 60), 0);
});

test('clampStart: music longer than video allows 0..videoDur', () => {
  assert.strictEqual(clampStart(30, 120, 60), 30);
  assert.strictEqual(clampStart(70, 120, 60), 60);
  assert.strictEqual(clampStart(-1, 120, 60), 0);
});

test('clampStart: bad inputs are safe', () => {
  assert.strictEqual(clampStart(NaN, 10, 60), 0);
  assert.strictEqual(clampStart(5, NaN, NaN), 0);
  assert.strictEqual(clampStart(5, 10, 0), 0);
});

test('musicBlock: trimmed flag and visible duration', () => {
  assert.deepStrictEqual(musicBlock(10, 20, 60), { start: 10, visibleDur: 20, trimmed: false, endsAt: 30 });
  assert.deepStrictEqual(musicBlock(0, 120, 60), { start: 0, visibleDur: 60, trimmed: true, endsAt: 60 });
  assert.deepStrictEqual(musicBlock(40, 120, 60), { start: 40, visibleDur: 20, trimmed: true, endsAt: 60 });
  // Shorter music dragged to the end is clamped, not trimmed
  assert.deepStrictEqual(musicBlock(59, 20, 60), { start: 40, visibleDur: 20, trimmed: false, endsAt: 60 });
});

test('px <-> sec conversions and ms rounding', () => {
  assert.strictEqual(pxToSec(500, 1000, 60), 30);
  assert.strictEqual(secToPx(30, 1000, 60), 500);
  assert.strictEqual(pxToSec(10, 0, 60), 0);
  assert.strictEqual(secToPx(10, 100, 0), 0);
  assert.strictEqual(toMs(1.23456), 1235);
});
