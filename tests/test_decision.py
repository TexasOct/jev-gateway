"""Tests for first-turn routing and in-session re-routing."""

from __future__ import annotations

import pytest

from jev_gateway.decision import UnknownModelError
from tests.helpers import (
    COMPLEX_PROMPT,
    SIMPLE_PROMPT,
    turns,
)
from tests.helpers import LARGE_MODEL_ID as LARGE_ID
from tests.helpers import SMALL_MODEL_ID as SMALL_ID

CORRECTION = "不对，这个结果有误，重新来。"
REASONING = "Think step by step about this problem."


def test_first_turn_simple_uses_the_simple_route(catalog, make_engine) -> None:
    engine = make_engine(catalog)

    decision = engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    assert decision.route_name == SMALL_ID
    assert decision.tier == "simple"
    assert decision.reason == "first_turn_simple"
    assert decision.mode == "auto"
    assert decision.switched_from is None
    assert decision.candidates == (SMALL_ID, LARGE_ID)


def test_first_turn_complex_uses_the_complex_route(catalog, make_engine) -> None:
    engine = make_engine(catalog)

    decision = engine.decide(messages=turns(COMPLEX_PROMPT), session_id="s1")

    assert decision.route_name == LARGE_ID
    assert decision.tier == "complex"
    assert decision.reason == "first_turn_complex"
    assert decision.signals["markers"] == ["架构", "设计"]


def test_manual_model_override_on_the_first_turn(catalog, make_engine) -> None:
    engine = make_engine(catalog)

    decision = engine.decide(
        messages=turns(SIMPLE_PROMPT), requested_model=LARGE_ID, session_id="s1"
    )

    assert decision.route_name == LARGE_ID
    assert decision.mode == "manual"
    assert decision.reason == "manual_override"
    assert decision.tier == "complex"


def test_unknown_model_is_rejected(catalog, make_engine) -> None:
    engine = make_engine(catalog)

    with pytest.raises(UnknownModelError):
        engine.decide(messages=turns(SIMPLE_PROMPT), requested_model="nope")


def test_later_turns_stay_on_the_session_model(catalog, make_engine) -> None:
    engine = make_engine(catalog)
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(
        messages=turns(SIMPLE_PROMPT, "再写一个排序函数。"), session_id="s1"
    )

    assert second.route_name == SMALL_ID
    assert second.reason == "session_sticky"
    assert second.switched_from is None
    assert second.blocked_by is None
    assert second.turn_index == 2


def test_complexity_spike_escalates_the_session(catalog, make_engine) -> None:
    engine = make_engine(catalog)
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(
        messages=turns(SIMPLE_PROMPT, COMPLEX_PROMPT), session_id="s1"
    )

    assert second.route_name == LARGE_ID
    assert second.reason == "complexity_spike"
    assert second.switched_from == SMALL_ID
    assert second.tier == "complex"
    assert engine.store.get("s1").switch_count == 1


def test_user_correction_escalates_past_the_simple_tier(catalog, make_engine) -> None:
    engine = make_engine(catalog)
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(messages=turns(SIMPLE_PROMPT, CORRECTION), session_id="s1")

    # The standard tier maps back to the session's own model, so a correction has to
    # climb to the complex tier to actually reach a different model.
    assert second.route_name == LARGE_ID
    assert second.reason == "user_correction"
    assert second.tier == "complex"


def test_reasoning_request_requires_a_reasoning_model(catalog, make_engine) -> None:
    engine = make_engine(catalog)
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(messages=turns(SIMPLE_PROMPT, REASONING), session_id="s1")

    assert second.route_name == LARGE_ID
    assert second.reason == "reasoning_required"


def test_consecutive_failures_fail_over_to_another_model(catalog, make_engine) -> None:
    engine = make_engine(catalog)
    first = engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")
    engine.record_outcome(first, ok=False)
    engine.record_outcome(first, ok=False)
    assert engine.store.get("s1").consecutive_failures == 2

    second = engine.decide(messages=turns(SIMPLE_PROMPT, "再试一次。"), session_id="s1")

    assert second.route_name == LARGE_ID
    assert second.reason == "upstream_failures"
    assert second.switched_from == SMALL_ID


