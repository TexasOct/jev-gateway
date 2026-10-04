"""Empty label pools use the same explicit global model across strategies."""

from __future__ import annotations

import copy
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import gateway
from jev_gateway.catalog import catalog_from_document
from jev_gateway.decision import RoutingEngine, SetupIncompleteError
from jev_gateway.request_facts import extract_request_facts
from jev_gateway.sessions import SessionState
from jev_gateway.strategy import (
    DecisionClassifier, DecisionMatrixStrategy, DecisionStrategy,
    PolicyStrategy, RoutingRequest,
)
from jev_gateway.strategy.contracts import SetupIncompleteError as StrategySetupIncompleteError
from jev_gateway.strategy.decision_provider.base import DecisionResult
from tests.helpers import LARGE_MODEL_ID, SMALL_MODEL_ID, catalog_document, turns
from tests.test_gateway import install_completion, make_stored_config, request


OTHER_MODEL_ID = "large-provider/vendor/other-model"


def empty_tag_document(default_model: str | None = LARGE_MODEL_ID) -> dict[str, Any]:
    document = catalog_document(mode="fresh", selection="cheapest_adequate")
    document["policy"].pop("tier_models")
    document["policy"]["labels"] = {
        "baseline": {"models": [SMALL_MODEL_ID], "reasoning_effort": "high"},
        "missing": {"tag": "shared/unassigned", "reasoning_effort": "high"},
        "other": {"models": [OTHER_MODEL_ID], "reasoning_effort": "high"},
    }
    other = copy.deepcopy(document["models"][1])
    other.update(upstream_model="vendor/other-model", quality=1.0)
    other["cost"] = {"input_per_million": 20, "output_per_million": 40}
    document["models"].append(other)
    document["models"][1]["tags"] = ["shared/tagged-elsewhere"]
    document["policy"]["labels"]["tagged"] = {"tag": "shared/tagged-elsewhere"}
    document["defaults"] = {"default_model": default_model}
    return document


class MatchedDecisionMaker:
    enabled = True

    def __init__(self, answers: dict[str, Any] | None = None) -> None:
        self.calls = 0
        self.answers = answers or {"risk": {"choice": "high"}}

    def describe(self) -> dict[str, Any]:
        return {"enabled": True, "providers": []}

    def evaluate(
        self, state: str | dict[str, Any], questions: dict[str, Any], *,
        valid: Callable[[dict[str, Any]], bool] | None = None,
    ) -> DecisionResult:
        self.calls += 1
        answers = self.answers
        assert valid is not None and valid(answers)
        return DecisionResult("fake", answers)


def matrix_options() -> dict[str, Any]:
    return {
        "questions": {
            "risk": {
                "type": "choice", "instructions": "Assess task risk.",
                "criteria": {"low": "Routine.", "high": "High stakes."},
            },
        },
        "rules": [{"when": {"risk": "high"}, "select": {
            "label": "missing", "selection": "cheapest_adequate",
        }}],
        "fallback": {"label": "other", "selection": "quality_first"},
    }


def routing_request(label: str = "missing", session: SessionState | None = None) -> RoutingRequest:
    facts = replace(extract_request_facts(turns("hello")), route_label=label)
    return RoutingRequest(facts, session, None, 2 if session else 1, 1)


def session_from(model: str, tier: str) -> SessionState:
    return SessionState("test", model, tier, created_at=0, updated_at=0, switched_at=0)


def test_quality_economy_and_matrix_share_the_exact_global_default() -> None:
    document = empty_tag_document()
    document["strategies"] = {
        "task_aware": {},
        "quality": {"kind": "policy", "selection": "quality_first", "labels": {
            "first": {"models": [OTHER_MODEL_ID]}, "missing": {"tag": "quality/missing"},
        }},
        "economy": {"kind": "policy", "selection": "cheapest_adequate", "labels": {
            "first": {"models": [SMALL_MODEL_ID]}, "missing": {"tag": "economy/missing"},
        }},
        "matrix": {"kind": "decision_matrix", "options": matrix_options()},
    }
    catalog = catalog_from_document(document, "global inheritance")
    strategies = [PolicyStrategy(d.name, d.policy) for d in catalog.strategies[:3]]
    matrix = catalog.strategies[3]
    strategies.append(DecisionMatrixStrategy(
        matrix.name, matrix.policy, MatchedDecisionMaker(), matrix.options,
    ))

    for strategy in strategies:
        outcome = strategy.decide(routing_request(), catalog)
        assert outcome.model == LARGE_MODEL_ID
        assert outcome.tier == "default"
        assert outcome.defaulted is True
        assert "empty_tag_default" in outcome.reason
    assert strategies[-1].decide(routing_request(), catalog).reason.startswith(
        "decision_matrix:fake:rule_1:"
    )


