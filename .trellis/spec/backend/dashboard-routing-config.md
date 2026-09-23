# Dashboard and routing configuration

> The bundled operator UI, the runtime overlay that backs its edits, and the
> configuration-write boundary.

## Overview

The dashboard is a Vite + React + TypeScript app in `frontend/`. Its build output
is committed at `jev_gateway/static/` and served by the gateway process, so there
is no second server to start and `pip install` needs no Node.

Two files next to the active `models.json` hold runtime edits:

| File | Holds | Written by |
| --- | --- | --- |
| `routing-overrides.json` | rule order, per-model `tags` and `priority` | `PUT`/`DELETE /v1/routing/configuration` |
| `dashboard-theme.json` | one hex seed color | `PUT`/`DELETE /v1/dashboard/theme` |

`models.json` is the baseline and is never written by the gateway.

Module ownership: `jev_gateway/routing_overlay.py` owns overlay shape, merge,
atomic write, and `load_catalog_with_overlay()`. It must not import
`jev_gateway.gateway`. `jev_gateway/dashboard.py` owns the read routes, the
static mount, the shell route, and the theme routes. The routing-configuration
routes live in `gateway.py` because they must share the `reload_lock` closure.

## Scenario: runtime routing overlay

### 1. Scope / Trigger

Any change to the editable routing surface, the overlay schema, the merge rules,
or the configuration-write authorization belongs here. The overlay is a document
patch applied before the existing parser, which is what keeps every catalog
invariant enforced by code that already exists.

### 2. Signatures

```python
# jev_gateway/routing_overlay.py
overlay_path(models_file: Path) -> Path
read_overlay(models_file: Path) -> tuple[dict[str, Any], str | None]
validate_overlay_shape(value: Any) -> dict[str, Any]
merge_overlay(document: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]
merge_warnings(document, overlay, catalog) -> list[dict[str, str]]
write_overlay(models_file: Path, payload: Any) -> None
remove_overlay(models_file: Path) -> bool
read_models_document(models_file: Path) -> dict[str, Any]
load_catalog_with_overlay(models_file: Path) -> Catalog
```

Both startup (`load_gateway_config`) and `POST /v1/routing/reload` must load
through `load_catalog_with_overlay()`. A call site left on `load_catalog()` makes
the overlay silently vanish on reload.

### 3. Contracts

Overlay request body:

```json
{
  "version": 1,
  "strategy": "task_aware",
  "rules": [{"when": {"scale": "large"}, "select": {"label": "engineering"}}],
  "models": {"openai/gpt-6-luna": {"tags": ["quality/routine", "task_aware/craft"], "priority": 10}}
}
```

- `rules` replaces `strategies.<strategy>.options.rules` wholesale; `questions`
  and `fallback` still come from the baseline file.
- `models.<catalog id>` replaces that entry's `tags`, and `priority` when
  present. The catalog id is `provider/upstream_model`.
- Unknown keys at any level, an unknown strategy name, an unknown catalog id, and
  an empty payload are rejected. Storage, gateway, provider, and decision
  sections are unreachable, so a credential cannot be smuggled in.
- Label membership is tag-based: adding a model to a label adds `{strategy}/{label}`
  to that model's `tags`. Tags owned by other strategies must survive an edit.
- Environment key: `gateway.api_key_env` must be configured for any write. The
  key is resolved at catalog load; no new variable is introduced.
- The overlay file and theme file are created with the process umask.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| Missing or wrong Bearer token, key configured | `401 invalid_api_key` |
| Write attempted with no `gateway.api_key_env` | `403 config_writes_disabled` |
| Read route with no key configured | Normal response, unchanged from before |
| Overlay shape or catalog validation fails | `400 invalid_configuration`, active catalog untouched |
| Merged catalog changes `storage` | `400 invalid_configuration` (`restart_required` semantics) |
| Write fails after the file was replaced | previous file content restored, previous catalog reloaded, `500 overlay_apply_failed` |
| Theme payload is not a hex seed or has unknown keys | `400 invalid_theme` |
| Assets absent from the install | `404 dashboard_not_built`, startup logs a warning |
| No overlay file present | Baseline behavior; `overlay.applied` is `false` |

