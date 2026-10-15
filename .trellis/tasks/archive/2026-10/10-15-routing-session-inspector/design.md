# Session inspection and routing evidence design

## Change boundary

The current gap lives in the request-scoped classifier/strategy evidence and writer-owned dashboard queries, followed by the monitoring UI. Repairing reason text only in the browser would leave failures indistinguishable and history inaccessible.

This is a multi-seam change with two dependent component deliveries. Backend owns the persistent evidence/API contract (classification, rule termination, history and synthetic diagnostics); frontend owns the consuming interface. Splitting classification storage from history into concurrent writers would overlap `records.py` and `dashboard.py`, so the backend remains one component owner. Each stage hands off its source diff and validation before the next writer starts. Parent integration and independent checks follow both handoffs.

## Backend contract

- Preserve `DecisionMaker.evaluate` compatibility with existing injected/fake makers. Add a richer immutable evaluation result or optional capability that carries a result plus safe evidence even when classification fails. A compatibility helper can describe old makers as success or unavailable without inventing transport detail.
- Evaluation evidence is local to one call. Never retain a mutable shared `last_error`. Attempts retain configured provider ID, closed status/reason codes, nullable HTTP status and duration; accepted typed answers contain configured question/criterion IDs only. Raw response text, exception prose, URLs with secrets and prompts are excluded.
- Strategies annotate manual/cached bypass, successful match (one-based rule number), successful no-match, and failed evaluation fallback. Keep `defaulted` as the independent global default-model signal. Strategy resolution source is recorded when known; historical unknown stays unknown.
- Carry evidence through `StrategyOutcome`, engine Decision and existing `signals_json`, using strict safe projection. Preserve adapter replacement and selected-provider failover contracts. Evidence persistence remains best effort.
- Resolve historical explanatory context by recorded config hash using a bounded safe projection of the applicable strategy/options/policy/default-model IDs. Do not project provider secrets, arbitrary provider params or the entire catalog.
- Add an explicit history scope or endpoint while leaving no-query live listing compatible. Historical list/detail run via the record writer, use bounded SQL/cursors and return metadata only in session rows. Enrich actual current-memory presence separately; never fabricate session pins or call retained history live activity.
- An explicit decision connection test uses saved/candidate provider settings through existing credential ownership and auth, synthetic state/questions, bounded timeout and safe status. It does not change global enablement or files, and never submits chat generation. Do not trigger it during rendering or ordinary reads.

The backend handoff must freeze exact API fields, statuses, history selector/cursor semantics and focused test receipts in `research/backend-contract.md` before frontend mutation begins.

## UI design

Use the existing UI adapters, Lucide family, system fonts, runtime theme palette and sole stylesheet entry. No new framework/dependency is needed.

Monitoring makes session inspection visible directly, with provider observations secondary. Keep existing route activity/distribution meaning while giving the session workspace visual priority.

- At desktop width, a compact session rail accompanies a request list and a selected-request reading area. Use readable vertical hierarchy; at 1280px content width a three-region composition is possible, but a two-column rail plus combined request/content panel is preferable if three regions compress message reading. Choose based on actual browser measurements rather than fixed decorative columns.
- Session rows summarize client/session identity, recency, requests, last model and fallback state. Metadata-only scope filters switch current versus retained history; no prompt search or invented titles.
- Request rows show time, concise routing explanation, label/model, independent reply status and available usage. They remain compact and selected-request details render outside each list row. Raw JSON is a final disclosure.
- The selected request opens with one plain-language reason and distinct classification/rule/model/outcome facts. Use a static evidence-driven decision path; any retained playback remains explicitly illustrative and secondary.
- Context reading is a snapshot of the chosen request, with role-aware message layout, code/long-text wrapping and folded system/tool details. A snapshot selector never appends overlapping message arrays. Explain the latest-response capture limit.
- Show accepted answers, rule conditions/selection from the recorded configuration, model candidate evidence and missing evidence explicitly. A successful reply must not hide a failed classifier.
- Keep decision readiness visible near relevant controls, using existing enablement actions and an explicit synthetic test with local pending/result ownership.
- At narrower widths, details stack or use a back action preserving selection/scroll. Keyboard focus stays in mounted/visible content. Empty/error/loading and readonly states have purposeful space and direct recovery.

## Compatibility and safety

- Existing live endpoints, `defaulted`, strategy selection, pooling and failover retain their meanings.
- Historical explanations use immutable recorded fields/configuration. Missing legacy evidence remains unknown, with safe legacy reason interpretation only where deterministic.
- Cursors remain scope/session bound and authenticated. Page append deduplicates stable IDs. Current-session counts continue walking live pages rather than counting history.
- Preserve authentication generation, stale operation cancellation and GET-only recovery. Do not persist credentials or content in browser storage.
- Source work does not modify the operator HOME or restart/update the installed service. Candidate installation is a later operational step after reviewed source and artifact validation.

## Validation and rollback

Use deterministic mocked classifier outcomes for exact rules; real model variability is not a regression oracle. Add writer/HTTP contract tests, concurrent call isolation and legacy-row coverage. Browser synthetic fixtures cover dense content, error paths, history selection, native keyboard and responsive views. Existing source/fixture gates remain valid unless a documented presentation contract is intentionally superseded here.

Rollback is the scoped source diff plus regenerated ignored assets. No operator schema/config rollback is expected because source testing is isolated. Do not reset unrelated files or replace lockfiles.
