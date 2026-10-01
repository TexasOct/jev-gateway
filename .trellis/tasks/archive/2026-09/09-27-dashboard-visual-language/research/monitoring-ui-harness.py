"""Serve the built UI with a tiny, synthetic monitoring-only API fixture."""
from __future__ import annotations

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[4]
STATIC = ROOT / "jev_gateway" / "static"
SESSIONS = [{
    "session_id": "sess-ui-sample",
    "route": "/v1/chat/completions",
    "strategy": "task_aware",
    "label": "balanced",
    "turn_count": 2,
    "updated_at": 1_000.3,
    "first_request_at": 1_000.0,
    "provider": "openai",
    "upstream_model": "gpt-4.1",
    "latest_request": {"request_id": "req-ui-1", "received_at": 1_000.0, "content_captured": False, "ok": True},
}]
REQUESTS = [{
    "request": {
        "request_id": "req-ui-1", "received_at": 1_000.0, "session_id": "sess-ui-sample",
        "endpoint": "/v1/chat/completions", "strategy": "task_aware", "requested_model": "auto",
        "content_captured": False, "prompt_digest": "fixture-digest",
    },
    "decision": {
        "decision_id": "decision-ui-1", "strategy": "task_aware", "config_hash": "fixture",
        "route": "openai/gpt-4.1", "provider": "openai", "upstream_model": "gpt-4.1",
        "label": "balanced", "reason": "synthetic fixture", "mode": "auto", "turn_index": 1,
        "switched_from": None, "blocked_by": None, "candidates": [], "signals": {}, "created_at": 1_000.1,
    },
    "upstream_request": {
        "provider": "openai", "model": "openai/gpt-4.1", "stream": False,
        "content_captured": False, "payload": {}, "created_at": 1_000.2,
    },
    "outcome": {
        "ok": True, "finish_reason": "stop", "prompt_tokens": 2, "completion_tokens": 4,
        "total_tokens": 6, "cost_usd": 0.001, "latency_ms": 27.0,
        "returned_model": None, "error_type": None, "recorded_at": 1_000.3,
    },
}]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        del format, args

    def json_reply(self, body: object) -> None:
        encoded = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        path = unquote(urlsplit(self.path).path)
        if path == "/v1/routing/sessions":
            self.json_reply({"data": SESSIONS, "storage": {"enabled": False}, "evidence_available": False,
                             "page_size": 30, "next_cursor": None, "has_more": False})
            return
        if path == "/v1/routing/sessions/sess-ui-sample/requests":
            self.json_reply({"session": {"session_id": "sess-ui-sample"}, "storage": {"enabled": False},
                             "evidence_available": False, "requests": REQUESTS, "page_size": 30,
                             "next_cursor": None, "has_more": False})
            return
        if path == "/v1/routing/providers/summary":
            self.json_reply({"window": {"seconds": 900, "start": 0, "end": 1_000, "basis": "synthetic"},
                             "storage": {"enabled": False}, "evidence_available": False, "providers": []})
            return
        if path == "/v1/dashboard/theme":
            self.json_reply({"version": 1, "seed": "#3b66d9"})
            return
        if path == "/dashboard" or path == "/dashboard/":
            path = "/index.html"
        relative = path.removeprefix("/dashboard/") if path.startswith("/dashboard/") else path.lstrip("/")
        target = (STATIC / relative).resolve()
        if not target.is_relative_to(STATIC.resolve()) or not target.is_file():
            self.send_error(404)
            return
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    print(f"Synthetic monitoring harness: http://127.0.0.1:{server.server_port}/dashboard", flush=True)
    server.serve_forever()
