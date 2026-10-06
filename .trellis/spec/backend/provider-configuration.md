# Provider configuration and model onboarding

## 1. Scope / Trigger

Use this contract for provider configuration writes, credential changes, upstream
model discovery, metadata lookup, and explicit model import. Read the dashboard
routing guide for overlays, theme, canvas layout, shell privacy, and packaging.
Provider management owns baseline changes; routing overlays keep their separate
schema and leave baseline bytes unchanged.
Safe model views expose optional `routing_overlay_fields`, containing only
`tags` and/or `priority` when those fields are present in that model's overlay.
An empty list identifies baseline-owned values. The projection uses the same
overlay snapshot as the effective catalog under the configuration lock. This
property is response metadata; it is never stored in model JSON or runtime
profiles. Model edits omit workflow-owned fields. The transaction preserves
their baseline values and leaves overlay bytes unchanged.
After a conflict reload, model drafts remain open. If current ownership protects
a field whose draft differs from the current effective value, saving requires
explicit acceptance of that field's current value. Other draft fields remain
unchanged. Missing ownership metadata locks routing fields until an updated
gateway supplies ownership. Manual metadata fields can explicitly return to
source ownership even when the online numeric value is identical.
Read [Runtime initialization](./initialization.md) for strategy-only defaults and
management-key setup. Empty catalogs and unassigned tag pools are valid editable
states. Save a provider before importing its first model; never seed synthetic
instances merely to satisfy validation.

## 2. Signatures

| Method | Route | Boundary |
| --- | --- | --- |
| GET | `/v1/provider-configuration` | Safe configuration snapshot and opaque revision |
| POST | `/v1/provider-configuration/validate` | Prepare and validate without writing or activating |
| PUT | `/v1/provider-configuration` | Validate, persist, and activate a transaction |
| POST | `/v1/provider-discovery` | Read saved/candidate provider's upstream model list |
| POST | `/v1/provider-metadata` | Read fixed public sources for metadata suggestions |
| POST | `/v1/provider-connection-test` | Authenticated nonmutating bounded model-listing probe |

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

GET returns `{revision, write_available, defaults, gateway, gateway_bootstrap_available,
providers, decision, models, presets, provider_types, decision_protocols}`. Safe
provider views include display metadata. Gateway presence and initialization are
defined in [credential configuration](./credential-configuration.md). Credential
values never appear in a response. Advanced parameters use a safe projection; callers omit
that projection from ordinary upserts so the original `params` and `param_env`
survive.
Compare complete reference maps against the opened configuration. Omit an
unchanged `param_env` on ordinary edits and candidate probes, including after
reverting an edit. Intentional account/default changes, transport SET references
and default-authentication detachment carry the complete intended map, preserving
unrelated bindings. Do not replace a retained cloud map with an empty object just
to omit it from an ordinary submission.
Presence uses `has_api_key`; model views use `name` for the qualified ID.
Presets are a flat normalized array with explicit kind and transport/protocol;
both type registries are string arrays.

Validation and apply accept `{expected_revision, operations}`. Operations use:

- `{action: "upsert", kind: "llm"|"decision", provider, credential}`;
- `{action: "delete", kind: "llm"|"decision", id}`;
- `{action: "import", provider_id, models, confirmed: true}`.
- `{action: "set_default_model", model: string|null}`.
- `{action: "update_model", model_id: string, model: ImportModel}`.

Whole-model updates require the same explicit runtime fields as imports and
preserve provider/upstream identity. Omitted tags, priority, quality and metadata
retain baseline values; overlay-owned tags/priority remain in their original
files. Validate retained confirmations against the completed record. Model
display_name is optional bounded text or null; enabled is a strict boolean with
legacy omission true. Disabled models cannot be selected automatically, manually,
as defaults or by session pins. Existing disabled default references remain
editable, but fail with setup_incomplete when used. New default assignments require
an enabled model. Cache read/write prices are optional nullable finite nonnegative
USD/M fields and remain unknown when omitted. New or changed quality is 0..1;
priority is a signed integer (excluding booleans), and known output limits must
not exceed known context limits. Preserve loading of
existing finite legacy quality values and their exact value on unrelated updates.
For example, an existing 2.5 can survive a display-name edit. A request cannot
claim legacy status: compare its value with the actual stored record. A new or
changed 2.5, a boolean or a nonfinite value is invalid. The editor's opened-value
exception and server validation must agree without narrowing the old parser.

