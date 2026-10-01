from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from jev_gateway.cli.install_state import init_runtime, read_state


def test_packaged_models_template_is_valid_and_has_required_sections() -> None:
    root = Path(__file__).resolve().parents[1]
    document = json.loads((root / "jev_gateway/templates/models.example.json").read_text())
    assert {"gateway", "storage", "providers", "models"} <= document.keys()


def test_gateway_import_and_pytest_collection_without_cwd_catalog(tmp_path) -> None:
    root = Path(__file__).resolve().parents[1]
    isolated_cwd = tmp_path / "clean-checkout"
    isolated_cwd.mkdir()
    env = os.environ.copy()
    for name in ("JEV_GATEWAY_HOME", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "DECISION_API_KEY"):
        env.pop(name, None)
    env["PYTHONPATH"] = str(root)
    script = (
        "import pathlib, sys; "
        "root = pathlib.Path(sys.argv[1]); "
        "assert not (pathlib.Path.cwd() / 'models.json').exists(); "
        "import pytest; "
        "raise SystemExit(pytest.main(['--collect-only', '-q', str(root / 'tests/test_gateway.py')]))"
    )
    result = subprocess.run(
        [sys.executable, "-c", script, str(root)],
        cwd=isolated_cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "tests collected" in result.stdout or "test collected" in result.stdout
    assert not (isolated_cwd / "models.json").exists()


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
