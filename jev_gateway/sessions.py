"""Conversation session identity and bounded state storage."""

from __future__ import annotations

import copy
import hashlib
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from jev_gateway.request_facts import content_text

__all__ = [
    "EVENT_LIMIT",
    "SESSION_HEADER",
    "SESSION_STRATEGIES",
    "MemorySessionStore",
    "SessionState",
    "derive_session_id",
]

SESSION_HEADER = "X-JEV-Session-Id"
SESSION_STRATEGIES = ("derived", "header", "user", "off")
EVENT_LIMIT = 40


@dataclass
class SessionState:
    """Mutable routing state for one conversation."""

    session_id: str
    route: str
    tier: str
    created_at: float
    updated_at: float
    switched_at: float
    first_request_at: float | None = None
    strategy: str | None = None
    turn_count: int = 0
    switch_count: int = 0
    switched_at_turn: int = 0
    consecutive_failures: int = 0
    consecutive_truncations: int = 0
    cost_usd: float = 0.0
    events: list[dict[str, Any]] = field(default_factory=list)
    # Provider adapters may retain bounded, opaque continuation metadata for the
    # life of this session. It is deliberately excluded from inspection output.
    adapter_state: dict[str, Any] = field(default_factory=dict, repr=False)
    # None keeps legacy sessions distinguishable until their next decision.
    defaulted: bool | None = None

    def record_event(self, event: dict[str, Any], *, limit: int = EVENT_LIMIT) -> None:
        """Append a decision or switch event, keeping only the newest entries."""
        self.events.append(event)
        if len(self.events) > limit:
            del self.events[:-limit]

    def snapshot(self) -> dict[str, Any]:
        """Serialize the session for the inspection endpoint."""
        return {
            "session_id": self.session_id,
            "route": self.route,
            "label": self.tier,
            "tier": self.tier,
            **({"defaulted": self.defaulted} if self.defaulted is not None else {}),
            "strategy": self.strategy,
            "turn_count": self.turn_count,
            "switch_count": self.switch_count,
            "switched_at_turn": self.switched_at_turn,
            "consecutive_failures": self.consecutive_failures,
            "consecutive_truncations": self.consecutive_truncations,
            "cost_usd": round(self.cost_usd, 6),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "first_request_at": self.first_request_at,
            "switched_at": self.switched_at,
            "events": [dict(event) for event in self.events],
        }