The write guard is required because `require_gateway_key` returns without
checking when no key is configured. A write route that only calls it would accept
unauthenticated mutations in the default install.

### 5. Good/Base/Bad Cases

- Good: an operator drags a model into a label, the payload carries the full rule
  list plus only the models that differ from the baseline, validation passes, the
  overlay is written atomically, and a `config_versions` row records the new hash.
- Base: no overlay file exists, so startup, reload, routing, and every read route
  behave exactly as before the feature.
- Bad: patching the *active* catalog instead of the baseline document. A second
  edit would then write an overlay missing the first edit's models, silently
  reverting them.

### 6. Tests Required

- `tests/test_routing_overlay.py`: rules replacement preserves `questions` and
  `fallback`; tag and priority override; unknown catalog id, unknown strategy,
  unknown key, storage key, missing file, malformed JSON; an empty overlay parses
  identically to the baseline; an inert-label warning is reported for a label that
  declares explicit `models`.
- `tests/test_gateway.py`: PUT changes `engine.policy_snapshot()`; DELETE restores
  the baseline; validate applies nothing; an invalid payload returns `400` and
  leaves `policy_snapshot()` unchanged; `401` with a wrong key; `403
  config_writes_disabled` with no key while reads still work; `POST
  /v1/routing/reload` re-applies the overlay after `models.json` changes on disk;
  theme round trip, reset, invalid payload, and unreadable-file handling.
- Assert `models.json` bytes are unchanged after a successful apply, and assert no
  credential value appears in the overlay file, the API response, or the shell.

### 7. Wrong vs Correct

#### Wrong

```python
# Applies the overlay to the live catalog object and reloads it.
catalog = active.engine.catalog
catalog.strategies[0].options["rules"] = payload["rules"]
active.engine.reload_catalog(catalog)
```

Mutable catalog state is shared with in-flight requests, and the next apply would
start from an already-patched catalog.

#### Correct

```python
baseline = read_models_document(active.models_file)      # models.json from disk
merged = merge_overlay(baseline, validate_overlay_shape(body))
catalog = _resolve_storage_path(
    catalog_from_document(merged, str(active.models_file)), active.models_file
)
registry = active.engine.prepare_catalog_reload(catalog)  # full validation
with reload_lock:
    write_overlay(active.models_file, body)               # only after validation
    active.engine.reload_catalog(
        catalog, source=str(active.models_file), registry=registry
    )
```

## Scenario: bundled dashboard assets

### 1. Scope / Trigger

Serving, caching, CSP, wheel packaging, and the staleness guard for
`jev_gateway/static/`.

### 2. Signatures

```python
# jev_gateway/dashboard.py
static_directory() -> Path
browsable_host(host: str) -> str
dashboard_url(host: str, port: int) -> str
DashboardStatic.get_response(path: str, scope: Any) -> Response
```

Routes: `GET /dashboard` returns the shell, the mount serves
`/dashboard/assets/*`. `scripts/build-frontend.sh [--check]` builds or verifies
the bundle. `npm --prefix frontend run lint|test|build` are the frontend gates.

### 3. Contracts

- Vite `base` must be `/dashboard/` and `build.outDir` must be
  `../jev_gateway/static`, so emitted asset URLs match the mount.
- `index.html` is served `no-store`; hashed assets are
  `public, max-age=31536000, immutable`.
- CSP is `default-src 'none'; style-src 'self' 'unsafe-inline'; script-src
  'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action
  'self'; frame-ancestors 'none'`. The bundled app needs no inline script.
