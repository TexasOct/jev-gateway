Replacement public v0.1.1 passed the assigned installed acceptance scopes. The fresh browser installation exited 0 with `success: true` and `cleanup_success: true`; its wheel-input observer verified the exact public SHA256 supplied to uv. All 118 browser cases and all 133 requested backend cases passed with native exit 0. The browser run had zero skips, retries or flaky cases and no escaped API requests.

The accepted publication is source `6fc0f0e19e31f52d8e831593e8c530aed7e73141`, CI run `37132156378`, and Release `402565482`. The public wheel SHA256 is `2598f5ab58d1c90c1cb4b788bbf2d2193a28f247fc6d6b6ae01ec7e8fd6a2038`; installer SHA256 is `bbd06b07d7e8f5ead47540bc4d52c2dc24a524eb850911f12682d1ba28e56cd5`. All invocations used the successful absolute manifest at `.git/jev-release-011-acceptance/replacement/public-download/public-assets-result.json`.

[final-public-browser-results.json](verification/final-public-browser-results.json) records all 118 named browser cases, native invocations and log hashes, installer provenance, fixture/source integrity, screenshots, cleanup and the feature acceptance mappings. [final-installed-backend-results.json](verification/final-installed-backend-results.json) records all 133 backend case identifiers, native counts, package provenance, unchanged test hashes and the backend evidence boundaries.

| Invocation | Fresh private work directory under `.git/jev-release-011-acceptance/replacement/` | Native exit | Result |
| --- | --- | ---: | --- |
| `public-installed-acceptance.py --scope browser --version 0.1.1` | `public-browser-install` | 0 | Success and cleanup true; managed Python 3.12; all 52 product files match; managed gateway stopped |
| `public-wheel-browser.py --mode run --expected-tests 118 --workers 2 --version 0.1.1` | `public-wheel-browser` | 0 | 118 passed, zero skipped/retried/flaky; native Playwright duration 78.411 seconds |
| `installed-backend-regression.py` | `public-installed-backend` | 0 | 133 passed in 3.20 seconds, zero failed/skipped/deselected |

The JSON reports retain the exact absolute `--source-repo`, `--installed-python`, `--assets-manifest` and `--work-dir` arguments. The outer native runner took 53.124 seconds for installation, 80.740 seconds for browser acceptance and 8.686 seconds for backend setup and execution. Those durations include work outside the test suites.

The installer used the downloaded public script. The observer recorded one wheel input, filename `jev_gateway-0.1.1-py3-none-any.whl`, size 355988 bytes, with the required public SHA256. uv omitted its archive hash from `direct_url.json`; the driver joined the installed local file URL to the observed wheel input and verified the entire installed package. Its final identity check passed. The 52-file set and every file's bytes were checked again after the backend helper added pytest tooling. The product package was not reinstalled for that regression.

The browser child served all four public static files through installed `jev_gateway.dashboard.DashboardStatic` in site-packages. No Vite server or frontend build ran. Every one of the ten spec copies retains the tagged source assertions. Nine copies are byte-identical; the canvas-connection copy redirects only its historical screenshot destination into this private run. The original source config, browser specs, fixtures and backend test files match the tagged final source. All 39 baseline files, including the task helpers, retained their hashes through execution. Source fixture symlinks point to the originals.

| Browser file | Passed cases |
| --- | ---: |
| `appearance.spec.ts` | 6 |
| `canvas-connections.spec.ts` | 13 |
| `canvas-visual-acceptance.spec.ts` | 4 |
| `connection.spec.ts` | 15 |
| `icons.spec.ts` | 7 |
| `monitoring.spec.ts` | 10 |
| `provider-management.spec.ts` | 43 |
| `responsive.spec.ts` | 10 |
| `routing-editor.spec.ts` | 4 |
| `settings.spec.ts` | 6 |

The previously failing case, “routing draft validates before review, requires warning acknowledgement, then explicitly applies and confirms reset,” passed against the replacement wheel. Its retained assertion sees `Draft policy preview · matches the currently applied policy` after reset. The first publication's two 117/118 failures and installation metadata-driver failure remain documented in [check-public-browser.md](check-public-browser.md) and [public-browser-results.json](verification/public-browser-results.json). Both files still match the previous preservation snapshot. This successful replacement run does not change those earlier results.

