# Build gateway session dashboard

## Goal

Add a lightweight dashboard to the existing FastAPI gateway so an operator can
see every live session, identify the model used by its latest routed turn, and
inspect the complete retained routing and upstream-request evidence for one
session, and observe recent retained outcomes by provider without claiming live
provider health. Upstream error text must not expose credentials across response,
storage, or logging boundaries.

## Background

- `MemorySessionStore` is the source of truth for sessions currently alive in
  this process. Sessions disappear on TTL expiry, capacity eviction, or restart.
- SQLite already stores inbound requests, routing decisions, outcomes, and
  configuration snapshots when storage is enabled.
- The final payload sent to `litellm.completion()` is not currently stored, so
  existing request records cannot show provider-adapter transformations or the
  applied reasoning effort.
- The gateway already has Bearer authentication. Dashboard data must use the
  same credential and must not introduce query-string tokens.

## Requirements

### R1. Built-in page

Serve a responsive dashboard at `GET /dashboard` from the same FastAPI process.
Use inline HTML, CSS, and native JavaScript. Do not add a frontend build step,
template engine, CDN, or runtime dependency.

### R2. Current session list

Show all non-expired entries in `MemorySessionStore`, sorted by latest recorded
request time when available and otherwise by live-session update order.

Each row must show:

- session ID
- latest request time, when recorded
- latest user-message preview when content capture permits it, otherwise an
  explicit content-not-captured state
- current strategy and label
- canonical routed model
- provider and upstream model when resolvable
- turn count and latest outcome status

Historical SQLite-only sessions are not current sessions and must not appear.

### R3. Per-session request timeline

Selecting a live session must show every retained inbound request associated with
that session, newest first. A request may lack a decision or outcome when it was
rejected or is still being processed; the UI must represent those states without
failing the whole timeline.

For each request, show three distinct sections:

1. inbound routing request and extracted request metadata
2. routing decision, candidates, signals, selected canonical model, provider,
   upstream model, label, reason, mode, and reasoning effort
3. sanitized payload actually submitted to LiteLLM plus outcome metadata

"Every retained request" is bounded by the existing `storage.max_requests`
policy. The dashboard does not create a second history store.

### R4. Actual upstream-request evidence

Record the final completion payload after provider message preparation and
reasoning-effort application, immediately before the LiteLLM call. Record it for
both successful and failed upstream calls.

Before the record reaches the asynchronous queue:

- redact `api_key`, authorization/header secrets, token/secret/password/
  credential-shaped fields, and every field sourced from
  `providers[].param_env`
- keep the actual LiteLLM model argument and non-secret request parameters
- when `storage.capture_content` is false, omit message, prompt, tool, and other
  content-bearing values while retaining safe structural metadata
- convert unsupported runtime objects to non-sensitive type markers, never to
  `repr()` output

### R5. Authentication

The dashboard shell contains no session data and may load through a normal browser
navigation. All dashboard data APIs must reuse the gateway's existing Bearer
credential check.

After a 401 response, the page asks for the API key and keeps it only in a
JavaScript memory variable. It must not put the key in a URL, cookie, local
storage, session storage, persisted HTML, or log field.

### R6. Storage states

The session list remains usable from live memory when evidence storage is
disabled or degraded. In that case, show current route data and a clear evidence
availability message.

The session detail endpoint returns the live snapshot and an empty retained
request list with the storage state when evidence cannot be queried. Storage
failure must not affect chat completion availability.

### R7. Manual refresh

Provide one refresh control for the provider summary, session list, and selected
session. Automatic polling, live streaming, notifications, and background refresh
are out of scope.

### R8. Recent provider observations

Show one compact provider-summary panel for every provider in the active catalog,
including providers with no retained traffic. It is a small operational view, not
provider health or aggregate analytics.

The panel uses a fixed rolling 15-minute window. It derives attempts from
`upstream_requests` submitted immediately before LiteLLM, then shows retained
completed, succeeded, failed, and incomplete-evidence counts, average observed
latency for completed attempts, and the latest completed outcome. It also shows a
neutral observed condition: `no_recent_data`, `all_observed_attempts_succeeded`,
`mixed_outcomes`, or `all_observed_attempts_failed`.

The authenticated API returns the fixed window start and end, its
`upstream_requests.created_at` basis, recorder status, and `evidence_available`.
When evidence is disabled or degraded, all derived metrics and condition are
`null`, while safe configured-provider metadata remains visible. A missing outcome
is incomplete evidence, not a live request or concurrency measure. All panel copy
must call the data retained, best effort, and potentially incomplete. It must not
claim a provider is healthy, degraded, down, reachable, or unavailable.

### R9. Credential-safe upstream errors

Sequencing: land this fix before R8, which reads the same evidence tables and
would otherwise inherit the leak.

Upstream exception text is untrusted and must not cross a trust boundary. The
client, SQLite, and the dashboard see gateway-authored text and bounded exception
metadata. The operator log keeps the traceback, with credential shapes masked.

