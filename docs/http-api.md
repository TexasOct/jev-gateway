# JEV Gateway HTTP API

JEV Gateway serves an OpenAI-compatible chat endpoint plus a small routing
inspection API. All routes live in `jev_gateway/gateway.py` and the dashboard
router in `jev_gateway/dashboard.py`. This document is the endpoint contract; the
routing behavior behind each decision is in [`routing-design.md`](./routing-design.md).

## Authentication

Set `gateway.api_key_env` in `models.json` to a credential reference resolved from
neighboring `credentials.json`, legacy `.env`, or the captured process environment,
in that order. When the reference resolves to a value, every `/v1`
route and `GET /healthz` require it as a Bearer token:

```http
Authorization: Bearer <key>
```

A missing or wrong token returns `401` with `error.code: "invalid_api_key"` and a
`WWW-Authenticate: Bearer` header. When `gateway.api_key_env` is unset, the
gateway serves without inbound authentication. A declared but empty or missing key reference
is a configuration error. The comparison is constant-time.

The `GET /dashboard` HTML shell is always served; the data endpoints it calls are
protected by the same rule. When a key is required, the dashboard shows a
standalone connection page with password input and connection status. Navigation
and business panels become available after validation succeeds. Failed attempts
remain on the connection page for retry; a later `401` returns there and stops
activity polling. The key stays in JavaScript memory and is sent through the
`Authorization` header. Gateways without inbound authentication still open the
console after their initial data access succeeds when setup is already complete.
A fresh default installation shows the initialization form first; providers and
models can be configured after entering the console.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Liveness and configuration snapshot: status, catalog names, policy mode, default strategy, registered strategies, session strategy, storage state, live session count. |
| `GET` | `/dashboard` | Bundled operator UI (a Vite build shipped inside the package) served by the gateway process itself. |
| `GET` | `/v1/setup` | Initialization status and optional configuration progress. |
| `POST` | `/v1/setup` | Set the first management key through local bootstrap. |
| `GET` | `/v1/models` | OpenAI model list: registered strategy names first, then enabled concrete catalog model IDs. |
| `GET` | `/v1/routing/policy` | Active policy snapshot plus `session_strategy`. |
| `GET` | `/v1/routing/strategies` | Registered strategies and their policies. |
| `POST` | `/v1/routing/preview` | Route a chat request through one or more strategies without serving it. |
| `POST` | `/v1/routing/reload` | Re-read the catalog file and apply reloadable settings. |
| `GET` | `/v1/routing/decisions/{decision_id}` | One decision in the bounded in-memory log, not a SQLite lookup. |
| `GET` | `/v1/routing/activity` | Bounded process-local in-flight request and stream counts by routed model path. |
| `GET` | `/v1/routing/sessions` | Live sessions enriched with the latest retained request and decision. |
| `GET` | `/v1/routing/sessions/{session_id}` | Live snapshot for one session. |
| `GET` | `/v1/routing/sessions/{session_id}/requests` | Live snapshot plus retained request evidence, newest first. |
| `GET` | `/v1/routing/providers/summary` | Configured providers and retained attempts in a fixed rolling 15-minute window. |
| `GET` | `/v1/provider-configuration` | Safe provider/model configuration, presets, supported types, write availability, and an opaque revision. |
| `PUT` | `/v1/gateway-credential` | Initialize or replace the gateway key through the managed credential owner. |
| `POST` | `/v1/provider-configuration/validate` | Validate provider changes or confirmed model imports without writing or activating them. |
| `PUT` | `/v1/provider-configuration` | Apply validated provider changes and confirmed model imports to the baseline and credential file. |
| `POST` | `/v1/provider-discovery` | Fetch candidate upstream models for a saved or in-memory LLM provider. |
| `POST` | `/v1/provider-connection-test` | Test a saved or candidate LLM provider through a bounded model-listing request. |
| `POST` | `/v1/provider-metadata` | Look up price, capability, and limit suggestions with source information. |
| `GET` | `/v1/routing/configuration` | Editable routing surface: rule order, labels and their pools, every model with tags and priority, plus overlay state. |
| `POST` | `/v1/routing/configuration/validate` | Validate an overlay payload against the full catalog pipeline without applying it. |
| `PUT` | `/v1/routing/configuration` | Validate an overlay payload, write it beside `models.json`, and reload. |
| `DELETE` | `/v1/routing/configuration` | Remove the overlay and reload the baseline `models.json`. |
| `GET` | `/v1/dashboard/canvas-layout` | Versioned whiteboard coordinates and viewport, with defaults and `read_error` when the layout is corrupt. |
| `PUT` | `/v1/dashboard/canvas-layout` | Validate and atomically store whiteboard layout without reloading routing policy. |
| `GET` | `/v1/dashboard/theme` | Stored theme seed, or the default when no file exists. |
| `PUT` | `/v1/dashboard/theme` | Store one hex seed for the dashboard palette. |
| `DELETE` | `/v1/dashboard/theme` | Remove the stored seed and return to the default palette. |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completion, routed through a strategy. |

