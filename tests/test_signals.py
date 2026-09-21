"""Tests for request signal extraction and complexity scoring."""

from __future__ import annotations

from jev_gateway.signals import (
    ScoringPolicy,
    estimate_tokens,
    extract_signals,
    has_image_part,
    latest_user_text,
)


def test_simple_prompt_scores_zero_and_stays_simple() -> None:
    signals = extract_signals(
        [{"role": "user", "content": "将 27 摄氏度换算成华氏度。"}]
    )

    assert signals.markers == ()
    assert signals.base_tier == "simple"
    assert signals.score == 0.0
    assert signals.score_tier == "simple"
    assert signals.tier == "simple"
    assert signals.turn_index == 1


def test_marker_prompt_is_complex() -> None:
    signals = extract_signals(
        [{"role": "user", "content": "审计这个登录接口的安全风险。"}]
    )

    assert signals.markers == ("审计", "安全")
    assert signals.base_tier == "complex"
    assert signals.score >= 0.5
    assert signals.tier == "complex"


def test_structural_signals_reach_the_standard_tier_without_markers() -> None:
    prompt = "1. 读取配置\n2. 校验字段\n3. 写入结果\n" + "x" * 6000
    signals = extract_signals(
        [{"role": "user", "content": prompt}], tools=[{"type": "function"}]
    )

    assert signals.markers == ()
    assert signals.base_tier == "simple"
    assert signals.multi_step is True
    assert signals.needs_tools is True
    assert signals.score_tier == "standard"
    assert signals.tier == "standard"


def test_reasoning_request_is_detected() -> None:
    signals = extract_signals(
        [{"role": "user", "content": "Think step by step about this problem."}]
    )

    assert signals.markers == ()
    assert signals.reasoning_requested is True
    assert signals.score >= 0.15


def test_disabling_patterns_turns_off_every_prompt_detector() -> None:
    prompt = (
        "不对，你上面错了。请逐步推理，给出详细方案。\n"
        "1. 读取配置\n2. 校验字段\n"
        "```python\nprint('x')\n```\n" + "x" * 6000
    )
    signals = extract_signals(
        [{"role": "user", "content": prompt}],
        tools=[{"type": "function"}],
        scoring=ScoringPolicy(patterns_enabled=False),
    )

    assert signals.markers == ()
    assert signals.multi_step is False
    assert signals.reasoning_requested is False
    assert signals.user_correction is False
    assert signals.long_output_requested is False
    assert signals.has_code is False
    for reason in (
        "multi_step",
        "reasoning_requested",
        "user_correction",
        "long_output_requested",
        "code_block",
    ):
        assert reason not in signals.reasons


def test_disabling_patterns_keeps_payload_and_structure_facts() -> None:
    signals = extract_signals(
        [
            {"role": "user", "content": "第一句"},
            {"role": "assistant", "content": "ok"},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": "https://x/y.png"}},
                    {"type": "text", "text": "这是什么"},
                ],
            },
        ],
        tools=[{"type": "function"}],
        response_format={"type": "json_object"},
        scoring=ScoringPolicy(patterns_enabled=False),
    )

    assert signals.needs_tools is True
    assert signals.needs_vision is True
    assert signals.needs_json is True
    assert signals.turn_index == 2
    assert signals.conversation_tokens > 0


def test_user_correction_is_detected() -> None:
    signals = extract_signals(
        [{"role": "user", "content": "不对，这个结果有误，重新来。"}]
    )

    assert signals.user_correction is True
    assert signals.score >= 0.10


def test_long_output_request_is_detected() -> None:
    signals = extract_signals(
        [{"role": "user", "content": "请给出 1000 字的完整方案。"}]
    )

    assert signals.long_output_requested is True
    assert signals.markers == ()


def test_turn_depth_grows_with_the_conversation() -> None:
    signals = extract_signals(
        [
            {"role": "user", "content": "第一轮"},
            {"role": "assistant", "content": "ok"},
            {"role": "user", "content": "第二轮"},
            {"role": "assistant", "content": "ok"},
            {"role": "user", "content": "第三轮"},
        ]
    )

    assert signals.turn_index == 3
    assert signals.score > 0.0
    assert "turn_depth:3" in signals.reasons


def test_vision_input_and_latest_user_text() -> None:
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "看这张图"},
                {"type": "image_url", "image_url": {"url": "https://x/1.png"}},
            ],
        },
        {"role": "assistant", "content": "ok"},
        {"role": "user", "content": "再看一遍"},
    ]
    signals = extract_signals(messages)

    assert signals.needs_vision is True
    assert signals.turn_index == 2
    assert has_image_part(messages) is True
    assert latest_user_text(messages) == "再看一遍"


def test_json_mode_requirement_is_detected() -> None:
    signals = extract_signals(
        [{"role": "user", "content": "回答一下"}],
        response_format={"type": "json_object"},
    )

    assert signals.needs_json is True


def test_estimate_tokens_treats_cjk_as_one_token() -> None:
    assert estimate_tokens("") == 0
    assert estimate_tokens("你好世界") == 4
    assert estimate_tokens("aaaaaaaa") == 2


def test_latest_user_text_is_none_without_a_user_message() -> None:
    assert latest_user_text([{"role": "system", "content": "rules"}]) is None


def test_intent_detection_follows_the_pattern_switch_when_unset() -> None:
    assert ScoringPolicy().detects_intent is True
    assert ScoringPolicy(patterns_enabled=False).detects_intent is False
    assert (
        ScoringPolicy(
            patterns_enabled=False, intent_patterns_enabled=True
        ).detects_intent
        is True
    )
    assert (
        ScoringPolicy(
            patterns_enabled=True, intent_patterns_enabled=False
        ).detects_intent
        is False
    )


def test_intent_detectors_run_while_scoring_patterns_stay_off() -> None:
    """The two detectors the escalation and effort triggers read are separable."""
    signals = extract_signals(
        [{"role": "user", "content": "不对，你上面错了。请逐步推理。"}],
        scoring=ScoringPolicy(patterns_enabled=False, intent_patterns_enabled=True),
    )

    assert signals.user_correction is True
    assert signals.reasoning_requested is True
    assert "reasoning_requested" in signals.reasons
    assert "user_correction" in signals.reasons
    # Turning them on must not move the score or the tier, so their weights stay
    # gated by patterns_enabled.
    assert signals.score == 0.0
    assert signals.tier == "simple"


def test_intent_detector_weights_apply_when_scoring_patterns_are_on() -> None:
    signals = extract_signals(
        [{"role": "user", "content": "不对，你上面错了。请逐步推理。"}],
        scoring=ScoringPolicy(intent_patterns_enabled=True),
    )

    assert signals.user_correction is True
    assert signals.reasoning_requested is True
    # correction_weight 0.10 plus reasoning_weight 0.15.
    assert signals.score == 0.25
