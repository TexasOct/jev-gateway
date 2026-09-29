"""Decision classification and the decision-backed routing strategy."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from jev_gateway.catalog import Catalog, RouteLabel, RoutingMode, RoutingPolicy
from jev_gateway.request_facts import RequestFacts

from .contracts import DecisionMaker, RoutingRequest, StrategyOutcome
from .policy import PolicyStrategy

__all__ = ["DecisionClassifier", "DecisionStrategy"]


class DecisionClassifier:
    """Refine request facts through an injected typed-answer capability."""

    def __init__(self, client: DecisionMaker) -> None:
        self.client = client
        self.policy: RoutingPolicy | None = None

    def refine(self, facts: RequestFacts) -> RequestFacts:
        """Return a provider-selected label, or the unchanged request facts."""
        if not self.client.enabled:
            return facts
        active = self.policy
        labels = active.labels if active is not None else {
            "simple": RouteLabel(description="Direct bounded work"),
            "standard": RouteLabel(description="Multi-step work"),
            "complex": RouteLabel(description="Deep analysis or architecture"),
        }
        if not labels:
            return facts
        questions = {
            "routing_tier": {
                "type": "choice",
                "instructions": "Choose the least capable routing label that can answer the request correctly.",
                "criteria": {name: route.description or name for name, route in labels.items()},
            }
        }
        result = self.client.evaluate(
            facts.prompt,
            questions,
            valid=lambda answers: (
                isinstance(answers.get("routing_tier"), dict)
                and answers["routing_tier"].get("choice") in labels
            ),
        )
        if result is None:
            return facts
        answer = result.answers.get("routing_tier")
        tier = answer.get("choice") if isinstance(answer, dict) else None
        if tier not in labels:
            return facts
        return replace(
            facts,
            route_label=tier,
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
        facts = request.facts
        if request.is_first_turn or self.policy.mode is not RoutingMode.CACHED:
            facts = self.classifier.refine(facts)
        return super().decide(replace(request, facts=facts), catalog)
