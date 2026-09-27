"""Serve built dashboard assets with isolated, in-memory API fixtures for browser checks.

This harness never reads the installation catalog or contacts an upstream provider.
Run from the repository root; stdout prints its loopback port.
"""
from __future__ import annotations

import copy
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Lock

ROOT = Path(__file__).resolve().parents[4]
STATIC = ROOT / "jev_gateway" / "static"
QUESTIONS = {
    name: {"type": "choice", "instructions": f"Classify {name}",
           "criteria": {"small": "Small work", "large": "Large work", "huge": "Very large work"}}
    for name in ["scale", "workload", "rigor", "scope", "risk"]
}
BASE = {
    "write_available": True, "write_disabled_reason": None,
    "strategy": "task_aware", "baseline_source": "fixture/models.json",
    "overlay": {"applied": False, "path": "fixture/routing-overrides.json", "error": None},
    "config_hash": "fixture-baseline", "questions": QUESTIONS,
    "fallback": {"label": "craft"},
    "rules": [{"index": index, "when": {"scale": "large" if index % 2 else "small"},
               "select": {"label": "craft" if index % 2 else "ultra"}} for index in range(8)],
    "labels": [{"name": name, "tag": f"task_aware/{name}", "score": index,
                "reasoning_effort": None, "description": "", "resolution": "tag",
                "models": ["p/a"] if index == 0 else ["p/b"]}
               for index, name in enumerate(["craft", "ultra"])],
    "models": [{"id": f"p/{name}", "provider": "p", "upstream_model": name,
                "priority": index + 1, "baseline_priority": index + 1,
                "tags": ["task_aware/craft" if index == 0 else "task_aware/ultra", "foreign/tag"],
                "baseline_tags": ["task_aware/craft" if index == 0 else "task_aware/ultra", "foreign/tag"]}
               for index, name in enumerate(["a", "b"])],
    "warnings": [],
}
config = copy.deepcopy(BASE)
layout = {"version": 1, "nodes": {}, "viewport": {"x": 0, "y": 0}}
requests: list[dict] = []
behavior = {"read_error": False, "write_fail": False, "write_available": True, "delay_first_put": False}
held_first_put = Event()
release_first_put = Event()
request_lock = Lock()
layout_put_count = 0


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        del format, args

    def reply(self, value: object, status: int = 200) -> None:
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path == "/__test/state":
            self.reply({"requests": requests, "layout": layout, "config": config, "behavior": behavior,
                        "held_first_put": held_first_put.is_set(), "layout_put_count": layout_put_count})
        elif path == "/v1/dashboard/theme":
            self.reply({"version": 1, "seed": "#6d7fd7"})
        elif path == "/v1/routing/providers/summary":
            self.reply({"providers": [], "data": [], "storage": {"enabled": False}})
        elif path == "/v1/routing/sessions":
            self.reply({"data": [], "storage": {"enabled": False}, "evidence_available": False,
                        "page_size": 30, "next_cursor": None, "has_more": False})
        elif path == "/v1/routing/configuration":
            self.reply({**config, "write_available": behavior["write_available"]})
        elif path == "/v1/dashboard/canvas-layout":
            self.reply({"version": 1, "nodes": {}, "viewport": {"x": 0, "y": 0},
                        "read_error": "fixture corruption"} if behavior["read_error"] else layout)
        else:
            name = path.removeprefix("/dashboard/") if path.startswith("/dashboard/") else "index.html"
            if name in ("", "/dashboard"):
                name = "index.html"
            file = (STATIC / name).resolve()
            if not file.is_relative_to(STATIC.resolve()) or not file.is_file():
                self.reply({"error": "not found"}, 404)
                return
            body = file.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(file.name)[0] or "application/octet-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def do_POST(self) -> None:
        global config, layout, layout_put_count
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("Object required")
        except (ValueError, UnicodeError):
            self.reply({"error": "invalid JSON object"}, 400)
            return
        if self.path == "/__test/control":
            behavior.update({key: value for key, value in body.items() if key in behavior})
            if body.get("clear_requests"):
                requests.clear()
            if body.get("initial_layout") is not None:
                initial = body["initial_layout"]
                assert set(initial) == {"version", "nodes", "viewport"}
                layout = initial
            if body.get("arm_first_put_failure"):
                with request_lock:
                    layout_put_count = 0
                    held_first_put.clear()
                    release_first_put.clear()
            if body.get("release_first_put"):
                release_first_put.set()
            if body.get("reset"):
                config = copy.deepcopy(BASE)
                layout = {"version": 1, "nodes": {}, "viewport": {"x": 0, "y": 0}}
                requests.clear()
            self.reply({"ok": True})
            return
        requests.append({"method": self.command, "path": self.path, "body": body})
        if self.path == "/v1/routing/configuration/validate":
            self.reply({"valid": True, "warnings": []})
        elif self.path == "/v1/dashboard/canvas-layout":
            with request_lock:
                layout_put_count += 1
                put_number = layout_put_count
            if body.get("version") == 1 and put_number == 1 and not release_first_put.is_set() and behavior.get("delay_first_put"):
                held_first_put.set()
                if not release_first_put.wait(timeout=12):
                    self.reply({"error": {"message": "Fixture held PUT timeout"}}, 500)
                    return
                self.reply({"error": {"message": "Fixture delayed layout failure"}}, 500)
                return
            if behavior["write_fail"]:
                self.reply({"error": {"message": "Fixture layout write failure"}}, 500)
            else:
                assert set(body) == {"version", "nodes", "viewport"}
                layout = body
                self.reply(layout)
        elif self.path == "/v1/routing/configuration":
            config.update({key: body[key] for key in ("questions", "rules", "fallback") if key in body})
            config["rules"] = [{**rule, "index": index} for index, rule in enumerate(config["rules"])]
            self.reply({"applied": True, "warnings": []})
        else:
            self.reply({"error": "unknown mutation"}, 404)

    do_PUT = do_POST


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    print(f"Isolated canvas harness: http://127.0.0.1:{server.server_port}/dashboard", flush=True)
    server.serve_forever()
