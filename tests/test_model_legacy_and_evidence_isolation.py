"""Legacy model values and detached public evidence at their owning boundaries."""

from __future__ import annotations

import copy
import json
import socket
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import discovery_network, model_metadata as metadata
from jev_gateway.catalog import model_metadata
from jev_gateway.discovery_network import JsonResponse
from jev_gateway.provider_config import ProviderConfiguration, metadata_envelope
from jev_gateway.records import build_config_hash
from tests.helpers import turns
from tests.test_model_revision_and_recovery_chat import files
from tests.test_model_transaction_publication import sqlite_app, versions
from tests.test_model_value_domains import body, record, reject
from tests.test_provider_management_api import headers, request

FIXED = "2026-10-08T07:00:00+00:00"
UPDATED = "2026-10-01"


def roundtrip(app: Any, config: Any, entry: dict[str, Any], action: str) -> dict[str, Any]:
    payload = body(app, config, entry, action)
    original = copy.deepcopy(payload)
    before, stored = files(config.models_file.parent), versions(config)
    catalog, registry, digest = config.engine.catalog, config.engine.strategies, config.engine.config_hash
    checked = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=payload)
    assert checked.status_code == 200 and files(config.models_file.parent) == before and versions(config) == stored
    assert config.engine.catalog is catalog and config.engine.strategies is registry and config.engine.config_hash == digest
    saved = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=payload)
    assert saved.status_code == 200 and payload == original
    models = saved.json()["models"]
    assert request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"] == models
    snapshot, digest, committed = config.engine.catalog.routing_snapshot(), config.engine.config_hash, versions(config)
    assert digest == build_config_hash(snapshot) and any(row[0] == digest for row in committed)
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    assert config.engine.catalog.routing_snapshot() == snapshot and config.engine.config_hash == digest
    assert versions(config) == committed
    assert request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"] == models
    name = "test-provider/vendor/only" if action == "update" else "test-provider/vendor/imported"
    return next(m for m in models if m["name"] == name)


