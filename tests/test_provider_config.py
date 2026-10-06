"""Provider management validation, provenance, and recovery contracts."""

from __future__ import annotations

import json
import os
import stat
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import config_transaction
from jev_gateway.catalog import catalog_from_document
from jev_gateway.catalog import model_metadata
from jev_gateway.credentials import credential_update
from jev_gateway.provider_config import ProviderConfiguration, RevisionConflict, credential_snapshot, env_update, metadata_envelope, revision
from jev_gateway.strategy.decision_provider import DecisionClient
from tests.helpers import single_route_document


def service(tmp_path: Path) -> ProviderConfiguration:
    path = tmp_path / "models.json"
    path.write_text(json.dumps(single_route_document()))
    return ProviderConfiguration(path)


def upsert(current: ProviderConfiguration, **fields: Any) -> dict[str, Any]:
    provider = {"id": "test-provider", "type": "openai", "api_base": "https://test.example/v1", "api_key_env": "TEST_PROVIDER_KEY", **fields}
    return {"expected_revision": revision(current.models_file), "operations": [{"action": "upsert", "kind": "llm", "provider": provider, "credential": {"action": "keep"}}]}


def model(name: str = "vendor/new") -> dict[str, Any]:
    return {"upstream_model": name, "capabilities": {"tools": True, "vision": False, "json_mode": True, "reasoning": False, "temperature": True, "reasoning_effort": []}, "cost": {"input_per_million": 0.0, "output_per_million": 2.0}, "context_window": None, "max_output_tokens": 1024}


