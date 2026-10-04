"""First-run configuration and one-time management setup without upstream calls."""

from __future__ import annotations

import asyncio
import copy
import io
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest

from jev_gateway import gateway
from jev_gateway.catalog import catalog_from_document
from jev_gateway.cli.main import main
from jev_gateway.config_transaction import ConfigurationRecoveryRequired
from jev_gateway.decision import SetupIncompleteError
from jev_gateway.initialization import initialize_configuration
from jev_gateway.provider_config import ProviderConfiguration, RevisionConflict, credential_snapshot, env_update
from jev_gateway.setup import MANAGEMENT_KEY_ENV, ManagementSetup, SetupAlreadyConfigured

FAKE_KEY = "fake-management-key-for-tests"


def request(app: Any, method: str, path: str = "/v1/setup", *, peer: str = "127.0.0.1", base_url: str = "http://127.0.0.1:8000", **kwargs: Any) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app, client=(peer, 12345))
        async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
            return await client.request(method, path, **kwargs)
    return asyncio.run(send())


@pytest.fixture
def fresh(tmp_path: Path) -> Iterator[tuple[Any, gateway.GatewayConfig]]:
    path = tmp_path / "models.json"
    initialize_configuration(path)
    document = json.loads(path.read_text())
    document["storage"]["enabled"] = False
    path.write_text(json.dumps(document))
    config = gateway.load_gateway_config(path)
    app = gateway.create_app(config)
    yield app, config
    config.engine.close()


def setup_body(app: Any) -> dict[str, str]:
    return {"expected_revision": request(app, "GET").json()["revision"], "api_key": FAKE_KEY}


@pytest.mark.parametrize("original", [
    b"# preserve records\r\nLEGACY_KEY='  fake-padded-legacy  '\r\n\r\n",
    b"# preserve records\r\nLEGACY_KEY='  fake-padded-legacy  '",
    b"LEGACY_KEY='fake-no-final-newline'",
])
def test_management_setup_preserves_existing_dotenv_record_bytes(tmp_path: Path, original: bytes) -> None:
    path = tmp_path / "models.json"
    initialize_configuration(path)
    env_path = tmp_path / ".env"
    env_path.write_bytes(original)
    service = ManagementSetup(path, external={})
    before_values = credential_snapshot(path, external={})
    service.configure({"expected_revision": service.read()["revision"], "api_key": FAKE_KEY})
    updated = env_path.read_bytes()
    assert updated == original
    assert not (tmp_path / ".env.backup").exists()
    assert json.loads((tmp_path / "credentials.json").read_text())["values"][MANAGEMENT_KEY_ENV] == FAKE_KEY
    after_values = credential_snapshot(path, external={})
    assert after_values["LEGACY_KEY"] == before_values["LEGACY_KEY"]
    assert after_values[MANAGEMENT_KEY_ENV] == FAKE_KEY
    assert (tmp_path / "credentials.json").stat().st_mode & 0o777 == 0o600


def test_env_update_preserves_unselected_multiline_records_and_missing_newline() -> None:
    original = b"OTHER='first\r\nTARGET=inside-unrelated-value\r\nlast'\r\nTARGET='old'\r\n# untouched final comment"
    changed = env_update(original, "TARGET", "fake-replacement")
    assert changed.startswith(b"OTHER='first\r\nTARGET=inside-unrelated-value\r\nlast'\r\n# untouched final comment\r\n")
    assert b"TARGET='old'" not in changed
    assert env_update(original, "ABSENT", None) == original
    cleared = env_update(original, "TARGET", None)
    assert cleared == b"OTHER='first\r\nTARGET=inside-unrelated-value\r\nlast'\r\n# untouched final comment"


def snapshot(path: Path) -> dict[str, bytes]:
    return {item.name: item.read_bytes() for item in path.parent.iterdir() if item.is_file() and item.name != ".provider-configuration.lock"}


def test_default_startup_initializes_empty_runtime_and_preserves_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JEV_GATEWAY_HOME", str(tmp_path / "fresh runtime"))
    config = gateway.load_gateway_config()
    try:
        assert not config.engine.catalog.providers
        assert not config.engine.catalog.profiles
        assert not config.engine.catalog.decision.providers
        assert config.engine.strategies.names() == ["task_aware", "quality", "economy"]
        document = json.loads(config.models_file.read_text())
        assert "policy" not in document
        assert (config.models_file.parent / ".env").stat().st_mode & 0o777 == 0o600
        for name, data in (("routing-overrides.json", b'{"version":1}'), ("dashboard-theme.json", b"theme"), ("records.bin", b"records"), (".env", b"OPERATOR_DATA=retained\n")):
            (config.models_file.parent / name).write_bytes(data)
        before = snapshot(config.models_file)
        assert initialize_configuration(config.models_file) == {"models.json": "preserved", ".env": "preserved", "credentials.json": "preserved"}
        assert snapshot(config.models_file) == before
    finally:
        config.engine.close()


