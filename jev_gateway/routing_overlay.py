"""Strict runtime routing overrides kept separate from the baseline catalog."""

from __future__ import annotations

import copy
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

from jev_gateway.catalog import Catalog, StrategyDefinition, RESERVED_STRATEGY_MODEL_NAMES, catalog_from_document, policy_from_dict, strategies_from_document


def validate_strategy_name(name: Any) -> str:
    if not isinstance(name, str) or not name.strip() or name.strip() != name or not re.fullmatch(r"[^\x00-\x1f\x7f/]{1,80}", name) or name in RESERVED_STRATEGY_MODEL_NAMES or name in {"default", "definitions", ".", ".."}:
        raise ValueError("Strategy name must be nonempty, bounded and not reserved.")
    return name


def _validate_v2(value: dict[str, Any]) -> dict[str, Any]:
    _unknown_keys(value, {"version", "strategies", "deleted_strategies", "models"}, "Overlay")
    if type(value.get("version")) is not int or value["version"] != 2 or set(value) != {"version", "strategies", "deleted_strategies", "models"}:
        raise ValueError("Version 2 requires strategies, deleted_strategies and models.")
    if not isinstance(value["strategies"], dict) or len(value["strategies"]) > 64:
        raise ValueError("Overlay strategies must be a bounded object.")
    for name, entry in value["strategies"].items():
        validate_strategy_name(name)
        if not isinstance(entry, dict) or set(entry) != {"definition", "selected_models"}:
            raise ValueError("Workflow requires definition and selected_models only.")
        selected = entry["selected_models"]
        if not isinstance(selected, list) or len(selected) > 1000 or any(not isinstance(item, str) or not item.strip() for item in selected) or len(set(selected)) != len(selected):
            raise ValueError("Workflow selected_models must contain unique model ids.")
        body = entry["definition"]
        if not isinstance(body, dict):
            raise ValueError("Workflow definition must be an object.")
        _unknown_keys(body, {"kind", "description", "policy", "options", "decision_provider"}, "Workflow definition")
        if "decision_provider" in body and (not isinstance(body["decision_provider"], str) or not body["decision_provider"].strip()):
            raise ValueError("Workflow decision_provider must be a non-empty provider id when supplied.")
        if body.get("kind") != "decision_matrix" or not isinstance(body.get("policy"), dict) or not isinstance(body.get("options"), dict):
            raise ValueError("Workflow definition requires decision_matrix, policy and options.")
        if "description" in body and body["description"] is not None and not isinstance(body["description"], str):
            raise ValueError("Workflow description must be text or null.")
        if not isinstance(body["policy"].get("labels"), dict) or not body["policy"]["labels"]:
            raise ValueError("Workflow policy requires explicit labels.")
        if "selected_models" in body["policy"]:
            raise ValueError("Workflow selection belongs to selected_models.")
        policy_from_dict({**body["policy"], "selected_models": selected}, "Workflow")
        validate_overlay_shape({"version": 1, "strategy": name, **body["options"]})
    deleted = value["deleted_strategies"]
    if not isinstance(deleted, list) or any(not isinstance(name, str) for name in deleted) or len(set(deleted)) != len(deleted):
        raise ValueError("deleted_strategies must be a unique list.")
    for name in deleted:
        validate_strategy_name(name)
        if name in value["strategies"]:
            raise ValueError("A strategy cannot be defined and deleted together.")
    validate_overlay_shape({"version": 1, "strategy": "task_aware", "models": value["models"]})
    return copy.deepcopy(value)


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
    if value.get("version") == 2:
        return _validate_v2(value)
    _unknown_keys(value, {"version", "strategy", "questions", "rules", "fallback", "models"}, "Overlay")
    if not value:
        return {}
    if type(value.get("version")) is not int or value["version"] != 1:
        raise ValueError("Overlay version must be 1.")
    if not isinstance(value.get("strategy"), str) or not value["strategy"].strip():
        raise ValueError("Overlay strategy must be a non-empty string.")
    if not any(key in value for key in ("questions", "rules", "fallback", "models")):
        raise ValueError("Overlay requires questions, rules, fallback, or models.")
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
            _unknown_keys(select, {"label", "tier", "selection"}, f"{field}.select")
            if "label" in select and "tier" in select:
                raise ValueError(f"{field}.select cannot contain both label and tier.")
            if any(
                not isinstance(item, str) or not item.strip()
                for item in select.values()
            ):
                raise ValueError(f"{field}.select must contain non-empty choices.")
    questions = value.get("questions")
    if "questions" in value and not isinstance(questions, dict):
        raise ValueError("Overlay questions must be an object.")
    if isinstance(questions, dict):
        for name, question in questions.items():
            field = f"Overlay questions[{name!r}]"
            if not isinstance(name, str) or not name.strip():
                raise ValueError("Overlay questions must have non-empty names.")
            if not isinstance(question, dict):
                raise ValueError(f"{field} must be an object.")
            _unknown_keys(question, {"type", "instructions", "criteria"}, field)
            if not isinstance(question.get("type"), str) or not question["type"].strip():
                raise ValueError(f"{field}.type must be a non-empty string.")
            if not isinstance(question.get("instructions"), str):
                raise ValueError(f"{field}.instructions must be a string.")
            criteria = question.get("criteria")
            if not isinstance(criteria, dict) or any(
                not isinstance(key, str) or not key.strip() or not isinstance(label, str)
                for key, label in criteria.items()
            ):
                raise ValueError(f"{field}.criteria must map non-empty names to strings.")
    fallback = value.get("fallback")
    if "fallback" in value:
        if not isinstance(fallback, dict):
            raise ValueError("Overlay fallback must be an object.")
        _unknown_keys(fallback, {"label", "tier", "selection"}, "Overlay fallback")
        if "label" in fallback and "tier" in fallback:
            raise ValueError("Overlay fallback cannot contain both label and tier.")
        if any(not isinstance(item, str) or not item.strip() for item in fallback.values()):
            raise ValueError("Overlay fallback must contain non-empty choices.")
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
        return {}, "Could not load routing overlay; unknown or invalid fields may require a newer gateway version."


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
    if changes["version"] == 2:
        policy_value = merged.get("policy")
        base_policy = policy_from_dict(policy_value, "baseline") if policy_value is not None else None
        definitions, default = strategies_from_document(merged, "baseline", base_policy=base_policy)
        bodies = {item.name: {key: val for key, val in item.as_dict().items() if key != "name"} for item in definitions}
        for body in bodies.values():
            body["policy"].pop("tier_models", None)
        for name in changes["deleted_strategies"]:
            if name == default:
                raise ValueError("The runtime default strategy cannot be deleted.")
            if name not in bodies:
                raise ValueError(f"Unknown deleted strategy {name!r}.")
            del bodies[name]
        known_models = {f"{item['provider']}/{item['upstream_model']}" for item in merged.get("models", [])}
        for name, entry in changes["strategies"].items():
            if name in known_models:
                raise ValueError("Strategy conflicts with a catalog model id.")
            if any(model not in known_models for model in entry["selected_models"]):
                raise ValueError("Workflow selected_models references unknown model ids.")
            body = copy.deepcopy(entry["definition"])
            decision_provider = body.get("decision_provider")
            if decision_provider is not None:
                known_decision_providers = {item.get("id") for item in (merged.get("decision") or {}).get("providers", []) if isinstance(item, dict)}
                if decision_provider not in known_decision_providers:
                    raise ValueError(f"Workflow decision_provider {decision_provider!r} is not configured.")
            body["policy"]["selected_models"] = entry["selected_models"]
            for route in body["policy"].get("labels", {}).values():
                if any(model not in entry["selected_models"] for model in route.get("models", [])):
                    raise ValueError("Workflow pools must reference selected models.")
            bodies[name] = body
        merged["strategies"] = {"default": default, "definitions": bodies}
        if changes["models"]:
            entries = {f"{item['provider']}/{item['upstream_model']}": item for item in merged.get("models", [])}
            for model_id, fields in changes["models"].items():
                if model_id not in entries:
                    raise ValueError(f"Unknown overlay catalog id {model_id!r}.")
                entries[model_id].update(fields)
        return merged
    strategy = changes["strategy"]
    body = _strategy_body(merged, strategy)
    options = body.get("options")
    if any(key in changes for key in ("questions", "rules", "fallback")) and not isinstance(options, dict):
        raise ValueError(f"Overlay strategy {strategy!r} has no options.")
    if isinstance(options, dict):
        if "questions" in changes:
            options["questions"] = changes["questions"]
        if "fallback" in changes:
            options["fallback"] = changes["fallback"]
        if "rules" in changes:
            options["rules"] = changes["rules"]
    if "models" in changes:
        entries = merged.get("models", [])
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
    if not overlay or "models" not in overlay or overlay.get("version") == 2:
        return []
    name = overlay["strategy"]
    definition = next((item for item in catalog.strategies if item.name == name), None)
    if definition is None:
        return []
    baseline = {
        f"{item['provider']}/{item['upstream_model']}": item
        for item in document.get("models", [])
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


def workflow_definition(definition: StrategyDefinition) -> dict[str, Any]:
    body = {key: val for key, val in definition.as_dict().items() if key != "name"}
    body["policy"].pop("tier_models", None)
    body["policy"].pop("selected_models", None)
    return body


def referenced_models(definition: StrategyDefinition, catalog: Catalog) -> list[str]:
    """Seed legacy nodes from matrix branches and genuinely inherited defaults."""
    if definition.policy.selected_models is not None:
        return list(definition.policy.selected_models)
    options = definition.as_dict()["options"]
    first = next(iter(definition.policy.labels))
    choices = [rule["select"] for rule in options.get("rules", [])] + [options.get("fallback", {}), {}]
    labels = {choice.get("label", choice.get("tier", first)) for choice in choices}
    selected: set[str] = set()
    for name, route in definition.policy.labels.items():
        if name not in labels:
            continue
        tag = route.tag or f"{definition.name}/{name}"
        members = list(route.models) if route.models or route.explicit_models else [model.name for model in catalog.profiles if tag in model.tags]
        selected.update(members)
        if not members and catalog.defaults.default_model is not None:
            selected.add(catalog.defaults.default_model)
    return [model.name for model in catalog.profiles if model.name in selected]


def migrate_overlay(overlay: dict[str, Any], catalog: Catalog) -> dict[str, Any]:
    if overlay.get("version") == 2:
        return copy.deepcopy(overlay)
    strategies = {}
    for definition in catalog.strategies:
        if definition.kind == "decision_matrix":
            selected = referenced_models(definition, catalog)
            body = workflow_definition(definition)
            for route in body["policy"]["labels"].values():
                if "models" in route:
                    route["models"] = [model for model in route["models"] if model in selected]
            strategies[definition.name] = {"definition": body, "selected_models": selected}
    return {"version": 2, "strategies": strategies, "deleted_strategies": [], "models": copy.deepcopy(overlay.get("models", {}))}


def empty_workflow(name: str) -> dict[str, Any]:
    validate_strategy_name(name)
    return {"selected_models": [], "definition": {
        "kind": "decision_matrix", "policy": {"labels": {"routine": {"models": []}}},
        "options": {"questions": {"task": {"type": "choice", "instructions": "Choose the task scope.", "criteria": {"routine": "Routine work.", "complex": "Complex work."}}}, "rules": [], "fallback": {"label": "routine"}},
    }}


def reconcile_model_references(overlay: dict[str, Any], removed: set[str]) -> dict[str, Any]:
    result = copy.deepcopy(overlay)
    if "models" in result:
        result["models"] = {key: value for key, value in result["models"].items() if key not in removed}
    if result.get("version") == 2:
        for entry in result["strategies"].values():
            entry["selected_models"] = [model for model in entry["selected_models"] if model not in removed]
            for route in entry["definition"]["policy"].get("labels", {}).values():
                if "models" in route:
                    route["models"] = [model for model in route["models"] if model not in removed]
    return result


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
    from jev_gateway.config_transaction import configuration_read_lock
    from jev_gateway.credentials import credential_snapshot

    with configuration_read_lock(models_file):
        document = read_models_document(models_file)
        credentials = credential_snapshot(models_file)
        overlay, _error = read_overlay(models_file)
        if not overlay:
            return catalog_from_document(document, str(models_file), credentials)
        try:
            return catalog_from_document(merge_overlay(document, overlay), str(models_file), credentials)
        except (ValueError, TypeError):
            # An obsolete overlay must not keep an otherwise valid baseline offline.
            return catalog_from_document(document, str(models_file), credentials)
