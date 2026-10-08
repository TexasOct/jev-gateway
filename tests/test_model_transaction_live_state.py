"""Live session state and persisted overlay ownership across model transactions."""

from __future__ import annotations

import copy
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import asdict
import json
from pathlib import Path
import threading
from typing import Any, Iterator

import pytest

from jev_gateway import config_transaction, gateway
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.providers import add_provider
from jev_gateway.routing_overlay import overlay_path
from tests.helpers import turns
from tests.test_model_transaction_publication import sqlite_app, versions, whole_transaction
from tests.test_provider_management_api import headers, request


@pytest.mark.parametrize("reader", ["read", "discovery", "model_put"])
def test_cli_writer_serializes_management_read_discovery_and_model_put(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, reader: str,
) -> None:
    app, config = sqlite_app(tmp_path)
    replaced, release, attempting = threading.Event(), threading.Event(), threading.Event()
    original_bytes = config_transaction.atomic_bytes
    original_lock = config_transaction.configuration_lock
    body = whole_transaction(app, config)
    calls: list[tuple[str, str | None]] = []

    def pause(path: Path, data: bytes | None, *, protected: bool = False) -> None:
        original_bytes(path, data, protected=protected)
        if path == config.models_file:
            replaced.set()
            assert release.wait(10)

    @contextmanager
    def observed_lock(path: Path) -> Iterator[None]:
        if replaced.is_set() and not release.is_set():
            attempting.set()
        with original_lock(path):
            yield

    def discover(provider: dict[str, Any], key: str | None, **_kwargs: Any) -> dict[str, Any]:
        calls.append((provider["api_base"], key))
        return {"items": [], "warnings": [], "complete": True}

    monkeypatch.setattr(config_transaction, "atomic_bytes", pause)
    monkeypatch.setattr(config_transaction, "configuration_lock", observed_lock)
    monkeypatch.setattr(gateway.model_discovery, "discover_models", discover)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            writer = pool.submit(add_provider, runtime_paths(tmp_path), preset="custom", provider_id="new-provider", provider_type="openai", api_base="https://new.example/v1", api_key_env="NEW_FIXTURE_KEY", models=["new"], tags=[], secret="fake-coherent")
            assert replaced.wait(10)
            if reader == "read":
                pending = pool.submit(request, app, "GET", "/v1/provider-configuration", headers=headers(config))
            elif reader == "discovery":
                pending = pool.submit(request, app, "POST", "/v1/provider-discovery", headers=headers(config), json={"provider_id": "new-provider"})
            else:
                pending = pool.submit(request, app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
            try:
                assert attempting.wait(10)
                assert not pending.done() and not calls
            finally:
                release.set()
            assert writer.result(10)["secret_set"]
            result = pending.result(10)
        assert result.status_code == (409 if reader == "model_put" else 200)
        if reader == "read":
            new = next(p for p in result.json()["providers"] if p["id"] == "new-provider")
            assert new["has_api_key"] and new["api_base"] == "https://new.example/v1"
        elif reader == "discovery":
            assert calls == [("https://new.example/v1", "fake-coherent")]
        else:
            assert "fake-candidate" not in (tmp_path / "credentials.json").read_text()
            assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
            assert config.engine.catalog.providers[-1].api_key == "fake-coherent"
        assert not (tmp_path / ".provider-configuration.recovery").exists()
    finally:
        release.set()
        config.engine.close()


@pytest.mark.parametrize("phase", [
    "validate", "invalid_later", "invalid_import", "invalid_default",
    "baseline_replacement", "backup_replacement", "activation", "journal_removal",
])
def test_live_pin_registry_auth_and_versions_survive_uncommitted_transaction(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, phase: str,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        engine = config.engine
        engine.decide(messages=turns("pin"), requested_model="test-provider/vendor/only", session_id="live-pin")
        session = engine.store.get("live-pin")
        assert session is not None
        session.adapter_state["continuation"] = {"synthetic": [1, 2]}
        state = asdict(session)
        catalog, registry, store = engine.catalog, engine.strategies, engine.store
        digest, source, key = engine.config_hash, engine.config_source, config.gateway_api_key
        before = versions(config)
        baseline = config.models_file.read_bytes()
        body = whole_transaction(app, config)
        method, route, status = "PUT", "/v1/provider-configuration", 500
        if phase == "validate":
            method, route, status = "POST", route + "/validate", 200
        elif phase == "invalid_later":
            body["operations"][1]["model"]["capabilities"]["tools"] = None
            status = 400
        elif phase == "invalid_import":
            body["operations"].append({"action": "import", "provider_id": "test-provider", "confirmed": True, "models": [{}]})
            status = 400
        elif phase == "invalid_default":
            body["operations"].append({"action": "set_default_model", "model": "test-provider/absent"})
            status = 400
        elif phase in {"baseline_replacement", "backup_replacement"}:
            original_bytes = config_transaction.atomic_bytes
            target = config.models_file if phase == "baseline_replacement" else config.models_file.with_name("models.json.bak")
            failed = False

            def fail_write(path: Path, data: bytes | None, *, protected: bool = False) -> None:
                nonlocal failed
                if path == target and not failed:
                    failed = True
                    raise OSError("synthetic replacement failure")
                original_bytes(path, data, protected=protected)

            monkeypatch.setattr(config_transaction, "atomic_bytes", fail_write)
        elif phase == "activation":
            original = gateway.GatewayConfig.apply_settings

            def fail_settings(active: gateway.GatewayConfig, settings: Any) -> None:
                if active.engine.catalog is not catalog:
                    raise RuntimeError("synthetic activation failure")
                original(active, settings)

            monkeypatch.setattr(gateway.GatewayConfig, "apply_settings", fail_settings)
        else:
            original_unlink = Path.unlink

            def fail_journal(path: Path, missing_ok: bool = False) -> None:
                if path.name == ".provider-configuration.recovery" and not missing_ok:
                    raise OSError("synthetic journal removal failure")
                original_unlink(path, missing_ok=missing_ok)

            monkeypatch.setattr(Path, "unlink", fail_journal)

        response = request(app, method, route, headers=headers(config), json=body)
        assert response.status_code == status
        assert "fake-candidate" not in response.text
        assert engine.catalog is catalog and engine.strategies is registry
        assert engine.store is store and engine.store.get("live-pin") is session
        assert asdict(session) == state
        assert engine.config_hash == digest and engine.config_source == source
        assert config.gateway_api_key == key
        assert config.models_file.read_bytes() == baseline
        assert not (tmp_path / "credentials.json").exists()
        assert not (tmp_path / "models.json.bak").exists()
        assert not (tmp_path / ".provider-configuration.recovery").exists()
        assert versions(config) == before
        assert request(app, "GET", "/v1/provider-configuration", headers=headers(config)).status_code == 200
    finally:
        config.engine.close()


def test_default_replacement_and_model_disable_commit_in_one_transaction(tmp_path: Path) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        document = json.loads(config.models_file.read_text())
        alternate = copy.deepcopy(document["models"][0])
        alternate["upstream_model"] = "vendor/alternate"
        document["models"].append(alternate)
        document["defaults"] = {"default_model": "test-provider/vendor/only"}
        config.models_file.write_text(json.dumps(document))
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        before = versions(config)
        body = whole_transaction(app, config)
        body["operations"][1]["model"]["enabled"] = False
        body["operations"].append({"action": "set_default_model", "model": "test-provider/vendor/alternate"})
        result = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert result.status_code == 200
        saved = json.loads(config.models_file.read_text())
        assert saved["defaults"]["default_model"] == "test-provider/vendor/alternate"
        assert saved["models"][0]["enabled"] is False
        assert config.engine.catalog.defaults.default_model == "test-provider/vendor/alternate"
        selected = config.engine.decide(messages=turns("fresh"))
        assert selected.route_name == "test-provider/vendor/alternate"
        assert len(versions(config)) == len(before) + 1
    finally:
        config.engine.close()


def test_whole_model_overlay_ownership_persists_through_reload_and_restart(tmp_path: Path) -> None:
    app, config = sqlite_app(tmp_path)
    restarted: gateway.GatewayConfig | None = None
    try:
        baseline = json.loads(config.models_file.read_text())
        baseline["models"][0].update(tags=["task_aware/simple", "quality/keep"], priority=23)
        baseline["providers"].append({**baseline["providers"][0], "id": "other-provider"})
        untouched = copy.deepcopy(baseline["models"][0])
        untouched.update(provider="other-provider", upstream_model="vendor/untouched")
        baseline["models"].append(untouched)
        baseline["defaults"] = {"default_model": "other-provider/vendor/untouched"}
        config.models_file.write_text(json.dumps(baseline))
        path = overlay_path(config.models_file)
        path.write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {
            "test-provider/vendor/only": {"tags": ["task_aware/complex"], "priority": 7},
        }}))
        overlay_bytes = path.read_bytes()
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        config.engine.decide(messages=turns("pin"), requested_model="test-provider/vendor/only", session_id="live-pin")
        session = config.engine.store.get("live-pin")
        assert session is not None
        state = asdict(session)
        before = versions(config)
        body = whole_transaction(app, config)
        body["operations"] = body["operations"][1:]
        entry = body["operations"][0]["model"]
        entry.update(enabled=False, tags=["task_aware/complex"], priority=7)
        entry["capabilities"]["vision"] = True
        entry["metadata"] = {"version": 1, "fields": {
            "cache_read_per_million": {"status": "confirmed", "value": 0},
        }}
        original = config.models_file.read_bytes()
        catalog, registry, original_hash = config.engine.catalog, config.engine.strategies, config.engine.config_hash
        validation = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=body)
        assert validation.status_code == 200
        assert config.models_file.read_bytes() == original and path.read_bytes() == overlay_bytes
        assert config.engine.catalog is catalog and config.engine.strategies is registry
        assert config.engine.config_hash == original_hash and versions(config) == before
        assert asdict(session) == state
        response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert response.status_code == 200
        projected = response.json()["models"]
        snapshot = config.engine.catalog.routing_snapshot()
        digest = config.engine.config_hash
        committed = versions(config)
        assert len(committed) == len(before) + 1
        assert asdict(session) == state and config.engine.store.get("live-pin") is session
        saved = json.loads(config.models_file.read_text())
        assert {k: v for k, v in saved.items() if k != "models"} == {k: v for k, v in baseline.items() if k != "models"}
        assert saved["models"][1] == untouched
        assert saved["models"][0]["tags"] == ["task_aware/simple", "quality/keep"]
        assert saved["models"][0]["priority"] == 23
        assert path.read_bytes() == overlay_bytes
        assert projected[0]["tags"] == ["task_aware/complex"] and projected[0]["priority"] == 7
        assert projected[0]["enabled"] is False
        assert projected == validation.json()["models"]
        assert projected[0]["display_name"] == "Committed model"
        assert projected[0]["cost"] == entry["cost"]
        assert projected[0]["context_window"] == 8192 and projected[0]["max_output_tokens"] == 1024
        assert projected[0]["capabilities"]["vision"] is True
        assert projected[0]["metadata"]["fields"]["cache_read_per_million"]["value"] == 0
        assert request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"] == projected
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        assert config.engine.catalog.routing_snapshot() == snapshot
        assert config.engine.config_hash == digest and versions(config) == committed
        assert config.engine.store.get("live-pin") is session and asdict(session) == state
        config.engine.close()
        restarted = gateway.load_gateway_config(config.models_file)
        reopened_app = gateway.create_app(restarted)
        assert restarted.engine.catalog.routing_snapshot() == snapshot
        assert restarted.engine.config_hash == digest and versions(restarted) == committed
        assert request(reopened_app, "GET", "/v1/provider-configuration", headers=headers(restarted)).json()["models"] == projected
        assert path.read_bytes() == overlay_bytes
    finally:
        if restarted is not None:
            restarted.engine.close()
        else:
            config.engine.close()
