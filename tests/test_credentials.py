"""Literal credential files, provisioning, and write-only gateway authentication."""

from __future__ import annotations

import asyncio
import json
import os
import stat
import sqlite3
import sys
from dataclasses import FrozenInstanceError
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from jev_gateway import config_transaction, gateway
from jev_gateway.catalog import catalog_from_document, gateway_from_dict, load_catalog
from jev_gateway.cli.install_state import init_runtime
from jev_gateway.cli.main import main
from jev_gateway.cli.output import CliError
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.providers import login, logout
from jev_gateway.credentials import CredentialSnapshot, credential_path, credential_snapshot, credential_update, credential_values, env_update
from jev_gateway.provider_config import ProviderConfiguration, revision
from jev_gateway.setup import ManagementSetup
from jev_gateway.strategy.decision_provider import DecisionClient
from tests.helpers import single_route_document


def send(app: Any, method: str, path: str, *, peer: str = "127.0.0.1", base_url: str = "http://127.0.0.1:8000", **kwargs: Any) -> httpx.Response:
    async def run() -> httpx.Response:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=(peer, 1234)), base_url=base_url) as client:
            return await client.request(method, path, **kwargs)
    return asyncio.run(run())


def setup(tmp_path: Path, *, host: str = "127.0.0.1", values: dict[str, str] | None = None, reference: str | None = None) -> tuple[Any, gateway.GatewayConfig]:
    document = single_route_document()
    document["providers"][0]["api_key_env"] = "FILE_LLM_KEY"
    document["gateway"] = {"host": host}
    if reference:
        document["gateway"]["api_key_env"] = reference
    path = tmp_path / "models.json"
    path.write_text(json.dumps(document))
    credential_path(path).write_text(json.dumps({"version": 1, "values": values or {}}))
    config = gateway.load_gateway_config(path)
    return gateway.create_app(config), config


def operation(token: str, value: str = "fake-gateway-key") -> dict[str, Any]:
    return {"expected_revision": token, "credential": {"action": "set", "value": value}}


def test_snapshot_precedence_literals_immutability_and_revision(tmp_path: Path) -> None:
    path = tmp_path / "models.json"
    (tmp_path / ".env").write_text("BASE=legacy\nKEY=${BASE}\nLEGACY=${BASE}\n")
    literal = " fake-${BASE}-$cash-'quote'-\\tail "
    credential_path(path).write_bytes(credential_update(None, "KEY", literal))
    before = dict(os.environ)
    snapshot = credential_snapshot(path, external={"BASE": "process", "KEY": "process", "EXTERNAL": "inherited"})
    assert dict(snapshot) == {"BASE": "legacy", "KEY": literal, "LEGACY": "legacy", "EXTERNAL": "inherited"}
    assert snapshot.literal_references == frozenset({"KEY"})
    with pytest.raises(TypeError):
        snapshot["KEY"] = "changed"  # type: ignore[index]
    token = revision(path)
    credential_path(path).write_bytes(credential_update(None, "KEY", "changed"))
    assert revision(path) != token
    assert snapshot["KEY"] == literal
    assert os.environ == before


def test_credential_snapshot_overlay_is_immutable_and_preserves_literal_origins(tmp_path: Path) -> None:
    path = tmp_path / "models.json"
    literal = "  synthetic-json-key  "
    snapshot = credential_snapshot(path, external={"LEGACY": "  synthetic-legacy-key  "}, credential_content=credential_update(None, "JSON_KEY", literal))
    pending = "  synthetic-${NAME}-pending-key  "
    overlay = snapshot.with_value("PENDING", pending)
    assert dict(snapshot) == {"LEGACY": "  synthetic-legacy-key  ", "JSON_KEY": literal}
    assert overlay == {**dict(snapshot), "PENDING": pending}
    assert overlay.get("PENDING") == pending
    assert snapshot.literal_references == frozenset({"JSON_KEY"})
    assert overlay.literal_references == frozenset({"JSON_KEY", "PENDING"})
    for current in (snapshot, overlay):
        with pytest.raises(TypeError):
            current["LEGACY"] = "changed"  # type: ignore[index]
        with pytest.raises(FrozenInstanceError):
            setattr(current, "literal_references", frozenset())
        with pytest.raises(ValueError, match="visible ASCII characters without whitespace"):
            gateway_from_dict({"api_key_env": "JSON_KEY"}, "fixture", current)
        assert gateway_from_dict({"api_key_env": "LEGACY"}, "fixture", current).api_key == "synthetic-legacy-key"
    replaced = snapshot.with_value("LEGACY", pending)
    assert replaced.literal_references == frozenset({"JSON_KEY", "LEGACY"})
    with pytest.raises(ValueError, match="visible ASCII characters without whitespace"):
        gateway_from_dict({"api_key_env": "LEGACY"}, "fixture", replaced)
    mutable = {"KEY": literal}
    copied = CredentialSnapshot(mutable, frozenset({"KEY"}))
    mutable["KEY"] = "changed"
    assert copied["KEY"] == literal
    with pytest.raises(TypeError):
        copied._values["KEY"] = "changed"  # type: ignore[index]


