# Product implementation outline for review

This is the proposed production slice. It needs explicit implementation approval before product files are edited.

## Scope

1. Apply the reviewed typography, spacing, surface, border and state tokens from `style-spec.md` in the existing CSS system. Keep the seed-derived palette roles.
2. Add the selected request trace inline in the existing monitoring detail view. Keep the session selector, current request list/cursor paging and surrounding details workflow.
3. Bind the trace to the selected `RetainedRequest` fields: `request`, `decision`, `upstream_request`, `outcome`. Do not add API fields or backend schema.
4. Show unavailable/missing evidence explicitly with broken connectors. No animated packet crosses a missing segment. Derive outcome only from `outcome.ok`; missing outcome remains unknown.
5. Provide explicit Replay, Pause, Resume, Reset and Replay again controls. Selection/session change, refresh/detail replacement and unmount cancel replay.
6. Preserve keyboard operation, focus-visible indication and concise `aria-live` playback state. Reduced-motion users retain the full static trace; static highlighting must identify available fields without relying on color alone.
7. Keep playback illustrative; do not infer retries, in-progress requests, per-stage timings, provider health or live traffic.

## Implementation shape

- Keep selected session state in existing `App` monitoring state.
- Add selected request identity scoped to the currently loaded detail result; clear it on session changes, refresh and detail generation changes.
- Put the route renderer/playback controller in a small monitoring UI leaf component. Keep animation state and cancellation local to that leaf. Do not place replay code in the strategy canvas.
- Map nodes to the four field slots. Use only actual field availability to create connectors. Keep request evidence accessible in the existing details context.
- Keep current `VirtualList` row heights, viewport bounds, cursor triggers, focus behavior, session/detail generation checks and content privacy rules.
- CSS changes stay component scoped. Keep `RoutingCanvas` 190×56 node geometry, pointer capture, DnD, SVG port/hit-testing, `[data-canvas-occlusion]`, drawer scroll boundary and layout persistence unchanged.
- Do not alter locale/theme persistence, auth, provider summary or routing API behavior.

## Risk controls

Before edits, snapshot current frontend index and working-tree hashes and inspect staged/unstaged changes. There are concurrent uncommitted edits. Attribute only new, reviewed hunks to this task. If the working file has changed since baseline in an unrecognized way, stop and request re-planning.

Animation timers/frames must be cancelled on all ownership transitions and never update a different selected request. Tests should include stale callbacks after request switch, session switch, refresh, unmount and list generation change. Geometry and list virtualization must remain unaffected by trace component height/content.

## Acceptance and validation

- Existing session/detail cursor, content privacy, evidence disclosure, theme/locale and strategy editor tests pass unchanged.
- Focused component tests cover selected evidence, success/failure/unknown, each missing field combination, empty detail, session/request switch, refresh cancellation, replay pause/resume/reset/replay-again, reduced-motion and keyboard/status announcements.
- Browser checks cover desktop, tall viewport, 390px and 320px, English/Chinese, light/dark and reduced motion. Check detail/list scroll ownership and no new document overflow.
- Inspect captured network requests: replay sends none; request selection only uses existing detail/cursor calls.
- Real pointer regression checks show canvas interactions unaffected; do not modify canvas event handling.
- Rebuild and inspect screenshots for monitoring, selected trace, missing evidence, expanded request payload, and existing strategy editor.

Commands:

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

Generated `jev_gateway/static/` remains ignored. No commit/push or cleanup of shared work is included. If this slice proves to require backend contract, strategy-editor or authentication changes, stop and return to planning for expanded approval.
