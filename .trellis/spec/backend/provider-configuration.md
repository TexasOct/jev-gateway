# Provider configuration and model onboarding

## 1. Scope / Trigger

Use this contract for provider configuration writes, credential changes, upstream
model discovery, metadata lookup, and explicit model import. Read the dashboard
routing guide for overlays, theme, canvas layout, shell privacy, and packaging.
Provider management owns baseline changes; routing overlays keep their separate
schema and leave baseline bytes unchanged.

## 2. Signatures

| Method | Route | Boundary |
| --- | --- | --- |
| GET | `/v1/provider-configuration` | Safe configuration snapshot and opaque revision |
| POST | `/v1/provider-configuration/validate` | Prepare and validate without writing or activating |
| PUT | `/v1/provider-configuration` | Validate, persist, and activate a transaction |
| POST | `/v1/provider-discovery` | Read saved/candidate provider's upstream model list |
| POST | `/v1/provider-metadata` | Read fixed public sources for metadata suggestions |

Discovery and metadata services remain independent of the FastAPI composition
root. Their coordinated entry points are:

```python
discover_models(
    provider: Mapping[str, Any], api_key: str | None, *, imported_ids: set[str]
) -> dict[str, Any]

lookup_model_metadata(
    provider: Mapping[str, Any], upstream_models: list[str], *, refresh: bool = False
) -> dict[str, Any]
```

The configuration owner integrates routes and credentials. Discovery modules must
not import `gateway.py` or write the catalog. The UI uses shared API types and
the same presets as the CLI.

## 3. Contracts

GET returns `{revision, write_available, providers, decision, models, presets,
provider_types, decision_protocols}`. Safe provider views include display metadata,
Credential values never
appear in a response. Advanced parameters use a safe projection; callers omit
that projection from ordinary upserts so the original `params` and `param_env`
survive.
Presence uses `has_api_key`; model views use `name` for the qualified ID.
Presets are a flat normalized array with explicit kind and transport/protocol;
both type registries are string arrays.

Validation and apply accept `{expected_revision, operations}`. Operations use:

- `{action: "upsert", kind: "llm"|"decision", provider, credential}`;
- `{action: "delete", kind: "llm"|"decision", id}`;
- `{action: "import", provider_id, models, confirmed: true}`.

Credential actions are `keep`, `set`, and `clear`; `set` includes a non-empty
`value`. Empty text is not keep. Continue resolving only environment names declared
in the configuration. Candidate parsing and registry preparation use an injected
environment mapping, not a temporary mutation of process-wide `os.environ`.
Non-injected decision-client behavior retains its existing call-time resolution.
Retain legacy dotenv expansion and assignment order in the local mapping. Managed
literal credentials must be distinguishable so `${...}` within a newly written
secret is preserved without changing how older dotenv entries resolve. Managed
SET uses a single-quoted assignment with trailing ` # jev-managed-literal-v1` when
the value contains `${`; only the marked record skips expansion. Generic dotenv
consumers do not interpret this marker. Preserve unaffected records and replace
all assignments for the selected name on SET/CLEAR.
Clear removes a local credential entry; inherited values can remain effective.
Validation/apply/read/reload and candidate previews must report the same effective
presence. CLI add uses the shared reference protection before replacing a key.
CLI show/validate/doctor/status/start/reload use a coherent lock-protected
document and immutable credential snapshot. Redaction, validation and outbound
health/reload authentication receive the resolved mapping/key directly. Keep the
captured address/key pair through startup polling. `load_catalog_env` returns a
mapping without mutating `os.environ`; it is not a process-level dotenv loader.

LLM and decision providers retain their separate lists and runtime roles. Optional
`display_name`, `brand_id`, and `icon_id` do not change instance IDs, LLM transport
types, decision protocols, or `provider/upstream_model` identities. System One
uses a full evaluation URL and optional model, with no model-list probe. LLM
`allow_private_network` is a strict boolean that defaults to false and controls
only discovery.

