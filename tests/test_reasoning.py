"""Reasoning-effort ladder, derivation, and the post-selection decision."""

from __future__ import annotations

import sqlite3
from typing import Any

import pytest

from jev_gateway.catalog import catalog_from_document
from jev_gateway.decision import RoutingEngine
from jev_gateway.reasoning import (
    EFFORT_LADDER,
    clamp_effort,
    effort_for,
    ladder_from_list,
)
from jev_gateway.sessions import MemorySessionStore
from jev_gateway.signals import extract_signals
from tests.helpers import (
    COMPLEX_PROMPT,
    SIMPLE_PROMPT,
    FakeClock,
    catalog_document,
    single_route_document,
)

# The ladder the OpenAI-compatible route really answers to. `minimal` is absent
# because that route returns HTTP 502 for it, measured against a live gateway.
OPENAI_LADDER = ("none", "low", "medium", "high", "xhigh", "max")
FULL_LADDER = EFFORT_LADDER


class _Policy:
    """A stand-in reasoning policy; the real one is a frozen catalog dataclass."""

    def __init__(self, **overrides: Any) -> None:
        self.mode = overrides.get("mode", "override")
        self.effort_by_tier = overrides.get(
            "effort_by_tier",
            {"simple": "low", "standard": "medium", "complex": "high"},
        )
        self.on_reasoning_request = overrides.get("on_reasoning_request", "high")
        self.on_user_correction = overrides.get("on_user_correction", "high")
        self.fallback = overrides.get("fallback", "medium")


def _signals(prompt: str, **overrides: Any) -> Any:
    signals = extract_signals([{"role": "user", "content": prompt}])
    for key, value in overrides.items():
        object.__setattr__(signals, key, value)
    return signals


# The ladder


@pytest.mark.parametrize(
    ("ladder", "wanted", "expected"),
    (
        # Inside the ladder nothing moves.
        (FULL_LADDER, "medium", "medium"),
        (OPENAI_LADDER, "medium", "medium"),
        # `minimal` is the measured failure: that route has no such level, so the
        # nearest one above it is the answer.
        (OPENAI_LADDER, "minimal", "low"),
        # A level the route cannot name at all lands on the lowest it does know.
        (FULL_LADDER, "moderate", "none"),
        # Asking to stop thinking on a route that cannot stop climbs to the floor.
        (("low", "high"), "none", "low"),
        (("high",), "none", "high"),
        # The top of the ladder saturates rather than wrapping around.
        (("none", "low"), "max", "low"),
        # A route that declares nothing gets nothing.
        ((), "high", None),
        (FULL_LADDER, None, None),
    ),
)
def test_clamp_effort_picks_the_nearest_level_the_route_accepts(
    ladder: tuple[str, ...], wanted: str | None, expected: str | None
) -> None:
    assert clamp_effort(ladder, wanted) == expected


def test_ladder_from_list_orders_canonically_and_rejects_unknown_levels() -> None:
    assert ladder_from_list(["high", "none", "medium"], "test") == (
        "none",
        "medium",
        "high",
    )
    with pytest.raises(ValueError, match="unknown reasoning-effort levels"):
        ladder_from_list(["moderate"], "test")
    with pytest.raises(TypeError, match="must be a list"):
        ladder_from_list("high", "test")


# Precedence and derivation


@pytest.mark.parametrize(
    ("ladder", "mode", "requested", "expected", "source"),
    (
        # Off means the gateway never touches the field.
        (OPENAI_LADDER, "off", "high", None, "off"),
        # A route with no declared ladder is left alone, whatever the mode.
        ((), "preserve", "high", None, "undeclared"),
        ((), "fill", None, None, "undeclared"),
        # The client's own level survives untouched.
        (OPENAI_LADDER, "preserve", "low", "low", "client"),
        (OPENAI_LADDER, "fill", "low", "low", "client"),
        (OPENAI_LADDER, "cap", "low", "low", "client"),
        # A level the route cannot name is clamped, not forwarded.
        (OPENAI_LADDER, "preserve", "minimal", "low", "clamped_client"),
        (OPENAI_LADDER, "fill", "minimal", "low", "clamped_client"),
        # A value outside the enum entirely is dropped rather than sent.
        (OPENAI_LADDER, "preserve", "totally-not-a-level", None, "invalid_client"),
        # Only `override` replaces a level the client explicitly asked for: the
        # simple prompt derives `low`, so a requested `high` visibly loses.
        (OPENAI_LADDER, "override", "high", "low", "derived"),
        (OPENAI_LADDER, "override", None, "low", "derived"),
        # `fill` speaks only when the client stayed silent.
        (OPENAI_LADDER, "fill", None, "low", "derived"),
        # `preserve` stays silent when the client did.
        (OPENAI_LADDER, "preserve", None, None, "client"),
    ),
)
def test_effort_for_respects_the_mode_and_the_route_ladder(
    ladder: tuple[str, ...],
    mode: str,
    requested: str | None,
    expected: str | None,
    source: str,
) -> None:
    simple = _signals(SIMPLE_PROMPT)
    applied, origin = effort_for(
        simple, _Policy(mode=mode), ladder, requested=requested
    )
    assert (applied, origin) == (expected, source)


