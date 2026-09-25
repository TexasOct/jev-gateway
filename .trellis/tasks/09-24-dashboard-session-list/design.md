# Design: bounded monitoring lists

## Boundaries

Extend the current sessions and selected-session detail endpoints with bounded cursor pagination. Response arrays retain their names, but callers that previously expected all rows in one response must follow `next_cursor`. The sessions endpoint still includes only live memory sessions, enriched with latest safe retained metadata. The detail endpoint still requires a live session and returns its retained request records. Pagination must not change live-session TTL, evidence retention, or history scope.

## Scroll windows

- The sessions list and request timeline each own a scroll container with a fixed block size. Set equal `min-height` and `max-height` and an explicit `height` using a shared CSS token; adapt the token by viewport with CSS media queries while keeping min=max at each breakpoint.
- Use a virtualized window or equivalent incremental list rendering so off-window items do not all create DOM nodes. Preserve stable session/request keys, keyboard navigation, selection and scroll position.
- Give the details-pane request list more viewport height than the session selector list. Each container still has a fixed `height == min-height == max-height`, but use per-list CSS tokens and breakpoints so timeline evidence has room to inspect.
- Fetch the initial page and request the next cursor when the scroll window approaches its end. Deduplicate by stable session ID/request identity while appending, and stop on `has_more=false` or a null cursor.
- Empty/loading/error states render inside the same fixed-height containers. A loading or pagination failure must not resize the panel or discard already rendered rows.
- On session change, abort or ignore stale request detail results and reset the detail list's cursor/window before appending the new session's requests.

## Cursor contracts

- Session rows come from a fresh live-memory snapshot enriched by one batched, content-free evidence query. Sort `(has_retained_request, effective_time, session_id)` descending. The flag separates evidence wall-clock time from memory-only monotonic update time; do not display monotonic values as dates.
- Request rows use SQLite `received_at DESC, rowid DESC`. The writer-thread query binds session and cursor values, takes `limit + 1`, and selects one latest decision per request so a request cannot straddle pages through a one-to-many join.
- `limit` defaults to 30 and must be between 1 and 100. Responses retain `data` or `requests` and add `page_size`, `has_more`, and `next_cursor`, which is null when exhausted. No cursor means the first bounded page, not all records.
- Tokens are versioned, URL-safe and HMAC-SHA256-signed by a per-router process secret. Both endpoints verify the endpoint binding; request tokens also bind the session ID. Malformed, tampered, wrong-endpoint, wrong-session, or pre-restart tokens return `400 invalid_cursor`. Tokens never authorize requests; every page runs the existing Bearer check.
- Paging is best-effort with no cross-request snapshots. New requests, session expiry, reordered activity and retention pruning can shift later pages or cause gaps. Static-data traversal is complete and duplicate-free; clients deduplicate by stable IDs when data changes. Manual refresh starts a new traversal.
- Live metadata is bounded by session capacity. Session pagination bounds responses but may still inspect all live metadata to preserve sorting; request pagination must bound the SQL result and avoid decoding every retained request.

## Data source and behavior

Live sessions are bounded by TTL and capacity; retained requests may be bounded by `storage.max_requests`. Server cursors reduce each response payload; client virtualization limits mounted DOM/components within the loaded pages.

## Verification

Test fixed-height CSS behavior at desktop and narrow breakpoints, incremental window growth, stable ordering, session selection preservation, detail reset on selection change, stale-response suppression, and loading/empty/retry states. Inspect keyboard focus and screen-reader announcements as the rendered window advances.
