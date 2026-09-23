# Verified constraints for the modern dashboard

Repository evidence gathered during planning. Every claim below was read from source.

## Overlay merge surface

`load_catalog()` (`jev_gateway/catalog.py:1939`) reads JSON and calls `catalog_from_document(document, str(path))`. Merging an overlay into the parsed document before that call reuses every downstream invariant.

Validators that a merged document passes through:

| Invariant | Enforced at |
| --- | --- |
| label score increases within `[0, 1]`, first label is 0 | `catalog.py:721` |
| label requires either explicit `models` or a tag that matches at least one model | `catalog.py:744` |
| a label cannot declare both `models` and `tag` | `catalog.py:738` |
| rule `select.label` must exist, `select.selection` must be in `SELECTION_MODES` | `matrix.py:137` |
| rule `when` keys must be question names with values from that question's criteria | `matrix.py:176` |
| strategy body keys outside `description`, `kind`, `options` become policy overrides | `catalog.py:1761` |

Consequence: the overlay only needs to express a rules array and per-model `tags` plus `priority`. Dangling labels, unknown selection modes, and empty label pools are rejected by existing code with usable messages.

## Routing semantics

- Rules are evaluated in array order with first match winning, and the reason is recorded as `rule_{index+1}` (`jev_gateway/strategy/matrix.py:63`).
- An empty `rules` array is valid and always resolves through `options.fallback`.
- Label resolution without an explicit `models` list uses the tag `route.tag or f"{strategy_name}/{tier}"` (`jev_gateway/strategy/policy.py:379`, `catalog.py:628`).
- Pool rank comes from the selection mode: cost, then quality, then `priority` as tiebreak (`policy.py:463`).
- Pool ordering is therefore not a user-controlled drag order. `priority` is a model-level integer (`catalog.py:981`).
- In the current `models.json`, `task_aware` labels declare only `score`, `description`, and `reasoning_effort`, so they resolve by tag and the tags are `task_aware/{label}`.

## Catalog reload

- `RoutingEngine.prepare_catalog_reload(catalog)` validates and builds the strategy registry; `reload_catalog(catalog, source, registry=...)` swaps under a prevalidated catalog and keeps sessions (`jev_gateway/decision.py:441`).
- `reload_catalog` registers the catalog hash through `_register_config` into `config_versions` (`decision.py:484`), so applied overlay changes are auditable for free.
- `reload_lock` is a closure inside `create_app` (`gateway.py:401`), so a new mutation route must live in `gateway.py` to share it.
- `POST /v1/routing/reload` re-reads `.env` and calls `load_catalog(active.models_file)` (`gateway.py:675-677`). Both this call and startup must move to `load_catalog_with_overlay()` or the overlay silently drops on reload.
- `_resolve_storage_path(catalog, models_file)` makes a relative storage path relative to the models file (`gateway.py:139`).

## Runtime paths and files

- `runtime_directory()` returns `$JEV_GATEWAY_HOME` or the current directory (`gateway.py:133`); `models.json` lives there.
- The container sets `JEV_GATEWAY_HOME=$HOME/.jev-gateway`, creates it, and volume-mounts it, so files written next to `models.json` survive restarts.
- `.gitignore` currently ignores `.env`, `models.json`, and `logs/`.
- `Dockerfile` copies only `pyproject.toml`, `uv.lock`, `README.md`, and `jev_gateway/` into the builder, then runs `uv build --wheel`. Built frontend assets must therefore live inside `jev_gateway/` at wheel time.
- `pyproject.toml` uses setuptools with `include = ["jev_gateway*"]` and currently declares no package data.
- `compose.yaml` publishes only `127.0.0.1:8000`.

## Authentication

- `require_gateway_key` returns without checking when `expected_key` is falsy (`gateway.py:367`), and `gateway.api_key_env` is absent from `models.json` and `models.example.json`, so the default install has no inbound auth on any route.
- Existing tests: auth enforced when a key is set (`tests/test_gateway.py:713`), the dashboard shell stays public while data endpoints require auth (`tests/test_gateway.py:852`), reload works without a header when no key is configured (`tests/test_gateway.py:1623`), and reload requires the key once one is configured (`tests/test_gateway.py:1925`).
- No CORS middleware is configured in `create_app`.

## Toolchain

- Node v24.18.0, npm 11.16.0 are installed. No `package.json` exists anywhere in the repository.
- Verification commands: `uv run pytest -q`, `uvx pyright`, `uv build`. Pyright config targets Python 3.10 with extra paths `.` and `tests`. Ruff is not configured.
- The current page sets `script-src 'unsafe-inline'` in its CSP (`dashboard.py:225`), which the bundled build removes.

## UI surfaces that exist today

- `GET /v1/routing/sessions` returns `storage`, `evidence_available`, and `data` sorted by latest retained request, falling back to live update order.
- `GET /v1/routing/sessions/{id}/requests` returns the live snapshot plus newest-first retained requests with request, decision, upstream request, and outcome sections.
- `GET /v1/routing/providers/summary` returns a fixed 900-second window, its `upstream_requests.created_at` basis, recorder state, and one row per configured provider with `null` metrics when evidence is unavailable.
- Observed conditions are `no_recent_data`, `all_observed_attempts_succeeded`, `mixed_outcomes`, and `all_observed_attempts_failed`.
