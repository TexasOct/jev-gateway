"""Normalized decision results and replaceable wire-protocol contract."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from jev_gateway.catalog import DecisionProvider


@dataclass(frozen=True)
class DecisionResult:
    """Typed choice answers from one decision provider."""

    provider: str
    answers: Mapping[str, dict[str, str]]


class DecisionAdapter(Protocol):
    """Send questions and normalize one provider's response."""

    def evaluate(
        self,
        provider: DecisionProvider,
        api_key: str,
        timeout_seconds: float,
        state: str | dict[str, Any],
        questions: dict[str, Any],
    ) -> DecisionResult | None:
        """Return normalized answers, or None when the response is unusable."""
        raise AssertionError("DecisionAdapter is a protocol, not an implementation.")
