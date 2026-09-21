"""The reasoning-effort ladder a route accepts, and the level a request runs at.

Two questions live here on purpose.

The LADDER is a fact about one upstream route: which `reasoning_effort` values it
will accept. It is declared per model in `capabilities.reasoning_effort`, because
it is not the same everywhere. Measured against a live JEV gateway, the
`openai/gpt-5.6-terra` route answers HTTP 502 for `minimal`
(`litellm.UnsupportedParamsError: reasoning_effort=minimal is not supported for
this model`) while the `deepseek/deepseek-flash` route accepts all seven levels.
One global enum would therefore fail on half the catalog.

The LEVEL is a decision. The routing strategy picks a model first; only then does
the engine ask how hard that model should think, because the answer is clamped by
the selected route's ladder. Keeping both halves in one module means the clamp
that joins them has a single home, and neither catalog validation nor the decision
path has to import the other.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

__all__ = [
    "EFFORT_LADDER",
    "REASONING_MODES",
    "UNTOUCHED_SOURCES",
    "clamp_effort",
    "derive_effort",
    "effort_by_tier_from_dict",
    "effort_for",
    "is_effort",
    "ladder_as_dict",
    "ladder_from_list",
    "leaves_payload_alone",
    "optional_policy_effort",
    "policy_effort",
]

# The upstream's own enum, in the upstream's own order. Read off a live 502 from
# the OpenAI-compatible route: "expected one of `none`, `minimal`, `low`,
# `medium`, `high`, `xhigh`, `max`". The order is load-bearing twice: it is the
# walk direction when a level is unsupported, and it is the rank comparison `cap`
# uses. Note `none`, not `off`: pi spells the disabled level `off` locally and
# sends no field at all, so `off` is deliberately not a member here.
EFFORT_LADDER = ("none", "minimal", "low", "medium", "high", "xhigh", "max")

# Which of the client's wishes the gateway is allowed to overrule. `off` is the
# pre-feature behavior and `override` is the default, which is safe rather than
# aggressive: a model that declares no ladder derives nothing, so a catalog that
# has not opted in behaves exactly as it did before this module existed.
REASONING_MODES = ("off", "preserve", "fill", "cap", "override")

# The sources that mean "the gateway did not touch this field". Both leave the
# request's own `reasoning_effort` byte-identical: `off` because the operator
# turned the feature off, `undeclared` because this route never said what it
# accepts, and inventing a value for it would be a guess.
UNTOUCHED_SOURCES = ("off", "undeclared")


def is_effort(value: Any) -> bool:
    """Report whether a value names a level the upstream enum knows."""
    return isinstance(value, str) and value in EFFORT_LADDER


def leaves_payload_alone(source: str) -> bool:
    """Report whether a decision source leaves the request's own value in place."""
    return source in UNTOUCHED_SOURCES


def clamp_effort(ladder: tuple[str, ...], wanted: str | None) -> str | None:
    """The nearest level this route accepts, or None when it declares none.

    Walks UP first and then down, which is the same arithmetic pi applies to its
    own thinking levels. Climbing first matters when the route cannot disable
    thinking: asking for `none` on a ladder of `("low", "high")` has to land on
    `low`, not on whatever happens to sit below an unsupported level.
    """
    if not ladder or wanted is None:
        return None
    if wanted in ladder:
        return wanted
    index = EFFORT_LADDER.index(wanted) if wanted in EFFORT_LADDER else 0
    for candidate in EFFORT_LADDER[index:]:
        if candidate in ladder:
            return candidate
    for candidate in reversed(EFFORT_LADDER[:index]):
        if candidate in ladder:
            return candidate
    return ladder[0]


def derive_effort(
    signals: Any,
    policy: Any,
    tier: str | None = None,
) -> str:
    """The level the request asks for, before any route clamp.

    `tier` defaults to the locally scored one, but callers pass the tier the router
    actually committed to. Those differ, and the routed one is the better input:
    it already carries a classifier's verdict and any session pin, and it is the
    value the client sees in `X-JEV-Task-Type`, so the reported tier and the
    thinking level cannot contradict each other.

    Ordered by how specific the reason is. A user correction outranks the word
    "reasonable" in the prompt, and both outrank the inferred tier, because a
    correction is evidence about the answer we already gave while the tier is a
    guess about the answer we are about to give.
    """
    if policy.on_user_correction and signals.user_correction:
        return policy.on_user_correction
    if policy.on_reasoning_request and signals.reasoning_requested:
        return policy.on_reasoning_request
    by_tier = policy.effort_by_tier.get(signals.tier if tier is None else tier)
    if by_tier:
        return by_tier
    return policy.fallback


