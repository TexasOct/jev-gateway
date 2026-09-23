"""Model catalog and routing policy configuration."""

from __future__ import annotations

import json
import math
import os
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from enum import Enum
from pathlib import Path
from types import MappingProxyType
from typing import Any

from litellm import provider_list

from jev_gateway.config import (
    TIER_ORDER,
    normalize_api_base,
)
from jev_gateway.logging import LoggingSettings, logging_from_gateway
from jev_gateway.reasoning import (
    REASONING_MODES,
    effort_by_tier_from_dict,
    ladder_as_dict,
    ladder_from_list,
    optional_policy_effort,
    policy_effort,
)
from jev_gateway.records import StorageSettings
from jev_gateway.signals import ScoringPolicy

__all__ = [
    "GATEWAY_SESSION_STRATEGIES",
    "POLICY_MODES",
    "SELECTION_MODES",
    "BudgetPolicy",
    "Catalog",
    "DecisionProvider",
    "DecisionSettings",
    "EscalationPolicy",
    "GatewaySettings",
    "HysteresisPolicy",
    "JevSettings",
    "JevSource",
    "ModelCapabilities",
    "ModelCost",
    "ModelProfile",
    "PinPolicy",
    "ProviderProfile",
    "ReasoningPolicy",
    "RouteLabel",
    "RoutingMode",
    "RoutingPolicy",
    "ScoringPolicy",
    "SignalsSettings",
    "StrategyDefinition",
    "catalog_from_document",
    "decision_from_dict",
    "load_catalog",
    "policy_from_dict",
    "profile_from_dict",
    "provider_from_dict",
    "scoring_from_dict",
    "signals_from_dict",
    "storage_from_dict",
]

SELECTION_MODES = ("cheapest_adequate", "quality_first", "balanced")


class RoutingMode(str, Enum):
    """Supported session-routing behaviors declared by policy.mode."""

    STICKY = "sticky"
    CACHED = "cached"
    ESCALATE = "escalate"
    ADAPTIVE = "adaptive"
    FRESH = "fresh"


POLICY_MODES = tuple(mode.value for mode in RoutingMode)
GATEWAY_SESSION_STRATEGIES = ("derived", "header", "user", "off")
RESERVED_STRATEGY_MODEL_NAMES = {"auto", "jev-auto"}
DEFAULT_TIER_ROUTES = {
    "simple": (),
    "standard": (),
    "complex": (),
}


@dataclass(frozen=True)
class ModelCapabilities:
    """What the upstream model can accept."""

    tools: bool = True
    vision: bool = True
    json_mode: bool = True
    reasoning: bool = False
    temperature: bool = True
    # Which `reasoning_effort` values this route accepts, in upstream vocabulary.
    # Empty means the route never said, and the gateway then derives no level for
    # it: guessing a value for a route that never named one is how a request picks
    # up an upstream 502 instead of an answer.
    reasoning_effort: tuple[str, ...] = ()


@dataclass(frozen=True)
class ModelCost:
    """Published price per million tokens, in US dollars."""

    input_per_million: float = 0.0
    output_per_million: float = 0.0


@dataclass(frozen=True)
class ProviderProfile:
    """One provider's reusable transport and credential configuration."""

    name: str
    type: str
    api_base: str | None = None
    api_key_env: str | None = None
    api_key: str | None = None
    params: Mapping[str, Any] = field(default_factory=dict, repr=False)
    param_env: Mapping[str, str] = field(default_factory=dict)
    resolved_params: Mapping[str, Any] = field(default_factory=dict, repr=False)

    def as_dict(self) -> dict[str, Any]:
        """Serialize provider configuration without its resolved secret."""
        return {
            "id": self.name,
            "type": self.type,
            "api_base": self.api_base,
            "api_key_env": self.api_key_env,
            "has_api_key": bool(self.api_key),
            "params": dict.fromkeys(self.params, "[configured]"),
            "param_env": dict(self.param_env),
        }


@dataclass(frozen=True)
class ModelProfile:
    """One routable model with the constraints routing conditions depend on."""

    name: str
    provider: str
    model: str
    tags: tuple[str, ...] = ()
    api_base: str | None = None
    api_key: str | None = None
    provider_type: str = "openai"
    provider_params: Mapping[str, Any] = field(default_factory=dict, repr=False)
    priority: int = 100
    quality: float = 0.5
    context_window: int | None = None
    max_output_tokens: int | None = None
    capabilities: ModelCapabilities = field(default_factory=ModelCapabilities)
    cost: ModelCost = field(default_factory=ModelCost)

    def supports(self, *, tools: bool, vision: bool, json_mode: bool) -> bool:
        """Check the capability gates for one request."""
        caps = self.capabilities
        if tools and not caps.tools:
            return False
        if vision and not caps.vision:
            return False
        return not (json_mode and not caps.json_mode)

    def fits_context(self, required_tokens: int) -> bool:
        """Check the context window, treating an unknown window as unlimited."""
        return self.context_window is None or required_tokens <= self.context_window

    def fits_output(self, required_tokens: int) -> bool:
        """Check the output limit, treating an unknown limit as unlimited."""
        return (
            self.max_output_tokens is None or required_tokens <= self.max_output_tokens
        )

    def estimated_cost(self, prompt_tokens: int, output_tokens: int) -> float:
        """Estimate one request's cost from the published unit prices."""
        return (
            prompt_tokens * self.cost.input_per_million
            + output_tokens * self.cost.output_per_million
        ) / 1_000_000

    def as_dict(self) -> dict[str, Any]:
        """Serialize the profile for the policy endpoint."""
        return {
            "name": self.name,
            "provider": self.provider,
            "upstream_model": self.model,
            "tags": list(self.tags),
            "api_base": self.api_base,
            "provider_type": self.provider_type,
            "has_api_key": bool(self.api_key),
            "priority": self.priority,
            "quality": self.quality,
            "context_window": self.context_window,
            "max_output_tokens": self.max_output_tokens,
            "capabilities": {
                "tools": self.capabilities.tools,
                "vision": self.capabilities.vision,
                "json_mode": self.capabilities.json_mode,
                "reasoning": self.capabilities.reasoning,
                "temperature": self.capabilities.temperature,
                "reasoning_effort": ladder_as_dict(
                    self.capabilities.reasoning_effort
                ),
            },
            "cost": {
                "input_per_million": self.cost.input_per_million,
                "output_per_million": self.cost.output_per_million,
            },
        }


@dataclass(frozen=True)
class EscalationPolicy:
    """Thresholds that turn a conversation signal into a tier change."""

    max_consecutive_failures: int = 2
    max_consecutive_truncations: int = 2
    min_turns_before_escalation: int = 1
    escalate_on_user_correction: bool = True
    escalate_on_reasoning_request: bool = True
    escalate_on_complexity_spike: bool = True
    deescalate_when_settled: bool = True
    settle_window: int = 3


@dataclass(frozen=True)
class HysteresisPolicy:
    """Guards that stop adjacent turns from flip-flopping between models."""

    min_turns_between_switches: int = 2
    cooldown_seconds: float = 45.0
    max_switches_per_session: int = 8


@dataclass(frozen=True)
class PinPolicy:
    """The reasons that may end a session's first-turn pin in `sticky` or `cached` mode.

    A pinned session stays on the model chosen for its first turn. Only reasons
    listed in `break_on` release the pin, so quality-driven escalation cannot
    move the conversation on its own. The default lists the constraints that
    make the pinned model unusable, because holding those back would fail the
    request instead of moving it. Add escalation reasons such as
    `upstream_failures` to let them break the pin too.
    """

    break_on: tuple[str, ...] = (
        "capability_gap",
        "context_pressure",
        "output_limit",
    )


@dataclass(frozen=True)
class BudgetPolicy:
    """Per-session cost ceiling and the window pressure ratio."""

    max_cost_per_session_usd: float | None = None
    context_pressure_ratio: float = 0.75


@dataclass(frozen=True)
class SignalsSettings:
    """Document-level defaults for the request signal extractor.

    These values seed every strategy in the document. A strategy that declares the
    same key inside its own ``policy.scoring`` keeps its own value, so this block
    supplies the default and the strategy keeps the final say.
    """

    patterns_enabled: bool | None = None
    intent_patterns_enabled: bool | None = None

    def as_dict(self) -> dict[str, Any]:
        """Serialize the signal defaults for the policy endpoint."""
        return {
            "patterns_enabled": self.patterns_enabled,
            "intent_patterns_enabled": self.intent_patterns_enabled,
        }