@pytest.mark.parametrize("global_model", [None, LARGE_MODEL_ID])
def test_populated_literal_default_label_keeps_its_assigned_pool(global_model: str | None) -> None:
    document = empty_tag_document(global_model)
    document["policy"]["labels"] = {
        "baseline": {"models": [OTHER_MODEL_ID]},
        "default": {"models": [SMALL_MODEL_ID]},
        "missing": {"tag": "shared/unassigned"},
    }
    catalog = catalog_from_document(document, "literal default label")
    strategy = PolicyStrategy("task_aware", catalog.policy)
    outcome = strategy.decide(routing_request("default"), catalog)
    assert outcome.model == SMALL_MODEL_ID
    assert outcome.tier == "default"
    assert outcome.reason == "first_turn_default"
    assert outcome.defaulted is False
    if global_model is not None:
        fallback = strategy.decide(routing_request("missing"), catalog)
        assert fallback.model == global_model
        assert fallback.reason == "empty_tag_default"
        assert fallback.defaulted is True


def test_literal_default_label_capability_widening_reports_the_actual_label() -> None:
    document = empty_tag_document(OTHER_MODEL_ID)
    document["policy"]["labels"]["default"] = {"models": [SMALL_MODEL_ID]}
    catalog = catalog_from_document(document, "literal default capability widening")
    strategy = PolicyStrategy("task_aware", catalog.policy)
    routed = routing_request("default")
    outcome = strategy.decide(replace(routed, facts=replace(routed.facts, needs_vision=True)), catalog)
    assert outcome.model == LARGE_MODEL_ID
    assert outcome.tier == "tagged"
    assert outcome.reason == "tier_fallback_tagged"


@pytest.mark.parametrize("label", ["missing", "default"])
def test_global_model_is_exact_even_when_another_model_has_required_capability(label: str) -> None:
    catalog = catalog_from_document(empty_tag_document(SMALL_MODEL_ID), "exact global model")
    strategy = PolicyStrategy("task_aware", catalog.policy)
    routed = routing_request(label)
    outcome = strategy.decide(replace(routed, facts=replace(routed.facts, needs_vision=True)), catalog)

    assert outcome.model == SMALL_MODEL_ID
    assert outcome.tier == "default"


@pytest.mark.parametrize("tag", [None, "shared/unassigned"])
def test_implicit_scoped_and_custom_empty_tags_use_global_default(tag: str | None) -> None:
    document = empty_tag_document()
    document["policy"]["labels"]["missing"] = {} if tag is None else {"tag": tag}
    catalog = catalog_from_document(document, "empty scoped tag")
    outcome = PolicyStrategy("task_aware", catalog.policy).decide(routing_request(), catalog)

    assert outcome.model == LARGE_MODEL_ID
    assert outcome.tier == "default"
    assert outcome.reason == "empty_tag_default"


@pytest.mark.parametrize("default_model", [None, "omitted"])
def test_unset_global_default_rejects_empty_pool_but_populated_pool_still_routes(default_model: str | None) -> None:
    document = empty_tag_document(None)
    if default_model == "omitted":
        document.pop("defaults")
    catalog = catalog_from_document(document, "unset global default")
    strategy = PolicyStrategy("task_aware", catalog.policy)

    with pytest.raises(SetupIncompleteError):
        strategy.decide(routing_request(), catalog)
    populated = strategy.decide(routing_request("baseline"), catalog)
    assert populated.model == SMALL_MODEL_ID
    assert populated.tier == "baseline"
    assert SetupIncompleteError is StrategySetupIncompleteError


def test_populated_label_still_widens_for_capabilities_without_global_default() -> None:
    catalog = catalog_from_document(empty_tag_document(None), "populated widening")
    strategy = PolicyStrategy("task_aware", catalog.policy)
    routed = routing_request("baseline")
    outcome = strategy.decide(replace(routed, facts=replace(routed.facts, needs_vision=True)), catalog)

    assert outcome.model == LARGE_MODEL_ID
    assert outcome.tier == "tagged"
    assert outcome.reason == "tier_fallback_tagged"