def import_body(current: ProviderConfiguration, entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {"expected_revision": revision(current.models_file), "operations": [{"action": "import", "provider_id": "test-provider", "confirmed": True, "models": entries}]}


def test_legacy_defaults_and_new_display_fields(tmp_path: Path) -> None:
    current = service(tmp_path)
    before = current.read()
    assert before["providers"][0]["display_name"] == "test-provider"
    assert before["providers"][0]["allow_private_network"] is False
    result = current.command(upsert(current, display_name="Local model", brand_id="openai", icon_id="server", allow_private_network=True), apply=True)
    assert result["providers"][0]["display_name"] == "Local model"
    assert result["models"][0]["name"] == before["models"][0]["name"]
    assert current.read()["providers"][0]["allow_private_network"] is True


@pytest.mark.parametrize("icon", ["anthropic", "gemini", "qwen", "cloud", "initials", "future-brand-icon", "constructor", "__proto__", "toString", "hasOwnProperty", None])
def test_icon_selection_round_trips_without_changing_transport_or_model_identity(tmp_path: Path, icon: str | None) -> None:
    current = service(tmp_path)
    before = current.read()
    document = json.loads(current.models_file.read_text())
    document["providers"][0].update(brand_id="deepseek", params={"timeout": 12})
    current.models_file.write_text(json.dumps(document))
    body = upsert(current, brand_id="deepseek", icon_id=icon)
    baseline = current.models_file.read_bytes()
    validated = current.command(body)
    assert current.models_file.read_bytes() == baseline
    assert validated["providers"][0]["icon_id"] == icon
    result = current.command(body, apply=True)
    reread = ProviderConfiguration(current.models_file).read()
    saved = json.loads(current.models_file.read_text())
    for snapshot in (result, reread):
        provider = snapshot["providers"][0]
        assert provider["icon_id"] == icon
        assert provider["brand_id"] == "deepseek"
        assert provider["id"] == "test-provider"
        assert provider["type"] == "openai"
        assert provider["api_base"] == before["providers"][0]["api_base"]
        assert snapshot["models"] == before["models"]
    assert saved["providers"][0]["params"] == {"timeout": 12}
    assert saved["providers"][0]["icon_id"] == icon
    assert not (tmp_path / ".env").exists()


def test_decision_icon_selection_is_independent_and_persists_after_read(tmp_path: Path) -> None:
    current = service(tmp_path)
    provider = {"id": "judge", "protocol": "system_one", "api_base": "https://fixture.example/evaluate", "api_key_env": "SYSTEM_FIXTURE_KEY", "brand_id": "openai", "icon_id": "qwen"}
    body = {"expected_revision": revision(current.models_file), "operations": [{"action": "upsert", "kind": "decision", "provider": provider, "credential": {"action": "set", "value": "fake-decision-icon-key"}}]}
    current.command(body, apply=True)
    restored = ProviderConfiguration(current.models_file).read()["decision"]["providers"][0]
    assert restored["icon_id"] == "qwen"
    assert restored["brand_id"] == "openai"
    assert restored["id"] == "judge" and restored["protocol"] == "system_one"
    assert restored["api_base"] == provider["api_base"]
    assert "fake-decision-icon-key" not in json.dumps(restored)


@pytest.mark.parametrize("value", ["true", 1, None, {}, []])
def test_private_network_requires_bool(tmp_path: Path, value: Any) -> None:
    current = service(tmp_path)
    before = current.models_file.read_bytes()
    with pytest.raises((ValueError, TypeError)):
        current.command(upsert(current, allow_private_network=value), apply=True)
    assert current.models_file.read_bytes() == before


def test_advanced_params_survive_omission_and_redacted_markers_rejected(tmp_path: Path) -> None:
    current = service(tmp_path)
    document = single_route_document()
    document["providers"][0].update(params={"timeout": 10}, param_env={"organization": "TEST_PROVIDER_KEY"})
    current.models_file.write_text(json.dumps(document))
    current.command(upsert(current, display_name="Edited"), apply=True)
    saved = json.loads(current.models_file.read_text())
    assert saved["providers"][0]["params"] == {"timeout": 10}
    assert saved["providers"][0]["param_env"] == {"organization": "TEST_PROVIDER_KEY"}
    with pytest.raises(ValueError, match="Redacted"):
        current.command(upsert(current, params={"timeout": "[configured]"}), apply=True)


def test_validation_and_revision_conflict_write_nothing(tmp_path: Path) -> None:
    current = service(tmp_path)
    body = upsert(current, display_name="Edited")
    before = current.models_file.read_bytes()
    result = current.command(body)
    assert result["valid"] and not result["applied"]
    assert current.models_file.read_bytes() == before
    current.command(body, apply=True)
    with pytest.raises(RevisionConflict):
        current.command(body, apply=True)


def test_import_provenance_and_duplicate_preservation(tmp_path: Path) -> None:
    current = service(tmp_path)
    entry = model()
    provenance = metadata_envelope({"fields": {"output_per_million": 2.0}, "sources": [{"source": "fixture", "source_provider": "test-provider", "source_model": "vendor/new", "fetched_at": "2026-09-30T10:00:00Z", "applicable": True, "fields": {"output_per_million": {"value": 2.0, "source_field": "price.output", "unit": "USD/M tokens"}}}]})
    provenance["fields"]["output_per_million"].update(status="confirmed", confirmed_at="2026-09-30T10:01:00Z", method="source")
    entry["metadata"] = provenance
    entry["tags"] = ["custom/kept"]
    first = current.command(import_body(current, [entry]), apply=True)
    assert first["imported"] == 1
    assert first["models"][1]["metadata"] == provenance
    duplicate = model()
    duplicate["tags"] = ["custom/replaced"]
    second = current.command(import_body(current, [duplicate]), apply=True)
    assert second["imported"] == 0 and second["skipped"] == 1
    assert second["models"][1]["tags"] == ["custom/kept"]
    assert second["models"][1]["metadata"] == provenance


@pytest.mark.parametrize("field", ["cost", "capabilities", "context_window", "max_output_tokens"])
def test_import_requires_explicit_metadata(tmp_path: Path, field: str) -> None:
    current = service(tmp_path)
    entry = model()
    entry.pop(field)
    with pytest.raises(ValueError, match="Import requires"):
        current.command(import_body(current, [entry]), apply=True)


@pytest.mark.parametrize("price", [True, -1, float("inf"), float("nan"), None, "0"])
def test_import_rejects_invalid_cost(tmp_path: Path, price: Any) -> None:
    current = service(tmp_path)
    entry = model()
    entry["cost"]["input_per_million"] = price
    with pytest.raises(ValueError, match="prices"):
        current.command(import_body(current, [entry]), apply=True)


def test_provider_delete_preserves_referenced_models(tmp_path: Path) -> None:
    current = service(tmp_path)
    body = {"expected_revision": revision(current.models_file), "operations": [{"action": "delete", "kind": "llm", "id": "test-provider"}]}
    with pytest.raises(ValueError, match="referenced"):
        current.command(body, apply=True)


def test_shared_credential_cannot_be_cleared(tmp_path: Path) -> None:
    current = service(tmp_path)
    document = single_route_document()
    document["providers"].append({**document["providers"][0], "id": "shared"})
    current.models_file.write_text(json.dumps(document))
    body = upsert(current)
    body["operations"][0]["credential"] = {"action": "clear"}
    with pytest.raises(ValueError, match="shared"):
        current.command(body, apply=True)


def test_credential_rotation_uses_snapshot_and_protected_json(tmp_path: Path) -> None:
    current = service(tmp_path)
    body = upsert(current)
    secret = "fake-hostile-'quoted'-$value-#comment"
    body["operations"][0]["credential"] = {"action": "set", "value": secret}
    process = dict(os.environ)
    result = current.command(body, apply=True)
    assert secret not in json.dumps(result)
    assert os.environ == process
    assert credential_snapshot(current.models_file)["TEST_PROVIDER_KEY"] == secret
    assert stat.S_IMODE((tmp_path / "credentials.json").stat().st_mode) == 0o600
    assert not (tmp_path / ".provider-configuration.recovery").exists()


def test_activation_failure_restores_files_and_runtime(tmp_path: Path) -> None:
    current = service(tmp_path)
    env = tmp_path / "credentials.json"
    env.write_bytes(credential_update(None, "TEST_PROVIDER_KEY", "fake-before"))
    env.chmod(0o600)
    current.models_file.chmod(0o640)
    old_catalog, old_env = current.models_file.read_bytes(), env.read_bytes()
    body = upsert(current, display_name="Edited")
    body["operations"][0]["credential"] = {"action": "set", "value": "fake-after"}
    restored: list[bool] = []
    def fail(catalog: Any, registry: Any) -> None:
        raise RuntimeError("fake-secret-in-activation-error")
    with pytest.raises(RuntimeError):
        current.command(body, apply=True, activate=fail, restore_runtime=lambda: restored.append(True))
    assert current.models_file.read_bytes() == old_catalog
    assert env.read_bytes() == old_env
    assert restored == [True]
    assert stat.S_IMODE(env.stat().st_mode) == 0o600
    assert stat.S_IMODE(current.models_file.stat().st_mode) == 0o640


def test_second_file_failure_restores_catalog(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    current = service(tmp_path)
    before = current.models_file.read_bytes()
    original = config_transaction.atomic_bytes
    count = 0
    def fault(path: Path, data: bytes | None, *, protected: bool = False) -> None:
        nonlocal count
        count += 1
        if count == 3:
            raise OSError("fake-write-failure")
        original(path, data, protected=protected)
    monkeypatch.setattr(config_transaction, "atomic_bytes", fault)
    with pytest.raises(OSError):
        current.command(upsert(current, display_name="Edited"), apply=True)
    assert current.models_file.read_bytes() == before


def test_concurrent_writers_accept_only_one_revision(tmp_path: Path) -> None:
    current = service(tmp_path)
    body = upsert(current, display_name="Edited")
    def write() -> str:
        try:
            current.command(body, apply=True)
            return "applied"
        except RevisionConflict:
            return "conflict"
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: write(), range(2))) == ["applied", "conflict"]


