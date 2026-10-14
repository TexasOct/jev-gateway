"""The managed decision switch must activate routing through the HTTP boundary."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from jev_gateway import gateway
from jev_gateway.catalog import catalog_from_document
from jev_gateway.decision import RoutingEngine
from jev_gateway.sessions import MemorySessionStore
from tests.test_decision_enablement import service
from tests.test_provider_management_api import headers, request


def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Any, gateway.GatewayConfig]:
    monkeypatch.setenv("TEST_MATRIX_KEY", "synthetic-decision-api-key")
    current = service(tmp_path)
    document = json.loads(current.models_file.read_text())
    document["gateway"] = {"api_key_env": "TEST_SMALL_PROVIDER_KEY"}
    document["decision"]["default_provider"] = "primary"
    current.models_file.write_text(json.dumps(document))
    catalog = catalog_from_document(document, "fixture")
    config = gateway.GatewayConfig(
        RoutingEngine(catalog, MemorySessionStore()), catalog.gateway.api_key, "derived", models_file=current.models_file,
    )
    return gateway.create_app(config), config


def test_http_enable_leaves_review_fallback_and_disable_restores_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, config = setup(tmp_path, monkeypatch)
    auth = headers(config)
    calls: list[str] = []

    def post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append(url)
        return httpx.Response(200, request=httpx.Request("POST", url), json={
            "answers": {"risk": {"choice": "high"}, "objective": {"choice": "quality"}},
        })

    monkeypatch.setattr(httpx, "post", post)
    preview_body = {"model": "matrix", "messages": [{"role": "user", "content": "fixture task"}]}
    before_route = request(app, "POST", "/v1/routing/preview", headers=auth, json=preview_body).json()["preview"][0]
    assert before_route["tier"] == "review"
    assert "decision_matrix:local:fallback:" in before_route["reason"]
    assert not calls
    initial = request(app, "GET", "/v1/provider-configuration", headers=auth).json()
    body = {"expected_revision": initial["revision"], "operations": [{"action": "set_decision_enabled", "enabled": True}]}
    before = config.models_file.read_bytes()
    validation = request(app, "POST", "/v1/provider-configuration/validate", headers=auth, json=body)
    assert validation.status_code == 200
    assert config.models_file.read_bytes() == before
    assert config.engine.catalog.decision.enabled is False
    applied = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body)
    assert applied.status_code == 200
    assert applied.json()["decision"]["default_provider"] == "primary"
    assert applied.json()["decision"]["timeout_seconds"] == 5
    after_route = request(app, "POST", "/v1/routing/preview", headers=auth, json=preview_body).json()["preview"][0]
    assert after_route["tier"] == "complex"
    assert "decision_matrix:primary:rule_1:" in after_route["reason"]
    assert len(calls) == 1
    assert request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body).status_code == 409
    body = {"expected_revision": applied.json()["revision"], "operations": [{"action": "set_decision_enabled", "enabled": False}]}
    assert request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body).status_code == 200
    final_route = request(app, "POST", "/v1/routing/preview", headers=auth, json=preview_body).json()["preview"][0]
    assert final_route["tier"] == "review"
    assert len(calls) == 1
    assert not config.models_file.with_name("routing-overrides.json").exists()


def test_http_enable_activation_failure_rolls_back_files_and_live_decision_state(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, config = setup(tmp_path, monkeypatch)
    auth = headers(config)
    initial = request(app, "GET", "/v1/provider-configuration", headers=auth).json()
    before = config.models_file.read_bytes()
    previous = config.engine.catalog
    reload = config.engine.reload_catalog

    def fail_once(catalog: Any, source: str | None = None, **kwargs: Any) -> None:
        if catalog is not previous:
            raise RuntimeError("synthetic-sensitive-exception")
        reload(catalog, source, **kwargs)

    monkeypatch.setattr(config.engine, "reload_catalog", fail_once)
    body = {"expected_revision": initial["revision"], "operations": [{"action": "set_decision_enabled", "enabled": True}]}
    result = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body)
    assert result.status_code == 500
    assert "synthetic-sensitive-exception" not in result.text
    assert config.models_file.read_bytes() == before
    assert config.engine.catalog is previous and previous.decision.enabled is False


def test_strategy_provider_selection_and_global_enablement_remain_independent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, config = setup(tmp_path, monkeypatch)
    auth = headers(config)
    document = json.loads(config.models_file.read_text())
    selected = {**document["decision"]["providers"][0], "id": "selected",
                "api_base": "https://selected.example/decision", "model": "selected-model"}
    document["decision"]["providers"].append(selected)
    config.models_file.write_text(json.dumps(document))
    config.engine.reload_catalog(catalog_from_document(document, "selection fixture"))
    original_providers = document["decision"]["providers"]
    calls: list[tuple[str, str]] = []
    fail_selected = False

    def post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append((url, kwargs["json"]["model"]))
        if fail_selected and url == selected["api_base"]:
            raise httpx.ConnectError("synthetic selected-provider failure")
        return httpx.Response(200, request=httpx.Request("POST", url), json={
            "answers": {"risk": {"choice": "high"}, "objective": {"choice": "quality"}},
        })

    monkeypatch.setattr(httpx, "post", post)
    workflow_path = "/v1/routing/configuration"
    surface = request(app, "GET", workflow_path + "?strategy=matrix", headers=auth).json()
    assert {item["id"] for item in surface["decision_providers"]} == {"primary", "selected"}
    command = {"version": 2, "strategy": "matrix", "selected_models": surface["selected_models"],
               "definition": {**surface["definition"], "decision_provider": "selected"}}
    baseline_before = config.models_file.read_bytes()
    assert request(app, "POST", workflow_path + "/validate", headers=auth, json=command).status_code == 200
    assert request(app, "PUT", workflow_path, headers=auth, json=command).status_code == 200
    assert config.models_file.read_bytes() == baseline_before
    assert config.engine.catalog.decision.enabled is False
    preview = {"model": "matrix", "messages": [{"role": "user", "content": "fixture task"}]}

    def route() -> dict[str, Any]:
        return request(app, "POST", "/v1/routing/preview", headers=auth, json=preview).json()["preview"][0]

    assert route()["tier"] == "review" and calls == []
    provider_snapshot = request(app, "GET", "/v1/provider-configuration", headers=auth).json()
    enable = {"expected_revision": provider_snapshot["revision"],
              "operations": [{"action": "set_decision_enabled", "enabled": True}]}
    enabled = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=enable)
    assert enabled.status_code == 200, enabled.text
    assert request(app, "POST", "/v1/routing/reload", headers=auth).status_code == 200
    assert request(app, "GET", workflow_path + "?strategy=matrix", headers=auth).json()["definition"]["decision_provider"] == "selected"
    outcome = route()
    assert outcome["tier"] == "complex" and "decision_matrix:selected:rule_1:" in outcome["reason"]
    assert calls == [(selected["api_base"], "selected-model")]

    fail_selected = True
    outcome = route()
    assert outcome["tier"] == "review" and "decision_matrix:local:fallback:" in outcome["reason"]
    assert calls == [(selected["api_base"], "selected-model")] * 2

    command["definition"].pop("decision_provider")
    assert request(app, "PUT", workflow_path, headers=auth, json=command).status_code == 200
    assert request(app, "POST", "/v1/routing/reload", headers=auth).status_code == 200
    assert "decision_provider" not in request(app, "GET", workflow_path + "?strategy=matrix", headers=auth).json()["definition"]
    outcome = route()
    assert outcome["tier"] == "complex" and "decision_matrix:primary:rule_1:" in outcome["reason"]
    assert calls[-1][0] == original_providers[0]["api_base"]
    assert json.loads(config.models_file.read_text())["decision"]["providers"] == original_providers
    current = request(app, "GET", "/v1/provider-configuration", headers=auth).json()
    disable = {"expected_revision": current["revision"],
               "operations": [{"action": "set_decision_enabled", "enabled": False}]}
    assert request(app, "PUT", "/v1/provider-configuration", headers=auth, json=disable).status_code == 200
    assert route()["tier"] == "review" and len(calls) == 3
