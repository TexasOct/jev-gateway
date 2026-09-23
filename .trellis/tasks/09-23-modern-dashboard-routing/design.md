# Modern dashboard and visual routing configuration design

## Boundaries

New pieces:

- `frontend/`: Vite + React + TypeScript source. Depends on `chroma-js` for palette work and `@dnd-kit/core` plus `@dnd-kit/sortable` for pointer and keyboard drag.
- `jev_gateway/static/`: built frontend output, committed and shipped in the wheel.
- `jev_gateway/routing_overlay.py`: overlay file read, write, shape validation, document merge, and `load_catalog_with_overlay()`. It must not import `jev_gateway.gateway`, which would create a cycle.
- `scripts/build-frontend.sh`: build plus `--check` staleness guard.

Changed pieces:

- `jev_gateway/gateway.py`: startup and `POST /v1/routing/reload` load through `load_catalog_with_overlay()`; new routing configuration routes use the existing `reload_lock` closure.
- `jev_gateway/dashboard.py`: `GET /dashboard` becomes a static file mount, read routes keep their contracts, and theme read plus write routes are added.
- `pyproject.toml`: package data for `jev_gateway/static/**`.
- `Dockerfile`: a Node stage that rebuilds the frontend into `jev_gateway/static/` before `uv build`.
- `.gitignore`: `frontend/node_modules/`.

`models.json` is never written by any code path in this design.

## Catalog assembly

The overlay is a document patch applied before the existing parser, so every catalog invariant is enforced by code that already exists.

```text
models.json document ─┐
                      ├─→ merge_overlay() ─→ catalog_from_document() ─→ Catalog.validate()
routing-overrides.json┘                                                     │
                                                                            v
                                       RoutingEngine.prepare_catalog_reload() ─→ reload_catalog()
```

`load_catalog_with_overlay(models_file)`:

1. read and parse `models.json`
2. read `routing-overrides.json` from the same directory, or treat it as `{}` when absent
3. return `catalog_from_document(merge_overlay(document, overlay), str(models_file))`

Both `load_gateway_config()` and `reload_routing()` call this, so a restart and a reload produce the same catalog. A missing or unreadable overlay is never fatal: the baseline document loads and the overlay state is reported as unavailable.

### Overlay schema

```json
{
  "version": 1,
  "strategy": "task_aware",
  "rules": [{"when": {"scale": "large"}, "select": {"label": "engineering", "selection": "quality_first"}}],
  "models": {
    "openai/gpt-6-luna": {"tags": ["quality/routine", "task_aware/craft"], "priority": 10}
  }
}
```

Merge rules:

- `rules` replaces `strategies.<strategy>.options.rules` wholesale. Other `options` keys (`questions`, `fallback`) stay from the baseline.
- `models.<catalog id>` replaces `tags` and, when present, `priority` on the matching entry in the top-level `models` array. The catalog id is `"{provider}/{upstream_model}"`.
- Unknown keys at any level are rejected. An unknown catalog id or unknown strategy name is rejected.
- Storage, gateway, provider, and decision sections cannot be reached through the overlay, so `storage` changes stay restart-only and provider secrets stay out of the file.

Because the merge happens on the parsed document, the overlay cannot produce a configuration the parser would reject. Verified invariants that come free:

- a rule whose `select.label` is not a declared label, or whose `when` names an unknown question or criteria value, fails in `_validate_options` (`jev_gateway/strategy/matrix.py:176`)
- a label whose tag no longer matches any model fails in `_validate_policy` (`jev_gateway/catalog.py:744`)
- a rule with an unknown `select.selection` fails in `_validate_choice` (`matrix.py:137`)

## Routing configuration API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/v1/routing/configuration` | editable surface plus baseline and overlay state |
| POST | `/v1/routing/configuration/validate` | merge and validate, apply nothing |
| PUT | `/v1/routing/configuration` | validate, write overlay atomically, reload |
| DELETE | `/v1/routing/configuration` | remove the overlay, reload the baseline |

The GET payload carries the selected strategy's rule list in evaluation order, the question and criteria vocabulary that rule conditions may use, every label with its score and derived tag, the model catalog with tags and priority, the resolved candidate pool per label in effective rank order, and overlay state (`applied`, `baseline_source`, `config_hash`).

It also reports warnings for edits that would be inert. A label that declares explicit `models` resolves without tags, so tag-only edits do not reach it. The response names those labels instead of silently discarding the change.

### Apply sequence

1. authorize, then require `gateway.api_key_env` to be configured
2. read the `models.json` document from disk
3. `merged = merge_overlay(document, payload)`
4. `catalog = _resolve_storage_path(catalog_from_document(merged, source), models_file)`
5. `registry = engine.prepare_catalog_reload(catalog)` (full validation, builds the strategy registry)
6. assert the storage section is byte-identical to the active one, so the overlay cannot smuggle a restart-only change
7. under `reload_lock`: write the overlay with `tmp` plus `os.replace`, then `engine.reload_catalog(catalog, source=str(models_file), registry=registry)`
8. on failure at step 7, restore the previous file content (unlink when the overlay did not exist) and reload the previous catalog, then return `overlay_apply_failed`

