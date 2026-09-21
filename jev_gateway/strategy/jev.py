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
    RoutingMode,
    RoutingPolicy,
)
from jev_gateway.config import TIER_ORDER
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

    def refine(self, signals: RequestSignals) -> RequestSignals:
        """Return the JEV-selected tier, or the incoming signals on failure."""
        if not self.settings.enabled:
            return signals
        questions = {
            "routing_tier": {
                "type": "choice",
                "instructions": (
                    "Choose the least capable routing tier that can answer the "
                    "request correctly."
                ),
                "criteria": {
                    "simple": (
                        "A direct, bounded answer with little or no multi-step "
                        "reasoning."
                    ),
                    "standard": (
                        "Several steps, normal programming or analysis, but no "
                        "high-stakes architecture or audit work."
                    ),
                    "complex": (
                        "Architecture, migration, security, audit, high-stakes "
                        "analysis, or a task that needs deep reasoning."
                    ),
                },
            }
        }
        result = self.client.evaluate(
            signals.prompt,
            questions,
            valid=lambda answers: (
                isinstance(answers.get("routing_tier"), dict)
                and answers["routing_tier"].get("choice") in TIER_ORDER
            ),
        )
        if result is None:
            return signals
        source, answers = result
        answer = answers.get("routing_tier")
        tier = answer.get("choice") if isinstance(answer, dict) else None
        if tier not in TIER_ORDER:
            return signals
        return replace(
            signals,
            tier=tier,
            base_tier=tier,
            score_tier=tier,
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
