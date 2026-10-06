"""Direct transport credential transactions and isolated candidates."""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path
from typing import Any

import pytest

from jev_gateway.credentials import credential_path, credential_snapshot
from jev_gateway.provider_config import RevisionConflict, revision
from jev_gateway.routing_overlay import overlay_path
from tests.test_provider_config import service, upsert, model
from tests.test_provider_config_regressions import fixture_app, edit
from tests.test_provider_management_api import request, headers


def transport_body(current: Any, action: dict[str, Any]) -> dict[str, Any]:
    body = upsert(current, type="vertex_ai", param_env={"vertex_credentials": "VERTEX_LOCAL"})
    body["operations"][0]["transport_credentials"] = {"vertex_credentials": action}
    return body


def test_transport_set_keep_clear_and_inherited_presence(tmp_path: Path) -> None:
    current = service(tmp_path)
    current.external = {"VERTEX_LOCAL": "inherited-synthetic"}
    dotenv = tmp_path / ".env"
    dotenv.write_text("VERTEX_LOCAL=old-local\nUNRELATED=retained\n")
    body = transport_body(current, {"action": "set", "value": "literal-${UNCHANGED}"})
    before = current.models_file.read_bytes(), dotenv.read_bytes()
    result = current.command(body)
    assert (current.models_file.read_bytes(), dotenv.read_bytes()) == before
    assert "literal-${UNCHANGED}" not in json.dumps(result)
    current.command(body, apply=True)
    assert credential_snapshot(current.models_file, external=current.external)["VERTEX_LOCAL"] == "literal-${UNCHANGED}"
    assert stat.S_IMODE(credential_path(current.models_file).stat().st_mode) == 0o600
    assert current.read()["providers"][0]["transport_credential_presence"] == {"vertex_credentials": True}
    saved = credential_path(current.models_file).read_bytes(), dotenv.read_bytes()
    current.command(transport_body(current, {"action": "keep"}), apply=True)
    assert (credential_path(current.models_file).read_bytes(), dotenv.read_bytes()) == saved
    current.command(transport_body(current, {"action": "clear"}), apply=True)
    assert "VERTEX_LOCAL" not in json.loads(credential_path(current.models_file).read_text())["values"]
    assert dotenv.read_text() == "UNRELATED=retained\n"
    assert current.read()["providers"][0]["transport_credential_presence"]["vertex_credentials"] is True
    with pytest.raises(RevisionConflict):
        current.command(body, apply=True)


@pytest.mark.parametrize("sharing", ["primary", "parameter", "later"])
def test_exact_binding_exclusion_retains_other_consumers(tmp_path: Path, sharing: str) -> None:
    current = service(tmp_path)
    body = transport_body(current, {"action": "set", "value": "synthetic-secret"})
    provider = body["operations"][0]["provider"]
    if sharing == "primary":
        provider["api_key_env"] = "VERTEX_LOCAL"
    elif sharing == "parameter":
        provider["param_env"]["aws_session_token"] = "VERTEX_LOCAL"
    else:
        body["operations"].append({"action": "upsert", "kind": "llm", "provider": {"id": "later", "type": "vertex_ai", "api_key_env": "VERTEX_LOCAL"}, "credential": {"action": "keep"}})
    before = current.models_file.read_bytes()
    with pytest.raises(ValueError, match="shared"):
        current.command(body, apply=True)
    assert current.models_file.read_bytes() == before
    assert not credential_path(current.models_file).exists()


@pytest.mark.parametrize("actions", [None, [], {"unknown": {"action": "keep"}}, {"vertex_credentials": {"action": "set"}}, {"vertex_credentials": {"action": "keep", "value": "x"}}, {"vertex_credentials": {"action": "clear", "extra": True}}, {"vertex_credentials": {"action": "set", "value": "x" * 8193}}, {"vertex_credentials": {"action": "set", "value": "\n"}}])
def test_invalid_transport_actions_never_write(tmp_path: Path, actions: Any) -> None:
    current = service(tmp_path)
    body = transport_body(current, {"action": "keep"})
    body["operations"][0]["transport_credentials"] = actions
    before = current.models_file.read_bytes()
    with pytest.raises((ValueError, TypeError)):
        current.command(body, apply=True)
    assert current.models_file.read_bytes() == before
    with pytest.raises((ValueError, TypeError)):
        current.discovery_provider({"provider": body["operations"][0]["provider"], "transport_credentials": actions})


def test_candidate_actions_preserve_files_and_process(tmp_path: Path) -> None:
    current = service(tmp_path)
    before = current.models_file.read_bytes(), dict(os.environ)
    operation = transport_body(current, {"action": "set", "value": "candidate-only"})["operations"][0]
    provider, key, _ = current.discovery_provider({"provider": operation["provider"], "transport_credentials": operation["transport_credentials"]})
    assert "candidate-only" not in json.dumps(provider)
    assert key != "candidate-only"
    assert (current.models_file.read_bytes(), dict(os.environ)) == before
    assert not credential_path(current.models_file).exists()


