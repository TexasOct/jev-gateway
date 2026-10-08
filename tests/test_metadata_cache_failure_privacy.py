"""Finite M10-M13 cache, authenticated degradation and privacy acceptance."""

from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path
import socket
import stat
from typing import Any

import pytest

from jev_gateway import discovery_network as network, gateway, model_discovery
from jev_gateway import model_metadata as metadata
from jev_gateway.provider_config import metadata_envelope
from tests.helpers import single_route_document, turns
from tests.test_discovery_network import Response
from tests.test_gateway import install_completion
from tests.test_model_management_boundaries import manual_model
from tests.test_model_transaction_publication import versions
from tests.test_provider_management_api import headers, request

PROVIDER = {"id": "test-provider", "type": "openai", "api_base": "https://api.openai.com/v1"}
URLS = {"https://models.dev/api.json", "https://models.dev/catalog.json", "https://openrouter.ai/api/v1/models"}
FIELDS = {"input_per_million", "output_per_million", "cache_read_per_million", "cache_write_per_million", "tools", "vision", "json_mode", "reasoning", "temperature", "reasoning_effort", "context_window", "max_output_tokens"}
NAMES = ["models.json", "models.json.bak", "routing-overrides.json", ".env", ".env.backup", "credentials.json", "credentials.json.backup", ".provider-configuration.recovery", "dashboard-theme.json", "routing-canvas-layout.json"]
CANARIES = ["synthetic-gateway-canary", "synthetic-provider-canary", "synthetic-transport-canary", "synthetic-candidate-canary", "synthetic-candidate-transport", "synthetic-user-text", "synthetic-custom-endpoint"]


def forbidden(*_args: Any, **_kwargs: Any) -> Any:
    raise AssertionError("Unmocked outbound or metadata fetch forbidden")


@pytest.fixture(autouse=True)
def block_outbound(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)


def public_row(price: int = 3) -> dict[str, Any]:
    return {"openai": {"models": {"vendor/only": {"id": "vendor/only", "cost": {"input": price}, "tool_call": False, "last_updated": "2026-01-02"}}}}


@pytest.mark.parametrize("control,ttl,retained", [
    ("public, max-age=60", 60, True),
    ("max-age=999999", 21600, True),
    ("no-cache, max-age=60", 0, True),
    ("no-store, max-age=60", 0, False),
], ids=["max-age 60", "six-hour cap", "no-cache", "no-store"])
def test_cache_directives_and_exact_refresh_boundary(control: str, ttl: int, retained: bool) -> None:
    now = [0.0]
    calls: list[dict[str, Any]] = []

    def fetch(url: str, **kwargs: Any) -> network.JsonResponse:
        assert url == "https://models.dev/api.json"
        calls.append(copy.deepcopy(kwargs))
        return network.JsonResponse(public_row(), headers={"cache-control": control, "etag": '"v1"', "last-modified": "Thu, 02 Jan 2026 00:00:00 GMT"})

    client = metadata.MetadataClient(fetch=fetch, clock=lambda: now[0], snapshot_loader=forbidden)
    entry, stale, warnings = client._source("models_dev", False)
    assert entry is not None and entry.ttl == ttl and not stale and not warnings
    assert ("models_dev" in client.cache) is retained
    now[0] = 29.999
    throttled, stale, warnings = client._source("models_dev", True)
    assert len(calls) == 1 and warnings == ["refresh_throttled"]
    assert (throttled is not None) is retained
    assert stale is (ttl == 0)
    now[0] = 30.0
    refreshed, stale, warnings = client._source("models_dev", True)
    assert refreshed is not None and not stale and not warnings and len(calls) == 2
    assert calls[-1]["headers"] == ({"If-None-Match": '"v1"', "If-Modified-Since": "Thu, 02 Jan 2026 00:00:00 GMT"} if retained else {})
    now[0] = 60.0
    client._source("models_dev", False)
    assert len(calls) == (2 if ttl else 3)
    if ttl:
        now[0] = 30.0 + ttl - 0.001
        client._source("models_dev", False)
        assert len(calls) == 2
        now[0] = 30.0 + ttl
        refreshed, stale, warnings = client._source("models_dev", False)
        assert refreshed is not None and not stale and not warnings
        assert len(calls) == 3


