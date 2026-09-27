# Monitoring evidence contract

Scope: source and synthetic test fixtures only. No live configuration, credentials, databases, servers, or tests were accessed or run. `task.py current --source` returned no active pointer; this note uses the task directory supplied by the caller.

## Endpoints and availability

- `GET /v1/routing/sessions` lists live in-memory sessions enriched with retained evidence. Each entry has `session_id`, `route`, `strategy`, `label`, `turn_count`, `updated_at`, `first_request_at`, `provider`, `upstream_model`, and nullable `latest_request`. It excludes session events and request content (`jev_gateway/dashboard.py:352-420`; `tests/test_gateway.py:1322-1382`).
- `latest_request` contains `request_id`, `received_at`, `content_captured`, and nullable `ok`. The latest retained decision is selected independently of the latest request, so a list row's route can describe an earlier request. Do not animate that route as proof of the newest request's selection (`jev_gateway/records.py:1068-1134`; `tests/test_records.py:268-302`).
- `GET /v1/routing/sessions/{session_id}/requests` returns `session`, `storage`, `evidence_available`, `requests`, and cursor pagination. Each retained item has `request`, nullable `decision`, nullable `upstream_request`, and nullable `outcome`. Detail requires a live session; retained-only sessions return `unknown_session` (`jev_gateway/dashboard.py:422-458`; `tests/test_gateway.py:1378-1382`).
- `evidence_available` describes recorder/query availability, not completeness of each request. Disabled or degraded storage yields `false` and an empty retained list; live session metadata can still appear. With available storage, individual stages can still be missing (`jev_gateway/dashboard.py:170-175,435-452`; `tests/test_gateway.py:1712-1765`; `tests/test_records.py:292-300`).
- `request.content_captured` and `upstream_request.content_captured` are separate flags. Content opt-out retains request metadata/digest while omitting prompt/messages. Invalid stored JSON falls back to null, `[]`, or `{}` as appropriate (`jev_gateway/records.py:828-865`; `tests/test_records.py:373-418`).

## Exact retained selection and result fields

| Meaning | Detail JSON field | Evidence |
| --- | --- | --- |
| Requested strategy/model | `request.strategy`, `request.requested_model` | `jev_gateway/records.py:809-815` |
| Selected strategy and label | `decision.strategy`, `decision.label` | Label serializes storage column `tier`; `jev_gateway/records.py:835-846` |
| Selected route/provider/model | `decision.route`, `decision.provider`, `decision.upstream_model` | `jev_gateway/records.py:841-843` |
| Explanation/context | `decision.reason`, `mode`, `turn_index`, `switched_from`, `blocked_by` | `jev_gateway/records.py:845-850` |
| Supporting evidence | `decision.decision_id`, `config_hash`, `reasoning_effort`, `reasoning_effort_source`, `candidates`, `signals` | Candidates are strings; signals are an arbitrary dictionary, not a universal scored-stage schema; `jev_gateway/records.py:296-317,838-855` |
| Actual submitted identity | `upstream_request.provider`, `model`, `stream`, `payload` | Distinct from selected model; fixture submits `openai/vendor/small-model` for selected `vendor/small-model`; `jev_gateway/records.py:857-865`; `tests/test_gateway.py:1360-1377` |
| Result | `outcome.ok`, `finish_reason`, `returned_model` | `jev_gateway/records.py:867-879` |
| Error and duration | `outcome.error_type`, `latency_ms` | No HTTP status or provider error text in detail serialization; `jev_gateway/records.py:869-879` |
| Usage | `outcome.prompt_tokens`, `completion_tokens`, `total_tokens`, `cost_usd` | Nullable fields; `jev_gateway/records.py:321-336,872-876` |

`outcome.ok=true` supports a success state; `false` supports a failed state with the retained error type. A null outcome supports “outcome not retained,” never a definite running state. The database has `error_message`, but the dashboard omits it and the failure fixture asserts it remains null (`jev_gateway/records.py:104-118,867-879`; `tests/test_gateway.py:779-809`).

The independent prototype at `monitoring-prototype.html` uses synthetic evidence with the existing field shape. Its sample values are fabricated for presentation only; they are not serialized records. A product implementation must bind to actual response fields and keep any absent field unavailable rather than assuming the sample value.

## Animation boundaries

