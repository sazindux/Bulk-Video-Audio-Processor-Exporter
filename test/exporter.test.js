'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFilter, buildArgs, parseProgress, NULL_SRC } = require('../src/main/exporter');

const base = { video: 'C:\\in\\my video.mp4', music: 'D:\\mu sic\\track.mp3', out: 'E:\\out\\my video.mp4', hasAudio: true, duration: 12.5, origVol: 1, musicVol: 0.5, offsetMs: 1500 };

test('filter: original audio + music (reference string)', () => {
  const f = buildFilter({ ...base, hasMusic: true });
  assert.equal(f,
    '[0:a:0]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=12.5,volume=1[a0];'
    + '[1:a:0]aresample=48000,aformat=channel_layouts=stereo,adelay=1500:all=1,volume=0.5,apad[a1];'
    + '[a0][a1]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.97[aout]');
});

test('filter: no-audio video uses anullsrc input 1 trimmed to D, music becomes input 2', () => {
  const f = buildFilter({ ...base, hasAudio: false, hasMusic: true, duration: 7, origVol: 2, musicVol: 1.25, offsetMs: 0 });
  assert.equal(f,
    '[1:a:0]atrim=0:7,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=7,volume=2[a0];'
    + '[2:a:0]aresample=48000,aformat=channel_layouts=stereo,adelay=0:all=1,volume=1.25,apad[a1];'
    + '[a0][a1]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.97[aout]');
});

test('filter: audio but no music keeps a single padded branch', () => {
  const f = buildFilter({ ...base, hasMusic: false, origVol: 1.5 });
  assert.equal(f, '[0:a:0]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=12.5,volume=1.5,alimiter=limit=0.97[aout]');
});

test('filter: offset is rounded to integer ms and never negative', () => {
  assert.match(buildFilter({ ...base, hasMusic: true, offsetMs: 10.7 }), /adelay=11:all=1/);
  assert.match(buildFilter({ ...base, hasMusic: true, offsetMs: -40 }), /adelay=0:all=1/);
});

test('args: exact array for audio + music', () => {
  const a = buildArgs(base);
  assert.deepEqual(a, [
    '-y', '-hide_banner', '-nostats', '-loglevel', 'error', '-progress', 'pipe:1',
    '-i', base.video, '-i', base.music,
    '-filter_complex', buildFilter({ ...base, hasMusic: true }),
    '-map', '0:v:0', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-map_metadata', '-1', '-map_metadata:s:v', '-1', '-map_metadata:s:a', '-1', '-map_chapters', '-1',
    '-metadata:s:v', 'handler_name=', '-metadata:s:a', 'handler_name=',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
    '-movflags', '+faststart',
    base.out,
  ]);
  // Paths with spaces are passed as single array entries (never a shell string).
  assert.equal(a.filter((x) => x === base.video).length, 1);
});

test('args: no-audio video inserts lavfi anullsrc before the music input', () => {
  const a = buildArgs({ ...base, hasAudio: false });
  const i = a.indexOf('-f');
  assert.deepEqual(a.slice(i, i + 6), ['-f', 'lavfi', '-i', NULL_SRC, '-i', base.music]);
  assert.equal(NULL_SRC, 'anullsrc=r=48000:cl=stereo');
});

test('args: no music -> only one -i; mkv output has no faststart', () => {
  const a = buildArgs({ ...base, music: null, out: 'E:\\out\\x.mkv' });
  assert.equal(a.filter((x) => x === '-i').length, 1);
  assert.equal(a.includes('-movflags'), false);
  assert.equal(a[a.length - 1], 'E:\\out\\x.mkv');
});

test('parseProgress reads the last out_time_ms / out_time_us', () => {
  assert.equal(parseProgress('frame=1\nout_time_ms=1500000\nprogress=continue\nout_time_ms=2500000\n'), 2.5);
  assert.equal(parseProgress('out_time_us=4000000\r\nprogress=end\r\n'), 4);
  assert.equal(parseProgress('speed=1x\n'), null);
  assert.equal(parseProgress('out_time_ms=-9223372036854775808\n') < 0, true); // ffmpeg emits this before the first frame
});
