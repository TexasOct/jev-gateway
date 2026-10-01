# Strategy-first monitoring plan

## Context and coordination

- [x] Reused this existing task and started after explicit user approval.
- [x] Read PRD, design, implementation plan, lifecycle and edge-case research, geometry research, sibling task boundaries, backend/frontend specs and shared guides before implementation.
- [x] Inspected current `git status`, task pointers and dirty-path ownership. Preserved unrelated pre-existing dashboard changes.
- [x] Coordinated a single writer for shared `App.tsx` and `api.ts` integration with `09-28-dashboard-shell-visual-system`; locale additions were not needed.

## Backend activity instrumentation

- [x] Implemented bounded process-local in-flight request tracking by immutable destination, with stream classification for diagnostics and a content-free projection.
- [x] Registered after route selection and before upstream submission. Non-stream requests finish after the synchronous upstream call; streams finish on success, error, cancellation/disconnect and response-level cleanup. Cleanup is idempotent.
- [x] Added bounded `GET /v1/routing/activity` with per-path in-flight request/stream counts and no request/session identifiers. Activity is independent of session TTL and retained evidence.
- [x] Activity reads work during upstream calls. Process-local scope is documented; capacity degrades safely and shutdown clears registry state.
- [x] Tests cover request membership, no-session requests, authentication/privacy, stream lifecycle and evidence-storage independence.

## Frontend and integration

- [x] Shell owner added typed activity API and `App.tsx` polling integration. Old/invalid/incomplete activity leaves paths static and reports unknown/unavailable.
- [x] Preserved latest-live-session counts and cursor/error/storage contracts. Activity-only paths remain separate from session counts and use request-time destinations.
- [x] Resolved built-in configured pools from the authenticated policy catalog (explicit IDs and tag selectors), leaving custom kinds unavailable; retained removed-strategy in-flight paths under their original names.
- [x] Built measured source-to-strategy and strategy-to-model SVG/CSS connectors for responsive layouts. Only verified exact model paths receive animation; unknown activity uses a neutral marker.
- [x] Added non-overlapping activity-only polling every 3 seconds while monitoring is visible and authenticated, with timeout, visibility/unmount/auth cancellation and stale-response guards. It does not reload session/provider/detail data.
- [x] Reject stale snapshots, detect process changes and provide pause/reduced-motion states in both locales.
- [x] Used the supplied Magpie image at `research/magpie-route-reference.png` as the visual reference; no account/quota/provider health semantics or pannable canvas were introduced.
- [x] API activity reads are separate from policy and replay operations; activity payload is content-free and provider-evidence failures remain independent.

## Verification and finish criteria

- [x] Focused tests cover active-request membership, exact destination matching, concurrent requests, response validation, activity-only rows and connector geometry.
- [x] Response-level cleanup handles cancellation/disconnect and idempotent completion; gateway stream cases pass.
- [x] Process-instance changes suppress motion until explicit full refresh; activity-only retry does not clear the warning. Unknown targets are not treated as active model paths.
- [x] Documented the additive activity endpoint and process-local scope in `docs/http-api.md` and the dashboard backend spec.
- [x] Final verification after the in-flight-only activity change: `uv run pytest -q` passed (601 tests), `uvx pyright` passed, `uv build` passed, frontend tests passed (181), frontend lint passed with 4 existing `i18n.tsx` Fast Refresh warnings, frontend build and bundle freshness passed, and `git diff --check` passed.
- [x] Synthetic browser checks against mocked APIs at desktop and 390px in both locales/schemes, reduced motion and configured-static versus active paths. SVG endpoints matched node edges and width stayed within viewport. The request-in-flight-only state showed two active paths, remained active over elapsed time, resumed after navigating away and back, and rendered static markers under reduced motion. 320px layout and connector geometry were checked before the semantics-only update; the DOM/layout code did not change.
- [x] Reviewed changed ownership and preserved unrelated pre-existing dashboard work. Generated static output remains untracked/ignored and is not included.

## Rollback

Rollback only reviewed monitoring/backend activity hunks. Do not reset, clean or overwrite unrelated worktree changes.
