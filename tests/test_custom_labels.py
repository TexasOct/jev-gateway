"""Strategy-local labels and legacy catalog compatibility."""

from __future__ import annotations

import copy
from dataclasses import replace

import httpx
import pytest

from jev_gateway.catalog import JevSettings, JevSource, catalog_from_document
from jev_gateway.decision import RoutingEngine
from jev_gateway.sessions import MemorySessionStore, SessionState
from jev_gateway.signals import extract_signals
from jev_gateway.strategy import (
    JevClassifier,
    PolicyStrategy,
    RoutingRequest,
    StrategyRegistry,
)
from tests.helpers import (
    CATALOG_DOCUMENT,
    LARGE_MODEL_ID,
    SMALL_MODEL_ID,
    FakeClock,
    turns,
)


def custom_document() -> dict:
    document = copy.deepcopy(CATALOG_DOCUMENT)
    document["policy"].pop("tier_models")
    document["policy"]["labels"] = {
        "quick": {"models": [SMALL_MODEL_ID], "score": 0, "description": "Quick tasks"},
        "work": {"models": [SMALL_MODEL_ID], "score": 0.2, "description": "Normal work"},
        "thorough": {"models": [LARGE_MODEL_ID], "score": 0.5, "description": "Thorough work"},
        "audit": {"models": [LARGE_MODEL_ID], "score": 0.8, "description": "Security audits", "reasoning_effort": "high"},
    }
    document["strategies"] = {
        "task_aware": {},
        "economy": {
            "kind": "policy", "mode": "fresh",
            "labels": {
                "cheap": {"models": [SMALL_MODEL_ID], "score": 0, "description": "Cheap tasks"},
                "expensive": {"models": [LARGE_MODEL_ID], "score": 0.6, "description": "Expensive tasks"},
            },
        }
    }
    return document


def tag_document() -> dict:
    document = custom_document()
    document["policy"]["labels"] = {
        "quick": {"score": 0, "description": "Quick tasks"},
        "deep": {"score": 0.6, "description": "Deep tasks"},
    }
    document["strategies"]["economy"]["labels"] = {
        "cheap": {"score": 0, "description": "Cheap tasks"},
        "expensive": {"score": 0.6, "description": "Expensive tasks"},
    }
    document["models"][0]["tags"] = ["task_aware/quick", "economy/cheap"]
    document["models"][1]["tags"] = ["task_aware/deep", "economy/expensive"]
    return document


def test_named_strategy_replaces_labels_and_four_label_order() -> None:
    catalog = catalog_from_document(custom_document(), "test")
    assert list(catalog.policy.labels) == ["quick", "work", "thorough", "audit"]
    assert list(catalog.strategies[1].policy.labels) == ["cheap", "expensive"]
    strategy = PolicyStrategy("task_aware", catalog.policy)
    signals = extract_signals(turns("hello"))
    assert strategy._signal_label(replace(signals, score=0.55)) == "thorough"
    assert strategy._signal_label(replace(signals, score=0.85)) == "audit"
    assert strategy._signal_label(replace(signals, score=0.01, markers=("audit",))) == "audit"
    assert strategy._raise_tier("work") == "thorough"
    assert strategy._lower_tier("audit") == "thorough"
    assert StrategyRegistry.from_catalog(catalog).get("economy").decide(
        RoutingRequest(replace(signals, score=0.8), None, None, 1, 0), catalog
    ).tier == "expensive"


@pytest.mark.parametrize("mutation, error", [
    (lambda p: p.update(tier_models={}), "mix labels and tier_models"),
    (lambda p: p["labels"]["quick"].update(models=[]), "models"),
    (lambda p: p["labels"]["quick"].update(models=["missing/model"]), "unknown model"),
    (lambda p: p["labels"]["work"].update(score=0), "score"),
    (lambda p: p["labels"]["work"].update(score=2), "score"),
])
def test_invalid_labels(mutation, error: str) -> None:
    document = custom_document()
    mutation(document["policy"])
    with pytest.raises(ValueError, match=error):
        catalog_from_document(document, "test")


def test_named_strategy_without_labels_inherits_default_scoped_pools() -> None:
    document = tag_document()
    document["strategies"]["mirror"] = {
        "kind": "policy",
        "mode": "fresh",
        "selection": "quality_first",
    }

    catalog = catalog_from_document(document, "tags")
    mirror = StrategyRegistry.from_catalog(catalog).get("mirror")
    signals = replace(extract_signals(turns("hello")), score=0.8)
    outcome = mirror.decide(RoutingRequest(signals, None, None, 1, 0), catalog)

    assert outcome.model == LARGE_MODEL_ID
    assert outcome.tier == "deep"
    assert catalog.strategies[-1].policy.labels["deep"].tag == "task_aware/deep"


def test_models_can_route_only_by_scoped_tags() -> None:
    catalog = catalog_from_document(tag_document(), "tags")
    signals = extract_signals(turns("hello"))
    registry = StrategyRegistry.from_catalog(catalog)

    default = registry.get("task_aware").decide(
        RoutingRequest(replace(signals, score=0.8), None, None, 1, 0), catalog
    )
    economy = registry.get("economy").decide(
        RoutingRequest(replace(signals, score=0.8), None, None, 1, 0), catalog
    )

    assert default.model == LARGE_MODEL_ID
    assert default.tier == "deep"
    assert economy.model == LARGE_MODEL_ID
    assert economy.tier == "expensive"
    large = catalog.by_name(LARGE_MODEL_ID)
    assert large is not None
    assert large.tags == ("task_aware/deep", "economy/expensive")


