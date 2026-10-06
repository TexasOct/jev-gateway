# Credential initialization and file configuration

## 1. Scope / trigger

Use this contract when changing credential parsing, Dashboard initialization,
Provider SET/KEEP/CLEAR, CLI capture, startup/reload authentication or protected
configuration transactions. `jev_gateway/credentials.py` owns immutable resolution
and literal storage. It must not import the gateway or CLI composition roots.

## 2. Signatures

```python
credential_path(models_file: Path) -> Path
credential_values(content: bytes | None) -> dict[str, str]
credential_update(content: bytes | None, name: str, value: str | None) -> bytes
credential_snapshot(
    models_file: Path, *, env_content: bytes | None = None,
    credential_content: bytes | None = None,
    external: Mapping[str, str] | None = None,
) -> CredentialSnapshot
CredentialSnapshot.with_value(name: str, value: str) -> CredentialSnapshot
load_catalog(models_file: Path | None = None, *, allow_missing_credentials: bool = False) -> Catalog
```

The HTTP operation is `PUT /v1/gateway-credential`. Incremental setup also retains
`GET /v1/setup` and `POST /v1/setup`; see [runtime initialization](./initialization.md).
Both setup writers and `jev setup` use `ProviderConfiguration.gateway_credential()`
with the same snapshot, shared-reference protection and recoverable transaction.
Preserve each endpoint's public shape and errors. Provider operations retain
`POST /v1/provider-configuration/validate` and `PUT /v1/provider-configuration`.
CLI capture uses `jev provider login ID --secret-stdin` or `--secret-env NAME`;
the latter supplies a source name, never a key as an argument.

## 3. Contracts

`credentials.json` sits next to the resolved `models.json` and has exactly:

```json
{"version": 1, "values": {"REFERENCE": "synthetic-example-key"}}
```

Resolve only declared `api_key_env` and `param_env` references for consumers.
Precedence is JSON > neighboring `.env` > captured process mapping. JSON strings
are literal, including `${NAME}`. Preserve legacy dotenv ordered interpolation,
duplicate assignment behavior and the `# jev-managed-literal-v1` marker. Build a
local immutable mapping without modifying `os.environ`.

`CredentialSnapshot` retains raw values and an immutable `literal_references` set
for JSON names and pending literal overlays. Gateway resolution alone trims outer
whitespace from legacy dotenv and captured process values; `credentials=None`
uses the same legacy process normalization. JSON values and plain injected mappings
remain literal and must pass strict gateway validation. Provider keys, transport
parameters and decision credentials remain untrimmed. Preserve the snapshot when
validating candidates; CLI provider-add uses `with_value()` for a pending secret
so existing source metadata survives without changing the original snapshot.

SET writes JSON; KEEP preserves local bytes; CLEAR removes the selected name from
both JSON and local dotenv. Inherited values may remain effective. Reject changes
to a reference shared with another provider, transport parameter or gateway.
Exclude only the edited primary-key occurrence when counting consumers; the same
provider's `param_env` still counts. Check the completed candidate too, including
new bindings and consumers introduced by later operations. CLI login/logout use
the same counting rule. Candidate validation and discovery must not persist changes.

Snapshot, revision and transaction reads include baseline, overlay, dotenv and
JSON store under the shared file lock. JSON store, its backup and recovery material
use restrictive permissions. Prepare the candidate registry before persistence;
restore old bytes and healthy active state on persistence or activation failure.
Unresolved recovery blocks disk-based operations. Revisions remain process-keyed.

Gateway requests have exactly:

```json
{
  "expected_revision": "<opaque revision>",
  "credential": {"action": "set", "value": "<new gateway key>"}
}
```

Use the declared gateway reference, or assign `JEV_GATEWAY_API_KEY` when absent.
There is no gateway CLEAR. Bootstrap requires no active key, an original loopback
listener, loopback peer, one valid loopback Host, an optional matching Origin, and
no `Forwarded`/`X-Forwarded*` headers. Changing the file host through reload does
not change the original listener's bootstrap eligibility. Replacement requires
the current Bearer token and activates the new key immediately.

Safe Provider reads add `gateway:{api_key_env,has_api_key}` and request-specific
`gateway_bootstrap_available`. Success returns that projection plus
`{valid:true,applied:true}` and the new revision. Values never appear in responses.
Provider/routing/canvas writes retain their configured-key guard.

Missing LLM keys may be allowed explicitly in provisioning loads. Declared gateway
keys retain strict resolution so loss of a file key cannot activate anonymous
serving. A selected pending provider fails before LiteLLM, including missing
declared transport credentials. Missing decision credentials retain ordered skip
and fallback behavior. Default direct catalog parsing and CLI validation are strict.

