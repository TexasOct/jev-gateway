"""Model/provider transactions publish only committed SQLite snapshots."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import gateway
from jev_gateway.provider_config import ProviderConfiguration
from jev_gateway.records import build_config_hash
from tests.helpers import single_route_document
from tests.test_provider_config import model
from tests.test_provider_config_regressions import edit
from tests.test_provider_management_api import headers, request


def sqlite_app(tmp_path: Path) -> tuple[Any, gateway.GatewayConfig]:
    document = single_route_document()
    document["gateway"] = {"api_key_env": "MANAGEMENT_FIXTURE_KEY"}
    document["storage"] = {"enabled": True, "path": str(tmp_path / "records.sqlite3")}
    path = tmp_path / "models.json"
    path.write_text(json.dumps(document))
    (tmp_path / ".env").write_text(
        "MANAGEMENT_FIXTURE_KEY=fake-management\nTEST_PROVIDER_KEY=fake-before\n"
    )
    config = gateway.load_gateway_config(path)
    return gateway.create_app(config), config


def versions(config: gateway.GatewayConfig) -> list[tuple[str, str, str]]:
    config.engine.record_store.flush()
    with sqlite3.connect(config.engine.catalog.storage.path) as connection:
        return connection.execute(
            "SELECT config_hash, source, catalog_json FROM config_versions ORDER BY config_hash"
        ).fetchall()


def whole_transaction(app: Any, config: gateway.GatewayConfig) -> dict[str, Any]:
    body = edit(app, config, {"action": "set", "value": "fake-candidate"})
    entry = model("vendor/only")
    entry.update(display_name="Committed model", context_window=8192)
    entry["cost"].update(cache_read_per_million=0, cache_write_per_million=None)
    body["operations"].append({
        "action": "update_model", "model_id": "test-provider/vendor/only", "model": entry,
    })
    return body


def test_whole_transaction_validation_commit_and_stale_write_sqlite(tmp_path: Path) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        before = versions(config)
        baseline = config.models_file.read_bytes()
        body = whole_transaction(app, config)
        validated = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=body)
        assert validated.status_code == 200
        assert config.models_file.read_bytes() == baseline
        assert not (tmp_path / "credentials.json").exists()
        assert versions(config) == before

        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert applied.status_code == 200
        assert not (tmp_path / ".provider-configuration.recovery").exists()
        committed = versions(config)
        assert len(committed) == len(before) + 1
        digest = build_config_hash(config.engine.catalog.routing_snapshot())
        assert config.engine.config_hash == digest
        snapshot = next(row for row in committed if row[0] == digest)
        assert snapshot[1] == str(config.models_file)
        assert json.loads(snapshot[2]) == config.engine.catalog.routing_snapshot()
        assert config.engine.catalog.profiles[0].display_name == "Committed model"
        assert config.engine.catalog.providers[0].api_key == "fake-candidate"
        reread = ProviderConfiguration(config.models_file).read()
        assert reread["models"] == applied.json()["models"]
        assert "fake-candidate" not in applied.text + snapshot[2]

        files = {p.name: p.read_bytes() for p in tmp_path.iterdir() if p.suffix != ".sqlite3" and not p.name.startswith("records.sqlite3")}
        rejected = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert rejected.status_code == 409
        assert versions(config) == committed
        assert config.engine.config_hash == digest
        assert all((tmp_path / name).read_bytes() == content for name, content in files.items())
    finally:
        config.engine.close()


@pytest.mark.parametrize("method,route", [
    ("POST", "/v1/provider-configuration/validate"),
    ("PUT", "/v1/provider-configuration"),
])
def test_invalid_later_model_operation_does_not_rotate_credentials_or_publish(
    tmp_path: Path, method: str, route: str,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        before = versions(config)
        baseline = config.models_file.read_bytes()
        catalog, digest = config.engine.catalog, config.engine.config_hash
        body = whole_transaction(app, config)
        body["operations"][1]["model"]["cost"]["cache_read_per_million"] = -1
        result = request(app, method, route, headers=headers(config), json=body)
        assert result.status_code == 400
        assert "fake-candidate" not in result.text
        assert config.models_file.read_bytes() == baseline
        assert not (tmp_path / "credentials.json").exists()
        assert not (tmp_path / ".provider-configuration.recovery").exists()
        assert config.engine.catalog is catalog
        assert config.engine.config_hash == digest
        assert versions(config) == before
    finally:
        config.engine.close()


@pytest.mark.parametrize("failure", ["activation", "journal_removal"])
def test_failed_whole_transaction_restores_hash_files_and_sqlite(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: str,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        before = versions(config)
        catalog, registry = config.engine.catalog, config.engine.strategies
        digest, source = config.engine.config_hash, config.engine.config_source
        body = whole_transaction(app, config)
        baseline = config.models_file.read_bytes()
        env = (tmp_path / ".env").read_bytes()
        journal = tmp_path / ".provider-configuration.recovery"
        observed: list[bool] = []
        if failure == "activation":
            apply_settings = gateway.GatewayConfig.apply_settings

            def fail_settings(active: gateway.GatewayConfig, settings: Any) -> None:
                if active.engine.catalog is not catalog:
                    observed.append(journal.exists())
                    assert versions(config) == before
                    raise RuntimeError("fake-candidate activation error")
                apply_settings(active, settings)

            monkeypatch.setattr(gateway.GatewayConfig, "apply_settings", fail_settings)
        else:
            unlink = Path.unlink

            def fail_unlink(path: Path, missing_ok: bool = False) -> None:
                if path == journal and not missing_ok:
                    observed.append(path.exists())
                    assert versions(config) == before
                    raise OSError("fake-candidate journal error")
                unlink(path, missing_ok=missing_ok)

            monkeypatch.setattr(Path, "unlink", fail_unlink)

        result = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert result.status_code == 500
        assert result.json()["error"]["code"] == "provider_configuration_failed"
        assert "fake-candidate" not in result.text
        assert observed == [True]
        assert config.models_file.read_bytes() == baseline
        assert (tmp_path / ".env").read_bytes() == env
        assert not (tmp_path / "credentials.json").exists()
        assert not journal.exists()
        assert config.engine.catalog is catalog
        assert config.engine.strategies is registry
        assert config.engine.config_hash == digest
        assert config.engine.config_source == source
        assert versions(config) == before
    finally:
        config.engine.close()
