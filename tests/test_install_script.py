from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
RELEASES = "https://github.com/TexasOct/jev-gateway/releases/download"


def _installer(tag: str) -> str:
    template = (ROOT / "scripts/install.sh").read_text()
    assert template.count("__JEV_RELEASE_TAG__") == 1
    return template.replace("__JEV_RELEASE_TAG__", tag)


def _sidecar(content: bytes, name: str) -> bytes:
    return f"{hashlib.sha256(content).hexdigest()}  {name}\n".encode()


def _wheel(version: str, *, metadata_entries: list[tuple[str, bytes]] | None = None) -> bytes:
    """Build a tiny wheel, allowing malformed metadata with a valid outer digest."""
    dist_info = f"jev_gateway-{version}.dist-info"
    if metadata_entries is None:
        metadata_entries = [(f"{dist_info}/METADATA", (
            f"Metadata-Version: 2.3\nName: jev-gateway\nVersion: {version}\n\n"
        ).encode())]
    entries = [
        ("jev_gateway/__init__.py", b""),
        (f"{dist_info}/WHEEL", b"Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n"),
        *metadata_entries,
    ]
    record = io.StringIO()
    writer = csv.writer(record)
    for name, content in entries:
        digest = base64.urlsafe_b64encode(hashlib.sha256(content).digest()).rstrip(b"=").decode()
        writer.writerow([name, f"sha256={digest}", len(content)])
    writer.writerow([f"{dist_info}/RECORD", "", ""])
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in entries:
            archive.writestr(name, content)
        archive.writestr(f"{dist_info}/RECORD", record.getvalue())
    return buffer.getvalue()


