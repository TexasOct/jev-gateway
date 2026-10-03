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

`models.json` is the baseline. Routing-overlay, theme, and canvas-layout APIs
leave its bytes unchanged. Provider-management writes have a separate contract
and must not expand the routing-overlay schema.

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
- Environment key: `gateway.api_key_env` must be configured for routing-overlay
  and canvas-layout writes. Theme writes follow the ordinary gateway Bearer rule
  and remain available without a configured key. The key is resolved at catalog
  load; no new variable is introduced.
- The overlay file and theme file are created with the process umask.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| Missing or wrong Bearer token, key configured | `401 invalid_api_key` |
| Routing-overlay or canvas-layout write attempted with no `gateway.api_key_env` | `403 config_writes_disabled` |
| Theme save/reset with no configured gateway key | Normal theme write response |
| Read route with no key configured | Normal response, unchanged from before |
| Overlay shape or catalog validation fails | `400 invalid_configuration`, active catalog untouched |
| Merged catalog changes `storage` | `400 invalid_configuration` (`restart_required` semantics) |
| Write fails after the file was replaced | previous file content restored, previous catalog reloaded, `500 overlay_apply_failed` |
| Theme payload is not a hex seed or has unknown keys | `400 invalid_theme` |
| Assets absent from the install | `404 dashboard_not_built`, startup logs a warning |
| No overlay file present | Baseline behavior; `overlay.applied` is `false` |

Routing-overlay and canvas-layout writes require the configured-key guard because
`require_gateway_key` returns without checking when no key is configured. Theme
save/reset uses that ordinary authorization rule as a separate preference boundary.

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

## Scenario: independent theme preferences

### 1. Scope / Trigger

Use when changing theme persistence, theme authorization, Settings color controls
or their pending/read/write state. Theme preferences do not change the routing
policy, provider catalog or credential files.

### 2. Signatures

`GET`, `PUT` and `DELETE /v1/dashboard/theme` live in `dashboard.py`.
`read_theme`, `validate_theme_shape`, `write_theme` and `remove_theme` own the
adjacent `dashboard-theme.json`. `AppearanceView` consumes the theme seed and
loading/error/notice callbacks from `useDashboardTheme` through `AppShell`.

### 3. Contracts

PUT accepts only `{version: 1, seed: "#rrggbb"}` and stores a lowercase hex seed.
GET returns `{version, seed, read_error}`; DELETE returns the default seed and
`removed`. All three routes call `authorize(state.gateway_api_key, authorization)`.
Without a configured gateway key, theme save/reset is allowed. A configured key
still requires a correct Bearer token. Routing/provider `write_available` is not
a theme-editing capability; canvas and catalog mutations keep `require_write`.

Settings keeps three peer preference rows and three circular color presets.
Selection uses a separated outer accent highlight, with no central tick or black
selected border. The custom native color control is a peer circular multicolor
affordance with a decorative Lucide Pencil, localized accessible name and visible
keyboard focus. A non-preset seed highlights the custom control. Native input
events change the preview draft; change commits one write. Loading/pending
temporarily disables color controls. Save/reset shares the existing pending guard,
and stale reads must not overwrite the latest saved seed. No additional browser
storage, stylesheet entry, palette builder or CSP exception is introduced.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| No gateway key configured | Theme GET/PUT/DELETE available; configuration writes remain blocked |
| Configured key with missing/wrong Bearer | `401 invalid_api_key`, no theme file change |
| Invalid version/hex or unknown payload key | `400 invalid_theme`, no file replacement |
| Theme PUT fails during atomic replacement | `500 theme_write_failed`, previous file remains |
| Routing/provider write capability false | Theme controls remain usable after theme loading |
| Theme operation pending | Color controls disabled; no duplicate commit |
| Late theme read or failed write | Preserve latest valid state and report the current operation |

### 5. Good/Base/Bad Cases

Good: a default installation changes its theme while routing edits remain locked.
Base: an installation with a gateway key uses the same Bearer for theme reads and
writes. Bad: removing the global configuration-write guard to enable color edits.

### 6. Tests Required

Gateway tests cover no-key save/read/reset, configured-key missing/wrong denial,
unchanged baseline/overlay/policy/version count, and unchanged canvas/routing/provider
guards. Browser tests cover Settings before routing capability loads, false
`write_available`, native input/change one-write behavior, custom selection,
computed circular geometry and outer highlight, keyboard focus, both schemes and
locales, 320px wrapping, stale reads, pending writes and failure/retry.

### 7. Wrong vs Correct

Wrong: theme PUT uses `require_write`, or Appearance uses the routing
`write_available` flag. Correct: theme routes use the ordinary `authorize` callback;
Appearance disables color edits only while the theme is loading or pending.

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
- `frontend/src/features/routing/model/canvas.test.ts`: valid/invalid layout, representable connections, explicit-list protection and stale edges.
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

## Process-local route activity

