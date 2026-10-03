The installed-public-dashboard acceptance is blocked. Two full browser attempts each executed all 118 cases and finished with 117 passed and one failed. Neither attempt skipped or retried a case. The required 118-passed result was not reached. The browser installation driver also failed its `direct_url.json` provenance assertion; the downloaded installer itself exited 0.

This report covers public version 0.1.1 from commit `e5cdf2b9418624ccd95a302a65beda6f41b0d443`, CI run `37125487119`, and wheel SHA256 `7fd6f8a5130325df80505d7a85f2dd01c53b7b0a76bbe4b17a961bf0534b061f`. The supplied successful public-assets manifest was checked by both prepared drivers. [public-browser-results.json](verification/public-browser-results.json) contains the sanitized counts, native driver exits, file hashes, feature mappings and private evidence paths.

| Invocation | Native driver exit | Result |
| --- | --- | --- |
| `public-installed-acceptance.py --scope browser --version 0.1.1` | 1 | Public installer command exited 0; installed version/Python check passed; provenance hash assertion failed; cleanup passed |
| `public-wheel-browser.py --mode run --version 0.1.1 --expected-tests 118 --workers 2` | 1 | 118 executed, 117 passed, 1 failed, 0 skipped, 0 retried; 85.570 seconds in the native Playwright report |
| Same full browser command in fresh `public-wheel-browser-fresh` evidence directory | 1 | 118 executed, 117 passed, 1 failed, 0 skipped, 0 retried; 79.986 seconds in the native Playwright report |

Every invocation used `PYTHONDONTWRITEBYTECODE=1`. Native command logs and exit records are retained under `.git/jev-release-011-acceptance/public-browser-execution/`. The original installer and browser failure results, screenshots, error context, traces and reports remain in their original directories. The fresh browser attempt followed diagnosis and retained the same public assets, two workers and every original assertion. No further attempt was made.

The installer failure is a mismatch between the prepared driver's provenance requirement and the metadata written by installed uv `0.7.16 (b6b7409d1 2025-06-27)`. The public installer installed version 0.1.1 on managed Python 3.12, but its local-wheel `direct_url.json` has `archive_info: {}`. The driver therefore could not establish its required SHA256 from that field. An independent comparison passed for all 52 installed package files and all four installed static files against the verified downloaded wheel. That byte comparison supplies package identity evidence; it does not change the failed driver result. The metadata was left untouched, and the unchanged installation driver was not repeated. The parent and acceptance-tool maintainer own the provenance requirement review.

Both browser attempts fail the same assertion at `frontend/tests/browser/routing-editor.spec.ts:93`, in “routing draft validates before review, requires warning acknowledgement, then explicitly applies and confirms reset.” The test expects the `Configured route` region to show `Draft policy preview · matches the currently applied policy` after “Confirm reset.” The trace records successful synthetic validate, apply, configuration reload, reset and final configuration reload requests. The failure screenshot and accessible tree show baseline fallback `default` and “No pending changes,” with the information drawer collapsed.

The source explains the observed collapse: `frontend/src/app/AppShell.tsx:248` keys `RoutingEditor` by `configuration.config_hash`; `frontend/src/features/routing/RoutingEditor.tsx:317` initializes `infoOpen` to `false`; the fixture changes the hash from `fixture-hash-applied` to `fixture-hash` on reset. The fresh run reproduced the same missing preview. This is a reproducible mismatch between the browser expectation and editor disclosure behavior. The parent and developer need to decide the intended disclosure contract. This report does not classify it as a historical failure or approve a product/test change.

The browser server used the public installation's `jev_gateway.dashboard.DashboardStatic` under installed site-packages. All four static files matched the public wheel, including their exact file set and bytes; hashes are recorded in the JSON report. No Vite server, npm build or dashboard reconstruction ran. The ten derived spec files were rechecked against their source hashes: nine are byte-identical; `canvas-connections.spec.ts` differs only in its single historical screenshot destination. Its assertions are unchanged. The source Playwright config hash was unchanged, with `fullyParallel: true`, `forbidOnly: true` and `retries: 0` retained. Source product/test paths had no Git diff against the supplied public commit at final collection.

The browser API scope is synthetic. Fixtures fulfill authentication outcomes, monitoring data, configuration reads/writes, provider discovery/import responses, theme and canvas-layout responses in memory. These runs test the installed JavaScript's behavior against those responses. They do not establish backend authentication, database persistence, native provider discovery, generation behavior or operator upgrade preservation. Public wheel smoke and isolated lifecycle belong to the other tester; their results are not imported into this report.

Both fixture families fail closed for unmocked APIs and unexpected origins. Chromium service workers were blocked, background networking was disabled and external DNS was disabled with loopback exempted. The ASGI child's socket-connect and DNS audit hook denied outbound networking. `escaped-api-requests.json` is empty in both attempts. Fixture teardown checks passed. The installer was allowed to download its pinned public wheel/checksum, managed Python and package dependencies. No real model generation or real provider discovery request ran in this assignment.

Both browser drivers report `owned_asgi_child_stopped: true`. An additional native process check found no process with the exact acceptance-server script in argv; the recorded first-attempt ASGI and Playwright PIDs no longer existed. Port 4178 was bindable after the fresh attempt. The isolated installation's final `jev status` returned native exit 4 with `error.code: not_running`. Its installation remains available for parent review. The operator installation and service were untouched.

The feature mappings below describe only this execution. Rows that need source/unit/backend gates point to the separate source review, [check-source-result.md](check-source-result.md), without treating it as another installed-public run.

