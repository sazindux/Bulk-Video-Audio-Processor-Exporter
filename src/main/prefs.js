'use strict';
// Tiny JSON preferences store in userData (currently: last output folder).
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const file = () => path.join(app.getPath('userData'), 'prefs.json');

function load() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; }
}

function save(patch) {
  const next = { ...load(), ...(patch || {}) };
  try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(next, null, 2)); } catch { /* non-fatal */ }
  return next;
}

module.exports = { load, save };
