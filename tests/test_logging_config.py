"""Logging format and startup options."""

from __future__ import annotations

import logging
import sys
import types
from typing import Any

import pytest

from jev_gateway.catalog import gateway_from_dict
from jev_gateway.logging import (
    GatewayFormatter,
    display_logger_name,
    uvicorn_log_config,
)


def test_gateway_logging_defaults_and_validation() -> None:
    defaults = gateway_from_dict({}, "test")
    assert defaults.logging.level == "INFO"
    assert defaults.logging.access_log is False
    assert defaults.as_dict()["logging_level"] == "INFO"
    configured = gateway_from_dict(
        {"logging_level": "debug", "access_log": True}, "test"
    )
    assert configured.logging.level == "DEBUG"
    assert configured.logging.access_log is True
    with pytest.raises(ValueError, match="logging_level must be one of"):
        gateway_from_dict({"logging_level": "verbose"}, "test")
    with pytest.raises(TypeError, match="access_log must be a boolean"):
        gateway_from_dict({"access_log": "false"}, "test")


def test_formatting_keeps_fields_safe_and_clearly_attributed() -> None:
    config = uvicorn_log_config()
    assert config["loggers"]["jev_gateway"]["level"] == "INFO"
    assert config["root"]["level"] == "WARNING"
    assert config["loggers"]["LiteLLM"]["level"] == "WARNING"
    formatter = GatewayFormatter(
        "%(levelname)s %(name)s | %(message)s", use_colors=False
    )
    record = logging.LogRecord(
        "jev_gateway.gateway", logging.INFO, __file__, 1,
        "routing decided", (), None,
    )
    record.decision_id = "dec-1"
    record.reason = "line1\nline2"
    output = formatter.format(record)
    assert output == (
        "INFO gateway | routing decided "
        "decision_id=dec-1 reason=line1\\nline2"
    )
    assert display_logger_name("uvicorn.error") == "uvicorn"
    colored = GatewayFormatter("%(levelname)s %(name)s | %(message)s", use_colors=True)
    colored_output = colored.format(record)
    assert colored_output == (
        "\033[32mINFO\033[0m gateway | routing decided "
        "decision_id=dec-1 reason=line1\\nline2"
    )
    assert colored_output.count("\033[32m") == 1
    assert colored_output.count("\033[0m") == 1


def test_litellm_hint_is_disabled_without_silencing_warnings(monkeypatch) -> None:
    from jev_gateway.logging import suppress_litellm_debug_prints

    litellm = types.SimpleNamespace(suppress_debug_info=False)
    monkeypatch.setitem(sys.modules, "litellm", litellm)
    suppress_litellm_debug_prints()
    assert litellm.suppress_debug_info is True


def test_run_gateway_passes_logging_options(monkeypatch) -> None:
    from jev_gateway import gateway, logging

    calls: list[dict[str, Any]] = []
    monkeypatch.setattr("uvicorn.run", lambda *args, **kwargs: calls.append(kwargs))
    monkeypatch.setattr(logging, "suppress_litellm_debug_prints", lambda: None)
    gateway.run_gateway()
    assert calls[0]["host"] == "127.0.0.1"
    assert calls[0]["access_log"] is False
    assert calls[0]["log_level"] == "info"
    assert calls[0]["log_config"]["disable_existing_loggers"] is False
