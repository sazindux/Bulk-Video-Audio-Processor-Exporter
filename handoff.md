# Handoff: Bulk Video Audio Processor
Last updated: 2026-10-08 | Last commit: feat(task-9): preview backend (bvape-media protocol, Range, proxy fallback)

Round 3 (Tasks 8-11: music drag-to-timeline + muted video preview). Round 1 (tasks 0-7, initial build) and bugfix round 2 (tasks 0-3 below) are DONE and described under "Decisions made"/"Architecture notes".

## Task status
| Task | Name | Status (PENDING / IN PROGRESS / DONE) |
|---|---|---|
| 0 | Folder Picker & Export Path Fix | DONE |
| 1 | Timeline Dragging & Negative Offsets | DONE |
| 2 | Preview & FFmpeg Filter Updates | DONE |
| 3 | Verification & CI Sync | DONE |
| 8 | Feature A: drag music from pool to timeline | DONE |
| 9 | Preview backend: bvape-media protocol, Range, preview:url IPC, ffmpeg proxy fallback | DONE |
| 10 | Preview UI: card, toggle + pref, sync logic + tests | PENDING |
| 11 | Polish: v1.1.0, README, manual checklist | PENDING |

## Next steps (exact, for the very next chat)
- Start Task 10 (renderer). Plan: new `src/renderer/preview/sync.js` (pure `decide(event, {enginePlaying, enginePos, videoTime, videoEnded}) -> actions[]`, tested in `test/sync.test.mjs`) + `src/renderer/preview/preview.js` (`initPreview()`: one `<video id="preview-video" muted playsinline preload="metadata">` inside `#preview-card` below the music lane in `timeline-body`; header button `#btn-preview` toggles `hidden` and saves `prefs.previewHidden` via `api.setPrefs`; on selection: `api.previewUrl(v.path)` -> `src`, `poster = v.thumb`, `currentTime = engine.position`, pause; `engine.onChange` tick -> sync rules (resync if |dt|>0.2 s while playing); `<video>` `error` -> `api.previewProxy(v.path)` with "Preparing preview…" overlay, cancel via `api.cancelPreview()` when selection changes; click on card -> `engine.toggle()`). Backend API from Task 9: `api.previewUrl(path)` -> `{ok, value: 'bvape-media://m/<token>'}`, `api.previewProxy(path)` -> `{ok, value: url}` (rejects with 'cancelled' when killed), `api.cancelPreview()`. Smoke hook in `app.js` already proves `<video>` loads + seeks via the protocol (`SMOKE_PREVIEW {duration:5, seeked:3}`); replace it with a check of the real `#preview-video` once the UI exists. Note: `fetch()` of bvape-media is blocked by `connect-src 'self'` (intended) - only `<video>` uses it.
- Round-2 manual checks still open for the user (see checklist).

