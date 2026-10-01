# Final review: global routing canvas

Review scope: current unstaged changes compared with the staged baseline. This review did not modify product files. It rechecked drag behavior, fixed card geometry, connection hit targets, viewport sizing and locale behavior in a fresh in-memory browser harness. The harness served the locally built dashboard and stubbed all `/v1` APIs; no gateway catalog or upstream provider was used.

## Findings at review time

The two findings below refer to the source tree before the follow-up write-queue/scroll-lock fix. The current code uses `createLayoutWriteQueue`, an atomic gesture-clear rollback and a non-passive wheel listener plus scroll lock; deferred-promise tests and the ordinary native-drag script pass. The exact delayed-failure and wheel sequence has not yet been replayed in the browser against the post-fix bundle, so this report preserves the original reproduction separately from its fix status.

### P1: concurrent layout-save failure can snap an active drag back to the old layout

`frontend/src/config/RoutingCanvas.tsx`, `persist` failure handler (around lines 260-273) and `dragNodeMove` (around lines 305-329).

If one layout PUT is held in flight while a second node drag starts, the first PUT's rejection resets `layoutRef.current` and React state to `savedLayout.current`. The second gesture still holds its original snapshot in `dragNode.current`; its next move computes the preview against that snapshot and replaces the restored state, and pointer-up submits the second layout. The UI therefore snaps the first node back during the second drag, although the successful second PUT can eventually persist both new node positions. In the isolated fixture, the first PUT carried Questions `(140,140)`; the forced rejection briefly reset Questions to `(110,120)`, while the still-active Rule gesture subsequently put Questions back at `(140,140)` and moved Rule to `(470,130)`. This is reproducible with concurrent gestures and a delayed failed PUT. Avoid resetting shared UI state underneath a different active gesture, or make the gesture rebase/abort atomically on save failure. This conflicts with the specified failure rollback behavior.

### P2: wheel-scrolling during pointer capture changes the drag's effective coordinate delta

`frontend/src/config/RoutingCanvas.tsx`, `dragNodeMove` (around lines 305-329) and the canvas `onScroll` handler (around lines 557-565).

The drag stores client coordinates and zoom at pointer-down, but it does not account for scroll offset changes while the pointer is captured. `onScroll` suppresses viewport writes during a moved drag, but the next pointer event still converts only the client-coordinate difference. On the isolated browser, scrolling the canvas by 100px during capture changed the node's stored x from the expected 105 to 110 without additional horizontal pointer movement; the pointer sequence requested only a 5px further x movement. This causes the pointer to stop tracking the node if trackpad/wheel scrolling occurs during a drag. Rebase the gesture's pointer origin on scroll or prevent scroll changes during a node drag.

## Verified behavior

- Current card DOM geometry is 190×56px, matching the node-card geometry and the canvas marquee/movement bounds. The newly added role content remains clipped in those bounds; edge ports are placed at the shared vertical center. Seven actual edge handles in the fixture remained hit-testable.
- Native mouse tests at 1280px and 320px, zoom 1.0 and 0.75, moved Questions and Rule nodes in their unscaled stored coordinates. Each movement sent only the layout PUT; refresh restored the positions. Nonzero zoomed viewport reload also passed.
- Multi-node drag preserved relative spacing and emitted one layout-only PUT. Escape, `pointercancel`, and lost pointer capture reverted the preview and emitted no PUT.
- A single failed PUT restored the last saved node coordinates and surfaced an error. The concurrency case above is the exception.
- Keyboard activation opened the inspector and focused its close button. Escape from an inspector field closed it and handed focus back to the selected canvas node.
- Inspector position updated after drawer expansion. At 320px Chinese locale, canvas remained below the shared header, drawer and toolbar stayed in the workspace, inspector remained within the free area, and the document did not grow beyond 320×700. Tall desktop, ordinary desktop, 390px English, and 320px Chinese measurements were taken.
- Layout-only movement did not change policy status. A connection edit produced a pending policy draft without a write; starting review sent configuration validation, not a layout PUT.
- The five node roles render their distinct type labels, inline glyphs, summaries and role styling at the fixed geometry. No browser console errors were observed.

## Verification

- `npm --prefix frontend run lint`: passed with four existing Fast Refresh warnings in `i18n.tsx`.
- At review time: `npm --prefix frontend run test` passed 102 tests. Latest post-fix run passes 112 tests; see `research/layout-race-followup.md` for new evidence.
- `npm --prefix frontend run build`: passed.
- `scripts/build-frontend.sh --check`: passed.
- Focused backend tests: 135 passed.
- `uv run pytest -q`: 589 passed.
- `uvx pyright`: 0 errors, 0 warnings, 0 informations.
- Fresh isolated Chromium pointer/browser checks covered node drag, zoom, canvas scroll, group movement, cancellation/lost capture, failed saves, inspector focus/position, connection-port hit targets and draft validation separation. No live upstream calls were made.

## Scope and staged-baseline notes

The latest unstaged delta is limited to `RoutingCanvas.tsx`, `CanvasNodeContent.tsx`, and `styles.css`; staged strategy-shell, editor, canvas helpers/tests, i18n and node-content implementation were treated as baseline rather than attributed to this specific unstaged edit. No further P1/P2 issues were observed in the checked scope.
