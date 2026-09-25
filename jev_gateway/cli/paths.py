from __future__ import annotations

import json
import os
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from jev_gateway.cli.output import CliError, ExitCode


@dataclass(frozen=True)
class RuntimePaths:
    home: Path
    models: Path
    env: Path
    env_backup: Path
    models_backup: Path
    records: Path
    pid: Path
    log: Path


def state_path() -> Path:
    base = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state")).expanduser()
    return base / "jev-gateway" / "install.json"


def resolve_home(override: str | Path | None = None) -> Path:
    if override:
        return Path(override).expanduser().resolve()
    configured = os.environ.get("JEV_GATEWAY_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    try:
        state = json.loads(state_path().read_text(encoding="utf-8"))
        if isinstance(state, dict):
            runtime = state.get("runtime_dir")
            if isinstance(runtime, str) and runtime:
                return Path(runtime).expanduser().resolve()
    except (OSError, ValueError, TypeError) as exc:
        # An absent or malformed install-state file falls through to the default.
        _ = exc
    return (Path.home() / ".jev-gateway").resolve()


def runtime_paths(home: str | Path | None = None) -> RuntimePaths:
    root = resolve_home(home)
    return RuntimePaths(root, root / "models.json", root / ".env", root / ".env.backup", root / "models.json.bak", root / "jev-records.sqlite3", root / "run/gateway.pid", root / "logs/gateway.log")


def has_terminal() -> bool:
    return sys.stdin.isatty()


def prompt_value(prompt: str, *, json_mode: bool, quiet: bool, reader: Callable[[str], str] | None = None) -> str:
    if json_mode or quiet or not has_terminal():
        raise CliError("prompt_suppressed", f"Interactive input disabled; provide {prompt} through a supported noninteractive source.", ExitCode.USAGE)
    if reader is None:
        import getpass
        reader = getpass.getpass
    value = reader(prompt)
    if not value:
        raise CliError("secret_missing", "No value was entered.", ExitCode.USAGE)
    return value
