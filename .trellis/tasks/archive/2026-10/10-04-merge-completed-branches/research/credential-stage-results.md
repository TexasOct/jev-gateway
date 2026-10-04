# Credential-stage code results

Temporary commit `79717f0` combines release integration commit `48062bb` with credential tip `4acfba2`. The parent verified and staged 11 backend, 16 frontend, and 13 documentation/spec/workspace paths, then checked zero unresolved paths, zero unstaged changes, and staged whitespace before the ordinary signed commit. Main remains at its original baseline.

## Verified behavior

`ManagementSetup.configure()` translates the legacy `{expected_revision, api_key}` request into the shared `ProviderConfiguration.gateway_credential()` transaction. Preparation, activation, restoration, revision checks, and safe responses are retained. New writes use `credentials.json`; existing reference names are preserved, with `JEV_GATEWAY_API_KEY` used only when a new reference is needed.

Setup can inspect a declared gateway reference whose value is absent for CLI repair. Runtime startup and reload still reject a missing declared gateway key, so the repair path does not disable serving authentication. Both HTTP entry points share listener, peer, Host, Origin, and forwarded-header checks. Existing credential files retain their bytes and modes during initialization; absent files use the packaged protected template.

Both frontend write methods use the memory credential activation guard after successful responses. Reads can retry after an authentication change; writes are not replayed. Setup accepts 16 to 8192 visible ASCII characters with no whitespace. Its form clears the submitted key before awaiting the POST, and failed requests do not activate it. Connection admission and pending guards remain.

Global-default operations, setup readiness, provider mutations, stream evidence, and the version `0.1.1` lifecycle are retained. Both translation catalogs have 455 matching keys and no duplicates. Browser fixtures and credential tests were adapted to initialize through setup and then use provider management for rotation.

## Evidence

- Backend focus: 349 passed in 14.93 seconds. It covers setup, credentials, live HTTP, managed CLI, initialization/install-state, global defaults, provider management, empty-tag defaults, and stream evidence.
- Pyright: zero errors and warnings.
- Frontend unit suite: 304 passed across 36 files.
- Frontend lint: exit zero, four existing Fast Refresh warnings.
- Application and browser-test TypeScript checks: passed.
- Vite build: passed, with a bundle-size warning.
- Parent marker scan and staged scoped whitespace check: passed for all 27 owned paths.

Logs are in the original root's `.trellis/.runtime/completed-main-merge/`, including `backend-focused-final.log`, `backend-pyright.log`, `backend-resolution-check.log`, and the `credential-frontend-*.log` files. `credential-frontend-result.md` contains the exact frontend changed-path list.

Documentation verification confirms exact README heading/code/link parity, 81 resolving relative links and anchors, and all 16 complete source journal-section comparisons. The repaired journal has six complete sessions and 215 lines, with a matching workspace index. The only two missing JSONL targets point to the provider-identities spec arriving from the later icon tip; the final gate must resolve them. No integration-completion session was added at this stage.

Browser execution, installed-wheel smoke, and the full combined gate remain pending until the select and icon tips have also been integrated.
