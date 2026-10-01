from __future__ import annotations

import json
from types import SimpleNamespace

import psutil
import pytest

from jev_gateway.cli.output import CliError
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.process import (
    _owned,
    running_for_update,
    start,
    status,
    stop,
    stop_if_owned,
)


def test_start_writes_pid_and_status(tmp_path) -> None:
    paths = runtime_paths(tmp_path)
    def fake_popen(command, **kwargs):
        return SimpleNamespace(pid=12345)
    result = start(paths, "127.0.0.1", 8000, popen=fake_popen)
    assert result["pid"] == 12345
    data = json.loads(paths.pid.read_text())
    assert data["pid"] == 12345 and data["token"]
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr("jev_gateway.cli.process._owned", lambda pid, token, home: True)
    try:
        assert status(paths)["pid"] == 12345
    finally:
        monkeypatch.undo()


def test_status_clears_stale_pid(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    paths.pid.parent.mkdir(parents=True)
    paths.pid.write_text("99999")
    with pytest.raises(CliError) as error:
        status(paths)
    assert error.value.code == "not_running"
    # An unverified PID is never signalled, even if it belongs to another process.
    monkeypatch.setattr("jev_gateway.cli.process.os.kill", lambda *args: pytest.fail("foreign PID signalled"))
    with pytest.raises(CliError) as stopped:
        stop(paths)
    assert stopped.value.code == "not_running"
    assert paths.pid.exists()


@pytest.mark.parametrize("record", ["not json", '{"pid": 12, "token": ""}', '{"pid": "12", "token": "x"}'])
def test_update_refuses_unverifiable_pid_record(tmp_path, monkeypatch, record: str) -> None:
    paths = runtime_paths(tmp_path)
    paths.pid.parent.mkdir(parents=True)
    paths.pid.write_text(record)
    monkeypatch.setattr("jev_gateway.cli.process.os.kill", lambda *args: pytest.fail("unverified PID signalled"))
    with pytest.raises(CliError, match="PID record") as error:
        running_for_update(paths)
    assert error.value.code == "ownership_unverified"


def test_owned_parses_home_path_with_spaces(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path / "runtime with spaces")
    launch_marker = "launch-marker"
    command = ["/python path/python3", "-m", "jev_gateway.cli.server", "--home", str(paths.home), "--token", launch_marker]
    monkeypatch.setattr("jev_gateway.cli.process.psutil.Process", lambda pid: SimpleNamespace(status=lambda: psutil.STATUS_RUNNING, cmdline=lambda: command))
    assert _owned(34567, launch_marker, str(paths.home)) is True


def test_owned_rejects_real_python_wrapper_with_module_suffix(tmp_path) -> None:
    import subprocess
    import sys
    import time

    paths = runtime_paths(tmp_path / "runtime with spaces")
    token = "smoke-marker"
    child = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(30)", "-m", "jev_gateway.cli.server", "--home", str(paths.home), "--token", token],
        start_new_session=True,
    )
    try:
        command = ""
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            try:
                command = subprocess.check_output(["ps", "-ww", "-p", str(child.pid), "-o", "args="], text=True)
                if token in command:
                    break
            except subprocess.CalledProcessError:
                pass
            time.sleep(0.01)
        assert token in command
        assert _owned(child.pid, token, str(paths.home)) is False
    finally:
        child.terminate()
        child.wait(timeout=3)


def test_owned_accepts_real_module_child_with_spaces(tmp_path) -> None:
    import subprocess
    import sys

    paths = runtime_paths(tmp_path / "runtime with spaces")
    executable = tmp_path / "python with spaces"
    executable.symlink_to(sys.executable)
    child = subprocess.Popen([str(executable), "-m", "jev_gateway.cli.server", "--home", str(paths.home), "--token", "module-marker"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        assert _owned(child.pid, "module-marker", str(paths.home))
    finally:
        child.terminate()
        child.wait(timeout=3)


@pytest.mark.parametrize("failure", ["home", "token", "wrapper", "zombie", "dead", "denied", "missing", "zombie_exception"])
def test_stop_never_signals_unverified_process(tmp_path, monkeypatch, failure: str) -> None:
    paths = runtime_paths(tmp_path)
    paths.pid.parent.mkdir(parents=True)
    paths.pid.write_text(json.dumps({"pid": 34567, "token": "marker"}))
    command = ["/python path/python3", "-m", "jev_gateway.cli.server", "--home", str(paths.home), "--token", "marker"]
    if failure == "home":
        command[4] += "-other"
    if failure == "token":
        command[6] += "-other"
    if failure == "wrapper":
        command[1:1] = ["-c", "import time; time.sleep(30)"]

    def process(pid):
        if failure == "missing":
            raise psutil.NoSuchProcess(pid)
        def status():
            if failure == "zombie_exception":
                raise psutil.ZombieProcess(pid)
            return {"zombie": psutil.STATUS_ZOMBIE, "dead": psutil.STATUS_DEAD}.get(failure, psutil.STATUS_RUNNING)
        def cmdline():
            if failure == "denied":
                raise psutil.AccessDenied(pid)
            return command
        return SimpleNamespace(status=status, cmdline=cmdline)

    monkeypatch.setattr("jev_gateway.cli.process.psutil.Process", process)
    monkeypatch.setattr("jev_gateway.cli.process.os.kill", lambda *args: pytest.fail("unverified process signalled"))
    assert not _owned(34567, "marker", str(paths.home))
    with pytest.raises(CliError):
        stop(paths, force=True)
    with pytest.raises(CliError):
        stop_if_owned(paths)
    assert paths.pid.exists()


def test_stop_if_owned_does_not_signal_pid_after_identity_changes(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    paths.pid.parent.mkdir(parents=True)
    paths.pid.write_text(json.dumps({"pid": 34567, "token": "recorded"}))
    checks = iter([False])
    monkeypatch.setattr("jev_gateway.cli.process._owned", lambda *args: next(checks))
    signaled = []
    monkeypatch.setattr("jev_gateway.cli.process.os.kill", lambda pid, sig: signaled.append((pid, sig)))
    with pytest.raises(CliError, match="ownership changed") as error:
        stop_if_owned(paths, expected=(34567, "previous"))
    assert error.value.code == "ownership_unverified"
    assert signaled == []


def test_update_distinguishes_dead_pid_from_live_unowned_pid(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    assert running_for_update(paths) is None
    paths.pid.parent.mkdir(parents=True)
    paths.pid.write_text(json.dumps({"pid": 23456, "token": "nonce"}))
    monkeypatch.setattr("jev_gateway.cli.process._owned", lambda *args: False)
    def dead(pid, sig):
        assert sig == 0
        raise ProcessLookupError()
    monkeypatch.setattr("jev_gateway.cli.process.os.kill", dead)
    assert running_for_update(paths) is None
    monkeypatch.setattr("jev_gateway.cli.process.os.kill", lambda pid, sig: None if sig == 0 else pytest.fail("unowned PID signalled"))
    with pytest.raises(CliError, match="ownership cannot be verified"):
        running_for_update(paths)
    monkeypatch.setattr("jev_gateway.cli.process._owned", lambda *args: True)
    assert running_for_update(paths) == (23456, "nonce")
