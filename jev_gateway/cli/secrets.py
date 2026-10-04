from __future__ import annotations

import os
import sys
from pathlib import Path

from jev_gateway.cli.output import CliError, ExitCode
from jev_gateway.cli.paths import prompt_value
from jev_gateway.config_transaction import configuration_read_lock, optional_bytes, replace_configuration
from jev_gateway.credentials import credential_path, credential_values, credential_update, env_update, read_credential_bytes


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


def upsert_env(path: Path, name: str, value: str) -> None:
    """Compatibility name for writing the effective protected JSON store."""
    models_file = path.parent / "models.json"
    with configuration_read_lock(models_file):
        original = read_credential_bytes(models_file)
        target = credential_path(models_file)
        replace_configuration(models_file, {
            target: credential_update(original, name, value),
            target.with_name("credentials.json.backup"): original,
        })


def remove_env(path: Path, name: str) -> bool:
    models_file = path.parent / "models.json"
    with configuration_read_lock(models_file):
        original = read_credential_bytes(models_file)
        legacy = optional_bytes(path)
        cleared = env_update(legacy, name, None)
        changes: dict[Path, bytes | None] = {}
        if name in credential_values(original):
            target = credential_path(models_file)
            changes[target] = credential_update(original, name, None)
            changes[target.with_name("credentials.json.backup")] = original
        if cleared != (legacy or b""):
            changes[path] = cleared
            changes[path.with_name(".env.backup")] = legacy
        if changes:
            replace_configuration(models_file, changes)
        return bool(changes)