@dataclass(frozen=True)
class GatewaySettings:
    """Gateway process settings declared alongside the routing catalog."""

    host: str = "127.0.0.1"
    port: int = 8000
    api_key_env: str | None = None
    api_key: str | None = None
    session_strategy: str = "derived"
    session_ttl_seconds: float = 1800.0
    max_sessions: int = 2048
    decision_log_size: int = 500
    echo_requested_model: bool = True
    logging: LoggingSettings = field(default_factory=LoggingSettings)

    def as_dict(self) -> dict[str, Any]:
        """Serialize non-secret gateway settings for the policy endpoint."""
        return {
            "host": self.host,
            "port": self.port,
            "api_key_env": self.api_key_env,
            "has_api_key": bool(self.api_key),
            "session_strategy": self.session_strategy,
            "session_ttl_seconds": self.session_ttl_seconds,
            "max_sessions": self.max_sessions,
            "decision_log_size": self.decision_log_size,
            "echo_requested_model": self.echo_requested_model,
            **self.logging.as_dict(),
        }


@dataclass(frozen=True)
class DecisionProvider:
    """One configured decision endpoint and its wire protocol."""

    name: str
    api_base: str
    api_key_env: str
    model: str | None = None
    protocol: str = "system_one"

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.name,
            "protocol": self.protocol,
            "api_base": self.api_base,
            "api_key_env": self.api_key_env,
            "has_api_key": bool(os.getenv(self.api_key_env)),
            "model": self.model,
        }


@dataclass(frozen=True)
class DecisionSettings:
    """Ordered decision providers used before model routing."""

    enabled: bool = False
    default_provider: str | None = None
    timeout_seconds: float = 1.5
    providers: tuple[DecisionProvider, ...] = ()

    @property
    def default_source(self) -> str | None:
        """Deprecated alias for callers using the old Python contract."""
        return self.default_provider

    @property
    def sources(self) -> tuple[DecisionProvider, ...]:
        """Deprecated alias for callers using the old Python contract."""
        return self.providers

    def as_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "default_provider": self.default_provider,
            "timeout_seconds": self.timeout_seconds,
            "providers": [provider.as_dict() for provider in self.providers],
        }


@dataclass(frozen=True)
class JevSource(DecisionProvider):
    """Deprecated Python constructor retaining the old model default."""

    model: str | None = "typesafe/jev-1.13"


class JevSettings(DecisionSettings):
    """Deprecated Python constructor for legacy source arguments."""

    def __init__(
        self,
        enabled: bool = False,
        default_source: str | None = None,
        timeout_seconds: float = 1.5,
        sources: tuple[DecisionProvider, ...] = (),
    ) -> None:
        super().__init__(enabled, default_source, timeout_seconds, sources)


@dataclass(frozen=True)
class RouteLabel:
    """One ordered score boundary and its model selector."""

    score: float
    models: tuple[str, ...] = ()
    tag: str | None = None
    description: str = ""
    reasoning_effort: str | None = None

    def as_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "score": self.score,
            "description": self.description,
        }
        if self.models:
            result["models"] = list(self.models)
        if self.tag is not None:
            result["tag"] = self.tag
        if self.reasoning_effort is not None:
            result["reasoning_effort"] = self.reasoning_effort
        return result


@dataclass(frozen=True)
class ReasoningPolicy:
    """How the thinking level is chosen once the routed model is known.

    Separate from the model's declared ladder on purpose. The ladder is a fact
    about what an upstream route accepts; this is a preference, and preferences
    belong to a strategy. That split is what lets `economy` ask for `low` where
    `quality` asks for `high` while both run against the same catalog models.

    ``mode`` defaults to `override`, which sounds aggressive and is not: nothing
    is derived for a model that declares no ladder, so a catalog that has not
    filled in `capabilities.reasoning_effort` behaves exactly as it did before
    this policy existed.
    """

    mode: str = "override"
    effort_by_tier: Mapping[str, str] = field(
        default_factory=lambda: {"simple": "low", "standard": "medium", "complex": "high"}
    )
    effort_by_label: Mapping[str, str] = field(default_factory=dict)
    on_reasoning_request: str | None = "high"
    on_user_correction: str | None = "high"
    fallback: str = "medium"

    def as_dict(self) -> dict[str, Any]:
        """Serialize current labels and the legacy tier map."""
        return {
            "mode": self.mode,
            "effort_by_label": dict(self.effort_by_label),
            "effort_by_tier": dict(self.effort_by_tier),
            "on_reasoning_request": self.on_reasoning_request,
            "on_user_correction": self.on_user_correction,
            "fallback": self.fallback,
        }


@dataclass(frozen=True)
class RoutingPolicy:
    """Ordered labels, selection preference, and re-routing thresholds."""

    mode: RoutingMode = RoutingMode.STICKY
    selection: str = "balanced"
    tier_models: dict[str, tuple[str, ...]] = field(
        default_factory=lambda: dict(DEFAULT_TIER_ROUTES)
    )
    labels: dict[str, RouteLabel] = field(default_factory=dict)
    scoring: ScoringPolicy = field(default_factory=ScoringPolicy)
    escalation: EscalationPolicy = field(default_factory=EscalationPolicy)
    hysteresis: HysteresisPolicy = field(default_factory=HysteresisPolicy)
    pin: PinPolicy = field(default_factory=PinPolicy)
    budget: BudgetPolicy = field(default_factory=BudgetPolicy)
    reasoning: ReasoningPolicy = field(default_factory=ReasoningPolicy)

    def __post_init__(self) -> None:
        if not self.labels and set(self.tier_models) == set(TIER_ORDER):
            object.__setattr__(self, "labels", _legacy_labels(self.tier_models, "policy"))

    def as_dict(self) -> dict[str, Any]:
        """Serialize the policy for the policy endpoint."""
        result = {
            "mode": self.mode.value,
            "selection": self.selection,
            "labels": {name: label.as_dict() for name, label in self.labels.items()},
            "scoring": self.scoring.as_dict(),
            "escalation": {
                "max_consecutive_failures": self.escalation.max_consecutive_failures,
                "max_consecutive_truncations": (
                    self.escalation.max_consecutive_truncations
                ),
                "min_turns_before_escalation": (
                    self.escalation.min_turns_before_escalation
                ),
                "escalate_on_user_correction": (
                    self.escalation.escalate_on_user_correction
                ),
                "escalate_on_reasoning_request": (
                    self.escalation.escalate_on_reasoning_request
                ),
                "escalate_on_complexity_spike": (
                    self.escalation.escalate_on_complexity_spike
                ),
                "deescalate_when_settled": self.escalation.deescalate_when_settled,
                "settle_window": self.escalation.settle_window,
            },
            "hysteresis": {
                "min_turns_between_switches": (
                    self.hysteresis.min_turns_between_switches
                ),
                "cooldown_seconds": self.hysteresis.cooldown_seconds,
                "max_switches_per_session": (self.hysteresis.max_switches_per_session),
            },
            "pin": {
                "break_on": list(self.pin.break_on),
            },
            "budget": {
                "max_cost_per_session_usd": self.budget.max_cost_per_session_usd,
                "context_pressure_ratio": self.budget.context_pressure_ratio,
            },
            "reasoning": self.reasoning.as_dict(),
        }
        if self.tier_models:
            result["tier_models"] = {
                tier: list(model_ids)
                for tier, model_ids in self.tier_models.items()
            }
        return result


def _freeze_json_value(value: Any) -> Any:
    """Recursively freeze a JSON-compatible value for catalog storage."""
    if isinstance(value, dict):
        return MappingProxyType(
            {str(key): _freeze_json_value(nested) for key, nested in value.items()}
        )
    if isinstance(value, list):
        return tuple(_freeze_json_value(item) for item in value)
    return value


def _json_value_as_dict(value: Any) -> Any:
    """Return a mutable JSON-shaped copy of a frozen catalog value."""
    if isinstance(value, Mapping):
        return {key: _json_value_as_dict(nested) for key, nested in value.items()}
    if isinstance(value, tuple):
        return [_json_value_as_dict(item) for item in value]
    return value


