# Handoff: Bulk Video Audio Processor
Last updated: 2026-10-07 | Last commit: feat(task-4): inspector + settings

## Task status
| Task | Name | Status (PENDING / IN PROGRESS / DONE) |
|---|---|---|
| 0 | Scaffold + CI | DONE |
| 1 | Core services | DONE |
| 2 | UI shell + media pool | DONE |
| 3 | Audio engine + timeline | DONE |
| 4 | Inspector + settings | DONE |
| 5 | Export engine | PENDING |
| 6 | Metadata + edge cases | PENDING |
| 7 | Polish + release | PENDING |

## Next steps (exact, for the very next chat)
- TASK 5: create `src/main/exporter.js` (CommonJS): `buildFilter({hasAudio, origVol, musicVol, offsetMs, duration})`, `buildArgs({video, music|null, out, ...})` exactly per spec (args ARRAY; no-audio video -> extra input `-f lavfi -i anullsrc=r=48000:cl=stereo` with `atrim=0:D`; no music -> only original branch, still apad+volume); `parseProgress(chunk)` -> out_time_ms; `runExport(job, onProgress)` spawns ffmpeg with `-progress pipe:1`, kills on cancel (`child.kill()` then unlink partial output), resolves {ok, stderrTail}.
- Queue in main: IPC `export:start` (payload: {outputDir, items:[{id, video, music, hasAudio, duration, origVol, musicVol, offsetMs, outputName, ext}]}) processes ONE at a time; sends `export:progress` ({id, progress}), `export:item` ({id, status, error, outputPath}), `export:done` ({ok, failed, cancelled}) via `webContents.send`; `export:cancel`; `shell:openPath(dir)`. Preload: `startExport`, `cancelExport`, `onExportEvent(cb)`, `openFolder(dir)` -> `shell.openPath`.
- Collisions: in main, use `src/shared/filename.js` via `await import(pathToFileURL(path))` (ESM) -> `uniqueName(base, ext, fs.existsSync in outputDir, batchSet)`; never equal to source path (if same -> add suffix).
- Renderer `src/renderer/ui/exportPanel.js`: `#btn-export` builds payload from state (skip videos without probe; use `outputExt`), sets `state.exporting`, updates settings.status/progress per event, overall bar `#overall-progress`, `#btn-cancel`, `#btn-open-folder`, summary toast.
- Tests `test/exporter.test.js`: exact args + filter string for (a) audio+music (b) no-audio+music (c) audio no music; parseProgress.

## Decisions made (do not revisit)
- Electron 33.x, electron-builder 25.x. `npm test` = `node --test` (auto-discovers `test/*.test.js`, works on Node 20 and 22).
- `src/main/paths.js` holds binary path resolution; `unpackedPath()` swaps `app.asar` -> `app.asar.unpacked`. ffprobe-static exports `{ path }`.
- asarUnpack: `node_modules/ffmpeg-static/**` and `node_modules/ffprobe-static/bin/win32/x64/**` only (other platforms' ffprobe binaries stay in asar; electron-builder prunes nothing else).
- `signAndEditExecutable: false` to avoid signing/rcedit issues on CI; `CSC_IDENTITY_AUTO_DISCOVERY=false`.
- Window: `autoHideMenuBar`, devTools only when `!app.isPackaged`, sandbox + contextIsolation on.
- Renderer API exposed as `window.bvape`. Temp dir name: `bvape`. Temp file names = sha1(path).slice(0,16) + ext.
- MP4-compatible video codecs: h264, hevc, mpeg4, av1, vp9, mjpeg (others keep source container).
- Inline rename: invalid names show an error while typing (setting not updated); on blur/Enter the name is auto-sanitized. Output ext = .mp4, or source ext when codec not MP4-compatible.
- Engine: changing offset/volume while playing reschedules sources seamlessly (setTargetAtTime for gain). Timeline x-axis = video duration; music block width = visible (trimmed) duration.
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
  - `src/renderer/audio/clamp.js` -> pure: clampStart, musicBlock({start,visibleDur,trimmed,endsAt}), pxToSec/secToPx, toMs
  - `src/renderer/audio/engine.js` -> AudioContext(48k), decodeFile/decodeVideoAudio (cached by path), 2 BufferSources -> 2 GainNodes, `engine` {play,pause,toggle,stop,seek,load,setVolumes,setOffset,position,onChange}, peaks()
  - `src/renderer/audio/timeline.js` -> waveform canvas, ruler, playhead (rAF), draggable music block (pointer capture), trimmed badge, click-to-seek, Space toggles play
  - `src/shared/filename.js` (ESM) -> sanitizeName, validateName, uniqueName(base, ext, exists, avoidSet), MAX_NAME=200
  - `src/main/prefs.js` -> JSON prefs in userData/prefs.json ({outputDir})
  - `src/renderer/ui/inspector.js` -> settings form bindings, outputExt(v), apply-all (music/offset re-clamped per video), output folder picker (persisted)
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
  - `prefs:get` -> () -> {outputDir?}; `prefs:set` -> (patch) -> merged prefs
  - preload also exposes `pathForFile(File)` (webUtils.getPathForFile)
- State shape: `state = { videos:[{id,path,name,probe,thumb(blob url),error,settings}], music:[{id,path,name,probe,duration,error}], selectedVideoId, outputDir, exporting }`; `settings = { musicId, origVol(0..2), musicVol(0..2), offsetMs, outputName(no ext), status(queued|processing|done|failed), progress, error, outputPath }`.
- Headless smoke test (works in sandbox with xvfb): `BVAPE_SMOKE=1 BVAPE_SMOKE_MS=6000 BVAPE_SMOKE_FILES="/tmp/media/a.mp4;/tmp/media/song.mp3" xvfb-run -a npx electron --no-sandbox --disable-gpu .` -> prints `[renderer:*]` console lines incl. `SMOKE {...}` and `BOOT_OK`. Generate media with lavfi (`testsrc`, `sine`). Install xvfb with `sudo apt-get install -y xvfb libgtk-3-0 libnss3 libasound2t64 libgbm1`.

## Known issues / bugs
- **ACTION REQUIRED (user, one time):** the GitHub integration token has no `workflows` permission, so `.github/workflows/build.yml` cannot be pushed from the sandbox. The workflow is committed at `ci/build.yml`. Copy it to `.github/workflows/build.yml` in the GitHub web UI (Add file -> Create new file, paste content) or run locally: `mkdir -p .github/workflows && cp ci/build.yml .github/workflows/build.yml && git add . && git commit -m "ci: add workflow" && git push`. Future CI edits by the AI will land in `ci/build.yml` and must be copied the same way.

## CI status
- CI unverified: workflow file not yet in `.github/workflows/` (see Known issues). Check https://github.com/sazindux/Bulk-Video-Audio-Processor-Exporter/actions

## Manual tests for the user (Windows)
- [ ] Download artifact from Actions, run the portable exe, confirm window shows ffmpeg/ffprobe paths ending in `app.asar.unpacked\...` and version strings (not "error").
