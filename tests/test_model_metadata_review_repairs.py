"""Reproduced metadata defects and direct runtime/SQLite provenance oracles."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

import pytest

from jev_gateway import model_metadata as metadata
from jev_gateway.provider_config import metadata_envelope
from tests.test_model_legacy_and_evidence_isolation import FIXED, UPDATED
from tests.test_model_metadata import PROVIDER, client_for
from tests.test_model_revision_and_recovery_chat import files
from tests.test_model_transaction_publication import sqlite_app, versions
from tests.test_model_value_domains import body, record
from tests.test_provider_management_api import headers, request


def assert_active_and_stored(config: Any, expected: dict[str, Any]) -> None:
    name = "test-provider/vendor/only"
    profile = config.engine.catalog.by_name(name)
    assert profile is not None and profile.as_dict()["metadata"] == expected
    snapshot = config.engine.catalog.routing_snapshot()
    assert next(m for m in snapshot["models"] if m["name"] == name)["metadata"] == expected
    current = [row for row in versions(config) if row[0] == config.engine.config_hash]
    assert len(current) == 1
    stored = json.loads(current[0][2])
    assert stored == snapshot
    saved_model = next(m for m in stored["models"] if m["name"] == name)
    assert saved_model["metadata"] == expected
    assert saved_model["metadata"]["sources"] == expected["sources"]
    assert saved_model["metadata"]["fields"] == expected["fields"]


def publish_exact(app: Any, config: Any, expected: dict[str, Any], *, effort: list[str] | None = None) -> None:
    entry = record()
    entry["cost"]["input_per_million"] = 2
    if effort is not None:
        entry["capabilities"]["reasoning_effort"] = effort
    entry["metadata"] = copy.deepcopy(expected)
    payload = body(app, config, entry, "update")
    original = copy.deepcopy(payload)
    before, stored = files(config.models_file.parent), versions(config)
    catalog, registry, digest = config.engine.catalog, config.engine.strategies, config.engine.config_hash
    checked = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=payload)
    assert checked.status_code == 200 and checked.json()["models"][0]["metadata"] == expected
    assert files(config.models_file.parent) == before and versions(config) == stored
    assert config.engine.catalog is catalog and config.engine.strategies is registry and config.engine.config_hash == digest
    applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=payload)
    assert applied.status_code == 200 and applied.json()["models"][0]["metadata"] == expected
    assert payload == original
    assert_active_and_stored(config, expected)
    assert request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"][0]["metadata"] == expected
    assert json.loads(config.models_file.read_text())["models"][0]["metadata"] == expected
    snapshot, digest, committed = config.engine.catalog.routing_snapshot(), config.engine.config_hash, versions(config)
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    assert_active_and_stored(config, expected)
    assert config.engine.catalog.routing_snapshot() == snapshot and config.engine.config_hash == digest
    assert versions(config) == committed
    assert request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"][0]["metadata"] == expected
    assert config.engine.catalog.profiles[0].cost.input_per_million == 2


@pytest.mark.parametrize("condition", [
    {"vendor_condition": "synthetic-private-condition"},
    {"time": "12:30", "vendor_condition": {"secret": "synthetic-private-condition"}},
    {"time": "synthetic-private-condition"}, {"context_length": None},
    "synthetic-private-condition",
])
def test_nested_only_unrepresentable_override_is_marked_without_raw_content(tmp_path: Path, condition: Any) -> None:
    raw = {"pricing": {"prompt": "0.000002", "overrides": [{"prompt": "0.00000001", "condition": condition}]}}
    original = copy.deepcopy(raw)
    evidence = metadata._openrouter(raw, "vendor/only", FIXED)
    projected = evidence["pricing"]["overrides"][0]
    assert projected.get("unrecognized_conditions") is True
    assert "synthetic-private-condition" not in json.dumps(evidence) and "vendor_condition" not in json.dumps(evidence)
    assert raw == original and projected["prompt"]["value"] == pytest.approx(0.01)
    candidate = metadata._merge_candidates([evidence], [])
    assert candidate["fields"]["input_per_million"] == 2
    assert "pricing_requires_confirmation" in candidate["warnings"]
    envelope = metadata_envelope(candidate)
    assert envelope["sources"][0]["pricing"]["overrides"][0]["unrecognized_conditions"] is True
    app, config = sqlite_app(tmp_path)
    try:
        publish_exact(app, config, envelope)
    finally:
        config.engine.close()


def test_representable_override_does_not_acquire_unknown_marker() -> None:
    evidence = metadata._openrouter({"pricing": {"overrides": [{"prompt": "0.000002", "condition": {"context_length": 200000, "time": "12:30"}}]}}, "vendor/only", FIXED)
    projected = evidence["pricing"]["overrides"][0]
    assert projected["condition_fields"] == ["context_length", "time"]
    assert projected["context_length"] == 200000 and projected["time"] == "12:30"
    assert "unrecognized_conditions" not in projected


@pytest.mark.parametrize("levels", [["high", "low"], ["high", "low", "high"]])
def test_native_reversed_effort_suggestion_matches_envelope_without_changing_source(levels: list[str]) -> None:
    raw = {"id": "vendor/only", "effort": {"supported_levels": levels}}
    original = copy.deepcopy(raw)
    candidate = metadata.native_model_metadata(raw, "deepseek", "instance", FIXED)
    envelope = metadata_envelope(candidate)
    assert candidate["fields"]["reasoning_effort"] == envelope["fields"]["reasoning_effort"]["value"] == ["low", "high"]
    assert envelope["fields"]["reasoning_effort"]["status"] == "known"
    assert candidate["sources"][0]["fields"]["reasoning_effort"]["value"] == levels
    assert envelope["sources"][0]["fields"]["reasoning_effort"]["value"] == levels
    assert raw == original


def effort_sources(levels: list[str]) -> list[dict[str, Any]]:
    native = metadata.native_model_metadata({"id": "vendor/only", "capabilities": {"effort": {"supported": True, "low": {"supported": True}, "high": {"supported": True}}}}, "anthropic", "instance", FIXED)
    public = metadata._models_dev({"reasoning_options": [{"type": "effort", "values": levels}]}, "models_dev", "anthropic", "vendor/only", FIXED, True)
    return native["sources"] + [public]


@pytest.mark.parametrize("levels", [["high", "low"], ["high", "low", "high"]])
def test_equal_effort_sets_do_not_conflict_in_automatic_merge(tmp_path: Path, levels: list[str]) -> None:
    sources = effort_sources(levels)
    original = copy.deepcopy(sources)
    candidate = metadata._merge_candidates(sources, [])
    assert candidate["fields"]["reasoning_effort"] == ["low", "high"]
    assert "metadata_conflict" not in candidate["warnings"]
    envelope = metadata_envelope(candidate)
    assert envelope["fields"]["reasoning_effort"] == {"status": "known", "value": ["low", "high"], "source_ids": ["native_listing-0", "models_dev-1"]}
    assert sources == original and envelope["sources"][1]["source_reasoning_effort"] == levels
    assert envelope["sources"][1]["fields"]["reasoning_effort"]["value"] == levels
    envelope["fields"]["reasoning_effort"].update(status="confirmed", method="source", confirmed_at=FIXED)
    app, config = sqlite_app(tmp_path)
    try:
        publish_exact(app, config, envelope, effort=["low", "high"])
    finally:
        config.engine.close()


@pytest.mark.parametrize("levels", [["high", "low"], ["high", "low", "high"]])
def test_envelope_compares_semantic_effort_values_independently(levels: list[str]) -> None:
    sources = effort_sources(levels)
    original = copy.deepcopy(sources)
    candidate = {"fields": {"reasoning_effort": ["high", "low", "low"]}, "sources": sources}
    envelope = metadata_envelope(candidate)
    assert envelope["fields"]["reasoning_effort"] == {"status": "known", "value": ["low", "high"], "source_ids": ["native_listing-0", "models_dev-1"]}
    assert sources == original and candidate["fields"]["reasoning_effort"] == ["high", "low", "low"]


@pytest.mark.parametrize("first,second,status,value", [
    ([], [], "known", []), ([], None, "known", []), (None, None, "unknown", None),
    (["low"], ["high"], "conflict", None), ([], ["high"], "conflict", None),
    (["high", "low"], ["vendor", None], "known", ["low", "high"]),
])
def test_effort_empty_unknown_and_real_conflicts_remain_distinct(first: Any, second: Any, status: str, value: Any) -> None:
    sources = [{"source": name, "applicable": True, "fields": {"reasoning_effort": {"value": raw, "source_field": "declared"}}} for name, raw in [("first", first), ("second", second)]]
    original = copy.deepcopy(sources)
    candidate = metadata._merge_candidates(sources, [])
    envelope = metadata_envelope(candidate)
    assert candidate["fields"]["reasoning_effort"] == value
    assert envelope["fields"]["reasoning_effort"] == {"status": status, "value": value, "source_ids": ["first-0", "second-1"]}
    assert ("metadata_conflict" in candidate["warnings"]) is (status == "conflict")
    assert sources == original


@pytest.mark.parametrize("association", ["canonical_model_id", "base_model"])
def test_canonical_association_is_exact_in_active_sqlite_reload_and_fresh_catalog(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, association: str) -> None:
    monkeypatch.setattr(metadata, "timestamp", lambda: FIXED)
    client = client_for(api={"openai": {"models": {"vendor/only": {"id": "vendor/only", association: "vendor/base", "cost": {"input": 2}, "last_updated": UPDATED}}}}, catalog={"models": {"vendor/base": {"tool_call": False, "limit": {"context": 8192}, "cost": {"input": 99, "cache_read": 99}}}})
    candidate = client.lookup(PROVIDER, ["vendor/only"])["items"][0]
    envelope = metadata_envelope(candidate)
    serving, canonical = envelope["sources"]
    assert serving["canonical_model_id"] == "vendor/base" and serving["provider_id"] == "openai" and serving["model_id"] == "vendor/only"
    assert serving["fetched_at"] == FIXED and serving["source_updated_at"] == UPDATED and serving["applicable"] is True
    assert serving["fields"]["input_per_million"] == {"value": 2, "source_field": "cost.input", "unit": "USD/M tokens", "source_unit": "USD/M tokens"}
    assert canonical["provider_id"] == "canonical" and canonical["model_id"] == "vendor/base" and "source_updated_at" not in canonical
    assert envelope["fields"]["context_window"]["source_ids"] == [canonical["id"]]
    assert envelope["fields"]["input_per_million"]["source_ids"] == [serving["id"]]
    assert envelope["fields"]["input_per_million"]["value"] == 2 and envelope["fields"]["cache_read_per_million"]["value"] is None
    assert serving["schema_revision"] == canonical["schema_revision"] == "f4f37ea6a4315ebdb733a49c35499aa93fd35840"
    envelope["fields"]["input_per_million"].update(status="confirmed", method="source", confirmed_at="2026-10-08T08:00:00+00:00")
    app, config = sqlite_app(tmp_path)
    try:
        publish_exact(app, config, envelope)
        script = '''import json,socket,os,sys
os.environ['LITELLM_LOCAL_MODEL_COST_MAP']='True'
def forbidden(*a,**k): raise AssertionError('Network forbidden')
socket.getaddrinfo=forbidden;socket.socket.connect=forbidden
from pathlib import Path
from jev_gateway.catalog import load_catalog
print(json.dumps(load_catalog(Path(sys.argv[1])).profiles[0].as_dict()['metadata']))
'''
        completed = subprocess.run([sys.executable, "-c", script, str(config.models_file)], cwd=Path(__file__).resolve().parents[1], env={**os.environ, "LITELLM_LOCAL_MODEL_COST_MAP": "True"}, capture_output=True, text=True)
        assert completed.returncode == 0, completed.stderr
        assert json.loads(completed.stdout) == envelope
    finally:
        config.engine.close()
