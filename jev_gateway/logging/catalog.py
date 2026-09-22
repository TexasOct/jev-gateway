"""Parse gateway logging settings declared in the model catalog."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .config import LEVELS, LOG_FORMATS


@dataclass(frozen=True)
class LoggingSettings:
    """Console verbosity and HTTP access-log options set at process startup."""

    level: str = "INFO"
    access_log: bool = False
    output_format: str = "pretty"

    def as_dict(self) -> dict[str, Any]:
        return {
            "logging_level": self.level,
            "access_log": self.access_log,
            "log_format": self.output_format,
        }


def logging_from_gateway(value: dict[str, Any], source: str) -> LoggingSettings:
    """Validate logging options from the catalog's gateway object."""
    raw_level = value.get("logging_level", "INFO")
    text = str(raw_level).strip() if raw_level is not None else ""
    if not text:
        raise ValueError(f"{source} gateway logging_level is required.")
    level = text.upper()
    if level not in LEVELS:
        raise ValueError(
            f"{source} gateway logging_level must be one of {', '.join(LEVELS)}."
        )
    access_log = value.get("access_log", False)
    if not isinstance(access_log, bool):
        raise TypeError(f"{source} gateway access_log must be a boolean.")
    raw_format = value.get("log_format", "pretty")
    if not isinstance(raw_format, str):
        raise TypeError(f"{source} gateway log_format must be a string.")
    output_format = raw_format.strip().lower()
    if output_format not in LOG_FORMATS:
        raise ValueError(
            f"{source} gateway log_format must be one of {', '.join(LOG_FORMATS)}."
        )
    return LoggingSettings(
        level=level,
        access_log=access_log,
        output_format=output_format,
    )
