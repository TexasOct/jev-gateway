"""Local HTTP transport and browser fixture for file-only credential setup."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import socket
import sqlite3
import subprocess
import sys
import threading
import time
from typing import Any, Iterator
import urllib.error
import urllib.request

import pytest

from tests.helpers import single_route_document

REFERENCES = {"gateway": "LIVE_GATEWAY_KEY", "llm": "LIVE_LLM_KEY", "decision": "LIVE_DECISION_KEY"}
VALUES = {"gateway": "fake-live-inbound", "llm": "fake-live-provider", "decision": "fake-live-decision"}


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@dataclass
class LocalUpstream:
    expected: dict[str, str] = field(default_factory=lambda: dict(VALUES))
    events: list[dict[str, Any]] = field(default_factory=list)
    base: str = ""


@contextmanager
def local_upstream() -> Iterator[LocalUpstream]:
    state = LocalUpstream()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            kind = "decision" if self.path == "/evaluate" else "llm"
            matches = self.headers.get("Authorization") == f"Bearer {state.expected[kind]}"
            state.events.append({"kind": kind, "path": self.path, "key_matches": matches})
            if not matches:
                self.send_response(401)
                result: dict[str, Any] = {"error": {"message": "Fixture authentication failed."}}
            elif kind == "decision":
                self.send_response(200)
                result = {"answers": {name: {"choice": "complex" if "complex" in question["criteria"] else next(iter(question["criteria"]))}
                                      for name, question in body["questions"].items()}}
            else:
                self.send_response(200)
                result = {"id": "local-fixture", "object": "chat.completion", "created": 1,
                          "model": body["model"], "choices": [{"index": 0, "message": {
                              "role": "assistant", "content": "Local transport verified."}, "finish_reason": "stop"}],
                          "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}
            content = json.dumps(result).encode()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def log_message(self, format: str, *args: Any) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    state.base = f"http://127.0.0.1:{server.server_port}"
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def create_home(home: Path, port: int, upstream: str, *, configured: bool) -> None:
    home.mkdir(parents=True, exist_ok=True)
    document = single_route_document()
    document["policy"]["mode"] = "fresh"
    document["strategies"]["task_aware"]["kind"] = "decision"
    document["gateway"] = {"host": "127.0.0.1", "port": port, "log_format": "json"}
    if configured:
        document["gateway"]["api_key_env"] = REFERENCES["gateway"]
    document["providers"][0].update(api_key_env=REFERENCES["llm"], api_base=upstream + "/v1",
                                    display_name="Live fixture provider")
    document["decision"] = {"enabled": True, "timeout_seconds": 5, "providers": [{
        "id": "live-decision", "protocol": "system_one", "api_base": upstream + "/evaluate",
        "api_key_env": REFERENCES["decision"], "display_name": "Live fixture decision"}]}
    document["storage"] = {"enabled": True, "path": "records.sqlite3", "capture_content": True}
    (home / "models.json").write_text(json.dumps(document) + "\n")
    (home / ".env").write_text("# File-only fixture; no secret assignments.\n")
    write_keys(home, VALUES if configured else {})


def write_keys(home: Path, values: dict[str, str]) -> None:
    store = home / "credentials.json"
    store.write_text(json.dumps({"version": 1, "values": {REFERENCES[role]: value for role, value in values.items()}}) + "\n")
    store.chmod(0o600)


def request(base: str, path: str, *, method: str = "GET", key: str | None = None,
            body: dict[str, Any] | None = None) -> tuple[int, bytes, dict[str, str]]:
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    outgoing = urllib.request.Request(base + path, method=method, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
    try:
        with opener.open(outgoing, timeout=10) as response:
            return response.status, response.read(), {name.lower(): value for name, value in response.headers.items()}
    except urllib.error.HTTPError as error:
        return error.code, error.read(), {name.lower(): value for name, value in error.headers.items()}


@contextmanager
def live_gateway(home: Path, port: int, key: str | None) -> Iterator[subprocess.Popen[bytes]]:
    outside = home.parent / "unrelated-cwd"
    outside.mkdir(exist_ok=True)
    env = dict(os.environ)
    for name in [*REFERENCES.values(), "JEV_GATEWAY_HOME", "PYTHONPATH", "PYTHONHOME"]:
        env.pop(name, None)
    env.update(NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost", XDG_STATE_HOME=str(home.parent / "state"))
    with (home.parent / "server.log").open("ab") as log:
        process = subprocess.Popen([sys.executable, "-m", "jev_gateway.cli.server", "--home", str(home),
                                    "--token", "credential-local-fixture"], cwd=outside, env=env,
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError("Local fixture gateway exited before readiness.")
                try:
                    if request(f"http://127.0.0.1:{port}", "/healthz", key=key)[0] == 200:
                        break
                except urllib.error.URLError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("Local fixture gateway readiness timed out.")
            yield process
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


def test_json_only_actual_http_transports_reload_restart_and_privacy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    for name in REFERENCES.values():
        monkeypatch.delenv(name, raising=False)
    home = tmp_path / "runtime home with spaces"
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    secrets = [*VALUES.values()]
    rotated = {role: value + "-next" for role, value in VALUES.items()}
    secrets.extend(rotated.values())
    payload = {"model": "task_aware", "messages": [{"role": "user", "content": "Verify local transports."}]}
    with local_upstream() as upstream:
        create_home(home, port, upstream.base, configured=True)
        assert all(name not in os.environ for name in REFERENCES.values())
        with live_gateway(home, port, VALUES["gateway"]):
            assert request(base, "/v1/provider-configuration")[0] == 401
            for values in (VALUES, rotated):
                if values is rotated:
                    write_keys(home, values)
                    upstream.expected.update(values)
                    assert request(base, "/v1/routing/reload", method="POST", key=VALUES["gateway"])[0] == 200
                    assert request(base, "/healthz", key=VALUES["gateway"])[0] == 401
                status, content, headers = request(base, "/v1/chat/completions", method="POST", key=values["gateway"], body=payload)
                assert status == 200
                assert json.loads(content)["choices"][0]["message"]["content"] == "Local transport verified."
                assert headers["x-jev-task-type"] == "complex"
                assert all(value.encode() not in content for value in secrets)
                for path in ("/healthz", "/v1/models", "/v1/provider-configuration", "/v1/routing/policy",
                             "/v1/routing/strategies", "/v1/routing/configuration"):
                    status, content, _headers = request(base, path, key=values["gateway"])
                    assert status == 200
                    assert all(value.encode() not in content for value in secrets)
        with live_gateway(home, port, rotated["gateway"]):
            assert request(base, "/v1/chat/completions", method="POST", key=rotated["gateway"], body=payload)[0] == 200
    assert [event["kind"] for event in upstream.events] == ["decision", "llm"] * 3
    assert all(event["key_matches"] for event in upstream.events)
    assert (home / "credentials.json").stat().st_mode & 0o777 == 0o600
    with sqlite3.connect(home / "records.sqlite3") as connection:
        dump = "\n".join(connection.iterdump())
    for content in (dump, (tmp_path / "server.log").read_text(), (home / "models.json").read_text()):
        assert all(value not in content for value in secrets)


def serve_browser_fixture(home: Path, state_path: Path) -> None:
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda _number, _frame: stop.set())
    signal.signal(signal.SIGINT, lambda _number, _frame: stop.set())
    port = free_port()
    with local_upstream() as upstream:
        create_home(home, port, upstream.base, configured=False)
        with live_gateway(home, port, None) as process:
            state = {"pid": os.getpid(), "gateway_pid": process.pid, "url": f"http://127.0.0.1:{port}"}
            state_path.write_text(json.dumps(state) + "\n")
            print(json.dumps(state), flush=True)
            try:
                stop.wait()
            finally:
                (home.parent / "transport-events.json").write_text(json.dumps(upstream.events) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    serve_browser_fixture(args.home, args.state)
