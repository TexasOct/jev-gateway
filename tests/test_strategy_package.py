"""Tests for strategy package compatibility and horizontal extension hooks."""

from __future__ import annotations

import copy

import pytest

from jev_gateway.catalog import Catalog, StrategyDefinition, catalog_from_document
from jev_gateway.signals import ScoringPolicy, extract_signals
from jev_gateway.strategy import (
    JevClassifier,
    PolicyStrategy,
    RoutingRequest,
    RoutingStrategy,
    StrategyOutcome,
    StrategyRegistry,
)
from jev_gateway.strategy.registry import StrategyFactory
from tests.helpers import CATALOG_DOCUMENT, SMALL_MODEL_ID


def document_with_kind(kind: str) -> dict[str, object]:
    document = copy.deepcopy(CATALOG_DOCUMENT)
    document["strategies"] = {
        "default": "custom",
        "definitions": {
            "custom": {
                "kind": kind,
                "description": "Test extension strategy.",
                "policy": copy.deepcopy(document["policy"]),
            }
        },
    }
    del document["policy"]
    return document


def test_strategy_package_preserves_public_imports() -> None:
    assert issubclass(PolicyStrategy, object)
    assert RoutingRequest.__module__ == "jev_gateway.strategy.contracts"
    assert StrategyOutcome.__module__ == "jev_gateway.strategy.contracts"
    assert JevClassifier.__module__ == "jev_gateway.strategy.jev"


def test_strategy_kind_defaults_to_auto() -> None:
    catalog = catalog_from_document(CATALOG_DOCUMENT, "test catalog")

    assert catalog.strategies[0].kind == "auto"
    assert catalog.as_dict()["strategies"][0]["kind"] == "auto"


def test_strategy_kind_parses_from_named_definition() -> None:
    catalog = catalog_from_document(document_with_kind("test-kind"), "test catalog")

    assert catalog.strategies[0].kind == "test-kind"


def test_empty_strategy_kind_is_rejected() -> None:
    document = document_with_kind(" ")

    with pytest.raises(TypeError, match="kind must be a non-empty string"):
        catalog_from_document(document, "test catalog")


def test_unknown_strategy_kind_fails_at_registry_construction() -> None:
    catalog = catalog_from_document(document_with_kind("missing"), "test catalog")

    with pytest.raises(ValueError, match="unknown kind 'missing'"):
        StrategyRegistry.from_catalog(catalog)


class FirstModelStrategy:
    """Minimal independent strategy used to prove factory extensibility."""

    def __init__(self, definition: StrategyDefinition) -> None:
        self.name = definition.name
        self.description = definition.description
        self._policy = definition.policy

    @property
    def scoring(self) -> ScoringPolicy:
        return self._policy.scoring

    def describe(self) -> dict[str, object]:
        return {
            "name": self.name,
            "description": self.description,
            "type": "first-model",
        }

    def decide(self, request: RoutingRequest, catalog: Catalog) -> StrategyOutcome:
        return StrategyOutcome(
            model=catalog.profiles[0].name,
            tier="simple",
            reason="first_model",
            mode="custom",
        )


def test_registry_accepts_an_independent_strategy_factory() -> None:
    catalog = catalog_from_document(document_with_kind("first-model"), "test catalog")

    def factory(definition: StrategyDefinition, catalog: Catalog) -> RoutingStrategy:
        return FirstModelStrategy(definition)

    factories: dict[str, StrategyFactory] = {"first-model": factory}
    registry = StrategyRegistry.from_catalog(catalog, factories=factories)
    strategy = registry.resolve("custom")
    outcome = strategy.decide(
        RoutingRequest(
            signals=extract_signals(
                [{"role": "user", "content": "hello"}],
                scoring=strategy.scoring,
            ),
            session=None,
            manual=None,
            turn_index=1,
            now=0.0,
        ),
        catalog,
    )

    assert registry.names() == ["custom"]
    assert registry.describe()[0]["type"] == "first-model"
    assert registry.describe()[0]["kind"] == "first-model"
    assert outcome.model == SMALL_MODEL_ID


def test_registry_rejects_factory_name_mismatch() -> None:
    catalog = catalog_from_document(document_with_kind("bad-name"), "test catalog")

    def factory(definition: StrategyDefinition, catalog: Catalog) -> RoutingStrategy:
        strategy = FirstModelStrategy(definition)
        strategy.name = "different"
        return strategy

    with pytest.raises(ValueError, match="returned name 'different'"):
        StrategyRegistry.from_catalog(catalog, factories={"bad-name": factory})
