import test from 'node:test';
import assert from 'node:assert';
import { sanitizeName, validateName, uniqueName, MAX_NAME } from '../src/shared/filename.js';

test('sanitizeName strips illegal chars and trailing dots/spaces', () => {
  assert.strictEqual(sanitizeName('a<b>c:d"e/f\\g|h?i*j'), 'abcdefghij');
  assert.strictEqual(sanitizeName('  hello world.. '), 'hello world');
  assert.strictEqual(sanitizeName('tab\tnew\nline'), 'tabnewline');
  assert.strictEqual(sanitizeName('Vidéo – 日本語 ✓'), 'Vidéo – 日本語 ✓');
});

test('sanitizeName handles reserved names, empty and long input', () => {
  assert.strictEqual(sanitizeName('CON'), '_CON');
  assert.strictEqual(sanitizeName('com1'), '_com1');
  assert.strictEqual(sanitizeName('CONSOLE'), 'CONSOLE');
  assert.strictEqual(sanitizeName(''), 'output');
  assert.strictEqual(sanitizeName('???'), 'output');
  assert.strictEqual(sanitizeName(null), 'output');
  assert.strictEqual(sanitizeName('x'.repeat(300)).length, MAX_NAME);
});

test('validateName messages', () => {
  assert.strictEqual(validateName('fine name'), null);
  assert.match(validateName(''), /empty/);
  assert.match(validateName('a:b'), /Illegal/);
  assert.match(validateName('a:b'), /Illegal/); // regex lastIndex reset
  assert.match(validateName('end.'), /dot or space/);
  assert.match(validateName('NUL'), /Reserved/);
  assert.match(validateName('y'.repeat(MAX_NAME + 1)), /Max/);
});

test('uniqueName appends (n) on collisions and respects batch set', () => {
  const existing = new Set(['clip.mp4', 'clip (1).mp4']);
  const exists = (n) => existing.has(n);
  assert.strictEqual(uniqueName('clip', '.mp4', exists), 'clip (2).mp4');
  assert.strictEqual(uniqueName('other', '.mp4', exists), 'other.mp4');
  const avoid = new Set(['other.mp4']);
  assert.strictEqual(uniqueName('other', '.mp4', exists, avoid), 'other (1).mp4');
  assert.strictEqual(uniqueName('Other', '.mp4', exists, avoid), 'Other (1).mp4'); // case-insensitive
});
