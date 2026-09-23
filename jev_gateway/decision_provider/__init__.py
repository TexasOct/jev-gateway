"""Decision-provider protocol registry and failover facade."""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

import httpx

from jev_gateway.catalog import DecisionSettings

from .base import DecisionAdapter, DecisionResult
from .system_one import SystemOneAdapter

__all__ = ["DecisionAdapter", "DecisionClient", "DecisionResult", "registered_protocols"]

_ADAPTERS: dict[str, DecisionAdapter] = {"system_one": SystemOneAdapter()}


def registered_protocols() -> tuple[str, ...]:
    """Return the protocols accepted by catalog validation."""
    return tuple(_ADAPTERS)


class DecisionClient:
    """Try configured providers in order and return normalized choice answers."""

    def __init__(self, settings: DecisionSettings) -> None:
        self.settings = settings

    def evaluate(
        self,
        state: str | dict[str, Any],
        questions: dict[str, Any],
        *,
        valid: Callable[[dict[str, Any]], bool] | None = None,
    ) -> DecisionResult | None:
        if not self.settings.enabled:
            return None
        providers = self.settings.providers
        preferred = self.settings.default_provider
        if preferred is not None:
            providers = (
                *(provider for provider in providers if provider.name == preferred),
                *(provider for provider in providers if provider.name != preferred),
            )
        for provider in providers:
            api_key = os.getenv(provider.api_key_env)
            if not api_key:
                continue
            adapter = _ADAPTERS.get(provider.protocol)
            if adapter is None:
                # Catalog validation rejects this, so only hand-built settings reach it.
                continue
            try:
                result = adapter.evaluate(
                    provider, api_key, self.settings.timeout_seconds, state, questions
                )
                if result is None:
                    continue
                answers: dict[str, Any] = dict(result.answers)
                if valid is not None and not valid(answers):
                    continue
                return result
            except (httpx.HTTPError, OSError, TypeError, ValueError):
                # Provider responses and transport errors are untrusted; try the next.
                continue
        return None