def test_label_can_override_its_default_scoped_tag() -> None:
    document = tag_document()
    document["policy"]["labels"]["deep"]["tag"] = "shared/high"
    document["models"][1]["tags"].append("shared/high")
    document["models"][1]["tags"].remove("task_aware/deep")

    catalog = catalog_from_document(document, "tags")
    assert catalog.policy.labels["deep"].tag == "shared/high"
    assert [profile.name for profile in catalog.for_tier("deep")] == [LARGE_MODEL_ID]


@pytest.mark.parametrize(
    "mutation, error",
    [
        (
            lambda d: d["policy"]["labels"]["quick"].update(
                models=[SMALL_MODEL_ID]
            ),
            "both models and tag",
        ),
        (
            lambda d: d["models"][0].update(tags=["task_aware/quick", "task_aware/quick"]),
            "more than once",
        ),
        (lambda d: d["models"][0].update(tags=["default//quick"]), "segments"),
        (
            lambda d: d["models"][1].update(tags=["economy/expensive"]),
            "no model declares",
        ),
    ],
)
def test_invalid_scoped_tags(mutation, error: str) -> None:
    document = tag_document()
    if "both models" in error:
        document["policy"]["labels"]["quick"]["tag"] = "task_aware/quick"
    mutation(document)
    with pytest.raises(ValueError, match=error):
        catalog_from_document(document, "tags")


def test_legacy_tiers_still_load() -> None:
    catalog = catalog_from_document(copy.deepcopy(CATALOG_DOCUMENT), "legacy")
    assert list(catalog.policy.labels) == ["simple", "standard", "complex"]
    assert catalog.policy.labels["complex"].models == (LARGE_MODEL_ID,)
    snapshot = catalog.policy.as_dict()
    assert snapshot["tier_models"]["complex"] == [LARGE_MODEL_ID]
    assert snapshot["reasoning"]["effort_by_tier"]["complex"] == "high"


def test_legacy_tiers_keep_custom_scoring_thresholds() -> None:
    document = copy.deepcopy(CATALOG_DOCUMENT)
    document["policy"]["scoring"] = {
        "standard_threshold": 0.1,
        "complex_threshold": 0.9,
        "long_prompt_chars": 1,
        "long_prompt_weight": 0.2,
    }
    catalog = catalog_from_document(document, "legacy")
    strategy = StrategyRegistry.from_catalog(catalog).get("task_aware")
    signals = extract_signals(turns("hello"), scoring=strategy.scoring)

    assert signals.score == 0.2
    assert signals.tier == "standard"
    outcome = strategy.decide(RoutingRequest(signals, None, None, 1, 0), catalog)
    assert outcome.tier == "standard"
    assert outcome.model == SMALL_MODEL_ID


def test_fresh_mode_updates_label_when_model_does_not_change() -> None:
    document = tag_document()
    document["policy"]["mode"] = "fresh"
    document["models"][0]["tags"].append("task_aware/deep")
    document["models"][1]["tags"].remove("task_aware/deep")
    catalog = catalog_from_document(document, "tags")
    strategy = StrategyRegistry.from_catalog(catalog).get("task_aware")
    quick = extract_signals(turns("hello"))
    first = strategy.decide(RoutingRequest(quick, None, None, 1, 0), catalog)
    session = SessionState(
        "fresh",
        first.model,
        first.tier,
        created_at=0,
        updated_at=0,
        switched_at=0,
    )
    deep = replace(quick, score=0.8)
    second = strategy.decide(RoutingRequest(deep, session, None, 2, 1), catalog)

    assert first.model == second.model == SMALL_MODEL_ID
    assert first.tier == "quick"
    assert second.tier == "deep"
    assert second.switched_from is None


def test_jev_criteria_use_active_labels(monkeypatch) -> None:
    document = custom_document()
    catalog = catalog_from_document(document, "test")
    settings = JevSettings(True, sources=(JevSource("test", "https://example.com", "JEV_TEST_KEY"),))
    classifier = JevClassifier(settings)
    classifier.policy = catalog.policy
    monkeypatch.setenv("JEV_TEST_KEY", "token")
    seen = []

    def post(url, **kwargs):
        seen.append(kwargs["json"]["questions"]["routing_tier"]["criteria"])
        return httpx.Response(200, json={"answers": {"routing_tier": {"choice": "audit"}}}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", post)
    refined = classifier.refine(extract_signals(turns("hello")))
    assert seen == [{"quick": "Quick tasks", "work": "Normal work", "thorough": "Thorough work", "audit": "Security audits"}]
    assert refined.route_label == "audit"


def test_old_session_label_recovers_and_reasoning_label_wins() -> None:
    document = custom_document()
    document["models"][1]["capabilities"]["reasoning_effort"] = ["low", "medium", "high"]
    document["policy"]["reasoning"] = {"effort_by_label": {"audit": "low"}}
    catalog = catalog_from_document(document, "test")
    clock = FakeClock()
    store = MemorySessionStore(clock=clock)
    engine = RoutingEngine(catalog, store=store, clock=clock)
    store.put(SessionState("old", SMALL_MODEL_ID, "removed", created_at=clock(), updated_at=clock(), switched_at=clock()))
    recovered = engine.decide(messages=turns("hello"), session_id="old")
    assert recovered.label == "quick"
    assert recovered.as_dict()["label"] == "quick"
    snapshot = engine.session_snapshot("old")
    assert snapshot is not None
    assert snapshot["label"] == "quick"
    audit = engine.decide(messages=turns("hello"), strategy="task_aware", session_id=None, requested_model=LARGE_MODEL_ID)
    assert audit.label in catalog.policy.labels
    direct = engine.decide(messages=turns("audit security architecture"))
    assert direct.label == "audit"
    assert direct.reasoning_effort == "high"
