# Viewport fixes implemented

## Scope and result

This pass addresses the four source review findings in the frontend only. The pre-fix browser report (`viewport-browser.md`) already demonstrated missing inspector access for distant `rule-6` at 320×700 and transformed-child overflow. Native mouse drag on a correctly hit-tested Questions node succeeded at 0.75 zoom and saved unscaled coordinates, so that is not treated as a browser-tooling limitation. No browser was launched for post-fix acceptance; the parent will rerun browser verification.

## Changes

- `frontend/src/config/canvas.ts`: `planNodeReveal()` first tries a centered node location, then moves the selected node to the free area's upper edge when that creates room for an adjacent inspector. The 320×700 regression uses measured-equivalent 216px free geometry and asserts the node remains visible with a usable panel below it. `inspectorFallbackPosition()` provides a bounded dismissible workspace sheet when anchored placement is impossible. `handoffInspectorFocus()` moves focus with `preventScroll` to an exposed selected node or the canvas. `canonicalViewport()` and `restoreCanvasViewport()` translate schema-v1 viewport coordinates to and from the current zoom/origin/focal point, clamping on restore.
- `frontend/src/config/RoutingCanvas.tsx`: reveal and Fit use the shared placement plan. The viewport coordinate pair remains `{x,y}` and zoom remains transient. Layout GET restore, zoom changes, Fit, scroll persistence and failed-save rollback use canonical conversion. Fit accounts for the selected-node reveal when there is an open inspector.
- `frontend/src/config/RoutingEditor.tsx`: the inspector stays mounted while open even without a node anchor, using the fallback placement. Before changing selection, closing, or dismissing inspector state, focus is handed off while the focused element still exists.
- `frontend/src/styles.css`: the scaled board clips overflow and owns scroll dimensions; the unscaled content is absolutely positioned at `--canvas-origin-y`, preserving explicit board and end clearance.
- `frontend/src/config/canvas.test.ts`: adds combined 320×700 free-rectangle/reveal/inspector geometry, fallback placement, focus handoff, and zoom 0.5/1/1.75 canonical viewport round trips with nonzero origin/focal offset, clamping, and a changed header/focal point.

## Contracts and selectors

- Persisted contract is unchanged: `{version: 1, nodes, viewport: {x, y}}`; no zoom, policy data, rule bodies or connections are serialized.
- Viewport invariant: at 1×, values retain the existing CSS scroll offset for the usual 12px content inset; at other zoom values, canonical coordinates represent the corresponding unscaled point relative to the free-area focal point, adjusted for content origin. Header/free-area shifts are compensated when restoring.
- Geometry selectors: `.routing-canvas-scroll`, `.routing-canvas-board`, `.routing-canvas-content`, `[data-canvas-node]`, `.workflow-inspector`, `[data-canvas-occlusion]`.
- The fallback inspector remains dismissible via its heading close button or Escape.

## Verification

Ran with 55-second per-command timeout (180 seconds overall):

- `npm --prefix frontend run lint`: passed, 0 errors; four existing react-refresh warnings in `src/i18n.tsx`.
- `npm --prefix frontend run test`: passed, 6 files / 65 tests.
- `npm --prefix frontend run build`: passed TypeScript and Vite build.

Also passed during the scoped run: `scripts/build-frontend.sh --check` and `git diff --check -- frontend`.

## Still needs parent verification

Run fresh native-browser checks for distant-node inspector visibility and hit testing at 320×700; measured scroll extents at zoom 0.5/1/1.75; nonzero scroll persistence/reload and failed-save rollback across zoom/header changes; and keyboard focus while resizing or expanding the drawer. Reconfirm native node drag persistence at a visible hit-tested point. These checks were not run post-fix in this pass.