| Key-page AC | Installed-browser evidence and limit |
| --- | --- |
| AC1 | Passed: synthetic 401 hides navigation/panels; successful validation reveals the dashboard; anonymous access remains available |
| AC2 | Passed: password input, blank input without requests, Enter submission, pending state and duplicate-probe exclusion |
| AC3 | Passed: wrong-key/network-abort feedback and retry, activity 401 clears credentials and stops polling, anonymous gateway navigation |
| AC4 | Passed: trimmed Bearer header; no key in URL, cookie, localStorage or sessionStorage; reload needs a fresh key |
| AC5 | Passed: eight EN/ZH × 1280/320px × light/dark cases, keyboard focus, no page overflow, contrast and connected-view navigation |
| AC6 | Blocked for the complete browser gate by the routing reset-preview failure; lint, type, unit and build/freshness were not rerun here |

| Canvas AC | Installed-browser evidence and limit |
| --- | --- |
| AC1 | Passed in covered EN/ZH selection and dense-rendering scenes; no exhaustive translation-string audit |
| AC2 | Covered node roles, long names, measured dense bounds, alignment save/reload and keyboard hit targets; representative screenshots inspected |
| AC3 | Passed native left-input/right-output placement, arrow markers and source/destination wire endpoint centers |
| AC4 | Passed exact wire selection, native drag connect/reconnect, match/fallback and pool disconnect/repair, keyboard activation/cancel/focus return and fixed/read-only/last-member restrictions |
| AC5 | Covered question/pool port growth and shrink, 18px handles at 28px spacing, exact anchors, node bounds, Fit and responsive reachability |
| AC6 | Covered draft-before-apply, validation/warning acknowledgement, layout-only writes, stale gestures and read-only guards; blocked by hidden preview after reset |
| AC7 | Blocked: 117/118 passed twice; native reports and screenshots retained; other frontend/backend gates remain separate |
| AC8 | Partial: configured no-match/rule preview and failure-fallback reconnection passed; the distinct-label/selection/zero-rule backend decision matrix was not exercised here |
| AC9 | Partial: visible 257-node arrange rejection without PUT, alignment persistence and dense geometry passed; coordinate/encoded-byte overflow and restoration after growth require separate source/unit evidence |

The native per-file case counts are 6 appearance, 13 canvas connection, 4 dense canvas viewport cases, 15 connection-page cases, 7 icon, 10 monitoring, 43 provider management, 10 responsive, 4 routing editor and 6 settings. All cases outside the single reset-preview failure passed in both attempts. The four dense viewport cases saved 16 geometry scenes and corresponding screenshots across EN/ZH and light/dark. All eight connection-button contrast measurements passed 4.5; the minimum was `5.147499321854971`.

Useful private evidence paths, relative to the repository:

- Native exits and diagnosis: `.git/jev-release-011-acceptance/public-browser-execution/{install-exit,browser-exit,browser-fresh-exit,failure-diagnosis,native-cleanup}.json`.
- Original native report: `.git/jev-release-011-acceptance/public-wheel-browser/browser-results/results.json`; HTML: `browser-results/html/index.html` under the same root.
- Fresh native report: `.git/jev-release-011-acceptance/public-wheel-browser-fresh/browser-results/results.json`; its failure screenshot, `error-context.md` and `trace.zip` are under `browser-results/artifacts/routing-editor-routing-dra-850c6--applies-and-confirms-reset/`.
- EN connection page: `.git/jev-release-011-acceptance/public-wheel-browser/browser-results/artifacts/connection-connection-geom-e21d1-board-focus-en-1280px-light/en-1280-light.png`.
- ZH connection page: `.git/jev-release-011-acceptance/public-wheel-browser/browser-results/artifacts/connection-connection-geom-12d38-oard-focus-zh-CN-320px-dark/zh-CN-320-dark.png`.
- Selected connection, EN: `.git/jev-release-011-acceptance/public-wheel-browser/browser-results/artifacts/canvas-connections-selects-258a5--and-names-its-output-in-en/connection-en.png`.
- Selected connection, ZH: `.git/jev-release-011-acceptance/public-wheel-browser/browser-results/artifacts/canvas-connections-selects-209ec-d-names-its-output-in-zh-CN/connection-zh-CN.png`.
- Dense desktop: `.git/jev-release-011-acceptance/public-wheel-browser/browser-results/artifacts/canvas-visual-acceptance-d-e29b5-e-and-reachable-at-1280x900/strategy-1280-en-light.png`, with adjacent `geometry-en-light.json`.
- Dense narrow ZH: `.git/jev-release-011-acceptance/public-wheel-browser/browser-results/artifacts/canvas-visual-acceptance-d-11a19-le-and-reachable-at-320x900/strategy-320-zh-CN-dark.png`, with adjacent `geometry-zh-CN-dark.json`.
- Repaired-draft scene: `.git/jev-release-011-acceptance/public-wheel-browser/browser-results/canvas-repaired-draft.png`.

I inspected the two connection-page images, both selected-connection images, the two dense samples above and the first failure screenshot. The selected images identify `intent = other` and show its highlighted wire; connection inputs are masked; the dense samples show separated ports and a visible focus outline. At narrow width the canvas focuses one node and offers panning, with toolbar overflow confined to its own region. All screenshots and private reports remain available for the parent's inspection. No product/test edits, commits, pushes, remote edits, operator lifecycle mutations or recursive delegation were performed.
