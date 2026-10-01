from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("editable", [False, True])
def test_local_installer_uses_managed_python_and_packaged_templates(tmp_path: Path, editable: bool) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    calls = tmp_path / "calls.jsonl"
    uv = bin_dir / "uv"
    uv.write_text(
        f"#!{sys.executable}\n"
        "import json, os, sys\n"
        "with open(os.environ['STUB_CALLS'], 'a') as stream:\n"
        "    stream.write(json.dumps(sys.argv[1:]) + '\\n')\n"
    )
    uv.chmod(0o755)
    home = tmp_path / "runtime"
    env = {
        **os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "JEV_GATEWAY_HOME": str(home), "UV_TOOL_BIN_DIR": str(bin_dir),
        "STUB_CALLS": str(calls),
    }
    command = ["sh", str(ROOT / "scripts/install-local.sh")]
    if editable:
        command.append("--editable")
    result = subprocess.run(command, env=env, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    expected = ["tool", "install", "--force", "--python", "3.12", "--managed-python"]
    if editable:
        expected.append("--editable")
    assert json.loads(calls.read_text()) == [*expected, str(ROOT)]
    templates = ROOT / "jev_gateway/templates"
    assert (home / "models.json").read_bytes() == (templates / "models.example.json").read_bytes()
    assert (home / ".env").read_bytes() == (templates / "env.example").read_bytes()
    assert (bin_dir / "jev-gateway-local").is_file()

    (home / "models.json").write_text("existing catalog\n")
    (home / ".env").write_text("existing credentials\n")
    subprocess.run(command, env=env, check=True, capture_output=True)
    assert (home / "models.json").read_text() == "existing catalog\n"
    assert (home / ".env").read_text() == "existing credentials\n"


def test_container_copies_packaged_templates_to_entrypoint_locations() -> None:
    dockerfile = (ROOT / "Dockerfile").read_text()
    assert "COPY jev_gateway/templates/models.example.json ./models.example.json" in dockerfile
    assert "COPY jev_gateway/templates/env.example ./.env.example" in dockerfile
