# Logging guidelines

> Logging conventions for the gateway, routing engine, providers, and evidence store.

## Overview

The project uses Python's standard `logging` package. Modules create loggers with
`logging.getLogger(__name__)`; there is no custom logger wrapper. The logging
subpackage owns settings validation, field filtering, formatting, and the Uvicorn
logging dictionary.

Application events use short lowercase messages plus structured `extra` fields:

```python
logger.info(
    "routing served",
    extra={
        "decision_id": decision.id,
        "provider": decision.provider,
        "model": decision.upstream_model,
        "ok": True,
        "latency_ms": elapsed_ms,
    },
)
```

Prefer this shape over interpolating identifiers into the message text.

## Public logging surface

`jev_gateway/logging/__init__.py` exports:

- `LoggingSettings`
- `logging_from_gateway()`
- `GatewayFormatter`
- `uvicorn_log_config()`
- `suppress_litellm_debug_prints()`
- `display_logger_name()`
- `LOG_FORMATS`

`logging/catalog.py` parses `gateway.logging_level`, `gateway.log_format`, and
`gateway.access_log`. `logging/config.py` implements the formatter and the
Uvicorn logging config.

Do not instantiate custom formatters or handlers in feature modules. Add
cross-cutting logging behavior to the logging subpackage.

## Formats

`GatewayFormatter` supports three output formats:

| Format | Output |
| --- | --- |
| `pretty` | Multi-line event with fields grouped under identifiers, model, selection, reasoning, outcome, and record headings |
| `compact` | One line with `key=value` fields |
| `json` | One JSON object containing timestamp, level, logger, event, and structured fields |

Values are converted to display-safe strings, newlines are escaped, and displayed
values are truncated to 160 characters. JSON output does not include ANSI color.
Pretty and compact output color only the level name on a terminal; redirected
output remains plain text.

Logger names are shortened for display: `jev_gateway.gateway` becomes `gateway`,
`uvicorn.error` becomes `uvicorn`, and `LiteLLM` becomes `litellm`.

## Structured field allowlist

The formatter emits only names listed in `jev_gateway.logging.config.FIELDS`.
The current allowlist is:

```text
decision_id, request_id, session_id, strategy, requested_model,
route, provider, model, label, tier, mode, reason,
reasoning_effort, reasoning_effort_source, switched_from,
capability_gap, ok, latency_ms, error_type, record_kind
```

Fields outside this list are dropped. `tests/test_logging_config.py` verifies
that an attached `secret` field does not appear in output.

When a new field is genuinely needed:

1. Add it to `FIELDS`.
2. Place it in a suitable `PRETTY_FIELD_GROUPS` group.
3. Use a flat `snake_case` scalar value.
4. Add formatter tests for compact, JSON, and pretty output as appropriate.
5. Confirm that it cannot expose prompt content, credentials, or provider
   continuation payloads.

## Event names and fields

Event messages are lowercase verb phrases. Existing examples include:

- `routing decided`
- `routing served`
- `routing failed`
- `routing stream started`
- `routing stream failed`
- `routing record dropped`
- `routing record store unavailable at startup`

Keep event names stable because operators and collectors may search them.
Put variable data in `extra`, not in the event message. Use the canonical field
names from the allowlist. At the logging boundary, `Decision.route_name` is
reported as `route` and `Decision.blocked_by` is reported as `capability_gap`.

A normal decision event should include enough fields to connect routing and
evidence records: decision, request, and session identifiers when present;
strategy and requested model; selected route, provider, and upstream model;
label or tier; mode and reason; switch or capability information; and applied
reasoning effort.

## Log levels

| Level | Use | Current examples |
| --- | --- | --- |
| `DEBUG` | Details useful for diagnosis but too noisy for normal operation | Upstream tracebacks, stream start, stream-failure tracebacks |
| `INFO` | Successful lifecycle events | Routing decision and served outcome |
| `WARNING` | Recoverable request or evidence failures | Upstream 502, dropped evidence record, continuation load/write failure |
| `ERROR` | Failures that permanently degrade a subsystem or occur after response headers | Stream failure, record-store startup failure |
| `CRITICAL` | Accepted by config but currently unused | Reserve for process-wide unrecoverable conditions |

Use `logger.exception()` only while handling an exception whose traceback is
useful at the configured level. The record writer uses it when a worker operation
or close fails and the store becomes degraded.

## Sensitive data

Never log:

- API keys or bearer tokens
- Request messages or prompt text
- Tool definitions or arguments
- Response content
- Provider continuation payloads
- Raw `models.json` content containing environment variable names plus resolved
  values

The gateway logs `requested_model`, route identity, capabilities, outcomes, and
exception types. The policy endpoint exposes credential availability as booleans
or configured placeholders, not secret values. Keep this distinction when adding
observability.

## Configuration and startup

The `gateway` object in `models.json` controls:

```json
{
  "logging_level": "INFO",
  "log_format": "pretty",
  "access_log": false
}
```

`run_gateway()` passes these values to Uvicorn. The root logger remains at
`WARNING`, `jev_gateway` uses the configured level, Uvicorn lifecycle loggers use
`INFO`, and the `LiteLLM` logger uses `WARNING`.

Logging settings are startup-only. `POST /v1/routing/reload` does not replace
handlers, formatters, levels, or access-log behavior. Restart the process after
changing them.

Access logging is off by default to avoid polling noise. Enable it only when
per-request Uvicorn access entries are required.

`suppress_litellm_debug_prints()` sets LiteLLM's debug suppression flag before
Uvicorn starts. This removes provider banners and debug chatter while preserving
real warnings through the `LiteLLM` logger.

## Common mistakes

- Do not use `print()` for runtime diagnostics.
- Do not add free-form values to the message string when an allowlisted field
  exists.
- Do not assume arbitrary `extra` keys will be rendered. Add intentional fields
  to the formatter contract and tests.
- Do not log the exception message if it may contain upstream request content or
  credentials. Prefer `error_type` and a debug traceback.
- Do not call `logging.basicConfig()` from package modules.
- Do not claim reload applied logging settings. They take effect after restart.
