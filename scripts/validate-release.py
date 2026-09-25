#!/usr/bin/env python3
"""Validate tagged source and distributable before publishing a GitHub Release."""
from __future__ import annotations

import argparse
import configparser
import hashlib
import importlib
import re
import sys
import zipfile
from pathlib import Path


def validate_tag(tag: str) -> str:
    tomllib = importlib.import_module("tomllib")
    project = tomllib.loads(Path("pyproject.toml").read_text())["project"]
    version = project["version"]
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:(?:a|b|rc)[0-9]+)?", version) or tag != f"v{version}":
        raise ValueError(f"tag {tag} must equal v<pyproject.toml version> ({version})")
    return version


def validate(tag: str, wheel_dir: Path) -> tuple[Path, bool]:
    version = validate_tag(tag)
    wheel = wheel_dir / f"jev_gateway-{version}-py3-none-any.whl"
    if sorted(wheel_dir.glob("*.whl")) != [wheel]:
        raise ValueError(f"expected exactly one wheel: {wheel.name}")
    with zipfile.ZipFile(wheel) as archive:
        names = set(archive.namelist())
        metadata = archive.read(f"jev_gateway-{version}.dist-info/METADATA").decode()
        entries = configparser.ConfigParser()
        entries.read_string(archive.read(f"jev_gateway-{version}.dist-info/entry_points.txt").decode())
        if "Name: jev-gateway\n" not in metadata or f"Version: {version}\n" not in metadata:
            raise ValueError("wheel metadata name/version mismatch")
        if "License-Expression: AGPL-3.0-or-later\n" not in metadata:
            raise ValueError("wheel license metadata missing")
        expected = {"jev": "jev_gateway.cli.main:main", "jev-gateway": "jev_gateway.gateway:run_gateway"}
        if dict(entries["console_scripts"]) != expected:
            raise ValueError("wheel entry points mismatch")
        package = Path("jev_gateway")
        expected_files = {
            str(path) for path in package.rglob("*.py") if path.is_file()
        } | {
            str(path) for directory in ("static", "templates")
            for path in (package / directory).rglob("*") if path.is_file()
        }
        assets = {name for name in expected_files if name.startswith("jev_gateway/static/assets/")}
        if not assets or not any(name.endswith(".js") for name in assets) or not any(name.endswith(".css") for name in assets):
            raise ValueError("source dashboard assets missing")
        for file in ("jev_gateway/templates/models.example.json", "jev_gateway/templates/env.example", "jev_gateway/static/index.html", "jev_gateway/cli/main.py"):
            if file not in expected_files or not Path(file).read_bytes():
                raise ValueError(f"source package file missing or empty: {file}")
        packaged_files = {name for name in names if name.startswith("jev_gateway/") and not name.endswith("/")}
        if packaged_files != expected_files:
            raise ValueError(f"wheel package contents differ: missing={sorted(expected_files - packaged_files)}, extra={sorted(packaged_files - expected_files)}")
        for file in expected_files:
            if archive.read(file) != Path(file).read_bytes():
                raise ValueError(f"wheel file differs from source: {file}")
        license_file = f"jev_gateway-{version}.dist-info/licenses/LICENSE"
        if license_file not in names or archive.read(license_file) != Path("LICENSE").read_bytes():
            raise ValueError("wheel LICENSE differs from source")
        if 'package_version("jev-gateway")' not in archive.read("jev_gateway/cli/main.py").decode():
            raise ValueError("CLI version must read installed distribution metadata")
    digest = hashlib.sha256(wheel.read_bytes()).hexdigest()
    (wheel_dir / f"{wheel.name}.sha256").write_text(f"{digest}  {wheel.name}\n")
    return wheel, bool(re.search(r"(?:a|b|rc)[0-9]+$", version))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("tag")
    parser.add_argument("wheel_dir", type=Path, nargs="?")
    args = parser.parse_args()
    try:
        if args.wheel_dir is None:
            validate_tag(args.tag)
            print(f"Validated release tag {args.tag}")
            return 0
        wheel, prerelease = validate(args.tag, args.wheel_dir)
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as exc:
        parser.exit(1, f"release validation failed: {exc}\n")
    print(f"Validated {wheel}; prerelease={str(prerelease).lower()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
