"""Best-effort durable storage for inbound requests, routing decisions, and outcomes.

A config version links each decision to the policy and model metadata that
produced it. Record delivery must never determine whether the gateway serves a
request.
"""

from __future__ import annotations

import atexit
import copy
import hashlib
import json
import logging
import os
import queue
import sqlite3
import threading
from collections.abc import Callable, Iterator
from concurrent.futures import Future
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, NoReturn, Protocol

logger = logging.getLogger(__name__)

__all__ = [
    "AssistantContinuationRecord",
    "DecisionRecord",
    "NullRecordStore",
    "OutcomeRecord",
    "RecordStore",
    "RequestMeta",
    "RequestRecord",
    "SqliteRecordStore",
    "StorageSettings",
    "StorageUnavailableError",
    "build_config_hash",
    "record_store_from_settings",
]

PRUNE_INTERVAL = 256
DEFAULT_QUEUE_SIZE = 4096


class StorageUnavailableError(RuntimeError):
    """The writer cannot accept or persist new evidence."""


_TABLES = """
CREATE TABLE IF NOT EXISTS requests (
    request_id TEXT PRIMARY KEY,
    received_at REAL NOT NULL,
    session_id TEXT,
    strategy TEXT,
    requested_model TEXT,
    endpoint TEXT NOT NULL,
    client TEXT,
    user_agent TEXT,
    stream INTEGER NOT NULL DEFAULT 0,
    max_tokens INTEGER,
    has_tools INTEGER NOT NULL DEFAULT 0,
    has_vision INTEGER NOT NULL DEFAULT 0,
    wants_json INTEGER NOT NULL DEFAULT 0,
    prompt_chars INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    conversation_tokens INTEGER NOT NULL DEFAULT 0,
    turn_index INTEGER NOT NULL DEFAULT 0,
    capture_content INTEGER NOT NULL DEFAULT 0,
    prompt_digest TEXT,
    prompt TEXT,
    messages_json TEXT,
    tools_json TEXT,
    response_format_json TEXT
);

CREATE TABLE IF NOT EXISTS decisions (
    decision_id TEXT PRIMARY KEY,
    request_id TEXT,
    session_id TEXT,
    strategy TEXT NOT NULL,
    config_hash TEXT,
    route TEXT NOT NULL,
    provider TEXT NOT NULL,
    upstream_model TEXT NOT NULL,
    tier TEXT NOT NULL,
    reason TEXT NOT NULL,
    mode TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    switched_from TEXT,
    blocked_by TEXT,
    reasoning_effort TEXT,
    reasoning_effort_source TEXT,
    candidates_json TEXT NOT NULL,
    signals_json TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS outcomes (
    decision_id TEXT PRIMARY KEY,
    request_id TEXT,
    ok INTEGER NOT NULL,
    finish_reason TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    cost_usd REAL,
    latency_ms REAL,
    returned_model TEXT,
    error_type TEXT,
    error_message TEXT,
    recorded_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS config_versions (
    config_hash TEXT PRIMARY KEY,
    captured_at REAL NOT NULL,
    source TEXT,
    catalog_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_continuations (
    continuation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    message_key TEXT NOT NULL,
    provider_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_received_at ON requests (received_at);
CREATE INDEX IF NOT EXISTS idx_requests_session ON requests (session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_request ON decisions (request_id);
CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions (session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_strategy ON decisions (strategy);
CREATE INDEX IF NOT EXISTS idx_decisions_config ON decisions (config_hash);
CREATE INDEX IF NOT EXISTS idx_outcomes_request ON outcomes (request_id);
CREATE INDEX IF NOT EXISTS idx_assistant_continuations_session
    ON assistant_continuations (session_id, continuation_id);
"""

