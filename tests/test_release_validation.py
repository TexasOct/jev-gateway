from __future__ import annotations

import hashlib
import importlib
import importlib.util
import re
import shutil
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


@pytest.fixture(scope="module")
def release_build(tmp_path_factory, dashboard_bundle):
    root = Path(__file__).resolve().parents[1]
    project = tmp_path_factory.mktemp("release-source")
    # Exclude local build/egg-info output; setuptools must discover fresh assets.
    shutil.copytree(root / "jev_gateway", project / "jev_gateway", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    for name in ("pyproject.toml", "README.md", "LICENSE"):
        shutil.copyfile(root / name, project / name)
    (project / "scripts").mkdir()
    shutil.copyfile(root / "scripts/install.sh", project / "scripts/install.sh")
    built = project / "dist"
    subprocess.run(["uv", "build", "--out-dir", str(built), "--quiet"], cwd=project, check=True, capture_output=True)
    return project, built


@pytest.fixture
def release_source(tmp_path: Path, monkeypatch, release_build):
    project, _ = release_build
    shutil.copytree(project, tmp_path, dirs_exist_ok=True)
    monkeypatch.chdir(tmp_path)
    return tmp_path / "dist"


def test_release_validator_checks_every_packaged_file(tmp_path: Path, release_validator, release_source) -> None:
    built = release_source
    version = _project_version()
    wheel = built / f"jev_gateway-{version}-py3-none-any.whl"
    validated, prerelease = release_validator.validate(f"v{version}", built)
    assert validated == wheel
    assert prerelease == bool(re.search(r"(?:a|b|rc)[0-9]+$", version))
    sidecar = built / f"{wheel.name}.sha256"
    assert sidecar.read_text() == f"{hashlib.sha256(wheel.read_bytes()).hexdigest()}  {wheel.name}\n"
    installer = built / "install.sh"
    assert installer.read_text() == Path("scripts/install.sh").read_text().replace("__JEV_RELEASE_TAG__", f"v{version}")
    assert re.findall(r"^RELEASE_TAG=(.*)$", installer.read_text(), re.MULTILINE) == [f"v{version}"]
    assert (built / "install.sh.sha256").read_text() == f"{hashlib.sha256(installer.read_bytes()).hexdigest()}  install.sh\n"
    publishable = {p.name for p in built.iterdir() if p.name != ".gitignore"}
    assert publishable == {wheel.name, f"jev_gateway-{version}.tar.gz", sidecar.name, "install.sh", "install.sh.sha256"}
    subprocess.run(["sh", "-n", str(installer)], check=True)

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


@pytest.mark.parametrize("defect", ["missing", "placeholder", "duplicate", "syntax"])
def test_invalid_installer_template_cannot_produce_publishable_assets(release_validator, release_source, defect: str) -> None:
    template = Path("scripts/install.sh")
    if defect == "missing":
        template.unlink()
    elif defect == "placeholder":
        template.write_text(template.read_text().replace("__JEV_RELEASE_TAG__", "v0.1.0"))
    elif defect == "duplicate":
        template.write_text(template.read_text() + "\nRELEASE_TAG=v9.9.9\n")
    else:
        template.write_text(template.read_text() + "\nif\n")
    with pytest.raises((ValueError, FileNotFoundError)):
        release_validator.validate(f"v{_project_version()}", release_source)
    assert not list(release_source.glob("*.sha256"))
    assert not (release_source / "install.sh").exists()


@pytest.mark.parametrize("defect", ["missing", "empty", "broken_reference"])
def test_missing_or_broken_dashboard_blocks_release(release_validator, release_source, defect: str) -> None:
    static = Path("jev_gateway/static")
    if defect == "missing":
        shutil.rmtree(static)
    elif defect == "empty":
        next((static / "assets").glob("*.js")).write_bytes(b"")
    else:
        (static / "index.html").write_text('<script src="/dashboard/assets/missing.js"></script><link href="/dashboard/assets/missing.css">')
    with pytest.raises(ValueError, match="dashboard"):
        release_validator.validate(f"v{_project_version()}", release_source)
    assert not list(release_source.glob("*.sha256"))


def test_extra_wheel_blocks_release(release_validator, release_source) -> None:
    (release_source / "extra.whl").write_bytes(b"unexpected")
    with pytest.raises(ValueError, match="exactly one wheel"):
        release_validator.validate(f"v{_project_version()}", release_source)


def test_workflow_builds_frontend_before_packaging_and_uploads_exact_assets() -> None:
    root = Path(__file__).resolve().parents[1]
    workflow = (root / ".github/workflows/release.yml").read_text()
    assert workflow.index("scripts/build-frontend.sh\n") < workflow.index("uv build --out-dir dist")
    assert workflow.index('python scripts/validate-release.py "${GITHUB_REF_NAME}" dist') < workflow.index("gh release create")
    assert 'wheel="dist/jev_gateway-${TAG#v}-py3-none-any.whl"' in workflow
    assert workflow.count('dist/install.sh dist/install.sh.sha256') == 2
    assert workflow.count('"$wheel" "$wheel.sha256"') == 2
    assert "dist/*" not in workflow
    assert "--prerelease --latest=false" in workflow
