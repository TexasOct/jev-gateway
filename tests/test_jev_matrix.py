"""Multi-question JEV strategy configuration and routing."""

from __future__ import annotations

import copy
from typing import Any

import httpx
import pytest

from jev_gateway.catalog import catalog_from_document
from jev_gateway.sessions import SessionState
from jev_gateway.signals import extract_signals
from jev_gateway.strategy import RoutingRequest, StrategyRegistry
from tests.helpers import CATALOG_DOCUMENT, LARGE_MODEL_ID, SMALL_MODEL_ID


def document() -> dict[str, Any]:
    config = copy.deepcopy(CATALOG_DOCUMENT)
    config["decision"] = {
        "enabled": True,
        "providers": [
            {
                "id": "primary",
                "protocol": "system_one",
                "api_base": "https://primary.example/systemone",
                "api_key_env": "TEST_MATRIX_KEY",
                "model": "typesafe/jev-test",
            }
        ],
    }
    config["strategies"] = {
        "default": "matrix",
        "definitions": {
            "matrix": {
                "kind": "jev_matrix",
                "policy": config.pop("policy"),
                "options": {
                    "questions": {
                        "risk": {
                            "type": "choice",
                            "instructions": "How risky is this task?",
                            "criteria": {"low": "Routine.", "high": "High stakes."},
                        },
                        "objective": {
                            "type": "choice",
                            "instructions": "Which tradeoff is needed?",
                            "criteria": {
                                "cost": "Minimize cost.",
                                "quality": "Maximize quality.",
                            },
                        },
                    },
                    "rules": [
                        {
                            "when": {"risk": "high"},
                            "select": {"tier": "complex", "selection": "quality_first"},
                        },
                        {
                            "when": {"objective": "cost"},
                            "select": {
                                "tier": "simple",
                                "selection": "cheapest_adequate",
                            },
                        },
                    ],
                    "fallback": {"tier": "simple", "selection": "cheapest_adequate"},
                },
            }
        },
    }
    return config


def decide(config: dict[str, Any]):
    catalog = catalog_from_document(config, "test matrix")
    strategy = StrategyRegistry.from_catalog(catalog).resolve("matrix")
    signals = extract_signals([{"role": "user", "content": "hello"}])
    outcome = strategy.decide(RoutingRequest(signals, None, None, 1, 0.0), catalog)
    return outcome, strategy


def test_matrix_routes_multiple_answers_and_sends_structured_state(monkeypatch) -> None:
    monkeypatch.setenv("TEST_MATRIX_KEY", "key")
    seen: dict[str, Any] = {}

    def post(url: str, **kwargs: Any) -> httpx.Response:
        seen.update(kwargs["json"])
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={
                "answers": {"risk": {"choice": "high"}, "objective": {"choice": "cost"}}
            },
        )

    monkeypatch.setattr(httpx, "post", post)
    outcome, strategy = decide(document())
    assert outcome.model == LARGE_MODEL_ID
    assert outcome.tier == "complex"
    assert outcome.reason.startswith("jev_matrix:primary:rule_1:")
    assert seen["state"]["prompt"] == "hello"
    assert set(seen["questions"]) == {"risk", "objective"}
    assert strategy.describe()["type"] == "jev_matrix"
    assert "decision" in strategy.describe()
    assert "jev" not in strategy.describe()


def test_matrix_retries_next_source_after_invalid_answers(monkeypatch) -> None:
    monkeypatch.setenv("TEST_MATRIX_KEY", "key")
    monkeypatch.setenv("TEST_MATRIX_SECONDARY_KEY", "key-2")
    config = document()
    config["decision"]["providers"].append(
        {
            "id": "secondary",
            "protocol": "system_one",
            "api_base": "https://secondary.example/systemone",
            "api_key_env": "TEST_MATRIX_SECONDARY_KEY",
            "model": "typesafe/jev-test",
        }
    )
    calls: list[str] = []

    def post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append(url)
        answers = (
            {"risk": {"choice": "invalid"}}
            if "primary" in url
            else {"risk": {"choice": "high"}, "objective": {"choice": "quality"}}
        )
        return httpx.Response(
            200, request=httpx.Request("POST", url), json={"answers": answers}
        )

    monkeypatch.setattr(httpx, "post", post)
    outcome, _ = decide(config)
    assert outcome.model == LARGE_MODEL_ID
    assert outcome.reason.startswith("jev_matrix:secondary:rule_1:")
    assert calls == [
        "https://primary.example/systemone",
        "https://secondary.example/systemone",
    ]


