from __future__ import annotations

import json
import os
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jev_gateway.cli.paths import state_path
from jev_gateway.initialization import initialize_configuration


def read_state(path: Path | None = None) -> dict[str, Any] | None:
    try:
        value = json.loads((path or state_path()).read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except (OSError, ValueError):
        return None


def write_state(runtime_dir: Path, *, ref: str = "main", method: str = "isolated", source: str = "", version: str | None = None) -> Path:
    path = state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    state = {"version": 1, "installed_at": datetime.now(timezone.utc).isoformat(), "method": method, "ref": ref, "tool": "jev-gateway", "tool_bin_dir": str(Path(os.environ.get("UV_TOOL_BIN_DIR", Path.home() / ".local/bin")).expanduser().resolve()), "runtime_dir": str(runtime_dir.resolve()), "source": source}
    if version is not None:
        state["package_version"] = version
        state["source_type"] = "release_wheel"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    return path


def clear_state(path: Path | None = None) -> bool:
    target = path or state_path()
    if not target.exists():
        return False
    target.unlink()
    with suppress(OSError):
        target.parent.rmdir()
    return True


def init_runtime(runtime: Path, *, ref: str, method: str, version: str | None = None, source: str | None = None) -> dict[str, Any]:
    runtime.mkdir(parents=True, exist_ok=True)
    results = initialize_configuration(runtime / "models.json")
    (runtime / "run").mkdir(exist_ok=True)
    (runtime / "logs").mkdir(exist_ok=True)
    state = write_state(runtime, ref="" if version else ref, method=method, source=source if source is not None else f"git+https://github.com/TexasOct/jev-gateway@{ref}", version=version)
    return {"runtime_dir": str(runtime), "files": results, "state": str(state), "setup_hint": "Run jev setup or open the local dashboard to configure a management key. Providers and models can be added later."}
