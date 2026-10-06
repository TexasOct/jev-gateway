"""Whole-model edits, disabled routes, and bounded connection probes."""

from __future__ import annotations

import copy
import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import model_discovery, model_metadata
from jev_gateway.catalog import catalog_from_document
from jev_gateway.decision import RoutingEngine, UnknownModelError
from jev_gateway.provider_config import ProviderConfiguration, RevisionConflict, metadata_envelope, revision
from jev_gateway.routing_overlay import overlay_path
from jev_gateway.setup import setup_projection
from jev_gateway.strategy import SetupIncompleteError
from tests.helpers import catalog_document, SMALL_MODEL_ID, LARGE_MODEL_ID, turns
from tests.test_provider_config import model, service
from tests.test_provider_config_regressions import fixture_app
from tests.test_provider_management_api import request, headers


def update(current: Any, entry: dict[str, Any]) -> dict[str, Any]:
    return {"expected_revision": revision(current.models_file), "operations": [{"action": "update_model", "model_id": "test-provider/vendor/only", "model": entry}]}


def test_whole_model_edit_preserves_overlay_and_identity(tmp_path: Path) -> None:
    current = service(tmp_path)
    original = json.loads(current.models_file.read_text())
    original["models"][0].update(tags=["task_aware/simple"], priority=17, quality=0.7)
    current.models_file.write_text(json.dumps(original))
    overlay = {"version": 1, "strategy": "task_aware", "models": {"test-provider/vendor/only": {"tags": ["task_aware/complex"], "priority": 2}}}
    overlay_path(current.models_file).write_text(json.dumps(overlay))
    overlay_bytes = overlay_path(current.models_file).read_bytes()
    entry = model("vendor/only")
    entry.update(display_name="My model", enabled=False, tags=["task_aware/complex"], priority=2)
    entry["cost"].update(cache_read_per_million=0, cache_write_per_million=None)
    body = update(current, entry)
    before = current.models_file.read_bytes()
    validated = current.command(body)
    assert current.models_file.read_bytes() == before
    assert validated["models"][0]["enabled"] is False
    applied = current.command(body, apply=True)
    assert applied["models"][0]["tags"] == ["task_aware/complex"]
    assert applied["models"][0]["name"] == "test-provider/vendor/only"
    saved = json.loads(current.models_file.read_text())["models"][0]
    assert saved["tags"] == ["task_aware/simple"] and saved["priority"] == 17
    assert saved["quality"] == 0.7
    assert overlay_path(current.models_file).read_bytes() == overlay_bytes
    assert current.read()["models"][0]["cost"]["cache_read_per_million"] == 0
    with pytest.raises(RevisionConflict):
        current.command(body, apply=True)


@pytest.mark.parametrize("owned", [[], ["tags"], ["priority"], ["tags", "priority"]])
def test_exact_model_ownership_projection_and_baseline_writes(tmp_path: Path, owned: list[str]) -> None:
    current = service(tmp_path)
    document = json.loads(current.models_file.read_text())
    document["models"][0].update(tags=["task_aware/simple"], priority=-7)
    current.models_file.write_text(json.dumps(document))
    effective = {"tags": ["task_aware/complex"], "priority": -2}
    overlay_path(current.models_file).write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {"test-provider/vendor/only": {field: effective[field] for field in owned}} if owned else {}}))
    overlay_bytes = overlay_path(current.models_file).read_bytes()
    assert current.read()["models"][0]["routing_overlay_fields"] == owned
    entry = model("vendor/only")
    entry.update(tags=["task_aware/complex"], priority=-9)
    for field in owned:
        entry.pop(field)
    result = current.command(update(current, entry), apply=True)
    assert result["models"][0]["routing_overlay_fields"] == owned
    saved = json.loads(current.models_file.read_text())["models"][0]
    assert saved["tags"] == (["task_aware/simple"] if "tags" in owned else ["task_aware/complex"])
    assert saved["priority"] == (-7 if "priority" in owned else -9)
    assert "routing_overlay_fields" not in saved
    assert "routing_overlay_fields" not in current.read()["models"][0].get("metadata", {})
    assert overlay_path(current.models_file).read_bytes() == overlay_bytes


