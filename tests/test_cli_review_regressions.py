from __future__ import annotations

import json
import os
import stat

import pytest

from jev_gateway.cli import process
from jev_gateway.cli.main import main
from jev_gateway.cli.output import CliError
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.providers import add_provider, list_providers, login
from jev_gateway.cli.uninstall import execute_uninstall
from tests.helpers import catalog_document


def test_init_honors_global_home_and_preserves_catalog(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    root = tmp_path / "runtime"
    assert main(["--home", str(root), "--json", "install", "init"]) == 0
    assert json.loads(capsys.readouterr().out)["data"]["runtime_dir"] == str(root.resolve())
    before = (root / "models.json").read_bytes()
    assert main(["--home", str(root), "--json", "install", "init"]) == 0
    assert (root / "models.json").read_bytes() == before
    assert stat.S_IMODE((root / ".env").stat().st_mode) == 0o600


def test_catalog_add_without_login_and_duplicate_models(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    paths.models.write_text(json.dumps(catalog_document()))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    original = paths.models.read_bytes()
    with pytest.raises(CliError) as duplicate:
        add_provider(paths, preset="anthropic", provider_id="new-anthropic", provider_type=None, api_base=None, api_key_env=None, models=["a", "a"], tags=[])
    assert duplicate.value.code == "model_exists"
    assert paths.models.read_bytes() == original
    result = add_provider(paths, preset="anthropic", provider_id="new-anthropic", provider_type=None, api_base=None, api_key_env=None, models=["a"], tags=[])
    assert result["secret_set"] is False
    assert {"provider": "new-anthropic", "upstream_model": "a"} in json.loads(paths.models.read_text())["models"]
    assert not paths.env.exists()


def test_login_validation_leaves_catalog_and_env_unchanged(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    paths.models.write_text(json.dumps(catalog_document()))
    before = paths.models.read_bytes()
    with pytest.raises(CliError) as missing:
        login(paths, "unknown", "", "secret")
    assert missing.value.code == "provider_missing"
    with pytest.raises(CliError) as multiline:
        login(paths, "openai", "", "secret\nINJECTED=bad")
    assert multiline.value.code == "invalid_secret"
    assert paths.models.read_bytes() == before
    assert not paths.env.exists()
    key = "secret-private-credential"
    monkeypatch.setenv("KEY_INPUT", key)
    assert main(["--home", str(tmp_path), "--json", "provider", "login", "openai", "--secret-env", "KEY_INPUT"]) == 0
    assert key in (tmp_path / "credentials.json").read_text()
    assert stat.S_IMODE((tmp_path / "credentials.json").stat().st_mode) == 0o600
    assert paths.models.read_bytes() == before
    assert key not in json.dumps(list_providers(paths))


def test_uninstall_dry_run_and_purge_do_not_remove_unmanaged_launcher(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    monkeypatch.setenv("UV_TOOL_BIN_DIR", str(bin_dir))
    launcher = bin_dir / "jev"
    launcher.write_text("unrelated tool")
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    (runtime / "models.json").write_text("{}")
    plan = execute_uninstall(home=runtime, purge=True, dry_run=True)
    assert str(runtime) in plan["paths"]
    assert launcher.read_text() == "unrelated tool"
    assert runtime.exists()
    execute_uninstall(home=runtime, purge=True, yes=True)
    assert not runtime.exists()
    assert launcher.read_text() == "unrelated tool"


def test_foreign_pid_file_is_never_signalled(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    paths.pid.parent.mkdir(parents=True)
    paths.pid.write_text(json.dumps({"pid": os.getpid(), "token": "not-our-token"}))
    monkeypatch.setattr(process.os, "kill", lambda *args: pytest.fail("foreign process signalled"))
    with pytest.raises(CliError) as error:
        process.stop(paths)
    assert error.value.code == "not_running"
    assert paths.pid.exists()


def test_config_output_masks_provider_params(tmp_path, capsys, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    doc = catalog_document()
    doc["providers"][0]["params"] = {"marker": "do-not-print-this-secret"}
    paths.models.write_text(json.dumps(doc))
    assert main(["--home", str(tmp_path), "--json", "config", "show"]) == 0
    assert "do-not-print-this-secret" not in capsys.readouterr().out
    assert "do-not-print-this-secret" not in json.dumps(list_providers(paths))
