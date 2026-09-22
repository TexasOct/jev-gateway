"""JEV classification and the JEV-backed routing strategy."""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import replace
from typing import Any

import httpx

from jev_gateway.catalog import (
    Catalog,
    JevSettings,
    JevSource,
    RouteLabel,
    RoutingMode,
    RoutingPolicy,
)
from jev_gateway.signals import RequestSignals

from .contracts import RoutingRequest, StrategyOutcome
from .policy import PolicyStrategy

__all__ = ["JevClassifier", "JevClient", "JevStrategy"]


class JevClient:
    """Evaluate typed System One questions with ordered source failover."""

    def __init__(self, settings: JevSettings) -> None:
        self.settings = settings

    def evaluate(
        self,
        state: str | dict[str, Any],
        questions: dict[str, Any],
        *,
        valid: Callable[[dict[str, Any]], bool] | None = None,
    ) -> tuple[str, dict[str, Any]] | None:
        """Return the source name and answers, or None when no source succeeds."""
        if not self.settings.enabled:
            return None
        for source in self._ordered_sources():
            api_key = os.getenv(source.api_key_env)
            if not api_key:
                continue
            try:
                response = httpx.post(
                    source.api_base,
                    json={
                        "model": source.model,
                        "state": state,
                        "questions": questions,
                    },
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=self.settings.timeout_seconds,
                )
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict) or not isinstance(
                    payload.get("answers"), dict
                ):
                    continue
                answers = payload["answers"]
                if valid is not None and not valid(answers):
                    continue
                return source.name, answers
            except (httpx.HTTPError, OSError, TypeError, ValueError):
                continue
        return None

    def _ordered_sources(self) -> tuple[JevSource, ...]:
        default = self.settings.default_source
        if default is None:
            return self.settings.sources
        preferred = tuple(
            source for source in self.settings.sources if source.name == default
        )
        fallbacks = tuple(
            source for source in self.settings.sources if source.name != default
        )
        return (*preferred, *fallbacks)


class JevClassifier:
    """Refine request signals through configured System One sources."""

    def __init__(self, settings: JevSettings) -> None:
        self.settings = settings
        self.client = JevClient(settings)
        self.policy: RoutingPolicy | None = None

    def refine(self, signals: RequestSignals) -> RequestSignals:
        """Return a label chosen from the active policy, or the local signals."""
        if not self.settings.enabled:
            return signals
        active = self.policy
        labels = active.labels if active is not None else {
            "simple": RouteLabel(score=0, description="Direct bounded work"),
            "standard": RouteLabel(score=0.35, description="Multi-step work"),
            "complex": RouteLabel(
                score=0.65,
                description="Deep analysis or architecture",
            ),
        }
        if not labels:
            return signals
        questions = {
            "routing_tier": {
                "type": "choice",
                "instructions": (
                    "Choose the least capable routing label that can answer the "
                    "request correctly."
                ),
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
        source, answers = result
        answer = answers.get("routing_tier")
        tier = answer.get("choice") if isinstance(answer, dict) else None
        if tier not in labels:
            return signals
        return replace(
            signals,
            route_label=tier,
            tier=tier if active is None else signals.tier,
            base_tier=tier if active is None else signals.base_tier,
            score_tier=tier if active is None else signals.score_tier,
            reasons=(*signals.reasons, f"jev:{source}:{tier}"),
        )


class JevStrategy(PolicyStrategy):
    """Policy strategy whose task tier comes from configured JEV sources."""

    def __init__(
        self,
        name: str,
        policy: RoutingPolicy,
        classifier: JevClassifier,
        description: str | None = None,
    ) -> None:
        super().__init__(name, policy, description)
        self.classifier = classifier
        self.classifier.policy = policy

    def describe(self) -> dict[str, Any]:
        payload = super().describe()
        payload["type"] = "jev"
        payload["jev"] = self.classifier.settings.as_dict()
        return payload

    def decide(self, request: RoutingRequest, catalog: Catalog) -> StrategyOutcome:
        """Classify cached sessions once; other modes retain per-turn JEV behavior."""
        signals = request.signals
        if request.is_first_turn or self.policy.mode is not RoutingMode.CACHED:
            signals = self.classifier.refine(signals)
        return super().decide(replace(request, signals=signals), catalog)