def _strategy_options_from_document(value: Any, source: str) -> Mapping[str, Any]:
    """Validate and snapshot strategy-specific JSON options."""
    if not isinstance(value, Mapping):
        raise TypeError(f"{source}.options must be an object.")
    options = _json_value_as_dict(value)
    if any(not isinstance(key, str) for key in options):
        raise TypeError(f"{source}.options must be a JSON object.")
    try:
        json.dumps(options, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise TypeError(f"{source}.options must be a JSON object.") from exc
    return _freeze_json_value(options)


@dataclass(frozen=True)
class StrategyDefinition:
    """One named routing policy, implementation kind, and implementation options."""

    name: str
    policy: RoutingPolicy
    description: str | None = None
    kind: str = "auto"
    options: Mapping[str, Any] = field(default_factory=lambda: MappingProxyType({}))

    def __post_init__(self) -> None:
        """Keep a private immutable snapshot when definitions are built directly."""
        object.__setattr__(
            self,
            "options",
            _strategy_options_from_document(self.options, "StrategyDefinition"),
        )

    def as_dict(self) -> dict[str, Any]:
        """Serialize the definition for the strategy listing endpoint."""
        return {
            "name": self.name,
            "kind": self.kind,
            "description": self.description,
            "options": _json_value_as_dict(self.options),
            "policy": self.policy.as_dict(),
        }


@dataclass(frozen=True)
class Catalog:
    """The routable models plus the policy that picks between them."""

    profiles: tuple[ModelProfile, ...]
    providers: tuple[ProviderProfile, ...]
    policy: RoutingPolicy
    gateway: GatewaySettings = field(default_factory=GatewaySettings)
    strategies: tuple[StrategyDefinition, ...] = ()
    default_strategy: str = "task_aware"
    storage: StorageSettings = field(default_factory=StorageSettings)
    decision: DecisionSettings = field(default_factory=DecisionSettings)
    signals: SignalsSettings = field(default_factory=SignalsSettings)

    @property
    def jev(self) -> DecisionSettings:
        """Deprecated Python alias; snapshots use decision instead."""
        return self.decision

    def by_name(self, name: str | None) -> ModelProfile | None:
        """Look up a model by its provider-qualified catalog id."""
        for profile in self.profiles:
            if profile.name == name:
                return profile
        return None

    def names(self) -> list[str]:
        """Return configured catalog model ids in declaration order."""
        return [profile.name for profile in self.profiles]

    def for_tier(self, tier: str) -> list[ModelProfile]:
        """Return the default strategy's candidates for a routing label."""
        route = self.policy.labels.get(tier)
        if route is None:
            return []
        if route.models:
            return [
                profile
                for model_id in route.models
                for profile in [self.by_name(model_id)]
                if profile is not None
            ]
        tag = route.tag or f"{self.default_strategy}/{tier}"
        return [profile for profile in self.profiles if tag in profile.tags]

    def provider_for(self, profile: ModelProfile) -> ProviderProfile:
        """Return the reusable provider configuration for one model."""
        for provider in self.providers:
            if provider.name == profile.provider:
                return provider
        raise ValueError(
            f"Model {profile.name!r} references missing provider {profile.provider!r}."
        )

    def validate(self) -> None:
        """Reject configurations that cannot serve every configured tier."""
        if not self.profiles:
            raise ValueError("At least one model route is required.")
        names = {profile.name for profile in self.profiles}
        provider_names = {provider.name for provider in self.providers}
        if len(provider_names) != len(self.providers):
            raise ValueError("A provider is configured more than once.")
        for profile in self.profiles:
            if profile.provider not in provider_names:
                raise ValueError(
                    f"Model {profile.name!r} references unknown provider {profile.provider!r}."
                )
        _validate_policy(self.policy, "policy", self.profiles, self.default_strategy)
        strategy_names: list[str] = []
        for definition in self.strategies:
            if not definition.name:
                raise ValueError("A routing strategy must declare a non-empty name.")
            if definition.name in RESERVED_STRATEGY_MODEL_NAMES:
                raise ValueError(
                    f"Routing strategy {definition.name!r} conflicts with a reserved "
                    "model name."
                )
            if definition.name in names:
                raise ValueError(
                    f"Routing strategy {definition.name!r} conflicts with a catalog model id."
                )
            if definition.name in strategy_names:
                raise ValueError(
                    f"Routing strategy {definition.name!r} is configured more than once."
                )
            strategy_names.append(definition.name)
            _validate_policy(
                definition.policy,
                f"strategies.definitions[{definition.name!r}]",
                self.profiles,
                definition.name,
            )
        if not strategy_names:
            raise ValueError("At least one routing strategy is required.")
        if self.default_strategy not in strategy_names:
            raise ValueError(
                f"Default routing strategy {self.default_strategy!r} is not defined. "
                f"Known strategies: {', '.join(strategy_names)}."
            )
        if self.gateway.session_strategy not in GATEWAY_SESSION_STRATEGIES:
            raise ValueError(
                f"gateway session_strategy {self.gateway.session_strategy!r} is unknown. "
                f"Use: {', '.join(GATEWAY_SESSION_STRATEGIES)}."
            )

    def as_dict(self) -> dict[str, Any]:
        """Serialize the catalog for the policy endpoint."""
        return {
            "gateway": self.gateway.as_dict(),
            "policy": self.policy.as_dict(),
            "default_strategy": self.default_strategy,
            "strategies": [definition.as_dict() for definition in self.strategies],
            "signals": self.signals.as_dict(),
            "storage": self.storage.as_dict(),
            "decision": self.decision.as_dict(),
            "providers": [provider.as_dict() for provider in self.providers],
            "models": [profile.as_dict() for profile in self.profiles],
        }

    def routing_snapshot(self) -> dict[str, Any]:
        """Return the canonical routing configuration used for storage hashing."""
        return self.as_dict()


def _validate_policy(
    policy: RoutingPolicy,
    label: str,
    profiles: tuple[ModelProfile, ...],
    strategy_name: str,
) -> None:
    """Reject a routing policy that cannot serve its declared labels."""
    if not policy.labels:
        raise ValueError(f"{label} labels must be a non-empty object.")
    model_names = {profile.name for profile in profiles}
    previous = -1.0
    for name, route in policy.labels.items():
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"{label} labels must have non-empty names.")
        if not 0 <= route.score <= 1 or route.score <= previous:
            raise ValueError(
                f"{label} labels[{name!r}].score must increase within [0, 1]."
            )
        previous = route.score
        unknown_models = [model for model in route.models if model not in model_names]
        if unknown_models:
            raise ValueError(
                f"{label} labels[{name!r}] references unknown model ids: "
                f"{', '.join(unknown_models)}."
            )
        tag = route.tag or f"{strategy_name}/{name}"
        tagged = [profile for profile in profiles if tag in profile.tags]
        if route.models and route.tag is not None:
            raise ValueError(
                f"{label} labels[{name!r}] cannot declare both models and tag."
            )
        if not route.models and not tagged:
            raise ValueError(
                f"{label} labels[{name!r}] resolves tag {tag!r}, but no model "
                "declares that tag."
            )
    if next(iter(policy.labels.values())).score != 0:
        raise ValueError(f"{label} first label score must be 0.")
    if not isinstance(policy.mode, RoutingMode):
        raise TypeError(
            f"{label} mode {policy.mode!r} is unknown. "
            f"Use: {', '.join(POLICY_MODES)}."
        )
    if policy.selection not in SELECTION_MODES:
        raise ValueError(
            f"{label} selection {policy.selection!r} is unknown. "
            f"Use: {', '.join(SELECTION_MODES)}."
        )


def _document_int(value: Any, field_name: str) -> int:
    """Coerce a catalog value to int, naming the field when it is invalid."""
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be an integer, got {value!r}.") from exc


def _document_float(value: Any, field_name: str) -> float:
    """Coerce a catalog value to float, naming the field when it is invalid."""
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a number, got {value!r}.") from exc


def _document_bool(value: Any, field_name: str) -> bool:
    """Require a JSON boolean, naming the field when the value is not one."""
    if isinstance(value, bool):
        return value
    raise TypeError(f"{field_name} must be true or false, got {value!r}.")