def effort_for(
    signals: Any,
    policy: Any,
    ladder: tuple[str, ...],
    requested: str | None = None,
    tier: str | None = None,
) -> tuple[str | None, str]:
    """Return ``(level, source)`` for one request on one already-selected model.

    `tier` is the tier the router committed to, which need not be the locally
    scored one. See :func:`derive_effort`.

    The source is what makes the choice auditable: it separates a level the client
    asked for, a level the gateway derived, a level that had to be clamped into the
    route's ladder, and the two cases where the field was not the gateway's to
    touch. Nothing here raises. A malformed client value is dropped rather than
    forwarded, because forwarding it is a guaranteed upstream 502.
    """
    mode = policy.mode
    if mode == "off":
        return None, "off"
    if not ladder:
        return None, "undeclared"

    derived = clamp_effort(ladder, derive_effort(signals, policy, tier))

    if requested is not None:
        if not is_effort(requested):
            # A value outside the upstream enum entirely. `preserve` keeps the
            # client's INTENT, and there is no way to express an unknown value, so
            # the honest reading is "do not send something the route cannot name".
            return (derived, "derived") if mode == "override" else (None, "invalid_client")
        kept = clamp_effort(ladder, requested)
        if mode == "override":
            return derived, "derived"
        # `cap` only ever lowers: a client that asked for less than we derived is
        # the authority on its own budget.
        if mode == "cap" and _rank(ladder, derived) < _rank(ladder, kept):
            return derived, "capped"
        if kept != requested:
            return kept, "clamped_client"
        return kept, "client"

    # The client said nothing about reasoning.
    if mode == "preserve":
        return None, "client"
    return derived, "derived"


def _rank(ladder: tuple[str, ...], value: str | None) -> int:
    """Position of a level within one route's own ladder."""
    if value is None:
        return -1
    return ladder.index(value) if value in ladder else -1


def ladder_from_list(value: Any, subject: str) -> tuple[str, ...]:
    """Parse a declared ladder, ordered canonically and free of duplicates.

    Values are re-ordered by the upstream enum rather than by whatever order the
    catalog file happened to use, so two catalogs that accept the same levels
    behave identically. An unknown value is an error, not a silent no-op: a typo
    like ``"moderate"`` would otherwise leave a ladder that can never be matched.
    """
    if value is None:
        return ()
    if isinstance(value, (str, bytes)) or not isinstance(value, (list, tuple)):
        raise TypeError(f"{subject} must be a list of reasoning-effort levels.")
    unknown = [item for item in value if not is_effort(item)]
    if unknown:
        raise ValueError(
            f"{subject} has unknown reasoning-effort levels: "
            f"{', '.join(repr(item) for item in sorted(unknown, key=str))}. "
            f"Expected some of: {', '.join(EFFORT_LADDER)}."
        )
    return tuple(level for level in EFFORT_LADDER if level in set(value))


def ladder_as_dict(ladder: tuple[str, ...]) -> list[str]:
    """Serialize a ladder for the policy endpoint."""
    return list(ladder)


def policy_effort(value: Any, subject: str) -> str:
    """Read one configured level, rejecting a spelling the upstream cannot take."""
    if value is None:
        raise ValueError(f"{subject} must name a reasoning-effort level.")
    if not is_effort(value):
        raise ValueError(
            f"{subject} must be one of {', '.join(EFFORT_LADDER)}; got {value!r}."
        )
    return value


def optional_policy_effort(value: Any, subject: str) -> str | None:
    """Read a level that may be left unset to disable one derivation trigger."""
    if value is None:
        return None
    return policy_effort(value, subject)


def effort_by_tier_from_dict(value: Any, subject: str) -> Mapping[str, str]:
    """Parse the per-tier level map, rejecting tiers routing cannot produce."""
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise TypeError(f"{subject} must be an object.")
    return {
        str(tier): policy_effort(level, f"{subject}[{tier!r}]")
        for tier, level in value.items()
    }
