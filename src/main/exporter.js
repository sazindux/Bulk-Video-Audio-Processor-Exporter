'use strict';
// Export engine: pure command builders (unit-tested), a single-job runner with
// progress + cancel, and a sequential queue that reports to the renderer.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { resolveBinaries } = require('./paths');

const SAMPLE_RATE = 48000;
const NULL_SRC = `anullsrc=r=${SAMPLE_RATE}:cl=stereo`;

/** Format a number for ffmpeg filter args (no exponent, trimmed). */
function num(x, digits = 3) {
  return Number(x).toFixed(digits).replace(/\.?0+$/, '') || '0';
}

/**
 * Build the filter_complex string.
 * - hasAudio=false: branch 0 reads the lavfi anullsrc input (index 1), music becomes input 2.
 * - hasMusic=false: only the original branch (padded + volume + limiter) -> [aout].
 */
function buildFilter({ hasAudio, hasMusic, origVol, musicVol, offsetMs, duration }) {
  const D = num(duration);
  const V = num(origVol, 4), M = num(musicVol, 4);
  const OFF = Math.max(0, Math.round(Number(offsetMs) || 0));
  // Inputs: 0 = video, then anullsrc (only when the video has no audio), then music.
  const origIn = hasAudio ? '[0:a:0]' : '[1:a:0]';
  const musicIn = hasAudio ? '[1:a:0]' : '[2:a:0]';
  // Silent source is infinite: trim it to D so duration=first works and apad is harmless.
  const trim = hasAudio ? '' : `atrim=0:${D},`;
  const a0 = `${origIn}${trim}aresample=${SAMPLE_RATE},aformat=channel_layouts=stereo,apad=whole_dur=${D},volume=${V}`;
  if (!hasMusic) return `${a0},alimiter=limit=0.97[aout]`;
  const a1 = `${musicIn}aresample=${SAMPLE_RATE},aformat=channel_layouts=stereo,adelay=${OFF}:all=1,volume=${M},apad[a1]`;
  return `${a0}[a0];${a1};[a0][a1]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.97[aout]`;
}

/**
 * Build the ffmpeg args ARRAY for one job.
 * job = { video, music|null, out, hasAudio, duration, origVol, musicVol, offsetMs }
 */
function buildArgs(job) {
  const hasMusic = !!job.music;
  const args = ['-y', '-hide_banner', '-nostats', '-loglevel', 'error', '-progress', 'pipe:1', '-i', job.video];
  if (!job.hasAudio) args.push('-f', 'lavfi', '-i', NULL_SRC);
  if (hasMusic) args.push('-i', job.music);
  args.push(
    '-filter_complex', buildFilter({ ...job, hasMusic }),
    '-map', '0:v:0', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-map_metadata', '-1', '-map_metadata:s:v', '-1', '-map_metadata:s:a', '-1', '-map_chapters', '-1',
    '-metadata:s:v', 'handler_name=', '-metadata:s:a', 'handler_name=',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
  );
  if (path.extname(job.out).toLowerCase() === '.mp4' || path.extname(job.out).toLowerCase() === '.mov') args.push('-movflags', '+faststart');
  args.push(job.out);
  return args;
}

/** Parse `-progress pipe:1` text; returns seconds of output written, or null if absent. */
function parseProgress(text) {
  let last = null;
  const re = /^out_time_(ms|us)=(-?\d+)$/gm;
  let m;
  while ((m = re.exec(text))) last = Number(m[2]) / 1e6; // both keys are microseconds in practice
  return last;
}

/**
 * Run one export. onProgress(fraction 0..1). Returns { ok, stderrTail, cancelled }.
 * The returned promise has a `cancel()` method that kills ffmpeg and removes the partial output.
 */
