from __future__ import annotations

from jev_gateway.cli.install_state import init_runtime, read_state
from jev_gateway.cli.uninstall import plan_uninstall


def test_uninstall_plan_preserves_runtime_without_purge(tmp_path) -> None:
    runtime = tmp_path / "runtime"
    state = {"runtime_dir": str(runtime), "tool_bin_dir": str(tmp_path / "bin")}
    plan = plan_uninstall(state=state)
    assert plan["runtime_dir_retained"] == str(runtime)
    assert str(runtime) not in plan["paths"]
    assert plan_uninstall(purge=True, state=state)["paths"][-1] == str(runtime)


def test_release_state_records_wheel_and_preserves_runtime(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    runtime = tmp_path / "runtime"
    url = "https://github.com/TexasOct/jev-gateway/releases/download/v0.1.0/jev_gateway-0.1.0-py3-none-any.whl"
    init_runtime(runtime, ref="main", method="isolated", version="0.1.0", source=url)
    (runtime / "models.json").write_text("custom")
    (runtime / ".env").write_text("secret")
    (runtime / "jev-records.sqlite3").write_text("records")
    result = init_runtime(runtime, ref="main", method="isolated", version="0.1.0", source=url)
    assert result["files"] == {"models.json": "preserved", ".env": "preserved", "credentials.json": "preserved"}
    assert [(runtime / name).read_text() for name in ("models.json", ".env", "jev-records.sqlite3")] == ["custom", "secret", "records"]
    state = read_state()
    assert state is not None
    assert state["package_version"] == "0.1.0"
    assert state["source_type"] == "release_wheel"
    assert state["source"] == url
    assert state["ref"] == ""
    assert plan_uninstall(state=state)["runtime_dir_retained"] == str(runtime.resolve())


def test_legacy_git_state_is_readable(tmp_path) -> None:
    path = tmp_path / "install.json"
    path.write_text('{"version": 1, "ref": "main", "source": "git+https://github.com/TexasOct/jev-gateway@main"}')
    state = read_state(path)
    assert state is not None
    assert state["ref"] == "main"
    assert "package_version" not in state
