export function appendUnique<T>(current: T[], next: T[], id: (item: T) => string): T[] {
  const seen = new Set(current.map(id));
  return [...current, ...next.filter((item) => {
    const key = id(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

export function windowRange(count: number, top: number, viewport: number, row: number) {
  const start = Math.max(0, Math.floor(top / row) - 3);
  const end = Math.min(count, Math.ceil((top + viewport) / row) + 3);
  return { start, end };
}
