'use strict';
// Resolves FFmpeg / FFprobe binary paths for both dev and packaged (asar) runs.
// Pure helpers are exported separately so they can be unit-tested without Electron.

const path = require('path');

/** When packaged inside app.asar, binaries live in app.asar.unpacked. */
function unpackedPath(p) {
  if (!p) return p;
  return p.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked');
}

/** ffprobe-static exports { path } on some versions, or a string on others. */
function normalizeFfprobeExport(mod) {
  if (!mod) return null;
  if (typeof mod === 'string') return mod;
  if (typeof mod.path === 'string') return mod.path;
  return null;
}

let cached = null;
function resolveBinaries() {
  if (cached) return cached;
  let ffmpeg = null;
  let ffprobe = null;
  try { ffmpeg = require('ffmpeg-static'); } catch { /* missing in some envs */ }
  try { ffprobe = normalizeFfprobeExport(require('ffprobe-static')); } catch { /* ignore */ }
  const isPackaged = !!(process.mainModule && process.mainModule.filename.includes('app.asar')) || /app\.asar/.test(__dirname);
  cached = {
    ffmpeg: isPackaged ? unpackedPath(ffmpeg) : ffmpeg,
    ffprobe: isPackaged ? unpackedPath(ffprobe) : ffprobe,
    isPackaged,
  };
  return cached;
}

module.exports = { unpackedPath, normalizeFfprobeExport, resolveBinaries, path };
