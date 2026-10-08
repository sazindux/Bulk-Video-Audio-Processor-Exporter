// Pure decision logic keeping the muted preview <video> in step with the Web Audio engine
// (the master clock). No DOM: unit-tested in test/sync.test.mjs.
//
// decide(event, ctx) -> list of actions to apply to the <video>:
//   { type: 'seek', time }  set currentTime
//   { type: 'play' }        call play() (ignore the promise rejection)
//   { type: 'pause' }       call pause()
// Events: 'select' (new source), 'play', 'pause', 'seek', 'tick', 'ended' (video ended before the engine), 'engine-end'.
// ctx: { enginePlaying, enginePos, videoTime, videoPlaying, videoEnded }

export const DRIFT_TOLERANCE = 0.2; // seconds

const seek = (time) => ({ type: 'seek', time: Math.max(0, Number(time) || 0) });

export function decide(event, ctx) {
  const { enginePlaying = false, enginePos = 0, videoTime = 0, videoPlaying = false, videoEnded = false } = ctx || {};
  switch (event) {
    case 'select':
      return [seek(enginePos), { type: 'pause' }];
    case 'play':
      return [seek(enginePos), { type: 'play' }];
    case 'pause':
    case 'engine-end':
      return [{ type: 'pause' }, seek(enginePos)];
    case 'seek':
      return [seek(enginePos)];
    case 'ended':
      return videoPlaying ? [{ type: 'pause' }] : [];
    case 'tick': {
      if (!enginePlaying) return videoPlaying ? [{ type: 'pause' }] : [];
      if (videoEnded) return []; // shorter video: stay on the last frame, never restart from 0
      const out = [];
      if (!videoPlaying) out.push({ type: 'play' });
      if (Math.abs(videoTime - enginePos) > DRIFT_TOLERANCE) out.push(seek(enginePos));
      return out;
    }
    default:
      return [];
  }
}

/** CSS aspect-ratio value for a probe; portrait and landscape both fit via max-width/max-height. */
export function aspectRatio(width, height) {
  const w = Number(width) || 0, h = Number(height) || 0;
  return w > 0 && h > 0 ? `${w} / ${h}` : '16 / 9';
}
