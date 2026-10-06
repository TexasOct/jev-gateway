"""Read-only listing adapters selected by transport type."""

from __future__ import annotations

import threading
import time
from typing import Any, Callable, Mapping
from urllib.parse import urlencode, urlsplit, urlunsplit

from .discovery_network import DiscoveryNetworkError, JsonResponse, safe_get_json
from .model_metadata import native_model_metadata, safe_identifier, timestamp

MAX_PAGES = 20
MAX_MODELS = 1000
LISTING_LIMIT = 4 * 1024 * 1024
_SLOTS = threading.BoundedSemaphore(4)
_ADAPTERS = {"openai": "openai", "anthropic": "anthropic", "deepseek": "deepseek", "openrouter": "openai"}
_DEFAULTS = {"openai": "https://api.openai.com/v1", "anthropic": "https://api.anthropic.com", "deepseek": "https://api.deepseek.com", "openrouter": "https://openrouter.ai/api/v1"}


def _listing_url(base: str, adapter: str, cursor: str | None) -> str:
    try:
        parts = urlsplit(base)
        if parts.query or "#" in base or parts.username is not None or parts.password is not None:
            raise ValueError
        path = parts.path.rstrip("/")
        if adapter == "anthropic" and not path.endswith("/v1"):
            path += "/v1"
        path += "/models"
        query = {"limit": "100"} if adapter == "anthropic" else {}
        if cursor is not None:
            query["after_id"] = cursor
        return urlunsplit((parts.scheme, parts.netloc, path, urlencode(query), ""))
    except (TypeError, ValueError):
        raise DiscoveryNetworkError("invalid_url") from None


def discover_models_with_dependencies(
    provider: Mapping[str, Any], api_key: str | None, *, imported_ids: set[str],
    fetch: Callable[..., JsonResponse] = safe_get_json,
    clock: Callable[[], float] = time.monotonic,
) -> dict[str, Any]:
    """Inject transport and clock for fixtures; never mutate the provider."""
    provider_id = provider.get("id")
    if not safe_identifier(provider_id) or "/" in provider_id:
        return {"provider_id": None, "supported": False, "complete": False, "items": [], "warnings": ["invalid_provider_id"]}
    transport = provider.get("type")
    transport = transport if isinstance(transport, str) else ""
    adapter = _ADAPTERS.get(transport)
    result: dict[str, Any] = {"provider_id": provider_id, "supported": adapter is not None, "complete": False, "items": [], "warnings": []}
    if adapter is None or provider.get("protocol") == "system_one" or provider.get("kind") == "decision":
        result["supported"] = False
        result["warnings"].append("discovery_unsupported")
        return result
    if api_key is not None and (not isinstance(api_key, str) or not api_key or len(api_key) > 8192 or any(ord(c) < 32 or ord(c) == 127 for c in api_key)):
        result["warnings"].append("invalid_credential")
        return result
    if not _SLOTS.acquire(blocking=False):
        result["warnings"].append("discovery_busy")
        return result
    try:
        deadline = clock() + 20.0
        base = provider.get("api_base") or _DEFAULTS.get(transport, "")
        headers = {}
        if adapter == "anthropic":
            headers["anthropic-version"] = "2023-06-01"
            if api_key:
                headers["x-api-key"] = api_key
        elif api_key:
            headers["Authorization"] = "Bearer " + api_key
        # Only documented non-secret listing headers cross this boundary.
        params = provider.get("params")
        if isinstance(params, dict) and adapter == "openai":
            for parameter, header in (("organization", "OpenAI-Organization"), ("project", "OpenAI-Project")):
                value = params.get(parameter)
                if safe_identifier(value):
                    headers[header] = value
        cursor: str | None = None
        cursors: set[str] = set()
        seen: set[str] = set()
        fetched_at = timestamp()
        for page in range(MAX_PAGES):
            remaining = deadline - clock()
            if remaining <= 0:
                raise DiscoveryNetworkError("timeout")
            response = fetch(_listing_url(base, adapter, cursor), headers=headers, allow_private_network=provider.get("allow_private_network") is True, timeout=remaining, max_bytes=LISTING_LIMIT)
            if clock() >= deadline:
                raise DiscoveryNetworkError("timeout")
            payload = response.data
            if response.status != 200 or not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
                raise DiscoveryNetworkError("invalid_response")
            rows = payload["data"]
            truncated = False
            for row in rows:
                if not isinstance(row, dict) or not safe_identifier(row.get("id")) or (api_key and api_key in row["id"]):
                    result["warnings"].append("invalid_model_id")
                    continue
                model = row["id"]
                if model in seen:
                    continue
                if len(seen) >= MAX_MODELS:
                    truncated = True
                    break
                seen.add(model)
                qualified = f"{provider_id}/{model}"
                result["items"].append({"upstream_model": model, "qualified_id": qualified, "imported": qualified in imported_ids, "metadata": native_model_metadata(row, adapter, provider_id, fetched_at)})
            has_more = payload.get("has_more", False)
            if not isinstance(has_more, bool):
                raise DiscoveryNetworkError("invalid_response")
            if truncated or (len(seen) >= MAX_MODELS and has_more):
                result["warnings"].append("model_limit")
                break
            if not has_more:
                result["complete"] = "invalid_model_id" not in result["warnings"]
                break
            if page == MAX_PAGES - 1:
                result["warnings"].append("page_limit")
                break
            next_cursor = payload.get("last_id")
            if not safe_identifier(next_cursor) or next_cursor in cursors or not rows or (api_key and api_key in next_cursor):
                result["warnings"].append("invalid_pagination")
                break
            cursors.add(next_cursor)
            cursor = next_cursor
        if not result["items"] and result["complete"]:
            result["warnings"].append("empty_listing")
    except DiscoveryNetworkError as error:
        result["warnings"].append(error.code)
    except Exception:
        # Preserve any accepted pages while excluding untrusted failure text.
        result["warnings"].append("upstream_failed")
    finally:
        _SLOTS.release()
    result["warnings"] = list(dict.fromkeys(result["warnings"]))
    return result


