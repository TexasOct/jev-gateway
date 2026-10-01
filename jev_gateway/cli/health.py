from __future__ import annotations

import os
from typing import Any

import httpx

from jev_gateway.dashboard import browsable_host


def probe(host: str, port: int, timeout: float = 1.0, api_key_env: str | None = None, *, api_key: str | None = None) -> dict[str, Any]:
    headers: dict[str, str] = {}
    resolved_key = api_key if api_key is not None else os.getenv(api_key_env) if api_key_env else None
    if resolved_key:
        headers["Authorization"] = f"Bearer {resolved_key}"
    url = f"http://{browsable_host(host)}:{port}/healthz"
    try:
        response = httpx.get(url, headers=headers, timeout=timeout, trust_env=False)
        response.raise_for_status()
        body = response.json()
        return {"reachable": True, "status": body.get("status", "unknown")}
    except (httpx.HTTPError, ValueError):
        return {"reachable": False}