class MemorySessionStore:
    """Bounded, TTL-based session storage for a single gateway process."""

    def __init__(
        self,
        *,
        ttl_seconds: float = 1800.0,
        max_sessions: int = 2048,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_sessions = max_sessions
        self._clock = clock
        self._sessions: dict[str, SessionState] = {}
        self._pending_intake: dict[str, tuple[float, float]] = {}
        self._intake_sequence = 0
        self._pending_clock: dict[str, float] = {}
        self._lock = threading.RLock()

    def record_intake(self, session_id: str | None, received_at: float) -> None:
        """Record a bounded pre-routing timestamp for a session candidate."""
        if session_id is None:
            return
        with self._lock:
            self._prune_pending_locked()
            session = self._get_locked(session_id)
            if session is not None:
                if session.first_request_at is None or received_at < session.first_request_at:
                    session.first_request_at = received_at
                return
            pending = self._pending_intake.get(session_id)
            if pending is not None:
                self._pending_intake[session_id] = (min(pending[0], received_at), pending[1])
                self._pending_clock[session_id] = self._clock()
                return
            self._intake_sequence += 1
            self._pending_intake[session_id] = (received_at, self._intake_sequence)
            self._pending_clock[session_id] = self._clock()
            while len(self._pending_intake) > self.max_sessions:
                oldest = min(self._pending_intake, key=lambda key: self._pending_intake[key][1])
                del self._pending_intake[oldest]
                self._pending_clock.pop(oldest, None)

    def _prune_pending_locked(self) -> None:
        now = self._clock()
        for session_id, last_seen in tuple(self._pending_clock.items()):
            if now - last_seen > self.ttl_seconds:
                self._pending_clock.pop(session_id, None)
                self._pending_intake.pop(session_id, None)

    def _get_locked(self, session_id: str) -> SessionState | None:
        session = self._sessions.get(session_id)
        if session is None:
            return None
        if self._expired(session):
            self._sessions.pop(session_id, None)
            return None
        return session

    def get(self, session_id: str) -> SessionState | None:
        """Return the canonical live session, dropping it after its TTL."""
        with self._lock:
            return self._get_locked(session_id)

    def copy(self, session_id: str) -> SessionState | None:
        """Return a detached routing snapshot without provider continuation state."""
        with self._lock:
            session = self._get_locked(session_id)
            if session is None:
                return None
            snapshot = copy.copy(session)
            snapshot.events = [dict(event) for event in session.events]
            snapshot.adapter_state = {}
            return snapshot

    def mutate(
        self,
        session_id: str,
        update: Callable[[SessionState], None],
        *,
        factory: Callable[[], SessionState] | None = None,
    ) -> SessionState | None:
        """Atomically update the canonical state, optionally creating it once."""
        with self._lock:
            session = self._get_locked(session_id)
            if session is None:
                if factory is None:
                    return None
                session = factory()
                self._prune_pending_locked()
                pending = self._pending_intake.pop(session_id, None)
                self._pending_clock.pop(session_id, None)
                if pending is not None:
                    session.first_request_at = pending[0]
                self._sessions[session_id] = session
            update(session)
            if len(self._sessions) > self.max_sessions:
                self._evict()
            return session

    def put(self, session: SessionState) -> None:
        """Store a session and evict the least recently updated ones."""
        with self._lock:
            pending = self._pending_intake.pop(session.session_id, None)
            self._pending_clock.pop(session.session_id, None)
            if pending is not None:
                session.first_request_at = pending[0]
            self._sessions[session.session_id] = session
            if len(self._sessions) > self.max_sessions:
                self._evict()

    def snapshot(self, session_id: str) -> dict[str, Any] | None:
        """Return a serializable view of one session."""
        with self._lock:
            session = self._get_locked(session_id)
            return session.snapshot() if session is not None else None

    def snapshots(self) -> list[dict[str, Any]]:
        """Return detached serializable views of every non-expired session."""
        with self._lock:
            expired = [
                session_id
                for session_id, session in self._sessions.items()
                if self._expired(session)
            ]
            for session_id in expired:
                self._sessions.pop(session_id, None)
            return [session.snapshot() for session in self._sessions.values()]

    def prune(self) -> int:
        """Drop expired sessions and report how many were removed."""
        with self._lock:
            expired = [
                session_id
                for session_id, session in self._sessions.items()
                if self._expired(session)
            ]
            for session_id in expired:
                self._sessions.pop(session_id, None)
            return len(expired)

    def clear(self) -> None:
        """Drop every stored session."""
        with self._lock:
            self._sessions.clear()
            self._pending_intake.clear()
            self._pending_clock.clear()

    def configure(self, *, ttl_seconds: float, max_sessions: int) -> None:
        """Apply catalog limits while preserving still-valid sessions."""
        with self._lock:
            self.ttl_seconds = ttl_seconds
            self.max_sessions = max_sessions
            self._prune_pending_locked()
            while len(self._pending_intake) > self.max_sessions:
                oldest = min(self._pending_intake, key=lambda key: self._pending_intake[key][1])
                self._pending_intake.pop(oldest, None)
                self._pending_clock.pop(oldest, None)
            expired = [
                session_id
                for session_id, session in self._sessions.items()
                if self._expired(session)
            ]
            for session_id in expired:
                self._sessions.pop(session_id, None)
            if len(self._sessions) > self.max_sessions:
                self._evict()

    def __len__(self) -> int:
        with self._lock:
            return len(self._sessions)

    def _expired(self, session: SessionState) -> bool:
        return self._clock() - session.updated_at > self.ttl_seconds

    def _evict(self) -> None:
        overflow = len(self._sessions) - self.max_sessions
        oldest = sorted(self._sessions.values(), key=lambda item: item.updated_at)
        for session in oldest[:overflow]:
            del self._sessions[session.session_id]


def derive_session_id(
    messages: list[dict[str, Any]],
    *,
    header_value: str | None = None,
    user: str | None = None,
    strategy: str = "derived",
) -> str | None:
    """Resolve the conversation key from the header, the user, or the first turn."""
    if strategy not in SESSION_STRATEGIES:
        raise ValueError(
            f"Unknown session strategy {strategy!r}. "
            f"Use one of: {', '.join(SESSION_STRATEGIES)}."
        )
    if strategy == "off":
        return None

    clean_header = header_value.strip() if isinstance(header_value, str) else ""
    if clean_header:
        return clean_header
    if strategy == "header":
        return None

    clean_user = user.strip() if isinstance(user, str) and user.strip() else None
    if strategy == "user":
        return clean_user

    first_user = next(
        (
            text
            for message in messages
            if message.get("role") == "user"
            for text in [content_text(message.get("content")).strip()]
            if text
        ),
        None,
    )
    if first_user is None and clean_user is None:
        return None
    digest = hashlib.sha256(
        f"{clean_user or ''}|{first_user or ''}".encode()
    ).hexdigest()
    return f"d-{digest[:32]}"
