"""Revision conflicts and healthy in-memory chat during unresolved recovery."""

from __future__ import annotations

import copy
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import stat
import subprocess
import sys
import threading
from typing import Any

import pytest

from jev_gateway import config_transaction, gateway
from tests.helpers import turns
from tests.test_gateway import install_completion
from tests.test_model_transaction_publication import sqlite_app, versions, whole_transaction
from tests.test_provider_management_api import headers, request


def files(directory: Path) -> dict[str, bytes | None]:
    names = ["models.json", "models.json.bak", "routing-overrides.json", ".env", ".env.backup", "credentials.json", "credentials.json.backup", ".provider-configuration.recovery"]
    return {name: (directory / name).read_bytes() if (directory / name).exists() else None for name in names}


@pytest.mark.parametrize("changed", ["baseline", "overlay", "dotenv", "credentials"])
@pytest.mark.parametrize("method,route", [
    ("POST", "/v1/provider-configuration/validate"),
    ("PUT", "/v1/provider-configuration"),
])
def test_single_file_change_rejects_stale_revision_without_publication(
    tmp_path: Path, changed: str, method: str, route: str,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        body = whole_transaction(app, config)
        catalog, registry = config.engine.catalog, config.engine.strategies
        digest, source, key = config.engine.config_hash, config.engine.config_source, config.gateway_api_key
        before = versions(config)
        if changed == "baseline":
            config.models_file.write_bytes(config.models_file.read_bytes() + b"\n")
        elif changed == "overlay":
            (tmp_path / "routing-overrides.json").write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {}}))
        elif changed == "dotenv":
            (tmp_path / ".env").write_bytes((tmp_path / ".env").read_bytes() + b"# synthetic revision change\n")
        else:
            (tmp_path / "credentials.json").write_text(json.dumps({"version": 1, "values": {"UNRELATED_FIXTURE_KEY": "fake-unrelated"}}))
        changed_files = files(tmp_path)
        response = request(app, method, route, headers=headers(config), json=body)
        assert response.status_code == 409 and response.json()["error"]["code"] == "revision_conflict"
        assert files(tmp_path) == changed_files
        assert config.engine.catalog is catalog and config.engine.strategies is registry
        assert config.engine.config_hash == digest and config.engine.config_source == source
        assert config.gateway_api_key == key and versions(config) == before
        current = request(app, "GET", "/v1/provider-configuration", headers=headers(config))
        assert current.status_code == 200 and current.json()["revision"] != body["expected_revision"]
        assert "fake-candidate" not in response.text + current.text
        for name in [".env", "credentials.json"]:
            content = changed_files[name]
            if content is not None:
                assert current.json()["revision"] != hashlib.sha256(content).hexdigest()
    finally:
        config.engine.close()


def test_cooperative_same_revision_asgi_writers_publish_only_the_winner(tmp_path: Path) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        first = whole_transaction(app, config)
        second = copy.deepcopy(first)
        first["operations"][1]["model"]["display_name"] = "First candidate"
        second["operations"][1]["model"]["display_name"] = "Second candidate"
        before = versions(config)
        ready = threading.Barrier(2)

        def write(body: dict[str, Any]) -> Any:
            ready.wait(10)
            return request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(write, [first, second]))
        assert sorted(r.status_code for r in responses) == [200, 409]
        rejected = next(r for r in responses if r.status_code == 409)
        assert rejected.json()["error"]["code"] == "revision_conflict"
        winner = next(r for r in responses if r.status_code == 200).json()["models"][0]["display_name"]
        assert json.loads(config.models_file.read_text())["models"][0]["display_name"] == winner
        assert config.engine.catalog.profiles[0].display_name == winner
        assert len(versions(config)) == len(before) + 1
        assert not (tmp_path / ".provider-configuration.recovery").exists()
    finally:
        config.engine.close()


