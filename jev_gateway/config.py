"""Small transport-neutral configuration helpers."""

from __future__ import annotations

from typing import Any

__all__ = [
    "TIER_ORDER",
    "TIER_RANK",
    "coerce_float",
    "coerce_int",
    "normalize_api_base",
]

TIER_ORDER = ("simple", "standard", "complex")
TIER_RANK = {"simple": 0, "standard": 1, "complex": 2}


def normalize_api_base(api_base: str) -> str:
    """Keep the base path form LiteLLM expects for an OpenAI-compatible API."""
    return api_base.rstrip("/")


def coerce_int(value: Any, default: int = 0) -> int:
    """Convert a value to int, falling back when it is not numeric."""
    if isinstance(value, bool):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def coerce_float(value: Any, default: float = 0.0) -> float:
    """Convert a value to float, falling back when it is not numeric."""
    if isinstance(value, bool):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
