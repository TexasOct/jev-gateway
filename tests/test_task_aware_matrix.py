"""The documented `task_aware` matrix: tier pools and the Astra reserve.

The fixture encodes the seven-label table in `docs/routing-design.md` and
`docs/models-config.md`, using credential-free example model profiles. Provider
keys are fake and decision HTTP is stubbed, so the matrix runs on clean checkouts.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any, cast

import httpx
import pytest

from jev_gateway.catalog import catalog_from_document
from jev_gateway.reasoning import effort_for
from jev_gateway.request_facts import extract_request_facts as extract_facts
from jev_gateway.strategy import RoutingRequest, StrategyRegistry
from jev_gateway.strategy.policy import PolicyStrategy

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "tests" / "fixtures" / "task_aware_matrix.json"

DEEPSEEK = "deepseek/deepseek-flash"
LUNA = "openai/gpt-6-luna"
SOL = "openai/gpt-6-sol"
ASTRA = "openai/gpt-6-astra"

CASES: list[tuple[str, dict[str, str], str, str]] = [
    (
        "large coding that ships",
        {"workload": "coding", "scale": "large", "rigor": "exacting"},
        SOL,
        "rule_3",
    ),
    (
        "reverse engineering",
        {"workload": "reverse", "scale": "moderate", "rigor": "draft"},
        SOL,
        "rule_2",
    ),
    (
        "large reverse engineering that ships",
        {"workload": "reverse", "scale": "large", "rigor": "exacting"},
        SOL,
        "rule_2",
    ),
    (
        "large reverse engineering draft",
        {"workload": "reverse", "scale": "large", "rigor": "draft"},
        SOL,
        "rule_2",
    ),
    (
        "mid-sized coding that ships",
        {"workload": "coding", "scale": "moderate", "rigor": "exacting"},
        SOL,
        "rule_4",
    ),
    (
        "bounded coding pass",
        {"workload": "coding", "scale": "bounded", "rigor": "draft"},
        LUNA,
        "rule_5",
    ),
    (
        "research pass",
        {"workload": "research", "scale": "moderate", "rigor": "draft"},
        LUNA,
        "rule_9",
    ),
    (
        "research that gates other work",
        {"workload": "research", "scale": "moderate", "rigor": "exacting"},
        DEEPSEEK,
        "rule_6",
    ),
    (
        "documentation that ships",
        {"workload": "docs", "scale": "bounded", "rigor": "exacting"},
        LUNA,
        "rule_7",
    ),
    (
        "bounded single-file edit",
        {"workload": "small_change", "scale": "bounded", "rigor": "draft"},
        DEEPSEEK,
        "rule_8",
    ),
    (
        "research about a cross-domain subject",
        {"workload": "research", "scale": "cross_domain", "rigor": "draft"},
        LUNA,
        "rule_9",
    ),
    (
        "documenting a cross-domain subject",
        {"workload": "docs", "scale": "cross_domain", "rigor": "exacting"},
        LUNA,
        "rule_7",
    ),
]

RESERVED_CASES: list[tuple[str, dict[str, str], str]] = [
    (
        "cross-domain engineering",
        {"workload": "coding", "scale": "cross_domain", "rigor": "exacting"},
        "rule_1",
    ),
    (
        "cross-domain audit",
        {"workload": "reverse", "scale": "cross_domain", "rigor": "draft"},
        "rule_1",
    ),
]


def shipped_document() -> dict[str, Any]:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def route(
    monkeypatch: pytest.MonkeyPatch,
    answers: dict[str, str] | None,
):
    """Run one turn through the documented matrix, with JEV stubbed out."""
    monkeypatch.setenv("JEV_OPENROUTER_API_KEY", "test-key")

    def post(url: str, **kwargs: Any) -> httpx.Response:
        if answers is None:
            raise httpx.ConnectError("unreachable", request=httpx.Request("POST", url))
        payload = {
            "answers": {key: {"choice": value} for key, value in answers.items()}
        }
        return httpx.Response(
            200, request=httpx.Request("POST", url), json=payload
        )

    monkeypatch.setattr(httpx, "post", post)
    catalog = catalog_from_document(shipped_document(), "models")
    strategy = cast(
        PolicyStrategy,
        StrategyRegistry.from_catalog(catalog).resolve("task_aware"),
    )
    facts = extract_facts([{"role": "user", "content": "hello"}])
    outcome = strategy.decide(RoutingRequest(facts, None, None, 1, 0.0), catalog)
    return outcome, strategy, catalog


@pytest.mark.parametrize(("name", "answers", "expected", "rule"), CASES)
def test_everyday_work_stays_off_the_top_tier(
    monkeypatch, name, answers, expected, rule
) -> None:
    outcome, _, _ = route(monkeypatch, answers)
    assert outcome.model == expected, name
    assert outcome.model != ASTRA, f"{name} must not reach Astra"
    assert f":{rule}:" in outcome.reason


@pytest.mark.parametrize(("name", "answers", "rule"), RESERVED_CASES)
def test_reserved_work_reaches_the_top_tier(
    monkeypatch, name, answers, rule
) -> None:
    outcome, _, _ = route(monkeypatch, answers)
    assert outcome.model == ASTRA, name
    assert f":{rule}:" in outcome.reason


@pytest.mark.parametrize("workload", ["research", "docs", "small_change", "coding", "reverse"])
@pytest.mark.parametrize("scale", ["bounded", "moderate", "large", "cross_domain"])
@pytest.mark.parametrize("rigor", ["draft", "exacting"])
def test_astra_requires_cross_domain_coding_or_reverse(
    monkeypatch, workload, scale, rigor
) -> None:
    outcome, _, _ = route(
        monkeypatch, {"workload": workload, "scale": scale, "rigor": rigor}
    )
    reserved = scale == "cross_domain" and workload in {"coding", "reverse"}
    assert (outcome.model == ASTRA) == reserved
    assert (outcome.tier == "ultra") == reserved


def test_only_reserved_rules_reach_the_reserved_pool(monkeypatch) -> None:
    _, _, catalog = route(
        monkeypatch,
        {"workload": "coding", "scale": "large", "rigor": "exacting"},
    )
    strategy = cast(
        PolicyStrategy,
        StrategyRegistry.from_catalog(catalog).resolve("task_aware"),
    )

    reserved = [
        profile.name
        for profile in catalog.profiles
        if "task_aware/ultra" in profile.tags
    ]
    assert reserved == [ASTRA]

    everyday = ["quick", "draft", "review", "investigate", "craft", "engineering"]
    for label in everyday:
        pool = strategy._tier_pool(label, catalog)
        assert pool, f"label {label} has no candidates"
        assert ASTRA not in [profile.name for profile in pool], (
            f"Astra must not be eligible for {label}"
        )


def test_pool_membership_keeps_deepseek_out_of_the_luna_pools(monkeypatch) -> None:
    """Luna costs less than DeepSeek, so any shared pool resolves to Luna."""
    _, _, catalog = route(
        monkeypatch,
        {"workload": "coding", "scale": "large", "rigor": "exacting"},
    )
    strategy = cast(
        PolicyStrategy,
        StrategyRegistry.from_catalog(catalog).resolve("task_aware"),
    )

    def pool(label: str) -> list[str]:
        return sorted(profile.name for profile in strategy._tier_pool(label, catalog))

    assert pool("quick") == [DEEPSEEK]
    assert pool("investigate") == [DEEPSEEK]
    assert pool("draft") == [DEEPSEEK, LUNA]
    assert pool("review") == [DEEPSEEK, LUNA]
    assert pool("craft") == [LUNA]
    assert pool("engineering") == [LUNA, SOL]


def test_fallback_keeps_working_when_jev_is_unreachable(monkeypatch) -> None:
    outcome, _, _ = route(monkeypatch, None)

    assert outcome.model == LUNA
    assert ":fallback:" in outcome.reason


def test_labels_are_ordered_and_carry_a_thinking_level(monkeypatch) -> None:
    _, strategy, _ = route(
        monkeypatch, {"workload": "coding", "scale": "large", "rigor": "exacting"}
    )
    policy = strategy.policy

    assert list(policy.labels) == [
        "quick",
        "draft",
        "review",
        "investigate",
        "craft",
        "engineering",
        "ultra",
    ]
    expected = {
        "quick": "minimal",
        "draft": "low",
        "review": "medium",
        "investigate": "high",
        "craft": "medium",
        "engineering": "high",
        "ultra": "xhigh",
    }
    assert dict(policy.reasoning.effort_by_label) == expected
    for label, effort in expected.items():
        assert policy.labels[label].reasoning_effort == effort


@pytest.mark.parametrize(
    ("answers", "label", "effort", "rule", "model"),
    [
        (
            {"workload": "small_change", "scale": "bounded", "rigor": "draft"},
            "quick",
            "minimal",
            "rule_8",
            DEEPSEEK,
        ),
        (
            {"workload": "research", "scale": "moderate", "rigor": "exacting"},
            "investigate",
            "high",
            "rule_6",
            DEEPSEEK,
        ),
        (
            {"workload": "docs", "scale": "moderate", "rigor": "draft"},
            "draft",
            "low",
            "rule_9",
            LUNA,
        ),
        (
            {"workload": "docs", "scale": "moderate", "rigor": "exacting"},
            "review",
            "medium",
            "rule_7",
            LUNA,
        ),
    ],
)
def test_everyday_pools_think_at_the_required_level(
    monkeypatch, answers, label, effort, rule, model
) -> None:
    outcome, strategy, catalog = route(monkeypatch, answers)
    profile = catalog.by_name(model)
    assert profile is not None

    assert outcome.model == model
    assert outcome.tier == label
    assert f":{rule}:" in outcome.reason
    assert effort_for(
        extract_facts([{"role": "user", "content": "hello"}]),
        strategy.policy.reasoning,
        profile.capabilities.reasoning_effort,
        tier=label,
    ) == (effort, "derived")


def test_quality_strategy_labels_remain_ordered_without_score_thresholds(monkeypatch) -> None:
    _, _, catalog = route(
        monkeypatch, {"workload": "coding", "scale": "large", "rigor": "exacting"}
    )
    quality = next(strategy for strategy in catalog.strategies if strategy.name == "quality")

    assert [
        (label, definition.reasoning_effort)
        for label, definition in quality.policy.labels.items()
    ] == [
        ("routine", "low"),
        ("analysis", "medium"),
        ("critical", "high"),
    ]


def test_the_reserved_tier_thinks_at_the_deepest_configured_level(monkeypatch) -> None:
    _, strategy, catalog = route(
        monkeypatch,
        {"workload": "coding", "scale": "cross_domain", "rigor": "exacting"},
    )
    facts = extract_facts([{"role": "user", "content": "hello"}])
    astra = catalog.by_name(ASTRA)
    assert astra is not None

    effort, source = effort_for(
        facts,
        strategy.policy.reasoning,
        astra.capabilities.reasoning_effort,
        tier="ultra",
    )
    assert (effort, source) == ("xhigh", "derived")
