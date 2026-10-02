# Native post-rework acceptance

REWORK is required for the Strategy drawer at 320px. The current backend and packaged dashboard passed the full 75-check initialization flow, both management-key boundaries, and the 119-check R3/R4 functional extension. A separate native layout inspection then reproduced a product defect in both locales: the configured-route body occupies only one of the narrow drawer's two columns, squeezing the inherited destination into 11 English lines or 32 Chinese lines. The failure and original screenshots are retained. No product fix was made by this tester.

Verification finished on 2026-10-02. This report covers source-backed native browser/HTTP acceptance with synthetic generation. It does not certify release artifacts or real upstream service behavior.

## Product defect for parent repair

Reproduce at 320×900 in English or Chinese with a configured global model, an empty `task_aware/missing` tag, and a rule selecting `missing`. Open Strategy workflow, expand the information drawer, and select the rule in Configured route. The same shape was loaded into a fresh synthetic runtime through a private baseline edit followed by the real `/v1/routing/reload` route.

[RoutingEditor.tsx:585](/Users/texas/Workspace/jev-llmroute-test/frontend/src/features/routing/RoutingEditor.tsx:585) declares two equal grid columns below 600px. Its [routing-information body:590](/Users/texas/Workspace/jev-llmroute-test/frontend/src/features/routing/RoutingEditor.tsx:590) has no column span. Native computed geometry confirms that the 318px drawer has `159px 159px` tracks and a 159px information body. The configured-route section receives 135px after padding.

| Native measurement | English 1280px | English 320px | Chinese 1280px | Chinese 320px |
| --- | ---: | ---: | ---: | ---: |
| Configured-route width | 1254px | 135px | 1164px | 135px |
| Inherited model chip width | 219.56px | 39.33px | 219.56px | 18px |
| Model text line fragments | 1 | 11 | 1 | 32 |
| Configured-route height | 943.91px | 2613.91px | 911.91px | 3629.91px |

The Chinese narrow information body has a 270px client height and a 5171px scroll height; its drawer has a 320px client height and 5220px scroll height. Revealing the configured path can move drawer content outside the visible board. Page-level horizontal overflow checks still pass, so those checks alone do not establish that the explanation is readable.

Parent repair should let the narrow information body use the available drawer width and keep its content scrolling inside the bounded drawer. Recheck actual model-text wrapping and drawer/body geometry in both locales after rebuilding. The tester left frontend/backend/static files unchanged.

Defect evidence: `native-post-rework/run-20261002T114853Z-layout/layout-findings.json`, `layout-{locale}-{width}.json`, `browser-result.json`, and `screenshots/layout-viewport-zh-CN-320.png`, `layout-model-label-en-320.png`, `layout-model-label-zh-CN-320.png`. The targeted run completed 46 passing assertions and then failed the readability assertion. This product failure is separate from the four earlier harness failures below.

## Completed functional coverage

All four final primary runs used source SHA-256 `60394f37802c1be7fe7669961fd50e9ea49412495f38ebd17108614624e55e8b` and static SHA-256 `3db6f439e932c795c0829fbd0c14a68020fa059ff2f6acbbff244282ee48b862`.

| Run directory under the new evidence root | Result | Completed checks | Owned origin | Duration |
| --- | --- | ---: | --- | ---: |
| `run-20261002T114620Z/` | PASS, complete baseline flow | 75 | `http://127.0.0.1:52983` | 7.12s |
| `run-20261002T114620Z-key-16/` | PASS, native setup and padded reconnect | 2 | `http://127.0.0.1:52982` | 2.65s |
| `run-20261002T114620Z-key-8192/` | PASS, native setup and padded reconnect | 2 | `http://127.0.0.1:52981` | 2.65s |
| `run-20261002T114534Z-rework/` | PASS, R3/R4 functional extension | 119 | `http://127.0.0.1:52753` | 13.08s |
| `run-20261002T114853Z-layout/` | FAIL, product layout defect | 46 before failure | `http://127.0.0.1:53842` | 6.71s |

The 119-check extension repeats the first 40 initialization checks and adds 79 assertions. These counts describe executed checks; they are not independent test-case counts or a claim that the remaining layout defect passed.

The complete 75-check run retained the earlier acceptance scope: actual UI bootstrap, rejection of invalid keys before POST, real server rejection without file writes, stale/repeated setup conflicts, optional onboarding, provider save before model import, manually confirmed model import, global default conflict/reload/save/clear, real API previews for every packaged strategy, retained Default/默认 rendering, reload/reconnect, both widths/locales and browser storage audits. The valid-key bootstrap and 16/8192-character boundary setup/reconnect tests all used browser Fetch against the owned real server.

