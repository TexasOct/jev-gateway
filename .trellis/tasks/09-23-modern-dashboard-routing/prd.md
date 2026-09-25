# Modern dashboard and visual routing configuration

## Goal

Replace the minimal inline dashboard with a clean operator interface built on a modern frontend toolchain, so an operator can read live gateway observations and change routing precedence and label-to-model bindings by dragging, without editing `models.json` by hand.

## Background

- The current dashboard is `jev_gateway/dashboard.py` at 246 lines: inline HTML, CSS, and JavaScript, read-only, with `GET /dashboard` plus three GET data endpoints (`/v1/routing/sessions`, `/v1/routing/sessions/{id}/requests`, `/v1/routing/providers/summary`). It has no build step and its response headers set `script-src 'unsafe-inline'`.
- `models.json` is the only static routing source. `load_catalog()` reads it, `catalog_from_document()` parses it, and `RoutingEngine` swaps catalogs at startup and through `POST /v1/routing/reload`.
- `task_aware` rule evaluation is first-match-wins in `strategies.task_aware.options.rules` array order (`jev_gateway/strategy/matrix.py:63`).
- Label-to-model binding is tag-based. A label without an explicit `models` list resolves the tag `{strategy}/{label}` against each model's `tags` (`jev_gateway/strategy/policy.py:379`). Rank inside that pool comes from the selection mode with `priority` as tiebreak (`policy.py:463`).
- The overlay design leans on validators that already exist: a rule naming an unknown label, question, criteria value, or selection mode fails in `_validate_options` and `_validate_choice` (`matrix.py:137`, `matrix.py:176`), and a label whose tag matches no model fails in `_validate_policy` (`jev_gateway/catalog.py:744`).
- The repository has no frontend project, no `package.json`, and no color system. The only colors today are the two CSS variable blocks at `dashboard.py:35-36`. Node v24.18.0 and npm 11.16.0 are available.
- `gateway.api_key_env` is absent from both `models.json` and `models.example.json`. `require_gateway_key` returns without checking when no key is configured (`jev_gateway/gateway.py:367`), so every existing route, including reload, is open in the default install.
- Verification commands are `uv run pytest -q`, `uvx pyright`, and `uv build` (`.trellis/spec/backend/quality-guidelines.md:153`). No repository linter is configured.

## Requirements

### R1. Modern frontend toolchain

Build the interface with Vite, React, and TypeScript. Ship the built assets inside the Python wheel and serve them from the same gateway process. Add no second runtime service and no CDN reference.

### R2. Minimal interface

Keep the interface minimal and operational: one page, no client-side router, no decorative chrome. Support narrow viewports and keyboard operation for navigation and every drag interaction.

### R3. Seed-color theme with chroma-js

Offer a seed-color picker. Derive the light and dark palettes with chroma-js (accent scale, hover and active states, borders, surfaces, code background, status colors), preview them live, and report the measured contrast ratio per text and background pair. Generate text and background from fixed lightness targets so contrast passes by construction, with 4.5:1 for body text and 3:1 for large text. Store only the seed on the server, keep it across restart, and allow reset to the default. The default seed is `#3b66d9`, the current accent, so the default look is unchanged.

### R4. Retained observation monitoring

Present the live session list, the per-session retained request timeline, and the rolling 15-minute provider observations through the existing endpoints, keeping their contracts and their semantics. Keep the retained, best-effort, and possibly incomplete framing and the four neutral observed conditions. Manual refresh only. Add no new metric, no new telemetry collection, and no claim about provider health, reachability, uptime, or concurrency.

### R5. Drag-and-drop routing configuration

Provide drag-and-drop editing for two surfaces that the engine actually supports:

- Workflow visualization and editing for ordered decision-matrix questions, rule conditions and selections, fallback choices, and label-to-model binding. Rule priority remains first-match-wins. Nodes and match/unmatched edges visualize the execution order; no arbitrary graph topology is stored.
- Label-to-model binding: add or remove the tag `task_aware/{label}` on a model, preserving tags that belong to other strategies.
- Question definitions, complete rule conditions, and fallback choices are editable in the dashboard workflow and saved through the validated runtime overlay. This extends the earlier narrow editor scope.