def discover_models(provider: Mapping[str, Any], api_key: str | None, *, imported_ids: set[str]) -> dict[str, Any]:
    return discover_models_with_dependencies(provider, api_key, imported_ids=imported_ids, fetch=safe_get_json)


def test_provider_connection(provider: Mapping[str, Any], api_key: str | None) -> dict[str, Any]:
    """Report the bounded listing probe's scope with fixed, safe diagnostics."""
    result: dict[str, Any] = {
        "provider_id": provider.get("id"), "status": "incomplete",
        "scope": "model_listing", "model_count": 0,
        "warnings": ["generation_unverified"],
    }
    if provider.get("type") not in _ADAPTERS or provider.get("kind") == "decision" or provider.get("protocol") == "system_one":
        result["status"] = "unsupported"
        result["warnings"].append("discovery_unsupported")
        return result
    if provider.get("api_key_env") and not api_key:
        result["warnings"].append("credential_unconfigured")
        return result
    listing = discover_models(provider, api_key, imported_ids=set())
    codes = set(listing["warnings"])
    result["model_count"] = len(listing["items"])
    if "authentication_failed" in codes or "invalid_credential" in codes:
        status, message = "authentication_error", "authentication_failed"
    elif codes & {"invalid_url", "blocked_target", "redirect_rejected", "address_not_found"}:
        status, message = "address_error", "address_unavailable"
    elif "listing_unsupported" in codes:
        status, message = "unsupported", "listing_unsupported"
    elif codes & {"dns_failed", "timeout", "upstream_failed", "rate_limited", "discovery_busy", "busy"}:
        status, message = "network_error", "upstream_failed"
    elif listing["complete"]:
        status, message = "success", "listing_succeeded"
    else:
        status, message = "incomplete", "listing_incomplete"
    result["status"] = status
    result["warnings"].append(message)
    return result
