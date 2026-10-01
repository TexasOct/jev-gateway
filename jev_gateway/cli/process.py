"""Manage only gateway children whose PID and launch token still match."""

from __future__ import annotations

import json
import os
import secrets
import signal
import subprocess
import sys
import time
from collections.abc import Callable
from contextlib import suppress
from typing import Any

import psutil

from jev_gateway.cli.output import CliError, ExitCode
from jev_gateway.cli.paths import RuntimePaths


def _owned(pid: int, token: str, home: str) -> bool:
    if pid <= 0 or not token:
        return False
    try:
        process = psutil.Process(pid)
        if process.status() in {psutil.STATUS_ZOMBIE, psutil.STATUS_DEAD}:
            return False
        arguments = process.cmdline()
    except (psutil.NoSuchProcess, psutil.ZombieProcess, psutil.AccessDenied, OSError):
        return False
    return (
        len(arguments) == 7
        and bool(arguments[0])
        and arguments[1:] == ["-m", "jev_gateway.cli.server", "--home", home, "--token", token]
    )


def _read_pid(paths: RuntimePaths) -> tuple[int, str]:
    try:
        data = json.loads(paths.pid.read_text(encoding="utf-8"))
        pid, token = data["pid"], data["token"]
        if type(pid) is int and isinstance(token, str) and _owned(pid, token, str(paths.home)):
            return pid, token
    except (OSError, ValueError, TypeError, KeyError):
        pass
    raise CliError("not_running", "No gateway process owned by this runtime is running.", ExitCode.NOT_RUNNING)


def running_for_update(paths: RuntimePaths) -> tuple[int, str] | None:
    """Check whether a live PID record belongs to this runtime."""
    try:
        data = json.loads(paths.pid.read_text(encoding="utf-8"))
        pid, token = data["pid"], data["token"]
    except FileNotFoundError:
        return None
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise CliError("ownership_unverified", "Cannot verify the gateway PID record; inspect jev status and the PID file before restarting manually.", ExitCode.FAILURE) from exc
    if type(pid) is not int or pid <= 0 or not isinstance(token, str) or not token:
        raise CliError("ownership_unverified", "Cannot verify the gateway PID record; inspect jev status and the PID file before restarting manually.", ExitCode.FAILURE)
    if _owned(pid, token, str(paths.home)):
        return pid, token
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return None
    except PermissionError:
        pass
    raise CliError("ownership_unverified", "The gateway PID is alive but ownership cannot be verified; inspect jev status and the PID file before restarting manually.", ExitCode.FAILURE)


def stop_if_owned(paths: RuntimePaths, timeout: float = 10, *, expected: tuple[int, str] | None = None) -> dict[str, Any]:
    """Stop the recorded process only while its PID and token still match."""
    if sys.platform == "win32":
        raise CliError("unsupported_platform", "Windows process management is not supported.", ExitCode.USAGE)
    try:
        data = json.loads(paths.pid.read_text(encoding="utf-8"))
        pid, token = data["pid"], data["token"]
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise CliError("ownership_unverified", "Cannot verify the gateway PID record; inspect jev status and the PID file before restarting manually.", ExitCode.FAILURE) from exc
    if type(pid) is not int or not isinstance(token, str) or not token:
        raise CliError("ownership_unverified", "Gateway ownership changed before stop; inspect jev status and the PID file before restarting manually.", ExitCode.FAILURE)
    if expected is not None and (pid, token) != expected:
        raise CliError("ownership_unverified", "Gateway ownership changed before stop; inspect jev status and the PID file before restarting manually.", ExitCode.FAILURE)
    # Check the PID and token again immediately before signaling. This narrows
    # the PID-reuse window and ensures a changed process is never signaled.
    if not _owned(pid, token, str(paths.home)):
        raise CliError("ownership_unverified", "Gateway ownership changed before stop; inspect jev status and the PID file before restarting manually.", ExitCode.FAILURE)
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        raise CliError("ownership_unverified", "Gateway exited before it could be stopped; inspect jev status before restarting manually.", ExitCode.FAILURE) from None
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not _owned(pid, token, str(paths.home)):
            paths.pid.unlink(missing_ok=True)
            return {"status": "stopped", "pid": pid}
        time.sleep(0.1)
    raise CliError("stop_timeout", "Gateway did not stop before the timeout.", ExitCode.FAILURE)