- An upstream failure returns a fixed gateway-authored 502 message. `error.code`
  stays `upstream_error`, `error.type` stays the exception class name, and no
  upstream exception wording appears in the response body.
- The recorded outcome stores `error_type` only. `outcomes.error_message` stays
  NULL for upstream failures. The column and its dataclass field stay in place,
  so no migration runs.
- The DEBUG traceback stays. Credential masking happens at the logging formatter
  and covers the pretty, compact, and JSON formats.
- A small `redact_secret_text` helper shares the existing secret vocabulary and
  leaves safe token-count fields such as `max_tokens` and `total_tokens`
  untouched.
- The dashboard keeps `error_type` only and never serializes `error_message`.
- `error_type` is bounded before it crosses the response, disk, and log
  boundaries.

Backward compatibility: one test expectation change is deliberate. Clients lose
the upstream wording in the 502 body, but `error.code` and `error.type` still let
OpenAI-compatible clients branch. No schema migration runs. Databases written
before the fix can still hold raw upstream text, and this change does not rewrite
them.

## Acceptance criteria

- [ ] `GET /dashboard` returns a self-contained, responsive page with no external
      assets or added package dependency.
- [ ] The session API returns every non-expired live session and excludes expired,
      evicted, historical-only, and null-session records.
- [ ] Each session row identifies the canonical route used by the latest routed
      turn and its provider/upstream model when known.
- [ ] Selecting a session displays every retained request in newest-first order,
      including rejected or incomplete requests without a decision or outcome.
- [ ] Each completed request distinguishes the inbound request, routing decision,
      sanitized LiteLLM payload, and outcome.
- [ ] Provider-adapter message changes and applied reasoning effort are visible in
      captured upstream payloads when `capture_content` is enabled.
- [ ] No resolved credential or authorization value reaches SQLite, API output,
      HTML, logs, or test snapshots (R4 evidence capture, R9 upstream-error
      path).
- [ ] An upstream failure returns a fixed gateway-authored 502 message, and the
      response body contains no upstream exception text while `error.code` and
      `error.type` survive.
- [ ] Upstream failures store `error_type` only: `outcomes.error_message` stays
      NULL, and `error_type` is bounded before it crosses the response, disk,
      and log boundaries.
- [ ] DEBUG tracebacks render through the credential-masking formatter in pretty,
      compact, and JSON formats, so no credential or credential-shaped text
      appears in the output.
- [ ] Dashboard evidence serialization never emits `error_message`, and a
      regression test locks it out.
- [ ] The deliberate test expectation change and the pre-existing-database
      limitation are documented: clients lose upstream wording in the 502 body,
      no migration runs, and older databases can still hold raw upstream text.
- [ ] With `capture_content` disabled, request and upstream content remain hidden
      while route, model, timing, status, counts, and digests remain available.
- [ ] Dashboard data endpoints reject a missing or incorrect Bearer token when
      gateway authentication is configured.
- [ ] The browser never stores or sends the token through the URL.
- [ ] Disabled or degraded storage produces an explicit evidence-unavailable
      state without breaking the live session list or chat endpoints.
- [ ] One authenticated provider-summary API reports a server-defined rolling
      15-minute window, its submission-time basis, and every configured provider.
- [ ] With usable retained evidence, each provider row reports submitted attempts,
      completed, succeeded, failed, and incomplete-evidence counts; average
      observed latency and latest completed outcome are `null` when unavailable.
- [ ] With disabled or degraded storage, provider metrics and observed condition
      are `null`, not zero or `no_recent_data`; configured-provider metadata and
      recorder status remain available.
- [ ] The provider panel uses neutral observed-condition labels and explicitly
      describes data as retained and best effort. It does not present provider
      health, uptime, reachability, load, or concurrency claims.
- [ ] The existing manual Refresh control reloads the provider summary with the
      session list and selected session, without polling or a separate refresh
      mechanism.
- [ ] Existing startup, reload, routing, session, storage, and OpenAI-compatible
      response behavior remains backward compatible.
- [ ] Focused tests, the full pytest suite, Pyright, and package build pass.

## Out of scope

- Historical/expired-session browsing
- Editing, deleting, replaying, or terminating sessions or requests
- Charts, broader aggregate analytics, cost reports, alerts, exports, or saved
  filters. R8 is the sole narrow provider-summary exception.
- Automatic polling, WebSockets, server-sent dashboard events, or push updates
- User accounts, roles, cookies, or a new authentication mechanism
- Capturing or displaying full assistant response bodies
- Changing session derivation, TTL, routing, retry, fallback, or retention policy
- Arbitrary time ranges, direct provider probes, synthetic traffic, provider
  status feeds, true concurrency or utilization estimates, long-term analytics,
  controls, costs, alerts, or a new telemetry service
- A dashboard configuration block, theme selector, frontend framework, or new
  service
- A one-time scrub of raw upstream error text already written by earlier versions
