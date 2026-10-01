# Dashboard visual language and monitoring trace implementation

This product phase is approved and the task is active. The design phase artifacts remain under `research/`; use them as reference. Preserve unrelated shared worktree edits.

## 1. Protect the shared worktree

- Captured the frontend index and working-tree hashes in `research/implementation-baseline.json` before product edits. Original audit hashes are in `research/worktree-baseline.json`.
- `App.tsx`, `styles.css` and `i18n.tsx` have staged user changes. Implementation was applied as unstaged hunks only. The index hashes are checked in `research/final-worktree-audit.json` and remained unchanged at final review.
- Preserve all unrelated worktree files. Never reset/restore whole frontend files. If a new overlapping external edit appears, stop and coordinate before continuing.

## 2. Apply the visual language

- Transfer reviewed semantic typography, spacing, borders, control states and surface tokens from `research/style-spec.md` into the existing CSS system.
- Retain theme-seed variables, light/dark generation, status colors and system font stack.
- Use small, component-scoped presentational classes. Keep existing navigation labels/order, theme and locale behavior.

## 3. Add the selected-request inline trace

- Keep current monitoring page and session/request pagination/selection. Add the trace inside the existing details area; do not use a modal or new route.
- Reuse exactly the selected item from `SessionRequestsPayload.requests`, with its request, decision, upstream_request, and outcome fields. Do not add backend routes/schema or fetch providers for a replay.
- Render Request → Decision → Upstream request → Outcome. Show unavailable stages and a broken connector when their record field is null/missing. Never animate through unavailable stages.
- Derive outcome display only from the selected record’s `outcome.ok`: success, failure, or unknown/not retained. Unknown is not “in progress”. Do not infer retries from candidates or `switched_from`.
- Respect existing `content_captured` protections; avoid exposing unnecessary raw payload. Preserve cursor pagination and fixed virtual window heights.

## 4. Implement explicit replay lifecycle

- Keep animation state in a focused monitoring trace leaf component, not in `RoutingCanvas`.
- Provide Replay, Pause, Resume, Reset and Replay again. No autoplay or looping.
- Pause freezes current progress and active/visited highlights. Resume continues from the same progress. Reset clears frames and highlights. Replay again starts at the beginning.
- Cancel `requestAnimationFrame` and owned timers on session/request changes, refresh/detail generation changes and unmount. Guard callbacks by selected request identity/generation.
- Clamp progress to [0,1], handle zero/missing SVG geometry, and ensure no moving packet crosses a missing field gap.
- `prefers-reduced-motion` renders the full static route. A user-triggered replay may mark only available stages without movement, including if the preference changes during playback.
- Maintain visible focus, keyboard operation, appropriately disabled controls and concise `aria-live=polite` replay announcements.

## 5. Preserve existing behavior

Do not change strategy editor semantics, policy draft/review/apply, canvas pan/zoom/drag/connect/Fit, node 190×56 geometry, DnD boundaries, SVG edge handles, layout persistence, `[data-canvas-occlusion]`, backend/API/auth/credentials, locale persistence, theme palette algorithm, list cursor contracts or error handling. Do not introduce dependencies or hosted assets.

## 6. Tests and browser checks

Added pure helper/component snapshot tests for route edges, path progress across available edges, selected-field summaries, safe evidence field projection, status truth, missing evidence, localization and control presence. Existing pagination/privacy/strategy-canvas tests remain unchanged. Tests do not use a DOM animation clock, so verify playback lifecycle in browser as below.

Use synthetic API responses only for browser checks. Exercise desktop, tall viewport, 390px and 320px, English/Chinese and light/dark. Verify populated and empty monitoring states, request paging, scroll/focus behavior, evidence privacy, trace geometry, no page overflow, no autoplay and no animation-triggered requests. Record requests to verify selection only uses existing detail/cursor endpoints. Confirm strategy canvas still works using existing real pointer checks without changing its handlers. Capture and inspect final screenshots.

Run:

```sh
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
sh scripts/build-frontend.sh --check
uv run pytest -q tests/test_gateway.py -k 'dashboard or canvas_layout or configuration'
uv run pytest -q tests/test_canvas_layout.py tests/test_routing_overlay.py tests/test_routing_strategies.py
uv run pytest -q
uvx pyright
git diff --check
```

Do not commit the generated ignored `jev_gateway/static/` bundle. If implementation requires backend/data contract expansion or policy/editor behavior changes, stop and return to planning for explicit scope approval.

## 7. Final worktree review

Final hash check shows the index blobs for `App.tsx`, `styles.css`, and `i18n.tsx` are unchanged since implementation began. Staged changes and pre-existing unstaged stylesheet adjustments remain in place. New RouteTrace component/helpers/tests are untracked additions; the product changes appear in unstaged working-tree diffs only. Do not stage, commit, push or clean unrelated work; follow the separate Trellis commit review gate.
