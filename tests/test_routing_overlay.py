"""Tests for the runtime routing overlay and its strict patch surface."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from jev_gateway.catalog import catalog_from_document, load_catalog
from jev_gateway.routing_overlay import (
    load_catalog_with_overlay,
    merge_overlay,
    merge_warnings,
    overlay_path,
    read_overlay,
    remove_overlay,
    validate_overlay_shape,
    write_overlay,
)
from tests.helpers import SMALL_MODEL_ID, catalog_document


def matrix_document() -> dict[str, Any]:
    document = catalog_document()
    document["strategies"]["task_aware"] = {
        "kind": "decision_matrix",
        "options": {
            "questions": {
                "scale": {"type": "choice", "instructions": "Choose scale.",
                          "criteria": {"small": "Small.", "large": "Large."}}
            },
            "rules": [
                {"when": {"scale": "small"}, "select": {"label": "simple"}},
                {"when": {"scale": "large"}, "select": {"label": "complex"}},
            ],
            "fallback": {"label": "standard"},
        },
    }
    return document


def test_rules_replacement_preserves_questions_and_fallback() -> None:
    baseline = matrix_document()
    original = copy.deepcopy(baseline)
    rules = list(reversed(baseline["strategies"]["task_aware"]["options"]["rules"]))
    merged = merge_overlay(baseline, {"version": 1, "strategy": "task_aware", "rules": rules})
    assert merged["strategies"]["task_aware"]["options"] == {
        **original["strategies"]["task_aware"]["options"], "rules": rules
    }
    assert baseline == original
    assert catalog_from_document(merged, "test catalog")


def test_optional_questions_and_fallback_override_and_rules_can_be_omitted() -> None:
    baseline = matrix_document()
    overlay = {
        "version": 1,
        "strategy": "task_aware",
        "questions": {"scale": {"type": "choice", "instructions": "Pick scale.", "criteria": {"small": "Small.", "large": "Large."}}},
        "fallback": {"label": "simple"},
    }
    merged = merge_overlay(baseline, overlay)
    options = merged["strategies"]["task_aware"]["options"]
    assert options["questions"]["scale"]["instructions"] == "Pick scale."
    assert options["fallback"] == {"label": "simple"}
    assert options["rules"] == baseline["strategies"]["task_aware"]["options"]["rules"]
    assert catalog_from_document(merged, "test catalog")


def test_empty_rules_explicitly_disables_conditional_rules() -> None:
    merged = merge_overlay(matrix_document(), {"version": 1, "strategy": "task_aware", "rules": []})
    assert merged["strategies"]["task_aware"]["options"]["rules"] == []
    assert catalog_from_document(merged, "test catalog")


@pytest.mark.parametrize("choice", [{}, {"selection": "quality_first"}, {"tier": "simple"}, {"tier": "simple", "selection": "balanced"}])
@pytest.mark.parametrize("field", ["rules", "fallback"])
def test_overlay_preserves_legal_implicit_and_legacy_choices(field: str, choice: dict[str, str]) -> None:
    baseline = matrix_document()
    original = copy.deepcopy(baseline)
    changes = [{"when": {"scale": "small"}, "select": choice}] if field == "rules" else choice
    payload = {"version": 1, "strategy": "task_aware", field: changes}
    assert validate_overlay_shape(payload) == payload
    merged = merge_overlay(baseline, payload)
    assert merged["strategies"]["task_aware"]["options"][field] == changes
    assert catalog_from_document(merged, "test catalog")
    assert baseline == original
    assert payload[field] == changes


@pytest.mark.parametrize("field", ["rules", "fallback"])
@pytest.mark.parametrize("choice,message", [
    ({"label": "simple", "tier": "simple"}, "both label and tier"),
    ({"tier": "simple", "unknown": "simple"}, "unknown key"),
])
def test_overlay_choice_alias_support_keeps_strict_shape(field: str, choice: dict[str, str], message: str) -> None:
    changes = [{"when": {"scale": "small"}, "select": choice}] if field == "rules" else choice
    with pytest.raises(ValueError, match=message):
        validate_overlay_shape({"version": 1, "strategy": "task_aware", field: changes})


def test_priority_overlay_keeps_implicit_rules_empty_fallback_and_legacy_alias_on_reload(tmp_path: Path) -> None:
    baseline = matrix_document()
    rules = [
        {"when": {"scale": "small"}, "select": {"selection": "quality_first"}},
        {"when": {"scale": "large"}, "select": {"tier": "complex"}},
    ]
    baseline["strategies"]["task_aware"]["options"].update(rules=rules, fallback={})
    models_file = tmp_path / "models.json"
    models_file.write_text(json.dumps(baseline), encoding="utf-8")
    original_bytes = models_file.read_bytes()
    payload = {"version": 1, "strategy": "task_aware", "rules": rules, "fallback": {}, "models": {SMALL_MODEL_ID: {"priority": 7}}}
    write_overlay(models_file, payload)
    assert json.loads(overlay_path(models_file).read_text()) == payload
    catalog = load_catalog_with_overlay(models_file)
    profile = catalog.by_name(SMALL_MODEL_ID)
    assert profile is not None and profile.priority == 7
    assert models_file.read_bytes() == original_bytes
    assert read_overlay(models_file) == (payload, None)


def test_tags_and_priority_override_only_target_model() -> None:
    baseline = matrix_document()
    merged = merge_overlay(baseline, {
        "version": 1, "strategy": "task_aware",
        "models": {SMALL_MODEL_ID: {"tags": ["task_aware/simple", "quality/routine"], "priority": 41}},
    })
    assert merged["models"][0]["tags"] == ["task_aware/simple", "quality/routine"]
    assert merged["models"][0]["priority"] == 41
    assert merged["models"][1] == baseline["models"][1]
    assert "tags" not in baseline["models"][0]


@pytest.mark.parametrize("payload, message", [
    ({"version": 1, "strategy": "missing", "rules": []}, "Unknown overlay strategy"),
    ({"version": 1, "strategy": "task_aware", "models": {"missing/model": {"priority": 1}}}, "Unknown overlay catalog id"),
    ({"version": 1, "strategy": "task_aware", "rules": [], "storage": {}}, "storage"),
    ({"version": 1, "strategy": "task_aware", "models": {SMALL_MODEL_ID: {"api_key": "secret"}}}, "api_key"),
    ({"version": 1, "strategy": "task_aware", "rules": [{"when": {"scale": "small"}, "select": {"label": "simple"}, "secret": "x"}]}, "secret"),
    ({"strategy": "task_aware", "rules": []}, "version"),
    ({"version": 1, "strategy": "task_aware"}, "questions, rules, fallback, or models"),
    ({"version": 1, "strategy": "task_aware", "fallback": {"unknown": "missing"}}, "fallback"),
])
def test_overlay_rejects_invalid_or_partial_payloads(payload: dict[str, Any], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        merge_overlay(matrix_document(), payload)


def test_read_overlay_missing_and_malformed_are_nonfatal(tmp_path: Path) -> None:
    models_file = tmp_path / "models.json"
    assert read_overlay(models_file) == ({}, None)
    overlay_path(models_file).write_text("{not JSON", encoding="utf-8")
    value, error = read_overlay(models_file)
    assert value == {} and error is not None and "routing overlay" in error
    models_file.write_text(json.dumps(matrix_document()), encoding="utf-8")
    assert load_catalog_with_overlay(models_file).as_dict() == load_catalog(models_file).as_dict()


def test_new_overlay_fields_from_newer_binary_warn_on_old_binary(tmp_path: Path) -> None:
    models_file = tmp_path / "models.json"
    baseline = matrix_document()
    models_file.write_text(json.dumps(baseline), encoding="utf-8")
    overlay_path(models_file).write_text(json.dumps({"version": 1, "strategy": "task_aware", "questions": baseline["strategies"]["task_aware"]["options"]["questions"], "rules": [], "future_field": True}), encoding="utf-8")
    overlay, warning = read_overlay(models_file)
    assert overlay == {}
    assert warning is not None and "newer gateway version" in warning
    assert load_catalog_with_overlay(models_file).as_dict() == load_catalog(models_file).as_dict()


def test_empty_overlay_produces_identical_catalog(tmp_path: Path) -> None:
    models_file = tmp_path / "models.json"
    models_file.write_text(json.dumps(matrix_document()), encoding="utf-8")
    write_overlay(models_file, {})
    assert load_catalog_with_overlay(models_file).as_dict() == load_catalog(models_file).as_dict()


def test_explicit_models_label_warns_when_its_tag_changes() -> None:
    baseline = matrix_document()
    baseline["models"][0]["tags"] = ["task_aware/simple", "quality/routine"]
    overlay = {
        "version": 1, "strategy": "task_aware",
        "models": {SMALL_MODEL_ID: {"tags": ["task_aware/unknown", "quality/routine"]}},
    }
    merged = merge_overlay(baseline, overlay)
    catalog = catalog_from_document(merged, "test catalog")
    warnings = merge_warnings(baseline, overlay, catalog)
    assert {warning["code"] for warning in warnings} == {
        "label_resolves_by_models", "unknown_label_tag"
    }
    assert next(w for w in warnings if w["code"] == "label_resolves_by_models")["label"] == "simple"


def test_atomic_write_and_remove_leave_no_temp_file(tmp_path: Path) -> None:
    models_file = tmp_path / "models.json"
    payload = {"version": 1, "strategy": "task_aware", "rules": []}
    write_overlay(models_file, payload)
    assert json.loads(overlay_path(models_file).read_text(encoding="utf-8")) == payload
    assert overlay_path(models_file).read_bytes().endswith(b"\n")
    assert list(tmp_path.iterdir()) == [overlay_path(models_file)]
    assert remove_overlay(models_file)
    assert not remove_overlay(models_file)
    assert validate_overlay_shape(payload) == payload
