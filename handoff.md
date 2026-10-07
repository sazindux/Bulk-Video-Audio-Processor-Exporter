# Handoff: Bulk Video Audio Processor
Last updated: 2026-10-07 | Last commit: feat(task-1): core ffmpeg services + IPC

## Task status
| Task | Name | Status (PENDING / IN PROGRESS / DONE) |
|---|---|---|
| 0 | Scaffold + CI | DONE |
| 1 | Core services | DONE |
| 2 | UI shell + media pool | PENDING |
| 3 | Audio engine + timeline | PENDING |
| 4 | Inspector + settings | PENDING |
| 5 | Export engine | PENDING |
| 6 | Metadata + edge cases | PENDING |
| 7 | Polish + release | PENDING |

## Next steps (exact, for the very next chat)
- TASK 2: replace Task-0 env table in `src/renderer/index.html` with three-column layout (media pool | timeline | inspector). Keep CSP meta.
- Create `src/renderer/state.js` (store with subscribe; videos[], music[], selectedVideoId, outputDir), `src/renderer/ui/mediaPool.js` (video list w/ thumbnails via `data:` URL from `readFile` of the thumbnail path, music list with preview `<audio>` using blob URL from readFile), drag-and-drop with `window.bvape.pathForFile(file)`, buttons calling `openFiles('video'|'music')`.
- Per-video default settings: { musicId:null, origVol:1, musicVol:1, offsetMs:0, outputName:<basename>, status:'queued' }.
- Filter dropped files by extension; probe each; videos with hasVideo=false are rejected with a toast.
- Keep `app.js` as bootstrap only.

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
  - `src/renderer/index.html|styles.css|app.js` -> UI (Task 0: env table only)
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
- State shape: not yet defined (Task 2).

## Known issues / bugs
- **ACTION REQUIRED (user, one time):** the GitHub integration token has no `workflows` permission, so `.github/workflows/build.yml` cannot be pushed from the sandbox. The workflow is committed at `ci/build.yml`. Copy it to `.github/workflows/build.yml` in the GitHub web UI (Add file -> Create new file, paste content) or run locally: `mkdir -p .github/workflows && cp ci/build.yml .github/workflows/build.yml && git add . && git commit -m "ci: add workflow" && git push`. Future CI edits by the AI will land in `ci/build.yml` and must be copied the same way.

## CI status
- CI unverified: workflow file not yet in `.github/workflows/` (see Known issues). Check https://github.com/sazindux/Bulk-Video-Audio-Processor-Exporter/actions

## Manual tests for the user (Windows)
- [ ] Download artifact from Actions, run the portable exe, confirm window shows ffmpeg/ffprobe paths ending in `app.asar.unpacked\...` and version strings (not "error").
