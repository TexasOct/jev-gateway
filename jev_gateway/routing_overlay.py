"""Strict runtime routing overrides kept separate from the baseline catalog."""

from __future__ import annotations

import copy
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from jev_gateway.catalog import Catalog, catalog_from_document


def overlay_path(models_file: Path) -> Path:
    return models_file.parent / "routing-overrides.json"


def read_models_document(models_file: Path) -> dict[str, Any]:
    """Read the baseline with the same errors as catalog.load_catalog()."""
    try:
        document = json.loads(models_file.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"Could not read the models file {models_file}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Invalid JSON in the models file {models_file}: {exc.msg}"
        ) from exc
    if not isinstance(document, dict):
        raise TypeError(f"{models_file} must contain a JSON object.")
    return document


def _unknown_keys(value: dict[str, Any], allowed: set[str], field: str) -> None:
    for key in value:
        if key not in allowed:
            raise ValueError(f"{field} has unknown key {key!r}.")


def validate_overlay_shape(value: Any) -> dict[str, Any]:
    """Reject unrecognized or partial write payloads before they reach disk."""
    if not isinstance(value, dict):
        raise ValueError("Overlay must be an object.")
    _unknown_keys(value, {"version", "strategy", "rules", "models"}, "Overlay")
    if not value:
        return {}
    if type(value.get("version")) is not int or value["version"] != 1:
        raise ValueError("Overlay version must be 1.")
    if not isinstance(value.get("strategy"), str) or not value["strategy"].strip():
        raise ValueError("Overlay strategy must be a non-empty string.")
    if "rules" not in value and "models" not in value:
        raise ValueError("Overlay requires rules or models.")
    rules = value.get("rules")
    if "rules" in value:
        if not isinstance(rules, list):
            raise ValueError("Overlay rules must be a list.")
        for index, rule in enumerate(rules):
            field = f"Overlay rules[{index}]"
            if not isinstance(rule, dict):
                raise ValueError(f"{field} must be an object.")
            _unknown_keys(rule, {"when", "select"}, field)
            if not isinstance(rule.get("when"), dict) or not rule["when"]:
                raise ValueError(f"{field}.when must be a non-empty object.")
            for question, criterion in rule["when"].items():
                if not isinstance(question, str) or not question.strip():
                    raise ValueError(f"{field}.when needs non-empty question names.")
                if isinstance(criterion, str) and criterion.strip():
                    continue
                if isinstance(criterion, list) and criterion and all(
                    isinstance(item, str) and item.strip() for item in criterion
                ):
                    continue
                raise ValueError(f"{field}.when[{question!r}] must name criteria.")
            select = rule.get("select")
            if not isinstance(select, dict):
                raise ValueError(f"{field}.select must be an object.")
            _unknown_keys(select, {"label", "selection"}, f"{field}.select")
            if not select or any(
                not isinstance(item, str) or not item.strip()
                for item in select.values()
            ):
                raise ValueError(f"{field}.select must contain non-empty choices.")
    models = value.get("models")
    if "models" in value:
        if not isinstance(models, dict):
            raise ValueError("Overlay models must be an object.")
        for model_id, changes in models.items():
            if not isinstance(model_id, str) or not model_id.strip():
                raise ValueError("Overlay models must have non-empty catalog ids.")
            field = f"Overlay models[{model_id!r}]"
            if not isinstance(changes, dict):
                raise ValueError(f"{field} must be an object.")
            _unknown_keys(changes, {"tags", "priority"}, field)
            if not changes:
                raise ValueError(f"{field} requires tags or priority.")
            if "tags" in changes and (
                not isinstance(changes["tags"], list)
                or any(
                    not isinstance(tag, str) or not tag.strip()
                    for tag in changes["tags"]
                )
            ):
                raise ValueError(f"{field}.tags must be a list of non-empty strings.")
            if "priority" in changes and type(changes["priority"]) is not int:
                raise ValueError(f"{field}.priority must be an integer.")
    return copy.deepcopy(value)


def read_overlay(models_file: Path) -> tuple[dict[str, Any], str | None]:
    path = overlay_path(models_file)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return validate_overlay_shape(value), None
    except FileNotFoundError:
        return {}, None
    except (OSError, UnicodeError, ValueError, TypeError):
        return {}, "Could not load routing overlay."


