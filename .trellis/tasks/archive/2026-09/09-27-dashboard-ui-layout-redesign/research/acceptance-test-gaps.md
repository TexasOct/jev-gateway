# Acceptance criteria vs. current automated tests

Acceptance review against the integrated tree. The browser suite uses synthetic data and has 22 Chromium tests. No live gateway or upstream was contacted.

## Summary

The formal browser suite fails closed for unexpected requests and writes. It covers responsive overflow at 320/390/1280/1430×2511 in both locales and schemes; session and request pagination; keyboard focus retention; preview selection boundaries; detail loading/error/unavailable/empty/unknown states; mobile table pseudo-labels; configured-flow styles/reduced motion; policy validate/warning acknowledgement/apply/confirmed reset; theme save/reset; activity failure/retry; and canvas hit testing/drag/Fit. The strategy-route overview’s explanatory copy and compact tab bar were shortened/restyled from the attached design reference and passed the same responsive/browser matrix.

Remaining gaps include hook-level activity 401/timeout/visibility and stale-response behavior, theme read/write concurrency, route-trace cancellation across every selection/draft/unmount transition, inspector reachability at every matrix cell, full advanced-editor keyboard traversal, screenshot-based visual review, and all connection/marquee/multimove gestures.

## Criterion map

| Explicit PRD acceptance criterion | Existing test evidence | Status / remaining gap |
|---|---|---|
| Desktop, 390px and 320px; EN/ZH; light/dark; all three views; no document overflow; canvas fills workspace and controls/inspector are reachable. | `responsive.spec.ts` and `appearance.spec.ts` cover 320×820, 390×820, 1280×900 and 1430×2511, both locales/schemes, all views. `routing-editor.spec.ts` measures canvas/toolbar, node size, Fit, pointer hit and drag. The revised route heading/tab bar is included in the same overflow matrix. | Partial. Inspector reachability is not asserted at every matrix point. No screenshot or visual-diff review is recorded. |
| New user identifies preview/current session, known route, latest recorded result and next action; loading, unavailable, empty, error and unknown remain distinct; source evidence remains reachable. | `monitoring.spec.ts` verifies the preview does not select/fetch detail; selected detail loading, failure, unavailable, empty and unknown states; session/request paging; scrolling; and focus retention. `RouteTrace.test.tsx` covers evidence-stage labels and playback structure. | Detail states and preview are browser-tested. Raw-source disclosure keyboard reachability and route/result interpretation without raw IDs remain unverified in the browser. |
| Configured policy diagram shows ordered first-match branches, fallback, labels/models and draft vs applied; no percentages, traffic counters or fake status. | `ConfiguredRouteFlow.test.tsx` verifies first-match order, unmatched/fallback, OR conditions, pool membership, changed draft and absence of metric fields. Browser checks computed active/unmatched path styles and motion. Policy lifecycle test verifies the pre-apply draft and the mock’s applied configuration after acknowledged PUT and confirmed DELETE reset. | Policy projection/state transitions are covered. Browser does not scan every rendered label for prohibited percentage/traffic/provider-health claims. |
| Branch selection has short explanatory motion; reduced-motion equivalent is complete/static with same text; no policy PUT due to selection/playback/layout. | Browser checks a finite one-iteration trace, active/unmatched stroke styles, static reduced-motion path and copy, no configuration writes from selection, and separate layout-only writes. | Core motion/reduced-motion behavior passes. Cancellation on inspector close, draft change and unmount remains unverified. |
| Canvas gestures/keyboard/inspector/advanced controls and validate-review-acknowledge-apply-reset continue working; layout save never updates policy overlay/hash/version. | Browser verifies keyboard node move, real pointer drag and `elementFromPoint`, Fit/toolbar, layout-only writes, validate before explicit apply, warning acknowledgment gating, payload equality, and confirmed reset. Pure canvas/layout race tests and focused gateway auth/isolation tests cover math, rollback, and policy hash/version boundary. | Browser lifecycle/write separation is covered. Supported connection editing, marquee/multimove, and full inspector/advanced drawer keyboard traversal remain unverified. Backend test establishes policy snapshot/hash/version isolation. |
| Tailwind is primary styling; residual CSS limited/documented; seed-derived variables and `data-scheme`; no remote runtime assets. | `theme-contract.test.js` checks the exact CSS owner file set, sole import, Tailwind imports, no Preflight, `data-scheme` variant, palette roles and protected geometry/list dimensions. Palette tests cover seed/math; gateway shell tests cover CSP/cache/auth. Theme browser tests exercise synthetic save/reset payloads and notices. | CSS/structural contract and theme writes are covered. Page reload/system-scheme persistence and full browser contrast matrix remain unverified. |
| Frontend checks, bundle freshness, relevant gateway/security tests, isolated browser matrix with real hit-testing, virtual scroll/focus and reduced motion. | Current final rerun: lint, 186 unit tests, build, 22 browser tests, bundle freshness, Pyright, 24 focused gateway tests; full Python suite 565 passed; `uv build` passed. | Focused gateway selection deselects 67 tests. Hook-level activity visibility/timeout/401 and stale-response races remain unverified. |
| Exact file tree/imports/test discovery. | Exact source and test tree inspected. Static scans show exactly nine CSS files, `main.tsx` as the application CSS importer, no legacy source folders, and no cross-module relative imports. Browser fixture/spec names match the requested split. | Tree inspected and verified. A dedicated whole-tree test is not present; the CSS contract test pins the stylesheet list and entry. |

## Final verification evidence

- `cd frontend && npm run lint`: exit 0, 4 Fast Refresh warnings in `src/shared/i18n/index.tsx`.
- `cd frontend && npm test`: 25 files, 186 tests passed.
- `cd frontend && npm run build`: passed; generated JS is 541.58 kB minified, above Vite’s 500 kB advisory threshold.
- `cd frontend && npm run test:browser`: 22 Chromium tests passed using isolated Vite preview and synthetic API fixtures only.
- `sh scripts/build-frontend.sh --check`: dashboard bundle current.
- `uv run pytest -q tests/test_gateway.py -k 'dashboard or canvas_layout or configuration'`: 24 passed, 67 deselected.
- `uvx pyright`: 0 errors, warnings or information.
- `uv run pytest -q`: 565 tests passed.
- `uv build`: passed.
- Frontend-scoped `git diff --check`: passed. The staged index has unrelated whitespace findings in `button-variants.ts` and two browser spec files; those staged versions are outside this task’s unstaged edit scope and were not rewritten.

## Synthetic API isolation

`playwright.config.ts` runs a dedicated static preview with `reuseExistingServer: false`. `browser/fixtures.ts` installs the central `mock-api.ts` before navigation. Cross-origin, unknown API, and unapproved write requests abort and are recorded as unexpected. Canvas-layout PUT is permitted for gesture tests. Policy/theme writes require per-test `allowedWrites` entries; the shared mock records their method/path/body and replays applied configuration state on subsequent GETs. Detail/provider overrides, delayed detail reads, activity failures and cursor paging are handled centrally. No test launches a gateway, sends upstream requests or uses real customer data.
