# Explain routing decisions and inspect retained sessions

## Goal

Make session inspection the main monitoring workflow, with readable request content and an immediate explanation of why each request chose its model. Distinguish classifier failure, unmatched rules, global-model defaults and reply failures without requiring JSON inspection.

The user approved the reviewed proposal with "开始实现" and then emphasized appropriate UI design. The operator routing configuration was already repaired through the existing management API; preserve that repair.

## Confirmed background

- Baseline HEAD is `6fbd3a7` (`v0.1.10`); the source checkout was clean before this task.
- The inspected 30 requests across five sessions all used `decision_matrix:local:fallback` and review/Luna. The historical configuration disabled classification; the selected provider also had `/systemon` instead of `/systemone`.
- Both operational fields are repaired and the live service preview now selects Luna or Sol. The installed distribution metadata is still 0.1.9; this task does not authorize a release.
- `defaulted` means global default-model selection. It cannot identify classifier fallback.
- Session APIs currently require a live in-memory session even when SQLite retains its history. Existing messages are request context snapshots; concatenating snapshots duplicates history, and a final assistant reply may be absent.

## Requirements

- R1: Record safe per-request classification evidence, including accepted answers, provider attempts, disabled/unconfigured/missing-credential states, HTTP status, timeout and invalid-response/answer outcomes. Preserve exclusive selected-provider semantics and best-effort recording.
- R2: Expose distinct rule match, valid-unmatched default, classifier failure fallback, global-model default, literal default label, manual selection and session reuse. Keep reply success/failure independent. Old evidence remains explicitly incomplete.
- R3: Provide bounded, authenticated historical session listing and detail after process restart/eviction, with content-free list metadata and an honest distinction from current memory state. Preserve existing live endpoint defaults and live-only distribution semantics.
- R4: Prioritize UI: a direct session entry, compact selectable request timeline, and a spacious detail pane showing a plain-language reason before technical evidence. Display classification, rules, model choice and outcome independently.
- R5: Display the selected request's recorded conversation/context snapshot by role, with folded system/tools and readable code/long text. Report uncaptured, missing or truncated content accurately; do not stitch snapshots into a fabricated transcript.
- R6: Explain decision readiness near the strategy/provider controls. Provider selection does not imply global enablement. Provide an explicit bounded synthetic decision connectivity test, with safe status and no configuration or generation mutation.
- R7: Preserve paging, focus, locale/theme conventions, authentication suspension and stale-response ownership. Use recording-time configuration/evidence rather than today's catalog to explain old requests.
- R8: Keep the desktop monitoring content bounded to 1280px; adapt to 320/390px without horizontal page overflow. Give conversation/detail reading adequate space instead of nesting JSON and a large trace in fixed 360px cards.

## Scope constraints

- Retain current routing rules, model pools, credentials and cache behavior. No automatic generation retries.
- No new response-body capture policy, native-client session-file scanning, full-text indexing, dependency/theme-system replacement or new release.
- Preserve the running operator service and repaired runtime files during source development. Synthetic fixtures own test writes; real runtime records/content never enter fixtures or reports.

## Acceptance Criteria

- [x] Fixed classifier answers select draft/Luna and engineering or ultra/Sol; failure and valid-unmatched paths remain distinct.
- [x] Disabled, missing provider/key, HTTP 401/404/429, timeout, invalid JSON/envelope and invalid choice have safe distinct evidence. Concurrent evaluations cannot overwrite each other's evidence.
- [x] New evidence survives record writes and API projection. Old rows remain readable and do not acquire invented timings, attempts or answers.
- [x] A retained-only session remains accessible after restart/eviction, with signed cursor bounds, authorization on every page and no list-body leakage.
- [x] The main monitoring experience exposes sessions and request reasons directly; classification fallback remains visible even when the upstream reply succeeded.
- [x] A large selected context is readable without duplicated histories. Missing final replies, uncaptured content, loading, empty and failed states remain explicit.
- [x] Decision diagnostics use synthetic content, preserve files, expose no raw upstream prose/secrets and never call a generation model.
- [x] Desktop and 320/390px UI, both locales/themes, keyboard/focus, paging and stale replies pass relevant browser checks. Keep screenshots as authored/test evidence, separate from operator content.
- [x] Backend pytest/Pyright and frontend lint/test/build pass; independent review accepts the integrated result.

## Approved reference

- `research/approved-proposal.md` preserves the reviewed proposal and Magpie/official API references.
- Product code implementation is approved by the user's subsequent "开始实现" message; no further phase approval is required for this unchanged scope.