`GET /healthz` returns HTTP `200` with `status: "degraded"` when the record store
has an error; `storage.error` carries the message and serving continues. This is
not an upstream provider health check.

`POST /v1/routing/preview` requires the same `model` and `messages` fields as chat
and accepts an optional non-empty `strategy` array. That array chooses the
strategies to compare. Without it, a strategy name in `model` previews only that
strategy; a concrete catalog model ID is previewed across all registered strategies
as a manual selection. Unknown model IDs still return `404`. It returns
`{"default": "<name>", "preview": [...]}` without serving a chat completion or
recording a request, decision, or outcome. Routing uses detached session snapshots;
looking up an expired session can evict it. Enabled decision-backed strategies can call
the configured decision provider, including during preview.

`GET /v1/routing/activity` returns `{object: "routing.activity", scope: "process", instance_id, complete, paths}`. Each path has `strategy`, `route`, `provider`, `upstream_model`, `in_flight_requests` and `in_flight_streams`. It is Bearer-authorized, uses `Cache-Control: no-store`, does not consult evidence storage, and contains no request or session identifiers. A path appears only while at least one request to that exact destination is in progress. Non-stream requests remain active during the synchronous upstream call; streams remain active until their response iterator completes, fails or is cancelled. An incomplete result suppresses all path claims. Empty complete results mean no observed in-flight requests on attributed paths in this serving process, not global gateway idle. Multiple workers are not aggregated.

The dashboard reads `GET /v1/routing/sessions`,
`GET /v1/routing/sessions/{session_id}/requests`, and
`GET /v1/routing/providers/summary`. Storage-disabled or degraded responses carry
`evidence_available: false`; provider metrics are null instead of zero. The
session list still shows live state, and session detail returns an empty request
list when evidence is unavailable. The requests route accepts slashes in session
IDs (`{session_id:path}` internally); the single-session snapshot route does not.

New previews and decisions expose `defaulted: true|false` beside the final label.
Session list rows, live snapshots and retained request decisions expose this
optional boolean when their selection source is known. True identifies the
global fallback; false preserves an ordinary configured label, including a
literal label named `default`. Legacy evidence with unknown source omits it.
Retained decisions read this flag from the existing `signals_json` column;
there is no database-column migration. Pins retain the source after event-history
eviction, and the list flag describes the selection whose label it displays.

Both monitoring lists accept `limit` (default 30, maximum 100) and an opaque
`cursor`. Without a cursor, each returns the first page. Responses retain their
existing `data` or `requests` array and add `page_size`, `has_more`, and
`next_cursor` (null after the last page). A malformed cursor, a cursor from the
other endpoint, or one from another session returns `400 invalid_cursor`; Bearer
authentication follows the existing gateway Bearer rule on every page. Cursors
are signed with a process-local secret, so a gateway restart invalidates them;
restart the traversal from the first page after `invalid_cursor`. Clients that
previously assumed the arrays contained all rows must now follow `next_cursor`.
Requests sort by `received_at DESC, rowid DESC`.
Live sessions sort by presence of retained request evidence, then latest request
time (or live monotonic update time if absent), then session ID, all descending.
Session list queries do not read prompt or context content. Pages are best effort:
the server does not keep a cross-request snapshot. New or expired sessions and
retention pruning can shift later pages, so clients should deduplicate by stable
session and request IDs; concurrent changes can leave gaps.

The built app is mounted at `/dashboard` and comes up with the service: the same
process serves it, there is no second server to start. `GET /dashboard` returns
the shell with `Cache-Control: no-store`; hashed assets under
`/dashboard/assets/` are immutable. The page needs no inline script, so
`Content-Security-Policy` keeps `script-src 'self'`. Its browser bundle keeps the
gateway key in memory only and never writes it to a URL, cookie, or browser
store. When the assets are missing from the install, `/dashboard` returns `404`
with `dashboard_not_built` and startup logs a warning.

## Configuration writes

### Initialization

The packaged default contains strategy plans with no provider instances or
models. The gateway and dashboard can start in that state. Adding suppliers
and models is optional during initialization and can be done later.

`GET /v1/setup` returns `{required, local_setup_available, revision,
has_providers, has_models, routing_ready, next_step}`. `next_step` is
`gateway_key`, `provider`, `model`, `routing`, or `ready`; progress describes
configuration and does not block console access. `routing_ready` means a global
default model is configured or all default-strategy label pools have models. With a configured gateway key,
this read follows the normal Bearer rule.
Setup reads and CLI setup can inspect an empty declared gateway reference for
repair. Runtime startup and reload still require its effective value; losing a
configured key cannot silently enable anonymous serving.

