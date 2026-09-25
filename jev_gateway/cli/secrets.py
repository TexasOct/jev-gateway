from __future__ import annotations

import os
import shutil
import stat
import sys
import tempfile
from contextlib import suppress
from pathlib import Path

from jev_gateway.cli.output import CliError, ExitCode
from jev_gateway.cli.paths import prompt_value


def obtain_secret(*, env_name: str | None, stdin_secret: bool, json_mode: bool, quiet: bool) -> str:
    if env_name:
        value = os.environ.get(env_name, "")
        if not value:
            raise CliError("secret_missing", f"Environment variable {env_name!r} is empty or unset.", ExitCode.USAGE)
        return value
    if stdin_secret:
        value = sys.stdin.readline(8193).rstrip("\r\n")
        if len(value.encode("utf-8")) > 8192:
            raise CliError("secret_too_large", "Secret input exceeds 8 KiB.", ExitCode.USAGE)
        if not value:
            raise CliError("secret_missing", "No secret was provided on stdin.", ExitCode.USAGE)
        return value
    return prompt_value("API key: ", json_mode=json_mode, quiet=quiet)


def _read_lines(path: Path) -> list[str]:
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return []


def upsert_env(path: Path, name: str, value: str) -> None:
    if not name.isidentifier():
        raise CliError("invalid_env_name", "Credential variable name must be an identifier.", ExitCode.USAGE)
    lines = _read_lines(path)
    if not value or any(character in value for character in "\r\n\x00"):
        raise CliError("invalid_secret", "Credential must be nonempty and fit on one line.", ExitCode.USAGE)
    replacement = f"{name}={value}"
    found = False
    output: list[str] = []
    for line in lines:
        if line.startswith(f"{name}="):
            if not found:
                output.append(replacement)
                found = True
        else:
            output.append(line)
    if not found:
        output.append(replacement)
    _write_env(path, output)


def remove_env(path: Path, name: str) -> bool:
    lines = _read_lines(path)
    output = [line for line in lines if not line.startswith(f"{name}=")]
    if len(output) == len(lines):
        return False
    _write_env(path, output)
    return True


def _write_env(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        backup = path.with_name(".env.backup")
        shutil.copy2(path, backup)
        os.chmod(backup, stat.S_IRUSR | stat.S_IWUSR)
    fd, temporary = tempfile.mkstemp(prefix=".env.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + ("\n" if lines else ""))
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, stat.S_IRUSR | stat.S_IWUSR)
        os.replace(temporary, path)
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        with suppress(OSError):
            os.unlink(temporary)
        raise