def test_explicit_missing_or_invalid_file_remains_strict(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = tmp_path / "explicit" / "models.json"
    with pytest.raises(ValueError, match="read"):
        gateway.load_gateway_config(path)
    assert not path.exists()
    monkeypatch.setenv("JEV_GATEWAY_HOME", str(tmp_path))
    path = tmp_path / "models.json"
    path.write_bytes(b"malformed")
    with pytest.raises(ValueError):
        gateway.load_gateway_config()
    assert path.read_bytes() == b"malformed"


def test_omitted_arrays_are_empty_and_invalid_shapes_still_fail(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    _, config = fresh
    document = json.loads(config.models_file.read_text())
    document.pop("providers", None)
    document.pop("models", None)
    catalog = catalog_from_document(document, "empty", {})
    assert catalog.providers == catalog.profiles == ()
    for field in ("providers", "models"):
        for value in (None, {}, "", 0):
            with pytest.raises(TypeError, match="must be a list"):
                catalog_from_document({**document, field: value}, "invalid", {})
    explicit = copy.deepcopy(document)
    explicit["strategies"]["definitions"]["task_aware"]["policy"]["labels"]["draft"]["models"] = ["unknown/model"]
    with pytest.raises(ValueError, match="unknown model"):
        catalog_from_document(explicit, "invalid", {})
    with pytest.raises(ValueError, match="unknown keys"):
        catalog_from_document({**document, "extra": True}, "invalid", {})


def test_discovery_preparation_accepts_omitted_catalog_arrays(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    _, config = fresh
    service = ProviderConfiguration(config.models_file, external={})
    provider = {"id": "fixture", "type": "openai", "api_base": "https://fixture.invalid/v1", "api_key_env": "FIXTURE_UPSTREAM_KEY"}
    before = snapshot(config.models_file)
    resolved, key, imported = service.discovery_provider({"provider": provider, "credential": {"action": "set", "value": "fake-upstream-secret"}})
    assert resolved == provider and key == "fake-upstream-secret" and imported == set()
    with pytest.raises(ValueError, match="does not exist"):
        service.discovery_provider({"provider_id": "missing"})
    assert snapshot(config.models_file) == before


def test_setup_completes_without_provider_or_model_and_guards_reads(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    app, config = fresh
    initial = request(app, "GET").json()
    assert set(initial) == {"required", "local_setup_available", "revision", "has_providers", "has_models", "routing_ready", "next_step"}
    assert initial["required"] and initial["local_setup_available"]
    assert initial["next_step"] == "gateway_key"
    result = request(app, "POST", json=setup_body(app), headers={"Origin": "http://127.0.0.1:8000"})
    assert result.status_code == 200
    status = result.json()
    assert status["required"] is False
    assert status["has_providers"] is status["has_models"] is status["routing_ready"] is False
    assert status["next_step"] == "provider"
    assert status["revision"] != initial["revision"]
    assert FAKE_KEY not in result.text
    assert config.gateway_api_key == FAKE_KEY
    assert credential_snapshot(config.models_file)[MANAGEMENT_KEY_ENV] == FAKE_KEY
    for name in ("credentials.json", "credentials.json.backup"):
        assert (config.models_file.parent / name).stat().st_mode & 0o777 == 0o600
    assert request(app, "GET").status_code == 401
    auth = {"Authorization": f"Bearer {FAKE_KEY}"}
    assert request(app, "GET", headers=auth).json() == status
    assert request(app, "GET", "/v1/provider-configuration", headers=auth).status_code == 200
    assert request(app, "GET", "/v1/routing/strategies", headers=auth).status_code == 200
    routing = request(app, "GET", "/v1/routing/configuration", headers=auth)
    assert routing.status_code == 200
    assert routing.json()["models"] == []
    before = snapshot(config.models_file)
    repeat = request(app, "POST", json={"expected_revision": status["revision"], "api_key": "fake-replacement-secret"})
    assert repeat.status_code == 409
    assert repeat.json()["error"]["code"] == "setup_already_configured"
    assert snapshot(config.models_file) == before


def test_empty_routing_overlay_remains_editable_with_omitted_models(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    app, config = fresh
    assert request(app, "POST", json=setup_body(app)).status_code == 200
    auth = {"Authorization": f"Bearer {FAKE_KEY}"}
    document = config.models_file.read_bytes()
    payload = {"version": 1, "strategy": "task_aware", "models": {}}
    assert request(app, "POST", "/v1/routing/configuration/validate", headers=auth, json=payload).status_code == 200
    assert request(app, "PUT", "/v1/routing/configuration", headers=auth, json=payload).status_code == 200
    assert request(app, "GET", "/v1/routing/configuration", headers=auth).json()["models"] == []
    assert request(app, "POST", "/v1/routing/reload", headers=auth).status_code == 200
    assert config.models_file.read_bytes() == document
    assert request(app, "GET", headers=auth).json()["next_step"] == "provider"


@pytest.mark.parametrize("peer,host,origin", [
    ("203.0.113.1", "127.0.0.1:8000", None),
    ("127.0.0.1", "example.invalid:8000", None),
    ("127.0.0.1", "127.0.0.1:8000", "http://elsewhere.invalid"),
    ("127.0.0.1", "localhost:8000", "http://127.0.0.1:8000"),
    ("127.0.0.1", "127.0.0.1:8000", "null"),
    ("127.0.0.1", "127.0.0.1:8000", "https://127.0.0.1:8000"),
    ("127.0.0.1", "127.0.0.1:8000", "http://127.0.0.1:8000/"),
    ("127.0.0.1", "localhost:8000@elsewhere.invalid", None),
])
def test_remote_host_origin_and_forwarding_cannot_bootstrap(fresh: tuple[Any, gateway.GatewayConfig], peer: str, host: str, origin: str | None) -> None:
    app, config = fresh
    headers = {"Host": host, "X-Forwarded-For": "127.0.0.1", "X-Forwarded-Host": "localhost:8000", "Forwarded": "for=127.0.0.1;host=localhost:8000"}
    if origin is not None:
        headers["Origin"] = origin
    before = snapshot(config.models_file)
    assert request(app, "GET", peer=peer, headers=headers).json()["local_setup_available"] is False
    result = request(app, "POST", peer=peer, headers=headers, json=setup_body(app))
    assert result.status_code == 403
    assert result.json()["error"]["code"] == "setup_local_only"
    assert snapshot(config.models_file) == before


@pytest.mark.parametrize("host,peer", [("localhost", "127.0.0.1"), ("[::1]:8000", "::1"), ("127.0.0.2:8000", "127.0.0.2")])
def test_loopback_variants_can_bootstrap(fresh: tuple[Any, gateway.GatewayConfig], host: str, peer: str) -> None:
    app, _ = fresh
    assert request(app, "POST", peer=peer, headers={"Host": host, "Origin": f"http://{host}"}, json=setup_body(app)).status_code == 200


@pytest.mark.parametrize("name,value", [
    ("Forwarded", "for=127.0.0.1;host=127.0.0.1:8000;proto=http"),
    ("X-Forwarded-For", "127.0.0.1"),
    ("X-Forwarded-Host", "127.0.0.1:8000"),
    ("X-Forwarded-Proto", "https"),
    ("X-Real-IP", "127.0.0.1"),
    ("X-Forwarded-For", ""),
])
def test_loopback_forwarding_headers_disable_http_bootstrap(fresh: tuple[Any, gateway.GatewayConfig], name: str, value: str) -> None:
    app, config = fresh
    headers = {name: value, "Origin": "http://127.0.0.1:8000"}
    before = snapshot(config.models_file)
    assert request(app, "GET", headers=headers).json()["local_setup_available"] is False
    result = request(app, "POST", json=setup_body(app), headers=headers)
    assert result.status_code == 403
    assert result.json()["error"]["code"] == "setup_local_only"
    assert snapshot(config.models_file) == before
    assert config.gateway_api_key is None


@pytest.mark.parametrize("key", ["short", " " * 16, "fake-management key", "fake-secret\nline-2", "fake-secret\rline-2", "fake-secret\x00line-2", "fake-secret\tline-2", "fake-secret\x7fline-2", " fake-management-key", "fake-management-key ", "密" * 16, "é" * 16, "a" * 8193, 123, None])
def test_invalid_setup_keys_preserve_files(fresh: tuple[Any, gateway.GatewayConfig], key: Any) -> None:
    app, config = fresh
    body: dict[str, Any] = setup_body(app)
    body["api_key"] = key
    before = snapshot(config.models_file)
    assert request(app, "POST", json=body).status_code == 400
    assert snapshot(config.models_file) == before
    assert config.gateway_api_key is None


def test_stale_revision_and_unknown_fields_preserve_files(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    app, config = fresh
    body = setup_body(app)
    config.models_file.write_bytes(config.models_file.read_bytes() + b"\n")
    before = snapshot(config.models_file)
    assert request(app, "POST", json=body).json()["error"]["code"] == "revision_conflict"
    body = setup_body(app)
    assert request(app, "POST", json={**body, "api_key_env": "SHARED_KEY"}).status_code == 400
    assert snapshot(config.models_file) == before


@pytest.mark.parametrize("conflict", ["llm", "decision", "param_env", "external", "dotenv"])
def test_setup_never_overwrites_existing_credential_variables(fresh: tuple[Any, gateway.GatewayConfig], conflict: str) -> None:
    _, config = fresh
    path = config.models_file
    document = json.loads(path.read_text())
    external: dict[str, str] = {"FIXTURE_EXISTING_KEY": "fake-existing-key"}
    if conflict in {"llm", "param_env"}:
        provider: dict[str, Any] = {"id": "existing", "type": "openai", "api_base": "https://fixture.invalid/v1", "api_key_env": "FIXTURE_EXISTING_KEY"}
        if conflict == "llm":
            provider["api_key_env"] = MANAGEMENT_KEY_ENV
        else:
            provider["param_env"] = {"organization": MANAGEMENT_KEY_ENV}
        document["providers"] = [provider]
    elif conflict == "decision":
        document["decision"]["providers"] = [{"id": "existing", "protocol": "system_one", "api_base": "https://decision.invalid/evaluate", "api_key_env": MANAGEMENT_KEY_ENV}]
    if conflict == "external":
        external[MANAGEMENT_KEY_ENV] = "fake-retained-value"
    else:
        (path.parent / ".env").write_text(f"{MANAGEMENT_KEY_ENV}=fake-retained-value\n")
    path.write_text(json.dumps(document))
    service = ManagementSetup(path, external=external)
    before = snapshot(path)
    with pytest.raises(ValueError, match="already in use"):
        service.configure({"expected_revision": service.read()["revision"], "api_key": FAKE_KEY})
    assert snapshot(path) == before


def test_setup_activation_failure_restores_disk_and_live_key(fresh: tuple[Any, gateway.GatewayConfig], monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = fresh
    before = snapshot(config.models_file)
    original = config.apply_settings

    def fail_once(settings: Any) -> None:
        original(settings)
        if settings.api_key:
            raise RuntimeError("fake-sensitive-error-that-must-stay-private")

    monkeypatch.setattr(config, "apply_settings", fail_once)
    result = request(app, "POST", json=setup_body(app))
    assert result.status_code == 500
    assert "fake-sensitive" not in result.text
    assert FAKE_KEY not in result.text
    assert snapshot(config.models_file) == before
    assert config.gateway_api_key is None
    assert config.engine.catalog.gateway.api_key is None
    assert request(app, "GET").json()["required"] is True


def test_setup_preparation_failure_writes_nothing(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    _, config = fresh
    service = ManagementSetup(config.models_file, external={})
    before = snapshot(config.models_file)

    def fail(_catalog: Any) -> None:
        raise RuntimeError("preparation failed")

    with pytest.raises(RuntimeError, match="preparation"):
        service.configure({"expected_revision": service.read()["revision"], "api_key": FAKE_KEY}, prepare=fail)
    assert snapshot(config.models_file) == before


def test_setup_file_replacement_failure_restores_every_file(fresh: tuple[Any, gateway.GatewayConfig], monkeypatch: pytest.MonkeyPatch) -> None:
    from jev_gateway import config_transaction

    app, config = fresh
    before = snapshot(config.models_file)
    original = config_transaction.atomic_bytes
    failed = False

    def fail_once(path: Path, content: bytes | None, *, protected: bool = False) -> None:
        nonlocal failed
        if path.name == "credentials.json" and not failed:
            failed = True
            raise OSError("fixture write failure")
        original(path, content, protected=protected)

    monkeypatch.setattr(config_transaction, "atomic_bytes", fail_once)
    result = request(app, "POST", json=setup_body(app))
    assert result.status_code == 500
    assert snapshot(config.models_file) == before
    assert config.gateway_api_key is None


def test_revision_rechecked_after_preparation(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    _, config = fresh
    service = ManagementSetup(config.models_file, external={})
    body = {"expected_revision": service.read()["revision"], "api_key": FAKE_KEY}
    original = config.models_file.read_bytes()

    def uncooperative_edit(_catalog: Any) -> None:
        config.models_file.write_bytes(original + b"\n")

    with pytest.raises(RevisionConflict, match="while validating"):
        service.configure(body, prepare=uncooperative_edit)
    assert config.models_file.read_bytes() == original + b"\n"
    assert MANAGEMENT_KEY_ENV not in credential_snapshot(config.models_file)
    assert not (config.models_file.parent / "models.json.bak").exists()


def test_management_key_preserves_printable_characters_across_reload(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    app, config = fresh
    exact_key = "fake-management-key+_~/'\"back\\slash"
    body = {**setup_body(app), "api_key": exact_key}
    assert request(app, "POST", json=body).status_code == 200
    assert config.gateway_api_key == exact_key
    auth = {"Authorization": f"Bearer {exact_key}"}
    assert request(app, "GET", headers=auth).status_code == 200
    assert request(app, "GET", headers={"Authorization": f"Bearer {exact_key + 'x'}"}).status_code == 401
    assert request(app, "POST", "/v1/routing/reload", headers=auth).status_code == 200
    assert config.gateway_api_key == exact_key
    assert credential_snapshot(config.models_file)[MANAGEMENT_KEY_ENV] == exact_key


def test_existing_gateway_key_keeps_legacy_dotenv_read_behavior(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    app, config = fresh
    assert request(app, "POST", json=setup_body(app)).status_code == 200
    env_path = config.models_file.parent / ".env"
    env_path.write_bytes(env_update(env_path.read_bytes(), MANAGEMENT_KEY_ENV, FAKE_KEY))
    (config.models_file.parent / "credentials.json").write_text('{"version":1,"values":{}}')
    before = env_path.read_bytes()
    auth = {"Authorization": f"Bearer {FAKE_KEY}"}
    assert request(app, "POST", "/v1/routing/reload", headers=auth).status_code == 200
    assert config.gateway_api_key == FAKE_KEY
    assert request(app, "GET", headers=auth).status_code == 200
    assert env_path.read_bytes() == before
    assert credential_snapshot(config.models_file)[MANAGEMENT_KEY_ENV] == FAKE_KEY


def test_missing_declared_credentials_still_fail_with_empty_models(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    _, config = fresh
    document = json.loads(config.models_file.read_text())
    document["providers"] = [{"id": "fixture", "type": "openai", "api_base": "https://fixture.invalid/v1", "api_key_env": "ABSENT_FIXTURE_KEY"}]
    with pytest.raises(ValueError, match="variable is not set"):
        catalog_from_document(document, "invalid", {})
    document["providers"] = []
    document["gateway"]["api_key_env"] = "ABSENT_FIXTURE_KEY"
    with pytest.raises(ValueError, match="variable is not set"):
        catalog_from_document(document, "invalid", {})


def test_two_setup_writers_only_one_succeeds(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    _, config = fresh
    service = ManagementSetup(config.models_file, external={})
    body = {"expected_revision": service.read()["revision"], "api_key": FAKE_KEY}

    def write() -> str:
        try:
            service.configure(body)
            return "configured"
        except SetupAlreadyConfigured:
            return "blocked"

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: write(), range(2))) == ["blocked", "configured"]


def test_recovery_marker_blocks_initialization_and_setup(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    _, config = fresh
    (config.models_file.parent / ".provider-configuration.recovery").write_bytes(b"protected recovery")
    before = snapshot(config.models_file)
    with pytest.raises(ConfigurationRecoveryRequired):
        initialize_configuration(config.models_file)
    with pytest.raises(ConfigurationRecoveryRequired):
        ManagementSetup(config.models_file).read()
    assert snapshot(config.models_file) == before


def test_empty_generation_and_preview_never_reach_upstream(fresh: tuple[Any, gateway.GatewayConfig], monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = fresh

    def forbidden(*_args: Any, **_kwargs: Any) -> None:
        pytest.fail("Empty routing must not reach a decision provider or generation upstream.")

    monkeypatch.setattr(config.engine.strategies.resolve("task_aware"), "decide", forbidden)
    for route in ("/v1/chat/completions", "/v1/routing/preview"):
        result = request(app, "POST", route, json={"model": "task_aware", "messages": [{"role": "user", "content": "fixture request"}]})
        assert result.status_code == 503
        assert result.json()["error"]["code"] == "setup_incomplete"
    for method in (config.engine.decide, config.engine.preview):
        with pytest.raises(SetupIncompleteError):
            method(messages=[{"role": "user", "content": "fixture request"}])


def test_model_less_provider_first_import_then_tag_assignment_and_reload(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    app, config = fresh
    assert request(app, "POST", json=setup_body(app)).status_code == 200
    auth = {"Authorization": f"Bearer {FAKE_KEY}"}

    def command(operation: dict[str, Any]) -> httpx.Response:
        token = request(app, "GET", headers=auth).json()["revision"]
        return request(app, "PUT", "/v1/provider-configuration", headers=auth, json={"expected_revision": token, "operations": [operation]})

    saved = command({"action": "upsert", "kind": "llm", "provider": {"id": "fixture", "type": "openai", "api_base": "https://fixture.invalid/v1", "api_key_env": "FIXTURE_UPSTREAM_KEY"}, "credential": {"action": "set", "value": "fake-upstream-secret"}})
    assert saved.status_code == 200
    assert not config.engine.catalog.profiles
    assert request(app, "GET", headers=auth).json()["next_step"] == "model"
    model = {"upstream_model": "fixture-model", "context_window": None, "max_output_tokens": None, "capabilities": {"tools": False, "vision": False, "json_mode": False, "reasoning": False, "temperature": True, "reasoning_effort": []}, "cost": {"input_per_million": 1, "output_per_million": 2}, "metadata": {"version": 1, "confirmation": {"method": "manual", "confirmed_at": "2026-09-30T10:00:00Z"}}}
    imported = command({"action": "import", "provider_id": "fixture", "models": [model], "confirmed": True})
    assert imported.status_code == 200
    assert imported.json()["imported"] == 1
    assert request(app, "GET", headers=auth).json()["next_step"] == "routing"
    preview_body = {"model": "task_aware", "messages": [{"role": "user", "content": "fixture request"}]}
    assert request(app, "POST", "/v1/routing/preview", headers=auth, json=preview_body).status_code == 503
    chosen = command({"action": "set_default_model", "model": "fixture/fixture-model"})
    assert chosen.status_code == 200
    assert chosen.json()["defaults"] == {"default_model": "fixture/fixture-model"}
    assert config.engine.catalog.defaults.default_model == "fixture/fixture-model"
    assert request(app, "GET", headers=auth).json()["next_step"] == "ready"
    default_preview = request(app, "POST", "/v1/routing/preview", headers=auth, json=preview_body)
    assert default_preview.status_code == 200
    assert default_preview.json()["preview"][0]["label"] == "default"
    assert default_preview.json()["preview"][0]["route"] == "fixture/fixture-model"
    assert request(app, "POST", "/v1/routing/reload", headers=auth).status_code == 200
    assert config.engine.catalog.defaults.default_model == "fixture/fixture-model"
    assert command({"action": "set_default_model", "model": None}).status_code == 200
    assert config.engine.catalog.defaults.default_model is None
    assert request(app, "GET", headers=auth).json()["next_step"] == "routing"
    document = json.loads(config.models_file.read_text())
    document["models"][0]["tags"] = [f"task_aware/{label}" for label in config.engine.catalog.policy.labels]
    config.models_file.write_text(json.dumps(document))
    assert request(app, "POST", "/v1/routing/reload", headers=auth).status_code == 200
    assert request(app, "GET", headers=auth).json()["next_step"] == "ready"
    preview = request(app, "POST", "/v1/routing/preview", headers=auth, json={"model": "task_aware", "messages": [{"role": "user", "content": "fixture request"}]})
    assert preview.status_code == 200
    assert "fixture/fixture-model" in preview.text
    reloaded = gateway.load_gateway_config(config.models_file)
    try:
        assert reloaded.gateway_api_key == FAKE_KEY
        assert reloaded.engine.catalog.profiles[0].tags == tuple(document["models"][0]["tags"])
    finally:
        reloaded.engine.close()


@pytest.mark.parametrize("source", ["stdin", "env"])
def test_cli_setup_uses_shared_service_and_never_prints_key(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], source: str) -> None:
    if source == "stdin":
        monkeypatch.setattr(sys, "stdin", io.StringIO(FAKE_KEY + "\n"))
        arguments = ["--secret-stdin"]
    else:
        monkeypatch.setenv("FAKE_SETUP_SOURCE", FAKE_KEY)
        arguments = ["--secret-env", "FAKE_SETUP_SOURCE"]
    before = dict(os.environ)
    assert main(["--home", str(tmp_path), "--json", "setup", *arguments]) == 0
    output = capsys.readouterr()
    assert FAKE_KEY not in output.out + output.err
    assert json.loads(output.out)["data"]["next_step"] == "provider"
    assert os.environ == before
    assert main(["--home", str(tmp_path), "--json", "setup", *arguments]) != 0
    assert json.loads(capsys.readouterr().out)["error"]["code"] == "setup_already_configured"


def test_cli_setup_on_running_app_activates_with_reload(fresh: tuple[Any, gateway.GatewayConfig], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    app, config = fresh
    monkeypatch.setenv("FAKE_SETUP_SOURCE", FAKE_KEY)
    assert main(["--home", str(config.models_file.parent), "--json", "setup", "--secret-env", "FAKE_SETUP_SOURCE"]) == 0
    assert FAKE_KEY not in capsys.readouterr().out
    assert config.gateway_api_key is None
    assert request(app, "GET").json()["required"] is False
    assert request(app, "POST", "/v1/routing/reload").status_code == 200
    assert config.gateway_api_key == FAKE_KEY
    assert request(app, "GET").status_code == 401
    auth = {"Authorization": f"Bearer {FAKE_KEY}"}
    assert request(app, "GET", headers=auth).json()["next_step"] == "provider"
    token = request(app, "GET", headers=auth).json()["revision"]
    saved = request(app, "PUT", "/v1/provider-configuration", headers=auth, json={"expected_revision": token, "operations": [{"action": "upsert", "kind": "llm", "provider": {"id": "fixture", "type": "openai", "api_base": "https://fixture.invalid/v1", "api_key_env": "FIXTURE_UPSTREAM_KEY"}, "credential": {"action": "set", "value": "fake-upstream-key"}}]})
    assert saved.status_code == 200
    assert saved.json()["models"] == []
    assert request(app, "GET", headers=auth).json()["next_step"] == "model"


def test_cli_setup_sanitizes_configuration_read_errors(fresh: tuple[Any, gateway.GatewayConfig], capsys: pytest.CaptureFixture[str]) -> None:
    _, config = fresh
    document = json.loads(config.models_file.read_text())
    document["gateway"]["port"] = "fake-sensitive-invalid-port"
    config.models_file.write_text(json.dumps(document))
    before = snapshot(config.models_file)
    assert main(["--home", str(config.models_file.parent), "--json", "setup"]) != 0
    captured = capsys.readouterr()
    assert "fake-sensitive" not in captured.out + captured.err
    assert json.loads(captured.out)["error"]["code"] == "setup_failed"
    assert snapshot(config.models_file) == before


def test_cli_setup_noninteractive_without_secret_never_prompts(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    import getpass

    monkeypatch.setattr(sys, "stdin", io.StringIO(""))
    monkeypatch.setattr(getpass, "getpass", lambda *_args, **_kwargs: pytest.fail("Noninteractive setup must not prompt."))
    assert main(["--home", str(tmp_path), "--json", "setup"]) != 0
    captured = capsys.readouterr()
    assert json.loads(captured.out)["error"]["code"] == "prompt_suppressed"
    assert captured.err == ""
    assert ManagementSetup(tmp_path / "models.json").read()["required"] is True


def test_cli_setup_does_not_import_gateway(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    script = "import sys; from jev_gateway.cli.main import main; code = main(['--home', sys.argv[1], '--json', 'setup', '--secret-stdin']); assert 'jev_gateway.gateway' not in sys.modules; raise SystemExit(code)"
    result = subprocess.run([sys.executable, "-c", script, str(tmp_path)], input=FAKE_KEY + "\n", capture_output=True, text=True, env={**os.environ, "PYTHONPATH": str(root)}, check=False)
    assert result.returncode == 0, result.stderr
    assert FAKE_KEY not in result.stdout + result.stderr


def test_setup_bootstraps_pending_declared_reference_and_rotates_through_shared_owner(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    app, config = fresh
    document = json.loads(config.models_file.read_text())
    document["gateway"]["api_key_env"] = "OPERATOR_GATEWAY_KEY"
    document["providers"] = [{"id": "pending", "type": "openai", "api_base": "https://fixture.invalid/v1", "api_key_env": "PENDING_UPSTREAM_KEY"}]
    config.models_file.write_text(json.dumps(document))
    before_env = (config.models_file.parent / ".env").read_bytes()
    initial = request(app, "GET").json()
    assert initial["required"] and initial["local_setup_available"]
    result = request(app, "POST", json={"expected_revision": initial["revision"], "api_key": FAKE_KEY})
    assert result.status_code == 200
    assert result.json()["next_step"] == "model"
    assert config.engine.catalog.gateway.api_key_env == "OPERATOR_GATEWAY_KEY"
    assert config.gateway_api_key == FAKE_KEY
    assert (config.models_file.parent / ".env").read_bytes() == before_env
    store = config.models_file.parent / "credentials.json"
    assert json.loads(store.read_text())["values"] == {"OPERATOR_GATEWAY_KEY": FAKE_KEY}
    auth = {"Authorization": f"Bearer {FAKE_KEY}"}
    snapshot = request(app, "GET", "/v1/provider-configuration", headers=auth).json()
    assert snapshot["revision"] == result.json()["revision"]
    assert snapshot["gateway"] == {"api_key_env": "OPERATOR_GATEWAY_KEY", "has_api_key": True}
    replacement = "fake-new-management-key"
    rotated = request(app, "PUT", "/v1/gateway-credential", headers=auth, json={"expected_revision": snapshot["revision"], "credential": {"action": "set", "value": replacement}})
    assert rotated.status_code == 200
    assert FAKE_KEY not in rotated.text and replacement not in rotated.text
    assert config.gateway_api_key == replacement
    assert request(app, "GET", headers=auth).status_code == 401
    assert json.loads(store.read_text())["values"] == {"OPERATOR_GATEWAY_KEY": replacement}


def test_setup_refuses_effective_declared_legacy_key(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    _, config = fresh
    document = json.loads(config.models_file.read_text())
    document["gateway"]["api_key_env"] = "LEGACY_GATEWAY_KEY"
    config.models_file.write_text(json.dumps(document))
    (config.models_file.parent / ".env").write_text(f"LEGACY_GATEWAY_KEY={FAKE_KEY}\n")
    service = ManagementSetup(config.models_file, external={})
    before = snapshot(config.models_file)
    with pytest.raises(SetupAlreadyConfigured):
        service.configure({"expected_revision": service.read()["revision"], "api_key": "fake-new-management-key"})
    assert snapshot(config.models_file) == before


def test_setup_keeps_original_listener_restriction_after_reload(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    _, config = fresh
    document = json.loads(config.models_file.read_text())
    document["gateway"]["host"] = "0.0.0.0"
    config.models_file.write_text(json.dumps(document))
    public_config = gateway.load_gateway_config(config.models_file)
    try:
        app = gateway.create_app(public_config)
        document["gateway"]["host"] = "127.0.0.1"
        config.models_file.write_text(json.dumps(document))
        assert request(app, "POST", "/v1/routing/reload").status_code == 200
        status = request(app, "GET").json()
        assert status["local_setup_available"] is False
        before = snapshot(config.models_file)
        denied = request(app, "POST", json={"expected_revision": status["revision"], "api_key": FAKE_KEY})
        assert denied.status_code == 403 and denied.json()["error"]["code"] == "setup_local_only"
        assert snapshot(config.models_file) == before
    finally:
        public_config.engine.close()


@pytest.mark.parametrize("headers", [
    [("Host", "127.0.0.1:8000"), ("Host", "localhost:8000")],
    [("Origin", "http://127.0.0.1:8000"), ("Origin", "http://127.0.0.1:8000")],
    [("X-Forwarded-Unknown", "fixture")],
])
def test_setup_uses_shared_header_bootstrap_checks(fresh: tuple[Any, gateway.GatewayConfig], headers: list[tuple[str, str]]) -> None:
    app, config = fresh
    body = setup_body(app)
    before = snapshot(config.models_file)
    assert request(app, "GET", headers=headers).json()["local_setup_available"] is False
    assert request(app, "POST", headers=headers, json=body).status_code == 403
    assert snapshot(config.models_file) == before


def test_initialization_preserves_existing_credential_bytes_and_mode(tmp_path: Path) -> None:
    path = tmp_path / "models.json"
    store = tmp_path / "credentials.json"
    original = b'{"version":1,"values":{"RETAINED":"fake-retained-key"}}\n'
    store.write_bytes(original)
    store.chmod(0o400)
    assert initialize_configuration(path)["credentials.json"] == "preserved"
    assert store.read_bytes() == original and store.stat().st_mode & 0o777 == 0o400


@pytest.mark.parametrize("gateway_shape", [None, {}])
def test_setup_accepts_optional_gateway_configuration(fresh: tuple[Any, gateway.GatewayConfig], gateway_shape: Any) -> None:
    app, config = fresh
    document = json.loads(config.models_file.read_text())
    document["gateway"] = gateway_shape
    config.models_file.write_text(json.dumps(document))
    result = request(app, "POST", json=setup_body(app))
    assert result.status_code == 200
    assert config.engine.catalog.gateway.api_key_env == "JEV_GATEWAY_API_KEY"
    assert config.gateway_api_key == FAKE_KEY


def test_malformed_setup_body_keeps_bootstrap_checks_and_safe_errors(fresh: tuple[Any, gateway.GatewayConfig]) -> None:
    app, config = fresh
    before = snapshot(config.models_file)
    denied = request(app, "POST", peer="203.0.113.1", json=[])
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "setup_local_only"
    invalid = request(app, "POST", content=b'{"fake-sensitive-field":"malformed', headers={"Content-Type": "application/json"})
    assert invalid.status_code == 400 and invalid.json()["error"]["code"] == "invalid_configuration"
    assert "fake-sensitive" not in invalid.text
    assert snapshot(config.models_file) == before
    assert request(app, "POST", json=setup_body(app)).status_code == 200
    assert request(app, "POST", json=[]).json()["error"]["code"] == "setup_already_configured"