# Kept separate from the tables so an existing database can be migrated: the view
# names the new columns, and `CREATE VIEW IF NOT EXISTS` would otherwise leave the
# old view in place and silently drop them from every query that reads it.
DECISION_EVIDENCE_VIEW = """CREATE VIEW IF NOT EXISTS decision_evidence AS
SELECT
    d.decision_id,
    d.request_id,
    d.session_id,
    d.strategy,
    d.config_hash,
    d.route,
    d.provider,
    d.upstream_model,
    d.tier,
    d.reason,
    d.mode,
    d.turn_index,
    d.switched_from,
    d.blocked_by,
    d.reasoning_effort,
    d.reasoning_effort_source,
    d.signals_json,
    d.candidates_json,
    d.created_at,
    r.requested_model,
    r.strategy AS requested_strategy,
    r.prompt_chars,
    r.prompt_tokens,
    r.conversation_tokens,
    r.has_tools,
    r.has_vision,
    r.wants_json,
    o.ok,
    o.finish_reason,
    o.completion_tokens,
    o.total_tokens,
    o.cost_usd,
    o.latency_ms,
    o.error_type
FROM decisions d
LEFT JOIN requests r ON r.request_id = d.request_id
LEFT JOIN outcomes o ON o.decision_id = d.decision_id;
"""

SCHEMA = _TABLES + "\n" + DECISION_EVIDENCE_VIEW

# Columns added after the first release. SQLite stores a new column in the table
# header rather than rewriting rows, so adding one to a multi-gigabyte evidence
# database is a metadata change, not a migration over the data.
_DECISION_COLUMN_MIGRATIONS = {
    "reasoning_effort": "ALTER TABLE decisions ADD COLUMN reasoning_effort TEXT",
    "reasoning_effort_source": (
        "ALTER TABLE decisions ADD COLUMN reasoning_effort_source TEXT"
    ),
}


@dataclass(frozen=True)
class StorageSettings:
    """Where request and decision records are kept."""

    enabled: bool = False
    path: str = "jev-records.sqlite3"
    capture_content: bool = True
    max_requests: int | None = None
    max_continuations_per_session: int = 40
    max_continuation_sessions: int = 2_048
    busy_timeout_ms: int = 5_000
    queue_size: int = DEFAULT_QUEUE_SIZE

    def as_dict(self) -> dict[str, Any]:
        """Serialize storage settings for the policy endpoint."""
        return {
            "enabled": self.enabled,
            "path": self.path,
            "capture_content": self.capture_content,
            "max_requests": self.max_requests,
            "max_continuations_per_session": self.max_continuations_per_session,
            "max_continuation_sessions": self.max_continuation_sessions,
            "busy_timeout_ms": self.busy_timeout_ms,
            "queue_size": self.queue_size,
        }


@dataclass(frozen=True)
class AssistantContinuationRecord:
    """Provider-owned continuation metadata for one replayable assistant turn."""

    session_id: str
    message_key: str
    provider_type: str
    payload: dict[str, Any]
    created_at: float


@dataclass(frozen=True)
class RequestMeta:
    """HTTP-level facts the engine cannot read from the chat request itself."""

    endpoint: str = "/v1/chat/completions"
    client: str | None = None
    user_agent: str | None = None
    stream: bool = False
    requested_strategy: str | None = None


@dataclass(frozen=True)
class RequestRecord:
    """One inbound request, with the signals the router extracted from it."""

    request_id: str
    received_at: float
    session_id: str | None
    requested_strategy: str | None
    requested_model: str | None
    endpoint: str
    client: str | None
    user_agent: str | None
    stream: bool
    max_tokens: int | None
    tools: Any
    response_format: Any
    messages: Any
    prompt: str
    prompt_chars: int
    prompt_tokens: int
    conversation_tokens: int
    turn_index: int
    has_tools: bool
    has_vision: bool
    wants_json: bool


