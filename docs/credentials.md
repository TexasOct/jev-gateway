# Credential configuration

Dashboard setup, CLI capture and server configuration files use the same credential
references. A saved key is never returned by a Dashboard API. The UI shows whether
a key is available and lets you replace or clear a provider key with a new input.

## Dashboard initialization

Start a new local installation with `jev start`, then open
`http://127.0.0.1:8000/dashboard`. Missing provider keys do not prevent setup;
requests that select a provider with a missing declared key return
`503 provider_credentials_missing` before any upstream call.

The default configuration has strategy plans with no providers or models.
Set the first management key in the initialization form, then enter the console
and configure suppliers when ready. For terminal setup, use `jev setup`; if the
service is already running, follow it with `jev config reload`.

In General settings, open Access and security to replace the gateway access key.
Retain your own copy for API clients and future Dashboard connections. The
Dashboard uses this gateway key for its current Bearer authentication; supplier
credentials authenticate the gateway's outbound calls instead.

In Suppliers:

1. Choose a supplier or connection method and enter its required connection
   information. The normal flow generates stable instance and credential-reference
   identifiers. Existing environment/shared-reference setups remain available in
   the advanced controls.
2. Enter the upstream credential and save. An empty replacement preserves the
   saved value; clearing a local credential is an explicit action.
3. Repeat for decision suppliers when needed. The decision endpoint and protocol
   remain separate from LLM transport configuration.

Vertex connections provide a service-account JSON input. Bedrock connections
provide an access ID, secret access key and optional session token. The console
generates the corresponding `param_env` references and submits explicit
`transport_credentials` actions through the existing provider transaction. These
values use the same protected credential store as primary API keys. Pasted Vertex
JSON is canonicalized for submission; a failed save retains the original input.

Cloud connections also offer server/default authentication. Selecting it detaches
the direct credential bindings so they cannot override native authentication. It
keeps the detached protected values; use an explicit Clear action to remove a local
value. Account-specific project, location and region fields still apply. The
connection test describes its model-listing scope and does not certify generation
or native account access when that transport has no supported listing probe.

The server writes `credentials.json` next to `models.json`. Credential inputs start
empty. A successful save or confirmed cancellation clears them; a failed save
preserves the draft for retry. The browser keeps the active
gateway connection key in module memory only. Refreshing the page loses that
connection key and requires entering it again; saved provider keys remain on the
server and are never inserted into the form.

First initialization requires a loopback listener, loopback request peer and a
valid loopback Host with an optional matching Origin, without proxy forwarding
headers. Eligibility uses the original listener even after reload. A public listener
or reverse-proxy connection must use CLI or file setup first. Once the gateway has a key,
management operations require its Bearer token. **Replace access key** authenticates
with the current key, activates the new one immediately and keeps this page
connected with the submitted value. Other clients must use the new key.

`POST /v1/setup` and `PUT /v1/gateway-credential` use the same managed credential
owner and protected JSON store. Setup accepts `{expected_revision, api_key}` and
refuses to replace an existing key. The credential endpoint accepts
`{expected_revision, credential: {action: "set", value}}` and allows authenticated
rotation. Both preserve the configured reference name; only an undeclared
reference receives the default `JEV_GATEWAY_API_KEY`. Their public response shapes
and errors remain distinct; see [the HTTP reference](http-api.md).

## Files for a headless server

Use the same runtime directory as the gateway: `--home` for CLI commands,
`JEV_GATEWAY_HOME` for the foreground server, the recorded install directory, or
`$HOME/.jev-gateway`. The process working directory does not select the catalog.
An installed wheel needs neither a browser nor Node.js for configuration or serving.

The catalog contains references and connection metadata. This minimal
`models.json` defines one manually selectable model and the required default
strategy:

