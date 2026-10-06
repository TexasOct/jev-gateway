# Database guidelines

> Persistence patterns for routing evidence and provider continuation state.

## Overview

The project uses Python's standard `sqlite3` module directly. It has no ORM,
migration framework, repository layer, or external database service. All schema,
queries, compatibility migrations, queueing, and retention logic live in
`jev_gateway/records.py`.

Persistence is evidence collection, not a gateway availability dependency.
Request handling submits immutable snapshots to a bounded queue. One dedicated
thread owns the SQLite connection and executes all writes.

## Storage implementations

`RecordStore` is the protocol consumed by the routing engine and provider
adapters. The concrete implementations are:

- `NullRecordStore` when storage is disabled.
- `SqliteRecordStore` when SQLite recording is enabled.
- `_UnavailableRecordStore` when enabled storage cannot initialize. It reports
  degradation while allowing the gateway to keep serving requests.

The protocol includes:

```python
class RecordStore(Protocol):
    def register_config(self, payload: dict[str, Any], source: str) -> str: ...
    def record_request(self, record: RequestRecord) -> None: ...
    def record_decision(self, record: DecisionRecord) -> None: ...
    def record_outcome(self, record: OutcomeRecord) -> None: ...
    def record_assistant_continuation(
        self, record: AssistantContinuationRecord
    ) -> None: ...
    def load_assistant_continuations(
        self, session_id: str, *, limit: int
    ) -> list[AssistantContinuationRecord]: ...
    def flush(self) -> None: ...
    def status(self) -> dict[str, Any]: ...
    def close(self) -> None: ...
```

Add storage operations to the protocol and all three implementations together.
Callers must not rely on concrete `SqliteRecordStore` methods.

## Connection and durability settings

Only `_SqliteBackend` opens SQLite. `SqliteRecordStore` starts the
`jev-record-writer` daemon thread and waits for database initialization before
startup continues. The connection uses:

```python
sqlite3.connect(
    path,
    check_same_thread=False,
    timeout=settings.busy_timeout_ms / 1000,
)
connection.row_factory = sqlite3.Row
connection.execute("PRAGMA journal_mode=WAL")
connection.execute("PRAGMA synchronous=FULL")
```

A file-backed database is created with mode `0600`. Symlink paths are rejected,
and `O_NOFOLLOW` is used when the platform supports it.

Do not open another SQLite connection on request threads. Queue operations must
remain free of database I/O.

## Schema

`SCHEMA` is the source of truth. It creates these objects with
`CREATE ... IF NOT EXISTS`:

| Object | Purpose |
| --- | --- |
| `requests` | Inbound request metadata plus optional prompt, messages, tools, and response format content |
| `decisions` | Selected strategy, route, provider, model, label, mode, signals, candidates, and reasoning effort |
| `outcomes` | Upstream success or error type, token usage, cost, latency, and returned model |
| `upstream_requests` | Sanitized LiteLLM submission payload and provider identity, keyed by decision |
| `config_versions` | Content-addressed snapshots of the catalog used by decisions |
| `assistant_continuations` | Provider-owned continuation payloads keyed by session and assistant message |
| `decision_evidence` | Read view joining decisions with request and outcome evidence |

Primary keys are text identifiers already created by the application, except
`assistant_continuations.continuation_id`, which is an autoincrement integer.
Boolean values are stored as `INTEGER`. Structured values use `*_json` text
columns. Timestamps and durations use `REAL`.

Indexes follow `idx_<table>_<field>` naming. Current indexes cover request time,
request/session lookup, decision request/session/strategy/config lookup, outcome
request lookup, and `(session_id, continuation_id)` for continuations.

Tables and columns use lowercase plural table names and `snake_case` columns.
Preserve this convention for new schema fields.

## Query and transaction patterns

- Always use SQL placeholders for values. Do not interpolate values or SQLite
  metadata into SQL.
- Each write method uses `_transaction()`, which serializes access with a lock
  and the connection context manager.
- Request, decision, and outcome writes use `INSERT OR REPLACE` because their
  IDs identify the complete record snapshot.
- Configuration snapshots use `INSERT OR IGNORE` because `config_hash` is a
  content digest.
- Continuation reads are ordered newest first for the SQL limit, then reversed
  before returning so callers receive chronological order.
- `counts()`, continuation reads, session evidence, and provider summaries run on
  the writer through `_submit(..., wait=True)`. This keeps all access ordered
  relative to queued writes.

`flush()` submits a no-op with `wait=True`. Its completion proves that all jobs
accepted before it have finished. A successful nonblocking enqueue alone is not
a durability guarantee.

`close()` marks the store closed, enqueues a sentinel after accepted work, waits
for the worker to drain the queue, and joins the thread. It must not discard
accepted jobs.

## Queue and failure behavior

`SqliteRecordStore` deep-copies mutable records before enqueueing. The bounded
queue defaults to 4096 entries. `_submit()` is nonblocking for normal writes and
raises `StorageUnavailableError` when the queue is full, closed, failed, or the
worker is dead.

