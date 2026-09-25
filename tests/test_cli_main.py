from __future__ import annotations

import json
from importlib.metadata import version

from jev_gateway.cli import main as cli_main
from jev_gateway.cli.install_state import read_state
from jev_gateway.cli.main import main


def test_version_json(capsys) -> None:
    try:
        main(["--json", "--version"])
    except SystemExit as exc:
        assert exc.code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["data"]["version"] == version("jev-gateway")


def test_version_without_distribution_metadata_is_not_a_made_up_release(monkeypatch) -> None:
    monkeypatch.setattr(cli_main, "package_version", lambda name: (_ for _ in ()).throw(cli_main.PackageNotFoundError(name)))
    assert cli_main._package_version() == "unknown"


def test_install_init_version_records_wheel_instead_of_reporting_cli_version(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    runtime = tmp_path / "runtime"
    url = "https://github.com/TexasOct/jev-gateway/releases/download/v0.2.0rc1/jev_gateway-0.2.0rc1-py3-none-any.whl"
    assert main(["--home", str(runtime), "--json", "install", "init", "--version", "0.2.0rc1", "--source", url]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["command"] == "install.init"
    state = read_state()
    assert state is not None
    assert state["package_version"] == "0.2.0rc1"
    assert state["source"] == url


def test_install_init_rejects_invalid_source_without_mutation(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    runtime = tmp_path / "runtime"
    assert main(["--home", str(runtime), "--json", "install", "init", "--version", "../other", "--source", "https://example.invalid/file.whl"]) == 2
    assert json.loads(capsys.readouterr().out)["error"]["code"] == "invalid_install_source"
    assert not runtime.exists()
    assert read_state() is None


def test_config_path_json(tmp_path, capsys) -> None:
    assert main(["--home", str(tmp_path), "--json", "config", "path"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True
    assert payload["data"]["models"].endswith("models.json")


def test_failure_is_json_document(tmp_path, capsys) -> None:
    code = main(["--home", str(tmp_path), "--json", "config", "validate"])
    assert code != 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is False
    assert payload["error"]["code"]
