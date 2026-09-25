# Implementation plan

1. Read the latest dashboard-routing spec and inspect current App/config/canvas ownership. Freeze stable node IDs, compatible ports and exact first-match edge operations.
2. Make strategy configuration a separate full-workspace view; move theme controls out of the whiteboard's primary viewport. Add toolbar, board, inspector, and accessible node/edge list.
3. Finish the dedicated versioned `routing-canvas-layout.json` module and authenticated GET/PUT routes. Enforce strict bounds/known shape and atomic write. Prove layout writes do not change policy hash/version or either policy file.
4. Render all nodes at saved positions and SVG directed edges between true node ports. Add pointer capture, board-coordinate conversion, preview line, valid/invalid endpoint feedback, and reliable layout load/save with stale-load/race protection.
5. Implement allowed connection operations over `RoutingDraft`: rule match target to label, unmatched successor reorder within the ordered chain, final unmatched fixed to fallback, label-to-model add/remove for tag labels. Reject all unrepresentable, stale, cyclic, explicit-model or last-member-removing operations.
6. Tie every accepted connection edit to the existing validate, exact diff/warning review, explicit confirm, and apply flow. Keep layout persistence separate from policy review.
7. Retain question/criteria, AND/OR conditions, fallback, selection and priority inspector behavior. Add/delete rule nodes using valid conditions and labels; realign slot-based layout IDs and clear stale selection after topology changes. Add keyboard node move and edge reconnect/add/remove controls, plus responsive board/inspector and English/Chinese labels.
8. Add focused pure tests and backend endpoint tests. Run bounded real-browser interaction cases for node drag/layout reload, edge reconnect/policy draft/confirm and layout-policy isolation. Save reproducible evidence in `research/browser-verification.md`; mark unrun tests as unverified.
9. Run `npm --prefix frontend run lint`, `npm --prefix frontend run test`, `npm --prefix frontend run build`, `scripts/build-frontend.sh --check`, `uv run pytest -q`, `uvx pyright`, and `uv build`.

## Rollback points

- Revert layout module/routes independently; leave policy overlay and dashboard monitoring untouched.
- If an edge cannot map exactly to first-match configuration, reject that gesture and keep the endpoint non-connectable rather than approximating.
- If browser gesture tests fail, retain node/edge list controls as the accessible fallback but do not mark the whiteboard drag acceptance complete.
- Do not touch `models.json` or commit generated runtime layout/policy data.
