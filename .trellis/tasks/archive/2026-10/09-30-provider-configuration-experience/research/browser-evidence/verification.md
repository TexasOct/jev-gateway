# Frontend browser verification

REWORK. The full 4178 browser gate failed with 65 passed and 3 failed out of 68. All 31 Provider tests passed in that run. The three failures reproduced once without modifying product or tracked test sources.

| Command | Exit | Result |
| --- | --- | --- |
| `npm --prefix frontend run test:browser` (repo root) | 1 | Build and browser TypeScript stages passed; 65 passed, 3 failed, 0 skipped; Playwright 33.9s, complete command 36.694s |
| `npx tsc -p tests/tsconfig.json` (frontend) | 0 | No diagnostics; 0.860s |
| `npx playwright test -c playwright.config.ts tests/browser/monitoring.spec.ts:189 tests/browser/monitoring.spec.ts:206 tests/browser/responsive.spec.ts:8 --workers=1` (frontend) | 1 | Single reproduction: 0 passed, 3 failed; 38.623s |
| `npx playwright test -c /tmp/jev-provider-browser-evidence/capture.config.ts` (frontend) | 1 | 4 passed, 1 temporary capture helper failure; 3.408s |
| `npx playwright test -c /tmp/jev-provider-browser-evidence/capture.config.ts --grep 'unknown metadata remains blocked'` (frontend) | 0 | 1 passed after scoping temporary selector to the selected model; 1.521s |

The existing browser failures are:

- `monitoring.spec.ts:194`: `details[data-dashboard-settings]` is absent. The expected refresh/animation controls are not present in the current shell. This is an unresolved test/UI contract mismatch; this run does not establish whether it predates the task.
- `monitoring.spec.ts:211`: the expected `Refresh activity` button is absent; clicking it reaches the 30000ms test timeout. The shell currently exposes `Refresh`.
- `responsive.spec.ts:8` fails fixture teardown at `fixtures.ts:14`: six `GET /v1/provider-configuration` entries are unexpected. `tests/setup/mock-api.ts` has no handler for that path. Requests were blocked by the mock guard and did not reach a gateway.

Full logs and exact command/exit/count JSON are saved beside this document. `failure-excerpts.txt` contains bounded excerpts for the three failures.

Five unique Provider evidence scenarios were verified on 4182, producing these six full-page images after initial load:

| File | Dimensions | Representation |
| --- | --- | --- |
| `01-library-1280-en-light.png` | 1280x900 | Library, local DeepSeek artwork, attribution, keyboard focus |
| `02-custom-1280-en-light.png` | 1280x900 | Custom form, advanced configuration, Cloud icon choice |
| `03-custom-320-zh-dark.png` | 320x1407 | Chinese custom form in dark mode |
| `04-metadata-unknown-390-en-dark.png` | 390x2597 | Unknown fields, expanded source evidence, disabled import |
| `05-metadata-conflict-1280-en-light.png` | 1280x1800 | Conflicting tools/input price, expanded source review, disabled import |
| `06-readonly-first-entry-390-en-dark.png` | 390x900 | Read-only configuration on first entry |

Every capture has document and body width equal to the viewport. DeepSeek loaded from `/dashboard/assets/deepseek-Bl9-59Mi.svg` and retained its natural aspect ratio. Tab produced a visible 2px focus outline. Enter opened library/custom controls and selected an icon. Escape opened the discard confirmation; dismissal preserved the draft and acceptance restored Add provider focus. Native confirmation responses used Playwright's dialog API; OS dialog key handling remains unverified. Add provider was disabled while the first configuration read was pending; Add/Edit/Find/Delete remained disabled after the read-only result loaded, while provider-kind switching stayed enabled.

The conflict scenario wraps the existing Provider mock fixture's fulfillment with a second contradictory applicable source. It performs no HTTP fetch. Unknown/conflict fields stayed blank, and import remained disabled. Capture fixture writes and validations were zero. `keyboard-confirmation.json`, per-image JSON, and `screenshot-manifest.json` record the assertions, geometry and requests.

The temporary helper failure was a strict selector match for both hidden batch Tools and model Tools. Only the temporary script changed, and only that scenario reran. Both attempts are retained in the logs.

`source-preservation.json` confirms unchanged SHA-256 hashes for 110 frontend source/test/configuration files. No commit or task status changes were made. `server-cleanup.json` records no listeners on 4178 or 4182. All API traffic used mock fixtures; capture requests had no external origins. Python, packaging and DESIGN checks remain main-owned.
