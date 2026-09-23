# Gateway session dashboard design

## Architecture

The dashboard is a read-only feature inside the existing FastAPI process.

```text
Browser
  | GET /dashboard (content-free shell)
  | Bearer fetch
  v
Dashboard router
  | live snapshots                 | ordered evidence queries
  |                                 | provider-summary query
  v                                 v
MemorySessionStore              RecordStore
                                    |
                                    v
                           dedicated SQLite writer thread
```

Add `jev_gateway/dashboard.py` for the router, dependency-free page, response
assembly, and presentation-safe helpers. `gateway.create_app()` includes its
router and supplies access to the mutable `GatewayConfig`, so catalog reloads,
record-store health, and API-key changes are reflected without rebuilding the
router.

The dashboard module must not import `jev_gateway.gateway`, which would create a
cycle. Its router factory accepts a small protocol for active state and an
authorization callback.

## Live session contract

Add `MemorySessionStore.snapshots()`:

1. acquire the existing reentrant lock
2. remove every expired session
3. return detached `SessionState.snapshot()` dictionaries

Do not expose adapter state. The dashboard route enriches each snapshot with
recorded evidence. When evidence is absent, it resolves the session's canonical
route through the active catalog to obtain provider and upstream model.

The list is sorted by the latest recorded request wall-clock timestamp. Entries
without recorded evidence follow in live `updated_at` order. The UI does not
present monotonic session timestamps as wall-clock dates.

## Evidence schema

Add one table to `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS upstream_requests (
    decision_id TEXT PRIMARY KEY,
    request_id TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    stream INTEGER NOT NULL DEFAULT 0,
    capture_content INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_upstream_requests_request
    ON upstream_requests (request_id);

CREATE INDEX IF NOT EXISTS idx_upstream_requests_created_at
    ON upstream_requests (created_at);
```

No schema-version table or external migration is needed. Existing databases get
the table through `CREATE TABLE IF NOT EXISTS`. Request-retention pruning removes
orphan upstream rows with the same rule used for decisions and outcomes.

Add a frozen `UpstreamRequestRecord` and these `RecordStore` operations:

```python
def record_upstream_request(self, record: UpstreamRequestRecord) -> None: ...
def latest_session_evidence(
    self, session_ids: tuple[str, ...]
) -> dict[str, dict[str, Any]]: ...
def session_request_evidence(
    self, session_id: str
) -> list[dict[str, Any]]: ...
def provider_summary(
    self, *, window_start: float, window_end: float
) -> dict[str, dict[str, Any]]: ...
```

`NullRecordStore` returns empty query results. `_UnavailableRecordStore` reports
its existing error. `SqliteRecordStore` submits reads with `wait=True`, which
places them behind already queued writes and keeps SQLite ownership on the writer
thread.

`latest_session_evidence()` uses one query for all live IDs, not one query per
session. The query chooses the newest request that has a routing decision and
also returns the latest request preview/status. `session_request_evidence()`
starts from `requests` and left-joins decisions, upstream requests, and outcomes
so rejected and in-flight requests remain visible.

Add `idx_upstream_requests_created_at` and one `provider_summary()` operation to
all `RecordStore` implementations. `SqliteRecordStore` submits the read with
`wait=True`, so it runs through the existing writer queue after accepted writes.
The SQL filters `upstream_requests.created_at >= window_start` and
`< window_end`, left-joins outcomes by `decision_id`, and groups by provider.
The dashboard layer merges those rows with the active catalog so every configured
provider appears, including providers with no retained attempts. It must not
open a second SQLite connection or manufacture zero-traffic providers in SQL.

JSON columns are decoded in the backend. Invalid legacy JSON becomes a safe empty
value rather than failing the entire response.

## Upstream payload capture

Build the completion payload once in `gateway.chat_completions()` and reuse the
same object for evidence and the LiteLLM call:

```python
payload = completion_payload(...)
engine.record_upstream_request(decision, sanitize(payload, secret_fields=...))
response = completion(**payload)
```

