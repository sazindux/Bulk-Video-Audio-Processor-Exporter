'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pv = require('../src/main/preview');

test('parseRange: whole file when header missing or malformed', () => {
  assert.deepStrictEqual(pv.parseRange(undefined, 100), { status: 200, start: 0, end: 99 });
  assert.deepStrictEqual(pv.parseRange('bytes=', 100), { status: 200, start: 0, end: 99 });
  assert.deepStrictEqual(pv.parseRange('items=0-5', 100), { status: 200, start: 0, end: 99 });
  assert.deepStrictEqual(pv.parseRange('bytes=0-5,10-20', 100), { status: 200, start: 0, end: 99 });
});

test('parseRange: open-ended, bounded, clamped and suffix ranges', () => {
  assert.deepStrictEqual(pv.parseRange('bytes=0-', 100), { status: 206, start: 0, end: 99 });
  assert.deepStrictEqual(pv.parseRange('bytes=10-19', 100), { status: 206, start: 10, end: 19 });
  assert.deepStrictEqual(pv.parseRange('bytes=90-500', 100), { status: 206, start: 90, end: 99 });
  assert.deepStrictEqual(pv.parseRange('bytes=-10', 100), { status: 206, start: 90, end: 99 });
  assert.deepStrictEqual(pv.parseRange('bytes=-500', 100), { status: 206, start: 0, end: 99 });
});

test('parseRange: unsatisfiable -> 416', () => {
  assert.strictEqual(pv.parseRange('bytes=100-', 100).status, 416);
  assert.strictEqual(pv.parseRange('bytes=50-40', 100).status, 416);
  assert.strictEqual(pv.parseRange('bytes=-0', 100).status, 416);
});

test('rangeHeaders: 206 carries Content-Range + Content-Length; 416 carries bytes */size', () => {
  const h = pv.rangeHeaders({ status: 206, start: 10, end: 19 }, 100, 'video/mp4');
  assert.strictEqual(h['Content-Range'], 'bytes 10-19/100');
  assert.strictEqual(h['Content-Length'], '10');
  assert.strictEqual(h['Accept-Ranges'], 'bytes');
  assert.strictEqual(h['Content-Type'], 'video/mp4');
  const full = pv.rangeHeaders({ status: 200, start: 0, end: 99 }, 100, 'video/mp4');
  assert.strictEqual(full['Content-Length'], '100');
  assert.strictEqual(full['Content-Range'], undefined);
  assert.strictEqual(pv.rangeHeaders({ status: 416 }, 100, 'video/mp4')['Content-Range'], 'bytes */100');
});

test('registerPreview: opaque token URL, stable per path, only video extensions', () => {
  const u1 = pv.registerPreview('/tmp/some video.mp4');
  const u2 = pv.registerPreview('/tmp/some video.mp4');
  assert.strictEqual(u1, u2);
  assert.match(u1, /^bvape-media:\/\/m\/[0-9a-f]{32}$/);
  assert.ok(!u1.includes('some'));
  assert.strictEqual(pv.fileForUrl(u1), path.resolve('/tmp/some video.mp4'));
  assert.strictEqual(pv.fileForUrl('bvape-media://m/deadbeef'), null);
  assert.throws(() => pv.registerPreview('/tmp/song.mp3'), /Unsupported/);
  assert.throws(() => pv.registerPreview(''), /No file/);
  assert.strictEqual(pv.mimeFor('x.MOV'), 'video/quicktime');
  assert.strictEqual(pv.mimeFor('x.mkv'), 'video/x-matroska');
});

test('handleRequest: streams full file and byte ranges, 404 for unknown token', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bvape-test-'));
  const file = path.join(dir, 'clip.mp4');
  fs.writeFileSync(file, Buffer.from('0123456789abcdef'));
  const url = pv.registerPreview(file);

  const full = await pv.handleRequest(new Request(url));
  assert.strictEqual(full.status, 200);
  assert.strictEqual(full.headers.get('Content-Length'), '16');
  assert.strictEqual(await full.text(), '0123456789abcdef');

  const part = await pv.handleRequest(new Request(url, { headers: { Range: 'bytes=4-7' } }));
  assert.strictEqual(part.status, 206);
  assert.strictEqual(part.headers.get('Content-Range'), 'bytes 4-7/16');
  assert.strictEqual(part.headers.get('Content-Type'), 'video/mp4');
  assert.strictEqual(await part.text(), '4567');

  const tail = await pv.handleRequest(new Request(url, { headers: { Range: 'bytes=12-' } }));
  assert.strictEqual(await tail.text(), 'cdef');

  const bad = await pv.handleRequest(new Request(url, { headers: { Range: 'bytes=99-' } }));
  assert.strictEqual(bad.status, 416);
  const head = await pv.handleRequest(new Request(url, { method: 'HEAD' }));
  assert.strictEqual(head.status, 200);
  assert.strictEqual((await pv.handleRequest(new Request('bvape-media://m/nope'))).status, 404);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.strictEqual((await pv.handleRequest(new Request(url))).status, 404); // registered but deleted
});

test('previewProxyArgs: muted 360p H.264 ultrafast proxy as an args array', () => {
  const a = pv.previewProxyArgs('/in/v.mkv', '/tmp/out.mp4');
  assert.ok(Array.isArray(a));
  assert.strictEqual(a[a.length - 1], '/tmp/out.mp4');
  assert.ok(a.includes('-an'));
  for (const pair of [['-c:v', 'libx264'], ['-preset', 'ultrafast'], ['-crf', '30'], ['-pix_fmt', 'yuv420p'], ['-movflags', '+faststart'], ['-vf', 'scale=-2:360']]) {
    assert.strictEqual(a[a.indexOf(pair[0]) + 1], pair[1]);
  }
});

test('cancelPreviewProxy: no-op when idle', () => { pv.cancelPreviewProxy(); });
