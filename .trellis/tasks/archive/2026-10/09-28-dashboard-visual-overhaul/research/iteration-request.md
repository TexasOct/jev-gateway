# Follow-up iteration request

## User clarification

The user requests continued refinement and beauty work, including editable strategy workflow. They clarified to keep and improve the existing workflow editing: questions, rules, fallback, model pools and connections should remain editable and become clearer/easier to use. Do not add new strategy semantics, node types, arbitrary DAG operations or canvas tools.

## Relationship to active tasks

The parent task `09-28-dashboard-visual-overhaul` remains `in_progress`; its child `09-28-strategy-canvas-visual-redesign` also remains active. Therefore this refinement fits the current deliverable and should update that child PRD/design/checklist, then continue implementation under the same file ownership (`RoutingEditor.tsx`, `RoutingCanvas.tsx`, config presentation CSS/tests). Do not create another broad overlapping task. The shared shell child owns App/palette/shared CSS/i18n; do not touch those without coordination.

## Existing implementation review signals

An independent reviewer previously observed that the editor source changed markup around controls but found no obvious handler/data-flow alteration. This does not prove keyboard/pointer hit testing or responsive reachability. The follow-up should improve discoverability of the current editing model, clearly distinguish policy draft changes from canvas layout changes, show connection support/invalid reasons without confusing layout with policy, and preserve the existing review/validate/acknowledge/apply/reset sequence.

The current project includes editable questions, rule conditions and ordering, fallback selection, model labels/pools, supported edge operations, keyboard selection alternatives, inspector, advanced drawer and DnD. User did not ask for new capabilities. UI treatment should make these controls understandable, accessible and easy to find without changing semantics.

## Verification gap to close

Prior verification covered typecheck, 169 frontend tests, build, bundle freshness and lint (0 errors, four i18n Fast Refresh warnings). Real browser testing did not verify editor hit targets, zoom/Fit, DnD, keyboard pathways or review/apply. There is no committed Playwright/Puppeteer package or harness. A local synthetic browser run can be added using an in-memory same-origin `/v1/` mock only if a supported browser automation runtime is available; do not access a live gateway, models file, real records, logs or secrets. Otherwise add meaningful component/interaction regression tests and report the browser gap honestly.