def test_cap_only_ever_lowers() -> None:
    """A client that asked for less than we derived keeps its own budget."""
    complex_signals = _signals(COMPLEX_PROMPT)
    # The derived level for a complex prompt is `high`; a cap must not raise the
    # client's `low` up to it.
    assert effort_for(
        complex_signals, _Policy(mode="cap"), FULL_LADDER, requested="low"
    ) == ("low", "client")
    assert effort_for(
        complex_signals, _Policy(mode="cap"), FULL_LADDER, requested="xhigh"
    ) == ("high", "capped")


def test_fill_ignores_the_request_when_the_route_declares_no_ladder() -> None:
    applied, source = effort_for(
        _signals(SIMPLE_PROMPT), _Policy(mode="fill"), (), requested=None
    )
    assert (applied, source) == (None, "undeclared")


@pytest.mark.parametrize(
    ("prompt", "expected"),
    (
        (SIMPLE_PROMPT, "low"),
        (COMPLEX_PROMPT, "high"),
        # A reasoning request outranks the tier: this prompt scores as simple, so
        # only the trigger can be what raises it to `high`.
        ("think it through", "high"),
        ("请一步步来", "high"),
    ),
)
def test_derived_level_follows_the_tier_and_the_prompt(prompt: str, expected: str) -> None:
    applied, source = effort_for(_signals(prompt), _Policy(), FULL_LADDER)
    assert (applied, source) == (expected, "derived")


def test_a_user_correction_outranks_the_prompt_markers() -> None:
    signals = _signals("不对，你上面写错了")
    applied, _ = effort_for(signals, _Policy(on_user_correction="xhigh"), FULL_LADDER)
    assert applied == "xhigh"
    # Turning the trigger off leaves the tier rule in charge.
    applied, _ = effort_for(
        signals, _Policy(on_user_correction=None), FULL_LADDER
    )
    assert applied == "low"


# Catalog parsing


def test_catalog_reads_the_declared_ladder_off_the_model() -> None:
    document = single_route_document(
        capabilities={"reasoning": True, "reasoning_effort": ["high", "none"]}
    )
    catalog = catalog_from_document(document, "test catalog")
    assert catalog.profiles[0].capabilities.reasoning_effort == ("none", "high")
    assert catalog.profiles[0].as_dict()["capabilities"]["reasoning_effort"] == [
        "none",
        "high",
    ]


def test_catalog_defaults_the_ladder_to_empty() -> None:
    catalog = catalog_from_document(single_route_document(), "test catalog")
    assert catalog.profiles[0].capabilities.reasoning_effort == ()
    # The default policy is inert until a route opts in by declaring a ladder.
    assert catalog.policy.reasoning.mode == "override"


def test_catalog_rejects_a_misspelled_level() -> None:
    document = single_route_document(
        capabilities={"reasoning": True, "reasoning_effort": ["moderate"]}
    )
    with pytest.raises(ValueError, match="unknown reasoning-effort levels"):
        catalog_from_document(document, "test catalog")


def test_catalog_rejects_an_unknown_reasoning_mode() -> None:
    document = single_route_document()
    document["policy"]["reasoning"] = {"mode": "sometimes"}
    with pytest.raises(ValueError, match="reasoning.mode must be one of"):
        catalog_from_document(document, "test catalog")


def test_catalog_rejects_a_tier_no_routing_can_produce() -> None:
    document = single_route_document()
    document["policy"]["reasoning"] = {"effort_by_tier": {"enormous": "high"}}
    with pytest.raises(ValueError, match="unknown tiers"):
        catalog_from_document(document, "test catalog")


def test_strategy_policy_overrides_the_reasoning_defaults() -> None:
    document = catalog_document(reasoning={"mode": "cap", "fallback": "low"})
    catalog = catalog_from_document(document, "test catalog")
    assert catalog.policy.reasoning.mode == "cap"
    assert catalog.policy.reasoning.fallback == "low"
    assert catalog.policy.as_dict()["reasoning"]["mode"] == "cap"


# The engine decides after it has picked the model


def _engine(catalog: Any, clock: FakeClock) -> RoutingEngine:
    # The store needs the same clock as the engine, or a FakeClock session looks
    # expired the moment it is read back.
    return RoutingEngine(
        catalog, MemorySessionStore(clock=clock), clock=clock
    )


