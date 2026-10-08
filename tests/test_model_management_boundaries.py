"""Preparation, canonical import ownership and management privacy boundaries."""

from __future__ import annotations

import copy
from dataclasses import asdict
import json
import os
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import gateway
from jev_gateway.discovery_network import DiscoveryNetworkError
from jev_gateway.provider_config import revision
from jev_gateway.routing_overlay import overlay_path
from tests.helpers import turns
from tests.test_model_revision_and_recovery_chat import files
from tests.test_model_transaction_publication import sqlite_app, versions, whole_transaction
from tests.test_provider_config import model
from tests.test_provider_management_api import headers, request


@pytest.mark.parametrize("failure", ["overlay", "baseline", "registry", "storage"])
@pytest.mark.parametrize("method,route", [
    ("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration"),
])
def test_model_preparation_rejects_invalid_candidates_without_publication(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: str, method: str, route: str,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        document = json.loads(config.models_file.read_text())
        document["models"][0].update(tags=["task_aware/simple"], priority=23)
        config.models_file.write_text(json.dumps(document))
        overlay_path(config.models_file).write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {
            "test-provider/vendor/only": {"tags": ["task_aware/complex"], "priority": 7},
        }}))
        body = whole_transaction(app, config)
        if failure == "overlay":
            overlay_path(config.models_file).write_text(json.dumps({"version": 2}))
        elif failure == "baseline":
            document["models"].append({"provider": "test-provider", "upstream_model": "vendor/bad", "enabled": "invalid"})
            config.models_file.write_text(json.dumps(document))
        elif failure == "storage":
            document["storage"]["path"] = str(tmp_path / "restart-required.sqlite3")
            config.models_file.write_text(json.dumps(document))
        body["expected_revision"] = revision(config.models_file)
        observed: list[Any] = []

        def reject(candidate: Any) -> Any:
            observed.append(candidate)
            assert list(candidate.profiles[0].tags) == ["task_aware/complex"]
            assert candidate.profiles[0].priority == 7
            assert candidate.providers[0].api_key == "fake-candidate"
            raise ValueError("synthetic-private-registry-error")

        monkeypatch.setattr(config.engine, "prepare_catalog_reload", reject)
        before, recorded, environment = files(tmp_path), versions(config), dict(os.environ)
        catalog, registry, digest, source, key = config.engine.catalog, config.engine.strategies, config.engine.config_hash, config.engine.config_source, config.gateway_api_key
        response = request(app, method, route, headers=headers(config), json=body)
        assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_configuration"
        assert "synthetic-private" not in response.text and "fake-candidate" not in response.text
        assert len(observed) == (1 if failure == "registry" else 0)
        assert files(tmp_path) == before and versions(config) == recorded
        assert config.engine.catalog is catalog and config.engine.strategies is registry
        assert config.engine.config_hash == digest and config.engine.config_source == source
        assert config.gateway_api_key == key and dict(os.environ) == environment
        assert not (tmp_path / "restart-required.sqlite3").exists()
    finally:
        config.engine.close()


def test_prepare_and_activate_receive_same_merged_credential_candidate(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        overlay_path(config.models_file).write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {
            "test-provider/vendor/only": {"tags": ["task_aware/complex"], "priority": 7},
        }}))
        body = whole_transaction(app, config)
        prepare, reload = config.engine.prepare_catalog_reload, config.engine.reload_catalog
        prepared: list[tuple[Any, Any]] = []
        activated: list[tuple[Any, Any]] = []

        def observe_prepare(candidate: Any) -> Any:
            registry = prepare(candidate)
            prepared.append((candidate, registry))
            return registry

        def observe_activate(candidate: Any, source: str | None = None, **kwargs: Any) -> None:
            activated.append((candidate, kwargs["registry"]))
            reload(candidate, source, **kwargs)

        monkeypatch.setattr(config.engine, "prepare_catalog_reload", observe_prepare)
        monkeypatch.setattr(config.engine, "reload_catalog", observe_activate)
        before, recorded = files(tmp_path), versions(config)
        checked = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=body)
        assert checked.status_code == 200 and files(tmp_path) == before and versions(config) == recorded
        assert len(prepared) == 1 and activated == []
        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert applied.status_code == 200 and len(prepared) == 2 and len(activated) == 1
        candidate, registry = activated[0]
        assert candidate.routing_snapshot() == prepared[-1][0].routing_snapshot()
        for prepared_candidate, _prepared_registry in prepared:
            assert prepared_candidate.providers[0].api_key == "fake-candidate"
            assert list(prepared_candidate.profiles[0].tags) == ["task_aware/complex"]
            assert prepared_candidate.profiles[0].priority == 7
        assert registry is prepared[-1][1] and config.engine.strategies is registry
        assert list(candidate.profiles[0].tags) == ["task_aware/complex"] and candidate.profiles[0].priority == 7
        assert candidate.providers[0].api_key == config.engine.catalog.providers[0].api_key == "fake-candidate"
        assert len(versions(config)) == len(recorded) + 1
    finally:
        config.engine.close()


