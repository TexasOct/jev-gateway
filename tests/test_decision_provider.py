"""Decision adapter and ordered failover tests."""

from __future__ import annotations

from typing import Any

import httpx

from jev_gateway.catalog import (
    DecisionProvider,
    DecisionSettings,
    catalog_from_document,
)
from jev_gateway.decision_provider import DecisionClient
from tests.helpers import single_route_document

QUESTIONS = {"risk": {"type": "choice", "instructions": "Choose.", "criteria": {"low": "Low", "high": "High"}}}


def settings(*, model: str | None = None, preferred: str | None = None) -> DecisionSettings:
    return DecisionSettings(True, preferred, 2.0, tuple(
        DecisionProvider(name, f"https://{name}.example/decision", f"TEST_{name.upper()}_KEY", model)
        for name in ("primary", "secondary")
    ))


def test_system_one_sends_only_configured_model_and_normalizes_answer(monkeypatch) -> None:
    monkeypatch.setenv("TEST_PRIMARY_KEY", "private-token")
    seen: list[dict[str, Any]] = []

    def post(url: str, **kwargs: Any) -> httpx.Response:
        seen.append(kwargs)
        return httpx.Response(200, request=httpx.Request("POST", url), json={
            "answers": {"risk": {"choice": "high", "reasoning": "discard"}}
        })

    monkeypatch.setattr(httpx, "post", post)
    result = DecisionClient(settings()).evaluate("prompt", QUESTIONS)
    assert result is not None
    assert result.provider == "primary"
    assert result.answers == {"risk": {"choice": "high"}}
    assert seen[0]["json"] == {"state": "prompt", "questions": QUESTIONS}
    assert seen[0]["headers"] == {"Authorization": "Bearer private-token"}
    assert seen[0]["timeout"] == 2.0

    DecisionClient(settings(model="routing-model")).evaluate("prompt", QUESTIONS)
    assert seen[1]["json"]["model"] == "routing-model"


def test_decision_failover_rejects_malformed_envelopes_and_invalid_answers(monkeypatch) -> None:
    monkeypatch.setenv("TEST_PRIMARY_KEY", "primary-token")
    monkeypatch.setenv("TEST_SECONDARY_KEY", "secondary-token")
    calls: list[str] = []

    def post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append(url)
        return httpx.Response(200, request=httpx.Request("POST", url), json={
            "answers": {"risk": {"choice": "other" if "primary" in url else "low"}}
        })

    monkeypatch.setattr(httpx, "post", post)
    client = DecisionClient(settings())
    result = client.evaluate("prompt", QUESTIONS, valid=lambda answers: answers["risk"]["choice"] in {"low", "high"})
    assert result is not None and result.provider == "secondary"
    assert calls == ["https://primary.example/decision", "https://secondary.example/decision"]

    calls.clear()
    def malformed(url: str, **kwargs: Any) -> httpx.Response:
        calls.append(url)
        return httpx.Response(200, request=httpx.Request("POST", url), json={
            "answers": {"risk": "bad"} if "primary" in url else {"risk": {"choice": "high"}}
        })
    monkeypatch.setattr(httpx, "post", malformed)
    second = client.evaluate("prompt", QUESTIONS)
    assert second is not None and second.provider == "secondary"
    assert len(calls) == 2


def test_preferred_provider_runs_first_and_legacy_model_is_sent(monkeypatch) -> None:
    monkeypatch.setenv("TEST_SECONDARY_KEY", "key")
    calls: list[dict[str, Any]] = []

    def post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append({"url": url, **kwargs})
        return httpx.Response(200, request=httpx.Request("POST", url), json={"answers": {"risk": {"choice": "low"}}})

    monkeypatch.setattr(httpx, "post", post)
    result = DecisionClient(settings(preferred="secondary")).evaluate("prompt", QUESTIONS)
    assert result is not None and result.provider == "secondary"
    assert len(calls) == 1

    document = single_route_document()
    document["jev"] = {"enabled": True, "sources": [{"id": "secondary", "api_base": "https://secondary.example/decision", "api_key_env": "TEST_SECONDARY_KEY"}]}
    legacy = catalog_from_document(document, "legacy").decision
    DecisionClient(legacy).evaluate("prompt", QUESTIONS)
    assert calls[1]["json"]["model"] == "typesafe/jev-1.13"


def test_transport_failure_falls_through_and_disabled_or_keyless_clients_stay_local(monkeypatch) -> None:
    def post(url: str, **kwargs: Any) -> httpx.Response:
        if "primary" in url:
            raise httpx.ConnectError("upstream down")
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={"answers": {"risk": {"choice": "high"}}},
        )

    monkeypatch.setattr(httpx, "post", post)
    monkeypatch.setenv("TEST_PRIMARY_KEY", "primary-token")
    monkeypatch.setenv("TEST_SECONDARY_KEY", "secondary-token")
    result = DecisionClient(settings()).evaluate("prompt", QUESTIONS)
    assert result is not None and result.provider == "secondary"

    def unexpected(url: str, **kwargs: Any) -> httpx.Response:
        raise AssertionError("No provider should be called")

    monkeypatch.setattr(httpx, "post", unexpected)
    monkeypatch.delenv("TEST_PRIMARY_KEY")
    monkeypatch.delenv("TEST_SECONDARY_KEY")
    assert DecisionClient(settings()).evaluate("prompt", QUESTIONS) is None
    assert DecisionClient(
        DecisionSettings(False, None, 2.0, settings().providers)
    ).evaluate("prompt", QUESTIONS) is None


def test_unknown_protocol_from_hand_built_settings_is_skipped(monkeypatch) -> None:
    monkeypatch.setenv("TEST_SECONDARY_KEY", "key")
    calls: list[str] = []

    def post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append(url)
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={"answers": {"risk": {"choice": "low"}}},
        )

    monkeypatch.setattr(httpx, "post", post)
    providers = (
        DecisionProvider("primary", "https://primary.example/decision", "TEST_PRIMARY_KEY", None, "future_protocol"),
        DecisionProvider("secondary", "https://secondary.example/decision", "TEST_SECONDARY_KEY"),
    )
    result = DecisionClient(DecisionSettings(True, None, 2.0, providers)).evaluate("prompt", QUESTIONS)
    assert result is not None and result.provider == "secondary"
    assert calls == ["https://secondary.example/decision"]
