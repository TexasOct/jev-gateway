"""Multi-question JEV routing with locally validated, deterministic rules."""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from dataclasses import replace
from typing import Any

from jev_gateway.catalog import (
    SELECTION_MODES,
    Catalog,
    RoutingMode,
    RoutingPolicy,
    StrategyDefinition,
)

from .contracts import RoutingRequest, StrategyOutcome
from .jev import JevClient
from .policy import PolicyStrategy

__all__ = ["JevMatrixStrategy", "build_jev_matrix_strategy"]


class JevMatrixStrategy(PolicyStrategy):
    """Interpret typed JEV answers as a policy choice, never as a model ID."""

    def __init__(
        self,
        name: str,
        policy: RoutingPolicy,
        client: JevClient,
        options: Mapping[str, Any],
        description: str | None = None,
    ) -> None:
        super().__init__(name, policy, description)
        self.client = client
        self.options = _mutable_json(options)
        self.questions, self.rules, self.fallback = _validate_options(self.options, policy)

    def describe(self) -> dict[str, Any]:
        payload = super().describe()
        payload["type"] = "jev_matrix"
        payload["options"] = deepcopy(self.options)
        payload["jev"] = self.client.settings.as_dict()
        return payload

    def decide(self, request: RoutingRequest, catalog: Catalog) -> StrategyOutcome:
        # Manual routes and cached continuations retain the built-in policy behavior.
        if request.manual is not None or (
            request.session is not None and self.policy.mode is RoutingMode.CACHED
        ):
            return super().decide(request, catalog)
        result = self.client.evaluate(
            self._state(request),
            self.questions,
            valid=lambda raw: _checked_answers(raw, self.questions) is not None,
        )
        answers: dict[str, str] | None = None
        source: str | None = None
        if result is not None:
            source, raw = result
            answers = _checked_answers(raw, self.questions)

        choice: Mapping[str, str] = self.fallback
        reason = "fallback"
        if answers is not None:
            choice = {}
            reason = "default"
            for index, rule in enumerate(self.rules):
                if all(
                    answers.get(key) in values for key, values in rule["when"].items()
                ):
                    choice = rule["select"]
                    reason = f"rule_{index + 1}"
                    break

        tier = choice.get("label", self._signal_label(request.signals))
        selection = choice.get("selection", self.policy.selection)
        signals = request.signals
        if tier != self._signal_label(signals):
            signals = replace(signals, route_label=tier)
        policy = replace(self.policy, selection=selection)
        outcome = PolicyStrategy(self.name, policy, self.description).decide(
            replace(request, signals=signals), catalog
        )
        evidence = f"jev_matrix:{source or 'local'}:{reason}"
        return replace(outcome, reason=f"{evidence}:{outcome.reason}")

    @staticmethod
    def _state(request: RoutingRequest) -> dict[str, Any]:
        signals = request.signals
        session = request.session
        return {
            "prompt": signals.prompt,
            "local_score": signals.score,
            "local_tier": signals.tier,
            "conversation_tokens": signals.conversation_tokens,
            "requested_max_tokens": signals.requested_max_tokens,
            "needs_tools": signals.needs_tools,
            "needs_vision": signals.needs_vision,
            "needs_json": signals.needs_json,
            "turn_index": request.turn_index,
            "session": None
            if session is None
            else {
                "label": session.tier,
                "tier": session.tier,
                "current_model": session.route,
                "consecutive_failures": session.consecutive_failures,
                "consecutive_truncations": session.consecutive_truncations,
                "cost_usd": session.cost_usd,
            },
        }