The extension proved these additional behaviors at 1280×900 and 320×900 in English and Chinese:

- Before any generation, session or activity, Monitoring shows the global model as `Configured · no sessions` and `Default · inherited global model`, with the Chinese equivalents. Actual session and activity API responses are empty.
- Settings clear removes the global default, inherited destination and dashed whiteboard edge. The configured explanation directs the operator to Settings. Native Settings reselect/save restores the destination. Both operations preserve every model's tags.
- The inherited SVG edge has computed dash pattern `6px, 5px`, `pointer-events: none`, localized source caption and no editable handle in its edge group. The empty pool node also shows the inherited source.
- Configured route retains matched `missing` evidence while its selected rule path ends in Default/默认 and the exact global model. The UI explains that the destination is not a pool member. Selecting this explanation leaves Review changes disabled.
- Each layout performs a real priority edit through UI validate, review and confirm/save. The POST and PUT bodies match. Their model patch contains only `native-synthetic/literal-model`, its existing `task_aware/default` tag, and the edited priority. No `defaults` field or inherited global membership appears. The baseline bytes are unchanged by the routing save; private overlay bytes and real GET responses confirm the patch. Browser reload retains the global path and empty global-model tags.
- Legacy editor text and title attributes contain no `score undefined`. In the Provider model-finder view, the actual instance heading is 188px wide and 20px high at 320px in both locales; its 182px text fits on one line. Provider page overflow checks pass, and the narrow heading screenshot was visually inspected.

R4 used two sessions in one real catalog with both a populated literal `default` label and an empty `missing` tag. Both final labels remain raw `default`. The ordinary pool selection has `defaulted: false`; global inheritance has `defaulted: true`. Real preview, Decision, live-session, session-list and retained-request projections expose the appropriate boolean.

Each session completed 46 user turns through actual HTTP and fake completion, with a growing synthetic conversation. The 40-event limit evicted the original selection event. All retained events and the latest Decision/list/detail projections still report the correct source. Subsequent requests use `session_pinned` and preserve their separate routes. Actual UI overview, virtual session rows and retained route traces preserve literal `default` while rendering global `Default`/`默认`, across both locales and widths. The raw JSON trace keeps `"label": "default"` and the original boolean.

A final native Fetch request consumed real HTTP SSE to completion. Four typed fake SDK chunks supplied assistant deltas, STOP and a usage-only final chunk. The browser received the virtual model echo and terminal `[DONE]`; retained outcome has `ok: true`, `finish_reason: stop`, tokens `11/7/18`, and `returned_model: synthetic-native-returned-model`. The global decision source remains true. The iterator closed once and the real activity registry became empty. After service shutdown, a separate read-only SQLite connection found exactly one continuation row for that stream's assistant message key. Both sessions retain 40 continuations, consistent with the configured cap. SQLite also contains 46 decisions with false source and 47 with true source.

## Real and synthetic boundaries

Python 3.14.7 from the repository `.venv`, installed Node Playwright and headless Chromium served the current packaged `jev_gateway/static` through a newly launched Uvicorn application. Browser Fetch, TCP HTTP, ASGI handlers, catalog parsing, configuration file transactions, overlay validation/activation, SQLite retention and rendering were real. Browser routing allowed the owned origin using `route.continue()` and blocked external origins; it never fulfilled API responses.

Only LiteLLM completion was replaced in the private application factory. The full baseline flow uses one fake generation call. The successful extension uses 93 fake generation calls: 46 literal-session calls, 46 global-session calls, and one global SSE call. No decision provider was added; the matrix uses its real local fallback. Clicking Rule 1 verifies the configured explanation, not an upstream decision-provider classification.

Provider creation and the first model's metadata confirmation/import are UI actions. The extension clones that synthetic model in its private `models.json` and creates the literal/missing strategy shape there, then calls real HTTP reload. It changes the matrix fallback through actual routing-overlay HTTP PUT to create the first literal session, then restores the empty fallback before creating the global session. Priority validation/review/save and global-default edits remain actual UI actions. Requests creating retained sessions and their continuations are supplemental browser Fetch HTTP actions.

Every child environment uses private `HOME` and `JEV_GATEWAY_HOME` and an allowlist without inherited provider credentials or proxy settings. Dotenv loading is disabled and the LiteLLM cost map is local. Synthetic credentials appear only in the private runtime's protected credential file and transient browser memory. All successful storage checks found only the validated locale in localStorage, no sessionStorage, cookies or credential-bearing URL; reload required reconnect and padded keys were trimmed through native Fetch.

