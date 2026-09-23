# Provider load and service condition

## Conclusion

The current working tree can produce a small, read-only provider summary from retained SQLite evidence. It cannot report direct provider health or reliable in-flight concurrency. The safe wording is "recent observed outcomes," not "provider health."

A provider summary also conflicts with the task's current exclusion of aggregate analytics (`.trellis/tasks/09-23-gateway-session-dashboard/prd.md:135-143`). It should be added only if that scope is explicitly amended. Otherwise, keep it as a follow-up task.

## 1. Data that already exists

| Question | Available evidence | Reliability and limits |
| --- | --- | --- |
| Routed request count | `decisions.provider`, `decisions.request_id`, and `decisions.created_at` (`jev_gateway/records.py:81-100`). | Counts routing decisions, including a decision that never reaches LiteLLM. It is retained evidence, not a lossless traffic counter. |
| Actual upstream attempt count | `upstream_requests.provider`, `model`, `stream`, and `created_at` (`jev_gateway/records.py:119-127`). The row is queued immediately before `completion(**payload)` (`jev_gateway/gateway.py:924-935`). | This is the best existing definition of provider load. A missing row can mean no attempt or a dropped evidence write. |
| Success and failure | `outcomes.ok`, `error_type`, and `recorded_at` (`jev_gateway/records.py:103-116`), joined to the provider through the decision or upstream row (`jev_gateway/records.py:1075-1081`). Both normal and failed calls record outcomes (`jev_gateway/gateway.py:938-946`, `jev_gateway/gateway.py:1043-1053`); streams record at stream completion (`jev_gateway/gateway.py:985-1015`). | Directly records the gateway's observed result. It is best effort. A missing outcome is not proof that a request is still running. |
| Latency | `outcomes.latency_ms` (`jev_gateway/records.py:103-116`). Timing starts before payload preparation and ends after the response or stream finishes (`jev_gateway/gateway.py:913-935`, `jev_gateway/gateway.py:985-1015`, `jev_gateway/gateway.py:1036-1053`). | This is gateway-observed attempt duration, not provider-reported latency. For streams it includes the full stream lifetime. Average, minimum, and maximum are easy to derive. SQLite has no current percentile rollup. |
| Active or in-flight requests | No counter or lifecycle state exists. A joined upstream request without an outcome is visible because the evidence query uses left joins (`jev_gateway/records.py:1078-1083`). The UI currently labels a missing outcome as `pending` (`jev_gateway/dashboard.py:45`). | This state is ambiguous. It may be running, waiting for a stream to close, abandoned after a process crash, or missing an outcome because the queue rejected a write. Do not label it active or use it as a concurrency gauge. |
| Configured provider state | The active catalog contains `ProviderProfile` entries (`jev_gateway/catalog.py:113-124`, `jev_gateway/catalog.py:550-559`). Its safe serializer exposes provider ID, type, API base, environment variable name, and `has_api_key` without the resolved key (`jev_gateway/catalog.py:126-136`). | Presence means configured. There is no per-provider `enabled` field, probe result, circuit state, or connectivity state. `has_api_key` means a configured credential resolved; it does not prove the provider is reachable. Some provider types may not require a key. |
| Record-store degradation | Disabled storage reports `enabled: false` and `pending: 0` (`jev_gateway/records.py:512-577`). Startup degradation reports `enabled`, `pending`, `error`, and `alive: false` (`jev_gateway/records.py:611-658`). A live SQLite store reports queue depth, first error, and worker liveness (`jev_gateway/records.py:1407-1414`). `/healthz` maps the storage error to gateway `degraded` (`jev_gateway/gateway.py:513-526`). | This is direct recorder health. `pending` is the evidence-writer queue depth, not provider load. |
| Time windows | Wall-clock-like timestamps exist for inbound receipt, decision, upstream submission, and outcome recording (`jev_gateway/records.py:55-57`, `jev_gateway/records.py:81-100`, `jev_gateway/records.py:103-127`). | There are no stored buckets or window counters. Windows must be computed at read time. Retention is count-based through `max_requests`, and pruning removes joined decisions, outcomes, and upstream rows (`jev_gateway/records.py:1217-1239`). Queue drops and crashes can also make a window incomplete (`jev_gateway/records.py:1245-1246`, `jev_gateway/records.py:1318-1325`). |

