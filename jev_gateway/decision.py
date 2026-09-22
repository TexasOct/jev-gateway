"""Session-aware routing decisions.

`RoutingEngine` owns the request lifecycle: it extracts signals, asks the
selected strategy which catalog model serves the turn, and turns that answer
into a :class:`Decision`. It does not contain routing rules of its own; the
algorithm lives in `jev_gateway.strategy`. Storage of the inbound request, the
decision evidence, and the upstream outcome is delegated to a
:class:`~jev_gateway.records.RecordStore`.
"""

from __future__ import annotations

import copy
import logging
import time
import uuid
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from jev_gateway.catalog import Catalog, ModelProfile
from jev_gateway.config import coerce_float, coerce_int
from jev_gateway.reasoning import effort_for
from jev_gateway.records import (
    DecisionRecord,
    NullRecordStore,
    OutcomeRecord,
    RecordStore,
    RequestMeta,
    RequestRecord,
)
from jev_gateway.sessions import MemorySessionStore, SessionState
from jev_gateway.signals import RequestSignals, extract_signals
from jev_gateway.strategy import (
    RoutingRequest,
    StrategyContractError,
    StrategyRegistry,
    UnknownStrategyError,
)

__all__ = [
    "AUTO_MODELS",
    "Decision",
    "RoutingEngine",
    "StorageUnavailableError",
    "UnknownModelError",
    "UnknownStrategyError",
]

logger = logging.getLogger("uvicorn.error")

AUTO_MODELS = {"", "auto", "jev-auto"}
RECENT_SCORE_LIMIT = 10
DECISION_LOG_SIZE = 500


class UnknownModelError(ValueError):
    """Raised when a client names a model that is not in the catalog."""


class StorageUnavailableError(RuntimeError):
    """Raised when an enabled record store cannot persist routing evidence."""


@dataclass(frozen=True)
class Decision:
    """The routing outcome for one request."""

    decision_id: str
    request_id: str | None
    session_id: str | None
    strategy: str
    route_name: str
    provider: str
    model: str
    api_base: str | None
    tier: str
    reason: str
    mode: str
    turn_index: int
    switched_from: str | None
    blocked_by: str | None
    reasoning_effort: str | None
    reasoning_effort_source: str
    candidates: tuple[str, ...]
    signals: dict[str, Any]
    created_at: float

    @property
    def label(self) -> str:
        return self.tier

    def as_dict(self) -> dict[str, Any]:
        """Serialize the decision for the decision-log endpoint."""
        return {
            "decision_id": self.decision_id,
            "request_id": self.request_id,
            "session_id": self.session_id,
            "strategy": self.strategy,
            "route": self.route_name,
            "provider": self.provider,
            "model": self.model,
            "label": self.label,
            "tier": self.tier,
            "reason": self.reason,
            "mode": self.mode,
            "turn_index": self.turn_index,
            "switched_from": self.switched_from,
            "blocked_by": self.blocked_by,
            "reasoning_effort": self.reasoning_effort,
            "reasoning_effort_source": self.reasoning_effort_source,
            "candidates": list(self.candidates),
            "signals": dict(self.signals),
            "created_at": self.created_at,
        }


def _usage_int(usage: dict[str, Any] | None, key: str) -> int:
    if not isinstance(usage, dict):
        return 0
    return coerce_int(usage.get(key, 0))


