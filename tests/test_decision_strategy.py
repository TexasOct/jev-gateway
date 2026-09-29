"""Tests for decision classification inside the strategy package."""

from __future__ import annotations

import json
from dataclasses import replace
from typing import Any

import httpx

from jev_gateway.catalog import (
    DecisionProvider,
    DecisionSettings,
    RoutingMode,
    RoutingPolicy,
    catalog_from_document,
)
from jev_gateway.sessions import SessionState
from jev_gateway.request_facts import extract_request_facts as extract_facts
from jev_gateway.strategy import RoutingRequest
from jev_gateway.strategy.decision_provider import DecisionClient
from jev_gateway.strategy.decision_provider.base import DecisionResult
from jev_gateway.strategy.classifier import DecisionClassifier, DecisionStrategy
from tests.helpers import CATALOG_DOCUMENT, LARGE_MODEL_ID, SMALL_MODEL_ID


def settings(*sources: DecisionProvider) -> DecisionSettings:
    return DecisionSettings(
        enabled=True,
        default_provider=sources[0].name if sources else None,
        timeout_seconds=1.0,
        providers=sources,
    )


def source(name: str = "primary") -> DecisionProvider:
    return DecisionProvider(
        name=name,
        api_base=f"https://{name}.example/systemone",
        api_key_env=f"TEST_{name.upper()}_KEY",
        model="typesafe/jev-test",
    )


def response(choice: str) -> httpx.Response:
    request = httpx.Request("POST", "https://primary.example/systemone")
    return httpx.Response(
        200,
        request=request,
        json={"answers": {"routing_tier": {"choice": choice}}},
    )


class FakeDecisionMaker:
    """A settings-free decision maker for direct strategy injection tests."""

    enabled = True

    def __init__(self, choice: str | None = "complex") -> None:
        self.choice = choice
        self.calls = 0

    def describe(self) -> dict[str, Any]:
        return {"enabled": self.enabled, "providers": []}

    def evaluate(
        self,
        state: str | dict[str, Any],
        questions: dict[str, Any],
        *,
        valid: Any = None,
    ) -> DecisionResult | None:
        self.calls += 1
        if self.choice is None:
            return None
        answers = {"routing_tier": {"choice": self.choice}}
        return DecisionResult("fake", answers) if valid is None or valid(answers) else None


def test_classifier_accepts_settings_free_decision_maker() -> None:
    maker = FakeDecisionMaker()
    classifier = DecisionClassifier(maker)
    facts = extract_facts([{"role": "user", "content": "hello"}])
    refined = classifier.refine(facts)
    assert maker.calls == 1
    assert refined.route_label == "complex"
    assert classifier.client.describe() == {"enabled": True, "providers": []}


def test_classifier_refines_the_tier(monkeypatch) -> None:
    monkeypatch.setenv("TEST_PRIMARY_KEY", "key")
    seen: dict[str, Any] = {}

    def post(url: str, **kwargs: Any) -> httpx.Response:
        seen["url"] = url
        seen.update(kwargs)
        return response("complex")

    monkeypatch.setattr(httpx, "post", post)
    classifier = DecisionClassifier(DecisionClient(settings(source())))
    facts = extract_facts([{"role": "user", "content": "hello"}])

    refined = classifier.refine(facts)

    assert refined.route_label == "complex"
    assert seen["url"] == "https://primary.example/systemone"
    assert seen["headers"] == {"Authorization": "Bearer key"}
    assert seen["timeout"] == 1.0


def test_classifier_falls_back_to_the_next_source(monkeypatch) -> None:
    monkeypatch.setenv("TEST_PRIMARY_KEY", "key-1")
    monkeypatch.setenv("TEST_SECONDARY_KEY", "key-2")
    calls: list[str] = []

    def post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append(url)
        if "primary" in url:
            request = httpx.Request("POST", url)
            raise httpx.ConnectError("down", request=request)
        return response("standard")

    monkeypatch.setattr(httpx, "post", post)
    classifier = DecisionClassifier(DecisionClient(settings(source(), source("secondary"))))
    facts = extract_facts([{"role": "user", "content": "hello"}])

    refined = classifier.refine(facts)

    assert refined.route_label == "standard"
    assert calls == [
        "https://primary.example/systemone",
        "https://secondary.example/systemone",
    ]


def test_classifier_keeps_request_facts_when_every_provider_fails(monkeypatch) -> None:
    monkeypatch.setenv("TEST_PRIMARY_KEY", "key")

    def post(url: str, **kwargs: Any) -> httpx.Response:
        request = httpx.Request("POST", url)
        raise httpx.TimeoutException("timeout", request=request)

    monkeypatch.setattr(httpx, "post", post)
    classifier = DecisionClassifier(DecisionClient(settings(source())))
    facts = extract_facts([{"role": "user", "content": "hello"}])

    assert classifier.refine(facts) is facts


def test_cached_decision_strategy_classifies_only_the_first_turn() -> None:
    class CountingClassifier(DecisionClassifier):
        def __init__(self) -> None:
            super().__init__(FakeDecisionMaker())
            self.calls = 0

        def refine(self, facts):
            self.calls += 1
            return replace(facts, route_label="complex")

    catalog = catalog_from_document(CATALOG_DOCUMENT, "test catalog")
    classifier = CountingClassifier()
    strategy = DecisionStrategy(
        "cached",
        RoutingPolicy(
            mode=RoutingMode.CACHED,
            tier_models={
                "simple": (SMALL_MODEL_ID,),
                "standard": (SMALL_MODEL_ID,),
                "complex": (LARGE_MODEL_ID,),
            },
        ),
        classifier,
    )
    first_facts = extract_facts([{"role": "user", "content": "hello"}])

    first = strategy.decide(
        RoutingRequest(
            facts=first_facts,
            session=None,
            manual=None,
            turn_index=1,
            now=0.0,
        ),
        catalog,
    )
    session = SessionState(
        session_id="session",
        route=first.model,
        tier=first.tier,
        strategy="cached",
        created_at=0.0,
        updated_at=0.0,
        switched_at=0.0,
    )
    second = strategy.decide(
        RoutingRequest(
            facts=extract_facts([{"role": "user", "content": "next"}]),
            session=session,
            manual=None,
            turn_index=2,
            now=1.0,
        ),
        catalog,
    )

    assert classifier.calls == 1
    assert first.model == LARGE_MODEL_ID
    assert second.model == LARGE_MODEL_ID
    assert second.reason == "session_pinned"


def test_classifier_rejects_a_non_object_response(monkeypatch) -> None:
    monkeypatch.setenv("TEST_PRIMARY_KEY", "key")

    def post(url: str, **kwargs: Any) -> httpx.Response:
        request = httpx.Request("POST", url)
        return httpx.Response(200, request=request, content=json.dumps([]).encode())

    monkeypatch.setattr(httpx, "post", post)
    classifier = DecisionClassifier(DecisionClient(settings(source())))
    facts = extract_facts([{"role": "user", "content": "hello"}])

    assert classifier.refine(facts) is facts