def manual_model(name: str, price: float = 2.0) -> dict[str, Any]:
    entry = model(name)
    entry.update(tags=["custom/manual"], priority=23, context_window=8192)
    entry["cost"].update(output_per_million=price, cache_read_per_million=0, cache_write_per_million=None)
    values = {**entry["cost"], **entry["capabilities"], "context_window": 8192, "max_output_tokens": 1024}
    entry["metadata"] = {"version": 1, "confirmation": {"method": "manual", "confirmed_at": "2026-10-08T00:00:00Z"}, "fields": {
        name: {"status": "confirmed", "value": value, "method": "manual", "confirmed_at": "2026-10-08T00:00:00Z"}
        for name, value in values.items()
    }}
    return entry


def test_duplicate_imports_preserve_manual_records_and_cross_supplier_identity(tmp_path: Path) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        credential_file = tmp_path / "credentials.json"
        credential_file.write_text(json.dumps({"version": 1, "values": {"TEST_PROVIDER_KEY": "fake-before"}}))
        credential_file.chmod(0o600)
        document = json.loads(config.models_file.read_text())
        document["providers"].append({**document["providers"][0], "id": "other-provider"})
        existing = {**manual_model("vendor/only"), "provider": "test-provider"}
        document["models"][0] = existing
        config.models_file.write_text(json.dumps(document))
        overlay_path(config.models_file).write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {
            "test-provider/vendor/only": {"tags": ["task_aware/complex"], "priority": 7},
        }}))
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        overlay = overlay_path(config.models_file).read_bytes()
        environment, credential_files = dict(os.environ), {name: files(tmp_path)[name] for name in [".env", ".env.backup", "credentials.json", "credentials.json.backup"]}
        fresh, duplicate = manual_model("vendor/shared"), manual_model("vendor/shared", 9.0)
        operations = [
            {"action": "import", "provider_id": "test-provider", "confirmed": True, "models": [manual_model("vendor/only", 9.0), fresh, duplicate]},
            {"action": "import", "provider_id": "other-provider", "confirmed": True, "models": [fresh, duplicate]},
        ]
        before = versions(config)
        body = {"expected_revision": revision(config.models_file), "operations": operations}
        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert applied.status_code == 200 and applied.json()["imported"] == 2 and applied.json()["skipped"] == 3
        saved = json.loads(config.models_file.read_text())["models"]
        assert saved[0] == existing and len(saved) == 3
        assert saved[1] == {**fresh, "provider": "test-provider"}
        assert saved[2] == {**fresh, "provider": "other-provider"}
        assert len(versions(config)) == len(before) + 1
        recorded = versions(config)
        body["expected_revision"] = revision(config.models_file)
        repeated = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert repeated.status_code == 200 and repeated.json()["imported"] == 0 and repeated.json()["skipped"] == 5
        assert json.loads(config.models_file.read_text())["models"] == saved and versions(config) == recorded
        edit = {"expected_revision": revision(config.models_file), "operations": [{"action": "update_model", "model_id": "test-provider/vendor/shared", "model": duplicate}]}
        changed = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=edit)
        assert changed.status_code == 200
        updated = json.loads(config.models_file.read_text())["models"]
        assert updated[0] == existing and updated[1] == {**duplicate, "provider": "test-provider"} and updated[2] == saved[2]
        assert overlay_path(config.models_file).read_bytes() == overlay
        assert {name: files(tmp_path)[name] for name in credential_files} == credential_files
        assert dict(os.environ) == environment
        projected = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"]
        assert {p["name"] for p in projected} == {"test-provider/vendor/only", "test-provider/vendor/shared", "other-provider/vendor/shared"}
        assert projected[0]["metadata"] == existing["metadata"]
    finally:
        config.engine.close()


