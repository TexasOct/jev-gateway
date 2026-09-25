from __future__ import annotations

import hashlib
import importlib
import importlib.util
import re
import subprocess
import zipfile
from pathlib import Path

import pytest


@pytest.fixture
def release_validator():
    path = Path(__file__).resolve().parents[1] / "scripts/validate-release.py"
    spec = importlib.util.spec_from_file_location("validate_release", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _project_version() -> str:
    tomllib = importlib.import_module("tomllib")
    return tomllib.loads(Path("pyproject.toml").read_text())["project"]["version"]


def test_release_validator_checks_tag_before_build(release_validator) -> None:
    version = _project_version()
    assert release_validator.validate_tag(f"v{version}") == version
    for tag in (f"v{version}-extra", "v999.999.999"):
        with pytest.raises(ValueError, match="must equal"):
            release_validator.validate_tag(tag)


def test_release_validator_checks_every_packaged_file(tmp_path: Path, release_validator) -> None:
    root = Path(__file__).resolve().parents[1]
    built = tmp_path / "dist"
    subprocess.run(["uv", "build", "--out-dir", str(built), "--quiet"], cwd=root, check=True, capture_output=True)
    version = _project_version()
    wheel = built / f"jev_gateway-{version}-py3-none-any.whl"
    validated, prerelease = release_validator.validate(f"v{version}", built)
    assert validated == wheel
    assert prerelease == bool(re.search(r"(?:a|b|rc)[0-9]+$", version))
    sidecar = built / f"{wheel.name}.sha256"
    assert sidecar.read_text() == f"{hashlib.sha256(wheel.read_bytes()).hexdigest()}  {wheel.name}\n"

    corrupted = tmp_path / "corrupted.whl"
    with zipfile.ZipFile(wheel) as original, zipfile.ZipFile(corrupted, "w") as output:
        for entry in original.infolist():
            contents = original.read(entry.filename)
            if entry.filename == "jev_gateway/cli/health.py":
                contents += b"\n# corrupted\n"
            output.writestr(entry, contents)
    wheel.write_bytes(corrupted.read_bytes())
    with pytest.raises(ValueError, match="wheel file differs from source: jev_gateway/cli/health.py"):
        release_validator.validate(f"v{version}", built)