The Python socket audit blocked non-loopback DNS/connections. All completed runs recorded zero external browser/backend attempts, discovery requests and public metadata requests. Operator configuration, real credentials and the former PID 22983 were untouched. No source/static edits, build, Git mutation, wheel work, release publication or extra agent dispatch occurred.

## Evidence, fingerprints and cleanup

New protected evidence root: `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/native-post-rework/`. Each invocation creates a new dated directory, dynamic port and fresh private runtime. The original `native-final/` runs and `final-audit.json` were not modified. This acceptance wrote the separate audit `audit-20261002T115037Z.json`.

The audit scanned 235 retained text artifacts for each run's synthetic credentials and found zero leaks. All 12 owned server/runner PID pairs exited, all 12 ports were closed, and every browser result records context/browser closure. Before/after source and static manifests match within every run. A final read-only comparison confirmed the current files still match the final primary runs. Manifests cover 173 source/test/template/build-input files and all four static files.

| Fingerprint | SHA-256 |
| --- | --- |
| Source tree | `60394f37802c1be7fe7669961fd50e9ea49412495f38ebd17108614624e55e8b` |
| Static tree | `3db6f439e932c795c0829fbd0c14a68020fa059ff2f6acbbff244282ee48b862` |
| `static/index.html` | `4740ac3df7f739d8d3a907bbb4bb6bb510340029c29d15861369fb0b0e31be37` |
| `static/assets/index-Bb6OBwKV.js` | `5ba9488b63861978cbf723e14aec773d5a3922ecfe49e98f93c31433f8dd3985` |
| `static/assets/index-Ce47bBH6.css` | `821ad57e58634e8bf17dcec95e876a045ae172edac4ef8974d0b3ec5b1cbbd01` |
| `jev_gateway/dashboard.py` | `d6e925b48586ab15ae38b59ad8e24ddb53f372c4a79cd17c8dab561eb736de3b` |
| `jev_gateway/gateway.py` | `6e878c7e5c53bb3b75aedd18c84994d029f0aefc201e142c7d9c40069e0c5b77` |

The first three passing runs had source digest `5d98cf73f0fa357db5139c74e8bec5c056e62845866b1c7f6aff4404fdea3feb`. The only later manifest difference was the parent's `frontend/tests/browser/global-route-path.spec.ts` edit; static assets did not change. The full flow and both boundaries were rerun against the final digest above.

The extension's principal evidence is `r3-overlay-{locale}-{width}.json`, `r3-all-overlay-requests.json`, `r4-literal-initial-decision.json`, `r4-global-initial-decision.json`, `r4-session-list.json`, `r4-pinned-native-pin-{literal,global}.json`, `sse-completed.json`, `final-state.json` and the private SQLite database. Its 29 screenshots include configured no-activity Monitoring, Provider headers and literal/global traces. The targeted layout run adds 22 screenshots. Chinese narrow Provider, both Chinese source-label traces, the configured no-activity desktop view and the narrow layout defect were visually inspected.

Four preliminary extension runs failed for harness reasons, with their original logs/results retained: `114012Z` used an exact Rule 1 name that omitted condition text; `114139Z` expected the wrong Chinese success message; `114235Z` sent single-user-message requests while expecting a 46-turn count; `114345Z` expected a continuation count increase despite the 40-per-session cap. Fixes affected only private scripts. Their successful replacement is `114534Z-rework`. The `114853Z-layout` failure is the product defect and remains unfixed.

Reproduce with the repository `.venv/bin/python` and the private `run_acceptance.py <repo> [16|8192]`, `run_rework.py <repo>`, or `run_layout.py <repo>` scripts. No runner builds assets. The separate `audit_post_rework.py` audit is tied to this dated evidence set; its artifact preserves script hashes and cleanup results.

## Remaining scope

Parent must repair the narrow drawer, rebuild and rerun native layout acceptance. There is still no dashboard control submitting `/v1/routing/preview`; preview calls here are HTTP supplements. This file-backed application reports `write_available=true`, so forced read-only, read-failure and filesystem-persistence-failure Settings states were not exercised. Failed/interrupted SSE delivery, native process-restart continuation replay, installed-wheel/Python 3.12 acceptance and real upstream generation remain outside this native run. Parent-owned full gates are not claimed as this tester's results.