`POST /v1/setup` accepts exactly `{expected_revision, api_key}`. The key contains
16 to 8192 visible ASCII characters without whitespace. Both HTTP setup endpoints
require the original listener and request peer to be loopback, one valid loopback
Host, an optional matching Origin and no forwarding headers. Reloading the file
host does not change bootstrap eligibility.
These checks also apply to malformed anonymous setup requests.
Remote deployments can run `jev setup` locally before connecting to the
dashboard. Setup delegates to the same managed credential owner as
`PUT /v1/gateway-credential`. It stores only the key reference in `models.json`
and the value in protected `credentials.json`, preserves a declared reference name,
and uses `JEV_GATEWAY_API_KEY` only when none is declared. It prepares and
activates the catalog, and restores files and runtime state on failure. Stale
revisions conflict. Setup cannot replace an effective management key. An empty
declared reference can be repaired without changing its name. Responses
never include the key. Successful setup returns the setup projection above.
An ineligible local request returns `403 setup_local_only`; an existing key returns
`409 setup_already_configured`. Validation uses `400 invalid_configuration`,
revision conflicts use `409 revision_conflict`, and persistence or activation
failures use `500 provider_configuration_failed`. These remain separate from
the credential endpoint's errors.

With no configured models, chat and preview return `503 setup_incomplete`
without calling an upstream service. Provider saves, model imports and routing
assignments can proceed separately. Dashboard saves activate changes; reload
rereads the same files after manual edits.

Settings saves the single global default model through the existing guarded
provider-configuration transaction. The operation is
`{action: "set_default_model", model: "provider/upstream_model"}`; use `model: null`
to clear it. The safe snapshot includes `defaults: {default_model: string|null}`.
The model ID must be an exact configured canonical ID. Validation, stale-revision
and rollback rules are the same as other baseline operations, and the routing
overlay does not store this value.

When a matched tag has no models, every strategy inherits this global default;
preview, response route headers, records and sessions report final `label`/`tier`
as `default`, with `defaulted: true`. Views display Default/默认 for this reserved
result and preserve a configured literal `default` label when `defaulted: false`.
Per-strategy defaults are deferred.
If no global default is configured when this fallback is needed, chat/preview
return `503 setup_incomplete` before generation. A populated tag pool continues
to use normal selection rules without requiring a global fallback.

### Routing and preferences

`POST /v1/routing/reload` rereads the catalog and any existing overlay; it keeps
its existing authentication behavior and does not write either file. The routing
`PUT`/`DELETE` routes change live routing and write or remove
`routing-overrides.json` beside the active `models.json`. Theme `PUT`/`DELETE`
routes write or remove `dashboard-theme.json` in the same directory.
The canvas layout `PUT` writes `routing-canvas-layout.json` beside `models.json`.
Its strict version 1 body contains `nodes` keyed by stable canvas IDs with bounded
integer `{x, y}` positions and a bounded integer `{x, y}` viewport. Missing or
invalid layout loads default coordinates with a `read_error` for corrupt data.
The layout write has the same Bearer and configured-key guard as routing writes;
it never reloads the engine, registers a config version, or edits the routing
overlay. The layout is installation-wide: all browsers read the same file, with
atomic last-writer-wins saves rather than revision-based concurrency protection. Connections remain constrained to the ordered first-match matrix;
policy changes still use the routing configuration validation and apply routes.
The strategy view fills the viewport below the shared dashboard header. Its canvas
contains the title and warning controls, a floating selection/pan/add-rule toolbar,
and a bounded bottom drawer for help, node and edge lists, advanced editors and
review actions. The drawer starts collapsed and scrolls internally when expanded.
Selected-node details open in a size-capped, scrollable panel beside the node;
changing tools affects canvas interaction only, not the routing strategy.
The canvas renders question results, the ordered match/unmatched rule chain,
fallback, labels, and model pools at the saved coordinates. Inputs appear on the
left and named outputs on the right. Nodes grow with the number of question
options or pool members so handles remain separated. Question-option outputs
feed the same ordered rule entry; the strategy still evaluates the complete
answer set and uses the first matching rule. Valid answers with no matching rule
use the first policy label and the strategy's default selection mode. Failed or
invalid decision answers use the separately configured fallback. These paths
remain distinct when no conditional rules are configured.

Select a wire or output port to choose a destination in the canvas connection
panel, or drag an output onto a compatible input. Reconnecting a match edge
changes its rule or fallback label; reconnecting an unmatched edge moves a later
rule immediately after its source. Disconnecting a match leaves an empty output
in the pending draft. Reconnect it to a label before reviewing or applying that
draft. Tag-resolved label edges can add, move, or remove model membership while
retaining at least one model; explicit-model labels and the generated rule-entry,
decision-failure and final default links show their editing restrictions. The
connection panel and edge list provide keyboard controls, and Escape cancels a
connection edit. The strategy requires choice questions with instructions and at
least two described criteria; incomplete questions must be repaired before review.

