"""Parse gateway logging settings declared in the model catalog."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .config import LEVELS


@dataclass(frozen=True)
class LoggingSettings:
    """Console verbosity and HTTP access-log options set at process startup."""

    level: str = "INFO"
    access_log: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {"logging_level": self.level, "access_log": self.access_log}


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
    return LoggingSettings(level=level, access_log=access_log)
