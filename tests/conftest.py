"""Shared fixtures for the routing tests."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
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


_test_runtime_directory: Path | None = None
_original_gateway_home: str | None = None
_original_credentials: dict[str, str | None] = {}


def pytest_configure() -> None:
    """Give import-time gateway construction an isolated catalog during collection."""
    global _test_runtime_directory, _original_gateway_home, _original_credentials
    _original_gateway_home = os.environ.get("JEV_GATEWAY_HOME")
    credential_names = ("DEEPSEEK_API_KEY", "OPENAI_API_KEY", "DECISION_API_KEY")
    _original_credentials = {name: os.environ.get(name) for name in credential_names}
    _test_runtime_directory = Path(tempfile.mkdtemp(prefix="jev-pytest-runtime-"))
    template = Path(__file__).resolve().parents[1] / "jev_gateway/templates/models.example.json"
    shutil.copyfile(template, _test_runtime_directory / "models.json")
    os.environ["JEV_GATEWAY_HOME"] = str(_test_runtime_directory)
    os.environ["DEEPSEEK_API_KEY"] = "test-deepseek-key"
    os.environ["OPENAI_API_KEY"] = "test-openai-key"
    os.environ["DECISION_API_KEY"] = "test-decision-key"


def pytest_unconfigure(config: pytest.Config) -> None:
    """Restore the caller environment and remove the temporary test runtime."""
    if _test_runtime_directory is not None:
        shutil.rmtree(_test_runtime_directory, ignore_errors=True)
    if _original_gateway_home is None:
        os.environ.pop("JEV_GATEWAY_HOME", None)
    else:
        os.environ["JEV_GATEWAY_HOME"] = _original_gateway_home
    for name, value in _original_credentials.items():
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value


@pytest.fixture(scope="session")
def dashboard_bundle() -> Path:
    """Build current assets once; never rely on ignored output from an earlier run."""
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["npm", "--prefix", "frontend", "run", "build"], cwd=root,
        capture_output=True, text=True,
    )
    if result.returncode:
        pytest.fail("Dashboard build failed; run npm --prefix frontend install first.\n" + result.stdout + result.stderr)
    return root / "jev_gateway/static"


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
