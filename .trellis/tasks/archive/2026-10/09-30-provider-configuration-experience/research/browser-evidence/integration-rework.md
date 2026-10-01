# Bounded browser integration rework

The targeted gate remains REWORK: 2 passed, 1 failed out of 3, exit 1. Activity retry and responsive navigation now pass. The remaining failure is the original manual pause/resume contract, whose control is absent in both the saved pre-implementation source and the current shell. Its assertions remain in the test.

## Scope and snapshot evidence

This pass changed only `frontend/tests/setup/mock-api.ts`, the two existing activity cases in `frontend/tests/browser/monitoring.spec.ts`, and this evidence file. `responsive.spec.ts` stayed byte-identical. No product source, Provider fixtures/specs, build/static assets, task pointers, task status, commits, or archive state were changed by this pass. No subagents or orchestration were used.

The comparison used `/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-provider-before-z84iyawv`. Before editing, these files were byte-identical to that snapshot:

| File | SHA-256 before edits |
| --- | --- |
| `frontend/tests/browser/monitoring.spec.ts` | `f43ba1511198b1476e866fb3cd642185882601b1f97a673a9acf2d460d914fb4` |
| `frontend/tests/browser/responsive.spec.ts` | `c3ee585d702af92214b70be3debdbd724c97241d90dffcd47f95d277f10073f5` |
| `frontend/tests/setup/mock-api.ts` | `b5dd741cc37164433467d8f99a85eacd349785dbae6e41232db5f1001c5983e6` |
| `frontend/src/features/monitoring/MonitoringView.tsx` | `ddc5703779f514a258ddc459aa505a20bf150354fd1753d282233b454c497877` |
| `frontend/src/features/monitoring/components/StrategyDistribution.tsx` | `a49ee0763299babeb6d60734f49f7946a6788c0639cd65e0dcced9068b625e39` |

Both monitoring selector mismatches therefore predate Provider implementation:

| Original test assumption | Saved snapshot | Current source inspected during this pass |
| --- | --- | --- |
| `monitoring.spec.ts:193` locates `details[data-dashboard-settings]`; visibility fails at `:194` | `AppShell.tsx:126` has independent Settings navigation; `:234` renders a Settings section. No `data-dashboard-settings` disclosure exists. | `AppShell.tsx:130` has the same navigation; `:238` renders the Settings section. |
| `monitoring.spec.ts:211` clicks `Refresh activity` | `AppShell.tsx:145` names the header button with `t("refresh")`; `:147` calls `onRefresh`. `App.tsx:79` defines refresh and `:80` restarts routing activity. | `AppShell.tsx:149` names the header button with `t("refresh")`; `:151` calls `onRefresh`. `App.tsx:80` defines refresh and `:81` restarts routing activity. |

The first case also expects `Pause animation` and `Resume animation`. Neither shell version renders or wires those controls. `MonitoringView.tsx:25` still declares optional `activityMotionPaused`, and `:65` forwards it to `StrategyDistribution`. `StrategyDistribution.tsx:28` defaults the flag to false; `:143` handles paused/reduced motion when rendering an active path. Both shell versions omit that prop. Reduced-motion support and the request-detail replay controls do not satisfy the test's manual activity pause/resume intent.

These findings establish a pre-existing missing product control. They do not establish whether its removal was an intended decision in the earlier visual work.

## Test and fixture corrections