Browser APIs were fulfilled by the existing synthetic fixtures. Both fixture families reject unexpected origins and unmocked APIs. Service workers were blocked; Chromium disabled background networking and external DNS. The ASGI child's socket/DNS guard remained active, and `escaped-api-requests.json` contains `[]`. These browser cases establish installed JavaScript behavior against fixture responses. They do not establish real provider service behavior or operator persistence.

The backend helper ran actual installed routing, overlay, layout and gateway code with temporary runtime files and mocked upstreams. Product imports resolved to site-packages under the retained managed Python 3.12 installation. The four copied test modules and their helpers are byte-identical to source. Only the private `dashboard_bundle` fixture uses installed assets instead of building them; its decorators and the rest of `conftest.py` are unchanged by AST comparison. All socket connections and DNS resolution were disabled in the pytest runner.

The separate first-publication helper qualification is retained at [backend-harness-qualification.json](verification/backend-harness-qualification.json). It identified LiteLLM's import-time remote cost-map fetch under the network guard. Before this backend invocation, I reported that finding and set `LITELLM_LOCAL_MODEL_COST_MAP=True` so LiteLLM uses its packaged map. The helper, network guard and assertions remained unchanged. The regression then completed without an adaptation failure.

| Installed backend module | Passed parameterized cases | Evidence |
| --- | ---: | --- |
| `test_decision_matrix.py` | 19 | Real selection semantics with mocked decision providers, including four default/fallback terminal-path combinations |
| `test_routing_overlay.py` | 17 | Overlay replacement, optional fields, empty rules, validation and atomic persistence |
| `test_canvas_layout.py` | 10 | Layout round trip, corrupt/overlong stored-file handling, coordinate/node/schema bounds and written encoding |
| `test_gateway.py` | 87 | Actual ASGI authentication, static serving, configuration/layout guards, persistence and mocked upstream behavior |

The following mappings refer to cases executed in this installed run. Each JSON mapping contains their case IDs, and each ID resolves to its exact title or parameterized backend identifier. Source lint, type, unit and build/freshness checks are referenced separately through [check-repaired-source.md](check-repaired-source.md), [repaired-source-gates.json](verification/repaired-source-gates.json) and [preview-fix-gates.json](verification/preview-fix-gates.json). They are not counted as installed acceptance.

| Archived Key-page criterion | Named executed evidence and scope |
| --- | --- |
| AC1 | “401 hides the console; blank input sends nothing and Enter waits for validation with one trimmed Bearer attempt”; “anonymous gateways retain normal navigation.” Actual backend shell/data authentication also passed in `test_dashboard_shell_is_content_free_and_data_api_requires_bearer_auth`. |
| AC2 | The same 401/Enter case; “initial validation holds the page and excludes overlapping manual and locale-triggered probes”; “blank-key errors follow locale changes without new validation requests.” These cover password input, empty-input exclusion, pending and duplicate-probe prevention. |
| AC3 | “wrong keys and a true network abort stay on the page with a retained draft and allow retry”; “activity 401 clears the credential, stops polling, hides remembered data and reload cannot restore the key”; anonymous navigation. |
| AC4 | The trimmed-Bearer case, activity-401 case and “a successful connection keeps credentials out of browser storage and reload needs a fresh key.” Real backend shell and authentication assertions provide separate support. |
| AC5 | All eight “connection geometry and keyboard focus” variants for EN/ZH, 1280/320px and light/dark; anonymous connected navigation; desktop/mobile navigation and document-overflow cases. All eight measured button contrast ratios exceeded 4.5; minimum `5.147499321854971`. |
| AC6 | The complete 118-case installed browser run passed, including real browser state transitions and request boundaries. Lint, TypeScript, unit and build/freshness retain their separate source-gate evidence. |