`GET /v1/routing/activity` is independent of session listing and retained evidence. `jev_gateway/activity.py` owns a bounded, lock-protected registry of in-flight request tokens keyed by immutable `(strategy, route, provider, upstream_model)` destination. The gateway registers after routing selects a destination and before the upstream call; stream tokens remain active through response delivery, including upstream wait and chunk gaps. Non-stream tokens end when the synchronous upstream call returns or fails. Completion, error, cancellation and disconnect cleanup are idempotent. ASGI response-level cleanup handles failures before body iteration and send failures.

The projection carries an opaque process instance ID, completeness flag and aggregate in-flight request/stream counts only. It contains no request/session IDs or content. `complete: false` suppresses paths and means unknown; `paths: []` with `complete: true` means no observed in-flight requests on known attributed paths for that process. It does not establish global idle or worker-cluster coverage. Registry bounds are independent of sessions and evidence storage, survive catalog reloads, and clear at process shutdown. Chat serving remains independent of instrumentation capacity.

## Frontend conventions

- One app entry, no client-side router. Authentication has a standalone connection
  page; connected view state switches between Monitoring, Strategy, Provider and
  Settings. At wide widths, center and bound the Monitoring view to 1280px,
  Provider and Settings content to 768px, and the Strategy workspace to 1440px.
  Keep the strategy shell full viewport height and preserve canvas pan, fit,
  node-size and hit-target behavior within the centered workspace.
- Keep `App.tsx` as the state/API orchestration boundary. Extract substantial
  presentational views into view-owned components with typed props and narrowly
  scoped CSS; pass existing callbacks through rather than duplicating API,
  persistence, or request-state logic in the view.
- Use progressive disclosure for dense operational detail: summarize the
  selected live session and known recorded outcome first, then keep source
  evidence and provider observations available through accessible controls.
  Missing evidence remains unknown/unavailable and must not be relabeled as a
  live request. When a virtual list uses fixed-height rows, preserve its geometry
  and keep any keyboard-focused row mounted until focus moves elsewhere.
- Overview timestamps and outcomes describe recorded request evidence, not live
  process health. A latest-session preview remains explicitly unselected until
  the operator chooses it. In request detail, a non-null selected session with a
  null detail payload and no load error renders loading copy; only a null
  selection renders "No session selected". Keep loading, empty evidence and
  failed reads distinct in both locale catalogs and synthetic rendering tests.
- The gateway credential lives in a module-level variable in `frontend/src/shared/api/client.ts` only. API response and write types live in
  `frontend/src/shared/api/types.ts`, which has no credential or runtime state.
  Never persist it in `localStorage`, `sessionStorage`, a cookie, or the URL.
  `localStorage` may hold only the validated locale identifier under the fixed
  dashboard locale key.
- Pure editor logic belongs in `frontend/src/features/routing/model/draft.ts` and pure palette logic in
  `frontend/src/shared/theme/palette.ts`, so both are testable without a DOM. The overlay payload
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
- For strategy-level monitoring counts, enumerate strategies from
  `/v1/routing/strategies`, then traverse every `/v1/routing/sessions` cursor
  page. Deduplicate by stable `session_id`, group by latest known strategy and
  provider/upstream model (recorded route fallback), and label results as a
  current live-session snapshot. A live-session count is not request volume or
  historical distribution. Keep missing attribution and incomplete/storage
  error states explicit; never certify zero until traversal completed.
- Keep provider-summary failures independent from session-list failures. A
  missing provider observation must not suppress valid live-session counts.
- When a session cursor page fails, preserve the last successful page/cursor so
  retry can resume the complete traversal. When storage reports unavailable,
  keep counts uncertified and expose a recovery action rather than rendering a
  verified zero.
- Theme save/reset operations share a single pending guard. Clear prior notices
  when a write begins, surface the current failure in the appearance view, and
  prevent stale theme reads or overlapping writes from replacing the latest
  saved seed in the UI. Clear the view error when a new operation begins and
  render the latest operation's notice/error consistently.
- The native color input's `input` event updates a local picker draft; its
  `change` event commits the theme once. React's synthetic color `onChange`
  also fires during native input previews. Keep the native change listener and
  its callback-ref cleanup so previews do not write and rerenders do not add
  duplicate listeners. Browser regressions must dispatch input and change
  separately and assert zero preview PUTs and one committed PUT.
- Status colors used for small text must meet the normal-text contrast target
  (4.5:1) on every surface where rendered. Do not mark 3:1 large-text contrast
  as passing for small status labels.

## Standalone connection and authentication admission

`App.tsx` owns connection attempts, draft input, errors and unauthorized callbacks.
`AppShell` renders the connection page exclusively while access is unresolved or
a key is required. The dashboard header, navigation and business panels do not
mount alongside the connection form. Presentational connection controls reuse
the existing palette and UI primitives; they do not own API or storage logic.

`setCredential(string | null)` remains the single module-memory write path.
Connection submission trims input and rejects empty values without a request.
There is no new key-length rule, authentication endpoint, router or persisted
session. Initial access probing and submitted validation share a pending guard;
duplicate forms and late initial responses cannot supersede an active attempt.
The pending page remains visible until the attempt succeeds. Clear the draft
after successful connection. Locale preference remains the only stored value.