- `frontend/tests/browser/monitoring.spec.ts:193`: locate the existing header `Refresh` button, assert the activity status has no embedded buttons while Monitoring is mounted, and use the independent Settings navigation and accessible Settings region. Preserve pause/resume `aria-pressed` assertions, the width loop, and the original overflow/status assertions. The case now reaches the missing manual control instead of stopping at an obsolete disclosure selector.
- `frontend/tests/browser/monitoring.spec.ts:214`: use the header `Refresh` button for activity retry. Preserve unavailable-to-valid status assertions, the increased activity-read count, and the assertion that no configuration writes occurred.
- `frontend/tests/setup/mock-api.ts:28`: build a typed safe Provider configuration snapshot from the existing effective routing fixture's model identities, tags, priorities, and write permission. Include `model.name`, `has_api_key`, flat presets, string type/protocol registries, decision globals, explicit synthetic cost/capability values, and null limits. Endpoints use `https://example.test/v1`; env references use `FIXTURE_PROVIDER_KEY` and `FIXTURE_DECISION_KEY`. No credential values or real upstream calls are involved.
- `frontend/tests/setup/mock-api.ts:111`: fulfill only same-origin `GET /v1/provider-configuration` with no query string, after the existing non-GET rejection. Origin, unknown-route, unexpected-write, and teardown guards remain intact. Other Provider routes received no additional handlers. The read-only responsive smoke completed without unexpected-request teardown failures.

`responsive.spec.ts:8` visits all four views in English and Chinese at 1280px, 390px, and 320px. Providers now performs a configuration read, which the legacy helper previously rejected. Its test logic and assertions were unchanged.

## Execution

Commands ran from `frontend/` against the existing main-built static bundle, without a build:

```bash
npx tsc -p tests/tsconfig.json
npx playwright test -c playwright.config.ts tests/browser/monitoring.spec.ts:189 tests/browser/monitoring.spec.ts:209 tests/browser/responsive.spec.ts:8 --workers=1
```

The second monitoring case moved from line 206 to line 209 after the bounded edit.

| Check | Exit | Result |
| --- | --- | --- |
| Browser TypeScript | 0 | No diagnostics; 0.876s |
| Three targeted existing browser tests | 1 | 2 passed, 1 failed, 0 skipped; Playwright 8.7s, complete command 9.128s |
| Scoped `git diff --check` | 0 | No whitespace errors |
| Bundle stability | n/a | All four static-file SHA-256 hashes matched before, immediately before, and after the run |
| Port ownership | n/a | 4178 was free before and after the run; Playwright owned its preview server during the run. This pass did not use 4182. |

The sole browser failure is `monitoring.spec.ts:201`: the Settings region has no `Pause animation` button, so its expected `aria-pressed="false"` assertion times out at 5000ms. The saved browser context shows Settings selected, the header Refresh button, and language/color/theme controls. There are no unexpected-request or write-guard failures in this run.

The activity retry case passes in 214ms. The responsive case passes in 1.8s and exercises all three widths and both locales. The animation case fails on its first 1280px iteration, so its mobile animation assertions were not reached. The full suite and new Provider functional cases remain main/UI-owner checks.

## Logs and remaining action

Reproduction artifacts are under:

`/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-provider-integration-rework-1wghtlj7`

- `browser-typescript.log` and `browser-typescript-result.json` record the TypeScript command and exit.
- `targeted-browser.log` and `targeted-browser-result.json` record the three tests, failure, timing, command, and exit.
- `animation-failure-context.md` preserves the rendered Settings context before another gate overwrites Playwright's cache.
- `initial-comparison.json` records the byte-identity/hash findings from the comparison before edits. `snapshot-comparison.json` records snapshot/current hashes after the test corrections.
- `owned-changes.diff`, `diff-check.log`, and `diff-check-result.json` preserve the scoped diff and verification.
- `bundle-before.json`, `bundle-after.json`, `port-before.txt`, and `port-after.txt` record stable static assets and server cleanup.

The Settings/monitoring visual owner should resolve the manual motion-control contract. If pause/resume remains required, a bounded product follow-up can wire a shell-owned, memory-only paused state and an accessible Settings toggle into the existing `MonitoringView.activityMotionPaused` prop. It should preserve polling, routing, theme storage, and reduced-motion behavior. Product changes require separate ownership; this pass leaves that behavior and its failing assertions intact. Main should run the full browser gate after the UI owner's fixes and stable build are ready.
