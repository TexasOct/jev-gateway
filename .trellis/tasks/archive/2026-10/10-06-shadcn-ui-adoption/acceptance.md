# Independent integration acceptance

## Current status after operator E1 acceptance

The operator confirmed "验收通过" after the E1 interactive HTML handoff on
2026-10-11. E1 is now **PASS by operator manual acceptance** on the unchanged
candidate. A1-A8 remain accepted; E1 no longer requires an open exception in the
current acceptance status. The source and fixture hashes match the handoff.
See [e1-manual-acceptance.md](e1-manual-acceptance.md) and
`research/e1-operator-acceptance.json` for the confirmation and evidence boundary.
The browser version and exported operator JSON were not supplied; the recorded
Chromium smoke version belongs to fixture readiness only. Original failed probes
and independent handoffs remain unchanged. No suite was replayed.

## Independent integration review before manual E1 closure

A1-A8 are accepted within the user-approved B construction and E1 scope. No
concrete product defect or required-check gap remains. E1 native-select
popup-first Escape remains **UNVERIFIED**, explicitly including A5 and A8.
The original Primitives BLOCKED report and failed production/plain-select probes
remain unchanged. Native implementation delivery and this independent review
are separate records.

Review used the Humanizer skill in embedded mode. All curated context, complete
task artifacts, preview/CLI/migration references and predecessor handoffs were
read. Only this parent task was activated after accepted child dependencies:

`TRELLIS_CONTEXT_ID=pi_01a111be-5788-7169-b951-a0f2417171c2 python3 ./.trellis/scripts/task.py start .trellis/tasks/10-06-shadcn-ui-adoption`

Native exit 0; only the existing owned task was selected. HEAD remains main
`8352e4b0818c73c5f2dee6a98345e655b85a1cba`. The admission inventory protects
15,890 existing task/evidence files. Final source matches all 462 frozen entries
in `research/reconciled-frozen-source.json`, SHA256
`91c5fc7d9630d45f6e2be04bfd31d02e062646d765287fa8f2aea9d72030829d`.
No production or test source edit was needed during review.

## Findings and criterion evidence

| Criterion | Independent disposition |
| --- | --- |
| A1 | Accepted Foundation CLI 4.21.4/schema/disposable add/build receipts, actual components.json/lock/source and maintenance/MIT documentation agree. Final alias/build succeeds. |
| A2 | Recomputed census exactly matches all 24 files and source hashes: 149 Button, 3 ToolButton, 25 Input, 23 NativeSelect, 2 Textarea, 12 Checkbox, 5 Label, 21 Field, 8 Badge, 11 Alert, 6 Card, 2 Separator and 1 business Dialog. Seven native buttons, one color input, 32 wrapping labels and 20 disclosure pairs have documented owners. No unused generic Switch/Tabs/menu/Tooltip adoption is claimed. |
| A3 | Actual shell/connection delta is presentation/adapters only. AppShell's state-owner range is byte-identical to baseline; ProviderView's integration delta restores only the original list 96x44 identity. AlertDescription occupies the correct grid column and narrow feedback wraps. Accepted Config/Operational B source and representative final images agree. |
| A4 | Existing palette/data-scheme/custom seed and API/event owners are preserved. Final appearance/theme/auth/contrast/focus identities pass; screenshots show the saved custom seed in both schemes. |
| A5 | Original raw-draft, sentinel/tri-state, credential keep/set/clear, label/native-event/form, Tab/Shift+Tab, guarded close, pending/failed save, focus-return and authentication identities pass. Installed React/Radix declarations support the adapters. **E1 remains UNVERIFIED**; it supplies no passing native-popup proof. |
| A6 | Original native pointer/keyboard/gesture/history/Fit/zoom and monitoring cursor/scroll/focus identities pass in the final aggregate. Fixed 132/360 rows, 480 desktop windows, 280 narrow sessions, 62vh narrow requests and 190/56/28/18 canvas metrics retain their owners. |
| A7 | Final width/locale/scheme matrices and existing tall/dense coverage pass. Eleven representative final screenshots were inspected, listed below. Internal scrolling and horizontal navigation scrolling retain their existing reachability behavior. Photography is representative, not every state combination. |
| A8 | One final native aggregate passes all 746 preview and 9 standalone-cloud identities with original owners, deadlines and zero retries/skips. Final lint, 409-unit suite, compiler/build, freshness, Pyright, 3212 Python tests without skips and isolated current-version package validation agree with live source/assets. **E1 remains UNVERIFIED**. |