def start(paths: RuntimePaths, host: str, port: int, *, popen: Callable[..., Any] = subprocess.Popen) -> dict[str, Any]:
    if sys.platform == "win32":
        raise CliError("unsupported_platform", "Windows process management is not supported.", ExitCode.USAGE)
    try:
        current = status(paths)
    except CliError as exc:
        if exc.code != "not_running":
            raise
    else:
        raise CliError("already_running", f"Gateway process {current['pid']} is already running.", ExitCode.ALREADY_RUNNING)
    paths.log.parent.mkdir(parents=True, exist_ok=True)
    paths.pid.parent.mkdir(parents=True, exist_ok=True)
    token = secrets.token_hex(16)
    command = [sys.executable, "-m", "jev_gateway.cli.server", "--home", str(paths.home), "--token", token]
    env = os.environ.copy()
    env["JEV_GATEWAY_HOME"] = str(paths.home)
    with paths.log.open("a", encoding="utf-8") as log:
        child = popen(command, env=env, start_new_session=True, stdout=log, stderr=subprocess.STDOUT, close_fds=True)
    temporary = paths.pid.with_suffix(".tmp")
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            os.chmod(temporary, 0o600)
            json.dump({"pid": child.pid, "token": token}, handle)
            handle.write("\n")
        os.replace(temporary, paths.pid)
    except OSError:
        child.terminate()
        temporary.unlink(missing_ok=True)
        raise
    return {"status": "starting", "pid": child.pid, "host": host, "port": port}


def status(paths: RuntimePaths) -> dict[str, Any]:
    pid, _ = _read_pid(paths)
    return {"status": "running", "pid": pid}


def stop(paths: RuntimePaths, timeout: float = 10, force: bool = False) -> dict[str, Any]:
    if sys.platform == "win32":
        raise CliError("unsupported_platform", "Windows process management is not supported.", ExitCode.USAGE)
    pid, token = _read_pid(paths)
    if not _owned(pid, token, str(paths.home)):
        raise CliError("not_running", "Gateway ownership changed before stop.", ExitCode.NOT_RUNNING)
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        raise CliError("not_running", "Gateway is not running.", ExitCode.NOT_RUNNING) from None
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not _owned(pid, token, str(paths.home)):
            paths.pid.unlink(missing_ok=True)
            return {"status": "stopped", "pid": pid}
        time.sleep(0.1)
    if force:
        if _owned(pid, token, str(paths.home)):
            with suppress(ProcessLookupError):
                os.kill(pid, signal.SIGKILL)
        paths.pid.unlink(missing_ok=True)
        return {"status": "killed", "pid": pid}
    raise CliError("stop_timeout", "Gateway did not stop before the timeout.", ExitCode.FAILURE)


def recent_logs(paths: RuntimePaths, lines: int = 50) -> str:
    try:
        return "\n".join(paths.log.read_text(encoding="utf-8").splitlines()[-lines:])
    except FileNotFoundError:
        raise CliError("logs_missing", "Gateway log does not exist.", ExitCode.FAILURE) from None


def follow_logs(paths: RuntimePaths) -> None:
    if not paths.log.exists():
        raise CliError("logs_missing", "Gateway log does not exist.", ExitCode.FAILURE)
    with paths.log.open(encoding="utf-8") as handle:
        handle.seek(0, 2)
        while True:
            line = handle.readline()
            if line:
                sys.stdout.write(line)
                sys.stdout.flush()
            else:
                time.sleep(0.2)
