'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseProbe, probeArgs, thumbnailArgs, proxyArgs, fileKey } = require('../src/main/ffmpeg');

const withAudio = {
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, tags: { handler_name: 'VideoHandler' } },
    { codec_type: 'audio', codec_name: 'aac', sample_rate: '44100', channels: 2 },
  ],
  format: { duration: '12.345', format_name: 'mov,mp4,m4a,3gp,3g2,mj2', tags: { encoder: 'Lavf' } },
  chapters: [{ id: 0 }],
};

test('parseProbe: video with audio', () => {
  const p = parseProbe(JSON.stringify(withAudio));
  assert.strictEqual(p.duration, 12.345);
  assert.strictEqual(p.hasAudio, true);
  assert.strictEqual(p.vcodec, 'h264');
  assert.strictEqual(p.mp4Compatible, true);
  assert.strictEqual(p.sampleRate, 44100);
  assert.strictEqual(p.channels, 2);
  assert.strictEqual(p.chapters, 1);
  assert.deepStrictEqual(p.tags, { encoder: 'Lavf' });
  assert.strictEqual(p.width, 1920);
});

test('parseProbe: video without audio, non-mp4 codec, duration from stream', () => {
  const p = parseProbe({
    streams: [{ codec_type: 'video', codec_name: 'prores', duration: '5.5' }],
    format: { format_name: 'mov' },
  });
  assert.strictEqual(p.hasAudio, false);
  assert.strictEqual(p.sampleRate, 0);
  assert.strictEqual(p.duration, 5.5);
  assert.strictEqual(p.mp4Compatible, false);
});

test('parseProbe: mp3 with cover art is not video', () => {
  const p = parseProbe({
    streams: [
      { codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } },
      { codec_type: 'audio', codec_name: 'mp3', sample_rate: '48000', channels: 1 },
    ],
    format: { duration: '200' },
  });
  assert.strictEqual(p.hasVideo, false);
  assert.strictEqual(p.hasAudio, true);
  assert.strictEqual(p.channels, 1);
});

test('parseProbe: empty / garbage input yields zero duration', () => {
  const p = parseProbe({});
  assert.strictEqual(p.duration, 0);
  assert.strictEqual(p.hasVideo, false);
});

test('arg builders keep paths as single array items (spaces/unicode safe)', () => {
  const f = 'C:\\Vidéos\\my clip (1).mp4';
  assert.strictEqual(probeArgs(f).at(-1), f);
  const t = thumbnailArgs(f, 20, 'out.jpg');
  assert.deepStrictEqual(t.slice(t.indexOf('-ss'), t.indexOf('-ss') + 4), ['-ss', '2.000', '-i', f]);
  assert.ok(t.includes('scale=160:-1'));
  const px = proxyArgs(f, 'out.m4a');
  assert.ok(px.includes('-vn') && px.includes('48000') && px.at(-1) === 'out.m4a');
});

test('thumbnailArgs clamps negative/NaN duration to 0', () => {
  assert.strictEqual(thumbnailArgs('a', NaN, 'o')[5], '0.000');
  assert.strictEqual(thumbnailArgs('a', -3, 'o')[5], '0.000');
});

test('fileKey is stable and short', () => {
  assert.strictEqual(fileKey('/a/b.mp4'), fileKey('/a/b.mp4'));
  assert.notStrictEqual(fileKey('/a/b.mp4'), fileKey('/a/c.mp4'));
  assert.strictEqual(fileKey('/x').length, 16);
});
