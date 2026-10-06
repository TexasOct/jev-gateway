/** In-memory history. Viewport navigation is intentionally outside the undo stack. */
export function createHistory<T>(equal: (a: T, b: T) => boolean, limit = 50) {
  let current: T | null = null;
  const past: T[] = [], future: T[] = [];
  return {
    reset(value: T) { current = value; past.length = 0; future.length = 0; },
    record(value: T) {
      if (current !== null && equal(current, value)) { current = value; return false; }
      if (current !== null) past.push(current);
      if (past.length > limit) past.shift();
      current = value; future.length = 0;
      return true;
    },
    undo() { const value = past.pop(); if (value === undefined) return null; if (current !== null) future.push(current); current = value; return value; },
    redo() { const value = future.pop(); if (value === undefined) return null; if (current !== null) past.push(current); current = value; return value; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}

export function isTextEditing(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']");
}

/** Fixed-position menus never inherit the board transform. */
export function menuPosition(point: { x: number; y: number }, viewport: { width: number; height: number }, size: { width: number; height: number }) {
  return { x: Math.max(8, Math.min(point.x, viewport.width - size.width - 8)), y: Math.max(8, Math.min(point.y, viewport.height - size.height - 8)) };
}
