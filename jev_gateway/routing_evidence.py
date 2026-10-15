"""Strict safe projections for recorded routing evidence and historical context."""

from __future__ import annotations

import json
import math
from typing import Any

CLASSIFICATION_STATUSES = frozenset({
    "accepted", "disabled", "missing_provider", "missing_key", "http_error",
    "timeout", "network_error", "invalid_json", "invalid_envelope", "invalid_answers",
    "unsupported_protocol", "unavailable", "bypassed_manual", "bypassed_session", "not_applicable",
})
RULE_STATUSES = frozenset({"policy", "manual", "session_reuse", "classified", "matched", "accepted_unmatched", "classifier_fallback"})
POOL_SOURCES = frozenset({"label_pool", "widened_pool", "global_default", "session", "manual"})
SELECTIONS = frozenset({"cheapest_adequate", "quality_first", "balanced"})


def _text(value: Any, limit: int = 512) -> str | None:
    return value if isinstance(value, str) and len(value) <= limit and all(ord(c) >= 32 and ord(c) != 127 for c in value) else None


def _member(value: Any, allowed: frozenset[str]) -> bool:
    return isinstance(value, str) and value in allowed


def _ids(value: Any) -> list[str]:
    return [item for item in value[:256] if _text(item) is not None] if isinstance(value, list) else []


def project_routing_evidence(value: Any) -> dict[str, Any] | None:
    """Never forward arbitrary signal keys, response prose or legacy inference."""
    if not isinstance(value, dict):
        return None
    result: dict[str, Any] = {}
    classification = value.get("classification")
    if isinstance(classification, dict) and _member(classification.get("status"), CLASSIFICATION_STATUSES):
        answers = classification.get("answers", {})
        accepted: dict[str, Any] = {}
        if classification["status"] == "accepted" and isinstance(answers, dict):
            for key, answer in list(answers.items())[:64]:
                if _text(key) is not None and isinstance(answer, dict) and _text(answer.get("choice")) is not None:
                    accepted[key] = {"choice": answer["choice"]}
        attempts = []
        raw_attempts = classification.get("attempts", [])
        for attempt in raw_attempts[:64] if isinstance(raw_attempts, list) else []:
            if not isinstance(attempt, dict) or _text(attempt.get("provider_id")) is None or not _member(attempt.get("status"), CLASSIFICATION_STATUSES):
                continue
            code, elapsed = attempt.get("http_status"), attempt.get("elapsed_ms")
            attempts.append({"provider_id": attempt["provider_id"], "status": attempt["status"],
                             "http_status": code if type(code) is int and 100 <= code <= 599 else None,
                             "elapsed_ms": elapsed if isinstance(elapsed, (int, float)) and not isinstance(elapsed, bool) and math.isfinite(elapsed) and elapsed >= 0 else None})
        result["classification"] = {"status": classification["status"], "provider_id": _text(classification.get("provider_id")), "answers": accepted, "attempts": attempts}
    if _member(value.get("rule_status"), RULE_STATUSES):
        result["rule_status"] = value["rule_status"]
    index = value.get("matched_rule_index")
    result["matched_rule_index"] = index if type(index) is int and index > 0 else None
    pool = value.get("pool")
    if isinstance(pool, dict):
        result["pool"] = {"label": _text(pool.get("label")), "selection": pool.get("selection") if _member(pool.get("selection"), SELECTIONS) else None,
                          "source": pool.get("source") if _member(pool.get("source"), POOL_SOURCES) else None, "candidates": _ids(pool.get("candidates"))}
    return result


