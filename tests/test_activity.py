"""Process-local activity reports only requests that are still in flight."""

from __future__ import annotations

from typing import Any, cast

from jev_gateway.activity import MAX_REQUESTS, ActivityPath, ActivityRegistry


def test_requests_are_active_until_their_idempotent_finish() -> None:
    registry = ActivityRegistry()
    path = ActivityPath("balanced", "p/m", "p", "m")
    assert registry.begin_request("one", path)
    assert cast(list[dict[str, Any]], registry.snapshot()["paths"]) == [{
        "strategy": "balanced", "route": "p/m", "provider": "p", "upstream_model": "m",
        "in_flight_requests": 1, "in_flight_streams": 0,
    }]
    registry.finish_request("one")
    registry.finish_request("one")
    assert registry.snapshot()["paths"] == []


def test_overlapping_streams_keep_request_destinations_until_each_finishes() -> None:
    registry = ActivityRegistry()
    first = ActivityPath("balanced", "p/one", "p", "one")
    second = ActivityPath("balanced", "p/two", "p", "two")
    for token, path in (("one", first), ("two", second)):
        assert registry.begin_request(token, path)
        assert registry.mark_stream(token)
    registry.begin_request("nonstream", first)
    paths = cast(list[dict[str, Any]], registry.snapshot()["paths"])
    assert paths == [
        {"strategy": "balanced", "route": "p/one", "provider": "p", "upstream_model": "one", "in_flight_requests": 2, "in_flight_streams": 1},
        {"strategy": "balanced", "route": "p/two", "provider": "p", "upstream_model": "two", "in_flight_requests": 1, "in_flight_streams": 1},
    ]
    registry.finish_request("one")
    paths = cast(list[dict[str, Any]], registry.snapshot()["paths"])
    assert paths == [
        {"strategy": "balanced", "route": "p/one", "provider": "p", "upstream_model": "one", "in_flight_requests": 1, "in_flight_streams": 0},
        {"strategy": "balanced", "route": "p/two", "provider": "p", "upstream_model": "two", "in_flight_requests": 1, "in_flight_streams": 1},
    ]
    registry.finish_request("nonstream")
    registry.finish_request("two")
    assert registry.snapshot()["paths"] == []
    registry.clear()
    assert registry.snapshot()["paths"] == []


def test_duplicate_token_with_different_path_degrades_activity() -> None:
    registry = ActivityRegistry()
    first = ActivityPath("balanced", "p/one", "p", "one")
    second = ActivityPath("balanced", "p/two", "p", "two")
    assert registry.begin_request("same", first)
    assert not registry.begin_request("same", second)
    assert registry.snapshot()["complete"] is False
    assert registry.snapshot()["paths"] == []


def test_request_capacity_failure_suppresses_all_activity(monkeypatch) -> None:
    monkeypatch.setattr("jev_gateway.activity.MAX_REQUESTS", 1)
    registry = ActivityRegistry()
    first = ActivityPath("a", "p/one", "p", "one")
    second = ActivityPath("a", "p/two", "p", "two")
    assert registry.begin_request("one", first)
    assert not registry.begin_request("two", second)
    assert registry.snapshot()["complete"] is False
    assert registry.snapshot()["paths"] == []
    registry.finish_request("one")
    assert registry.snapshot()["complete"] is False
    assert MAX_REQUESTS > 1
