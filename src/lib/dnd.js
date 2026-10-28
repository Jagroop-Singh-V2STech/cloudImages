/**
 * Internal drag-and-drop (moving items onto folders). We use a custom MIME
 * type so the page-wide file dropzone, which only reacts to drags carrying
 * "Files", ignores these.
 */
export const DRAG_TYPE = 'application/x-drivegallery-ids';

export function writeDragIds(e, ids, label) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
  e.dataTransfer.setData('text/plain', label);
  // A compact drag ghost instead of a full-size card screenshot.
  const ghost = document.createElement('div');
  ghost.textContent = ids.length > 1 ? `${ids.length} items` : label;
  ghost.style.cssText =
    'position:fixed;top:-100px;left:-100px;padding:6px 12px;border-radius:10px;background:#2550eb;color:#fff;font:600 13px Inter,system-ui;box-shadow:0 8px 20px rgba(0,0,0,.25);max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 12, 12);
  setTimeout(() => ghost.remove(), 0);
}

export function readDragIds(e) {
  try {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