def test_manual_route_still_works_when_matched_pool_and_global_default_are_unset() -> None:
    catalog = catalog_from_document(empty_tag_document(None), "manual empty label")
    strategy = PolicyStrategy("task_aware", catalog.policy)
    outcome = strategy.decide(replace(routing_request(), manual=catalog.by_name(LARGE_MODEL_ID)), catalog)

    assert outcome.model == LARGE_MODEL_ID
    assert outcome.tier == "tagged"
    assert outcome.mode == "manual"
    assert outcome.reason == "manual_override"


def test_global_default_does_not_replace_a_populated_label() -> None:
    catalog = catalog_from_document(empty_tag_document(SMALL_MODEL_ID), "populated label")
    strategy = PolicyStrategy("task_aware", catalog.policy)
    outcome = strategy.decide(routing_request("tagged"), catalog)

    assert outcome.model == LARGE_MODEL_ID
    assert outcome.tier == "tagged"
    assert outcome.reason == "first_turn_tagged"


@pytest.mark.parametrize("mode", ["sticky", "cached", "escalate", "fresh"])
def test_empty_initial_pool_and_continuation_keep_default_context(mode: str) -> None:
    document = empty_tag_document()
    document["policy"]["mode"] = mode
    catalog = catalog_from_document(document, "default continuation")
    strategy = PolicyStrategy("task_aware", catalog.policy)
    first = strategy.decide(routing_request(), catalog)
    second = strategy.decide(routing_request(session=session_from(first.model, first.tier)), catalog)

    assert first.model == second.model == LARGE_MODEL_ID
    assert first.tier == second.tier == "default"
    assert first.reason == "empty_tag_default"
    assert second.switched_from is None
    if mode == "fresh":
        assert second.reason == "per_turn_policy:empty_tag_default"


def test_fresh_later_empty_pool_changes_label_even_when_model_is_unchanged() -> None:
    catalog = catalog_from_document(empty_tag_document(), "fresh empty label")
    strategy = PolicyStrategy("task_aware", catalog.policy)
    first = strategy.decide(routing_request("tagged"), catalog)
    second = strategy.decide(routing_request(session=session_from(first.model, first.tier)), catalog)

    assert first.model == second.model == LARGE_MODEL_ID
    assert first.tier == "tagged"
    assert second.tier == "default"
    assert second.reason == "per_turn_policy:empty_tag_default"
    assert second.switched_from is None


@pytest.mark.parametrize("mode", ["sticky", "cached", "escalate"])
def test_default_session_hard_requirement_and_failure_escalation_are_safe(mode: str) -> None:
    document = empty_tag_document(SMALL_MODEL_ID)
    document["policy"]["mode"] = mode
    document["policy"]["pin"] = {"break_on": ["capability_gap", "upstream_failures"]}
    catalog = catalog_from_document(document, "default escalation")
    strategy = PolicyStrategy("task_aware", catalog.policy)
    session = session_from(SMALL_MODEL_ID, "default")
    session.consecutive_failures = 2
    routed = routing_request(session=session)
    outcome = strategy.decide(replace(routed, facts=replace(routed.facts, needs_vision=True)), catalog)

    assert outcome.model == OTHER_MODEL_ID
    assert outcome.tier == "other"
    assert outcome.reason == "upstream_failures"
    assert outcome.switched_from == SMALL_MODEL_ID


def test_matrix_cached_empty_pool_queries_once_and_keeps_global_label() -> None:
    document = empty_tag_document()
    document["policy"]["mode"] = "cached"
    catalog = catalog_from_document(document, "cached matrix default")
    maker = MatchedDecisionMaker()
    strategy = DecisionMatrixStrategy("matrix", catalog.policy, maker, matrix_options())
    first = strategy.decide(routing_request(), catalog)
    second = strategy.decide(routing_request(session=session_from(first.model, first.tier)), catalog)

    assert maker.calls == 1
    assert first.model == second.model == LARGE_MODEL_ID
    assert first.tier == second.tier == "default"
    assert first.reason == "decision_matrix:fake:rule_1:empty_tag_default"
    assert second.reason == "session_pinned"


