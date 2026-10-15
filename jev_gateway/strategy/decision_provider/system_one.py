"""System One-compatible decision request and response adapter."""

from __future__ import annotations

from typing import Any

import httpx

from jev_gateway.catalog import DecisionProvider

from .base import DecisionResponseError, DecisionResult


class SystemOneAdapter:
    """Normalize typed choice answers from the System One wire format."""

    def evaluate(
        self,
        provider: DecisionProvider,
        api_key: str,
        timeout_seconds: float,
        state: str | dict[str, Any],
        questions: dict[str, Any],
    ) -> DecisionResult | None:
        body: dict[str, Any] = {"state": state, "questions": questions}
        if provider.model is not None:
            body["model"] = provider.model
        response = httpx.post(
            provider.api_base,
            json=body,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        try:
            payload = response.json()
        except ValueError:
            raise DecisionResponseError("invalid_json", response.status_code) from None
        return parse_answers(provider.name, payload, response.status_code)


def parse_answers(provider_id: str, payload: Any, http_status: int) -> DecisionResult:
    """Normalize one envelope without retaining provider-controlled prose."""
    if not isinstance(payload, dict) or not isinstance(payload.get("answers"), dict):
        raise DecisionResponseError("invalid_envelope", http_status)
    answers: dict[str, dict[str, str]] = {}
    for key, answer in payload["answers"].items():
        if (
            not isinstance(key, str)
            or not isinstance(answer, dict)
            or not isinstance(answer.get("choice"), str)
        ):
            raise DecisionResponseError("invalid_answers", http_status)
        answers[key] = {"choice": answer["choice"]}
    return DecisionResult(provider_id, answers, http_status)
