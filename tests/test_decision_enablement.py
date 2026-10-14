"""Decision onboarding must have an explicit, transactional path to classification."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from jev_gateway.catalog import Catalog, catalog_from_document
from jev_gateway.provider_config import ProviderConfiguration, revision
from jev_gateway.request_facts import extract_request_facts
from jev_gateway.strategy import RoutingRequest, StrategyRegistry
from tests.helpers import LARGE_MODEL_ID, SMALL_MODEL_ID
from tests.test_decision_matrix import document


def service(tmp_path: Path, *, providers: bool = True) -> ProviderConfiguration:
    config = document()
    config["decision"]["enabled"] = False
    config["decision"]["timeout_seconds"] = 5
    if not providers:
        config["decision"]["providers"] = []
    definition = config["strategies"]["definitions"]["matrix"]
    definition["policy"].pop("tier_models")
    definition["policy"]["labels"] = {
        "review": {"models": [SMALL_MODEL_ID]}, "complex": {"models": [LARGE_MODEL_ID]},
    }
    definition["options"]["rules"][1]["select"] = {"label": "review"}
    definition["options"]["fallback"] = {"label": "review"}
    path = tmp_path / "models.json"
    path.write_text(json.dumps(config))
    return ProviderConfiguration(path, external={"TEST_MATRIX_KEY": "synthetic-decision-key"})


def body(current: ProviderConfiguration, enabled: Any) -> dict[str, Any]:
    return {"expected_revision": revision(current.models_file), "operations": [{"action": "set_decision_enabled", "enabled": enabled}]}


def route(catalog: Catalog):
    strategy = StrategyRegistry.from_catalog(catalog).resolve("matrix")
    facts = extract_request_facts([{"role": "user", "content": "fixture task"}])
    return strategy.decide(RoutingRequest(facts, None, None, 1, 0), catalog)


def test_explicit_enable_activates_matrix_classification_and_disable_restores_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    current = service(tmp_path)
    active = catalog_from_document(
        json.loads(current.models_file.read_text()), "fixture", current.external, allow_missing_credentials=True,
    )
    calls: list[str] = []

    def post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append(url)
        return httpx.Response(200, request=httpx.Request("POST", url), json={
            "answers": {"risk": {"choice": "high"}, "objective": {"choice": "quality"}},
        })

    def activate(catalog: Catalog, registry: Any) -> None:
        nonlocal active
        active = catalog

    monkeypatch.setattr(httpx, "post", post)
    assert route(active).tier == "review"
    assert route(active).reason.startswith("decision_matrix:local:fallback:")
    assert not calls
    before = current.models_file.read_bytes()
    command = body(current, True)
    preview = current.command(command)
    assert preview["decision"]["enabled"] is True
    assert current.models_file.read_bytes() == before
    assert active.decision.enabled is False
    assert not calls

    result = current.command(command, apply=True, activate=activate)
    assert result["decision"]["enabled"] is True
    assert result["decision"]["timeout_seconds"] == 5
    outcome = route(active)
    assert outcome.tier == "complex" and outcome.model == LARGE_MODEL_ID
    assert outcome.reason.startswith("decision_matrix:primary:rule_1:")
    assert len(calls) == 1
    assert current.read()["decision"]["enabled"] is True

    current.command(body(current, False), apply=True, activate=activate)
    assert route(active).tier == "review"
    assert route(active).reason.startswith("decision_matrix:local:fallback:")
    assert len(calls) == 1
    assert current.read()["decision"]["enabled"] is False


@pytest.mark.parametrize("enabled", [None, 0, 1, "true", [], {}])
def test_enable_requires_a_strict_boolean_without_writing(tmp_path: Path, enabled: Any) -> None:
    current = service(tmp_path)
    before = current.models_file.read_bytes()
    with pytest.raises(ValueError, match="decision enable"):
        current.command(body(current, enabled), apply=True)
    assert current.models_file.read_bytes() == before


@pytest.mark.parametrize("providers", [True, False])
def test_enable_rejects_unconfigured_or_uncredentialed_decisions(tmp_path: Path, providers: bool) -> None:
    current = service(tmp_path, providers=providers)
    current.external = {}
    before = current.models_file.read_bytes()
    with pytest.raises(ValueError, match="at least one provider|resolved credential"):
        current.command(body(current, True), apply=True)
    assert current.models_file.read_bytes() == before
    assert not current.models_file.with_name("models.json.bak").exists()
    assert current.command(body(current, False), apply=True)["decision"]["enabled"] is False


def test_enable_uses_completed_candidate_credentials_without_auto_enabling_on_upsert(tmp_path: Path) -> None:
    current = service(tmp_path, providers=False)
    current.external = {}
    provider = {"id": "judge", "protocol": "system_one", "api_base": "https://fixture.example/evaluate", "api_key_env": "FIXTURE_DECISION_KEY"}
    upsert = {"action": "upsert", "kind": "decision", "provider": provider, "credential": {"action": "set", "value": "synthetic-onboarding-key"}}
    saved = current.command({"expected_revision": revision(current.models_file), "operations": [upsert]}, apply=True)
    assert saved["decision"]["enabled"] is False
    command = body(current, True)
    command["operations"].append(upsert)
    result = current.command(command, apply=True)
    assert result["decision"]["enabled"] is True
    assert result["decision"]["providers"][0]["has_api_key"] is True
    assert "synthetic-onboarding-key" not in json.dumps(result)


@pytest.mark.parametrize("operation", [
    {"action": "set_decision_enabled"},
    {"action": "set_decision_enabled", "enabled": True, "kind": "decision"},
])
def test_enable_rejects_extra_or_missing_fields(tmp_path: Path, operation: dict[str, Any]) -> None:
    current = service(tmp_path)
    before = current.models_file.read_bytes()
    with pytest.raises(ValueError, match="decision enable"):
        current.command({"expected_revision": revision(current.models_file), "operations": [operation]}, apply=True)
    assert current.models_file.read_bytes() == before
