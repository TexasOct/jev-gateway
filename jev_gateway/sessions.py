"""Conversation session identity and bounded state storage."""

from __future__ import annotations

import hashlib
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from jev_gateway.signals import content_text

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
    strategy: str | None = None
    turn_count: int = 0
    switch_count: int = 0
    switched_at_turn: int = 0
    consecutive_failures: int = 0
    consecutive_truncations: int = 0
    cost_usd: float = 0.0
    recent_scores: list[float] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    # Provider adapters may retain bounded, opaque continuation metadata for the
    # life of this session. It is deliberately excluded from inspection output.
    adapter_state: dict[str, Any] = field(default_factory=dict, repr=False)

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
            "strategy": self.strategy,
            "turn_count": self.turn_count,
            "switch_count": self.switch_count,
            "switched_at_turn": self.switched_at_turn,
            "consecutive_failures": self.consecutive_failures,
            "consecutive_truncations": self.consecutive_truncations,
            "cost_usd": round(self.cost_usd, 6),
            "recent_scores": [round(score, 4) for score in self.recent_scores],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
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

    def get(self, session_id: str) -> SessionState | None:
        """Return a live session, dropping it when its TTL has passed."""
        session = self._sessions.get(session_id)
        if session is None:
            return None
        if self._expired(session):
            del self._sessions[session_id]
            return None
        return session

    def put(self, session: SessionState) -> None:
        """Store a session and evict the least recently updated ones."""
        self._sessions[session.session_id] = session
        if len(self._sessions) > self.max_sessions:
            self._evict()

    def snapshot(self, session_id: str) -> dict[str, Any] | None:
        """Return a serializable view of one session."""
        session = self.get(session_id)
        return session.snapshot() if session is not None else None

    def prune(self) -> int:
        """Drop expired sessions and report how many were removed."""
        expired = [
            session_id
            for session_id, session in self._sessions.items()
            if self._expired(session)
        ]
        for session_id in expired:
            del self._sessions[session_id]
        return len(expired)

    def clear(self) -> None:
        """Drop every stored session."""
        self._sessions.clear()

    def configure(self, *, ttl_seconds: float, max_sessions: int) -> None:
        """Apply catalog limits while preserving still-valid sessions."""
        self.ttl_seconds = ttl_seconds
        self.max_sessions = max_sessions
        self.prune()
        if len(self._sessions) > self.max_sessions:
            self._evict()

    def __len__(self) -> int:
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