The routing layer catches record-store failures and logs `routing record dropped`.
Storage failure must not change an otherwise valid gateway response. The health
endpoint reports `status: "degraded"` and includes the storage error while still
returning HTTP 200.

The worker stores its first operation error, logs the exception, and rejects
later operations. Keep this fail-closed writer state. Continuing to write after
an unknown partial database failure can create misleading evidence.

## Retention

- `max_requests: null` retains all request evidence.
- When a numeric request limit is set, pruning runs every `PRUNE_INTERVAL` writes
  and removes the oldest requests plus decisions, outcomes, and upstream requests
  that reference removed requests.
- Provider continuation state is bounded on every continuation write by both
  `max_continuations_per_session` and `max_continuation_sessions`.
- `capture_content: false` retains request metadata and prompt digests but omits
  full prompts, messages, tools, and response formats.

Keep retention logic in `_SqliteBackend`; callers should submit records without
implementing their own cleanup.

## Schema evolution

There is no migrations directory or schema version table. Compatibility changes
are explicit functions in `records.py` and run during `_SqliteBackend._open()`
after `SCHEMA`:

- `_migrate_decision_columns()` adds missing nullable columns with `ALTER TABLE`,
  then recreates `decision_evidence`.
- `_migrate_requested_model()` rebuilds the legacy `requests` table to remove an
  obsolete `NOT NULL` constraint.

For a backward-compatible column addition, update the table DDL, add an explicit
migration, and update any view that exposes the field. Drop and recreate views
when their selected columns change because `CREATE VIEW IF NOT EXISTS` does not
update an existing view. Add migration coverage to `tests/test_records.py`.

## Scenario: retained provider observations

### 1. Scope / trigger

The dashboard aggregates recent evidence by configured provider. This is an
operational view of retained submissions, not a provider health probe or a
lossless traffic counter.

### 2. Signatures

`RecordStore.provider_summary(*, window_start: float, window_end: float) ->
dict[str, dict[str, Any]]` is implemented by the SQLite, disabled, and
unavailable stores. `GET /v1/routing/providers/summary` is Bearer-protected.
The SQL reads `upstream_requests` through the existing writer queue. Index
`idx_upstream_requests_created_at` covers the window predicate.

### 3. Contracts

The API fixes its rolling window at 900 seconds. `window.start <=
upstream_requests.created_at < window.end`; the response reports both bounds
and `basis: "upstream_requests.created_at"`. Rows include provider ID and type,
`configured`, `has_api_key`, attempts, completed, succeeded, failed,
`incomplete_evidence`, average duration in ms, last completed outcome time and
result, and `observed_condition`. No new environment keys or settings exist.
Only the active catalog supplies provider rows; SQLite supplies their metrics.

### 4. Validation & error matrix

| State | API behavior |
| --- | --- |
| Missing or incorrect Bearer key when configured | 401 |
| Enabled recorder, no retained attempts | Zero counts, null durations/latest result, `no_recent_data` |
| Attempts without outcomes | Count as incomplete evidence, never as active work |
| Disabled or degraded recorder | Catalog metadata remains; derived metrics and condition are null, `evidence_available: false` |

### 5. Good / base / bad cases

Good: one submitted attempt with an outcome contributes one attempt and one
completed result. Base: a configured provider with no retained attempt has zero
counts. Bad: queue loss, retention, and process interruption can create gaps;
never call these numbers total traffic or uptime.

### 6. Tests required

Assert window start inclusion and end exclusion, provider grouping, null average
when completed outcomes lack latency, newest completed outcome, zero-traffic
catalog entries, streaming completion timing, auth, disabled/degraded nulls,
and no secrets or request content in the summary.

### 7. Wrong vs correct

Wrong: query SQLite from a request thread and label missing outcomes `active`.
Correct: submit the aggregate query with `wait=True` and label those rows
`incomplete_evidence`.

## Scenario: configuration publication after serialized activation

### 1. Scope / trigger

Provider/model/default writes and gateway-key rotation may activate a candidate
catalog before their recovery journal is removed. A later activation, settings,
or journal-completion failure must not leave that candidate in `config_versions`.
Routing-overlay apply/reset also activate a candidate inside their file/runtime
transaction. Both transaction owners preserve disk/runtime rollback. The routing
engine owns publication admission; the record store retains its queue and schema.

### 2. Signatures

```python
RoutingEngine.defer_config_publication(self) -> Iterator[None]
RoutingEngine.reload_catalog(
    self, catalog: Catalog, source: str | None = None,
    *, registry: StrategyRegistry | None = None,
) -> None
RoutingEngine._register_config(self, catalog: Catalog, source: str | None = None) -> str
RecordStore.register_config(self, payload: dict[str, Any], source: str) -> str
```

`defer_config_publication` is a context manager. Gateway management admission
uses `with reload_lock, active.engine.defer_config_publication():` around
`ProviderConfiguration.command` or `gateway_credential`. The reload lock remains
held until deferred publication finishes. The context-local marker belongs to
that engine; other requests must not inherit a pending activation scope.