The capture occurs before `completion()` so failures still have request evidence.
`RoutingEngine.record_upstream_request()` uses its existing best-effort `_store()`
path. Evidence failure is logged as a dropped record and never gates the upstream
call.

The explicit secret-field set contains `api_key` and all names declared in the
selected provider's `param_env`. Recursive name-based redaction also covers
authorization, headers, keys, tokens, secrets, passwords, and credentials. A
mapping or sequence is copied recursively. Primitive JSON values are retained.
Unknown objects become `"[<TypeName>]"` without calling `repr()`.

When `capture_content` is false, content-bearing fields such as `messages`,
`prompt`, `tools`, `tool_choice`, and response-format bodies are replaced with
small omission descriptors containing only safe counts or kinds. The storage
setting remains the privacy authority.

## Credential-safe error handling

Provider exception text is untrusted. A raw exception message could reach the
502 body, `outcomes.error_message`, or the DEBUG traceback. The response and storage
boundaries use gateway-authored text and bounded metadata. Logging retains frame
locations, but omits exception wording and source lines before formatting. Upstream
payload redaction does not cover provider exception text.

Response boundary. Build the 502 with the fixed message
`"Upstream provider request failed."`. Keep `error.code = "upstream_error"` and
a bounded `error.type`. Do not chain the raw exception into the public error path:
an upstream message may contain a credential in an unrecognized format. Clients
can still branch on the stable code and type.

Storage boundary. Call `record_outcome` without `error_message`, so the column stays NULL
for upstream failures while `error_type` is kept. `OutcomeRecord.error_message` and the
column stay in place for future gateway-authored values, so no migration runs. Nothing
reads the message: `_evidence_row` and the evidence query select `error_type` only. The
streaming path already passes no message and keeps that behavior.

Log boundary. Render the upstream exception with `safe_traceback`, which walks
frames without reading source lines or exception wording. The DEBUG event has no
raw `exc_info`, and `GatewayFormatter.formatException` uses the same safe renderer
for any traceback it formats in pretty, compact, or JSON. This retains frame
locations and bounded type information without relying on a credential-pattern
denylist to remove arbitrary exception text. The streaming path raises a new
fixed-message exception after headers have been sent.

Helper. Add `redact_secret_text(text: str) -> str` in `jev_gateway/records.py` beside the
existing `_SECRET_PARTS` and `_secret_field` vocabulary, so both redactors share one word
list. It masks `Authorization:` header values, `Bearer <token>`, `sk-`-style API keys, and
`name=value` or `name: value` pairs whose name matches the secret vocabulary. The existing
`_SAFE_TOKEN_COUNT_FIELDS` exemption keeps `max_tokens` and `total_tokens` from being
over-redacted, and ordinary text stays unchanged. This helper is a defense for
recognizable diagnostic text, not a substitute for omitting untrusted exception
wording from upstream failure paths.

Dashboard. No code change. `_evidence_row` and the evidence query keep `error_type` only.
A regression test locks `error_message` out. The `storage.error` text the dashboard shows
carries storage failures, not provider exceptions, so it stays outside this repro path
and in scope only as a general rule.

Boundary clamping. `error_type` comes from `type(error).__name__` and crosses the
response, disk, and log boundaries. Clamp it to `[A-Za-z0-9_]{1,64}` before use at each
site.

## HTTP contracts

### `GET /dashboard`

Returns `HTMLResponse` with the complete page. Set defensive headers:

- `Cache-Control: no-store`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- a same-origin Content Security Policy that permits the page's inline script and
  style but no remote assets

### `GET /v1/routing/sessions`

Protected by the existing Bearer check.

```json
{
  "storage": {"enabled": true, "pending": 0, "error": null, "alive": true},
  "evidence_available": true,
  "data": [
    {
      "session_id": "...",
      "route": "provider/model",
      "provider": "provider",
      "upstream_model": "model",
      "strategy": "task_aware",
      "label": "quick",
      "turn_count": 2,
      "latest_request": {
        "request_id": "...",
        "received_at": 0,
        "prompt": "...",
        "prompt_digest": "...",
        "prompt_chars": 12,
        "ok": true
      }
    }
  ]
}
```

