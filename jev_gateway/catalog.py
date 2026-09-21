"""Model catalog and routing policy configuration."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

from jev_gateway.config import (
    TIER_ORDER,
    normalize_api_base,
)
from jev_gateway.records import StorageSettings
from jev_gateway.signals import ScoringPolicy

__all__ = [
    "GATEWAY_SESSION_STRATEGIES",
    "POLICY_MODES",
    "SELECTION_MODES",
    "BudgetPolicy",
    "Catalog",
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
    "RoutingPolicy",
    "ScoringPolicy",
    "SignalsSettings",
    "StrategyDefinition",
    "catalog_from_document",
    "load_catalog",
    "policy_from_dict",
    "profile_from_dict",
    "provider_from_dict",
    "scoring_from_dict",
    "signals_from_dict",
    "storage_from_dict",
]

SELECTION_MODES = ("cheapest_adequate", "quality_first", "balanced")
POLICY_MODES = ("sticky", "escalate", "adaptive", "fresh")
GATEWAY_SESSION_STRATEGIES = ("derived", "header", "user", "off")
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


@dataclass(frozen=True)
class ModelCost:
    """Published price per million tokens, in US dollars."""

    input_per_million: float = 0.0
    output_per_million: float = 0.0


@dataclass(frozen=True)
class ProviderProfile:
    """One provider's reusable transport and credential configuration."""

    name: str
    api_base: str
    api_key_env: str
    api_key: str = ""

    def as_dict(self) -> dict[str, Any]:
        """Serialize provider configuration without its resolved secret."""
        return {
            "id": self.name,
            "api_base": self.api_base,
            "api_key_env": self.api_key_env,
            "has_api_key": bool(self.api_key),
        }