The Dashboard starts saved credential fields empty and masks newly entered
values. Capture submitted secrets and actions in component memory, lock controls
and empty secret inputs while validation/write is pending. Failed validation,
reauthentication or saving restores the captured draft; retain raw Vertex JSON
and canonicalize it only for submission. Success and confirmed cancellation clear
input state. A committed write followed by a failed catalog read keeps inputs
empty and offers GET-only recovery. The current gateway connection key remains in module memory;
refresh requires the operator to enter it again. Neither provider credentials nor
the connection key go into URL, cookies, localStorage or sessionStorage. A GET's
`401` waits for pending gateway writes to settle. A successful write installs the
submitted connection key before releasing those reads; a failed write retains
normal unauthorized handling. A stale GET may retry once using the newest key.
Writes never retry automatically. Provider inputs clear when capturing the
validation payload and restore on failure; do not retain them during the
following catalog refresh or lose them after a rejected write. Reauthentication
retains drafts in the mounted hidden/inert workspace while suspending its activity.
Deleting temporary replacement text with native input or keyboard actions
restores KEEP before submission, for primary and every managed transport field.
The deleted value must not survive in a captured payload or be restored after
that submission fails. This UI rule does not permit an API `set` action with an
empty string; the API continues to reject invalid SET values. Explicit CLEAR
remains distinct from blank replacement and default-authentication detachment.

New install paths create an empty version 1 store with mode `0600`; preserve
existing files. Dotenv templates contain comments only. Installed wheels support
file-only startup without a browser or Node.js. Runtime selection remains
`--home`, `JEV_GATEWAY_HOME`, install state, then `$HOME/.jev-gateway`.

## 4. Validation and error matrix

| Condition | Required result |
| --- | --- |
| Invalid version/shape, duplicate JSON fields, unreadable or malformed store | Fixed safe error; never quote file content |
| Reference not an ASCII identifier, or longer than 256 characters | Reject before write |
| Empty/blank/non-string secret, CR/LF/NUL, or value over 8 KiB | Reject before write |
| Store over 1 MiB or more than 1024 names | Reject before write/read activation |
| Gateway value has whitespace, controls or non-ASCII text | `400 invalid_gateway_credential` |
| Gateway operation is invalid or uses KEEP/CLEAR | `400 invalid_gateway_credential` |
| Current configured Bearer is absent or wrong | `401 invalid_api_key` |
| Anonymous bootstrap is not an eligible loopback request | `403 gateway_bootstrap_unavailable` |
| Stale revision | `409 revision_conflict`; retain files/runtime |
| Gateway persistence/activation fails | `500 gateway_credential_failed`; recover old state |
| A selected LLM provider lacks a declared credential | `503 provider_credentials_missing`; zero upstream calls |
| A declared gateway reference loses its value | Reject load/reload/candidate activation; preserve healthy auth |
| Replacement text is entered and then deleted in the UI | Submit KEEP without the removed value; preserve stored bytes and actions |

## 5. Good/base/bad cases

Good: a default local installation starts pending, initializes a gateway key through
the password form, then saves both provider kinds; a refresh shows presence and
empty fields. A headless installation supplies the same names in JSON before startup.

Base: an existing `.env` catalog continues to use ordered interpolation until JSON
SET overrides a declared name. CLEAR removes local values and may reveal an inherited
one, reported accurately by `has_api_key`.

Bad: a public listener permits anonymous initialization, a cleared gateway key
silently disables authentication, or a missing declared LLM key reaches LiteLLM's
ambient vendor fallback.

## 6. Tests required

- Store/parser: literal values, source precedence, immutable snapshots, no process
  mutation, duplicate fields, every bound, fixed errors and JSON-only transport keys.
  Cover padded legacy gateway values, literal JSON overrides, unchanged file bytes
  and modes, missing/blank/inner-whitespace rejection, and source-preserving CLI add
  candidates in dry-run and real writes.
- Runtime/HTTP: local bootstrap, Host/Origin/proxy/peer/listener denials, malformed
  body authorization, immediate rotation, stale revision, missing-provider guard,
  declared gateway loss, reload/restart and preservation of healthy active state.
- Transactions/CLI: both provider kinds SET/KEEP/CLEAR, sharing guards, CLI rotation
  and logout over JSON/dotenv, nonmutating previews, write/activation rollback,
  backup modes, recovery lock cooperation and safe path/show output. Reject
  own-provider transport sharing in Dashboard and CLI, including dry runs, new
  upsert bindings and a consumer introduced by a later operation.
- Privacy: safe read/validate/apply/model/strategy responses, SQL history/requests,
  logs/errors, static-file access denial, empty refreshed forms and browser storage.
