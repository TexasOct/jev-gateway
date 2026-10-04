# Runtime initialization and incomplete configuration

## 1. Scope / trigger

Use this contract when changing first-run configuration, the management-key
bootstrap, empty catalogs, installation templates or dashboard onboarding.
Provider and routing edits retain their existing transaction and overlay owners.

## 2. Signatures

```text
GET /v1/setup
POST /v1/setup {expected_revision, api_key}
PUT /v1/gateway-credential {expected_revision, credential: {action: "set", value}}
jev setup [--secret-stdin | --secret-env NAME]
jev install init
jev config reload
```

The initialization owner is independent of gateway.py so CLI setup does not
construct an application while reading or writing configuration.

## 3. Contracts

Packaged defaults retain task_aware, quality and economy strategies without LLM
providers, decision-provider instances, models or upstream credential assignments.
Optional provider presets belong to onboarding choices. Omitted providers/models
parse as empty lists. Empty tag-based model pools are valid editable states;
unknown explicit model references and all schema/credential invariants still fail.
The packaged template omits provider/model arrays and decision-provider arrays.
Retain the original auto kind for quality/economy so adding decision providers
later preserves registry dispatch, as well as their mode, selection and reasoning.

Installation and default foreground startup create absent configuration files
under the shared file lock. They preserve existing bytes, including malformed
files, and never interpret a failed read as permission to replace a file.
Create absent `models.json`, comment-only `.env` and an empty version 1
`credentials.json` store from its packaged template; protect the new store with
mode `0600`. Preserve existing credential bytes and modes.
Explicit missing configuration paths retain their error contract. Installation
provenance is separate from the configuration initializer.

GET returns required, local_setup_available, revision, has_providers, has_models,
routing_ready and next_step. The latter is gateway_key, provider, model, routing
or ready. A configured key requires normal Bearer authorization. Routing progress
describes default-strategy pools or a usable global default and never gates process startup or console access.
Setup reads and CLI setup may inspect a declared gateway reference whose effective
value is empty, so setup can repair it without renaming the reference. This exception
belongs only to setup inspection; runtime startup and reload keep strict gateway
credential resolution. Setup becomes one-time when an effective key exists.
Suppliers and models may be configured later, including a provider saved before
its first confirmed model import. Dashboard writes activate state; reload also
activates valid file changes without reinstalling.

POST accepts only expected_revision and an api_key of 16 to 8192 visible ASCII
characters without whitespace. Native Fetch normalizes outer header
whitespace and rejects non-Latin-1 values; reject incompatible new keys before
writing, and prove setup plus reconnect over real HTTP. Gateway resolution trims
outer whitespace only from legacy dotenv and captured process values. JSON values
and plain injected mappings stay literal and must pass strict gateway validation;
provider, transport and decision values remain untrimmed. Preserve credential-file
bytes and modes when reading. Both HTTP bootstrap endpoints require
the original listener to be loopback, an actual loopback peer and one valid
Host. A supplied Origin must match the request origin; reject forwarding
headers. Reloading a different file host cannot grant bootstrap eligibility.
Apply these checks before parsing anonymous setup bodies, including malformed
requests; body validation cannot bypass the bootstrap boundary.
Recheck revision and key absence under reload-lock then file-lock.
`ManagementSetup.configure()` delegates to `ProviderConfiguration.gateway_credential()`
for managed writes. Persist the reference in `gateway.api_key_env` and the value
in protected `credentials.json`. Preserve an existing declared reference name;
use the owner's default only when no reference exists. Retain shared-reference
guards and the setup endpoint's refusal to replace an existing management key.
The credential endpoint permits authenticated SET replacement and immediately
activates the submitted key. Keep each endpoint's request, safe response and error
contracts. See [credential configuration](./credential-configuration.md).
New writes preserve legacy dotenv bytes. Legacy CLEAR removes only selected
assignments, retaining unselected bindings' text, line endings, comments and
ordering. Parse original spans so key-looking text in an unrelated multiline
value remains untouched. Clearing a missing name is byte-identical; backups retain
the complete original bytes. Cover CRLF and missing-final-newline preservation.
Prepare the merged catalog and registry before replacing files; activation and
rollback use the existing recoverable configuration transaction.

CLI setup uses the same service with an explicit secret source or no-echo TTY
prompt, never a secret-valued argument. No API/CLI result, log, browser store or
URL contains credentials. The browser clears completed drafts and retains the
key only in the existing client module memory. After refreshing, reconnect.

Startup, reload and provisioning reads use the shared immutable credential
snapshot and explicitly allow pending LLM credentials. Direct catalog parsing
and CLI validation stay strict. A declared gateway reference always requires a
value, so credential loss cannot enable anonymous serving. A selected pending LLM
provider returns `503 provider_credentials_missing` before an upstream call.
Missing decision credentials retain their skip/fallback behavior.

No-model chat and preview fail with a fixed 503 setup_incomplete response before
any decision or generation provider call. Liveness and configuration reads remain
available. Invalid existing configuration remains an error, not an empty default.