def test_noncooperative_prepare_edit_triggers_second_revision_check(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        body = whole_transaction(app, config)
        catalog, registry, digest = config.engine.catalog, config.engine.strategies, config.engine.config_hash
        source, key = config.engine.config_source, config.gateway_api_key
        before = versions(config)
        prepare = config.engine.prepare_catalog_reload
        observed: list[bytes] = []

        def edit_during_prepare(candidate: Any) -> Any:
            prepared = prepare(candidate)
            changed = config.models_file.read_bytes() + b"\n"
            config.models_file.write_bytes(changed)
            observed.append(changed)
            return prepared

        monkeypatch.setattr(config.engine, "prepare_catalog_reload", edit_during_prepare)
        response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert response.status_code == 409 and response.json()["error"]["code"] == "revision_conflict"
        assert len(observed) == 1 and config.models_file.read_bytes() == observed[0]
        assert config.engine.catalog is catalog and config.engine.strategies is registry
        assert config.engine.config_hash == digest and versions(config) == before
        assert config.engine.config_source == source and config.gateway_api_key == key
        assert not (tmp_path / "credentials.json").exists()
        assert not (tmp_path / "models.json.bak").exists()
        assert not (tmp_path / ".provider-configuration.recovery").exists()
    finally:
        config.engine.close()


def test_restarted_process_owner_rejects_previous_revision_token(tmp_path: Path) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        body = whole_transaction(app, config)
        payload = tmp_path / "previous-owner-command.json"
        payload.write_text(json.dumps(body))
        before_files, before = files(tmp_path), versions(config)
        catalog, registry, digest = config.engine.catalog, config.engine.strategies, config.engine.config_hash
        source, key = config.engine.config_source, config.gateway_api_key
        script = """import json, sys
from pathlib import Path
from jev_gateway.provider_config import ProviderConfiguration, RevisionConflict
owner = ProviderConfiguration(Path(sys.argv[1]))
body = json.loads(Path(sys.argv[2]).read_text())
assert owner.read()['revision'] != body['expected_revision']
for apply in (False, True):
    try:
        owner.command(body, apply=apply)
    except RevisionConflict:
        print('revision_conflict', apply)
    else:
        raise AssertionError('old process token accepted')
"""
        argv = [sys.executable, "-c", script, str(config.models_file), str(payload)]
        cwd = Path(__file__).resolve().parents[1]
        result = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=20)
        (tmp_path / "restart-command-receipt.json").write_text(json.dumps({
            "argv": argv, "cwd": str(cwd), "exit": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr,
            "test_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        }, indent=2))
        assert result.returncode == 0, result.stderr
        assert result.stdout.splitlines() == ["revision_conflict False", "revision_conflict True"]
        assert files(tmp_path) == before_files and versions(config) == before
        assert config.engine.catalog is catalog and config.engine.strategies is registry
        assert config.engine.config_hash == digest
        assert config.engine.config_source == source and config.gateway_api_key == key
    finally:
        config.engine.close()


def test_healthy_pinned_asgi_chat_survives_unresolved_recovery(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        config.session_strategy = "header"
        engine = config.engine
        engine.decide(messages=turns("seed"), requested_model="test-provider/vendor/only", session_id="healthy-pin")
        session = engine.store.get("healthy-pin")
        assert session is not None
        catalog, registry, digest, source, key = engine.catalog, engine.strategies, engine.config_hash, engine.config_source, config.gateway_api_key
        before = versions(config)
        body = whole_transaction(app, config)
        old_document = config.models_file.read_bytes()
        original_bytes = config_transaction.atomic_bytes

        def fail_write_and_restore(path: Path, data: bytes | None, *, protected: bool = False) -> None:
            if path.name == "credentials.json" or (path == config.models_file and data == old_document):
                raise OSError("synthetic failed restore")
            original_bytes(path, data, protected=protected)

        monkeypatch.setattr(config_transaction, "atomic_bytes", fail_write_and_restore)
        failed = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert failed.status_code == 500 and failed.json()["error"]["code"] == "provider_configuration_failed"
        journal = tmp_path / ".provider-configuration.recovery"
        assert stat.S_IMODE(journal.stat().st_mode) == 0o600
        recovery_files = files(tmp_path)
        assert versions(config) == before
        calls = install_completion(monkeypatch)
        response = request(app, "POST", "/v1/chat/completions", headers={**headers(config), "X-JEV-Session-Id": "healthy-pin"}, json={"model": "test-provider/vendor/only", "messages": [{"role": "user", "content": "synthetic continuation"}]})
        assert response.status_code == 200 and response.json()["choices"][0]["message"]["content"] == "ok"
        assert len(calls) == 1 and calls[0]["api_key"] == "fake-before"
        assert engine.store.get("healthy-pin") is session and session.route == "test-provider/vendor/only"
        assert engine.catalog is catalog and engine.strategies is registry
        assert engine.config_hash == digest and engine.config_source == source and config.gateway_api_key == key
        assert versions(config) == before and files(tmp_path) == recovery_files

        def forbidden(*_args: Any, **_kwargs: Any) -> Any:
            pytest.fail("Unresolved configuration reached a discovery/metadata probe")

        monkeypatch.setattr(gateway.model_discovery, "discover_models", forbidden)
        monkeypatch.setattr(gateway.model_discovery, "test_provider_connection", forbidden)
        monkeypatch.setattr(gateway.model_metadata, "lookup_model_metadata", forbidden)
        endpoints = [
            ("GET", "/v1/provider-configuration", None),
            ("POST", "/v1/provider-configuration/validate", body),
            ("PUT", "/v1/provider-configuration", body),
            ("POST", "/v1/provider-discovery", {"provider_id": "test-provider"}),
            ("POST", "/v1/provider-metadata", {"provider_id": "test-provider", "upstream_models": ["vendor/only"]}),
            ("POST", "/v1/provider-connection-test", {"provider_id": "test-provider"}),
            ("POST", "/v1/routing/reload", None),
            ("GET", "/v1/routing/configuration", None),
            ("POST", "/v1/routing/configuration/validate", {"version": 1, "strategy": "task_aware", "rules": []}),
            ("PUT", "/v1/routing/configuration", {"version": 1, "strategy": "task_aware", "rules": []}),
            ("DELETE", "/v1/routing/configuration", None),
        ]
        for method, route, payload in endpoints:
            rejected = request(app, method, route, headers=headers(config), json=payload)
            routing = route.startswith("/v1/routing/")
            assert rejected.status_code == (400 if routing else 500)
            assert rejected.json()["error"]["code"] == ("invalid_configuration" if routing else "provider_configuration_failed")
        assert files(tmp_path) == recovery_files and len(calls) == 1
        assert engine.catalog is catalog and engine.strategies is registry
        assert engine.config_hash == digest and config.gateway_api_key == key
        assert versions(config) == before
        assert stat.S_IMODE(journal.stat().st_mode) == 0o600
    finally:
        config.engine.close()