def test_six_hour_exact_cutoff_stale_failure_and_recovery() -> None:
    now, failing = [0.0], [False]

    def fetch(_url: str, **_kwargs: Any) -> network.JsonResponse:
        if failing[0]:
            raise TimeoutError("synthetic-provider-canary synthetic-custom-endpoint")
        return network.JsonResponse(public_row(3 if now[0] == 0 else 9), headers={"cache-control": "max-age=60"})

    client = metadata.MetadataClient(fetch=fetch, clock=lambda: now[0], snapshot_loader=lambda: {})
    assert client.lookup(PROVIDER, ["vendor/only"])["items"][0]["fields"]["input_per_million"] == 3
    failing[0], now[0] = True, 21599.0
    stale = client.lookup(PROVIDER, ["vendor/only"])
    assert stale["stale"] and stale["items"][0]["fields"]["input_per_million"] == 3
    assert "metadata_source_unavailable" in stale["items"][0]["warnings"]
    now[0] = 21600.0
    expired = client.lookup(PROVIDER, ["vendor/only"])
    assert expired["stale"] and expired["items"][0]["fields"]["input_per_million"] is None
    assert expired["items"][0]["sources"] == []
    failing[0], now[0] = False, 21630.0
    recovered = client.lookup(PROVIDER, ["vendor/only"], refresh=True)
    assert not recovered["stale"] and recovered["items"][0]["fields"]["input_per_million"] == 9
    assert "metadata_source_unavailable" not in recovered["items"][0]["warnings"]


def test_actual_lookup_uses_at_most_four_fixed_sources() -> None:
    calls: list[str] = []

    def fetch(url: str, **kwargs: Any) -> network.JsonResponse:
        assert url in URLS and kwargs["headers"] == {}
        calls.append(url)
        return network.JsonResponse({})

    client = metadata.MetadataClient(fetch=fetch, clock=lambda: 0, snapshot_loader=lambda: {})
    provider = {"id": "router", "type": "openrouter", "api_base": "https://openrouter.ai/api/v1"}
    for name in ["missing-a", "missing-b", "missing-c"]:
        assert client.lookup(provider, [name])["items"][0]["sources"] == []
    assert set(calls) == URLS and len(calls) == 3
    assert set(client.cache) == {"models_dev", "models_dev_catalog", "openrouter", "litellm_snapshot"}
    assert len(client.last_attempt) == 4


def owned_app(tmp_path: Path) -> tuple[Any, gateway.GatewayConfig, dict[str, Any]]:
    document = single_route_document()
    document["gateway"] = {"api_key_env": "METADATA_GATEWAY"}
    document["storage"] = {"enabled": True, "path": str(tmp_path / "records.sqlite3")}
    document["providers"][0].update(api_base=PROVIDER["api_base"], param_env={"organization": "METADATA_TRANSPORT"})
    confirmed = {**manual_model("vendor/only", 42), "provider": "test-provider", "quality": 0.7}
    document["models"][0] = copy.deepcopy(confirmed)
    (tmp_path / "models.json").write_text(json.dumps(document))
    (tmp_path / ".env").write_text("# Synthetic metadata acceptance runtime\n")
    (tmp_path / "credentials.json").write_text(json.dumps({"version": 1, "values": {"METADATA_GATEWAY": CANARIES[0], "TEST_PROVIDER_KEY": CANARIES[1], "METADATA_TRANSPORT": CANARIES[2]}}))
    (tmp_path / "credentials.json").chmod(0o600)
    (tmp_path / "models.json.bak").write_bytes((tmp_path / "models.json").read_bytes())
    (tmp_path / "credentials.json.backup").write_bytes((tmp_path / "credentials.json").read_bytes())
    (tmp_path / "credentials.json.backup").chmod(0o600)
    (tmp_path / ".env.backup").write_bytes((tmp_path / ".env").read_bytes())
    (tmp_path / "routing-overrides.json").write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {"test-provider/vendor/only": {"tags": ["task_aware/retained"], "priority": 7}}}))
    (tmp_path / "dashboard-theme.json").write_text('{"version":1,"seed":"#123456"}')
    (tmp_path / "routing-canvas-layout.json").write_text('{"version":1,"nodes":{},"viewport":{"x":0,"y":0}}')
    config = gateway.load_gateway_config(tmp_path / "models.json")
    return gateway.create_app(config), config, confirmed


