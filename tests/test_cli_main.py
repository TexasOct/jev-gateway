from __future__ import annotations

import json
from importlib.metadata import version

import pytest

from jev_gateway.cli import main as cli_main
from jev_gateway.cli.install_state import read_state
from jev_gateway.cli.main import main
from jev_gateway.cli.output import CliError, ExitCode


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


def test_update_restart_noop_does_not_read_configuration_or_start(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(cli_main.process, "running_for_update", lambda paths: None)
    monkeypatch.setattr(cli_main.process, "start", lambda *args: pytest.fail("gateway started"))
    assert main(["--home", str(tmp_path), "--json", "restart-if-running"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["data"] == {"status": "not_running", "restarted": False}


def test_update_restart_stops_owned_gateway_and_waits_for_health(tmp_path, monkeypatch, capsys) -> None:
    models = tmp_path / "models.json"
    env = tmp_path / ".env"
    records = tmp_path / "jev-records.sqlite3"
    for path in (models, env, records):
        path.write_text("preserved")
    identity = (12, "snapshot")
    monkeypatch.setattr(cli_main.process, "running_for_update", lambda paths: identity)
    events = []
    monkeypatch.setattr(cli_main, "_catalog_options", lambda paths: ({}, {}, "127.0.0.1", 8000))
    monkeypatch.setattr(cli_main.process, "stop_if_owned", lambda paths, expected=None: events.append(("stop", expected)))
    monkeypatch.setattr(cli_main.process, "start", lambda *args: events.append("start") or {"pid": 12, "status": "starting"})
    monkeypatch.setattr(cli_main.process, "status", lambda paths: {"pid": 12})
    monkeypatch.setattr(cli_main, "probe", lambda *args, **kwargs: events.append("health") or {"reachable": True})
    assert main(["--home", str(tmp_path), "--json", "restart-if-running"]) == 0
    assert events == [("stop", identity), "start", "health"]
    assert json.loads(capsys.readouterr().out)["data"]["restarted"] is True
    assert [path.read_text() for path in (models, env, records)] == ["preserved"] * 3


@pytest.mark.parametrize("failure", ["ownership_unverified", "stop_timeout"])
def test_update_restart_refuses_failed_ownership_or_stop(tmp_path, monkeypatch, capsys, failure: str) -> None:
    monkeypatch.setattr(cli_main.process, "running_for_update", lambda paths: (12, "snapshot"))
    monkeypatch.setattr(cli_main, "_catalog_options", lambda paths: ({}, {}, "127.0.0.1", 8000))
    def refuse(paths, expected=None):
        raise CliError(failure, "Cannot restart safely.", ExitCode.FAILURE)
    if failure == "ownership_unverified":
        monkeypatch.setattr(cli_main.process, "running_for_update", refuse)
    else:
        monkeypatch.setattr(cli_main.process, "stop_if_owned", refuse)
    monkeypatch.setattr(cli_main.process, "start", lambda *args: pytest.fail("gateway started"))
    assert main(["--home", str(tmp_path), "--json", "restart-if-running"]) == 1
    assert json.loads(capsys.readouterr().out)["error"]["code"] == failure


@pytest.mark.parametrize("mode", ["exit", "timeout", "probe_error"])
def test_update_restart_reports_start_health_failure(tmp_path, monkeypatch, capsys, mode: str) -> None:
    monkeypatch.setattr(cli_main.process, "running_for_update", lambda paths: (12, "snapshot"))
    monkeypatch.setattr(cli_main.process, "stop_if_owned", lambda paths, expected=None: {"status": "stopped"})
    monkeypatch.setattr(cli_main, "_catalog_options", lambda paths: ({}, {}, "127.0.0.1", 8000))
    monkeypatch.setattr(cli_main.process, "start", lambda *args: {"pid": 12})
    if mode == "exit":
        def exited(paths):
            raise CliError("not_running", "Exited.", ExitCode.NOT_RUNNING)
        monkeypatch.setattr(cli_main.process, "status", exited)
    else:
        monkeypatch.setattr(cli_main.process, "status", lambda paths: {"pid": 12})
    monkeypatch.setattr(cli_main, "probe", lambda *args, **kwargs: {"reachable": False})
    if mode == "timeout":
        clock = iter([0, 9, 10, 10])
        monkeypatch.setattr(cli_main.time, "monotonic", lambda: next(clock, 10))
        monkeypatch.setattr(cli_main.time, "sleep", lambda seconds: None)
    if mode == "probe_error":
        def probe_error(*args, **kwargs):
            raise OSError("health probe failed")
        monkeypatch.setattr(cli_main, "probe", probe_error)
    assert main(["--home", str(tmp_path), "--json", "restart-if-running"]) == 1
    payload = json.loads(capsys.readouterr().out)
    assert payload["error"]["code"] == ("start_failed" if mode == "exit" else "start_timeout" if mode == "timeout" else "operation_failed")


def test_update_restart_rejects_changed_pid_identity_snapshot(tmp_path, monkeypatch, capsys) -> None:
    identity = (12, "original")
    monkeypatch.setattr(cli_main.process, "running_for_update", lambda paths: identity)
    monkeypatch.setattr(cli_main, "_catalog_options", lambda paths: ({}, {}, "127.0.0.1", 8000))
    def stop(paths, expected=None):
        assert expected == identity
        raise CliError("ownership_unverified", "Gateway identity changed before stop.", ExitCode.FAILURE)
    monkeypatch.setattr(cli_main.process, "stop_if_owned", stop)
    monkeypatch.setattr(cli_main.process, "start", lambda *args: pytest.fail("gateway started"))
    assert main(["--home", str(tmp_path), "--json", "restart-if-running"]) == 1
    assert json.loads(capsys.readouterr().out)["error"]["code"] == "ownership_unverified"


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