Connection tests accept the existing LLM selector and return provider_id, status,
scope="model_listing", model_count and fixed safe warnings. Status is success,
authentication_error, address_error, network_error, unsupported or incomplete.
Every result includes `generation_unverified`. The remaining diagnostic is one
of `discovery_unsupported`, `credential_unconfigured`, `authentication_failed`,
`address_unavailable`, `listing_unsupported`, `upstream_failed`,
`listing_succeeded` or `listing_incomplete`. These are literal bounded codes;
never forward upstream text or an arbitrary upstream warning. Authentication
classification precedes address, unsupported, network and completion branches.
The configured Dashboard key is checked before any upstream call. Upstream auth
failure is a semantic result, distinct from Dashboard HTTP 401. No generation
or configuration writes occur; use the existing validated-IP/TLS/no-redirect and
bounded listing network. Unsupported protocols and missing credentials are
reported without a probe. Success verifies listing access only.
The supplier UI binds the probe to the opened draft, authentication generation
and loaded opaque configuration revision. Any changed revision aborts the probe
and suppresses its old result, including when the configuration GET was admitted
before that probe. An old success must not describe the current connection.

Ordinary new Ollama/LM Studio connections that need no key omit the primary
credential reference. Deliberate authenticated local setup and Advanced existing
or shared references retain their declared bindings. An unused generated name
must not turn an unauthenticated local connection into incomplete provisioning.

The `set_default_model` operation edits baseline defaults.default_model and exposes only its
canonical provider/upstream_model ID in the safe defaults projection. It shares
normal authorization, revision, baseline/effective validation, registry preparation
and recoverable activation. It never writes the strategy overlay or a secret file.
Reject unknown keys, wrong types and missing model IDs. Null clears the default.
All strategies inherit this global value; per-strategy default controls are deferred.
The Settings selector reuses this configuration owner and model records. Referenced
provider/model removal, including CLI force, cannot leave a dangling global default.
CLI add supports omitted provider/model arrays in the packaged template and keeps
explicit invalid shapes strict.

Credential actions are `keep`, `set`, and `clear`; `set` includes a non-empty
`value`. Empty text is not keep. Continue resolving only credential references
declared in the configuration. Candidate parsing and registry preparation use an
injected mapping, not a temporary mutation of process-wide `os.environ`.
Non-injected decision-client behavior retains its existing call-time resolution.
The root credential owner resolves JSON > local dotenv > captured process values.
SET writes literal JSON strings, including `${...}`. Retain legacy dotenv expansion,
assignment order and existing ` # jev-managed-literal-v1` records; generic dotenv
consumers do not interpret that marker. CLEAR removes the name from JSON and all
local dotenv assignments, preserving unaffected records. Inherited values can
remain effective.
LLM upserts and candidate selectors accept optional `transport_credentials`, a
bounded map (at most 128 entries) from declared `param_env` parameter names to
`keep`, `set`, or `clear` actions. Parameter names are ASCII identifiers of at
most 256 characters; references and values follow the credential owner's bounds.
Decision upserts reject this field. Omission retains existing behavior. Safe
provider snapshots expose `transport_credential_presence` booleans based on
resolved values. Candidate actions resolve together in an immutable local
projection; public metadata receives only provider configuration and no secrets.
Shared-reference protection excludes only the edited primary-key occurrence or
the exact edited transport binding.
Retain the edited provider's transport references, and recheck the completed
candidate after all operations so newly added consumers cannot bypass SET/CLEAR
guards. CLI login/logout share this rule, including dry runs.
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

Provider validation, apply, discovery and metadata lookup require the configured
gateway key. Initial `/v1/setup` and `/v1/gateway-credential` writes share the
strict local-bootstrap checks and the managed credential owner described in
[runtime initialization](./initialization.md). Read behavior follows the existing
Bearer rule. The opaque revision detects changes in baseline, overlay, and
credential files without exposing a raw secret digest. HTTP takes the reload lock
before the shared file lock; CLI uses the file lock. Validate the merged catalog
and prepare its registry before writes. File replacement and activation must
restore old bytes and active state on failure; recovery material containing
credentials has restrictive permissions. An uncooperative editor does not honor
the lock, so check disk revisions as part of the transaction.
Startup and reload read a coherent baseline/JSON/env/overlay snapshot under the shared
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
Confirmation timestamps and methods reject control characters at the nested
field boundary, in addition to their existing type, size and vocabulary checks.
Keep source effort declarations bounded separately from runtime effort: a raw
source has at most 16 entries; runtime accepts its seven legal tokens and uses
canonical duplicate handling. Non-null known/confirmed effort fields use that
same canonical order and deduplication in a copied envelope. Compare confirmed
efforts after normalizing runtime capabilities, and persist both canonical
values together. Preserve raw source order, duplicate/vendor/null entries,
references, ownership and dates. Check the original 262,144-byte envelope before
projection; canonicalization cannot admit an oversized original record. Source
text, paths, units and raw effort strings reject both C0 controls and DEL.
A source's support flag without declared levels
does not establish a known empty effort list.

