"""Tests for the provider and model catalog document."""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest

from jev_gateway.catalog import (
    Catalog,
    ModelProfile,
    RoutingMode,
    catalog_from_document,
)
from tests.helpers import CATALOG_DOCUMENT, single_route_document, tier_one_document

SMALL_ID = "small-provider/vendor/small-model"
LARGE_ID = "large-provider/vendor/large-model"
ONLY_ID = "test-provider/vendor/only"


def profile(catalog: Catalog, model_id: str) -> ModelProfile:
    """Return a configured model profile, failing when it is missing."""
    found = catalog.by_name(model_id)
    assert found is not None
    return found


def test_decision_providers_parse_without_implicit_model_and_serialize_safely(monkeypatch) -> None:
    monkeypatch.setenv("TEST_DECISION_KEY", "private-decision-token")
    document = single_route_document()
    document["decision"] = {
        "enabled": True,
        "default_provider": "secondary",
        "providers": [
            {"id": name, "protocol": "system_one", "api_base": f"https://{name}.example/decide", "api_key_env": "TEST_DECISION_KEY"}
            for name in ("primary", "secondary")
        ],
    }
    catalog = catalog_from_document(document, "test catalog")
    assert catalog.decision.providers[0].model is None
    assert catalog.decision.default_provider == "secondary"
    snapshot = catalog.routing_snapshot()
    assert "jev" not in snapshot
    assert snapshot["decision"]["providers"][0]["model"] is None
    assert snapshot["decision"]["providers"][0]["has_api_key"] is True
    assert "private-decision-token" not in json.dumps(snapshot)
    assert "private-decision-token" not in repr(catalog.decision)


def test_legacy_decision_alias_preserves_effective_model() -> None:
    document = single_route_document()
    document["jev"] = {"enabled": True, "default_source": "primary", "sources": [
        {"id": "primary", "api_base": "https://decision.example/evaluate", "api_key_env": "TEST_DECISION_KEY"}
    ]}
    catalog = catalog_from_document(document, "test catalog")
    assert catalog.jev is catalog.decision
    assert catalog.decision.providers[0].protocol == "system_one"
    assert catalog.decision.providers[0].model == "typesafe/jev-1.13"
    assert catalog.as_dict()["decision"]["default_provider"] == "primary"
    assert "jev" not in catalog.as_dict()


@pytest.mark.parametrize("change, error", [
    (lambda doc: doc.update(jev={}), "both decision and jev"),
    (lambda doc: doc["decision"]["providers"][0].pop("protocol"), "protocol is required"),
    (lambda doc: doc["decision"]["providers"][0].update(protocol="unknown"), "protocol 'unknown' is not supported"),
    (lambda doc: doc["decision"].update(default_provider="missing"), "not configured"),
    (lambda doc: doc["decision"]["providers"].append(doc["decision"]["providers"][0].copy()), "more than once"),
    (lambda doc: doc["decision"]["providers"][0].update(api_key="literal"), "unknown keys: api_key"),
])
def test_decision_rejects_invalid_configuration(change, error: str) -> None:
    document = single_route_document()
    document["decision"] = {"enabled": True, "providers": [{
        "id": "primary", "protocol": "system_one", "api_base": "https://decision.example/evaluate", "api_key_env": "TEST_DECISION_KEY",
    }]}
    change(document)
    with pytest.raises(ValueError, match=error):
        catalog_from_document(document, "test catalog")


def test_catalog_indexes_models_by_provider_and_upstream_model() -> None:
    catalog = catalog_from_document(CATALOG_DOCUMENT, "test catalog")

    assert catalog.names() == [SMALL_ID, LARGE_ID]
    assert catalog.policy.tier_models["complex"] == (LARGE_ID,)
    assert [item.name for item in catalog.for_tier("standard")] == [SMALL_ID]
    assert catalog.by_name("vendor/large-model") is None