- The shell contains no session or credential data.
- `pyproject.toml` declares `[tool.setuptools.package-data]` for
  `jev_gateway/static/**`; the `Dockerfile` rebuilds the bundle in a Node stage
  before `uv build`.
- `run_gateway()` announces the address with the `dashboard_url` logging field.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| Assets present | Shell `200`, assets `200` with immutable caching |
| Assets absent | Shell `404 dashboard_not_built`; startup logs a warning; `/v1` routes unaffected |
| Committed bundle older than `frontend/src` | `scripts/build-frontend.sh --check` exits `1` |
| Wildcard bind host | `dashboard_url` displays the loopback address |

### 5. Good/Base/Bad Cases

- Good: the wheel carries `static/index.html` and its hashed assets, and the
  service serving `/dashboard` needs nothing else.
- Base: a checkout without Node still runs `uv build` and the test suite, because
  the bundle is committed.
- Bad: serving the shell through `StaticFiles(html=True)` alone. The bare mount
  path answers `307` to `/dashboard/`, which silently changes the status of an
  existing endpoint. Keep the explicit shell route.

### 6. Tests Required

- `tests/test_gateway.py`: shell `200` with `no-store`, `nosniff`,
  `referrer-policy`, and a CSP whose `script-src` is exactly `'self'`; the shell
  carries no session data and only `/dashboard/assets/` references; assets are
  immutable-cacheable; the bundle JS contains no `localStorage`,
  `sessionStorage`, or `document.cookie`; the stylesheet still stacks table rows
  with `attr(data-label)`; `browsable_host` and `dashboard_url` behavior.
- `tests/test_logging_config.py`: the `dashboard_url` field renders in pretty,
  compact, and JSON.

### 7. Wrong vs Correct

#### Wrong

```python
app.mount("/dashboard", StaticFiles(directory=assets, html=True))
```

#### Correct

```python
@router.get("/dashboard", response_class=FileResponse)      # keeps the 200
def dashboard_shell() -> FileResponse: ...

assets = static_directory()                                  # mount only the assets
if assets.is_dir():
    app.mount("/dashboard", DashboardStatic(directory=assets, html=True))
```

## Frontend conventions

- One page, no client-side router. View state switches between monitoring and
  configuration.
- The gateway credential lives in a module-level variable in `src/api.ts` only.
  Never `localStorage`, `sessionStorage`, a cookie, or the URL.
- Pure editor logic belongs in `src/config/draft.ts` and pure palette logic in
  `src/theme/palette.ts`, so both are testable without a DOM. The overlay payload
  compares each model against `baseline_tags` / `baseline_priority`, not against
  the currently applied overlay, so repeated edits stay consistent.
- `chroma-js` ships no types; `@types/chroma-js` is a dev dependency. Contrast
  targets are enforced by construction: surfaces come from fixed lightness
  targets and each accent or status color is stepped until it clears its target.
- The installed `eslint-plugin-react-hooks` includes the compiler rule
  `set-state-in-effect`, which rejects a direct `void load()` call in an effect
  body. Kick off mount-time loading without making the effect body call a state
  setter synchronously.
- The `chroma-js` lowercase hex form is the stored seed shape; reject anything
  else in both the API and the UI.

## Common mistakes

- Do not call `load_catalog()` directly on a code path that should honor the
  overlay. Use `load_catalog_with_overlay()`.
- Do not write `models.json`. Write the overlay, and let the merge produce the
  effective document.
- Do not send a partial overlay. The server replaces the rule list wholesale and
  replaces a named model's tags, so a partial payload reverts whatever it omits.
- Do not let a write route rely on `require_gateway_key` alone; add the
  `gateway.api_key_env` guard.
- Do not run `npm ci` in build scripts or images. Vite's rolldown optional native
  bindings are pruned to the platform that generated the lockfile, so `npm ci`
  fails on a different OS/libc. Use `npm install`.
- Do not commit a changed `frontend/src` without rebuilding and committing
  `jev_gateway/static/`; `--check` is what catches it.
