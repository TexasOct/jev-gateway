"""Tests for session identity derivation and the bounded session store."""

from __future__ import annotations

from jev_gateway.sessions import (
    MemorySessionStore,
    SessionState,
    derive_session_id,
)
from tests.helpers import FakeClock

CONVERSATION = [
    {"role": "user", "content": "写一个函数"},
    {"role": "assistant", "content": "ok"},
    {"role": "user", "content": "再改一下"},
]


def make_state(session_id: str, now: float) -> SessionState:
    """Build a minimal session state for store tests."""
    return SessionState(
        session_id=session_id,
        route="small",
        tier="simple",
        created_at=now,
        updated_at=now,
        switched_at=now,
    )


def test_header_wins_for_every_enabled_strategy() -> None:
    for strategy in ("derived", "header", "user"):
        assert (
            derive_session_id(CONVERSATION, header_value="  chat-1 ", strategy=strategy)
            == "chat-1"
        )


def test_header_strategy_ignores_other_sources() -> None:
    assert derive_session_id(CONVERSATION, user="alice", strategy="header") is None


def test_user_strategy_uses_the_user_field() -> None:
    assert derive_session_id(CONVERSATION, user=" alice ", strategy="user") == "alice"
    assert derive_session_id(CONVERSATION, strategy="user") is None


def test_off_strategy_never_returns_a_session() -> None:
    assert (
        derive_session_id(CONVERSATION, header_value="chat-1", strategy="off") is None
    )


def test_unknown_strategy_is_rejected() -> None:
    try:
        derive_session_id(CONVERSATION, strategy="magic")
    except ValueError as error:
        assert "magic" in str(error)
    else:
        raise AssertionError("an unknown session strategy must fail")


def test_derived_session_is_stable_when_history_is_resent() -> None:
    first = derive_session_id(CONVERSATION, strategy="derived")
    resent = derive_session_id(
        [*CONVERSATION, {"role": "assistant", "content": "done"}], strategy="derived"
    )

    assert first is not None
    assert first.startswith("d-")
    assert resent == first
    assert derive_session_id(CONVERSATION, user="alice", strategy="derived") != first
    assert derive_session_id([{"role": "system", "content": "rules"}]) is None


def test_store_expires_sessions_after_the_ttl() -> None:
    clock = FakeClock()
    store = MemorySessionStore(ttl_seconds=10, clock=clock)
    store.put(make_state("s1", clock()))

    assert store.get("s1") is not None
    clock.advance(11)
    assert store.get("s1") is None
    assert len(store) == 0


def test_store_evicts_the_least_recently_updated_session() -> None:
    clock = FakeClock()
    store = MemorySessionStore(max_sessions=2, clock=clock)
    for index in range(3):
        store.put(make_state(f"s{index}", clock()))
        clock.advance(1)

    assert len(store) == 2
    assert store.get("s0") is None
    assert store.get("s2") is not None


def test_snapshot_reports_counters_and_events() -> None:
    clock = FakeClock()
    store = MemorySessionStore(clock=clock)
    state = make_state("s1", clock())
    state.consecutive_failures = 1
    state.cost_usd = 0.125
    state.recent_scores = [0.5]
    state.record_event({"type": "switch"})
    store.put(state)

    snapshot = store.snapshot("s1")

    assert snapshot is not None
    assert snapshot["route"] == "small"
    assert snapshot["consecutive_failures"] == 1
    assert snapshot["cost_usd"] == 0.125
    assert snapshot["recent_scores"] == [0.5]
    assert snapshot["events"] == [{"type": "switch"}]
    assert store.snapshot("missing") is None


def test_event_log_is_bounded() -> None:
    clock = FakeClock()
    state = make_state("s1", clock())
    for index in range(50):
        state.record_event({"type": "decision", "index": index}, limit=10)

    assert len(state.events) == 10
    assert state.events[0]["index"] == 40


def test_prune_drops_only_expired_sessions() -> None:
    clock = FakeClock()
    store = MemorySessionStore(ttl_seconds=10, clock=clock)
    store.put(make_state("old", clock()))
    clock.advance(11)
    store.put(make_state("fresh", clock()))

    assert store.prune() == 1
    assert len(store) == 1
    assert store.get("fresh") is not None


def test_clear_removes_every_session() -> None:
    clock = FakeClock()
    store = MemorySessionStore(clock=clock)
    store.put(make_state("s1", clock()))
    store.put(make_state("s2", clock()))

    store.clear()

    assert len(store) == 0