def test_models_inherit_connection_details_from_their_provider() -> None:
    catalog = catalog_from_document(CATALOG_DOCUMENT, "test catalog")
    small = profile(catalog, SMALL_ID)

    assert small.provider == "small-provider"
    assert small.model == "vendor/small-model"
    assert small.api_base == "https://small.example/v1"
    assert small.api_key == "test-key-small"
    assert small.provider_type == "openai"


def test_provider_type_is_independent_of_catalog_id() -> None:
    document = single_route_document()
    document["providers"][0]["type"] = "deepseek"
    catalog = catalog_from_document(document, "test catalog")

    assert catalog.providers[0].name == "test-provider"
    assert catalog.providers[0].type == "deepseek"
    assert profile(catalog, ONLY_ID).provider_type == "deepseek"
    assert catalog.providers[0].as_dict()["type"] == "deepseek"


@pytest.mark.parametrize("provider_type", ["", "openai/deepseek", "deep seek", "nonesuch"])
def test_provider_rejects_unknown_type(provider_type: str) -> None:
    document = single_route_document()
    document["providers"][0]["type"] = provider_type

    with pytest.raises(ValueError, match="type"):
        catalog_from_document(document, "test catalog")


def test_provider_requires_type_and_rejects_old_field() -> None:
    document = single_route_document()
    del document["providers"][0]["type"]
    with pytest.raises(ValueError, match="type"):
        catalog_from_document(document, "test catalog")
    document["providers"][0]["type"] = "openai"
    document["providers"][0]["litellm_provider"] = "deepseek"
    with pytest.raises(ValueError, match="Use type"):
        catalog_from_document(document, "test catalog")


def test_same_provider_can_supply_multiple_models_without_duplicate_credentials() -> None:
    document = single_route_document()
    second = copy.deepcopy(document["models"][0])
    second["upstream_model"] = "vendor/stronger"
    document["models"].append(second)
    document["policy"]["tier_models"] = {
        "simple": [ONLY_ID],
        "standard": [ONLY_ID, "test-provider/vendor/stronger"],
        "complex": ["test-provider/vendor/stronger"],
    }

    catalog = catalog_from_document(document, "test catalog")

    assert len(catalog.providers) == 1
    assert [item.name for item in catalog.for_tier("standard")] == [
        ONLY_ID,
        "test-provider/vendor/stronger",
    ]
    assert profile(catalog, ONLY_ID).api_key == profile(
        catalog, "test-provider/vendor/stronger"
    ).api_key


def test_capabilities_limits_and_cost_remain_model_specific() -> None:
    catalog = catalog_from_document(CATALOG_DOCUMENT, "test catalog")
    small = profile(catalog, SMALL_ID)
    large = profile(catalog, LARGE_ID)

    assert small.estimated_cost(1_000_000, 1_000_000) == pytest.approx(0.75)
    assert large.capabilities.reasoning is True
    assert small.supports(tools=False, vision=False, json_mode=True) is True
    assert small.supports(tools=True, vision=False, json_mode=True) is False
    assert small.fits_context(8000) is True
    assert small.fits_context(8001) is False
    assert large.fits_context(150_000) is True
    assert large.fits_context(300_000) is False


def test_provider_type_derives_native_completion_parameters(monkeypatch) -> None:
    document = single_route_document()
    provider = document["providers"][0]
    provider.update({
        "type": "azure",
        "params": {"api_version": "2024-10-21"},
        "param_env": {"azure_ad_token": "TEST_AZURE_TOKEN"},
    })
    del provider["api_key_env"]
    monkeypatch.setenv("TEST_AZURE_TOKEN", "private-token")

    catalog = catalog_from_document(document, "test catalog")
    route = profile(catalog, ONLY_ID)
    assert route.provider_type == "azure"
    assert route.api_key is None
    assert route.provider_params == {
        "api_version": "2024-10-21", "azure_ad_token": "private-token"
    }
    exposed = catalog.providers[0].as_dict()
    assert exposed["params"] == {"api_version": "[configured]"}
    assert exposed["param_env"] == {"azure_ad_token": "TEST_AZURE_TOKEN"}
    assert "private-token" not in str(exposed)


