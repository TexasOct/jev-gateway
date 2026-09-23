"""Console logging for the gateway and its HTTP server."""

from __future__ import annotations

import json
import logging
import re
import sys
from copy import copy
from pathlib import Path
from typing import Any, Literal

from jev_gateway.records import redact_secret_text

_PACKAGE_ROOT = Path(__file__).resolve().parent.parent

LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
LOG_FORMATS = ("pretty", "json", "compact")
FIELDS = (
    "decision_id", "request_id", "session_id", "strategy", "requested_model",
    "route", "provider", "model", "label", "tier", "mode", "reason",
    "reasoning_effort", "reasoning_effort_source", "switched_from", "capability_gap",
    "ok", "latency_ms", "error_type", "record_kind",
)
LEVEL_COLORS = {
    logging.DEBUG: "\033[2;37m",
    logging.INFO: "\033[32m",
    logging.WARNING: "\033[33m",
    logging.ERROR: "\033[31m",
    logging.CRITICAL: "\033[1;35m",
}
RESET = "\033[0m"
PRETTY_FIELD_GROUPS = (
    ("identifiers", ("decision_id", "request_id", "session_id")),
    ("model", ("requested_model", "route", "provider", "model")),
    (
        "selection",
        (
            "strategy",
            "label",
            "tier",
            "mode",
            "reason",
            "switched_from",
            "capability_gap",
        ),
    ),
    ("reasoning", ("reasoning_effort", "reasoning_effort_source")),
    ("outcome", ("ok", "latency_ms", "error_type")),
    ("record", ("record_kind",)),
)


def display_logger_name(name: str) -> str:
    """Return a concise operator-facing logger name."""
    if name == "uvicorn.error":
        return "uvicorn"
    if name.startswith("jev_gateway."):
        return name.removeprefix("jev_gateway.")
    if name == "LiteLLM":
        return "litellm"
    return name


def safe_traceback(exc_info: tuple[type[BaseException], BaseException, Any]) -> str:
    """Render frame locations without exception wording or source lines."""
    kind = type(exc_info[1]).__name__
    kind = kind if re.fullmatch(r"[A-Za-z0-9_]{1,64}", kind) else "Exception"
    # Walk frames directly: extract_tb() reads source text, which can contain
    # literal credentials and is not needed for a safe location-only trace.
    frames = []
    current = exc_info[2]
    while current is not None:
        frames.append(current)
        current = current.tb_next
    lines = ["Traceback (most recent call last):"]
    for frame in frames:
        try:
            source = str(Path(frame.tb_frame.f_code.co_filename).resolve().relative_to(_PACKAGE_ROOT))
        except ValueError:
            source = "[external]"
        name = frame.tb_frame.f_code.co_name
        function = name if re.fullmatch(r"[A-Za-z0-9_]{1,64}", name) else "[external]"
        lines.append(f'  File "{source}", line {frame.tb_lineno}, in {function}')
    lines.append(f"{kind}: [REDACTED]")
    return redact_secret_text("\n".join(lines))


