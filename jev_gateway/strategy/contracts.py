"""Public contract implemented by every routing strategy."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from jev_gateway.catalog import Catalog, ModelProfile
from jev_gateway.sessions import SessionState
from jev_gateway.signals import RequestSignals, ScoringPolicy

__all__ = [
    "RoutingRequest",
    "RoutingStrategy",
    "StrategyContractError",
    "StrategyOutcome",
    "UnknownStrategyError",
]


class UnknownStrategyError(ValueError):
    """Raised when a client names a routing strategy that is not registered."""

    def __init__(self, name: str, valid_names: list[str]) -> None:
        self.name = name
        self.valid_names = list(valid_names)
        super().__init__(
            f"Unknown routing strategy {name!r}. "
            f"Use one of: {', '.join(self.valid_names)}."
        )


class StrategyContractError(RuntimeError):
    """Raised when a strategy returns an outcome the engine cannot honour."""


@dataclass(frozen=True)
class RoutingRequest:
    """Every input a strategy may read. Nothing else is passed to it."""

    signals: RequestSignals
    session: SessionState | None
    manual: ModelProfile | None
    turn_index: int
    now: float

    @property
    def is_first_turn(self) -> bool:
        """Report whether no live session state exists for this request."""
        return self.session is None

    @property
    def current_model(self) -> str | None:
        """Return the session's pinned catalog model id, when one exists."""
        return self.session.route if self.session is not None else None


@dataclass(frozen=True)
class StrategyOutcome:
    """Every output a strategy must return."""

    model: str
    tier: str
    reason: str
    mode: str
    switched_from: str | None = None
    blocked_by: str | None = None


class RoutingStrategy(Protocol):
    """The strict contract every routing strategy implements.

    Implementations choose one catalog model from immutable request inputs. They do
    not receive the session store, decision log, HTTP objects, or upstream clients.
    """

    name: str
    description: str | None

    @property
    def scoring(self) -> ScoringPolicy:
        """Return the complexity scoring rules this strategy applies."""
        raise AssertionError("RoutingStrategy is a protocol, not an implementation.")

    def describe(self) -> dict[str, Any]:
        """Return this strategy's configuration for inspection endpoints."""
        raise AssertionError("RoutingStrategy is a protocol, not an implementation.")

    def decide(self, request: RoutingRequest, catalog: Catalog) -> StrategyOutcome:
        """Choose the catalog model that serves one request."""
        raise AssertionError("RoutingStrategy is a protocol, not an implementation.")
