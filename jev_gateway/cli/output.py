from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from enum import IntEnum
from typing import Any, TextIO


class ExitCode(IntEnum):
    OK = 0
    FAILURE = 1
    USAGE = 2
    INVALID_CONFIG = 3
    NOT_RUNNING = 4
    ALREADY_RUNNING = 5
    NOT_INSTALLED = 6


@dataclass
class CliError(Exception):
    code: str
    message: str
    exit_code: int = ExitCode.FAILURE
    details: dict[str, Any] | None = None


def emit(command: str, data: Any = None, error: CliError | None = None, *, json_mode: bool = False, quiet: bool = False, stream: TextIO | None = None) -> None:
    output = stream or sys.stdout
    if json_mode:
        payload: dict[str, Any] = {"ok": error is None, "command": command}
        if error is not None:
            failure: dict[str, Any] = {"code": error.code, "message": error.message}
            if error.details:
                failure["details"] = error.details
            payload["error"] = failure
        else:
            payload["data"] = data
        output.write(json.dumps(payload, ensure_ascii=False) + "\n")
    elif not quiet:
        if error is not None:
            print(f"{error.code}: {error.message}", file=sys.stderr)
        elif data is not None:
            print(data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, indent=2), file=output)
