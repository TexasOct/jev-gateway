/** Compare the complete declared reference maps, independent of edit history. */
export function sameParameterReferences(
  current: Record<string, string>,
  original: Record<string, string>,
): boolean {
  return Object.keys(current).length === Object.keys(original).length
    && Object.entries(current).every(([key, value]) => original[key] === value);
}
