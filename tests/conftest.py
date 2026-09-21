"""Shared fixtures for the routing tests."""

from __future__ import annotations

import os
from typing import Any

import pytest

from jev_gateway.catalog import Catalog, catalog_from_document
from jev_gateway.decision import RoutingEngine
from jev_gateway.sessions import MemorySessionStore
from tests.helpers import CATALOG_DOCUMENT, FakeClock, catalog_document

# Catalog routes resolve only the environment variables their api_key_env values
# name. These values make the shared test catalog self-contained.
os.environ.setdefault("TEST_SMALL_PROVIDER_KEY", "test-key-small")
os.environ.setdefault("TEST_LARGE_PROVIDER_KEY", "test-key-large")
os.environ.setdefault("TEST_PROVIDER_KEY", "test-route-key")


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def catalog() -> Catalog:
    return catalog_from_document(CATALOG_DOCUMENT, "test catalog")


@pytest.fixture
def make_catalog():
    def build(**policy_overrides: Any) -> Catalog:
        return catalog_from_document(
            catalog_document(**policy_overrides), "test catalog"
        )

    return build


@pytest.fixture
def make_engine(clock: FakeClock):
    def build(
        catalog: Catalog, store: MemorySessionStore | None = None
    ) -> RoutingEngine:
        return RoutingEngine(
            catalog, store or MemorySessionStore(clock=clock), clock=clock
        )

    return build
