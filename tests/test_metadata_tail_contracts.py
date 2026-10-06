"""Stored quality compatibility and bounded reference-only metadata contracts."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import model_metadata as metadata
from jev_gateway.catalog import catalog_from_document, model_metadata
from jev_gateway.provider_config import metadata_envelope, revision
from tests.helpers import single_route_document
from tests.test_provider_config import import_body, model, service, upsert
from tests.test_provider_config_regressions import fixture_app
from tests.test_provider_management_api import headers, request


@pytest.mark.parametrize("quality", [-2.5, 2.5])
@pytest.mark.parametrize("submitted", ["omitted", "unchanged", "changed"])
def test_legacy_quality_survives_unrelated_edits(tmp_path: Path, quality: float, submitted: str) -> None:
    current = service(tmp_path)
    document = json.loads(current.models_file.read_text())
    document["models"][0]["quality"] = quality
    current.models_file.write_text(json.dumps(document))
    assert current.read()["models"][0]["quality"] == quality
    current.command(upsert(current, display_name="Supplier"), apply=True)
    entry = {**model("vendor/only"), "display_name": "Renamed"}
    if submitted != "omitted":
        entry["quality"] = quality if submitted == "unchanged" else 0.75
    operations = [
        {"action": "set_default_model", "model": "test-provider/vendor/only"},
        {"action": "update_model", "model_id": "test-provider/vendor/only", "model": entry},
    ]
    body = {"expected_revision": revision(current.models_file), "operations": operations}
    before = current.models_file.read_bytes()
    preview = current.command(body)
    assert current.models_file.read_bytes() == before
    saved = current.command(body, apply=True)
    expected = 0.75 if submitted == "changed" else quality
    assert preview["models"][0]["quality"] == saved["models"][0]["quality"] == expected
    assert current.read()["models"][0]["quality"] == expected


@pytest.mark.parametrize("quality", [True, False, float("inf"), float("nan"), "2.5", None, 3.5, -3.5])
@pytest.mark.parametrize("action", ["import", "update", "batch"])
def test_write_quality_exception_cannot_be_forged(tmp_path: Path, quality: Any, action: str) -> None:
    current = service(tmp_path)
    document = json.loads(current.models_file.read_text())
    document["models"][0]["quality"] = 2.5
    current.models_file.write_text(json.dumps(document))
    entry = {**model("vendor/new" if action == "import" else "vendor/only"), "quality": quality}
    if action == "import":
        body = import_body(current, [entry])
    else:
        operation = {"action": "update_model", "model_id": "test-provider/vendor/only", "model": entry}
        operations = [operation]
        if action == "batch":
            operations.insert(0, {**operation, "model": {**model("vendor/only"), "quality": 0.5}})
        body = {"expected_revision": revision(current.models_file), "operations": operations}
    before = current.models_file.read_bytes()
    with pytest.raises(ValueError, match="quality"):
        current.command(body, apply=True)
    assert current.models_file.read_bytes() == before
    assert not current.models_file.with_suffix(".json.bak").exists()


def test_legacy_quality_marker_is_an_unknown_field(tmp_path: Path) -> None:
    current = service(tmp_path)
    entry = {**model(), "quality": 2.5, "legacy_quality": True}
    with pytest.raises(ValueError):
        current.command(import_body(current, [entry]), apply=True)


def test_http_legacy_quality_edit_reload_and_changed_value_rejection(tmp_path: Path) -> None:
    app, config = fixture_app(tmp_path)
    document = json.loads(config.models_file.read_text())
    document["models"][0]["quality"] = 2.5
    config.models_file.write_text(json.dumps(document))
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    entry = {**model("vendor/only"), "display_name": "Edited legacy", "quality": 2.5}
    body = {"expected_revision": revision(config.models_file), "operations": [{"action": "update_model", "model_id": "test-provider/vendor/only", "model": entry}]}
    before = config.models_file.read_bytes()
    response = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=body)
    assert response.status_code == 200 and config.models_file.read_bytes() == before
    response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
    assert response.status_code == 200 and response.json()["models"][0]["quality"] == 2.5
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    assert config.engine.catalog.profiles[0].quality == 2.5
    entry["quality"] = 3.5
    body["expected_revision"] = revision(config.models_file)
    before = config.models_file.read_bytes()
    response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
    assert response.status_code == 400 and config.models_file.read_bytes() == before
    assert config.engine.catalog.profiles[0].quality == 2.5


@pytest.mark.parametrize("quality", [True, False, "0.5", None, float("nan"), float("inf")])
def test_loading_quality_stays_strict(quality: Any) -> None:
    with pytest.raises(ValueError, match="quality"):
        catalog_from_document(single_route_document(quality=quality), "fixture")


@pytest.mark.parametrize("control", ["\r", "\n", "\0", "\x7f"])
@pytest.mark.parametrize("location", ["field", "confirmation"])
@pytest.mark.parametrize("key", ["method", "confirmed_at"])
def test_confirmation_controls_rejected(control: str, location: str, key: str) -> None:
    envelope: dict[str, Any] = {"version": 1}
    if location == "field":
        envelope["fields"] = {"tools": {"status": "confirmed", "value": True, key: "synthetic" + control}}
    else:
        envelope["confirmation"] = {key: "synthetic" + control}
    with pytest.raises(ValueError, match="confirmation"):
        model_metadata(envelope)


@pytest.mark.parametrize("declaration,expected", [
    ({"supported": False}, []),
    ({"supported": True}, None),
    ({"supported": True, "low": {"supported": False}}, None),
    ({"supported": True, "low": {"supported": True}}, ["low"]),
    ({"supported": True, **{name: {"supported": False} for name in ("low", "medium", "high", "xhigh", "max")}}, []),
    ({"supported": True, **{name: {"supported": True} for name in ("low", "medium", "high", "xhigh", "max")}}, ["low", "medium", "high", "xhigh", "max"]),
])
def test_native_effort_declaration_states(declaration: dict[str, Any], expected: Any) -> None:
    result = metadata.native_model_metadata({"id": "m", "capabilities": {"effort": declaration}}, "anthropic", "p", "fixed")
    assert result["fields"]["reasoning_effort"] == expected
    envelope = metadata_envelope(result)
    assert envelope["fields"]["reasoning_effort"]["status"] == ("unknown" if expected is None else "known")


@pytest.mark.parametrize("channel,transport,base,expected", [
    ("openai", "openai", "https://api.openai.com/v1", True),
    ("openai", "anthropic", "https://api.openai.com/v1", False),
    ("anthropic", "anthropic", None, True),
    ("deepseek", "deepseek", None, True),
    ("openrouter", "openrouter", None, True),
    ("deepseek", "openai", "https://api.deepseek.com/v1", True),
    ("openrouter", "openai", "https://openrouter.ai/api/v1", True),
    ("anthropic", "openai", "https://api.anthropic.com/v1", False),
    ("openai", "vertex_ai", "https://api.openai.com/v1", False),
    ("deepseek", "openai", "https://api.openai.com/v1", False),
    ("openai", "openai", "https://api.openai.com:443/v1/", True),
    ("openai", "openai", "https://api.openai.com:8443/v1", False),
    ("openai", "openai", "https://api.openai.com:/v1", False),
    ("openai", "openai", "https://api.openai.com:0/v1", False),
    ("openai", "openai", "https://api.openai.com/\nv1", False),
    ("openai", "openai", "https://api.openai.com/prefix/v1", False),
    ("openai", "openai", "http://api.openai.com/v1", False),
])
def test_explicit_transport_channel_relationship(channel: str, transport: str, base: str | None, expected: bool) -> None:
    assert metadata._serving_matches({"type": transport, "brand_id": channel, "api_base": base}, channel) is expected


@pytest.mark.parametrize("modalities", [["text", "image", "audio", "video", "pdf"], ["text"], []])
def test_modality_reference_roundtrip_is_detached(tmp_path: Path, modalities: list[str]) -> None:
    source = metadata._models_dev({"modalities": {"input": modalities}}, "models_dev", "openai", "exact", "fixed", False)
    candidate = metadata._merge_candidates([source], [])
    assert not {"audio", "video", "pdf", "input_modalities"} & candidate["fields"].keys()
    assert candidate["fields"]["vision"] is None
    envelope = metadata_envelope(candidate)
    expected = {"value": list(modalities), "source_field": "modalities.input"}
    assert envelope["sources"][0]["input_modalities"] == expected
    current = service(tmp_path)
    entry = {**model(), "metadata": envelope}
    current.command(import_body(current, [entry]), apply=True)
    assert current.read()["models"][-1]["metadata"]["sources"][0]["input_modalities"] == expected
    modalities.append("invalid")
    assert current.read()["models"][-1]["metadata"]["sources"][0]["input_modalities"] == expected


@pytest.mark.parametrize("bad", [["text"] * 6, ["image", "image"], ["unknown"], [True], "audio", None])
def test_invalid_modality_source_not_projected_or_persisted(bad: Any) -> None:
    source = metadata._models_dev({"modalities": {"input": bad}}, "models_dev", "openai", "exact", "fixed", True)
    assert "input_modalities" not in source and "vision" not in source["fields"]
    envelope = {"version": 1, "sources": [{"id": "s", "input_modalities": {"value": bad, "source_field": "modalities.input"}}]}
    with pytest.raises(ValueError, match="input modalities"):
        model_metadata(envelope)


def test_effort_raw_bound_and_runtime_canonical_duplicates(tmp_path: Path) -> None:
    envelope = {"version": 1, "sources": [{"id": "s", "source_reasoning_effort": ["low"] * 16}]}
    assert model_metadata(envelope) == envelope
    oversized = copy.deepcopy(envelope)
    oversized["sources"][0]["source_reasoning_effort"].append("low")
    with pytest.raises(ValueError, match="original effort"):
        model_metadata(oversized)
    current = service(tmp_path)
    entry = model()
    entry["capabilities"]["reasoning_effort"] = ["high", "low"] * 17
    entry["metadata"] = {"version": 1, "fields": {"reasoning_effort": {"status": "known", "value": ["low"] * 17}}}
    saved = current.command(import_body(current, [entry]), apply=True)
    assert saved["models"][-1]["capabilities"]["reasoning_effort"] == ["low", "high"]
    expected = copy.deepcopy(entry["metadata"])
    expected["fields"]["reasoning_effort"]["value"] = ["low"]
    assert saved["models"][-1]["metadata"] == expected
    assert current.read()["models"][-1]["metadata"] == expected
    assert entry["metadata"]["fields"]["reasoning_effort"]["value"] == ["low"] * 17