`PUT` and `DELETE /v1/routing/configuration` use
`with reload_lock, configuration_lock(active.models_file), active.engine.defer_config_publication():`.
Preparation, overlay write/removal, activation and rollback remain inside that
scope. `POST /v1/routing/reload` retains its existing parse, registry, storage and
activation boundary; do not invent a post-activation failure to justify changing it.

### 3. Contracts

Within the scope, `_register_config` computes `build_config_hash` from the
candidate routing snapshot without calling or enqueueing `register_config`.
This also suppresses redundant publication of the restored catalog during
rollback. Normal scope exit publishes only the final active catalog and source,
after file replacement, activation, settings application and recovery-journal
completion where applicable. Overlay apply/reset publish after their successful
activation. The active hash remains the digest of that final routing snapshot.

Exceptional exit resets the context marker and publishes nothing. Preserve all
previous `config_versions` rows, including an existing row with the candidate's
hash, its original source/timestamp, and every referenced decision, session,
continuation and in-memory history record. No version deletion or queue drain
can substitute for preventing the failed candidate from being submitted.

Overlay rollback restores the original bytes/existence and all permission bits
(`st_mode & 0o7777`). Capture the prior registry and pass it to `reload_catalog`
with the prior catalog/source; constructing an equivalent replacement registry
does not preserve runtime identity.

Storage remains best effort: publication failure logs the fixed record-drop
message and safe error type, retains the final snapshot digest, and does not
roll back an otherwise committed management transaction. No new API payload,
SQLite schema, environment key or storage setting is introduced. See
`provider-configuration.md` for revision, authorization and recovery ownership.

### 4. Validation & error matrix

| State | Required behavior |
| --- | --- |
| Validate/prepare only | No candidate publication, file change or active-catalog replacement |
| Successful management transaction | Publish final active snapshot only after journal completion; HTTP success remains valid |
| Failure before/after reload, during settings, or removing the journal | Existing `500 provider_configuration_failed`; restore previous bytes, existence, permission modes and runtime; version rows remain exact |
| Successful overlay apply/reset | Publish final active snapshot after overlay write/removal and activation |
| Overlay activation fails before/after reload | Existing `500 overlay_apply_failed`; restore overlay bytes/existence/all permission bits, exact catalog/registry/source/hash, authentication and history; version rows remain exact |
| Candidate hash already has a retained version | Preserve that row and its evidence on both failure and success; retain `INSERT OR IGNORE` semantics |
| Recorder unavailable on successful publication | Keep committed files/runtime/hash and serve normally; record degradation without exposing secrets |
| Concurrent chat during activation | Wait for management admission to finish; a failed candidate cannot appear in decision hashes or reach the SDK |

### 5. Good / base / bad cases

Good: a model edit commits, its journal is removed, and one final snapshot is
submitted before the next decision uses its hash. Base: rotating a key without
changing the routing digest retains the existing content-addressed row. Bad:
reload submits an async candidate, activation later fails, and disk rollback
leaves an unreferenced candidate version in SQLite.

### 6. Tests required

`tests/test_activation_publication.py` exercises synchronous and asynchronous
registration, existing/missing candidate hashes, model/provider/default/gateway
operations, failure before/after reload, settings and journal completion. Compare
exact version rows after `flush()`, file existence/bytes/modes, catalog/registry
identity, source/hash/authentication, session snapshot and retained history.
Verify healthy chat and restart after rollback. Event-controlled concurrent chat
must wait and record only the restored hash. On success, assert publication
follows journal removal; injected recorder failure must retain a successful
management response and functioning chat. The independent T8 matrix supplies
additional activation/atomic-replacement fault points without modifying its
frozen assertions.

`tests/test_routing_activation_publication.py` adds apply with absent/present
overlay and reset with an overlay installed before initial gateway load. Cover
both registration modes, candidate hash absent/already retained and failure
before/after engine activation. Compare flushed SQLite rows, exact files/modes,
registry identity, auth/session/history and a subsequent healthy synthetic chat.
For successful apply/reset, assert activation precedes publication; unavailable
recording must not undo a committed overlay. A reset fixture must not pre-register
the baseline hash before startup when testing its absent-candidate case.

### 7. Wrong vs correct

Wrong: register the candidate before activation, then delete its version by hash
after a failure. That can erase retained evidence or race an async writer.
Correct: suppress registration within the serialized activation scope and
publish the final active snapshot only on successful transaction completion.

## Common mistakes

- Do not perform SQLite work in FastAPI request threads.
- Do not let evidence persistence determine request availability.
- Do not assume enqueue success means the bytes survived a process crash.
- Do not change storage settings during reload. The current contract requires a
  process restart for every storage-setting change.
- Do not add an ORM or migration dependency for an isolated schema change. Follow
  the existing explicit SQLite migration pattern unless the project deliberately
  changes its persistence architecture.
- Do not log or expose captured prompt content when reporting storage failures.
