'use strict';
// FFmpeg / FFprobe services: probe, thumbnail, audio proxy. Pure helpers
// (parseProbe, *Args builders) have no side effects and are unit-tested.

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { resolveBinaries } = require('./paths');

const TEMP_DIR = path.join(os.tmpdir(), 'bvape');
const MP4_VIDEO_CODECS = new Set(['h264', 'hevc', 'mpeg4', 'av1', 'vp9', 'mjpeg']);

function ensureTempDir() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return TEMP_DIR;
}

function cleanTempDir() {
  try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
}

/** Stable short id for a file path, used for temp file names. */
function fileKey(filePath) {
  return crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 16);
}

/** Run a binary with an args ARRAY (never a shell string). Resolves {stdout, stderr}. */
function run(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!bin) return reject(new Error('FFmpeg binary not found'));
    execFile(bin, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        const tail = String(stderr || '').trim().split(/\r?\n/).slice(-6).join('\n');
        const e = new Error(tail || err.message);
        e.code = err.code;
        return reject(e);
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function probeArgs(file) {
  return ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-show_chapters', file];
}

/** Turn ffprobe JSON into the compact shape used by the app. */
function parseProbe(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const format = data.format || {};
  // Skip cover-art streams (attached_pic) so an mp3 with artwork is not treated as video.
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const a = streams.find((s) => s.codec_type === 'audio');
  let duration = parseFloat(format.duration);
  if (!Number.isFinite(duration) && v) duration = parseFloat(v.duration);
  if (!Number.isFinite(duration) && a) duration = parseFloat(a.duration);
  if (!Number.isFinite(duration)) duration = 0;
  const vcodec = v ? String(v.codec_name || '') : null;
  return {
    duration,
    hasVideo: !!v,
    hasAudio: !!a,
    vcodec,
    mp4Compatible: v ? MP4_VIDEO_CODECS.has(vcodec) : true,
    width: v ? v.width || 0 : 0,
    height: v ? v.height || 0 : 0,
    sampleRate: a ? parseInt(a.sample_rate, 10) || 0 : 0,
    channels: a ? a.channels || 0 : 0,
    acodec: a ? String(a.codec_name || '') : null,
    formatName: String(format.format_name || ''),
    tags: format.tags || {},
    streamTags: streams.map((s) => s.tags || {}),
    chapters: Array.isArray(data.chapters) ? data.chapters.length : 0,
  };
}

async function probe(file) {
  const { ffprobe } = resolveBinaries();
  const { stdout } = await run(ffprobe, probeArgs(file));
  return parseProbe(stdout);
}

function thumbnailArgs(file, duration, out) {
  const ss = Math.max(0, (Number(duration) || 0) * 0.1);
  return ['-y', '-hide_banner', '-loglevel', 'error', '-ss', ss.toFixed(3), '-i', file,
    '-frames:v', '1', '-vf', 'scale=160:-1', '-q:v', '4', out];
}

/** Writes a JPEG thumbnail at 10% of duration into the temp dir; returns its path. */
async function thumbnail(file, duration) {
  const { ffmpeg } = resolveBinaries();
  const out = path.join(ensureTempDir(), fileKey(file) + '.jpg');
  await run(ffmpeg, thumbnailArgs(file, duration, out));
  return out;
}

function proxyArgs(file, out) {
  // Small 48 kHz stereo AAC file for Web Audio decoding; never decode the full video in the renderer.
  return ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-sn', '-dn',
    '-map', '0:a:0', '-ac', '2', '-ar', '48000', '-c:a', 'aac', '-b:a', '96k', '-f', 'ipod', out];
}

/** Extracts the video's first audio stream to a small temp .m4a; returns its path. */
async function audioProxy(file) {
  const { ffmpeg } = resolveBinaries();
  const out = path.join(ensureTempDir(), fileKey(file) + '.m4a');
  if (fs.existsSync(out)) return out;
  await run(ffmpeg, proxyArgs(file, out));
  return out;
}

module.exports = {
  TEMP_DIR, MP4_VIDEO_CODECS, ensureTempDir, cleanTempDir, fileKey, run,
  probeArgs, parseProbe, probe, thumbnailArgs, thumbnail, proxyArgs, audioProxy,
};