def _project_config_context(snapshot: Any, strategy: Any, config_hash: str | None) -> dict[str, Any]:
    """Resolve one strategy against its recorded snapshot; never expose providers."""
    missing = {"status": "unavailable", "config_hash": config_hash}
    if not isinstance(snapshot, dict):
        return missing
    definitions = snapshot.get("strategies")
    if not isinstance(definitions, list):
        return missing
    definition = next((item for item in definitions if isinstance(item, dict) and item.get("name") == strategy), None)
    if definition is None or not isinstance(definition.get("policy"), dict):
        return missing
    policy = definition["policy"]
    raw_labels = policy.get("labels")
    if not isinstance(raw_labels, dict) or len(raw_labels) > 64:
        return missing
    profiles = snapshot.get("models", [])
    if not isinstance(profiles, list):
        return missing
    labels: dict[str, Any] = {}
    selected = policy.get("selected_models")
    if selected is not None and (not isinstance(selected, list) or len(selected) > 256):
        return missing
    for label, route in raw_labels.items():
        if not isinstance(route, dict) or _text(label) is None:
            return missing
        tag = route.get("tag") or f"{strategy}/{label}"
        raw_models = route.get("models", [])
        if not isinstance(raw_models, list) or len(raw_models) > 256:
            return missing
        models = _ids(raw_models)
        if not models and "models" not in route:
            models = [item["name"] for item in profiles if isinstance(item, dict) and _text(item.get("name")) is not None and tag in item.get("tags", []) and (selected is None or item["name"] in selected)]
            if len(models) > 256:
                return missing
        labels[label] = {"description": _text(route.get("description"), 4096), "tag": _text(tag), "models": models}
    questions: dict[str, Any] = {}
    rules: list[dict[str, Any]] = []
    options = definition.get("options", {})
    raw_questions = options.get("questions", {}) if isinstance(options, dict) else {}
    raw_rules = options.get("rules", []) if isinstance(options, dict) else []
    if not isinstance(raw_questions, dict) or len(raw_questions) > 64 or not isinstance(raw_rules, list) or len(raw_rules) > 128:
        return missing
    for key, question in raw_questions.items():
        if not isinstance(question, dict) or _text(key) is None or not isinstance(question.get("criteria"), dict) or len(question["criteria"]) > 64:
            return missing
        questions[key] = {"type": "choice", "instructions": _text(question.get("instructions"), 4096),
                          "criteria": {key: _text(description, 4096) for key, description in question["criteria"].items() if _text(key) is not None}}
    def choice(value: Any) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        return {key: item for key, item in value.items() if key in {"label", "selection"} and _text(item) is not None}
    for index, rule in enumerate(raw_rules):
        if not isinstance(rule, dict) or not isinstance(rule.get("when"), dict):
            return missing
        conditions = {}
        for key, values in rule["when"].items():
            if key not in questions:
                return missing
            values = values if isinstance(values, list) else [values]
            if len(values) > 256:
                return missing
            conditions[key] = [value for value in _ids(values) if value in questions[key]["criteria"]]
        rules.append({"index": index + 1, "when": conditions, "select": choice(rule.get("select"))})
    decision = snapshot.get("decision", {})
    defaults = snapshot.get("defaults", {})
    result = {"status": "available", "config_hash": config_hash,
              "strategy": {"name": _text(strategy), "kind": _text(definition.get("kind")), "mode": _text(policy.get("mode")), "selection": _text(policy.get("selection")), "labels": labels,
                           "selected_models": _ids(selected) if selected is not None else None,
                           "questions": questions, "rules": rules, "fallback": choice(options.get("fallback")) if isinstance(options, dict) else {}},
              "defaults": {"default_model": _text(defaults.get("default_model")) if isinstance(defaults, dict) else None},
              "decision_enabled": decision.get("enabled") if isinstance(decision, dict) and type(decision.get("enabled")) is bool else None}
    return result if len(json.dumps(result).encode()) <= 65536 else missing


def project_config_context(snapshot: Any, strategy: Any, config_hash: str | None) -> dict[str, Any]:
    """Malformed legacy snapshots remain unavailable without breaking record reads."""
    try:
        return _project_config_context(snapshot, strategy, config_hash)
    except (TypeError, ValueError, KeyError, AttributeError):
        return {"status": "unavailable", "config_hash": config_hash}