The current dashboard already shows the latest provider and outcome for each live session (`jev_gateway/dashboard.py:100-148`), and it can show latency in a request timeline because the joined evidence contains `latency_ms` (`jev_gateway/records.py:1075-1077`). It has no provider aggregation endpoint.

## 2. Provider health is inferred, not measured

There is no upstream probe, heartbeat, circuit breaker, provider status feed, or per-provider health state in the repository. `/healthz` reports gateway configuration, live-session count, and recorder condition; it does not contact a provider (`jev_gateway/gateway.py:513-526`). Session `consecutive_failures` is scoped to one live conversation (`jev_gateway/sessions.py:30-44`) and is updated from that session's outcome (`jev_gateway/decision.py:403-424`). It is not a provider health metric.

The dashboard can therefore report only recent observed outcomes. A neutral four-state presentation avoids overstating the data:

- `no recent data`: no completed retained attempts in the window
- `all observed attempts succeeded`: completed attempts exist and none failed
- `mixed outcomes`: both successes and failures exist
- `all observed attempts failed`: completed attempts exist and none succeeded

These are descriptions of retained evidence, not claims that a provider is healthy, degraded, or down. Storage disabled or degraded must produce `evidence unavailable`, not `no recent data` and not zero counts.

## 3. Smallest useful MVP

If provider summary is admitted into this task, add one compact table above the session list. Keep the existing manual Refresh control and use a fixed rolling 15-minute window. Fifteen minutes is recent enough for incident triage without suggesting long-term availability reporting. Return the exact `window_start`, `window_end`, and `basis: "upstream_requests.created_at"` so the UI does not invent time semantics.

Show every provider in the active catalog, including providers with no traffic:

- provider ID and type
- configured: always true for an active catalog entry
- credential resolved: the existing `has_api_key` boolean
- upstream attempts
- completed outcomes
- succeeded
- failed
- incomplete evidence: attempt rows with no outcome, explicitly not called active
- average latency in milliseconds for completed outcomes, with `null` when none exist
- last completed outcome time and result
- observed condition using the four neutral states above

Use `upstream_requests` as the load denominator because it represents a submitted LiteLLM attempt. Join its `decision_id` to `outcomes`. A separate `routed_requests` count can be included only if operators need to distinguish selected routes from submitted attempts.

Empty and degraded semantics:

- Healthy recorder, no rows in the window: numeric counts are `0`, latency is `null`, and condition is `no recent data`.
- Disabled or degraded recorder: counts, latency, and condition are `null`; return `evidence_available: false` plus the existing storage status. Still return configured provider metadata from the active catalog.
- Missing outcome: increment `incomplete_evidence`; do not count it as success, failure, or active.
- Retained rows: label the panel "Retained outcomes, last 15 minutes." Do not call the counts total traffic because pruning, queue rejection, and crashes can create gaps.

Suggested authenticated response shape:

```json
{
  "window": {
    "seconds": 900,
    "start": 0,
    "end": 0,
    "basis": "upstream_requests.created_at"
  },
  "storage": {"enabled": true, "pending": 0, "error": null, "alive": true},
  "evidence_available": true,
  "providers": [
    {
      "id": "openai",
      "type": "openai",
      "configured": true,
      "has_api_key": true,
      "attempts": 10,
      "completed": 9,
      "succeeded": 8,
      "failed": 1,
      "incomplete_evidence": 1,
      "average_latency_ms": 842.3,
      "last_outcome_at": 0,
      "last_outcome_ok": true,
      "observed_condition": "mixed_outcomes"
    }
  ]
}
```

## 4. Required changes and risks

### Schema and record store