def file_state(directory: Path) -> dict[str, Any]:
    return {name: (stat.S_IMODE((directory / name).stat().st_mode), (directory / name).read_bytes()) if (directory / name).exists() else None for name in NAMES}


def preserved_state(app: Any, config: gateway.GatewayConfig) -> dict[str, Any]:
    return {"files": file_state(config.models_file.parent), "catalog": config.engine.catalog, "registry": config.engine.strategies, "hash": config.engine.config_hash, "source": config.engine.config_source, "profile": copy.deepcopy(config.engine.catalog.profiles[0].as_dict()), "policy": copy.deepcopy(config.engine.policy_snapshot()), "versions": versions(config), "revision": request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["revision"], "environment": dict(os.environ), "key": config.gateway_api_key}


def assert_preserved(app: Any, config: gateway.GatewayConfig, before: dict[str, Any], confirmed: dict[str, Any]) -> None:
    after = preserved_state(app, config)
    assert after == before
    assert config.engine.catalog is before["catalog"] and config.engine.strategies is before["registry"]
    assert json.loads(config.models_file.read_text())["models"] == [confirmed]


def associate(tmp_path: Path, config: gateway.GatewayConfig, before: dict[str, Any], label: str) -> None:
    (tmp_path / "association.json").write_text(json.dumps({"case": label, "runtime": str(tmp_path), "models_file": str(config.models_file), "sqlite": str(config.engine.catalog.storage.path), "config_hash": before["hash"], "files": {name: {"exists": value is not None, "mode": value[0] if value else None, "sha256": hashlib.sha256(value[1]).hexdigest() if value else None} for name, value in before["files"].items()}}, indent=2))


def wire_fetch(mode: str, calls: list[str]) -> Any:
    def fetch(url: str, **kwargs: Any) -> network.JsonResponse:
        assert url in URLS and set(kwargs["headers"]) <= {"If-None-Match", "If-Modified-Since"}
        calls.append(url)

        class Connection:
            sock = None

            def connect(self) -> None:
                if mode == "timeout":
                    raise TimeoutError("synthetic-provider-canary synthetic-custom-endpoint")

            def request(self, method: str, target: str, *, headers: Any) -> None:
                assert method == "GET" and headers["Accept"] == "application/json"

            def getresponse(self) -> Response:
                if mode == "invalid-json":
                    return Response(body=b'{synthetic-provider-canary')
                if mode == "oversize":
                    return Response(headers={"Content-Length": str(16 * 1024 * 1024 + 1)})
                data = public_row() if mode == "partial" and url.endswith("/api.json") else {}
                if mode == "partial" and url.endswith("/catalog.json"):
                    raise TimeoutError("synthetic-provider-canary")
                return Response(body=json.dumps(data).encode())

            def close(self) -> None:
                pass

        return network.safe_get_json(url, **kwargs, resolver=lambda *_: ["8.8.8.8"], connection_factory=lambda *_: Connection())
    return fetch


