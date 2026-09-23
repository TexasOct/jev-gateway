"""Logging format and startup options."""

from __future__ import annotations

import json
import logging
import sys
import types
from typing import Any, Literal

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
    assert defaults.logging.output_format == "pretty"
    assert defaults.as_dict()["logging_level"] == "INFO"
    configured = gateway_from_dict(
        {"logging_level": "debug", "access_log": True, "log_format": "JSON"},
        "test",
    )
    assert configured.logging.level == "DEBUG"
    assert configured.logging.access_log is True
    assert configured.logging.output_format == "json"
    with pytest.raises(ValueError, match="logging_level must be one of"):
        gateway_from_dict({"logging_level": "verbose"}, "test")
    with pytest.raises(TypeError, match="access_log must be a boolean"):
        gateway_from_dict({"access_log": "false"}, "test")
    with pytest.raises(ValueError, match="log_format must be one of"):
        gateway_from_dict({"log_format": "yaml"}, "test")
    with pytest.raises(TypeError, match="log_format must be a string"):
        gateway_from_dict({"log_format": True}, "test")


def test_pretty_formatting_groups_fields_without_exposing_unlisted_data() -> None:
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
    record.request_id = "req-1"
    record.route = "openai/gpt-5.6-sol"
    record.reason = "line1\nline2"
    record.secret = "must not appear"
    output = formatter.format(record)
    assert output == (
        "INFO gateway | routing decided\n"
        "  identifiers:\n"
        "    decision_id: dec-1\n"
        "    request_id: req-1\n"
        "  model:\n"
        "    route: openai/gpt-5.6-sol\n"
        "  selection:\n"
        "    reason: line1\\nline2"
    )
    assert display_logger_name("uvicorn.error") == "uvicorn"
    colored = GatewayFormatter("%(levelname)s %(name)s | %(message)s", use_colors=True)
    colored_output = colored.format(record)
    assert colored_output == output.replace("INFO", "\033[32mINFO\033[0m", 1)
    assert colored_output.count("\033[32m") == 1
    assert colored_output.count("\033[0m") == 1
    assert "must not appear" not in output


def test_compact_and_json_formats_keep_logs_machine_safe() -> None:
    record = logging.LogRecord(
        "jev_gateway.gateway", logging.INFO, __file__, 1,
        "routing served", (), None,
    )
    record.decision_id = "dec-1"
    record.ok = True
    record.latency_ms = 12.5
    record.reason = "line1\nline2"
    compact = GatewayFormatter(
        "%(levelname)s %(name)s | %(message)s",
        use_colors=False,
        log_format="compact",
    )
    assert compact.format(record) == (
        "INFO gateway | routing served decision_id=dec-1 "
        "reason=line1\\nline2 ok=True latency_ms=12.5"
    )
    json_formatter = GatewayFormatter(
        "%(levelname)s %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        use_colors=False,
        log_format="json",
    )
    payload = json.loads(json_formatter.format(record))
    assert payload["level"] == "INFO"
    assert payload["logger"] == "gateway"
    assert payload["event"] == "routing served"
    assert payload["decision_id"] == "dec-1"
    assert payload["reason"] == "line1\nline2"
    assert payload["ok"] is True
    assert payload["latency_ms"] == 12.5


@pytest.mark.parametrize("log_format", ["pretty", "compact", "json"])
def test_traceback_formatter_hides_untrusted_exception_text(
    log_format: Literal["pretty", "compact", "json"],
) -> None:
    try:
        raise RuntimeError("Authorization: Bearer test-key-small")
    except RuntimeError:
        record = logging.LogRecord(
            "jev_gateway.gateway", logging.DEBUG, __file__, 1,
            "upstream failure details", (), sys.exc_info(),
        )
    formatter = GatewayFormatter(
        "%(levelname)s %(name)s | %(message)s",
        use_colors=False,
        log_format=log_format,
    )
    output = formatter.format(record)
    assert "test-key-small" not in output
    assert "Bearer" not in output
    assert "[REDACTED]" in output
    assert "RuntimeError" in output


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
    assert calls[0]["log_config"]["formatters"]["console"]["log_format"] == "pretty"
