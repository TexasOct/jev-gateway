"""Real connection API diagnostics with synthetic listing transport only."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import model_discovery
from jev_gateway.discovery_network import DiscoveryNetworkError, JsonResponse
from tests.test_gateway import install_completion
from tests.test_provider_config_regressions import fixture_app
from tests.test_provider_management_api import headers, request


@pytest.mark.parametrize("scenario,status,diagnostic,count", [
    ("success", "success", "listing_succeeded", 1),
    ("empty", "success", "listing_succeeded", 0),
    ("authentication_failed", "authentication_error", "authentication_failed", 0),
    ("blocked_target", "address_error", "address_unavailable", 0),
    ("upstream_failed", "network_error", "upstream_failed", 0),
    ("hostile", "network_error", "upstream_failed", 0),
    ("hostile_code", "network_error", "upstream_failed", 0),
    ("invalid_response", "incomplete", "listing_incomplete", 0),
    ("partial", "incomplete", "listing_incomplete", 1),
    ("cloud", "unsupported", "discovery_unsupported", 0),
    ("missing", "incomplete", "credential_unconfigured", 0),
])
def test_real_connection_api_fixed_diagnostics_and_unchanged_state(
    tmp_path: Path, monkeypatch: Any, scenario: str, status: str,
    diagnostic: str, count: int,
) -> None:
    app, config = fixture_app(tmp_path)
    generation = install_completion(monkeypatch)
    secret = "synthetic-hostile-secret"
    calls: list[str] = []

    def fetch(url: str, **kwargs: Any) -> JsonResponse:
        calls.append(url)
        if scenario == "hostile":
            raise RuntimeError(f"Authorization: Bearer {secret} private endpoint")
        if scenario == "hostile_code":
            raise DiscoveryNetworkError(secret)
        if scenario == "partial":
            return JsonResponse({"data": [{"id": "one"}], "has_more": True, "last_id": "one"})
        if scenario in {"success", "empty"}:
            return JsonResponse({"data": [] if scenario == "empty" else [{"id": "one"}, {"id": "one"}]})
        raise DiscoveryNetworkError(scenario)

    monkeypatch.setattr(model_discovery, "safe_get_json", fetch)
    watched = ["models.json", "models.json.bak", "routing-overrides.json", ".env",
               ".env.backup", "credentials.json", "credentials.json.backup",
               ".provider-configuration.recovery", "dashboard-theme.json", "routing-canvas-layout.json"]

    def snapshot() -> dict[str, bytes | None]:
        return {name: (tmp_path / name).read_bytes() if (tmp_path / name).exists() else None for name in watched}

    before, environment = snapshot(), dict(os.environ)
    catalog, registry = config.engine.catalog, config.engine.strategies
    body: dict[str, Any] = {"provider_id": "test-provider"}
    if scenario in {"cloud", "missing"}:
        body = {"provider": {"id": "candidate", "type": "vertex_ai" if scenario == "cloud" else "openai",
                             "api_base": "https://synthetic.example/v1", "api_key_env": "CONNECTION_DIAGNOSTICS_ABSENT_KEY"},
                "credential": {"action": "clear"}}
    unauthorized = request(app, "POST", "/v1/provider-connection-test", json=body)
    assert unauthorized.status_code == 401 and calls == []
    response = request(app, "POST", "/v1/provider-connection-test", headers=headers(config), json=body)
    assert response.status_code == 200
    assert response.json() == {
        "provider_id": "candidate" if scenario in {"cloud", "missing"} else "test-provider",
        "status": status, "scope": "model_listing", "model_count": count,
        "warnings": ["generation_unverified", diagnostic],
    }
    assert secret not in response.text
    assert bool(calls) is (scenario not in {"cloud", "missing"})
    assert generation == [] and snapshot() == before and dict(os.environ) == environment
    assert config.engine.catalog is catalog and config.engine.strategies is registry


def test_decision_connection_owner_has_no_listing_probe(monkeypatch: Any) -> None:
    monkeypatch.setattr(model_discovery, "discover_models", lambda *args, **kwargs: pytest.fail("Decision probe"))
    assert model_discovery.test_provider_connection({"id": "decision", "type": "openai", "kind": "decision"}, None) == {
        "provider_id": "decision", "status": "unsupported", "scope": "model_listing", "model_count": 0,
        "warnings": ["generation_unverified", "discovery_unsupported"],
    }
