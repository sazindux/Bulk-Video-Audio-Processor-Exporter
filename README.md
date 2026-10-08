# Bulk Video Audio Processor & Exporter

Lightweight Windows (10/11 x64) desktop app to batch-add background music to videos with **zero video quality loss** - the video stream is copied, never re-encoded - while balancing audio levels, renaming outputs and stripping **all** metadata.

## Download

- **Releases**: every `v*` tag publishes `BulkVideoAudioProcessor-<version>-portable.exe` on the [Releases](../../releases) page.
- **Latest build**: every push to `main` runs the *Build portable exe* workflow; the `.exe` is attached as a workflow artifact under *Actions*.

The app is portable: no installer, no registry entries, no network access. Preferences (last output folder, preview visibility) live in `%APPDATA%\bulk-video-audio-processor\prefs.json`; temporary thumbnails, audio proxies and preview proxies go to `%TEMP%\bvape` and are deleted on exit.

## What's new in 1.1.0

- **Drag a track onto the timeline**: drag any item from the *Music* pool onto the *Background music* lane. A ghost block shows where the track will start (its left edge follows the pointer, its width shrinks to the remaining video time); drop to assign the track at that position. Dropping onto an existing block replaces the track; volumes are kept and playback continues.
- **Muted video preview**: a small card under the music lane shows the current video frame and follows Play/Pause/seek of the audio timeline. It is always muted (the Web Audio mix is the only sound) and never used for export. Toggle it with the **Preview** button in the timeline header; the choice is remembered. Click the card to play/pause.

## Usage

1. **Import** videos (`.mp4 .mov .mkv`) and music (`.mp3 .wav .m4a`) by dragging them into the left column or with the **+ Add** buttons.
2. **Select a video** in the list. The centre column shows an audio-only timeline: the waveform of the original audio, and the assigned music as a draggable block.
3. **Assign music** in the inspector (right column) or drag a track from the *Music* pool onto the music lane, then drag the music block (or type a start offset) to position it. If the music is longer than the remaining video it is trimmed at the video end (a *trimmed* badge appears).
   - **Positive start** (e.g. `3.0`): the music begins 3 s after the video starts (silence before it).
   - **Negative start** (e.g. `-10.5`): the first 10.5 s of the track are skipped so that the part of the song 10.5 s in lines up with the very start of the video. Drag the block **left past 0** or type a negative number in *Music start*. The block stays pinned to the left edge with a hatched strip and a `◀ skips 0:10` badge; the inspector shows how much is skipped. The range is `-musicDuration .. videoDuration`.
4. **Balance levels** with the two sliders (0-200 %). Press **Play / Space** to hear the mix live; the muted **preview card** shows the matching video frame.
5. **Rename** the output in the *Output name* field. Illegal Windows characters are rejected, reserved names are prefixed, and collisions get ` (1)`, ` (2)`...
6. Use the **All** buttons to apply the current music track, volumes or offset to every video.
7. Pick an **Output folder** and press **Export all**. Items are processed one at a time with per-item and overall progress; **Cancel** kills FFmpeg and removes the partial file. When done, **Open folder** opens the result in Explorer.

### How the audio is mixed

```
[original] aresample=48000, stereo, pad to video length, volume=V
[music]    (start < 0: atrim=start=|offset|, asetpts=PTS-STARTPTS) aresample=48000, stereo, (start >= 0: adelay=offset) volume=M, pad
amix(duration=first) -> volume=2 -> alimiter(0.97) -> AAC 192 kbit/s
```

`amix` halves each input; both inputs are padded to the full video length so that scaling is constant, and `volume=2` compensates - **the sliders therefore map to true gain** (100 % = unchanged). The limiter prevents clipping at 200 %. Videos without an audio track use a silent source so the music still lines up.

### Output

- Video: `-c:v copy` (bit-identical to the source, rotation/display matrix kept).
- Audio: AAC 192 kbit/s, 48 kHz stereo.
- Container: `.mp4` with `+faststart`. If the source codec is not MP4-compatible (e.g. FFV1, ProRes in .mkv/.mov) the source container is kept and the item shows a warning badge.
- Metadata: `-map_metadata -1` for the file and every stream, `-map_chapters -1`, `bitexact` flags (no encoder/version strings), `-empty_hdlr_name` (no handler names). After each export the app runs FFprobe on the result and shows **Metadata: verified clean** or lists any leftover tag. The only tags that remain are structural ones required by the container (`major_brand`/`compatible_brands`, stream `language=und`; in MKV, `encoder=Lavf` without version and `DURATION`).

## Build

Builds happen on GitHub Actions (`windows-latest`): `npm ci` -> `npm test` -> `electron-builder --win portable --x64`. No code signing.

Local (optional, needs Node 20+):

```
npm ci
npm test            # unit tests (node --test)
npm start           # run in development (F12 = devtools)
npm run dist        # dist/BulkVideoAudioProcessor-<version>-portable.exe (on Windows)
```

Headless smoke test on Linux (needs xvfb and FFmpeg-generated media, see `handoff.md`).

## Troubleshooting

- **Windows SmartScreen "unrecognized app"**: the executable is unsigned. Click *More info -> Run anyway*. Some antivirus products quarantine unsigned portable Electron apps; whitelist the file if needed.
- **First start is slow**: the portable exe unpacks itself to `%TEMP%` on each launch; subsequent starts are faster.
- **Export fails with "moov atom not found" / "Invalid data"**: the source file is truncated or corrupted; FFprobe already marks such files with an error at import.
- **Music does not line up with the preview**: the preview decodes a 48 kHz AAC proxy of the original audio; a few ms of encoder delay are normal. The export uses the exact offset in milliseconds.
- **Very long paths**: output names are capped at 200 characters. If the output folder is deep, enable Windows long paths (`gpedit` -> *Enable Win32 long paths*) or choose a shorter folder.
- **No audio in preview**: Web Audio needs a user gesture; click Play once. If the video has no audio track the waveform area shows *no audio*.
- **Video preview shows "Preparing preview…"**: the built-in Chromium cannot decode this video codec (typically **HEVC/H.265** from phones, or exotic codecs in `.mkv`). The app builds a small muted 360p H.264 proxy with FFmpeg in `%TEMP%\bvape` (a few seconds for long videos, cached until exit) and plays that instead. This only affects the preview - the export still copies the original video stream untouched.
- **Video preview stays black / "Preview unavailable"**: the proxy build failed (see the toast). Hide the card with **Preview** and keep working; audio preview and export do not depend on it.

## Tech

Electron 33 + vanilla JS/HTML/CSS (ES modules, no bundler), Web Audio API for preview, Canvas waveform, a privileged `bvape-media://` scheme (token-mapped files, HTTP Range support) for the muted video preview, FFmpeg/FFprobe via `ffmpeg-static` / `ffprobe-static` spawned with argument arrays (never shell strings). Renderer is sandboxed with `contextIsolation`, a minimal `contextBridge` API and a strict CSP. See `handoff.md` for architecture notes and task history.
