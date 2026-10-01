# Canvas integration handoff

## Scope

This pass changed only `frontend/src/config/RoutingCanvas.tsx` and this note. The existing staged and unstaged changes were preserved. No index operations, backend changes, CSS edits, Editor edits, or commits were made. The frontend build refreshed ignored assets under `jev_gateway/static/`.

## Integration

- The working copy already imported `CanvasNodeContent` and `getCanvasNodeKind`, rendered the child inside the node button, and supplied `data-node-kind`. These remain in place. Buttons retain their accessible title, `${text} · ${id}` tooltip, existing node dimensions, connection handles, and selection classes.
- Added the existing `read-only` class when layout editing is unavailable. Read-only nodes remain selectable for inspection.
- The SVG overlay and its connection paths explicitly use `pointerEvents="none"`. The existing `.canvas-edge-handle` CSS still enables pointer interaction on ports.
- `onDraggingChange(true)` remains threshold-triggered. Successful release, cancel, lost capture, and unmount clear the active drag and notify `false` after an active drag. Explicit cancellation restores the snapshot without a layout PUT.
- Escape cancels a node gesture without clearing the selection. Click suppression survives the later pointer release so that cancellation does not open the inspector. A new pointer gesture or keyboard activation clears that suppression.
- Node pointer-down focuses without scrolling. Active drags skip anchor/chrome measurement and node reveal. Pending viewport restoration is canceled when the drag starts. Tool changes, zoom, and toolbar pan cancel any current gesture before applying their action. A queued Fit callback skips scrolling if a gesture has started.
- Coordinates use the transient unscaled layout position. They appear in the existing context status and temporarily replace the toolbar zoom percentage, so a collapsed drawer does not hide the feedback. The toolbar output has a polite live status and uses the paired `canvasLayoutOnly` translation as its label and tooltip.
- There are no dangling `INSPECTOR_SIZE` or `inspectorPosition` imports in `RoutingCanvas.tsx`.

The parent already passes `onDraggingChange={setNodeDragging}` in `RoutingEditor.tsx`, hides the mounted inspector during a gesture, and pauses inspector positioning while dragging. That file was read but not modified here.

## Verification

Each command ran separately with a 90-second timeout after the final edit:

- `npm --prefix frontend run lint`: passed, zero errors. Four existing `react-refresh/only-export-components` warnings remain in `src/i18n.tsx`.
- `npm --prefix frontend run test`: 8 files and 89 tests passed.
- `npm --prefix frontend run build`: TypeScript and Vite passed.
- `scripts/build-frontend.sh --check`: bundle is current.
- `git diff --check -- frontend/src/config/RoutingCanvas.tsx`: passed.
- Active LSP diagnostics found no type errors. Four auxiliary inline-style hints refer to the existing dynamic board/node/marquee geometry.

## Browser verification still required

This integration pass did not inspect rendered styles or exercise native browser pointer capture. The UI root query returned no managed browser page. Passing unit tests does not establish visual separation or hit testing.

The parent should verify:

1. Native node dragging starts from a point whose `elementFromPoint` result reaches the intended node, including its title and icon. Ports remain reachable.
2. At nonzero scroll and non-unit zoom, single and grouped nodes move by the expected board-coordinate displacement. The inspector stays hidden during the gesture and the viewport does not jump.
3. Escape, pointer cancel, and lost capture restore positions without a PUT or selection change. Successful release produces only the strict layout payload and survives reload.
4. Visible coordinate feedback remains readable on narrow screens with the information drawer closed.
5. All five node types, long titles, selected/dragging/read-only/connection states, both locales, and light/dark themes render correctly at the existing 190×56 bounds.

The parent owns tests and the final browser acceptance evidence. PRD acceptance checkboxes were not changed here.