@dataclass(frozen=True)
class DecisionRecord:
    """One routing decision, with the evidence chain that produced it."""

    decision_id: str
    request_id: str | None
    session_id: str | None
    strategy: str
    config_hash: str
    route: str
    provider: str
    upstream_model: str
    tier: str
    reason: str
    mode: str
    turn_index: int
    switched_from: str | None
    blocked_by: str | None
    reasoning_effort: str | None
    reasoning_effort_source: str
    candidates: tuple[str, ...]
    signals: dict[str, Any]
    created_at: float


@dataclass(frozen=True)
class OutcomeRecord:
    """What the upstream provider did with the routed request."""

    decision_id: str
    request_id: str | None
    ok: bool
    finish_reason: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    cost_usd: float | None = None
    latency_ms: float | None = None
    returned_model: str | None = None
    error_type: str | None = None
    error_message: str | None = None


class RecordStore(Protocol):
    """The storage contract the engine and gateway depend on."""

    enabled: bool
    continuation_limit: int
    settings: StorageSettings

    def register_config(self, payload: dict[str, Any], source: str) -> str:
        """Persist a routing configuration snapshot and return its hash."""
        raise RuntimeError("RecordStore protocol method called directly")

    def record_request(self, record: RequestRecord) -> None:
        """Persist one inbound request."""
        raise RuntimeError("RecordStore protocol method called directly")

    def record_decision(self, record: DecisionRecord) -> None:
        """Persist one routing decision with its evidence chain."""
        raise RuntimeError("RecordStore protocol method called directly")

    def record_outcome(self, record: OutcomeRecord) -> None:
        """Persist the upstream result for one decision."""
        raise RuntimeError("RecordStore protocol method called directly")

    def record_assistant_continuation(
        self, record: AssistantContinuationRecord
    ) -> None:
        """Persist provider-owned continuation metadata."""
        raise RuntimeError("RecordStore protocol method called directly")

    def load_assistant_continuations(
        self, session_id: str, *, limit: int
    ) -> list[AssistantContinuationRecord]:
        """Load recent continuation metadata in insertion order."""
        raise RuntimeError("RecordStore protocol method called directly")

    def counts(self) -> dict[str, int]:
        """Return the number of stored rows per table."""
        raise RuntimeError("RecordStore protocol method called directly")

    def validate_reconfiguration(self, settings: StorageSettings) -> None:
        """Reject runtime changes that require replacing process-owned resources."""
        raise RuntimeError("RecordStore protocol method called directly")

    def reconfigure(self, settings: StorageSettings) -> None:
        """Apply reloadable settings or reject changes that require restart."""
        raise RuntimeError("RecordStore protocol method called directly")

    def flush(self) -> None:
        """Wait for all previously submitted writes, raising on writer failure."""
        raise RuntimeError("RecordStore protocol method called directly")

    def status(self) -> dict[str, Any]:
        """Report pending writes and any background failure."""
        raise RuntimeError("RecordStore protocol method called directly")

    def close(self) -> None:
        """Drain queued writes and release storage resources."""
        raise RuntimeError("RecordStore protocol method called directly")


