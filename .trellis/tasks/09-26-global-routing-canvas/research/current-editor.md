# Current editor contracts

## Scope and evidence

Reviewed the current PRD and implementation source. Lines below refer to the checked-out worktree. The frontend editor/canvas files and tests already have staged modifications in the initial baseline; this research made no changes to them. `git status --short` also showed staged changes in `frontend/src/i18n.tsx`. Current task resolver returned no task despite the user-provided active task path; this report follows the supplied path and PRD.

## Facts

### 1. Ownership and component structure

`frontend/src/App.tsx:13,671` imports/renders `RoutingEditor`; it receives the configuration at `App.tsx:204`. `RoutingEditor.tsx:284` initializes the editor draft from configuration and owns selected node(s), review state, and policy editing. Its current layout at `RoutingEditor.tsx:484-492` is `.workflow-workspace`, containing `.workflow-board` with `<RoutingCanvas>` and a sibling `.workflow-inspector` aside. The canvas calls the details-scroll selector `.workflow-inspector` at `RoutingCanvas.tsx:388`; node creation scrolls to `.rule-add` at `RoutingEditor.tsx:490`. CSS defines the two-column workspace and inspector at `styles.css:531-567`. Canvas node/edge lists are `<details>` under the canvas at `RoutingCanvas.tsx:389-390`.

### 2. Add-node and strategy surface

The canvas action is currently “add rule”, only when `canAddRule` is true for the selected `questions` node (`RoutingEditor.tsx:489-490`; action markup `RoutingCanvas.tsx:388`). It scrolls to a rule form rather than adding immediately. The form creates a rule from a question, criterion, and label using `addRule` (`RoutingEditor.tsx:516-533`; helper `draft.ts:285`), then updates rule topology and selects the new `rule-N`.

There is no strategy-editing selector in `RoutingEditor`. The dashboard `ConfigurationPayload` is a single `strategy` string and one rules/questions/fallback set (`api.ts:60-...`; configuration response `gateway.py:829`). Runtime APIs separately list registered strategies and accept a strategy for preview (`gateway.py:609-...`, `653-...`); gateway request routing chooses by model field (`gateway.py:297`). Current editor draft conversion and overlay payload (`draft.ts:48,308`) operate on the dashboard configuration’s single policy surface. Therefore all runtime strategies are not currently editable through this editor. A switch action cannot safely change strategy selection without agreeing what should be edited and how the backend returns/persists that surface.

### 3. Selection and inspector seam

`RoutingEditor.tsx:289-298` owns selected node and multi-selection state. `RoutingCanvas.tsx:246-247` converts pointer client coordinates through the canvas element rect, `scrollLeft/scrollTop`, and zoom via `boardPoint` (`canvas.ts:170`). Canvas DOM nodes are rendered around `RoutingCanvas.tsx:370`; node board positions use saved or default positions (`canvas.ts:72`, `RoutingCanvas.tsx:90-102`). This gives a viable anchor seam: expose selected-node element/board bounds or report its rendered DOM rect from `RoutingCanvas` to its parent. Current inspector is a sibling aside, not anchored, so it has no node-to-viewport coordinate contract.

Layout viewport persistence currently stores scroll x/y, not zoom. Load restores these values (`RoutingCanvas.tsx:69-80`); scroll saves debounce 450ms (`RoutingCanvas.tsx:326-337`). Fit/zoom planning exists in `canvas.ts` and canvas fit code, but zoom is component state, not saved layout.

Policy edits are blocked when writes are disabled, busy, under review, or reset confirmation is active (`RoutingEditor.tsx:331`). The review/apply flow uses draft diff, validation, then explicit apply (`RoutingEditor.tsx:394-412,664-678`). Canvas layout has its own `canEdit = loaded && !disabled` and save guard (`RoutingCanvas.tsx:115-128`). An anchored inspector should continue receiving `editDisabled`; selection/closing and layout writes should not enter the policy diff/review path.

### 4. Separate layout persistence and identity

Frontend API models layout as `{version, nodes, viewport}` (`api.ts:153`) and writes that object to `PUT /v1/dashboard/canvas-layout` (`api.ts:246-247`). `RoutingCanvas.persist` explicitly reconstructs only these fields (`RoutingCanvas.tsx:118-128`). Backend stores `routing-canvas-layout.json` separately from routing overlay (`canvas_layout.py:12,19`; overlay path `routing_overlay.py:15`). Layout validation rejects extra fields and bounds node count, coordinates, and file size (`canvas_layout.py:27-47`). API routes are `GET/PUT` in `dashboard.py:462-486`. Reads use default layout when absent/corrupt (`canvas_layout.py:52-60`); writes are guarded by configured gateway key (`dashboard.py` route and `gateway.py:703`). Frontend requests attach bearer authorization (`api.ts:191-203`).

Node IDs are topology identifiers: `questions`, `fallback`, model and zone prefixes, plus positional `rule-N` slots (`RoutingCanvas.tsx:90-96`). Insert/remove/move reconciles those slots (`canvas.ts:50...`; editor topology callback `RoutingEditor.tsx:341-...`; canvas `RoutingCanvas.tsx:152`). Rule content is not part of layout identity. Multi-strategy layouts would collide because the layout document has no strategy identifier and common node IDs would overlap. Strategy-scoped layout identity would require a contract decision/schema change or explicit global shared-layout semantics.

### 5. Tests and commands

Frontend canvas tests cover layout defaults/reconciliation, pointer mapping, fit planning, selection/movement, and connections (`frontend/src/config/canvas.test.ts`, including lines 22, 75, 105, 116). Backend layout tests cover roundtrip, corruption/default and invalid shapes (`tests/test_canvas_layout.py:18,32`); gateway tests cover auth, policy isolation, atomic write and disabled writes (`tests/test_gateway.py:921-968`). No Playwright harness was found in the filenames searched. Frontend scripts are in `frontend/package.json`: `npm test`, `npm run build`, `npm run lint`; useful backend tests: `uv run pytest tests/test_canvas_layout.py tests/test_gateway.py tests/test_routing_overlay.py tests/test_routing_strategies.py`.

### 6. Baseline status

Initial `git status --short` was scoped to frontend editor/canvas paths and backend. It showed staged modifications to `frontend/src/config/RoutingCanvas.tsx`, `RoutingEditor.tsx`, `canvas.test.ts`, `canvas.ts`, `i18n.tsx`, and `styles.css`. No backend status entries appeared. I did not change the index or stash anything. The exact user-visible status output was:

```
M  frontend/src/config/RoutingCanvas.tsx
M  frontend/src/config/RoutingEditor.tsx
M  frontend/src/config/canvas.test.ts
M  frontend/src/config/canvas.ts
M  frontend/src/i18n.tsx
M  frontend/src/styles.css
```

## Resolved product decisions

The user clarified that the toolbar switches canvas tools or editing modes, not backend routing strategies. The toolbar adds rule nodes only, using the existing flow to select a question, criterion and label. Do not extend the dashboard configuration API or introduce strategy-specific layouts.

## Remaining design proposal

Keep layout saves on the existing separate endpoint and preserve its read-only/auth behavior. Add selected-node DOM-bounds reporting to anchor a size-capped inspector, with viewport clamping and internal scrolling. Ensure that toolbar mode switches are UI/canvas state only and do not affect policy semantics.