`catalog.model_metadata(value: Any) -> dict[str, Any]` requires at least one
resolved `source_ids` entry for a confirmed field with `method: "source"`.
Manual confirmation may have no automatic sources; existing confirmed records
that omit `method` remain compatible. Unknown and conflict fields allow only an
omitted or null automatic value. Explicit false, zero, and an empty effort list
are known values, so they cannot accompany unknown or conflict status.
`provider_config.metadata_envelope(candidate: Mapping[str, Any]) -> dict[str, Any]`
sets a conflicting field's automatic value to null while retaining its source
records and references. Null and reference-only suggestions do not introduce
conflicts with applicable known values.

Persisted provenance URLs are validated offline by
`catalog._metadata_source_url(value: str) -> None`. They require public HTTPS,
valid host/port syntax, and no credentials, query, fragment, whitespace,
backslashes, or encoded path controls. Reject local/private/reserved/special IP
literals, transition/mapped IPv6, known metadata targets, local names, and
numeric alternate IP spellings. Preserve accepted URL bytes. This validation
does not resolve DNS or fetch evidence; public host syntax does not certify its
current DNS answers. Live retrieval retains the separate pinned-destination
network contract below.

For example, source confirmation without evidence is invalid:

```json
{"version":1,"fields":{"tools":{"status":"confirmed","value":false,"method":"source","source_ids":[]}}}
```

A manual value without invented evidence is valid:

```json
{"version":1,"fields":{"tools":{"status":"confirmed","value":false,"method":"manual","source_ids":[]}}}
```

An automatic conflict retains references and a null value:

```json
{"version":1,"sources":[{"id":"first"},{"id":"second"}],"fields":{"tools":{"status":"conflict","value":null,"source_ids":["first","second"]}}}
```

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
`input_per_million`, `output_per_million`, optional `cache_read_per_million`,
`cache_write_per_million`, `tools`, `vision`, `json_mode`,
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
does not certify a proxy's billing or capabilities. Match the actual transport,
channel and endpoint before a native retail source can supply automatic prices.

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
Supplier images are packaged local assets with traceable source, supplier reference
and license evidence; the identity/preset contract is in `provider-identities.md`.
Missing logos use neutral fallbacks. CSP, CSS entry points, palette and locale
storage retain their existing boundaries.
Bind queries to the effective provider configuration, including changes noticed
Current values, state, source detail and confirmation
must use the same evidence result. Unknown/null source values do not conflict with
a known value, while explicit false/zero and conflicting known values retain
their meaning. Credential changes use the model-draft discard protection.
For the same serving configuration, an unknown, conflicting, reference-only or
failed refresh retains previously acquired values and historical evidence. Show
the latest uncertainty and its source failure separately; a retained value is
not a fresh source confirmation. The latest unknown/conflict envelope still has
a null automatic value. Manual values retain their precedence. When the serving
configuration changes, old automatic facts lose applicability. Cover those two
boundaries independently. HTTP 200 may contain failed/stale source retrieval;
show that state per item with a scoped retry instead of a generic partial badge.
Distinguish a successful write from a failed subsequent catalog read; retry the
read without resubmitting an already committed import.
If an applying PUT has an unknown commit outcome, require a successful
configuration GET before another validation or mutation. A failed recovery read
retains the draft and blocks resubmission. Recovery is GET-only and never replays
the PUT automatically. Do not validate against the stale saved snapshot first.

## 4. Validation & error matrix

