"""Shared release acceptance checks; reports contain hashes and counts only."""
from __future__ import annotations

from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
from typing import Any
import zipfile


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_directory(path: Path) -> Path:
    path = path.expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.chmod(0o700)
    return path


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    path.chmod(0o600)


def require(condition: bool, name: str) -> None:
    if not condition:
        raise RuntimeError(name)


def public_assets(manifest: Path, version: str) -> tuple[Path, Path, dict[str, Any]]:
    data = json.loads(manifest.read_text())
    require(data.get("success") is True and data.get("version") == version,
            "successful public asset verification for this version is required")
    assets = Path(data["assets_dir"]).resolve(strict=True)
    installer = assets / "install.sh"
    wheel = assets / f"jev_gateway-{version}-py3-none-any.whl"
    for path in (installer, wheel):
        require(digest(path) == data["sha256"][path.name], "verified public asset bytes changed")
    return installer, wheel, data


def clean_environment() -> dict[str, str]:
    env = os.environ.copy()
    for key in list(env):
        if key.startswith(("JEV_", "UV_")) or key in {
            "PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "XDG_STATE_HOME",
        }:
            env.pop(key)
    env.update(NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost")
    return env


def sql_identifier(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def row_digest(row: tuple[Any, ...]) -> str:
    """Keep SQLite value types, NULL, float representation and BLOB bytes distinct."""
    values = []
    for value in row:
        if value is None:
            values.append(["null"])
        elif isinstance(value, bytes):
            values.append(["blob", value.hex()])
        elif isinstance(value, float):
            values.append(["real", value.hex()])
        elif isinstance(value, int):
            values.append(["integer", value])
        elif isinstance(value, str):
            values.append(["text", value])
        else:
            raise TypeError("unsupported SQLite value type")
    return hashlib.sha256(json.dumps(values, ensure_ascii=True, separators=(",", ":")).encode()).hexdigest()


def table_multisets(connection: sqlite3.Connection,
                   original: dict[str, Any] | None = None) -> dict[str, Any]:
    tables = [row[0] for row in connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    if original is not None:
        require(set(original) <= set(tables), "original database table disappeared")
        tables = list(original)
    result = {}
    for table in tables:
        columns = [row[1] for row in connection.execute(f"PRAGMA table_info({sql_identifier(table)})")]
        if original is not None:
            require(set(original[table]["columns"]) <= set(columns), "original database column disappeared")
            columns = original[table]["columns"]
        selected = ",".join(sql_identifier(column) for column in columns)
        rows = Counter(row_digest(tuple(row)) for row in connection.execute(
            f"SELECT {selected} FROM {sql_identifier(table)}"))
        result[table] = {"columns": columns, "rows": dict(rows), "count": sum(rows.values())}
    return result


def snapshot_runtime(home: Path, database: Path, destination: Path) -> dict[str, Any]:
    """Back up configuration bytes and a consistent SQLite view before an upgrade."""
    private_directory(destination)
    known = {"models.json", ".env", ".env.backup", "models.json.bak",
             "routing-overrides.json", "routing-canvas-layout.json", "dashboard-theme.json"}
    # Root-level backups and operator extensions are preserved too. Logs and PID
    # files have lifecycle semantics and are deliberately outside byte comparison.
    known.update(path.name for path in home.iterdir() if path.is_file() or path.is_symlink())
    database_names = {database.name, database.name + "-wal", database.name + "-shm",
                      database.name + "-journal", "jev-records.sqlite3", "jev-records.sqlite3-wal",
                      "jev-records.sqlite3-shm"}
    protected = known - database_names - {".provider-configuration.lock"}
    files = {}
    backups = private_directory(destination / "files")
    for name in sorted(protected):
        path = home / name
        require(not path.is_symlink(), "runtime configuration symlink requires manual preservation review")
        if not path.exists():
            files[name] = None
            continue
        require(path.is_file(), "runtime configuration must be a regular file")
        content = path.read_bytes()
        target = backups / name
        target.write_bytes(content)
        target.chmod(0o600)
        files[name] = {"sha256": hashlib.sha256(content).hexdigest(),
                       "mode": stat.S_IMODE(path.stat().st_mode)}
    require((home / "models.json").is_file() and (home / ".env").is_file(), "existing runtime files required")
    for name in (".env", ".env.backup"):
        if files.get(name) is not None:
            require(files[name]["mode"] == 0o600, "credential file must already have mode 0600")
    require(database.is_file(), "existing records database required for preservation acceptance")
    backup = destination / "records.sqlite3"
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=15) as source:
        with sqlite3.connect(backup) as target:
            source.backup(target)
    backup.chmod(0o600)
    with sqlite3.connect(backup.as_uri() + "?mode=ro", uri=True) as connection:
        require(connection.execute("PRAGMA integrity_check").fetchall() == [("ok",)], "baseline SQLite integrity")
        tables = table_multisets(connection)
    result = {"files": files, "tables": tables, "database": str(database),
              "database_backup_sha256": digest(backup)}
    write_json(destination / "manifest.json", result)
    return result


def verify_runtime(home: Path, baseline: dict[str, Any]) -> dict[str, Any]:
    for name, expected in baseline["files"].items():
        path = home / name
        if expected is None:
            require(not path.exists() and not path.is_symlink(), "absent configuration file was created")
        else:
            require(path.is_file() and not path.is_symlink() and digest(path) == expected["sha256"],
                    "configuration credential overlay or backup bytes changed")
            require(stat.S_IMODE(path.stat().st_mode) == expected["mode"], "protected file mode changed")
    database = Path(baseline["database"])
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=15) as connection:
        connection.execute("BEGIN")
        require(connection.execute("PRAGMA integrity_check").fetchall() == [("ok",)], "final SQLite integrity")
        current = table_multisets(connection, baseline["tables"])
    summary = {}
    for table, before in baseline["tables"].items():
        require(not (Counter(before["rows"]) - Counter(current[table]["rows"])),
                "original database row multiset changed")
        summary[table] = {"original_rows": before["count"], "current_rows": current[table]["count"]}
    return {"protected_files": len(baseline["files"]), "tables": summary, "integrity": "ok"}


def verify_installed_static(wheel: Path, static: Path) -> int:
    return _verify_installed_files(wheel, static, "jev_gateway/static/")


def verify_installed_package(wheel: Path, package: Path) -> int:
    return _verify_installed_files(wheel, package, "jev_gateway/")


def _verify_installed_files(wheel: Path, directory: Path, prefix: str) -> int:
    with zipfile.ZipFile(wheel) as archive:
        expected = {name[len(prefix):]: archive.read(name) for name in archive.namelist()
                    if name.startswith(prefix) and not name.endswith("/")}
    actual = {str(path.relative_to(directory)) for path in directory.rglob("*")
              if path.is_file() and "__pycache__" not in path.relative_to(directory).parts}
    require(bool(expected) and set(expected) == actual, "installed package file set differs from public wheel")
    require(all((directory / name).read_bytes() == value for name, value in expected.items()),
            "installed package bytes differ from public wheel")
    return len(expected)
