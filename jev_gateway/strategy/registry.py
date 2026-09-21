"""Strategy construction, extension registration, and name resolution."""

from __future__ import annotations

from collections.abc import Callable, Mapping

from jev_gateway.catalog import Catalog, StrategyDefinition

from .contracts import RoutingStrategy, UnknownStrategyError
from .jev import JevClassifier, JevStrategy
from .matrix import build_jev_matrix_strategy
from .policy import PolicyStrategy

__all__ = [
    "StrategyFactory",
    "StrategyRegistry",
    "register_strategy_kind",
    "registered_strategy_kinds",
]

StrategyFactory = Callable[[StrategyDefinition, Catalog], RoutingStrategy]


def _policy_factory(
    definition: StrategyDefinition, catalog: Catalog
) -> RoutingStrategy:
    return PolicyStrategy(
        definition.name, definition.policy, definition.description
    )


def _jev_factory(definition: StrategyDefinition, catalog: Catalog) -> RoutingStrategy:
    return JevStrategy(
        definition.name,
        definition.policy,
        JevClassifier(catalog.jev),
        definition.description,
    )


def _auto_factory(definition: StrategyDefinition, catalog: Catalog) -> RoutingStrategy:
    factory = _jev_factory if catalog.jev.sources else _policy_factory
    return factory(definition, catalog)


_FACTORIES: dict[str, StrategyFactory] = {
    "auto": _auto_factory,
    "policy": _policy_factory,
    "jev": _jev_factory,
    "jev_matrix": build_jev_matrix_strategy,
}


def register_strategy_kind(
    kind: str,
    factory: StrategyFactory,
    *,
    replace_existing: bool = False,
) -> None:
    """Register a strategy implementation kind used by catalog definitions.

    Extension modules call this once during application startup. Existing kinds are
    protected unless ``replace_existing`` is explicit, which prevents import order
    from silently changing routing behavior.
    """
    clean_kind = kind.strip()
    if not clean_kind:
        raise ValueError("A strategy kind must be non-empty.")
    if clean_kind in _FACTORIES and not replace_existing:
        raise ValueError(f"Strategy kind {clean_kind!r} is already registered.")
    _FACTORIES[clean_kind] = factory


def registered_strategy_kinds() -> tuple[str, ...]:
    """Return registered construction kinds in registration order."""
    return tuple(_FACTORIES)


class StrategyRegistry:
    """The named strategies a gateway can route with, plus its default."""

    def __init__(
        self, strategies: list[RoutingStrategy], default_name: str
    ) -> None:
        registry: dict[str, RoutingStrategy] = {}
        for strategy in strategies:
            if not strategy.name:
                raise ValueError("A routing strategy must declare a non-empty name.")
            if strategy.name in registry:
                raise ValueError(
                    f"Routing strategy {strategy.name!r} is registered more than once."
                )
            registry[strategy.name] = strategy
        if not registry:
            raise ValueError("At least one routing strategy is required.")
        if default_name not in registry:
            raise ValueError(
                f"Default routing strategy {default_name!r} is not registered. "
                f"Known strategies: {', '.join(registry)}."
            )
        self._strategies = registry
        self._kinds: dict[str, str] = {}
        self.default_name = default_name

    @classmethod
    def from_catalog(
        cls,
        catalog: Catalog,
        *,
        factories: Mapping[str, StrategyFactory] | None = None,
    ) -> StrategyRegistry:
        """Build implementations from catalog definitions and registered kinds."""
        available = dict(_FACTORIES)
        if factories is not None:
            available.update(factories)

        strategies: list[RoutingStrategy] = []
        kinds: dict[str, str] = {}
        for definition in catalog.strategies:
            factory = available.get(definition.kind)
            if factory is None:
                raise ValueError(
                    f"Strategy {definition.name!r} uses unknown kind "
                    f"{definition.kind!r}. Registered kinds: "
                    f"{', '.join(available)}."
                )
            strategy = factory(definition, catalog)
            if strategy.name != definition.name:
                raise ValueError(
                    f"Strategy factory for kind {definition.kind!r} returned name "
                    f"{strategy.name!r}; expected {definition.name!r}."
                )
            strategies.append(strategy)
            kinds[definition.name] = definition.kind
        registry = cls(strategies, catalog.default_strategy)
        registry._kinds = kinds
        return registry

    def names(self) -> list[str]:
        """Return every registered strategy name in registration order."""
        return list(self._strategies)

    def has(self, name: str) -> bool:
        """Report whether a name is registered."""
        return name in self._strategies

    def get(self, name: str) -> RoutingStrategy:
        """Return one strategy by name, or raise UnknownStrategyError."""
        found = self._strategies.get(name)
        if found is None:
            raise UnknownStrategyError(name, self.names())
        return found

    def resolve(self, name: str | None) -> RoutingStrategy:
        """Return a named strategy, or the default when no name is given."""
        if name is None:
            return self._strategies[self.default_name]
        return self.get(name)

    def describe(self) -> list[dict[str, object]]:
        """Serialize every strategy for the listing endpoint."""
        descriptions: list[dict[str, object]] = []
        for name, strategy in self._strategies.items():
            payload = dict(strategy.describe())
            if name in self._kinds:
                payload["kind"] = self._kinds[name]
            descriptions.append(payload)
        return descriptions