| Condition | Required result |
| --- | --- |
| Wrong configured Bearer key | `401 invalid_api_key` |
| Management POST/PUT without a configured gateway key | `403 config_writes_disabled` |
| Malformed body on provider validate/apply/discovery/metadata/connection-test | Apply the same authorization guard before body validation: missing/wrong configured Bearer yields `401 invalid_api_key` with `WWW-Authenticate: Bearer`; no configured key yields `403 config_writes_disabled`; authorized malformed input yields safe `400`. No mutation or upstream call. |
| Stale expected revision | `409 revision_conflict`; files and active catalog unchanged |
| Incomplete import metadata or unconfirmed import | `400`; no routable model added |
| Deletion has model/strategy/shared-credential references | Reject the operation; no implicit cascade |
| Invalid provider, advanced parameter, or metadata shape | Reject with safe fixed public error text |
| Source confirmation with no resolved references, non-null unknown/conflict value, or nonpublic evidence URL | `400`; validation/import/update preserve files, backups, and active catalog. Evidence validation makes no network request. |
| Controls in a nested confirmation timestamp or method | Safe `400`; no persistence, activation or source retrieval |
| Existing finite legacy quality unchanged during another field edit | Load and preserve the stored value; no clipping or invented provenance |
| New/changed quality outside 0..1, boolean or nonfinite value | Reject before write; a caller-supplied legacy claim cannot bypass the boundary |
| Write or activation failure | Restore old file bytes, existence, permission modes and active state; publish no failed candidate version; preserve all existing versions/history; `500 provider_configuration_failed` |
| Unresolved recovery journal | Reject disk-based reads/startup/probes; preserve a healthy active snapshot |
| Normal cooperative write in progress | Startup/reload wait for the file lock and read the committed snapshot |
| Unsupported discovery transport | Explicit unsupported/manual-entry state |
| Complete empty list | Successful complete empty state, distinct from failure |
| Listing reaches a bound | Explicit partial state, no automatic import |
| Private target without opt-in or dangerous target after opt-in | Reject before connection |
| Metadata unavailable, unmatched, conflicting, or stale | Preserve uncertainty and manual entry; do not mutate catalog |
| Same-serving refresh loses applicable evidence | Retain acquired values/history, show latest uncertainty/failure, and prevent false fresh certification |
| Loaded revision changes while a supplier probe is pending | Abort and suppress the old result; preserve the newer configuration |
| Applying PUT outcome is unknown | Read current configuration before validation or another mutation; failed reads keep submission blocked |

## 5. Good/base/bad cases

- Good: an operator configures a provider, discovers models, selects two, reviews
  suggested prices/capabilities, and imports only those two with source and
  confirmation evidence. Existing strategy tags stay unchanged.
- Base: an old valid catalog has no display/private-network/metadata fields and
  retains its existing identities, defaults, and serving behavior.
- Base: an old model with quality 2.5 loads and preserves 2.5 after a display-name
  edit; attempting to import that value or change a normal quality to 2.5 fails.
- Good: an ordinary local Ollama connection declares no unnecessary primary key;
  an operator deliberately adding local authentication retains that reference.
- Bad: refreshing a provider list adds unconfirmed models with zero prices and
  assumed capabilities to the effective catalog.

## 6. Tests required

- Configuration/CLI/HTTP: preset-custom equivalence, safe reads, advanced-field
  preservation, write authorization, candidate environment isolation, revision
  conflicts, file-lock cooperation, shared env references, and failure rollback.
  Include legacy interpolation plus literal-secret round trips, CLI add reference
  guards, inherited clear presence, unresolved-journal read rejection, and reload
  races with CLI writes and successful management PUT.
  Cover own-provider transport references, proposed upsert bindings and later
  operations that introduce a consumer, with unchanged files/runtime on rejection.
  Management admission holds the reload lock and
  `RoutingEngine.defer_config_publication()` through transaction completion.
  Assert synchronous/async stores receive no failed candidate, retained same-hash
  versions/history remain exact, and successful publication follows journal
  removal. Recorder failure must not undo a committed write. The executable
  publication contract and assertion points are in `database-guidelines.md`.
- Catalog/decision: strict optional-field parsing, old omission defaults, stable
  model IDs, optional System One model, and credential-injection compatibility.
- Discovery/network: fixture adapters, paging and bounds, empty/partial/unsupported
  states, header authentication, private opt-in, dangerous targets, validated-IP
  connection with TLS hostname preservation, redirects, timeouts, and fixed errors.
  `tests/test_connection_diagnostics.py` asserts the exact probe diagnostics,
  precedence and nonmutation; C4's real-HTTP supplement checks the fixed-code
  vocabulary at the authenticated endpoint. Complete empty listings remain
  successful with count zero and `generation_unverified`.
- Metadata: exact serving match, units, false/null distinction, conditional prices,
  source dates, static LiteLLM lookup without import, caching, refresh, and source
  failure independent of routing.
  Assert nested confirmation controls at validate/import/update, native effort
  support without declared levels, and wrong transport/channel/endpoint prices.
  Raw source effort bounds and canonical runtime duplicates need separate probes.
