# Dashboard and routing configuration

> The bundled operator UI, the runtime overlay that backs its edits, and the
> configuration-write boundary.

## Overview

The dashboard is a Vite + React + TypeScript app in `frontend/`. Generated output
lives at `jev_gateway/static/` during local/release builds and is served by the
gateway process, so there is no second server to start. The generated bundle is
not committed; release packaging builds it from `frontend/` before creating the
wheel. A built wheel includes its dashboard assets, so installed users do not
need Node.

Three files next to the active `models.json` hold runtime edits:

| File | Holds | Written by |
| --- | --- | --- |
| `routing-overrides.json` | question definitions, ordered rules, fallback, per-model `tags` and `priority` | `PUT`/`DELETE /v1/routing/configuration` |
| `dashboard-theme.json` | one hex seed color | `PUT`/`DELETE /v1/dashboard/theme` |
| `routing-canvas-layout.json` | node positions and scroll viewport | `PUT /v1/dashboard/canvas-layout` |

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
  "questions": {"scale": {"type": "choice", "instructions": "...", "criteria": {"small": "...", "large": "..."}}},
  "rules": [{"when": {"scale": "large"}, "select": {"label": "engineering"}}],
  "fallback": {"label": "routine"},
  "models": {"openai/gpt-6-luna": {"tags": ["quality/routine", "task_aware/craft"], "priority": 10}}
}
```

- `rules` replaces `strategies.<strategy>.options.rules` wholesale. Optional
  `questions` and `fallback` replace the corresponding baseline options when
  present; old overlays that omit them inherit those values from the baseline.
  The fully merged catalog must pass the existing parser and cross-reference
  validation before the overlay is written or activated.
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

- `tests/test_routing_overlay.py`: rules-only replacement preserves baseline
  `questions` and `fallback`; explicit question/fallback overrides merge; tag and
  priority override; unknown catalog id, unknown strategy,
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
- The shell contains no session or credential data. The frontend may persist only
  the selected dashboard locale under a dedicated fixed key; the credential
  remains module-memory-only.
- `pyproject.toml` declares `[tool.setuptools.package-data]` for
  `jev_gateway/static/**`; the `Dockerfile` and release workflow build the bundle
  from `frontend/` before `uv build`. The repository does not track generated
  `jev_gateway/static/` output.
- A fresh source checkout needs `npm --prefix frontend install` and a frontend
  build before local installation or packaging. `scripts/build-frontend.sh`
  installs dependencies and builds; `--check` only checks for missing or stale
  output. The release workflow uses Node.js 22 and builds before Python tests
  and wheel packaging. Installed wheels need no Node.js.
- Startup announces the address through the `dashboard_url` logging field. It must
  be emitted from the app lifespan: a log call before `uvicorn.run` happens
  before Uvicorn applies the configured formatters and is dropped by the default
  root level.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| Assets present | Shell `200`, assets `200` with immutable caching |
| Assets absent | Shell `404 dashboard_not_built`; startup logs a warning; `/v1` routes unaffected |
| Existing generated bundle older than `frontend/src` | `scripts/build-frontend.sh --check` exits `1` |
| Generated bundle absent | Build it with `scripts/build-frontend.sh` before packaging; dashboard remains unavailable in an unbuilt source checkout |
| Wildcard bind host | `dashboard_url` displays the loopback address |

### 5. Good/Base/Bad Cases

- Good: the wheel carries `static/index.html` and its hashed assets, and the
  service serving `/dashboard` needs nothing else.
- Base: a release build runs the frontend build before `uv build`; the resulting
  wheel includes dashboard assets. A source checkout without Node can run backend
  tests that do not require the generated bundle, but must build it before making
  an installable wheel.
- Bad: serving the shell through `StaticFiles(html=True)` alone. The bare mount
  path answers `307` to `/dashboard/`, which silently changes the status of an
  existing endpoint. Keep the explicit shell route.

### 6. Tests Required

- `tests/conftest.py` owns the session-scoped `dashboard_bundle` fixture. Tests
  that inspect or package the dashboard must request it; it runs
  `npm --prefix frontend run build` once per session and requires dependencies
  installed with `npm --prefix frontend install`. It must not reuse a bundle
  merely because it exists locally or assume generated assets are Git-tracked.
- `tests/test_release_validation.py`: build the bundle before copying the
  package into a temporary release source, then check shell references and
  exact wheel/source asset parity.
- `tests/test_gateway.py`: shell `200` with `no-store`, `nosniff`,
  `referrer-policy`, and a CSP whose `script-src` is exactly `'self'`; the shell
  carries no session data and only `/dashboard/assets/` references; assets are
  immutable-cacheable; the bundle JS never persists or URL-encodes a credential and does not use
  cookies or session storage; local storage, if present, is limited to the fixed
  locale key; the stylesheet still stacks table rows
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

## Scenario: independent canvas layout

### 1. Scope / Trigger

Use this contract when changing whiteboard persistence or its boundary with routing configuration. `jev_gateway/canvas_layout.py` owns file validation and atomic persistence; the dashboard router owns authorization.

### 2. Signatures

```python
layout_path(models_file: Path) -> Path
validate_layout(value: Any) -> dict[str, Any]
read_layout(models_file: Path) -> tuple[dict[str, Any], str | None]
write_layout(models_file: Path, value: Any) -> dict[str, Any]
```

`GET /v1/dashboard/canvas-layout` reads the file. `PUT` replaces it after `require_write` succeeds. Neither operation calls the routing engine's reload or config-version registration methods.

### 3. Contracts

The exact write shape is `{version: 1, nodes: {node_id: {x, y}}, viewport: {x, y}}`. Positions are integers with absolute value at most 10000, with at most 256 stored nodes and 65536 encoded bytes. Accept the known node-ID namespaces (`questions`, `fallback`, `rule-N`, `zone::…`, `model::…`), including valid Unicode names, but no control characters. Reject unknown keys. Node IDs identify UI slots or catalog entities, not executable topology.

The layout is shared by browsers connected to the same installation. The API currently uses atomic last-writer-wins replacement, not revision checks. Missing files return empty positions; corrupted/unreadable files return defaults with `read_error`. Write payloads never include `read_error`, credentials, rule bodies, or connections. Routing edges are derived from the draft and changes go through the separate policy validation/review/apply flow.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| Wrong configured Bearer key | `401 invalid_api_key` |
| No configured key on PUT | `403 config_writes_disabled` |
| Invalid shape, coordinates, node IDs, or bounds | `400 invalid_canvas_layout` |
| Atomic replacement fails | `500 canvas_layout_write_failed`; previous file remains |
| Missing/corrupt layout | Defaults; `read_error` only for unreadable/corrupt data |
| Successful layout PUT | Policy hash, config versions, baseline and overlay unchanged |

### 5. Good/Base/Bad Cases

- Good: dragging a node stores its position separately; moving a routing connection changes only the pending policy draft until reviewed and applied.
- Base: no layout file gives a usable default arrangement.
- Bad: saving coordinates inside `routing-overrides.json` or calling engine reload for a layout save.

### 6. Tests Required

- `tests/test_canvas_layout.py`: strict shape, Unicode IDs, limits, corrupt-file fallback, and read-after-write at the byte limit.
- `tests/test_gateway.py`: configured-key guard, Bearer checks, file failure, unchanged policy hash/version count and unchanged baseline/overlay bytes.
- `frontend/src/config/canvas.test.ts`: valid/invalid layout, representable connections, explicit-list protection and stale edges.
- Browser checks: actual node/edge pointer gestures, keyboard alternatives, save/reload positions and layout load/write races. Pure graph tests do not prove pointer hit-testing works. For zoomed/scrolled canvases, `elementFromPoint(clientX, clientY)` must identify the intended `data-canvas-node`; verify with real browser mouse input because synthetic `PointerEvent` dispatch does not exercise browser pointer capture faithfully.
- Browser checks for responsive canvas fitting should scroll the canvas into the visible page before measuring node bounds. Assert that the selected node's bounding box is inside the visible canvas after Fit, at a usable CSS size, rather than relying on absence of page-level horizontal overflow. When the whole board cannot fit at minimum readable zoom, focus a selected node or compact group and provide explicit pan controls; viewport changes remain layout-only and must not submit policy changes.
- `RoutingEditor` selection is the source passed into canvas fitting and the inspector. Canvas node selection callbacks must update the parent `selectedNode`; otherwise Fit may focus a stale default node even when the user selected another module. Verify selection synchronization in browser tests after switching from an advanced panel.
- The strategy-only shell is a `100dvh` grid with `auto minmax(0, 1fr)` rows. The shared header owns the auto row; the actual canvas fills the remaining row. Do not restore a fixed board height or make monitoring/appearance use this shell.
- Workspace overlays are unscaled and declare measured `[data-canvas-occlusion="top"|"bottom"]` bounds. `canvasAvailableRect()` and `unoccludedCanvasRect()` provide the common free area for Fit, reveal, toolbar and inspector placement. Account for content origin offsets in inverse pointer mapping while preserving unscaled stored node coordinates.
- The bottom drawer owns help, node/edge lists, advanced editors, source/pool metadata and review controls. Its body scrolls internally at a bounded height; all sortable rules and model drop zones remain descendants of `DndContext`. Structure tests must verify this boundary when controls move between containers.
- An anchored inspector must leave the selected node exposed, especially when it stacks above or below the node on narrow screens. Before native drag verification, `elementFromPoint` at the intended start point must reach that node rather than a panel field. A failed drag on an occluded point is not evidence of a pointer-capture or browser-tool failure.
- Browser checks include tall viewports (1430×2511), ordinary desktop and 390px/320px widths in both locales. Measure the canvas's top and bottom against the shared header and viewport, including expanded drawers and wrapped headers. No second page of editor controls should be created by drawer expansion.

### 7. Wrong vs Correct

Wrong: validate compact JSON size, then pretty-print a file larger than the read bound. Correct: validate and write a consistent encoding within the same byte limit.

## Scenario: monitoring lists with cursors and virtual windows

### 1. Scope / Trigger

Use when changing session or request monitoring list response sizes, pagination, or rendering behavior. Live session scope and retained evidence semantics remain unchanged.

### 2. Signatures

`RecordStore.session_request_page(session_id, *, limit, before)` returns `(rows, last_key, has_more)`; SQLite reads continue through the writer thread with `wait=True`. Both monitoring list routes accept bounded `limit` and an optional cursor.

### 3. Contracts

`limit` defaults to 30 and is capped at 100. Preserve `data` and `requests` response arrays; add `page_size`, `has_more`, and `next_cursor`. Session ordering is `(has_retained_request, effective_time, session_id)` descending. Request ordering is `(received_at, rowid)` descending. The request SQL fetches `limit + 1`, selects one latest decision per request, and applies the compound cursor in SQL. Session list queries remain content-free.

Cursor token contains version, endpoint, optional request `session_id`, and ordering key, signed with HMAC-SHA256 using a per-router secret. It is not an authorization credential; each page still uses the gateway Bearer check. Process restart invalidates cursors. Pagination is best-effort, with no cross-request snapshot. New/expired/updated sessions and retention pruning can shift pages; clients deduplicate stable IDs. Old callers that expect the whole list must follow `next_cursor`.

Each monitoring list has its own fixed-height virtual window. `height`, `min-height`, and `max-height` are equal per viewport breakpoint; the request timeline gets more height than the session selector. Only visible rows plus overscan mount. Session selection/refresh resets the request cursor and ignores stale responses. Keep expanded request evidence readable inside its row.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| `limit` outside 1..100 | `400 invalid_limit` |
| Malformed, tampered, wrong-endpoint, wrong-session or pre-restart cursor | `400 invalid_cursor` |
| Detail request for a non-live session | `404 unknown_session` |
| Storage unavailable | Preserve existing live-only/evidence-unavailable behavior |

### 5. Good/Base/Bad Cases

- Good: each cursor continues from the last returned compound key; a concurrent mutation may shift later pages and the UI deduplicates by stable IDs.
- Base: empty pages still occupy the fixed-height window and display empty/loading states inside it.
- Bad: loading all retained request bodies and slicing in Python, returning prompt fields in sessions pages, or treating a cursor as a substitute for Bearer authorization.

### 6. Tests Required

- `tests/test_records.py`: equal timestamps, rowid tie-break, `limit + 1`, next key, and no full-history decode before slicing.
- `tests/test_gateway.py`: both endpoints' limits/cursors, HMAC tamper and endpoint/session scope, Bearer auth on every page, memory-only session pages, no context leakage and storage degradation.
- Frontend tests: fixed-height values, overscan row bounds, next-page cursor calls, stable-ID dedupe, refresh/session-switch races, retry and expanded evidence.
- Browser tests must use actual scroll actions and record follow-up network cursor requests; pure windowing tests are not pointer/scroll acceptance.

### 7. Wrong vs Correct

Wrong: `session_request_evidence(id)[:limit]` loads all retained evidence, then slices. Correct: issue a bounded SQL query in `session_request_page` with the compound `(received_at, rowid)` cursor.

## Frontend conventions

### 1. Scope / Trigger

Use for changes to live-session listing, retained request pages or virtualized list rendering. Preserve live-only scope and evidence privacy.

### 2. Signatures

```python
RecordStore.session_request_page(
    session_id: str, *, limit: int, before: tuple[float, int] | None
) -> tuple[list[dict[str, Any]], tuple[float, int] | None, bool]
```

Both `GET /v1/routing/sessions` and `GET /v1/routing/sessions/{session_id:path}/requests` accept `limit` and `cursor`.

### 3. Contracts

`limit` defaults to 30 with a maximum of 100. The response retains `data` or `requests` and adds `page_size`, `has_more`, and `next_cursor`. A request without a cursor receives the first bounded page; clients needing all rows must follow cursors.

Sessions sort `(has_request, effective_time, session_id)` descending. Evidence-present and memory-only rows occupy separate groups; monotonic update times are never presented as dates. The session response projects only safe metadata and excludes prompt, messages, event/context bodies, and adapter state.

Requests sort `received_at DESC, rowid DESC`. The writer-thread query binds cursor parameters and fetches `limit + 1`, choosing one latest decision per request. Never fetch/decode all retained bodies to slice in Python.

Cursors contain a version, endpoint, optional session ID, and ordering key. HMAC-SHA256 uses a random per-router secret; restart invalidates tokens. Every page still checks Bearer authorization. Paging is best-effort without cross-request snapshots: concurrent changes may shift pages or cause gaps. Client append deduplicates by stable IDs. Manual refresh starts a new traversal.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| Limit outside 1..100 | `400 invalid_limit` |
| Malformed, forged, other-endpoint/session, or pre-restart cursor | `400 invalid_cursor` |
| Detail session expired/evicted | `404 unknown_session` |
| Evidence disabled/degraded | Live session list remains; detail has no evidence rows |
| Exhausted page | `has_more: false`, `next_cursor: null` |

### 5. Good/Base/Bad Cases

- Good: the next page follows the last compound key; the client ignores stale responses after session changes.
- Base: an empty list keeps its fixed-height window and explanatory state.
- Bad: offset paging over changing activity order, skipping authorization for a signed cursor, or treating best-effort traversal as a snapshot.

### 6. Tests Required

- Backend: timestamp ties, page bounds, static traversal completeness, signed-token validation, cross-session rejection, slash session IDs, memory-only sessions and storage degradation.
- Frontend: fixed `height == min-height == max-height`, virtual row bound, duplicate suppression, stale response rejection, refresh during next-page fetch, keyboard focus and visible retry controls.
- Browser: scroll beyond the first page, inspect network cursor calls, expand request evidence and check that it remains accessible inside the fixed viewport.

### 7. Wrong vs Correct

Wrong: `session_request_evidence(id)[:limit]` loads every retained payload. Correct: call `session_request_page` through the existing writer queue and apply the compound key predicate in SQL.

## Frontend conventions

- One page, no client-side router. View state switches between monitoring and
  configuration.
- The gateway credential lives in a module-level variable in `src/api.ts` only.
  Never persist it in `localStorage`, `sessionStorage`, a cookie, or the URL.
  `localStorage` may hold only the validated locale identifier under the fixed
  dashboard locale key.
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
- Do not log startup announcements before Uvicorn applies `log_config`. Emit them
  from the lifespan handler, or the operator never sees them.
- Do not track generated `jev_gateway/static/` files. Build them from
  `frontend/src` before packaging, then run `--check` to detect stale local
  output.
- Do not let `frontend/node_modules` reach the Docker build context. `COPY
  frontend/ ./` would replace the container's musl native bindings with the
  host's and break the image build, so `.dockerignore` excludes it.