def _mutable_json(value: Any) -> Any:
    """Copy catalog's frozen mapping and tuple options into JSON containers."""
    if isinstance(value, Mapping):
        return {key: _mutable_json(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_mutable_json(item) for item in value]
    return value


def _validate_choice(value: Any, name: str, policy: RoutingPolicy) -> dict[str, str]:
    if not isinstance(value, dict) or set(value) - {"label", "tier", "selection"}:
        raise ValueError(f"{name} must contain only label and selection (tier is a legacy alias).")
    if "label" in value and "tier" in value:
        raise ValueError(f"{name} cannot contain both label and tier.")
    label = value.get("label", value.get("tier"))
    if ("label" in value or "tier" in value) and (
        not isinstance(label, str) or label not in policy.labels
    ):
        raise ValueError(f"{name}.label must be one of {', '.join(policy.labels)}.")
    if "selection" in value and (
        not isinstance(value["selection"], str)
        or value["selection"] not in SELECTION_MODES
    ):
        raise ValueError(
            f"{name}.selection must be one of {', '.join(SELECTION_MODES)}."
        )
    result = dict(value)
    if "tier" in result:
        result["label"] = result.pop("tier")
    return result


def _validate_options(
    options: Mapping[str, Any], policy: RoutingPolicy,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, str]]:
    if set(options) - {"questions", "rules", "fallback"}:
        raise ValueError("jev_matrix options contain unknown fields.")
    questions = options.get("questions")
    if not isinstance(questions, dict) or not questions:
        raise ValueError("jev_matrix options.questions must be a non-empty object.")
    choices: dict[str, set[str]] = {}
    for key, question in questions.items():
        if not isinstance(key, str) or not key or not isinstance(question, dict):
            raise ValueError(
                "jev_matrix question names and definitions must be objects."
            )
        criteria = question.get("criteria")
        if (
            question.get("type") != "choice"
            or not isinstance(question.get("instructions"), str)
            or not question["instructions"].strip()
            or set(question) != {"type", "instructions", "criteria"}
            or not isinstance(criteria, dict)
            or len(criteria) < 2
            or any(
                not isinstance(k, str) or not k or not isinstance(v, str) or not v
                for k, v in criteria.items()
            )
        ):
            raise ValueError(
                f"jev_matrix question {key!r} must be a choice with instructions and at least two criteria."
            )
        choices[key] = set(criteria)
    raw_rules = options.get("rules", [])
    if not isinstance(raw_rules, list):
        raise TypeError("jev_matrix options.rules must be an array.")
    rules: list[dict[str, Any]] = []
    for index, rule in enumerate(raw_rules):
        if (
            not isinstance(rule, dict)
            or set(rule) != {"when", "select"}
            or not isinstance(rule["when"], dict)
            or not rule["when"]
        ):
            raise ValueError(
                f"jev_matrix rule {index + 1} needs when and select objects."
            )
        predicates: dict[str, frozenset[str]] = {}
        for key, value in rule["when"].items():
            values = value if isinstance(value, list) else [value]
            if (
                key not in choices
                or not values
                or any(not isinstance(v, str) or v not in choices[key] for v in values)
            ):
                raise ValueError(
                    f"jev_matrix rule {index + 1} has an invalid condition for {key!r}."
                )
            predicates[key] = frozenset(values)
        rules.append(
            {
                "when": predicates,
                "select": _validate_choice(rule["select"], f"rule {index + 1}.select", policy),
            }
        )
    fallback = _validate_choice(options.get("fallback", {}), "fallback", policy)
    return dict(questions), rules, fallback


def _checked_answers(
    raw: Mapping[str, Any], questions: Mapping[str, Any]
) -> dict[str, str] | None:
    answers: dict[str, str] = {}
    for key, question in questions.items():
        answer = raw.get(key)
        value = answer.get("choice") if isinstance(answer, dict) else None
        if not isinstance(value, str) or value not in question["criteria"]:
            return None
        answers[key] = value
    return answers


def build_jev_matrix_strategy(
    definition: StrategyDefinition, catalog: Catalog
) -> JevMatrixStrategy:
    return JevMatrixStrategy(
        definition.name,
        definition.policy,
        JevClient(catalog.jev),
        definition.options,
        definition.description,
    )
