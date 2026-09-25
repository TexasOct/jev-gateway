# Implementation plan

1. Add stable, versioned HMAC-signed cursor helpers scoped to endpoint and session ID, plus bounded page-size validation.
2. Implement per-session request paging in `RecordStore` and SQLite using `received_at DESC, rowid DESC`; preserve all joined evidence stages while returning only the requested page.
3. Implement sessions paging over a fresh live-memory snapshot and one batched latest-evidence query. Use deterministic mixed-source ordering and an authenticated cursor. Document best-effort consistency when live sessions change between pages.
4. Keep the sessions page content-free: never select prompt/messages/context columns. Add tests for stable tie ordering, page boundary, `limit + 1`, malformed/tampered/mismatched cursor, and memory-only live sessions.
5. Update frontend API types/client calls, load first pages, request next pages near list end, deduplicate by stable IDs, and discard stale response results on refresh/session change.
6. Add two independent fixed-height virtual list containers. `height == min-height == max-height` at desktop and narrow-screen breakpoints. Render only visible rows plus overscan; preserve keyboard navigation and selection.
7. Test frontend page loading, virtualization range, fixed-height styles, empty/loading/retry behavior, selection preservation, and stale-session response suppression.
8. Run `npm --prefix frontend run lint`, `npm --prefix frontend run test`, `npm --prefix frontend run build`, `scripts/build-frontend.sh --check`, `uv run pytest -q`, `uvx pyright`, and `uv build`.

## Consistency contract

Cursor pages are best-effort across changing live memory and retained evidence. Cursors bind endpoint and, for request pages, session ID. No cross-request full result snapshot is stored. Stable row IDs are deduplicated in the client; changes during traversal may shift later pages.

## Rollback point

Array names remain compatible, but old callers expecting every record must now follow cursors. If cursor validation fails, show a recoverable pagination error and offer a fresh traversal; never weaken authorization or fall back to an unbounded fetch.
