# Model field ownership delivery

Implemented against private snapshot `f22fc181fcf7a7e009e3273ea406b0d07bfa7541`
in an isolated worktree. Independent acceptance remains separate.

Provider configuration read, command preview/apply, and gateway credential
responses now project `routing_overlay_fields` from their already locked overlay
snapshot. Only `tags` and `priority` may appear. Empty means baseline ownership.
The existing HMAC revision inputs remain unchanged. Runtime profiles and stored
model records do not receive the response property.

Model dialogs use current configuration ownership while retaining the frozen
opened model and every draft field. Baseline routing values are editable;
workflow fields are read-only and omitted from save payloads. A reload that
protects a differing draft field blocks save until the operator explicitly adopts
that field's current workflow value. Other draft fields remain intact. Missing
ownership metadata uses the conservative read-only compatibility behavior and
explains that ownership is unavailable.

Restore previews include manual ownership even when the source value is equal.
Selecting restoration preserves the value and source records and writes source
ownership on confirmation.

Verification:

- Backend: 234 tests passed across admin model contracts, provider configuration,
  provider regressions, management API, transport credentials, and credentials.
- Frontend: 353 unit tests passed across 45 files.
- Chromium: 17 ownership/workspace tests passed, including four ownership
  combinations, negative priority, protected-field omission, conflict
  reconciliation, removed-target draft retention, same-value source restoration,
  and existing 320px/1280px dialog checks.
- Frontend production build and application/browser TypeScript checks passed.
- Python type check: zero errors or warnings for `provider_config.py`.
- ESLint: zero errors; four existing Fast Refresh warnings in i18n index.
- Build: existing bundle-size warning. `git diff --check` passed.

No shared full-app fixtures, auth/draft manager, App, shared Dialog, supplier
setup forms, or routing canvas were edited. No commit, push, merge, main-branch,
or shared-index operation was performed.
