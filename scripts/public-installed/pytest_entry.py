"""Load test helpers only, and preserve pytest's native collection/result data."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import socket
import sys
from typing import Any
import public_accept_native as native


class Evidence:
    def __init__(self, output: Path) -> None:
        self.output = output
        self.collected: list[str] = []
        self.results: list[dict] = []

    def pytest_collection_finish(self, session: Any) -> None:
        self.collected = [item.nodeid for item in session.items]

    def pytest_runtest_logreport(self, report: Any) -> None:
        self.results.append({"nodeid": report.nodeid, "when": report.when, "outcome": report.outcome,
                             "skip_reason": report.longrepr[2] if report.skipped and isinstance(report.longrepr, tuple) else None,
                             "duration": report.duration, "longrepr": str(report.longrepr) if report.longrepr else None})

    def pytest_sessionfinish(self, session: Any, exitstatus: Any) -> None:
        self.output.write_text(json.dumps({"exitstatus": int(exitstatus), "collected": self.collected,
                                         "reports": self.results}, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--helper", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--test", action="append", default=[])
    args = parser.parse_args()
    assert not (args.helper / "jev_gateway").exists()
    sys.path.insert(0, str(args.helper))
    mode = {"backend-collection.json": "backend-collect", "backend-results.json": "backend-business",
            "browser-capture-replay.json": "backend-replay"}[args.output.name]
    owner = native.load_owner(args.output.parent / "native-owners" / mode / "descriptor.json",
        args.helper / "public_accept_native.py", {
            row[1]: args.helper / row[1] for site, row in native.SITE_SOURCE.items()
            if site in native.BACKEND_SITES})
    import jev_gateway
    assert Path(jev_gateway.__file__).is_relative_to(Path(sys.prefix))
    import pytest
    def phase_hook(phase: str) -> Any:
        def hook(item: Any) -> Any:
            current = native.current_owner()
            digest = None if current is None else native.scope_digest(current, item.nodeid)
            test_scope = None if digest is None else {"node_mac": digest, "phase": phase}
            token = native.CURRENT_SCOPE.set(test_scope)
            try:
                yield
            finally:
                native.CURRENT_SCOPE.reset(token)
        return pytest.hookimpl(hookwrapper=True)(hook)
    for phase in ("setup", "call", "teardown"):
        setattr(Evidence, "pytest_runtest_" + phase, staticmethod(phase_hook(phase)))
    original = socket.socket.connect
    original_ex = socket.socket.connect_ex

    def check(address: Any) -> None:
        if isinstance(address, tuple):
            assert address[0] in ("127.0.0.1", "::1", "localhost"), f"external test socket denied: {address}"

    def connect(sock: socket.socket, address: Any) -> Any:
        check(address)
        return original(sock, address)

    def connect_ex(sock: socket.socket, address: Any) -> Any:
        check(address)
        return original_ex(sock, address)

    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex
    os.chdir(args.helper)
    options = ["-q", "-p", "no:cacheprovider", *(args.test or ["tests"])]
    if args.collect:
        options.append("--collect-only")
    try:
        return int(pytest.main(options, plugins=[Evidence(args.output)]))
    finally:
        native.finish_owner(owner)


if __name__ == "__main__":
    raise SystemExit(main())