@pytest.mark.parametrize("mode", ["timeout", "invalid-json", "oversize", "partial", "backup-unreadable", "busy", "unmatched"], ids=["all timeout", "invalid JSON", "16 MiB declared oversize", "partial source failure", "backup unreadable", "busy", "unmatched"])
def test_authenticated_source_failure_preserves_confirmed_state_and_chat(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, mode: str) -> None:
    app, config, confirmed = owned_app(tmp_path)
    calls: list[str] = []
    completion = install_completion(monkeypatch)
    client = metadata.MetadataClient(fetch=wire_fetch(mode, calls), snapshot_loader=lambda: {}, clock=lambda: 0)
    if mode == "backup-unreadable":
        class Distribution:
            def locate_file(self, _name: str) -> Path:
                return tmp_path / "absent-installed-backup.json"
        monkeypatch.setattr(metadata, "distribution", lambda _: Distribution())
        client.snapshot_loader = metadata._load_litellm_snapshot
    if mode == "busy":
        assert client.fetch_lock.acquire(blocking=False)
    monkeypatch.setattr(metadata, "_CLIENT", client)
    before = preserved_state(app, config)
    associate(tmp_path, config, before, mode)
    try:
        response = request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={"provider_id": "test-provider", "upstream_models": ["vendor/only"]})
        assert response.status_code == 200
        result, item = response.json(), response.json()["items"][0]
        assert set(item["fields"]) == FIELDS
        expected_warnings = ["metadata_busy", "metadata_not_found"] if mode == "busy" else ["metadata_not_found"] if mode == "unmatched" else ["metadata_source_unavailable"] if mode == "partial" else ["metadata_source_unavailable", "metadata_not_found"]
        if mode == "partial":
            expected_warnings.append("pricing_requires_confirmation")
        assert item["warnings"] == expected_warnings
        assert result["stale"] is (mode != "unmatched")
        assert item["fields"]["input_per_million"] == (3 if mode == "partial" else None)
        assert item["metadata"]["fields"]["input_per_million"]["status"] == ("known" if mode == "partial" else "unknown")
        assert not completion and (len(calls) == (0 if mode == "busy" else 2))
        assert_preserved(app, config, before, confirmed)
        monkeypatch.setattr(client, "fetch", forbidden)
        monkeypatch.setattr(client, "snapshot_loader", forbidden)
        monkeypatch.setattr(metadata, "lookup_model_metadata", forbidden)
        chat = request(app, "POST", "/v1/chat/completions", headers=headers(config), json={"model": "test-provider/vendor/only", "messages": turns(CANARIES[5])})
        assert chat.status_code == 200 and chat.json()["choices"][0]["message"]["content"] == "ok"
        assert len(completion) == 1 and completion[0]["model"] == "openai/vendor/only"
        assert_preserved(app, config, before, confirmed)
        assert all(value not in response.text + chat.text + caplog.text for value in CANARIES)
    finally:
        if mode == "busy":
            client.fetch_lock.release()
        config.engine.close()


def test_authenticated_stale_failure_then_expiry_and_recovery_preserves_models(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config, confirmed = owned_app(tmp_path)
    now, failed = [0.0], [False]

    def fetch(_url: str, **_kwargs: Any) -> network.JsonResponse:
        if failed[0]:
            raise TimeoutError("synthetic-provider-canary")
        return network.JsonResponse(public_row(3 if now[0] == 0 else 9), headers={"cache-control": "max-age=60"})

    client = metadata.MetadataClient(fetch=fetch, clock=lambda: now[0], snapshot_loader=lambda: {})
    monkeypatch.setattr(metadata, "_CLIENT", client)
    before = preserved_state(app, config)
    associate(tmp_path, config, before, "stale expiry recovery")
    try:
        for moment, fail, expected, stale in [(0, False, 3, False), (61, True, 3, True), (21600, True, None, True), (21630, False, 9, False)]:
            now[0], failed[0] = moment, fail
            response = request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={"provider_id": "test-provider", "upstream_models": ["vendor/only"], "refresh": True})
            assert response.status_code == 200 and response.json()["stale"] is stale
            assert response.json()["items"][0]["fields"]["input_per_million"] == expected
            assert_preserved(app, config, before, confirmed)
    finally:
        config.engine.close()


