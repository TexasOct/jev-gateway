# JEV Gateway HTTP API

JEV Gateway serves an OpenAI-compatible chat endpoint plus a small routing
inspection API. All routes live in `jev_gateway/gateway.py` and the dashboard
router in `jev_gateway/dashboard.py`. This document is the endpoint contract; the
routing behavior behind each decision is in [`routing-design.md`](./routing-design.md).

## Authentication

Set `gateway.api_key_env` in `models.json` to the name of an environment variable
holding an inbound API key. When that variable resolves to a value, every `/v1`
route and `GET /healthz` require it as a Bearer token:

```http
Authorization: Bearer <key>
```

A missing or wrong token returns `401` with `error.code: "invalid_api_key"` and a
`WWW-Authenticate: Bearer` header. When `gateway.api_key_env` is unset, the
gateway serves without inbound authentication. A declared but empty or missing key variable
is a configuration error. The comparison is constant-time.

The `GET /dashboard` HTML shell is always served; the data endpoints it calls are
protected by the same rule. The page asks for the key only after a data request
returns `401`, keeps it in JavaScript memory, and sends it through the
`Authorization` header.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Liveness and configuration snapshot: status, catalog names, policy mode, default strategy, registered strategies, session strategy, storage state, live session count. |
| `GET` | `/dashboard` | Self-contained HTML dashboard shell. |
| `GET` | `/v1/models` | OpenAI model list: registered strategy names first, then concrete catalog model IDs. |
| `GET` | `/v1/routing/policy` | Active policy snapshot plus `session_strategy`. |
| `GET` | `/v1/routing/strategies` | Registered strategies and their policies. |
| `POST` | `/v1/routing/preview` | Route a chat request through one or more strategies without serving it. |
| `POST` | `/v1/routing/reload` | Re-read the catalog file and apply reloadable settings. |
| `GET` | `/v1/routing/decisions/{decision_id}` | One decision in the bounded in-memory log, not a SQLite lookup. |
| `GET` | `/v1/routing/sessions` | Live sessions enriched with the latest retained request and decision. |
| `GET` | `/v1/routing/sessions/{session_id}` | Live snapshot for one session. |
| `GET` | `/v1/routing/sessions/{session_id}/requests` | Live snapshot plus retained request evidence, newest first. |
| `GET` | `/v1/routing/providers/summary` | Configured providers and retained attempts in a fixed rolling 15-minute window. |
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
looking up an expired session can evict it. Enabled JEV-backed strategies can call
the external System One classifier, including during preview.

The dashboard reads `GET /v1/routing/sessions`,
`GET /v1/routing/sessions/{session_id}/requests`, and
`GET /v1/routing/providers/summary`. Storage-disabled or degraded responses carry
`evidence_available: false`; provider metrics are null instead of zero. The
session list still shows live state, and session detail returns an empty request
list when evidence is unavailable. The requests route accepts slashes in session
IDs (`{session_id:path}` internally); the single-session snapshot route does not.

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
| `400` | `invalid_configuration` | Reload rejects the file contents. |
| `400` | `restart_required` | Reload changes storage settings. |
| `401` | `invalid_api_key` | Missing or wrong Bearer token. |
| `404` | `model_not_found` | `model` is neither a strategy nor a catalog model. |
| `404` | `unknown_decision` | Decision ID is not in the in-memory log. |
| `404` | `unknown_session` | Session ID is not live. |
| `500` | `catalog_mismatch` | A routed model disappeared from the catalog. |
| `502` | `upstream_error` | Upstream call failed before a response began; `type` is a bounded exception type. |
| `503` | `storage_unavailable` | Reload cannot reach the record store. |

The upstream error message is fixed: `Upstream provider request failed.` Once
streaming headers have been sent, a stream failure cannot become an HTTP `502`;
the stream terminates and the gateway records a failed outcome on a best-effort basis.

## Reload

```bash
curl -X POST http://127.0.0.1:8000/v1/routing/reload
```

Reload re-reads `models.json` and its adjacent `.env`, rebuilds providers, models,
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
