"""Credential compatibility and coherent configuration reads with fake keys."""

from __future__ import annotations

import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import pytest
import httpx

from jev_gateway import config_transaction, gateway
from jev_gateway.cli.output import CliError
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.providers import add_provider, login
from jev_gateway.provider_config import ProviderConfiguration, credential_snapshot, env_update
from tests.helpers import single_route_document
from tests.test_provider_management_api import request, headers


def fixture_app(tmp_path: Path) -> tuple[Any, gateway.GatewayConfig]:
    document = single_route_document()
    document["gateway"] = {"api_key_env": "MANAGEMENT_FIXTURE_KEY"}
    (tmp_path / "models.json").write_text(json.dumps(document))
    (tmp_path / ".env").write_text("MANAGEMENT_FIXTURE_KEY=fake-management\nTEST_PROVIDER_KEY=fake-before\n")
    config = gateway.load_gateway_config(tmp_path / "models.json")
    return gateway.create_app(config), config


def edit(app: Any, config: gateway.GatewayConfig, credential: dict[str, str], **fields: Any) -> dict[str, Any]:
    initial = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()
    return {"expected_revision": initial["revision"], "operations": [{"action": "upsert", "kind": "llm", "provider": {"id": "test-provider", "type": "openai", "api_base": "https://test.example/v1", "api_key_env": "TEST_PROVIDER_KEY", **fields}, "credential": credential}]}


def test_legacy_dotenv_order_duplicates_defaults_and_bare_values(tmp_path: Path) -> None:
    content = b"BASE_KEY=file-one\nA=${BASE_KEY}\nBASE_KEY=file-two\nB='${BASE_KEY}'\nC=${EXTERNAL_KEY}\nD=${MISSING:-fallback}\nE=${MISSING}\nBARE\nF=${BARE:-fallback}\nBASE_KEY\nG=${BASE_KEY:-fallback}\n"
    external = {"BASE_KEY": "external-base", "EXTERNAL_KEY": "fake-external", "BARE": "external-bare"}
    before = dict(os.environ)
    env = credential_snapshot(tmp_path / "models.json", env_content=content, external=external)
    assert dict(env) == {**external, "A": "file-one", "B": "file-two", "C": "fake-external", "D": "fallback", "E": "", "F": "", "G": ""}
    assert os.environ == before
    with pytest.raises(TypeError):
        env["A"] = "changed"  # type: ignore[index]


def test_http_cli_and_reload_preserve_expansions_and_managed_literals(tmp_path: Path) -> None:
    app, config = fixture_app(tmp_path)
    env_file = tmp_path / ".env"
    env_file.write_text("MANAGEMENT_FIXTURE_KEY=fake-management\nBASE_KEY=fake-expanded\nTEST_PROVIDER_KEY=${BASE_KEY}\n")
    process = dict(os.environ)
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    assert config.engine.catalog.providers[0].api_key == "fake-expanded"
    secret = "fake-${BASE_KEY}-${MISSING:-default}-$cash-`command`-'single'-\"double\"-\\tail"
    body = edit(app, config, {"action": "set", "value": secret})
    for method, route in [("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")]:
        result = request(app, method, route, headers=headers(config), json=body)
        assert result.status_code == 200
        assert secret not in result.text
    assert "# jev-managed-literal-v1" in env_file.read_text()
    assert credential_snapshot(config.models_file)["TEST_PROVIDER_KEY"] == secret
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    assert config.engine.catalog.providers[0].api_key == secret
    login(runtime_paths(tmp_path), "test-provider", "unused", secret + "-cli")
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    assert config.engine.catalog.providers[0].api_key == secret + "-cli"
    assert os.environ == process
    add_provider(runtime_paths(tmp_path), preset="custom", provider_id="new", provider_type="openai", api_base="https://new.example/v1", api_key_env="NEW_KEY", models=["new"], tags=[], secret=secret)
    assert credential_snapshot(config.models_file)["NEW_KEY"] == secret