def _strategy_body(document: dict[str, Any], name: str) -> dict[str, Any]:
    strategies = document.get("strategies")
    if not isinstance(strategies, dict):
        raise ValueError(f"Unknown overlay strategy {name!r}.")
    definitions = strategies.get("definitions", strategies)
    body = definitions.get(name) if isinstance(definitions, dict) else None
    if not isinstance(body, dict):
        raise ValueError(f"Unknown overlay strategy {name!r}.")
    return body


def merge_overlay(document: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Apply only rule, tag, and priority overrides to a detached document."""
    changes = validate_overlay_shape(overlay)
    merged = copy.deepcopy(document)
    if not changes:
        return merged
    strategy = changes["strategy"]
    body = _strategy_body(merged, strategy)
    if "rules" in changes:
        options = body.get("options")
        if not isinstance(options, dict):
            raise ValueError(f"Overlay strategy {strategy!r} has no options.")
        options["rules"] = changes["rules"]
    if "models" in changes:
        entries = merged.get("models")
        if not isinstance(entries, list):
            raise ValueError("Catalog models must be an array.")
        by_id = {
            f"{entry.get('provider')}/{entry.get('upstream_model')}": entry
            for entry in entries if isinstance(entry, dict)
        }
        for model_id, fields in changes["models"].items():
            if model_id not in by_id:
                raise ValueError(f"Unknown overlay catalog id {model_id!r}.")
            by_id[model_id].update(fields)
    return merged


def merge_warnings(
    document: dict[str, Any], overlay: dict[str, Any], catalog: Catalog
) -> list[dict[str, str]]:
    """Report tag edits that do not bind a model to a strategy label."""
    if not overlay or "models" not in overlay:
        return []
    name = overlay["strategy"]
    definition = next((item for item in catalog.strategies if item.name == name), None)
    if definition is None:
        return []
    baseline = {
        f"{item['provider']}/{item['upstream_model']}": item
        for item in document["models"]
    }
    warnings: list[dict[str, str]] = []
    changed_tags: set[str] = set()
    unknown_added_tags: set[str] = set()
    for model_id, changes in overlay["models"].items():
        if "tags" in changes:
            before = set(baseline[model_id].get("tags", []))
            after = set(changes["tags"])
            changed_tags.update(tag for tag in before ^ after if tag.startswith(f"{name}/"))
            unknown_added_tags.update(
                tag for tag in after - before if tag.startswith(f"{name}/")
            )
    for label, route in definition.policy.labels.items():
        tag = route.tag or f"{name}/{label}"
        if route.models and tag in changed_tags:
            warnings.append({
                "code": "label_resolves_by_models",
                "label": label,
                "message": f"Label {label!r} uses an explicit models list and ignores tag edits.",
            })
    for tag in sorted(unknown_added_tags):
        prefix = f"{name}/"
        if tag.startswith(prefix) and tag[len(prefix):] not in definition.policy.labels:
            warnings.append({
                "code": "unknown_label_tag",
                "label": tag[len(prefix):],
                "message": f"Tag {tag!r} does not name a label in strategy {name!r}.",
            })
    return warnings


def write_overlay(models_file: Path, payload: dict[str, Any]) -> None:
    """Replace the overlay atomically; never leave a partial target file."""
    value = validate_overlay_shape(payload)
    path = overlay_path(models_file)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=f".{path.name}.", delete=False,
        ) as stream:
            temp_name = stream.name
            stream.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        os.replace(temp_name, path)
    finally:
        if temp_name is not None and os.path.exists(temp_name):
            os.unlink(temp_name)


def remove_overlay(models_file: Path) -> bool:
    try:
        overlay_path(models_file).unlink()
    except FileNotFoundError:
        return False
    return True


def load_catalog_with_overlay(models_file: Path) -> Catalog:
    document = read_models_document(models_file)
    overlay, _error = read_overlay(models_file)
    if not overlay:
        return catalog_from_document(document, str(models_file))
    try:
        return catalog_from_document(merge_overlay(document, overlay), str(models_file))
    except (ValueError, TypeError):
        # An obsolete overlay must not keep an otherwise valid baseline offline.
        return catalog_from_document(document, str(models_file))
