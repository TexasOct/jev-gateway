# Error handling

> How errors are raised, logged, and returned by the gateway.

## Overview

Errors are handled at three boundaries:

1. Catalog and configuration parsing raises descriptive Python exceptions and
   fails startup before the server listens.
2. FastAPI handlers convert expected client and upstream failures to an
   OpenAI-compatible JSON error envelope.
3. Evidence-storage failures are logged and reported through health status but
   do not block routing or upstream responses.

Do not collapse these boundaries into one catch-all handler. A bad static config
should stop startup, a bad request should receive a stable 4xx response, and a
failed evidence writer should leave the gateway available.

## Exception types

The project defines a small set of domain exceptions:

| Exception | Defined in | Meaning |
| --- | --- | --- |
| `UnknownModelError(ValueError)` | `jev_gateway/decision.py` | The requested canonical model does not exist in the catalog |
| `UnknownStrategyError(ValueError)` | `jev_gateway/strategy/contracts.py` | The requested strategy is not registered |
| `StrategyContractError(RuntimeError)` | `jev_gateway/strategy/contracts.py` | A strategy returned an invalid or unknown route |
| `StorageUnavailableError(RuntimeError)` | `jev_gateway/records.py` | The evidence writer cannot accept or persist work |

Catalog validation uses `TypeError` and `ValueError` with specific English
messages. Preserve exception chaining when wrapping I/O or parsing failures:

```python
except OSError as exc:
    raise ValueError(f"Could not read the models file {path}: {exc}") from exc
```

Use a custom exception when callers need to distinguish a domain failure and map
it to a specific response. Use `ValueError` or `TypeError` for invalid static
configuration where startup or reload owns the presentation.

## API error envelope

All HTTP errors exposed by the gateway use this shape:

```json
{
  "error": {
    "message": "Human-readable message",
    "type": "invalid_request_error",
    "param": null,
    "code": "model_not_found"
  }
}
```

`jev_gateway.gateway.error_body()` builds the envelope. The application-level
`StarletteHTTPException` handler preserves an existing nested `error` object and
normalizes other details into this structure.

Use `HTTPException` only at the HTTP boundary in `gateway.py`. Lower layers raise
Python or domain exceptions.

### Current mappings

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `missing_user_message` | A request has no usable user message |
| 400 | `unsupported_parameter` | The caller used a retired or unsupported selection parameter |
| 400 | `unknown_strategy` | A requested strategy is not registered |
| 400 | `invalid_configuration` | Runtime reload parsed an invalid catalog or gateway config |
| 400 | `restart_required` | Reload attempted a setting that only changes on restart |
| 401 | `invalid_api_key` | Inbound bearer authentication failed |
| 404 | `model_not_found` | The requested concrete model or virtual strategy model is unavailable |
| 404 | `unknown_decision` | The decision ID is not present in the in-memory log |
| 404 | `unknown_session` | The session ID is not present in the in-memory store |
| 500 | `catalog_mismatch` | A selected route cannot be resolved against the active catalog |
| 502 | `upstream_error` | LiteLLM or the selected upstream failed |
| 503 | `storage_unavailable` | A reload operation requires a healthy record store |

Pydantic request validation failures use HTTP 400 with
`type: "invalid_request_error"` and no code.

## Configuration failures

`load_catalog()` and `load_gateway_config()` validate `models.json` strictly.
Invalid provider references, duplicate IDs, malformed tags, unknown keys,
unsupported modes, and missing required values raise before application startup.
Do not catch these errors merely to continue with defaults.

`POST /v1/routing/reload` is different because the current application is already
healthy. It catches parsing and validation errors, returns
`invalid_configuration`, and keeps the current engine and settings unchanged.
Perform validation before swapping live state.

## Upstream failures

The LiteLLM call in `gateway.py` follows this sequence:

1. Let an existing `HTTPException` pass through unchanged.
2. Catch other exceptions from the upstream call.
3. Record an unsuccessful outcome on a best-effort basis.
4. Log `routing failed` at warning level with identifiers, model fields,
   `error_type`, and latency.
5. Log the traceback at debug level.
6. Raise HTTP 502 with code `upstream_error`, preserving exception chaining.

There is no same-request retry or alternate-model fallback after the selected
upstream fails. Do not add an implicit retry in a route handler. Such a change
would alter cost, latency, session continuation, and evidence semantics and needs
a separate routing design.

Streaming failures occur after headers may have been sent. They are logged as
`routing stream failed`, recorded as failed outcomes, and re-raised rather than
converted to a new JSON response.

The external JEV classifier is a separate fallback chain. Its client catches
network and response-validation failures, tries the next configured source, and
falls back to local scoring after all sources fail.

## Best-effort storage failures

`jev_gateway.records.record_store_from_settings()` converts SQLite startup
failure into `_UnavailableRecordStore`. `RoutingEngine._store()` and
`_register_config()` catch record-store failures and log `routing record dropped`.
The gateway continues serving the selected route.

`GET /healthz` returns HTTP 200 with `status: "degraded"` and the storage error
when the writer is unhealthy. Do not return 503 for normal chat traffic merely
because evidence persistence failed.

Storage can return 503 during reload when the operation requires validation or
synchronization of the current store. This protects reconfiguration without
making storage a dependency of normal request serving.

## Logging rules for errors

- Log expected upstream failures once at warning level with structured fields.
- Put tracebacks at debug level unless the writer or stream has entered an
  unrecoverable state.
- Writer-loop and writer-close failures use `logger.exception()` because they
  permanently degrade the store.
- Log exception type through `error_type`; do not add request content or secrets.
- Client-originated 4xx responses do not need a second application warning by
  default.

## Common mistakes

- Do not use bare `except:`. The codebase has none.
- Do not swallow broad exceptions silently. Broad catches are allowed at
  availability boundaries only when they log the drop, preserve health state, or
  intentionally move to a documented fallback source.
- Do not raise `HTTPException` from catalog, strategy, session, provider, or
  record-store modules.
- Do not return ad hoc JSON error shapes. Use the existing OpenAI-compatible
  envelope.
- Do not include API keys, prompt bodies, message payloads, or raw configuration
  secrets in logs or error responses.
- Do not treat `StorageUnavailableError` as a reason to fail an otherwise valid
  chat completion.