@pytest.mark.parametrize("channel,base", [("openai", "https://synthetic-custom-endpoint.example/v1"), ("openrouter", "https://openrouter.ai/api/v1")], ids=["custom endpoint 私有 candidate", "OpenRouter candidate"])
def test_candidate_listing_and_public_metadata_have_distinct_privacy_boundaries(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, channel: str, base: str) -> None:
    app, config, confirmed = owned_app(tmp_path)
    selector = {"provider": {"id": "candidate", "type": "openai", "brand_id": channel, "api_base": base, "api_key_env": "CANDIDATE_KEY", "param_env": {"organization": "CANDIDATE_ORG"}}, "credential": {"action": "set", "value": CANARIES[3]}, "transport_credentials": {"organization": {"action": "set", "value": CANARIES[4]}}}
    listing_calls: list[tuple[str, dict[str, Any]]] = []

    def listing(url: str, **kwargs: Any) -> network.JsonResponse:
        assert url == base + "/models" and kwargs["headers"] == {"Authorization": "Bearer " + CANARIES[3]}
        listing_calls.append((url, copy.deepcopy(kwargs)))
        return network.JsonResponse({"data": [{"id": "vendor/only"}]})

    calls: list[tuple[str, dict[str, Any]]] = []
    now = [0.0]

    def public_fetch(url: str, **kwargs: Any) -> network.JsonResponse:
        assert url in URLS and set(kwargs["headers"]) <= {"If-None-Match", "If-Modified-Since"}
        assert all(value not in url + json.dumps(kwargs) for value in CANARIES)
        calls.append((url, copy.deepcopy(kwargs)))
        if kwargs["headers"]:
            assert kwargs["headers"] == {"If-None-Match": '"privacy-v1"'}
            return network.JsonResponse(None, 304, {"cache-control": "max-age=60"})
        data = public_row() if channel == "openai" else {"data": [{"id": "vendor/only", "pricing": {"prompt": "0.000003"}}]} if url == "https://openrouter.ai/api/v1/models" else {}
        return network.JsonResponse(data, headers={"etag": '"privacy-v1"', "cache-control": "max-age=60"})

    monkeypatch.setattr(model_discovery, "safe_get_json", listing)
    client = metadata.MetadataClient(fetch=public_fetch, snapshot_loader=lambda: {}, clock=lambda: now[0])
    monkeypatch.setattr(metadata, "_CLIENT", client)
    before = preserved_state(app, config)
    associate(tmp_path, config, before, "candidate " + channel)
    try:
        discovery = request(app, "POST", "/v1/provider-discovery", headers=headers(config), json=selector)
        assert discovery.status_code == 200 and discovery.json()["complete"] and len(listing_calls) == 1
        assert discovery.json()["items"][0]["qualified_id"] == "candidate/vendor/only"
        for moment in [0, 61]:
            now[0] = moment
            response = request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={**selector, "upstream_models": ["vendor/only"]})
            assert response.status_code == 200
            item = response.json()["items"][0]
            assert item["fields"]["input_per_million"] == (None if channel == "openai" else 3)
            assert all(value not in response.text + discovery.text + caplog.text for value in CANARIES)
            assert_preserved(app, config, before, confirmed)
        assert len(calls) == (4 if channel == "openai" else 6)
        invalid = request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={**selector, "upstream_models": ["vendor/only"], "unexpected": CANARIES[3]})
        assert invalid.status_code == 400 and invalid.json()["error"]["code"] == "invalid_configuration"
        assert all(value not in invalid.text + caplog.text for value in CANARIES)
        completion = install_completion(monkeypatch)
        monkeypatch.setattr(metadata, "lookup_model_metadata", forbidden)
        chat = request(app, "POST", "/v1/chat/completions", headers=headers(config), json={"model": "test-provider/vendor/only", "messages": turns(CANARIES[5])})
        assert chat.status_code == 200 and len(completion) == 1
        assert len(calls) == (4 if channel == "openai" else 6) and len(listing_calls) == 1
        assert_preserved(app, config, before, confirmed)
    finally:
        config.engine.close()


def test_reference_modalities_and_benchmarks_cannot_extend_routing_or_clear_models(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config, confirmed = owned_app(tmp_path)
    modalities = ["text", "image", "audio", "video", "pdf"]
    source = public_row()
    source["openai"]["models"]["vendor/only"].update(modalities={"input": list(modalities)}, benchmarks={"quality": 1}, quality=1, tags=["task_aware/external"], priority=999)
    client = metadata.MetadataClient(fetch=lambda *_a, **_k: network.JsonResponse(source), snapshot_loader=lambda: {}, clock=lambda: 0)
    monkeypatch.setattr(metadata, "_CLIENT", client)
    before = preserved_state(app, config)
    associate(tmp_path, config, before, "reference modalities")
    try:
        response = request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={"provider_id": "test-provider", "upstream_models": ["vendor/only"]})
        assert response.status_code == 200
        item = response.json()["items"][0]
        assert set(item["fields"]) == FIELDS and item["fields"]["vision"] is True
        assert not {"audio", "video", "pdf", "quality", "tags", "priority"} & item["fields"].keys()
        expected = {"value": modalities, "source_field": "modalities.input"}
        assert all(s["input_modalities"] == expected for s in item["metadata"]["sources"])
        envelope = metadata_envelope(item)
        envelope["sources"][0]["input_modalities"]["value"].append("invalid")
        assert item["metadata"]["sources"][0]["input_modalities"] == expected
        assert_preserved(app, config, before, confirmed)
    finally:
        config.engine.close()