def test_engine_clamps_the_level_to_the_model_it_selected(clock: FakeClock) -> None:
    """The level follows the model, which is why it is decided afterwards."""
    document = single_route_document(
        capabilities={"reasoning": True, "reasoning_effort": ["none", "low"]}
    )
    catalog = catalog_from_document(document, "test catalog")
    decision = _engine(catalog, clock).decide(
        messages=[{"role": "user", "content": COMPLEX_PROMPT}]
    )
    # The complex tier asks for `high`, and this route stops at `low`.
    assert decision.reasoning_effort == "low"
    assert decision.reasoning_effort_source == "derived"
    assert decision.as_dict()["reasoning_effort"] == "low"


def test_engine_leaves_the_clients_level_alone_without_a_ladder(clock: FakeClock) -> None:
    catalog = catalog_from_document(single_route_document(), "test catalog")
    decision = _engine(catalog, clock).decide(
        messages=[{"role": "user", "content": COMPLEX_PROMPT}],
        reasoning_effort="high",
    )
    assert decision.reasoning_effort is None
    assert decision.reasoning_effort_source == "undeclared"


def test_engine_drops_a_level_the_route_cannot_name(clock: FakeClock) -> None:
    """The measured 502 case: `minimal` is not a level the OpenAI route accepts."""
    document = single_route_document(
        capabilities={"reasoning": True, "reasoning_effort": list(OPENAI_LADDER)}
    )
    document["policy"]["reasoning"] = {"mode": "preserve"}
    catalog = catalog_from_document(document, "test catalog")
    decision = _engine(catalog, clock).decide(
        messages=[{"role": "user", "content": SIMPLE_PROMPT}],
        reasoning_effort="minimal",
    )
    assert decision.reasoning_effort == "low"
    assert decision.reasoning_effort_source == "clamped_client"


def test_an_explicit_tier_overrides_the_locally_scored_one() -> None:
    """The routed tier is the input, because a classifier may have set it."""
    signals = _signals(SIMPLE_PROMPT)
    assert signals.tier == "simple"
    applied, source = effort_for(signals, _Policy(), FULL_LADDER, tier="complex")
    assert (applied, source) == ("high", "derived")


def test_the_level_follows_the_routed_tier_across_a_pinned_session(
    clock: FakeClock,
) -> None:
    """A pinned session keeps the tier it was classified under, and so the level."""
    catalog = catalog_from_document(
        single_route_document(
            capabilities={"reasoning": True, "reasoning_effort": list(FULL_LADDER)}
        ),
        "test catalog",
    )
    engine = _engine(catalog, clock)
    first = engine.decide(
        messages=[{"role": "user", "content": COMPLEX_PROMPT}], session_id="session-1"
    )
    assert (first.tier, first.reasoning_effort) == ("complex", "high")

    # A cheap follow-up scores as `simple` on its own, but the session is pinned to
    # the complex tier, and that is the tier the client is told about.
    second = engine.decide(
        messages=[{"role": "user", "content": SIMPLE_PROMPT}], session_id="session-1"
    )
    assert second.signals["tier"] == "simple"
    assert second.tier == "complex"
    assert second.reasoning_effort == "high"


def test_preview_reports_the_same_level_it_would_send(clock: FakeClock) -> None:
    document = single_route_document(
        capabilities={"reasoning": True, "reasoning_effort": ["none", "low"]}
    )
    catalog = catalog_from_document(document, "test catalog")
    preview = _engine(catalog, clock).preview(
        messages=[{"role": "user", "content": COMPLEX_PROMPT}]
    )
    assert preview["reasoning_effort"] == "low"
    assert preview["reasoning_effort_source"] == "derived"


# Storage


def test_an_existing_database_gains_the_new_columns(tmp_path: Any) -> None:
    """A live evidence database predates this column, so it has to be widened."""
    from jev_gateway import records
    from jev_gateway.records import StorageSettings, record_store_from_settings

    path = tmp_path / "records.sqlite3"
    # The schema as the previous release wrote it: the same tables and view, minus
    # the two columns. Built by subtraction so it cannot drift from the real one.
    legacy = records.SCHEMA
    for token in (
        "reasoning_effort TEXT,",
        "reasoning_effort_source TEXT,",
        "d.reasoning_effort,",
        "d.reasoning_effort_source,",
    ):
        legacy = legacy.replace(token, "")
    connection = sqlite3.connect(path)
    connection.executescript(legacy)
    connection.commit()
    legacy_columns = {
        row[1] for row in connection.execute("PRAGMA table_info(decisions)")
    }
    connection.close()
    assert "reasoning_effort" not in legacy_columns

    store = record_store_from_settings(StorageSettings(enabled=True, path=str(path)))
    store.flush()
    store.close()

    connection = sqlite3.connect(path)
    columns = {row[1] for row in connection.execute("PRAGMA table_info(decisions)")}
    view_columns = {
        row[1] for row in connection.execute("PRAGMA table_info(decision_evidence)")
    }
    connection.close()
    assert {"reasoning_effort", "reasoning_effort_source"} <= columns
    # The view is recreated, not altered: SQLite cannot add a column to a view.
    assert {"reasoning_effort", "reasoning_effort_source"} <= view_columns