Every management POST/PUT requires the configured gateway key, including
validation, discovery, and metadata lookup. Read behavior follows the existing
Bearer rule. The opaque revision detects changes in baseline, overlay, and
credential files without exposing a raw secret digest. HTTP takes the reload lock
before the shared file lock; CLI uses the file lock. Validate the merged catalog
and prepare its registry before writes. File replacement and activation must
restore old bytes and active state on failure; recovery material containing
credentials has restrictive permissions. An uncooperative editor does not honor
the lock, so check disk revisions as part of the transaction.
Startup and reload read a coherent baseline/env/overlay snapshot under the shared
file lock. Reload holds the reload lock before any reads or preparation, then
the file lock through activation, so an older preparation cannot replace a newer
successful management write. Check unresolved recovery state only after acquiring
the file lock: a normal cooperative writer must finish before readers continue.
An unresolved journal blocks startup, configuration reads and outbound discovery;
reload preserves the healthy active snapshot and reports a fixed safe error.
It must never activate or probe a partially replaced endpoint/credential pair.
Revision tokens are process-keyed; restart invalidates earlier tokens.
Validation/apply returns the snapshot plus `{valid: true, applied, imported,
skipped}`. Validation retains the current revision and does not activate state.

New imports require finite nonnegative input/output prices, five explicit boolean
capabilities, an explicit effort list, and both limits as positive integers or
explicitly confirmed null. Keep the old catalog parser's omission defaults for
existing files. Model `metadata` records source/confirmation information; routing
continues using the confirmed `cost`, `capabilities`, and limit fields. Existing
qualified IDs are skipped without overwriting values, tags, priority, or overlay
membership. Import does not automatically assign strategy tags or derive quality
from external benchmarks.

The strict version 1 metadata envelope is bounded to 256 KiB per model and 32
sources with unique IDs. Sources use `provider_id`/`model_id`, retain dates,
units, canonical/schema associations, applicability, reference-only fields and
bounded pricing conditions. Field evidence uses `status`, `value`, optional
`source_ids`, `method`, and `confirmed_at`. Status is known/unknown/conflict/confirmed;
confirmed values must match the imported runtime fields. Source references must
resolve within the envelope. Preserve `structured_output` and `max_input_tokens`
as evidence without inferring JSON mode or combined context from those claims.

Discovery returns `{provider_id, supported, complete, items, warnings}`, with items
`{upstream_model, qualified_id, imported, metadata, metadata_envelope}`. Candidate
`metadata` retains the adapter's safe suggestion shape; `metadata_envelope` is
the normalized persistence envelope. Discovery does not save a candidate,
credential, or model. Transport adapters preserve base-path prefixes and header
authentication. Bound listings to 20 seconds total, 20 pages, 1000 models, and
4 MiB per response; report partial results explicitly.
Reject a body that ends before its declared Content-Length, even when its received
prefix is valid JSON; retain earlier pages as incomplete results.

Validate the URL, DNS results, and destination before connection. Connect to the
validated address while retaining the original hostname for TLS/SNI verification;
resolving first and letting the HTTP library independently resolve again does not
enforce this boundary. Default discovery permits public HTTPS. Per-provider opt-in
permits loopback/private HTTP or HTTPS, while unspecified, multicast, link-local,
cloud-metadata targets and all redirects remain rejected. Never disable TLS
verification or move credentials to a URL query.

Metadata lookup returns suggestions with `fields`, `sources`, and warnings, plus
retrieval and stale state. Suggestions use these flat field names:
`input_per_million`, `output_per_million`, `tools`, `vision`, `json_mode`,
`reasoning`, `temperature`, `reasoning_effort`, `context_window`, and
`max_output_tokens`. Unknown values remain absent/null, distinct from false/zero.
For import, map the two price fields to `cost.input_per_million` and
`cost.output_per_million`; map the five capabilities and `reasoning_effort` to
`capabilities.*`; keep `context_window` and `max_output_tokens` at model level.
The lookup response is a suggestion projection, not an import payload.
Each lookup item adds normalized `metadata` for operator confirmation and import;
map raw `source_provider`/`source_model` to `provider_id`/`model_id` and keep source
IDs when confirming fields. Omission of metadata on old models does not certify
them or create invented provenance.
Public source requests receive no upstream credentials. Exact serving-provider
and upstream-ID matching controls price applicability; brand or name similarity
does not certify a proxy's billing or capabilities.

Models.dev costs are already USD/million tokens. OpenRouter and LiteLLM per-token
costs require multiplication by one million. Keep conditional/cache/tier evidence
for review. Retrieval time, source-declared update time, and verification time have
different meanings. Limit public responses to 16 MiB and cached suggestions to
six hours, with bounded refresh/concurrency behavior and explicit stale state.
Source failure cannot gate chat serving or overwrite confirmed model values.