Label order is not draggable, because label scores must increase within `[0, 1]` with the first label at 0 (`catalog.py:721`). Pool rank inside a label is shown read-only with its reason, and `priority` is edited as an explicit number rather than inferred from a drop position.

An edit that cannot take effect is reported instead of silently discarded: a label that declares an explicit `models` list ignores tag edits, so it is flagged.

### R6. Configuration persistence and rollback

Write edits to a runtime overlay next to the active catalog file, never to `models.json`. Apply edits only after full validation, with explicit review, save, cancel, and reset-to-baseline controls. Validate question/criteria references across the complete merged strategy before writing or activating any edit.

### R7. Write authorization

Every configuration write, routing and theme alike, requires a configured `gateway.api_key_env`. When it is unset, write routes return 403 `config_writes_disabled` and the client disables save controls with an explanation. Read routes keep their current behavior. Nothing may inherit unauthenticated mutation from `require_gateway_key`.

### R8. Credential safety

Keep the shell free of session and credential data. Keep the credential in browser memory only, never in a URL, cookie, local storage, or session storage. The selected dashboard locale may be persisted only under the dedicated fixed locale key. Reject unknown overlay keys so a credential cannot be smuggled into the overlay file. Preserve every existing redaction guarantee.

## Acceptance criteria

- [ ] The interface builds with Vite, React, and TypeScript, and `uv build` produces a wheel that serves it from the gateway process with no external asset reference.
- [ ] The page is usable at narrow widths and every drag interaction has a keyboard path.
- [ ] chroma-js derives the light and dark palettes from a stored seed; the seed survives restart, resets to the default, and the editor shows a measured contrast ratio that meets 4.5:1 for body text and 3:1 for large text for the default seed.
- [ ] Session list, per-session timeline, and provider panel render the existing endpoint payloads, including the pending and rejected request states, the evidence-unavailable state, and the four neutral observed conditions.
- [ ] Editing questions, rule conditions, fallback, and rule order persists in the validated overlay; the applied catalog and `policy_snapshot()` reflect the effective strategy.
- [ ] Dragging a model into and out of a label changes that model's `{strategy}/{label}` tag in the overlay and leaves other strategies' tags intact.
- [ ] Dragging the last model out of a label is rejected with the `_validate_policy` message, and the active catalog stays unchanged.
- [ ] An edit against a label that declares explicit `models` is reported as inert rather than applied silently.
- [ ] `models.json` is byte-identical before and after any dashboard edit, and a `config_versions` row records each applied change.
- [ ] `DELETE /v1/routing/configuration` restores baseline behavior, and deleting the overlay file has the same effect after a reload or restart.
- [ ] With no overlay file present, startup, reload, routing, and all existing endpoints behave exactly as today.
- [ ] An invalid or partial payload returns 400 and leaves `engine.policy_snapshot()` unchanged.
- [ ] Write routes return 401 with a wrong key and 403 `config_writes_disabled` with no key configured, and read routes remain reachable without a key as they are today.
- [ ] No credential value reaches the overlay file, the API output, the page shell, the logs, browser storage, URL, cookie, or test snapshots; persistent browser storage contains only the validated locale identifier under its fixed key.
- [ ] The built bundle is inside the wheel, the Docker image rebuilds it, and `scripts/build-frontend.sh --check` fails on a stale bundle.
- [ ] `uv run pytest -q`, `uvx pyright`, `uv build`, `npm --prefix frontend run lint`, `npm --prefix frontend run build`, and `scripts/build-frontend.sh --check` all pass.

## Out of scope

- Provider credential editing, adding or removing providers and models, and editing label scores, descriptions, or reasoning effort.
- Any new monitoring indicator or telemetry collection, unbounded telemetry, cost analytics, alerting, and historical or expired-session browsing.
- Replacing or weakening gateway authentication, and relaxing the new write guard.
- Editing secrets or exposing resolved credentials in the UI.
- Writing to `models.json`.

## Deferred

- Whether the committed bundle stays in version control or moves to a release-time-only build, if the staleness guard proves heavy in practice.
- The frontend test runner choice (Vitest is the assumption) is settled in stage 3, since the repository has no Node test setup today.
