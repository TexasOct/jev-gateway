"""Policy-driven model selection, escalation, and session transitions."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from jev_gateway.catalog import Catalog, ModelProfile, RoutingMode, RoutingPolicy
from jev_gateway.sessions import SessionState
from jev_gateway.signals import RequestSignals, ScoringPolicy

from .contracts import RoutingRequest, StrategyOutcome

__all__ = ["DEFAULT_OUTPUT_TOKENS", "PolicyStrategy"]

DEFAULT_OUTPUT_TOKENS = 1024


@dataclass(frozen=True)
class Selection:
    """A chosen profile plus whether the constraints had to be relaxed."""

    profile: ModelProfile
    tier: str
    relaxed: bool


@dataclass(frozen=True)
class _HardRequirement:
    """A constraint the current model cannot satisfy."""

    tier: str
    reason: str
    exclude_current: bool = False
    min_context: int | None = None


@dataclass(frozen=True)
class _Escalation:
    """A quality-driven reason to change the tier or the model."""

    tier: str
    reason: str
    exclude_current: bool = False
    require_reasoning: bool = False


class PolicyStrategy:
    """The built-in strategy: one complete :class:`RoutingPolicy` per instance."""

    def __init__(
        self,
        name: str,
        policy: RoutingPolicy,
        description: str | None = None,
    ) -> None:
        self.name = name
        self.policy = policy
        self.description = description

    @property
    def scoring(self) -> ScoringPolicy:
        """Return the complexity scoring rules this strategy applies."""
        return self.policy.scoring

    def describe(self) -> dict[str, Any]:
        """Serialize the strategy and the policy that drives it."""
        return {
            "name": self.name,
            "description": self.description,
            "policy": self.policy.as_dict(),
        }

    def decide(self, request: RoutingRequest, catalog: Catalog) -> StrategyOutcome:
        """Route one request according to this strategy's policy."""
        if request.session is None or request.session.tier not in self.policy.labels:
            return self._initial(request, catalog)
        return self._continuation(request, catalog, request.session)

    # First turn and continuation

    def _initial(self, request: RoutingRequest, catalog: Catalog) -> StrategyOutcome:
        manual = request.manual
        label = self._signal_label(request.signals)
        if manual is not None:
            return self._outcome(
                manual,
                self._tier_for_profile(manual, label),
                "manual_override",
                "manual",
            )
        selection = self._select(label, request.signals, catalog)
        effective_tier = self._effective_tier(selection)
        reason = (
            f"first_turn_{effective_tier}"
            if not selection.relaxed
            else f"tier_fallback_{effective_tier}"
        )
        return self._outcome(selection.profile, effective_tier, reason, "auto")

    def _continuation(
        self, request: RoutingRequest, catalog: Catalog, session: SessionState
    ) -> StrategyOutcome:
        manual = request.manual
        current = catalog.by_name(session.route)
        if current is None:
            return self._initial(request, catalog)

        if manual is not None and manual.name != current.name:
            return self._outcome(
                manual,
                self._tier_for_profile(manual, self._signal_label(request.signals)),
                "manual_override",
                "manual",
                switched_from=current.name,
            )

        selection, reason, blocked_by = self._continuation_selection(
            current, session, request, catalog
        )
        switched_from = current.name if selection.profile.name != current.name else None
        effective_tier = (
            self._effective_tier(selection)
            if switched_from or self.policy.mode is RoutingMode.FRESH
            else session.tier
        )
        return self._outcome(
            selection.profile,
            effective_tier,
            reason,
            "auto",
            switched_from=switched_from,
            blocked_by=blocked_by,
        )

    def _continuation_selection(
        self,
        current: ModelProfile,
        session: SessionState,
        request: RoutingRequest,
        catalog: Catalog,
    ) -> tuple[Selection, str, str | None]:
        """Choose the model for a later turn, or keep the session's model."""
        signals = request.signals

        if self.policy.mode is RoutingMode.FRESH:
            return self._select(self._signal_label(signals), signals, catalog), "per_turn_policy", None

        if self.policy.mode in {RoutingMode.STICKY, RoutingMode.CACHED}:
            return self._pinned_selection(current, session, request, catalog)

        hard = self._hard_requirement(current, session, signals)
        if hard is not None:
            candidate = self._select(
                hard.tier,
                signals,
                catalog,
                exclude=current.name if hard.exclude_current else None,
                min_context=hard.min_context,
            )
            if candidate.profile.name != current.name and self._improves(
                candidate.profile, current, hard.reason
            ):
                return candidate, hard.reason, None

        escalation = self._escalation(session, current, signals)
        if escalation is not None:
            if self._hysteresis_allows(session, request.turn_index, request.now):
                candidate = self._escalation_candidate(
                    current, escalation, signals, catalog
                )
                if candidate is not None:
                    return candidate, escalation.reason, None
            else:
                keep = Selection(profile=current, tier=session.tier, relaxed=False)
                return keep, "session_sticky", "hysteresis"

        keep = Selection(profile=current, tier=session.tier, relaxed=False)
        return keep, "session_sticky", None

    def _pinned_selection(
        self,
        current: ModelProfile,
        session: SessionState,
        request: RoutingRequest,
        catalog: Catalog,
    ) -> tuple[Selection, str, str | None]:
        """Keep the session's first-turn model unless a configured reason breaks the pin.

        The pin is the default mode, so a conversation holds the model that served
        its first turn. Hard requirements that make that model unusable still break
        the pin when their reason is listed in `policy.pin.break_on`; every other
        condition leaves the conversation where it is and reports `session_pinned`.
        """
        signals = request.signals
        break_on = self.policy.pin.break_on

        hard = self._hard_requirement(current, session, signals)
        if hard is not None and hard.reason in break_on:
            candidate = self._select(
                hard.tier,
                signals,
                catalog,
                exclude=current.name if hard.exclude_current else None,
                min_context=hard.min_context,
            )
            if candidate.profile.name != current.name and self._improves(
                candidate.profile, current, hard.reason
            ):
                return candidate, hard.reason, None

        escalation = self._escalation(session, current, signals)
        if (
            escalation is not None
            and escalation.reason in break_on
            and self._hysteresis_allows(session, request.turn_index, request.now)
        ):
            candidate = self._escalation_candidate(
                current, escalation, signals, catalog
            )
            if candidate is not None:
                return candidate, escalation.reason, None

        keep = Selection(profile=current, tier=session.tier, relaxed=False)
        return keep, "session_pinned", None

    def _escalation_candidate(
        self,
        current: ModelProfile,
        escalation: _Escalation,
        signals: RequestSignals,
        catalog: Catalog,
    ) -> Selection | None:
        """Pick a model that differs from the current one, raising the tier if needed."""
        tier = escalation.tier
        visited = {tier}
        while True:
            candidate = self._select(
                tier,
                signals,
                catalog,
                exclude=current.name if escalation.exclude_current else None,
                require_reasoning=escalation.require_reasoning,
            )
            if candidate.profile.name != current.name:
                return Selection(
                    profile=candidate.profile,
                    tier=self._effective_tier(candidate),
                    relaxed=candidate.relaxed,
                )
            next_tier = self._raise_tier(tier)
            if next_tier in visited:
                return None
            visited.add(next_tier)
            tier = next_tier

    # Conditions

    def _hard_requirement(
        self,
        current: ModelProfile,
        session: SessionState,
        signals: RequestSignals,
    ) -> _HardRequirement | None:
        """Return a constraint the current model cannot satisfy."""
        if not self._capable(current, signals):
            return _HardRequirement(
                tier=session.tier, reason="capability_gap", exclude_current=True
            )
        required = self._required_context(signals)
        if not current.fits_context(required) or self._over_pressure(current, required):
            return _HardRequirement(
                tier=session.tier,
                reason="context_pressure",
                exclude_current=True,
                min_context=required,
            )
        if not current.fits_output(self._output_requirement(signals)):
            return _HardRequirement(
                tier=session.tier, reason="output_limit", exclude_current=True
            )
        return None

    def _escalation(
        self,
        session: SessionState,
        current: ModelProfile,
        signals: RequestSignals,
    ) -> _Escalation | None:
        """Return the highest-priority quality reason to change models."""
        escalation = self.policy.escalation
        rank = self._rank(session.tier)
        signal_label = self._signal_label(signals)

        if session.consecutive_failures >= escalation.max_consecutive_failures:
            return _Escalation(
                tier=session.tier, reason="upstream_failures", exclude_current=True
            )
        if session.consecutive_truncations >= escalation.max_consecutive_truncations:
            return _Escalation(
                tier=self._raise_tier(session.tier), reason="output_truncated"
            )
        if escalation.escalate_on_user_correction and signals.user_correction:
            return _Escalation(
                tier=self._raise_tier(session.tier), reason="user_correction"
            )
        if (
            escalation.escalate_on_reasoning_request
            and signals.reasoning_requested
            and not current.capabilities.reasoning
        ):
            return _Escalation(
                tier=self._raise_tier(session.tier),
                reason="reasoning_required",
                require_reasoning=True,
            )
        if (
            escalation.escalate_on_complexity_spike
            and self._rank(signal_label) > rank
            and signals.turn_index >= escalation.min_turns_before_escalation
        ):
            return _Escalation(tier=signal_label, reason="complexity_spike")
        if self._over_budget(session) and rank > 0:
            return _Escalation(
                tier=self._lower_tier(session.tier), reason="budget_pressure"
            )
        if (
            self.policy.mode is RoutingMode.ADAPTIVE
            and escalation.deescalate_when_settled
            and self._rank(signal_label) < rank
            and self._settled(session)
        ):
            return _Escalation(tier=signal_label, reason="complexity_settled")
        return None

    def _over_budget(self, session: SessionState) -> bool:
        limit = self.policy.budget.max_cost_per_session_usd
        return limit is not None and session.cost_usd >= limit

    def _settled(self, session: SessionState) -> bool:
        """Report whether recent turns were all below the standard threshold."""
        window = self.policy.escalation.settle_window
        if window <= 0:
            return False
        recent = session.recent_scores[-window:]
        if len(recent) < window:
            return False
        if session.consecutive_failures or session.consecutive_truncations:
            return False
        boundary = self.policy.labels[session.tier].score
        return all(score < boundary for score in recent)

    def _hysteresis_allows(
        self, session: SessionState, turn_index: int, now: float
    ) -> bool:
        """Damp repeated switching, but never block a session's first change."""
        hysteresis = self.policy.hysteresis
        if session.switch_count >= hysteresis.max_switches_per_session:
            return False
        if session.switch_count == 0:
            return True
        if turn_index - session.switched_at_turn < hysteresis.min_turns_between_switches:
            return False
        return not (now - session.switched_at < hysteresis.cooldown_seconds)

    # Selection

    def _tier_pool(self, tier: str, catalog: Catalog) -> list[ModelProfile]:
        """Return this strategy's candidates for one routing label."""
        route = self.policy.labels[tier]
        if route.models:
            return [
                profile
                for model_id in route.models
                for profile in [catalog.by_name(model_id)]
                if profile is not None
            ]
        tag = route.tag or f"{self.name}/{tier}"
        return [profile for profile in catalog.profiles if tag in profile.tags]

    def _select(
        self,
        tier: str,
        signals: RequestSignals,
        catalog: Catalog,
        *,
        exclude: str | None = None,
        require_reasoning: bool = False,
        min_context: int | None = None,
    ) -> Selection:
        """Pick a model, relaxing constraints in a fixed order until one fits."""
        required_context = max(self._required_context(signals), min_context or 0)
        required_output = self._output_requirement(signals)
        tier_pool = self._tier_pool(tier, catalog)
        pools: list[tuple[list[ModelProfile], bool]] = []
        if tier_pool:
            pools.append((tier_pool, False))
        pools.append((list(catalog.profiles), True))

        steps: list[tuple[bool, bool, int, int | None]] = []
        if require_reasoning:
            steps.extend(
                (
                    (True, True, required_context, required_output),
                    (True, True, required_context, None),
                    (True, True, 0, None),
                )
            )
        steps.extend(
            (
                (False, True, required_context, required_output),
                (False, True, required_context, None),
                (False, True, 0, None),
                (False, False, 0, None),
            )
        )

        for reasoning, capability_strict, context, output in steps:
            for pool, widened in pools:
                candidates = [
                    profile
                    for profile in pool
                    if (exclude is None or profile.name != exclude)
                    and (not reasoning or profile.capabilities.reasoning)
                    and (not capability_strict or self._capable(profile, signals))
                    and profile.fits_context(context)
                    and (output is None or profile.fits_output(output))
                ]
                if candidates:
                    return Selection(
                        profile=self._order(candidates, signals)[0],
                        tier=tier,
                        relaxed=widened,
                    )

        fallback = [
            profile
            for profile in catalog.profiles
            if exclude is None or profile.name != exclude
        ]
        return Selection(
            profile=self._order(fallback or list(catalog.profiles), signals)[0],
            tier=tier,
            relaxed=True,
        )

    def _order(
        self, candidates: list[ModelProfile], signals: RequestSignals
    ) -> list[ModelProfile]:
        """Rank the candidate models with this strategy's selection rule."""
        selection = self.policy.selection
        output_tokens = self._output_requirement(signals)
        costs = {
            profile.name: profile.estimated_cost(
                signals.conversation_tokens, output_tokens
            )
            for profile in candidates
        }
        max_cost = max(costs.values()) or 1.0

        def sort_key(profile: ModelProfile) -> tuple[int | float, ...]:
            priority = profile.priority
            if selection == "cheapest_adequate":
                policy_key = (round(costs[profile.name], 6), priority)
            elif selection == "quality_first":
                policy_key = (-profile.quality, priority)
            else:
                normalized_cost = costs[profile.name] / max_cost
                policy_key = (
                    round(0.4 * normalized_cost - 0.6 * profile.quality, 6),
                    priority,
                )
            return policy_key

        return sorted(candidates, key=sort_key)

    def _improves(
        self, candidate: ModelProfile, current: ModelProfile, reason: str
    ) -> bool:
        """Reject a hard-condition switch that would not actually help."""
        if reason == "context_pressure":
            return self._window(candidate) > self._window(current)
        if reason == "output_limit":
            return self._output_ceiling(candidate) > self._output_ceiling(current)
        return True

    # Model facts

    def _window(self, profile: ModelProfile) -> float:
        """Return the context window, treating an unknown window as unbounded."""
        if profile.context_window is None:
            return math.inf
        return profile.context_window

    def _output_ceiling(self, profile: ModelProfile) -> int | float:
        """Return the output cap, treating an unknown cap as unbounded."""
        if profile.max_output_tokens is None:
            return math.inf
        return profile.max_output_tokens

    def _capable(self, profile: ModelProfile, signals: RequestSignals) -> bool:
        return profile.supports(
            tools=signals.needs_tools,
            vision=signals.needs_vision,
            json_mode=signals.needs_json,
        )

    def _over_pressure(self, profile: ModelProfile, required_tokens: int) -> bool:
        if profile.context_window is None:
            return False
        ratio = self.policy.budget.context_pressure_ratio
        return required_tokens > profile.context_window * ratio

    def _output_requirement(self, signals: RequestSignals) -> int:
        if signals.requested_max_tokens is not None:
            return max(signals.requested_max_tokens, 1)
        return DEFAULT_OUTPUT_TOKENS

    def _required_context(self, signals: RequestSignals) -> int:
        return signals.conversation_tokens + self._output_requirement(signals)

    # Tier labels

    def _effective_tier(self, selection: Selection) -> str:
        """Report the selected model's configured tier after a relaxed fallback."""
        if not selection.relaxed:
            return selection.tier
        return self._tier_for_profile(selection.profile, selection.tier)

    def _tier_for_profile(self, profile: ModelProfile, fallback: str) -> str:
        for tier, route in self.policy.labels.items():
            tag = route.tag or f"{self.name}/{tier}"
            if profile.name in route.models or (not route.models and tag in profile.tags):
                return tier
        return fallback

    def _signal_label(self, signals: RequestSignals) -> str:
        """Map local score to this strategy's labels, with marker promotion."""
        override = signals.route_label
        if override in self.policy.labels:
            return override
        if self.policy.tier_models and signals.tier in self.policy.labels:
            return signals.tier
        if signals.markers:
            return next(reversed(self.policy.labels))
        chosen = next(iter(self.policy.labels))
        for name, route in self.policy.labels.items():
            if signals.score >= route.score:
                chosen = name
        return chosen

    def _rank(self, tier: str) -> int:
        return list(self.policy.labels).index(tier)

    def _raise_tier(self, tier: str) -> str:
        labels = list(self.policy.labels)
        return labels[min(self._rank(tier) + 1, len(labels) - 1)]

    def _lower_tier(self, tier: str) -> str:
        labels = list(self.policy.labels)
        return labels[max(self._rank(tier) - 1, 0)]

    # Bookkeeping

    def _outcome(
        self,
        profile: ModelProfile,
        tier: str,
        reason: str,
        mode: str,
        *,
        switched_from: str | None = None,
        blocked_by: str | None = None,
    ) -> StrategyOutcome:
        return StrategyOutcome(
            model=profile.name,
            tier=tier,
            reason=reason,
            mode=mode,
            switched_from=switched_from,
            blocked_by=blocked_by,
        )