- Browser: initialization, early read `401` before a rotation response, failed
  rotation, no duplicate writes, conflict retry, cancel, both provider kinds with
  delayed validation/write/catalog reads, 320px English/Chinese keyboard access
  and existing Provider workflows. Assert captured-secret removal while pending,
  failed-save raw value/action restoration, reauthentication retention, explicit
  CLEAR versus default-auth detachment and GET-only committed-write recovery.
  Exercise actual keyboard/input deletion after typing a temporary replacement,
  then save through validation and applying PUT. Assert absent deleted values and
  unchanged primary/transport credentials, including the AWS access ID, secret
  and session token. Repeat against installed assets and real file persistence.
- Installed acceptance: empty packaged store, JSON-only credentials, protected
  backups, key rotation, authenticated reload/restart, file preservation and normal
  uninstall in a throwaway runtime home.

## 7. Wrong vs correct

Wrong: SET writes only `.env` while an older JSON value still wins precedence.
Correct: every managed writer updates the JSON store and CLEAR removes both local
sources for the selected reference.

Wrong: excluding the whole edited provider from the sharing check also removes
its transport consumers. Correct: exclude only its primary-key occurrence and
count every transport binding in current and completed candidate documents.

Wrong: return an existing key to prefill a password input or place it in browser
storage for reconnecting. Correct: return presence/reference only, start inputs
empty and keep a newly entered connection key in module memory.

Wrong: apply the LLM provisioning flag to a declared gateway key. Correct: permit
pending upstream setup while retaining strict inbound authentication resolution.

Wrong: let a stale GET disconnect the Dashboard while the rotation response is
pending, or retain a submitted provider key in its input during catalog refresh.
Correct: settle the authentication handover before read failure handling and clear
provider input state as soon as the submission payload is captured, restoring the
captured values/actions only if validation or the write fails.

## Scenario: supplier focus frames preserve native secret editing

### 1. Scope / trigger

Opening a supplier schedules initial form focus. Cancelling another editor may
also schedule return focus. A delayed frame must respect the user's subsequent
focus and native text selection, including Select All followed by Backspace.

### 2. Signatures

```ts
useWorkspaceFrames(active: boolean): (callback: () => void) => number
scheduleFocus(target: () => HTMLElement | null | undefined): void
```

`ProviderView` keeps focus operation generation, observed focus generation and
the scheduled frame handle in memory. These are UI ownership markers, with no
credential, model, configuration or persisted-schema effect.

### 3. Contracts

Each scheduled focus cancels an older frame and captures operation/focus
ownership. A later `focusin`, superseding operation, workspace suspension or
unmount prevents that callback from moving focus. Cleanup removes the listener
and cancels the frame. Preserve initial focus when the user has not moved it.

Capture the original Edit target before scheduling return focus; an instance
kind and stable ID select the current visible trigger, with the existing visible
Add fallback. Later mutable trigger changes cannot redirect an older callback.

Native input capture and KEEP/SET/CLEAR semantics remain unchanged. A scheduled
focus must never collapse a selected replacement before its native deletion.
An actually empty replacement submits KEEP without a value and preserves
credential bytes. A nonempty captured value remains SET.

### 4. Validation and error matrix

| Event | Required result |
| --- | --- |
| Open editor, user has not moved focus | Existing initial form focus |
| User focuses/selects a password before the frame | No later focus theft or collapsed selection |
| New opening/cancellation supersedes an older frame | Only current operation may focus |
| Workspace suspension/unmount | Pending frames cannot affect reconnect/new owner |
| Native deleted replacement followed by save | Length zero, KEEP, absent value, unchanged actual credential bytes |
| Pending validation/write failure | Captured raw values/actions restored; no stale focus resets the draft |

### 5. Good / base / bad examples

The operator selects all 23 characters and presses Backspace. The input becomes
empty and the existing credential remains unchanged. A baseline delayed focus
to the first select collapses that selection; deleting only one character leaves
a nonempty replacement and causes SET. This proves focus interference, not an
empty DOM value being converted to SET.

### 6. Required assertions

Preserve the original installed N1 failure and immediate DOM/action/selection/
focus/frame instrumentation. Repeat primary, AWS and Vertex native typing and
deletion in both languages and narrow/desktop windows, with actual PUT/file
bytes, pending clearing and failed raw-draft restoration. Keep N2's historical
standalone typing failure open until independent current-source reconciliation;
passing baseline/fixed runs cannot erase it. Source compilation and installed
wheel evidence must identify their different asset/runtime provenance.

### 7. Wrong vs correct

Wrong: unconditional `requestAnimationFrame(...focus())` after the user has
already selected a secret input. Correct: schedule through workspace activity,
cancel previous requests and check operation plus subsequent-focus ownership.

Wrong: certify cleanup after refusing a changed process identity while its
gateway remains listening. Correct: retain the failure, reconcile authentic
owned identity, and verify any later cleanup with separate current evidence.