def test_matrix_fresh_later_empty_rule_preserves_evidence_and_default_label() -> None:
    catalog = catalog_from_document(empty_tag_document(), "fresh matrix default")
    maker = MatchedDecisionMaker({"risk": {"choice": "low"}})
    options = matrix_options()
    options["rules"].append({"when": {"risk": "low"}, "select": {"label": "tagged"}})
    strategy = DecisionMatrixStrategy("matrix", catalog.policy, maker, options)
    first = strategy.decide(routing_request(), catalog)
    maker.answers["risk"]["choice"] = "high"
    second = strategy.decide(routing_request(session=session_from(first.model, first.tier)), catalog)

    assert maker.calls == 2
    assert first.model == second.model == LARGE_MODEL_ID
    assert first.tier == "tagged"
    assert second.tier == "default"
    assert second.reason == "decision_matrix:fake:rule_1:per_turn_policy:empty_tag_default"
    assert second.switched_from is None


def test_matrix_unset_global_cannot_substitute_its_populated_fallback() -> None:
    catalog = catalog_from_document(empty_tag_document(None), "matrix without global")
    strategy = DecisionMatrixStrategy("matrix", catalog.policy, MatchedDecisionMaker(), matrix_options())

    with pytest.raises(SetupIncompleteError):
        strategy.decide(routing_request(), catalog)


def test_classifier_cached_empty_pool_inherits_global_model_once() -> None:
    document = empty_tag_document()
    document["policy"]["mode"] = "cached"
    catalog = catalog_from_document(document, "cached classifier default")
    maker = MatchedDecisionMaker({"routing_tier": {"choice": "missing"}})
    strategy = DecisionStrategy("task_aware", catalog.policy, DecisionClassifier(maker))
    first = strategy.decide(routing_request("baseline"), catalog)
    second = strategy.decide(routing_request("baseline", session_from(first.model, first.tier)), catalog)

    assert maker.calls == 1
    assert first.model == second.model == LARGE_MODEL_ID
    assert first.tier == second.tier == "default"
    assert first.reason == "empty_tag_default"
    assert second.reason == "session_pinned"


@pytest.mark.parametrize("ladder, expected, source", [
    (["low", "medium", "high"], "medium", "derived"),
    (["high"], "high", "derived"),
    ([], None, "undeclared"),
])
def test_default_reasoning_uses_policy_fallback_and_selected_model_ladder(ladder: list[str], expected: str | None, source: str) -> None:
    document = empty_tag_document()
    document["policy"]["labels"] = {"missing": {"tag": "shared/unassigned", "reasoning_effort": "high"}}
    document["policy"]["reasoning"] = {"mode": "override", "fallback": "medium"}
    document["models"][1]["capabilities"]["reasoning_effort"] = ladder
    engine = RoutingEngine(catalog_from_document(document, "default reasoning"))

    preview = engine.preview(messages=turns("hello"))
    decision = engine.decide(messages=turns("hello"))

    assert decision.label == preview["label"] == "default"
    assert decision.reasoning_effort == preview["reasoning_effort"] == expected
    assert decision.reasoning_effort_source == preview["reasoning_effort_source"] == source


def test_preview_headers_retained_decisions_and_sessions_report_default(monkeypatch, tmp_path: Path) -> None:
    calls = install_completion(monkeypatch)
    document = empty_tag_document()
    document["policy"]["labels"] = {"missing": {"tag": "shared/unassigned"}, "tagged": {"tag": "shared/tagged-elsewhere"}}
    config = make_stored_config(tmp_path, document=document)
    app = gateway.create_app(config)
    payload = {"model": "task_aware", "messages": turns("hello")}
    try:
        preview_response = request(app, "POST", "/v1/routing/preview", json=payload)
        assert preview_response.status_code == 200
        preview = preview_response.json()["preview"][0]
        assert preview["label"] == preview["tier"] == "default"
        assert preview["route"] == LARGE_MODEL_ID
        assert calls == []
        assert len(config.engine.store) == 0

        completion = request(app, "POST", "/v1/chat/completions", headers={"X-JEV-Session-Id": "global-default"}, json=payload)
        assert completion.status_code == 200
        assert completion.headers["x-jev-task-type"] == "default"
        assert completion.headers["x-jev-route"] == LARGE_MODEL_ID
        assert calls[0]["model"] == "openai/vendor/large-model"
        decision_id = completion.headers["x-jev-decision-id"]
        decision = request(app, "GET", f"/v1/routing/decisions/{decision_id}").json()
        session = request(app, "GET", "/v1/routing/sessions/global-default").json()
        listing = request(app, "GET", "/v1/routing/sessions").json()["data"][0]
        retained = request(app, "GET", "/v1/routing/sessions/global-default/requests").json()

        for projection in (decision, session, listing, retained["session"], retained["requests"][0]["decision"]):
            assert projection["label"] == "default"
        for projection in (decision, session, listing, retained["session"], retained["requests"][0]["decision"]):
            assert projection["defaulted"] is True
        assert decision["tier"] == session["tier"] == "default"
        assert session["events"][-1]["tier"] == "default"
        assert session["events"][-1]["defaulted"] is True
        assert retained["requests"][0]["decision"]["reason"] == "empty_tag_default"
    finally:
        config.engine.close()