def parse_routing_mode(value: Any, source: str) -> RoutingMode:
    """Parse one policy mode while reporting valid configuration values."""
    try:
        return RoutingMode(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"{source} mode {value!r} is unknown. Use: {', '.join(POLICY_MODES)}."
        ) from exc


def _optional_int(value: Any, field_name: str) -> int | None:
    """Coerce an optional catalog value to int, where null means unconstrained."""
    if value is None:
        return None
    return _document_int(value, field_name)


def _required_text(value: Any, field_name: str) -> str:
    """Require a non-empty string in the catalog document."""
    text = str(value).strip() if value is not None else ""
    if not text:
        raise ValueError(f"{field_name} is required.")
    return text


def _resolve_api_key(api_key_env: str, subject: str) -> str:
    """Resolve only the environment variable explicitly named in the catalog."""
    value = os.getenv(api_key_env)
    if not value or not value.strip():
        raise ValueError(
            f"{subject} declares api_key_env {api_key_env!r}, but that variable is not set."
        )
    return value.strip()


def provider_from_dict(item: dict[str, Any], index: int) -> ProviderProfile:
    """Resolve a LiteLLM provider type and its configured completion arguments."""
    name = _required_text(item.get("id"), f"Provider entry {index} id")
    if "api_key" in item:
        raise ValueError(
            f"Provider {name!r} may not declare api_key. Use api_key_env instead."
        )
    known_fields = {
        "id", "type", "api_base", "api_key_env", "params", "param_env"
    }
    unknown_fields = set(item) - known_fields
    if unknown_fields:
        raise ValueError(
            f"Provider {name!r} has unknown keys: "
            f"{', '.join(sorted(unknown_fields))}. Use type to select LiteLLM."
        )
    provider_type = _required_text(item.get("type"), f"Provider {name!r} type")
    if provider_type not in provider_list:
        raise ValueError(
            f"Provider {name!r} type {provider_type!r} is not supported by LiteLLM."
        )

    raw_params = item.get("params", {})
    raw_param_env = item.get("param_env", {})
    if not isinstance(raw_params, dict) or not isinstance(raw_param_env, dict):
        raise TypeError(f"Provider {name!r} params and param_env must be objects.")
    reserved = {"model", "messages", "stream", "api_base", "api_key"}
    if any(
        not isinstance(key, str) or not key.isidentifier()
        for key in (set(raw_params) | set(raw_param_env))
    ):
        raise ValueError(
            f"Provider {name!r} completion parameter names must be identifiers."
        )
    overlap = set(raw_params) & set(raw_param_env)
    conflict = (set(raw_params) | set(raw_param_env)) & reserved
    if overlap or conflict:
        raise ValueError(
            f"Provider {name!r} has duplicate or reserved completion parameters: "
            f"{', '.join(sorted(overlap | conflict))}."
        )
    if any(
        key.endswith(("_key", "_token", "_secret", "_credentials"))
        or key in {"extra_headers", "headers", "authorization"}
        for key in raw_params
    ):
        raise ValueError(f"Provider {name!r} credentials belong in param_env.")
    params = dict(raw_params)
    resolved_params = dict(params)
    param_env: dict[str, str] = {}
    for key, value in raw_param_env.items():
        param_env[key] = _required_text(value, f"Provider {name!r} param_env.{key}")
        resolved_params[key] = _resolve_api_key(
            param_env[key], f"Provider {name!r} param_env.{key}"
        )

    api_base_value = item.get("api_base")
    api_base = (
        normalize_api_base(_required_text(api_base_value, f"Provider {name!r} api_base"))
        if api_base_value is not None else None
    )
    api_key_env_value = item.get("api_key_env")
    api_key_env = (
        _required_text(api_key_env_value, f"Provider {name!r} api_key_env")
        if api_key_env_value is not None else None
    )
    if api_key_env and "api_key" in raw_param_env:
        raise ValueError(f"Provider {name!r} cannot declare api_key twice.")
    api_key = _resolve_api_key(api_key_env, f"Provider {name!r}") if api_key_env else None
    if provider_type == "openai" and (not api_base or not api_key):
        raise ValueError(
            f"Provider {name!r} type 'openai' requires api_base and api_key_env."
        )
    return ProviderProfile(
        name=name,
        type=provider_type,
        api_base=api_base,
        api_key_env=api_key_env,
        api_key=api_key,
        params=MappingProxyType(params),
        param_env=MappingProxyType(param_env),
        resolved_params=MappingProxyType(resolved_params),
    )


def profile_from_dict(item: dict[str, Any], index: int) -> ModelProfile:
    """Build one concrete model profile from a catalog entry."""
    provider = _required_text(item.get("provider"), f"Model entry {index} provider")
    model = _required_text(item.get("upstream_model"), f"Model entry {index} upstream_model")
    name = f"{provider}/{model}"
    if "id" in item:
        raise ValueError(
            f"Model {name!r} may not declare id. Its catalog id is provider/upstream_model."
        )

    capabilities_value = item.get("capabilities") or {}
    if not isinstance(capabilities_value, dict):
        raise TypeError(f"Model {name!r} capabilities must be an object.")
    known_capabilities = {
        "tools",
        "vision",
        "json_mode",
        "reasoning",
        "temperature",
        "reasoning_effort",
    }
    unknown_capabilities = set(capabilities_value) - known_capabilities
    if unknown_capabilities:
        raise ValueError(
            f"Model {name!r} has unknown capability keys: "
            f"{', '.join(sorted(unknown_capabilities))}."
        )
    # The ladder is a list, so it is read before the flag comprehension below,
    # which would otherwise try to coerce it to a boolean.
    effort_ladder = ladder_from_list(
        capabilities_value.get("reasoning_effort"),
        f"Model {name!r} capabilities.reasoning_effort",
    )

    cost_value = item.get("cost") or {}
    if not isinstance(cost_value, dict):
        raise TypeError(f"Model {name!r} cost must be an object.")
    forbidden_connection_fields = {"api_base", "api_key", "api_key_env"} & set(item)
    if forbidden_connection_fields:
        raise ValueError(
            f"Model {name!r} must inherit connection settings from provider {provider!r}; "
            f"move {', '.join(sorted(forbidden_connection_fields))} to providers."
        )
    known_fields = {
        "provider",
        "upstream_model",
        "tags",
        "priority",
        "quality",
        "context_window",
        "max_output_tokens",
        "capabilities",
        "cost",
    }
    unknown_fields = set(item) - known_fields
    if unknown_fields:
        raise ValueError(
            f"Model {name!r} has unknown keys: "
            f"{', '.join(sorted(unknown_fields))}."
        )
    tags_value = item.get("tags", [])
    if isinstance(tags_value, (str, bytes)) or not isinstance(tags_value, list):
        raise TypeError(f"Model {name!r} tags must be a list of scoped tag names.")
    tags: list[str] = []
    for tag in tags_value:
        if not isinstance(tag, str) or not tag.strip():
            raise ValueError(f"Model {name!r} tags must contain non-empty strings.")
        clean_tag = tag.strip()
        if clean_tag.startswith("/") or clean_tag.endswith("/") or "//" in clean_tag:
            raise ValueError(
                f"Model {name!r} tag {clean_tag!r} must use non-empty '/' segments."
            )
        if clean_tag in tags:
            raise ValueError(f"Model {name!r} declares tag {clean_tag!r} more than once.")
        tags.append(clean_tag)
    return ModelProfile(
        name=name,
        provider=provider,
        model=model,
        tags=tuple(tags),
        priority=_document_int(
            item.get("priority", index * 10), f"Model {name!r} priority"
        ),
        quality=_document_float(item.get("quality", 0.5), f"Model {name!r} quality"),
        context_window=_optional_int(
            item.get("context_window"), f"Model {name!r} context_window"
        ),
        max_output_tokens=_optional_int(
            item.get("max_output_tokens"), f"Model {name!r} max_output_tokens"
        ),
        capabilities=ModelCapabilities(
            reasoning_effort=effort_ladder,
            **{
                key: _document_bool(value, f"Model {name!r} capabilities.{key}")
                for key, value in capabilities_value.items()
                if key != "reasoning_effort"
            }
        ),
        cost=ModelCost(
            input_per_million=_document_float(
                cost_value.get("input_per_million", 0.0),
                f"Model {name!r} cost.input_per_million",
            ),
            output_per_million=_document_float(
                cost_value.get("output_per_million", 0.0),
                f"Model {name!r} cost.output_per_million",
            ),
        ),
    )