function runExport(job, onProgress) {
  const { ffmpeg } = resolveBinaries();
  let child, cancelled = false;
  const p = new Promise((resolve) => {
    if (!ffmpeg) return resolve({ ok: false, stderrTail: 'FFmpeg binary not found' });
    child = spawn(ffmpeg, buildArgs(job), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '', outBuf = '';
    child.stdout.on('data', (d) => {
      outBuf += d;
      const sec = parseProgress(outBuf);
      if (sec != null && job.duration > 0) onProgress(Math.min(1, Math.max(0, sec / job.duration)));
      if (outBuf.length > 8192) outBuf = outBuf.slice(-2048);
    });
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
    child.on('error', (err) => resolve({ ok: false, stderrTail: err.message }));
    child.on('close', (code) => {
      if (cancelled || code !== 0) {
        try { fs.unlinkSync(job.out); } catch { /* nothing written */ }
        const tail = stderr.trim().split(/\r?\n/).slice(-6).join('\n');
        return resolve({ ok: false, cancelled, stderrTail: cancelled ? 'Cancelled' : (tail || `ffmpeg exited with code ${code}`) });
      }
      onProgress(1);
      resolve({ ok: true, stderrTail: '' });
    });
  });
  p.cancel = () => { cancelled = true; if (child && child.exitCode == null) child.kill(); };
  return p;
}

let filenameMod = null;
async function filename() {
  // src/shared/filename.js is ESM (shared with the renderer); load it once via dynamic import.
  if (!filenameMod) filenameMod = await import(pathToFileURL(path.join(__dirname, '../shared/filename.js')).href);
  return filenameMod;
}

/** Choose a non-colliding output path that is never the source file. */
async function resolveOutputPath(outputDir, baseName, ext, sourcePath, claimed) {
  const { sanitizeName, uniqueName } = await filename();
  const base = sanitizeName(baseName);
  const same = (name) => path.resolve(outputDir, name).toLowerCase() === path.resolve(sourcePath).toLowerCase();
  const exists = (name) => same(name) || fs.existsSync(path.join(outputDir, name));
  const name = uniqueName(base, ext, exists, claimed);
  claimed.add(name.toLowerCase());
  return path.join(outputDir, name);
}

/**
 * Sequential queue. items: [{ id, video, music|null, hasAudio, duration, origVol, musicVol, offsetMs, outputName, ext }].
 * send(channel, payload) forwards events to the renderer. Returns a controller { promise, cancel }.
 */
function startQueue({ outputDir, items }, send, verify) {
  let cancelled = false, current = null;
  const promise = (async () => {
    fs.mkdirSync(outputDir, { recursive: true });
    const claimed = new Set();
    let ok = 0, failed = 0;
    for (const it of items) {
      if (cancelled) { send('export:item', { id: it.id, status: 'queued' }); continue; }
      let out;
      try { out = await resolveOutputPath(outputDir, it.outputName, it.ext || '.mp4', it.video, claimed); }
      catch (e) { failed++; send('export:item', { id: it.id, status: 'failed', error: e.message }); continue; }
      send('export:item', { id: it.id, status: 'processing', outputPath: out });
      current = runExport({ ...it, out }, (progress) => send('export:progress', { id: it.id, progress }));
      const r = await current;
      current = null;
      if (r.ok) {
        let verification = null;
        if (verify) { try { verification = await verify(out); } catch (e) { verification = { ok: false, issues: [e.message] }; } }
        ok++;
        send('export:item', { id: it.id, status: 'done', outputPath: out, verification });
      } else if (r.cancelled) {
        send('export:item', { id: it.id, status: 'queued' });
      } else {
        failed++;
        send('export:item', { id: it.id, status: 'failed', error: r.stderrTail });
      }
    }
    const result = { ok, failed, cancelled, total: items.length };
    send('export:done', result);
    return result;
  })();
  return { promise, cancel() { cancelled = true; if (current) current.cancel(); } };
}

module.exports = { buildFilter, buildArgs, parseProgress, runExport, resolveOutputPath, startQueue, NULL_SRC };
