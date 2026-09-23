"""Tests for the OpenAI-compatible gateway."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
import types
import warnings
from pathlib import Path
from typing import Any

import httpx
import pytest
from pydantic import BaseModel

from jev_gateway import gateway
from jev_gateway.catalog import catalog_from_document
from jev_gateway.decision import RoutingEngine
from jev_gateway.records import (
    SqliteRecordStore,
    StorageSettings,
    record_store_from_settings,
)
from jev_gateway.sessions import MemorySessionStore, SessionState
from tests.helpers import (
    COMPLEX_PROMPT,
    SIMPLE_PROMPT,
    FakeClock,
    catalog_document,
    single_route_document,
)
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


def make_config(
    gateway_api_key: str | None = None,
    echo_requested_model: bool = True,
    models_file: Path = Path("models.json"),
    **policy_overrides: Any,
) -> gateway.GatewayConfig:
    catalog = catalog_from_document(
        catalog_document(**policy_overrides), "test catalog"
    )
    clock = FakeClock()
    return gateway.GatewayConfig(
        engine=RoutingEngine(catalog, MemorySessionStore(clock=clock), clock=clock),
        gateway_api_key=gateway_api_key,
        session_strategy="derived",
        echo_requested_model=echo_requested_model,
        models_file=models_file,
    )


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


def make_stored_config(
    tmp_path: Path,
    *,
    capture_content: bool = True,
    gateway_api_key: str | None = None,
    document: dict[str, Any] | None = None,
) -> gateway.GatewayConfig:
    document = document or catalog_document()
    document["storage"] = {
        "enabled": True,
        "path": str(tmp_path / "records.sqlite3"),
        "capture_content": capture_content,
    }
    catalog = catalog_from_document(document, "test catalog")
    clock = FakeClock()
    return gateway.GatewayConfig(
        engine=RoutingEngine(
            catalog,
            MemorySessionStore(clock=clock),
            clock=clock,
            record_store=record_store_from_settings(catalog.storage),
        ),
        gateway_api_key=gateway_api_key,
        session_strategy="derived",
    )


def test_response_data_silences_litellm_usage_serializer_mismatch() -> None:
    class ResponseAPIUsage(BaseModel):
        completion_tokens: int
        prompt_tokens: int
        total_tokens: int

    class LiteLLMResponse(BaseModel):
        model: str
        usage: ResponseAPIUsage

    # LiteLLM can construct this response shape with a plain dict in `usage`.
    response = LiteLLMResponse.model_construct(
        model="provider/model",
        usage={"completion_tokens": 82, "prompt_tokens": 18, "total_tokens": 100},
    )
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        payload = gateway.response_data(response)

    assert not caught
    assert payload == {
        "model": "provider/model",
        "usage": {
            "completion_tokens": 82,
            "prompt_tokens": 18,
            "total_tokens": 100,
        },
    }


def test_runtime_directory_loads_config_env_and_storage_from_home(
    monkeypatch, tmp_path: Path
) -> None:
    runtime = tmp_path / ".jev-gateway"
    runtime.mkdir()
    document = catalog_document()
    document["providers"][0]["api_key_env"] = "RUNTIME_SMALL_KEY"
    document["providers"][1]["api_key_env"] = "RUNTIME_LARGE_KEY"
    document["storage"] = {
        "enabled": True,
        "path": "jev-records.sqlite3",
        "capture_content": False,
    }
    (runtime / "models.json").write_text(json.dumps(document), encoding="utf-8")
    (runtime / ".env").write_text(
        "RUNTIME_SMALL_KEY=small\nRUNTIME_LARGE_KEY=large\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("JEV_GATEWAY_HOME", str(runtime))
    monkeypatch.delenv("RUNTIME_SMALL_KEY", raising=False)
    monkeypatch.delenv("RUNTIME_LARGE_KEY", raising=False)

    config = gateway.load_gateway_config()

    assert gateway.runtime_directory() == runtime
    assert config.models_file == runtime / "models.json"
    assert config.engine.catalog.storage.path == str(runtime / "jev-records.sqlite3")
    assert [profile.api_key for profile in config.engine.catalog.profiles] == [
        "small",
        "large",
    ]
    config.engine.close()


def test_first_turn_routes_and_reports_the_decision(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
            "max_tokens": 64,
            "temperature": 0.2,
        },
    )

    assert response.status_code == 200
    assert response.headers["x-jev-route"] == SMALL_ID
    assert response.headers["x-jev-task-type"] == "simple"
    assert response.headers["x-jev-reason"] == "first_turn_simple"
    assert response.headers["x-jev-mode"] == "auto"
    assert response.headers["x-jev-session-id"].startswith("d-")
    assert response.headers["x-jev-decision-id"].startswith("dec-")
    assert response.json()["choices"][0]["message"]["content"] == "ok"
    assert calls[0]["model"] == "openai/vendor/small-model"
    assert calls[0]["api_base"] == "https://small.example/v1"
    assert calls[0]["api_key"] == "test-key-small"
    assert calls[0]["max_tokens"] == 64
    assert calls[0]["temperature"] == 0.2


def test_temperature_is_dropped_for_models_that_reject_it(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": COMPLEX_PROMPT}],
            "temperature": 0,
        },
    )

    assert response.status_code == 200
    assert response.headers["x-jev-route"] == LARGE_ID
    assert "temperature" not in calls[0]


def test_deepseek_uses_native_litellm_provider(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    document = catalog_document()
    document["providers"][0]["id"] = "deepseek-proxy"
    document["providers"][0]["type"] = "deepseek"
    document["models"][0]["provider"] = "deepseek-proxy"
    document["models"][0]["capabilities"]["tools"] = True
    document["policy"]["tier_models"]["simple"] = ["deepseek-proxy/vendor/small-model"]
    document["policy"]["tier_models"]["standard"] = ["deepseek-proxy/vendor/small-model"]
    config = make_config()
    config.engine.reload_catalog(catalog_from_document(document, "test catalog"))
    app = gateway.create_app(config)

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "deepseek-proxy/vendor/small-model",
            "messages": [{"role": "user", "content": "Use a tool."}],
            "tools": [
                {"type": "function", "function": {
                    "name": "ping", "parameters": {"type": "object", "properties": {}}
                }}
            ],
        },
    )

    assert response.status_code == 200
    assert calls[0]["model"] == "deepseek/vendor/small-model"
    assert calls[0]["tools"]


def test_deepseek_restores_reasoning_content_from_session_history(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def completion(**kwargs):
        calls.append(kwargs)
        return {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "model": kwargs["model"],
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "The answer is 4.",
                    "reasoning_content": "I added two and two.",
                },
                "finish_reason": "stop",
            }],
        }

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    document = catalog_document()
    document["providers"][0]["type"] = "deepseek"
    config = make_config()
    config.engine.reload_catalog(catalog_from_document(document, "test catalog"))
    app = gateway.create_app(config)

    first = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": "What is 2 + 2?"}],
        },
    )
    second = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [
                {"role": "user", "content": "What is 2 + 2?"},
                {"role": "assistant", "content": "The answer is 4."},
                {"role": "user", "content": "Explain that answer."},
            ]
        },
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls[1]["messages"][1]["reasoning_content"] == "I added two and two."


def test_concurrent_first_requests_share_canonical_continuation_session(
    monkeypatch
) -> None:
    barrier = threading.Barrier(3)

    def completion(**kwargs):
        content = kwargs["messages"][-1]["content"]
        barrier.wait()
        return {
            "id": f"chatcmpl-{content}",
            "object": "chat.completion",
            "model": kwargs["model"],
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }],
        }

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    document = catalog_document(mode="fresh")
    config = make_config(mode="fresh")
    config.engine.reload_catalog(catalog_from_document(document, "test catalog"))
    app = gateway.create_app(config)
    results: list[httpx.Response] = []
    results_lock = threading.Lock()

    def send(content: str) -> None:
        response = request(
            app,
            "POST",
            "/v1/chat/completions",
            headers={"X-JEV-Session-Id": "same-session"},
            json={
                "model": LARGE_ID,
                "messages": [{"role": "user", "content": content}],
            },
        )
        with results_lock:
            results.append(response)

    threads = [threading.Thread(target=send, args=(content,)) for content in ("A", "B")]
    for thread in threads:
        thread.start()
    barrier.wait()
    for thread in threads:
        thread.join(timeout=2)

    assert [response.status_code for response in results] == [200, 200]
    session = config.engine.store.get("same-session")
    assert session is not None
    saved = session.adapter_state["assistant_continuations"]
    assert len(saved) == 2
    assert {item["provider_type"] for item in saved} == {"openai"}


def test_deepseek_restores_reasoning_after_gateway_restart(
    monkeypatch, tmp_path: Path
) -> None:
    calls: list[dict[str, Any]] = []

    def completion(**kwargs):
        calls.append(kwargs)
        return {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "model": kwargs["model"],
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Durable answer.",
                    "reasoning_content": "Durable trace.",
                },
                "finish_reason": "stop",
            }],
        }

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    document = catalog_document()
    document["providers"][0]["type"] = "deepseek"
    catalog = catalog_from_document(document, "test catalog")
    settings = StorageSettings(
        enabled=True, path=str(tmp_path / "continuations.sqlite3")
    )

    def restarted_app():
        store = SqliteRecordStore(settings)
        engine = RoutingEngine(
            catalog,
            MemorySessionStore(),
            record_store=store,
            config_source="test catalog",
        )
        return gateway.create_app(gateway.GatewayConfig(
            engine=engine,
            gateway_api_key=None,
            session_strategy="header",
        )), engine

    first_app, first_engine = restarted_app()
    first = request(
        first_app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "worker-session"},
        json={
            "model": SMALL_ID,
            "messages": [{"role": "user", "content": "First turn."}],
        },
    )
    assert first.status_code == 200
    first_engine.close()

    second_app, second_engine = restarted_app()
    second = request(
        second_app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "worker-session"},
        json={
            "model": SMALL_ID,
            "messages": [
                {"role": "user", "content": "First turn."},
                {"role": "assistant", "content": "Durable answer."},
                {"role": "user", "content": "Continue."},
            ],
        },
    )

    assert second.status_code == 200
    assert calls[1]["messages"][1]["reasoning_content"] == "Durable trace."
    second_engine.close()


def test_deepseek_bridges_openai_history_in_same_session(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def completion(**kwargs):
        calls.append(kwargs)
        content = "OpenAI answer." if len(calls) == 1 else "DeepSeek answer."
        return {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "model": kwargs["model"],
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }],
        }

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    document = catalog_document()
    document["providers"][0]["type"] = "deepseek"
    config = make_config(mode="fresh")
    config.engine.reload_catalog(catalog_from_document(document, "test catalog"))
    app = gateway.create_app(config)

    first = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": LARGE_ID,
            "messages": [{"role": "user", "content": "First turn."}],
        },
    )
    second = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": SMALL_ID,
            "messages": [
                {"role": "user", "content": "First turn."},
                {"role": "assistant", "content": "OpenAI answer."},
                {"role": "user", "content": "Second turn."},
            ],
        },
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.headers["x-jev-session-id"] == second.headers["x-jev-session-id"]
    assert calls[0]["model"].startswith("openai/")
    assert calls[1]["model"].startswith("deepseek/")
    assert calls[1]["messages"][1]["reasoning_content"] == " "


def test_provider_type_forwards_declared_completion_parameters(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    document = catalog_document()
    provider = document["providers"][0]
    provider.update({
        "type": "azure",
        "params": {"api_version": "2024-10-21"},
        "param_env": {"azure_ad_token": "TEST_AZURE_TOKEN"},
    })
    del provider["api_key_env"]
    monkeypatch.setenv("TEST_AZURE_TOKEN", "value-from-env")
    config = make_config()
    config.engine.reload_catalog(catalog_from_document(document, "test catalog"))

    response = request(
        gateway.create_app(config),
        "POST", "/v1/chat/completions",
        json={"model": SMALL_ID, "messages": [{"role": "user", "content": "Hi"}]},
    )

    assert response.status_code == 200
    assert calls[0]["model"] == "azure/vendor/small-model"
    assert calls[0]["api_version"] == "2024-10-21"
    assert calls[0]["azure_ad_token"] == os.environ["TEST_AZURE_TOKEN"]
    assert "api_key" not in calls[0]


def test_session_stays_on_its_model_across_turns(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    first = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )
    second = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [
                {"role": "user", "content": SIMPLE_PROMPT},
                {"role": "assistant", "content": "ok"},
                {"role": "user", "content": "再写一个排序函数。"},
            ]
        },
    )

    assert second.headers["x-jev-session-id"] == first.headers["x-jev-session-id"]
    assert second.headers["x-jev-route"] == SMALL_ID
    assert second.headers["x-jev-reason"] == "session_sticky"
    assert "x-jev-switch" not in second.headers


def test_session_switches_models_when_the_work_gets_harder(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )
    escalated = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [
                {"role": "user", "content": SIMPLE_PROMPT},
                {"role": "assistant", "content": "ok"},
                {"role": "user", "content": COMPLEX_PROMPT},
            ]
        },
    )

    assert escalated.headers["x-jev-route"] == LARGE_ID
    assert escalated.headers["x-jev-reason"] == "complexity_spike"
    assert escalated.headers["x-jev-switch"] == f"{SMALL_ID}->{LARGE_ID}"
    assert calls[-1]["model"] == "openai/vendor/large-model"


def test_default_pin_holds_the_first_turn_model(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config(mode="sticky"))

    request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )
    pinned = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [
                {"role": "user", "content": SIMPLE_PROMPT},
                {"role": "assistant", "content": "ok"},
                {"role": "user", "content": COMPLEX_PROMPT},
            ]
        },
    )

    assert pinned.headers["x-jev-route"] == SMALL_ID
    assert pinned.headers["x-jev-reason"] == "session_pinned"
    assert "x-jev-switch" not in pinned.headers


def test_explicit_session_header_is_used(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "chat-42"},
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.headers["x-jev-session-id"] == "chat-42"
    snapshot = request(app, "GET", "/v1/routing/sessions/chat-42")
    assert snapshot.status_code == 200
    assert snapshot.json()["session_id"] == "chat-42"
    assert snapshot.json()["route"] == SMALL_ID


def test_manual_model_selection(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": LARGE_ID, "messages": [{"role": "user", "content": "2 + 2?"}]},
    )

    assert response.status_code == 200
    assert response.headers["x-jev-route"] == LARGE_ID
    assert response.headers["x-jev-mode"] == "manual"
    assert response.headers["x-jev-reason"] == "manual_override"
    assert calls[0]["model"] == "openai/vendor/large-model"


def test_unknown_model_is_rejected(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "unconfigured-model",
            "messages": [{"role": "user", "content": "Hello"}],
        },
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "model_not_found"
    assert response.json()["error"]["param"] == "model"
    assert "small" in response.json()["error"]["message"]


def test_missing_user_message_is_rejected(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "system", "content": "rules"}],
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "missing_user_message"


def test_gateway_api_key_is_enforced(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config(gateway_api_key="client-key"))

    assert request(app, "GET", "/healthz").status_code == 401
    wrong = request(app, "GET", "/healthz", headers={"Authorization": "Bearer wrong"})
    assert wrong.status_code == 401

    allowed = request(
        app, "GET", "/healthz", headers={"Authorization": "Bearer client-key"}
    )
    assert allowed.status_code == 200
    assert allowed.json()["models"] == [SMALL_ID, LARGE_ID]


def test_upstream_failure_becomes_a_gateway_error(monkeypatch) -> None:
    def completion(**kwargs):
        raise RuntimeError("Authorization: Bearer test-key-small")

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    app = gateway.create_app(make_config())

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )

    assert response.status_code == 502
    error = response.json()["error"]
    assert error["code"] == "upstream_error"
    assert error["type"] == "RuntimeError"
    assert error["message"] == "Upstream provider request failed."
    assert "test-key-small" not in response.text
    assert "Bearer" not in response.text


def test_upstream_failure_bounds_exception_type(monkeypatch) -> None:
    unsafe_error = type("Secret-Type", (RuntimeError,), {})

    def completion(**kwargs):
        raise unsafe_error("Authorization: Bearer test-key-small")

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    response = request(gateway.create_app(make_config()), "POST", "/v1/chat/completions",
                       json={"model": "task_aware", "messages": [
                           {"role": "user", "content": SIMPLE_PROMPT},
                       ]})
    assert response.status_code == 502
    assert response.json()["error"]["type"] == "Exception"
    assert "Secret-Type" not in response.text
    assert "test-key-small" not in response.text


def test_upstream_failure_does_not_persist_or_log_provider_exception_text(
    monkeypatch, tmp_path: Path, caplog
) -> None:
    import logging
    import sqlite3

    def completion(**kwargs):
        raise RuntimeError("Authorization: Bearer test-key-small")

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)
    caplog.set_level(logging.DEBUG, logger="jev_gateway.gateway")
    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "hostile-error"},
        json={"model": "task_aware", "messages": [{"role": "user", "content": "Hi"}]},
    )
    detail = request(app, "GET", "/v1/routing/sessions/hostile-error/requests")
    path = Path(config.engine.record_store.settings.path)
    with sqlite3.connect(path) as database:
        row = database.execute(
            "SELECT error_message, error_type FROM outcomes"
        ).fetchone()

    assert response.status_code == 502
    assert row == (None, "RuntimeError")
    assert "error_message" not in detail.text
    assert "test-key-small" not in detail.text
    assert "Bearer" not in detail.text
    assert b"test-key-small" not in path.read_bytes()
    assert all("test-key-small" not in record.getMessage() for record in caplog.records)
    assert all(record.exc_info is None for record in caplog.records)
    config.engine.close()


def test_stream_failure_has_safe_logs_and_null_persisted_message(
    monkeypatch, tmp_path: Path, caplog
) -> None:
    import logging
    import sqlite3

    def completion(**kwargs):
        def chunks():
            yield {"id": "one", "choices": [{"delta": {"content": "ok"}}]}
            raise RuntimeError("Authorization: Bearer test-key-small")

        return chunks()

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)
    caplog.set_level(logging.DEBUG, logger="jev_gateway.gateway")
    with pytest.raises(RuntimeError, match="Upstream provider request failed"):
        request(
            app, "POST", "/v1/chat/completions",
            headers={"X-JEV-Session-Id": "stream-error"},
            json={"model": "task_aware", "stream": True,
                  "messages": [{"role": "user", "content": "Hi"}]},
        )

    path = Path(config.engine.record_store.settings.path)
    config.engine.record_store.flush()
    with sqlite3.connect(path) as database:
        assert database.execute(
            "SELECT error_message, error_type FROM outcomes"
        ).fetchone() == (None, "RuntimeError")
    assert b"test-key-small" not in path.read_bytes()
    assert all("test-key-small" not in record.getMessage() for record in caplog.records)
    assert all(record.exc_info is None for record in caplog.records)
    config.engine.close()


def test_dashboard_shell_is_content_free_and_data_api_requires_bearer_auth(
    monkeypatch,
) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config(gateway_api_key="client-key"))

    shell = request(app, "GET", "/dashboard")

    assert shell.status_code == 200
    assert shell.headers["cache-control"] == "no-store"
    assert shell.headers["x-content-type-options"] == "nosniff"
    assert shell.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in shell.headers["content-security-policy"]
    assert "Retained outcomes, last 15 minutes" in shell.text
    assert "id=\"providers\"" in shell.text
    assert "provider.has_api_key" in shell.text
    assert "await loadProviders()" in shell.text
    # The provider table labels every cell so narrow screens can stack rows
    # instead of clipping the last columns behind a hidden scrollbar.
    assert "cell.dataset.label" in shell.text
    assert "attr(data-label)" in shell.text
    assert "align-content:start" in shell.text
    assert "localStorage" not in shell.text
    assert "sessionStorage" not in shell.text
    assert "document.cookie" not in shell.text
    assert "Authorization='Bearer '+apiKey" in shell.text
    assert request(app, "GET", "/v1/routing/sessions").status_code == 401
    assert request(
        app,
        "GET",
        "/v1/routing/sessions",
        headers={"Authorization": "Bearer wrong"},
    ).status_code == 401
    allowed = request(
        app,
        "GET",
        "/v1/routing/sessions",
        headers={"Authorization": "Bearer client-key"},
    )
    assert allowed.status_code == 200
    assert allowed.json()["data"] == []


def test_provider_summary_reports_retained_attempts_and_zero_traffic_providers(
    monkeypatch, tmp_path: Path
) -> None:
    from jev_gateway import dashboard

    install_completion(monkeypatch)
    monkeypatch.setattr(dashboard.time, "time", lambda: 1100.0)
    config = make_stored_config(tmp_path, gateway_api_key="client-key")
    app = gateway.create_app(config)
    auth = {"Authorization": "Bearer client-key"}
    assert request(app, "GET", "/v1/routing/providers/summary").status_code == 401
    assert request(app, "GET", "/v1/routing/providers/summary",
                   headers={"Authorization": "Bearer wrong"}).status_code == 401
    empty = request(app, "GET", "/v1/routing/providers/summary", headers=auth).json()
    assert empty["window"] == {
        "seconds": 900, "start": 200.0, "end": 1100.0,
        "basis": "upstream_requests.created_at",
    }
    assert {item["id"] for item in empty["providers"]} == {
        "small-provider", "large-provider",
    }
    assert all(item["attempts"] == 0 and
               item["observed_condition"] == "no_recent_data"
               for item in empty["providers"])
    assert all(item["configured"] is True and isinstance(item["has_api_key"], bool)
               for item in empty["providers"])

    first = request(app, "POST", "/v1/chat/completions", headers={
        **auth, "X-JEV-Session-Id": "provider-summary",
    }, json={"model": "task_aware", "messages": [
        {"role": "user", "content": SIMPLE_PROMPT},
    ]})
    assert first.status_code == 200
    summary = request(app, "GET", "/v1/routing/providers/summary", headers=auth)
    assert summary.status_code == 200
    data = summary.json()
    assert data["evidence_available"] is True
    by_id = {item["id"]: item for item in data["providers"]}
    assert by_id["small-provider"]["attempts"] == 1
    assert by_id["small-provider"]["completed"] == 1
    assert by_id["small-provider"]["succeeded"] == 1
    assert by_id["small-provider"]["failed"] == 0
    assert by_id["small-provider"]["incomplete_evidence"] == 0
    assert by_id["small-provider"]["average_latency_ms"] is not None
    assert by_id["small-provider"]["last_outcome_ok"] is True
    assert by_id["small-provider"]["observed_condition"] == (
        "all_observed_attempts_succeeded"
    )
    assert by_id["large-provider"]["attempts"] == 0
    assert by_id["large-provider"]["average_latency_ms"] is None
    assert by_id["large-provider"]["last_outcome_at"] is None
    assert "test-key-small" not in summary.text
    assert SIMPLE_PROMPT not in summary.text
    assert "api_base" not in summary.text
    assert "param_env" not in summary.text
    assert "error_message" not in summary.text
    config.engine.close()


def test_provider_summary_observed_condition_tracks_completed_outcomes(
    monkeypatch, tmp_path: Path
) -> None:
    from jev_gateway import dashboard

    monkeypatch.setattr(dashboard.time, "time", lambda: 1100.0)
    calls = [True, False, True]

    def completion(**kwargs):
        if not calls.pop(0):
            raise RuntimeError("provider failure")
        return {
            "id": "chatcmpl-test", "model": kwargs["model"],
            "choices": [{"message": {"role": "assistant", "content": "ok"},
                         "finish_reason": "stop"}],
        }

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)

    def observed() -> dict[str, Any]:
        summary = request(app, "GET", "/v1/routing/providers/summary").json()
        return next(row for row in summary["providers"]
                    if row["id"] == "small-provider")

    for index, expected in enumerate((
        "all_observed_attempts_succeeded", "mixed_outcomes", "mixed_outcomes"
    )):
        response = request(app, "POST", "/v1/chat/completions", headers={
            "X-JEV-Session-Id": f"provider-status-{index}",
        }, json={"model": SMALL_ID, "messages": [
            {"role": "user", "content": SIMPLE_PROMPT},
        ]})
        assert response.status_code == (502 if index == 1 else 200)
        row = observed()
        assert row["observed_condition"] == expected
        assert row["attempts"] == index + 1
        assert row["completed"] == index + 1
        assert row["failed"] == (1 if index >= 1 else 0)
    config.engine.close()


def test_provider_summary_all_observed_attempts_failed(
    monkeypatch, tmp_path: Path
) -> None:
    from jev_gateway import dashboard

    monkeypatch.setattr(dashboard.time, "time", lambda: 1100.0)

    def completion(**kwargs):
        raise RuntimeError("provider failure")

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)
    failed = request(app, "POST", "/v1/chat/completions", headers={
        "X-JEV-Session-Id": "failed-provider",
    }, json={"model": SMALL_ID, "messages": [
        {"role": "user", "content": SIMPLE_PROMPT},
    ]})
    summary = request(app, "GET", "/v1/routing/providers/summary").json()
    provider = next(row for row in summary["providers"]
                    if row["id"] == "small-provider")

    assert failed.status_code == 502
    assert provider["attempts"] == provider["completed"] == provider["failed"] == 1
    assert provider["succeeded"] == 0
    assert provider["observed_condition"] == "all_observed_attempts_failed"
    config.engine.close()


def test_provider_summary_counts_stream_only_after_completion(
    monkeypatch, tmp_path: Path
) -> None:
    from jev_gateway import dashboard

    monkeypatch.setattr(dashboard.time, "time", lambda: 1100.0)
    inside_stream: list[dict[str, Any]] = []
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)

    def completion(**kwargs):
        def chunks():
            summary = request(app, "GET", "/v1/routing/providers/summary").json()
            inside_stream.append(next(row for row in summary["providers"]
                                      if row["id"] == "small-provider"))
            yield {"id": "one", "choices": [{"delta": {"content": "ok"}}]}
        return chunks()

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    response = request(app, "POST", "/v1/chat/completions", headers={
        "X-JEV-Session-Id": "provider-stream",
    }, json={"model": SMALL_ID, "stream": True, "messages": [
        {"role": "user", "content": SIMPLE_PROMPT},
    ]})
    after = request(app, "GET", "/v1/routing/providers/summary").json()
    provider = next(row for row in after["providers"]
                    if row["id"] == "small-provider")

    assert response.status_code == 200
    assert inside_stream[0]["attempts"] == 1
    assert inside_stream[0]["completed"] == 0
    assert inside_stream[0]["incomplete_evidence"] == 1
    assert provider["attempts"] == provider["completed"] == 1
    assert provider["incomplete_evidence"] == 0
    config.engine.close()


def test_provider_summary_disabled_and_degraded_storage_have_null_metrics(
    monkeypatch, tmp_path: Path
) -> None:
    install_completion(monkeypatch)
    disabled = gateway.create_app(make_config())
    disabled_response = request(disabled, "GET", "/v1/routing/providers/summary").json()
    assert disabled_response["evidence_available"] is False
    assert disabled_response["providers"]
    for provider in disabled_response["providers"]:
        assert provider["configured"] is True
        for name in ("attempts", "completed", "succeeded", "failed",
                     "incomplete_evidence", "average_latency_ms",
                     "last_outcome_at", "last_outcome_ok", "observed_condition"):
            assert provider[name] is None

    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)
    config.engine.record_store.close()
    degraded_response = request(app, "GET", "/v1/routing/providers/summary").json()
    assert degraded_response["evidence_available"] is False
    assert degraded_response["providers"][0]["attempts"] is None
    assert degraded_response["providers"][0]["observed_condition"] is None


def test_dashboard_lists_only_live_sessions_and_returns_retained_stages(
    monkeypatch, tmp_path: Path
) -> None:
    install_completion(monkeypatch)
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)

    completion = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "live-session"},
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )
    config.engine.record_request(
        request_id="historical-only",
        session_id="not-live",
        meta=gateway.RequestMeta(),
        messages=[{"role": "user", "content": "stored only"}],
    )

    listing = request(app, "GET", "/v1/routing/sessions")
    detail = request(
        app, "GET", "/v1/routing/sessions/live-session/requests"
    )

    assert completion.status_code == 200
    assert listing.status_code == 200
    assert listing.json()["evidence_available"] is True
    assert [item["session_id"] for item in listing.json()["data"]] == [
        "live-session"
    ]
    listed = listing.json()["data"][0]
    assert listed["route"] == SMALL_ID
    assert listed["provider"] == "small-provider"
    assert listed["upstream_model"] == "vendor/small-model"
    assert listed["latest_request"]["prompt"] == SIMPLE_PROMPT
    assert listed["latest_request"]["ok"] is True
    assert detail.status_code == 200
    assert detail.json()["session"]["session_id"] == "live-session"
    assert len(detail.json()["requests"]) == 1
    retained = detail.json()["requests"][0]
    assert retained["request"]["prompt"] == SIMPLE_PROMPT
    assert retained["decision"]["route"] == SMALL_ID
    assert retained["upstream_request"]["model"] == "openai/vendor/small-model"
    assert retained["upstream_request"]["payload"]["messages"] == [
        {"role": "user", "content": SIMPLE_PROMPT}
    ]
    assert retained["outcome"]["ok"] is True
    assert "test-key-small" not in json.dumps(detail.json())
    assert request(
        app, "GET", "/v1/routing/sessions/not-live/requests"
    ).json()["error"]["code"] == "unknown_session"
    config.engine.close()


def test_dashboard_sorts_sessions_by_latest_request_then_live_update(
    monkeypatch, tmp_path: Path
) -> None:
    install_completion(monkeypatch)
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)
    clock = config.engine._clock
    assert isinstance(clock, FakeClock)

    first = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "older-request"},
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": "First"}],
        },
    )
    clock.advance(1)
    second = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "newer-request"},
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": "Second"}],
        },
    )
    clock.advance(1)
    config.engine.store.put(
        SessionState(
            session_id="memory-only",
            route=SMALL_ID,
            tier="simple",
            strategy="task_aware",
            created_at=clock(),
            updated_at=clock(),
            switched_at=clock(),
        )
    )

    listing = request(app, "GET", "/v1/routing/sessions").json()["data"]

    assert first.status_code == second.status_code == 200
    assert [item["session_id"] for item in listing] == [
        "newer-request",
        "older-request",
        "memory-only",
    ]
    assert listing[0]["latest_request"]["received_at"] > listing[1][
        "latest_request"
    ]["received_at"]
    assert listing[2]["latest_request"] is None
    config.engine.close()


def test_dashboard_detail_supports_session_ids_with_slashes(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    completion = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "tenant/conversation"},
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": "Hello"}],
        },
    )
    detail = request(
        app,
        "GET",
        "/v1/routing/sessions/tenant%2Fconversation/requests",
    )

    assert completion.status_code == 200
    assert detail.status_code == 200
    assert detail.json()["session"]["session_id"] == "tenant/conversation"


def test_dashboard_captures_transformed_payload_and_redacts_provider_secrets(
    monkeypatch, tmp_path: Path
) -> None:
    calls: list[dict[str, Any]] = []

    def completion(**kwargs):
        calls.append(kwargs)
        return {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "model": kwargs["model"],
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "First answer.",
                    "reasoning_content": "Provider reasoning.",
                },
                "finish_reason": "stop",
            }],
        }

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    monkeypatch.setenv("TEST_PROVIDER_TOKEN", "provider-token-value")
    document = catalog_document()
    document["providers"][0]["type"] = "deepseek"
    document["providers"][0]["param_env"] = {
        "custom_credential": "TEST_PROVIDER_TOKEN"
    }
    document["models"][0]["capabilities"].update({
        "reasoning": True,
        "reasoning_effort": ["none", "low"],
    })
    config = make_stored_config(tmp_path, document=document)
    app = gateway.create_app(config)

    first = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "transformed"},
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": "First turn."}],
        },
    )
    clock = config.engine._clock
    assert isinstance(clock, FakeClock)
    clock.advance(1)
    second = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "transformed"},
        json={
            "model": "task_aware",
            "messages": [
                {"role": "user", "content": "First turn."},
                {"role": "assistant", "content": "First answer."},
                {"role": "user", "content": "Continue."},
            ],
        },
    )
    detail = request(
        app, "GET", "/v1/routing/sessions/transformed/requests"
    ).json()

    assert first.status_code == second.status_code == 200
    newest_payload = detail["requests"][0]["upstream_request"]["payload"]
    assert newest_payload["messages"][1]["reasoning_content"] == "Provider reasoning."
    assert newest_payload["reasoning_effort"] == "low"
    assert newest_payload["custom_credential"] == "[REDACTED]"
    assert newest_payload["api_key"] == "[REDACTED]"
    serialized = json.dumps(detail)
    assert "provider-token-value" not in serialized
    assert "test-key-small" not in serialized
    config.engine.close()


def test_dashboard_content_opt_out_and_failed_upstream_keep_safe_evidence(
    monkeypatch, tmp_path: Path
) -> None:
    def completion(**kwargs):
        raise RuntimeError("upstream exploded")

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    config = make_stored_config(tmp_path, capture_content=False)
    app = gateway.create_app(config)

    failed = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "failed-session"},
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": "Private prompt"}],
            "tools": [{"type": "function", "function": {"name": "private_tool"}}],
        },
    )
    detail = request(
        app, "GET", "/v1/routing/sessions/failed-session/requests"
    ).json()

    assert failed.status_code == 502
    retained = detail["requests"][0]
    assert retained["request"]["content_captured"] is False
    assert retained["request"]["prompt"] is None
    assert retained["request"]["messages"] is None
    assert retained["upstream_request"]["payload"]["messages"] == {
        "omitted": True,
        "kind": "array",
        "count": 1,
    }
    assert retained["upstream_request"]["payload"]["tools"] == {
        "omitted": True,
        "kind": "array",
        "count": 1,
    }
    assert retained["outcome"]["ok"] is False
    assert "Private prompt" not in json.dumps(detail)
    assert "private_tool" not in json.dumps(detail)
    config.engine.close()


def test_dashboard_sanitizer_failure_does_not_gate_upstream(
    monkeypatch, tmp_path: Path
) -> None:
    calls: list[dict[str, Any]] = []

    def completion(**kwargs):
        calls.append(kwargs)
        return {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "model": kwargs["model"],
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": "ok"},
                "finish_reason": "stop",
            }],
        }

    def fail_sanitizer(*args, **kwargs):
        raise RuntimeError("sanitizer failed")

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    monkeypatch.setattr(gateway, "sanitize_upstream_payload", fail_sanitizer)
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "sanitizer-failure"},
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": "Hello"}],
        },
    )
    detail = request(
        app,
        "GET",
        "/v1/routing/sessions/sanitizer-failure/requests",
    ).json()

    assert response.status_code == 200
    assert len(calls) == 1
    assert detail["requests"][0]["upstream_request"] is None
    assert detail["requests"][0]["outcome"]["ok"] is True
    config.engine.close()


def test_dashboard_uses_live_fallback_when_storage_is_disabled_or_degraded(
    monkeypatch, tmp_path: Path
) -> None:
    install_completion(monkeypatch)
    disabled_config = make_config()
    disabled_app = gateway.create_app(disabled_config)
    request(
        disabled_app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "memory-only"},
        json={"model": "task_aware", "messages": [{"role": "user", "content": "Hi"}]},
    )

    disabled = request(disabled_app, "GET", "/v1/routing/sessions").json()
    disabled_detail = request(
        disabled_app, "GET", "/v1/routing/sessions/memory-only/requests"
    ).json()

    assert disabled["evidence_available"] is False
    assert disabled["data"][0]["route"] == SMALL_ID
    assert disabled["data"][0]["provider"] == "small-provider"
    assert disabled_detail["requests"] == []

    document = catalog_document()
    document["storage"] = {
        "enabled": True,
        "path": str(tmp_path / "missing" / "records.sqlite3"),
    }
    catalog = catalog_from_document(document, "test catalog")
    degraded_config = gateway.GatewayConfig(
        engine=RoutingEngine(
            catalog,
            MemorySessionStore(),
            record_store=record_store_from_settings(catalog.storage),
        ),
        gateway_api_key=None,
        session_strategy="derived",
    )
    degraded_app = gateway.create_app(degraded_config)
    served = request(
        degraded_app,
        "POST",
        "/v1/chat/completions",
        headers={"X-JEV-Session-Id": "degraded"},
        json={"model": "task_aware", "messages": [{"role": "user", "content": "Hi"}]},
    )
    degraded = request(degraded_app, "GET", "/v1/routing/sessions").json()

    assert served.status_code == 200
    assert degraded["evidence_available"] is False
    assert degraded["storage"]["error"]
    assert degraded["data"][0]["route"] == SMALL_ID
    degraded_config.engine.close()


def test_sse_chunks_silences_only_litellm_usage_serializer_warning() -> None:
    expected = (
        "Pydantic serializer warnings:\n"
        "  PydanticSerializationUnexpectedValue(Expected `ResponseAPIUsage` - "
        "serialized value may not be as expected [field_name='usage'])"
    )

    def chunks():
        warnings.warn(expected, UserWarning, stacklevel=1)
        yield {"id": "one", "choices": []}
        warnings.warn("keep this warning", UserWarning, stacklevel=1)
        yield {"id": "two", "choices": []}

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        payload = list(gateway.sse_chunks(chunks()))

    assert [str(item.message) for item in caught] == ["keep this warning"]
    assert payload[-1] == "data: [DONE]\n\n"


def test_streaming_returns_openai_sse(monkeypatch) -> None:
    def completion(**kwargs):
        assert kwargs["stream"] is True
        return iter(
            [
                {"id": "one", "choices": [{"delta": {"content": "hel"}}]},
                {"id": "one", "choices": [{"delta": {"content": "lo"}}]},
            ]
        )

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    app = gateway.create_app(make_config())

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "stream": True,
            "messages": [{"role": "user", "content": "What is 2 + 2?"}],
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["x-jev-route"] == SMALL_ID
    assert 'data: {"id": "one"' in response.text
    assert response.text.endswith("data: [DONE]\n\n")


def test_routing_endpoints_expose_policy_decisions_and_sessions(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    completion = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )
    decision_id = completion.headers["x-jev-decision-id"]
    session_id = completion.headers["x-jev-session-id"]

    policy = request(app, "GET", "/v1/routing/policy")
    assert policy.status_code == 200
    assert policy.json()["policy"]["mode"] == "escalate"
    assert policy.json()["session_strategy"] == "derived"
    assert [model["name"] for model in policy.json()["models"]] == [
        SMALL_ID,
        LARGE_ID,
    ]

    decision = request(app, "GET", f"/v1/routing/decisions/{decision_id}")
    assert decision.status_code == 200
    assert decision.json()["reason"] == "first_turn_simple"
    assert decision.json()["signals"]["tier"] == "simple"

    session = request(app, "GET", f"/v1/routing/sessions/{session_id}")
    assert session.status_code == 200
    assert session.json()["turn_count"] == 1
    assert session.json()["events"][-1]["type"] == "decision"

    assert request(app, "GET", "/v1/routing/decisions/dec-missing").status_code == 404
    assert request(app, "GET", "/v1/routing/sessions/unknown").status_code == 404


def test_errors_use_the_openai_error_wrapper(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    missing = request(app, "POST", "/v1/chat/completions", json={"model": "task_aware"})
    assert missing.status_code == 400
    assert missing.json() == {
        "error": {
            "message": "Missing required parameter: 'messages'",
            "type": "invalid_request_error",
            "param": "messages",
            "code": None,
        }
    }

    empty = request(
        app, "POST", "/v1/chat/completions", json={"model": "task_aware", "messages": []}
    )
    assert empty.status_code == 400
    assert empty.json()["error"]["param"] == "messages"

    unknown_path = request(app, "GET", "/v1/embeddings")
    assert unknown_path.status_code == 404
    assert unknown_path.json()["error"]["message"] == "Invalid URL (GET /v1/embeddings)"
    assert set(unknown_path.json()["error"]) == {"message", "type", "param", "code"}

    malformed = request(
        app,
        "POST",
        "/v1/chat/completions",
        content=b"{not json",
        headers={"Content-Type": "application/json"},
    )
    assert malformed.status_code == 400
    assert malformed.json()["error"]["param"] is None
    assert malformed.json()["error"]["type"] == "invalid_request_error"


def test_model_list_entries_match_the_openai_schema(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    payload = request(app, "GET", "/v1/models").json()

    assert payload["object"] == "list"
    for entry in payload["data"]:
        assert set(entry) == {"id", "object", "created", "owned_by"}
        assert isinstance(entry["created"], int)
        assert entry["object"] == "model"


def test_auth_failure_uses_the_openai_error_shape(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config(gateway_api_key="client-key"))

    response = request(app, "GET", "/v1/models")

    assert response.status_code == 401
    assert response.json()["error"]["type"] == "invalid_request_error"
    assert response.json()["error"]["code"] == "invalid_api_key"
    assert "param" in response.json()["error"]


def test_reload_endpoint_swaps_the_catalog(tmp_path, monkeypatch) -> None:
    models_file = tmp_path / "models.json"
    models_file.write_text(json.dumps(catalog_document()), encoding="utf-8")

    install_completion(monkeypatch)
    app = gateway.create_app(make_config(models_file=models_file))
    assert request(app, "GET", "/v1/routing/policy").json()["models"][0]["name"] == SMALL_ID

    replacement = catalog_document()
    for provider in replacement["providers"]:
        provider["api_base"] = "https://moved.example/v1"
    models_file.write_text(json.dumps(replacement), encoding="utf-8")

    reloaded = request(app, "POST", "/v1/routing/reload")

    assert reloaded.status_code == 200
    assert reloaded.json()["reloaded"] is True
    assert reloaded.json()["models"][0]["api_base"] == "https://moved.example/v1"


def test_reload_rejects_continuation_retention_changes(
    tmp_path: Path, monkeypatch
) -> None:
    models_file = tmp_path / "models.json"
    database = tmp_path / "records.sqlite3"
    document = catalog_document()
    document["storage"] = {
        "enabled": True,
        "path": str(database),
        "max_continuations_per_session": 40,
        "max_continuation_sessions": 20,
    }
    models_file.write_text(json.dumps(document), encoding="utf-8")
    catalog = catalog_from_document(document, "test catalog")
    store = SqliteRecordStore(catalog.storage)
    config = gateway.GatewayConfig(
        engine=RoutingEngine(
            catalog,
            MemorySessionStore(),
            record_store=store,
            config_source=str(models_file),
        ),
        gateway_api_key=None,
        session_strategy="derived",
        models_file=models_file,
    )
    install_completion(monkeypatch)
    app = gateway.create_app(config)

    replacement = catalog_document()
    replacement["storage"] = {
        "enabled": True,
        "path": str(database),
        "max_continuations_per_session": 2,
        "max_continuation_sessions": 3,
    }
    models_file.write_text(json.dumps(replacement), encoding="utf-8")

    response = request(app, "POST", "/v1/routing/reload")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "restart_required"
    assert store.settings.max_continuations_per_session == 40
    assert store.settings.max_continuation_sessions == 20
    assert config.engine.catalog.storage == catalog.storage
    config.engine.close()


@pytest.mark.parametrize("change", ["enabled", "path", "queue_size"])
def test_reload_rejects_storage_changes_that_require_restart(
    tmp_path: Path, monkeypatch, change: str
) -> None:
    models_file = tmp_path / "models.json"
    database = tmp_path / "records.sqlite3"
    document = catalog_document()
    document["storage"] = {
        "enabled": True,
        "path": str(database),
        "queue_size": 8,
    }
    models_file.write_text(json.dumps(document), encoding="utf-8")
    catalog = catalog_from_document(document, "test catalog")
    store = SqliteRecordStore(catalog.storage)
    config = gateway.GatewayConfig(
        engine=RoutingEngine(
            catalog,
            MemorySessionStore(),
            record_store=store,
            config_source=str(models_file),
        ),
        gateway_api_key=None,
        session_strategy="derived",
        models_file=models_file,
    )
    install_completion(monkeypatch)
    app = gateway.create_app(config)

    replacement = json.loads(json.dumps(document))
    if change == "enabled":
        replacement["storage"]["enabled"] = False
    elif change == "path":
        replacement["storage"]["path"] = str(tmp_path / "other.sqlite3")
    else:
        replacement["storage"]["queue_size"] = 9
    replacement["providers"][0]["api_base"] = "https://should-not-apply.example/v1"
    models_file.write_text(json.dumps(replacement), encoding="utf-8")

    response = request(app, "POST", "/v1/routing/reload")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "restart_required"
    assert config.engine.catalog.storage == catalog.storage
    assert config.engine.catalog.providers[0].api_base == "https://small.example/v1"
    assert store.settings == catalog.storage
    config.engine.close()


def test_reload_accepts_unchanged_relative_storage_path(
    tmp_path: Path, monkeypatch
) -> None:
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    models_file = runtime / "models.json"
    document = catalog_document()
    document["storage"] = {"enabled": True, "path": "records.sqlite3"}
    models_file.write_text(json.dumps(document), encoding="utf-8")
    monkeypatch.setenv("JEV_GATEWAY_HOME", str(runtime))
    install_completion(monkeypatch)
    config = gateway.load_gateway_config(models_file)
    app = gateway.create_app(config)

    response = request(app, "POST", "/v1/routing/reload")

    assert response.status_code == 200
    assert config.engine.catalog.storage.path == str(runtime / "records.sqlite3")
    config.engine.close()


def test_reload_strategy_preflight_failure_keeps_storage_and_catalog(
    tmp_path: Path, monkeypatch
) -> None:
    models_file = tmp_path / "models.json"
    database = tmp_path / "records.sqlite3"
    document = catalog_document()
    document["storage"] = {
        "enabled": True,
        "path": str(database),
        "max_continuations_per_session": 40,
    }
    models_file.write_text(json.dumps(document), encoding="utf-8")
    catalog = catalog_from_document(document, "test catalog")
    store = SqliteRecordStore(catalog.storage)
    config = gateway.GatewayConfig(
        engine=RoutingEngine(
            catalog,
            MemorySessionStore(),
            record_store=store,
            config_source=str(models_file),
        ),
        gateway_api_key=None,
        session_strategy="derived",
        models_file=models_file,
    )
    install_completion(monkeypatch)
    app = gateway.create_app(config)

    replacement = json.loads(json.dumps(document))
    replacement["storage"]["max_continuations_per_session"] = 2
    replacement["strategies"]["task_aware"] = {"kind": "missing-kind"}
    models_file.write_text(json.dumps(replacement), encoding="utf-8")

    response = request(app, "POST", "/v1/routing/reload")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_configuration"
    assert store.settings.max_continuations_per_session == 40
    assert config.engine.catalog.storage.max_continuations_per_session == 40
    config.engine.close()


def test_reload_reports_degraded_storage_as_unavailable(
    tmp_path: Path, monkeypatch
) -> None:
    models_file = tmp_path / "models.json"
    document = catalog_document()
    document["storage"] = {
        "enabled": True,
        "path": str(tmp_path / "missing" / "records.sqlite3"),
    }
    models_file.write_text(json.dumps(document), encoding="utf-8")
    catalog = catalog_from_document(document, "test catalog")
    config = gateway.GatewayConfig(
        engine=RoutingEngine(
            catalog,
            MemorySessionStore(),
            record_store=gateway.record_store_from_settings(catalog.storage),
            config_source=str(models_file),
        ),
        gateway_api_key=None,
        session_strategy="derived",
        models_file=models_file,
    )
    install_completion(monkeypatch)
    app = gateway.create_app(config)

    response = request(app, "POST", "/v1/routing/reload")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "storage_unavailable"
    config.engine.close()


def test_reload_prioritizes_restart_required_for_degraded_storage_change(
    tmp_path: Path, monkeypatch
) -> None:
    models_file = tmp_path / "models.json"
    document = catalog_document()
    document["storage"] = {
        "enabled": True,
        "path": str(tmp_path / "missing" / "records.sqlite3"),
    }
    models_file.write_text(json.dumps(document), encoding="utf-8")
    catalog = catalog_from_document(document, "test catalog")
    config = gateway.GatewayConfig(
        engine=RoutingEngine(
            catalog,
            MemorySessionStore(),
            record_store=gateway.record_store_from_settings(catalog.storage),
            config_source=str(models_file),
        ),
        gateway_api_key=None,
        session_strategy="derived",
        models_file=models_file,
    )
    install_completion(monkeypatch)
    app = gateway.create_app(config)
    replacement = json.loads(json.dumps(document))
    replacement["storage"]["max_continuations_per_session"] = 2
    models_file.write_text(json.dumps(replacement), encoding="utf-8")

    response = request(app, "POST", "/v1/routing/reload")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "restart_required"
    config.engine.close()


def test_reload_endpoint_keeps_the_old_catalog_on_bad_input(
    tmp_path, monkeypatch
) -> None:
    models_file = tmp_path / "models.json"
    models_file.write_text(json.dumps(catalog_document()), encoding="utf-8")

    install_completion(monkeypatch)
    app = gateway.create_app(make_config(models_file=models_file))
    models_file.write_text("{not json", encoding="utf-8")

    response = request(app, "POST", "/v1/routing/reload")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_configuration"
    # The running catalog is untouched, so routing still works.
    assert request(app, "GET", "/v1/routing/policy").json()["models"][0]["name"] == SMALL_ID


def test_reload_endpoint_applies_gateway_runtime_settings(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("RELOADED_GATEWAY_TOKEN", "new-client-key")
    models_file = tmp_path / "models.json"
    models_file.write_text(json.dumps(catalog_document()), encoding="utf-8")

    install_completion(monkeypatch)
    app = gateway.create_app(make_config(models_file=models_file))
    replacement = catalog_document()
    replacement["gateway"] = {
        "api_key_env": "RELOADED_GATEWAY_TOKEN",
        "session_strategy": "off",
        "session_ttl_seconds": 30,
        "max_sessions": 2,
        "decision_log_size": 4,
        "echo_requested_model": False,
    }
    models_file.write_text(json.dumps(replacement), encoding="utf-8")

    assert request(app, "POST", "/v1/routing/reload").status_code == 200
    active = app.state.jev_config
    assert active.gateway_api_key == "new-client-key"
    assert active.session_strategy == "off"
    assert active.echo_requested_model is False
    assert active.engine.store.ttl_seconds == 30
    assert active.engine.store.max_sessions == 2
    assert request(app, "GET", "/v1/models").status_code == 401
    assert (
        request(
            app,
            "GET",
            "/v1/models",
            headers={"Authorization": "Bearer new-client-key"},
        ).status_code
        == 200
    )


def test_reload_requires_the_gateway_key(tmp_path, monkeypatch) -> None:
    models_file = tmp_path / "models.json"
    models_file.write_text(json.dumps(catalog_document()), encoding="utf-8")

    install_completion(monkeypatch)
    app = gateway.create_app(
        make_config(gateway_api_key="client-key", models_file=models_file)
    )

    assert request(app, "POST", "/v1/routing/reload").status_code == 401


def test_each_model_uses_its_own_base_and_key(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    simple = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )
    complex_request = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": COMPLEX_PROMPT}],
        },
    )

    assert simple.headers["x-jev-route"] == SMALL_ID
    assert complex_request.headers["x-jev-route"] == LARGE_ID
    small_call = next(
        call for call in calls if call["api_base"] == "https://small.example/v1"
    )
    large_call = next(
        call for call in calls if call["api_base"] == "https://large.example/v1"
    )
    assert small_call["api_key"] == "test-key-small"
    assert large_call["api_key"] == "test-key-large"


def test_same_provider_models_share_connection_and_keep_their_upstream_model(
    monkeypatch,
) -> None:
    calls = install_completion(monkeypatch)
    document = single_route_document()
    stronger = dict(document["models"][0])
    stronger["upstream_model"] = "vendor/stronger"
    document["models"].append(stronger)
    document["policy"]["tier_models"] = {
        "simple": ["test-provider/vendor/only"],
        "standard": ["test-provider/vendor/only"],
        "complex": ["test-provider/vendor/stronger"],
    }
    catalog = catalog_from_document(document, "test catalog")
    clock = FakeClock()
    app = gateway.create_app(
        gateway.GatewayConfig(
            engine=RoutingEngine(
                catalog, MemorySessionStore(clock=clock), clock=clock
            ),
            gateway_api_key=None,
            session_strategy="derived",
        )
    )

    simple = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={"model": "task_aware", "messages": [{"role": "user", "content": SIMPLE_PROMPT}]},
    )
    stronger_request = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "test-provider/vendor/stronger",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )

    assert simple.headers["x-jev-provider"] == "test-provider"
    assert stronger_request.headers["x-jev-provider"] == "test-provider"
    assert [call["api_base"] for call in calls] == [
        "https://test.example/v1",
        "https://test.example/v1",
    ]
    assert [call["api_key"] for call in calls] == ["test-route-key", "test-route-key"]
    assert [call["model"] for call in calls] == [
        "openai/vendor/only",
        "openai/vendor/stronger",
    ]


def test_response_model_echoes_the_requested_name(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    implicit = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )
    assert implicit.json()["model"] == "task_aware"
    assert implicit.headers["x-jev-model"] == "vendor/small-model"

    explicit = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": SMALL_ID,
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )
    assert explicit.json()["model"] == SMALL_ID


def test_response_model_can_keep_the_upstream_name(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config(echo_requested_model=False))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )

    assert response.json()["model"] == "vendor/small-model"
    assert response.headers["x-jev-model"] == "vendor/small-model"


def test_streaming_echoes_the_requested_model(monkeypatch) -> None:
    def completion(**kwargs):
        return iter(
            [
                {
                    "id": "chunk-1",
                    "object": "chat.completion.chunk",
                    "model": "vendor/small-model",
                    "choices": [
                        {"index": 0, "delta": {"content": "hi"}, "finish_reason": None}
                    ],
                }
            ]
        )

    monkeypatch.setitem(
        sys.modules, "litellm", types.SimpleNamespace(completion=completion)
    )
    app = gateway.create_app(make_config())

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "stream": True,
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )

    chunk = json.loads(response.text.splitlines()[0].removeprefix("data: "))
    assert chunk["model"] == "task_aware"
    assert chunk["object"] == "chat.completion.chunk"


def test_routing_reads_max_completion_tokens(monkeypatch) -> None:
    install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    default_budget = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
        },
    )
    large_budget = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": "写一个排序函数。"}],
            "max_completion_tokens": 5000,
        },
    )

    assert default_budget.headers["x-jev-route"] == SMALL_ID
    assert default_budget.headers["x-jev-reason"] == "first_turn_simple"
    # The small route caps output at 2000 tokens, so a 5000 token budget routes up.
    assert large_budget.headers["x-jev-route"] == LARGE_ID
    assert large_budget.headers["x-jev-reason"] == "tier_fallback_complex"


# Reasoning effort: declared per route, decided after the route is chosen.

OPENAI_LADDER = ("none", "low", "medium", "high", "xhigh", "max")


def make_reasoning_config(
    ladder: tuple[str, ...] = OPENAI_LADDER, **reasoning: Any
) -> gateway.GatewayConfig:
    """A one-route catalog whose route declares which levels it accepts."""
    document = single_route_document(
        capabilities={"reasoning": True, "reasoning_effort": list(ladder)}
    )
    if reasoning:
        document["policy"]["reasoning"] = reasoning
    catalog = catalog_from_document(document, "test catalog")
    clock = FakeClock()
    return gateway.GatewayConfig(
        engine=RoutingEngine(catalog, MemorySessionStore(clock=clock), clock=clock),
        gateway_api_key=None,
        session_strategy="derived",
        echo_requested_model=True,
        models_file=Path("models.json"),
    )


def test_the_gateway_sends_the_level_it_clamped_to_the_route(
    monkeypatch,
) -> None:
    calls = install_completion(monkeypatch)
    app = gateway.create_app(make_reasoning_config(("none", "low")))

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
    # The complex tier asks for `high`, and this route stops at `low`.
    assert calls[0]["reasoning_effort"] == "low"
    assert response.headers["x-jev-reasoning-effort"] == "low"
    assert response.headers["x-jev-reasoning-source"] == "derived"


def test_a_route_without_a_declared_ladder_forwards_the_clients_value(
    monkeypatch,
) -> None:
    """No route has opted in, so the request reaches upstream byte for byte."""
    calls = install_completion(monkeypatch)
    app = gateway.create_app(make_config())

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
            "reasoning_effort": "minimal",
        },
    )

    assert response.status_code == 200
    assert calls[0]["reasoning_effort"] == "minimal"
    assert "x-jev-reasoning-effort" not in response.headers
    assert "x-jev-reasoning-source" not in response.headers


def test_reasoning_mode_off_never_touches_the_field(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = gateway.create_app(
        make_reasoning_config(("none", "low"), mode="off")
    )

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": COMPLEX_PROMPT}],
            "reasoning_effort": "xhigh",
        },
    )

    assert calls[0]["reasoning_effort"] == "xhigh"
    assert "x-jev-reasoning-effort" not in response.headers


def test_a_level_the_route_cannot_name_is_clamped_not_forwarded(
    monkeypatch,
) -> None:
    """`minimal` is the measured 502 on the OpenAI-compatible route."""
    calls = install_completion(monkeypatch)
    app = gateway.create_app(make_reasoning_config(mode="preserve"))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": SIMPLE_PROMPT}],
            "reasoning_effort": "minimal",
        },
    )

    assert response.status_code == 200
    assert calls[0]["reasoning_effort"] == "low"
    assert response.headers["x-jev-reasoning-source"] == "clamped_client"


def test_cap_never_raises_above_what_the_client_asked_for(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    app = gateway.create_app(make_reasoning_config(mode="cap"))

    response = request(
        app,
        "POST",
        "/v1/chat/completions",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": COMPLEX_PROMPT}],
            "reasoning_effort": "low",
        },
    )

    assert calls[0]["reasoning_effort"] == "low"
    assert response.headers["x-jev-reasoning-source"] == "client"


def test_preview_reports_the_level_it_would_send(monkeypatch) -> None:
    app = gateway.create_app(make_reasoning_config(("none", "low")))

    response = request(
        app,
        "POST",
        "/v1/routing/preview",
        json={
            "model": "task_aware",
            "messages": [{"role": "user", "content": COMPLEX_PROMPT}],
        },
    )

    payload = response.json()
    assert payload["preview"][0]["reasoning_effort"] == "low"
    assert payload["preview"][0]["reasoning_effort_source"] == "derived"