- A retained selection can be drawn as request, selected strategy, selected label, selected provider/model, then outcome. Strategy and label are attributes of one decision, not separately measured execution stages. Use an explicitly labeled evidence replay with presentation-controlled timing (`jev_gateway/records.py:835-879`).
- Four coarse timestamps exist: `request.received_at`, `decision.created_at`, `upstream_request.created_at`, `outcome.recorded_at`. The last is generated during the storage write with `_now()`. There are no separate classifier, label, retry, first-token, or per-chunk timestamps in this schema. Display retained timestamps and `latency_ms`; do not infer stage durations or make animation speed claim measured routing latency (`jev_gateway/records.py:56-129,809-879,1015-1035`).
- Ordered retries cannot be reconstructed from this detail API. Its SQL selects only the newest decision per request. Upstream submissions and outcomes each use `decision_id` as their primary key and `INSERT OR REPLACE`, so repeated writes under one decision do not form an attempt log (`jev_gateway/records.py:104-129,1015-1057,1166-1175`). `candidates` describes candidates, not attempted hops; `switched_from` alone supplies no attempt sequence.
- Request pages are newest first by `(received_at, rowid)`. This supports retained request history, not a complete event timeline (`jev_gateway/records.py:1173-1184`; `tests/test_records.py:353-370`).
- The inspected monitoring APIs return GET snapshots, not a subscribed event stream. Detail's `session.events` is a bounded in-memory list of decision/switch events, capped at 40, and excluded from the session list. It does not establish live token movement, durable event delivery, or retry timing (`jev_gateway/sessions.py:26,48-78`; `jev_gateway/dashboard.py:374-378,449-452`; `jev_gateway/gateway.py:1056-1092`; `tests/test_gateway.py:1848-1852`).

## Provider observations, not health

`GET /v1/routing/providers/summary` aggregates retained submissions over 900 seconds with `window.start <= upstream_requests.created_at < window.end`. Rows cover currently configured providers and include `id`, `type`, `configured`, `has_api_key`, `attempts`, `completed`, `succeeded`, `failed`, `incomplete_evidence`, `average_latency_ms`, `last_outcome_at`, `last_outcome_ok`, and `observed_condition` (`jev_gateway/dashboard.py:41,299-350`; `jev_gateway/records.py:1187-1241`).

Conditions are `no_recent_data`, `all_observed_attempts_succeeded`, `all_observed_attempts_failed`, or `mixed_outcomes`. Unavailable evidence makes all derived metrics and condition null. With available evidence, a provider with no retained submissions has zero counts and null timing/latest result (`jev_gateway/dashboard.py:177-186,318-350`; `tests/test_gateway.py:1298-1320`).

`incomplete_evidence = attempts - completed`; it must not be labeled active work. The streaming fixture shows one incomplete submission before completion, but gaps can also reflect loss or interruption. These observations do not prove provider reachability, uptime, credential validity, all traffic, or queue depth (`tests/test_gateway.py:1259-1295`; `.trellis/spec/backend/database-guidelines.md:175-221`). The aggregate fixture verifies window boundaries, mixed outcomes, incomplete evidence, and null latency (`tests/test_records.py:305-350`).

## Synthetic supported projection

This is a reduced detail payload using existing field names, not a new endpoint or real traffic. Omitted fields remain available in the full response.

```json
{
  "evidence_available": true,
  "requests": [{
    "request": {"request_id": "synthetic-1", "received_at": 1000.0, "strategy": "quality", "requested_model": "auto", "content_captured": false},
    "decision": {
      "decision_id": "synthetic-decision-1", "strategy": "quality", "label": "simple",
      "route": "provider/model", "provider": "provider", "upstream_model": "model",
      "reason": "first_turn_simple", "mode": "auto", "turn_index": 1,
      "switched_from": null, "blocked_by": null,
      "candidates": ["provider/model"], "signals": {"score": 0.1}, "created_at": 1001.0
    },
    "upstream_request": {"provider": "provider", "model": "openai/model", "stream": false, "content_captured": false, "created_at": 1002.0},
    "outcome": {"ok": true, "finish_reason": "stop", "latency_ms": 12.0, "returned_model": null, "error_type": null, "recorded_at": 1002.05}
  }]
}
```

The fixture shapes come from `tests/test_records.py:27-105`. A UI can reveal the selected path and end on “Succeeded · 12 ms.” Missing `decision`, `upstream_request`, or `outcome` should leave that portion visibly unknown. Alternate candidates can be shown as unselected options; animating failures through them would invent evidence.