@pytest.mark.parametrize("enabled", ["omitted", True])
def test_legacy_omissions_preserve_route_and_never_invent_provenance(tmp_path: Path, enabled: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        document = json.loads(config.models_file.read_text())
        old = {**record(), "provider": "test-provider"}
        old.pop("metadata")
        old.pop("display_name")
        old["cost"] = {"input_per_million": 3.5, "output_per_million": 1.25}
        document["models"][0] = old
        config.models_file.write_text(json.dumps(document))
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        assert not {"display_name", "enabled", "metadata"} & old.keys()
        assert not {"cache_read_per_million", "cache_write_per_million"} & old["cost"].keys()
        before = config.engine.catalog.profiles[0].as_dict()
        assert "metadata" not in before and before["display_name"] is None and before["enabled"] is True
        assert before["cost"]["cache_read_per_million"] is None and before["cost"]["cache_write_per_million"] is None
        assert config.engine.decide(messages=turns("legacy"), requested_model=before["name"]).route_name == before["name"]
        assert config.engine.decide(messages=turns("automatic legacy")).route_name == before["name"]
        entry = {k: copy.deepcopy(v) for k, v in old.items() if k != "provider"}
        if enabled != "omitted":
            entry["enabled"] = enabled
        projected = roundtrip(app, config, entry, "update")
        assert projected == {**before, "routing_overlay_fields": []}
        saved = json.loads(config.models_file.read_text())["models"][0]
        assert "metadata" not in saved and "display_name" not in saved
        assert saved["cost"] == old["cost"]
        assert ("enabled" not in saved) if enabled == "omitted" else saved["enabled"] is True
        assert config.engine.decide(messages=turns("after reload")).route_name == before["name"]
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("enabled", [None, 0, 1, "false", [], {}, 1.0])
def test_enabled_exact_type_rejects_without_publication(tmp_path: Path, action: str, enabled: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = {**record(), "enabled": enabled}
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
def test_explicit_disabled_remains_manageable_after_reload(tmp_path: Path, action: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = {**record(), "enabled": False}
        projected = roundtrip(app, config, entry, action)
        assert projected["enabled"] is False and projected["display_name"] == entry["display_name"]
        entry["enabled"] = True
        name = projected["name"]
        payload = {"expected_revision": request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["revision"], "operations": [{"action": "update_model", "model_id": name, "model": {**entry, "upstream_model": projected["upstream_model"]}}]}
        assert request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=payload).status_code == 200
        profile = config.engine.catalog.by_name(name)
        assert profile is not None and profile.enabled is True
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("display", [0, True, [], {}, "", " \t ", " " * 160, "a" * 161, "é" * 161, "name\0", "name\n", "name\x1f"])
def test_invalid_display_names_reject_at_api(tmp_path: Path, action: str, display: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        reject(app, config, body(app, config, {**record(), "display_name": display}, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("display", ["x", "é" * 160, "  Human label  ", None])
def test_display_names_preserve_bytes_and_null_clears(tmp_path: Path, action: str, display: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        if action == "update":
            roundtrip(app, config, record(), "update")
        projected = roundtrip(app, config, {**record(), "display_name": display}, action)
        assert projected["display_name"] == display
        saved = json.loads(config.models_file.read_text())["models"][-1 if action == "import" else 0]
        assert saved["display_name"] == display
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("priority", [-2**63, -1, 0, 2**63])
def test_signed_integer_priority_persists(tmp_path: Path, action: str, priority: int) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        projected = roundtrip(app, config, {**record(), "priority": priority}, action)
        assert type(projected["priority"]) is int and projected["priority"] == priority
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("priority", [True, False, 1.0, 1.5, "1", None, [], {}])
def test_invalid_priority_rejects_at_api(tmp_path: Path, action: str, priority: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        reject(app, config, body(app, config, {**record(), "priority": priority}, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("quality", [0, 1, 0.125])
def test_new_quality_closed_interval_persists(tmp_path: Path, action: str, quality: float) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        projected = roundtrip(app, config, {**record(), "quality": quality}, action)
        assert projected["quality"] == quality
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("literal", ["-0.0001", "1.0001", "true", "false", '"0.5"', "null", "{}", "[]", "NaN", "Infinity", "-Infinity", "1e400"])
def test_changed_quality_strict_domain_rejects_raw_json(tmp_path: Path, action: str, literal: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        payload = body(app, config, {**record(), "quality": "synthetic-private-token"}, action)
        raw = json.dumps(payload).replace('"synthetic-private-token"', literal)
        reject(app, config, payload, raw)
    finally:
        config.engine.close()


@pytest.mark.parametrize("quality", [-2.5, 2.5, -1e300, 1e300])
@pytest.mark.parametrize("submission", ["omitted", "same", "changed"])
def test_actual_legacy_quality_retains_exact_value_across_edit_and_reload(tmp_path: Path, quality: float, submission: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        document = json.loads(config.models_file.read_text())
        document["models"][0]["quality"] = quality
        config.models_file.write_text(json.dumps(document))
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        assert config.engine.catalog.profiles[0].quality == quality
        entry = record()
        if submission == "omitted":
            entry.pop("quality")
        else:
            entry["quality"] = quality if submission == "same" else 0.25
        projected = roundtrip(app, config, entry, "update")
        expected = 0.25 if submission == "changed" else quality
        assert projected["quality"] == expected and config.engine.catalog.profiles[0].quality == expected
        assert json.loads(config.models_file.read_text())["models"][0]["quality"] == expected
        assert projected["cost"] == entry["cost"] and projected["metadata"] == entry["metadata"]
    finally:
        config.engine.close()


@pytest.mark.parametrize("phase", ["import", "update", "batch"])
def test_legacy_quality_claim_is_bound_to_current_stored_value(tmp_path: Path, phase: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        document = json.loads(config.models_file.read_text())
        document["models"][0]["quality"] = 2.5
        config.models_file.write_text(json.dumps(document))
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        entry = {**record(), "quality": 2.5 if phase != "update" else 3.5}
        payload = body(app, config, entry, "import" if phase == "import" else "update")
        if phase == "batch":
            payload["operations"].insert(0, {"action": "update_model", "model_id": "test-provider/vendor/only", "model": {**record(), "quality": 0.5}})
        reject(app, config, payload)
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("status", ["known", "unknown", "conflict", "confirmed"])
def test_exact_status_and_fixed_confirmation_roundtrip(tmp_path: Path, action: str, status: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["cost"].update(input_per_million=0, cache_write_per_million=None)
        entry["capabilities"]["tools"] = False
        entry["context_window"] = None
        source = {"id": "fixed-evidence", "source": "manual_fixture", "url": "https://public.example/evidence", "fetched_at": FIXED, "source_updated_at": UPDATED, "provider_id": "test-provider", "model_id": entry["upstream_model"]}
        field_values = {"tools": False, "input_per_million": 0, "cache_write_per_million": None, "context_window": None, "reasoning_effort": []}
        fields = {name: {"status": status, "value": None if status in {"unknown", "conflict"} else value, "source_ids": ["fixed-evidence"], "method": "source", "confirmed_at": FIXED} for name, value in field_values.items()}
        entry["metadata"] = {"version": 1, "sources": [source], "fields": fields, "confirmation": {"method": "manual", "confirmed_at": FIXED}}
        projected = roundtrip(app, config, entry, action)
        assert projected["metadata"] == entry["metadata"]
        assert projected["capabilities"]["tools"] is False and projected["cost"]["input_per_million"] == 0
        assert projected["context_window"] is None and projected["cost"]["cache_write_per_million"] is None
        saved = json.loads(config.models_file.read_text())["models"][-1 if action == "import" else 0]
        assert saved["metadata"] == entry["metadata"]
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("status", ["unknown", "conflict"])
@pytest.mark.parametrize("name,value", [("tools", False), ("input_per_million", 0), ("reasoning_effort", []), ("context_window", 1)])
def test_uncertain_nonnull_values_reject_without_truthiness_promotion(tmp_path: Path, action: str, status: str, name: str, value: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["metadata"] = {"version": 1, "fields": {name: {"status": status, "value": value}}}
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("method,refs", [("manual", []), ("omitted", []), ("source", ["evidence"])])
def test_confirmation_methods_preserve_compatible_reference_rules(tmp_path: Path, action: str, method: str, refs: list[str]) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        field = {"status": "confirmed", "value": False, "source_ids": refs, "confirmed_at": FIXED}
        if method != "omitted":
            field["method"] = method
        entry["metadata"] = {"version": 1, "sources": [{"id": "evidence", "fetched_at": FIXED}], "fields": {"vision": field}}
        assert roundtrip(app, config, entry, action)["metadata"] == entry["metadata"]
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("invalid", ["missing_refs", "empty_refs", "unresolved", "missing_value", "status", "flag"])
def test_impossible_confirmation_shapes_reject_safely(tmp_path: Path, action: str, invalid: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        field: dict[str, Any] = {"status": "confirmed", "value": False, "method": "source", "source_ids": ["evidence"]}
        if invalid == "missing_refs":
            field.pop("source_ids")
        elif invalid == "empty_refs":
            field["source_ids"] = []
        elif invalid == "unresolved":
            field["source_ids"] = ["absent"]
        elif invalid == "missing_value":
            field.pop("value")
        elif invalid == "status":
            field["status"] = "certified"
        else:
            field["confirmed"] = True
        entry["metadata"] = {"version": 1, "sources": [{"id": "evidence"}], "fields": {"vision": field}}
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


def forbidden_fetch(*_args: Any, **_kwargs: Any) -> Any:
    pytest.fail("Evidence persistence must not fetch or resolve a source URL")


BAD_URLS = [
    "http://public.example/evidence", "https://user:synthetic-private@public.example/evidence", "https://@public.example/evidence",
    "https://public.example/evidence?key=synthetic-private", "https://public.example/evidence#key", "https://public.example/evidence?", "https://public.example/evidence#",
    "https://127.0.0.1/evidence", "https://10.0.0.1/evidence", "https://172.16.0.1/evidence", "https://192.168.0.1/evidence",
    "https://169.254.169.254/evidence", "https://168.63.129.16/evidence", "https://0.0.0.0/evidence", "https://100.64.0.1/evidence", "https://224.0.0.1/evidence", "https://192.0.2.1/evidence",
    "https://[::1]/evidence", "https://[fc00::1]/evidence", "https://[fe80::1]/evidence", "https://[::]/evidence", "https://[ff02::1]/evidence",
    "https://[::ffff:8.8.8.8]/evidence", "https://[2002:0808:0808::1]/evidence", "https://[2001:0000:4136:e378:8000:63bf:3fff:fdd2]/evidence",
    "https://localhost/evidence", "https://localhost./evidence", "https://x.localhost/evidence", "https://router.local/evidence", "https://metadata.google.internal/evidence",
    "https://2130706433/evidence", "https://127.1/evidence", "https://0x7f.0.0.1/evidence", "https://%31%32%37.0.0.1/evidence",
    "https://public.example:0/evidence", "https://public.example:65536/evidence", "https://public.example:bad/evidence", "https://public.example:/evidence",
    "https://public.example/%0a", "https://public.example/%7f", "https://public.example\\@127.0.0.1/evidence", "https://public example/evidence", "https://-invalid.example/evidence", "https:///evidence", "https://[invalid]/evidence",
]


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("url", BAD_URLS)
def test_evidence_url_rejection_is_offline_despite_private_provider_permission(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, action: str, url: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        document = json.loads(config.models_file.read_text())
        document["providers"][0]["allow_private_network"] = True
        config.models_file.write_text(json.dumps(document))
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        monkeypatch.setattr(socket, "getaddrinfo", forbidden_fetch)
        monkeypatch.setattr(discovery_network, "safe_get_json", forbidden_fetch)
        monkeypatch.setattr(metadata, "safe_get_json", forbidden_fetch)
        monkeypatch.setattr(metadata, "_CLIENT", metadata.MetadataClient(fetch=forbidden_fetch, snapshot_loader=forbidden_fetch))
        entry = record()
        entry["metadata"]["sources"] = [{"id": "evidence", "url": url, "fetched_at": FIXED}]
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("url", ["https://public.example:8443/a%20label", "https://8.8.8.8/evidence", "https://[2606:4700:4700::1111]/evidence", "https://bücher.example/evidence", "https://Public.Example./Evidence"])
def test_saved_url_bytes_never_become_lookup_destinations(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        monkeypatch.setattr(socket, "getaddrinfo", forbidden_fetch)
        monkeypatch.setattr(discovery_network, "safe_get_json", forbidden_fetch)
        monkeypatch.setattr(metadata, "safe_get_json", forbidden_fetch)
        entry = record()
        entry["metadata"]["sources"] = [{"id": "stored-only", "url": url, "fetched_at": FIXED}]
        assert roundtrip(app, config, entry, "update")["metadata"] == entry["metadata"]
        assert json.loads(config.models_file.read_text())["models"][0]["metadata"] == entry["metadata"]
        document = json.loads(config.models_file.read_text())
        document["providers"][0].update(brand_id="openai", api_base="https://api.openai.com/v1", allow_private_network=True)
        config.models_file.write_text(json.dumps(document))
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        calls: list[tuple[str, dict[str, Any]]] = []

        def controlled_fetch(target: str, **kwargs: Any) -> JsonResponse:
            assert target in {"https://models.dev/api.json", "https://models.dev/catalog.json"}
            assert not any(k.lower() == "authorization" for k in kwargs.get("headers", {}))
            assert "fake-before" not in json.dumps(kwargs) and "fake-management" not in json.dumps(kwargs)
            calls.append((target, kwargs))
            return JsonResponse({"openai": {"models": {"vendor/only": {"id": "vendor/only", "tool_call": False}}}} if target == metadata.SOURCE_URLS["models_dev"] else {})

        monkeypatch.setattr(metadata, "_CLIENT", metadata.MetadataClient(fetch=controlled_fetch, snapshot_loader=forbidden_fetch))
        before, stored, catalog = files(tmp_path), versions(config), config.engine.catalog
        response = request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={"provider_id": "test-provider", "upstream_models": ["vendor/only"]})
        assert response.status_code == 200 and len(calls) == 2
        assert [target for target, _kwargs in calls] == ["https://models.dev/api.json", "https://models.dev/catalog.json"]
        assert url not in [target for target, _kwargs in calls]
        assert files(tmp_path) == before and versions(config) == stored and config.engine.catalog is catalog
        assert config.engine.catalog.profiles[0].as_dict()["metadata"] == entry["metadata"]
    finally:
        config.engine.close()


def cached_query(monkeypatch: pytest.MonkeyPatch) -> tuple[metadata.MetadataClient, dict[str, Any], list[str]]:
    row = {"cost": {"input": 0, "output": 2, "cache_write": 9, "tiers": [{"input": 3, "tier": {"type": "context", "size": 200000}}]}, "tool_call": False, "last_updated": UPDATED, "reasoning_options": [{"type": "effort", "values": ["low", "high"]}], "modalities": {"input": ["text", "image"]}}
    source = {"openai": {"models": {"a": {"id": "a", **copy.deepcopy(row)}, "b": {"id": "b", **copy.deepcopy(row)}}}}
    calls: list[str] = []

    def fetch(url: str, **kwargs: Any) -> JsonResponse:
        assert url in {metadata.SOURCE_URLS["models_dev"], metadata.SOURCE_URLS["models_dev_catalog"]}
        assert not kwargs.get("headers")
        calls.append(url)
        return JsonResponse(source if url == metadata.SOURCE_URLS["models_dev"] else {}, headers={"cache-control": "max-age=3600"})

    monkeypatch.setattr(metadata, "timestamp", lambda: FIXED)
    client = metadata.MetadataClient(fetch=fetch, clock=lambda: 1000.0, snapshot_loader=forbidden_fetch)
    monkeypatch.setattr(metadata, "_CLIENT", client)
    return client, {"id": "test-provider", "type": "openai", "api_base": "https://api.openai.com/v1", "allow_private_network": True}, calls


def mutate_evidence(envelope: dict[str, Any]) -> None:
    envelope["fields"]["reasoning_effort"]["value"].append("max")
    envelope["fields"]["tools"]["value"] = True
    envelope["sources"][0]["fields"]["tools"]["value"] = True
    envelope["sources"][0]["pricing"]["tiers"][0]["input"]["value"] = 999
    envelope["sources"][0]["input_modalities"]["value"].append("audio")
    envelope["sources"][0]["fetched_at"] = "mutated"


@pytest.mark.parametrize("accessor", ["client", "public"])
def test_query_cache_candidates_and_canonical_envelope_are_deeply_detached(monkeypatch: pytest.MonkeyPatch, accessor: str) -> None:
    client, provider, calls = cached_query(monkeypatch)
    query = client.lookup if accessor == "client" else metadata.lookup_model_metadata
    result = query(provider, ["a", "b"])
    expected = copy.deepcopy(result)
    cache_before = {name: copy.deepcopy(entry.data) for name, entry in client.cache.items()}
    a, b = result["items"]
    envelope = metadata_envelope(a)
    assert "version" not in a and envelope["version"] == 1
    assert a["fields"]["tools"] is False and a["fields"]["input_per_million"] == 0
    assert envelope["fields"]["tools"] == {"status": "known", "value": False, "source_ids": ["models_dev-0"]}
    source = envelope["sources"][0]
    assert source["id"] == "models_dev-0" and source["provider_id"] == "openai" and source["model_id"] == "a"
    assert source["fetched_at"] == FIXED and source["source_updated_at"] == UPDATED and result["fetched_at"] == FIXED
    assert "source_provider" in a["sources"][0] and "source_provider" not in source
    mutate_evidence(envelope)
    assert result == expected
    a["fields"]["reasoning_effort"].append("max")
    a["sources"][0]["fields"]["tools"]["value"] = True
    a["sources"][0]["pricing"]["tiers"][0]["input"]["value"] = 999
    a["sources"][0]["input_modalities"]["value"].append("audio")
    assert b == expected["items"][1]
    assert {name: entry.data for name, entry in client.cache.items()} == cache_before
    assert query(provider, ["a", "b"]) == expected and len(calls) == 2


def test_conflict_unknown_and_reference_only_query_states_keep_original_facts(monkeypatch: pytest.MonkeyPatch) -> None:
    first = metadata._models_dev({"cost": {"input": 0}, "tool_call": False}, "models_dev", "openai", "a", FIXED, True)
    other = metadata._models_dev({"cost": {"input": 2}, "tool_call": True}, "models_dev_catalog", "openai", "a", FIXED, True)
    candidate = metadata._merge_candidates([first, other], [])
    expected = copy.deepcopy(candidate)
    envelope = metadata_envelope(candidate)
    for name in ["tools", "input_per_million"]:
        assert envelope["fields"][name] == {"status": "conflict", "value": None, "source_ids": ["models_dev-0", "models_dev_catalog-1"]}
    assert envelope["fields"]["cache_write_per_million"] == {"status": "unknown", "value": None, "source_ids": []}
    assert [s["fields"]["tools"]["value"] for s in envelope["sources"]] == [False, True]
    envelope["sources"][0]["fields"]["tools"]["value"] = True
    assert candidate == expected
    other["applicable"] = False
    known = metadata_envelope(metadata._merge_candidates([first, other], []))
    assert known["fields"]["tools"]["status"] == "known" and known["fields"]["tools"]["value"] is False
    assert known["fields"]["input_per_million"]["value"] == 0 and known["sources"][1]["applicable"] is False
    other["applicable"] = True
    other["fields"]["tools"]["value"] = None
    null_plus_known = metadata_envelope(metadata._merge_candidates([first, other], []))
    assert null_plus_known["fields"]["tools"]["status"] == "known" and null_plus_known["fields"]["tools"]["value"] is False


def test_catalog_accessors_and_command_results_do_not_mutate_validated_or_applied_metadata(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        _client, provider, _calls = cached_query(monkeypatch)
        envelope = metadata_envelope(metadata.lookup_model_metadata(provider, ["a"])["items"][0])
        original = copy.deepcopy(envelope)
        entry = record()
        entry["metadata"] = envelope
        payload = body(app, config, entry, "update")
        owner = ProviderConfiguration(config.models_file)
        prepared: list[Any] = []
        before, stored = files(tmp_path), versions(config)

        def prepare(catalog: Any) -> Any:
            prepared.append(catalog)
            return config.engine.prepare_catalog_reload(catalog)

        checked = owner.command(payload, prepare=prepare)
        mutate_evidence(checked["models"][0]["metadata"])
        assert prepared[0].profiles[0].as_dict()["metadata"] == original
        assert files(tmp_path) == before and versions(config) == stored and entry["metadata"] == original
        with config.engine.defer_config_publication():
            applied = owner.command(payload, apply=True, prepare=prepare, activate=lambda catalog, registry: config.engine.reload_catalog(catalog, source=str(config.models_file), registry=registry))
        mutate_evidence(applied["models"][0]["metadata"])
        assert prepared[1] is config.engine.catalog
        assert prepared[1].profiles[0].as_dict()["metadata"] == original and entry["metadata"] == original
        projected = roundtrip(app, config, entry, "update")
        assert projected["metadata"] == original
        catalog = config.engine.catalog
        snapshot, digest, stored = catalog.routing_snapshot(), config.engine.config_hash, versions(config)
        profile = catalog.profiles[0]
        for returned in [profile.as_dict(), catalog.as_dict()["models"][0], catalog.routing_snapshot()["models"][0], owner.read()["models"][0], ProviderConfiguration.project(catalog, "fixed-token")["models"][0]]:
            assert returned["metadata"] == original
            mutate_evidence(returned["metadata"])
            assert profile.as_dict()["metadata"] == original
        mutate_evidence(projected["metadata"])
        mutate_evidence(entry["metadata"])
        assert profile.as_dict()["metadata"] == original and catalog.routing_snapshot() == snapshot
        assert config.engine.config_hash == digest and versions(config) == stored
        with pytest.raises(TypeError):
            profile.metadata["fields"]["tools"]["value"] = True
        with pytest.raises(TypeError):
            profile.metadata["sources"][0]["pricing"]["tiers"][0]["input"]["value"] = 999
        assert profile.as_dict()["metadata"] == original
        assert json.loads(config.models_file.read_text())["models"][0]["metadata"] == original
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        assert config.engine.catalog.profiles[0].as_dict()["metadata"] == original
        assert config.engine.catalog.routing_snapshot() == snapshot and versions(config) == stored
        assert model_metadata(original) == original
    finally:
        config.engine.close()
