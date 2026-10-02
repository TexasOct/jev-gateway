"""Routing strategy contracts, built-ins, registry, and extension hooks.

Adding a strategy type does not require editing the engine. Implement
:class:`RoutingStrategy`, provide a ``StrategyFactory``, and register it with
:func:`register_strategy_kind`. Catalog definitions select it through ``kind``.
"""

from .contracts import (
    DecisionMaker,
    RoutingRequest,
    RoutingStrategy,
    SetupIncompleteError,
    StrategyContractError,
    StrategyOutcome,
    UnknownStrategyError,
)
from .classifier import DecisionClassifier, DecisionStrategy
from .matrix import DecisionMatrixStrategy
from .policy import DEFAULT_OUTPUT_TOKENS, PolicyStrategy
from .registry import (
    StrategyFactory,
    StrategyRegistry,
    register_strategy_kind,
    registered_strategy_kinds,
)

__all__ = [
    "DEFAULT_OUTPUT_TOKENS",
    "DecisionClassifier",
    "DecisionMaker",
    "DecisionMatrixStrategy",
    "DecisionStrategy",
    "PolicyStrategy",
    "RoutingRequest",
    "RoutingStrategy",
    "SetupIncompleteError",
    "StrategyContractError",
    "StrategyFactory",
    "StrategyOutcome",
    "StrategyRegistry",
    "UnknownStrategyError",
    "register_strategy_kind",
    "registered_strategy_kinds",
]
