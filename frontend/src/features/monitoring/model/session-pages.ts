import type { SessionsPayload } from "@/shared/api/types";
import { appendUnique } from "./pagination";

/** Walk from the last successful page. A failed fetch leaves that cursor available for retry. */
export async function remainingSessionPages(
  first: SessionsPayload,
  fetchPage: (cursor: string) => Promise<SessionsPayload>,
  onPage: (page: SessionsPayload) => void,
  isCurrent: () => boolean,
): Promise<{ page: SessionsPayload; stopped: boolean; cursorError: boolean }> {
  let page = first;
  const seen = new Set<string>();
  while (page.has_more && isCurrent()) {
    const cursor = page.next_cursor;
    if (!cursor || seen.has(cursor)) return { page, stopped: false, cursorError: true };
    seen.add(cursor);
    const next = await fetchPage(cursor);
    if (!isCurrent()) return { page, stopped: true, cursorError: false };
    page = { ...next, data: appendUnique(page.data, next.data, (row) => row.session_id) };
    onPage(page);
  }
  return { page, stopped: !isCurrent(), cursorError: false };
}
