"""Decision classification and the decision-backed routing strategy."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from typing import Any

from jev_gateway.catalog import Catalog, RouteLabel, RoutingMode, RoutingPolicy
from jev_gateway.request_facts import RequestFacts

from .contracts import DecisionMaker, RoutingEvidence, RoutingRequest, StrategyOutcome
from .decision_provider.base import ClassificationEvidence, evaluate_with_evidence
from .policy import PolicyStrategy

__all__ = ["DecisionClassifier", "DecisionStrategy"]


class DecisionClassifier:
    """Refine request facts through an injected typed-answer capability."""

    def __init__(self, client: DecisionMaker) -> None:
        self.client = client
        self.policy: RoutingPolicy | None = None

    def refine(self, facts: RequestFacts) -> RequestFacts:
        """Return a provider-selected label, or the unchanged request facts."""
        return self.refine_with_evidence(facts)[0]

    def refine_with_evidence(self, facts: RequestFacts) -> tuple[RequestFacts, ClassificationEvidence]:
        active = self.policy
        labels = active.labels if active is not None else {
            "simple": RouteLabel(description="Direct bounded work"),
            "standard": RouteLabel(description="Multi-step work"),
            "complex": RouteLabel(description="Deep analysis or architecture"),
        }
        if not labels:
            return facts, ClassificationEvidence("not_applicable")
        questions = {
            "routing_tier": {
                "type": "choice",
                "instructions": "Choose the least capable routing label that can answer the request correctly.",
                "criteria": {name: route.description or name for name, route in labels.items()},
            }
        }
        evaluation = evaluate_with_evidence(
            self.client, facts.prompt,
            questions,
            valid=lambda answers: (
                isinstance(answers.get("routing_tier"), dict)
                and answers["routing_tier"].get("choice") in labels
            ),
        )
        result = evaluation.result
        if result is None:
            return facts, evaluation.evidence
        answer = result.answers.get("routing_tier")
        tier = answer.get("choice") if isinstance(answer, Mapping) else None
        if tier not in labels:
            return facts, ClassificationEvidence("invalid_answers")
        return replace(facts, route_label=tier), evaluation.evidence


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
        if request.manual is not None or (
            not request.is_first_turn and self.policy.mode is RoutingMode.CACHED
        ):
            outcome = super().decide(request, catalog)
            evidence = outcome.evidence or RoutingEvidence()
            return replace(outcome, evidence=replace(
                evidence, classification=ClassificationEvidence(
                    "bypassed_manual" if request.manual is not None else "bypassed_session"
                ), rule_status="manual" if request.manual is not None else "session_reuse",
            ))
        if type(self.classifier).refine is not DecisionClassifier.refine:
            # Preserve existing subclass overrides without inventing classifier details.
            facts = self.classifier.refine(request.facts)
            classification = ClassificationEvidence("unavailable")
        else:
            facts, classification = self.classifier.refine_with_evidence(request.facts)
        outcome = super().decide(replace(request, facts=facts), catalog)
        return replace(outcome, evidence=replace(
            outcome.evidence or RoutingEvidence(), classification=classification,
            rule_status="classified" if classification.status == "accepted" else "classifier_fallback",
        ))
