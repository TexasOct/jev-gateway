#!/usr/bin/env python3
"""Hosted public v0.1.3 installer, provenance, and active business acceptance."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
import zipfile

from adapt import prepare


SOURCE = "4d56e438e2f817115e65f9c47519f9adc62d41c1"
TAG_OBJECT = "cf8b1587ba1ea2733db19b979779a2921dee51f8"
RUN = 37967881650
RELEASE = 408181634
ARTIFACT = 11634507872
ARTIFACT_SHA = "10e6c8a7df57dbd0c75e9cdf91966ed68d247dbbf672d55eb562c335752a21ea"
ASSETS = {
    "jev_gateway-0.1.3-py3-none-any.whl": (625707320, 459987, "135f91895bd726622b752aed75734d8eba985b12f0345ea63f0013b86a07dff0"),
    "install.sh": (625707321, 10215, "2640c2bd009ba3bf971199577d71a57479db49545c49e67bdd4b0b179956e3e9"),
    "install.sh.sha256": (625707325, 77, "f0e386e10e172a9fce4871e78c3da193a177d813b1f7476a7902b3c7fd5454be"),
    "jev_gateway-0.1.3-py3-none-any.whl.sha256": (625707322, 101, "17a2ae369868fc71b2e18625568035f499a3f03fba71de69944c86b73650ec88"),
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def artifact_digest_gate(artifact: dict) -> None:
    assert artifact["digest"] == "sha256:" + ARTIFACT_SHA, artifact.get("digest")


CAPTURE_NODES = {
    "tests/test_browser_capture_replay.py::test_x1_browser_captured_body_replays_through_the_real_gateway",
    "tests/test_browser_capture_replay.py::test_t3_browser_captured_body_preserves_baseline_and_overlay",
}
CAPTURE_SKIP_REASON = "Skipped: no browser capture at None; run the real-backend browser spec first"


def backend_gate(report: dict, collected: list[str], replay: bool = False) -> dict:
    assert report["exitstatus"] == 0
    assert len(collected) == len(set(collected))
    assert sorted(report["collected"]) == sorted(collected)
    assert len(report["collected"]) == len(collected)
    if replay:
        assert set(collected) == CAPTURE_NODES
    assert {item["nodeid"] for item in report["reports"]} == set(collected)
    skipped = []
    passed = []
    for node in collected:
        phases = [item for item in report["reports"] if item["nodeid"] == node]
        assert len({item["when"] for item in phases}) == len(phases), node
        skip = [item for item in phases if item["outcome"] == "skipped"]
        if skip:
            assert not replay and node in CAPTURE_NODES and len(skip) == 1, node
            assert skip[0]["when"] == "call" and skip[0]["skip_reason"] == CAPTURE_SKIP_REASON, skip
            assert {item["when"] for item in phases} == {"setup", "call", "teardown"}, node
            assert all(item["outcome"] == "passed" for item in phases if item["when"] != "call"), node
            skipped.append(skip[0])
        else:
            assert {item["when"] for item in phases} == {"setup", "call", "teardown"}, node
            assert all(item["outcome"] == "passed" for item in phases), node
            passed.append(node)
    return {"collected_count": len(collected),
            "executed_call_count": sum(item["when"] == "call" for item in report["reports"]),
            "passed_call_count": len(passed),
            "passed_nodeids": passed, "skipped_count": len(skipped), "skips": skipped}


def observation_receipt(operation: str, pid: int | None, identity: float | None, commands: list[dict], error: BaseException) -> dict:
    try:
        message = str(error)
    except BaseException:
        message = "exception message unavailable"
    return {"operation": operation, "pid": pid, "create_time": identity,
            "type": type(error).__name__, "message": message, "observed_at_monotonic": time.monotonic(),
            "commands_snapshot": [{key: item.get(key) for key in ("pid", "create_time", "label", "argv", "cwd", "native_exit")}
                                  for item in commands]}


def reconcile_observations(errors: list[dict], closures: list[dict]) -> list[dict]:
    results = []
    for error in errors:
        matching = [item for item in closures if error["create_time"] is not None
                    and item["pid"] == error["pid"] and item.get("create_time") == error["create_time"]
                    and item.get("native_exit") is not None and item.get("closure_source") == "retained-Popen.poll"]
        results.append({"error": error, "resolution": "owned-native-exit" if len(matching) == 1 else "unresolved",
                        "closure": matching[0] if len(matching) == 1 else None})
    return results


class NativeCommands:
    """Record native exits and clean only processes with retained PID identities."""

    def __init__(self, evidence: Path) -> None:
        import psutil
        self.psutil = psutil
        self.evidence = evidence
        self.commands: list[dict] = []
        self.processes: list[tuple[subprocess.Popen, dict]] = []
        self.owned: dict[int, float] = {}
        self.listeners: set[int] = set()
        self.observation_errors: list[dict] = []
        self.observer_state = {"started": False, "completed": False, "failed": False, "failure": None}
        self.lock = threading.Lock()
        self.done = threading.Event()
        self.thread = threading.Thread(target=self.observe, daemon=True)
        self.thread.start()

    def observe(self) -> None:
        previous = getattr(self, "observer_state", None)
        assert previous is None or not previous["failed"], "failed observer cannot restart"
        state = {"started": True, "completed": False, "failed": False, "failure": None}
        self.observer_state = state
        operation = "done.wait"
        pid = os.getpid()
        identity = None
        try:
            while True:
                operation = "done.wait"
                if self.done.wait(0.1):
                    state["completed"] = True
                    return
                operation = "children(recursive=True)"
                pid = os.getpid()
                identity = None
                try:
                    processes = self.psutil.Process().children(recursive=True)
                except self.psutil.AccessDenied as error:
                    self.observation_errors.append(observation_receipt(operation, pid, None, self.commands, error))
                    continue
                for process in processes:
                    identity = None
                    operation = "process.pid"
                    pid = None
                    pid = process.pid
                    operation = "create_time"
                    try:
                        identity = process.create_time()
                        with self.lock:
                            self.owned[pid] = identity
                        operation = "net_connections(kind=tcp)"
                        for connection in process.net_connections(kind="tcp"):
                            if connection.status == "LISTEN" and connection.laddr.ip in ("127.0.0.1", "::1"):
                                self.listeners.add(connection.laddr.port)
                    except self.psutil.NoSuchProcess:
                        continue
                    except self.psutil.AccessDenied as error:
                        self.observation_errors.append(observation_receipt(operation, pid, identity, self.commands, error))
        except BaseException as error:
            state["completed"] = False
            state["failed"] = True
            state["failure"] = observation_receipt(operation, pid, identity, self.commands, error)
            if hasattr(self, "evidence"):
                try:
                    (self.evidence / "observer-state.json").write_text(json.dumps(state, indent=2) + "\n")
                except Exception as persistence_error:
                    state["persistence_error"] = {"type": type(persistence_error).__name__, "message": str(persistence_error)}
            raise

    def launch(self, argv: list[str], cwd: Path, env: dict[str, str], label: str) -> tuple[subprocess.Popen, dict]:
        index = len(self.commands) + 1
        log_path = self.evidence / f"{index:03d}-{label}.log"
        log = log_path.open("wb")
        process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        log.close()
        record = {"argv": argv, "cwd": str(cwd), "label": label, "pid": process.pid,
                  "log": str(log_path), "native_exit": None, "timed_out": False}
        self.commands.append(record)
        self.processes.append((process, record))
        try:
            with self.lock:
                self.owned[process.pid] = self.psutil.Process(process.pid).create_time()
                record["create_time"] = self.owned[process.pid]
        except self.psutil.NoSuchProcess:
            # Fast inspection commands may already have exited; wait() still owns their result.
            pass
        except self.psutil.AccessDenied as error:
            self.observation_errors.append(observation_receipt("launch.create_time", process.pid, None, self.commands, error))
            self.flush()
            raise
        self.flush()
        return process, record

    def flush(self) -> None:
        (self.evidence / "commands.json").write_text(json.dumps(self.commands, indent=2) + "\n")

    def run(self, argv: list[str], cwd: Path, env: dict[str, str], label: str, timeout: int = 240,
            required: bool = True) -> int:
        process, record = self.launch(argv, cwd, env, label)
        try:
            record["native_exit"] = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            record["timed_out"] = True
            self.cleanup()
            record["native_exit"] = process.wait(timeout=15)
        finally:
            self.flush()
        if required and (record["native_exit"] != 0 or record["timed_out"]):
            raise RuntimeError(f"{label}: native exit {record['native_exit']}, timeout {record['timed_out']}")
        return record["native_exit"]

    def cleanup(self) -> None:
        records = []
        with self.lock:
            identities = dict(self.owned)
        live = []
        for pid, created in identities.items():
            operation = "cleanup.create_time"
            observed_identity = None
            try:
                process = self.psutil.Process(pid)
                observed_identity = process.create_time()
                if observed_identity != created:
                    records.append({"pid": pid, "state": "identity_changed_no_signal"})
                    continue
                operation = "cleanup.status"
                if process.status() == self.psutil.STATUS_ZOMBIE:
                    continue
                live.append(process)
                operation = "cleanup.terminate"
                process.terminate()
            except self.psutil.NoSuchProcess:
                continue
            except self.psutil.AccessDenied as error:
                self.observation_errors.append(observation_receipt(operation, pid, observed_identity, self.commands, error))
                raise
        def survivors(items: list) -> list:
            for child, receipt in self.processes:
                native = child.poll()
                if native is not None and receipt["native_exit"] is None:
                    receipt["native_exit"] = native
            result = []
            for process in items:
                operation = "cleanup.is_running"
                try:
                    if process.is_running():
                        operation = "cleanup.survivor_status"
                        if process.status() != self.psutil.STATUS_ZOMBIE:
                            result.append(process)
                except self.psutil.NoSuchProcess:
                    pass
                except self.psutil.AccessDenied as error:
                    self.observation_errors.append(observation_receipt(operation, process.pid, None, self.commands, error))
                    raise
            return result

        deadline = time.monotonic() + 10
        alive = survivors(live)
        while alive and time.monotonic() < deadline:
            time.sleep(0.1)
            alive = survivors(alive)
        for process in alive:
            operation = "cleanup.kill_identity"
            observed_identity = None
            try:
                observed_identity = process.create_time()
                assert observed_identity == identities[process.pid]
                operation = "cleanup.kill"
                process.kill()
            except self.psutil.NoSuchProcess:
                pass
            except self.psutil.AccessDenied as error:
                self.observation_errors.append(observation_receipt(operation, process.pid, observed_identity, self.commands, error))
                raise
        deadline = time.monotonic() + 5
        remaining = survivors(alive)
        while remaining and time.monotonic() < deadline:
            time.sleep(0.1)
            remaining = survivors(remaining)
        for process in remaining:
            if process.status() != self.psutil.STATUS_ZOMBIE:
                records.append({"pid": process.pid, "state": "survived"})
        (self.evidence / ("cleanup-" + uuid.uuid4().hex + ".json")).write_text(json.dumps(records, indent=2) + "\n")
        assert not records, records

    def close(self) -> None:
        cleanup_error = None
        try:
            self.cleanup()
        except Exception as error:
            cleanup_error = error
        self.done.set()
        join_error = None
        try:
            self.thread.join(timeout=2)
        except Exception as error:
            join_error = observation_receipt("thread.join", os.getpid(), None, self.commands, error)
        thread_alive = self.thread.is_alive()
        observer_state = getattr(self, "observer_state", {"started": False, "completed": False, "failed": False, "failure": None})
        closures = []
        for child, record in self.processes:
            native = child.poll()
            if record["native_exit"] is None:
                record["native_exit"] = native
            if native is not None:
                closures.append({"pid": child.pid, "create_time": record.get("create_time"),
                    "native_exit": native, "label": record["label"], "closure_source": "retained-Popen.poll"})
        still_listening = []
        for port in self.listeners:
            with socket.socket() as probe:
                probe.settimeout(0.3)
                if probe.connect_ex(("127.0.0.1", port)) == 0:
                    still_listening.append(port)
        (self.evidence / "listener-cleanup.json").write_text(json.dumps({"observed_ports": sorted(self.listeners), "still_listening": still_listening}) + "\n")
        reconciliation = reconcile_observations(self.observation_errors, closures)
        (self.evidence / "owned-processes.json").write_text(json.dumps({"pid_create_time": self.owned,
            "observation_errors": self.observation_errors, "observation_reconciliation": reconciliation,
            "observer_state": observer_state, "observer_join_error": join_error, "observer_thread_alive": thread_alive,
            "native_closures": closures, "cleanup_error": None if cleanup_error is None else {
                "type": type(cleanup_error).__name__, "message": str(cleanup_error)},
            "sampling_interval_seconds": 0.1}, indent=2) + "\n")
        if cleanup_error is not None:
            raise cleanup_error
        assert not still_listening, still_listening
        assert join_error is None, join_error
        assert thread_alive is False, "observation thread did not close"
        assert (isinstance(observer_state, dict) and observer_state.get("started") is True
                and observer_state.get("completed") is True and observer_state.get("failed") is False
                and observer_state.get("failure", "not-recorded") is None), "observer did not complete successfully"
        unresolved = [item for item in reconciliation if item["resolution"] == "unresolved"]
        assert not unresolved, unresolved


def api(commands: NativeCommands, endpoint: str, outside: Path, env: dict[str, str], label: str) -> dict:
    # API JSON is a separate receipt; command logs never contain an authentication header.
    result = commands.run(["gh", "api", endpoint], outside, env, label)
    assert result == 0
    return json.loads(Path(commands.commands[-1]["log"]).read_text())


def public_inputs(commands: NativeCommands, source: Path, outside: Path, env: dict[str, str], evidence: Path) -> Path:
    repo = "repos/TexasOct/jev-gateway"
    run = api(commands, f"{repo}/actions/runs/{RUN}", outside, env, "producer-run")
    assert (run["head_sha"], run["run_attempt"], run["status"], run["conclusion"], run["event"]) == (SOURCE, 1, "completed", "success", "push")
    assert run["path"] == ".github/workflows/release.yml"
    jobs = api(commands, f"{repo}/actions/runs/{RUN}/attempts/1/jobs?per_page=100", outside, env, "producer-jobs")
    assert jobs["total_count"] == 4
    assert {job["id"] for job in jobs["jobs"]} == {113946724342, 113948340254, 113948340289, 113949025253}
    assert all(job["conclusion"] == "success" and job["status"] == "completed" for job in jobs["jobs"])
    tag = api(commands, f"{repo}/git/ref/tags/v0.1.3", outside, env, "tag-ref")
    assert tag["object"]["type"] == "tag" and tag["object"]["sha"] == TAG_OBJECT
    annotation = api(commands, f"{repo}/git/tags/{TAG_OBJECT}", outside, env, "annotated-tag")
    assert annotation["tag"] == "v0.1.3" and annotation["object"] == {"type": "commit", "sha": SOURCE, "url": f"https://api.github.com/{repo}/git/commits/{SOURCE}"}
    release = api(commands, f"{repo}/releases/tags/v0.1.3", outside, env, "public-release")
    latest = api(commands, f"{repo}/releases/latest", outside, env, "latest-release")
    assert release["id"] == latest["id"] == RELEASE
    assert release["tag_name"] == latest["tag_name"] == "v0.1.3"
    assert not release["draft"] and not release["prerelease"]
    assert release["published_at"] == "2026-10-09T17:46:02Z"
    assert {asset["name"] for asset in release["assets"]} == set(ASSETS)
    files = evidence / "public-assets"
    files.mkdir()
    for asset in release["assets"]:
        name = asset["name"]
        identity, size, checksum = ASSETS[name]
        assert asset["id"] == identity and asset["size"] == size and asset["state"] == "uploaded"
        assert asset["digest"] == "sha256:" + checksum
        expected_url = f"https://github.com/TexasOct/jev-gateway/releases/download/v0.1.3/{name}"
        assert asset["browser_download_url"] == expected_url
        with urllib.request.urlopen(expected_url, timeout=60) as response:
            data = response.read(size + 1)
        path = files / name
        path.write_bytes(data)
        assert len(data) == size and digest(path) == checksum, name
    with urllib.request.urlopen("https://github.com/TexasOct/jev-gateway/releases/latest/download/install.sh", timeout=60) as response:
        latest_installer = response.read(10216)
    (files / "latest-install.receipt").write_bytes(latest_installer)
    assert latest_installer == (files / "install.sh").read_bytes()
    for name in ("install.sh", "jev_gateway-0.1.3-py3-none-any.whl"):
        assert (files / (name + ".sha256")).read_bytes() == (digest(files / name) + "  " + name + "\n").encode()
    assert (files / "install.sh").read_bytes() == (source / "scripts/install.sh").read_bytes().replace(b"__JEV_RELEASE_TAG__", b"v0.1.3")
    artifact = api(commands, f"{repo}/actions/artifacts/{ARTIFACT}", outside, env, "producer-artifact-metadata")
    assert artifact["name"] == "release-assets" and not artifact["expired"]
    assert artifact["workflow_run"]["id"] == RUN and artifact["workflow_run"]["head_sha"] == SOURCE
    artifact_digest_gate(artifact)
    commands.run(["gh", "api", f"{repo}/actions/artifacts/{ARTIFACT}/zip"], outside, env, "producer-artifact-zip", timeout=120)
    archive_path = Path(commands.commands[-1]["log"])
    assert digest(archive_path) == ARTIFACT_SHA
    with zipfile.ZipFile(archive_path) as archive:
        names = [name for name in archive.namelist() if not name.endswith("/")]
        assert set(names) == set(ASSETS) and len(names) == 4
        for name in names:
            assert archive.read(name) == (files / name).read_bytes()
    return files


def browser_identities(report: dict) -> list[tuple[str, tuple[str, ...], str]]:
    identities = []

    def visit(suites: list[dict], parents: tuple[str, ...] = ()) -> None:
        for suite in suites:
            chain = parents + (suite["title"],)
            for spec in suite.get("specs", []):
                for test in spec["tests"]:
                    identities.append((spec["file"], chain + (spec["title"],), test.get("projectName", "")))
            visit(suite.get("suites", []), chain)
    visit(report["suites"])
    return sorted(identities)


def browser_results(report: dict) -> list[dict]:
    tests = []

    def visit(suites: list[dict]) -> None:
        for suite in suites:
            for spec in suite.get("specs", []):
                for test in spec["tests"]:
                    tests.append({"file": spec["file"], "title": spec["title"], "status": test["status"],
                                  "results": [{"status": result["status"], "retry": result["retry"]} for result in test["results"]]})
            visit(suite.get("suites", []))
    visit(report["suites"])
    return tests


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--expected-source", required=True)
    parser.add_argument("--producer-run", type=int, required=True)
    args = parser.parse_args()
    assert (args.tag, args.expected_source, args.producer_run) == ("v0.1.3", SOURCE, RUN)
    assert os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted", "hosted execution only"
    source = args.source.resolve(strict=True)
    work = args.work_dir.resolve()
    prep = Path(__file__).resolve().parents[2]
    assert work.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    assert not work.is_relative_to(source) and not work.is_relative_to(prep)
    assert not work.exists(), "preserve previous attempts; choose a fresh work-dir"
    work.mkdir(mode=0o700)
    evidence = work / "evidence"
    evidence.mkdir(mode=0o700)
    outside = work / "outside"
    outside.mkdir()
    env = dict(os.environ)
    for name in list(env):
        if name.startswith("JEV_") or name in {"PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "UV_PROJECT_ENVIRONMENT", "UV_PYTHON_PREFERENCE"}:
            del env[name]
    env.update(HOME=str(work / "user-home"), XDG_CONFIG_HOME=str(work / "config"),
               XDG_CACHE_HOME=str(work / "cache"), UV_CACHE_DIR=str(work / "cache/uv"),
               UV_TOOL_DIR=str(work / "tools"), UV_TOOL_BIN_DIR=str(work / "bin"),
               XDG_STATE_HOME=str(work / "state"), UV_PYTHON_INSTALL_DIR=str(work / "python"),
               TMPDIR=str(work / "tmp"), PYTHONDONTWRITEBYTECODE="1", LITELLM_LOCAL_MODEL_COST_MAP="True",
               NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost", PYTEST_DISABLE_PLUGIN_AUTOLOAD="1")
    for name in ("HOME", "TMPDIR", "UV_TOOL_BIN_DIR"):
        Path(env[name]).mkdir(parents=True)
    commands = NativeCommands(evidence)
    checks: list[str] = []
    success = False
    services: list[tuple[subprocess.Popen, dict]] = []

    def check(condition: bool, name: str) -> None:
        assert condition, name
        checks.append(name)
        (evidence / "ordered-checks.json").write_text(json.dumps(checks, indent=2) + "\n")

    def interrupted(number: int, _frame) -> None:
        raise RuntimeError(f"hosted cancellation signal {number}")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        commands.run(["git", "rev-parse", "HEAD"], source, env, "signed-source-head")
        check(Path(commands.commands[-1]["log"]).read_text().strip() == SOURCE, "signed-source HEAD")
        commands.run(["git", "status", "--porcelain"], source, env, "signed-source-status")
        check(Path(commands.commands[-1]["log"]).read_bytes() == b"", "signed-source clean")
        commands.run(["git", "rev-parse", "HEAD"], prep, env, "preparation-head")
        preparation_head = Path(commands.commands[-1]["log"]).read_text().strip()
        inputs = [source / relative for relative in ("frontend/package.json", "frontend/package-lock.json", "frontend/playwright.config.ts", "uv.lock", "scripts/smoke-installed-release.py", "scripts/install.sh")]
        for directory in ("tests", "frontend/tests", "frontend/src", "docs"):
            inputs.extend(path for path in (source / directory).rglob("*") if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc")
        inputs.extend(path for path in Path(__file__).parent.iterdir() if path.is_file())
        inputs.append(prep / ".github/workflows/public-installed-013.yml")
        (evidence / "input-manifest.json").write_text(json.dumps({"source": SOURCE, "preparation_head": preparation_head,
            "files": [{"path": str(path), "sha256": digest(path), "size": path.stat().st_size,
                       "mode": oct(path.stat().st_mode & 0o777)} for path in sorted(set(inputs))]}, indent=2) + "\n")
        files = public_inputs(commands, source, outside, env, evidence)
        check(True, "producer/tag/public/latest four-asset byte identity")
        env.pop("GH_TOKEN", None)
        env.pop("GITHUB_TOKEN", None)
        wheel = files / "jev_gateway-0.1.3-py3-none-any.whl"
        real_uv = shutil.which("uv")
        assert real_uv
        observer = work / "observer"
        observer.mkdir()
        shim = observer / "uv"
        shutil.copyfile(Path(__file__).with_name("observe_uv.py"), shim)
        shim.chmod(0o755)
        env.update(PUBLIC_ACCEPT_REAL_UV=real_uv, PUBLIC_ACCEPT_EVIDENCE=str(evidence),
                   PUBLIC_ACCEPT_PROBE=str(Path(__file__).with_name("provenance.py")),
                   PUBLIC_ACCEPT_FORBIDDEN=json.dumps([str(source), str(prep)]),
                   PATH=str(observer) + os.pathsep + env["PATH"])
        commands.run(["sh", str(files / "install.sh"), "--no-uv", "--home", str(work / "runtime home with spaces")], outside, env, "public-initial-install")
        prefix = work / "tools/jev-gateway"
        python = prefix / "bin/python"
        origins = sorted(evidence.glob("install-*-origin.json"))
        check(len(origins) == 1, "initial full origin/package/static/RECORD receipt")
        package = Path(json.loads(origins[0].read_text())["module_origin"]).parent
        helper = work / "test-helper"
        scope = prepare(source, helper, package, python, evidence)
        commands.run([sys.executable, str(helper / "smoke.py"), "--wheel", str(wheel), "--version", "0.1.3", "--installer", str(files / "install.sh"), "--work-dir", str(work / "original smoke")], outside, env, "original-public-installer-smoke", timeout=1800)
        smoke = json.loads((work / "original smoke/evidence/checks.json").read_text())
        check(smoke["success"] and smoke["installer_sha256"] == ASSETS["install.sh"][2], "original public installer smoke native success")
        shutil.copytree(work / "original smoke/evidence", evidence / "original-smoke")
        check(len(list(evidence.glob("install-*-origin.json"))) == 4, "initial and all three original smoke installations attest full parity")
        commands.run([real_uv, "pip", "install", "--python", str(python), "pytest==9.1.1"], outside, env, "installed-test-dependency")
        commands.run([str(python), "-I", str(Path(__file__).with_name("provenance.py")), "--wheel", str(wheel), "--prefix", str(prefix),
                      "--forbid", str(source), "--forbid", str(prep), "--wheel-ctime-ns", str(json.loads(origins[0].read_text())["wheel_ctime_ns"]),
                      "--output", str(evidence / "test-dependency-origin.json")], outside, env, "test-dependency-full-origin")
        env.update(PUBLIC_ACCEPT_PYTHON=str(python), PUBLIC_ACCEPT_PACKAGE=str(package), PUBLIC_ACCEPT_HELPER=str(helper),
                   JEV_REAL_BACKEND_RECORD_DIR=str(evidence / "real-backend"))
        Path(env["JEV_REAL_BACKEND_RECORD_DIR"]).mkdir()
        entries = Path(__file__).with_name("pytest_entry.py")
        commands.run([str(python), "-I", str(entries), "--helper", str(helper), "--output", str(evidence / "backend-collection.json"), "--collect"], outside, env, "installed-backend-collection", timeout=180)
        backend_status = commands.run([str(python), "-I", str(entries), "--helper", str(helper), "--output", str(evidence / "backend-results.json")], outside, env, "installed-backend-business", timeout=1800, required=False)
        backend = json.loads((evidence / "backend-results.json").read_text())
        collection = json.loads((evidence / "backend-collection.json").read_text())
        check(backend_status == 0 and collection["exitstatus"] == 0, "first backend native exit and collection")
        first_pass = backend_gate(backend, collection["collected"])
        check(True, "first backend executed identities and only exact original capture skips")
        # Node dependencies serve the test harness only. No Vite build or source server is admitted.
        frontend = helper / "frontend"
        commands.run(["node", "--version"], outside, env, "node-pin")
        check(Path(commands.commands[-1]["log"]).read_text().strip() == "v22.23.3", "Node 22.23.3")
        commands.run(["npm", "--version"], outside, env, "npm-pin")
        check(Path(commands.commands[-1]["log"]).read_text().strip() == "11.16.0", "npm 11.16.0")
        lock_before = digest(frontend / "package-lock.json")
        commands.run(["npm", "install"], frontend, env, "browser-harness-dependencies", timeout=600)
        check(digest(frontend / "package-lock.json") == lock_before, "original frontend lock unchanged")
        commands.run([str(frontend / "node_modules/.bin/tsc"), "-p", "tests/tsconfig.json"], frontend, env, "browser-types", timeout=180)
        commands.run([str(frontend / "node_modules/.bin/playwright"), "install", "chromium"], frontend, env, "browser-install", timeout=600)
        shutil.copyfile(Path(__file__).with_name("browser.config.ts"), frontend / "installed.config.ts")
        browser_evidence = evidence / "browser"
        browser_evidence.mkdir()
        env["PUBLIC_ACCEPT_BROWSER_EVIDENCE"] = str(browser_evidence)
        for mode in ("listing", "live", "default"):
            state = work / (mode + "-state.json")
            home = work / (mode + " home with spaces")
            service, record = commands.launch([str(python), "-I", str(Path(__file__).with_name("serve.py")), "--helper", str(helper), "--mode", mode, "--home", str(home), "--state", str(state)], outside, env, mode + "-fixture")
            services.append((service, record))
            deadline = time.monotonic() + 30
            while not state.exists() and service.poll() is None and time.monotonic() < deadline:
                time.sleep(0.1)
            check(state.exists() and service.poll() is None, mode + " fixture native readiness")
            fixture = json.loads(state.read_text())
            commands.listeners.add(int(fixture["url"].rsplit(":", 1)[1]))
            if mode == "listing":
                env["PUBLIC_ACCEPT_ORIGIN"] = fixture["url"]
            else:
                env["JEV_CREDENTIAL_" + mode.upper() + "_URL"] = fixture["url"]
                env["JEV_CREDENTIAL_" + mode.upper() + "_HOME"] = str(home)
        playwright = str(frontend / "node_modules/.bin/playwright")
        commands.run([playwright, "test", "-c", "playwright.config.ts", "--list", "--reporter=json"], frontend, env, "original-browser-identities", timeout=120)
        original_collection = json.loads(Path(commands.commands[-1]["log"]).read_text())
        commands.run([playwright, "test", "-c", "installed.config.ts", "--list", "--reporter=json"], frontend, env, "installed-browser-identities", timeout=120)
        installed_collection = json.loads(Path(commands.commands[-1]["log"]).read_text())
        check(browser_identities(original_collection) == browser_identities(installed_collection), "original and installed browser identities equal")
        check(len(browser_identities(installed_collection)) == 646, "646 installed application cases distinct from nine source-only cloud cases")
        browser_status = commands.run([playwright, "test", "-c", "installed.config.ts"], frontend, env, "installed-browser-business", timeout=3600, required=False)
        native_tests = frontend / "tests/installed-specific"
        native_tests.mkdir()
        shutil.copyfile(Path(__file__).with_name("native-credentials.spec.ts"), native_tests / "native-credentials.spec.ts")
        native_config = frontend / "native.config.ts"
        shutil.copyfile(Path(__file__).with_name("native.config.ts"), native_config)
        shutil.copyfile(Path(__file__).with_name("native-tsconfig.json"), frontend / "native-tsconfig.json")
        credential_server = helper / "tests/fixtures/installed-credential-server.py"
        shutil.copyfile(Path(__file__).with_name("credential_server.py"), credential_server)
        env["PUBLIC_ACCEPT_CREDENTIAL_SERVER"] = str(credential_server)
        commands.run([str(frontend / "node_modules/.bin/tsc"), "-p", "native-tsconfig.json"], frontend, env, "installed-native-types", timeout=180)
        native_status = commands.run([playwright, "test", "-c", "native.config.ts"], frontend, env, "installed-native-credential-business", timeout=1200, required=False)
        native_report = json.loads((browser_evidence / "native-report.json").read_text())
        native_results = browser_results(native_report)
        check(len(native_results) == 24, "24 actual installed primary/AWS/Vertex native cases distinct from original application suite")
        original_config = source / "frontend/playwright.config.ts"
        check(digest(original_config) == digest(frontend / "playwright.config.ts"), "original browser owner bytes untouched")
        (evidence / "derived-configurations.json").write_text(json.dumps({
            "original_owner_sha256": digest(original_config),
            "copied_owner_sha256": digest(frontend / "playwright.config.ts"),
            "reversal_sha256": digest(frontend / "playwright.config.ts"),
            "reversal": "Remove only the derived installed/native configuration files; original owner remains byte-identical.",
            "generated": [{"path": str(path.relative_to(helper)), "sha256": digest(path), "mode": oct(path.stat().st_mode & 0o777)}
                          for path in [frontend / "installed.config.ts", native_config, frontend / "native-tsconfig.json", credential_server]],
        }, indent=2) + "\n")
        env["JEV_BROWSER_CAPTURE_DIR"] = env["JEV_REAL_BACKEND_RECORD_DIR"]
        replay_status = commands.run([str(python), "-I", str(entries), "--helper", str(helper), "--output", str(evidence / "browser-capture-replay.json"),
                                      "--test", "tests/test_browser_capture_replay.py"], outside, env, "installed-browser-capture-replay", timeout=180, required=False)
        report = json.loads((browser_evidence / "report.json").read_text())
        results = browser_results(report)
        check(browser_identities(report) == browser_identities(original_collection), "executed browser identity set complete")
        check(all(all(result["retry"] == 0 for result in test["results"]) for test in results), "original browser retry-zero preserved")
        backend = json.loads((evidence / "backend-results.json").read_text())
        collection = json.loads((evidence / "backend-collection.json").read_text())
        check(backend["collected"] == collection["collected"], "installed backend collection/execution identity parity")
        replay = json.loads((evidence / "browser-capture-replay.json").read_text())
        check(replay_status == 0, "capture replay native exit")
        replay_summary = backend_gate(replay, sorted(CAPTURE_NODES), replay=True)
        (evidence / "scope-results.json").write_text(json.dumps({"backend_cases": len(backend["collected"]), "backend_native_exit": backend_status,
            "backend_first_pass": first_pass, "browser_capture_replay": replay_summary,
            "backend_skips": [item for item in backend["reports"] if item["outcome"] == "skipped"],
            "browser_cases": len(results), "browser_native_exit": browser_status, "browser_results": results,
            "native_credential_cases": len(native_results), "native_credential_exit": native_status,
            "browser_capture_replay_exit": replay_status,
            "standalone_cloud": scope["standalone_cloud"], "sealed_historical": scope["sealed_historical"]}, indent=2) + "\n")
        for service, record in services:
            service.terminate()
            record["native_exit"] = service.wait(timeout=20)
        commands.flush()
        services.clear()
        before = json.loads(origins[0].read_text())
        commands.run(["sh", str(files / "install.sh"), "--no-uv", "--home", str(work / "runtime home with spaces")], outside, env, "public-repeat-install")
        current = list(evidence.glob("install-*-origin.json"))
        check(len(current) == 5, "all five public installs retain full origin/parity receipts")
        for path in current:
            value = json.loads(path.read_text())
            check(value["inventory"] == before["inventory"], "repeat full 94-package/42-static/100-wheel-RECORD/99-hashed-row parity " + path.name)
        check(backend_status == 0, "installed backend native result")
        check(native_status == 0 and all(item["status"] == "expected" and item["results"] and all(result["status"] == "passed" and result["retry"] == 0 for result in item["results"]) for item in native_results), "installed native credential result without skips or retries")
        replay = json.loads((evidence / "browser-capture-replay.json").read_text())
        check(replay_status == 0 and len(replay["collected"]) == 2 and not any(item["outcome"] == "skipped" for item in replay["reports"]), "both original optional browser-capture assertions actually replayed")
        check(browser_status == 0 and all(item["status"] == "expected" and item["results"] and all(result["status"] == "passed" for result in item["results"]) for item in results), "installed browser native result without skips")
        commands.run(["git", "status", "--porcelain"], source, env, "final-signed-source-status")
        check(Path(commands.commands[-1]["log"]).read_bytes() == b"", "signed source remains clean")
        success = True
        return 0
    except Exception as error:
        (evidence / "failure.json").write_text(json.dumps({"type": type(error).__name__, "message": str(error)}, indent=2) + "\n")
        print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    finally:
        try:
            commands.close()
        except Exception as error:
            success = False
            (evidence / "cleanup-failure.json").write_text(json.dumps({"type": type(error).__name__, "message": str(error)}) + "\n")
        commands.flush()
        manifest = [{"path": str(path.relative_to(evidence)), "size": path.stat().st_size,
                     "sha256": digest(path), "mode": oct(path.stat().st_mode & 0o777)}
                    for path in sorted(evidence.rglob("*")) if path.is_file()]
        (evidence / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (evidence / "result.json").write_text(json.dumps({"success": success, "tag": args.tag, "source": SOURCE,
            "producer_run": RUN, "checks": checks, "scope": "hosted installed public acceptance; independent review required"}, indent=2) + "\n")
        if not success:
            # A cleanup failure must fail the command even after successful business assertions.
            raise SystemExit(1)


if __name__ == "__main__":
    raise SystemExit(main())
