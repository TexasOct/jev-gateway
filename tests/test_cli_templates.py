from __future__ import annotations

from pathlib import Path

from jev_gateway.cli.install_state import init_runtime, read_state


def test_packaged_templates_match_root() -> None:
    root = Path(__file__).resolve().parents[1]
    package = root / "jev_gateway/templates"
    assert (package / "models.example.json").read_bytes() == (root / "models.example.json").read_bytes()
    assert (package / "env.example").read_bytes() == (root / ".env.example").read_bytes()


def test_init_preserves_runtime_files(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    (runtime / "models.json").write_text("existing")
    result = init_runtime(runtime, ref="main", method="test")
    assert result["files"]["models.json"] == "preserved"
    assert (runtime / "models.json").read_text() == "existing"
    state = read_state()
    assert state is not None
    assert state["runtime_dir"] == str(runtime.resolve())
