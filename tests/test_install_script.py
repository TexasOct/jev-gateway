from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path

import pytest


def test_installer_dry_run_describes_release_install_without_network(tmp_path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    uv = bin_dir / "uv"
    uv.write_text("#!/bin/sh\necho uv-called\n")
    uv.chmod(0o755)
    root = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    result = subprocess.run(["sh", str(root / "scripts/install.sh"), "--dry-run", "--no-init", "--home", str(tmp_path / "runtime")], env=env, capture_output=True, text=True, check=True)
    assert "Release selector: latest stable" in result.stdout
    assert "does not query GitHub or verify the checksum" in result.stdout
    assert "tool install --force <verified release wheel>" in result.stdout
    assert "uv-called" not in result.stdout


def _run_release(tmp_path: Path, *, version: str = "0.1.0", missing: str = "", bad_hash: bool = False, status: int = 0, metadata: dict | None = None, args: list[str] | None = None, checksum: str | None = None, include_uv: bool = True) -> tuple[subprocess.CompletedProcess[str], Path]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    calls = tmp_path / "calls"
    wheel_name = f"jev_gateway-{version}-py3-none-any.whl"
    base = f"https://github.com/TexasOct/jev-gateway/releases/download/v{version}/"
    assets = [{"name": name, "browser_download_url": base + name} for name in (wheel_name, wheel_name + ".sha256") if name != missing]
    release = metadata if metadata is not None else {"tag_name": "v" + version, "draft": False, "prerelease": "rc" in version, "assets": assets}
    (tmp_path / "release.json").write_text(json.dumps(release))
    (tmp_path / "wheel").write_bytes(b"wheel fixture")
    digest = hashlib.sha256(b"wheel fixture").hexdigest() if not bad_hash else "0" * 64
    (tmp_path / "checksum").write_text(checksum if checksum is not None else f"{digest}  {wheel_name}\n")
    curl = bin_dir / "curl"
    curl.write_text('''#!/bin/sh
prev=
for arg do
  [ "$prev" = -o ] && STUB_OUT=$arg
  prev=$arg
  case "$arg" in https://*) url=$arg ;; esac
done
case "$url" in
  *api.github.com*) [ "$STUB_STATUS" = 0 ] || exit "$STUB_STATUS"; cp "$STUB_DIR/release.json" "$STUB_OUT" ;;
  *sha256) cp "$STUB_DIR/checksum" "$STUB_OUT" ;;
  *.whl) cp "$STUB_DIR/wheel" "$STUB_OUT" ;;
  *) exit 1 ;;
esac
''')
    curl.chmod(0o755)
    if include_uv:
        uv = bin_dir / "uv"
        uv.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$STUB_CALLS"\n')
        uv.chmod(0o755)
    jev = bin_dir / "jev"
    jev.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$STUB_CALLS"\n')
    jev.chmod(0o755)
    env = {**os.environ, "PATH": f"{bin_dir}:{'/usr/bin:/bin' if not include_uv else os.environ.get('PATH', '')}", "STUB_DIR": str(tmp_path), "STUB_CALLS": str(calls), "STUB_STATUS": str(status), "UV_TOOL_BIN_DIR": str(bin_dir), "TMPDIR": str(tmp_path)}
    command = ["sh", str(Path(__file__).resolve().parents[1] / "scripts/install.sh"), "--yes", "--home", str(tmp_path / "runtime")]
    if version != "0.1.0":
        command.extend(["--version", version])
    command.extend(args or [])
    return subprocess.run(command, env=env, capture_output=True, text=True, check=False), calls


def test_release_wheel_is_verified_before_install_and_provenance_recorded(tmp_path) -> None:
    result, calls = _run_release(tmp_path)
    assert result.returncode == 0, result.stderr
    lines = calls.read_text().splitlines()
    assert lines[0].startswith("tool install --force ")
    assert "jev_gateway-0.1.0-py3-none-any.whl" in lines[0]
    assert "--version 0.1.0 --source https://github.com/TexasOct/jev-gateway/releases/download/v0.1.0/jev_gateway-0.1.0-py3-none-any.whl" in lines[1]


def test_explicit_prerelease_is_accepted(tmp_path) -> None:
    result, calls = _run_release(tmp_path, version="0.2.0rc1")
    assert result.returncode == 0, result.stderr
    assert "--version 0.2.0rc1" in calls.read_text()


@pytest.mark.parametrize("case", ["missing_wheel", "missing_checksum", "bad_hash", "missing_release", "malformed_metadata"])
def test_bad_release_does_not_install(tmp_path, case) -> None:
    options = {
        "missing_wheel": {"missing": "jev_gateway-0.1.0-py3-none-any.whl"},
        "missing_checksum": {"missing": "jev_gateway-0.1.0-py3-none-any.whl.sha256"},
        "bad_hash": {"bad_hash": True},
        "missing_release": {"status": 22},
        "malformed_metadata": {"metadata": {"tag_name": "bad"}},
    }
    result, calls = _run_release(tmp_path, **options[case])
    assert result.returncode != 0
    assert not calls.exists()
    assert "release" in result.stderr.lower() or "sha256" in result.stderr.lower()


@pytest.mark.parametrize("checksum", ["", "0" * 64 + " *jev_gateway-0.1.0-py3-none-any.whl\n", "0" * 64 + "  other.whl\n", "G" * 64 + "  jev_gateway-0.1.0-py3-none-any.whl\n"])
def test_malformed_checksum_does_not_install(tmp_path, checksum: str) -> None:
    result, calls = _run_release(tmp_path, checksum=checksum)
    assert result.returncode != 0
    assert not calls.exists()


def test_latest_api_does_not_accept_prerelease_or_tag_mismatch(tmp_path) -> None:
    version = "0.1.0"
    name = f"jev_gateway-{version}-py3-none-any.whl"
    base = f"https://github.com/TexasOct/jev-gateway/releases/download/v{version}/"
    metadata = {"tag_name": "v" + version, "draft": False, "prerelease": True, "assets": [{"name": n, "browser_download_url": base + n} for n in (name, name + ".sha256")]}
    result, calls = _run_release(tmp_path, metadata=metadata)
    assert result.returncode != 0
    assert not calls.exists()


def test_mismatched_release_asset_url_does_not_install(tmp_path) -> None:
    version = "0.1.0"
    name = f"jev_gateway-{version}-py3-none-any.whl"
    base = f"https://github.com/TexasOct/jev-gateway/releases/download/v{version}/"
    metadata = {"tag_name": "v" + version, "draft": False, "prerelease": False, "assets": [{"name": name, "browser_download_url": "https://example.invalid/other.whl"}, {"name": name + ".sha256", "browser_download_url": base + name + ".sha256"}]}
    result, calls = _run_release(tmp_path, metadata=metadata)
    assert result.returncode != 0
    assert not calls.exists()


def test_explicit_git_ref_is_validated_before_install(tmp_path) -> None:
    script = Path(__file__).resolve().parents[1] / "scripts/install.sh"
    for ref in ("../main", "refs/heads/main", "--help", "main;echo-bad"):
        result = subprocess.run(["sh", str(script), "--ref", ref, "--dry-run"], capture_output=True, text=True)
        assert result.returncode == 2
        assert "invalid Git ref" in result.stderr


def test_no_uv_dry_run_does_not_bootstrap_uv(tmp_path) -> None:
    result, calls = _run_release(tmp_path, args=["--dry-run", "--no-uv"], include_uv=False)
    assert result.returncode == 2
    assert not calls.exists()


def test_no_uv_does_not_bootstrap_before_release_lookup(tmp_path) -> None:
    result, calls = _run_release(tmp_path, args=["--no-uv"], include_uv=False, status=22)
    assert result.returncode != 0
    assert "release lookup failed" in result.stderr
    assert not (tmp_path / "runtime").exists()
    assert not calls.exists()


def test_dry_run_version_and_ref_are_exclusive(tmp_path) -> None:
    script = Path(__file__).resolve().parents[1] / "scripts/install.sh"
    result = subprocess.run(["sh", str(script), "--dry-run", "--version", "v0.2.0rc1", "--ref", "main"], capture_output=True, text=True)
    assert result.returncode == 2
    assert "cannot be combined" in result.stderr