- UI/browser: both provider kinds, presets/custom forms, write permission on first
  entry, cancellation, retry, selection scope, batch confirmation, stale requests,
  duplicate import, strategy refresh, keyboard, locales, themes, and narrow screens.
  Include target edits discovered by refresh, lookup/discovery result ordering,
  null plus known evidence, credential changes with a dirty model draft, and
  committed imports whose subsequent catalog read must be retried.
  Preserve same-serving known values and their old evidence through unknown,
  conflict, reference-only and failure; assert the current badge and confirmation
  cannot certify them freshly. Changed-serving invalidation and manual precedence
  remain separate assertions. Verify per-item HTTP200 source failure and retry.
  Legacy quality must survive actual list load and an unrelated whole-record
  UI-to-file save; new/changed out-of-range quality must fail at UI and server.
  Assert unchanged/reverted reference-map omission, cloud/account changes retaining
  unrelated bindings, blank KEEP, explicit CLEAR and redacted-parameter omission.
  Hold a probe while a previously admitted GET returns a different revision;
  require abort and zero stale-result display. After a lost PUT response, require
  GET before any subsequent validate/apply and no automatic write replay. Verify
  failed GET recovery keeps the draft and submission blocked. Cover ordinary
  no-key local setup with real registry/file and installed UI-to-transaction
  evidence, alongside intentional authenticated/Advanced compatibility.
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

## Scenario: bounded Model evidence and semantic draft reversion

### 1. Scope / Trigger

A reliable same-serving refresh may introduce a distinct source into a valid
32-source model. The editor must preserve required provenance while keeping the
draft savable within the server's existing bounds. Model discovery, selection,
manual input and automatic enrichment also need distinct dirty-state ownership.

### 2. Signatures

```ts
prefillMetadata(draft: ModelDraft, item: ModelEvidence & { upstream_model: string }): ModelDraft
modelDraftChanged(original: ModelDraft, draft: ModelDraft): boolean
modelErrors(identity: string, draft: ModelDraft): Record<string, string>
withConfirmedMetadata(model: ImportModel, draft: ModelDraft, confirmedAt: string): ImportModel
metadataForWrite(draft: ModelDraft): ModelMetadata | undefined
metadataFits(metadata: ModelMetadata | undefined, draft: ModelDraft): boolean
```

`ModelDraft.metadataHistory` and `metadataRefreshBlocked` are editor memory;
`withConfirmedMetadata` writes the existing metadata envelope. They add no
runtime capability, persisted schema field or backend compatibility flag.

### 3. Contracts

Persistence remains at most 32 sources and 262,144 UTF-8 bytes. Account for the
complete envelope, field references and confirmation records with the gateway's
JSON representation. Nonempty reasoning-effort lists, Unicode and number
serialization need actual boundary verification, not an approximate character
count. Backend validation remains authoritative and unchanged.

The JSON request token determines Python's numeric type. Fractional decimal
tokens below `1e-4` use scientific notation in `json.dumps`, with a padded
single-digit exponent; `0.000001` therefore counts as `1e-06`. Decimal integer
tokens stay integers, even where the originating JavaScript value was written
using exponent notation. Verify both threshold neighbors and wire types against
Python itself and actual gateway saves, retaining all required source references.

Retain every source required by stored field references or a newly confirmed
current field. Deduplicate incoming identical evidence without losing distinct
stored IDs already referenced by fields. Resolve current identity back to the
persisted IDs after deduplication/remapping. Only unreferenced persistence
history may be removed to fit; editor history remains inspectable.

If a refresh cannot fit without losing required references, retain the prior
savable values, ownership, dates and certainty, preserve the rejected response
in editor history and explain how to retry. Do not silently apply an overfull
envelope. Unchanged field/envelope confirmations keep their original dates.

Import dirty state derives from active selections, manual input, batch fields
and differences between user drafts and their automatically enriched baselines.
Fetching, searching or reading evidence alone does not create a user edit.
Clearing a selection or restoring original inputs becomes clean when no other
edit remains; real unselected edits stay guarded. Dialog baselines follow
automatic enrichment and evidence invalidation without absorbing user changes.
Synchronize the parent guard before an immediate supplier/page switch.

Pending-write locks remain in the manager/navigation contract. A successful
import clears only imported drafts and batch state, retaining unrelated edits.

### 4. Validation and error matrix

