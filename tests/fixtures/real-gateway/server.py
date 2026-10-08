"""Run the real gateway ASGI app on loopback for a browser acceptance leg.

The process owns one private scratch directory, one real ``models.json`` and
one real SQLite record store. A socket guard blocks every outbound connection
except the connection the gateway makes to this process's own loopback server.
The operator then drives the built dashboard against a genuine backend rather
than a synthetic HTTP mock.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import socket
import sys
import threading
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import uvicorn

from jev_gateway import gateway, model_discovery
from jev_gateway.discovery_network import JsonResponse
from tests.helpers import single_route_document


class BlockedOutbound(RuntimeError):
    """Raised when any non-loopback socket connection is attempted."""


def install_socket_guard(port: int) -> list[str]:
    """Deny every outbound connection except this process's own loopback port."""
    allowed = {("127.0.0.1", port), ("::1", port)}
    attempted: list[str] = []
    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex

    def guard(self: socket.socket, address: Any) -> Any:
        target = (address[0], address[1]) if isinstance(address, tuple) and len(address) > 1 else (address, None)
        if target not in allowed:
            attempted.append(str(address))
            raise BlockedOutbound(f"outbound socket blocked: {address}")
        return original_connect(self, address)

    def guard_ex(self: socket.socket, address: Any) -> Any:
        target = (address[0], address[1]) if isinstance(address, tuple) and len(address) > 1 else (address, None)
        if target not in allowed:
            attempted.append(str(address))
            raise BlockedOutbound(f"outbound socket blocked: {address}")
        return original_connect_ex(self, address)

    socket.socket.connect = guard  # type: ignore[method-assign]
    socket.socket.connect_ex = guard_ex  # type: ignore[method-assign]
    return attempted


def install_listing_stub(listing: Mapping[str, Any]) -> None:
    """Redirect the listing owner's fetch to a captured fixture, never a socket."""

    def fetch(url: str, **kwargs: Any) -> JsonResponse:
        return JsonResponse(listing)

    model_discovery.safe_get_json = fetch  # type: ignore[assignment]


def build_document(scratch: Path) -> dict[str, Any]:
    document = single_route_document()
    document["gateway"] = {"api_key_env": "REAL_GATEWAY_KEY"}
    document["providers"][0]["display_name"] = "Real provider"
    document["models"][0]["display_name"] = "Original name"
    document["storage"] = {"enabled": True, "path": str(scratch / "records.sqlite3")}
    return document


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--scratch", required=True)
    parser.add_argument("--listing", required=True)
    parser.add_argument(
        "--overlay",
        action="store_true",
        help="Install a real routing overlay so baseline/overlay ownership can be observed.",
    )
    args = parser.parse_args()

    scratch = Path(args.scratch).resolve()
    scratch.mkdir(parents=True, exist_ok=True)
    models_file = scratch / "models.json"
    models_file.write_text(json.dumps(build_document(scratch)))
    if args.overlay:
        (scratch / "routing-overrides.json").write_text(json.dumps({
            "version": 1,
            "strategy": "task_aware",
            "models": {"test-provider/vendor/only": {"tags": ["task_aware/overlay"], "priority": 7}},
        }))
    (scratch / ".env").write_text(
        "REAL_GATEWAY_KEY=real-gateway-synthetic\nTEST_PROVIDER_KEY=real-provider-synthetic\n"
    )
    (scratch / "credentials.json").write_text('{"version": 1, "values": {}}')

    blocked_attempts = install_socket_guard(args.port)
    install_listing_stub(json.loads(Path(args.listing).read_text()))

    os.environ["REAL_GATEWAY_KEY"] = "real-gateway-synthetic"
    os.environ["TEST_PROVIDER_KEY"] = "real-provider-synthetic"
    config = gateway.load_gateway_config(models_file)
    app = gateway.create_app(config)

    @app.get("/__guard__")
    def guard_state() -> dict[str, Any]:
        """Expose proof that the outbound socket guard stayed active."""
        return {"blocked": list(blocked_attempts), "count": len(blocked_attempts)}

    def announce() -> None:
        print(json.dumps({"scratch": str(scratch), "models_file": str(models_file)}), flush=True)
        print(f"READY {args.port}", flush=True)

    def shutdown(*_args: Any) -> None:
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    threading.Timer(0.4, announce).start()
    try:
        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning", access_log=False)
    except SystemExit:
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
