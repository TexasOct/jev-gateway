#!/usr/bin/env python3
"""Probe local installed dashboard routes without exporting credential values."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    from jev_gateway.cli.config_ops import read_snapshot

    document, credentials = read_snapshot(args.home / "models.json")
    reference = document.get("gateway", {}).get("api_key_env")
    key = credentials.get(reference.strip()) if isinstance(reference, str) else None
    if reference is not None and not key:
        raise RuntimeError("configured gateway credential missing")
    headers = {"Authorization": "Bearer " + key} if key else {}
    base = f"http://127.0.0.1:{args.port}"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def get(path: str, timeout: int = 10) -> bytes:
        with opener.open(urllib.request.Request(base + path, headers=headers), timeout=timeout) as response:
            if response.status != 200:
                raise RuntimeError("local dashboard route returned an unexpected status")
            return response.read()

    deadline = time.monotonic() + 30
    while True:
        try:
            if json.loads(get("/healthz", 2)).get("status") == "ok":
                break
        except (OSError, urllib.error.URLError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError("authenticated health readiness timeout")
        time.sleep(0.2)
    links = set(re.findall(r'(?:src|href)=["\']([^"\']+\.(?:js|css))["\']', get("/dashboard").decode()))
    if not any(link.endswith(".js") for link in links) or not any(link.endswith(".css") for link in links):
        raise RuntimeError("dashboard JS and CSS references missing")
    for link in links:
        if not link.startswith("/dashboard/assets/") or not get(link):
            raise RuntimeError("local dashboard asset unavailable")
    # Only safe status metadata crosses the process boundary. The key, headers,
    # dotenv contents and HTTP response bodies are never printed or saved.
    print(json.dumps({"success": True, "health": "ok", "asset_count": len(links), "bearer_used": bool(key)}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"success": False, "error_type": type(error).__name__}))
        raise SystemExit(1)