Node positions can also be moved with Alt + arrow keys. Arrange the canvas or
align selected nodes to keep the flow readable. These actions save layout
separately from policy edits. Policy edits remain pending until validation,
review, and explicit confirmation. A failed layout write reports an error and
restores the last confirmed layout instead of silently claiming that the new
coordinates persisted.

An initial layout GET failure or `read_error` does not authorize an empty-layout
PUT. The Dashboard blocks layout editing and retries GET to obtain a trustworthy
snapshot first. A valid empty or missing-file default remains editable. Stale
read/write callbacks from a suspended connection cannot replace the current
snapshot or deliver an obsolete authentication failure after reconnection.

Configured path and monitoring views show inherited global destinations for empty
selectable pools. These dashed edges have no membership handle and cannot be
reconnected or removed. They do not add tags or write inherited membership into
an overlay. `GET /v1/routing/configuration` includes the safe root `defaults`;
edit its global model in Settings.
Routing, canvas-layout, and theme writes leave `models.json` unchanged.

Routing overlays are validated before they touch disk. The overlay is merged into the
`models.json` document and passed through the normal parser and strategy
registry. Unassigned tag-based label pools remain valid editable states. An edit
that names an unknown model, label or selection mode, or changes storage settings
is rejected with the parser's
own message and the active catalog is left alone. A write that fails after the
file was replaced restores the previous content, existence and permission bits,
with the exact previous catalog and strategy registry, then returns
`500 overlay_apply_failed`. Failed apply/reset activation leaves existing
`config_versions` rows and request/session history unchanged. Successful
activation publishes the accepted content-addressed configuration after the
overlay transaction completes. Recording remains best effort; its failure does
not undo a committed overlay or turn that successful response into a write failure.

Dashboard routing and canvas-layout writes require a configured `gateway.api_key_env`.
Without one, they return `403 config_writes_disabled`. Their read routes remain
available under the existing authentication rule.

Theme `PUT`/`DELETE` follows the gateway's normal Bearer rule: saving or resetting
the theme is allowed when no gateway key is configured. With a configured key,
a missing or incorrect Bearer token returns `401 invalid_api_key`. The theme
payload remains `{version: 1, seed: "#rrggbb"}`, stored separately from routing
and provider configuration. Routing/provider `write_available` does not control
the Settings color picker.

The overlay shape and merge rules are documented in
[`models-config.md`](./models-config.md).

## Provider configuration

Provider management is separate from routing-overlay edits. Its apply route can
write `models.json` and the adjacent credential file; routing-overlay, theme, and
canvas-layout operations retain their baseline-byte invariant. The effective
catalog must pass the existing parser, overlay merge, and strategy registry
before a management change is activated. Storage and gateway settings cannot be
changed through provider operations.

`GET /v1/provider-configuration` returns
`{revision, write_available, defaults, gateway, gateway_bootstrap_available, providers, decision, models, presets, provider_types, decision_protocols}`.
The revision is opaque and detects baseline, overlay, and credential-file changes.
Restarting the gateway invalidates revisions issued by that process.
`gateway` exposes only `{api_key_env, has_api_key}`. `gateway_bootstrap_available`
describes whether this request can initialize an unconfigured local gateway.
Provider responses expose declared credential references and effective presence,
never credential values. Advanced provider parameters use a safe projection.
Presence uses `has_api_key`; model views use `name` for their qualified ID.
Presets and custom forms share the same operation format; `brand_id` identifies a
supplier and `type` selects the LLM transport. Decision providers select their
`protocol` independently; the supported protocol is `system_one`.

LLM presets come from the same registry as the CLI. Each preset includes its
display name, brand/icon IDs and transport configuration, with optional `aliases`,
`docs_url`, bilingual `setup_instructions`/`setup_instructions_zh` and
`setup_fields`. A setup field declares `key`, `target` (`params` or `param_env`),
`label`, `label_zh`, `required` and optional `placeholder`. These fields describe
the unsaved template; omit them from provider writes. Null `api_base` uses the
native transport endpoint, while an empty template endpoint requires an
account-specific URL. Null `api_key_env` declares no primary API-key reference.
An explicit `icon_id` overrides automatic brand artwork without changing brand,
transport, instance or model IDs; unknown icon IDs remain valid display metadata.

Both validation and apply accept `{expected_revision, operations}`. An operation
upserts a provider, deletes an unreferenced provider, imports or edits models,
or sets the global default model as described under Initialization.
For example, a candidate LLM provider can be submitted as:

```json
{
  "expected_revision": "<revision from GET>",
  "operations": [
    {
      "action": "upsert",
      "kind": "llm",
      "provider": {
        "id": "my-service",
        "display_name": "My service",
        "type": "openai",
        "api_base": "https://service.example/v1",
        "api_key_env": "MY_SERVICE_KEY",
        "allow_private_network": false
      },
      "credential": {"action": "set", "value": "<new secret>"}
    }
  ]
}
```

