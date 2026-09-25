"""Remove managed installation without touching unrelated launchers or processes."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

from jev_gateway.cli.install_state import clear_state, read_state
from jev_gateway.cli.output import CliError, ExitCode
from jev_gateway.cli.paths import runtime_paths, state_path
from jev_gateway.cli.process import status, stop


def _owned_launchers(bin_dir: Path) -> list[Path]:
    # uv tool launchers are symlinks into the isolated jev-gateway environment.
    return [path for name in ("jev", "jev-gateway") if (path := bin_dir / name).is_symlink() and "jev-gateway" in str(path.resolve())]


def plan_uninstall(*, purge: bool = False, state: dict[str, Any] | None = None, home: Path | None = None) -> dict[str, Any]:
    install = state if state is not None else read_state()
    bin_dir = Path(str(install.get("tool_bin_dir", Path.home() / ".local/bin"))) if install else Path.home() / ".local/bin"
    runtime = home or (Path(str(install["runtime_dir"])) if install and install.get("runtime_dir") else None)
    paths = [str(path) for path in _owned_launchers(bin_dir)]
    if install:
        paths.append(str(state_path()))
    if purge and runtime:
        paths.append(str(runtime))
    return {"install_state_found": install is not None, "paths": paths, "runtime_dir_retained": str(runtime) if runtime and not purge else None, "purge": purge, "tool": "uv tool uninstall jev-gateway" if install else None}


def execute_uninstall(*, purge: bool = False, dry_run: bool = False, yes: bool = False, confirm: bool = False, home: Path | None = None) -> dict[str, Any]:
    state = read_state()
    runtime = home or (Path(str(state["runtime_dir"])) if state and state.get("runtime_dir") else None)
    plan = plan_uninstall(purge=purge, state=state, home=runtime)
    if purge and runtime is None:
        raise CliError("runtime_missing", "Specify --home to purge without install state.", ExitCode.USAGE)
    if dry_run:
        return {**plan, "dry_run": True}
    if purge and runtime:
        resolved = runtime.expanduser().resolve()
        if resolved == Path.home().resolve() or resolved == Path(resolved.anchor) or runtime.is_symlink():
            raise CliError("unsafe_purge_path", "Refusing to purge a home, filesystem root, or symbolic link.", ExitCode.USAGE)
    if purge and not yes:
        if not confirm:
            raise CliError("confirmation_required", "Pass --yes to confirm runtime data deletion.", ExitCode.USAGE)
        answer = input(f"Delete {runtime}? [y/N] ")
        if answer.lower() not in {"y", "yes"}:
            raise CliError("confirmation_declined", "Runtime directory was not deleted.", ExitCode.USAGE)
    if runtime:
        try:
            status(runtime_paths(runtime))
        except CliError as exc:
            if exc.code != "not_running":
                raise
        else:
            stop(runtime_paths(runtime))
    uv = shutil.which("uv") if state else None
    if state and not uv:
        raise CliError("uv_missing", "uv is required to remove the managed tool safely.", ExitCode.FAILURE)
    if state and uv:
        bin_dir = Path(str(state.get("tool_bin_dir", Path.home() / ".local/bin")))
        expected = bin_dir / "jev"
        # A forged or stale state file must not uninstall an unrelated uv tool.
        if not expected.is_symlink() or "jev-gateway" not in str(expected.resolve()):
            raise CliError("install_state_mismatch", "Managed jev launcher does not match install state.", ExitCode.FAILURE)
        result = subprocess.run([uv, "tool", "uninstall", "jev-gateway"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode:
            raise CliError("uninstall_failed", "uv could not remove the managed tool.", ExitCode.FAILURE)
    bin_dir = Path(str(state.get("tool_bin_dir", Path.home() / ".local/bin"))) if state else Path.home() / ".local/bin"
    for path in _owned_launchers(bin_dir):
        path.unlink()
    if state:
        clear_state()
    if purge and runtime and runtime.exists():
        shutil.rmtree(runtime)
    return {**plan, "dry_run": False}