@pytest.mark.parametrize("key", ["model", "messages", "stream", "api_key"])
def test_provider_rejects_reserved_completion_parameters(key: str) -> None:
    document = single_route_document()
    document["providers"][0]["params"] = {key: "value"}
    with pytest.raises(ValueError, match="reserved"):
        catalog_from_document(document, "test catalog")


def test_vertex_provider_uses_native_parameters_without_api_base_or_key() -> None:
    document = single_route_document()
    provider = document["providers"][0]
    provider["type"] = "vertex_ai"
    provider["params"] = {
        "vertex_project": "example-project", "vertex_location": "us-central1"
    }
    del provider["api_base"]
    del provider["api_key_env"]

    route = profile(catalog_from_document(document, "test catalog"), ONLY_ID)
    assert route.provider_type == "vertex_ai"
    assert route.api_base is None
    assert route.api_key is None
    assert route.provider_params == {
        "vertex_project": "example-project", "vertex_location": "us-central1"
    }


def test_provider_rejects_unprotected_headers() -> None:
    document = single_route_document()
    document["providers"][0]["params"] = {
        "extra_headers": {"Authorization": "unsafe-literal"}
    }
    with pytest.raises(ValueError, match="credentials belong in param_env"):
        catalog_from_document(document, "test catalog")


def test_openai_compatible_type_requires_base_and_key() -> None:
    document = single_route_document()
    del document["providers"][0]["api_base"]
    with pytest.raises(ValueError, match="requires api_base"):
        catalog_from_document(document, "test catalog")


def test_provider_key_environment_variable_is_required(monkeypatch) -> None:
    document = single_route_document()
    document["providers"][0]["api_key_env"] = "MISSING_PROVIDER_KEY"

    monkeypatch.delenv("MISSING_PROVIDER_KEY", raising=False)
    with pytest.raises(ValueError, match="MISSING_PROVIDER_KEY"):
        catalog_from_document(document, "test catalog")

    monkeypatch.setenv("MISSING_PROVIDER_KEY", "key-from-env")
    assert profile(catalog_from_document(document, "test catalog"), ONLY_ID).api_key == (
        "key-from-env"
    )


def test_provider_rejects_literal_keys_and_model_connection_fields() -> None:
    provider_key = single_route_document()
    provider_key["providers"][0]["api_key"] = "secret"
    with pytest.raises(ValueError, match="Use api_key_env"):
        catalog_from_document(provider_key, "test catalog")

    model_connection = single_route_document(api_base="https://wrong.example/v1")
    with pytest.raises(ValueError, match="inherit connection settings"):
        catalog_from_document(model_connection, "test catalog")


def test_model_rejects_unknown_fields_and_non_boolean_capabilities() -> None:
    unknown_field = single_route_document(latency_class="fast")
    with pytest.raises(ValueError, match="unknown keys: latency_class"):
        catalog_from_document(unknown_field, "test catalog")

    invalid_capability = single_route_document(
        capabilities={"temperature": "false"}
    )
    with pytest.raises(TypeError, match="capabilities.temperature"):
        catalog_from_document(invalid_capability, "test catalog")


def test_model_must_reference_a_configured_provider() -> None:
    document = single_route_document()
    document["models"][0]["provider"] = "missing"

    with pytest.raises(ValueError, match="unknown provider"):
        catalog_from_document(document, "test catalog")


def test_tier_models_require_known_models_for_every_tier() -> None:
    document = single_route_document()
    document["policy"]["tier_models"]["complex"] = ["missing/model"]
    with pytest.raises(ValueError, match="unknown model ids"):
        catalog_from_document(document, "test catalog")

    document = single_route_document()
    del document["policy"]["tier_models"]["complex"]
    with pytest.raises(ValueError, match="missing tiers"):
        catalog_from_document(document, "test catalog")


