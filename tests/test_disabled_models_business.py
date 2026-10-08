"""Disabled-model business contracts through private ASGI and persisted runtime."""

from __future__ import annotations

import copy
import json
import socket
import sqlite3
from pathlib import Path
from typing import Any

import pytest
import httpx

from jev_gateway import gateway
from tests.helpers import LARGE_MODEL_ID, SMALL_MODEL_ID, catalog_document, turns
from tests.test_gateway import install_completion
from tests.test_model_transaction_publication import versions
from tests.test_provider_management_api import headers, request


@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden(*args: Any, **kwargs: Any) -> Any:
        pytest.fail("Unexpected outbound network in disabled-model business acceptance")
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)


def app_for(tmp_path: Path, *, mode: str = "sticky", kind: str = "policy", selection: str = "balanced", default: bool = False, pool: str = "explicit", single: bool = False, document_overrides: dict[str, Any] | None = None) -> tuple[Any, gateway.GatewayConfig]:
    document = catalog_document(mode=mode, selection=selection, pin={"break_on": []}, hysteresis={"min_turns_between_switches": 999, "cooldown_seconds": 99999})
    strategy: dict[str, Any] = {"kind": kind}
    document["strategies"] = {"task_aware": strategy}
    if kind == "decision_matrix":
        strategy["options"] = {"questions": {"complexity": {"type": "choice", "instructions": "Classify the synthetic prompt", "criteria": {"simple": "Simple", "complex": "Complex"}}}, "rules": [], "fallback": {"label": "simple", "selection": selection}}
    document["policy"]["tier_models"] = {tier: [SMALL_MODEL_ID, LARGE_MODEL_ID] for tier in ["simple", "standard", "complex"]}
    if pool == "tags":
        document["policy"]["tier_models"] = {tier: [] for tier in ["simple", "standard", "complex"]}
        for entry in document["models"]:
            entry["tags"] = ["task_aware/simple", "task_aware/standard", "task_aware/complex"]
    if default:
        document["defaults"] = {"default_model": SMALL_MODEL_ID}
        document["policy"]["tier_models"] = {tier: [] for tier in ["simple", "standard", "complex"]}
    if single:
        document["models"] = document["models"][:1]
    document["gateway"] = {"api_key_env": "DISABLED_MANAGEMENT_KEY"}
    if kind != "policy":
        document["decision"] = {"enabled": True, "providers": [{"id": "controlled", "protocol": "system_one", "api_base": "https://decision.example/evaluate", "api_key_env": "DISABLED_DECISION_KEY"}]}
    document["storage"] = {"enabled": True, "path": str(tmp_path / "records.sqlite3")}
    document["models"][0]["cost"] = {"input_per_million": 0, "output_per_million": 0}
    document["models"][0]["quality"] = 1
    for entry in document["models"]:
        entry["capabilities"]["reasoning_effort"] = []
    if document_overrides is not None:
        document.update(copy.deepcopy(document_overrides))
    path = tmp_path / "models.json"
    path.write_text(json.dumps(document))
    (tmp_path / ".env").write_text("DISABLED_MANAGEMENT_KEY=fake-management\nTEST_SMALL_PROVIDER_KEY=fake-small\nTEST_LARGE_PROVIDER_KEY=fake-large\nDISABLED_DECISION_KEY=fake-decision\n")
    config = gateway.load_gateway_config(path)
    config.session_strategy = "header"
    return gateway.create_app(config), config


def put_model(app: Any, config: gateway.GatewayConfig, index: int, **changes: Any) -> None:
    current = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()
    entry = copy.deepcopy(json.loads(config.models_file.read_text())["models"][index])
    entry.update(changes)
    model_id = [SMALL_MODEL_ID, LARGE_MODEL_ID][index]
    before_env = (config.models_file.parent / ".env").read_bytes()
    response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json={"expected_revision": current["revision"], "operations": [{"action": "update_model", "model_id": model_id, "model": entry}]})
    assert response.status_code == 200, response.text
    assert (config.models_file.parent / ".env").read_bytes() == before_env
    rows = versions(config)
    assert len([row for row in rows if row[0] == config.engine.config_hash]) == 1
    assert not (config.models_file.parent / "routing-overrides.json").exists()


def chat(app: Any, config: gateway.GatewayConfig, *, model: str = "task_aware", session: str = "business", **extra: Any) -> Any:
    return request(app, "POST", "/v1/chat/completions", headers={**headers(config), "X-JEV-Session-Id": session}, json={"model": model, "messages": turns("hello"), **extra})


