"""Per-request features and deterministic complexity scoring."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from jev_gateway.config import TIER_RANK

COMPLEX_TASK_MARKERS = (
    "analyze",
    "analyse",
    "architecture",
    "audit",
    "design",
    "migrate",
    "migration",
    "reasoning",
    "root cause",
    "security",
    "trade-off",
    "tradeoff",
    "多步骤",
    "分析",
    "审计",
    "安全",
    "架构",
    "根因",
    "权衡",
    "设计",
    "迁移",
)

CJK_PATTERN = re.compile(
    r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]"
)
CODE_FENCE_PATTERN = re.compile(r"```")
MULTI_STEP_PATTERN = re.compile(r"(?:^|\n)\s*(?:\d{1,2}[.)]|[-*+])\s+\S")
REASONING_PATTERN = re.compile(
    r"(step[- ]by[- ]step|think (?:it )?through|chain of thought|reason carefully|"
    r"逐步|一步步|深入推理|推理过程|分步骤)",
    re.IGNORECASE,
)
CORRECTION_PATTERN = re.compile(
    r"(不对|错了|不是这样|有误|你说错|重新来|再改|修改一下|还是不行)|"
    r"(\b(?:wrong|incorrect|that'?s not|actually it|redo|try again|fix that|still broken)\b)",
    re.IGNORECASE,
)
LONG_OUTPUT_PATTERN = re.compile(
    r"(\b\d{3,}\s*words?\b)|(\d{3,}\s*字)|(详细方案|完整方案|全面方案|详尽)",
    re.IGNORECASE,
)
IMAGE_PART_TYPES = {"image_url", "input_image", "image"}


@dataclass(frozen=True)
class ScoringPolicy:
    """Markers, weights, and thresholds the complexity scorer applies.

    Everything the scorer uses is declared here, so a deployment can tune the routing
    rules from its configuration file instead of editing code. Set ``patterns_enabled``
    to false to turn off every prompt-pattern detector at once.
    """

    markers: tuple[str, ...] = COMPLEX_TASK_MARKERS
    marker_weight: float = 0.40
    additional_marker_weight: float = 0.10
    max_additional_marker_weight: float = 0.30
    reasoning_weight: float = 0.15
    multi_step_weight: float = 0.12
    long_output_weight: float = 0.10
    tools_weight: float = 0.08
    vision_weight: float = 0.06
    code_weight: float = 0.05
    long_prompt_chars: int = 1500
    very_long_prompt_chars: int = 5000
    long_prompt_weight: float = 0.10
    very_long_prompt_weight: float = 0.20
    turn_depth_weight: float = 0.03
    max_turn_depth_weight: float = 0.12
    correction_weight: float = 0.10
    standard_threshold: float = 0.35
    complex_threshold: float = 0.65
    patterns_enabled: bool = True
    # The two detectors that report what the user is ASKING FOR, rather than how
    # complex the text looks: a reasoning request and a correction. Kept separate
    # from `patterns_enabled`, which decides whether text patterns may move the
    # score. Unset follows `patterns_enabled`, so a catalog that says nothing keeps
    # the previous behavior of one switch for everything.
    #
    # The split exists because the escalation triggers and `policy.reasoning` both
    # read these two, and a deployment can reasonably want them while local scoring
    # is deliberately off. Turning them on cannot move the tier: their score
    # contributions stay gated by `patterns_enabled`.
    intent_patterns_enabled: bool | None = None

    @property
    def detects_intent(self) -> bool:
        """Whether the reasoning-request and correction detectors run."""
        if self.intent_patterns_enabled is None:
            return self.patterns_enabled
        return self.intent_patterns_enabled

    def as_dict(self) -> dict[str, Any]:
        """Serialize the scoring rules for the policy endpoint."""
        return {
            "markers": list(self.markers),
            "marker_weight": self.marker_weight,
            "additional_marker_weight": self.additional_marker_weight,
            "max_additional_marker_weight": self.max_additional_marker_weight,
            "reasoning_weight": self.reasoning_weight,
            "multi_step_weight": self.multi_step_weight,
            "long_output_weight": self.long_output_weight,
            "tools_weight": self.tools_weight,
            "vision_weight": self.vision_weight,
            "code_weight": self.code_weight,
            "long_prompt_chars": self.long_prompt_chars,
            "very_long_prompt_chars": self.very_long_prompt_chars,
            "long_prompt_weight": self.long_prompt_weight,
            "very_long_prompt_weight": self.very_long_prompt_weight,
            "turn_depth_weight": self.turn_depth_weight,
            "max_turn_depth_weight": self.max_turn_depth_weight,
            "correction_weight": self.correction_weight,
            "standard_threshold": self.standard_threshold,
            "complex_threshold": self.complex_threshold,
            "patterns_enabled": self.patterns_enabled,
            "intent_patterns_enabled": self.detects_intent,
        }


DEFAULT_SCORING = ScoringPolicy()


def content_text(content: Any) -> str:
    """Flatten an OpenAI message content value into plain text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict):
                text = part.get("text")
                if isinstance(text, str):
                    parts.append(text)
            elif isinstance(part, str):
                parts.append(part)
        return "\n".join(parts)
    if content is None:
        return ""
    return json.dumps(content, ensure_ascii=False, sort_keys=True)


