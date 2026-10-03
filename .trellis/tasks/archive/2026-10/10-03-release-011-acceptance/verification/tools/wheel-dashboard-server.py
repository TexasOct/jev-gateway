#!/usr/bin/env python3
"""Serve the installed wheel's dashboard ASGI class for synthetic browser tests."""
from __future__ import annotations

import argparse
import importlib.metadata
from pathlib import Path
import socket
import sys

# Python -I keeps the checkout out of sys.path. Load task helpers explicitly.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from acceptance_common import public_assets, require, verify_installed_static, write_json


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default="0.1.1")
    parser.add_argument("--assets-manifest", type=Path, required=True)
    parser.add_argument("--evidence-dir", type=Path, required=True)
    parser.add_argument("--token", required=True)
    args = parser.parse_args()
    _, wheel, _ = public_assets(args.assets_manifest, args.version)
    require(importlib.metadata.version("jev-gateway") == args.version, "installed public wheel version")

    def no_outbound(event: str, arguments: tuple) -> None:
        if event in {"socket.connect", "socket.getaddrinfo"}:
            raise RuntimeError("outbound networking is disabled in browser ASGI process")
    sys.addaudithook(no_outbound)
    from jev_gateway.dashboard import DashboardStatic, static_directory
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Mount, Route
    import uvicorn

    static = static_directory().resolve()
    require("site-packages" in static.parts, "dashboard must come from installed site-packages")
    count = verify_installed_static(wheel, static)
    escapes: list[dict] = []

    async def ready(request):
        return JSONResponse({"token": args.token, "version": args.version, "static_files": count})

    async def reject_api(request):
        escapes.append({"method": request.method, "path": request.url.path})
        write_json(args.evidence_dir / "escaped-api-requests.json", escapes)
        return JSONResponse({"error": "Browser APIs must be fulfilled by synthetic fixtures"}, status_code=409)

    app = Starlette(routes=[Route("/__acceptance", ready),
                           Mount("/dashboard", DashboardStatic(directory=str(static), html=True)),
                           Route("/{path:path}", reject_api, methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])])
    write_json(args.evidence_dir / "served-wheel.json", {
        "version": args.version, "static_directory": str(static), "static_files_compared": count,
        "server": "installed jev_gateway.dashboard.DashboardStatic ASGI", "synthetic_apis": True,
    })
    write_json(args.evidence_dir / "escaped-api-requests.json", [])
    # Bind before publishing readiness; SO_REUSEPORT is never used. This keeps a
    # port occupied by an unrelated listener from being mistaken for this server.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 4178))
        listener.listen(128)
        uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=4178, access_log=False,
                                     log_level="warning")).run(sockets=[listener])


if __name__ == "__main__":
    main()
