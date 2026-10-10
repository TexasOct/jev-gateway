"""Own credential/default and captured-listing fixtures using installed Python."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import public_accept_native as native


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["live", "default", "listing"], required=True)
    parser.add_argument("--helper", type=Path, required=True)
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    assert not (args.helper / "jev_gateway").exists()
    sys.path.insert(0, str(args.helper))
    native.load_owner(args.state.parent / "evidence/native-owners" / args.mode / "descriptor.json",
        args.helper / "public_accept_native.py", {
            "scripts/public-installed/serve.py": Path(__file__),
            "tests/test_credential_live_server.py": args.helper / "tests/test_credential_live_server.py"})
    import jev_gateway
    assert Path(jev_gateway.__file__).is_relative_to(Path(sys.prefix))
    from tests.test_credential_live_server import free_port, serve_browser_fixture
    if args.mode == "live":
        serve_browser_fixture(args.home, args.state)
        return 0
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    port = free_port()
    env = dict(os.environ, JEV_GATEWAY_HOME=str(args.home), PYTHONPATH=str(args.helper))
    args.home.mkdir(parents=True)
    if args.mode == "listing":
        command = [sys.executable, str(args.helper / "tests/fixtures/real-gateway/server.py"),
                   "--port", str(port), "--scratch", str(args.home),
                   "--listing", str(args.helper / "tests/fixtures/real-gateway/listing.json")]
    else:
        template = Path(jev_gateway.__file__).parent / "templates/models.example.json"
        document = json.loads(template.read_text())
        document["gateway"].update(host="127.0.0.1", port=port)
        (args.home / "models.json").write_text(json.dumps(document) + "\n")
        command = [sys.executable, "-m", "jev_gateway.cli.server", "--home", str(args.home), "--token", "public-installed-default-fixture"]
    with (args.home.parent / (args.mode + "-server.log")).open("wb") as log:
        context = native.site_context(native.current_owner(), "s04")
        child = native.popen_owned(context, command, cwd=args.helper, env=env, stdout=log, stderr=log)
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            deadline = time.monotonic() + 30
            url = f"http://127.0.0.1:{port}"
            while time.monotonic() < deadline:
                if child.poll() is not None:
                    raise RuntimeError(f"{args.mode} fixture exited {child.returncode}")
                try:
                    with opener.open(url + "/dashboard", timeout=1) as response:
                        assert response.status == 200
                        break
                except urllib.error.URLError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("installed fixture readiness exceeded 30 seconds")
            args.state.write_text(json.dumps({"pid": os.getpid(), "gateway_pid": child.pid, "url": url}) + "\n")
            stop.wait()
        finally:
            try:
                if child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait(timeout=5)
            finally:
                native.record_close(context, child, primary=sys.exception())
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        native.finish_owner(native.current_owner())
