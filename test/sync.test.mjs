import test from 'node:test';
import assert from 'node:assert';
import { decide, aspectRatio, DRIFT_TOLERANCE } from '../src/renderer/preview/sync.js';

test('select: jump to the engine position and pause', () => {
  assert.deepStrictEqual(decide('select', { enginePos: 12.5 }), [{ type: 'seek', time: 12.5 }, { type: 'pause' }]);
});

test('play / pause / engine-end / seek', () => {
  assert.deepStrictEqual(decide('play', { enginePos: 3 }), [{ type: 'seek', time: 3 }, { type: 'play' }]);
  assert.deepStrictEqual(decide('pause', { enginePos: 4 }), [{ type: 'pause' }, { type: 'seek', time: 4 }]);
  assert.deepStrictEqual(decide('engine-end', { enginePos: 60 }), [{ type: 'pause' }, { type: 'seek', time: 60 }]);
  assert.deepStrictEqual(decide('seek', { enginePos: 7.25, enginePlaying: false }), [{ type: 'seek', time: 7.25 }]);
});

test('tick while playing: resync only beyond the drift tolerance', () => {
  assert.deepStrictEqual(decide('tick', { enginePlaying: true, enginePos: 10, videoTime: 10.1, videoPlaying: true }), []);
  assert.deepStrictEqual(decide('tick', { enginePlaying: true, enginePos: 10, videoTime: 10 + DRIFT_TOLERANCE + 0.01, videoPlaying: true }), [{ type: 'seek', time: 10 }]);
  assert.deepStrictEqual(decide('tick', { enginePlaying: true, enginePos: 10, videoTime: 8, videoPlaying: true }), [{ type: 'seek', time: 10 }]);
});

test('tick: video not playing while engine plays -> play (and resync if needed)', () => {
  assert.deepStrictEqual(decide('tick', { enginePlaying: true, enginePos: 5, videoTime: 5, videoPlaying: false }), [{ type: 'play' }]);
  assert.deepStrictEqual(decide('tick', { enginePlaying: true, enginePos: 5, videoTime: 0, videoPlaying: false }), [{ type: 'play' }, { type: 'seek', time: 5 }]);
});

test('tick while engine paused: pause the video if it is still playing, otherwise nothing', () => {
  assert.deepStrictEqual(decide('tick', { enginePlaying: false, enginePos: 5, videoTime: 5, videoPlaying: true }), [{ type: 'pause' }]);
  assert.deepStrictEqual(decide('tick', { enginePlaying: false, enginePos: 5, videoTime: 9, videoPlaying: false }), []);
});

test('ended: video shorter than the engine -> pause only, later ticks leave it alone', () => {
  assert.deepStrictEqual(decide('ended', { videoPlaying: true }), [{ type: 'pause' }]);
  assert.deepStrictEqual(decide('ended', { videoPlaying: false }), []);
  assert.deepStrictEqual(decide('tick', { enginePlaying: true, enginePos: 70, videoTime: 60, videoPlaying: false, videoEnded: true }), []);
});

test('unknown events and bad times are safe', () => {
  assert.deepStrictEqual(decide('nope', {}), []);
  assert.deepStrictEqual(decide('seek', { enginePos: NaN }), [{ type: 'seek', time: 0 }]);
  assert.deepStrictEqual(decide('seek', { enginePos: -3 }), [{ type: 'seek', time: 0 }]);
  assert.deepStrictEqual(decide('select'), [{ type: 'seek', time: 0 }, { type: 'pause' }]);
});

test('aspectRatio: from probe, portrait kept, fallback 16/9', () => {
  assert.strictEqual(aspectRatio(1920, 1080), '1920 / 1080');
  assert.strictEqual(aspectRatio(1080, 1920), '1080 / 1920');
  assert.strictEqual(aspectRatio(0, 0), '16 / 9');
  assert.strictEqual(aspectRatio(undefined, null), '16 / 9');
});
