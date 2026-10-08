"""Strict complete records and bounded provenance through the management API."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from jev_gateway.records import build_config_hash
from tests.test_model_management_boundaries import manual_model
from tests.test_model_revision_and_recovery_chat import files
from tests.test_model_transaction_publication import sqlite_app, versions
from tests.test_provider_management_api import headers, request

FIELDS = ["input_per_million", "output_per_million", "cache_read_per_million", "cache_write_per_million", "tools", "vision", "json_mode", "reasoning", "temperature", "reasoning_effort", "context_window", "max_output_tokens"]
BOOLS = ["tools", "vision", "json_mode", "reasoning", "temperature"]


def record() -> dict[str, Any]:
    return {**manual_model("vendor/only"), "display_name": "Domain record", "quality": 0.7}


def location(entry: dict[str, Any], field: str) -> dict[str, Any]:
    if field in FIELDS[:4]:
        return entry["cost"]
    if field in FIELDS[4:10]:
        return entry["capabilities"]
    return entry


def body(app: Any, config: Any, entry: dict[str, Any], action: str) -> dict[str, Any]:
    token = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["revision"]
    operation = {"action": "update_model", "model_id": "test-provider/vendor/only", "model": entry} if action == "update" else {"action": "import", "provider_id": "test-provider", "confirmed": True, "models": [{**entry, "upstream_model": "vendor/imported"}]}
    return {"expected_revision": token, "operations": [operation]}


def reject(app: Any, config: Any, payload: dict[str, Any], raw: str | None = None) -> None:
    before, stored = files(config.models_file.parent), versions(config)
    engine = config.engine
    catalog, registry, digest, source, key = engine.catalog, engine.strategies, engine.config_hash, engine.config_source, config.gateway_api_key
    for method, route in [("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")]:
        kwargs = {"content": raw, "headers": {**headers(config), "Content-Type": "application/json"}} if raw is not None else {"json": payload, "headers": headers(config)}
        response = request(app, method, route, **kwargs)
        assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_configuration"
        assert "synthetic-private" not in response.text and "fake-before" not in response.text
        assert files(config.models_file.parent) == before and versions(config) == stored
        assert engine.catalog is catalog and engine.strategies is registry
        assert engine.config_hash == digest and engine.config_source == source and config.gateway_api_key == key


def persist(app: Any, config: Any, entry: dict[str, Any], action: str) -> dict[str, Any]:
    payload = body(app, config, entry, action)
    original = copy.deepcopy(payload)
    before, stored = files(config.models_file.parent), versions(config)
    checked = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=payload)
    assert checked.status_code == 200 and files(config.models_file.parent) == before and versions(config) == stored
    applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=payload)
    assert applied.status_code == 200 and payload == original
    models = applied.json()["models"]
    assert request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"] == models
    snapshot, digest, committed = config.engine.catalog.routing_snapshot(), config.engine.config_hash, versions(config)
    assert digest == build_config_hash(snapshot) and any(row[0] == digest for row in committed)
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    assert config.engine.catalog.routing_snapshot() == snapshot and config.engine.config_hash == digest
    assert versions(config) == committed
    assert request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"] == models
    name = "test-provider/vendor/only" if action == "update" else "test-provider/vendor/imported"
    projected = next(m for m in models if m["name"] == name)
    assert projected["tags"] == entry["tags"] and projected["priority"] == entry["priority"] and projected["quality"] == entry["quality"]
    return projected


PRICE_CASES = [(field, literal) for field in FIELDS[:4] for literal in ["-1", "true", "false", '"3"', "{}", "NaN", "Infinity", "-Infinity", "1e400"]] + [(field, "null") for field in FIELDS[:2]]


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("field,literal", PRICE_CASES)
def test_strict_price_raw_json_domain(tmp_path: Path, action: str, field: str, literal: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["cost"][field] = "synthetic-private-token"
        payload = body(app, config, entry, action)
        raw = json.dumps(payload).replace('"synthetic-private-token"', literal)
        reject(app, config, payload, raw)
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("input_price,output_price", [(0, 0), (3.5, 1.25), (1e300, 1e300)])
def test_required_prices_preserve_zero_independent_and_large_finite_values(
    tmp_path: Path, action: str, input_price: float, output_price: float,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        for field, value in [("input_per_million", input_price), ("output_per_million", output_price)]:
            entry["cost"][field] = value
            entry["metadata"]["fields"][field]["value"] = value
        projected = persist(app, config, entry, action)
        assert projected["cost"] == entry["cost"]
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("read", ["omitted", None, 0, 0.75])
@pytest.mark.parametrize("write", ["omitted", None, 0, 2.5])
def test_cache_unknown_zero_and_independent_prices_persist(tmp_path: Path, action: str, read: Any, write: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["cost"]["input_per_million"] = 0
        entry["metadata"]["fields"]["input_per_million"]["value"] = 0
        for field, value in [("cache_read_per_million", read), ("cache_write_per_million", write)]:
            if value == "omitted":
                entry["cost"].pop(field)
                entry["metadata"]["fields"].pop(field)
            else:
                entry["cost"][field] = value
                entry["metadata"]["fields"][field]["value"] = value
        projected = persist(app, config, entry, action)
        for field, value in [("cache_read_per_million", read), ("cache_write_per_million", write)]:
            assert projected["cost"][field] == (None if value == "omitted" else value)
        saved = json.loads(config.models_file.read_text())["models"][-1 if action == "import" else 0]
        assert saved["cost"] == entry["cost"]
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("context,output", [(1, 1), (2**63, 2**63), (8192, 1024), (None, None), (None, 1024), (8192, None)])
def test_exact_integer_and_confirmed_null_limits_persist(tmp_path: Path, action: str, context: Any, output: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        for field, value in [("context_window", context), ("max_output_tokens", output)]:
            entry[field] = value
            entry["metadata"]["fields"][field]["value"] = value
        projected = persist(app, config, entry, action)
        assert projected["context_window"] == context and projected["max_output_tokens"] == output
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("field", ["context_window", "max_output_tokens"])
@pytest.mark.parametrize("value", [0, -1, 1.0, 1.5, True, "8192", {}, []])
def test_invalid_limit_types_preserve_state(tmp_path: Path, action: str, field: str, value: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry[field] = value
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
def test_output_cannot_exceed_known_context(tmp_path: Path, action: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry.update(context_window=1, max_output_tokens=2)
        entry.pop("metadata")
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("field", BOOLS)
@pytest.mark.parametrize("value", [None, 0, 1, "false", [], {}])
def test_capabilities_are_explicit_bools(tmp_path: Path, action: str, field: str, value: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["capabilities"][field] = value
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("value", [None, {}, True, ["moderate"], [1], [None], "low"])
def test_invalid_effort_declarations_reject(tmp_path: Path, action: str, value: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["capabilities"]["reasoning_effort"] = value
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("efforts,canonical", [
    ([], []), (["none"], ["none"]), (["high", "low"] * 17, ["low", "high"]),
    (["max", "xhigh", "high", "medium", "low", "minimal", "none"], ["none", "minimal", "low", "medium", "high", "xhigh", "max"]),
])
def test_false_reasoning_and_canonical_confirmed_effort_persist(tmp_path: Path, action: str, efforts: list[str], canonical: list[str]) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["capabilities"]["reasoning"] = False
        entry["capabilities"]["reasoning_effort"] = efforts
        entry["metadata"]["fields"]["reasoning_effort"]["value"] = list(reversed(efforts))
        projected = persist(app, config, entry, action)
        assert projected["capabilities"]["reasoning"] is False
        assert projected["capabilities"]["reasoning_effort"] == canonical
        assert projected["metadata"]["fields"]["reasoning_effort"]["value"] == canonical
        assert entry["capabilities"]["reasoning_effort"] == efforts
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("field", FIELDS[:2] + FIELDS[4:] + ["cost", "capabilities"])
def test_known_suggestion_cannot_fill_missing_complete_record(tmp_path: Path, action: str, field: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        location(entry, field).pop(field)
        for evidence in entry["metadata"]["fields"].values():
            evidence["status"] = "known"
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("flag", ["missing", False, None, 0, 1, "true", {}, []])
def test_import_confirmation_is_explicit_true(tmp_path: Path, flag: Any) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        payload = body(app, config, record(), "import")
        if flag == "missing":
            payload["operations"][0].pop("confirmed")
        else:
            payload["operations"][0]["confirmed"] = flag
        reject(app, config, payload)
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("field", FIELDS)
def test_each_confirmed_field_must_agree_with_runtime(tmp_path: Path, action: str, field: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        actual = location(entry, field)[field]
        location(entry, field)[field] = not actual if field in BOOLS else ["none"] if field == "reasoning_effort" else 0 if actual is None else actual + 1
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
def test_manual_overrides_preserve_independent_source_evidence(tmp_path: Path, action: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        source = {"id": "raw", "source": "fixture", "fields": {
            field: {"value": None, "source_field": field} for field in FIELDS
        }}
        source["fields"]["output_per_million"]["value"] = 99
        entry["metadata"]["sources"] = [source]
        for evidence in entry["metadata"]["fields"].values():
            evidence["source_ids"] = ["raw"]
        projected = persist(app, config, entry, action)
        assert projected["metadata"] == entry["metadata"]
        assert projected["cost"]["output_per_million"] == 2 and projected["metadata"]["sources"][0]["fields"]["output_per_million"]["value"] == 99
    finally:
        config.engine.close()


def exact_utf8_metadata(size: int) -> dict[str, Any]:
    metadata = {"version": 1, "sources": [{"id": f"s{i}", "fields": {field: {"value": None, "source_field": "", "unit": "", "source_unit": ""} for field in FIELDS}} for i in range(32)]}
    remaining = size - len(json.dumps(metadata, ensure_ascii=False).encode())
    for source in metadata["sources"]:
        for evidence in source["fields"].values():
            for key in ["source_field", "unit", "source_unit"]:
                amount = min(1024, remaining)
                evidence[key] = "é" * (amount // 2) + "a" * (amount % 2)
                remaining -= amount
    assert remaining == 0 and len(json.dumps(metadata, ensure_ascii=False).encode()) == size
    return metadata


def metadata_boundary(kind: str, beyond: bool) -> dict[str, Any]:
    source: dict[str, Any] = {"id": "s"}
    metadata: dict[str, Any] = {"version": 1, "sources": [source]}
    extra = int(beyond)
    price = {"value": 0, "unit": "USD/M tokens"}
    if kind == "utf8":
        return exact_utf8_metadata(262144 + extra)
    if kind in {"sources", "references"}:
        metadata["sources"] = [{"id": f"s{i}"} for i in range(32 + (extra if kind == "sources" else 0))]
        if kind == "references":
            metadata["fields"] = {"tools": {"status": "known", "value": None, "source_ids": [f"s{i}" for i in range(32)] + (["s0"] if beyond else [])}}
    elif kind in {"text", "evidence_text"}:
        if kind == "text":
            source["source"] = "é" * (512 + extra)
        else:
            source["fields"] = {"tools": {"value": None, "source_field": "é" * (512 + extra)}}
    elif kind == "confirmation":
        metadata["confirmation"] = {"method": "a" * (160 + extra)}
    elif kind in {"raw_effort", "field_effort"}:
        value = ["vendor"] * (16 + extra)
        if kind == "raw_effort":
            source["source_reasoning_effort"] = value
        else:
            source["fields"] = {"reasoning_effort": {"value": value, "source_field": "effort"}}
    elif kind == "effort_text":
        source["source_reasoning_effort"] = ["a" * (64 + extra)]
    elif kind == "pricing_keys":
        source["pricing"] = {f"input_cost_per_token_above_{i}k_tokens": price for i in range(256 + extra)}
    elif kind == "pricing_key_text":
        prefix, suffix = "input_cost_per_token_above_", "k_tokens"
        source["pricing"] = {prefix + "1" * (160 + extra - len(prefix) - len(suffix)) + suffix: price}
    elif kind in {"tiers", "overrides"}:
        source["pricing"] = {kind: [{"input": price, "condition": {"type": "context", "size": 0}} for _ in range(32 + extra)]}
    elif kind == "depth":
        source["pricing"] = {"tiers": [{"tiers": [{"input": price}]} if beyond else {"input": price}]}
    elif kind == "legacy_depth":
        source["pricing"] = {"context_over_200k": {"context_over_200k": {"input": price}} if beyond else {"input": price}}
    elif kind == "time":
        source["pricing"] = {"tiers": [{"time": "1" * (64 + extra)}]}
    elif kind == "days":
        source["pricing"] = {"tiers": [{"utc_days": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] + (["monday"] if beyond else [])}]}
    elif kind == "condition_fields":
        source["pricing"] = {"tiers": [{"condition_fields": ["context", "context_length", "time", "start_time", "end_time"] + (["time"] if beyond else [])}]}
    return metadata


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("kind", ["utf8", "sources", "references", "text", "evidence_text", "confirmation", "raw_effort", "field_effort", "effort_text", "pricing_keys", "pricing_key_text", "tiers", "overrides", "depth", "legacy_depth", "time", "days", "condition_fields"])
def test_provenance_exact_bound_and_one_beyond(tmp_path: Path, action: str, kind: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["metadata"] = metadata_boundary(kind, False)
        projected = persist(app, config, entry, action)
        assert projected["metadata"] == entry["metadata"]
        entry["metadata"] = metadata_boundary(kind, True)
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("metadata", [
    {"version": True}, {"version": 0}, {"version": 2}, {"version": 1.0}, {"version": "1"},
    {"version": 1, "sources": [{"id": ""}]},
    {"version": 1, "sources": [{"id": "s"}, {"id": "s"}]},
    {"version": 1, "fields": {"tools": {"status": "known", "value": None, "source_ids": ["absent"]}}},
    {"version": 1, "sources": [{"id": "s", "source": "synthetic-private\u007f"}]},
    {"version": 1, "sources": [{"id": "s", "fields": {"tools": {"value": "synthetic-private", "source_field": "tools"}}}]},
    {"version": 1, "fields": {"quality": {"status": "known", "value": 1}}},
    {"version": 1, "fields": {"priority": {"status": "known", "value": 1}}},
    {"version": 1, "fields": {"tags": {"status": "known", "value": ["synthetic-private"]}}},
    {"version": 1, "sources": [{"id": "s", "raw_body": "synthetic-private"}]},
])
def test_invalid_provenance_shapes_preserve_state(tmp_path: Path, metadata: dict[str, Any]) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["metadata"] = metadata
        reject(app, config, body(app, config, entry, "update"))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("control", ["\u0000", "\n", "\u007f"])
@pytest.mark.parametrize("place", ["source", "id", "evidence", "effort", "field_method", "confirmation", "pricing_time"])
def test_nested_provenance_controls_reject_at_api(
    tmp_path: Path, action: str, control: str, place: str,
) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        source: dict[str, Any] = {"id": "s"}
        metadata: dict[str, Any] = {"version": 1, "sources": [source]}
        text = "synthetic-private" + control
        if place in {"source", "id"}:
            source[place] = text
        elif place == "evidence":
            source["fields"] = {"tools": {"value": None, "source_field": text}}
        elif place == "effort":
            source["source_reasoning_effort"] = [text]
        elif place == "field_method":
            metadata["fields"] = {"tools": {"status": "known", "value": None, "method": text}}
        elif place == "confirmation":
            metadata["confirmation"] = {"method": text}
        else:
            source["pricing"] = {"tiers": [{"time": "1" + control}]}
        entry["metadata"] = metadata
        reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity", "1e400"])
def test_raw_nonfinite_provenance_rejects_without_echo(tmp_path: Path, action: str, literal: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["metadata"] = {"version": 1, "sources": [{"id": "s", "fields": {
            "input_per_million": {"value": "synthetic-private-token", "source_field": "price"},
        }}]}
        payload = body(app, config, entry, action)
        raw = json.dumps(payload).replace('"synthetic-private-token"', literal)
        reject(app, config, payload, raw)
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["import", "update"])
@pytest.mark.parametrize("field", FIELDS)
def test_confirmed_null_requires_a_nullable_runtime_value(tmp_path: Path, action: str, field: str) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        entry = record()
        entry["metadata"]["fields"][field]["value"] = None
        if field in {"cache_read_per_million", "cache_write_per_million", "context_window", "max_output_tokens"}:
            location(entry, field)[field] = None
            projected = persist(app, config, entry, action)
            assert projected["metadata"]["fields"][field]["value"] is None
        else:
            reject(app, config, body(app, config, entry, action))
    finally:
        config.engine.close()