| Archived canvas criterion | Named executed evidence and scope |
| --- | --- |
| AC1 | Both “selects the exact question result wire and names its output” locale cases and all four “dense strategy nodes remain readable and reachable” viewport cases. They cover Chinese/English node and connection copy in the exercised scenes; no exhaustive string audit ran. |
| AC2 | Dense-node cases, “aligns a selected group and restores its layout without policy writes,” and “canvas utilities preserve measured geometry, toolbar controls and real hit targets at supported widths.” Actual persistence also passed in `test_layout_round_trip_and_corrupt_default`. |
| AC3 | “question options grow and shrink ports and dense handles keep full size and exact wire centers” asserts left/right placement, native endpoint centers and arrow markers. |
| AC4 | Exact-wire locale cases; “selects native wires, disconnects and repairs match outputs before review”; “adds and disconnects pool members with native drag and preserves foreign tags through apply”; “reconnects an empty failure fallback by pointer drag and cancels keyboard connection controls”; fixed/read-only/last-member and stale-gesture cases. Actual backend rejection of disconnected rule/fallback outputs passed in both parameters of `test_disconnected_canvas_match_cannot_replace_applied_policy`. |
| AC5 | Port growth/shrink, pool growth/shrink, dense-node scenes, keyboard/pointer-drag and utility-geometry cases. Native assertions retain 18px handles, 28px spacing, centers, bounds and Fit behavior. Shared marquee/inspector geometry also retains separate source-unit evidence. |
| AC6 | The full draft/validate/review/apply/reset case, layout-only alignment/drag, fixed/read-only guards and unsupported/blank-question cases. Real backend tests include `test_configuration_validate_and_invalid_put_never_swap_catalog`, `test_configuration_put_persists_and_delete_restores_baseline`, `test_configuration_writes_require_a_configured_and_correct_key` and `test_canvas_layout_auth_isolation_and_atomic_failure`. |
| AC7 | 118 installed browser and 133 installed backend cases passed. Curated screenshots and geometry are retained. Lint, type, source unit and build/freshness remain separately recorded gates. |
| AC8 | Browser configured-route explanation, question-result wire copy and failure-fallback reconnection passed. The actual installed `test_matrix_no_match_default_is_distinct_from_decision_failure_fallback` passed all four combinations of rules present/absent and valid/invalid answers, with different default/fallback labels and selection modes. These four semantic combinations are backend evidence; the browser fixtures do not independently cover every combination. |
| AC9 | “rejects an oversized arrange-all operation visibly without a layout or policy PUT,” saved alignment, output growth and dense geometry passed. Installed layout tests cover coordinate 10001, 257 nodes, invalid shape, a stored file over 65536 bytes and written encoding; real layout API tests preserve the previous file and policy on invalid/atomic failure. Cumulative-height overflow columns, encoded Unicode payload rejection and saved-position restoration after output growth retain separate source-unit evidence. This browser run does not independently establish those subcases. |

The curated evidence is in [verification/final/](verification/final/artifacts-manifest.json): 16 dense screenshots for four viewport sizes × two languages × two themes, two selected-wire screenshots, and 16 corresponding geometry JSON files. [canvas-repaired-draft.png](verification/final/canvas-repaired-draft.png) is retained separately as one additional screenshot. The manifest records each original private path, final path and SHA256; copies preserve the exact bytes.

I inspected all 16 dense images through four contact sheets, both selected-wire images and the repaired-draft image. They show synthetic fixture node/model content and no visible credentials. Geometry files were checked for their exact measurement schema, allowed fixture IDs, numerical bounds and credential strings. Narrow scenes focus a module and allow panning; controls scroll within their own regions. The image-review contact sheets are private; the curated PNGs retain their original resolution.

The browser driver reports `owned_asgi_child_stopped: true`. An independent native probe found no matching acceptance-server child, and port 4178 was bindable. The retained isolated `jev status` returned exit 4 with `error.code: not_running`. Its installation remains at `.git/jev-release-011-acceptance/replacement/public-browser-install/` for the parent's independent review and later cleanup. No operator installation or service was changed by this worker.

Native logs, exits, original browser reports, discovery, served-wheel provenance, fixture/config derivation, escaped-request evidence, backend pytest output and package provenance remain private under the three fresh replacement work directories and their sibling `*-native.log`/`*-native-exit.json` files. The final integrity and first-publication preservation records are at `replacement/final-integrity.json` and `replacement/first-publication-preserved.json` under the private root. No product/test/helper edits, frontend builds, commits, publication, recursive agents, real generation or real provider discovery occurred in this assignment.

The remaining parent work is independent review and cleanup of the retained installation, plus any operator-upgrade/preservation or publication closeout acceptance assigned elsewhere. This report approves only the installed browser and four-module backend scopes described above.