def test_gateway_key_environment_name_is_resolved_and_hidden(monkeypatch) -> None:
    monkeypatch.setenv("LOCAL_GATEWAY_TOKEN", "gateway-secret")
    document = single_route_document()
    document["gateway"] = {
        "api_key_env": "LOCAL_GATEWAY_TOKEN",
        "session_strategy": "header",
        "session_ttl_seconds": 30,
        "max_sessions": 10,
        "decision_log_size": 20,
        "echo_requested_model": False,
    }

    catalog = catalog_from_document(document, "test catalog")

    assert catalog.gateway.api_key == "gateway-secret"
    payload = json.dumps(catalog.as_dict())
    assert "gateway-secret" not in payload
    assert catalog.as_dict()["gateway"]["has_api_key"] is True


def test_fixed_environment_configuration_is_ignored(monkeypatch) -> None:
    monkeypatch.setenv("JEV_API_BASE", "https://ignored.example/v1")
    monkeypatch.setenv("JEV_POLICY_MODE", "adaptive")

    catalog = catalog_from_document(single_route_document(), "test catalog")

    assert profile(catalog, ONLY_ID).api_base == "https://test.example/v1"
    assert catalog.policy.mode == "sticky"


def test_policy_pin_defaults_to_the_hard_requirements() -> None:
    policy = catalog_from_document(single_route_document(), "test catalog").policy

    assert policy.mode == "sticky"
    assert policy.pin.break_on == (
        "capability_gap",
        "context_pressure",
        "output_limit",
    )


def test_policy_pin_break_on_comes_from_the_document() -> None:
    document = single_route_document()
    document["policy"]["pin"] = {"break_on": ["upstream_failures", "context_pressure"]}

    policy = catalog_from_document(document, "test catalog").policy

    assert policy.pin.break_on == ("upstream_failures", "context_pressure")
    assert policy.as_dict()["pin"]["break_on"] == [
        "upstream_failures",
        "context_pressure",
    ]


def test_policy_pin_break_on_must_be_a_list() -> None:
    document = single_route_document()
    document["policy"]["pin"] = {"break_on": "context_pressure"}

    with pytest.raises(TypeError, match="pin.break_on"):
        catalog_from_document(document, "test catalog")


def test_strategy_names_must_not_conflict_with_models_or_retired_aliases() -> None:
    document = multi_strategy_document()
    document["strategies"]["auto"] = document["strategies"].pop("quality")
    with pytest.raises(ValueError, match="reserved model name"):
        catalog_from_document(document, "test catalog")

    document = multi_strategy_document()
    document["strategies"]["jev-auto"] = document["strategies"].pop("quality")
    with pytest.raises(ValueError, match="reserved model name"):
        catalog_from_document(document, "test catalog")

    document = multi_strategy_document()
    document["strategies"][SMALL_ID] = document["strategies"].pop("quality")
    with pytest.raises(ValueError, match="conflicts with a catalog model id"):
        catalog_from_document(document, "test catalog")


def test_policy_rejects_unknown_keys_at_every_level() -> None:
    document = single_route_document()
    document["policy"]["selection_mode"] = "balanced"
    with pytest.raises(ValueError, match="policy has unknown keys: selection_mode"):
        catalog_from_document(document, "test catalog")

    document = single_route_document()
    document["policy"]["escalation"] = {"max_failures": 2}
    with pytest.raises(ValueError, match="escalation has unknown keys: max_failures"):
        catalog_from_document(document, "test catalog")


def test_policy_modes_parse_to_routing_mode_members() -> None:
    document = single_route_document()
    document["policy"]["mode"] = "cached"

    policy = catalog_from_document(document, "test catalog").policy

    assert policy.mode is RoutingMode.CACHED
    assert policy.as_dict()["mode"] == "cached"


def test_scoring_rules_come_from_the_document() -> None:
    document = tier_one_document(
        scoring={
            "markers": ["排序函数"],
            "standard_threshold": 0.2,
            "complex_threshold": 0.4,
            "turn_depth_weight": 0.5,
        }
    )

    scoring = catalog_from_document(document, "test catalog").policy.scoring

    assert scoring.markers == ("排序函数",)
    assert scoring.standard_threshold == 0.2
    assert scoring.complex_threshold == 0.4
    assert scoring.turn_depth_weight == 0.5


