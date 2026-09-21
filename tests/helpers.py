"""Shared builders for the routing tests."""

from __future__ import annotations

import copy
from typing import Any

SIMPLE_PROMPT = "写一个 Python 函数，判断字符串是否是回文。"
COMPLEX_PROMPT = "设计一个高并发订单系统的架构，并说明一致性与取舍。"
SMALL_MODEL_ID = "small-provider/vendor/small-model"
LARGE_MODEL_ID = "large-provider/vendor/large-model"

CATALOG_DOCUMENT: dict[str, Any] = {
    "providers": [
        {
            "id": "small-provider",
            "api_base": "https://small.example/v1",
            "api_key_env": "TEST_SMALL_PROVIDER_KEY",
        },
        {
            "id": "large-provider",
            "api_base": "https://large.example/v1",
            "api_key_env": "TEST_LARGE_PROVIDER_KEY",
        },
    ],
    "policy": {
        "mode": "escalate",
        "selection": "balanced",
        "tier_models": {
            "simple": [SMALL_MODEL_ID],
            "standard": [SMALL_MODEL_ID],
            "complex": [LARGE_MODEL_ID],
        },
        "escalation": {
            "max_consecutive_failures": 2,
            "max_consecutive_truncations": 2,
            "settle_window": 3,
        },
        "hysteresis": {
            "min_turns_between_switches": 2,
            "cooldown_seconds": 0,
            "max_switches_per_session": 8,
        },
        "budget": {"max_cost_per_session_usd": None, "context_pressure_ratio": 0.75},
    },
    "models": [
        {
            "provider": "small-provider",
            "upstream_model": "vendor/small-model",
            "priority": 10,
            "quality": 0.5,
            "context_window": 8000,
            "max_output_tokens": 2000,
            "capabilities": {
                "tools": False,
                "vision": False,
                "json_mode": True,
                "reasoning": False,
                "temperature": True,
            },
            "cost": {"input_per_million": 0.25, "output_per_million": 0.5},
        },
        {
            "provider": "large-provider",
            "upstream_model": "vendor/large-model",
            "priority": 20,
            "quality": 0.95,
            "context_window": 200000,
            "max_output_tokens": 32000,
            "capabilities": {
                "tools": True,
                "vision": True,
                "json_mode": True,
                "reasoning": True,
                "temperature": False,
            },
            "cost": {"input_per_million": 2.0, "output_per_million": 8.0},
        },
    ],
}


class FakeClock:
    """Deterministic clock for session and hysteresis tests."""

    def __init__(self, now: float = 1000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def turns(*user_messages: str) -> list[dict[str, str]]:
    """Build a conversation that resends history, as a stateless client would."""
    messages: list[dict[str, str]] = []
    for index, text in enumerate(user_messages):
        if index:
            messages.append({"role": "assistant", "content": "ok"})
        messages.append({"role": "user", "content": text})
    return messages


def route_entry(name: str, **overrides: Any) -> dict[str, Any]:
    """Build one catalog model entry pointing at the shared test provider."""
    entry: dict[str, Any] = {
        "provider": "test-provider",
        "upstream_model": f"vendor/{name}",
    }
    entry.update(overrides)
    return entry


def single_route_document(**route_overrides: Any) -> dict[str, Any]:
    """Build a minimal valid document with one route named 'only'."""
    return {
        "policy": {
            "tier_models": {
                "simple": ["test-provider/vendor/only"],
                "standard": ["test-provider/vendor/only"],
                "complex": ["test-provider/vendor/only"],
            }
        },
        "providers": [
            {
                "id": "test-provider",
                "api_base": "https://test.example/v1",
                "api_key_env": "TEST_PROVIDER_KEY",
            }
        ],
        "models": [route_entry("only", **route_overrides)],
    }


def tier_one_document(**policy_overrides: Any) -> dict[str, Any]:
    """Build a one-route document whose tier routes all point at 'only'."""
    policy: dict[str, Any] = {
        "tier_models": {
            "simple": ["test-provider/vendor/only"],
            "standard": ["test-provider/vendor/only"],
            "complex": ["test-provider/vendor/only"],
        }
    }
    for key, value in policy_overrides.items():
        if isinstance(value, dict) and isinstance(policy.get(key), dict):
            policy[key].update(value)
        else:
            policy[key] = value
    return {
        "policy": policy,
        "providers": [
            {
                "id": "test-provider",
                "api_base": "https://test.example/v1",
                "api_key_env": "TEST_PROVIDER_KEY",
            }
        ],
        "models": [route_entry("only")],
    }


def catalog_document(**policy_overrides: Any) -> dict[str, Any]:
    """Return a deep copy of the test catalog with policy overrides applied."""
    document = copy.deepcopy(CATALOG_DOCUMENT)
    policy = document["policy"]
    for key, value in policy_overrides.items():
        if isinstance(value, dict) and isinstance(policy.get(key), dict):
            policy[key].update(value)
        else:
            policy[key] = value
    return document