```json
{
  "gateway": {
    "host": "127.0.0.1",
    "port": 8000,
    "api_key_env": "GATEWAY_KEY"
  },
  "providers": [
    {
      "id": "service",
      "type": "openai",
      "api_base": "https://provider.example/v1",
      "api_key_env": "SERVICE_KEY"
    }
  ],
  "models": [
    {
      "provider": "service",
      "upstream_model": "model-id"
    }
  ],
  "policy": {
    "mode": "fresh",
    "tier_models": {
      "simple": ["service/model-id"],
      "standard": ["service/model-id"],
      "complex": ["service/model-id"]
    }
  },
  "strategies": {
    "task_aware": {}
  }
}
```

Create `credentials.json` in that directory, replacing the example values with
your own keys. The names must match the catalog references:

```json
{
  "version": 1,
  "values": {
    "GATEWAY_KEY": "replace-with-gateway-key",
    "SERVICE_KEY": "replace-with-provider-key"
  }
}
```

Set its permissions before starting. No exported provider or gateway secret
variables are required:

```bash
chmod 600 /srv/jev/credentials.json
jev --home /srv/jev config validate
JEV_GATEWAY_HOME=/srv/jev jev-gateway
```

Use `SERVICE_KEY` for the provider `service/model-id`. A decision provider can
likewise declare `decision.providers[].api_key_env`, and additional transport
credentials use `providers[].param_env`. All use the same `values` mapping. Values
are literal JSON strings; `${NAME}` has no interpolation meaning in this file.

New installations create an empty version 1 store from its packaged template,
with mode `0600` and no fake keys. Initialization preserves existing bytes and
modes; upgrades preserve operator files. `jev config path` reports safe paths;
`jev config show` reports references and effective presence without values.

## Precedence, replacement and clearing

For a declared reference, precedence is:

| Source | Priority |
| --- | --- |
| Neighboring `credentials.json` | Highest |
| Neighboring `.env` | Used when the JSON store has no value for the name |
| Captured process environment | Used when neither local source supplies the name |

Existing environment-based catalogs continue to work. Legacy `.env` entries retain
their ordered dotenv interpolation and JEV managed-literal marker behavior.
Resolution builds an immutable local mapping and never temporarily overwrites
`os.environ`.

Dashboard and CLI SET write the JSON store. KEEP preserves local values. Provider
CLEAR and CLI logout remove that reference from both the JSON store and local
`.env`; an inherited process value can remain effective, so `has_api_key` can still
be true. Clearing does not revoke the upstream account key. A shared reference
cannot be changed through a single provider operation because that would also
change another provider or gateway. Give independently managed providers separate
references.

Setup reads and CLI setup can inspect and repair an empty declared gateway
reference. Once an effective gateway key exists, one-time setup refuses replacement;
use authenticated rotation instead. Runtime startup and reload always reject a
missing declared gateway key, preserving the authentication boundary.

Dashboard changes activate after successful validation and persistence. Direct
file edits and CLI changes are loaded by `POST /v1/routing/reload` or restart.
Authenticate a reload with the current active gateway key. If the file changes
that key, the new key becomes active after reload; subsequent requests use it.
Host, port, storage and logging changes retain their restart requirements.

## File and response boundaries

The credential store and its `credentials.json.backup` are protected local plaintext
files with mode `0600`. Operators can read those files; the Dashboard cannot retrieve
their content. Protect backups and recovery material with the same care as the
active store. Secret values do not belong in `models.json`, routing overrides,
install state, logs or version records.

Credential values must be nonempty bounded single-line strings, with valid
reference names. Invalid JSON, unsupported versions and invalid values return
safe errors without quoting file content. Invalid, conflicting or failed writes
retain the old disk configuration and healthy runtime; failed recovery blocks
disk-based operations until the installation is repaired.

The write-only gateway endpoint and revision contract are documented in
[the HTTP reference](http-api.md). The complete catalog schema is in
[models-config.md](models-config.md), and CLI capture commands are in
[cli.md](cli.md).