def multi_strategy_document(**signals: Any) -> dict[str, Any]:
    """Return a compact catalog with multiple named model-routing strategies."""
    document = copy.deepcopy(CATALOG_DOCUMENT)
    document["strategies"] = {
        "task_aware": {},
        "quality": {
            "mode": "fresh",
            "selection": "quality_first",
            "tier_models": {
                "simple": [LARGE_ID],
                "standard": [LARGE_ID],
                "complex": [LARGE_ID],
            },
        },
        "economy": {
            "mode": "fresh",
            "selection": "cheapest_adequate",
            "tier_models": {"simple": [SMALL_ID], "standard": [SMALL_ID]},
        },
    }
    if signals:
        document["signals"] = signals
    return document


def test_document_signal_defaults_reach_every_strategy() -> None:
    catalog = catalog_from_document(
        multi_strategy_document(patterns_enabled=False), "test catalog"
    )

    assert catalog.signals.patterns_enabled is False
    assert catalog.policy.scoring.patterns_enabled is False
    assert {
        definition.name: definition.policy.scoring.patterns_enabled
        for definition in catalog.strategies
    } == {"task_aware": False, "quality": False, "economy": False}
    assert catalog.as_dict()["signals"] == {
        "patterns_enabled": False,
        "intent_patterns_enabled": None,
    }


def test_compact_strategy_options_are_immutable_and_round_trip() -> None:
    document = multi_strategy_document()
    options = {"attempts": 3, "fallbacks": ["small", {"enabled": True}]}
    document["strategies"]["quality"]["options"] = options

    catalog = catalog_from_document(document, "test catalog")
    quality = next(item for item in catalog.strategies if item.name == "quality")
    options["fallbacks"][1]["enabled"] = False

    assert quality.options["attempts"] == 3
    assert quality.options["fallbacks"] == ("small", {"enabled": True})
    with pytest.raises(TypeError):
        quality.options["attempts"] = 4  # type: ignore[index]
    assert catalog.as_dict()["strategies"][1]["options"] == {
        "attempts": 3,
        "fallbacks": ["small", {"enabled": True}],
    }


def test_legacy_strategy_options_do_not_become_policy_overrides() -> None:
    document = copy.deepcopy(CATALOG_DOCUMENT)
    document["strategies"] = {
        "default": "custom",
        "definitions": {
            "custom": {
                "kind": "special",
                "options": {"tier_models": "implementation-owned"},
                "policy": {"mode": "fresh"},
            }
        },
    }

    catalog = catalog_from_document(document, "test catalog")
    custom = next(item for item in catalog.strategies if item.name == "custom")

    assert custom.options == {"tier_models": "implementation-owned"}
    assert custom.policy.mode is RoutingMode.FRESH
    assert custom.policy.tier_models == {
        "simple": (SMALL_ID,),
        "standard": (SMALL_ID,),
        "complex": (LARGE_ID,),
    }


@pytest.mark.parametrize("options", [None, [], "invalid"])
def test_strategy_options_must_be_a_json_object(options: Any) -> None:
    document = multi_strategy_document()
    document["strategies"]["quality"]["options"] = options

    with pytest.raises(TypeError, match="options must be an object"):
        catalog_from_document(document, "test catalog")


def test_named_strategy_inherits_the_top_level_policy() -> None:
    document = multi_strategy_document()

    catalog = catalog_from_document(document, "test catalog")
    quality = next(item for item in catalog.strategies if item.name == "quality")
    economy = next(item for item in catalog.strategies if item.name == "economy")

    assert quality.policy.tier_models == {
        "simple": (LARGE_ID,),
        "standard": (LARGE_ID,),
        "complex": (LARGE_ID,),
    }
    assert quality.policy.scoring == catalog.policy.scoring
    assert quality.policy.mode is RoutingMode.FRESH
    assert quality.policy.selection == "quality_first"
    assert economy.policy.tier_models == {
        "simple": (SMALL_ID,),
        "standard": (SMALL_ID,),
        "complex": (LARGE_ID,),
    }
    assert economy.policy.selection == "cheapest_adequate"