def message_texts(messages: list[dict[str, Any]]) -> list[str]:
    """Return the text of every message in order."""
    return [content_text(message.get("content")) for message in messages]


def latest_user_text(messages: list[dict[str, Any]]) -> str | None:
    """Return the most recent non-empty user message."""
    for message in reversed(messages):
        if message.get("role") == "user":
            text = content_text(message.get("content")).strip()
            if text:
                return text
    return None


def has_image_part(messages: list[dict[str, Any]]) -> bool:
    """Detect image inputs in either the list or image-part content forms."""
    for message in messages:
        content = message.get("content")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") in IMAGE_PART_TYPES:
                    return True
    return False


def count_user_turns(messages: list[dict[str, Any]]) -> int:
    """Count user messages, which is the turn index for stateless clients."""
    return sum(1 for message in messages if message.get("role") == "user")


def estimate_tokens(text: str) -> int:
    """Estimate tokens, treating CJK characters as one token each."""
    if not text:
        return 0
    cjk = len(CJK_PATTERN.findall(text))
    other = len(text) - cjk
    return cjk + (round(other / 4) if other else 0)


@dataclass(frozen=True)
class RequestSignals:
    """Extracted request features and the tier derived from them."""

    prompt: str
    prompt_chars: int
    prompt_tokens: int
    conversation_tokens: int
    requested_max_tokens: int | None
    turn_index: int
    markers: tuple[str, ...]
    base_tier: str
    score: float
    score_tier: str
    tier: str
    has_code: bool
    multi_step: bool
    reasoning_requested: bool
    user_correction: bool
    long_output_requested: bool
    needs_tools: bool
    needs_vision: bool
    needs_json: bool
    reasons: tuple[str, ...]
    route_label: str | None = None

    @property
    def tier_rank(self) -> int:
        return TIER_RANK[self.tier]

    def as_dict(self) -> dict[str, Any]:
        """Serialize the signals for the decision log."""
        return {
            "tier": self.tier,
            "base_tier": self.base_tier,
            "score": round(self.score, 4),
            "local_score": round(self.score, 4),
            "score_tier": self.score_tier,
            "tier_rank": self.tier_rank,
            "route_label": self.route_label,
            "prompt_chars": self.prompt_chars,
            "prompt_tokens": self.prompt_tokens,
            "conversation_tokens": self.conversation_tokens,
            "requested_max_tokens": self.requested_max_tokens,
            "turn_index": self.turn_index,
            "markers": list(self.markers),
            "has_code": self.has_code,
            "multi_step": self.multi_step,
            "reasoning_requested": self.reasoning_requested,
            "user_correction": self.user_correction,
            "long_output_requested": self.long_output_requested,
            "needs_tools": self.needs_tools,
            "needs_vision": self.needs_vision,
            "needs_json": self.needs_json,
            "reasons": list(self.reasons),
        }


def _matches(prompt: str, scoring: ScoringPolicy) -> tuple[str, ...]:
    normalized = prompt.casefold()
    return tuple(marker for marker in scoring.markers if marker in normalized)