Credential actions are `keep`, `set`, and `clear`. `set` requires a non-empty
value; an empty string is not an instruction to keep the existing value.
Set writes the protected neighboring `credentials.json` store. Clear removes the
name from both that store and the local `.env` entry. An inherited environment value may still
supply the declared reference, and `has_api_key` reports its effective presence.
It does not remove a value supplied by the launching shell.
JSON values are literal, including `${NAME}`. Existing `.env` records retain
their ordered interpolation and managed-literal marker rules. JSON values take
precedence over local dotenv and inherited process values. Resolution uses a local
mapping without changing `os.environ`; full file semantics are in
[credential configuration](credentials.md).
Omitted advanced `params` and `param_env` remain unchanged on an existing
provider. Deletion uses `{action: "delete", kind: "llm"|"decision", id}` and
rejects remaining references instead of removing models or strategies implicitly.
Clearing a credential must not invalidate another configured reference.

Model imports use
`{action: "import", provider_id, models: [...], confirmed: true}`. Each model has
an `upstream_model`, explicit finite nonnegative `cost.input_per_million` and
`cost.output_per_million`, five explicit capability booleans (`tools`, `vision`,
`json_mode`, `reasoning`, `temperature`), and a `reasoning_effort` list. Both
`context_window` and `max_output_tokens` must be supplied as a positive integer
or an explicitly confirmed `null`. IDs are generated as
`provider/upstream_model`; existing IDs are skipped without overwriting their
values, tags, priority, or overlay membership. Import adds the confirmed models
to the effective catalog without assigning them to a strategy label.

Map flat lookup prices into `cost.*`, capability booleans and effort into
`capabilities.*`, and limits into the model-level fields. A complete manually
confirmed import has this shape:

```json
{
  "expected_revision": "<latest revision from GET>",
  "operations": [
    {
      "action": "import",
      "provider_id": "my-service",
      "confirmed": true,
      "models": [
        {
          "upstream_model": "vendor/example-model",
          "tags": [],
          "cost": {"input_per_million": 1.25, "output_per_million": 4},
          "capabilities": {
            "tools": false,
            "vision": false,
            "json_mode": true,
            "reasoning": false,
            "temperature": true,
            "reasoning_effort": []
          },
          "context_window": null,
          "max_output_tokens": 4096
        }
      ]
    }
  ]
}
```

Here `context_window: null` records an explicit decision to leave the limit
unknown. Omitting the field is rejected. The example's prices and model name
are illustrative; use the serving provider's applicable values.

Validation leaves files, process environment, and the active registry unchanged.
Apply uses a file lock and checks the expected revision; a stale revision returns
`409 revision_conflict`. File replacement or activation failure restores the old files and active
catalog, including the previous files' existence and permission modes. Failed management
activation does not register the candidate in `config_versions`; existing versions and
request history remain intact. CLI provider mutations use the same transaction boundary.

Validation and successful apply return the configuration snapshot plus
`{valid: true, applied, imported, skipped}`. Validation keeps the current revision
and returns `applied: false`; apply returns its new revision and `applied: true`.
Persistence or activation failure returns `500 provider_configuration_failed`.
Recovery material is retained with restrictive permissions if restoration fails;
disk-based configuration reads, startup, reload and discovery are blocked until
the installation is repaired. An existing healthy active catalog can continue
serving. Normal startup/reload reads wait for a cooperative writer's file lock
and then read the complete committed snapshot.

Every provider-management POST and PUT, including validation, discovery, and
metadata lookup, requires a configured gateway key. With no configured key these
commands return `403 config_writes_disabled`; a wrong configured Bearer token
returns `401 invalid_api_key`. GET follows the existing read authentication rule.

## Gateway credential initialization and replacement

`PUT /v1/gateway-credential` accepts only a SET operation:

```json
{
  "expected_revision": "<revision from GET /v1/provider-configuration>",
  "credential": {"action": "set", "value": "<new gateway key>"}
}
```

With a configured gateway key, the operation requires the current Bearer token.
Without one, first setup requires a loopback listener and request peer, a valid
loopback Host/Origin, and no forwarding headers. An anonymous public or proxy
connection cannot initialize the key. Provider, routing and canvas writes keep
their configured-key guard.

This endpoint and `POST /v1/setup` share the managed credential owner, immutable
snapshot, revision checks and local-bootstrap authorization. The setup endpoint
accepts `{expected_revision, api_key}` and sets only the first key; this endpoint
accepts the SET shape above and also supports authenticated replacement. Each
keeps its own safe response projection and error codes.

The operation uses the existing `gateway.api_key_env` reference, or adds
`JEV_GATEWAY_API_KEY` for first setup. It checks shared references and the opaque
revision, validates and prepares the effective catalog, then commits and activates
the new key through the recoverable configuration transaction. The response is
the safe Provider configuration plus `{valid: true, applied: true}`. It contains
no credential value. There is no gateway CLEAR operation.

