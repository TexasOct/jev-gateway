from __future__ import annotations

from jev_gateway.cli.paths import resolve_home, runtime_paths


def test_home_precedence(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("JEV_GATEWAY_HOME", str(tmp_path / "env-home"))
    assert resolve_home(tmp_path / "override") == (tmp_path / "override").resolve()
    assert resolve_home() == (tmp_path / "env-home").resolve()


def test_default_home_and_paths(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("JEV_GATEWAY_HOME", raising=False)
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    assert resolve_home() == (tmp_path / ".jev-gateway").resolve()
    paths = runtime_paths(tmp_path / "runtime")
    assert paths.models == tmp_path / "runtime/models.json"
    assert paths.pid == tmp_path / "runtime/run/gateway.pid"
