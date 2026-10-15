"""Decision-provider protocol registry and failover facade."""

from __future__ import annotations

import os
import time
from collections.abc import Callable
from typing import Any

import httpx

from jev_gateway.catalog import DecisionSettings

from .base import (
    ClassificationEvidence, DecisionAdapter, DecisionAttempt, DecisionEvaluation,
    DecisionResponseError, DecisionResult, checked_result,
)
from .system_one import SystemOneAdapter

__all__ = ["DecisionAdapter", "DecisionClient", "DecisionResult", "registered_protocols"]

_ADAPTERS: dict[str, DecisionAdapter] = {"system_one": SystemOneAdapter()}


def registered_protocols() -> tuple[str, ...]:
    """Return the protocols accepted by catalog validation."""
    return tuple(_ADAPTERS)


class DecisionClient:
    """Try configured providers in order and return normalized choice answers."""

    def __init__(self, settings: DecisionSettings, preferred_provider: str | None = None) -> None:
        self.settings = settings
        self.preferred_provider = preferred_provider

    @property
    def enabled(self) -> bool:
        return self.settings.enabled

    def describe(self) -> dict[str, Any]:
        """Return non-secret decision settings for strategy descriptions."""
        return self.settings.as_dict()

    def evaluate(
        self,
        state: str | dict[str, Any],
        questions: dict[str, Any],
        *,
        valid: Callable[[dict[str, Any]], bool] | None = None,
    ) -> DecisionResult | None:
        return self.evaluate_with_evidence(state, questions, valid=valid).result

    def evaluate_with_evidence(
        self, state: str | dict[str, Any], questions: dict[str, Any], *,
        valid: Callable[[dict[str, Any]], bool] | None = None,
    ) -> DecisionEvaluation:
        if not self.settings.enabled:
            return DecisionEvaluation(None, ClassificationEvidence("disabled"))
        providers = self.settings.providers
        if self.preferred_provider is not None:
            providers = tuple(provider for provider in providers if provider.name == self.preferred_provider)
        elif self.settings.default_provider is not None:
            preferred = self.settings.default_provider
            if all(provider.name != preferred for provider in providers):
                return DecisionEvaluation(None, ClassificationEvidence("missing_provider"))
            providers = (
                *(provider for provider in providers if provider.name == preferred),
                *(provider for provider in providers if provider.name != preferred),
            )
        attempts: list[DecisionAttempt] = []
        for provider in providers:
            started = time.monotonic()
            status = "missing_key"
            http_status: int | None = None
            result: DecisionResult | None = None
            api_key = (
                os.getenv(provider.api_key_env) if self.settings.credentials is None
                else self.settings.credentials.get(provider.api_key_env)
            )
            adapter = _ADAPTERS.get(provider.protocol)
            if adapter is None:
                status = "unsupported_protocol"
            elif api_key:
                try:
                    raw = adapter.evaluate(
                        provider, api_key, self.settings.timeout_seconds, state, questions
                    )
                    http_status = raw.http_status if raw is not None else None
                    result = checked_result(raw, questions, valid)
                    status = "accepted" if result is not None else "invalid_answers"
                except DecisionResponseError as error:
                    status, http_status = error.status, error.http_status
                except httpx.HTTPStatusError as error:
                    status, http_status = "http_error", error.response.status_code
                except httpx.TimeoutException:
                    status = "timeout"
                except (httpx.HTTPError, OSError):
                    status = "network_error"
                except (TypeError, ValueError):
                    status = "invalid_answers"
            attempts.append(DecisionAttempt(
                provider.name, status, http_status,
                round(max(0.0, (time.monotonic() - started) * 1000), 3),
            ))
            if result is not None:
                # Provider identity belongs to configuration, never to the response.
                result = DecisionResult(provider.name, result.answers, http_status)
                return DecisionEvaluation(result, ClassificationEvidence(
                    "accepted", provider.name,
                    tuple((key, answer["choice"]) for key, answer in result.answers.items()),
                    tuple(attempts),
                ))
        return DecisionEvaluation(None, ClassificationEvidence(
            attempts[-1].status if attempts else "missing_provider", attempts=tuple(attempts)
        ))