SCORING_FLOAT_FIELDS = (
    "marker_weight",
    "additional_marker_weight",
    "max_additional_marker_weight",
    "reasoning_weight",
    "multi_step_weight",
    "long_output_weight",
    "tools_weight",
    "vision_weight",
    "code_weight",
    "long_prompt_weight",
    "very_long_prompt_weight",
    "turn_depth_weight",
    "max_turn_depth_weight",
    "correction_weight",
)
SCORING_INT_FIELDS = ("long_prompt_chars", "very_long_prompt_chars")
SCORING_THRESHOLD_FIELDS = ("standard_threshold", "complex_threshold")


def scoring_from_dict(
    value: Any, source: str, *, base: ScoringPolicy | None = None
) -> ScoringPolicy:
    """Build scoring rules, inheriting unspecified values from ``base``."""
    if value is None:
        return base or ScoringPolicy()
    if not isinstance(value, dict):
        raise TypeError(f"{source} policy scoring must be an object.")

    known = {
        "markers",
        "patterns_enabled",
        "intent_patterns_enabled",
        *SCORING_FLOAT_FIELDS,
        *SCORING_INT_FIELDS,
        *SCORING_THRESHOLD_FIELDS,
    }
    unknown = set(value) - known
    if unknown:
        raise ValueError(
            f"{source} policy scoring has unknown keys: {', '.join(sorted(unknown))}."
        )

    overrides: dict[str, Any] = {}
    for name in (*SCORING_FLOAT_FIELDS, *SCORING_THRESHOLD_FIELDS):
        if name in value:
            overrides[name] = _document_float(value[name], f"{source} scoring.{name}")
    for name in SCORING_INT_FIELDS:
        if name in value:
            overrides[name] = _document_int(value[name], f"{source} scoring.{name}")
    if "markers" in value:
        markers_value = value["markers"]
        if not isinstance(markers_value, list):
            raise TypeError(f"{source} scoring.markers must be a list.")
        overrides["markers"] = tuple(str(marker) for marker in markers_value)
    if "patterns_enabled" in value:
        overrides["patterns_enabled"] = _document_bool(
            value["patterns_enabled"], f"{source} scoring.patterns_enabled"
        )
    if "intent_patterns_enabled" in value:
        # Tri-state, unlike the flags around it: `null` means "follow
        # patterns_enabled", which is what keeps an unset catalog unchanged.
        intent_value = value["intent_patterns_enabled"]
        overrides["intent_patterns_enabled"] = (
            None
            if intent_value is None
            else _document_bool(
                intent_value, f"{source} scoring.intent_patterns_enabled"
            )
        )

    scoring = replace(base or ScoringPolicy(), **overrides)
    if scoring.complex_threshold < scoring.standard_threshold:
        raise ValueError(
            f"{source} scoring.complex_threshold must not be below "
            "scoring.standard_threshold."
        )
    return scoring


def _scoring_with_document_default(
    value: Any,
    source: str,
    patterns_default: bool | None,
    intent_default: bool | None = None,
    *,
    base: ScoringPolicy | None = None,
) -> ScoringPolicy:
    """Apply the document-level signal defaults to one policy's scoring rules.

    A strategy that declares the key itself keeps its own value, so the document
    block only supplies the default.
    """
    scoring = scoring_from_dict(value, source, base=base)
    declared = value if isinstance(value, dict) else {}
    if "patterns_enabled" not in declared and patterns_default is not None:
        scoring = replace(scoring, patterns_enabled=patterns_default)
    # An explicit null counts as "no opinion" rather than as an override, so a
    # strategy that writes null inherits the document default like any other
    # strategy instead of silently resetting to `follow patterns_enabled`.
    if declared.get("intent_patterns_enabled") is None and intent_default is not None:
        scoring = replace(scoring, intent_patterns_enabled=intent_default)
    return scoring


def reasoning_from_dict(
    value: Any,
    source: str,
    *,
    base: ReasoningPolicy | None = None,
) -> ReasoningPolicy:
    """Build the reasoning policy, inheriting unspecified fields from ``base``."""
    default_policy = base or ReasoningPolicy()
    if value is None:
        return default_policy
    if not isinstance(value, dict):
        raise TypeError(f"{source} policy reasoning must be an object.")
    known = {
        "mode",
        "effort_by_tier",
        "effort_by_label",
        "on_reasoning_request",
        "on_user_correction",
        "fallback",
    }
    unknown = set(value) - known
    if unknown:
        raise ValueError(
            f"{source} policy reasoning has unknown keys: "
            f"{', '.join(sorted(unknown))}."
        )
    mode = str(value.get("mode", default_policy.mode))
    if mode not in REASONING_MODES:
        raise ValueError(
            f"{source} policy reasoning.mode must be one of "
            f"{', '.join(REASONING_MODES)}; got {mode!r}."
        )
    by_tier = dict(default_policy.effort_by_tier)
    if "effort_by_tier" in value:
        by_tier.update(
            effort_by_tier_from_dict(
                value["effort_by_tier"], f"{source} policy reasoning.effort_by_tier"
            )
        )
    by_label = dict(default_policy.effort_by_label)
    if "effort_by_label" in value:
        by_label = dict(effort_by_tier_from_dict(
            value["effort_by_label"], f"{source} policy reasoning.effort_by_label"
        ))
    unknown_tiers = set(by_tier) - set(TIER_ORDER)
    if unknown_tiers:
        # Routing only ever produces the three shipped tiers, so a level mapped to
        # anything else would be a rule that can never fire.
        raise ValueError(
            f"{source} policy reasoning.effort_by_tier has unknown tiers: "
            f"{', '.join(sorted(unknown_tiers))}. Expected some of: "
            f"{', '.join(TIER_ORDER)}."
        )
    return ReasoningPolicy(
        mode=mode,
        effort_by_tier=by_tier,
        effort_by_label=by_label,
        on_reasoning_request=optional_policy_effort(
            value.get("on_reasoning_request", default_policy.on_reasoning_request),
            f"{source} policy reasoning.on_reasoning_request",
        ),
        on_user_correction=optional_policy_effort(
            value.get("on_user_correction", default_policy.on_user_correction),
            f"{source} policy reasoning.on_user_correction",
        ),
        fallback=policy_effort(
            value.get("fallback", default_policy.fallback),
            f"{source} policy reasoning.fallback",
        ),
    )


def _legacy_labels(routes: dict[str, tuple[str, ...]], source: str) -> dict[str, RouteLabel]:
    if set(routes) != set(TIER_ORDER):
        missing = set(TIER_ORDER) - set(routes)
        extra = set(routes) - set(TIER_ORDER)
        raise ValueError(f"{source} tier_models has missing tiers or unknown tiers: "
                         f"{', '.join(sorted(missing | extra))}.")
    return {
        name: RouteLabel(
            score=score,
            models=routes[name],
            description=description,
        )
        for name, score, description in zip(
            TIER_ORDER, (0.0, 0.35, 0.65),
            ("Direct bounded work", "Multi-step work", "Deep analysis or architecture"),
            strict=True,
        )
    }


