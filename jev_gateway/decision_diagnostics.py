"""Explicit synthetic decision connectivity checks, isolated from routing state."""

from __future__ import annotations

import threading
import time
from typing import Any

from jev_gateway.catalog import DecisionProvider
from jev_gateway.discovery_network import DiscoveryNetworkError, safe_post_json
from jev_gateway.strategy.decision_provider.base import DecisionResponseError, checked_result
from jev_gateway.strategy.decision_provider.system_one import parse_answers

_SLOTS = threading.BoundedSemaphore(4)
_QUESTIONS = {"connectivity": {"type": "choice", "instructions": "Choose ready for this synthetic connection check.", "criteria": {"ready": "The synthetic check is ready.", "unready": "The synthetic check is not ready."}}}


def test_decision_connection(provider: DecisionProvider, key: str | None, *, decision_enabled: bool) -> dict[str, Any]:
    """Probe only typed decisions, with fixed content, 5s/64KiB bounds and no failover."""
    started = time.monotonic()
    result: dict[str, Any] = {
        "provider_id": provider.name, "scope": "decision_classification", "synthetic": True,
        "generation_tested": False, "decision_enabled": decision_enabled,
        "status": "missing_key", "http_status": None, "elapsed_ms": 0.0, "answers": {},
    }
    if provider.protocol != "system_one":
        result["status"] = "unsupported_protocol"
    elif key:
        if not _SLOTS.acquire(blocking=False):
            result["status"] = "busy"
        else:
            try:
                body: dict[str, Any] = {"state": "Synthetic gateway decision connectivity check.", "questions": _QUESTIONS}
                if provider.model is not None:
                    body["model"] = provider.model
                response = safe_post_json(provider.api_base, body, headers={"Authorization": f"Bearer {key}"}, timeout=5.0)
                result["http_status"] = response.status
                if response.status != 200:
                    result["status"] = "http_error"
                else:
                    accepted = checked_result(parse_answers(provider.name, response.data, response.status), _QUESTIONS)
                    result["status"] = "accepted" if accepted is not None else "invalid_answers"
                    if accepted is not None:
                        result["answers"] = {key: dict(value) for key, value in accepted.answers.items()}
            except DecisionResponseError as error:
                result["status"] = error.status
            except DiscoveryNetworkError as error:
                result["status"] = {
                    "timeout": "timeout", "invalid_json": "invalid_json",
                    "invalid_response": "invalid_envelope", "response_too_large": "response_too_large",
                    "invalid_url": "address_error", "blocked_target": "address_error", "busy": "busy",
                }.get(error.code, "network_error")
            except Exception:
                # This availability boundary must never expose arbitrary transport prose.
                result["status"] = "network_error"
            finally:
                _SLOTS.release()
    result["elapsed_ms"] = round(max(0.0, (time.monotonic() - started) * 1000), 3)
    return result
