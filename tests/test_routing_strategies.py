"""Tests for named routing strategies and durable request recording."""

from __future__ import annotations

import asyncio
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
    AssistantContinuationRecord,
    DecisionRecord,
    OutcomeRecord,
    RecordStore,
    RequestRecord,
    StorageSettings,
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
    """Return the shared catalog with multiple model-selectable strategies."""
    document = catalog_document(**overrides)
    document["strategies"] = {
        "task_aware": {},
        "always-strong": {
            "description": "Always route to the strongest model.",
            "mode": "fresh",
            "selection": "quality_first",
            "tier_models": {
                "simple": [LARGE_ID],
                "standard": [LARGE_ID],
                "complex": [LARGE_ID],
            },
        },
        "always-small": {
            "mode": "fresh",
            "selection": "cheapest_adequate",
            "tier_models": {
                "simple": [SMALL_ID],
                "standard": [SMALL_ID],
                "complex": [SMALL_ID],
            },
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


def test_task_aware_is_the_required_default_strategy() -> None:
    catalog = catalog_from_document(catalog_document(), "test catalog")

    assert [definition.name for definition in catalog.strategies] == ["task_aware"]
    assert catalog.default_strategy == "task_aware"


def test_compact_named_strategies_keep_task_aware_as_default() -> None:
    catalog = catalog_from_document(multi_strategy_document(), "test catalog")

    assert catalog.default_strategy == "task_aware"
    assert [definition.name for definition in catalog.strategies] == [
        "task_aware",
        "always-strong",
        "always-small",
    ]


def test_storage_settings_parse_from_the_document(tmp_path: Path) -> None:
    path = tmp_path / "example.sqlite3"
    document = catalog_document()
    document["storage"] = {
        "enabled": True,
        "path": str(path),
        "capture_content": False,
        "max_requests": None,
        "max_continuations_per_session": 12,
        "max_continuation_sessions": 34,
    }

    storage = catalog_from_document(document, "test catalog").storage

    assert storage.enabled is True
    assert storage.path == str(path)
    assert storage.capture_content is False
    assert storage.max_requests is None
    assert storage.max_continuations_per_session == 12
    assert storage.max_continuation_sessions == 34


# Gateway endpoints


def test_model_name_selects_a_named_strategy(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "always-strong",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )

    assert response.status_code == 200
    assert response.headers["x-jev-strategy"] == "always-strong"
    assert response.headers["x-jev-route"] == LARGE_ID
    assert response.json()["model"] == "always-strong"
    assert calls[0]["model"] == "openai/vendor/large-model"


def test_model_list_includes_named_strategies(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    model_ids = [entry["id"] for entry in request(app, "GET", "/v1/models").json()["data"]]

    assert model_ids == [
        "task_aware",
        "always-strong",
        "always-small",
        SMALL_ID,
        LARGE_ID,
    ]


def test_strategy_listing_endpoint(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    payload = request(app, "GET", "/v1/routing/strategies").json()

    assert payload["object"] == "list"
    assert payload["default"] == "task_aware"
    assert [entry["name"] for entry in payload["data"]] == [
        "task_aware",
        "always-strong",
        "always-small",
    ]
    assert payload["data"][1]["description"] == "Always route to the strongest model."


def test_query_strategy_is_rejected(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    for path in (
        "/v1/chat/completions?strategy=always-strong",
        "/v1/routing/preview?strategy=always-strong",
    ):
        response = request(
            app,
            "POST",
            path,
            json={
                "model": "task_aware",
                "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
            },
        )

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "unsupported_parameter"
        assert response.json()["error"]["param"] == "strategy"
    assert calls == []


@pytest.mark.parametrize("retired_name", ["auto", "jev-auto"])
def test_retired_automatic_model_names_are_not_routable(
    monkeypatch, retired_name: str
) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": retired_name,
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "model_not_found"
    assert response.json()["error"]["param"] == "model"
    assert calls == []


def test_strategy_header_does_not_select_a_strategy(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Strategy": "always-strong"},
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )

    assert response.status_code == 200
    assert response.headers["x-jev-strategy"] == "task_aware"
    assert response.headers["x-jev-route"] == SMALL_ID


def test_explicit_strategy_pins_the_session(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))
    conversation = {
        "model": "always-strong",
        "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
    }

    first = request(app, "POST", "/v1/chat/completions", json=conversation)
    assert first.headers["x-jev-strategy"] == "always-strong"
    assert first.headers["x-jev-route"] == LARGE_ID

    second = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "always-strong",
            "messages": conversation["messages"],
        },
    )

    assert second.headers["x-jev-session-id"] == first.headers["x-jev-session-id"]
    assert second.headers["x-jev-strategy"] == "always-strong"
    assert second.headers["x-jev-route"] == LARGE_ID


def test_pinned_session_strategy_can_be_overridden(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))
    messages = [{"role": "user", "content": SIMPLE_PROMPT}]

    request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "always-strong", "messages": messages},
    )
    overridden = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": messages},
    )

    # The model field wins for this turn even though the session pinned the other
    # strategy; the sticky session state still keeps the already-selected model.
    assert overridden.headers["x-jev-strategy"] == "task_aware"
    assert overridden.headers["x-jev-route"] == LARGE_ID