def test_api_projects_model_ownership_from_current_overlay(tmp_path: Path) -> None:
    app, config = fixture_app(tmp_path)
    path = overlay_path(config.models_file)
    path.write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {"test-provider/vendor/only": {"priority": -2}}}))
    before = path.read_bytes()
    response = request(app, "GET", "/v1/provider-configuration", headers=headers(config))
    assert response.status_code == 200
    assert response.json()["models"][0]["routing_overlay_fields"] == ["priority"]
    body = {"expected_revision": response.json()["revision"], "credential": {"action": "set", "value": "fake-new-management"}}
    rotated = request(app, "PUT", "/v1/gateway-credential", headers=headers(config), json=body)
    assert rotated.status_code == 200
    assert rotated.json()["models"][0]["routing_overlay_fields"] == ["priority"]
    assert path.read_bytes() == before


@pytest.mark.parametrize("patch", [
    {"upstream_model": "renamed"}, {"provider": "other"}, {"enabled": 1},
    {"display_name": ""}, {"priority": True}, {"priority": 1.5}, {"quality": 1.1},
    {"context_window": 100, "max_output_tokens": 101}, {"max_output_tokens": True},
    {"cost": {"input_per_million": 1, "output_per_million": 2, "cache_read_per_million": -1}},
    {"cost": {"input_per_million": 1, "output_per_million": 2, "cache_write_per_million": float("inf")}},
    {"cost": {"input_per_million": None, "output_per_million": 2}},
])
def test_invalid_whole_record_leaves_bytes_unchanged(tmp_path: Path, patch: dict[str, Any]) -> None:
    current = service(tmp_path)
    entry = {**model("vendor/only"), **patch}
    before = current.models_file.read_bytes()
    with pytest.raises((ValueError, TypeError)):
        current.command(update(current, entry), apply=True)
    assert current.models_file.read_bytes() == before


def test_model_edit_rollback_and_preserved_confirmation(tmp_path: Path) -> None:
    current = service(tmp_path)
    entry = model("vendor/only")
    entry["metadata"] = {"version": 1, "fields": {"cache_read_per_million": {"status": "confirmed", "value": 0}}}
    entry["cost"]["cache_read_per_million"] = 0
    current.command(update(current, entry), apply=True)
    before = current.models_file.read_bytes()
    edited = copy.deepcopy(entry)
    edited.pop("metadata")
    edited["cost"]["cache_read_per_million"] = 1
    with pytest.raises(ValueError, match="Confirmed metadata"):
        current.command(update(current, edited), apply=True)
    assert current.models_file.read_bytes() == before
    def fail(_catalog: Any, _registry: Any) -> None:
        raise RuntimeError("synthetic activation failure")
    with pytest.raises(RuntimeError):
        current.command(update(current, entry), apply=True, activate=fail)
    assert current.models_file.read_bytes() == before


def test_disabled_default_assignment_is_rejected_but_catalog_remains_editable(tmp_path: Path) -> None:
    current = service(tmp_path)
    current.command(update(current, {**model("vendor/only"), "enabled": False}), apply=True)
    before = current.models_file.read_bytes()
    body = {"expected_revision": revision(current.models_file), "operations": [{"action": "set_default_model", "model": "test-provider/vendor/only"}]}
    with pytest.raises(ValueError, match="enabled"):
        current.command(body, apply=True)
    assert current.models_file.read_bytes() == before


@pytest.mark.parametrize("preview", [False, True])
def test_disabled_explicit_automatic_default_and_pinned_models(preview: bool) -> None:
    document = catalog_document(mode="sticky")
    engine = RoutingEngine(catalog_from_document(document, "fixture"))
    decision = engine.decide(messages=turns("hello"), requested_model=SMALL_MODEL_ID, session_id="pin")
    assert decision.route_name == SMALL_MODEL_ID
    document["models"][0]["enabled"] = False
    document["defaults"] = {"default_model": LARGE_MODEL_ID}
    engine.catalog = catalog_from_document(document, "fixture")
    route = engine.preview if preview else engine.decide
    with pytest.raises(UnknownModelError):
        route(messages=turns("hello"), requested_model=SMALL_MODEL_ID)
    selected = route(messages=turns("hello", "again"), session_id="pin")
    assert (selected["route"] if isinstance(selected, dict) else selected.route_name) == LARGE_MODEL_ID
    assert not setup_projection(replace(engine.catalog, profiles=tuple(p for p in engine.catalog.profiles if not p.enabled)), "revision")["routing_ready"]
    document["defaults"] = {"default_model": SMALL_MODEL_ID}
    document["policy"]["tier_models"] = {"simple": [], "standard": [], "complex": []}
    engine.catalog = catalog_from_document(document, "fixture")
    with pytest.raises(SetupIncompleteError):
        route(messages=turns("hello"))


