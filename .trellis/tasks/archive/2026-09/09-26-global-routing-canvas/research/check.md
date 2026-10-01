# Frontend review

Reviewed the supplied active task, both curated specs, PRD/design/implementation plan, and current-editor/visual-reference research. Reviewed the six frontend worktree files against their staged baseline. The index was preserved: `git diff --cached --binary` SHA256 before and after was `81f231544c5d14d982b183011fe47df73888e31793bcd782becfae9551005a38`.

## Fixes

- Inspector placement uses the intersection of the canvas and visible page, including visual viewport and sticky application header clearance. Geometry returns capped width/height, applied to the panel; the body scrolls separately from its heading and close button. The toolbar reserves its own space at the bottom of the visible canvas and has no dependency on lower-tray height.
- Toolbar groups contain select/pan/add-rule, zoom/Fit and directional navigation. Auxiliary help, source/overlay metadata, node/edge lists, pool order and pending-change details start collapsed below the canvas. Status and policy action controls remain accessible.
- Restored one `DndContext` around the canvas and all advanced sortable/model/drop-zone controls. Added a server-rendered regression test using the installed React renderer and the real DnD hooks; no dependency was added.
- Add-rule opens the existing validated-choice form. Successful creation collapses that tray and reveals/focuses the new node. Advanced node selection and the node list use the same reveal path. Fit reserves toolbar clearance and accounts for a partly clipped canvas.
- Escape from inspector fields closes it and restores node focus. Keyboard node activation focuses the inspector close control. Closing, blank-canvas deselection and pan mode clear selected highlights. Shift selection includes the singly selected node. Dragging retains the selected node so its inspector can track movement.
- Pan mode works over nodes and ports without starting node dragging or policy edits. It clears pending reconnect gestures. Tool shortcuts ignore editable targets and modifier combinations. Keyboard edge actions respect the mode and write guards.
- Reconnect selection is tied to its edge and draft identity instead of an edge-list index. Stale choices no longer disable dragging after policy changes. Rule selection follows topology reordering; cancel clears stale selections.
- Layout persistence and policy validation/review/apply functions retain their separate API boundaries. No backend schema, auth, transport, overlay or credential storage code was edited.

## Changed files

- `frontend/src/config/RoutingCanvas.tsx`
- `frontend/src/config/RoutingEditor.tsx`
- `frontend/src/config/canvas.ts`
- `frontend/src/config/canvas.test.ts`
- `frontend/src/config/RoutingEditor.test.tsx` (new)
- `frontend/src/i18n.tsx`
- `frontend/src/styles.css`
- This report

The build regenerated ignored dashboard assets. No reset, stash, staging, commit or task-status change was performed.

## Verification

- `npm --prefix frontend run lint`: exit 0, with the four existing `react-refresh/only-export-components` warnings in `i18n.tsx`.
- `npm --prefix frontend run test`: 6 files, 58 tests passed.
- `npm --prefix frontend run build`: TypeScript and Vite passed.
- `scripts/build-frontend.sh --check`: current bundle, exit 0.
- `git diff --check -- frontend`: exit 0.
- Active LSP probe: no errors; four files confirmed clean and three inconclusive due to silent-on-clean server behavior. The CLI TypeScript build passed for all files.

Pure tests cover visible canvas intersection, capped inspector geometry across desktop/narrow dimensions and node edges, toolbar clearance, hidden-canvas fallback, tool shortcuts and selected-rule identity. Rendered tests cover the DnD provider boundary, collapsed initial sections, no initial selection and read-only controls. Existing layout, connection, draft, locale and theme tests remain green.

## Browser verification

This report describes the first frontend iteration, before the viewport-filling revision. The frontend changes do not alter the backend layout API. Focused backend tests passed (135 tests). An earlier full run passed 559 tests, but the subsequent run reported 25 installer-test failures and 562 passes on the changing shared worktree; that later result supersedes the earlier full-suite claim. A temporary local harness used an in-memory catalog and layout stub; it did not read the user's real catalog or call any upstream provider.

Passed in the browser:

- The floating toolbar appeared with tool, zoom, pan and add-rule controls. The add-rule flow used existing question/criterion/label choices, created a visible Rule 9 node and opened its details in the inspector.
- At desktop dimensions the rule inspector stayed inside the visible canvas. A long form scrolled internally.
- At a 390px viewport, after Fit scrolled the canvas into view, the inspector remained within the visible canvas, its content scrolled internally, and the toolbar remained reachable below it.
- Closing the inspector and switching into Pan mode did not reopen details on node click. No policy POST/PUT occurred during rule draft creation. Fit/scroll activity produced only layout PUT requests with the existing `{version, nodes, viewport}` shape.

Still unverified:

- The attempted mouse drag did not move a node. A subsequent `elementFromPoint(195,348)` check returned the inspector's `fieldset`, not the intended rule node. The narrow-screen inspector covered the target. This is evidence of an occluded target, not broken browser tooling or pointer capture. Saving and restoring a dragged node remain unverified. Future attempts must hit-test an exposed node point before native mouse input; synthetic `PointerEvent` dispatch is not acceptance evidence.
- The harness did not exercise authorized/unauthorized backend write boundaries or corruption fallback; those are covered by existing backend tests, not this rendered run.
- Narrow-screen validation was at 390px, not 320px. English toolbar and inspector were inspected; localized Chinese text is covered by the locale tests but not visually inspected in the browser.

To close the drag-verification gap, use real browser input that reliably triggers native pointer capture, drag a node, inspect only the layout PUT, reload, and verify the saved coordinate. Then test the equivalent run at 320px and Chinese locale. Do not treat the pure geometry and component tests as proof of the drag interaction.

The first browser run did not validate policy validation/confirmation/apply end to end, advanced DnD, every edge position, or keyboard focus restoration. Recheck these cases on the revised workspace; do not carry the first iteration's acceptance ticks forward as proof.