def test_unknown_model_name_is_rejected(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "nope",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "model_not_found"
    assert response.json()["error"]["param"] == "model"
    assert calls == []


def test_preview_routes_without_mutating_state(monkeypatch) -> None:
    install_completion(monkeypatch)
    engine = make_engine(multi_strategy_document())
    app = make_app(engine)

    response = request(
        app,
        "POST",
        "/v1/routing/preview",
        json={
            "model": "always-strong",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["default"] == "task_aware"
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
        json={
            "model": "task_aware",
            "strategy": ["task_aware", "always-strong", "always-small"],
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["default"] == "task_aware"
    assert {row["strategy"]: row["route"] for row in payload["preview"]} == {
        "task_aware": SMALL_ID,
        "always-strong": LARGE_ID,
        "always-small": SMALL_ID,
    }
    assert len(engine.store) == 0
    assert engine.decision("missing") is None


def test_preview_rejects_an_unknown_strategy(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = make_app(make_engine(multi_strategy_document()))

    response = request(
        app,
        "POST",
        "/v1/routing/preview",
        json={
            "model": "task_aware",
            "strategy": ["nope"],
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
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
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": COMPLEX_PROMPT}],
        },
    )

    assert response.status_code == 200
    assert store.counts() == {
        "requests": 1,
        "decisions": 1,
        "outcomes": 1,
        "upstream_requests": 1,
        "config_versions": 1,
        "assistant_continuations": 1,
    }
    with sqlite3.connect(catalog.storage.path) as db:
        request_row = db.execute(
            "SELECT strategy, requested_model, prompt FROM requests"
        ).fetchone()
        decision_row = db.execute(
            "SELECT strategy, route, request_id, config_hash FROM decisions"
        ).fetchone()
    assert request_row[0] == "task_aware"
    assert request_row[1] is None
    assert request_row[2] == COMPLEX_PROMPT
    assert decision_row[0] == "task_aware"
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


def test_unknown_model_request_records_the_default_strategy(
    tmp_path: Path, monkeypatch
) -> None:
    install_completion(monkeypatch)
    document = stored_document(tmp_path)
    catalog = catalog_from_document(document, "test catalog")
    store = record_store_from_settings(catalog.storage)
    app = make_app(make_engine(document, record_store=store))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "nope", "messages": [{"role": "user", "content": "hi"}]},
    )

    assert response.status_code == 404
    assert store.counts()["requests"] == 1
    with sqlite3.connect(catalog.storage.path) as db:
        row = db.execute("SELECT strategy FROM requests").fetchone()
    assert row[0] == "task_aware"
    store.close()


class _FailingStore:
    """A store that succeeds at registration and fails on the chosen write."""

    enabled = True
    continuation_limit = 40
    settings = StorageSettings(enabled=True)

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

    def record_upstream_request(self, record: Any) -> None:
        if self.fail_on == "upstream_request":
            raise RuntimeError("upstream request write failed")

    def latest_session_evidence(
        self, session_ids: tuple[str, ...]
    ) -> dict[str, dict[str, Any]]:
        return {}

    def session_request_evidence(
        self, session_id: str
    ) -> list[dict[str, Any]]:
        return []

    def provider_summary(
        self, *, window_start: float, window_end: float
    ) -> dict[str, dict[str, Any]]:
        return {}

    def record_assistant_continuation(
        self, record: AssistantContinuationRecord
    ) -> None:
        if self.fail_on == "continuation":
            raise RuntimeError("continuation write failed")

    def load_assistant_continuations(
        self, session_id: str, *, limit: int
    ) -> list[AssistantContinuationRecord]:
        return []

    def validate_reconfiguration(self, settings: StorageSettings) -> None:
        return None

    def reconfigure(self, settings: StorageSettings) -> None:
        return None

    def flush(self) -> None:
        return None

    def status(self) -> dict[str, Any]:
        return {"enabled": True, "pending": 0, "error": None}

    def counts(self) -> dict[str, int]:
        return {}

    def close(self) -> None:
        return None


def test_request_write_failure_does_not_block_upstream(monkeypatch, caplog) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(make_engine(catalog_document(), record_store=_FailingStore("request")))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 200
    assert len(calls) == 1
    assert any(
        getattr(record, "record_kind", None) == "request"
        for record in caplog.records
    )


def test_decision_write_failure_does_not_block_upstream(monkeypatch, caplog) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(
        make_engine(catalog_document(), record_store=_FailingStore("decision"))
    )

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 200
    assert len(calls) == 1
    assert any(
        getattr(record, "record_kind", None) == "decision"
        for record in caplog.records
    )


def test_upstream_request_write_failure_does_not_block_upstream(
    monkeypatch, caplog
) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(
        make_engine(catalog_document(), record_store=_FailingStore("upstream_request"))
    )

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )

    assert response.status_code == 200
    assert len(calls) == 1
    assert any(
        getattr(record, "record_kind", None) == "upstream_request"
        for record in caplog.records
    )


def test_outcome_write_failure_does_not_block_response(monkeypatch, caplog) -> None:
    install_completion(monkeypatch)
    app = make_app(
        make_engine(catalog_document(), record_store=_FailingStore("outcome"))
    )

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 200
    assert any(
        getattr(record, "record_kind", None) == "outcome"
        for record in caplog.records
    )


def test_invalid_request_record_failure_preserves_validation_error(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = make_app(make_engine(catalog_document(), record_store=_FailingStore("request")))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["param"] == "messages"
    assert calls == []


def test_storage_startup_failure_does_not_block_gateway(
    tmp_path: Path, monkeypatch
) -> None:
    calls = install_completion(monkeypatch)
    store = record_store_from_settings(
        StorageSettings(
            enabled=True,
            path=str(tmp_path / "missing" / "records.sqlite3"),
        )
    )
    app = make_app(make_engine(catalog_document(), record_store=store))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 200
    assert len(calls) == 1
    assert request(app, "GET", "/healthz").json()["status"] == "degraded"
