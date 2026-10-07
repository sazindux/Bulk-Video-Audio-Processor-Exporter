'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { unpackedPath, normalizeFfprobeExport } = require('../src/main/paths');

test('unpackedPath rewrites app.asar to app.asar.unpacked (win + posix)', () => {
  assert.strictEqual(
    unpackedPath('C:\\App\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe'),
    'C:\\App\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe');
  assert.strictEqual(unpackedPath('/x/app.asar/node_modules/f'), '/x/app.asar.unpacked/node_modules/f');
  assert.strictEqual(unpackedPath('/x/app.asar.unpacked/node_modules/f'), '/x/app.asar.unpacked/node_modules/f');
  assert.strictEqual(unpackedPath(null), null);
});

test('normalizeFfprobeExport handles string and {path} exports', () => {
  assert.strictEqual(normalizeFfprobeExport('/bin/ffprobe'), '/bin/ffprobe');
  assert.strictEqual(normalizeFfprobeExport({ path: '/bin/ffprobe' }), '/bin/ffprobe');
  assert.strictEqual(normalizeFfprobeExport(undefined), null);
});