@pytest.mark.parametrize("reference", ["gateway", "llm", "decision", "param_env"])
def test_cli_add_rejects_every_shared_reference_without_writes(tmp_path: Path, reference: str) -> None:
    document = single_route_document()
    if reference == "gateway":
        document["gateway"] = {"api_key_env": "SHARED_FIXTURE_KEY"}
    elif reference == "llm":
        document["providers"].append({"id": "other", "type": "openai", "api_key_env": "SHARED_FIXTURE_KEY"})
    elif reference == "decision":
        document["decision"] = {"enabled": False, "providers": [{"id": "one", "protocol": "system_one", "api_base": "https://decision.example/evaluate", "api_key_env": "SHARED_FIXTURE_KEY"}]}
    else:
        document["providers"][0]["param_env"] = {"organization": "SHARED_FIXTURE_KEY"}
    path = tmp_path / "models.json"
    path.write_text(json.dumps(document))
    (tmp_path / ".env").write_text("SHARED_FIXTURE_KEY=fake-existing\n")
    before = {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    process = dict(os.environ)
    with pytest.raises(CliError, match="shared"):
        add_provider(runtime_paths(tmp_path), preset="openai", provider_id="new", provider_type=None, api_base=None, api_key_env="SHARED_FIXTURE_KEY", models=["new"], tags=[], secret="fake-replacement")
    assert {p.name: p.read_bytes() for p in tmp_path.iterdir() if p.name != ".provider-configuration.lock"} == before
    assert os.environ == process


@pytest.mark.parametrize("kind", ["decision", "llm"])
def test_clear_keeps_external_fallback_in_every_projection(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str) -> None:
    monkeypatch.setenv("CLEAR_FIXTURE_KEY", "fake-external")
    app, config = fixture_app(tmp_path)
    document = json.loads(config.models_file.read_text())
    if kind == "decision":
        provider = {"id": "one", "protocol": "system_one", "api_base": "https://decision.example/evaluate", "api_key_env": "CLEAR_FIXTURE_KEY"}
        document["decision"] = {"enabled": False, "providers": [provider]}
    else:
        provider = {**document["providers"][0], "api_key_env": "CLEAR_FIXTURE_KEY"}
        document["providers"][0] = provider
    config.models_file.write_text(json.dumps(document))
    env_file = tmp_path / ".env"
    env_file.write_bytes(env_update(env_file.read_bytes(), "CLEAR_FIXTURE_KEY", "fake-local"))
    current = ProviderConfiguration(config.models_file, external=config.credential_environment)
    if kind == "llm":
        assert current.discovery_provider({"provider_id": provider["id"], "credential": {"action": "clear"}})[1] == "fake-external"
        assert credential_snapshot(config.models_file)["CLEAR_FIXTURE_KEY"] == "fake-local"
    body = {"expected_revision": current.read()["revision"], "operations": [{"action": "upsert", "kind": kind, "provider": provider, "credential": {"action": "clear"}}]}
    for method, route in [("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")]:
        response = request(app, method, route, headers=headers(config), json=body)
        assert response.status_code == 200
        views = response.json()["decision"]["providers"] if kind == "decision" else response.json()["providers"]
        assert views[0]["has_api_key"] is True
    body["expected_revision"] = current.read()["revision"]
    body["operations"][0]["credential"] = {"action": "keep"}
    assert current.command(body)["valid"]
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    assert credential_snapshot(config.models_file)["CLEAR_FIXTURE_KEY"] == "fake-external"
    if kind == "llm":
        assert current.discovery_provider({"provider_id": provider["id"], "credential": {"action": "clear"}})[1] == "fake-external"
        body["operations"][0]["provider"].pop("api_key_env")
        body["operations"][0]["provider"]["type"] = "anthropic"
        body["operations"][0]["credential"] = {"action": "clear"}
        assert current.command(body, apply=True)["providers"][0]["has_api_key"] is False


def test_partial_recovery_blocks_reads_adapters_and_activation_until_manual_repair(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = fixture_app(tmp_path)
    previous = config.engine.catalog
    old_document = config.models_file.read_bytes()
    old_env = (tmp_path / ".env").read_bytes()
    body = edit(app, config, {"action": "set", "value": "fake-new"}, api_base="https://changed.example/v1")
    original = config_transaction.atomic_bytes

    def fault(path: Path, data: bytes | None, *, protected: bool = False) -> None:
        if path.name == ".env" or (path == config.models_file and data == old_document):
            raise OSError("fake-key-in-write-error")
        original(path, data, protected=protected)

    monkeypatch.setattr(config_transaction, "atomic_bytes", fault)
    response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
    assert response.status_code == 500 and "fake-key" not in response.text
    assert json.loads(config.models_file.read_text())["providers"][0]["api_base"] == "https://changed.example/v1"
    assert (tmp_path / ".env").read_bytes() == old_env
    assert config.engine.catalog is previous
    calls: list[Any] = []
    monkeypatch.setattr(gateway.model_discovery, "discover_models", lambda *a, **k: calls.append(a))
    monkeypatch.setattr(gateway.model_metadata, "lookup_model_metadata", lambda *a, **k: calls.append(a))
    for method, route, payload in [("GET", "/v1/provider-configuration", None), ("POST", "/v1/provider-discovery", {"provider_id": "test-provider"}), ("POST", "/v1/provider-metadata", {"provider_id": "test-provider", "upstream_models": ["new"]}), ("POST", "/v1/routing/reload", None), ("GET", "/v1/routing/configuration", None), ("POST", "/v1/routing/configuration/validate", {"version": 1, "strategy": "task_aware", "rules": []}), ("DELETE", "/v1/routing/configuration", None), ("PUT", "/v1/routing/configuration", {"version": 1, "strategy": "task_aware", "rules": []})]:
        rejected = request(app, method, route, headers=headers(config), json=payload)
        assert rejected.status_code == (400 if route.startswith("/v1/routing/") else 500)
        assert rejected.json()["error"]["code"] == ("invalid_configuration" if route.startswith("/v1/routing/") else "provider_configuration_failed")
        assert "changed.example" not in rejected.text and "fake-key" not in rejected.text
        assert config.engine.catalog is previous
    assert calls == []
    assert request(app, "GET", "/v1/models", headers=headers(config)).status_code == 200
    with pytest.raises(RuntimeError, match="unresolved"):
        gateway.load_gateway_config(config.models_file)
    monkeypatch.setattr(config_transaction, "atomic_bytes", original)
    config.models_file.write_bytes(old_document)
    (tmp_path / ".env").write_bytes(old_env)
    (tmp_path / ".provider-configuration.recovery").unlink()
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    assert config.engine.catalog.providers[0].api_base == previous.providers[0].api_base


def test_reload_preparation_serializes_later_put(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = fixture_app(tmp_path)
    body = edit(app, config, {"action": "set", "value": "fake-committed"}, display_name="Committed")
    prepared, release, put_started = threading.Event(), threading.Event(), threading.Event()
    prepare = config.engine.prepare_catalog_reload
    first = True

    def pause(catalog: Any) -> Any:
        nonlocal first
        if first:
            first = False
            prepared.set()
            assert release.wait(10)
        return prepare(catalog)

    monkeypatch.setattr(config.engine, "prepare_catalog_reload", pause)
    def put() -> Any:
        put_started.set()
        return request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)

    with ThreadPoolExecutor(max_workers=2) as pool:
        reload = pool.submit(request, app, "POST", "/v1/routing/reload", headers=headers(config))
        assert prepared.wait(10)
        later = pool.submit(put)
        assert put_started.wait(10)
        assert not later.done()
        release.set()
        assert reload.result(10).status_code == 200
        assert later.result(10).status_code == 200
    assert config.engine.catalog.providers[0].display_name == "Committed"
    assert config.engine.catalog.providers[0].api_key == "fake-committed"
    assert gateway.load_gateway_config(config.models_file).engine.catalog.providers == config.engine.catalog.providers


@pytest.mark.parametrize("reader", ["startup", "reload"])
def test_normal_cli_writer_blocks_readers_until_coherent_commit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, reader: str) -> None:
    app, config = fixture_app(tmp_path)
    replaced, release, attempting = threading.Event(), threading.Event(), threading.Event()
    original = config_transaction.atomic_bytes
    original_lock = config_transaction.configuration_lock

    def pause(path: Path, data: bytes | None, *, protected: bool = False) -> None:
        original(path, data, protected=protected)
        if path == config.models_file:
            replaced.set()
            assert release.wait(10)

    @contextmanager
    def observed_lock(path: Path) -> Iterator[None]:
        if replaced.is_set() and not release.is_set():
            attempting.set()
        with original_lock(path):
            yield

    monkeypatch.setattr(config_transaction, "atomic_bytes", pause)
    monkeypatch.setattr(config_transaction, "configuration_lock", observed_lock)
    monkeypatch.setattr(gateway, "configuration_lock", observed_lock)
    with ThreadPoolExecutor(max_workers=2) as pool:
        writer = pool.submit(add_provider, runtime_paths(tmp_path), preset="openai", provider_id="new", provider_type=None, api_base=None, api_key_env="NEW_FIXTURE_KEY", models=["new"], tags=[], secret="fake-coherent")
        assert replaced.wait(10)
        if reader == "startup":
            pending = pool.submit(gateway.load_gateway_config, config.models_file)
        else:
            pending = pool.submit(request, app, "POST", "/v1/routing/reload", headers=headers(config))
        assert attempting.wait(10)
        assert not pending.done()
        release.set()
        assert writer.result(10)["secret_set"]
        result = pending.result(10)
    if isinstance(result, gateway.GatewayConfig):
        catalog = result.engine.catalog
    else:
        assert isinstance(result, httpx.Response)
        assert result.status_code == 200
        catalog = config.engine.catalog
    assert next(p for p in catalog.providers if p.name == "new").api_key == "fake-coherent"
    assert not (tmp_path / ".provider-configuration.recovery").exists()


def test_activation_callback_can_reenter_coherent_reads(tmp_path: Path) -> None:
    app, config = fixture_app(tmp_path)
    current = ProviderConfiguration(config.models_file)
    body = edit(app, config, {"action": "set", "value": "fake-reentrant"}, display_name="Reentrant")
    seen: list[Any] = []
    def activate(catalog: Any, registry: Any) -> None:
        seen.append(current.read()["providers"][0]["display_name"])
        seen.append(credential_snapshot(config.models_file)["TEST_PROVIDER_KEY"])
    current.command(body, apply=True, activate=activate)
    assert seen == ["Reentrant", "fake-reentrant"]


def test_clear_required_llm_without_external_fallback_rejects_without_write(tmp_path: Path) -> None:
    app, config = fixture_app(tmp_path)
    current = ProviderConfiguration(config.models_file, external={"MANAGEMENT_FIXTURE_KEY": "fake-management"})
    body = edit(app, config, {"action": "clear"})
    before = {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    with pytest.raises(ValueError, match="not set|requires"):
        current.command(body, apply=True)
    assert {p.name: p.read_bytes() for p in tmp_path.iterdir()} == before