@pytest.mark.parametrize("field", ["cost", "capabilities", "metadata", "metadata_field", "metadata_source", "api_key", "api_key_env", "api_base", "redacted_params"])
@pytest.mark.parametrize("method,route", [("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")])
def test_hostile_model_fields_reject_without_file_live_or_credential_changes(
    tmp_path: Path, field: str, method: str, route: str,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        credential_file = tmp_path / "credentials.json"
        credential_file.write_text(json.dumps({"version": 1, "values": {"TEST_PROVIDER_KEY": "fake-before"}}))
        credential_file.chmod(0o600)
        body = whole_transaction(app, config)
        entry = body["operations"][1]["model"]
        secret = "synthetic-private-never-echo"
        if field in {"cost", "capabilities"}:
            entry[field][secret] = secret
        elif field == "metadata":
            entry["metadata"] = {"version": 1, secret: secret}
        elif field == "metadata_field":
            entry["metadata"] = {"version": 1, "fields": {"tools": {"status": "confirmed", "value": True, secret: secret}}}
        elif field == "metadata_source":
            entry["metadata"] = {"version": 1, "sources": [{"id": "source", secret: secret}]}
        elif field == "redacted_params":
            body["operations"][0]["provider"]["params"] = {"organization": "[configured]"}
        else:
            entry[field] = secret
        config.engine.decide(messages=turns("pin"), requested_model="test-provider/vendor/only", session_id="private-pin")
        session = config.engine.store.get("private-pin")
        assert session is not None
        state = asdict(session)
        before, recorded, environment = files(tmp_path), versions(config), dict(os.environ)
        catalog, registry, digest, source, key = config.engine.catalog, config.engine.strategies, config.engine.config_hash, config.engine.config_source, config.gateway_api_key
        response = request(app, method, route, headers=headers(config), json=body)
        assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_configuration"
        assert secret not in response.text and "fake-candidate" not in response.text
        assert files(tmp_path) == before and versions(config) == recorded and dict(os.environ) == environment
        assert credential_file.stat().st_mode & 0o777 == 0o600
        assert config.engine.catalog is catalog and config.engine.strategies is registry
        assert config.engine.config_hash == digest and config.engine.config_source == source and config.gateway_api_key == key
        assert config.engine.store.get("private-pin") is session and asdict(session) == state
        projected = request(app, "GET", "/v1/provider-configuration", headers=headers(config))
        assert projected.status_code == 200
        assert "fake-before" not in projected.text and "fake-candidate" not in projected.text
        assert "fake-management" not in projected.text
    finally:
        config.engine.close()


@pytest.mark.parametrize("selector", [
    {"provider_id": "absent"},
    {"provider_id": "test-provider", "provider": {"id": "other", "type": "openai"}},
    {"provider_id": "test-provider", "synthetic-private-unknown-key": "synthetic-private-value"},
    {"provider_id": "test-provider", "credential": "synthetic-private-value"},
    {"provider_id": "test-provider", "credential": {"action": "keep", "value": "synthetic-private-value"}},
])
def test_invalid_connection_selectors_reject_before_fetch_without_state_changes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, selector: dict[str, Any],
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        def forbidden(*_args: Any, **_kwargs: Any) -> Any:
            pytest.fail("Invalid connection selector reached fetch")

        monkeypatch.setattr(gateway.model_discovery, "safe_get_json", forbidden)
        before, recorded = files(tmp_path), versions(config)
        catalog, registry, digest, source, key = config.engine.catalog, config.engine.strategies, config.engine.config_hash, config.engine.config_source, config.gateway_api_key
        response = request(app, "POST", "/v1/provider-connection-test", headers=headers(config), json=selector)
        assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_configuration"
        assert "synthetic-private" not in response.text
        assert files(tmp_path) == before and versions(config) == recorded
        assert config.engine.catalog is catalog and config.engine.strategies is registry
        assert config.engine.config_hash == digest and config.engine.config_source == source and config.gateway_api_key == key
    finally:
        config.engine.close()


def test_authorized_upstream_auth_failure_is_result_not_local_unauthorized(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        calls: list[Any] = []

        def fail_auth(url: str, **kwargs: Any) -> Any:
            calls.append((url, kwargs["headers"]))
            raise DiscoveryNetworkError("authentication_failed")

        monkeypatch.setattr(gateway.model_discovery, "safe_get_json", fail_auth)
        before, recorded, key = files(tmp_path), versions(config), config.gateway_api_key
        catalog, registry, digest = config.engine.catalog, config.engine.strategies, config.engine.config_hash
        response = request(app, "POST", "/v1/provider-connection-test", headers=headers(config), json={"provider_id": "test-provider"})
        assert response.status_code == 200 and response.json()["status"] == "authentication_error"
        assert response.json()["scope"] == "model_listing"
        assert response.json()["warnings"] == ["generation_unverified", "authentication_failed"]
        assert len(calls) == 1 and calls[0][1]["Authorization"] == "Bearer fake-before"
        assert "fake-before" not in response.text and "WWW-Authenticate" not in response.headers
        assert config.gateway_api_key == key and files(tmp_path) == before and versions(config) == recorded
        assert config.engine.catalog is catalog and config.engine.strategies is registry and config.engine.config_hash == digest
        assert request(app, "GET", "/v1/provider-configuration", headers=headers(config)).status_code == 200
    finally:
        config.engine.close()


@pytest.mark.parametrize("authorization", ["missing", "wrong", "disabled"])
@pytest.mark.parametrize("operation", ["validate", "put", "discovery", "metadata", "connection"])
def test_legal_management_requests_authorize_before_commands_and_probes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, authorization: str, operation: str,
) -> None:
    app, config = sqlite_app(tmp_path)
    if authorization == "disabled":
        config.engine.close()
        document = json.loads(config.models_file.read_text())
        document["gateway"] = {}
        config.models_file.write_text(json.dumps(document))
        config = gateway.load_gateway_config(config.models_file)
        app = gateway.create_app(config)
    try:
        body = whole_transaction(app, config)
        config.engine.decide(messages=turns("pin"), requested_model="test-provider/vendor/only", session_id="auth-pin")
        session = config.engine.store.get("auth-pin")
        assert session is not None
        state = asdict(session)

        def forbidden(*_args: Any, **_kwargs: Any) -> Any:
            pytest.fail("Unauthorized management request reached preparation or upstream")

        monkeypatch.setattr(config.engine, "prepare_catalog_reload", forbidden)
        monkeypatch.setattr(gateway.model_discovery, "discover_models", forbidden)
        monkeypatch.setattr(gateway.model_discovery, "test_provider_connection", forbidden)
        monkeypatch.setattr(gateway.model_metadata, "lookup_model_metadata", forbidden)
        before, recorded, environment = files(tmp_path), versions(config), dict(os.environ)
        catalog, registry, digest, source, key = config.engine.catalog, config.engine.strategies, config.engine.config_hash, config.engine.config_source, config.gateway_api_key
        method = "PUT" if operation == "put" else "POST"
        path = {"validate": "/v1/provider-configuration/validate", "put": "/v1/provider-configuration", "discovery": "/v1/provider-discovery", "metadata": "/v1/provider-metadata", "connection": "/v1/provider-connection-test"}[operation]
        payload = body if operation in {"validate", "put"} else {"provider_id": "test-provider", **({"upstream_models": ["vendor/only"]} if operation == "metadata" else {})}
        auth = {"Authorization": "Bearer synthetic-wrong-key"} if authorization == "wrong" else {}
        response = request(app, method, path, headers=auth, json=payload)
        assert response.status_code == (403 if authorization == "disabled" else 401)
        assert response.json()["error"]["code"] == ("config_writes_disabled" if authorization == "disabled" else "invalid_api_key")
        assert "fake-candidate" not in response.text and "synthetic-wrong-key" not in response.text
        assert files(tmp_path) == before and versions(config) == recorded and dict(os.environ) == environment
        assert config.engine.catalog is catalog and config.engine.strategies is registry
        assert config.engine.config_hash == digest and config.engine.config_source == source and config.gateway_api_key == key
        assert config.engine.store.get("auth-pin") is session and asdict(session) == state
        if authorization == "disabled":
            assert request(app, "GET", "/v1/provider-configuration").status_code == 200
    finally:
        config.engine.close()
