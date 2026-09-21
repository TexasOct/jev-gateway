"""JEV classification and the JEV-backed routing strategy."""

from __future__ import annotations

import json
import os
from dataclasses import replace
from typing import Any

import httpx

from jev_gateway.catalog import Catalog, JevSettings, JevSource, RoutingPolicy
from jev_gateway.config import TIER_ORDER
from jev_gateway.signals import RequestSignals

from .contracts import RoutingRequest, StrategyOutcome
from .policy import PolicyStrategy

__all__ = ["JevClassifier", "JevStrategy"]


class JevClassifier:
    """Refine request signals through configured System One sources."""

    def __init__(self, settings: JevSettings) -> None:
        self.settings = settings

    def refine(self, signals: RequestSignals) -> RequestSignals:
        """Return the JEV-selected tier, or the incoming signals on failure."""
        if not self.settings.enabled:
            return signals
        for source in self._ordered_sources():
            api_key = os.getenv(source.api_key_env)
            if not api_key:
                continue
            try:
                tier = self._classify(source, api_key, signals.prompt)
            except (
                httpx.HTTPError,
                OSError,
                TypeError,
                ValueError,
                json.JSONDecodeError,
            ):
                continue
            if tier in TIER_ORDER:
                return replace(
                    signals,
                    tier=tier,
                    base_tier=tier,
                    score_tier=tier,
                    reasons=(*signals.reasons, f"jev:{source.name}:{tier}"),
                )
        return signals

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

    def _classify(self, source: JevSource, api_key: str, prompt: str) -> str:
        body = {
            "model": source.model,
            "state": prompt,
            "questions": {
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
            },
        }
        try:
            response = httpx.post(
                source.api_base,
                json=body,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=self.settings.timeout_seconds,
            )
            response.raise_for_status()
            parsed_payload = response.json()
        except (httpx.HTTPError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError(
                f"JEV source {source.name!r} returned an invalid response."
            ) from error
        if not isinstance(parsed_payload, dict):
            raise TypeError("JEV response must be a JSON object.")
        payload: dict[str, Any] = parsed_payload
        answer = payload.get("answers", {}).get("routing_tier", {})
        choice = answer.get("choice")
        if not isinstance(choice, str):
            raise TypeError("JEV response did not contain answers.routing_tier.choice")
        return choice


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
        return super().decide(
            replace(request, signals=self.classifier.refine(request.signals)), catalog
        )