@pytest.mark.parametrize("source", ["dotenv", "captured", "process"])
def test_legacy_gateway_padding_is_trimmed_only_on_gateway_resolution(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, source: str) -> None:
    reference = "LEGACY_GATEWAY_KEY"
    raw = " \t synthetic-review-key \t "
    document = single_route_document()
    document["gateway"] = {"api_key_env": reference}
    document["providers"][0].update({"api_key_env": reference, "param_env": {"organization": reference}})
    document["decision"] = {"enabled": True, "providers": [{"id": "one", "protocol": "system_one", "api_base": "https://decision.example/evaluate", "api_key_env": reference}]}
    path = tmp_path / "models.json"
    path.write_text(json.dumps(document))
    env_path = tmp_path / ".env"
    legacy = f"KEEP='untouched'\r\n{reference}='{raw}'\r\n".encode() if source == "dotenv" else b"KEEP='untouched'\r\n"
    env_path.write_bytes(legacy)
    env_path.chmod(0o640)
    store = credential_path(path)
    store.write_bytes(b'{"version":1,"values":{}}\n')
    store.chmod(0o600)
    monkeypatch.setenv(reference, raw if source == "process" else "synthetic-other-process-key")
    external = {reference: raw if source == "captured" else "synthetic-external-key"} if source != "process" else None
    original_environment = dict(os.environ)
    before = {item: (item.read_bytes(), stat.S_IMODE(item.stat().st_mode)) for item in (path, env_path, store)}

    snapshot = credential_snapshot(path, external=external)
    assert snapshot.get(reference) == raw
    assert dict(snapshot)[reference] == raw
    with pytest.raises(TypeError):
        snapshot[reference] = "changed"  # type: ignore[index]
    catalog = catalog_from_document(document, "fixture", snapshot)
    assert catalog.gateway.api_key == "synthetic-review-key"
    assert catalog.providers[0].api_key == raw
    assert catalog.providers[0].resolved_params["organization"] == raw
    assert catalog.decision.credentials is not None and catalog.decision.credentials[reference] == raw
    assert not ManagementSetup(path, external=external).read()["required"]
    if source != "captured":
        assert load_catalog(path).gateway.api_key == "synthetic-review-key"
        config = gateway.load_gateway_config(path)
        app = gateway.create_app(config)
        auth = {"Authorization": "Bearer synthetic-review-key"}
        assert send(app, "GET", "/healthz", headers=auth).status_code == 200
        assert send(app, "GET", "/v1/setup", headers=auth).json()["required"] is False
        assert send(app, "GET", "/v1/provider-configuration", headers=auth).status_code == 200
        assert send(app, "POST", "/v1/routing/reload", headers=auth).status_code == 200
        assert config.gateway_api_key == "synthetic-review-key"
    assert snapshot.get(reference) == raw
    assert {item: (item.read_bytes(), stat.S_IMODE(item.stat().st_mode)) for item in before} == before
    assert os.environ == original_environment


