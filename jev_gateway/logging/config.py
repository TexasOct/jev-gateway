"""Console logging for the gateway and its HTTP server."""

from __future__ import annotations

import logging
import sys
from copy import copy
from typing import Any, Literal

LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
FIELDS = (
    "decision_id", "request_id", "session_id", "strategy", "requested_model",
    "route", "provider", "model", "label", "tier", "mode", "reason",
    "reasoning_effort", "reasoning_effort_source", "switched_from", "capability_gap",
    "ok", "latency_ms", "error_type",
)
LEVEL_COLORS = {
    logging.DEBUG: "\033[2;37m",
    logging.INFO: "\033[32m",
    logging.WARNING: "\033[33m",
    logging.ERROR: "\033[31m",
    logging.CRITICAL: "\033[1;35m",
}
RESET = "\033[0m"


def display_logger_name(name: str) -> str:
    """Return a concise operator-facing logger name."""
    if name == "uvicorn.error":
        return "uvicorn"
    if name.startswith("jev_gateway."):
        return name.removeprefix("jev_gateway.")
    if name == "LiteLLM":
        return "litellm"
    return name


class GatewayFormatter(logging.Formatter):
    """Render optional routing fields without exposing request bodies or credentials."""

    def __init__(
        self,
        fmt: str | None = None,
        datefmt: str | None = None,
        style: Literal["%", "{", "$"] = "%",
        validate: bool = True,
        *,
        use_colors: bool | None = None,
    ) -> None:
        super().__init__(fmt=fmt, datefmt=datefmt, style=style, validate=validate)
        self.use_colors = sys.stderr.isatty() if use_colors is None else use_colors

    def format(self, record: logging.LogRecord) -> str:
        display_record = copy(record)
        display_record.name = display_logger_name(record.name)
        message = super().format(display_record)
        fields = []
        for name in FIELDS:
            value = getattr(record, name, None)
            if value is not None:
                # One event per line, even when an upstream identifier is malformed.
                safe = str(value).replace("\r", "\\r").replace("\n", "\\n")[:160]
                fields.append(f"{name}={safe}")
        formatted = f"{message} {' '.join(fields)}" if fields else message
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


def uvicorn_log_config(level: str = "INFO") -> dict[str, Any]:
    """Give application, Uvicorn and dependency logs one readable format.

    Kept as data so Uvicorn can configure its worker at startup. External
    libraries still emit warnings and errors; routine requests use the gateway's
    decision log instead of one access line per health/model poll.
    """
    if level not in LEVELS:
        raise ValueError(f"logging level must be one of {', '.join(LEVELS)}")
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "console": {
                "()": "jev_gateway.logging.GatewayFormatter",
                "format": "%(asctime)s.%(msecs)03d %(levelname)-7s %(name)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
                "use_colors": None,
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
