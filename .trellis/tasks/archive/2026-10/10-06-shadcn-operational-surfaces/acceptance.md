# Operational acceptance

Independent review accepts O1-O4 within the approved B construction scope.
E1 native select popup-first Escape remains UNVERIFIED under the explicit
operator-approved exception. Native developer delivery and independent acceptance
are separate records. Parent complete integration remains pending.

## Source boundary

Read the complete task JSONL entries, PRD/design/plan, parent preview, construction,
exception, CLI reference and migration map, plus the accepted Foundation,
Primitives and Config handoffs. Applied Humanizer in embedded mode. Dependencies
passed before owned task activation. The reviewer ran:

`TRELLIS_CONTEXT_ID=pi_01a111be-5788-7169-b951-a0f2417171c2 python3 ./.trellis/scripts/task.py start .trellis/tasks/10-06-shadcn-operational-surfaces`

Native exit 0; existing owned task selected for the named session. HEAD remains
`8352e4b0818c73c5f2dee6a98345e655b85a1cba` on `main`.

The independent audit verifies 306 current frozen source/test files, the exact
two-test delta since the original frozen inventory, 294 unchanged files outside
admission scope and 16 protected Primitives receipts. All nine mapped production
sites agree with their original admission HEAD hashes. Exactly six production
sites changed; MonitoringView, VirtualList and CanvasNodeContent are unchanged.
RoutingCanvas, RoutingEditor, StrategyDistribution and RouteTrace behavior-owner
ranges are byte identical before and after migration. Accepted Config source,
original BLOCKED review, native popup failures and all other historical failures
remain preserved. Current source binds `followup-frozen.json`; the original
`final-frozen.json` remains earlier-source evidence for two refreshed tests.

Reviewed source controls and installed React declarations (`ComponentProps`,
InputHTMLAttributes, SelectHTMLAttributes and ButtonHTMLAttributes). Existing
adapters render native elements, forward event/value/ref/disabled props, and keep
fieldset disablement. Checkbox supplies native type and indeterminate handling;
NativeSelect keeps native option values and single SVG arrow. No new API is used.

## O1 presentation and coverage

All mapped sites are covered in `research/final-census.json`. The finite census
contains 79 Button, 2 ToolButton, 12 NativeSelect, 7 Input, 1 Textarea, 5 Checkbox
and 5 Badge sites. Six native button sites retain geometry/gesture ownership:
one fixed session row, two Dnd handles and node/input/output targets. Native
details retain disclosure; aria-pressed strategy choices retain group semantics.
Canvas menus retain coordinate and draft identity. No new Tabs/DropdownMenu
semantics or navigation/API/engine changes are introduced.

Monitoring has flatter headings and one shared session/request region. Routing
uses the accepted adapters and flatter configured-path/advanced sections while
retaining necessary node, inspector, data and dialog boundaries. Existing status
regions, readonly/loading/empty/error/unknown distinctions, live activity versus
recorded evidence, palette/data-scheme/custom seeds, one CSS entry and disabled
Preflight remain intact. The implementation's session grid correction is present
and the final matrix asserts computed `display:grid`.

## O2 and O3 interaction and geometry

Preserved browser logs independently yield 381 distinct executed file/title
identities with 381 passing identities. The broad command has one original
failure and an unchanged later passing receipt. Original tests and deadlines
remain intact; Playwright config retains zero retries and the preview fixture
owner. This scoped evidence is separate from the parent's complete browser gate.

Original canvas assertions cover exposed native hit points, real pointer drags
and connections, keyboard alternatives, zoom/pan/Fit, menu draft ownership,
protected actions, history, remapping, stale responses/captures, serialized
layout-only writes, recovery and save/reset/remount. DndContext descendant tests
retain their original throw-on-missing-context oracles. Metric owners remain
190px width, 56px header, 28px output rows and 18px handles; SVG viewBox,
coordinates and inverse transforms are unchanged.

Original Monitoring tests retain real scrolling/cursor requests, focus retention,
retry and evidence states. The final additive 24-case matrix covers 1440/390/320px
in both locales/schemes with a custom synthetic seed. It measures equal
height/min-height/max-height, 132px/360px rows, 480px desktop windows, 280px narrow
session windows and 62vh request windows. It uses real wheel input and native
Enter, verifies cursor admission/focused row retention, inspector bounds, native
44px fields and document overflow. Original dense/tall canvas coverage includes
1430x2511, 1280x900, 390px and 320px and measured toolbar/inspector occlusion.

Verified hashes for all 750 preserved attempt PNGs, including 48 final matrix
images. Independently inspected these image-tool captures:

- Final 320px English dark Monitoring selected view: `research/final-monitoring-artifacts/operational-surfaces-Operational-B-monitoring-320px-en-dark/monitoring-selected.png`.
- Final 1440px English light rule inspector: `research/final-monitoring-artifacts/operational-surfaces-Opera-89e10-low-editors-1440px-en-light/workflow-rule.png`.
- Final 390px Chinese light rule inspector: `research/final-monitoring-artifacts/operational-surfaces-Opera-24d43-w-editors-390px-zh-CN-light/workflow-rule.png`.
- Final 320px English dark question inspector: `research/final-monitoring-artifacts/operational-surfaces-Opera-c891e-kflow-editors-320px-en-dark/workflow-questions.png`.
- Unchanged 320px Chinese light dense canvas: `research/browser-artifacts/canvas-visual-acceptance-d-11a19-le-and-reachable-at-320x900/strategy-320-zh-CN-light.png`.
- Earlier 1440px Chinese light overview, whose StrategyDistribution source remains unchanged: `research/matrix-artifacts/operational-surfaces-Opera-105cb-nitoring-1440px-zh-CN-light/monitoring-overview.png`.

