"""Manage only gateway children whose PID and launch token still match."""

from __future__ import annotations

import json
import os
import secrets
import signal
import subprocess
import sys
import time
from contextlib import suppress
from collections.abc import Callable
from typing import Any

from jev_gateway.cli.output import CliError, ExitCode
from jev_gateway.cli.paths import RuntimePaths


def _owned(pid: int, token: str, home: str) -> bool:
    if pid <= 0 or not token:
        return False
    try:
        command = subprocess.check_output(
            ["ps", "-ww", "-p", str(pid), "-o", "args="], stderr=subprocess.DEVNULL, text=True
        )
        state = subprocess.check_output(
            ["ps", "-p", str(pid), "-o", "stat="], stderr=subprocess.DEVNULL, text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return False
    # Token is a non-credential nonce, not a secret. Match shell-separated
    # arguments, never a substring of an unrelated process command.
    return state[:1] not in {"Z", "X"} and "-m jev_gateway.cli.server " in command and f"--home {home} --token {token}" in command


def _read_pid(paths: RuntimePaths) -> tuple[int, str]:
    try:
        data = json.loads(paths.pid.read_text(encoding="utf-8"))
        pid, token = data["pid"], data["token"]
        if type(pid) is int and isinstance(token, str) and _owned(pid, token, str(paths.home)):
            return pid, token
    except (OSError, ValueError, TypeError, KeyError):
        pass
    raise CliError("not_running", "No gateway process owned by this runtime is running.", ExitCode.NOT_RUNNING)


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