Initialize access as unresolved even when the client module already has a key.
Keep built-in connection errors as message keys resolved with the current locale;
changing language must update existing feedback without another access probe.
Preserve arbitrary API/network error text separately from those message keys.

| Condition | UI and request behavior |
| --- | --- |
| Blank key | Local error, no validation request |
| Validation pending | Connection page stays visible, controls prevent duplicate submissions |
| Validation succeeds | Enter the connected shell after awaited success |
| Wrong key or failed network read | Stay on connection page with an accessible error and retry |
| Later 401 | Clear credential, stop route activity and return to connection page |
| No gateway key configured | Initial successful anonymous data access admits the console |

`App.run(work)` catches errors and resolves `Promise<void>`. Its completion is not
proof that `work` succeeded. Authentication admission belongs inside the successful
awaited work, or a separately owned explicit success result. Do not clear
`needsKey` unconditionally after `run` resolves or before the validation requests
finish. Preserve the error and credential cleanup owned by unauthorized handling.

Browser regressions must assert absent dashboard navigation/business panels
during pending/failed validation, delayed and duplicate submit behavior, initial
probe/manual attempt ordering, password and Enter semantics, trimmed Bearer,
network retry, 401 activity cessation, memory loss on refresh and anonymous
compatibility. Inspect URL, cookies and both storage objects for synthetic-key
absence. Cover both locales, desktop/320px and system light/dark schemes with
computed overflow and visible keyboard focus. Static structure tests complement
these interactions; they do not establish authentication success.

Use portable per-test output paths for screenshots and private evidence. For
computed button contrast, wait for active color transitions to finish and assert
the enabled control's settled foreground/background at opacity 1. An intermediate
transition frame does not establish the final palette's contrast ratio.

## Frontend Tailwind and geometry boundaries

`frontend/src/styles/index.css` is the only imported stylesheet. It imports Tailwind theme and utilities without Preflight, then `tokens.css`, `base.css`, `shell.css`, `monitoring.css`, `routing.css`, `canvas-geometry.css`, `appearance.css`, and `virtual-list.css` in that order. Keep exactly these nine files; an owner file can be comments-only. `@theme inline` maps utility colors to the runtime palette variables applied by `frontend/src/shared/theme/palette.ts`. `data-scheme` selects the light/dark scheme; do not introduce a static `.dark` theme, remote assets, or browser theme persistence.

Component-specific static appearance belongs in JSX Tailwind utilities, including canvas geometry, SVG paint, pointer-hit rules, mobile provider-table transformation, and virtual-list dimensions. CSS holds the small shared element/control defaults, runtime theme variables, Tailwind configuration, and named keyframes (`node-drag-pulse`, `configured-route-trace`, `monitoring-route-flow`). Keep dynamic measured coordinates (`top`, `left`, overlay bounds), per-row inline position/height, SVG viewBox, and data-derived colors on their elements. A class name such as `trace-stage-missing` or `configured-flow-active` may remain as a test/query hook only; it must not be relied on for presentation unless a CSS rule is documented in the allowlist. Assert visual states using emitted Tailwind classes or browser computed styles, not selector-marker presence alone. Do not substitute `@apply` or a generic selector-to-class registry for component utilities.

The session list viewport is 480px on desktop and 280px at widths of 720px or less; the request timeline is 480px on desktop and 62vh at those narrow widths. Session and request rows stay 132px and 360px respectively. Emit the 280px utilities only for session lists and the 62vh utilities only for timelines: Tailwind's generated ordering does not guarantee that two competing `max-[720px]` height utilities on one element resolve by class-string order. Keep all three viewport properties (`height`, `min-height`, `max-height`) equal. Preserve focused-row retention and cursor pagination while moving the static row positioning to utilities.

Check the emitted behavior with an isolated synthetic browser fixture: `getComputedStyle` of both list viewport types and rows at desktop/320px, `elementFromPoint` and real pointer drag on the 190 × 56px canvas nodes, mobile provider `td[data-label]::before` with a populated provider fixture, keyboard focus, reduced-motion configured flow and request trace, and page overflow in both locales/schemes. Source-string tests alone do not detect utility precedence or missing pseudo-element labels.

## Common mistakes

- Do not call `load_catalog()` directly on a code path that should honor the
  overlay. Use `load_catalog_with_overlay()`.
- Routing edits must write the overlay and leave `models.json` unchanged. Provider
  management uses its own baseline mutation boundary; never put provider or
  credential operations in a routing overlay.
- Do not send a partial overlay. The server replaces the rule list wholesale and
  replaces a named model's tags, so a partial payload reverts whatever it omits.
- Routing/provider/canvas mutation routes require the `gateway.api_key_env`
  guard. Theme preference save/reset deliberately uses ordinary gateway
  authorization and is allowed without a configured key.
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