The authorized inspector helpers observe the scheduled Close-button focus after
native node Enter before allowing the caller's next action. They reverse exactly
to admission; all policy/C23 business predicates remain. Model exposure validates
zero preparation writes at an unchanged viewport or exactly one completed PUT200
with original nodes/version and the actual 1x viewport before taking its baseline.
Every later model-phase layout/non-GET comparison remains exact. No request ledger
is reset. The audit preserves all 60 original native action sites and raw/coordinate
fixtures, 220 exact predicates, three authorized exposure reconciliations and 26
additional predicates. These are observation boundaries, not new exceptions.

## Native command receipts

These executions belong to native implementation delivery. This review checked
their actual argv/cwd/exits/logs and final identities; unchanged passing suites
were not replayed. Matching JSON/log files are under `research/`.

| Command | Native result | Receipt stem |
| --- | --- | --- |
| `npm --prefix frontend run lint` | exit 0; four existing i18n refresh warnings, zero errors | reconciled-lint |
| `npm --prefix frontend run test` | exit 0; 53 files, 409 tests | reconciled-units |
| `npm --prefix frontend run build` | exit 0; existing chunk-size warning | reconciled-build |
| `npm exec -- tsc -p tests/tsconfig.json` from frontend | exit 0 | reconciled-types |
| `npm --prefix frontend run test:browser` | exit 0; preview 746/746, standalone cloud 9/9 | reconciled-browser |
| `scripts/build-frontend.sh --check` | exit 0; bundle current | reconciled-freshness |
| `uvx pyright` | exit 0; zero errors/warnings/information | reconciled-pyright |
| `env JEV_BROWSER_CAPTURE_DIR=/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-06-shadcn-ui-adoption/research/reconciled-browser-capture uv run pytest -q` | exit 0; 3212 passed, zero skips | reconciled-python-captured |
| `uv build --out-dir /Users/texas/Workspace/jev-shadcn-integration-reconciled-artifacts-20261010` | exit 0; wheel/sdist 0.1.4 | reconciled-package |
| `uv run python scripts/validate-release.py v0.1.4 /Users/texas/Workspace/jev-shadcn-integration-reconciled-artifacts-20261010` | exit 0; current wheel validated | reconciled-validation |

Reviewer `python3 .trellis/tasks/10-06-shadcn-ui-adoption/research/check-integration-audit.py`
exits 0. `research/check-integration-command.json` records actual argv/cwd/time/exit;
`check-integration-audit.json` joins the ten native gates, source, census, package,
protected evidence and source-bound LSP. The reviewed delivery audit runs with
only its output destination isolated; its original script/result are preserved.
An initial reviewer attempt exited 1 because its absolute LSP receipt path was
compared with the equivalent relative path. The original output and failure are
retained in `check-integration-audit-initial-failure.json/.log`; resolving both
paths fixes the reviewer comparison. No product failure was hidden.

The audit reconstructs exactly 755 distinct passing file/title/project identities
from the complete final log and original disjoint collections. Preview retains
seven workers; cloud retains its original two-worker/20000ms owner. Both real
synthetic credential modes were enabled. Their wrappers closed with native exit 0;
the installed default gateway child's actual SIGTERM exit -15 remains recorded.
Owned ports 63033/63058 are closed. No passive observer was emitted in the final
aggregate. Fresh x1/t3 captures are bound to the zero-skip Python replay.

Current pyproject version is 0.1.4. Candidate wheel SHA256 is
`7a4f02be2991105db1c384cec6a9c3f1eae3ee095a98f2bb6f9697112a192b8c`.
Source, wheel and installed fixture match 42 static assets and 94 product files.
Wheel metadata retains the exact version and AGPL license expression. Local
artifact validation does not publish or establish a released installation.