def test_disabled_management_public_explicit_and_preview(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = app_for(tmp_path)
    calls = install_completion(monkeypatch)
    try:
        put_model(app, config, 0, enabled=False)
        managed = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()
        assert managed["models"][0]["name"] == SMALL_MODEL_ID and managed["models"][0]["enabled"] is False
        public = request(app, "GET", "/v1/models", headers=headers(config)).json()
        assert SMALL_MODEL_ID not in [item["id"] for item in public["data"]]
        assert LARGE_MODEL_ID in [item["id"] for item in public["data"]]
        for route in ["/v1/chat/completions", "/v1/routing/preview"]:
            response = request(app, "POST", route, headers=headers(config), json={"model": SMALL_MODEL_ID, "messages": turns("hello")})
            assert response.status_code == 404 and response.json()["error"]["code"] == "model_not_found"
        assert calls == []
    finally:
        config.engine.close()


def test_populated_disabled_record_preserves_fields_and_baseline_references(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    entry = copy.deepcopy(catalog_document()["models"][0])
    entry.update(display_name="Managed synthetic model", enabled=True, tags=["task_aware/simple", "foreign/retained"], priority=17, quality=0.7)
    entry["capabilities"]["reasoning_effort"] = []
    entry["cost"].update(cache_read_per_million=0, cache_write_per_million=1.5)
    entry["metadata"] = {"version": 1, "confirmation": {"method": "manual", "confirmed_at": "2026-10-08T00:00:00Z"}, "fields": {
        "tools": {"status": "confirmed", "value": False, "method": "manual", "confirmed_at": "2026-10-08T00:00:00Z"},
    }}
    other = copy.deepcopy(catalog_document()["models"][1])
    other["capabilities"]["reasoning_effort"] = []
    expected_model = {
        **entry, "name": SMALL_MODEL_ID, "api_base": "https://small.example/v1", "provider_type": "openai", "has_api_key": True, "routing_overlay_fields": [],
    }
    app, config = app_for(tmp_path, document_overrides={"models": [entry, other], "defaults": {"default_model": SMALL_MODEL_ID}})
    calls = install_completion(monkeypatch)
    try:
        before_document = json.loads(config.models_file.read_text())
        before = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()
        assert before["models"][0] == expected_model
        credential_path = tmp_path / "credentials.json"
        credential_before = credential_path.read_bytes() if credential_path.exists() else None
        expected_document = copy.deepcopy(before_document)
        expected_document["models"][0]["enabled"] = False
        expected_model["enabled"] = False
        put_model(app, config, 0, enabled=False)
        after = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()
        assert after["models"][0] == expected_model
        assert after["models"][1] == before["models"][1]
        for key in ("providers", "defaults", "decision", "gateway"):
            assert after[key] == before[key]
        assert json.loads(config.models_file.read_text()) == expected_document
        assert expected_document["policy"]["tier_models"] == {tier: [SMALL_MODEL_ID, LARGE_MODEL_ID] for tier in ("simple", "standard", "complex")}
        assert expected_document["defaults"] == {"default_model": SMALL_MODEL_ID}
        assert (credential_path.read_bytes() if credential_path.exists() else None) == credential_before
        public = request(app, "GET", "/v1/models", headers=headers(config)).json()
        assert SMALL_MODEL_ID not in [item["id"] for item in public["data"]]
        assert LARGE_MODEL_ID in [item["id"] for item in public["data"]]
        for route in ("/v1/chat/completions", "/v1/routing/preview"):
            response = request(app, "POST", route, headers=headers(config), json={"model": SMALL_MODEL_ID, "messages": turns("hello")})
            assert response.status_code == 404 and response.json()["error"]["code"] == "model_not_found"
        assert calls == []
        saved = next(row for row in versions(config) if row[0] == config.engine.config_hash)
        recorded = next(model for model in json.loads(saved[2])["models"] if model["name"] == SMALL_MODEL_ID)
        assert recorded == {key: value for key, value in expected_model.items() if key != "routing_overlay_fields"}
    finally:
        config.engine.close()


@pytest.mark.parametrize("kind", ["policy", "decision", "decision_matrix", "auto"])
@pytest.mark.parametrize("selection", ["balanced", "cheapest_adequate", "quality_first"])
@pytest.mark.parametrize("pool", ["explicit", "tags"])
def test_widened_pool_executes_enabled_model_outside_incapable_tier(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str, selection: str, pool: str) -> None:
    decision_calls: list[dict[str, Any]] = []

    def decision_response(url: str, **kwargs: Any) -> httpx.Response:
        assert url == "https://decision.example/evaluate"
        assert kwargs["headers"] == {"Authorization": "Bearer fake-decision"}
        decision_calls.append(kwargs)
        answers = {key: {"choice": "simple"} for key in kwargs["json"]["questions"]}
        return httpx.Response(200, json={"answers": answers}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", decision_response)
    models = copy.deepcopy(catalog_document()["models"])
    disabled, outside = models
    disabled.update(enabled=False, quality=1, cost={"input_per_million": 0, "output_per_million": 0})
    disabled["capabilities"].update(tools=True, reasoning_effort=[])
    outside["capabilities"]["reasoning_effort"] = []
    incapable = copy.deepcopy(disabled)
    incapable.update(upstream_model="vendor/incapable", enabled=True)
    incapable["capabilities"]["tools"] = False
    incapable_id = "small-provider/vendor/incapable"
    tiers = ("simple", "standard", "complex")
    for entry in (disabled, incapable):
        entry["tags"] = [f"task_aware/{tier}" for tier in tiers] if pool == "tags" else []
    outside["tags"] = ["foreign/outside"]
    policy = catalog_document(selection=selection)["policy"]
    policy["tier_models"] = {tier: [SMALL_MODEL_ID, incapable_id] if pool == "explicit" else [] for tier in tiers}
    app, config = app_for(tmp_path, kind=kind, selection=selection, document_overrides={"models": [disabled, outside, incapable], "policy": policy})
    calls = install_completion(monkeypatch)
    try:
        response = chat(app, config, session="widened", tools=[{"type": "function", "function": {"name": "fixture"}}])
        assert response.status_code == 200, response.text
        assert len(calls) == 1
        assert calls[0]["model"] == "openai/vendor/large-model"
        assert calls[0]["api_base"] == "https://large.example/v1" and calls[0]["api_key"] == "fake-large"
        assert len(decision_calls) == (0 if kind == "policy" else 1)
        session = config.engine.store.get("widened")
        assert session is not None and session.route == LARGE_MODEL_ID
    finally:
        config.engine.close()


def test_disabled_only_tag_pool_uses_enabled_global_default(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    models = copy.deepcopy(catalog_document()["models"])
    models[0].update(tags=["task_aware/simple", "task_aware/standard", "task_aware/complex"], enabled=True)
    models[1]["tags"] = ["foreign/retained"]
    for entry in models:
        entry["capabilities"]["reasoning_effort"] = []
    policy = catalog_document()["policy"]
    policy["tier_models"] = {tier: [] for tier in ("simple", "standard", "complex")}
    app, config = app_for(tmp_path, document_overrides={"models": models, "policy": policy, "defaults": {"default_model": LARGE_MODEL_ID}})
    calls = install_completion(monkeypatch)
    try:
        expected_document = json.loads(config.models_file.read_text())
        expected_document["models"][0]["enabled"] = False
        put_model(app, config, 0, enabled=False)
        assert json.loads(config.models_file.read_text()) == expected_document
        response = chat(app, config, session="disabled-tag-default")
        assert response.status_code == 200, response.text
        assert len(calls) == 1 and calls[0]["model"] == "openai/vendor/large-model"
        assert calls[0]["api_base"] == "https://large.example/v1" and calls[0]["api_key"] == "fake-large"
        unavailable = chat(app, config, model=SMALL_MODEL_ID)
        assert unavailable.status_code == 404 and unavailable.json()["error"]["code"] == "model_not_found"
        assert len(calls) == 1
    finally:
        config.engine.close()


@pytest.mark.parametrize("kind", ["policy", "decision", "decision_matrix", "auto"])
@pytest.mark.parametrize("selection", ["balanced", "cheapest_adequate", "quality_first"])
@pytest.mark.parametrize("pool", ["explicit", "tags"])
def test_disabled_selection_and_all_disabled(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str, selection: str, pool: str) -> None:
    decision_calls: list[dict[str, Any]] = []
    def decision_response(url: str, **kwargs: Any) -> httpx.Response:
        assert url == "https://decision.example/evaluate"
        assert kwargs["headers"] == {"Authorization": "Bearer fake-decision"}
        decision_calls.append(kwargs)
        answers = {key: {"choice": "simple"} for key in kwargs["json"]["questions"]}
        return httpx.Response(200, json={"answers": answers}, request=httpx.Request("POST", url))
    monkeypatch.setattr(httpx, "post", decision_response)
    app, config = app_for(tmp_path, kind=kind, selection=selection, pool=pool)
    calls = install_completion(monkeypatch)
    try:
        put_model(app, config, 0, enabled=False)
        normal = chat(app, config, session="normal-selection")
        assert normal.status_code == 200 and len(calls) == 1
        assert calls[0]["model"] == "openai/vendor/large-model"
        assert len(decision_calls) == (0 if kind == "policy" else 1)
        put_model(app, config, 1, context_window=8, max_output_tokens=4, capabilities={"tools": False, "vision": False, "json_mode": False, "reasoning": False, "temperature": True, "reasoning_effort": []})
        response = chat(app, config, session="relaxed-selection", messages=turns("Synthetic bounded context pressure " * 20), max_tokens=1000000, tools=[{"type": "function", "function": {"name": "fixture"}}])
        assert response.status_code == 200, response.text
        assert len(calls) == 2 and calls[-1]["model"] == "openai/vendor/large-model"
        assert calls[-1]["api_key"] == "fake-large"
        assert len(decision_calls) == (0 if kind == "policy" else 2)
        put_model(app, config, 1, enabled=False)
        unavailable = chat(app, config, session="empty")
        assert unavailable.status_code == 503 and unavailable.json()["error"]["code"] == "setup_incomplete"
        assert len(calls) == 2
        assert len(decision_calls) == (0 if kind == "policy" else 2)
    finally:
        config.engine.close()


@pytest.mark.parametrize("mode", ["sticky", "cached", "escalate", "adaptive", "fresh"])
@pytest.mark.parametrize("remaining", [True, False])
def test_real_session_then_put_disable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str, remaining: bool) -> None:
    app, config = app_for(tmp_path, mode=mode)
    calls = install_completion(monkeypatch)
    try:
        seed = chat(app, config, model=SMALL_MODEL_ID)
        assert seed.status_code == 200 and len(calls) == 1
        session = config.engine.store.get("business")
        assert session is not None and session.route == SMALL_MODEL_ID
        put_model(app, config, 0, enabled=False)
        if not remaining:
            put_model(app, config, 1, enabled=False)
        follow = chat(app, config, messages=turns("hello", "continue"))
        assert follow.status_code == (200 if remaining else 503), follow.text
        if remaining:
            assert len(calls) == 2 and calls[-1]["model"] == "openai/vendor/large-model"
            continued = config.engine.store.get("business")
            assert continued is not None and continued.route == LARGE_MODEL_ID
        else:
            assert follow.json()["error"]["code"] == "setup_incomplete" and len(calls) == 1
        manual = chat(app, config, model=SMALL_MODEL_ID)
        assert manual.status_code == (404 if remaining else 503)
        assert manual.json()["error"]["code"] == ("model_not_found" if remaining else "setup_incomplete")
        assert len(calls) == (2 if remaining else 1)
        assert len(request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"]) == 2
    finally:
        config.engine.close()


def test_default_reference_disable_and_atomic_reassignment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = app_for(tmp_path, default=True)
    calls = install_completion(monkeypatch)
    try:
        assert chat(app, config).status_code == 200
        assert calls[-1]["model"] == "openai/vendor/small-model"
        put_model(app, config, 0, enabled=False)
        managed = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()
        assert json.loads(config.models_file.read_text())["defaults"]["default_model"] == SMALL_MODEL_ID
        unavailable = chat(app, config, session="disabled-default")
        assert unavailable.status_code == 503 and unavailable.json()["error"]["code"] == "setup_incomplete"
        assert len(calls) == 1
        before = config.models_file.read_bytes()
        rejected = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json={"expected_revision": managed["revision"], "operations": [{"action": "set_default_model", "model": SMALL_MODEL_ID}]})
        assert rejected.status_code == 400 and rejected.json()["error"]["code"] == "invalid_configuration"
        assert config.models_file.read_bytes() == before
        entry = json.loads(before)["models"][0]
        entry["enabled"] = True
        changed = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json={"expected_revision": managed["revision"], "operations": [{"action": "update_model", "model_id": SMALL_MODEL_ID, "model": entry}, {"action": "set_default_model", "model": LARGE_MODEL_ID}]})
        assert changed.status_code == 200, changed.text
        assert chat(app, config, session="new-default").status_code == 200
        assert len(calls) == 2 and calls[-1]["model"] == "openai/vendor/large-model"
        assert len([row for row in versions(config) if row[0] == config.engine.config_hash]) == 1
    finally:
        config.engine.close()


def test_sole_disabled_default_keeps_reference_and_returns_unavailable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = app_for(tmp_path, default=True, single=True)
    calls = install_completion(monkeypatch)
    try:
        assert chat(app, config).status_code == 200 and len(calls) == 1
        put_model(app, config, 0, enabled=False)
        for route in ["/v1/chat/completions", "/v1/routing/preview"]:
            response = request(app, "POST", route, headers=headers(config), json={"model": "task_aware", "messages": turns("continue")})
            assert response.status_code == 503 and response.json()["error"]["code"] == "setup_incomplete"
        assert len(calls) == 1
        saved = json.loads(config.models_file.read_text())
        assert len(saved["models"]) == 1 and saved["models"][0]["enabled"] is False
        assert saved["defaults"]["default_model"] == SMALL_MODEL_ID
    finally:
        config.engine.close()


def test_disable_and_default_reassignment_publish_together(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = app_for(tmp_path, default=True)
    calls = install_completion(monkeypatch)
    try:
        current = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()
        entry = json.loads(config.models_file.read_text())["models"][0]
        entry["enabled"] = False
        before = versions(config)
        body = {"expected_revision": current["revision"], "operations": [{"action": "update_model", "model_id": SMALL_MODEL_ID, "model": entry}, {"action": "set_default_model", "model": LARGE_MODEL_ID}]}
        response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert response.status_code == 200, response.text
        assert len(versions(config)) == len(before) + 1
        disabled = config.engine.catalog.by_name(SMALL_MODEL_ID)
        assert disabled is not None and disabled.enabled is False
        assert chat(app, config).status_code == 200
        assert len(calls) == 1 and calls[0]["model"] == "openai/vendor/large-model"
        saved = json.loads(config.models_file.read_text())
        assert saved["defaults"]["default_model"] == LARGE_MODEL_ID and saved["models"][0]["enabled"] is False
    finally:
        config.engine.close()


def test_reenable_updated_runtime_generation_and_cache_estimate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = app_for(tmp_path, selection="cheapest_adequate")
    calls = install_completion(monkeypatch)
    try:
        put_model(app, config, 0, enabled=False)
        assert chat(app, config, session="disabled").status_code == 200
        assert calls[-1]["model"] == "openai/vendor/large-model"
        capabilities = {"tools": True, "vision": True, "json_mode": True, "reasoning": True, "temperature": False, "reasoning_effort": ["low", "medium", "high"]}
        put_model(app, config, 0, enabled=True, display_name="Renamed enabled", capabilities=capabilities, context_window=64000, max_output_tokens=4096, cost={"input_per_million": 0.1, "output_per_million": 0.2, "cache_read_per_million": 50, "cache_write_per_million": 100})
        response = chat(app, config, session="reenabled", temperature=0.3, max_tokens=3000, tools=[{"type": "function", "function": {"name": "fixture"}}])
        assert response.status_code == 200, response.text
        assert len(calls) == 2 and calls[-1]["model"] == "openai/vendor/small-model"
        assert calls[-1]["api_key"] == "fake-small" and calls[-1]["api_base"] == "https://small.example/v1"
        assert "temperature" not in calls[-1] and calls[-1]["reasoning_effort"] == "low"
        assert calls[-1]["max_tokens"] == 3000
        profile = config.engine.catalog.by_name(SMALL_MODEL_ID)
        assert profile is not None and profile.enabled and profile.display_name == "Renamed enabled"
        estimate = profile.estimated_cost(1000, 1000)
        assert estimate == pytest.approx(0.0003)
        put_model(app, config, 0, cost={"input_per_million": 0.1, "output_per_million": 0.2, "cache_read_per_million": 0, "cache_write_per_million": None})
        updated = config.engine.catalog.by_name(SMALL_MODEL_ID)
        assert updated is not None and updated.estimated_cost(1000, 1000) == estimate
        repeated = chat(app, config, session="cache-updated", temperature=0.7, max_tokens=3000)
        assert repeated.status_code == 200 and len(calls) == 3
        assert calls[-1]["model"] == "openai/vendor/small-model" and "temperature" not in calls[-1]
        assert calls[-1]["reasoning_effort"] == "low"
        config.engine.record_store.flush()
        with sqlite3.connect(config.engine.catalog.storage.path) as connection:
            costs = connection.execute("SELECT outcomes.cost_usd FROM outcomes JOIN decisions USING(decision_id) WHERE decisions.route = ? ORDER BY outcomes.recorded_at", (SMALL_MODEL_ID,)).fetchall()
        assert len(costs) == 2
        assert [row[0] for row in costs] == pytest.approx([0.0000014, 0.0000014])
    finally:
        config.engine.close()