def _labels_from_dict(value: Any, source: str) -> dict[str, RouteLabel]:
    if not isinstance(value, dict) or not value:
        raise ValueError(f"{source} policy labels must be a non-empty object.")
    labels: dict[str, RouteLabel] = {}
    previous = -1.0
    for name, raw in value.items():
        subject = f"{source} policy labels[{name!r}]"
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"{source} policy label names must be non-empty strings.")
        if not isinstance(raw, dict) or set(raw) - {
            "models", "tag", "score", "description", "reasoning_effort"
        }:
            raise ValueError(
                f"{subject} must contain only models, tag, score, description, "
                "reasoning_effort."
            )
        if "models" in raw and "tag" in raw:
            raise ValueError(f"{subject} cannot declare both models and tag.")
        models = raw.get("models", [])
        if not isinstance(models, list) or any(
            not isinstance(model, str) or not model for model in models
        ):
            raise ValueError(f"{subject}.models must be a list of model ids.")
        if "models" in raw and not models:
            raise ValueError(f"{subject}.models must not be empty when declared.")
        tag = raw.get("tag")
        if tag is not None and (not isinstance(tag, str) or not tag.strip()):
            raise ValueError(f"{subject}.tag must be a non-empty scoped tag.")
        clean_tag = tag.strip() if isinstance(tag, str) else None
        if clean_tag is not None and (
            clean_tag.startswith("/")
            or clean_tag.endswith("/")
            or "//" in clean_tag
        ):
            raise ValueError(f"{subject}.tag must use non-empty '/' segments.")
        score = raw.get("score")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score) or not 0 <= score <= 1 or score <= previous:
            raise ValueError(f"{subject}.score must increase within [0, 1].")
        previous = score
        description = raw.get("description", "")
        if not isinstance(description, str):
            raise TypeError(f"{subject}.description must be text.")
        effort = optional_policy_effort(raw.get("reasoning_effort"), f"{subject}.reasoning_effort")
        labels[name] = RouteLabel(
            score=score,
            models=tuple(models),
            tag=clean_tag,
            description=description,
            reasoning_effort=effort,
        )
    if next(iter(labels.values())).score != 0:
        raise ValueError(f"{source} policy first label score must be 0.")
    return labels


def policy_from_dict(
    data: dict[str, Any],
    source: str,
    *,
    patterns_default: bool | None = None,
    intent_default: bool | None = None,
    base: RoutingPolicy | None = None,
    inherited_strategy: str = "task_aware",
) -> RoutingPolicy:
    """Build a routing policy, inheriting unspecified values from ``base``."""
    if not isinstance(data, dict):
        raise TypeError(f"{source} policy must be an object.")
    known = {
        "mode",
        "selection",
        "tier_models",
        "labels",
        "scoring",
        "escalation",
        "hysteresis",
        "pin",
        "budget",
        "reasoning",
    }
    unknown = set(data) - known
    if unknown:
        raise ValueError(
            f"{source} policy has unknown keys: {', '.join(sorted(unknown))}."
        )
    escalation_value = data.get("escalation") or {}
    hysteresis_value = data.get("hysteresis") or {}
    pin_value = data.get("pin") or {}
    budget_value = data.get("budget") or {}
    reasoning_value = data.get("reasoning") or {}
    for label, value in (
        ("escalation", escalation_value),
        ("hysteresis", hysteresis_value),
        ("pin", pin_value),
        ("budget", budget_value),
        ("reasoning", reasoning_value),
    ):
        if not isinstance(value, dict):
            raise TypeError(f"{source} policy {label} must be an object.")
    section_keys = {
        "escalation": {
            "max_consecutive_failures",
            "max_consecutive_truncations",
            "min_turns_before_escalation",
            "escalate_on_user_correction",
            "escalate_on_reasoning_request",
            "escalate_on_complexity_spike",
            "deescalate_when_settled",
            "settle_window",
        },
        "hysteresis": {
            "min_turns_between_switches",
            "cooldown_seconds",
            "max_switches_per_session",
        },
        "pin": {"break_on"},
        "budget": {"max_cost_per_session_usd", "context_pressure_ratio"},
        "reasoning": {
            "mode",
            "effort_by_tier",
            "effort_by_label",
            "on_reasoning_request",
            "on_user_correction",
            "fallback",
        },
    }
    for label, value in (
        ("escalation", escalation_value),
        ("hysteresis", hysteresis_value),
        ("pin", pin_value),
        ("budget", budget_value),
        ("reasoning", reasoning_value),
    ):
        unknown = set(value) - section_keys[label]
        if unknown:
            raise ValueError(
                f"{source} policy {label} has unknown keys: "
                f"{', '.join(sorted(unknown))}."
            )

    pin_overrides: dict[str, Any] = {}
    if "break_on" in pin_value:
        break_on = pin_value["break_on"]
        if not isinstance(break_on, list):
            raise TypeError(f"{source} policy pin.break_on must be a list.")
        pin_overrides["break_on"] = tuple(str(reason) for reason in break_on)

    default_policy = base or RoutingPolicy()
    if "labels" in data and "tier_models" in data:
        raise ValueError(f"{source} policy cannot mix labels and tier_models.")
    tier_models = dict(default_policy.tier_models) if base is not None else {}
    tier_models_value = data.get("tier_models", {})
    if not isinstance(tier_models_value, dict):
        raise TypeError(f"{source} policy tier_models must be an object.")
    for tier, model_ids in tier_models_value.items():
        if not isinstance(model_ids, (list, tuple)):
            raise TypeError(
                f"{source} policy tier_models[{tier!r}] must be a list."
            )
        tier_models[str(tier)] = tuple(str(model_id) for model_id in model_ids)
    if "labels" in data:
        labels = _labels_from_dict(data["labels"], source)
        tier_models = {}
    elif "tier_models" in data:
        # Legacy tier overrides retain the old partial-merge behavior only when
        # the inherited policy itself uses legacy tiers.
        if base is not None and not base.tier_models:
            raise ValueError(f"{source} policy cannot mix inherited labels and tier_models.")
        labels = _legacy_labels(tier_models, source)
    elif base is not None:
        # A named strategy that only changes selection or session behavior keeps
        # the top-level label vocabulary and its default-scoped model pools.
        labels = {
            name: (
                replace(route, tag=f"{inherited_strategy}/{name}")
                if not route.models and route.tag is None
                else route
            )
            for name, route in base.labels.items()
        }
    else:
        labels = _legacy_labels(tier_models, source)
    reasoning = reasoning_from_dict(
        data.get("reasoning"), source, base=default_policy.reasoning
    )
    unknown_efforts = set(reasoning.effort_by_label) - set(labels)
    if unknown_efforts:
        # A replacing strategy may inherit the old map; discard it only when
        # this strategy has explicitly replaced its label collection.
        if "labels" in data and "effort_by_label" not in reasoning_value:
            reasoning = replace(reasoning, effort_by_label={})
        else:
            raise ValueError(f"{source} reasoning.effort_by_label has unknown labels: "
                             f"{', '.join(sorted(unknown_efforts))}.")
    return RoutingPolicy(
        mode=parse_routing_mode(data.get("mode", default_policy.mode), source),
        selection=str(data.get("selection", default_policy.selection)),
        tier_models=tier_models,
        labels=labels,
        scoring=_scoring_with_document_default(
            data.get("scoring"),
            source,
            patterns_default,
            intent_default,
            base=default_policy.scoring,
        ),
        escalation=replace(
            default_policy.escalation,
            **{
                key: escalation_value[key]
                for key in section_keys["escalation"]
                if key in escalation_value
            },
        ),
        hysteresis=replace(
            default_policy.hysteresis,
            **{
                key: hysteresis_value[key]
                for key in section_keys["hysteresis"]
                if key in hysteresis_value
            },
        ),
        pin=replace(default_policy.pin, **pin_overrides),
        budget=replace(
            default_policy.budget,
            **{
                key: budget_value[key]
                for key in section_keys["budget"]
                if key in budget_value
            },
        ),
        reasoning=reasoning,
    )