The new key takes effect immediately; the old key then fails authentication.
The Dashboard keeps its connection using the submitted value in module memory.
HTTP callers retain their own copy. A stale revision returns `409 revision_conflict`.
Invalid inputs return `400 invalid_gateway_credential`; an ineligible first setup
returns `403 gateway_bootstrap_unavailable`. Write or activation failures return
`500 gateway_credential_failed` after restoring the old state. Errors use fixed
text and never quote submitted values or file content.

Whole-model edits use `{action: "update_model", model_id, model}`. `model_id` is
the existing canonical `provider/upstream_model` ID; `model` uses the same strict
record shape as import. Provider and upstream identity are immutable. The edit
validates the baseline and effective overlay catalog before saving atomically,
and uses the same revision/conflict and activation rollback rules as other writes.
LLM `upsert` operations and provider selectors accept optional
`transport_credentials: Record<parameter_name, CredentialChange>`. Each parameter
must have a declared `provider.param_env` reference. For example,
`{"vertex_credentials":{"action":"set","value":"synthetic-value"}}` sets
the value for that binding. KEEP preserves local credential bytes; CLEAR removes
JSON and dotenv assignments and may reveal an inherited value. SET stores literal
text in the protected credential store. Decision upserts reject transport actions.
The map accepts at most 128 entries; names are ASCII identifiers of at most 256
characters. No arbitrary store names are accepted.

Writes use the existing revision and rollback transaction. Sharing checks exclude
only the edited binding and retain every other consumer, including the supplier's
primary key and other parameters. They check the completed operation sequence.
Candidate test, discovery and metadata selectors apply actions only in memory.
Provider snapshots include `transport_credential_presence` booleans for declared
parameters; responses never contain resolved values. Native cloud model listing
remains unsupported where no bounded listing adapter exists.

Omitted tags, priority, quality and metadata retain their baseline values.
An explicitly supplied metadata envelope replaces the previous envelope; callers
must retain any source evidence and confirmations they want to keep.
Overlay-owned tags and priority remain in the overlay; an effective model view
cannot copy those values into the baseline through this operation.

Models accept optional `display_name: string|null` and `enabled: boolean`.
Omitted `enabled` means true. Disabled models remain visible in management but
are excluded from `/v1/models`, automatic selection, explicit requests and
session pins. A disabled global default produces `setup_incomplete` when needed;
setting a default explicitly requires an enabled model. Models may store optional
nullable `cost.cache_read_per_million` and `cost.cache_write_per_million`, in USD
per million tokens. Omission or null means unknown. These fields do not change
the existing input/output request-cost estimate. Prices must be finite and
nonnegative; limits must be positive integers or null, and known output limits
must not exceed known context limits. New, imported or changed quality is between
0 and 1. An update can omit quality or retain a finite legacy value equal to the
actual stored record, including `2.5`; a client compatibility flag cannot grant
this exception. Priority is a signed integer, excluding booleans. Confirmed
provenance must match all saved runtime fields, including cache prices.

## Upstream discovery and metadata

`POST /v1/provider-connection-test` accepts the same LLM provider selector and
optional candidate credential as discovery. It requires the configured Dashboard
Bearer key and never saves configuration or sends a generation request. Its
response is `{provider_id, status, scope: "model_listing", model_count, warnings}`.
Status is `success`, `authentication_error`, `address_error`, `network_error`,
`unsupported`, or `incomplete`. A successful listing does not establish generation
availability. Upstream credential rejection returns HTTP 200 with
`authentication_error`; a rejected Dashboard key returns HTTP 401 before any
probe. Missing declared upstream credentials return `incomplete`; transports
without a supported safe listing probe return `unsupported`. Address failures
include rejected targets, redirects and HTTP 404; HTTP 405/501 is unsupported.
Warnings contain finite diagnostic codes, including `generation_unverified`, and
never upstream bodies, addresses or secrets. The Dashboard translates these codes.
The probe reuses discovery's address pinning, verified TLS, time/body/page limits
and redirect rejection.

`POST /v1/provider-discovery` accepts a saved `provider_id` or an in-memory
`provider` candidate, with an optional write-only `credential`. It returns
`{provider_id, supported, complete, items, warnings}`. Each item contains
`upstream_model`, `qualified_id`, `imported`, safe candidate `metadata`, and its
normalized `metadata_envelope` for persistence after confirmation.
An unsupported transport, a complete empty list, and a bounded partial result
are distinct states. Discovery and refresh never import models or persist the
candidate provider or credential.

OpenAI-compatible, native Anthropic, and DeepSeek listings use their transport's
list endpoint and header authentication. Pagination is bounded to 20 pages,
1000 models, 20 seconds total, and 4 MiB per response. Private and loopback targets
require the provider's explicit `allow_private_network` opt-in; default discovery
requires public HTTPS. Redirects and dangerous targets remain rejected after
opt-in, and TLS verification remains enabled. Discovery does not probe chat
generation or decision-provider endpoints.