Global defaults live in optional baseline defaults.default_model, with a canonical
provider/upstream_model reference or null. Omitted defaults means no global model;
explicit defaults:null, unknown keys, wrong types and dangling references reject.
Every strategy's empty matched tag inherits that model, reports tier/label default
and retains matched-rule evidence in reason. No per-strategy overrides are added.
Without a global default, an empty matched tag returns setup_incomplete before
generation. Nonempty tag pools remain usable. Default-labelled pinned/cached/fresh
sessions must not fail label/rank lookups; reasoning uses its documented fallback.
Carry explicit defaulted source evidence through outcomes, decisions, previews,
session snapshots and existing retained JSON signals. It is true for global
fallback and false for a configured literal label named default. Pins and
escalations preserve the source independently of bounded event history. Translate
the reserved result only; preserve a user-defined label's literal name. Read-only
configured-path views show inherited global destinations separately from assigned
tag members, without creating overlay membership writes.
Read-only matrix paths resolve an omitted choice label to the first configured
label and retain legacy tier-alias compatibility. Share that resolution across
monitoring and configured graph views; do not write an inferred label or model
membership into the draft or overlay.
When several configured branches share an inherited pool and model, scope each
rendered fallback wire to its owning branch. Selecting one branch must not
activate another branch's repeated rendering of the same graph edge.
New decisions and previews expose defaulted as a boolean. Sessions and retained
decision details expose it only when known. The dashboard session-list allowlist
must retain that optional source and pair it with the chosen retained label;
legacy retained evidence must not borrow a live selection's source. Read it from
existing signals_json, with strict boolean validation and no column migration.
Global reasoning uses policy.reasoning.fallback before model-ladder clamping;
an ordinary literal default label continues to use its configured effort.

Successful SSE capture requires SDK exhaustion, a finish reason and delivery of
the terminal ASGI body frame. Retain native returned model and observed usage
before client-facing model echo. Finalize assistant continuation only after
successful delivery. Errors, incomplete exhaustion, disconnects and failed sends
retain unsuccessful outcomes without completed continuations. Cover usage-only
chunks, terminal-send failures, resource/activity cleanup and store-reopen replay.

## 4. Validation and error matrix

| Condition | Required behavior |
| --- | --- |
| Empty or omitted provider/model arrays | Start and allow initialization, edits and reload |
| Unassigned tag-based pool | Keep editable and show optional incomplete progress |
| Empty matched tag with a global default | Select exactly that model; final label/tier default, localized 默认 |
| Empty matched tag without a global default | 503 setup_incomplete before generation; configuration stays editable |
| Setup key with outer whitespace, controls or non-ASCII | Reject before writes; clear safe validation message |
| Unknown explicit model/provider reference or malformed configuration | Reject without replacing valid active state |
| Chat/preview with no models | Fixed 503 setup_incomplete; no upstream call |
| Remote, nonloopback Host or cross-origin bootstrap | Reject before a file write |
| Effective gateway key exists | Reject setup replacement |
| Declared gateway reference with an empty effective value | Setup read/CLI may inspect and repair; runtime startup/reload reject |
| Stale setup revision | Conflict; unchanged files/live state |
| Setup replacement or activation fails | Restore old bytes and active catalog |
| Wrong configured Bearer | 401 invalid_api_key |
| Existing files on initialization/reinstall | Preserve configuration, credentials, overlays and records |
| Noninteractive CLI setup without secret source | Fail without prompting or printing secrets |

## 5. Good / base / bad cases

Good: initialize access, enter an empty console, save a provider later, confirm
its first model, assign pools and reload. Base: an existing initialized catalog
keeps its files and connects through the current Bearer form. Bad: ship dummy
providers to satisfy parsing or expose unrestricted remote bootstrap writes.

## 6. Tests required

Cover omitted/empty arrays, invalid shapes and explicit references; default
startup with absent files and existing-invalid preservation; setup authorization,
origin/Host checks, revision races, shared references, protected file permissions,
activation rollback and repeat setup. Exercise CLI setup without importing the
gateway and no secret output. Test save-provider-before-model, confirmed import,
pool assignment and reload, plus no-provider-call unconfigured errors.

Browser acceptance covers first-run, optional defer, initialized reconnect,
loading/error/retry, both locales and narrow/desktop layouts. Installed wheel
acceptance starts from the production empty template and follows the actual setup
API through usable routing. Populated behavior tests use synthetic fixtures;
they must not rely on bundled supplier examples or operator configuration.

## 7. Wrong vs correct

Wrong: reject an empty catalog or silently insert providers to make startup pass.
Correct: parse valid incomplete configuration, preserve invalid-input checks,
and report unavailable generation independently of a usable console.

Wrong: temporarily mutate os.environ for setup validation or store a browser key.
Correct: prepare with an immutable credential snapshot and use memory-only client
credentials with recoverable file replacement.