class RoutingEngine:
    """Decide which model serves each turn of a conversation."""

    def __init__(
        self,
        catalog: Catalog,
        store: MemorySessionStore | None = None,
        *,
        clock: Callable[[], float] = time.time,
        decision_log_size: int = DECISION_LOG_SIZE,
        record_store: RecordStore | None = None,
        config_source: str = "models.json",
    ) -> None:
        self.catalog = catalog
        self.store = store if store is not None else MemorySessionStore()
        self._clock = clock
        self._log: deque[Decision] = deque(maxlen=decision_log_size)
        self.record_store: RecordStore = (
            record_store if record_store is not None else NullRecordStore()
        )
        self.config_source = config_source
        self.strategies = StrategyRegistry.from_catalog(catalog)
        self.config_hash = self._register_config(catalog)

    # Request intake

    def record_request(
        self,
        *,
        request_id: str,
        session_id: str | None,
        meta: RequestMeta,
        messages: list[dict[str, Any]],
        requested_model: str = "auto",
        max_tokens: int | None = None,
        tools: list[Any] | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> RequestSignals:
        """Persist the inbound request before routing validates anything."""
        signals = extract_signals(
            messages,
            max_tokens=max_tokens,
            tools=tools,
            response_format=response_format,
            scoring=self.catalog.policy.scoring,
        )
        record = RequestRecord(
            request_id=request_id,
            received_at=self._clock(),
            session_id=session_id,
            requested_strategy=meta.requested_strategy,
            requested_model=requested_model,
            endpoint=meta.endpoint,
            client=meta.client,
            user_agent=meta.user_agent,
            stream=meta.stream,
            max_tokens=max_tokens,
            tools=tools,
            response_format=response_format,
            messages=messages,
            prompt=signals.prompt,
            prompt_chars=signals.prompt_chars,
            prompt_tokens=signals.prompt_tokens,
            conversation_tokens=signals.conversation_tokens,
            turn_index=signals.turn_index,
            has_tools=signals.needs_tools,
            has_vision=signals.needs_vision,
            wants_json=signals.needs_json,
        )
        self._store(lambda: self.record_store.record_request(record), "request")
        return signals

    # Routing

    def decide(
        self,
        *,
        messages: list[dict[str, Any]],
        requested_model: str = "auto",
        session_id: str | None = None,
        max_tokens: int | None = None,
        tools: list[Any] | None = None,
        response_format: dict[str, Any] | None = None,
        strategy: str | None = None,
        request_id: str | None = None,
        reasoning_effort: str | None = None,
    ) -> Decision:
        """Route one request, using the stored session when one exists."""
        strategy_impl = self.strategies.resolve(strategy)
        signals = extract_signals(
            messages,
            max_tokens=max_tokens,
            tools=tools,
            response_format=response_format,
            scoring=strategy_impl.scoring,
        )
        manual: ModelProfile | None = None
        if requested_model not in AUTO_MODELS:
            manual = self.catalog.by_name(requested_model)
            if manual is None:
                raise UnknownModelError(requested_model)

        session = self.store.get(session_id) if session_id else None
        # The strategy contract forbids mutation. SessionState is mutable, so hand
        # the strategy a detached copy and keep the live store object untouched.
        outcome = strategy_impl.decide(
            RoutingRequest(
                signals=signals,
                session=copy.deepcopy(session) if session is not None else None,
                manual=manual,
                turn_index=signals.turn_index,
                now=self._clock(),
            ),
            self.catalog,
        )
        profile = self.catalog.by_name(outcome.model)
        if profile is None:
            raise StrategyContractError(
                f"Strategy {strategy_impl.name!r} selected unknown model "
                f"{outcome.model!r}."
            )
        effort, effort_source = self._reasoning_choice(
            strategy_impl, signals, profile, reasoning_effort, outcome.tier
        )
        decision = self._build(
            request_id=request_id,
            strategy=strategy_impl.name,
            session_id=session_id,
            profile=profile,
            outcome_tier=outcome.tier,
            reason=outcome.reason,
            mode=outcome.mode,
            turn_index=signals.turn_index,
            switched_from=outcome.switched_from,
            blocked_by=outcome.blocked_by,
            reasoning_effort=effort,
            reasoning_effort_source=effort_source,
            signals=signals,
        )
        self._record_decision(decision)
        self._log.append(decision)
        self._persist(decision, session)
        return decision

    def preview(
        self,
        *,
        messages: list[dict[str, Any]],
        requested_model: str = "auto",
        session_id: str | None = None,
        max_tokens: int | None = None,
        tools: list[Any] | None = None,
        response_format: dict[str, Any] | None = None,
        strategy: str | None = None,
        reasoning_effort: str | None = None,
    ) -> dict[str, Any]:
        """Return the routing answer for a request without mutating any state."""
        strategy_impl = self.strategies.resolve(strategy)
        signals = extract_signals(
            messages,
            max_tokens=max_tokens,
            tools=tools,
            response_format=response_format,
            scoring=strategy_impl.scoring,
        )
        manual: ModelProfile | None = None
        if requested_model not in AUTO_MODELS:
            manual = self.catalog.by_name(requested_model)
            if manual is None:
                raise UnknownModelError(requested_model)

        session = self.store.get(session_id) if session_id else None
        # Preview must not touch the live session object either.
        outcome = strategy_impl.decide(
            RoutingRequest(
                signals=signals,
                session=copy.deepcopy(session) if session is not None else None,
                manual=manual,
                turn_index=signals.turn_index,
                now=self._clock(),
            ),
            self.catalog,
        )
        profile = self.catalog.by_name(outcome.model)
        if profile is None:
            raise StrategyContractError(
                f"Strategy {strategy_impl.name!r} selected unknown model "
                f"{outcome.model!r}."
            )
        effort, effort_source = self._reasoning_choice(
            strategy_impl, signals, profile, reasoning_effort, outcome.tier
        )
        return {
            "strategy": strategy_impl.name,
            "session_id": session_id,
            "route": outcome.model,
            "provider": profile.provider,
            "upstream_model": profile.model,
            "label": outcome.tier,
            "tier": outcome.tier,
            "reason": outcome.reason,
            "mode": outcome.mode,
            "switched_from": outcome.switched_from,
            "blocked_by": outcome.blocked_by,
            "reasoning_effort": effort,
            "reasoning_effort_source": effort_source,
            "turn_index": signals.turn_index,
            "candidates": [profile.name for profile in self.catalog.profiles],
            "signals": signals.as_dict(),
        }

    # Outcomes

    def record_outcome(
        self,
        decision: Decision,
        *,
        ok: bool,
        finish_reason: str | None = None,
        usage: dict[str, Any] | None = None,
        latency_ms: float | None = None,
        returned_model: str | None = None,
        error_type: str | None = None,
        error_message: str | None = None,
    ) -> None:
        """Persist the upstream result, then feed it into the session counters."""
        profile = self.catalog.by_name(decision.route_name)
        has_usage = isinstance(usage, dict)
        prompt_tokens = _usage_int(usage, "prompt_tokens") if has_usage else None
        completion_tokens = (
            _usage_int(usage, "completion_tokens") if has_usage else None
        )
        total_tokens = _usage_int(usage, "total_tokens") if has_usage else None
        cost_usd = (
            profile.estimated_cost(
                prompt_tokens or 0, completion_tokens or 0
            )
            if profile is not None and has_usage
            else None
        )
        outcome = OutcomeRecord(
            decision_id=decision.decision_id,
            request_id=decision.request_id,
            ok=ok,
            finish_reason=finish_reason,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            returned_model=returned_model,
            error_type=error_type,
            error_message=error_message,
        )
        self._store(lambda: self.record_store.record_outcome(outcome), "outcome")

        if decision.session_id is None:
            return
        state = self.store.get(decision.session_id)
        if state is None:
            return

        if ok:
            state.consecutive_failures = 0
        else:
            state.consecutive_failures += 1
        if ok and finish_reason == "length":
            state.consecutive_truncations += 1
        elif ok:
            state.consecutive_truncations = 0

        if profile is not None and has_usage:
            state.cost_usd += profile.estimated_cost(
                prompt_tokens or 0, completion_tokens or 0
            )

        score = decision.signals.get("score")
        if isinstance(score, (int, float)) and not isinstance(score, bool):
            state.recent_scores.append(coerce_float(score))
            del state.recent_scores[:-RECENT_SCORE_LIMIT]

        state.updated_at = self._clock()
        self.store.put(state)

    # Retrieval and maintenance

    def decision(self, decision_id: str) -> Decision | None:
        """Look up a logged decision by id."""
        for entry in reversed(self._log):
            if entry.decision_id == decision_id:
                return entry
        return None

    def session_snapshot(self, session_id: str) -> dict[str, Any] | None:
        """Return the stored session state for inspection."""
        return self.store.snapshot(session_id)

    def reload_catalog(self, catalog: Catalog, source: str | None = None) -> None:
        """Swap in a freshly loaded catalog, keeping the session store intact.

        Running sessions survive: one whose route disappeared falls back to a fresh
        first-turn decision. An invalid catalog raises and leaves the active one alone.
        """
        catalog.validate()
        registry = StrategyRegistry.from_catalog(catalog)
        config_hash = self._register_config(catalog, source=source)
        self.catalog = catalog
        self.strategies = registry
        self.config_hash = config_hash
        if source is not None:
            self.config_source = source

    def set_decision_log_size(self, decision_log_size: int) -> None:
        """Resize the bounded decision log while keeping its newest records."""
        self._log = deque(self._log, maxlen=decision_log_size)

    def policy_snapshot(self) -> dict[str, Any]:
        """Return the active catalog and policy for inspection."""
        return self.catalog.as_dict()

    def close(self) -> None:
        """Release the record store's resources."""
        self.record_store.close()

    def new_request_id(self) -> str:
        """Return a fresh inbound request id."""
        return f"req-{uuid.uuid4().hex[:16]}"

    # Storage

    def _register_config(self, catalog: Catalog, source: str | None = None) -> str:
        active_source = source if source is not None else self.config_source
        try:
            return self.record_store.register_config(
                catalog.routing_snapshot(), active_source
            )
        except Exception as error:
            raise StorageUnavailableError(
                f"Routing storage could not register the configuration: {error}"
            ) from error

    def _store(self, write: Callable[[], None], label: str) -> None:
        """Run one storage write, converting any failure into a 503 signal."""
        try:
            write()
        except Exception as error:
            logger.error("routing storage %s write failed error=%s", label, error)
            raise StorageUnavailableError(
                f"Routing storage could not persist the {label} record: {error}"
            ) from error

    def _record_decision(self, decision: Decision) -> None:
        record = DecisionRecord(
            decision_id=decision.decision_id,
            request_id=decision.request_id,
            session_id=decision.session_id,
            strategy=decision.strategy,
            config_hash=self.config_hash,
            route=decision.route_name,
            provider=decision.provider,
            upstream_model=decision.model,
            tier=decision.tier,
            reason=decision.reason,
            mode=decision.mode,
            turn_index=decision.turn_index,
            switched_from=decision.switched_from,
            blocked_by=decision.blocked_by,
            reasoning_effort=decision.reasoning_effort,
            reasoning_effort_source=decision.reasoning_effort_source,
            candidates=decision.candidates,
            signals=decision.signals,
            created_at=decision.created_at,
        )
        self._store(lambda: self.record_store.record_decision(record), "decision")

    def _reasoning_choice(
        self,
        strategy_impl: Any,
        signals: RequestSignals,
        profile: ModelProfile,
        requested: str | None,
        tier: str,
    ) -> tuple[str | None, str]:
        """Pick the thinking level for the model that was just selected.

        After the model, not before, because the answer is clamped by that model's
        declared ladder: the strategy cannot know it when it is still comparing
        candidates. The policy comes from the strategy so `economy` and `quality`
        can differ; a custom strategy that exposes no policy inherits the catalog's.

        The tier is the one the strategy committed to, not the locally scored one.
        It carries a classifier's verdict where one is configured, and it is the
        value reported as `X-JEV-Task-Type`, so the level can never contradict the
        tier the client is told about.
        """
        policy = getattr(strategy_impl, "policy", None)
        reasoning = policy.reasoning if policy is not None else self.catalog.policy.reasoning
        active_policy = policy if policy is not None else self.catalog.policy
        configured = active_policy.labels.get(tier)
        if configured is not None and configured.reasoning_effort is not None:
            from dataclasses import replace
            reasoning = replace(reasoning, effort_by_label={
                **reasoning.effort_by_label, tier: configured.reasoning_effort
            })
        return effort_for(
            signals,
            reasoning,
            profile.capabilities.reasoning_effort,
            requested=requested,
            tier=tier,
        )

    # Bookkeeping

    def _build(
        self,
        *,
        request_id: str | None,
        strategy: str,
        session_id: str | None,
        profile: ModelProfile,
        outcome_tier: str,
        reason: str,
        mode: str,
        turn_index: int,
        switched_from: str | None,
        blocked_by: str | None,
        reasoning_effort: str | None,
        reasoning_effort_source: str,
        signals: RequestSignals,
    ) -> Decision:
        return Decision(
            decision_id=f"dec-{uuid.uuid4().hex[:16]}",
            request_id=request_id,
            session_id=session_id,
            strategy=strategy,
            route_name=profile.name,
            provider=profile.provider,
            model=profile.model,
            api_base=profile.api_base,
            tier=outcome_tier,
            reason=reason,
            mode=mode,
            turn_index=turn_index,
            switched_from=switched_from,
            blocked_by=blocked_by,
            reasoning_effort=reasoning_effort,
            reasoning_effort_source=reasoning_effort_source,
            candidates=tuple(item.name for item in self.catalog.profiles),
            signals=signals.as_dict(),
            created_at=self._clock(),
        )

    def _persist(self, decision: Decision, session: SessionState | None) -> None:
        if decision.session_id is None:
            return
        now = self._clock()
        state = session
        if state is None:
            state = SessionState(
                session_id=decision.session_id,
                route=decision.route_name,
                tier=decision.tier,
                created_at=now,
                updated_at=now,
                switched_at=now,
            )
        if decision.switched_from is not None:
            state.switch_count += 1
            state.switched_at_turn = decision.turn_index
            state.switched_at = now
            state.record_event(
                {
                    "type": "switch",
                    "from": decision.switched_from,
                    "to": decision.route_name,
                    "reason": decision.reason,
                    "turn": decision.turn_index,
                    "decision_id": decision.decision_id,
                }
            )
        state.route = decision.route_name
        state.tier = decision.tier
        state.strategy = decision.strategy
        state.turn_count = max(state.turn_count, decision.turn_index, 1)
        state.updated_at = now
        state.record_event(
            {
                "type": "decision",
                "route": decision.route_name,
                "tier": decision.tier,
                "strategy": decision.strategy,
                "reason": decision.reason,
                "mode": decision.mode,
                "turn": decision.turn_index,
                "score": decision.signals.get("score"),
                "decision_id": decision.decision_id,
            }
        )
        self.store.put(state)