| Boundary | Required outcome |
| --- | --- |
| Valid 32-source record, added unreferenced history | Prune only unreferenced persistence history; retain required IDs/current references and full editor history |
| All 32 sources required, incoming distinct source | Keep prior savable draft/confirmations; visible capacity/retry explanation; no invalid-envelope PUT |
| Count fits, full UTF-8 envelope exceeds 262,144 bytes | Same retained-draft behavior; unchanged server size limit |
| Invalid draft still exceeds bounds | `modelErrors.metadata` uses `pmEvidenceLimit`; save is unavailable |
| Select all then clear without edits | No writes, no discard prompt, normal Settings/supplier navigation |
| Clear selection with genuine unselected edits | Guard departure until confirmed discard; retain draft on refusal |
| Automatic refresh/read-only inspection | No user dirty state or false fresh confirmation |

### 5. Good / base / bad examples

A model has 32 sources, but fields reference only `old-0`. A new reliable source
can coexist with `old-0` in persistence, while the other 31 remain in editor
history. If all 32 are required, a distinct 33rd source remains history only;
an unrelated display-name save still uses the valid prior envelope.

Manual price `9` remains manual and keeps its required provenance. Unchanged
quality `2.5` remains the existing legacy value. Neither an incoming source nor
an unrelated edit makes those values newly inferred or clears their references.

### 6. Required assertions

- Preserve the original 32-to-33 real-backend rejection and native
  selection/clear/navigation failures. Repeat exact repro bodies after repair.
- Check real save/reload and exact disk preservation under source-count and
  UTF-8 boundaries, required references, current ID collisions/deduplication,
  manual priority, original dates and legacy unrelated edits. Include nonempty
  effort lists and near-limit envelopes.
- Native individual/select-all/manual/batch/candidate reversion becomes clean;
  clearing selection does not hide genuine unselected edits. Pending navigation,
  failed-save retention, immediate supplier switching and successful-import
  cleanup keep their original guards.
- Keep original U13, U08 entrance inventory, U15 pending coverage and all
  35-cycle focus/footer/geometry assertions. Selected developer support does not
  replace complete independent Models acceptance.

### 7. Wrong vs correct

Wrong: append all sources and let an unrelated save fail at the server, or evict
a referenced source to meet the count. Correct: preserve required provenance,
remove only unreferenced persistence history, and reject an unsafe refresh while
retaining the prior valid draft.

Wrong: call `onDirtyChange(true)` after every selection/input event and never
clear it on semantic reversion. Correct: compare actual user state with the
appropriate baseline and retain the separate pending-write guard.

## Scenario: shared management errors after reconnection

### 1. Scope / trigger

Use for default, model, supplier and gateway credential commands, their recovery
reads, and catalog refresh callbacks. An old request may fail after the Dashboard
has suspended and admitted a new connection. That failure cannot own the new
connection's authentication or feedback.

### 2. Signatures

```ts
save(operations: ProviderOperation[]): Promise<boolean>
saveGatewayCredential(value: string): Promise<boolean>
retryCatalogRefresh(): Promise<void>
recoverUncertainWrite(current: ProviderConfiguration, generation: number): Promise<ProviderConfiguration | null>
```

The shared `useProviderManagement` hook keeps monotonic write, refresh and
suspension generations in memory. Public APIs, persistence, credential actions
and revision format remain unchanged.

### 3. Contracts

Each command captures write and suspension ownership. Only its current active
callback may set error state or invoke unauthorized handling. A retired catch
returns false to the original form for draft restoration. A current 401 retains
normal suspension behavior. Restore the command's error owner before publishing
a current error.

Suspension retires feedback without releasing the admitted write lock. Until
that command settles, another command cannot validate or write. Its finalizer
releases pending state only while it owns the write slot; it cannot finalize a
newer command. GET, validation and applying PUT remain distinct stages.

An actual successful PUT publishes its committed revision/configuration even
after suspension and requires GET-only catalog recovery. An unknown applying
PUT records uncertainty even after suspension. A later explicit command requires
a successful configuration GET before validation or mutation; a failed GET
keeps that prerequisite. Never replay PUT automatically.

Catalog refresh has separate ownership. A new refresh or write retires an older
refresh; an old error cannot disconnect the new admission or finalize its busy
state. If a retired callback still owns its recovery slot, preserve the need
for catalog recovery. Status alone never determines callback ownership.

### 4. Validation and error matrix

| Condition | Required result |
| --- | --- |
| Old validation 401/400/503/network error after reconnect | No new disconnection/error; original draft restored; zero old PUT |
| Current authenticated operation returns 401 | Existing unauthorized handling and suspension |
| Retired write remains unresolved | Pending/lock remain; other commands rejected |
| New refresh/write supersedes older refresh | No obsolete error or busy finalization |
| Applying PUT outcome unknown | Successful recovery GET before later POST/PUT |
| Successful PUT settles after suspension | Committed state retained; catalog recovery uses GET only |

