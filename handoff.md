# Handoff: Bulk Video Audio Processor
Last updated: 2026-10-07 | Last commit: feat(task-0): scaffold + CI

## Task status
| Task | Name | Status (PENDING / IN PROGRESS / DONE) |
|---|---|---|
| 0 | Scaffold + CI | DONE |
| 1 | Core services | PENDING |
| 2 | UI shell + media pool | PENDING |
| 3 | Audio engine + timeline | PENDING |
| 4 | Inspector + settings | PENDING |
| 5 | Export engine | PENDING |
| 6 | Metadata + edge cases | PENDING |
| 7 | Polish + release | PENDING |

## Next steps (exact, for the very next chat)
- TASK 1: create `src/main/ffmpeg.js` (probe JSON -> {duration, hasAudio, vcodec, sampleRate, channels}; thumbnail at 10%; audio proxy extraction to `<temp>/bvape/`), pure parser in a separate testable function.
- Add IPC channels in main.js + preload.js: `media:probe`, `media:thumbnail`, `media:proxy`, `media:readFile` (ArrayBuffer for music decode), `dialog:openFiles`, `dialog:openFolder`.
- Clean `<temp>/bvape/` on `app.on('will-quit')`.
- Tests: probe parsing (with/without audio stream), thumbnail/proxy arg arrays.
- Check CI result of first push (see CI status). If red, fix first.

## Decisions made (do not revisit)
- Electron 33.x, electron-builder 25.x. `npm test` = `node --test` (auto-discovers `test/*.test.js`, works on Node 20 and 22).
- `src/main/paths.js` holds binary path resolution; `unpackedPath()` swaps `app.asar` -> `app.asar.unpacked`. ffprobe-static exports `{ path }`.
- asarUnpack: `node_modules/ffmpeg-static/**` and `node_modules/ffprobe-static/bin/win32/x64/**` only (other platforms' ffprobe binaries stay in asar; electron-builder prunes nothing else).
- `signAndEditExecutable: false` to avoid signing/rcedit issues on CI; `CSC_IDENTITY_AUTO_DISCOVERY=false`.
- Window: `autoHideMenuBar`, devTools only when `!app.isPackaged`, sandbox + contextIsolation on.
- Renderer API exposed as `window.bvape`. Temp dir name: `bvape`.

## Architecture notes
- File map:
  - `src/main/main.js` -> app lifecycle, window, IPC handlers
  - `src/main/paths.js` -> ffmpeg/ffprobe path resolver (dev + packaged)
  - `src/main/preload.js` -> contextBridge `window.bvape`
  - `src/renderer/index.html|styles.css|app.js` -> UI (Task 0: env table only)
  - `test/*.test.js` -> node:test unit tests
  - `.github/workflows/build.yml` -> win portable build, artifact, release on tags
- IPC channels: `env:info` -> () -> {ffmpegPath, ffprobePath, ffmpegVersion, ffprobeVersion, electron, node, packaged}
- State shape: not yet defined (Task 2).

## Known issues / bugs
- none yet

## CI status
- First push: CI unverified at time of writing. Check https://github.com/sazindux/Bulk-Video-Audio-Processor-Exporter/actions

## Manual tests for the user (Windows)
- [ ] Download artifact from Actions, run the portable exe, confirm window shows ffmpeg/ffprobe paths ending in `app.asar.unpacked\...` and version strings (not "error").