def build_config_hash(payload: dict[str, Any]) -> str:
    """Return a stable digest of the routing configuration."""
    canonical = json.dumps(
        payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _json(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


class NullRecordStore:
    """The disabled store: computes hashes but writes nothing."""

    enabled = False

    def __init__(self, settings: StorageSettings | None = None) -> None:
        self.settings = settings or StorageSettings()
        self.continuation_limit = self.settings.max_continuations_per_session

    def register_config(self, payload: dict[str, Any], source: str) -> str:
        return build_config_hash(payload)

    def record_request(self, record: RequestRecord) -> None:
        return None

    def record_decision(self, record: DecisionRecord) -> None:
        return None

    def record_outcome(self, record: OutcomeRecord) -> None:
        return None

    def record_assistant_continuation(
        self, record: AssistantContinuationRecord
    ) -> None:
        return None

    def load_assistant_continuations(
        self, session_id: str, *, limit: int
    ) -> list[AssistantContinuationRecord]:
        return []

    def counts(self) -> dict[str, int]:
        return {
            "requests": 0,
            "decisions": 0,
            "outcomes": 0,
            "config_versions": 0,
            "assistant_continuations": 0,
        }

    def validate_reconfiguration(self, settings: StorageSettings) -> None:
        if settings != self.settings:
            raise ValueError("Changing storage settings requires a restart.")

    def reconfigure(self, settings: StorageSettings) -> None:
        self.validate_reconfiguration(settings)

    def flush(self) -> None:
        return None

    def status(self) -> dict[str, Any]:
        return {"enabled": False, "pending": 0, "error": None}

    def close(self) -> None:
        return None


class _UnavailableRecordStore:
    """A degraded store that lets the gateway run after recorder startup fails."""

    enabled = True

    def __init__(self, error: BaseException, settings: StorageSettings) -> None:
        self._error = error
        self.settings = settings
        self.continuation_limit = settings.max_continuations_per_session

    def register_config(self, payload: dict[str, Any], source: str) -> str:
        return build_config_hash(payload)

    def _unavailable(self) -> NoReturn:
        raise StorageUnavailableError(str(self._error)) from self._error

    def record_request(self, record: RequestRecord) -> None:
        self._unavailable()

    def record_decision(self, record: DecisionRecord) -> None:
        self._unavailable()

    def record_outcome(self, record: OutcomeRecord) -> None:
        self._unavailable()

    def record_assistant_continuation(
        self, record: AssistantContinuationRecord
    ) -> None:
        self._unavailable()

    def load_assistant_continuations(
        self, session_id: str, *, limit: int
    ) -> list[AssistantContinuationRecord]:
        self._unavailable()

    def counts(self) -> dict[str, int]:
        return {
            "requests": 0,
            "decisions": 0,
            "outcomes": 0,
            "config_versions": 0,
            "assistant_continuations": 0,
        }

    def validate_reconfiguration(self, settings: StorageSettings) -> None:
        if settings != self.settings:
            raise ValueError("Changing storage settings requires a restart.")
        self._unavailable()

    def reconfigure(self, settings: StorageSettings) -> None:
        self._unavailable()

    def flush(self) -> None:
        self._unavailable()

    def status(self) -> dict[str, Any]:
        return {
            "enabled": True,
            "pending": 0,
            "error": str(self._error),
            "alive": False,
        }

    def close(self) -> None:
        return None


def _migrate_requested_model(connection: sqlite3.Connection) -> None:
    """Rebuild legacy requests tables so invalid input can retain a NULL model."""
    columns = {row[1]: row for row in connection.execute("PRAGMA table_info(requests)")}
    if not columns or not columns["requested_model"][3]:
        return
    connection.execute("DROP VIEW IF EXISTS decision_evidence")
    # This table has no inbound foreign keys. Copy all original columns and rows;
    # SQLite cannot remove a NOT NULL constraint with ALTER TABLE.
    connection.execute("ALTER TABLE requests RENAME TO requests_legacy")
    # The source table is an older version of our own fixed schema. Do not
    # interpolate SQLite metadata into DDL or identifiers.
    connection.execute(_TABLES.split(";", 1)[0])
    connection.execute(
        "INSERT INTO requests (request_id, received_at, session_id, strategy, "
        "requested_model, endpoint, client, user_agent, stream, max_tokens, "
        "has_tools, has_vision, wants_json, prompt_chars, prompt_tokens, "
        "conversation_tokens, turn_index, capture_content, prompt_digest, prompt, "
        "messages_json, tools_json, response_format_json) "
        "SELECT request_id, received_at, session_id, strategy, requested_model, "
        "endpoint, client, user_agent, stream, max_tokens, has_tools, has_vision, "
        "wants_json, prompt_chars, prompt_tokens, conversation_tokens, turn_index, "
        "capture_content, prompt_digest, prompt, messages_json, tools_json, "
        "response_format_json FROM requests_legacy"
    )
    connection.execute("DROP TABLE requests_legacy")
    connection.execute("CREATE INDEX idx_requests_received_at ON requests (received_at)")
    connection.execute("CREATE INDEX idx_requests_session ON requests (session_id)")
    connection.executescript(DECISION_EVIDENCE_VIEW)


def _migrate_decision_columns(connection: sqlite3.Connection) -> None:
    """Widen a decisions table that a previous version created.

    `CREATE TABLE IF NOT EXISTS` leaves an existing table exactly as it was, so a
    database written by an earlier release has to be widened explicitly before the
    new INSERT names the new columns. The view is dropped and recreated rather than
    altered, because SQLite cannot add a column to a view in place.
    """
    existing = {row[1] for row in connection.execute("PRAGMA table_info(decisions)")}
    if not existing:
        return
    missing = [name for name in _DECISION_COLUMN_MIGRATIONS if name not in existing]
    if not missing:
        return
    for name in missing:
        connection.execute(_DECISION_COLUMN_MIGRATIONS[name])
    connection.execute("DROP VIEW IF EXISTS decision_evidence")
    connection.executescript(DECISION_EVIDENCE_VIEW)


class _SqliteBackend:
    """SQLite operations confined to the dedicated writer thread."""

    def __init__(self, settings: StorageSettings) -> None:
        self.settings = settings
        self.enabled = True
        self.path = settings.path
        self._lock = threading.Lock()
        self._writes = 0
        self._connection: sqlite3.Connection | None = None
        self._open()

    def _open(self) -> None:
        if self.path != ":memory:":
            path = Path(self.path)
            if path.is_symlink():
                raise ValueError("Routing storage path must not be a symlink.")
            try:
                descriptor = os.open(
                    path,
                    os.O_CREAT | os.O_EXCL | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0),
                    0o600,
                )
            except FileExistsError:
                pass
            else:
                os.close(descriptor)
        connection = sqlite3.connect(
            self.path, check_same_thread=False, timeout=self.settings.busy_timeout_ms / 1000
        )
        connection.row_factory = sqlite3.Row
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=FULL")
            connection.executescript(SCHEMA)
            _migrate_decision_columns(connection)
            _migrate_requested_model(connection)
            connection.commit()
        except Exception:
            connection.close()
            raise
        self._connection = connection

    def register_config(self, payload: dict[str, Any], source: str) -> str:
        config_hash = build_config_hash(payload)
        with self._transaction() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO config_versions "
            "(config_hash, captured_at, source, catalog_json) VALUES (?, ?, ?, ?)",
            (config_hash, _now(), source, _json(payload)),
        )
        return config_hash

    def record_request(self, record: RequestRecord) -> None:
        capture = self.settings.capture_content
        messages_json = _json(record.messages) if capture else None
        tools_json = _json(record.tools) if capture else None
        response_format_json = _json(record.response_format) if capture else None
        with self._transaction() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO requests ("
            "request_id, received_at, session_id, strategy, requested_model, endpoint, "
            "client, user_agent, stream, max_tokens, has_tools, has_vision, wants_json, "
            "prompt_chars, prompt_tokens, conversation_tokens, turn_index, "
            "capture_content, prompt_digest, prompt, messages_json, tools_json, "
            "response_format_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                record.request_id,
                record.received_at,
                record.session_id,
                record.requested_strategy,
                record.requested_model,
                record.endpoint,
                record.client,
                record.user_agent,
                record.stream,
                record.max_tokens,
                record.has_tools,
                record.has_vision,
                record.wants_json,
                record.prompt_chars,
                record.prompt_tokens,
                record.conversation_tokens,
                record.turn_index,
                capture,
                _digest(record.prompt),
                record.prompt if capture else None,
                messages_json,
                tools_json,
                response_format_json,
            ),
        )

    def record_decision(self, record: DecisionRecord) -> None:
        candidates_json = _json(list(record.candidates))
        signals_json = _json(record.signals)
        with self._transaction() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO decisions ("
            "decision_id, request_id, session_id, strategy, config_hash, route, "
            "provider, upstream_model, tier, reason, mode, turn_index, switched_from, "
            "blocked_by, reasoning_effort, reasoning_effort_source, candidates_json, "
            "signals_json, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                record.decision_id,
                record.request_id,
                record.session_id,
                record.strategy,
                record.config_hash,
                record.route,
                record.provider,
                record.upstream_model,
                record.tier,
                record.reason,
                record.mode,
                record.turn_index,
                record.switched_from,
                record.blocked_by,
                record.reasoning_effort,
                record.reasoning_effort_source,
                candidates_json,
                signals_json,
                record.created_at,
            ),
        )

    def record_outcome(self, record: OutcomeRecord) -> None:
        with self._transaction() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO outcomes ("
            "decision_id, request_id, ok, finish_reason, prompt_tokens, completion_tokens, "
            "total_tokens, cost_usd, latency_ms, returned_model, error_type, "
            "error_message, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                record.decision_id,
                record.request_id,
                record.ok,
                record.finish_reason,
                record.prompt_tokens,
                record.completion_tokens,
                record.total_tokens,
                record.cost_usd,
                record.latency_ms,
                record.returned_model,
                record.error_type,
                record.error_message,
                _now(),
            ),
        )

    def record_assistant_continuation(
        self, record: AssistantContinuationRecord
    ) -> None:
        with self._transaction() as connection:
            connection.execute(
                "INSERT INTO assistant_continuations ("
                "session_id, message_key, provider_type, payload_json, created_at"
                ") VALUES (?, ?, ?, ?, ?)",
                (
                    record.session_id,
                    record.message_key,
                    record.provider_type,
                    _json(record.payload) or "{}",
                    record.created_at,
                ),
            )
            self._prune_continuations(connection, record.session_id)

    def load_assistant_continuations(
        self, session_id: str, *, limit: int
    ) -> list[AssistantContinuationRecord]:
        if limit < 1:
            return []
        connection = self._connection
        if connection is None:
            return []
        with self._lock:
            rows = connection.execute(
                "SELECT message_key, provider_type, payload_json, created_at "
                "FROM assistant_continuations WHERE session_id = ? "
                "ORDER BY continuation_id DESC LIMIT ?",
                (session_id, limit),
            ).fetchall()
        loaded: list[AssistantContinuationRecord] = []
        for row in reversed(rows):
            try:
                decoded = json.loads(row["payload_json"])
            except (TypeError, ValueError):
                decoded = {}
            payload = decoded if isinstance(decoded, dict) else {}
            loaded.append(
                AssistantContinuationRecord(
                    session_id=session_id,
                    message_key=row["message_key"],
                    provider_type=row["provider_type"],
                    payload=payload,
                    created_at=row["created_at"],
                )
            )
        return loaded

    def counts(self) -> dict[str, int]:
        connection = self._connection
        if connection is None:
            return {
                "requests": 0,
                "decisions": 0,
                "outcomes": 0,
                "config_versions": 0,
                "assistant_continuations": 0,
            }
        with self._lock:
            requests = connection.execute("SELECT COUNT(*) FROM requests").fetchone()
            decisions = connection.execute("SELECT COUNT(*) FROM decisions").fetchone()
            outcomes = connection.execute("SELECT COUNT(*) FROM outcomes").fetchone()
            versions = connection.execute("SELECT COUNT(*) FROM config_versions").fetchone()
            continuations = connection.execute(
                "SELECT COUNT(*) FROM assistant_continuations"
            ).fetchone()
        return {
            "requests": requests[0] if requests is not None else 0,
            "decisions": decisions[0] if decisions is not None else 0,
            "outcomes": outcomes[0] if outcomes is not None else 0,
            "config_versions": versions[0] if versions is not None else 0,
            "assistant_continuations": (
                continuations[0] if continuations is not None else 0
            ),
        }

    def close(self) -> None:
        with self._lock:
            connection = self._connection
            self._connection = None
            if connection is not None:
                connection.close()

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        connection = self._connection
        if connection is None:
            raise RuntimeError("Routing record store is closed.")
        with self._lock, connection:
            yield connection
            self._writes += 1
            if self._writes % PRUNE_INTERVAL == 0:
                self._prune(connection)

    def _prune_continuations(
        self, connection: sqlite3.Connection, session_id: str
    ) -> None:
        """Bound provider continuation state by turns per session and session count."""
        connection.execute(
            "DELETE FROM assistant_continuations WHERE session_id = ? "
            "AND continuation_id NOT IN ("
            "SELECT continuation_id FROM assistant_continuations "
            "WHERE session_id = ? ORDER BY continuation_id DESC LIMIT ?)",
            (
                session_id,
                session_id,
                self.settings.max_continuations_per_session,
            ),
        )
        connection.execute(
            "DELETE FROM assistant_continuations WHERE session_id IN ("
            "SELECT session_id FROM ("
            "SELECT session_id, MAX(continuation_id) AS latest "
            "FROM assistant_continuations GROUP BY session_id "
            "ORDER BY latest DESC LIMIT -1 OFFSET ?))",
            (self.settings.max_continuation_sessions,),
        )

    def _prune(self, connection: sqlite3.Connection) -> None:
        """Drop the oldest requests and the rows that hang off them."""
        limit = self.settings.max_requests
        if limit is None:
            return
        connection.execute(
            "DELETE FROM requests WHERE request_id IN ("
            "SELECT request_id FROM requests ORDER BY received_at DESC "
            "LIMIT -1 OFFSET ?)",
            (limit,),
        )
        connection.execute(
            "DELETE FROM decisions WHERE request_id IS NOT NULL "
            "AND request_id NOT IN (SELECT request_id FROM requests)"
        )
        connection.execute(
            "DELETE FROM outcomes WHERE request_id IS NOT NULL "
            "AND request_id NOT IN (SELECT request_id FROM requests)"
        )


