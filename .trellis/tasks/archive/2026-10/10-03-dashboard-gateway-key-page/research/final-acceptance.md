# Standalone connection page acceptance

The gateway key form is now a dedicated page within `/dashboard/`. The dashboard navigation and business panels mount after monitoring and theme validation succeeds. Password input supports Enter, empty values are rejected locally, a synchronous guard prevents duplicate attempts, and pending validation keeps the page visible. Incorrect keys and failed network reads retain the draft for retry. Later 401 responses clear the module credential, stop activity polling and return to the page.

Keys remain in JavaScript memory through the existing setCredential path and retain trimming compatibility. The browser stores only locale preference; tests inspect URL, cookies, localStorage and sessionStorage. Keyless gateways retain anonymous access after their initial reads succeed. The feature introduces no authentication endpoint, client router, persistent login, dependency, stylesheet or backend product change.

## Acceptance mapping

| Criterion | Evidence |
| --- | --- |
| AC1 | AppShell early return; throwing-proxy structural canary; absent navigation/header/panels during failed and delayed reads |
| AC2 | Password/Enter assertions; blank input request count; deferred theme validation; duplicate form submission count and trimmed Bearer |
| AC3 | Incorrect-key and network-abort retry; activity 401 followed by unchanged request count; anonymous navigation through all four views |
| AC4 | Bearer/header assertions; post-login reload with no Authorization header; locale-only localStorage, empty sessionStorage and cookies, credential-free URL |
| AC5 | English/Chinese × 1280/320px × light/dark geometry/focus checks; localized existing errors without another probe; four screenshots inspected by parent |
| AC6 | Isolated gates below; all 15 dedicated connection browser cases pass |

## Final isolated gates

Validation ran on `feat/dashboard-key-page` in `/Users/texas/Workspace/jev-dashboard-key-page`, based on `16929b38d780bd04385fecb9aaa76d824acf04c7`. Exactly five authentication source/test files and five owned shared-file hunks were transferred from the shared checkout. Concurrent strategy-canvas code, tests, mock changes and documentation were excluded.

| Command | Result |
| --- | --- |
| npm --prefix frontend ci --no-audit --no-fund | Exit 0 |
| uv sync --offline --all-groups | Exit 0 |
| npm --prefix frontend run lint | Exit 0; zero errors, four existing Fast Refresh warnings |
| npm --prefix frontend run test | 211 tests in 31 files passed |
| npm --prefix frontend run test:browser -- --workers=2 | 101 passed in 34.8s; retries 0; includes TypeScript and Vite build |
| sh scripts/build-frontend.sh --check | Exit 0 |
| uv run pytest -q | 755 passed in 41.96s, after browser completion |
| uvx --offline pyright | Zero errors, warnings or informations |
| git diff --check | Exit 0 |

Backend tests use the isolated conftest runtime and dummy credentials with dotenv disabled. Their freshly built dashboard checks cover shell privacy, CSP, immutable hashed assets, no-store HTML and Bearer-protected data access. Browser requests use fail-closed synthetic local fixtures. These results establish source/mock acceptance; they do not establish a new installed or public release.

## Review and visual checks

The parent found and reworked stored-language feedback, a fixed-user screenshot path and premature remount access. Built-in error keys now translate through the current locale; arbitrary network/API error strings stay intact. Initial access always remains unresolved until validation succeeds.

All eight geometry cases measured settled enabled-button text at opacity 1. Light uses rgb(255,255,255) over rgb(41,88,214), 6.07:1; dark uses rgb(16,22,31) over rgb(106,134,210), 5.15:1. Earlier gray measurements were transition frames. Tests wait for color animations to finish. The existing palette and Button primitives meet the 4.5:1 requirement without a style change.

The parent inspected English desktop and Chinese 320px screenshots in both schemes. The form, language selector, focus outline, feedback and submit button fit without horizontal overflow. Screenshots use masked synthetic credentials.

## Retained attempts and runtime scope

The first shared four-worker browser run had a routing-drawer visibility failure; the original log remains. Isolated review attempts also retained failed transition-frame measurements before the final measurement correction. Original evidence was not overwritten or relabeled as passing. Final acceptance uses isolated-gates/results.json and review.json.

Private evidence resides under `/Users/texas/.cache/jev-dashboard-key-page/`: implementation/, isolated-gates/, isolated-screenshots/, isolation/ and runtime-final.json. Screenshot and contrast evidence files are mode 0600; their private directories are 0700. Logs contain synthetic test data, and no operator credentials were disclosed.

The actual instance remains under `/Users/texas/.jev-gateway`; its `.env` and models.json fingerprints match their pre-task values. `.env` is mode 0600, PID 40853 still exists and loopback port 8000 remains open. This task performed no real generation, deployment, runtime configuration reset, key rotation or release replacement. Generated static assets remain ignored. Shared strategy-canvas work and its branch/index are preserved; this task's local commits stay on `feat/dashboard-key-page`.