@pytest.mark.parametrize("code,status", [("authentication_failed", "authentication_error"), ("invalid_url", "address_error"), ("blocked_target", "address_error"), ("redirect_rejected", "address_error"), ("dns_failed", "network_error"), ("timeout", "network_error"), ("invalid_response", "incomplete")])
def test_connection_status_uses_safe_discovery_categories(monkeypatch: Any, code: str, status: str) -> None:
    monkeypatch.setattr(model_discovery, "discover_models", lambda *_args, **_kwargs: {"warnings": [code], "items": [], "complete": False})
    result = model_discovery.test_provider_connection({"id": "test", "type": "openai"}, "synthetic")
    assert result["status"] == status and result["scope"] == "model_listing"
    assert "synthetic" not in str(result)


def test_connection_http_auth_scope_and_no_configuration_write(tmp_path: Path, monkeypatch: Any) -> None:
    app, config = fixture_app(tmp_path)
    before = config.models_file.read_bytes()
    calls: list[Any] = []
    def fetch(_url: str, **kwargs: Any) -> Any:
        calls.append(kwargs)
        from jev_gateway.discovery_network import JsonResponse
        return JsonResponse({"data": [{"id": "vendor/model"}]})
    monkeypatch.setattr(model_discovery, "safe_get_json", fetch)
    forbidden = request(app, "POST", "/v1/provider-connection-test", json={"provider_id": "test-provider"})
    assert forbidden.status_code == 401 and not calls
    response = request(app, "POST", "/v1/provider-connection-test", headers=headers(config), json={"provider_id": "test-provider"})
    assert response.status_code == 200
    assert response.json()["status"] == "success" and response.json()["model_count"] == 1
    assert config.models_file.read_bytes() == before
    assert not (tmp_path / "models.json.bak").exists()


def test_http_whole_model_revision_and_authorization(tmp_path: Path) -> None:
    app, config = fixture_app(tmp_path)
    current = ProviderConfiguration(config.models_file)
    body = update(current, {**model("vendor/only"), "display_name": "Edited model"})
    before = config.models_file.read_bytes()
    assert request(app, "PUT", "/v1/provider-configuration", json=body).status_code == 401
    assert config.models_file.read_bytes() == before
    checked = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=body)
    assert checked.status_code == 200 and config.models_file.read_bytes() == before
    applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
    assert applied.status_code == 200
    assert config.engine.catalog.profiles[0].display_name == "Edited model"
    assert request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body).status_code == 409


def test_connection_incomplete_and_unsupported_do_not_probe(monkeypatch: Any) -> None:
    monkeypatch.setattr(model_discovery, "discover_models", lambda *_args, **_kwargs: pytest.fail("Unexpected probe"))
    unsupported = model_discovery.test_provider_connection({"id": "p", "type": "vertex_ai"}, None)
    assert unsupported["status"] == "unsupported"
    incomplete = model_discovery.test_provider_connection({"id": "p", "type": "openai", "api_key_env": "MISSING"}, None)
    assert incomplete["status"] == "incomplete"


def test_cache_source_units_applicability_unknown_and_confirmation() -> None:
    sources = [
        model_metadata._models_dev({"cost": {"cache_read": 0, "cache_write": None}}, "models_dev", "openai", "exact", "2026-01-01", True),
        model_metadata._openrouter({"pricing": {"input_cache_read": "0.0000002", "input_cache_write": "0.000003", "input_cache_write_1h": "0.000006"}}, "exact", "2026-01-01"),
        model_metadata._litellm({"cache_read_input_token_cost": 0.0000002, "cache_creation_input_token_cost": 0.000003}, "openai", "exact", "2026-01-01", True),
    ]
    assert sources[0]["fields"]["cache_read_per_million"]["value"] == 0
    assert sources[0]["fields"]["cache_write_per_million"]["value"] is None
    for source in sources[1:]:
        assert source["fields"]["cache_read_per_million"]["value"] == pytest.approx(0.2)
        assert source["fields"]["cache_write_per_million"]["value"] == pytest.approx(3)
        assert source["fields"]["cache_read_per_million"]["source_unit"] == "USD/token"
    assert sources[1]["pricing"]["input_cache_write_1h"]["value"] == 6
    merged = model_metadata._merge_candidates(sources, [])
    envelope = metadata_envelope(merged)
    assert envelope["fields"]["cache_read_per_million"]["status"] == "conflict"
    sources[1]["applicable"] = False
    reference = model_metadata._merge_candidates([sources[1]], [])
    assert reference["fields"]["cache_read_per_million"] is None
    assert "reference_only" in reference["warnings"]