def _score_tier(score: float, scoring: ScoringPolicy) -> str:
    if score >= scoring.complex_threshold:
        return "complex"
    if score >= scoring.standard_threshold:
        return "standard"
    return "simple"


def extract_signals(
    messages: list[dict[str, Any]],
    *,
    max_tokens: int | None = None,
    tools: list[Any] | None = None,
    response_format: dict[str, Any] | None = None,
    scoring: ScoringPolicy | None = None,
) -> RequestSignals:
    """Extract routing signals from an OpenAI chat completion request."""
    active = scoring or DEFAULT_SCORING
    texts = message_texts(messages)
    conversation = "\n".join(text for text in texts if text)
    prompt = latest_user_text(messages) or conversation
    prompt_chars = len(prompt)

    markers: tuple[str, ...] = ()
    multi_step = reasoning_requested = user_correction = False
    long_output_requested = has_code = False
    if active.patterns_enabled:
        markers = _matches(prompt, active)
        multi_step = bool(MULTI_STEP_PATTERN.search(prompt))
        long_output_requested = bool(LONG_OUTPUT_PATTERN.search(prompt))
        has_code = bool(CODE_FENCE_PATTERN.search(prompt))
    if active.detects_intent:
        # Detected independently of the scoring switch, because the escalation
        # triggers and the reasoning-effort policy both read these two. Their score
        # contributions below stay gated by `patterns_enabled`.
        reasoning_requested = bool(REASONING_PATTERN.search(prompt))
        user_correction = bool(CORRECTION_PATTERN.search(prompt))
    needs_tools = bool(tools)
    needs_vision = has_image_part(messages)
    needs_json = bool(
        isinstance(response_format, dict)
        and response_format.get("type") in {"json_object", "json_schema"}
    )

    score = 0.0
    reasons: list[str] = []
    if markers:
        bonus = min(
            active.additional_marker_weight * (len(markers) - 1),
            active.max_additional_marker_weight,
        )
        score += active.marker_weight + bonus
        reasons.append(f"markers:{','.join(markers)}")
    if reasoning_requested:
        if active.patterns_enabled:
            score += active.reasoning_weight
        # Reported even when its weight was not applied, so the effort decision a
        # reader sees in the evidence can be explained by a reason in the same row.
        reasons.append("reasoning_requested")
    if multi_step:
        score += active.multi_step_weight
        reasons.append("multi_step")
    if long_output_requested:
        score += active.long_output_weight
        reasons.append("long_output_requested")
    if needs_tools:
        score += active.tools_weight
        reasons.append("tools_present")
    if needs_vision:
        score += active.vision_weight
        reasons.append("vision_input")
    if has_code:
        score += active.code_weight
        reasons.append("code_block")
    if prompt_chars > active.very_long_prompt_chars:
        score += active.long_prompt_weight + active.very_long_prompt_weight
        reasons.append("very_long_prompt")
    elif prompt_chars > active.long_prompt_chars:
        score += active.long_prompt_weight
        reasons.append("long_prompt")
    turn_index = count_user_turns(messages)
    if turn_index > 1:
        depth = min(
            active.turn_depth_weight * (turn_index - 1), active.max_turn_depth_weight
        )
        score += depth
        reasons.append(f"turn_depth:{turn_index}")
    if user_correction:
        if active.patterns_enabled:
            score += active.correction_weight
        reasons.append("user_correction")

    score = round(min(score, 1.0), 4)
    score_tier = _score_tier(score, active)
    base_tier = "complex" if markers else "simple"
    tier = base_tier if TIER_RANK[base_tier] >= TIER_RANK[score_tier] else score_tier

    return RequestSignals(
        prompt=prompt,
        prompt_chars=prompt_chars,
        prompt_tokens=estimate_tokens(prompt),
        conversation_tokens=estimate_tokens(conversation),
        requested_max_tokens=max_tokens,
        turn_index=turn_index,
        markers=markers,
        base_tier=base_tier,
        score=score,
        score_tier=score_tier,
        tier=tier,
        has_code=has_code,
        multi_step=multi_step,
        reasoning_requested=reasoning_requested,
        user_correction=user_correction,
        long_output_requested=long_output_requested,
        needs_tools=needs_tools,
        needs_vision=needs_vision,
        needs_json=needs_json,
        reasons=tuple(reasons),
    )