def test_gateway_default_process_resolution_keeps_legacy_trimming(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEGACY_GATEWAY_KEY", "  synthetic-review-key  ")
    original_environment = dict(os.environ)
    assert gateway_from_dict({"api_key_env": "LEGACY_GATEWAY_KEY"}, "fixture").api_key == "synthetic-review-key"
    assert os.environ == original_environment


@pytest.mark.parametrize("legacy", [None, "  synthetic-legacy-key  "])
@pytest.mark.parametrize("value", ["synthetic-json-key", "  synthetic-json-key  ", "synthetic json-key"])
def test_json_gateway_values_remain_literal_and_override_legacy(tmp_path: Path, value: str, legacy: str | None) -> None:
    path = tmp_path / "models.json"
    reference = "LITERAL_GATEWAY_KEY"
    if legacy is not None:
        (tmp_path / ".env").write_text(f"{reference}='{legacy}'\n")
    store = credential_path(path)
    store.write_bytes(credential_update(None, reference, value))
    before = store.read_bytes()
    snapshot = credential_snapshot(path, external={reference: "synthetic-external-key"})
    assert snapshot.get(reference) == value
    if " " in value:
        with pytest.raises(ValueError, match="visible ASCII characters without whitespace"):
            gateway_from_dict({"api_key_env": reference}, "fixture", snapshot)
    else:
        assert gateway_from_dict({"api_key_env": reference}, "fixture", snapshot).api_key == value
    assert store.read_bytes() == before


def test_plain_credential_mapping_retains_literal_gateway_value() -> None:
    with pytest.raises(ValueError, match="visible ASCII characters without whitespace"):
        gateway_from_dict({"api_key_env": "GATEWAY_KEY"}, "fixture", {"GATEWAY_KEY": "  synthetic-review-key  "})


@pytest.mark.parametrize("source", ["dotenv", "captured", "process", "plain", "default"])
@pytest.mark.parametrize("value", [None, "", " \t ", "synthetic review-key", "synthetic\treview-key"])
def test_gateway_legacy_normalization_keeps_missing_and_inner_whitespace_strict(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, source: str, value: str | None) -> None:
    reference = "INVALID_GATEWAY_KEY"
    path = tmp_path / "models.json"
    values = {} if value is None else {reference: value}
    monkeypatch.delenv(reference, raising=False)
    if source in {"process", "default"} and value is not None:
        monkeypatch.setenv(reference, value)
    if source == "dotenv" and value is not None:
        (tmp_path / ".env").write_text(f"{reference}='{value}'\n")
    credentials = (None if source == "default" else values if source == "plain" else
                   credential_snapshot(path, external=None if source == "process" else values if source == "captured" else {}))
    expected = "gateway.*not set" if value is None or not value.strip() else "visible ASCII characters without whitespace"
    with pytest.raises(ValueError, match=expected):
        gateway_from_dict({"api_key_env": reference}, "fixture", credentials)


@pytest.mark.parametrize("content", [
    b"{malformed-secret", b"[]", b'{"version":true,"values":{}}', b'{"version":2,"values":{}}',
    b'{"version":1,"values":{},"secret":"fake"}', b'{"version":1,"values":{"KEY":12}}',
    b'{"version":1,"values":{"KEY":""}}', b'{"version":1,"values":{"KEY":"  "}}',
    b'{"version":1,"values":{"BAD-NAME":"fake"}}', b'{"version":1,"values":{"KEY":"fake\\nsecret"}}',
    b'{"version":1,"values":{"KEY":"fake","KEY":"duplicate"}}', b"\xff", b" " * (1024 * 1024 + 1),
    json.dumps({"version": 1, "values": {"KEY": "x" * 8193}}).encode(),
    b'{"version":1,"values":{"KEY":"\\ud800"}}',
])
def test_invalid_credential_files_have_fixed_errors(tmp_path: Path, content: bytes) -> None:
    credential_path(tmp_path / "models.json").write_bytes(content)
    with pytest.raises(ValueError, match=r"^Credential file is invalid\.$"):
        credential_snapshot(tmp_path / "models.json")


def test_default_parser_strict_and_file_only_loads(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    document = single_route_document()
    document["providers"][0]["api_key_env"] = "FILE_LLM_KEY"
    document["gateway"] = {"api_key_env": "FILE_GATEWAY_KEY"}
    document["decision"] = {"enabled": True, "providers": [{"id": "one", "protocol": "system_one", "api_base": "https://decision.example/evaluate", "api_key_env": "FILE_DECISION_KEY"}]}
    path = tmp_path / "models.json"
    path.write_text(json.dumps(document))
    with pytest.raises(ValueError, match="not set"):
        catalog_from_document(document, "fixture", {})
    assert not catalog_from_document(document, "fixture", {"FILE_GATEWAY_KEY": "fake-gateway"}, allow_missing_credentials=True).providers[0].api_key
    with pytest.raises(ValueError, match="gateway.*not set"):
        catalog_from_document(document, "fixture", {}, allow_missing_credentials=True)
    values = {"FILE_LLM_KEY": "fake-llm", "FILE_GATEWAY_KEY": "fake-gateway", "FILE_DECISION_KEY": "fake-decision"}
    credential_path(path).write_text(json.dumps({"version": 1, "values": values}))
    catalog = load_catalog(path)
    assert catalog.providers[0].api_key == "fake-llm"
    assert catalog.gateway.api_key == "fake-gateway"
    from jev_gateway.strategy import decision_provider
    observed: list[str] = []
    class Adapter:
        def evaluate(self, provider: Any, api_key: str, timeout: float, state: Any, questions: Any) -> None:
            observed.append(api_key)
    monkeypatch.setitem(decision_provider._ADAPTERS, "system_one", Adapter())
    DecisionClient(catalog.decision).evaluate("fixture", {})
    assert observed == ["fake-decision"]
    config = gateway.load_gateway_config(path)
    app = gateway.create_app(config)
    assert send(app, "GET", "/healthz").status_code == 401
    assert send(app, "GET", "/healthz", headers={"Authorization": "Bearer fake-gateway"}).status_code == 200
    for secret in values.values():
        assert secret not in json.dumps(catalog.as_dict())


def test_missing_declared_gateway_key_rejects_startup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FILE_GATEWAY_KEY", raising=False)
    _app, config = setup(tmp_path, values={"FILE_GATEWAY_KEY": "fake-gateway"}, reference="FILE_GATEWAY_KEY")
    credential_path(config.models_file).write_bytes(credential_update(None, "FILE_LLM_KEY", "fake-llm"))
    with pytest.raises(ValueError, match="gateway.*not set"):
        gateway.load_gateway_config(config.models_file)


@pytest.mark.parametrize("action", ["keep", "set"])
def test_missing_disk_gateway_key_cannot_disable_active_auth(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, action: str) -> None:
    monkeypatch.delenv("FILE_GATEWAY_KEY", raising=False)
    app, config = setup(tmp_path, values={"FILE_GATEWAY_KEY": "fake-gateway", "FILE_LLM_KEY": "fake-llm"}, reference="FILE_GATEWAY_KEY")
    previous_catalog = config.engine.catalog
    previous_registry = config.engine.strategies
    credential_path(config.models_file).write_bytes(credential_update(None, "FILE_LLM_KEY", "fake-llm"))
    before = config.models_file.read_bytes(), credential_path(config.models_file).read_bytes()
    auth = {"Authorization": "Bearer fake-gateway"}
    reload = send(app, "POST", "/v1/routing/reload", headers=auth)
    assert reload.status_code == 400 and reload.json()["error"]["code"] == "invalid_configuration"
    provider = json.loads(config.models_file.read_text())["providers"][0]
    credential = {"action": action, **({"value": "fake-replacement"} if action == "set" else {})}
    body = {"expected_revision": revision(config.models_file), "operations": [{"action": "upsert", "kind": "llm", "provider": provider, "credential": credential}]}
    for method, path in (("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")):
        result = send(app, method, path, headers=auth, json=body)
        assert result.status_code == 400 and result.json()["error"]["code"] == "invalid_configuration"
        assert "fake-gateway" not in result.text and "fake-replacement" not in result.text
        assert config.engine.catalog is previous_catalog
        assert config.engine.strategies is previous_registry
        assert config.gateway_api_key == "fake-gateway"
        assert (config.models_file.read_bytes(), credential_path(config.models_file).read_bytes()) == before
    assert send(app, "GET", "/healthz", headers=auth).status_code == 200
    assert send(app, "GET", "/v1/models", headers=auth).status_code == 200
    for path in ("/healthz", "/v1/models", "/v1/provider-configuration"):
        assert send(app, "GET", path).status_code == 401
    assert not (tmp_path / ".provider-configuration.recovery").exists()


def test_bootstrap_and_rotation_activate_immediately_without_readback(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    app, config = setup(tmp_path)
    before = dict(os.environ)
    initial = send(app, "GET", "/v1/provider-configuration").json()
    assert initial["gateway"] == {"api_key_env": None, "has_api_key": False}
    assert initial["gateway_bootstrap_available"] and not initial["write_available"]
    assert send(app, "PUT", "/v1/provider-configuration", json={}).status_code == 403
    applied = send(app, "PUT", "/v1/gateway-credential", json=operation(initial["revision"]), headers={"Origin": "http://127.0.0.1:8000"})
    assert applied.status_code == 200
    result = applied.json()
    assert result["valid"] and result["applied"] and result["write_available"]
    assert result["gateway"] == {"api_key_env": "JEV_GATEWAY_API_KEY", "has_api_key": True}
    assert not result["gateway_bootstrap_available"]
    assert "fake-gateway-key" not in applied.text
    assert send(app, "GET", "/healthz").status_code == 401
    auth = {"Authorization": "Bearer fake-gateway-key"}
    assert send(app, "PUT", "/v1/gateway-credential", json=operation(result["revision"], "fake-rotated")).status_code == 401
    rotated = send(app, "PUT", "/v1/gateway-credential", json=operation(result["revision"], "fake-rotated"), headers=auth)
    assert rotated.status_code == 200
    assert send(app, "GET", "/healthz", headers=auth).status_code == 401
    assert send(app, "GET", "/healthz", headers={"Authorization": "Bearer fake-rotated"}).status_code == 200
    assert gateway.load_gateway_config(config.models_file).gateway_api_key == "fake-rotated"
    assert os.environ == before
    assert "fake-gateway-key" not in caplog.text and "fake-rotated" not in caplog.text
    for name in ("credentials.json", "credentials.json.backup"):
        assert stat.S_IMODE((tmp_path / name).stat().st_mode) == 0o600
    assert credential_values((tmp_path / "credentials.json.backup").read_bytes())["JEV_GATEWAY_API_KEY"] == "fake-gateway-key"


@pytest.mark.parametrize("host,peer,url,headers", [
    ("0.0.0.0", "127.0.0.1", "http://127.0.0.1:8000", {}),
    ("::", "::1", "http://[::1]:8000", {}),
    ("127.0.0.1", "192.0.2.5", "http://127.0.0.1:8000", {}),
    ("127.0.0.1", "127.0.0.1", "http://evil.example:8000", {}),
    ("127.0.0.1", "127.0.0.1", "http://127.0.0.1:8000", {"Origin": "http://evil.example"}),
    ("127.0.0.1", "127.0.0.1", "http://127.0.0.1:8000", {"Origin": "null"}),
    ("127.0.0.1", "127.0.0.1", "http://127.0.0.1:8000", {"Origin": "http://127.0.0.1:9000"}),
    ("127.0.0.1", "127.0.0.1", "http://127.0.0.1:8000", {"Host": "localhost.evil"}),
    ("127.0.0.1", "127.0.0.1", "http://127.0.0.1:8000", {"Host": "localhost\t"}),
    ("127.0.0.1", "127.0.0.1", "http://127.0.0.1:8000", {"Forwarded": "for=127.0.0.1"}),
    ("127.0.0.1", "127.0.0.1", "http://127.0.0.1:8000", {"X-Forwarded-Host": "localhost"}),
    ("127.0.0.1", "127.0.0.1", "http://127.0.0.1:8000", {"X-Forwarded-For": "127.0.0.1"}),
])
def test_untrusted_bootstrap_rejected_without_writes(tmp_path: Path, host: str, peer: str, url: str, headers: dict[str, str]) -> None:
    app, config = setup(tmp_path, host=host)
    initial = send(app, "GET", "/v1/provider-configuration", peer=peer, base_url=url, headers=headers).json()
    assert not initial["gateway_bootstrap_available"]
    before = config.models_file.read_bytes(), credential_path(config.models_file).read_bytes()
    response = send(app, "PUT", "/v1/gateway-credential", peer=peer, base_url=url, headers=headers, json=operation(initial["revision"]))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "gateway_bootstrap_unavailable"
    assert (config.models_file.read_bytes(), credential_path(config.models_file).read_bytes()) == before


@pytest.mark.parametrize("value", ["", " ", "fake secret", "fake\tsecret", "fake\nsecret", "fake\x00secret", "fake-é", "x" * 8193])
def test_gateway_invalid_secret_is_fixed_and_nonmutating(tmp_path: Path, value: str) -> None:
    app, config = setup(tmp_path)
    before = config.models_file.read_bytes(), credential_path(config.models_file).read_bytes()
    response = send(app, "PUT", "/v1/gateway-credential", json=operation(revision(config.models_file), value))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_gateway_credential"
    assert "fake" not in response.text
    assert (config.models_file.read_bytes(), credential_path(config.models_file).read_bytes()) == before


def test_gateway_reference_guard_conflict_and_activation_rollback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = setup(tmp_path, values={"FILE_GATEWAY_KEY": "fake-before"}, reference="FILE_GATEWAY_KEY")
    auth = {"Authorization": "Bearer fake-before"}
    token = revision(config.models_file)
    conflict = send(app, "PUT", "/v1/gateway-credential", headers=auth, json=operation("stale"))
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "revision_conflict"
    previous = config.engine.catalog
    before = config.models_file.read_bytes(), credential_path(config.models_file).read_bytes()
    reload = config.engine.reload_catalog
    def fail(catalog: Any, source: str | None = None, **kwargs: Any) -> None:
        if catalog is not previous:
            raise RuntimeError("fake-hostile-value")
        reload(catalog, source=source, **kwargs)
    monkeypatch.setattr(config.engine, "reload_catalog", fail)
    failed = send(app, "PUT", "/v1/gateway-credential", headers=auth, json=operation(token, "fake-after"))
    assert failed.status_code == 500 and failed.json()["error"]["code"] == "gateway_credential_failed"
    assert "fake" not in failed.text
    assert config.engine.catalog is previous and config.gateway_api_key == "fake-before"
    assert (config.models_file.read_bytes(), credential_path(config.models_file).read_bytes()) == before
    assert not (tmp_path / ".provider-configuration.recovery").exists()
    monkeypatch.setattr(config.engine, "reload_catalog", reload)
    document = json.loads(config.models_file.read_text())
    document["providers"][0]["param_env"] = {"organization": "FILE_GATEWAY_KEY"}
    config.models_file.write_text(json.dumps(document))
    shared = send(app, "PUT", "/v1/gateway-credential", headers=auth, json=operation(revision(config.models_file)))
    assert shared.status_code == 400 and shared.json()["error"]["code"] == "invalid_gateway_credential"


def test_missing_provider_never_uses_ambient_litellm_fallback_and_file_key_transports(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "fake-ambient-must-not-use")
    app, config = setup(tmp_path)
    calls: list[dict[str, Any]] = []
    def complete(**kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return {"id": "fixture", "object": "chat.completion", "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}]}
    monkeypatch.setitem(sys.modules, "litellm", SimpleNamespace(completion=complete))
    payload = {"model": "test-provider/vendor/only", "messages": [{"role": "user", "content": "hello"}]}
    response = send(app, "POST", "/v1/chat/completions", json=payload)
    assert response.status_code == 503 and response.json()["error"]["code"] == "provider_credentials_missing"
    assert calls == []
    credential_path(config.models_file).write_bytes(credential_update(None, "FILE_LLM_KEY", "fake-file-transport"))
    assert send(app, "POST", "/v1/routing/reload").status_code == 200
    assert send(app, "POST", "/v1/chat/completions", json=payload).status_code == 200
    assert calls[0]["api_key"] == "fake-file-transport"
    assert "fake-file-transport" not in json.dumps(config.engine.policy_snapshot())


def test_cli_json_rotation_clear_and_preview_isolation(tmp_path: Path) -> None:
    app, config = setup(tmp_path, values={"FILE_LLM_KEY": "fake-json"})
    paths = runtime_paths(tmp_path)
    paths.env.write_text("FILE_LLM_KEY=fake-legacy\nKEEP=untouched\n")
    login(paths, "test-provider", "unused", "fake-rotated-${KEEP}")
    assert credential_snapshot(paths.models)["FILE_LLM_KEY"] == "fake-rotated-${KEEP}"
    current = ProviderConfiguration(paths.models, external={})
    before = credential_path(paths.models).read_bytes(), paths.env.read_bytes()
    assert current.discovery_provider({"provider_id": "test-provider", "credential": {"action": "set", "value": "fake-preview"}})[1] == "fake-preview"
    assert current.discovery_provider({"provider_id": "test-provider", "credential": {"action": "clear"}})[1] == ""
    assert (credential_path(paths.models).read_bytes(), paths.env.read_bytes()) == before
    assert logout(paths, "test-provider")["removed"]
    assert "FILE_LLM_KEY" not in credential_values(credential_path(paths.models).read_bytes())
    assert paths.env.read_text() == "KEEP=untouched\n"
    assert not current.read()["providers"][0]["has_api_key"]


def test_default_install_can_bootstrap_and_cli_paths_are_safe(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    for name in ("DEEPSEEK_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    home = tmp_path / "runtime"
    init_runtime(home, ref="main", method="isolated")
    config = gateway.load_gateway_config(home / "models.json")
    app = gateway.create_app(config)
    initial = send(app, "GET", "/v1/provider-configuration").json()
    assert initial["gateway_bootstrap_available"]
    assert all(not item["has_api_key"] for item in initial["providers"])
    assert send(app, "PUT", "/v1/gateway-credential", json=operation(initial["revision"])).status_code == 200
    assert main(["--home", str(home), "--json", "config", "path"]) == 0
    assert json.loads(capsys.readouterr().out)["data"]["credentials"] == str(home / "credentials.json")
    credentials = (home / "credentials.json").read_bytes()
    init_runtime(home, ref="main", method="isolated")
    assert (home / "credentials.json").read_bytes() == credentials
    assert stat.S_IMODE((home / "credentials.json").stat().st_mode) == 0o600


@pytest.mark.parametrize("url,peer", [("http://localhost:8000", "127.0.0.1"), ("http://[::1]:8000", "::1")])
def test_literal_loopback_browser_addresses_can_bootstrap(tmp_path: Path, url: str, peer: str) -> None:
    app, config = setup(tmp_path, host="::1" if peer == "::1" else "127.0.0.1")
    response = send(app, "PUT", "/v1/gateway-credential", base_url=url, peer=peer, headers={"Origin": url}, json=operation(revision(config.models_file)))
    assert response.status_code == 200


@pytest.mark.parametrize("body", [[], {}, {"expected_revision": "token", "credential": {"action": "clear"}}, {"expected_revision": "token", "credential": {"action": "keep", "value": "fake-hostile"}}])
def test_gateway_invalid_shapes_return_named_safe_error(tmp_path: Path, body: Any) -> None:
    app, _config = setup(tmp_path)
    response = send(app, "PUT", "/v1/gateway-credential", json=body)
    assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_gateway_credential"
    assert "fake-hostile" not in response.text


def test_wrong_nonascii_bearer_is_unauthorized() -> None:
    with pytest.raises(gateway.HTTPException) as failure:
        gateway.require_gateway_key("fake-key", "Bearer fake-\u00e9")
    assert failure.value.status_code == 401


def test_invalid_body_cannot_bypass_bootstrap_or_rotation_authorization(tmp_path: Path) -> None:
    app, _config = setup(tmp_path, host="0.0.0.0")
    denied = send(app, "PUT", "/v1/gateway-credential", content=b"{fake-secret-malformed", headers={"Content-Type": "application/json"})
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "gateway_bootstrap_unavailable"
    app, _config = setup(tmp_path, values={"FILE_GATEWAY_KEY": "fake-key"}, reference="FILE_GATEWAY_KEY")
    denied = send(app, "PUT", "/v1/gateway-credential", json=[])
    assert denied.status_code == 401 and denied.json()["error"]["code"] == "invalid_api_key"


def test_reload_does_not_reclassify_a_public_listener_as_loopback(tmp_path: Path) -> None:
    app, config = setup(tmp_path, host="0.0.0.0")
    document = json.loads(config.models_file.read_text())
    document["gateway"]["host"] = "127.0.0.1"
    config.models_file.write_text(json.dumps(document))
    assert send(app, "POST", "/v1/routing/reload").status_code == 200
    result = send(app, "GET", "/v1/provider-configuration").json()
    assert not result["gateway_bootstrap_available"]
    denied = send(app, "PUT", "/v1/gateway-credential", json=operation(result["revision"]))
    assert denied.status_code == 403


@pytest.mark.parametrize("kind", ["llm", "decision"])
def test_provider_set_keep_clear_pending_catalog_and_decision_skip(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str) -> None:
    app, config = setup(tmp_path, values={"FILE_GATEWAY_KEY": "fake-management"}, reference="FILE_GATEWAY_KEY")
    document = json.loads(config.models_file.read_text())
    if kind == "decision":
        provider = {"id": "one", "protocol": "system_one", "api_base": "https://decision.example/evaluate", "api_key_env": "FILE_DECISION_KEY"}
        document["decision"] = {"enabled": True, "providers": [provider]}
        config.models_file.write_text(json.dumps(document))
    else:
        provider = document["providers"][0]
    reference = provider["api_key_env"]
    current = ProviderConfiguration(config.models_file, external={})
    auth = {"Authorization": "Bearer fake-management"}
    for action in ("set", "keep", "clear"):
        secret = {"action": action, **({"value": "fake-provider-${LITERAL}"} if action == "set" else {})}
        body = {"expected_revision": revision(config.models_file), "operations": [{"action": "upsert", "kind": kind, "provider": provider, "credential": secret}]}
        before = credential_path(config.models_file).read_bytes()
        validated = send(app, "POST", "/v1/provider-configuration/validate", headers=auth, json=body)
        assert validated.status_code == 200 and credential_path(config.models_file).read_bytes() == before
        result = send(app, "PUT", "/v1/provider-configuration", headers=auth, json=body)
        assert result.status_code == 200 and "fake-provider" not in result.text
        views = result.json()["providers"] if kind == "llm" else result.json()["decision"]["providers"]
        assert views[0]["has_api_key"] is (action != "clear")
        if action == "keep":
            assert credential_path(config.models_file).read_bytes() == before
            (tmp_path / ".env").write_bytes(env_update(None, reference, "fake-legacy"))
    assert reference not in credential_snapshot(config.models_file, external={})
    assert current.read()["decision" if kind == "decision" else "providers"]
    if kind == "decision":
        from jev_gateway.strategy import decision_provider
        calls: list[str] = []
        class Adapter:
            def evaluate(self, provider: Any, api_key: str, timeout: float, state: Any, questions: Any) -> None:
                calls.append(api_key)
        monkeypatch.setitem(decision_provider._ADAPTERS, "system_one", Adapter())
        assert DecisionClient(config.engine.catalog.decision).evaluate("fixture", {}) is None
        assert calls == []


def test_gateway_write_failure_restores_disk_runtime_and_backup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = setup(tmp_path, values={"FILE_GATEWAY_KEY": "fake-before"}, reference="FILE_GATEWAY_KEY")
    before = config.models_file.read_bytes(), credential_path(config.models_file).read_bytes()
    original = config_transaction.atomic_bytes
    failed = False
    def fault(path: Path, data: bytes | None, *, protected: bool = False) -> None:
        nonlocal failed
        if path.name == "credentials.json" and not failed:
            failed = True
            raise OSError("fake-secret-in-error")
        original(path, data, protected=protected)
    monkeypatch.setattr(config_transaction, "atomic_bytes", fault)
    response = send(app, "PUT", "/v1/gateway-credential", headers={"Authorization": "Bearer fake-before"}, json=operation(revision(config.models_file)))
    assert response.status_code == 500 and response.json()["error"]["code"] == "gateway_credential_failed"
    assert "fake-secret" not in response.text
    assert (config.models_file.read_bytes(), credential_path(config.models_file).read_bytes()) == before
    assert config.gateway_api_key == "fake-before"
    assert not (tmp_path / "credentials.json.backup").exists()
    assert not (tmp_path / ".provider-configuration.recovery").exists()


@pytest.mark.parametrize("action", ["set", "clear"])
@pytest.mark.parametrize("shared_in", ["existing", "proposed", "later_operation"])
def test_provider_credential_guard_retains_transport_references(tmp_path: Path, action: str, shared_in: str) -> None:
    _app, initial = setup(tmp_path, values={"FILE_GATEWAY_KEY": "fake-management", "FILE_LLM_KEY": "fake-transport"}, reference="FILE_GATEWAY_KEY")
    document = json.loads(initial.models_file.read_text())
    provider = document["providers"][0]
    if shared_in == "existing":
        provider["param_env"] = {"organization": "FILE_LLM_KEY"}
        initial.models_file.write_text(json.dumps(document))
    (tmp_path / ".env").write_text("FILE_LLM_KEY=fake-legacy-transport\n")
    config = gateway.load_gateway_config(initial.models_file)
    app = gateway.create_app(config)
    proposed = dict(provider)
    if shared_in == "proposed":
        proposed["param_env"] = {"organization": "FILE_LLM_KEY"}
    operations = [{"action": "upsert", "kind": "llm", "provider": proposed,
                   "credential": {"action": action, **({"value": "fake-replacement"} if action == "set" else {})}}]
    if shared_in == "later_operation":
        operations.append({"action": "upsert", "kind": "llm", "provider": {
            "id": "transport-consumer", "type": "openai", "api_base": "https://test.example/v1",
            "param_env": {"organization": "FILE_LLM_KEY"}}, "credential": {"action": "keep"}})
    body = {"expected_revision": revision(config.models_file), "operations": operations}
    paths = [config.models_file, credential_path(config.models_file), tmp_path / ".env", tmp_path / "credentials.json.backup", tmp_path / ".env.backup", tmp_path / "models.json.bak"]
    before = {path: path.read_bytes() if path.exists() else None for path in paths}
    catalog, registry = config.engine.catalog, config.engine.strategies
    for method, path in (("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")):
        result = send(app, method, path, headers={"Authorization": "Bearer fake-management"}, json=body)
        assert result.status_code == 400 and result.json()["error"]["code"] == "invalid_configuration"
        assert "fake-replacement" not in result.text and "fake-transport" not in result.text
        assert {path: path.read_bytes() if path.exists() else None for path in paths} == before
        assert revision(config.models_file) == body["expected_revision"]
        assert config.engine.catalog is catalog and config.engine.strategies is registry
        assert config.gateway_api_key == "fake-management"


@pytest.mark.parametrize("command", ["login", "logout"])
@pytest.mark.parametrize("dry_run", [False, True])
def test_cli_credential_guard_retains_own_transport_reference(tmp_path: Path, command: str, dry_run: bool) -> None:
    _app, config = setup(tmp_path, values={"FILE_LLM_KEY": "fake-transport"})
    document = json.loads(config.models_file.read_text())
    document["providers"][0]["param_env"] = {"organization": "FILE_LLM_KEY"}
    config.models_file.write_text(json.dumps(document))
    (tmp_path / ".env").write_text("FILE_LLM_KEY=fake-legacy-transport\n")
    paths = runtime_paths(tmp_path)
    before = (paths.models.read_bytes(), credential_path(paths.models).read_bytes(), paths.env.read_bytes())
    with pytest.raises(CliError) as caught:
        if command == "login":
            login(paths, "test-provider", "FILE_LLM_KEY", "fake-replacement", dry_run=dry_run)
        else:
            logout(paths, "test-provider", dry_run=dry_run)
    assert caught.value.code == "credential_in_use"
    assert (paths.models.read_bytes(), credential_path(paths.models).read_bytes(), paths.env.read_bytes()) == before
    assert not (tmp_path / "credentials.json.backup").exists()
    assert not (tmp_path / ".env.backup").exists()


def test_file_credentials_do_not_enter_reads_history_records_or_logs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    values = {"FILE_GATEWAY_KEY": "fake-private-inbound", "FILE_LLM_KEY": "fake-private-llm", "FILE_PARAM_KEY": "fake-private-param"}
    _app, initial = setup(tmp_path, values=values, reference="FILE_GATEWAY_KEY")
    document = json.loads(initial.models_file.read_text())
    document["providers"][0]["param_env"] = {"organization": "FILE_PARAM_KEY"}
    document["storage"] = {"enabled": True, "path": "evidence.sqlite3", "capture_content": True}
    initial.models_file.write_text(json.dumps(document))
    config = gateway.load_gateway_config(initial.models_file)
    app = gateway.create_app(config)
    auth = {"Authorization": "Bearer fake-private-inbound", "X-JEV-Session-Id": "credential-fixture"}
    calls: list[dict[str, Any]] = []
    def complete(**kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return {"id": "fixture", "choices": [{"message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}]}
    monkeypatch.setitem(sys.modules, "litellm", SimpleNamespace(completion=complete))
    try:
        response = send(app, "POST", "/v1/chat/completions", headers=auth, json={"model": "test-provider/vendor/only", "messages": [{"role": "user", "content": "hello"}]})
        assert response.status_code == 200
        assert calls[0]["api_key"] == values["FILE_LLM_KEY"] and calls[0]["organization"] == values["FILE_PARAM_KEY"]
        config.engine.record_store.flush()
        for path in ("/v1/models", "/v1/provider-configuration", "/v1/routing/policy", "/v1/routing/strategies", "/v1/routing/configuration", "/v1/routing/sessions", "/v1/routing/sessions/credential-fixture/requests"):
            result = send(app, "GET", path, headers=auth)
            assert result.status_code == 200
            assert all(value not in result.text for value in values.values())
        assert all(value not in caplog.text for value in values.values())
    finally:
        config.engine.record_store.close()
    with sqlite3.connect(tmp_path / "evidence.sqlite3") as connection:
        dump = "\n".join(connection.iterdump())
    assert all(value not in dump for value in values.values())