## Decisions made (do not revisit)
- Electron 33.x, electron-builder 25.x. `npm test` = `node --test` (auto-discovers `test/*.test.js`, works on Node 20 and 22).
- `src/main/paths.js` holds binary path resolution; `unpackedPath()` swaps `app.asar` -> `app.asar.unpacked`. ffprobe-static exports `{ path }`.
- asarUnpack: `node_modules/ffmpeg-static/**` and `node_modules/ffprobe-static/bin/win32/x64/**` only (other platforms' ffprobe binaries stay in asar; electron-builder prunes nothing else).
- `signAndEditExecutable: false` to avoid signing/rcedit issues on CI; `CSC_IDENTITY_AUTO_DISCOVERY=false`.
- Window: `autoHideMenuBar`, devTools only when `!app.isPackaged`, sandbox + contextIsolation on.
- Renderer API exposed as `window.bvape` (`pickFolder()` = picker -> string|null, `openPath(dir)` = Explorer). Temp dir name: `bvape`. Temp file names = sha1(path).slice(0,16) + ext.
- MP4-compatible video codecs: h264, hevc, mpeg4, av1, vp9, mjpeg (others keep source container).
- Inline rename: invalid names show an error while typing (setting not updated); on blur/Enter the name is auto-sanitized. Output ext = .mp4, or source ext when codec not MP4-compatible.
- Engine: changing offset/volume while playing reschedules sources seamlessly (setTargetAtTime for gain). Timeline x-axis = video duration; music block width = visible (trimmed) duration.
- Negative offsets (round 2): `clampStart` range is `[-musicDur, maxStart]`; `musicBlock` returns `{start, visibleStart, visibleDur, skip, trimmed, trimmedStart, trimmedEnd, endsAt}`. Block is pinned at x=0 when start<0 with class `trimmed-start` (hatched left strip) + badge `◀ skips m:ss`; `silent` class when nothing audible. `peaks(buf, cols, fromFrac, toFrac)` draws only the audible slice. Inspector `#in-offset` has dynamic min/max, accepts negative floats and ',' decimals.
- Export (round 2): `offsetMs >= 0` -> `[m]aresample,aformat,adelay=OFF:all=1,volume,apad`; `offsetMs < 0` -> `[m]atrim=start=ABS_SEC,asetpts=PTS-STARTPTS,aresample,aformat,volume,apad` (no adelay). Verified with real ffmpeg-static on lavfi media (exit 0, 5.02 s output). Engine: `startSources` uses `musicBlock` visibleStart/skip; `src.start(now, pos - start, ...)` works for both signs.
- Export: args array per spec + `-loglevel error` (stderr tail = real errors only) + `-metadata:s:v/a handler_name=`; `-movflags +faststart` only for .mp4/.mov outputs. No-audio video -> `-f lavfi -i anullsrc=r=48000:cl=stereo` as input 1 with `atrim=0:D`; music becomes input 2. No music -> single padded branch + limiter.
- Cancel: `child.kill()` then unlink partial output; current item and remaining items go back to `queued`. Queue never overwrites the source (resolveOutputPath treats the source path as taken).
- Metadata: `-empty_hdlr_name 1` (mp4/mov muxer option) removes handler_name; `-metadata:s handler_name=` is ignored by the muxer. Accepted leftover tags (structural, no personal data): mp4 global major_brand/minor_version/compatible_brands, stream `language`; mkv global `encoder=Lavf` (bitexact, no version), stream `DURATION`, audio stream `ENCODER=Lavc aac` (cannot be suppressed). `checkMetadata` flags everything else incl. any value with version digits.
- Verification runs ffprobe on every finished output (`exporter.verifyOutput`); result stored in `settings.verification`, shown as `tags` warn badge in the pool + 'Metadata' row in the inspector info.
- Corrupted/garbage inputs: ffprobe fails at import (item shows error, excluded from export by `exportableVideos`); if ffmpeg fails anyway the stderr tail (last 6 lines) is the item error. Long unicode paths/names: verified OK on Linux (200-char sanitized names + 250-char dirs); Windows MAX_PATH relies on Win10 long-path support/Electron - keep MAX_NAME=200.
- Icon: `build/icon.ico` (16-256, BMP entries) + `build/icon.png` (window/taskbar icon in dev and packaged; whitelisted in `files`). `signAndEditExecutable: true` so rcedit embeds the icon (no signing: `CSC_IDENTITY_AUTO_DISCOVERY=false`).
- Application menu removed (`Menu.setApplicationMenu(null)`); F12 toggles devtools in dev only. `about` span in the export bar shows `v<version>` with ffmpeg/ffprobe/Electron info in the tooltip (`env:info` now includes `version`).
- Size: `files` excludes `ffprobe-static/bin/{darwin,linux}` (~230 MB that would otherwise be packed into the asar) and ffmpeg-static install scripts. Local `--linux --dir` check: app.asar 384 KB + unpacked ffmpeg only.
- `src/shared/package.json` = `{"type":"module"}` so main can `import()` filename.js without warnings.
- Smoke-tested locally with ffmpeg-static linux binaries + lavfi media (probe, thumb, proxy, errors) - works.
- Task 9 (preview backend): `src/main/preview.js` has no electron import (unit-testable): `parseRange(header,size)` -> `{status:200|206|416,start,end}`, `rangeHeaders`, `registerPreview(path)` -> `bvape-media://m/<32-hex token>` (random token per path, only .mp4/.mov/.mkv), `handleRequest(Request)` -> `Response` (manual Range via `fs.createReadStream` + `Readable.toWeb`; `net.fetch(file://)` was not used so behaviour is deterministic), `previewProxy(path)` -> URL of `<temp>/bvape/<hash>_preview.mp4` (360p libx264 ultrafast crf30, `-an`, cached, one build at a time, `cancelPreviewProxy()` kills + unlinks). `main.js`: `registerSchemesAsPrivileged` at module load, `protocol.handle` in whenReady, IPC `preview:url|proxy|cancel`, `will-quit` cancels proxy before temp cleanup. CSP `media-src 'self' blob: bvape-media:`.
- Task 8 (drag music -> timeline): no `inMs` setting exists (negative offset = skip), so a drop sets only `musicId` + `offsetMs` (start clamped to `[0, maxStart]`, volumes kept). `dropPlacement(x, laneW, videoDur, musicDur)` + `isFileDrag(types)` in `clamp.js`. Dragged id lives in `src/renderer/ui/musicDrag.js` (module var + MIME `application/x-bvape-music`). All OS-file drop zones in `mediaPool.setupDrop` ignore drags without a `Files` type. Lane shows `#lane-placeholder` when a probed video has no music; `#drop-ghost` follows the pointer (left edge) with width = min(track, remaining).

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
  - `src/shared/outputPath.js` (ESM) -> asPathString(any)->string|null, dialogResultToPath(result); used by state.setOutputDir + inspector
  - `src/shared/filename.js` (ESM) -> sanitizeName, validateName, uniqueName(base, ext, exists, avoidSet), MAX_NAME=200
  - `src/main/preview.js` -> bvape-media protocol handler (token map, Range), preview proxy builder
  - `src/main/prefs.js` -> JSON prefs in userData/prefs.json ({outputDir})
  - `src/main/exporter.js` -> buildFilter, buildArgs (args array), parseProgress, runExport (spawn, progress, cancel), resolveOutputPath (sanitize + unique + never source), startQueue (sequential, sends export:* events, optional verify hook)
  - `src/renderer/ui/exportPanel.js` -> buildPayload from state, start/cancel/open folder, mirrors events into settings.status/progress/outputPath/verification, overall bar
  - `src/renderer/ui/inspector.js` -> settings form bindings, outputExt(v), apply-all (music/offset re-clamped per video), output folder picker (persisted)
  - `src/renderer/ui/mediaPool.js` -> importPaths (filters by ext, probes 3 at a time), drag-drop (pathForFile), video/music lists (music items `draggable`), music preview `<audio>` via blob URL
  - `src/renderer/ui/musicDrag.js` -> shared dragged-music-id state for pool -> timeline drags
  - `test/*.test.js` -> node:test unit tests
  - `.github/workflows/build.yml` -> win portable build, artifact, release on tags
- IPC channels (invoke; media:* return `{ok:true,value}` or `{ok:false,error}` with ffmpeg stderr tail):
  - `env:info` -> () -> {ffmpegPath, ffprobePath, ffmpegVersion, ffprobeVersion, electron, packaged}
  - `dialog:openFiles` -> ('video'|'music') -> string[] paths
  - `dialog:openFolder` -> () -> string|null (preload name: `pickFolder`; main validates typeof string)
  - `media:probe` -> (path) -> {duration, hasVideo, hasAudio, vcodec, mp4Compatible, width, height, sampleRate, channels, acodec, formatName, tags, streamTags[], chapters}
  - `media:thumbnail` -> (path, duration) -> jpg path in temp
  - `media:proxy` -> (path) -> m4a path in temp (fails on no-audio video: caller must check hasAudio first)
  - `media:readFile` -> (path) -> ArrayBuffer
  - `preview:url` -> (path) -> {ok, value: 'bvape-media://m/<token>'}; `preview:proxy` -> (path) -> {ok, value: url} (error 'cancelled' if killed); `preview:cancel` -> {ok} (preload: `previewUrl`, `previewProxy`, `cancelPreview`)
  - `prefs:get` -> () -> {outputDir?}; `prefs:set` -> (patch) -> merged prefs
  - `export:start` -> ({outputDir, items:[{id, video, music|null, hasAudio, duration, origVol, musicVol, offsetMs, outputName, ext}]}) -> {ok}|{ok:false,error}; `export:cancel` -> {ok}; `shell:openPath` -> (dir:string) -> {ok}|{ok:false,error} (preload name: `openPath`; non-string -> error)
  - main -> renderer pushes: `export:progress` {id, progress 0..1}; `export:item` {id, status, error?, outputPath?, verification?}; `export:done` {ok, failed, cancelled, total, error?}
  - preload also exposes `pathForFile(File)` (webUtils.getPathForFile), `startExport`, `cancelExport`, `onExportEvent(cb(channel,data))`, `openFolder(dir)`
- State shape: `state = { videos:[{id,path,name,probe,thumb(blob url),error,settings}], music:[{id,path,name,probe,duration,error}], selectedVideoId, outputDir, exporting }`; `settings = { musicId, origVol(0..2), musicVol(0..2), offsetMs, outputName(no ext), status(queued|processing|done|failed), progress, error, outputPath }`.
- Headless smoke export: add `BVAPE_SMOKE_OUT=/tmp/out2` to the smoke command -> renderer clicks Export and prints `SMOKE_EXPORT [...]` + `EXPORT_DONE {...}`.
- Headless smoke test (works in sandbox with xvfb): `BVAPE_SMOKE=1 BVAPE_SMOKE_MS=6000 BVAPE_SMOKE_FILES="/tmp/media/a.mp4;/tmp/media/song.mp3" xvfb-run -a npx electron --no-sandbox --disable-gpu .` -> prints `[renderer:*]` console lines incl. `SMOKE {...}` and `BOOT_OK`. Generate media with lavfi (`testsrc`, `sine`). Install xvfb with `sudo apt-get install -y xvfb libgtk-3-0 libnss3 libasound2t64 libgbm1`.

## Known issues / bugs
- `.github/workflows/build.yml` now exists (user copied it). `ci/build.yml` is kept as the AI-editable mirror; if the token lacks `workflows` permission, edits land in `ci/build.yml` and the user copies them over. Keep both identical.
- Fixed (task-0, bugfix round 2): folder picker showed `[object Object]` because `preload.js` had two `openFolder` keys - the later `shell:openPath` one shadowed the dialog one, so the picker returned `{ok:true}`. Renamed to `pickFolder`/`openPath`, main returns strictly string|null, `setOutputDir` sanitizes via `asPathString`, corrupt prefs are cleared at startup.

## CI status
- CI unverified from the sandbox (workflow file must be copied by the user; see Known issues). Local checks: `npm test` 30/30 green; `electron-builder --dir --linux` packages fine with the current config; headless xvfb smoke (import, inspector, full export + verification) passes.
- Check: https://github.com/sazindux/Bulk-Video-Audio-Processor-Exporter/actions

## Manual tests for the user (Windows)
- [ ] Portable exe starts (SmartScreen: More info -> Run anyway); window has the app icon in title bar/taskbar; no menu bar; hover the `v1.0.0` label bottom-right -> tooltip shows ffmpeg/ffprobe paths ending in `app.asar.unpacked\...` and version strings.
- [ ] Drag-and-drop 3 videos (one `.mov`, one without audio if possible) and 2 music files; thumbnails and durations appear; unsupported/corrupt files show an error item.
- [ ] Select a video: waveform renders, Play/Space plays original audio; assign music, drag the block (cannot go < 0 or past the video end; long music shows *trimmed*); offset field stays in sync; both volume sliders change loudness live.
- [ ] Inline rename: `a:b` shows an error, `CON` becomes `_CON` on blur; `All` buttons copy music/volumes/offset to every video.
- [ ] Output folder is remembered after restart.
- [ ] Export all: badges go processing -> done, mini and overall progress bars move, toast summary; Cancel mid-way stops within ~1 s and leaves no partial file; Open folder opens Explorer.
- [ ] Output plays in Windows Media Player/VLC with video identical to source (same resolution/bitrate in MediaInfo) and mixed audio; `.mov`/`.mkv` with non-MP4 codec keeps its container with a warn badge.
- [ ] Inspector shows `Metadata: verified clean`; Explorer Properties -> Details has no title/author/date/GPS; MediaInfo shows no `Writing application`/`Encoded date`/handler strings.
- [ ] Exporting twice to the same folder creates ` (1)` copies; exporting into the source folder never overwrites the source.
- [ ] Paths with spaces/unicode (e.g. `C:\Vidéos test\日本.mp4`) import and export correctly.
- [ ] Round 2: Output folder picker shows the real path (not `[object Object]`), export writes into it, *Open folder* opens it. Drag the music block left past 0 -> hatched strip + `◀ skips` badge; *Music start* negative; typing `-10.5` works; preview from 0:00 plays the song from 10.5 s in; export matches.
- [ ] Round 3 (Task 8): drag a track from the Music pool over the lane -> lane highlights, ghost block's left edge follows the pointer, ghost shrinks near the end for long tracks; drop at several positions -> block + waveform appear there, *Music start* matches; drop onto an existing block replaces the track; drop while playing keeps playing; drop with no video selected -> toast; dragging OS files into the pool/timeline still imports.
