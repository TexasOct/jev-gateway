"""Tests for JEV classification inside the strategy package."""

from __future__ import annotations

import json
from typing import Any

import httpx

from jev_gateway.catalog import JevSettings, JevSource
from jev_gateway.signals import extract_signals
from jev_gateway.strategy.jev import JevClassifier


def settings(*sources: JevSource) -> JevSettings:
    return JevSettings(
        enabled=True,
        default_source=sources[0].name if sources else None,
        timeout_seconds=1.0,
        sources=sources,
    )


def source(name: str = "primary") -> JevSource:
    return JevSource(
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


def test_classifier_refines_the_tier(monkeypatch) -> None:
    monkeypatch.setenv("TEST_PRIMARY_KEY", "key")
    seen: dict[str, Any] = {}

    def post(url: str, **kwargs: Any) -> httpx.Response:
        seen["url"] = url
        seen.update(kwargs)
        return response("complex")

    monkeypatch.setattr(httpx, "post", post)
    classifier = JevClassifier(settings(source()))
    signals = extract_signals([{"role": "user", "content": "hello"}])

    refined = classifier.refine(signals)

    assert refined.tier == "complex"
    assert refined.base_tier == "complex"
    assert refined.score_tier == "complex"
    assert refined.reasons[-1] == "jev:primary:complex"
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
    classifier = JevClassifier(settings(source(), source("secondary")))
    signals = extract_signals([{"role": "user", "content": "hello"}])

    refined = classifier.refine(signals)

    assert refined.tier == "standard"
    assert calls == [
        "https://primary.example/systemone",
        "https://secondary.example/systemone",
    ]


def test_classifier_keeps_signals_when_every_source_fails(monkeypatch) -> None:
    monkeypatch.setenv("TEST_PRIMARY_KEY", "key")

    def post(url: str, **kwargs: Any) -> httpx.Response:
        request = httpx.Request("POST", url)
        raise httpx.TimeoutException("timeout", request=request)

    monkeypatch.setattr(httpx, "post", post)
    classifier = JevClassifier(settings(source()))
    signals = extract_signals([{"role": "user", "content": "hello"}])

    assert classifier.refine(signals) is signals


def test_classifier_rejects_a_non_object_response(monkeypatch) -> None:
    monkeypatch.setenv("TEST_PRIMARY_KEY", "key")

    def post(url: str, **kwargs: Any) -> httpx.Response:
        request = httpx.Request("POST", url)
        return httpx.Response(200, request=request, content=json.dumps([]).encode())

    monkeypatch.setattr(httpx, "post", post)
    classifier = JevClassifier(settings(source()))
    signals = extract_signals([{"role": "user", "content": "hello"}])

    assert classifier.refine(signals) is signals
