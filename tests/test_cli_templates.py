from __future__ import annotations

import json
from pathlib import Path

from jev_gateway.cli.install_state import init_runtime, read_state


def test_packaged_models_template_is_valid_and_has_required_sections() -> None:
    root = Path(__file__).resolve().parents[1]
    document = json.loads((root / "jev_gateway/templates/models.example.json").read_text())
    assert {"gateway", "storage", "providers", "models"} <= document.keys()


def test_packaged_env_template_contains_expected_keys() -> None:
    root = Path(__file__).resolve().parents[1]
    env_template = (root / "jev_gateway/templates/env.example").read_text()
    assert "DEEPSEEK_API_KEY=" in env_template
    assert "OPENAI_API_KEY=" in env_template
    assert "JEV_OPENROUTER_API_KEY=" in env_template


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