The captures show separated session fields, restrained shared boundaries and
exposed selected nodes. Narrow inspectors and request evidence scroll internally;
screenshots alone do not prove hidden-control reachability. Existing pointer,
keyboard and geometry assertions provide that evidence. State photography is
representative, not a complete Cartesian matrix.

## O4 commands and failures

`research/check-audit.json` inventories 26 original native command receipts with
their exact argv/cwd/exit/log and retains source/identity/screenshot custody.
Commands below ran from `frontend/` unless marked root. Existing native logs were
inspected; unchanged passing suites were not rerun during review.

| Receipt | Command | Native exit / output |
| --- | --- | --- |
| `lint.json` | `npm exec -- eslint src/features/monitoring src/features/routing` | 0, clean |
| `unit.json` | `npm exec -- vitest run src/features/monitoring src/features/routing` | 1, 212 pass / two rendering assertions fail |
| `unit-recheck.json` | Focused two rendering cases, exact argv in receipt | 0, two pass / 23 unselected |
| `monitoring-final-unit.json` | `npm exec -- vitest run src/features/monitoring/__tests__/SessionInspector.test.tsx src/features/monitoring/__tests__/MonitoringView.test.tsx` | 0, 20 pass |
| `final-build.json` | `npm run build` | 0, production TypeScript/Vite; existing chunk warning |
| `final-browser-types.json` | `npm exec -- tsc -p tests/tsconfig.json` | 0 |
| `browser.json` | `npm exec -- playwright test -c playwright.config.ts 'tests/browser/canvas-.*spec.ts' tests/browser/monitoring.spec.ts tests/browser/routing-editor.spec.ts tests/browser/global-route-path.spec.ts --output=../.trellis/tasks/10-06-shadcn-operational-surfaces/research/browser-artifacts` | 1, 356 pass / one fail |
| `matrix-and-recheck.json` | `npm exec -- playwright test -c playwright.config.ts tests/browser/operational-surfaces.spec.ts tests/browser/canvas-policy-recovery.spec.ts --grep 'Operational B\|failed policy apply retains draft' --output=../.trellis/tasks/10-06-shadcn-operational-surfaces/research/matrix-artifacts` | 0, 13 pass including unchanged failed case |
| `monitoring-final-browser.json` | `npm exec -- playwright test -c playwright.config.ts tests/browser/operational-surfaces.spec.ts tests/browser/monitoring.spec.ts --output=../.trellis/tasks/10-06-shadcn-operational-surfaces/research/final-monitoring-artifacts` | 0, 36 pass |
| `followup-unit.json` / `followup-compiler.json` | Two follow-up cases / `npm exec -- tsc --noEmit` | 1 / 2, ReferenceError / TS2304 |
| `followup-unit-recheck.json` / `followup-compiler-recheck.json` / `followup-lint-recheck.json` | Corrected same focused cases / compiler / affected lint | 0 / 0 / 0; two pass / 23 unselected, compiler/lint clean |
| Independent root audit | `python3 .trellis/tasks/10-06-shadcn-operational-surfaces/research/check-audit.py` | 0 twice, expanded audit also passes |
| Independent audit subprocesses | `git diff --check`; `git diff --cached --name-only` | 0 / 0, no whitespace errors or staged files |

All browser commands use `JEV_BROWSER_PORT=4196`, seven original workers, normal
deadlines and zero retries. Original failures remain failed command records.
The broad policy-retry failure expected unchanged policy state within 5000ms but
received pending; its exact file/title passes later without test/source changes.
Its cause remains unresolved. No additional exception or timing workaround was
introduced. Rendering-only unit adaptations identify the unique actual overview
and unique native toolbar Review changes button with a real disabled attribute;
they preserve business assertions and cannot accept aria-disabled as disabled.
The temporary follow-up variable mistake and corrected rechecks remain visible.

Parent native LSP composition covers 12 current files with zero diagnostics:
ten unchanged original files plus two refreshed tests. Scope SHA256 is
`e5f61772c0d193dcc35d23c4ef5d1a02bd20df0159e6fd96c3e3e0021fff3450`.
Original and affected parent receipts bind current hashes; native LSP and compiler
evidence remain separate. No active LSP tool is available in this child, and no
new source changes require another probe.

## Review result and remaining scope

No concrete product defect or unresolved local blocker found. Review changes
only acceptance/checklist and independent evidence artifacts. No dependencies
were installed and no production/test source was edited. No staging, reset,
clean, commit, push, merge, archival, publication, version bump, real operator
configuration/credentials/services or upstream write occurred.

Carry E1 UNVERIFIED, the unresolved historical policy-retry timing failure and
existing build chunk warning into integration. The parent owns the complete
stable-source frontend/browser/Python/package gate and correct credential fixture
owners. This acceptance does not certify that unexecuted final integration gate.
