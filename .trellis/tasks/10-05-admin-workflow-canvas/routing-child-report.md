# Routing implementation report

Base: `fb29d452c3cf8bcae4c15658f647f3e3ec2ff538`. Work stayed in the isolated child worktree. No acceptance PASS claim.

## Changes

`RoutingEditor.tsx` displays `config.strategy` as the workflow heading. Its expandable information reads the matching description from the existing `/v1/routing/strategies` response and shows the actual baseline source and overlay state. The initial explanation uses existing translated first-match guidance. Metadata failures use the existing error and unauthorized callbacks; suspended or superseded effects cannot publish results.

Policy status distinguishes unfinished inputs, invalid configuration, review, validation, apply, pending changes and unchanged configuration. The existing separate canvas status continues to describe automatic layout persistence. An intermediate duplicate layout status was removed after the actions test exposed ambiguous text and the dense run exposed a temporary chrome-height change.

`RoutingEditor.test.tsx` verifies actual strategy/source identity and localized status in both locales. The previous assertion placing the first source mention inside the information drawer was updated because source identity now also appears in header information.

`canvas-header.spec.ts` verifies matching strategy metadata, root reconnection after layout 401, disabled native navigation during pending layout and policy writes, settlement, and policy status. These are supplemental tests; the independent successor harness is unchanged.

`canvas-visual-acceptance.spec.ts` waits for settled navigation and resets the layout fixture before each locale/scheme sample. All existing geometry and native hit assertions remain. Added header assertions and native hit attachments retain the full four-size, two-locale, two-scheme scope.

No shared locale keys, App/AppShell/provider sources, API schemas or raw criteria JSON editor were added or changed. Existing translation keys were sufficient. Native edge event-ordering faults were not reproduced, so edge handlers were not changed.

## Verification

- Routing units: 47 files, 366 tests passed.
- Scoped routing/test lint: passed.
- Frontend build and application TypeScript check: passed. Existing bundle-size warning remains.
- Browser TypeScript check: passed.
- Final focused browser run: 36 tests passed across header, actions, connections, coordinate hits and dense geometry. The subsequent supplemental pending-policy test expanded the header suite to four tests, all passing.
- Final unchanged independent subset: 22 tests passed, including disconnect → undo → Enter → Delete, header inventory, deferred-work suspension, coordinate oracles at 0.75/1/1.25 zoom and native viewport/menu coverage.
- Fresh preview servers used ports 44511 and 44512 with `reuseExistingServer: false`; no forced clicks or synthetic pointer events were added.

Global lint still fails with two `react-hooks/refs` errors at `frontend/src/features/providers/useProviderManagement.ts:220`, outside this child's ownership. Four existing shared-i18n fast-refresh warnings remain.

## Historical failures and remaining gaps

The unchanged independent full focused run returned 22 passing and three failing cases. Its layout-401 case waits for a canvas-local synthetic-error status after the canvas has already been hidden; the snapshot shows the root Connect form. Its pending-layout and pending-policy cases time out attempting native clicks on the intentionally disabled Settings button. Supplemental tests verify root reconnection and disabled navigation until settlement without changing those independent assertions. These three failures remain recorded and require acceptance-owner disposition.

The initial native graph/dense run returned 31 passing and two failing cases: duplicate layout-status text and a mobile native-hit failure. The next run returned 16 passing and two mobile native-hit failures. After removing the duplicate header layout status, the dense suite passed all four sizes, and the complete focused suite passed. Geometry scope and assertions were not reduced.

Private logs are retained under `frontend/node_modules/.cache/routing-child-evidence/`, including the original successor failures, both intermediate browser failures, dense JSON evidence and final passing logs. Screenshots, browser result directories, generated bundles and fixtures remain private; no generated assets belong in this patch.

This child has not completed full task acceptance, live backend/file-boundary replay, the entire keyboard-only/focus-restoration matrix, or the committed-policy/failed-refresh scenario. Raw criteria JSON acceptance is inapplicable because no such editor exists. No commit, push, version bump or release was performed.