def test_matrix_respects_manual_model_without_calling_jev(monkeypatch) -> None:
    monkeypatch.setenv("TEST_MATRIX_KEY", "key")

    def post(url: str, **kwargs: Any) -> httpx.Response:
        raise AssertionError("Manual requests must not call JEV")

    monkeypatch.setattr(httpx, "post", post)
    catalog = catalog_from_document(document(), "manual matrix")
    strategy = StrategyRegistry.from_catalog(catalog).resolve("matrix")
    signals = extract_signals([{"role": "user", "content": "hello"}])
    outcome = strategy.decide(
        RoutingRequest(signals, None, catalog.by_name(LARGE_MODEL_ID), 1, 0.0), catalog
    )
    assert outcome.model == LARGE_MODEL_ID
    assert outcome.mode == "manual"


def test_matrix_cached_session_queries_once_and_honors_pin(monkeypatch) -> None:
    monkeypatch.setenv("TEST_MATRIX_KEY", "key")
    calls = 0

    def post(url: str, **kwargs: Any) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={
                "answers": {
                    "risk": {"choice": "high"},
                    "objective": {"choice": "quality"},
                }
            },
        )

    monkeypatch.setattr(httpx, "post", post)
    config = document()
    config["strategies"]["definitions"]["matrix"]["policy"]["mode"] = "cached"
    catalog = catalog_from_document(config, "cached matrix")
    strategy = StrategyRegistry.from_catalog(catalog).resolve("matrix")
    signals = extract_signals([{"role": "user", "content": "hello"}])
    first = strategy.decide(RoutingRequest(signals, None, None, 1, 0.0), catalog)
    session = SessionState(
        session_id="s",
        route=first.model,
        tier=first.tier,
        strategy="matrix",
        created_at=0.0,
        updated_at=0.0,
        switched_at=0.0,
    )
    second = strategy.decide(RoutingRequest(signals, session, None, 2, 1.0), catalog)
    assert calls == 1
    assert first.model == second.model == LARGE_MODEL_ID
    assert second.reason == "session_pinned"


def test_matrix_falls_back_when_source_or_answers_fail(monkeypatch) -> None:
    monkeypatch.setenv("TEST_MATRIX_KEY", "key")

    def post(url: str, **kwargs: Any) -> httpx.Response:
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={"answers": {"risk": {"choice": "unexpected"}}},
        )

    monkeypatch.setattr(httpx, "post", post)
    outcome, _ = decide(document())
    assert outcome.model == SMALL_MODEL_ID
    assert outcome.reason.startswith("jev_matrix:local:fallback:")

    monkeypatch.delenv("TEST_MATRIX_KEY")
    outcome, _ = decide(document())
    assert outcome.model == SMALL_MODEL_ID
    assert outcome.reason.startswith("jev_matrix:local:fallback:")


@pytest.mark.parametrize(
    "change",
    [
        lambda opts: opts["questions"].update({"bad": {"type": "boolean"}}),
        lambda opts: opts["rules"][0]["when"].update({"unknown": "high"}),
        lambda opts: opts["rules"][0]["select"].update({"tier": "invalid"}),
    ],
)
def test_matrix_rejects_invalid_options_at_startup(change) -> None:
    config = document()
    change(config["strategies"]["definitions"]["matrix"]["options"])
    catalog = catalog_from_document(config, "test matrix")
    with pytest.raises(ValueError, match="jev_matrix|rule"):
        StrategyRegistry.from_catalog(catalog)