The exact response uses JSON primitives only and excludes adapter state and raw
continuation payloads.

### `GET /v1/routing/providers/summary`

Protected by the existing Bearer check. This is the only provider aggregation
route. It takes no window or range parameters and uses the server-defined rolling
15-minute window.

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

`attempts` counts submitted `upstream_requests`, not decisions. The average is
from completed retained outcomes and includes full stream lifetime where
applicable. A missing outcome is incomplete evidence, not an active request.
With a healthy recorder and no retained rows, counts are zero, latency is `null`,
and the condition is `no_recent_data`. With disabled or degraded storage, all
metrics and condition are `null`, `evidence_available` is false, and safe catalog
metadata remains present. The UI labels the panel "Retained outcomes, last 15
minutes" and uses only the neutral observed-condition labels in the response.

### `GET /v1/routing/sessions/{session_id}/requests`

Protected by the existing Bearer check. Returns 404 `unknown_session` if the
session is no longer live. Otherwise returns:

```json
{
  "session": {},
  "storage": {},
  "evidence_available": true,
  "requests": [
    {
      "request": {},
      "decision": {},
      "upstream_request": {},
      "outcome": {}
    }
  ]
}
```

A missing joined stage is `null`. When storage is disabled or degraded,
`evidence_available` is false and `requests` is empty.

## Browser behavior

The page has a compact provider panel above two responsive columns: current
sessions on the left and the selected session timeline on the right. On narrow
screens the columns stack. The provider panel is a semantic table headed
"Retained outcomes, last 15 minutes". It shows safe catalog metadata, retained
attempt and outcome counts, average observed latency, latest completed outcome,
and the neutral observed condition. It explains that recorder gaps can leave the
evidence incomplete and does not use health, availability, load, or concurrency
language. Visual styling uses system fonts, neutral surfaces, restrained
route/status colors, and `prefers-color-scheme` for light and dark palettes.

The page loads the provider-summary and session APIs. On 401, it displays an
API-key form. The key stays in a closure-scoped variable and is sent as an
`Authorization: Bearer` header. The existing manual Refresh button reloads the
provider summary, list, and selected timeline. Dynamic values are written through
`textContent`; user content is never interpolated as HTML. Expandable sections
show formatted JSON for request, signal, candidate, upstream, and outcome details.

No automatic polling, charts, search, arbitrary ranges, or mutation controls are
included.

## Compatibility and failure behavior

- Dashboard routes are additive. Existing API paths stay unchanged. The
  OpenAI-compatible response envelope changes only in the R9 fixed upstream-error
  message; routing, session, and storage behavior is untouched.
- The new SQLite table is additive and safe for existing database files.
- The upstream-error change replaces the 502 `error.message` with gateway-authored
  text while `error.code` and `error.type` remain. Clients keep their branching
  logic and lose only the upstream wording.
- `outcomes.error_message` becomes NULL for upstream failures going forward. The
  schema and dataclass stay in place, so no migration runs. Databases written
  before the change can still hold raw upstream text.
- DEBUG tracebacks render a mask in place of credential values. Module names,
  line numbers, and exception types remain.
- Reload continues to reuse the same record store and router state.
- Storage-disabled deployments still show live sessions but no retained timeline.
  The provider panel retains configured metadata but shows null metrics and an
  explicit evidence-unavailable state.
- A queue or writer failure cannot block a completion. The dashboard reports the
  store status already used by `/healthz`; provider observations remain best
  effort and may be incomplete after queue loss or process failure.
- Streamed outcomes continue to lack a provider-returned model unless the current
  stream path supplies one; the UI renders it as unavailable.

## Rollback

Remove the dashboard router registration, `dashboard.py`, new RecordStore
operations, and upstream capture call. Leaving the additive `upstream_requests`
table in an existing SQLite file is harmless. Reverting the error-handling change
restores upstream wording in the 502 body and `outcomes.error_message`, with no
data migration. No destructive migration or config rollback is required.
