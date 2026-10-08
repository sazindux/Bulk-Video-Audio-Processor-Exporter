'use strict';
// Muted video preview backend: serves registered video files over the privileged `bvape-media`
// scheme (with HTTP Range support, required for seeking) and builds small H.264 proxies for
// videos Chromium cannot decode (HEVC, exotic MKV codecs). No electron import: fully unit-testable.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { resolveBinaries } = require('./paths');
const { ensureTempDir, fileKey } = require('./ffmpeg');

const SCHEME = 'bvape-media';
const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska' };

const byToken = new Map(); // token -> absolute path
const byPath = new Map();  // absolute path -> token

const mimeFor = (file) => MIME[path.extname(file).toLowerCase()] || null;

/**
 * Parse an HTTP Range header against a file size (single byte range only).
 * Returns { status: 200|206|416, start, end } (start/end inclusive). Malformed or missing -> 200 (whole file).
 */
function parseRange(header, size) {
  const whole = { status: 200, start: 0, end: Math.max(0, size - 1) };
  if (!header || size <= 0) return whole;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m || (m[1] === '' && m[2] === '')) return whole;
  let start, end;
  if (m[1] === '') {                       // suffix: last N bytes
    const n = Number(m[2]);
    if (n === 0) return { status: 416 };
    start = Math.max(0, size - n); end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return { status: 416 };
  return { status: 206, start, end };
}

/** Response headers for a parsed range. */
function rangeHeaders(r, size, type) {
  const h = { 'Accept-Ranges': 'bytes', 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (r.status === 416) { h['Content-Range'] = `bytes */${size}`; return h; }
  h['Content-Length'] = String(r.end - r.start + 1);
  if (r.status === 206) h['Content-Range'] = `bytes ${r.start}-${r.end}/${size}`;
  return h;
}

/** Register a video file for preview; returns its opaque URL. Throws for unsupported extensions. */
function registerPreview(file) {
  if (typeof file !== 'string' || !file) throw new Error('No file');
  const abs = path.resolve(file);
  if (!mimeFor(abs)) throw new Error('Unsupported preview type');
  let token = byPath.get(abs);
  if (!token) { token = crypto.randomBytes(16).toString('hex'); byPath.set(abs, token); byToken.set(token, abs); }
  return `${SCHEME}://m/${token}`;
}

const fileForUrl = (url) => byToken.get(new URL(url).pathname.replace(/^\/+/, '')) || null;

/** protocol.handle() callback: GET with optional Range -> 200/206 streamed body, 404 unknown token, 416 bad range. */
async function handleRequest(request) {
  const file = fileForUrl(request.url);
  if (!file) return new Response('Not found', { status: 404 });
  let st;
  try { st = await fs.promises.stat(file); } catch { return new Response('Not found', { status: 404 }); }
  const r = parseRange(request.headers.get('range'), st.size);
  const headers = rangeHeaders(r, st.size, mimeFor(file));
  if (r.status === 416) return new Response(null, { status: 416, headers });
  if (request.method === 'HEAD') return new Response(null, { status: r.status, headers });
  const body = Readable.toWeb(fs.createReadStream(file, { start: r.start, end: r.end }));
  return new Response(body, { status: r.status, headers });
}

/* ---------- preview proxy (fallback for undecodable codecs) ---------- */

function previewProxyArgs(file, out) {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:v:0', '-an', '-sn', '-dn',
    '-vf', 'scale=-2:360', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-f', 'mp4', out];
}

let active = null; // { child, out, reject }

function cancelPreviewProxy() {
  if (!active) return;
  const a = active; active = null;
  a.cancelled = true;
  try { a.child.kill(); } catch { /* already gone */ }
}

/** Build (or reuse) a small muted H.264 proxy in the temp dir; resolves its preview URL. Only one build at a time. */
function previewProxy(file) {
  const out = path.join(ensureTempDir(), fileKey(file) + '_preview.mp4');
  if (fs.existsSync(out)) return Promise.resolve(registerPreview(out));
  cancelPreviewProxy();
  const { ffmpeg } = resolveBinaries();
  if (!ffmpeg) return Promise.reject(new Error('FFmpeg binary not found'));
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, previewProxyArgs(file, out), { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const me = { child, cancelled: false };
    active = me;
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => { if (active === me) active = null; reject(err); });
    child.on('close', (code) => {
      if (active === me) active = null;
      if (me.cancelled || code !== 0) {
        fs.rm(out, { force: true }, () => {});
        return reject(new Error(me.cancelled ? 'cancelled' : (stderr.trim().split(/\r?\n/).slice(-6).join('\n') || `ffmpeg exited with ${code}`)));
      }
      resolve(registerPreview(out));
    });
  });
}

module.exports = {
  SCHEME, MIME, mimeFor, parseRange, rangeHeaders, registerPreview, fileForUrl, handleRequest,
  previewProxyArgs, previewProxy, cancelPreviewProxy,
};