### 5. Good / base / bad cases

Good: hold default validation, suspend through a theme 401, reconnect, then
release old validation as 401. Settings remains connected with the old draft and
no configuration PUT. Base: an active current 401 still disconnects the
Dashboard. Bad: calling `failure(caught)` from every catch, allowing an obsolete
request to revoke the new admission.

### 6. Required assertions

Preserve the original successful-validation R1 and failing 401 companion. Cover
all four command owners, current 401, older 401/400/503/network errors, retained
drafts, simultaneous admission refusal and newer error/pending ownership. Hold
each real request phase before assertions; Loading begins before PUT receipt.
Assert uncertain recovery order `GET → GET → POST → PUT`, zero writes after a
failed recovery GET, and GET-only recovery for a known committed write. Retain
catalog success/error overlap and existing Settings/App/async frozen assertions.
Implementation support cannot replace independent checks on combined source.

### 7. Wrong vs correct

Wrong: every catch invokes unauthorized handling and every finally clears busy.
Correct: check current activity/operation ownership before feedback and current
write/refresh ownership before finalization, preserving committed information.

## Scenario: configured-model details share the model editor

### 1. Scope / trigger

Use for the configured-model list, its independent View details surface and
import preview. All three edit entrances use ModelDialog and the existing
whole-record transaction. The details surface is a read-only projection in the
Models workspace, without a separate route, dialog or persistence contract.

### 2. Signatures

```ts
openEditor(record: ProviderModelView): void
ModelDetails({ id, model, connectionLabel, t, editDisabled, onEdit }): React.JSX.Element
```

`selectedDetail` stores only the canonical `record.name`. The visible details
record is resolved from the current configuration, provider and search result.
`openEditor` cancels the current query, captures an opened record and selects its
canonical ID. The existing editor keeps current availability, routing ownership,
source evidence, revision, pending and failed-draft handling.

### 3. Contracts

List Edit and detail Edit call the same opener. Import preview continues to use
the same ModelDialog component, and configured duplicates remain skipped. A
native acceptance fixture may transition the same canonical identity from
configured list/details to unconfigured preview without changing that permission.

Details display the current configured name, connection, upstream identity,
enabled state, prices, limits, capabilities and routing summary. Use the existing
field inventory and draft projection. Preserve explicit zero, false and empty
effort lists; blank/null values remain unknown. Prices retain USD-per-million
units. Configured values alone do not establish fresh source certification. The
ordinary surface contains no credential references or generated canonical IDs.

The read-only quality label describes the stored value without imposing the new
value range. A legacy finite `2.5` remains inspectable; actual new/imported/changed
quality still requires `0..1` through existing editor/server rules.

Viewing and collapsing details are clean and send no validation or write. A
provider switch clears detail selection; filtering and removal hide unavailable
details. Successful save refreshes them from current configuration; failed save
retains configured values and the complete opened editor draft. Pending locks
protect all edit/view actions and departure. Detail Edit is disabled without
write permission; the existing list compatibility entrance can still inspect
the read-only editor. It cannot save.

### 4. Validation and error matrix

| Condition | Required result |
| --- | --- |
| List/detail/preview Edit | Same complete ModelDialog and whole-record contract |
| View/collapse or clean cancel | Zero validation and PUT, no dirty departure prompt |
| Failed validation or write | Full raw draft retained, details show stored values |
| Held validation / held PUT | Respectively zero PUT / exactly one PUT after actual receipt |
| Removed, filtered or switched record | No wrong detail; preserved editor recovery where open |
| Read-only configuration | Inspectable details, disabled detail Edit and editor Save |
| Retained legacy quality `2.5` | Honest read-only label; unrelated-edit compatibility unchanged |

### 5. Good / base / bad cases

Good: open View details for a configured record, use the Edit action inside that
region, save a price/capability/limit change once and observe current saved
details. Base: list and preview retain their existing editor behavior. Bad:
count one list button as two entrances, or display a copied stale details record
after a save or provider switch.

### 6. Required assertions

Retain the original missing U08 entrance body, hashes and failed run. Independently
identify all three actual contexts for the same canonical model. Check the
18 logical fields and all 20 native controls, 35 Tab cycles in both directions,
native modal/footer/hit geometry and focus return at 320×640 and 1280×640 in both
locales and themes. Closing returns to the visible list/detail trigger or model
search when filtering, rename or removal hides it. Preserve all original U08/U15
assertions. Await the actual held PUT receipt before pending-write oracles; do
not confuse earlier validation/loading with the applying phase. Real gateway
save/reload and installed UI remain separate from synthetic implementation tests.

