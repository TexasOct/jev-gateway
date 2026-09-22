"""Tests for the OpenAI-compatible gateway."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import types
import warnings
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel

from jev_gateway import gateway
from jev_gateway.catalog import catalog_from_document
from jev_gateway.decision import RoutingEngine
from jev_gateway.sessions import MemorySessionStore
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
        raise RuntimeError("upstream exploded")

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
    assert response.json()["error"]["code"] == "upstream_error"
    assert "exploded" in response.json()["error"]["message"]


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