The Provider workspace keeps discovery candidates, selection, metadata editing,
and confirmation distinct. Select-all identifies its visible scope and count.
Ignore stale responses after switching provider or starting a newer request;
query prefilling must preserve fields the operator has edited. Success refreshes
the effective model catalog used by the existing strategy editor. Keys remain
memory-only in the browser and are cleared from completed/cancelled forms.
Supplier images are packaged local assets with official source/usage evidence;
missing logos use neutral fallbacks. CSP, CSS entry points, palette and locale
storage retain their existing boundaries.
Bind queries to the effective provider configuration, including changes noticed
by configuration refresh. Current values, state, source detail and confirmation
must use the same evidence result. Unknown/null source values do not conflict with
a known value, while explicit false/zero and conflicting known values retain
their meaning. Credential changes use the model-draft discard protection.
Distinguish a successful write from a failed subsequent catalog read; retry the
read without resubmitting an already committed import.

## 4. Validation & error matrix

| Condition | Required result |
| --- | --- |
| Wrong configured Bearer key | `401 invalid_api_key` |
| Management POST/PUT without a configured gateway key | `403 config_writes_disabled` |
| Stale expected revision | `409 revision_conflict`; files and active catalog unchanged |
| Incomplete import metadata or unconfirmed import | `400`; no routable model added |
| Deletion has model/strategy/shared-credential references | Reject the operation; no implicit cascade |
| Invalid provider, advanced parameter, or metadata shape | Reject with safe fixed public error text |
| Write or activation failure | Restore old file bytes and active state; `500 provider_configuration_failed` |
| Unresolved recovery journal | Reject disk-based reads/startup/probes; preserve a healthy active snapshot |
| Normal cooperative write in progress | Startup/reload wait for the file lock and read the committed snapshot |
| Unsupported discovery transport | Explicit unsupported/manual-entry state |
| Complete empty list | Successful complete empty state, distinct from failure |
| Listing reaches a bound | Explicit partial state, no automatic import |
| Private target without opt-in or dangerous target after opt-in | Reject before connection |
| Metadata unavailable, unmatched, conflicting, or stale | Preserve uncertainty and manual entry; do not mutate catalog |

## 5. Good/base/bad cases

- Good: an operator configures a provider, discovers models, selects two, reviews
  suggested prices/capabilities, and imports only those two with source and
  confirmation evidence. Existing strategy tags stay unchanged.
- Base: an old valid catalog has no display/private-network/metadata fields and
  retains its existing identities, defaults, and serving behavior.
- Bad: refreshing a provider list adds unconfirmed models with zero prices and
  assumed capabilities to the effective catalog.

## 6. Tests required

- Configuration/CLI/HTTP: preset-custom equivalence, safe reads, advanced-field
  preservation, write authorization, candidate environment isolation, revision
  conflicts, file-lock cooperation, shared env references, and failure rollback.
  Include legacy interpolation plus literal-secret round trips, CLI add reference
  guards, inherited clear presence, unresolved-journal read rejection, and reload
  races with CLI writes and successful management PUT.
- Catalog/decision: strict optional-field parsing, old omission defaults, stable
  model IDs, optional System One model, and credential-injection compatibility.
- Discovery/network: fixture adapters, paging and bounds, empty/partial/unsupported
  states, header authentication, private opt-in, dangerous targets, validated-IP
  connection with TLS hostname preservation, redirects, timeouts, and fixed errors.
- Metadata: exact serving match, units, false/null distinction, conditional prices,
  source dates, static LiteLLM lookup without import, caching, refresh, and source
  failure independent of routing.
- UI/browser: both provider kinds, presets/custom forms, write permission on first
  entry, cancellation, retry, selection scope, batch confirmation, stale requests,
  duplicate import, strategy refresh, keyboard, locales, themes, and narrow screens.
  Include target edits discovered by refresh, lookup/discovery result ordering,
  null plus known evidence, credential changes with a dirty model draft, and
  committed imports whose subsequent catalog read must be retried.
- Assert baseline/overlay/environment bytes remain unchanged during validation,
  discovery, metadata lookup, and cancellation. Use fake keys and mocked upstream
  responses; do not make real generation requests.

## 7. Wrong vs correct

Wrong: temporarily put a candidate credential in `os.environ`, parse the candidate,
then restore the variable. Other requests can resolve the temporary credential.
Correct: construct an immutable candidate environment mapping and inject it into
the candidate parser and prepared registry.

Wrong: use a supplier's public price for a custom proxy with a similarly named
model. Correct: match the serving channel and exact upstream ID, retain source
evidence, and require operator confirmation of the effective routing estimate.