def test_tool_requirement_triggers_a_capability_switch(catalog, make_engine) -> None:
    engine = make_engine(catalog)
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(
        messages=turns(SIMPLE_PROMPT, "查一下今天的天气。"),
        tools=[{"type": "function", "function": {"name": "weather"}}],
        session_id="s1",
    )

    assert second.route_name == LARGE_ID
    assert second.reason == "capability_gap"
    assert second.signals["needs_tools"] is True


def test_context_pressure_moves_to_a_larger_window(catalog, make_engine) -> None:
    engine = make_engine(catalog)
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(messages=turns(SIMPLE_PROMPT, "x" * 22000), session_id="s1")

    assert second.route_name == LARGE_ID
    assert second.reason == "context_pressure"
    assert second.signals["tier"] == "simple"


def test_hysteresis_blocks_a_second_switch(catalog, make_engine) -> None:
    engine = make_engine(catalog)
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")
    engine.decide(messages=turns(SIMPLE_PROMPT, COMPLEX_PROMPT), session_id="s1")

    third = engine.decide(
        messages=turns(SIMPLE_PROMPT, COMPLEX_PROMPT, CORRECTION), session_id="s1"
    )

    assert third.route_name == LARGE_ID
    assert third.reason == "session_sticky"
    assert third.blocked_by == "hysteresis"


def test_escalate_mode_never_downgrades(catalog, make_engine) -> None:
    engine = make_engine(catalog)
    engine.decide(messages=turns(COMPLEX_PROMPT), session_id="s1")

    second = engine.decide(
        messages=turns(COMPLEX_PROMPT, SIMPLE_PROMPT), session_id="s1"
    )

    assert second.route_name == LARGE_ID
    assert second.reason == "session_sticky"


def test_sticky_mode_pins_the_first_turn_model(make_catalog, make_engine) -> None:
    engine = make_engine(make_catalog(mode="sticky"))
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(
        messages=turns(SIMPLE_PROMPT, COMPLEX_PROMPT), session_id="s1"
    )

    assert second.route_name == SMALL_ID
    assert second.reason == "session_pinned"
    assert second.switched_from is None


def test_sticky_mode_keeps_the_pin_against_a_reasoning_request(
    make_catalog, make_engine
) -> None:
    engine = make_engine(make_catalog(mode="sticky"))
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(messages=turns(SIMPLE_PROMPT, REASONING), session_id="s1")

    assert second.route_name == SMALL_ID
    assert second.reason == "session_pinned"


def test_sticky_mode_releases_the_pin_on_context_pressure(
    make_catalog, make_engine
) -> None:
    engine = make_engine(make_catalog(mode="sticky"))
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(messages=turns(SIMPLE_PROMPT, "x" * 22000), session_id="s1")

    assert second.route_name == LARGE_ID
    assert second.reason == "context_pressure"


def test_sticky_mode_honours_a_configured_break_on_reason(
    make_catalog, make_engine
) -> None:
    engine = make_engine(
        make_catalog(mode="sticky", pin={"break_on": ["complexity_spike"]})
    )
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(
        messages=turns(SIMPLE_PROMPT, COMPLEX_PROMPT), session_id="s1"
    )

    assert second.route_name == LARGE_ID
    assert second.reason == "complexity_spike"
    assert second.switched_from == SMALL_ID


def test_sticky_mode_holds_the_pin_when_break_on_omits_the_reason(
    make_catalog, make_engine
) -> None:
    engine = make_engine(make_catalog(mode="sticky", pin={"break_on": []}))
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(
        messages=turns(SIMPLE_PROMPT, "查一下今天的天气。"),
        tools=[{"type": "function", "function": {"name": "weather"}}],
        session_id="s1",
    )

    assert second.route_name == SMALL_ID
    assert second.reason == "session_pinned"
    assert second.signals["needs_tools"] is True


def test_adaptive_mode_settles_back_to_the_simple_route(
    make_catalog, make_engine
) -> None:
    engine = make_engine(make_catalog(mode="adaptive"))
    engine.decide(messages=turns(COMPLEX_PROMPT), session_id="s1")
    engine.store.get("s1").recent_scores = [0.1, 0.1, 0.1]

    second = engine.decide(
        messages=turns(COMPLEX_PROMPT, SIMPLE_PROMPT), session_id="s1"
    )

    assert second.route_name == SMALL_ID
    assert second.reason == "complexity_settled"
    assert second.switched_from == LARGE_ID


