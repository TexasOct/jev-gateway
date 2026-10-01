# Implementation plan: Mixboard-inspired strategy editor

## Before implementation

- [x] Review `prd.md`, `design.md`, and `research/mixboard-interactions.md` with the user; obtain explicit approval of the latest summary before `task.py start`.
- [x] Confirm that connection rules remain a UI compatibility matrix over the current first-match schema; no policy or layout API migration is authorized.
- [x] Load `.trellis/spec/backend/index.md` and `.trellis/spec/backend/dashboard-routing-config.md` through the curated manifests before writing code.

## Build sequence

1. [x] Add pure connection-intent classification and localized rejection reason identifiers in `frontend/src/config/canvas.ts`. Cover all rows of the compatibility matrix, stale edge detection, explicit-model labels, last-member protection, and no-op cases in `canvas.test.ts`.
2. [x] Refactor `RoutingCanvas.tsx` so pointer preview, target highlighting, invalid-drop feedback, cancel and keyboard target selection use that classifier and the existing draft mutation helpers. Keep policy draft edits separate from layout writes; add interaction tests for supported and rejected edges.
3. [x] Build cohesive workspace chrome and selected-object context actions in `RoutingEditor.tsx`/`RoutingCanvas.tsx`; style with `frontend/src/styles.css` using the observed Mixboard interaction grammar. Reuse real editor actions, with no dead AI prompt or Share affordance. Keep the inspector and advanced semantic lists reachable.
4. [x] Add zoom controls and layout-only additive/marquee multi-selection with group movement. Keep zoom client-only and save unscaled node positions and the existing viewport schema. At 390px, Fit focuses the selected node or compact selected group at a readable scale and exposes pan controls when the full board cannot fit.
5. [x] Add English and Simplified Chinese strings, focus styles, keyboard alternatives, read-only behavior, narrow-screen layout and reduced-motion treatment. Preserve review, validation, apply and reset as the only policy persistence path.
6. [x] Keep a non-rendered future AI proposal integration boundary documented in code/design. Do not create a prompt control, server route, request model, or persistence field.

## Validation gates

- [x] `npm --prefix frontend run lint` (no errors; four existing Fast Refresh warnings in `i18n.tsx`).
- [x] `npm --prefix frontend run test` (49 passing).
- [x] `npm --prefix frontend run build` and `scripts/build-frontend.sh --check` (passed).
- [x] Targeted gateway tests passed (110); no backend API or policy contract edits.
- [x] Browser interaction check: actual Chrome mouse drags verified rule-match and pool connections, including valid/invalid drops at 100% and 125% zoom with scroll. Invalid drops announce a reason and preserve the original edge; valid changes enter review/validate but do not write policy directly. At 390px, after selecting Questions or model `p/c`, Fit places the node fully inside the visible canvas at 190×56 CSS px. The Simplified Chinese `p/c` case was rechecked at 390×844; pan is persisted and restored on reload. Layout gestures produced layout PUTs only, with no policy writes. Earlier browser evidence also covers multi-select, group move, save failure rollback, keyboard connection lists, read-only behavior and narrow page overflow. Evidence is under `/tmp/jev-mixboard-qa-v2/`. Not verified: Fit with the live production catalog, compact multi-select Fit, pointer removal of a pool edge, and hardware touch/browser variants.
- [x] Inspected task-scope diff for policy schema/API changes, credentials, prompt UI, and unrelated edits. No backend contract change or AI prompt control was added; unrelated existing release-task changes remain outside this task.

## Rollback points

- Connection-classifier changes can be reverted independently before workspace styling if they alter mutation semantics.
- Restore the previous frontend editor bundle if selection/drag/zoom integration fails browser checks; do not migrate overlay or layout storage.
- If multi-select or zoom fails pointer/accessibility checks, stop for an explicit scope decision rather than weakening existing editing or persistence behavior.
