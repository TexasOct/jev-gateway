"""Immutable, safe per-call decision evidence and wire-protocol contracts."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Protocol

from jev_gateway.catalog import DecisionProvider
from jev_gateway.routing_evidence import CLASSIFICATION_STATUSES


@dataclass(frozen=True)
class DecisionResult:
    """Typed choice answers, detached from mutable adapter response containers."""

    provider: str
    answers: Mapping[str, Mapping[str, str]]
    http_status: int | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "answers", MappingProxyType({
            key: MappingProxyType(dict(value)) for key, value in self.answers.items()
        }))


@dataclass(frozen=True)
class DecisionAttempt:
    provider_id: str
    status: str
    http_status: int | None
    elapsed_ms: float

    def as_dict(self) -> dict[str, Any]:
        return {"provider_id": self.provider_id, "status": self.status,
                "http_status": self.http_status, "elapsed_ms": self.elapsed_ms}


@dataclass(frozen=True)
class ClassificationEvidence:
    status: str
    provider_id: str | None = None
    answers: tuple[tuple[str, str], ...] = ()
    attempts: tuple[DecisionAttempt, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {"status": self.status, "provider_id": self.provider_id,
                "answers": {key: {"choice": choice} for key, choice in self.answers},
                "attempts": [attempt.as_dict() for attempt in self.attempts]}


@dataclass(frozen=True)
class DecisionEvaluation:
    result: DecisionResult | None
    evidence: ClassificationEvidence


class DecisionResponseError(ValueError):
    """Closed response failure category; never retain upstream content."""

    def __init__(self, status: str, http_status: int | None = None) -> None:
        self.status = status if status in CLASSIFICATION_STATUSES else "invalid_envelope"
        self.http_status = http_status
        super().__init__(self.status)


def checked_result(
    result: DecisionResult | None, questions: dict[str, Any],
    valid: Callable[[dict[str, Any]], bool] | None = None,
) -> DecisionResult | None:
    """Accept only configured question and criterion IDs; discard all other fields."""
    if result is None or set(result.answers) != set(questions):
        return None
    answers: dict[str, dict[str, str]] = {}
    for key, question in questions.items():
        answer = result.answers.get(key)
        choice = answer.get("choice") if isinstance(answer, Mapping) else None
        if not isinstance(choice, str) or choice not in question.get("criteria", {}):
            return None
        answers[key] = {"choice": choice}
    if valid is not None and not valid(answers):
        return None
    return DecisionResult(result.provider, answers, result.http_status)


def evaluate_with_evidence(
    maker: Any, state: str | dict[str, Any], questions: dict[str, Any],
    *, valid: Callable[[dict[str, Any]], bool] | None = None,
) -> DecisionEvaluation:
    """Keep settings-free injected evaluate() makers compatible without fake attempts."""
    richer = getattr(maker, "evaluate_with_evidence", None)
    if callable(richer):
        evaluation = richer(state, questions, valid=valid)
        if not isinstance(evaluation, DecisionEvaluation):
            raise TypeError("Decision evidence capability must return DecisionEvaluation.")
        return evaluation
    if not maker.enabled:
        return DecisionEvaluation(None, ClassificationEvidence("disabled"))
    result = maker.evaluate(state, questions, valid=valid)
    accepted = checked_result(result, questions, valid)
    if accepted is None:
        return DecisionEvaluation(None, ClassificationEvidence(
            "invalid_answers" if result is not None else "unavailable",
            result.provider if result is not None else None,
        ))
    return DecisionEvaluation(accepted, ClassificationEvidence(
        "accepted", accepted.provider,
        tuple((key, answer["choice"]) for key, answer in accepted.answers.items()),
    ))


class DecisionAdapter(Protocol):
    """Send questions and normalize one provider's response."""

    def evaluate(
        self, provider: DecisionProvider, api_key: str, timeout_seconds: float,
        state: str | dict[str, Any], questions: dict[str, Any],
    ) -> DecisionResult | None: ...