def test_budget_pressure_downgrades_the_session(make_catalog, make_engine) -> None:
    engine = make_engine(
        make_catalog(mode="adaptive", budget={"max_cost_per_session_usd": 0.01})
    )
    engine.decide(messages=turns(COMPLEX_PROMPT), session_id="s1")
    engine.store.get("s1").cost_usd = 0.02

    second = engine.decide(
        messages=turns(COMPLEX_PROMPT, SIMPLE_PROMPT), session_id="s1"
    )

    assert second.route_name == SMALL_ID
    assert second.reason == "budget_pressure"
    assert second.tier == "standard"


def test_fresh_mode_re_evaluates_every_turn(make_catalog, make_engine) -> None:
    engine = make_engine(make_catalog(mode="fresh"))
    engine.decide(messages=turns(COMPLEX_PROMPT), session_id="s1")

    second = engine.decide(
        messages=turns(COMPLEX_PROMPT, SIMPLE_PROMPT), session_id="s1"
    )

    assert second.route_name == SMALL_ID
    assert second.reason == "per_turn_policy"


def test_sessions_without_an_id_are_not_remembered(catalog, make_engine) -> None:
    engine = make_engine(catalog)

    decision = engine.decide(messages=turns(SIMPLE_PROMPT))

    assert decision.session_id is None
    assert len(engine.store) == 0


def test_record_outcome_tracks_cost_failures_and_truncation(
    catalog, make_engine
) -> None:
    engine = make_engine(catalog)
    decision = engine.decide(messages=turns(COMPLEX_PROMPT), session_id="s7")

    engine.record_outcome(
        decision,
        ok=True,
        finish_reason="length",
        usage={"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000},
    )
    state = engine.store.get("s7")

    assert decision.route_name == LARGE_ID
    assert state.cost_usd == pytest.approx(10.0)
    assert state.consecutive_truncations == 1
    assert state.recent_scores

    engine.record_outcome(decision, ok=True, finish_reason="stop")
    assert engine.store.get("s7").consecutive_truncations == 0

    engine.record_outcome(decision, ok=False)
    assert engine.store.get("s7").consecutive_failures == 1


def test_output_limit_moves_the_session_to_a_bigger_model(catalog, make_engine) -> None:
    engine = make_engine(catalog)
    engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    second = engine.decide(
        messages=turns(SIMPLE_PROMPT, "再写一个排序函数。"),
        max_tokens=5000,
        session_id="s1",
    )

    # The small route caps output at 2000 tokens, so an established session has to move.
    assert second.route_name == LARGE_ID
    assert second.reason == "output_limit"
    assert second.switched_from == SMALL_ID


def test_catalog_scoring_thresholds_drive_the_tier(make_catalog, make_engine) -> None:
    engine = make_engine(
        make_catalog(scoring={"standard_threshold": 0.0, "complex_threshold": 0.05})
    )

    decision = engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    # A 0.0 standard threshold pulls even a scoreless prompt up to the standard tier.
    assert decision.tier == "standard"
    assert decision.route_name == SMALL_ID


def test_custom_markers_change_which_model_serves_the_prompt(
    make_catalog, make_engine
) -> None:
    engine = make_engine(make_catalog(scoring={"markers": ["排序函数"]}))

    decision = engine.decide(messages=turns("写一个排序函数。"), session_id="s1")

    assert decision.tier == "complex"
    assert decision.route_name == LARGE_ID


def test_reload_catalog_swaps_routing_and_keeps_sessions(
    catalog, make_catalog, make_engine
) -> None:
    engine = make_engine(catalog)
    first = engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")
    assert first.route_name == SMALL_ID

    engine.reload_catalog(make_catalog(scoring={"markers": ["回文"]}))

    second = engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    # The reloaded markers make the same prompt complex, and the session survived.
    assert second.route_name == LARGE_ID
    assert second.switched_from == SMALL_ID
    assert engine.store.get("s1") is not None


def test_decision_log_and_snapshots_are_queryable(catalog, make_engine) -> None:
    engine = make_engine(catalog)

    decision = engine.decide(messages=turns(SIMPLE_PROMPT), session_id="s1")

    assert engine.decision(decision.decision_id) == decision
    assert engine.decision("dec-missing") is None
    assert engine.session_snapshot("s1")["route"] == SMALL_ID
    assert engine.policy_snapshot()["policy"]["mode"] == "escalate"
