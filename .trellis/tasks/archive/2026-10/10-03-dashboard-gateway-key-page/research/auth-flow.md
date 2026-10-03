# Standalone gateway connection page

The user explicitly authorized task creation and implementation after the proposed scope: an independent key page, successful validation before dashboard admission, failures on the page, 401 return, existing style/locales and memory credentials. This is a frontend-only task on `feat/dashboard-key-page`, based on current `main`. The running public installation is a separate uv tool; its directory and .env have been identified to the user and will remain unchanged.

## Observed owners

- `frontend/src/app/App.tsx` owns the key draft, needsKey, errors, API orchestration and unauthorized callbacks. Current `connect` clears draft and needsKey before running monitoring/theme loads. This admits dashboard UI while authentication is unresolved.
- `AppShell.tsx` currently renders an inline connect Card plus the same header/nav/monitoring or settings/editor subtree. It should return a dedicated full-page presentational view while needsKey, with no dashboard subtree.
- `shared/api/client.ts` is the sole credential writer. It attaches Bearer and no-store on existing endpoints and never persists the key. Keep trim compatibility. No new auth endpoint or browser storage is needed.
- `useMonitoringData.loadMonitoring()` waits for providers/strategies/sessions/policy via allSettled, traverses sessions and rethrows any 401 or primary failure. `useDashboardTheme.loadTheme()` also throws current failed reads. `App.run` catches errors and returns void; put dashboard admission only inside successful work after awaited loaders, never after run resolves unconditionally.
- `onUnauthorized` clears credentials, shows the key view and stops route activity. Route activity is disabled by needsKey. Preserve this and verify actual cessation of polling on return.
- Hooks may still hold old dashboard data in memory; it must not render on the connection page. Keep request ownership in App/hooks, not in the presentational view.

## Change boundary

1. Add a view-owned ConnectionPage with typed props, existing Button/Card and palette utilities, password label, pending/error feedback and locale access. No new stylesheet, assets, dependency, account system or router.
2. Update AppShell to render that page exclusively while unauthenticated, removing the duplicate inline card. App supplies pending state and existing callbacks. Preserve compatible connected-shell props when practical.
3. Serialize initial validation and manual submissions; do not allow initial-probe/manual races or duplicate submits. Keep console hidden until success, clear the key draft when connection succeeds, and make failures retryable. Preserve keyless gateways, which current anonymous read fixtures admit normally.
4. Add only required locale text and meaningful tests. Avoid changing provider, routing, monitoring or theme behavior beyond the auth-view boundary.

## Existing verification

- `src/app/AppShell.test.tsx` statically renders the connected shell and bounds nav labels. No current App unit file. `shared/api/client.test.ts` asserts Bearer/no-store and resets credentials.
- `tests/browser/settings.spec.ts` covers theme-write 401, reconnection and locale-only storage.
- `tests/browser/provider-management.spec.ts` covers provider-read 401, expects a Connect heading and hides synthetic private errors. Preserve or deliberately update the expected heading to the new documented copy.
- `tests/browser/fixtures.ts` and `tests/setup/mock-api.ts` install fail-closed mocks for port 4178 before navigation. Existing GETs succeed anonymously; preserve that for all normal dashboard tests. Add per-test auth interception rather than requiring every existing browser flow to log in.
- `tests/fixtures/provider-browser.ts` is a separate anonymous fixture. Do not globally add auth requirements or relax traffic isolation.

## Required evidence

Check standalone screen/no nav/business panels, blank input/no request, Enter/password/pending, duplicate submit count, delayed validation/no premature admission, invalid key and network failure/retry, subsequent 401/no polling, trimmed Bearer, locale-only localStorage/empty sessionStorage/cookies/no credential URL, and anonymous admission. Test both locales at desktop/320px and both system schemes, keyboard focus and overflow. Capture synthetic-key screenshots for visual inspection. These are source/browser tests with mocked endpoints, not public installation or real provider evidence.

Run frontend lint, full unit, build/type checks, full browser suite and `scripts/build-frontend.sh --check`. A focused gateway dashboard-serving/CSP/static-privacy regression is appropriate for the generated bundle; no backend product change is planned. Generated `jev_gateway/static` stays ignored. Actual runtime state and config fingerprints are stored privately outside the repository, with no copied secrets.