@pytest.mark.parametrize("stored", [False, True])
@pytest.mark.parametrize("global_source", [False, True])
def test_session_list_preserves_global_and_literal_default_source(
    monkeypatch, tmp_path: Path, stored: bool, global_source: bool,
) -> None:
    install_completion(monkeypatch)
    document = empty_tag_document()
    labels = {
        "missing": {"tag": "shared/unassigned"},
        "default": {"models": [SMALL_MODEL_ID]},
    }
    document["policy"]["labels"] = labels if global_source else dict(reversed(list(labels.items())))
    config = (
        make_stored_config(tmp_path, document=document) if stored else
        gateway.GatewayConfig(
            engine=RoutingEngine(catalog_from_document(document, "list source")),
            gateway_api_key=None, session_strategy="derived",
        )
    )
    app = gateway.create_app(config)
    try:
        completion = request(app, "POST", "/v1/chat/completions", headers={
            "X-JEV-Session-Id": "list-source",
        }, json={"model": "task_aware", "messages": turns("hello")})
        assert completion.status_code == 200
        listing = request(app, "GET", "/v1/routing/sessions").json()
        row = listing["data"][0]
        assert row["label"] == "default"
        assert row["defaulted"] is global_source
        assert row["route"] == (LARGE_MODEL_ID if global_source else SMALL_MODEL_ID)
        assert listing["evidence_available"] is stored
    finally:
        config.engine.close()


def test_session_list_does_not_attach_live_source_to_unknown_retained_selection(
    monkeypatch, tmp_path: Path,
) -> None:
    install_completion(monkeypatch)
    document = empty_tag_document()
    document["policy"]["labels"] = {"missing": {"tag": "shared/unassigned"}}
    config = make_stored_config(tmp_path, document=document)
    app = gateway.create_app(config)
    try:
        completion = request(app, "POST", "/v1/chat/completions", headers={
            "X-JEV-Session-Id": "legacy-source",
        }, json={"model": "task_aware", "messages": turns("hello")})
        assert completion.status_code == 200
        snapshot = config.engine.session_snapshot("legacy-source")
        assert snapshot is not None and snapshot["defaulted"] is True
        original = config.engine.record_store.latest_session_evidence

        def legacy_evidence(session_ids):
            evidence = original(session_ids)
            evidence["legacy-source"]["latest_decision"].pop("defaulted")
            return evidence

        monkeypatch.setattr(config.engine.record_store, "latest_session_evidence", legacy_evidence)
        row = request(app, "GET", "/v1/routing/sessions").json()["data"][0]
        assert row["label"] == "default"
        assert "defaulted" not in row
    finally:
        config.engine.close()


def test_unassigned_route_without_global_returns_503_before_generation(monkeypatch) -> None:
    calls = install_completion(monkeypatch)
    document = empty_tag_document(None)
    document["policy"]["labels"] = {"missing": {"tag": "shared/unassigned"}}
    engine = RoutingEngine(catalog_from_document(document, "no global default"))
    app = gateway.create_app(gateway.GatewayConfig(
        engine=engine, gateway_api_key=None, session_strategy="derived",
    ))
    payload = {"model": "task_aware", "messages": turns("hello")}

    for endpoint in ("/v1/routing/preview", "/v1/chat/completions"):
        response = request(app, "POST", endpoint, json=payload)
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "setup_incomplete"
    assert calls == []
    assert len(engine.store) == 0


