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


def uv_cache_metadata(data: bytes, wheel_ctime_ns: int | None) -> dict:
    """uv 0.13.0 local-wheel CacheInfo, bound to the actual input's Unix ctime."""
    def unique(pairs):
        result = {}
        for key, value in pairs:
            assert key not in result, ("duplicate metadata key", key)
            result[key] = value
        return result
    value = json.loads(data, object_pairs_hook=unique)
    assert isinstance(value, dict) and set(value) == {"timestamp", "commit", "tags", "env", "directories"}, "unexpected uv_cache object fields"
    assert value["commit"] is None and value["tags"] is None, "nonlocal uv_cache commit/tags"
    assert value["env"] == {} and value["directories"] == {}, "nonlocal uv_cache environment/directories"
    timestamp = value["timestamp"]
    assert isinstance(timestamp, dict) and set(timestamp) == {"secs_since_epoch", "nanos_since_epoch"}, "unexpected uv_cache timestamp fields"
    assert type(timestamp["secs_since_epoch"]) is int and 0 <= timestamp["secs_since_epoch"] < 2**64, "invalid uv_cache timestamp seconds"
    assert type(timestamp["nanos_since_epoch"]) is int and 0 <= timestamp["nanos_since_epoch"] < 10**9, "invalid uv_cache timestamp nanos"
    assert wheel_ctime_ns is not None, "missing input wheel ctime binding"
    assert timestamp["secs_since_epoch"] * 10**9 + timestamp["nanos_since_epoch"] == wheel_ctime_ns, "uv_cache/input wheel ctime mismatch"
    expected = {"timestamp": {"secs_since_epoch": timestamp["secs_since_epoch"], "nanos_since_epoch": timestamp["nanos_since_epoch"]},
                "commit": None, "tags": None, "env": {}, "directories": {}}
    assert data == json.dumps(expected, separators=(",", ":")).encode(), "unexpected uv serialization"
    return value


def capture_diagnostics(location: Path, prefix: Path, output: Path) -> dict:
    """Retain raw owned metadata before classification, including on failed probes."""
    output.mkdir(parents=True, exist_ok=False)
    inventory = []
    receipt = {"status": "partial-diagnostic-only", "location": str(location), "prefix": str(prefix),
               "inventory": inventory, "complete": False}
    def flush():
        (output / "inventory.json").write_text(json.dumps(receipt, indent=2) + "\n")
    flush()
    traversal = None
    try:
        owned_metadata_path(location, prefix)
        directory = location / "jev_gateway-0.1.3.dist-info"
        owned_metadata_path(directory, prefix)
        assert (directory / "RECORD").is_file(), "missing installed RECORD"
        total = 0
        def candidates():
            yield directory / "RECORD"
            entries = metadata_entries(directory, prefix)
            try:
                for candidate in entries:
                    if candidate != directory / "RECORD":
                        yield candidate
            finally:
                entries.close()
        traversal = candidates()
        for candidate in traversal:
            entry = {"path": str(candidate), "symlink": candidate.is_symlink()}
            inventory.append(entry)
            flush()
            assert len(inventory) <= 512, "metadata capture entry bound"
            path = owned_metadata_path(candidate, prefix)
            stat_mode = candidate.lstat().st_mode
            entry.update(resolved_path=str(path), mode=oct(stat_mode & 0o7777), stat_mode=oct(stat_mode))
            assert not candidate.is_symlink(), ("metadata symlink", candidate)
            if not candidate.is_file():
                entry["kind"] = "directory"
                flush()
                continue
            assert path.stat().st_size <= 10 * 1024 * 1024, "metadata capture bound"
            with path.open("rb") as stream:
                data = stream.read(10 * 1024 * 1024 + 1)
            assert len(data) <= 10 * 1024 * 1024, "metadata capture read bound"
            total += len(data)
            assert total <= 32 * 1024 * 1024, "metadata capture total bound"
            target = output / "raw" / candidate.relative_to(directory)
            if target.suffix.lower() == ".pth":
                target = target.with_name(target.name + ".raw-bytes")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            entry.update(kind="file", size=len(data), sha256=hashlib.sha256(data).hexdigest(), raw=str(target))
            flush()
        assert any(item.get("kind") == "file" and Path(item["path"]).name == "RECORD" for item in inventory)
        receipt["complete"] = True
        flush()
        return receipt
    except Exception as error:
        receipt["capture_error"] = {"type": type(error).__name__, "message": str(error)}
        flush()
        raise
    finally:
        if traversal is not None:
            traversal.close()


def bounded(path: Path, prefix: Path) -> Path:
    resolved = path.resolve(strict=True)
    assert resolved.is_relative_to(prefix.resolve(strict=True)), (path, resolved, prefix)
    return resolved