The parent active native LSP receipt checks nine current TypeScript paths with
zero before/after hash mismatches. Eight files are clean; AppShell has three
inherited FormEvent deprecation hints, zero errors/warnings. Scope SHA256 is
`47661741777c8c3410cec6f947da8e4dd2e5fc7ff5739545cf6dec21690f0982`.
The baseline usage comparison is source-only; no baseline native probe is claimed.
Compiler and LSP evidence remain distinct.

## Inspected final screenshots

All paths below are relative to
`research/reconciled-playwright-results/`; the independent audit verifies all
959 final PNG hashes against preserved delivery evidence.

- `integration-surfaces-B-shell-and-connection-320px-zh-CN-dark/connection.png`
- `integration-surfaces-B-shell-and-connection-1440px-en-dark/shell.png`
- `integration-surfaces-B-shell-and-connection-390px-zh-CN-dark/shell.png`
- `config-surfaces-B-configuration-surfaces-1440px-en-light/settings-custom.png`
- `config-surfaces-B-configuration-surfaces-390px-zh-CN-light/supplier-editor.png`
- `config-surfaces-B-configuration-surfaces-320px-en-dark/model-editor.png`
- `config-surfaces-B-model-states-320px-en-dark-readonly-false/model-failed-save.png`
- `config-surfaces-B-configuration-surfaces-320px-zh-CN-dark/dense-import.png`
- `operational-surfaces-Operational-B-monitoring-320px-en-dark/monitoring-selected.png`
- `operational-surfaces-Opera-24d43-w-editors-390px-zh-CN-light/workflow-rule.png`
- `canvas-state-responsive-ro-b7891--geometry-1430x2511-en-dark/c22-state.png`

These show flat sections, readable wrapped feedback and names, separated session
fields, visible modal footer actions and an exposed selected canvas node. Full-page
dense photography supports overall layout; native interaction/computed assertions
provide the scrolling, control geometry and reachability evidence.

## Preserved failures and residual limits

Original final/stable/delivery/acceptance/diagnostic browser commands remain exit
1; the earlier completion aggregate remains earlier-source evidence. The strict
original integration audit remains failed. The final source's passing receipt is
the reconciled complete aggregate, not a union of focused runs. Historical C23,
reset and Operational policy-retry causes remain unresolved even though their
identities pass later. The diagnostic inspector/exposure cases have their own
documented evidence and passing rechecks; those do not supply historical causality.

Python stale-launcher failures, interrupted unknown-exit run and wrong-capture-flag
two-skip results remain preserved alongside the final 3212/zero-skip execution.
Unsupported validator arguments and observer lint failure remain separate from
their later passing corrections. No failure receipt or original assertion was
deleted or relabeled. The audit checks all 15,890 protected task/evidence files,
including the original 16 Primitives protection entries.

Remaining limits are E1 UNVERIFIED, three inherited AppShell hints, four existing
lint warnings and the build chunk-size warning. Representative screenshots do not
certify every possible state combination. No staging/reset/clean/commit/push/merge,
archival/publication/version change, real operator mutation or upstream write was
performed. `git diff --check` exits 0 and cached file output is empty.

The queued parent guidance was checked against the current complete 26,917-byte
implementation handoff and its 20 command entries. A final read-only Python
reconciliation exits 0 and records all 462 current source hashes/modes and exact
byte parity for all 94 source/wheel/installed product files, including their
permission modes. It also verifies the exact nine-path LSP receipt hash, installed
module origin outside the checkout, live/default owner closures, controller
unsetting of JEV_NATIVE_OBSERVATION, absence of final observer artifacts and
preservation of all five failed browser attempts, the earlier-source passing
aggregate and the 3210/two-skip result. The receipt is
`research/check-followup-validation.json`. No suite or implementation work was
restarted; the verdict and E1 scope remain unchanged.

Final report validation briefly exited 1 because the reviewer expected 11 keys;
the required whitelist contains 10 and the report already had those exact keys.
The corrected whitelist check exits 0. `research/check-report-validation.json`
preserves this reviewer failure and correction. The earlier console message
claiming 11 allowed keys was also incorrect; no acceptance field was missing.
