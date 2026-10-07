import test from 'node:test';
import assert from 'node:assert/strict';
import { asPathString, dialogResultToPath } from '../src/shared/outputPath.js';

test('asPathString: plain strings pass, junk strings are rejected', () => {
  assert.equal(asPathString('C:\\out'), 'C:\\out');
  assert.equal(asPathString('  /tmp/x  '), '/tmp/x');
  assert.equal(asPathString(''), null);
  assert.equal(asPathString('[object Object]'), null);
  assert.equal(asPathString('undefined'), null);
});

test('asPathString: dialog result objects are unwrapped', () => {
  assert.equal(asPathString({ canceled: false, filePaths: ['D:\\vids'] }), 'D:\\vids');
  assert.equal(asPathString({ canceled: true, filePaths: [] }), null);
  assert.equal(asPathString({ filePaths: [] }), null);
  assert.equal(asPathString(['E:\\a', 'E:\\b']), 'E:\\a');
});

test('asPathString: arbitrary objects (e.g. { ok: true }) and non-strings are rejected', () => {
  assert.equal(asPathString({ ok: true }), null);
  assert.equal(asPathString({}), null);
  assert.equal(asPathString(42), null);
  assert.equal(asPathString(null), null);
  assert.equal(asPathString(undefined), null);
});

test('dialogResultToPath: returns filePaths[0] string or null', () => {
  assert.equal(dialogResultToPath({ canceled: false, filePaths: ['C:\\Users\\me\\Videos'] }), 'C:\\Users\\me\\Videos');
  assert.equal(dialogResultToPath({ canceled: true, filePaths: [] }), null);
  assert.equal(dialogResultToPath({ canceled: false, filePaths: [] }), null);
  assert.equal(dialogResultToPath(undefined), null);
  assert.equal(typeof dialogResultToPath({ canceled: false, filePaths: ['x'] }), 'string');
});