def gateway_from_dict(value: Any, source: str) -> GatewaySettings:
    """Build gateway process settings from the catalog document."""
    if value is None:
        return GatewaySettings()
    if not isinstance(value, dict):
        raise TypeError(f"{source} gateway must be an object.")
    known = {
        "host",
        "port",
        "api_key_env",
        "session_strategy",
        "session_ttl_seconds",
        "max_sessions",
        "decision_log_size",
        "echo_requested_model",
        "logging_level",
        "access_log",
        "log_format",
    }
    unknown = set(value) - known
    if unknown:
        raise ValueError(f"{source} gateway has unknown keys: {', '.join(sorted(unknown))}.")

    defaults = GatewaySettings()
    api_key_env = value.get("api_key_env")
    clean_key_env = str(api_key_env).strip() if api_key_env is not None else ""
    if api_key_env is not None and not clean_key_env:
        raise ValueError(f"{source} gateway api_key_env must not be empty.")
    echo_requested_model = value.get(
        "echo_requested_model", defaults.echo_requested_model
    )
    if not isinstance(echo_requested_model, bool):
        raise TypeError(f"{source} gateway echo_requested_model must be a boolean.")
    logging_settings = logging_from_gateway(value, source)
    settings = GatewaySettings(
        host=_required_text(value.get("host", defaults.host), f"{source} gateway host"),
        port=_document_int(value.get("port", defaults.port), f"{source} gateway port"),
        api_key_env=clean_key_env or None,
        session_strategy=str(value.get("session_strategy", defaults.session_strategy)),
        session_ttl_seconds=_document_float(
            value.get("session_ttl_seconds", defaults.session_ttl_seconds),
            f"{source} gateway session_ttl_seconds",
        ),
        max_sessions=_document_int(
            value.get("max_sessions", defaults.max_sessions),
            f"{source} gateway max_sessions",
        ),
        decision_log_size=_document_int(
            value.get("decision_log_size", defaults.decision_log_size),
            f"{source} gateway decision_log_size",
        ),
        echo_requested_model=echo_requested_model,
        logging=logging_settings,
    )
    if not 1 <= settings.port <= 65535:
        raise ValueError(f"{source} gateway port must be between 1 and 65535.")
    if settings.session_ttl_seconds <= 0:
        raise ValueError(f"{source} gateway session_ttl_seconds must be positive.")
    if settings.max_sessions < 1:
        raise ValueError(f"{source} gateway max_sessions must be at least 1.")
    if settings.decision_log_size < 1:
        raise ValueError(f"{source} gateway decision_log_size must be at least 1.")
    if clean_key_env:
        settings = replace(
            settings,
            api_key=_resolve_api_key(clean_key_env, f"{source} gateway"),
        )
    return settings


def decision_from_dict(value: Any, source: str, *, legacy: bool = False) -> DecisionSettings:
    """Validate canonical settings, translating legacy sources only here."""
    label = "jev" if legacy else "decision"
    if value is None:
        return DecisionSettings()
    if not isinstance(value, dict):
        raise TypeError(f"{source} {label} must be an object.")
    provider_key = "sources" if legacy else "providers"
    default_key = "default_source" if legacy else "default_provider"
    unknown = set(value) - {"enabled", "timeout_seconds", default_key, provider_key}
    if unknown:
        raise ValueError(f"{source} {label} has unknown keys: {', '.join(sorted(unknown))}.")
    raw_providers = value.get(provider_key, [])
    if not isinstance(raw_providers, list):
        raise TypeError(f"{source} {label} {provider_key} must be a list.")
    providers: list[DecisionProvider] = []
    names: set[str] = set()
    from jev_gateway.decision_provider import registered_protocols

    for index, item in enumerate(raw_providers):
        subject = f"{source} {label} {provider_key}[{index}]"
        if not isinstance(item, dict):
            raise TypeError(f"{subject} must be an object.")
        allowed = {"id", "api_base", "api_key_env", "model"}
        if not legacy:
            allowed.add("protocol")
        unknown = set(item) - allowed
        if unknown:
            raise ValueError(f"{subject} has unknown keys: {', '.join(sorted(unknown))}.")
        name = _required_text(item.get("id"), f"{subject} id")
        if name in names:
            raise ValueError(f"{source} configures decision provider {name!r} more than once.")
        names.add(name)
        protocol = "system_one" if legacy else _required_text(item.get("protocol"), f"{subject} protocol")
        if protocol not in registered_protocols():
            raise ValueError(f"{subject} protocol {protocol!r} is not supported.")
        model_value = item.get("model", "typesafe/jev-1.13" if legacy else None)
        model = _required_text(model_value, f"{subject} model") if model_value is not None else None
        providers.append(DecisionProvider(
            name=name,
            protocol=protocol,
            api_base=_required_text(item.get("api_base"), f"{subject} api_base"),
            api_key_env=_required_text(item.get("api_key_env"), f"{subject} api_key_env"),
            model=model,
        ))
    default_value = value.get(default_key)
    default_provider = (
        _required_text(default_value, f"{source} {label} {default_key}")
        if default_value is not None else None
    )
    if default_provider is not None and default_provider not in names:
        raise ValueError(f"{source} {label} {default_key} {default_provider!r} is not configured.")
    enabled = value.get("enabled", False)
    if not isinstance(enabled, bool):
        raise TypeError(f"{source} {label} enabled must be a boolean.")
    timeout_seconds = _document_float(value.get("timeout_seconds", 1.5), f"{source} {label} timeout_seconds")
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise ValueError(f"{source} {label} timeout_seconds must be positive and finite.")
    if enabled and not providers:
        raise ValueError(f"{source} {label} enabled requires at least one provider.")
    return DecisionSettings(enabled, default_provider, timeout_seconds, tuple(providers))


def jev_from_dict(value: Any, source: str) -> DecisionSettings:
    """Deprecated parser for the legacy catalog key."""
    return decision_from_dict(value, source, legacy=True)


def signals_from_dict(value: Any, source: str) -> SignalsSettings:
    """Build the document-level request signal defaults."""
    if value is None:
        return SignalsSettings()
    if not isinstance(value, dict):
        raise TypeError(f"{source} signals must be an object.")
    unknown = set(value) - {"patterns_enabled", "intent_patterns_enabled"}
    if unknown:
        raise ValueError(
            f"{source} signals has unknown keys: {', '.join(sorted(unknown))}."
        )
    defaults = SignalsSettings(
        patterns_enabled=(
            _document_bool(
                value["patterns_enabled"], f"{source} signals.patterns_enabled"
            )
            if "patterns_enabled" in value
            else None
        ),
        intent_patterns_enabled=(
            None
            if value.get("intent_patterns_enabled") is None
            else _document_bool(
                value["intent_patterns_enabled"],
                f"{source} signals.intent_patterns_enabled",
            )
        ),
    )
    return defaults


def storage_from_dict(value: Any, source: str) -> StorageSettings:
    """Build the optional record-store settings from the catalog document."""
    if value is None:
        return StorageSettings()
    if not isinstance(value, dict):
        raise TypeError(f"{source} storage must be an object.")
    known = {
        "enabled",
        "path",
        "capture_content",
        "max_requests",
        "max_continuations_per_session",
        "max_continuation_sessions",
        "busy_timeout_ms",
        "queue_size",
    }
    unknown = set(value) - known
    if unknown:
        raise ValueError(f"{source} storage has unknown keys: {', '.join(sorted(unknown))}.")

    defaults = StorageSettings()
    enabled = value.get("enabled", defaults.enabled)
    capture_content = value.get("capture_content", defaults.capture_content)
    for label, flag in (("enabled", enabled), ("capture_content", capture_content)):
        if not isinstance(flag, bool):
            raise TypeError(f"{source} storage {label} must be a boolean.")
    max_requests_value = value.get("max_requests", defaults.max_requests)
    max_requests = (
        None
        if max_requests_value is None
        else _document_int(max_requests_value, f"{source} storage max_requests")
    )
    settings = replace(
        defaults,
        enabled=enabled,
        path=_required_text(
            value.get("path", defaults.path), f"{source} storage path"
        ),
        capture_content=capture_content,
        max_requests=max_requests,
        max_continuations_per_session=_document_int(
            value.get(
                "max_continuations_per_session",
                defaults.max_continuations_per_session,
            ),
            f"{source} storage max_continuations_per_session",
        ),
        max_continuation_sessions=_document_int(
            value.get(
                "max_continuation_sessions",
                defaults.max_continuation_sessions,
            ),
            f"{source} storage max_continuation_sessions",
        ),
        busy_timeout_ms=_document_int(
            value.get("busy_timeout_ms", defaults.busy_timeout_ms),
            f"{source} storage busy_timeout_ms",
        ),
        queue_size=_document_int(
            value.get("queue_size", defaults.queue_size),
            f"{source} storage queue_size",
        ),
    )
    if settings.max_requests is not None and settings.max_requests < 0:
        raise ValueError(f"{source} storage max_requests must not be negative.")
    if settings.max_continuations_per_session < 1:
        raise ValueError(
            f"{source} storage max_continuations_per_session must be at least 1."
        )
    if settings.max_continuation_sessions < 1:
        raise ValueError(
            f"{source} storage max_continuation_sessions must be at least 1."
        )
    if settings.busy_timeout_ms < 0:
        raise ValueError(f"{source} storage busy_timeout_ms must not be negative.")
    if settings.queue_size < 1:
        raise ValueError(f"{source} storage queue_size must be at least 1.")
    return settings


