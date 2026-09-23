"""Decision classification and the decision-backed routing strategy."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from jev_gateway.catalog import Catalog, RouteLabel, RoutingMode, RoutingPolicy
from jev_gateway.signals import RequestSignals

from .contracts import DecisionMaker, RoutingRequest, StrategyOutcome
from .policy import PolicyStrategy

__all__ = ["DecisionClassifier", "DecisionStrategy"]


class DecisionClassifier:
    """Refine request signals through an injected typed-answer capability."""

    def __init__(self, client: DecisionMaker) -> None:
        self.client = client
        self.policy: RoutingPolicy | None = None

    def refine(self, signals: RequestSignals) -> RequestSignals:
        """Return a label chosen from the active policy, or the local signals."""
        if not self.client.enabled:
            return signals
        active = self.policy
        labels = active.labels if active is not None else {
            "simple": RouteLabel(score=0, description="Direct bounded work"),
            "standard": RouteLabel(score=0.35, description="Multi-step work"),
            "complex": RouteLabel(score=0.65, description="Deep analysis or architecture"),
        }
        if not labels:
            return signals
        questions = {
            "routing_tier": {
                "type": "choice",
                "instructions": "Choose the least capable routing label that can answer the request correctly.",
                "criteria": {name: route.description or name for name, route in labels.items()},
            }
        }
        result = self.client.evaluate(
            signals.prompt,
            questions,
            valid=lambda answers: (
                isinstance(answers.get("routing_tier"), dict)
                and answers["routing_tier"].get("choice") in labels
            ),
        )
        if result is None:
            return signals
        answer = result.answers.get("routing_tier")
        tier = answer.get("choice") if isinstance(answer, dict) else None
        if tier not in labels:
            return signals
        return replace(
            signals,
            route_label=tier,
            tier=tier if active is None else signals.tier,
            base_tier=tier if active is None else signals.base_tier,
            score_tier=tier if active is None else signals.score_tier,
            reasons=(*signals.reasons, f"decision:{result.provider}:{tier}"),
        )


class DecisionStrategy(PolicyStrategy):
    """Policy strategy whose task label comes from a decision maker."""

    def __init__(
        self,
        name: str,
        policy: RoutingPolicy,
        classifier: DecisionClassifier,
        description: str | None = None,
    ) -> None:
        super().__init__(name, policy, description)
        self.classifier = classifier
        self.classifier.policy = policy

    def describe(self) -> dict[str, Any]:
        payload = super().describe()
        payload["type"] = "decision"
        payload["decision"] = self.classifier.client.describe()
        return payload

    def decide(self, request: RoutingRequest, catalog: Catalog) -> StrategyOutcome:
        """Classify cached sessions once; other modes retain per-turn behavior."""
        signals = request.signals
        if request.is_first_turn or self.policy.mode is not RoutingMode.CACHED:
            signals = self.classifier.refine(signals)
        return super().decide(replace(request, signals=signals), catalog)