class SqliteRecordStore:
    """Queue evidence for a single dedicated SQLite writer thread.

    Enqueueing is nonblocking. A full queue or failed worker rejects new work;
    a successful enqueue does not imply the record is durable until flush().
    """

    enabled = True

    def __init__(self, settings: StorageSettings) -> None:
        self.settings = settings
        self.path = settings.path
        self.continuation_limit = settings.max_continuations_per_session
        # Queue operations do not touch SQLite; the worker owns the connection.
        self._queue: queue.Queue[
            tuple[Callable[[_SqliteBackend], Any] | None, Future[Any] | None]
        ] = queue.Queue(maxsize=settings.queue_size)
        self._lock = threading.Lock()
        self._error: BaseException | None = None
        self._closed = False
        ready: Future[None] = Future()
        self._thread = threading.Thread(
            target=self._run, args=(ready,), name="jev-record-writer", daemon=True
        )
        self._thread.start()
        # Startup waits only for initialization; all request-time writes are queued.
        try:
            ready.result()
        except BaseException:
            self._thread.join()
            raise
        # Only the writer opens SQLite; the producer does no database I/O.
        atexit.register(self.close)

    def _run(self, ready: Future[None]) -> None:
        try:
            backend = _SqliteBackend(self.settings)
        except (OSError, RuntimeError, ValueError, sqlite3.Error) as error:
            with self._lock:
                self._error = error
            ready.set_exception(error)
            return
        ready.set_result(None)
        try:
            while True:
                operation, result = self._queue.get()
                try:
                    if operation is None:
                        if result is not None:
                            result.set_result(None)
                        break
                    if self._error is not None:
                        if result is not None:
                            result.set_exception(StorageUnavailableError(str(self._error)))
                        continue
                    try:
                        value = operation(backend)
                    except Exception as error:
                        with self._lock:
                            self._error = error
                        logger.exception("routing storage writer failed")
                        if result is not None:
                            result.set_exception(StorageUnavailableError(str(error)))
                    else:
                        if result is not None:
                            result.set_result(value)
                finally:
                    self._queue.task_done()
        finally:
            try:
                backend.close()
            except Exception as error:
                with self._lock:
                    self._error = error
                logger.exception("routing storage writer close failed")

    def _submit(
        self, operation: Callable[[_SqliteBackend], Any], *, wait: bool = False
    ) -> Any:
        result: Future[Any] | None = Future() if wait else None
        with self._lock:
            if self._closed or self._error is not None or not self._thread.is_alive():
                raise StorageUnavailableError(
                    f"Routing storage writer unavailable: {self._error or 'closed'}"
                )
            try:
                self._queue.put_nowait((operation, result))
            except queue.Full as error:
                raise StorageUnavailableError("Routing storage queue is full") from error
        return result.result() if result is not None else None

    def register_config(self, payload: dict[str, Any], source: str) -> str:
        snapshot = copy.deepcopy(payload)
        digest = build_config_hash(snapshot)
        self._submit(lambda backend: backend.register_config(snapshot, source))
        return digest

    def record_request(self, record: RequestRecord) -> None:
        snapshot = copy.deepcopy(record)
        self._submit(lambda backend: backend.record_request(snapshot))

    def record_decision(self, record: DecisionRecord) -> None:
        snapshot = copy.deepcopy(record)
        self._submit(lambda backend: backend.record_decision(snapshot))

    def record_outcome(self, record: OutcomeRecord) -> None:
        self._submit(lambda backend: backend.record_outcome(record))

    def record_assistant_continuation(
        self, record: AssistantContinuationRecord
    ) -> None:
        snapshot = copy.deepcopy(record)
        self._submit(lambda backend: backend.record_assistant_continuation(snapshot))

    def load_assistant_continuations(
        self, session_id: str, *, limit: int
    ) -> list[AssistantContinuationRecord]:
        return self._submit(
            lambda backend: backend.load_assistant_continuations(
                session_id, limit=limit
            ),
            wait=True,
        )

    def flush(self) -> None:
        self._submit(lambda backend: None, wait=True)

    def validate_reconfiguration(self, settings: StorageSettings) -> None:
        """Require restart for every storage setting change."""
        if settings != self.settings:
            raise ValueError("Changing storage settings requires a restart.")
        status = self.status()
        if status.get("error"):
            raise StorageUnavailableError(str(status["error"]))

    def reconfigure(self, settings: StorageSettings) -> None:
        """Confirm unchanged settings and synchronize queued writes."""
        self.validate_reconfiguration(settings)
        self.flush()

    def reopen(self, settings: StorageSettings) -> None:
        """Compatibility alias for runtime storage reconfiguration."""
        self.reconfigure(settings)

    def counts(self) -> dict[str, int]:
        return self._submit(lambda backend: backend.counts(), wait=True)

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "enabled": True,
                "pending": self._queue.qsize(),
                "error": str(self._error) if self._error is not None else None,
                "alive": self._thread.is_alive(),
            }

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
        # Drain everything accepted before close. Never discard an accepted job.
        done: Future[Any] = Future()
        self._queue.put((None, done))
        done.result()
        self._thread.join()
        if self._error is not None:
            raise StorageUnavailableError(str(self._error))


def _now() -> float:
    import time

    return time.time()


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]


def record_store_from_settings(settings: StorageSettings) -> RecordStore:
    """Build the enabled store, or the null store when storage is off."""
    if not settings.enabled:
        return NullRecordStore(settings)
    try:
        return SqliteRecordStore(settings)
    except (OSError, RuntimeError, ValueError, sqlite3.Error) as error:
        logger.error(
            "routing record store unavailable at startup",
            extra={"record_kind": "startup", "error_type": type(error).__name__},
        )
        return _UnavailableRecordStore(error, settings)
