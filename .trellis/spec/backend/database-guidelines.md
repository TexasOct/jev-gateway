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
| `outcomes` | Upstream success or error, token usage, cost, latency, and returned model |
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
- `counts()` and continuation reads run on the writer through `_submit(...,
  wait=True)`. This keeps all access ordered relative to queued writes.

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
  and removes the oldest requests plus decisions and outcomes that reference
  removed requests.
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