def test_strategy_scoring_overrides_the_document_signal_default() -> None:
    document = multi_strategy_document(patterns_enabled=False)
    document["strategies"]["quality"]["scoring"] = {"patterns_enabled": True}

    catalog = catalog_from_document(document, "test catalog")

    assert {
        definition.name: definition.policy.scoring.patterns_enabled
        for definition in catalog.strategies
    } == {"task_aware": False, "quality": True, "economy": False}


def test_signals_stay_on_when_the_document_omits_the_block() -> None:
    catalog = catalog_from_document(CATALOG_DOCUMENT, "test catalog")

    assert catalog.signals.patterns_enabled is None
    assert catalog.policy.scoring.patterns_enabled is True


def test_signals_reject_an_unknown_key() -> None:
    document = copy.deepcopy(CATALOG_DOCUMENT)
    document["signals"] = {"pattern_enabled": False}

    with pytest.raises(ValueError, match="signals has unknown keys"):
        catalog_from_document(document, "test catalog")


def test_signals_require_a_json_boolean() -> None:
    document = copy.deepcopy(CATALOG_DOCUMENT)
    document["signals"] = {"patterns_enabled": "false"}

    with pytest.raises(TypeError, match="signals.patterns_enabled"):
        catalog_from_document(document, "test catalog")


def test_policy_snapshot_keeps_provider_keys_secret() -> None:
    payload = json.dumps(catalog_from_document(single_route_document(), "test catalog").as_dict())

    assert "test-route-key" not in payload
    assert '"api_key"' not in payload
    assert '"has_api_key": true' in payload


def test_document_intent_default_reaches_every_strategy() -> None:
    """Intent detection is separable from the scoring switch it used to share."""
    catalog = catalog_from_document(
        multi_strategy_document(
            patterns_enabled=False, intent_patterns_enabled=True
        ),
        "test catalog",
    )

    assert catalog.signals.intent_patterns_enabled is True
    assert {
        definition.name: definition.policy.scoring.detects_intent
        for definition in catalog.strategies
    } == {"task_aware": True, "quality": True, "economy": True}
    # The scoring switch it was split from is untouched.
    assert catalog.policy.scoring.patterns_enabled is False


def test_intent_default_is_inert_when_the_document_says_nothing() -> None:
    catalog = catalog_from_document(
        multi_strategy_document(patterns_enabled=False), "test catalog"
    )

    assert catalog.signals.intent_patterns_enabled is None
    assert {
        definition.name: definition.policy.scoring.intent_patterns_enabled
        for definition in catalog.strategies
    } == {"task_aware": None, "quality": None, "economy": None}
    # Unset follows patterns_enabled, so nothing changes for an existing catalog.
    assert catalog.policy.scoring.detects_intent is False


def test_a_strategy_keeps_its_own_intent_switch() -> None:
    document = multi_strategy_document(
        patterns_enabled=False, intent_patterns_enabled=True
    )
    document["strategies"]["quality"]["scoring"] = {
        "intent_patterns_enabled": False
    }
    document["strategies"]["economy"]["scoring"] = {
        "intent_patterns_enabled": None
    }

    catalog = catalog_from_document(document, "test catalog")

    assert {
        definition.name: definition.policy.scoring.detects_intent
        for definition in catalog.strategies
    } == {"task_aware": True, "quality": False, "economy": True}


@pytest.mark.parametrize("bad", ["true", 1, []])
def test_intent_default_must_be_a_boolean_or_null(bad: Any) -> None:
    document = multi_strategy_document(patterns_enabled=False)
    document["signals"]["intent_patterns_enabled"] = bad

    with pytest.raises(TypeError, match="signals.intent_patterns_enabled"):
        catalog_from_document(document, "test catalog")