@dataclass(frozen=True)
class ModelProfile:
    """One routable model with the constraints routing conditions depend on."""

    name: str
    provider: str
    model: str
    api_base: str = ""
    api_key: str = ""
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
            "api_base": self.api_base,
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
    """The reasons that may end a session's first-turn pin in `sticky` mode.

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

    def as_dict(self) -> dict[str, Any]:
        """Serialize the signal defaults for the policy endpoint."""
        return {"patterns_enabled": self.patterns_enabled}


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
        }


@dataclass(frozen=True)
class JevSource:
    """One System One-compatible Jev endpoint."""

    name: str
    api_base: str
    api_key_env: str
    model: str = "typesafe/jev-1.13"

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.name,
            "api_base": self.api_base,
            "api_key_env": self.api_key_env,
            "has_api_key": bool(os.getenv(self.api_key_env)),
            "model": self.model,
        }


@dataclass(frozen=True)
class JevSettings:
    """Optional external System One classifier used before model routing."""

    enabled: bool = False
    default_source: str | None = None
    timeout_seconds: float = 1.5
    sources: tuple[JevSource, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "default_source": self.default_source,
            "timeout_seconds": self.timeout_seconds,
            "sources": [source.as_dict() for source in self.sources],
        }


@dataclass(frozen=True)
class RoutingPolicy:
    """Tier mapping, selection preference, and the re-routing thresholds."""

    mode: str = "sticky"
    selection: str = "balanced"
    tier_models: dict[str, tuple[str, ...]] = field(
        default_factory=lambda: dict(DEFAULT_TIER_ROUTES)
    )
    scoring: ScoringPolicy = field(default_factory=ScoringPolicy)
    escalation: EscalationPolicy = field(default_factory=EscalationPolicy)
    hysteresis: HysteresisPolicy = field(default_factory=HysteresisPolicy)
    pin: PinPolicy = field(default_factory=PinPolicy)
    budget: BudgetPolicy = field(default_factory=BudgetPolicy)

    def as_dict(self) -> dict[str, Any]:
        """Serialize the policy for the policy endpoint."""
        return {
            "mode": self.mode,
            "selection": self.selection,
            "tier_models": {
                tier: list(model_ids) for tier, model_ids in self.tier_models.items()
            },
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
        }


@dataclass(frozen=True)
class StrategyDefinition:
    """One named routing policy and its implementation kind."""

    name: str
    policy: RoutingPolicy
    description: str | None = None
    kind: str = "auto"

    def as_dict(self) -> dict[str, Any]:
        """Serialize the definition for the strategy listing endpoint."""
        return {
            "name": self.name,
            "kind": self.kind,
            "description": self.description,
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
    default_strategy: str = "default"
    storage: StorageSettings = field(default_factory=StorageSettings)
    jev: JevSettings = field(default_factory=JevSettings)
    signals: SignalsSettings = field(default_factory=SignalsSettings)

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
        """Return the configured candidate models for a routing tier."""
        return [
            profile
            for model_id in self.policy.tier_models.get(tier, ())
            for profile in [self.by_name(model_id)]
            if profile is not None
        ]

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
        _validate_policy(self.policy, "policy", names)
        strategy_names: list[str] = []
        for definition in self.strategies:
            if not definition.name:
                raise ValueError("A routing strategy must declare a non-empty name.")
            if definition.name in strategy_names:
                raise ValueError(
                    f"Routing strategy {definition.name!r} is configured more than once."
                )
            strategy_names.append(definition.name)
            _validate_policy(
                definition.policy,
                f"strategies.definitions[{definition.name!r}]",
                names,
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
            "jev": self.jev.as_dict(),
            "providers": [provider.as_dict() for provider in self.providers],
            "models": [profile.as_dict() for profile in self.profiles],
        }

    def routing_snapshot(self) -> dict[str, Any]:
        """Return the canonical routing configuration used for storage hashing."""
        return self.as_dict()


def _validate_policy(
    policy: RoutingPolicy, label: str, model_names: set[str]
) -> None:
    """Reject a routing policy that cannot serve every configured tier."""
    for tier, model_ids in policy.tier_models.items():
        if tier not in TIER_ORDER:
            raise ValueError(
                f"{label} tier_models key {tier!r} is unknown. "
                f"Use: {', '.join(TIER_ORDER)}."
            )
        if not model_ids:
            raise ValueError(
                f"{label} tier_models[{tier!r}] must name at least one model."
            )
        unknown_models = [model_id for model_id in model_ids if model_id not in model_names]
        if unknown_models:
            raise ValueError(
                f"{label} tier_models[{tier!r}] references unknown model ids: "
                f"{', '.join(unknown_models)}. Configured models: "
                f"{', '.join(sorted(model_names))}."
            )
    missing_tiers = set(TIER_ORDER) - set(policy.tier_models)
    if missing_tiers:
        raise ValueError(
            f"{label} tier_models is missing tiers: "
            + ", ".join(sorted(missing_tiers))
        )
    if policy.mode not in POLICY_MODES:
        raise ValueError(
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
    """Build one provider transport definition from the catalog document."""
    name = _required_text(item.get("id"), f"Provider entry {index} id")
    if "api_key" in item:
        raise ValueError(
            f"Provider {name!r} may not declare api_key. Use api_key_env instead."
        )
    api_base = normalize_api_base(
        _required_text(item.get("api_base"), f"Provider {name!r} api_base")
    )
    api_key_env = _required_text(
        item.get("api_key_env"), f"Provider {name!r} api_key_env"
    )
    return ProviderProfile(
        name=name,
        api_base=api_base,
        api_key_env=api_key_env,
        api_key=_resolve_api_key(api_key_env, f"Provider {name!r}"),
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
    known_capabilities = {"tools", "vision", "json_mode", "reasoning", "temperature"}
    unknown_capabilities = set(capabilities_value) - known_capabilities
    if unknown_capabilities:
        raise ValueError(
            f"Model {name!r} has unknown capability keys: "
            f"{', '.join(sorted(unknown_capabilities))}."
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
    return ModelProfile(
        name=name,
        provider=provider,
        model=model,
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
            **{
                key: _document_bool(value, f"Model {name!r} capabilities.{key}")
                for key, value in capabilities_value.items()
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


def scoring_from_dict(value: Any, source: str) -> ScoringPolicy:
    """Build the complexity scoring rules from the catalog document."""
    if value is None:
        return ScoringPolicy()
    if not isinstance(value, dict):
        raise TypeError(f"{source} policy scoring must be an object.")

    known = {
        "markers",
        "patterns_enabled",
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

    scoring = ScoringPolicy(**overrides)
    if scoring.complex_threshold < scoring.standard_threshold:
        raise ValueError(
            f"{source} scoring.complex_threshold must not be below "
            "scoring.standard_threshold."
        )
    return scoring


def _scoring_with_document_default(
    value: Any, source: str, patterns_default: bool | None
) -> ScoringPolicy:
    """Apply the document-level signal defaults to one policy's scoring rules.

    A strategy that declares the key itself keeps its own value, so the document
    block only supplies the default.
    """
    scoring = scoring_from_dict(value, source)
    if patterns_default is None:
        return scoring
    if isinstance(value, dict) and "patterns_enabled" in value:
        return scoring
    return replace(scoring, patterns_enabled=patterns_default)


def policy_from_dict(
    data: dict[str, Any],
    source: str,
    *,
    patterns_default: bool | None = None,
) -> RoutingPolicy:
    """Build the routing policy from the catalog document."""
    if not isinstance(data, dict):
        raise TypeError(f"{source} policy must be an object.")
    escalation_value = data.get("escalation") or {}
    hysteresis_value = data.get("hysteresis") or {}
    pin_value = data.get("pin") or {}
    budget_value = data.get("budget") or {}
    for label, value in (
        ("escalation", escalation_value),
        ("hysteresis", hysteresis_value),
        ("pin", pin_value),
        ("budget", budget_value),
    ):
        if not isinstance(value, dict):
            raise TypeError(f"{source} policy {label} must be an object.")
    pin_overrides: dict[str, Any] = {}
    if "break_on" in pin_value:
        break_on = pin_value["break_on"]
        if not isinstance(break_on, list):
            raise TypeError(f"{source} policy pin.break_on must be a list.")
        pin_overrides["break_on"] = tuple(str(reason) for reason in break_on)

    default_policy = RoutingPolicy()
    tier_models_value = data.get("tier_models")
    if not isinstance(tier_models_value, dict):
        raise TypeError(f"{source} policy tier_models must be an object.")
    tier_models: dict[str, tuple[str, ...]] = {}
    for tier, model_ids in tier_models_value.items():
        if not isinstance(model_ids, list):
            raise TypeError(
                f"{source} policy tier_models[{tier!r}] must be a list."
            )
        tier_models[str(tier)] = tuple(str(model_id) for model_id in model_ids)
    return RoutingPolicy(
        mode=str(data.get("mode", default_policy.mode)),
        selection=str(data.get("selection", default_policy.selection)),
        tier_models=tier_models,
        scoring=_scoring_with_document_default(
            data.get("scoring"), source, patterns_default
        ),
        escalation=replace(
            default_policy.escalation,
            **{
                key: escalation_value[key]
                for key in (
                    "max_consecutive_failures",
                    "max_consecutive_truncations",
                    "min_turns_before_escalation",
                    "escalate_on_user_correction",
                    "escalate_on_reasoning_request",
                    "escalate_on_complexity_spike",
                    "deescalate_when_settled",
                    "settle_window",
                )
                if key in escalation_value
            },
        ),
        hysteresis=replace(
            default_policy.hysteresis,
            **{
                key: hysteresis_value[key]
                for key in (
                    "min_turns_between_switches",
                    "cooldown_seconds",
                    "max_switches_per_session",
                )
                if key in hysteresis_value
            },
        ),
        pin=replace(default_policy.pin, **pin_overrides),
        budget=replace(
            default_policy.budget,
            **{
                key: budget_value[key]
                for key in ("max_cost_per_session_usd", "context_pressure_ratio")
                if key in budget_value
            },
        ),
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


def jev_from_dict(value: Any, source: str) -> JevSettings:
    """Build optional System One routing-classifier settings from the catalog."""
    if value is None:
        return JevSettings()
    if not isinstance(value, dict):
        raise TypeError(f"{source} jev must be an object.")
    raw_sources = value.get("sources", [])
    if not isinstance(raw_sources, list):
        raise TypeError(f"{source} jev sources must be a list.")
    sources: list[JevSource] = []
    source_names: set[str] = set()
    for index, item in enumerate(raw_sources):
        if not isinstance(item, dict):
            raise TypeError(f"{source} jev sources[{index}] must be an object.")
        name = _required_text(item.get("id"), f"{source} jev sources[{index}] id")
        if name in source_names:
            raise ValueError(f"{source} configures Jev source {name!r} more than once.")
        source_names.add(name)
        sources.append(
            JevSource(
                name=name,
                api_base=_required_text(
                    item.get("api_base"), f"{source} jev sources[{index}] api_base"
                ),
                api_key_env=_required_text(
                    item.get("api_key_env"),
                    f"{source} jev sources[{index}] api_key_env",
                ),
                model=str(item.get("model", "typesafe/jev-1.13")),
            )
        )
    default_source_value = value.get("default_source")
    default_source = (
        _required_text(default_source_value, f"{source} jev default_source")
        if default_source_value is not None
        else None
    )
    if default_source is not None and default_source not in source_names:
        raise ValueError(
            f"{source} jev default_source {default_source!r} is not configured."
        )
    enabled = value.get("enabled", False)
    if not isinstance(enabled, bool):
        raise TypeError(f"{source} jev enabled must be a boolean.")
    timeout_seconds = _document_float(
        value.get("timeout_seconds", 1.5), f"{source} jev timeout_seconds"
    )
    if timeout_seconds <= 0:
        raise ValueError(f"{source} jev timeout_seconds must be positive.")
    if enabled and not sources:
        raise ValueError(f"{source} jev enabled requires at least one source.")
    return JevSettings(
        enabled=enabled,
        default_source=default_source,
        timeout_seconds=timeout_seconds,
        sources=tuple(sources),
    )


def signals_from_dict(value: Any, source: str) -> SignalsSettings:
    """Build the document-level request signal defaults."""
    if value is None:
        return SignalsSettings()
    if not isinstance(value, dict):
        raise TypeError(f"{source} signals must be an object.")
    unknown = set(value) - {"patterns_enabled"}
    if unknown:
        raise ValueError(
            f"{source} signals has unknown keys: {', '.join(sorted(unknown))}."
        )
    if "patterns_enabled" in value:
        return SignalsSettings(
            patterns_enabled=_document_bool(
                value["patterns_enabled"], f"{source} signals.patterns_enabled"
            )
        )
    return SignalsSettings()


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
) -> tuple[tuple[StrategyDefinition, ...], str]:
    """Parse the optional named strategy definitions from the catalog document."""
    raw = document.get("strategies")
    if not isinstance(raw, dict):
        raise TypeError(f"{source} strategies must be an object.")
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
    default_value = raw.get("default")
    if not isinstance(default_value, str) or not default_value.strip():
        raise ValueError(f"{source} strategies.default must name a defined strategy.")

    definitions: list[StrategyDefinition] = []
    for name, body in definitions_value.items():
        clean_name = str(name).strip()
        if not clean_name:
            raise ValueError(f"{source} strategies.definitions has an empty name.")
        if not isinstance(body, dict):
            raise TypeError(
                f"{source} strategies.definitions[{clean_name!r}] must be an object."
            )
        body_unknown = set(body) - {"description", "kind", "policy"}
        if body_unknown:
            raise ValueError(
                f"{source} strategies.definitions[{clean_name!r}] has unknown keys: "
                f"{', '.join(sorted(body_unknown))}."
            )
        description_value = body.get("description")
        description = (
            str(description_value).strip() if description_value is not None else ""
        )
        kind_value = body.get("kind", "auto")
        if not isinstance(kind_value, str) or not kind_value.strip():
            raise TypeError(
                f"{source} strategies.definitions[{clean_name!r}].kind "
                "must be a non-empty string."
            )
        policy_value = body.get("policy")
        if not isinstance(policy_value, dict):
            raise TypeError(
                f"{source} strategies.definitions[{clean_name!r}].policy "
                "must be an object."
            )
        definitions.append(
            StrategyDefinition(
                name=clean_name,
                policy=policy_from_dict(
                    policy_value,
                    f"{source} strategies.definitions[{clean_name!r}]",
                    patterns_default=patterns_default,
                ),
                description=description or None,
                kind=kind_value.strip(),
            )
        )
    return tuple(definitions), default_value.strip()


def _build_catalog(
    providers: list[ProviderProfile],
    profiles: list[ModelProfile],
    policy: RoutingPolicy,
    gateway: GatewaySettings,
    strategies: tuple[StrategyDefinition, ...],
    default_strategy: str,
    storage: StorageSettings,
    jev: JevSettings,
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
        jev=jev,
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
    strategies_value = document.get("strategies")
    policy_value = document.get("policy")
    if strategies_value is None:
        policy = policy_from_dict(
            policy_value or {}, source, patterns_default=patterns_default
        )
        strategies = (StrategyDefinition("default", policy),)
        default_strategy = "default"
    else:
        definitions, default_strategy = strategies_from_document(
            document, source, patterns_default=patterns_default
        )
        implicit_default = (
            StrategyDefinition(
                "default",
                policy_from_dict(
                    policy_value, source, patterns_default=patterns_default
                ),
            )
            if policy_value is not None
            else None
        )
        if implicit_default is not None and any(
            definition.name == "default" for definition in definitions
        ):
            raise ValueError(
                f"{source} strategies.definitions may not redefine 'default'; "
                "the top-level policy owns that name."
            )
        strategies = (
            ((implicit_default,) if implicit_default is not None else ()) + definitions
        )
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
    return _build_catalog(
        providers,
        profiles,
        policy,
        gateway_from_dict(document.get("gateway"), source),
        strategies,
        default_strategy,
        storage_from_dict(document.get("storage"), source),
        jev_from_dict(document.get("jev"), source),
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