def owned_metadata_path(path: Path, prefix: Path) -> Path:
    """Trust the prefix's resolved anchor, but reject every alias beneath it."""
    assert ".." not in path.parts, ("metadata parent traversal", path)
    candidate = path.absolute()
    lexical = prefix.absolute()
    resolved = prefix.resolve(strict=True)
    anchor = lexical if candidate.is_relative_to(lexical) else resolved
    assert candidate.is_relative_to(anchor), ("metadata outside owned prefix", path)
    current = anchor
    for component in candidate.relative_to(anchor).parts:
        current = current / component
        assert not current.is_symlink(), ("metadata component symlink", current)
    return bounded(candidate, prefix)


def metadata_entries(directory: Path, prefix: Path):
    """Lazy traversal with at most 512 retained entries and one overflow sentinel."""
    owned_metadata_path(directory, prefix)
    pending = [directory]
    count = 0
    while pending:
        current = pending.pop()
        owned_metadata_path(current, prefix)
        with os.scandir(current) as entries:
            for entry in entries:
                count += 1
                assert count <= 512, "metadata enumeration entry bound"
                candidate = Path(entry.path)
                owned_metadata_path(candidate, prefix)
                yield candidate
                if entry.is_dir(follow_symlinks=False):
                    pending.append(candidate)


def wheel_records(names: list[str], records: list[list[str]], record_name: str) -> None:
    assert len(names) == len(set(names)) == 100
    assert len(records) == 100 and all(len(row) == 3 for row in records)
    assert len({row[0] for row in records}) == 100
    assert {row[0] for row in records} == set(names)
    assert sum(bool(row[1]) for row in records) == 99
    assert [row for row in records if not row[1]] == [[record_name, "", ""]]


def installed_files(location: Path, prefix: Path, records: list[list[str]],
                    names: list[str], record_name: str, entrypoints: set[str], wheel_ctime_ns: int | None = None) -> list[dict]:
    assert all(len(row) == 3 for row in records)
    assert len({row[0] for row in records}) == len(records), "duplicate installed RECORD path"
    assert set(names).issubset({row[0] for row in records})
    metadata = record_name.rsplit("/", 1)[0]
    owned_metadata_path(location, prefix)
    owned_metadata_path(location / metadata, prefix)
    receipts = []
    resolved_paths = set()
    for name, declared_hash, declared_size in records:
        path = (owned_metadata_path(location / name, prefix) if metadata in Path(name).parts
                else bounded(location / name, prefix))
        assert path not in resolved_paths, ("aliased installed RECORD path", name)
        resolved_paths.add(path)
        assert path.is_file(), name
        data = path.read_bytes()
        if name in names:
            category = "wheel-origin"
        elif name == metadata + "/uv_cache.json":
            assert not (location / name).is_symlink(), name
            uv_cache_metadata(data, wheel_ctime_ns)
            assert declared_hash.startswith("sha256=") and declared_size, name
            category = "uv-0.13.0-local-wheel-cache"
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
        candidates = metadata_entries(directory, prefix) if directory == location / metadata else directory.rglob("*")
        for candidate in candidates:
            path = (owned_metadata_path(candidate, prefix) if directory == location / metadata
                    else bounded(candidate, prefix))
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


def attest(wheel: Path, prefix: Path, forbidden: list[Path], wheel_ctime_ns: int | None = None) -> dict:
    prefix = prefix.absolute()
    wheel_ctime_ns = wheel.stat().st_ctime_ns if wheel_ctime_ns is None else wheel_ctime_ns
    assert Path(sys.prefix).absolute() == prefix, (sys.prefix, prefix)
    assert sys.version_info[:2] == (3, 12), sys.version
    distribution = importlib.metadata.distribution("jev-gateway")
    location = Path(distribution.locate_file("")).absolute()
    owned_metadata_path(location, prefix)
    owned_metadata_path(location / "jev_gateway-0.1.3.dist-info", prefix)
    assert distribution.version == "0.1.3"
    import jev_gateway
    root = Path(jev_gateway.__file__).absolute().parent
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
            {item.name for item in distribution.entry_points if item.group == "console_scripts"}, wheel_ctime_ns)
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
            "wheel_ctime_ns": wheel_ctime_ns,
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
    parser.add_argument("--wheel-ctime-ns", type=int)
    args = parser.parse_args()
    assert not args.output.exists(), "fresh origin output required"
    partial = args.output.with_name(args.output.stem + "-partial")
    capture_error = None
    try:
        distribution = importlib.metadata.distribution("jev-gateway")
        capture_diagnostics(Path(distribution.locate_file("")), args.prefix, partial)
    except Exception as error:
        capture_error = {"type": type(error).__name__, "message": str(error)}
    try:
        report = attest(args.wheel, args.prefix, args.forbid, args.wheel_ctime_ns)
        assert capture_error is None, capture_error
    except Exception as error:
        partial.mkdir(parents=True, exist_ok=True)
        (partial / "failure.json").write_text(json.dumps({"status": "failed-attestation",
            "type": type(error).__name__, "message": str(error), "capture_error": capture_error}, indent=2) + "\n")
        raise
    report["partial_diagnostics"] = str(partial)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ("sys_prefix", "module_origin", "package_count", "static_count", "wheel_record_count")}))


if __name__ == "__main__":
    main()
