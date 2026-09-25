from __future__ import annotations

import json
import stat

import pytest

from jev_gateway.cli.output import CliError
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.providers import add_provider, list_providers, login, logout
from jev_gateway.cli.secrets import upsert_env
from tests.helpers import catalog_document


def test_env_upsert_and_permissions(tmp_path) -> None:
    env = tmp_path / ".env"
    env.write_text("KEEP=value\nOPENAI_API_KEY=old\n")
    upsert_env(env, "OPENAI_API_KEY", "new-secret")
    assert "KEEP=value" in env.read_text()
    assert "OPENAI_API_KEY=new-secret" in env.read_text()
    assert stat.S_IMODE(env.stat().st_mode) == 0o600
    assert "old" in (tmp_path / ".env.backup").read_text()


def test_login_before_add_and_logout(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    paths.home.mkdir(exist_ok=True)
    paths.models.write_text(json.dumps(catalog_document()))
    login(paths, "openai", "OPENAI_KEY_INPUT", "not-to-output")
    assert "not-to-output" in paths.env.read_text()
    before = paths.models.read_bytes()
    result = logout(paths, "openai")
    assert result["removed"] is True
    assert paths.models.read_bytes() == before
    assert "not-to-output" not in paths.env.read_text()


def test_add_requires_models_and_preserves_existing_on_duplicate(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    paths = runtime_paths(tmp_path)
    paths.home.mkdir(exist_ok=True)
    paths.models.write_text(json.dumps(catalog_document()))
    before = paths.models.read_bytes()
    with pytest.raises(CliError, match="already exists"):
        add_provider(paths, preset="openai", provider_id="small-provider", provider_type=None, api_base=None, api_key_env=None, models=["x"], tags=[])
    assert paths.models.read_bytes() == before


def test_provider_list_only_exposes_presence(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    paths.home.mkdir(exist_ok=True)
    monkeypatch.setenv("OPENAI_API_KEY", "hidden")
    paths.models.write_text(json.dumps(catalog_document()))
    assert list_providers(paths)[0]["key_present"] is True
    assert "hidden" not in json.dumps(list_providers(paths))
