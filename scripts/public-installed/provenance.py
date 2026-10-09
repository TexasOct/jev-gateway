"""Attest the interpreter and every product byte against the public wheel."""
from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import importlib.metadata
import io
import importlib.util
import json
import os
from pathlib import Path
import sys
import zipfile


def bounded(path: Path, prefix: Path) -> Path:
    resolved = path.resolve(strict=True)
    assert resolved.is_relative_to(prefix.resolve(strict=True)), (path, resolved, prefix)
    return resolved


def wheel_records(names: list[str], records: list[list[str]], record_name: str) -> None:
    assert len(names) == len(set(names)) == 100
    assert len(records) == 100 and all(len(row) == 3 for row in records)
    assert len({row[0] for row in records}) == 100
    assert {row[0] for row in records} == set(names)
    assert sum(bool(row[1]) for row in records) == 99
    assert [row for row in records if not row[1]] == [[record_name, "", ""]]


def installed_files(location: Path, prefix: Path, records: list[list[str]],
                    names: list[str], record_name: str, entrypoints: set[str]) -> list[dict]:
    assert all(len(row) == 3 for row in records)
    assert len({row[0] for row in records}) == len(records), "duplicate installed RECORD path"
    assert set(names).issubset({row[0] for row in records})
    metadata = record_name.rsplit("/", 1)[0]
    receipts = []
    resolved_paths = set()
    for name, declared_hash, declared_size in records:
        path = bounded(location / name, prefix)
        assert path not in resolved_paths, ("aliased installed RECORD path", name)
        resolved_paths.add(path)
        assert path.is_file(), name
        data = path.read_bytes()
        if name in names:
            category = "wheel-origin"
        elif name in {metadata + "/" + item for item in ("INSTALLER", "REQUESTED", "direct_url.json")}:
            category = "installer-metadata"
        elif path in {prefix.resolve() / "bin" / item for item in entrypoints}:
            category = "installer-entrypoint"
        elif path.suffix == ".pyc" and "__pycache__" in path.parts:
            source = Path(importlib.util.source_from_cache(str(path)))
            assert source.is_file() and str(source.relative_to(location.resolve())) in names, name
            category = "generated-bytecode"
        else:
            raise AssertionError(("unclassified installed addition", name))
        if declared_hash:
            algorithm, expected = declared_hash.split("=", 1)
            actual = base64.urlsafe_b64encode(hashlib.new(algorithm, data).digest()).rstrip(b"=").decode()
            assert actual == expected and declared_size == str(len(data)), name
        else:
            assert name == record_name or category == "generated-bytecode", name
            assert declared_size == "" or declared_size == str(len(data)), name
        receipts.append({"path": name, "resolved_path": str(path), "category": category,
                         "record_hash": declared_hash, "record_size": declared_size,
                         "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)})
    # uv may create bytecode without adding it to RECORD. Retain and bound it too.
    for directory in (location / "jev_gateway", location / metadata):
        for candidate in directory.rglob("*"):
            path = bounded(candidate, prefix)
            if not candidate.is_file():
                continue
            if path in resolved_paths:
                assert str(candidate.relative_to(location)) in {row[0] for row in records}, ("unrecorded alias", candidate)
                continue
            assert path.suffix == ".pyc" and "__pycache__" in path.parts, ("unrecorded installed file", path)
            source = Path(importlib.util.source_from_cache(str(path)))
            assert source.is_file() and str(source.relative_to(location.resolve())) in names, path
            data = path.read_bytes()
            receipts.append({"path": str(candidate.relative_to(location)), "resolved_path": str(path),
                             "category": "generated-bytecode", "record_hash": None, "record_size": None,
                             "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)})
    assert {prefix.resolve() / "bin" / name for name in entrypoints}.issubset(resolved_paths), "unrecorded entrypoint"
    return receipts


def dependency_receipts(distributions, prefix: Path) -> list[dict]:
    dependencies = []
    for item in distributions:
        dependency_location = bounded(Path(item.locate_file("")), prefix)
        for file in item.files or []:
            bounded(Path(item.locate_file(file)), prefix)
        origin = json.loads(item.read_text("direct_url.json") or "null")
        assert not isinstance(origin, dict) or not origin.get("dir_info", {}).get("editable"), origin
        dependencies.append({"name": item.metadata["Name"], "version": item.version,
            "location": str(dependency_location), "direct_url": origin,
            "origin_status": "direct-url-present" if origin is not None else "absent-direct-url-origin"})
    return sorted(dependencies, key=lambda item: item["name"])


def attest(wheel: Path, prefix: Path, forbidden: list[Path]) -> dict:
    import jev_gateway

    prefix = prefix.absolute()
    assert Path(sys.prefix).absolute() == prefix, (sys.prefix, prefix)
    assert sys.version_info[:2] == (3, 12), sys.version
    distribution = importlib.metadata.distribution("jev-gateway")
    assert distribution.version == "0.1.3"
    root = Path(jev_gateway.__file__).absolute().parent
    location = Path(distribution.locate_file("")).absolute()
    assert root.is_relative_to(prefix) and location.is_relative_to(prefix)
    assert root.resolve().is_relative_to(prefix.resolve()) and location.resolve().is_relative_to(prefix.resolve())
    assert root == location / "jev_gateway"
    for path in sys.path:
        resolved = Path(path or os.getcwd()).resolve()
        assert not any(resolved.is_relative_to(item.resolve()) for item in forbidden), resolved
    finders = [f"{item.__module__}.{item.__qualname__}" if isinstance(item, type)
               else f"{type(item).__module__}.{type(item).__qualname__}" for item in sys.meta_path]
    assert not any("editable" in name.lower() for name in finders), finders
    assert not any("editable" in name.lower() for name in sys.modules), "editable module loaded"
    assert list(jev_gateway.__path__) == [str(root)]
    pth = {}
    for entry in location.glob("*.pth"):
        content = entry.read_text()
        assert "editable" not in content.lower(), entry
        assert not any(str(item.resolve()) in content for item in forbidden), entry
        pth[entry.name] = hashlib.sha256(entry.read_bytes()).hexdigest()
    direct = json.loads(distribution.read_text("direct_url.json") or "null")
    assert isinstance(direct, dict) and "dir_info" not in direct
    assert direct.get("url", "").startswith("file://"), direct
    with zipfile.ZipFile(wheel) as archive:
        names = sorted(name for name in archive.namelist() if not name.endswith("/"))
        assert len(names) == len(set(names))
        package = [name for name in names if name.startswith("jev_gateway/")]
        static = [name for name in package if name.startswith("jev_gateway/static/")]
        assert (len(package), len(static), len(names)) == (94, 42, 100)
        record_name = "jev_gateway-0.1.3.dist-info/RECORD"
        records = list(csv.reader(io.StringIO(archive.read(record_name).decode())))
        wheel_records(names, records, record_name)
        installed_record = list(csv.reader(io.StringIO(distribution.read_text("RECORD") or "")))
        installed_inventory = installed_files(location, prefix, installed_record, names, record_name,
            {item.name for item in distribution.entry_points if item.group == "console_scripts"})
        installed_map = {row[0]: row[1:] for row in installed_record}
        inventory = {}
        for name in names:
            expected = archive.read(name)
            if name != record_name:
                actual = location / name
                assert actual.is_file() and actual.read_bytes() == expected, name
            inventory[name] = {"sha256": hashlib.sha256(expected).hexdigest(), "size": len(expected)}
        for name, digest, size in records:
            if not digest:
                assert name == record_name and size == ""
                continue
            actual_digest = "sha256=" + base64.urlsafe_b64encode(hashlib.sha256(archive.read(name)).digest()).rstrip(b"=").decode()
            assert digest == actual_digest and size == str(len(archive.read(name))), name
            assert installed_map.get(name) == [digest, size], (name, installed_map.get(name))
        actual_package = sorted("jev_gateway/" + str(item.relative_to(root)) for item in root.rglob("*")
                                if item.is_file() and "__pycache__" not in item.parts and item.suffix != ".pyc")
        assert actual_package == package, set(actual_package) ^ set(package)
    dependencies = dependency_receipts(importlib.metadata.distributions(), prefix)
    return {"sys_prefix": sys.prefix, "sys_executable": sys.executable,
            "distribution_location": str(location), "module_origin": jev_gateway.__file__,
            "sys_path": sys.path, "meta_path": finders, "pth_hashes": pth, "direct_url": direct,
            "wheel_sha256": hashlib.sha256(wheel.read_bytes()).hexdigest(),
            "installed_distributions": dependencies,
            "package_count": len(package), "static_count": len(static), "wheel_record_count": len(records),
            "wheel_member_count": len(names), "wheel_hashed_row_count": sum(bool(row[1]) for row in records),
            "installed_record_count": len(installed_record), "installed_record": installed_record,
            "installed_inventory": installed_inventory,
            "installed_additions": [item for item in installed_inventory if item["category"] != "wheel-origin"],
            "inventory": inventory,
            "generated_bytecode": sorted(str(item.relative_to(root)) for item in root.rglob("*.pyc"))}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wheel", type=Path, required=True)
    parser.add_argument("--prefix", type=Path, required=True)
    parser.add_argument("--forbid", type=Path, action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = attest(args.wheel, args.prefix, args.forbid)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ("sys_prefix", "module_origin", "package_count", "static_count", "wheel_record_count")}))


if __name__ == "__main__":
    main()
