# Modern dashboard and visual routing configuration implementation plan

Verification commands for every stage:

```bash
uv run pytest -q
uvx pyright
uv build
npm --prefix frontend run build
npm --prefix frontend run lint
scripts/build-frontend.sh --check
```

## Stage 0. Baseline

- Run `uv run pytest -q` and `uvx pyright` on the untouched checkout and record the result, so later failures are attributable.
- Rollback point: none needed, nothing is edited.

## Stage 1. Overlay core

Files: `jev_gateway/routing_overlay.py`, `jev_gateway/gateway.py`, `tests/test_routing_overlay.py`.

- Add overlay path resolution next to the active models file, shape validation with unknown-key rejection, atomic write, and `merge_overlay()`.
- Add `load_catalog_with_overlay()` and route `load_gateway_config()` and `reload_routing()` through it.
- Tests: rules replacement, tag and priority override, unknown catalog id, unknown strategy, unknown key, storage key rejection, missing file, malformed JSON, and a catalog that parses identically with and without an empty overlay.
- Also test that a valid baseline with a `models`-declaring label reports tag edits as inert warnings, not errors.

Gate: `uv run pytest -q tests/test_routing_overlay.py` and a focused run of `tests/test_gateway.py`.

Rollback point: additive module plus two call sites. Reverting the call sites restores prior behavior.

## Stage 2. Configuration API

Files: `jev_gateway/gateway.py`, `tests/test_gateway.py`.

- Add the shared write guard, then the four routes from the design, reusing `reload_lock`.
- Implement the apply sequence including the storage-identity assertion and the restore-on-failure path.
- Tests: PUT applies and changes the active policy snapshot, DELETE restores the baseline, validate applies nothing, an invalid payload returns 400 and leaves `policy_snapshot()` unchanged, the storage assertion rejects a smuggled storage change, 401 with a wrong key, 403 when no key is configured, and that reads still work without a key.
- Test that `POST /v1/routing/reload` re-applies the overlay after `models.json` changes on disk.

Gate: `uv run pytest -q tests/test_gateway.py` plus `uvx pyright`.

Rollback point: the routes are additive, so deleting them restores the current surface.

## Stage 3. Frontend scaffold, serving, packaging, auth bridge

Files: `frontend/`, `jev_gateway/static/`, `jev_gateway/dashboard.py`, `pyproject.toml`, `Dockerfile`, `.gitignore`, `scripts/build-frontend.sh`, `tests/test_gateway.py`.

- Scaffold Vite + React + TypeScript with `chroma-js`, `@dnd-kit/core`, `@dnd-kit/sortable`, and a lint script.
- Add the credential bridge, the typed API client, and the shell layout.
- Mount the built assets and tighten the CSP to `script-src 'self'`.
- Add package data, the Dockerfile Node stage, and the build script with `--check`.
- Tests: the shell renders without authentication and without embedded session data, `index.html` is `no-store`, hashed assets are cacheable, the response headers carry the tightened CSP, no asset references an absolute external URL, and every existing read route still passes its current test.
- Update the three dashboard tests in `tests/test_gateway.py:852` that assert characteristics of the inline page.

Gate: `uv build`, `scripts/build-frontend.sh --check`, `uv run pytest -q`.

Rollback point: this is the first user-visible change to `GET /dashboard`. Revert this stage to return to the inline page; stages 1 and 2 are independent of it.

## Stage 4. Monitoring views

Files: `frontend/src/`, no Python behavior change.

- Port the provider panel, session list, and per-session timeline onto the existing three read endpoints.
- Keep the retained-data and best-effort copy, and the four neutral observed conditions.
- Manual refresh only.
- Tests: keep the endpoint contracts unchanged; add component-level tests for the empty, degraded-storage, and pending-request states if the frontend test setup lands in this stage.

Gate: `npm --prefix frontend run build` and `uv run pytest -q`.

## Stage 5. Theme editor

Files: `frontend/src/theme/`, `jev_gateway/dashboard.py`, `tests/test_gateway.py`.

- Derive the light and dark palettes from the seed with chroma-js, expose the seed picker with live preview, and report measured contrast per pair.
- Add the theme read, write, and delete routes with the shared write guard.
- Tests: round trip of the seed, rejection of a non-hex value and unknown keys, 403 when writes are disabled, reset behavior, and that the default seed reproduces the current accent.

Gate: `uv run pytest -q tests/test_gateway.py`, `npm --prefix frontend run lint`.

## Stage 6. Drag-and-drop configuration editor

Files: `frontend/src/config/`, no Python behavior change.

- Rule rows with pointer and keyboard reordering, writing the new order into `rules`.
- Model chips dragged between label columns to add and remove `{strategy}/{label}` tags, with foreign-strategy tags read-only.
- Explicit numeric `priority` editing, with the derived pool rank shown read-only and its reason.
- Review step showing the pending diff, plus save, cancel, and reset to baseline, with validation errors surfaced per field from the API response.
- Tests: reordering persists, a drag that empties a label surfaces the server error and keeps the previous state, cancel restores the last loaded state, and keyboard-only reordering works.

Gate: `npm --prefix frontend run lint`, `npm --prefix frontend run build`, `uv run pytest -q`.

## Stage 7. Documentation and full verification

- Update `docs/http-api.md` with the new routes and the write guard, and `docs/models-config.md` with the overlay file and its merge rules.
- Update `README.md` and `README.zh-CN.md` with the frontend build step and the runtime files.
- Run the full set: `uv run pytest -q`, `uvx pyright`, `uv build`, `npm --prefix frontend run lint`, `npm --prefix frontend run build`, `scripts/build-frontend.sh --check`.

## Risky files

- `jev_gateway/gateway.py` startup and reload path: a mistake here breaks every request. The overlay must be optional at every step.
- `pyproject.toml` and `Dockerfile`: a mistake drops the assets from the wheel and the image serves a 404 dashboard.
- `scripts/build-frontend.sh --check`: too loose and stale bundles ship, too strict and it blocks unrelated commits. Compare against `frontend/src` mtimes only.

## Follow-up checks before starting

- Confirm the frontend test runner choice (Vitest) during stage 3, since the repository has no Node test setup today.
- Confirm whether the committed bundle stays in version control or moves to a release-time build only, if the staleness guard feels heavy in practice.