def strategies_from_document(
    document: dict[str, Any],
    source: str,
    *,
    patterns_default: bool | None = None,
    intent_default: bool | None = None,
    base_policy: RoutingPolicy | None = None,
) -> tuple[tuple[StrategyDefinition, ...], str]:
    """Parse named model-routing strategies.

    The compact form maps each public model name directly to the fields that
    override the top-level policy. The former ``default``/``definitions`` wrapper
    remains readable for existing catalogs and custom strategy kinds.
    """
    raw = document.get("strategies")
    if not isinstance(raw, dict) or not raw:
        raise ValueError(f"{source} strategies must be a non-empty object.")

    legacy = "definitions" in raw or "default" in raw
    if legacy:
        unknown = set(raw) - {"default", "definitions"}
        if unknown:
            raise ValueError(
                f"{source} strategies has unknown keys: {', '.join(sorted(unknown))}."
            )
        definitions_value = raw.get("definitions")
        if not isinstance(definitions_value, dict) or not definitions_value:
            raise ValueError(
                f"{source} strategies.definitions must be a non-empty object."
            )
        default_value = raw.get("default", "task_aware")
        if not isinstance(default_value, str) or not default_value.strip():
            raise ValueError(
                f"{source} strategies.default must name a defined strategy."
            )
        entries = definitions_value
        label = "strategies.definitions"
        default_strategy = default_value.strip()
    else:
        if base_policy is None:
            raise ValueError(
                f"{source} compact strategies require a top-level policy."
            )
        entries = raw
        label = "strategies"
        default_strategy = "task_aware"

    definitions: list[StrategyDefinition] = []
    for name, body in entries.items():
        clean_name = str(name).strip()
        if not clean_name:
            raise ValueError(f"{source} {label} has an empty name.")
        if not isinstance(body, dict):
            raise TypeError(f"{source} {label}[{clean_name!r}] must be an object.")

        if legacy:
            body_unknown = set(body) - {"description", "kind", "options", "policy"}
            if body_unknown:
                raise ValueError(
                    f"{source} {label}[{clean_name!r}] has unknown keys: "
                    f"{', '.join(sorted(body_unknown))}."
                )
            policy_value = body.get("policy")
            if not isinstance(policy_value, dict):
                raise TypeError(
                    f"{source} {label}[{clean_name!r}].policy must be an object."
                )
        else:
            policy_value = {
                key: value
                for key, value in body.items()
                if key not in {"description", "kind", "options"}
            }

        description_value = body.get("description")
        description = (
            str(description_value).strip() if description_value is not None else ""
        )
        kind_value = body.get("kind", "auto")
        if not isinstance(kind_value, str) or not kind_value.strip():
            raise TypeError(
                f"{source} {label}[{clean_name!r}].kind must be a non-empty string."
            )
        definitions.append(
            StrategyDefinition(
                name=clean_name,
                policy=policy_from_dict(
                    policy_value,
                    f"{source} {label}[{clean_name!r}]",
                    patterns_default=patterns_default,
                    intent_default=intent_default,
                    base=base_policy,
                    inherited_strategy=default_strategy,
                ),
                description=description or None,
                kind=kind_value.strip(),
                options=(
                    _strategy_options_from_document(
                        body["options"], f"{source} {label}[{clean_name!r}]"
                    )
                    if "options" in body
                    else MappingProxyType({})
                ),
            )
        )
    return tuple(definitions), default_strategy


def _build_catalog(
    providers: list[ProviderProfile],
    profiles: list[ModelProfile],
    policy: RoutingPolicy,
    gateway: GatewaySettings,
    strategies: tuple[StrategyDefinition, ...],
    default_strategy: str,
    storage: StorageSettings,
    decision: DecisionSettings,
    signals: SignalsSettings,
) -> Catalog:
    """Attach reusable provider connections to each concrete model."""
    provider_by_name = {provider.name: provider for provider in providers}
    for profile in profiles:
        if profile.provider not in provider_by_name:
            raise ValueError(
                f"Model {profile.name!r} references unknown provider {profile.provider!r}."
            )
    resolved_profiles = [
        replace(
            profile,
            api_base=provider_by_name[profile.provider].api_base,
            api_key=provider_by_name[profile.provider].api_key,
            provider_type=provider_by_name[profile.provider].type,
            provider_params=provider_by_name[profile.provider].resolved_params,
        )
        for profile in profiles
    ]
    catalog = Catalog(
        profiles=tuple(resolved_profiles),
        providers=tuple(providers),
        policy=policy,
        gateway=gateway,
        strategies=strategies,
        default_strategy=default_strategy,
        storage=storage,
        decision=decision,
        signals=signals,
    )
    catalog.validate()
    return catalog


def catalog_from_document(document: dict[str, Any], source: str) -> Catalog:
    """Build a catalog from a parsed models.json document."""
    if not isinstance(document, dict):
        raise TypeError(f"{source} must contain a JSON object.")
    raw_providers = document.get("providers")
    if not isinstance(raw_providers, list):
        raise TypeError(f"{source} providers must be a list.")
    if not raw_providers:
        raise ValueError(f"{source} must contain a non-empty providers list.")
    providers: list[ProviderProfile] = []
    provider_names: set[str] = set()
    for index, item in enumerate(raw_providers):
        if not isinstance(item, dict):
            raise TypeError(f"{source} providers[{index}] must be an object.")
        provider = provider_from_dict(item, index)
        if provider.name in provider_names:
            raise ValueError(
                f"{source} configures provider {provider.name!r} more than once."
            )
        provider_names.add(provider.name)
        providers.append(provider)

    raw_models = document.get("models")
    if not isinstance(raw_models, list):
        raise TypeError(f"{source} models must be a list.")
    if not raw_models:
        raise ValueError(f"{source} must contain a non-empty models list.")

    profiles: list[ModelProfile] = []
    seen_names: set[str] = set()
    for index, item in enumerate(raw_models):
        if not isinstance(item, dict):
            raise TypeError(f"{source} models[{index}] must be an object.")
        profile = profile_from_dict(item, index)
        if profile.name in seen_names:
            raise ValueError(
                f"{source} configures model {profile.name!r} more than once."
            )
        seen_names.add(profile.name)
        profiles.append(profile)

    signals = signals_from_dict(document.get("signals"), source)
    patterns_default = signals.patterns_enabled
    intent_default = signals.intent_patterns_enabled
    strategies_value = document.get("strategies")
    policy_value = document.get("policy")
    if strategies_value is None:
        raise ValueError(f"{source} strategies must define 'task_aware' explicitly.")
    else:
        base_policy = (
            policy_from_dict(
                policy_value,
                source,
                patterns_default=patterns_default,
                intent_default=intent_default,
            )
            if policy_value is not None
            else None
        )
        definitions, default_strategy = strategies_from_document(
            document,
            source,
            patterns_default=patterns_default,
            intent_default=intent_default,
            base_policy=base_policy,
        )
        strategies = definitions
        known_strategies = [definition.name for definition in strategies]
        if default_strategy not in known_strategies:
            raise ValueError(
                f"{source} strategies.default {default_strategy!r} is not defined. "
                f"Known strategies: {', '.join(known_strategies)}."
            )
        policy = next(
            definition.policy
            for definition in strategies
            if definition.name == default_strategy
        )
    if "decision" in document and "jev" in document:
        raise ValueError(f"{source} cannot declare both decision and jev.")
    return _build_catalog(
        providers,
        profiles,
        policy,
        gateway_from_dict(document.get("gateway"), source),
        strategies,
        default_strategy,
        storage_from_dict(document.get("storage"), source),
        decision_from_dict(
            document.get("jev" if "jev" in document else "decision"),
            source,
            legacy="jev" in document,
        ),
        signals,
    )


def load_catalog(models_file: Path | None = None) -> Catalog:
    """Load the sole routing source, defaulting to the local models.json file."""
    path = models_file or Path("models.json")
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"Could not read the models file {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in the models file {path}: {exc.msg}") from exc
    return catalog_from_document(document, str(path))