def _run_release(
    tmp_path: Path, *, embedded: str = "v0.1.0", target: str = "v0.1.0",
    args: list[str] | None = None, missing: str = "", bad_hash: str = "",
    checksum: str | None = None, child: str | None = None,
    include_uv: bool = True, consent: bool = True, delegated: str = "",
    wheel_bytes: bytes | None = None,
) -> tuple[subprocess.CompletedProcess[str], list[list[str]]]:
    """Run full release installers with a hermetic PATH and exact asset URLs."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name in ("uname", "grep", "mktemp", "rm", "sh"):
        executable = shutil.which(name)
        assert executable
        (bin_dir / name).symlink_to(executable)
    (bin_dir / "python3").symlink_to(sys.executable)
    events = tmp_path / "events.jsonl"
    log = '''import json, os, sys
from pathlib import Path
with Path(os.environ["STUB_EVENTS"]).open("a") as stream:
    stream.write(json.dumps([Path(sys.argv[0]).name, *sys.argv[1:]]) + "\\n")
'''
    for name in ("jev", "record-child", *( ["uv"] if include_uv else [])):
        executable = bin_dir / name
        executable.write_text(f"#!{sys.executable}\n" + log)
        executable.chmod(0o755)
    wheel = f"jev_gateway-{target[1:]}-py3-none-any.whl"
    if wheel_bytes is None:
        wheel_bytes = _wheel(target[1:])
    child_bytes = (child if child is not None else _installer(target)).replace(
        "set -eu\n", 'set -eu\nrecord-child "$@"\n', 1,
    ).encode()
    assets = {
        wheel: wheel_bytes,
        wheel + ".sha256": _sidecar(wheel_bytes, wheel),
        "install.sh": child_bytes,
        "install.sh.sha256": _sidecar(child_bytes, "install.sh"),
    }
    if bad_hash:
        assets[bad_hash + ".sha256"] = f"{'0' * 64}  {bad_hash}\n".encode()
    if checksum is not None:
        assets[("install.sh" if target != embedded else wheel) + ".sha256"] = checksum.encode()
    urls = {}
    for name, data in assets.items():
        if name != missing:
            path = tmp_path / name
            path.write_bytes(data)
            urls[f"{RELEASES}/{target}/{name}"] = str(path)
    mapping = tmp_path / "assets.json"
    mapping.write_text(json.dumps(urls))
    curl = bin_dir / "curl"
    curl.write_text(f"#!{sys.executable}\n" + log + '''
urls = json.loads(Path(os.environ["STUB_ASSETS"]).read_text())
url = next(arg for arg in sys.argv if arg.startswith("https://"))
if url not in urls:
    sys.exit(22)
destination = Path(sys.argv[sys.argv.index("-o") + 1])
destination.write_bytes(Path(urls[url]).read_bytes())
''')
    curl.chmod(0o755)
    parent = tmp_path / "entry.sh"
    parent.write_text(_installer(embedded))
    env = {
        **os.environ, "PATH": str(bin_dir), "HOME": str(tmp_path / "home"),
        "STUB_EVENTS": str(events), "STUB_ASSETS": str(mapping),
        "UV_TOOL_BIN_DIR": str(bin_dir), "TMPDIR": str(tmp_path),
        "JEV_INSTALL_DELEGATED_TAG": delegated,
    }
    command = [str(bin_dir / "sh"), str(parent), "--home", str(tmp_path / "runtime")]
    if consent:
        command.append("--yes")
    command.extend(args or [])
    result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=15)
    records = [json.loads(line) for line in events.read_text().splitlines()] if events.exists() else []
    assert not list(tmp_path.glob("jev-delegate.*"))
    assert not list(tmp_path.glob("jev-release.*"))
    assert not list(tmp_path.glob("jev-install-uv.*"))
    return result, records


def _downloads(events: list[list[str]]) -> list[str]:
    return [arg for event in events if event[0] == "curl" for arg in event if arg.startswith("https://")]


@pytest.mark.parametrize("args", [[], ["--version", "0.1.0"], ["--version", "v0.1.0"]])
def test_embedded_release_installs_directly_without_api_or_self_delegation(tmp_path: Path, args: list[str]) -> None:
    result, events = _run_release(tmp_path, args=args)
    assert result.returncode == 0, result.stderr
    wheel_url = f"{RELEASES}/v0.1.0/jev_gateway-0.1.0-py3-none-any.whl"
    assert _downloads(events) == [wheel_url, wheel_url + ".sha256"]
    assert [event[0] for event in events] == ["curl", "curl", "uv", "jev"]
    assert events[2][1:4] == ["tool", "install", "--force"]
    assert events[2][4].endswith("/jev_gateway-0.1.0-py3-none-any.whl")
    assert events[3][1:] == ["--home", str(tmp_path / "runtime"), "install", "init", "--version", "0.1.0", "--source", wheel_url, "--method", "isolated"]


@pytest.mark.parametrize("version", ["0.2.0", "v0.2.0rc1", "0.2.0a1", "0.2.0b2", "0.0.9"])
def test_different_version_delegates_once_and_installs_only_target_wheel(tmp_path: Path, version: str) -> None:
    tag = "v" + version.removeprefix("v")
    result, events = _run_release(tmp_path, target=tag, args=["--version", version, "--no-uv"])
    assert result.returncode == 0, result.stderr
    base = f"{RELEASES}/{tag}"
    wheel_url = f"{base}/jev_gateway-{tag[1:]}-py3-none-any.whl"
    assert _downloads(events) == [f"{base}/install.sh", f"{base}/install.sh.sha256", wheel_url, wheel_url + ".sha256"]
    assert [event[0] for event in events] == ["curl", "curl", "record-child", "curl", "curl", "uv", "jev"]
    assert events[2][1:] == ["--version", tag[1:], "--home", str(tmp_path / "runtime"), "--yes", "--no-uv"]
    assert events[-1][1:] == ["--home", str(tmp_path / "runtime"), "install", "init", "--version", tag[1:], "--source", wheel_url, "--method", "isolated"]


def test_delegation_forwards_no_init_and_home_as_one_argument(tmp_path: Path) -> None:
    home = str(tmp_path / "runtime with spaces;literal")
    result, events = _run_release(tmp_path, target="v0.2.0", args=["--version", "0.2.0", "--home", home, "--no-init"], consent=False)
    assert result.returncode == 0, result.stderr
    child = next(event for event in events if event[0] == "record-child")
    assert child[1:] == ["--version", "0.2.0", "--home", home, "--no-init"]
    assert not any(event[0] == "jev" for event in events)


@pytest.mark.parametrize("asset", ["install.sh", "install.sh.sha256"])
def test_missing_target_installer_assets_never_execute_child(tmp_path: Path, asset: str) -> None:
    result, events = _run_release(tmp_path, target="v0.2.0", args=["--version", "0.2.0"], missing=asset)
    assert result.returncode != 0
    assert all(event[0] == "curl" for event in events)
    assert all(url.startswith(f"{RELEASES}/v0.2.0/") for url in _downloads(events))


@pytest.mark.parametrize("asset", ["jev_gateway-0.1.0-py3-none-any.whl", "jev_gateway-0.1.0-py3-none-any.whl.sha256"])
def test_missing_wheel_assets_never_install_or_fall_back(tmp_path: Path, asset: str) -> None:
    result, events = _run_release(tmp_path, missing=asset, include_uv=False)
    assert result.returncode != 0
    assert all(event[0] == "curl" for event in events)
    assert all(url.startswith(f"{RELEASES}/v0.1.0/") for url in _downloads(events))
    assert not (tmp_path / "runtime").exists()


@pytest.mark.parametrize("delegate", [False, True])
@pytest.mark.parametrize("checksum", ["", "0" * 64 + " *install.sh\n", "0" * 64 + "  other.whl\n", "G" * 64 + "  install.sh\n", "0" * 64 + "  install.sh\nextra\n"])
def test_malformed_checksum_stops_before_execution(tmp_path: Path, delegate: bool, checksum: str) -> None:
    target = "v0.2.0" if delegate else "v0.1.0"
    result, events = _run_release(tmp_path, target=target, args=["--version", target], checksum=checksum)
    assert result.returncode != 0
    assert all(event[0] == "curl" for event in events)


@pytest.mark.parametrize("delegate", [False, True])
def test_checksum_mismatch_stops_before_execution(tmp_path: Path, delegate: bool) -> None:
    target = "v0.2.0" if delegate else "v0.1.0"
    asset = "install.sh" if delegate else "jev_gateway-0.1.0-py3-none-any.whl"
    result, events = _run_release(tmp_path, target=target, args=["--version", target], bad_hash=asset)
    assert result.returncode != 0
    assert "SHA256" in result.stderr
    assert all(event[0] == "curl" for event in events)


@pytest.mark.parametrize("include_uv", [False, True])
@pytest.mark.parametrize("version", ["0.1.0", "0.2.0rc1"])
@pytest.mark.parametrize("field, value", [("Name", "other-project"), ("Version", "9.9.9")])
def test_wheel_metadata_mismatch_stops_before_uv_or_bootstrap(
    tmp_path: Path, include_uv: bool, version: str, field: str, value: str,
) -> None:
    metadata = f"Metadata-Version: 2.3\nName: jev-gateway\nVersion: {version}\n\n"
    expected = "jev-gateway" if field == "Name" else version
    metadata = metadata.replace(f"{field}: {expected}\n", f"{field}: {value}\n")
    wheel = _wheel(version, metadata_entries=[(f"jev_gateway-{version}.dist-info/METADATA", metadata.encode())])
    result, events = _run_release(
        tmp_path, target=f"v{version}", args=["--version", version],
        include_uv=include_uv, wheel_bytes=wheel,
    )
    assert result.returncode != 0
    assert "wheel METADATA name/version mismatch" in result.stderr
    assert not any(event[0] in {"uv", "jev"} for event in events)
    assert all(url.startswith(f"{RELEASES}/v{version}/") for url in _downloads(events))
    assert not (tmp_path / "runtime").exists()


@pytest.mark.parametrize("paths", [
    [],
    ["METADATA"],
    ["jev_gateway-9.9.9.dist-info/METADATA"],
    ["other_project-0.1.0.dist-info/METADATA"],
    ["nested/jev_gateway-0.1.0.dist-info/METADATA"],
    ["jev_gateway-0.1.0.dist-info/METADATA", "other_project-0.1.0.dist-info/METADATA"],
])
def test_wheel_requires_one_expected_metadata_path(tmp_path: Path, paths: list[str]) -> None:
    metadata = b"Metadata-Version: 2.3\nName: jev-gateway\nVersion: 0.1.0\n\n"
    wheel = _wheel("0.1.0", metadata_entries=[(path, metadata) for path in paths])
    result, events = _run_release(tmp_path, wheel_bytes=wheel)
    assert result.returncode != 0
    assert "wheel METADATA path" in result.stderr
    assert [event[0] for event in events] == ["curl", "curl"]


def test_duplicate_wheel_metadata_zip_entry_never_installs(tmp_path: Path) -> None:
    metadata = b"Metadata-Version: 2.3\nName: jev-gateway\nVersion: 0.1.0\n\n"
    entry = ("jev_gateway-0.1.0.dist-info/METADATA", metadata)
    with pytest.warns(UserWarning, match="Duplicate name"):
        wheel = _wheel("0.1.0", metadata_entries=[entry, entry])
    result, events = _run_release(tmp_path, wheel_bytes=wheel)
    assert result.returncode != 0
    assert "wheel METADATA path" in result.stderr
    assert [event[0] for event in events] == ["curl", "curl"]


@pytest.mark.parametrize("metadata", [
    b"",
    b"Name: jev-gateway\nVersion: 0.1.0\n",
    b"Metadata-Version: invalid\nName: jev-gateway\nVersion: 0.1.0\n",
    b"Metadata-Version: 2.3\nMetadata-Version: 2.3\nName: jev-gateway\nVersion: 0.1.0\n",
    b"Metadata-Version: 2.3\nVersion: 0.1.0\n",
    b"Metadata-Version: 2.3\nName: jev-gateway\n",
    b"Metadata-Version: 2.3\nName: jev-gateway\nname: jev-gateway\nVersion: 0.1.0\n",
    b"Metadata-Version: 2.3\nName: jev-gateway\nVersion: 0.1.0\nversion: 0.1.0\n",
    b"Metadata-Version: 2.3\nName: jev-gateway\nVersion: 9.9.9\nVersion: 0.1.0\n",
    b"Metadata-Version: 2.3\nName: jev-gateway\nVersion: 0.1.0\nMalformed header\n",
    b"Metadata-Version: 2.3\n\nName: jev-gateway\nVersion: 0.1.0\n",
    b"Metadata-Version: 2.3\nName: jev-gateway\nVersion: 0.1.0\nSummary: \xff\n",
])
def test_malformed_wheel_metadata_never_installs(tmp_path: Path, metadata: bytes) -> None:
    wheel = _wheel("0.1.0", metadata_entries=[("jev_gateway-0.1.0.dist-info/METADATA", metadata)])
    result, events = _run_release(tmp_path, wheel_bytes=wheel)
    assert result.returncode != 0
    assert "METADATA" in result.stderr
    assert [event[0] for event in events] == ["curl", "curl"]


def test_correctly_checksummed_non_zip_wheel_never_installs(tmp_path: Path) -> None:
    result, events = _run_release(tmp_path, wheel_bytes=b"not a wheel zip")
    assert result.returncode != 0
    assert "invalid wheel archive" in result.stderr
    assert [event[0] for event in events] == ["curl", "curl"]


@pytest.mark.parametrize("identity", ["v0.2.0rc1", "v0.1.0", "v0.2.0\nRELEASE_TAG=v0.1.0", "v0.1.0\n# RELEASE_TAG=v0.2.0"])
def test_child_identity_is_exact_not_a_substring(tmp_path: Path, identity: str) -> None:
    result, events = _run_release(tmp_path, target="v0.2.0", args=["--version", "0.2.0"], child=_installer(identity))
    assert result.returncode != 0
    assert "identity mismatch" in result.stderr
    assert [event[0] for event in events] == ["curl", "curl"]


def test_child_runtime_guard_prevents_another_handoff(tmp_path: Path) -> None:
    child = _installer("v0.2.0").replace(
        "# A delegated installer must match the requested identity and cannot hand off again.",
        'version=0.3.0\n# A delegated installer must match the requested identity and cannot hand off again.',
        1,
    )
    result, events = _run_release(tmp_path, target="v0.2.0", args=["--version", "0.2.0"], child=child)
    assert result.returncode != 0
    assert "delegated installer tag identity mismatch" in result.stderr
    assert [event[0] for event in events] == ["curl", "curl", "record-child"]


@pytest.mark.parametrize("args, delegated", [
    (["--version", "0.2.0"], "v0.2.0"),
    ([], "v0.1.0"),
    (["--version", "0.1.0"], "v0.2.0"),
    (["--ref", "main", "--version", "0.1.0"], "v0.1.0"),
])
def test_delegated_identity_rejects_conflicting_requests_without_network(
    tmp_path: Path, args: list[str], delegated: str,
) -> None:
    result, events = _run_release(tmp_path, args=args, delegated=delegated)
    assert result.returncode != 0
    assert events == []


@pytest.mark.parametrize("args", [[], ["--version", "0.2.0"], ["--ref", "main"]])
def test_dry_run_does_not_download_execute_or_mutate(tmp_path: Path, args: list[str]) -> None:
    result, events = _run_release(tmp_path, args=[*args, "--dry-run", "--no-init"])
    assert result.returncode == 0, result.stderr
    assert events == []
    assert not (tmp_path / "runtime").exists()
    if "--version" in args:
        assert "delegate once" in result.stdout
    elif "--ref" not in args:
        assert "latest stable" in result.stdout
        assert "does not query GitHub or verify the checksum" in result.stdout


def test_no_uv_dry_run_does_not_bootstrap_uv(tmp_path: Path) -> None:
    result, events = _run_release(tmp_path, args=["--dry-run", "--no-uv"], include_uv=False)
    assert result.returncode == 2
    assert events == []


def test_no_uv_is_forwarded_and_never_bootstraps(tmp_path: Path) -> None:
    result, events = _run_release(tmp_path, target="v0.2.0", args=["--version", "0.2.0", "--no-uv"], include_uv=False)
    assert result.returncode == 2
    assert "--no-uv was set" in result.stderr
    assert all("astral.sh" not in url for url in _downloads(events))


def test_uv_bootstrap_requires_consent(tmp_path: Path) -> None:
    result, events = _run_release(tmp_path, include_uv=False, consent=False)
    assert result.returncode == 2
    assert "rerun with --yes" in result.stderr
    assert len(_downloads(events)) == 2


@pytest.mark.parametrize("tag", ["__JEV_RELEASE_TAG__", "v0.1.0\nv0.2.0", "v0.1.0/../../main"])
def test_invalid_embedded_identity_fails_without_network(tmp_path: Path, tag: str) -> None:
    # Quote malformed values so the shell can reach the identity validation.
    result, events = _run_release(tmp_path, embedded="'" + tag + "'")
    assert result.returncode != 0
    assert events == []


@pytest.mark.parametrize("args", [[], ["--version", "0.1.0"], ["--ref", "main"]])
def test_unstamped_template_rejects_release_dry_run_but_allows_git_preview(tmp_path: Path, args: list[str]) -> None:
    result, events = _run_release(
        tmp_path, embedded="__JEV_RELEASE_TAG__", args=[*args, "--dry-run", "--no-init"],
    )
    assert events == []
    assert not (tmp_path / "runtime").exists()
    if "--ref" in args:
        assert result.returncode == 0, result.stderr
        assert "explicit developer install" in result.stdout
    else:
        assert result.returncode != 0
        assert "no valid embedded release identity" in result.stderr


def test_explicit_git_ref_remains_separate(tmp_path: Path) -> None:
    result, events = _run_release(tmp_path, args=["--ref", "main"])
    assert result.returncode == 0, result.stderr
    assert events[0] == ["uv", "tool", "install", "--force", "git+https://github.com/TexasOct/jev-gateway@main"]
    assert events[1][-4:] == ["--ref", "main", "--method", "isolated"]


@pytest.mark.parametrize("args", [
    ["--ref", "../main"], ["--ref", "refs/heads/main"], ["--ref", "--help"],
    ["--ref", "main;echo-bad"], ["--version", "0.1.0\n0.2.0"],
    ["--version", "0.1.0/../../main"], ["--version", "0.1.0", "--ref", "main"],
    ["--version"], ["--home", ""], ["--unknown"],
])
def test_invalid_arguments_fail_before_network(tmp_path: Path, args: list[str]) -> None:
    result, events = _run_release(tmp_path, args=args)
    assert result.returncode == 2
    assert events == []