def test_decision_snapshot_and_call_time_environment_compatibility(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    document = single_route_document()
    document["decision"] = {"enabled": True, "providers": [{"id": "one", "protocol": "system_one", "api_base": "https://decision.example/evaluate", "api_key_env": "DECISION_FIXTURE_KEY"}]}
    env = {"TEST_PROVIDER_KEY": "fake-route", "DECISION_FIXTURE_KEY": "fake-snapshot"}
    injected = catalog_from_document(document, "fixture", env)
    monkeypatch.setenv("DECISION_FIXTURE_KEY", "fake-call-time")
    legacy = catalog_from_document(document, "fixture")
    from jev_gateway.strategy import decision_provider
    observed: list[str] = []
    class Adapter:
        def evaluate(self, provider: Any, api_key: str, timeout: float, state: Any, questions: Any) -> None:
            observed.append(api_key)
    monkeypatch.setitem(decision_provider._ADAPTERS, "system_one", Adapter())
    DecisionClient(injected.decision).evaluate("fixture", {})
    DecisionClient(legacy.decision).evaluate("fixture", {})
    assert observed == ["fake-snapshot", "fake-call-time"]


def test_metadata_rejects_unrecognized_fields_and_secret_urls(tmp_path: Path) -> None:
    for metadata in ({"version": 2}, {"version": 1, "raw": "bad"}, {"version": 1, "sources": [{"id": "one", "url": "https://x.example/?key=bad"}]}):
        document = single_route_document(metadata=metadata)
        with pytest.raises(ValueError, match="metadata"):
            catalog_from_document(document, "fixture")


def test_failed_restore_retains_protected_journal_and_blocks_next_write(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    current = service(tmp_path)
    original = config_transaction.atomic_bytes
    calls = 0
    def fault(path: Path, data: bytes | None, *, protected: bool = False) -> None:
        nonlocal calls
        calls += 1
        if calls >= 3:
            raise OSError("fake-persistent-write-failure")
        original(path, data, protected=protected)
    monkeypatch.setattr(config_transaction, "atomic_bytes", fault)
    with pytest.raises(RuntimeError, match="recovery failed"):
        current.command(upsert(current, display_name="Edited"), apply=True)
    recovery = tmp_path / ".provider-configuration.recovery"
    assert recovery.exists()
    assert stat.S_IMODE(recovery.stat().st_mode) == 0o600
    monkeypatch.setattr(config_transaction, "atomic_bytes", original)
    with pytest.raises(RuntimeError, match="unresolved"):
        current.command(upsert(current, display_name="Another edit"), apply=True)


def test_cli_add_failure_restores_env_catalog_and_process_environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from jev_gateway.cli.paths import runtime_paths
    from jev_gateway.cli.providers import add_provider
    from jev_gateway.cli.output import CliError
    current = service(tmp_path)
    before = current.models_file.read_bytes()
    process = dict(os.environ)
    original = config_transaction.atomic_bytes
    calls = 0
    def fault(path: Path, data: bytes | None, *, protected: bool = False) -> None:
        nonlocal calls
        calls += 1
        if calls == 4:
            raise OSError("fake-write-error-containing-secret")
        original(path, data, protected=protected)
    monkeypatch.setattr(config_transaction, "atomic_bytes", fault)
    with pytest.raises(CliError, match="operation failed") as failure:
        add_provider(runtime_paths(tmp_path), preset="openai", provider_id="new", provider_type=None, api_base=None, api_key_env="NEW_FIXTURE_KEY", models=["new"], tags=[], secret="fake-new-secret")
    assert "fake-new-secret" not in str(failure.value)
    assert current.models_file.read_bytes() == before
    assert not (tmp_path / ".env").exists()
    assert os.environ == process


def test_declared_env_credentials_do_not_interpolate_secret_text(tmp_path: Path) -> None:
    current = service(tmp_path)
    secret = "fake-${TEST_PROVIDER_KEY}-\\-'quoted'"
    content = env_update(b"", "FIXTURE_RAW_KEY", secret)
    assert credential_snapshot(current.models_file, env_content=content)["FIXTURE_RAW_KEY"] == secret


def test_system_one_upsert_keeps_full_url_and_optional_model(tmp_path: Path) -> None:
    current = service(tmp_path)
    body = {"expected_revision": revision(current.models_file), "operations": [{"action": "upsert", "kind": "decision", "provider": {"id": "one", "protocol": "system_one", "api_base": "https://fixture.example/evaluate", "api_key_env": "SYSTEM_FIXTURE_KEY", "display_name": "Decision fixture"}, "credential": {"action": "set", "value": "fake-decision-secret"}}]}
    result = current.command(body, apply=True)
    provider = result["decision"]["providers"][0]
    assert provider["model"] is None
    assert provider["api_base"] == "https://fixture.example/evaluate"
    assert provider["has_api_key"] is True
    assert "fake-decision-secret" not in json.dumps(result)


def test_confirmed_metadata_cannot_disagree_with_routing_cost(tmp_path: Path) -> None:
    current = service(tmp_path)
    entry = model()
    entry["metadata"] = {"version": 1, "fields": {"input_per_million": {"status": "confirmed", "value": 99, "method": "manual"}}}
    with pytest.raises(ValueError, match="must match"):
        current.command(import_body(current, [entry]), apply=True)


def test_query_sources_preserve_reference_fields_raw_effort_units_and_conditions(tmp_path: Path) -> None:
    current = service(tmp_path)
    source = {
        "source": "models_dev", "source_provider": "openai", "source_model": "vendor/new",
        "fetched_at": "2026-09-30T10:00:00Z", "source_updated_at": "2024-01-01",
        "applicable": False, "url": "https://models.dev/api.json", "schema_revision": "fixture-revision",
        "canonical_model_id": "vendor/base", "source_reasoning_effort": [None, "default", "high"],
        "fields": {
            "input_per_million": {"value": 0, "source_field": "cost.input", "unit": "USD/M tokens", "source_unit": "USD/M tokens"},
            "tools": {"value": False, "source_field": "tool_call"},
            "reasoning": {"value": None, "source_field": "reasoning"},
            "max_input_tokens": {"value": 128000, "source_field": "max_input_tokens", "unit": "tokens"},
            "structured_output": {"value": True, "source_field": "structured_output"},
        },
        "pricing": {
            "input": {"value": 0, "unit": "USD/M tokens"},
            "cache_read": {"value": 0.25, "unit": "USD/M tokens"},
            "tiers": [{"input": {"value": 4, "unit": "USD/M tokens"}, "condition": {"type": "context", "size": 300000}}],
            "overrides": [{"prompt": {"value": 6, "unit": "USD/M tokens"}, "min_prompt_tokens": 200000, "utc_start": 1630, "utc_end": 30, "utc_days": ["monday"], "condition_fields": [], "unrecognized_conditions": True}],
            "context_over_200k": {"input": {"value": None, "unit": "USD/M tokens"}, "threshold_unverified": True},
        },
    }
    normalized = metadata_envelope({"fields": {}, "sources": [source], "warnings": ["reference_only"]})
    persisted = normalized["sources"][0]
    assert persisted["applicable"] is False
    assert persisted["fields"] == source["fields"]
    assert persisted["pricing"] == source["pricing"]
    assert persisted["source_reasoning_effort"] == [None, "default", "high"]
    assert persisted["schema_revision"] == "fixture-revision"
    assert normalized["fields"]["tools"]["status"] == "unknown"
    assert normalized["fields"]["tools"]["value"] is None
    entry = model()
    entry["metadata"] = normalized
    current.command(import_body(current, [entry]), apply=True)
    assert current.read()["models"][1]["metadata"] == normalized


@pytest.mark.parametrize("source", [
    {"pricing": {"credential": "fake-hostile"}},
    {"pricing": {"input": {"value": 1, "unit": "USD/M tokens", "raw": "bad"}}},
    {"pricing": {"overrides": [{"condition": {"url": "https://bad.example"}}]}},
    {"fields": {"arbitrary_upstream_payload": {"value": "bad", "source_field": "bad"}}},
    {"applicable": 1},
])
def test_persisted_source_rejects_arbitrary_evidence_and_pricing(source: dict[str, Any]) -> None:
    with pytest.raises((ValueError, TypeError), match="metadata"):
        model_metadata({"version": 1, "sources": [{"id": "fixture", **source}]})


@pytest.mark.parametrize("source_ids", [None, [], ["missing"]])
def test_source_confirmation_requires_resolved_references(tmp_path: Path, source_ids: Any) -> None:
    current = service(tmp_path)
    entry = model()
    evidence = {"status": "confirmed", "value": True, "method": "source"}
    if source_ids is not None:
        evidence["source_ids"] = source_ids
    entry["metadata"] = {"version": 1, "sources": [{"id": "source"}], "fields": {"tools": evidence}}
    before = current.models_file.read_bytes()
    for apply in (False, True):
        with pytest.raises(ValueError, match="source references"):
            current.command(import_body(current, [entry]), apply=apply)
        assert current.models_file.read_bytes() == before
        assert not (tmp_path / "models.json.bak").exists()


@pytest.mark.parametrize("name,value", [
    ("tools", False), ("input_per_million", 0),
    ("reasoning_effort", []), ("context_window", None),
])
def test_manual_and_source_confirmation_preserve_explicit_values(tmp_path: Path, name: str, value: Any) -> None:
    current = service(tmp_path)
    entry = model()
    target = entry["capabilities"] if name in entry["capabilities"] else entry["cost"] if name in entry["cost"] else entry
    target[name] = value
    manual = {"version": 1, "fields": {name: {"status": "confirmed", "value": value, "method": "manual", "source_ids": []}}}
    entry["metadata"] = manual
    result = current.command(import_body(current, [entry]), apply=True)
    assert result["models"][1]["metadata"] == manual
    source = {"id": "fixture", "url": "https://models.dev/api.json"}
    sourced = {"version": 1, "sources": [source], "fields": {name: {"status": "confirmed", "value": value, "method": "source", "source_ids": ["fixture"]}}}
    entry["metadata"] = sourced
    body = {"expected_revision": revision(current.models_file), "operations": [{"action": "update_model", "model_id": "test-provider/vendor/new", "model": entry}]}
    current.command(body, apply=True)
    assert current.read()["models"][1]["metadata"] == sourced


@pytest.mark.parametrize("status", ["unknown", "conflict"])
@pytest.mark.parametrize("name,value", [("tools", False), ("input_per_million", 0), ("reasoning_effort", []), ("context_window", 1)])
def test_uncertain_metadata_cannot_supply_an_automatic_value(status: str, name: str, value: Any) -> None:
    envelope = {"version": 1, "fields": {name: {"status": status, "value": value}}}
    with pytest.raises(ValueError, match="null automatic value"):
        model_metadata(envelope)
    envelope["fields"][name]["value"] = None
    assert model_metadata(envelope) == envelope
    envelope["fields"][name].pop("value")
    assert model_metadata(envelope) == envelope


@pytest.mark.parametrize("url", [
    "https://127.0.0.1/evidence", "https://10.0.0.1/evidence", "https://172.16.0.1/evidence",
    "https://192.168.0.1/evidence", "https://169.254.169.254/evidence", "https://168.63.129.16/evidence",
    "https://0.0.0.0/evidence", "https://100.64.0.1/evidence", "https://224.0.0.1/evidence",
    "https://192.0.2.1/evidence", "https://[::1]/evidence", "https://[fc00::1]/evidence",
    "https://[fe80::1]/evidence", "https://[::]/evidence", "https://[ff02::1]/evidence",
    "https://[::ffff:8.8.8.8]/evidence", "https://[2002:0808:0808::1]/evidence",
    "https://localhost/evidence", "https://localhost./evidence", "https://x.localhost/evidence",
    "https://router.local/evidence", "https://metadata.google.internal/evidence",
    "https://2130706433/evidence", "https://127.1/evidence", "https://0x7f.0.0.1/evidence",
    "https://%31%32%37.0.0.1/evidence", "http://models.dev/api.json", "https://user@models.dev/api.json",
    "https://@models.dev/api.json", "https://models.dev/api.json?", "https://models.dev/api.json#",
    "https://models.dev:0/api.json", "https://models.dev:65536/api.json", "https://models.dev:bad/api.json",
    "https://models.dev:/api.json", "https://models.dev/%0a", "https://models.dev\\@127.0.0.1/evidence",
    "https://models dev/api.json", "https://-invalid.example/evidence",
])
def test_metadata_rejects_nonpublic_and_malformed_source_urls_offline(url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    import socket
    monkeypatch.setattr(socket, "getaddrinfo", lambda *_args, **_kwargs: pytest.fail("Evidence validation must not resolve DNS"))
    with pytest.raises(ValueError, match="public HTTPS without credentials"):
        model_metadata({"version": 1, "sources": [{"id": "fixture", "url": url}]})


@pytest.mark.parametrize("url", [
    "https://models.dev/api.json", "https://openrouter.ai/api/v1/models",
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
    "https://public.example:8443/evidence", "https://8.8.8.8/evidence",
    "https://[2606:4700:4700::1111]/evidence", "https://bücher.example/evidence",
])
def test_metadata_preserves_valid_source_urls_without_network(url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    import socket
    from jev_gateway import discovery_network
    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Persisted evidence must not make network requests")
    monkeypatch.setattr(socket, "getaddrinfo", forbidden)
    monkeypatch.setattr(discovery_network, "safe_get_json", forbidden)
    envelope = {"version": 1, "sources": [{"id": "fixture", "url": url}]}
    assert model_metadata(envelope) == envelope


@pytest.mark.parametrize("name,first,second", [
    ("tools", True, False), ("input_per_million", 0, 2),
    ("cache_read_per_million", 0, 0.25), ("reasoning_effort", [], ["high"]),
    ("context_window", 1024, 2048),
])
def test_metadata_envelope_conflicts_clear_candidate_value_and_retain_evidence(name: str, first: Any, second: Any) -> None:
    source = {"source": "fixture", "applicable": True, "fields": {name: {"value": first, "source_field": name}}}
    other = {**source, "fields": {name: {"value": second, "source_field": name}}}
    conflict = metadata_envelope({"fields": {name: first}, "sources": [source, other]})
    assert conflict["fields"][name] == {"status": "conflict", "value": None, "source_ids": ["fixture-0", "fixture-1"]}
    assert [s["fields"][name]["value"] for s in conflict["sources"]] == [first, second]
    for ignored in (None, second):
        other["fields"][name]["value"] = ignored
        other["applicable"] = ignored is None
        known = metadata_envelope({"fields": {name: first}, "sources": [source, other]})
        assert known["fields"][name]["status"] == "known"
        assert known["fields"][name]["value"] == first
