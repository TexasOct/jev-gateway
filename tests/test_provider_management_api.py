"""Management authentication, activation, and read-only query integration."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from jev_gateway import gateway
from jev_gateway.catalog import catalog_from_document
from jev_gateway.decision import RoutingEngine
from jev_gateway.sessions import MemorySessionStore
from tests.helpers import single_route_document


def request(app: Any, method: str, path: str, **kwargs: Any) -> httpx.Response:
    async def send() -> httpx.Response:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://fixture") as client:
            return await client.request(method, path, **kwargs)
    return asyncio.run(send())


def setup_app(tmp_path: Path, *, key: bool = True) -> tuple[Any, gateway.GatewayConfig]:
    document = single_route_document()
    if key:
        document["gateway"] = {"api_key_env": "TEST_PROVIDER_KEY"}
    path = tmp_path / "models.json"
    path.write_text(json.dumps(document))
    catalog = catalog_from_document(document, "fixture")
    config = gateway.GatewayConfig(RoutingEngine(catalog, MemorySessionStore()), catalog.gateway.api_key, "derived", models_file=path)
    return gateway.create_app(config), config


def headers(config: gateway.GatewayConfig) -> dict[str, str]:
    return {"Authorization": f"Bearer {config.gateway_api_key}"}


def edit_body(response: dict[str, Any]) -> dict[str, Any]:
    provider = {"id": "test-provider", "type": "openai", "api_base": "https://test.example/v1", "api_key_env": "TEST_PROVIDER_KEY", "display_name": "Edited"}
    return {"expected_revision": response["revision"], "operations": [{"action": "upsert", "kind": "llm", "provider": provider, "credential": {"action": "keep"}}]}


def test_get_validate_apply_and_revision_conflict(tmp_path: Path) -> None:
    app, config = setup_app(tmp_path)
    auth = headers(config)
    initial = request(app, "GET", "/v1/provider-configuration", headers=auth).json()
    assert set(initial) == {"revision", "write_available", "providers", "decision", "models", "presets", "provider_types", "decision_protocols"}
    assert "system_one" in initial["decision_protocols"]
    assert all({"kind", "id", "display_name", "brand_id", "icon_id", "api_base", "api_key_env"} <= set(preset) for preset in initial["presets"])
    before = config.models_file.read_bytes()
    body = edit_body(initial)
    validated = request(app, "POST", "/v1/provider-configuration/validate", headers=auth, json=body)
    assert validated.status_code == 200
    assert config.models_file.read_bytes() == before
    assert config.engine.catalog.providers[0].display_name is None
    applied = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body)
    assert applied.status_code == 200
    assert applied.json()["applied"] is True
    assert config.engine.catalog.providers[0].display_name == "Edited"
    assert request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body).status_code == 409


@pytest.mark.parametrize("method,path", [("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration"), ("POST", "/v1/provider-discovery"), ("POST", "/v1/provider-metadata")])
def test_every_command_requires_gateway_key(tmp_path: Path, method: str, path: str) -> None:
    app, _config = setup_app(tmp_path, key=False)
    assert request(app, "GET", "/v1/provider-configuration").status_code == 200
    assert request(app, method, path, json={}).status_code == 403
    protected, _config = setup_app(tmp_path)
    assert request(protected, method, path, json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_import_refreshes_model_catalog_without_overlay_changes(tmp_path: Path) -> None:
    app, config = setup_app(tmp_path)
    auth = headers(config)
    initial = request(app, "GET", "/v1/provider-configuration", headers=auth).json()
    entry = {"upstream_model": "new", "context_window": None, "max_output_tokens": None, "capabilities": {"tools": False, "vision": False, "json_mode": False, "reasoning": False, "temperature": True, "reasoning_effort": []}, "cost": {"input_per_million": 1, "output_per_million": 2}, "metadata": {"version": 1, "confirmation": {"method": "manual", "confirmed_at": "2026-09-30T10:00:00Z"}}}
    body = {"expected_revision": initial["revision"], "operations": [{"action": "import", "provider_id": "test-provider", "models": [entry], "confirmed": True}]}
    response = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body)
    assert response.status_code == 200
    assert response.json()["imported"] == 1
    assert config.engine.catalog.by_name("test-provider/new") is not None
    assert not (tmp_path / "routing-overrides.json").exists()
    assert response.json()["models"][1]["metadata"] == entry["metadata"]


def test_failed_activation_restores_runtime_files_and_safe_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = setup_app(tmp_path)
    auth = headers(config)
    initial = request(app, "GET", "/v1/provider-configuration", headers=auth).json()
    before = config.models_file.read_bytes()
    previous = config.engine.catalog
    reload = config.engine.reload_catalog
    def fail_once(catalog: Any, source: str | None = None, **kwargs: Any) -> None:
        if catalog is not previous:
            raise RuntimeError("fake-hostile-secret-error")
        reload(catalog, source, **kwargs)
    monkeypatch.setattr(config.engine, "reload_catalog", fail_once)
    result = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=edit_body(initial))
    assert result.status_code == 500
    assert "fake-hostile-secret-error" not in result.text
    assert config.models_file.read_bytes() == before
    assert config.engine.catalog is previous


def test_queries_use_declared_key_and_do_not_write(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = setup_app(tmp_path)
    auth = headers(config)
    before = config.models_file.read_bytes()
    observed: list[Any] = []
    def discover(provider: dict[str, Any], key: str | None, *, imported_ids: set[str]) -> dict[str, Any]:
        observed.append((provider, key, imported_ids))
        return {"provider_id": provider["id"], "supported": True, "complete": True, "items": [{"upstream_model": "new", "qualified_id": "test-provider/new", "imported": False, "metadata": {"fields": {"tools": True}, "sources": [], "warnings": []}}], "warnings": []}
    def metadata(provider: dict[str, Any], models: list[str], *, refresh: bool = False) -> dict[str, Any]:
        observed.append((provider, models, refresh))
        return {"items": [{"upstream_model": "new", "fields": {"tools": True}, "sources": [], "warnings": []}]}
    monkeypatch.setattr(gateway.model_discovery, "discover_models", discover)
    monkeypatch.setattr(gateway.model_metadata, "lookup_model_metadata", metadata)
    discovery = request(app, "POST", "/v1/provider-discovery", headers=auth, json={"provider_id": "test-provider"})
    assert discovery.status_code == 200
    assert discovery.json()["items"][0]["metadata_envelope"]["version"] == 1
    queried = request(app, "POST", "/v1/provider-metadata", headers=auth, json={"provider_id": "test-provider", "upstream_models": ["new"], "refresh": True})
    assert queried.status_code == 200
    assert queried.json()["items"][0]["metadata"]["version"] == 1
    assert observed[0][1] == config.engine.catalog.providers[0].api_key
    assert observed[1][2] is True
    assert config.models_file.read_bytes() == before


def test_hostile_payload_errors_do_not_echo_secrets(tmp_path: Path) -> None:
    app, config = setup_app(tmp_path)
    auth = headers(config)
    initial = request(app, "GET", "/v1/provider-configuration", headers=auth).json()
    body = edit_body(initial)
    body["operations"][0]["provider"]["type"] = "fake-hostile-secret-in-type"
    body["operations"][0]["credential"] = {"action": "set", "value": "fake-write-only-secret"}
    response = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body)
    assert response.status_code == 400
    assert "fake-hostile-secret" not in response.text
    assert "fake-write-only-secret" not in response.text
    assert not (tmp_path / ".env").exists()
