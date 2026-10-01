# Current dashboard data surfaces

## Live sessions

`MemorySessionStore` in `jev_gateway/sessions.py` is the source of truth for
sessions that currently exist in this gateway process. A live session contains
the current canonical route, label, strategy, turn and switch counts, accumulated
cost, and up to 40 recent routing events.

The store currently exposes one-session reads but no atomic list operation. A
new locked `snapshots()` operation is needed. It must prune expired entries
before returning detached dictionaries. Process restart, TTL expiry, and
`max_sessions` eviction remove sessions from this list.

Persisted SQLite sessions are historical evidence and must not be presented as
current sessions.

## Existing evidence

`jev_gateway/records.py` stores:

- `requests`: inbound request metadata and, when `capture_content` is enabled,
  prompt, messages, tools, and response format.
- `decisions`: strategy, canonical route, provider, upstream model, label,
  selection reason, candidates, signals, and reasoning effort.
- `outcomes`: success, finish reason, token usage, estimated cost, latency,
  returned model, and error metadata.
- `config_versions`: the routing configuration used by a decision.
- `assistant_continuations`: opaque provider continuation state. This is not
  suitable for dashboard display.

`decision_evidence` joins requests, decisions, and outcomes, but the `RecordStore`
contract has no session-oriented query methods.

## Missing evidence

The exact keyword arguments passed to `litellm.completion()` are built after
provider adapters transform messages and after reasoning effort is applied. They
are not persisted. The inbound `requests.messages_json` therefore cannot prove
what was sent upstream.

The dashboard requires one new evidence record written immediately before the
LiteLLM call. It must contain a sanitized copy of the final completion payload.
Resolved API keys, authorization headers, provider credentials, and values from
`providers[].param_env` must never enter the queue or database. When
`capture_content` is disabled, message and tool content must remain omitted.

## Model identities

The UI must keep these identities distinct:

- requested strategy: `requests.strategy`
- requested concrete model: `requests.requested_model`
- routed canonical model: `decisions.route`
- actual configured provider: `decisions.provider`
- actual configured upstream model: `decisions.upstream_model`
- model argument sent to LiteLLM: sanitized upstream payload `model`
- provider-returned model: `outcomes.returned_model`, when available

The session list uses the routed canonical model for the latest routed turn. If
SQLite evidence is disabled or temporarily unavailable, the live session's
current `route` is the fallback.

## Authentication

Existing gateway endpoints accept a Bearer token only in the `Authorization`
header. Query-string tokens are not supported and must not be added because URLs
leak through browser history and access logs.

A browser navigation cannot add a Bearer header. The dashboard page must contain
no evidence itself. Its JavaScript asks for the token only after a 401 response,
keeps it in memory, and sends it on dashboard API requests. The token must not be
written to local storage, session storage, cookies, the URL, or the DOM after
submission.

## Minimal route shape

- `GET /dashboard`: dependency-free HTML, CSS, and JavaScript shell.
- `GET /v1/routing/sessions`: all pruned live sessions with latest routed-turn
  evidence when available.
- `GET /v1/routing/sessions/{session_id}/requests`: the live session snapshot and
  all retained request, decision, sanitized upstream request, and outcome rows.

The existing `GET /v1/routing/sessions/{session_id}` endpoint remains unchanged.

## Testing patterns to reuse

- `tests/test_gateway.py`: `httpx.ASGITransport`, synchronous `request()` helper,
  fake LiteLLM module, and authentication assertions.
- `tests/test_records.py`: real temporary SQLite files, queue flushing, schema
  compatibility, and content-capture tests.
- `tests/test_sessions.py`: deterministic `FakeClock`, TTL expiry, and eviction.

No Jinja, frontend framework, static-file package, or new database dependency is
needed.
