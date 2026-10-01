# Frontend test baseline

Recorded before adding browser configuration or tests on the current dirty worktree. Existing changes in `frontend/src/`, `frontend/vite.config.ts`, `frontend/package*.json`, backend and other task directories belong to concurrent work; they were not staged or reverted. `git status --short` showed 48 changed/untracked path entries at baseline, including modified `frontend/package.json` and `frontend/package-lock.json`; `frontend/tests/` and `frontend/playwright.config.ts` did not exist.

| Gate | Command | Baseline result |
| --- | --- | --- |
| Lint | `cd frontend && npm run lint` | Exit 0; 4 `react-refresh/only-export-components` warnings in `src/i18n.tsx` (lines 561 and 630). |
| Unit/component | `cd frontend && npm test` | Exit 0; 22 files, 181 tests passed. Vitest 5.0.1. |
| Typecheck | `cd frontend && npx tsc --noEmit` | Exit 0. |
| Build | `cd frontend && npm run build` | Exit 0; Vite 8.3.0, 161 modules. Warning: JS chunk 514.57 kB exceeds the 500 kB advisory threshold. |
| Bundle freshness | `sh scripts/build-frontend.sh --check` | Exit 0: `dashboard bundle is current`. This check followed the baseline build; it is not evidence that the pre-build bundle was fresh. |
| Browser tests | No configured suite or `@playwright/test` dependency | Not run. Temporary browser scripts, if any, are not a formal suite. |

The build emitted into `jev_gateway/static/` per the existing Vite configuration. The generated bundle is not tracked as a task change.

## Stage 1 verification

Installed `@playwright/test` and its Chromium browser engine. The first browser invocation failed because the matching Chromium executable was absent; `npx playwright install chromium` resolved that environment gap. `test:browser` builds the bundle, typechecks browser fixtures/specs, then serves the static build from a dedicated loopback Vite preview process. Playwright registers an automatic context fixture before navigation. It blocks service workers, aborts unknown API paths, non-layout writes and cross-origin requests, and returns synthetic responses for known paths. Only the dashboard shell and local asset URLs pass through to Vite. `reuseExistingServer: false` prevents silently testing an unrelated process on port 4178. The browser never connected to the gateway or an upstream.

Final commands on this worktree:

| Gate | Result |
| --- | --- |
| `cd frontend && npm run lint` | Exit 0; the same four existing `src/i18n.tsx` warnings, no new warnings. |
| `cd frontend && npm test` | Exit 0; 22 files, 181 tests passed. |
| `cd frontend && npm run build` | Exit 0; TypeScript check included. The existing 514.57 kB chunk advisory remains. |
| `cd frontend && npm run test:browser` | Exit 0; fresh build, browser-fixture TypeScript check and six Chromium tests passed. Covers cursor failure/retry while retaining first-page rows, native wheel scroll, keyboard session selection, finite configured-path animation and static reduced-motion state, keyboard movement and real `elementFromPoint` pointer drag without policy writes, and 320px/390px page overflow across three views, two locales and two color schemes. |
| `sh scripts/build-frontend.sh --check` | Exit 0 after the build. |
| `git diff --check` | Exit 0. |

Uncovered in the first stage: desktop/tall viewport matrix, native trackpad gestures, virtualized request-list scroll/focus, delayed detail-response races, read-only/error state variants, full theme contrast checks and backend auth/CSP/package gates. The isolated tests exercise the current uncommitted frontend tree only; they did not certify later CSS relocation or `App.tsx` extraction. After CSS migration and state extraction, the same six browser checks were rerun and passed; that confirms only those existing scenarios. Hook-level activity timer/401 behavior, session/detail race orchestration, theme read/write races, desktop/tall layouts and backend auth/CSP/package gates remain uncovered. Playwright artifacts go under the ignored `frontend/node_modules/.cache/playwright-results/`; an earlier `frontend/test-results/` artifact was removed after verification.

## Stage 1 boundary

Add a dedicated Playwright config, synthetic fixture API, and browser specs under `frontend/tests/`, plus the browser script/dependency in `frontend/package*.json`. The server uses a dedicated loopback Vite port with `reuseExistingServer: false`; every non-static request is either fulfilled by a synthetic handler or aborted. No app CSS, state, API, monitoring or backend code changes are part of this stage. Browser failures in the present UI are recorded rather than patched outside this boundary.
