# Handoff: Bulk Video Audio Processor
Last updated: 2026-10-07 | Last commit: feat(task-2): UI shell + media pool

## Task status
| Task | Name | Status (PENDING / IN PROGRESS / DONE) |
|---|---|---|
| 0 | Scaffold + CI | DONE |
| 1 | Core services | DONE |
| 2 | UI shell + media pool | DONE |
| 3 | Audio engine + timeline | PENDING |
| 4 | Inspector + settings | PENDING |
| 5 | Export engine | PENDING |
| 6 | Metadata + edge cases | PENDING |
| 7 | Polish + release | PENDING |

## Next steps (exact, for the very next chat)
- TASK 3: create `src/renderer/audio/engine.js` (AudioContext; decode proxy via `audioProxy`+`readFile`, decode music via `readFile`; two BufferSources -> two GainNodes -> destination; play/pause/seek; schedule music source at offset; cache decoded AudioBuffers by path) and `src/renderer/audio/timeline.js` (waveform peaks to canvas `#wave-canvas`, music block `#music-block` positioned in `#music-lane` by offset/duration, pointer drag with clamp, `#trimmed-badge`, `#playhead`, `#ruler`, click-to-seek, `#btn-play/#btn-stop/#time-display`).
- Put pure clamp math in `src/renderer/audio/clamp.js` as ESM AND make it importable from tests: tests use `node --test` CJS; simplest is to write `clamp.js` as ESM and a test file `test/clamp.test.mjs` (node --test discovers .mjs too).
- Clamp rules: start>=0; if musicDur<=videoDur: start<=videoDur-musicDur; else start in [0, videoDur] and trimmed=true (visible length = videoDur-start).
- Videos without audio: waveform canvas shows "no audio" text, engine plays only music.
- Hook into state: subscribe('selection'|'settings') -> reload engine / redraw.

## Decisions made (do not revisit)
- Electron 33.x, electron-builder 25.x. `npm test` = `node --test` (auto-discovers `test/*.test.js`, works on Node 20 and 22).
- `src/main/paths.js` holds binary path resolution; `unpackedPath()` swaps `app.asar` -> `app.asar.unpacked`. ffprobe-static exports `{ path }`.
- asarUnpack: `node_modules/ffmpeg-static/**` and `node_modules/ffprobe-static/bin/win32/x64/**` only (other platforms' ffprobe binaries stay in asar; electron-builder prunes nothing else).
- `signAndEditExecutable: false` to avoid signing/rcedit issues on CI; `CSC_IDENTITY_AUTO_DISCOVERY=false`.
- Window: `autoHideMenuBar`, devTools only when `!app.isPackaged`, sandbox + contextIsolation on.
- Renderer API exposed as `window.bvape`. Temp dir name: `bvape`. Temp file names = sha1(path).slice(0,16) + ext.
- MP4-compatible video codecs: h264, hevc, mpeg4, av1, vp9, mjpeg (others keep source container).
- Smoke-tested locally with ffmpeg-static linux binaries + lavfi media (probe, thumb, proxy, errors) - works.

## Architecture notes
- File map:
  - `src/main/main.js` -> app lifecycle, window, IPC handlers
  - `src/main/paths.js` -> ffmpeg/ffprobe path resolver (dev + packaged)
  - `src/main/ffmpeg.js` -> run(bin,args[]), probe/parseProbe, thumbnail (10%, 160px jpg), audioProxy (48k stereo AAC 96k .m4a), temp dir `<os.tmpdir>/bvape` (cleaned on will-quit)
  - `src/main/preload.js` -> contextBridge `window.bvape`
  - `src/renderer/index.html` -> 3-column layout, all element ids used by ui modules (pool, timeline, inspector, export bar, toasts)
  - `src/renderer/styles.css` -> dark theme, CSS vars
  - `src/renderer/app.js` -> bootstrap + smoke hook
  - `src/renderer/state.js` -> store (state, subscribe/notify batched per microtask, add/remove/clear video+music, selectVideo, updateSettings, applyToAll, setOutputDir)
  - `src/renderer/util.js` -> basename, stripExt, extOf, fmtTime, clamp, newId, blobUrl, el(), toast()
  - `src/renderer/ui/mediaPool.js` -> importPaths (filters by ext, probes 3 at a time), drag-drop (pathForFile), video/music lists, music preview `<audio>` via blob URL
  - `test/*.test.js` -> node:test unit tests
  - `.github/workflows/build.yml` -> win portable build, artifact, release on tags
- IPC channels (invoke; media:* return `{ok:true,value}` or `{ok:false,error}` with ffmpeg stderr tail):
  - `env:info` -> () -> {ffmpegPath, ffprobePath, ffmpegVersion, ffprobeVersion, electron, packaged}
  - `dialog:openFiles` -> ('video'|'music') -> string[] paths
  - `dialog:openFolder` -> () -> string|null
  - `media:probe` -> (path) -> {duration, hasVideo, hasAudio, vcodec, mp4Compatible, width, height, sampleRate, channels, acodec, formatName, tags, streamTags[], chapters}
  - `media:thumbnail` -> (path, duration) -> jpg path in temp
  - `media:proxy` -> (path) -> m4a path in temp (fails on no-audio video: caller must check hasAudio first)
  - `media:readFile` -> (path) -> ArrayBuffer
  - preload also exposes `pathForFile(File)` (webUtils.getPathForFile)
- State shape: `state = { videos:[{id,path,name,probe,thumb(blob url),error,settings}], music:[{id,path,name,probe,duration,error}], selectedVideoId, outputDir, exporting }`; `settings = { musicId, origVol(0..2), musicVol(0..2), offsetMs, outputName(no ext), status(queued|processing|done|failed), progress, error, outputPath }`.
- Headless smoke test (works in sandbox with xvfb): `BVAPE_SMOKE=1 BVAPE_SMOKE_MS=6000 BVAPE_SMOKE_FILES="/tmp/media/a.mp4;/tmp/media/song.mp3" xvfb-run -a npx electron --no-sandbox --disable-gpu .` -> prints `[renderer:*]` console lines incl. `SMOKE {...}` and `BOOT_OK`. Generate media with lavfi (`testsrc`, `sine`). Install xvfb with `sudo apt-get install -y xvfb libgtk-3-0 libnss3 libasound2t64 libgbm1`.

## Known issues / bugs
- **ACTION REQUIRED (user, one time):** the GitHub integration token has no `workflows` permission, so `.github/workflows/build.yml` cannot be pushed from the sandbox. The workflow is committed at `ci/build.yml`. Copy it to `.github/workflows/build.yml` in the GitHub web UI (Add file -> Create new file, paste content) or run locally: `mkdir -p .github/workflows && cp ci/build.yml .github/workflows/build.yml && git add . && git commit -m "ci: add workflow" && git push`. Future CI edits by the AI will land in `ci/build.yml` and must be copied the same way.

## CI status
- CI unverified: workflow file not yet in `.github/workflows/` (see Known issues). Check https://github.com/sazindux/Bulk-Video-Audio-Processor-Exporter/actions

## Manual tests for the user (Windows)
- [ ] Download artifact from Actions, run the portable exe, confirm window shows ffmpeg/ffprobe paths ending in `app.asar.unpacked\...` and version strings (not "error").
