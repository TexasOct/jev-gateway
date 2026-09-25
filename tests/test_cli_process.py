from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from jev_gateway.cli.output import CliError
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.process import start, status, stop


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
