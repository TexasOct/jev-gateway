"""Tests for named routing strategies and durable request recording."""

from __future__ import annotations

import asyncio
import copy
import sqlite3
import sys
import types
from pathlib import Path
from typing import Any

import httpx
import pytest

from jev_gateway import gateway
from jev_gateway.catalog import catalog_from_document
from jev_gateway.decision import RoutingEngine
from jev_gateway.records import (
    DecisionRecord,
    OutcomeRecord,
    RecordStore,
    RequestRecord,
    record_store_from_settings,
)
from jev_gateway.sessions import MemorySessionStore
from tests.helpers import COMPLEX_PROMPT, SIMPLE_PROMPT, FakeClock, catalog_document
from tests.helpers import LARGE_MODEL_ID as LARGE_ID
from tests.helpers import SMALL_MODEL_ID as SMALL_ID


def request(app, method: str, path: str, **kwargs: Any) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def install_completion(monkeypatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    def completion(**kwargs):
        calls.append(kwargs)
        return {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "model": kwargs["model"].removeprefix("openai/"),
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": "ok"},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 2},
        }

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    return calls


def multi_strategy_document(**overrides: Any) -> dict[str, Any]:
    """Return the shared catalog document with one named extra strategy."""
    document = catalog_document(**overrides)
    document["strategies"] = {
        "default": "default",
        "definitions": {
            "always-strong": {
                "description": "Always route to the strongest model.",
                "policy": {
                    "mode": "fresh",
                    "selection": "quality_first",
                    "tier_models": {
                        "simple": [LARGE_ID],
                        "standard": [LARGE_ID],
                        "complex": [LARGE_ID],
                    },
                },
            }
        },
    }
    return document


def make_engine(
    document: dict[str, Any],
    *,
    record_store: RecordStore | None = None,
) -> RoutingEngine:
    catalog = catalog_from_document(document, "test catalog")
    clock = FakeClock()
    return RoutingEngine(
        catalog,
        MemorySessionStore(clock=clock),
        clock=clock,
        record_store=record_store,
        config_source="test catalog",
    )


def make_app(engine: RoutingEngine) -> Any:
    return gateway.create_app(
        gateway.GatewayConfig(
            engine=engine,
            gateway_api_key=None,
            session_strategy="derived",
            models_file=Path("models.json"),
        )
    )


def stored_document(tmp_path: Path) -> dict[str, Any]:
    document = multi_strategy_document()
    document["storage"] = {
        "enabled": True,
        "path": str(tmp_path / "records.sqlite3"),
        "capture_content": True,
    }
    return document


# Catalog parsing


def test_top_level_policy_registers_a_default_strategy() -> None:
    catalog = catalog_from_document(catalog_document(), "test catalog")

    assert [definition.name for definition in catalog.strategies] == ["default"]
    assert catalog.default_strategy == "default"


def test_named_strategies_parse_with_a_chosen_default() -> None:
    document = multi_strategy_document()
    document["strategies"]["default"] = "always-strong"

    catalog = catalog_from_document(document, "test catalog")

    assert catalog.default_strategy == "always-strong"
    assert [definition.name for definition in catalog.strategies] == [
        "default",
        "always-strong",
    ]
    assert catalog.policy.mode == "fresh"
    payload = catalog.as_dict()
    assert [entry["name"] for entry in payload["strategies"]] == [
        "default",
        "always-strong",
    ]


def test_top_level_policy_may_be_omitted_when_a_definition_is_default() -> None:
    document = multi_strategy_document()
    del document["policy"]
    document["strategies"]["default"] = "always-strong"

    catalog = catalog_from_document(document, "test catalog")

    assert catalog.default_strategy == "always-strong"
    assert catalog.policy.mode == "fresh"
    assert [definition.name for definition in catalog.strategies] == ["always-strong"]


def test_unknown_default_strategy_is_rejected() -> None:
    document = multi_strategy_document()
    document["strategies"]["default"] = "missing"

    with pytest.raises(ValueError, match="missing"):
        catalog_from_document(document, "test catalog")


def test_default_definition_may_not_shadow_the_top_level_policy() -> None:
    document = multi_strategy_document()
    document["strategies"]["definitions"]["default"] = copy.deepcopy(
        document["strategies"]["definitions"]["always-strong"]
    )

    with pytest.raises(ValueError, match="may not redefine 'default'"):
        catalog_from_document(document, "test catalog")


def test_storage_settings_parse_from_the_document(tmp_path: Path) -> None:
    path = tmp_path / "example.sqlite3"
    document = catalog_document()
    document["storage"] = {
        "enabled": True,
        "path": str(path),
        "capture_content": False,
        "max_requests": None,
    }

    storage = catalog_from_document(document, "test catalog").storage

    assert storage.enabled is True
    assert storage.path == str(path)
    assert storage.capture_content is False
    assert storage.max_requests is None


# Gateway endpoints


def test_strategy_listing_endpoint(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    payload = request(app, "GET", "/v1/routing/strategies").json()

    assert payload["object"] == "list"
    assert payload["default"] == "default"
    assert [entry["name"] for entry in payload["data"]] == [
        "default",
        "always-strong",
    ]
    assert payload["data"][1]["description"] == "Always route to the strongest model."


def test_query_strategy_overrides_header_strategy(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    response = request(
        app,
        "POST",
        "/v1/chat/completions?strategy=default",
        headers={"X-JEV-Strategy": "always-strong"},
        json={"messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 200
    assert response.headers["x-jev-strategy"] == "default"
    assert response.headers["x-jev-route"] == SMALL_ID


def test_explicit_strategy_pins_the_session(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))
    conversation = {"messages": [{"role": "user", "content": SIMPLE_PROMPT}]}

    first = request(
        app,
        "POST",
        "/v1/chat/completions?strategy=always-strong",
        json=conversation,
    )
    assert first.headers["x-jev-strategy"] == "always-strong"
    assert first.headers["x-jev-route"] == LARGE_ID

    second = request(app, "POST", "/v1/chat/completions", json=conversation)

    assert second.headers["x-jev-session-id"] == first.headers["x-jev-session-id"]
    assert second.headers["x-jev-strategy"] == "always-strong"
    assert second.headers["x-jev-route"] == LARGE_ID


def test_pinned_session_strategy_can_be_overridden(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))
    conversation = {"messages": [{"role": "user", "content": SIMPLE_PROMPT}]}

    request(app, "POST", "/v1/chat/completions?strategy=always-strong", json=conversation)
    overridden = request(
        app, "POST", "/v1/chat/completions?strategy=default", json=conversation
    )

    # The explicit name wins for this turn even though the session pinned the other
    # strategy; the sticky session state still keeps the already-selected model.
    assert overridden.headers["x-jev-strategy"] == "default"
    assert overridden.headers["x-jev-route"] == LARGE_ID


def test_unknown_explicit_strategy_is_rejected(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    response = request(
        app,
        "POST",
        "/v1/chat/completions?strategy=nope",
        json={"messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unknown_strategy"
    assert response.json()["error"]["param"] == "strategy"
    assert calls == []


def test_preview_routes_without_mutating_state(monkeypatch) -> None:
    install_completion(monkeypatch)
    engine = make_engine(multi_strategy_document())
    app = make_app(engine)

    response = request(
        app,
        "POST",
        "/v1/routing/preview?strategy=always-strong",
        json={"messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["default"] == "default"
    assert len(payload["preview"]) == 1
    chosen = payload["preview"][0]
    assert chosen["strategy"] == "always-strong"
    assert chosen["route"] == LARGE_ID
    assert chosen["mode"] == "auto"
    assert chosen["signals"]["tier"] == "simple"
    # Preview reads the session store but must not create or advance one.
    assert len(engine.store) == 0


def test_preview_compares_all_strategies_without_mutating_state(monkeypatch) -> None:
    install_completion(monkeypatch)
    engine = make_engine(multi_strategy_document())
    app = make_app(engine)

    response = request(
        app, "POST", "/v1/routing/preview",
        json={"messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["default"] == "default"
    assert {row["strategy"]: row["route"] for row in payload["preview"]} == {
        "default": SMALL_ID, "always-strong": LARGE_ID,
    }
    assert len(engine.store) == 0
    assert engine.decision("missing") is None


def test_preview_rejects_an_unknown_strategy(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    response = request(
        app,
        "POST",
        "/v1/routing/preview?strategy=nope",
        json={"messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unknown_strategy"


# Storage integration


def test_enabled_storage_records_request_decision_and_outcome(
    tmp_path: Path, monkeypatch
) -> None:
    install_completion(monkeypatch)
    document = stored_document(tmp_path)
    catalog = catalog_from_document(document, "test catalog")
    store = record_store_from_settings(catalog.storage)
    engine = make_engine(document, record_store=store)
    app = make_app(engine)

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": COMPLEX_PROMPT}]},
    )

    assert response.status_code == 200
    assert store.counts() == {
        "requests": 1,
        "decisions": 1,
        "outcomes": 1,
        "config_versions": 1,
    }
    with sqlite3.connect(catalog.storage.path) as db:
        request_row = db.execute(
            "SELECT strategy, requested_model, prompt FROM requests"
        ).fetchone()
        decision_row = db.execute(
            "SELECT strategy, route, request_id, config_hash FROM decisions"
        ).fetchone()
    assert request_row[0] == "default"
    assert request_row[1] == "auto"
    assert request_row[2] == COMPLEX_PROMPT
    assert decision_row[0] == "default"
    assert decision_row[1] == LARGE_ID
    assert decision_row[2] == response.headers["x-jev-request-id"]
    assert decision_row[3]
    store.close()


def test_unknown_model_request_is_still_recorded(tmp_path: Path, monkeypatch) -> None:
    install_completion(monkeypatch)
    document = stored_document(tmp_path)
    catalog = catalog_from_document(document, "test catalog")
    store = record_store_from_settings(catalog.storage)
    app = make_app(make_engine(document, record_store=store))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "missing/model", "messages": [{"role": "user", "content": "hi"}]},
    )

    assert response.status_code == 404
    assert store.counts()["requests"] == 1
    assert store.counts()["decisions"] == 0
    with sqlite3.connect(catalog.storage.path) as db:
        row = db.execute("SELECT requested_model FROM requests").fetchone()
    assert row[0] == "missing/model"
    store.close()


def test_unknown_strategy_request_is_recorded(tmp_path: Path, monkeypatch) -> None:
    install_completion(monkeypatch)
    document = stored_document(tmp_path)
    catalog = catalog_from_document(document, "test catalog")
    store = record_store_from_settings(catalog.storage)
    app = make_app(make_engine(document, record_store=store))

    response = request(
        app,
        "POST",
        "/v1/chat/completions?strategy=nope",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )

    assert response.status_code == 400
    assert store.counts()["requests"] == 1
    with sqlite3.connect(catalog.storage.path) as db:
        row = db.execute("SELECT strategy FROM requests").fetchone()
    assert row[0] == "nope"
    store.close()


class _FailingStore:
    """A store that succeeds at registration and fails on the chosen write."""

    enabled = True

    def __init__(self, fail_on: str) -> None:
        self.fail_on = fail_on
        self.requests = 0

    def register_config(self, payload: dict[str, Any], source: str) -> str:
        return "config-hash"

    def record_request(self, record: RequestRecord) -> None:
        if self.fail_on == "request":
            raise RuntimeError("request write failed")
        self.requests += 1

    def record_decision(self, record: DecisionRecord) -> None:
        if self.fail_on == "decision":
            raise RuntimeError("decision write failed")

    def record_outcome(self, record: OutcomeRecord) -> None:
        if self.fail_on == "outcome":
            raise RuntimeError("outcome write failed")

    def flush(self) -> None:
        return None

    def status(self) -> dict[str, Any]:
        return {"enabled": True, "pending": 0, "error": None}

    def counts(self) -> dict[str, int]:
        return {}

    def close(self) -> None:
        return None


def test_request_write_failure_returns_503_before_upstream(
    monkeypatch,
) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(make_engine(catalog_document(), record_store=_FailingStore("request")))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "storage_unavailable"
    assert calls == []


def test_decision_write_failure_returns_503_before_upstream(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(
        make_engine(catalog_document(), record_store=_FailingStore("decision"))
    )

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "storage_unavailable"
    assert calls == []


def test_outcome_write_failure_is_reported(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(
        make_engine(catalog_document(), record_store=_FailingStore("outcome"))
    )

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "storage_unavailable"