Nothing reaches disk before validation passes, and the active catalog changes only at step 7. A rejected payload leaves routing untouched, which is directly testable by comparing `engine.policy_snapshot()` around a failing PUT.

Applying an overlay registers a new `config_versions` row through the existing `_register_config` path (`jev_gateway/decision.py:484`), so every applied change is auditable against the catalog hash.

## Theme contract

The server stores one seed color and nothing derived:

```json
{"version": 1, "seed": "#3b66d9"}
```

`#3b66d9` is the current accent from `dashboard.py`, so the default look is unchanged. The frontend derives the full palette with chroma-js: accent scale, hover and active states, border and surface tints, and light plus dark variants. Text and background pairs are generated from fixed lightness targets, so contrast passes by construction, and the measured ratio is displayed per pair with `chroma.contrast()`. Body text targets 4.5:1 and large text targets 3:1. A seed that cannot reach the target still saves, but the editor reports the measured ratio as a warning rather than blocking the operator.

Routes are `GET`, `PUT`, and `DELETE` on `/v1/dashboard/theme`. The write guard is identical to the routing guard, so all configuration writes share one rule: a configured gateway API key is required. Theme reads require the same Bearer credential, so the shell paints the default palette until the key is supplied. Nothing in the theme file is data; the file contains a color string.

## Serving and packaging

`GET /dashboard` becomes `StaticFiles(directory=jev_gateway/static, html=True)` mounted before the API routes. Vite emits hashed asset names, so `assets/*` can be cached immutably while `index.html` is served `no-store`.

The response headers tighten rather than loosen: `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (React writes style attributes and CSP variables), `connect-src 'self'`, and the existing `default-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`. The old page needed `script-src 'unsafe-inline'`; the bundled app does not.

Build output is committed so that `pip install`, `uv build`, and the existing tests work without Node. The Dockerfile adds a Node stage that rebuilds the bundle into `jev_gateway/static/` before the Python builder runs, so images are always fresh. `scripts/build-frontend.sh --check` fails when the committed bundle is older than the newest file under `frontend/src`, which is the guard against a stale commit.

## Client behavior

One page, no client-side router. View state selects between monitoring and configuration.

The credential stays in a module-level variable, sent as `Authorization: Bearer`. The shell contains no session data. Manual refresh only.

Drag and drop uses `@dnd-kit`, which ships keyboard sensors, so reordering is reachable without a pointer. Two drag surfaces exist:

- rule rows, dragged to change evaluation order, since the first matching rule wins (`matrix.py:63`)
- model chips, dragged between label columns to add or remove that label's tag

Label order is not draggable. Label scores must increase within `[0, 1]` and the first label must score 0 (`catalog.py:721`), so the column order follows score. Pool rank inside a column is computed by the selection mode and `priority` (`jev_gateway/strategy/policy.py:463`), so it is shown read-only with its reason, and `priority` is edited as an explicit number instead of being inferred from a drop position.

Tags for other strategies (`quality/*`, `economy/*`) render read-only inside the chip, so a drag cannot empty an unrelated label.

## Security

A write route inherits `require_gateway_key`, which returns immediately when no key is configured (`gateway.py:367`). Mutations therefore add an explicit guard: when `gateway.api_key_env` is unset, every configuration write returns 403 `config_writes_disabled`, and the client disables save controls with an explanation. Read routes keep today's behavior.

No CSRF token is needed. The credential is not ambient: it lives in JS memory and only reaches the server through an explicit header, so a cross-site request cannot carry it. No CORS middleware is configured, cross-origin `fetch` with a JSON content type preflights and fails, and the write routes accept only `application/json`.

The overlay file holds tags, priorities, a strategy name, and a rule list. Unknown-key rejection keeps credentials out of it. Files are created with the process umask in the runtime directory, next to `models.json`, which the container already covers with a volume.

## Compatibility and migration

- Existing dashboard read endpoints keep their paths and payloads.
- The new routes are additive.
- An absent overlay reproduces today's behavior exactly.
- `POST /v1/routing/reload` and process startup begin applying the overlay. This is the one deliberate behavior change, and it is the point of the feature. No existing config file changes shape, so no migration runs.
- An overlay written by a newer version is validated on load like any other document, so a downgrade rejects rather than half-applies it.
- Before an overlay exists, no new file appears in the runtime directory.

## Tradeoffs

Committing build output keeps wheel builds Node-free and the test suite runnable everywhere, at the cost of a stale-bundle failure mode. The `--check` script and the Dockerfile rebuild cover it.

Tag-based label binding is what the catalog actually supports, so the editor edits tags rather than presenting a simpler label-to-model map that the engine would ignore. The cost is a less direct mental model, and the inert-label warnings exist to keep it honest.

Theme reads require auth, so the first paint uses the default palette.

## Rollback

`DELETE /v1/routing/configuration` removes the overlay and reloads the baseline. `DELETE /v1/dashboard/theme` restores the default seed. Deleting either file by hand has the same effect on the next reload or restart. `models.json` is never modified, so the baseline is always intact, and `config_versions` retains the hash of every applied change.