def test_transport_activation_failure_restores_store_and_baseline(tmp_path: Path) -> None:
    current = service(tmp_path)
    body = transport_body(current, {"action": "set", "value": "rollback-synthetic"})
    before = current.models_file.read_bytes()
    def fail(_catalog: Any, _registry: Any) -> None:
        raise RuntimeError("synthetic activation failure")
    with pytest.raises(RuntimeError):
        current.command(body, apply=True, activate=fail)
    assert current.models_file.read_bytes() == before
    assert not credential_path(current.models_file).exists()


def test_transport_write_failure_restores_local_sources(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from jev_gateway import config_transaction
    current = service(tmp_path)
    current.command(transport_body(current, {"action": "set", "value": "existing-synthetic"}), apply=True)
    (tmp_path / ".env").write_text("VERTEX_LOCAL=dotenv-synthetic\n")
    before = {p.name: p.read_bytes() for p in tmp_path.iterdir() if p.is_file()}
    original = config_transaction.atomic_bytes
    count = 0
    def fault(path: Path, data: bytes | None, *, protected: bool = False) -> None:
        nonlocal count
        count += 1
        if count == 4:
            raise OSError("synthetic write failure")
        original(path, data, protected=protected)
    monkeypatch.setattr(config_transaction, "atomic_bytes", fault)
    with pytest.raises(OSError):
        current.command(transport_body(current, {"action": "clear"}), apply=True)
    assert all((tmp_path / name).read_bytes() == content for name, content in before.items())


@pytest.mark.parametrize("bindings", [{"vertex_credentials": "invalid-ref"}, {"vertex_credentials": "X" * 257}, {}])
def test_invalid_declared_binding_rejected(tmp_path: Path, bindings: dict[str, str]) -> None:
    current = service(tmp_path)
    body = transport_body(current, {"action": "keep"})
    body["operations"][0]["provider"]["param_env"] = bindings
    with pytest.raises(ValueError):
        current.command(body, apply=True)


def test_decision_transport_actions_and_extra_selector_fields_rejected(tmp_path: Path) -> None:
    current = service(tmp_path)
    body = transport_body(current, {"action": "keep"})
    body["operations"][0]["kind"] = "decision"
    with pytest.raises(ValueError):
        current.command(body, apply=True)
    with pytest.raises(ValueError):
        current.discovery_provider({"provider_id": "test-provider", "unexpected": True})


def test_signed_priority_read_update_and_overlay(tmp_path: Path) -> None:
    current = service(tmp_path)
    document = json.loads(current.models_file.read_text())
    document["models"][0]["priority"] = -7
    current.models_file.write_text(json.dumps(document))
    assert current.read()["models"][0]["priority"] == -7
    overlay_path(current.models_file).write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {"test-provider/vendor/only": {"priority": -11}}}))
    body = {"expected_revision": revision(current.models_file), "operations": [{"action": "update_model", "model_id": "test-provider/vendor/only", "model": model("vendor/only")}]}
    assert current.command(body, apply=True)["models"][0]["priority"] == -11
    assert json.loads(current.models_file.read_text())["models"][0]["priority"] == -7


def test_cloud_asgi_set_safe_get_reload_and_nonmutating_queries(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from jev_gateway import model_metadata
    app, config = fixture_app(tmp_path)
    bindings = {name: f"CLOUD_{index}" for index, name in enumerate(("aws_access_key_id", "aws_secret_access_key", "aws_session_token"))}
    body = edit(app, config, {"action": "keep"}, type="bedrock", param_env=bindings)
    actions = {name: {"action": "set", "value": f"synthetic-{name}"} for name in bindings}
    body["operations"][0]["transport_credentials"] = actions
    before = {p.name: p.read_bytes() for p in tmp_path.iterdir() if p.is_file()}
    validated = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=body)
    assert validated.status_code == 200
    assert {p.name: p.read_bytes() for p in tmp_path.iterdir() if p.is_file()} == before
    applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
    assert applied.status_code == 200
    for response in (validated, applied, request(app, "GET", "/v1/provider-configuration", headers=headers(config))):
        assert all(action["value"] not in response.text for action in actions.values())
        assert response.json()["providers"][0]["transport_credential_presence"] == dict.fromkeys(bindings, True)
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    assert config.engine.catalog.providers[0].resolved_params["aws_secret_access_key"] == "synthetic-aws_secret_access_key"
    saved = {p.name: p.read_bytes() for p in tmp_path.iterdir() if p.is_file()}
    selector = {"provider_id": "test-provider", "transport_credentials": {name: {"action": "clear"} for name in bindings}}
    for endpoint in ("provider-discovery", "provider-connection-test"):
        result = request(app, "POST", f"/v1/{endpoint}", headers=headers(config), json=selector)
        assert result.status_code == 200
        assert "synthetic-aws" not in result.text
    def public_lookup(provider: Any, models: Any, *, refresh: bool) -> dict[str, Any]:
        assert "synthetic-" not in json.dumps(provider)
        assert "transport_credentials" not in provider
        return {"items": [], "warnings": []}
    monkeypatch.setattr(model_metadata, "lookup_model_metadata", public_lookup)
    assert request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={**selector, "upstream_models": ["fixture"]}).status_code == 200
    assert {p.name: p.read_bytes() for p in tmp_path.iterdir() if p.is_file()} == saved
