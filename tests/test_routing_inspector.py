"""Routing inspector evidence, retained history and explicit diagnostic contracts."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import FrozenInstanceError, replace
from pathlib import Path
from typing import Any

import httpx
import pytest

from jev_gateway import decision_diagnostics, gateway
from jev_gateway.catalog import DecisionSettings, catalog_from_document
from jev_gateway.decision import RoutingEngine
from jev_gateway.discovery_network import DiscoveryNetworkError, JsonResponse
from jev_gateway.records import RequestMeta, SqliteRecordStore
from jev_gateway.routing_evidence import project_config_context, project_routing_evidence
from jev_gateway.strategy.decision_provider import DecisionClient
from tests.test_decision_provider import QUESTIONS, settings
from tests.test_gateway import install_completion, make_stored_config, request
from tests.test_provider_config_regressions import fixture_app
from tests.test_provider_management_api import headers
from tests.test_task_aware_matrix import LUNA, SOL, shipped_document


@pytest.mark.parametrize("failure,expected,code", [
    ("disabled", "disabled", None), ("provider", "missing_provider", None),
    ("key", "missing_key", None), ("401", "http_error", 401),
    ("404", "http_error", 404), ("429", "http_error", 429),
    ("timeout", "timeout", None), ("network", "network_error", None),
    ("json", "invalid_json", 200), ("envelope", "invalid_envelope", 200),
    ("answer", "invalid_answers", 200), ("choice", "invalid_answers", 200),
    ("extra", "invalid_answers", 200), ("accepted", "accepted", 200),
])
def test_call_evidence_has_closed_safe_statuses(monkeypatch: Any, failure: str, expected: str, code: int | None) -> None:
    secret = "private-upstream-prose-token"
    calls: list[str] = []
    configured = replace(settings(), credentials={"TEST_PRIMARY_KEY": secret})
    if failure == "disabled":
        configured = replace(configured, enabled=False)
    if failure == "provider":
        configured = DecisionSettings(enabled=True, credentials={})
    if failure == "key":
        configured = replace(configured, credentials={})

    def post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append(url)
        if failure == "timeout":
            raise httpx.ReadTimeout(secret)
        if failure == "network":
            raise httpx.ConnectError(secret)
        if failure.isdigit():
            return httpx.Response(int(failure), request=httpx.Request("POST", url), text=secret)
        if failure == "json":
            return httpx.Response(200, request=httpx.Request("POST", url), text=secret)
        answers: Any = {"risk": {"choice": "high", "reasoning": secret}}
        if failure == "answer":
            answers = {"risk": secret}
        elif failure == "choice":
            answers = {"risk": {"choice": secret}}
        elif failure == "extra":
            answers[secret] = {"choice": "high"}
        payload = [] if failure == "envelope" else {"answers": answers, "secret": secret}
        return httpx.Response(200, request=httpx.Request("POST", url), json=payload)

    monkeypatch.setattr(httpx, "post", post)
    evaluation = DecisionClient(configured, "primary").evaluate_with_evidence(secret, QUESTIONS)
    evidence = evaluation.evidence.as_dict()
    assert evidence["status"] == expected and secret not in repr(evidence)
    assert bool(calls) is (failure not in {"disabled", "provider", "key"})
    assert len(calls) <= 1  # Explicit provider is exclusive even on failure.
    if evidence["attempts"]:
        attempt = evidence["attempts"][0]
        assert set(attempt) == {"provider_id", "status", "http_status", "elapsed_ms"}
        assert attempt["provider_id"] == "primary" and attempt["http_status"] == code
        assert attempt["elapsed_ms"] >= 0
    if expected == "accepted":
        assert evidence["answers"] == {"risk": {"choice": "high"}}
        assert evaluation.result is not None
        with pytest.raises(TypeError):
            evaluation.result.answers["risk"]["choice"] = "low"  # type: ignore[index]
        with pytest.raises(FrozenInstanceError):
            evaluation.evidence.status = "other"  # type: ignore[misc]
    else:
        assert evaluation.result is None and evidence["answers"] == {}


def test_concurrent_calls_and_failover_have_separate_immutable_evidence(monkeypatch: Any) -> None:
    barrier = threading.Barrier(2)
    client = DecisionClient(replace(settings(), credentials={"TEST_PRIMARY_KEY": "one", "TEST_SECONDARY_KEY": "two"}))

    def post(url: str, **kwargs: Any) -> httpx.Response:
        state = kwargs["json"]["state"]
        if "primary" in url:
            barrier.wait(timeout=2)
            if state == "failed-primary":
                raise httpx.ReadTimeout("secret")
        return httpx.Response(200, request=httpx.Request("POST", url), json={"answers": {"risk": {"choice": "high" if state == "failed-primary" else "low"}}})

    monkeypatch.setattr(httpx, "post", post)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = list(pool.map(lambda state: client.evaluate_with_evidence(state, QUESTIONS), ["failed-primary", "success-primary"]))
    assert [a.status for a in first.evidence.attempts] == ["timeout", "accepted"]
    assert [a.status for a in second.evidence.attempts] == ["accepted"]
    assert first.evidence.answers == (("risk", "high"),) and second.evidence.answers == (("risk", "low"),)
    assert first.evidence.provider_id == "secondary" and second.evidence.provider_id == "primary"
    assert not hasattr(client, "last_error")


@pytest.mark.parametrize("answers,model,index", [
    ({"workload": "docs", "scale": "bounded", "rigor": "draft"}, LUNA, 9),
    ({"workload": "coding", "scale": "large", "rigor": "exacting"}, SOL, 3),
])
def test_fixture_rules_freeze_exact_luna_sol_evidence(monkeypatch: Any, answers: dict[str, str], model: str, index: int) -> None:
    monkeypatch.setenv("JEV_OPENROUTER_API_KEY", "synthetic")
    monkeypatch.setattr(httpx, "post", lambda url, **kwargs: httpx.Response(200, request=httpx.Request("POST", url), json={"answers": {key: {"choice": value} for key, value in answers.items()}}))
    engine = RoutingEngine(catalog_from_document(shipped_document(), "fixture"))
    decision = engine.decide(messages=[{"role": "user", "content": "synthetic"}])
    assert decision.route_name == model and decision.defaulted is False
    assert decision.evidence is not None
    evidence = decision.evidence.as_dict()
    assert evidence["rule_status"] == "matched" and evidence["matched_rule_index"] == index
    assert evidence["classification"]["answers"] == {key: {"choice": value} for key, value in answers.items()}
    assert model in evidence["pool"]["candidates"]
    assert decision.strategy_source == "default"
    assert engine.preview(messages=[], strategy="task_aware")["strategy_source"] == "explicit"


def test_failure_unmatched_defaults_and_bypasses_are_independent(monkeypatch: Any) -> None:
    monkeypatch.setenv("JEV_OPENROUTER_API_KEY", "synthetic")
    document = shipped_document()
    document["strategies"]["task_aware"]["options"]["rules"] = []
    answers = {"workload": {"choice": "docs"}, "scale": {"choice": "bounded"}, "rigor": {"choice": "draft"}}
    monkeypatch.setattr(httpx, "post", lambda url, **kwargs: httpx.Response(200, request=httpx.Request("POST", url), json={"answers": answers}))
    engine = RoutingEngine(catalog_from_document(document, "fixture"))
    unmatched = engine.decide(messages=[])
    assert unmatched.evidence is not None and unmatched.evidence.rule_status == "accepted_unmatched"
    assert unmatched.defaulted is False and unmatched.evidence.classification.status == "accepted"
    document["decision"]["enabled"] = False
    engine.reload_catalog(catalog_from_document(document, "fixture"))
    failed = engine.decide(messages=[])
    assert failed.evidence is not None and failed.evidence.rule_status == "classifier_fallback"
    assert failed.defaulted is False and failed.evidence.classification.status == "disabled"
    document["strategies"]["task_aware"]["mode"] = "cached"
    engine.reload_catalog(catalog_from_document(document, "fixture"))
    first = engine.decide(messages=[], session_id="cached")
    reused = engine.decide(messages=[], session_id="cached")
    manual = engine.decide(messages=[], session_id="cached", requested_model=first.route_name)
    assert reused.evidence is not None and reused.evidence.classification.status == "bypassed_session"
    assert manual.evidence is not None and manual.evidence.classification.status == "bypassed_manual"
    assert manual.evidence.rule_status == "manual"


def test_retained_sessions_survive_restart_and_use_recorded_config(tmp_path: Path, monkeypatch: Any) -> None:
    document = shipped_document()
    document["decision"]["enabled"] = False
    config = make_stored_config(tmp_path, gateway_api_key="management", document=document)
    engine = config.engine
    marker = "synthetic-request-body-only"
    for session in ("old/slash", "second", "third"):
        for index in range(3):
            rid = f"{session}-{index}"
            messages = [{"role": "user", "content": marker + str(index)}]
            engine.record_request(request_id=rid, session_id=session, meta=RequestMeta("/v1/chat/completions", "fixture", None, False), messages=messages, received_at=100 + index)
            decision = engine.decide(messages=messages, request_id=rid, session_id=session)
            engine.record_outcome(decision, ok=True)
    recorded_hash = engine.config_hash
    engine.close()
    # Simulate an old row without structured evidence, while retaining its reason.
    with sqlite3.connect(engine.catalog.storage.path) as database:
        database.execute("UPDATE decisions SET signals_json = '{}' WHERE request_id = ?", ("old/slash-0",))
    changed = shipped_document()
    changed["decision"]["enabled"] = True
    changed["strategies"]["task_aware"]["options"]["rules"] = []
    changed_catalog = catalog_from_document(changed, "changed")
    restarted = RoutingEngine(changed_catalog, record_store=SqliteRecordStore(engine.catalog.storage))
    config.engine = restarted
    app = gateway.create_app(config)
    auth = {"Authorization": "Bearer management"}
    try:
        assert request(app, "GET", "/v1/routing/sessions", headers=auth).json()["data"] == []
        first = request(app, "GET", "/v1/routing/sessions?scope=retained&limit=2", headers=auth).json()
        assert first["has_more"] and first["next_cursor"] and marker not in json.dumps(first)
        assert all(row["in_memory"] is False and row["request_count"] == 3 for row in first["data"])
        second = request(app, "GET", "/v1/routing/sessions", params={"scope": "retained", "limit": 2, "cursor": first["next_cursor"]}, headers=auth).json()
        assert len({row["session_id"] for row in first["data"] + second["data"]}) == 3
        assert not second["has_more"]
        assert request(app, "GET", "/v1/routing/sessions", params={"cursor": first["next_cursor"]}, headers=auth).status_code == 400
        assert request(app, "GET", "/v1/routing/sessions?scope=retained", params={"cursor": first["next_cursor"]}).status_code == 401
        assert request(app, "GET", "/v1/routing/sessions/old/slash/requests", headers=auth).status_code == 404
        path = "/v1/routing/sessions/old/slash/requests"
        details = request(app, "GET", path, params={"scope": "retained", "limit": 2}, headers=auth).json()
        assert details["in_memory"] is False and details["memory_session"] is None
        assert details["session"]["request_count"] == 3
        assert all(len(row["request"]["messages"]) == 1 for row in details["requests"])
        recorded = details["requests"][0]["decision"]
        assert recorded["routing_evidence"]["classification"]["status"] == "disabled"
        assert details["requests"][0]["outcome"]["ok"] is True
        context = recorded["config_context"]
        assert context["status"] == "available" and context["config_hash"] == recorded_hash
        assert len(context["strategy"]["rules"]) > 0 and context["decision_enabled"] is False
        assert all(text not in json.dumps(context) for text in ("api_base", "api_key_env", "providers", "api_key", marker))
        cursor = details["next_cursor"]
        last = request(app, "GET", path, params={"scope": "retained", "cursor": cursor}, headers=auth).json()["requests"][0]["decision"]
        assert "routing_evidence" not in last and "defaulted" not in last and "strategy_source" not in last
        for wrong_path, scope in [(path, "live"), ("/v1/routing/sessions/second/requests", "retained"), ("/v1/routing/sessions", "retained")]:
            assert request(app, "GET", wrong_path, params={"scope": scope, "cursor": cursor}, headers=auth).status_code == 400
        assert request(app, "GET", path, params={"scope": "retained", "cursor": cursor + "x"}, headers=auth).status_code == 400
        assert request(app, "GET", path, params={"scope": "retained", "cursor": cursor}).status_code == 401
        for limit in (0, 101):
            assert request(app, "GET", path, params={"scope": "retained", "limit": limit}, headers=auth).status_code == 400
        assert request(app, "GET", "/v1/routing/sessions/absent/requests?scope=retained", headers=auth).status_code == 404
        replacement_app = gateway.create_app(config)
        assert request(replacement_app, "GET", path, params={"scope": "retained", "cursor": cursor}, headers=auth).status_code == 400
        # Current memory is separate and never inferred from retained history.
        restarted.decide(messages=[], requested_model=LUNA, session_id="old/slash")
        present = request(app, "GET", path + "?scope=retained", headers=auth).json()
        assert present["in_memory"] is True and present["memory_session"]["session_id"] == "old/slash"
    finally:
        restarted.close()


def test_safe_projection_omits_unrecognized_signals_and_missing_context() -> None:
    assert project_routing_evidence(None) is None
    value = project_routing_evidence({"classification": {"status": "http_error", "secret": "never", "answers": {"secret": {"choice": "never"}}, "attempts": [{"provider_id": "configured", "status": "http_error", "http_status": 404, "elapsed_ms": 1, "body": "never"}]}, "rule_status": "classifier_fallback", "prompt": "never"})
    assert "never" not in repr(value) and value is not None
    assert project_config_context(None, "task_aware", "old") == {"status": "unavailable", "config_hash": "old"}
    assert project_routing_evidence({"classification": {"status": []}, "rule_status": []}) == {"matched_rule_index": None}


@pytest.mark.parametrize("scenario,status,code", [
    ("accepted", "accepted", 200), ("401", "http_error", 401),
    ("404", "http_error", 404), ("429", "http_error", 429),
    ("timeout", "timeout", None), ("invalid_json", "invalid_json", None),
    ("envelope", "invalid_envelope", 200), ("answer", "invalid_answers", 200),
    ("blocked_target", "address_error", None), ("response_too_large", "response_too_large", None),
    ("hostile", "network_error", None), ("missing", "missing_key", None),
])
def test_decision_diagnostic_is_explicit_safe_and_nonmutating(tmp_path: Path, monkeypatch: Any, scenario: str, status: str, code: int | None) -> None:
    app, config = fixture_app(tmp_path)
    generation = install_completion(monkeypatch)
    secret = "synthetic-probe-private-key"
    calls: list[dict[str, Any]] = []

    def post(url: str, body: Any, **kwargs: Any) -> JsonResponse:
        calls.append({"url": url, "body": body, **kwargs})
        assert kwargs["headers"] == {"Authorization": f"Bearer {secret}"} and kwargs["timeout"] == 5.0
        assert body["state"] == "Synthetic gateway decision connectivity check."
        if scenario == "hostile":
            raise RuntimeError(secret)
        if scenario in {"timeout", "invalid_json", "blocked_target", "response_too_large"}:
            raise DiscoveryNetworkError(scenario)
        answers = {"connectivity": {"choice": "wrong" if scenario == "answer" else "ready", "reasoning": secret}}
        return JsonResponse([] if scenario == "envelope" else {"answers": answers, "private": secret}, int(scenario) if scenario.isdigit() else 200)

    monkeypatch.setattr(decision_diagnostics, "safe_post_json", post)
    before = {path.name: path.read_bytes() for path in tmp_path.iterdir() if path.is_file()}
    environment, catalog, registry = dict(os.environ), config.engine.catalog, config.engine.strategies
    candidate = {"provider": {"id": "probe", "protocol": "system_one", "api_base": "https://decision.example/evaluate", "api_key_env": "SYNTHETIC_PROBE_ONLY_KEY"}, "credential": {"action": "clear"} if scenario == "missing" else {"action": "set", "value": secret}}
    assert request(app, "POST", "/v1/decision-connection-test", json=candidate).status_code == 401
    assert request(app, "POST", "/v1/decision-connection-test", content="[", headers={"Content-Type": "application/json"}).status_code == 401
    assert calls == []
    response = request(app, "POST", "/v1/decision-connection-test", headers=headers(config), json=candidate)
    assert response.status_code == 200 and secret not in response.text
    result = response.json()
    assert set(result) == {"provider_id", "scope", "synthetic", "generation_tested", "decision_enabled", "status", "http_status", "elapsed_ms", "answers"}
    assert result["status"] == status and result["http_status"] == code
    assert result["synthetic"] is True and result["generation_tested"] is False and result["decision_enabled"] is False
    assert bool(calls) is (scenario != "missing")
    assert generation == [] and dict(os.environ) == environment
    assert config.engine.catalog is catalog and config.engine.strategies is registry
    assert {path.name: path.read_bytes() for path in tmp_path.iterdir() if path.is_file()} == before
    request(app, "GET", "/v1/provider-configuration", headers=headers(config))
    assert len(calls) == (0 if scenario == "missing" else 1)


def test_recorded_global_default_and_literal_default_pool_are_distinct() -> None:
    from jev_gateway.request_facts import extract_request_facts
    from jev_gateway.strategy import PolicyStrategy, RoutingRequest
    from tests.helpers import LARGE_MODEL_ID, SMALL_MODEL_ID
    from tests.test_empty_tag_default import empty_tag_document

    document = empty_tag_document()
    document["policy"]["labels"]["default"] = {"models": [SMALL_MODEL_ID]}
    catalog = catalog_from_document(document, "defaults")
    strategy = PolicyStrategy("task_aware", catalog.policy)
    for label, expected, model in [("missing", True, LARGE_MODEL_ID), ("default", False, SMALL_MODEL_ID)]:
        facts = replace(extract_request_facts([]), route_label=label)
        outcome = strategy.decide(RoutingRequest(facts, None, None, 1, 0.0), catalog)
        assert outcome.defaulted is expected and outcome.model == model and outcome.tier == "default"
        assert outcome.evidence is not None and outcome.evidence.pool_label == label
        assert outcome.evidence.pool_source == ("global_default" if expected else "label_pool")
        assert outcome.evidence.classification.status == "not_applicable"


def test_saved_decision_diagnostic_uses_owned_credentials_and_no_read_probe(tmp_path: Path, monkeypatch: Any) -> None:
    from jev_gateway.provider_config import ProviderConfiguration

    document = shipped_document()
    document["decision"]["enabled"] = False
    path = tmp_path / "models.json"
    path.write_text(json.dumps(document))
    (tmp_path / "credentials.json").write_text(json.dumps({"version": 1, "values": {"JEV_OPENROUTER_API_KEY": "json-only-key"}}))
    service = ProviderConfiguration(path)
    provider, key, enabled = service.decision_probe_provider({"provider_id": "decision-example"})
    assert provider.name == "decision-example" and key == "json-only-key" and enabled is False
    provider, key, _ = service.decision_probe_provider({"provider": document["decision"]["providers"][0], "credential": {"action": "keep"}})
    assert key == "json-only-key"
    assert service.decision_probe_provider({"provider": document["decision"]["providers"][0], "credential": {"action": "clear"}})[1] != "json-only-key"
    calls = []
    monkeypatch.setattr(decision_diagnostics, "safe_post_json", lambda *args, **kwargs: calls.append(args) or JsonResponse({"answers": {"connectivity": {"choice": "ready"}}}))
    assert service.read()["decision"]["enabled"] is False and calls == []
    result = decision_diagnostics.test_decision_connection(provider, "json-only-key", decision_enabled=False)
    assert result["status"] == "accepted" and result["decision_enabled"] is False and len(calls) == 1
    for _ in range(4):
        assert decision_diagnostics._SLOTS.acquire(blocking=False)
    try:
        assert decision_diagnostics.test_decision_connection(provider, key, decision_enabled=False)["status"] == "busy"
        assert len(calls) == 1
    finally:
        for _ in range(4):
            decision_diagnostics._SLOTS.release()


@pytest.mark.parametrize("scenario,expected", [("accepted", "accepted"), ("401", "http_error"), ("302", "http_error"), ("json", "invalid_json"), ("oversize", "response_too_large")])
def test_synthetic_post_uses_pinned_bounded_transport(monkeypatch: Any, scenario: str, expected: str) -> None:
    from jev_gateway import discovery_network as network
    from jev_gateway.catalog import DecisionProvider
    from tests.test_discovery_network import Response

    body = b'{"answers":{"connectivity":{"choice":"ready"}}}'
    if scenario == "json":
        body = b"not json: upstream secret"
    if scenario == "oversize":
        body = b"x" * 65537
    status = int(scenario) if scenario.isdigit() else 200
    response = Response(status=status, body=body)
    calls = []
    monkeypatch.setattr(network, "validate_target", lambda url, **kwargs: network.ValidatedTarget("https", "decision.example", 443, "8.8.8.8", "/evaluate", "decision.example"))

    class Connection:
        sock = None

        def __init__(self, target: Any, deadline: float) -> None:
            assert target.address == "8.8.8.8" and deadline <= network.time.monotonic() + 5.0

        def connect(self) -> None:
            pass

        def request(self, method: str, target: str, *, body: bytes, headers: Any) -> None:
            calls.append((method, target))
            assert method == "POST" and target == "/evaluate" and len(body) <= 4096
            assert headers["Content-Type"] == "application/json" and headers["Authorization"] == "Bearer synthetic"

        def getresponse(self) -> Response:
            return response

        def close(self) -> None:
            pass

    monkeypatch.setattr(network, "_PinnedConnection", Connection)
    provider = DecisionProvider("saved", "https://decision.example/evaluate", "SYNTHETIC_KEY")
    result = decision_diagnostics.test_decision_connection(provider, "synthetic", decision_enabled=True)
    assert result["status"] == expected and len(calls) == 1
    if status != 200:
        assert response.body == body  # Failure bodies are never read.
    assert "upstream secret" not in repr(result)


def test_context_projection_is_bounded_and_excludes_provider_and_catalog_data() -> None:
    catalog = catalog_from_document(shipped_document(), "fixture")
    snapshot = catalog.routing_snapshot()
    snapshot["providers"][0]["params"] = {"private": "never-project"}
    snapshot["models"].append({"name": "unrelated/private-model", "tags": [], "params": {"private": "never-project"}})
    context = project_config_context(snapshot, "task_aware", "recorded")
    assert context["status"] == "available"
    assert "never-project" not in repr(context) and "unrelated/private-model" not in repr(context)
    assert "instructions" in repr(context) and "api_base" not in repr(context)
    snapshot["strategies"][0]["options"]["rules"] *= 100
    assert project_config_context(snapshot, "task_aware", "recorded")["status"] == "unavailable"


def test_http_strategy_source_tracks_default_explicit_and_session(monkeypatch: Any) -> None:
    from tests.helpers import SMALL_MODEL_ID
    from tests.test_gateway import make_config

    config = make_config(gateway_api_key="management")
    app = gateway.create_app(config)
    install_completion(monkeypatch)
    auth = {"Authorization": "Bearer management", "X-JEV-Session-Id": "source"}
    for model, expected in [(SMALL_MODEL_ID, "default"), (SMALL_MODEL_ID, "session"), ("task_aware", "explicit")]:
        response = request(app, "POST", "/v1/chat/completions", headers=auth, json={"model": model, "messages": [{"role": "user", "content": "synthetic"}]})
        assert response.status_code == 200
        decision = config.engine.decision(response.headers["X-JEV-Decision-Id"])
        assert decision is not None and decision.strategy_source == expected


def test_retained_evidence_survives_memory_eviction_without_content_capture(tmp_path: Path) -> None:
    config = make_stored_config(tmp_path, capture_content=False, gateway_api_key="management")
    engine = config.engine
    auth = {"Authorization": "Bearer management"}
    try:
        for session in ("evicted", "current"):
            engine.store.configure(ttl_seconds=1800, max_sessions=1)
            engine.record_request(request_id=session, session_id=session, meta=RequestMeta(), messages=[{"role": "user", "content": "synthetic-never-captured"}], received_at=1)
            engine.decide(messages=[], request_id=session, session_id=session)
        assert engine.store.snapshot("evicted") is None
        app = gateway.create_app(config)
        listing = request(app, "GET", "/v1/routing/sessions?scope=retained", headers=auth).json()
        assert len(listing["data"]) == 2 and "synthetic-never-captured" not in json.dumps(listing)
        details = request(app, "GET", "/v1/routing/sessions/evicted/requests?scope=retained", headers=auth).json()
        assert details["in_memory"] is False and details["requests"][0]["request"]["content_captured"] is False
        assert details["requests"][0]["request"]["messages"] is None
        assert details["requests"][0]["outcome"] is None
    finally:
        engine.close()


def test_registered_adapter_replacement_keeps_configured_identity(monkeypatch: Any) -> None:
    from jev_gateway.strategy import decision_provider
    from jev_gateway.strategy.decision_provider.base import DecisionResult

    class Replacement:
        def evaluate(self, *args: Any) -> DecisionResult:
            return DecisionResult("upstream-prose-must-not-be-identity", {"risk": {"choice": "low", "reasoning": "never"}})

    monkeypatch.setitem(decision_provider._ADAPTERS, "system_one", Replacement())
    client = DecisionClient(replace(settings(), credentials={"TEST_PRIMARY_KEY": "synthetic"}), "primary")
    evaluation = client.evaluate_with_evidence("synthetic", QUESTIONS)
    assert evaluation.result is not None and evaluation.result.provider == "primary"
    assert evaluation.evidence.provider_id == "primary"
    assert evaluation.evidence.attempts[0].http_status is None
    assert "never" not in repr(evaluation.evidence.as_dict())
    assert "upstream-prose" not in repr(evaluation.evidence.as_dict())