### 7. Wrong vs correct

Wrong: add a second editor with different validation or show credentials in the
detail projection. Correct: keep a distinct read-only detail context with its
own Edit action that uses the existing protected editor and transaction.

## Scenario: canonical effort confirmation and raw provenance controls

### 1. Scope / trigger

Use for metadata parsing, model import and whole-record updates. Submitted
capability and known/confirmed effort lists may contain legal duplicates or a
different order. Raw supplier declarations remain a separate history record.

### 2. Signatures

```python
ladder_from_list(value: Any, subject: str) -> tuple[str, ...]
model_metadata(value: Any) -> dict[str, Any]
_import_model(entry: Any, provider_id: str, *, existing_model: Mapping[str, Any] | None = None) -> dict[str, Any]
```

Use the existing `reasoning.ladder_from_list`; do not add a second ordering table
or a new bound on the submitted runtime list.

### 3. Contracts

Normalize runtime capabilities before comparing confirmed metadata. A non-null
known/confirmed effort field is copied into the same seven-token canonical
order with duplicates removed. Only confirmed evidence must agree with the
completed runtime record. Known evidence retains its unconfirmed status.
Unknown/conflict fields retain omitted/null values; known empty lists stay empty.

Never mutate the caller's record. Missing metadata remains missing and explicit
null remains null. Reading legacy lists returns canonical fields without a disk
migration. Persistence keeps canonical capabilities and field evidence together.

Raw `sources[].source_reasoning_effort` and source
`fields.reasoning_effort.value` retain order, duplicate/freeform/null entries and
their 16-item limit. IDs, source references, manual/source ownership, field paths,
units and dates remain unchanged. The original metadata envelope is validated
against 32 sources and 262,144 UTF-8 bytes before field projection.

All provenance text predicates reject C0 and DEL, including generic source text,
source-field paths/units, raw field effort and original effort declarations.
Ordinary Unicode remains valid. Rejection precedes file replacement, activation
and configuration-version publication, using the existing fixed safe errors.

### 4. Validation and error matrix

| Input | Required result |
| --- | --- |
| Capabilities `['high', 'low', 'low']`, confirmed `['low', 'high']` | Accept and persist canonical `['low', 'high']` for both |
| Capabilities `['low']`, confirmed `['high']` | Safe `400`; exact files, modes, SQLite history and runtime unchanged |
| Known field `['low'] * 17` | Canonical `['low']`; original caller unchanged and no new runtime-list cap |
| Raw source list with 16 / 17 entries | Retain 16 verbatim / reject 17 before mutation |
| Original envelope is 262,144 / 262,145 bytes | Accept / reject, even if duplicate removal would shrink the oversized record |
| Rebound source ID, path, unit or effort item contains DEL | Safe rejection independent of missing-reference validation |
| Legacy read with legal duplicates | Canonical response, original configuration bytes unchanged |

### 5. Good / base / bad cases

Good: reordered confirmed and runtime efforts describe the same supported
levels, so a complete save returns and persists the same canonical ladder.
Base: raw vendor declaration `['vendor/freeform', None, 'low', 'low']` remains
inspectable verbatim. Bad: a source ID containing DEL passes only because its
field reference was changed to the same invalid text.

### 6. Required assertions

Retain the original three confirmed/runtime failures, five DEL failures and
their unchanged 51-case SQLite supplements. Check applying response, GET,
persisted JSON, active profiles, reload/restart and CLI agreement, including
source/manual confirmations and all seven levels. Assert caller-copy isolation,
optional metadata/null semantics, unchanged raw history and source references.

Exercise all raw text slots with ordinary Unicode, NUL, C0 and DEL; rebind source
IDs so control rejection is independently proven. Check both import and update,
all file existence/bytes/modes, flushed SQLite version rows, registry/catalog
identity and healthy synthetic chat after rejection or activation rollback.
Use 32 sources, nonempty duplicate fields and actual Python numeric wire types
at the original UTF-8 boundary. Preserve original contrary field/history
assertions and failed runs when migrating a shared expectation to this contract.

### 7. Wrong vs correct

Wrong: compare unnormalized arrays, rewrite raw source history, or measure only
the shortened normalized envelope. Correct: validate original bounds, normalize
copied runtime/field values with the existing ladder, preserve raw history and
reject provenance controls before mutation.
