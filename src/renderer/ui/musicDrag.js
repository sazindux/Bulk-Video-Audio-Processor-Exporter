// Shared state for dragging a music track from the pool onto the timeline.
// Browsers hide dataTransfer.getData() during dragover, so the dragged id is kept here.
export const MUSIC_MIME = 'application/x-bvape-music';
let draggedId = null;

export function beginMusicDrag(e, id) {
  draggedId = id;
  e.dataTransfer.setData(MUSIC_MIME, id);
  e.dataTransfer.effectAllowed = 'copy';
}
export const endMusicDrag = () => { draggedId = null; };
export const draggedMusicId = () => draggedId;
/** True when the current drag carries a music id (checks the shared variable, then the MIME type). */
export const isMusicDrag = (e) => !!draggedId || Array.from(e.dataTransfer?.types || []).includes(MUSIC_MIME);