`POST /v1/provider-metadata` uses the same provider selector with
`upstream_models` and an optional `refresh` flag. It returns model suggestions
with `fields`, `sources`, and warnings, plus retrieval time and stale-cache state.
Each lookup item also has normalized `metadata` for the confirmation/import flow.
Fields use `input_per_million`, `output_per_million`, optional
`cache_read_per_million`, `cache_write_per_million`, `tools`, `vision`,
`json_mode`, `reasoning`, `temperature`, `reasoning_effort`, `context_window`, and
`max_output_tokens`. Missing fields remain unknown. Prices are USD per million
tokens; conditional prices require review before import. Sources are matched to
the actual serving provider and exact model ID, so a proxy does not inherit
another provider's price by sharing a model name or brand.

Public metadata sources are fixed and receive no provider credential. Source
responses are bounded to 16 MiB; cached suggestions can remain available for up
to six hours with explicit freshness information. Query failures leave manual
entry available. Querying or refreshing cannot modify confirmed model values or
routing membership, and chat routing does not depend on metadata availability.

Discovery item `metadata` uses `{fields, sources, warnings}`, the same suggestion
projection as a metadata lookup item. Each source identifies `source`,
`source_provider`, `source_model`, `fetched_at`, `applicable`, and a `fields` map.
Field evidence includes `value` and `source_field`, with `unit` and `source_unit`
where applicable. Sources may also contain their fixed public `url`,
source_updated_at`, `schema_revision`, `canonical_model_id`, original effort
declarations, and projected `pricing` conditions. Native-listing evidence contains
no endpoint or credential. Source evidence can retain facts such as input-only
limits or structured-output support that cannot directly fill a routing field.
An `applicable: false` source is reference information for a different serving
channel and does not prefill confirmed values.

The normalized version 1 envelope gives each source a unique `id`, maps
`source_provider` to `provider_id` and `source_model` to `model_id`, and retains
the safe evidence and price conditions. Its `fields` entries use
`{status, value, source_ids, method?, confirmed_at?}`; statuses are `known`,
`unknown`, `conflict`, and `confirmed`. Preserve the normalized sources when
confirming or manually editing values. A confirmed field value must match the
corresponding imported routing value. Effort capabilities and non-null known or
confirmed effort fields use the existing ladder order with duplicates removed
before confirmation comparison. Raw source effort history keeps its original
order, duplicates and vendor text within the 16-item bound. Validate the complete
original envelope's 262,144-byte limit before normalization. Source text and raw
effort items reject C0 controls and DEL before any write or activation. Legacy
reads project canonical fields without rewriting configuration files.
The complete envelope constraints are in
[`models-config.md`](./models-config.md#modelsmetadata).

## Strategy selection

For chat completions, only the JSON request-body `model` field selects a strategy.
Preview also accepts the comparison array described above. The `model` value is
resolved in this order:

1. A registered strategy name selects that strategy and runs its normal
   selection. The default is `task_aware`.
2. A concrete catalog model ID, written as `<provider>/<upstream_model>`, locks
   the request to that model. The session's pinned strategy is used when valid,
   otherwise `task_aware`.
3. The retired names `auto` and `jev-auto` are neither strategies nor catalog
   models, so they return `404` with `error.code: "model_not_found"`.

Two inputs deliberately do not select a strategy:

- `?strategy=` on `/v1/chat/completions` or `/v1/routing/preview` returns `400`
  with `error.code: "unsupported_parameter"` and `error.param: "strategy"`.
- The `X-JEV-Strategy` request header is ignored for selection. `X-JEV-Strategy`
  is only a response header reporting the strategy that ran.

A non-empty `X-JEV-Session-Id` request header takes precedence unless
`gateway.session_strategy` is `off`. Without that header, `derived` hashes the
first user message with the optional `user` field, `user` uses the `user` value,
and `header` creates no session. `off` disables sessions even when a header is sent.

## Response headers

Successful chat completion responses, including streams, expose routing evidence
through `X-JEV-*` headers. The gateway does not add credentials or message bodies
to them; a supplied session ID is echoed. Preview puts routing fields in its JSON
`preview` array, using `upstream_model` for the native model name and
`switched_from` for the previous route. It does not allocate request or decision IDs.

| Header | Meaning |
| --- | --- |
| `X-JEV-Route` | Selected catalog model ID, `<provider>/<upstream_model>`. |
| `X-JEV-Provider` | Provider `id` that serves the route. |
| `X-JEV-Model` | Provider-native upstream model name. |
| `X-JEV-Route-Label` | Selected strategy label. |
| `X-JEV-Task-Type` | Task tier reported by the decision; carries the same value as the route label. |
| `X-JEV-Mode` | Decision mode (`auto` or `manual` for built-in strategies), not the policy's `sticky`/`fresh` setting. |
| `X-JEV-Reason` | Human-readable selection reason. |
| `X-JEV-Strategy` | Strategy that produced the decision. |
| `X-JEV-Decision-Id` | Decision ID, usable with `GET /v1/routing/decisions/{decision_id}`. |
| `X-JEV-Request-Id` | Allocated request ID, also present with storage disabled; it does not guarantee persistence. |
| `X-JEV-Session-Id` | Resolved session ID, present when the request has a session. |
| `X-JEV-Switch` | `from->to` route transition, present when the route switched. |
| `X-JEV-Blocked-By` | Reason a switch was blocked; built-in strategies emit `hysteresis` when a switch is held back. |
| `X-JEV-Reasoning-Effort` | Thinking level written into the upstream request, present when the gateway decided one. |
| `X-JEV-Reasoning-Source` | Effort source: `client`, `clamped_client`, `derived`, `capped`, or `invalid_client`. Absent for `off` mode or an undeclared effort ladder; a preserved client value can still report a source. |

## Errors

Errors use the OpenAI envelope:

```json
{"error": {"message": "...", "type": "...", "param": null, "code": "..."}}
```

| Status | `code` | When |
| --- | --- | --- |
| `400` | `unsupported_parameter` | `?strategy=` query parameter used. |
| `400` | `unknown_strategy` | Preview's `strategy` array is empty or names an unregistered strategy. |
| `400` | `missing_user_message` | No non-empty user message is present. |
| `400` | `null` | Malformed JSON or Pydantic request validation failed. |
| `400` | `invalid_configuration` | Reload, validate, or apply rejected the file contents. |
| `400` | `invalid_theme` | Theme payload is not a hex seed, or carries unknown keys. |
| `400` | `invalid_canvas_layout` | Layout version, node ID, coordinates, size, or key whitelist is invalid. |
| `400` | `invalid_limit` | Monitoring page size is outside 1..100. |
| `400` | `invalid_cursor` | Monitoring cursor is malformed, altered, from another endpoint/session, or invalid after restart. |
| `400` | `restart_required` | Reload changes storage settings. |
| `400` | `invalid_gateway_credential` | Gateway credential SET has an invalid shape or key. |
| `401` | `invalid_api_key` | Missing or wrong Bearer token. |
| `403` | `config_writes_disabled` | A configuration write was attempted with no `gateway.api_key_env` configured. |
| `403` | `setup_local_only` | First `/v1/setup` write fails local-bootstrap checks. |
| `403` | `gateway_bootstrap_unavailable` | First gateway-credential write fails local-bootstrap checks. |
| `409` | `revision_conflict` | Provider validation/apply used an outdated configuration revision. |
| `409` | `setup_already_configured` | `/v1/setup` attempts to replace an existing management key. |
| `404` | `dashboard_not_built` | The dashboard assets are absent from this install. |
| `404` | `model_not_found` | `model` is neither a strategy nor a catalog model. |
| `404` | `unknown_decision` | Decision ID is not in the in-memory log. |
| `404` | `unknown_session` | Session ID is not live. |
| `500` | `catalog_mismatch` | A routed model disappeared from the catalog. |
| `500` | `overlay_apply_failed` | The overlay could not be written or applied; the previous catalog was restored. |
| `500` | `provider_configuration_failed` | Provider configuration persistence, activation, or recovery failed. |
| `500` | `gateway_credential_failed` | Gateway credential persistence or activation failed. |
| `500` | `canvas_layout_write_failed` | Layout persistence failed; routing policy remains untouched. |
| `502` | `upstream_error` | Upstream call failed before a response began; `type` is a bounded exception type. |
| `503` | `storage_unavailable` | Reload cannot reach the record store. |
| `503` | `setup_incomplete` | No models are configured, or an empty matched tag needs an unset global default. |
| `503` | `provider_credentials_missing` | The selected LLM provider lacks a declared key or transport credential. |

The upstream error message is fixed: `Upstream provider request failed.` Once
streaming headers have been sent, a stream failure cannot become an HTTP `502`;
the stream terminates and the gateway records a failed outcome on a best-effort basis.

## Reload

```bash
curl -X POST http://127.0.0.1:8000/v1/routing/reload
```

Reload reads one locked snapshot of `models.json`, adjacent `credentials.json`,
legacy `.env` and the routing overlay, then rebuilds providers, models,
and strategies, registers a configuration snapshot with the existing record store,
and applies reloadable gateway settings. It preserves sessions subject to the new
TTL and session-count limits. On the next turn, a session whose stored model no
longer exists falls back to a fresh initial decision; a removed strategy pin falls
back to the default strategy.

`gateway.host`, `gateway.port`, and logging settings apply only at process startup.
Other gateway settings apply after a successful reload. All storage settings are
also process-start settings: changing retention, path, queue, or content capture
is rejected with `400 restart_required`; the database is not reopened. A successful
reload returns `reloaded: true`, `models_file`, and the new policy snapshot.