@pytest.mark.parametrize("mode", ["sticky", "cached", "escalate"])
@pytest.mark.parametrize("global_source", [True, False])
def test_source_and_reasoning_survive_event_eviction_with_literal_default_label(
    mode: str, global_source: bool,
) -> None:
    document = empty_tag_document()
    document["policy"]["mode"] = mode
    document["policy"]["labels"] = {
        "missing": {"tag": "shared/unassigned"},
        "default": {"models": [SMALL_MODEL_ID], "reasoning_effort": "high"},
    }
    document["policy"]["reasoning"] = {
        "mode": "override", "fallback": "medium",
        "effort_by_label": {"default": "high"},
    }
    for model in document["models"]:
        model["capabilities"]["reasoning_effort"] = ["low", "medium", "high"]
    engine = RoutingEngine(catalog_from_document(document, "source collision"))
    first = engine.decide(
        messages=turns("hello"), session_id="source",
        requested_model=None if global_source else SMALL_MODEL_ID,
    )
    assert first.tier == "default"
    assert first.defaulted is global_source
    for _ in range(45):
        preview = engine.preview(messages=turns("hello"), session_id="source")
        decision = engine.decide(messages=turns("hello"), session_id="source")
        assert decision.defaulted is preview["defaulted"] is global_source
        assert decision.reasoning_effort == preview["reasoning_effort"] == (
            "medium" if global_source else "high"
        )
        assert decision.route_name == (LARGE_MODEL_ID if global_source else SMALL_MODEL_ID)
    session = engine.session_snapshot("source")
    assert session is not None
    assert len(session["events"]) == 40
    assert session["defaulted"] is global_source
    assert all(event["defaulted"] is global_source for event in session["events"])


@pytest.mark.parametrize("matrix", [False, True])
def test_escalation_into_empty_pool_keeps_source_and_rule_evidence(matrix: bool) -> None:
    document = empty_tag_document()
    document["policy"]["mode"] = "escalate"
    catalog = catalog_from_document(document, "empty escalation")
    session = session_from(SMALL_MODEL_ID, "baseline")
    session.defaulted = False
    session.consecutive_truncations = 2
    strategy = (
        DecisionMatrixStrategy("matrix", catalog.policy, MatchedDecisionMaker(), matrix_options())
        if matrix else PolicyStrategy("task_aware", catalog.policy)
    )
    outcome = strategy.decide(routing_request(session=session), catalog)
    assert outcome.model == LARGE_MODEL_ID
    assert outcome.tier == "default"
    assert outcome.defaulted is True
    assert outcome.reason == (
        "decision_matrix:fake:rule_1:output_truncated:empty_tag_default"
        if matrix else "output_truncated:empty_tag_default"
    )


@pytest.mark.parametrize("literal, marker, expected", [
    (False, False, True), (True, False, False), (True, True, True),
])
def test_legacy_session_source_uses_marker_or_unambiguous_label(
    literal: bool, marker: bool, expected: bool,
) -> None:
    document = empty_tag_document()
    document["policy"]["mode"] = "cached"
    if literal:
        document["policy"]["labels"]["default"] = {"models": [SMALL_MODEL_ID]}
    catalog = catalog_from_document(document, "legacy source")
    session = session_from(LARGE_MODEL_ID if expected else SMALL_MODEL_ID, "default")
    if marker:
        session.record_event({"type": "decision", "reason": "empty_tag_default"})
    outcome = PolicyStrategy("task_aware", catalog.policy).decide(routing_request(session=session), catalog)
    assert outcome.defaulted is expected


@pytest.mark.parametrize("global_model", [None, LARGE_MODEL_ID])
def test_routing_configuration_projects_global_default_without_pool_membership(
    tmp_path: Path, global_model: str | None,
) -> None:
    import json

    document = empty_tag_document(global_model)
    document["strategies"] = {"task_aware": {"kind": "policy"}}
    config = make_stored_config(tmp_path, document=document)
    config.models_file = tmp_path / "models.json"
    config.models_file.write_text(json.dumps(document))
    before = config.models_file.read_bytes()
    try:
        response = request(gateway.create_app(config), "GET", "/v1/routing/configuration")
        assert response.status_code == 200
        body = response.json()
        assert body["defaults"] == {"default_model": global_model}
        assert next(label for label in body["labels"] if label["name"] == "missing")["models"] == []
        assert "defaults" not in body["overlay"]
        assert config.models_file.read_bytes() == before
    finally:
        config.engine.close()