class GatewayFormatter(logging.Formatter):
    """Render allowlisted routing fields for terminals or structured log sinks."""

    def __init__(
        self,
        fmt: str | None = None,
        datefmt: str | None = None,
        style: Literal["%", "{", "$"] = "%",
        validate: bool = True,
        *,
        use_colors: bool | None = None,
        log_format: Literal["pretty", "json", "compact"] = "pretty",
    ) -> None:
        super().__init__(fmt=fmt, datefmt=datefmt, style=style, validate=validate)
        if log_format not in LOG_FORMATS:
            raise ValueError(f"log format must be one of {', '.join(LOG_FORMATS)}")
        self.use_colors = sys.stderr.isatty() if use_colors is None else use_colors
        self.log_format = log_format

    def format(self, record: logging.LogRecord) -> str:
        if self.log_format == "json":
            return self._format_json(record)

        display_record = copy(record)
        display_record.name = display_logger_name(record.name)
        message = super().format(display_record)
        fields = self._fields(record)
        if self.log_format == "pretty":
            formatted = self._format_pretty(message, fields)
        else:
            formatted = self._format_compact(message, fields)
        return self._colorize_level(formatted, record)

    def formatException(self, ei: tuple[type[BaseException] | None, BaseException | None, Any]) -> str:
        """Keep traceback locations without rendering untrusted exception text.

        Standard traceback formatting includes exception messages, chained causes,
        and source lines, any of which can contain credentials or prompt content.
        Frame locations and a bounded type are enough for operator diagnosis.
        """
        if ei[0] is None or ei[1] is None:
            return "Traceback unavailable: [REDACTED]"
        return safe_traceback((ei[0], ei[1], ei[2]))

    def _fields(self, record: logging.LogRecord) -> dict[str, Any]:
        return {
            name: getattr(record, name)
            for name in FIELDS
            if getattr(record, name, None) is not None
        }

    def _format_compact(self, message: str, fields: dict[str, Any]) -> str:
        rendered = [f"{name}={self._display_value(value)}" for name, value in fields.items()]
        return f"{message} {' '.join(rendered)}" if rendered else message

    def _format_pretty(self, message: str, fields: dict[str, Any]) -> str:
        if not fields:
            return message
        remaining = dict(fields)
        lines = [message]
        for group, names in PRETTY_FIELD_GROUPS:
            group_fields = [
                (name, remaining.pop(name)) for name in names if name in remaining
            ]
            if not group_fields:
                continue
            lines.append(f"  {group}:")
            lines.extend(
                f"    {name}: {self._display_value(value)}"
                for name, value in group_fields
            )
        if remaining:
            lines.append("  details:")
            lines.extend(
                f"    {name}: {self._display_value(value)}"
                for name, value in remaining.items()
            )
        return "\n".join(lines)

    def _format_json(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": f"{self.formatTime(record, self.datefmt)}.{record.msecs:03.0f}",
            "level": record.levelname,
            "logger": display_logger_name(record.name),
            "event": record.getMessage(),
        }
        payload.update(
            {
                name: self._json_value(value)
                for name, value in self._fields(record).items()
            }
        )
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str, separators=(",", ":"))

    @staticmethod
    def _display_value(value: Any) -> str:
        return str(value).replace("\r", "\\r").replace("\n", "\\n")[:160]

    @classmethod
    def _json_value(cls, value: Any) -> str | int | float | bool:
        if isinstance(value, (str, int, float, bool)):
            return value[:160] if isinstance(value, str) else value
        return cls._display_value(value)

    def _colorize_level(self, formatted: str, record: logging.LogRecord) -> str:
        color = LEVEL_COLORS.get(record.levelno)
        if not color or not self.use_colors:
            return formatted
        # Color only the severity token. Keeping the timestamp, logger name,
        # message and padding untouched makes dense output easier to scan.
        return formatted.replace(
            record.levelname,
            f"{color}{record.levelname}{RESET}",
            1,
        )


def uvicorn_log_config(
    level: str = "INFO",
    log_format: Literal["pretty", "json", "compact"] = "pretty",
) -> dict[str, Any]:
    """Give application, Uvicorn and dependency logs one readable format.

    Kept as data so Uvicorn can configure its worker at startup. External
    libraries still emit warnings and errors; routine requests use the gateway's
    decision log instead of one access line per health/model poll.
    """
    if level not in LEVELS:
        raise ValueError(f"logging level must be one of {', '.join(LEVELS)}")
    if log_format not in LOG_FORMATS:
        raise ValueError(f"log format must be one of {', '.join(LOG_FORMATS)}")
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "console": {
                "()": "jev_gateway.logging.GatewayFormatter",
                "format": "%(asctime)s.%(msecs)03d %(levelname)-7s %(name)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
                "use_colors": None,
                "log_format": log_format,
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "console",
                "stream": "ext://sys.stderr",
            }
        },
        "root": {"handlers": ["console"], "level": "WARNING"},
        "loggers": {
            "jev_gateway": {"level": level, "propagate": True},
            "uvicorn": {"level": "INFO", "propagate": True},
            "uvicorn.error": {"level": "INFO", "propagate": True},
            "uvicorn.access": {"level": "INFO", "propagate": True},
            "LiteLLM": {"level": "WARNING", "propagate": True},
        },
    }


def suppress_litellm_debug_prints() -> None:
    """Disable LiteLLM's direct-to-stdout provider hints, not its warnings."""
    import litellm

    litellm.suppress_debug_info = True