No new table or column is needed. Add `idx_upstream_requests_created_at` so the rolling-window query does not scan an unbounded retained table. Add one provider-summary method to `RecordStore`, `NullRecordStore`, `_UnavailableRecordStore`, `_SqliteBackend`, and `SqliteRecordStore`. Run the read through the existing writer queue with `wait=True`, as the session evidence reads already do (`jev_gateway/records.py:1354-1366`).

The SQL should start from `upstream_requests`, filter `created_at >= ? AND created_at < ?`, left-join `outcomes` by `decision_id`, and group by provider. Provider rows with zero traffic should be filled from the active catalog in the dashboard layer, not manufactured by SQLite.

### API and UI

Add one Bearer-protected endpoint, for example `GET /v1/routing/providers/summary`. Reuse the storage availability logic already used by the dashboard (`jev_gateway/dashboard.py:55-61`) and the existing authorization callback (`jev_gateway/dashboard.py:100-105`). Do not accept arbitrary ranges for the MVP; a fixed server-defined 15-minute window avoids a query surface for unbounded scans.

Add one semantic table to the self-contained page. Keep DOM writes through `textContent`, as the current page does (`jev_gateway/dashboard.py:40-47`). The existing Refresh button should reload the provider summary with the session list. No background refresh is needed.

### Tests

Add focused coverage for:

- provider grouping and zero-traffic configured providers
- exact inclusive-start, exclusive-end window boundaries
- attempts, successes, failures, incomplete evidence, and average-latency null handling
- streaming outcomes counted only after stream completion
- disabled storage and failed-writer responses returning null metrics, not zeros
- retention and queue-loss wording or response flags
- Bearer authentication and content-free HTML
- no API keys, resolved `param_env` values, prompt content, tool content, or error messages in the summary

Existing tests already establish the patterns for authenticated dashboard routes (`tests/test_gateway.py:749-781`), retained stage joins (`tests/test_gateway.py:783-839`), secret redaction (`tests/test_gateway.py:900-979`), content opt-out and failed calls (`tests/test_gateway.py:981-1027`), and disabled/degraded storage (`tests/test_gateway.py:1029-1080`). Record-store tests cover joined incomplete evidence and retention pruning (`tests/test_records.py:192-225`, `tests/test_records.py:290-325`).

### Documentation and compatibility

Update the README dashboard section and `docs/routing-design.md` to define the 15-minute basis, retained-evidence limitation, ambiguous incomplete rows, and inferred condition labels. `docs/models-config.md` needs no new setting because the window is fixed and no provider-health configuration is introduced.

The route, index, and response are additive. The main compatibility risk is semantic: callers may treat observed outcomes as an availability SLA or treat incomplete evidence as live concurrency. Use explicit field names and prose to prevent that. The query must remain on the record-store thread; opening SQLite from a request thread would violate the backend contract (`.trellis/spec/backend/database-guidelines.md:68-69`). Storage failure must remain non-blocking for chat traffic (`.trellis/spec/backend/database-guidelines.md:120-134`).

Privacy risk is low if the endpoint returns aggregates and safe catalog booleans only. Do not return `api_base`, environment variable names, `param_env`, error messages, request IDs, session IDs, prompts, payloads, or continuation state. The current sanitizer and capture opt-out remain the evidence boundary (`jev_gateway/records.py:439-509`).

## 5. Keep out of scope

Keep these metrics and controls out of this task:

- direct health probes, synthetic requests, provider status-page integration, or uptime/SLA claims
- true in-flight concurrency, utilization, queueing time, rate-limit headroom, or quota state
- p50/p95/p99 latency, throughput charts, long-range trends, exports, alerts, and saved filters
- token throughput, spend, budgets, cost reports, or per-user and per-session provider analytics
- error-message drill-down or grouping by raw provider response
- enable/disable, drain, retry, fallback, reroute, replay, terminate, or circuit-breaker controls
- automatic polling, WebSockets, server-sent events, and notifications
- a second telemetry database, metrics service, dashboard configuration block, or frontend dependency

These exclusions match the task's existing ban on charts, aggregate analytics, cost reports, alerts, exports, automatic refresh, mutations, and routing-policy changes (`.trellis/tasks/09-23-gateway-session-dashboard/prd.md:135-145`).
