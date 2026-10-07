# Bulk Video Audio Processor & Exporter

Lightweight Windows desktop app to batch-add background music to videos with **zero video quality loss** (video stream is copied, never re-encoded), balance audio levels, rename outputs and strip all metadata.

## Status
Work in progress. See `handoff.md` for task status.

## Build
Built automatically by GitHub Actions (`.github/workflows/build.yml`) on every push to `main`.
Download the portable `.exe` from the workflow run artifacts, or from Releases for `v*` tags.

Local (optional): `npm ci && npm test && npm run dist`

## Tech
Electron + vanilla JS/HTML/CSS, FFmpeg/FFprobe via `ffmpeg-static` / `ffprobe-static`.
