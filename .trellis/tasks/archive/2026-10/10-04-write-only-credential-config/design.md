# Write-only credential configuration

## Boundary and current gap

`catalog.py` already projects keys as `has_api_key`. `provider_config.py` owns the immutable credential snapshot, candidate validation, revision and recoverable multi-file transaction. Dashboard Provider commands already accept keep/set/clear but persist values in `.env`. Missing declared LLM keys currently abort startup, and configuration writes require an existing gateway key. This prevents a default installation from completing setup in the browser.

Keep the catalog and routing identities stable. Extend the credential source and initialization boundaries, using the existing transaction and frontend Provider workspace. Other Settings and icon tasks remain independent.

## Credential source

Add a neighboring `credentials.json` with a strict versioned shape:

```json
{
  "version": 1,
  "values": {
    "JEV_GATEWAY_API_KEY": "example-gateway-key",
    "OPENAI_API_KEY": "example-provider-key",
    "DECISION_API_KEY": "example-decision-key"
  }
}
```

The names are credential references already declared by `api_key_env` or `param_env` in `models.json`. They do not require exported environment variables. This keeps operator catalogs compatible and supports extra transport credentials without putting secret values in catalog serialization. The precedence is `credentials.json` > neighboring `.env` > captured process environment. JSON string values are literal, including `${...}`. Unknown shape/version, invalid reference names, empty/non-string/multiline/oversized values and unreadable/malformed files fail with fixed safe errors, never file excerpts.

The snapshot owner must have no gateway/CLI imports. Extract existing dotenv/literal handling and validation helpers into a shared root credential module if needed; keep compatible re-exports for existing callers. Startup, reload, CLI inspection/lifecycle, catalog loading, decision clients and candidate previews consume coherent immutable snapshots under the existing lock.

Dashboard SET writes the protected JSON store. CLEAR removes both managed JSON and legacy local dotenv entries for the selected reference; inherited process values can remain effective. KEEP changes neither local source. Shared-reference guards remain. Validation and probes construct candidate snapshots only. Credential file and backup are mode 0600, revision includes its bytes, and recoverable writes include it and its backup. Ignore local secret/recovery/backup files in Git.

## Provisioning and runtime

Permit unresolved declared LLM credentials only in gateway/provisioning catalog loads. Keep strict catalog parsing as the default for existing direct callers and CLI validation. Validate all other schema and routing constraints as before. Safe configuration reads and management candidates can expose pending providers and permit clearing a key. Reject a selected keyless provider before LiteLLM with a fixed 503 error; never let ambient vendor fallbacks supply an undeclared key. Decision providers without a resolved credential retain ordered skip/fallback behavior.

Add a write-only gateway credential operation at `PUT /v1/gateway-credential` accepting `{expected_revision, credential: {action: "set", value}}`. The credential reference is the existing gateway reference or `JEV_GATEWAY_API_KEY` for initial setup. Reject reference sharing, empty values and conflicting revisions. Prepare and validate the full effective catalog and registry before applying a recoverable transaction; activation changes the inbound authentication key immediately. Return only the safe updated configuration.

Initial gateway setup is available only when the active gateway has no key and the configured listener and request peer are loopback. Validate Host/Origin against a loopback browser address and reject forwarding headers so an anonymous public listener or cross-origin request cannot initialize credentials. Once configured, require the current Bearer for this operation. Do not add an anonymous bypass to Provider, routing, discovery or canvas writes. Remote/headless users establish the gateway reference and value in the files before startup.

Expose safe gateway presence/reference and request-specific `gateway_bootstrap_available` in Provider configuration reads. The UI uses a password field for initial setup or authenticated replacement, always starts with an empty draft, clears drafts after submission/cancellation, and retains the new gateway key only through the existing module-memory credential setter. Refresh capabilities/catalog after a successful save. Failed writes and stale responses preserve the correct form state and show fixed API errors.

## Compatibility and operation

Existing models.json/.env catalogs and CLI login/logout remain usable. CLI SET must target the same effective store as Dashboard so an older managed JSON value cannot shadow a rotation. Logout follows the same local CLEAR semantics. Preserve old dotenv interpolation and marked-literal records. JSON file setup requires neither browser nor Node in an installed wheel; `JEV_GATEWAY_HOME` continues selecting the runtime directory.

New-install templates contain no nonempty fake credentials. Initialize a protected, empty version 1 JSON credential store when absent; preserve existing runtime files during initialization/upgrades. Expose the credential file path in safe CLI path output where useful. `.env` templates retain commented examples for legacy operators.

No secret values enter models.json, routing overlays, install state, public projections, configuration-version records or browser persistence. Credential file content is protected local plaintext intended for operators and is never served as a Dashboard asset. Preserve existing fixed-error and safe-log rules.

## Verification

Use fake credentials and isolated runtime homes. Verify parser/precedence/literals, startup pending state, authorized initialization and rotation, missing-key request rejection, CLI rotation/logout coherence, restart/reload, conflict and write/activation rollback. Assert secret absence across successful and failing API responses, catalog/strategy/model projections, records, logs and browser storage. Browser checks cover initial setup, both provider kinds, key replacement/clear, blank saved fields after refresh, authenticated rotation, no-key/wrong-key denial, keyboard access and narrow bilingual layouts. An installed-wheel smoke uses a JSON-only credential home and checks authenticated HTTP/Dashboard after restart.
