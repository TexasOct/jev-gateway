"""Validate preparation without importing or launching the product."""
from __future__ import annotations

import ast
import argparse
import base64
import copy
import difflib
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
from typing import cast


def negative_probes(output: Path) -> list[str]:
    """Exercise real preparation gates on private synthetic receipts, without product imports."""
    import provenance
    import driver

    checks = []
    def rejects(label, operation):
        try:
            operation()
        except (AssertionError, ValueError):
            checks.append(label)
        else:
            raise AssertionError("negative probe admitted: " + label)

    record_name = "jev_gateway-0.1.3.dist-info/RECORD"
    names = [f"jev_gateway/file-{index}" for index in range(99)] + [record_name]
    rows = [[name, "sha256=synthetic", "1"] for name in names[:-1]] + [[record_name, "", ""]]
    provenance.wheel_records(names, rows, record_name)
    rejects("99 total rows rejected", lambda: provenance.wheel_records(names[:-1], rows[:-1], record_name))
    changed = copy.deepcopy(rows)
    changed[0][0] = "unexpected-member"
    rejects("100 rows with wrong membership rejected", lambda: provenance.wheel_records(names, changed, record_name))
    changed = copy.deepcopy(rows)
    changed[0][1:] = ["", ""]
    rejects("incorrect hashed-row count rejected", lambda: provenance.wheel_records(names, changed, record_name))
    changed = copy.deepcopy(rows)
    changed[0][0] = changed[1][0]
    rejects("duplicate wheel RECORD member rejected", lambda: provenance.wheel_records(names, changed, record_name))

    prefix = output / "synthetic-owned-prefix"
    location = prefix / "lib/site-packages"
    location.mkdir(parents=True)
    outside = output / "synthetic-outside"
    outside.mkdir()
    (outside / "file").write_bytes(b"outside")
    rejects("escaped dependency location rejected", lambda: provenance.dependency_receipts([
        type("Distribution", (), {"locate_file": lambda self, name: outside})()], prefix))
    class Distribution:
        metadata = {"Name": "synthetic"}
        version = "0"
        files = [outside / "file"]
        def locate_file(self, name):
            return location / name
        def read_text(self, name):
            return None
    rejects("escaped dependency RECORD path rejected", lambda: provenance.dependency_receipts([Distribution()], prefix))
    Distribution.files = []
    assert provenance.dependency_receipts([Distribution()], prefix)[0]["origin_status"] == "absent-direct-url-origin"
    product = location / "jev_gateway/example.py"
    product.parent.mkdir()
    product.write_bytes(b"synthetic source bytes; never imported")
    record = location / record_name
    record.parent.mkdir()
    record.write_bytes(b"synthetic RECORD bytes")
    data = product.read_bytes()
    encoded = "sha256=" + base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
    installed_rows = [["jev_gateway/example.py", encoded, str(len(data))], [record_name, "", ""]]
    assert len(provenance.installed_files(location, prefix, installed_rows, [row[0] for row in installed_rows], record_name, set())) == 2
    escape = str(outside / "file")
    rejects("escaped installed addition rejected", lambda: provenance.installed_files(location, prefix,
        installed_rows + [[escape, "", ""]], [row[0] for row in installed_rows], record_name, set()))
    extra = location / "unclassified"
    extra.write_bytes(b"unexpected")
    rejects("unclassified installed addition rejected", lambda: provenance.installed_files(location, prefix,
        installed_rows + [["unclassified", "", ""]], [row[0] for row in installed_rows], record_name, set()))
    wrong = copy.deepcopy(installed_rows)
    wrong[0][2] = "0"
    rejects("incorrect installed size rejected", lambda: provenance.installed_files(location, prefix, wrong,
        [row[0] for row in installed_rows], record_name, set()))
    wrong = copy.deepcopy(installed_rows)
    wrong[0][1] = "sha256=incorrect"
    rejects("incorrect installed hash rejected", lambda: provenance.installed_files(location, prefix, wrong,
        [row[0] for row in installed_rows], record_name, set()))
    wrong = copy.deepcopy(installed_rows)
    wrong[0][1:] = ["", ""]
    rejects("unhashed product file rejected", lambda: provenance.installed_files(location, prefix, wrong,
        [row[0] for row in installed_rows], record_name, set()))
    rejects("unrecorded expected entrypoint rejected", lambda: provenance.installed_files(location, prefix,
        installed_rows, [row[0] for row in installed_rows], record_name, {"synthetic-command"}))
    metadata_extra = record.parent / "unexpected-metadata"
    metadata_extra.write_bytes(b"not recorded")
    rejects("unrecorded metadata rejected", lambda: provenance.installed_files(location, prefix,
        installed_rows, [row[0] for row in installed_rows], record_name, set()))
    metadata_extra.unlink()
    linked = product.parent / "escaped-link"
    linked.symlink_to(outside / "file")
    rejects("symlink escaping product ownership rejected", lambda: provenance.installed_files(location, prefix,
        installed_rows, [row[0] for row in installed_rows], record_name, set()))
    linked.unlink()
    driver.artifact_digest_gate({"digest": "sha256:" + driver.ARTIFACT_SHA})
    rejects("wrong service digest rejected", lambda: driver.artifact_digest_gate({"digest": "sha256:" + "0" * 64}))
    ordinary = "tests/synthetic.py::test_case"
    identities = [ordinary, *sorted(driver.CAPTURE_NODES)]
    reports = [{"nodeid": node, "when": phase, "outcome": "passed", "skip_reason": None}
               for node in identities for phase in ("setup", "call", "teardown")]
    report = {"exitstatus": 0, "collected": identities, "reports": reports}
    driver.backend_gate(report, identities)
    def skip_case(node, reason):
        changed = copy.deepcopy(report)
        call = next(item for item in changed["reports"] if item["nodeid"] == node and item["when"] == "call")
        call.update(outcome="skipped", skip_reason=reason)
        return changed
    capture = sorted(driver.CAPTURE_NODES)[0]
    authentic = skip_case(capture, driver.CAPTURE_SKIP_REASON)
    for node in driver.CAPTURE_NODES:
        next(item for item in authentic["reports"] if item["nodeid"] == node and item["when"] == "call").update(
            outcome="skipped", skip_reason=driver.CAPTURE_SKIP_REASON)
    authentic_summary = driver.backend_gate(authentic, identities)
    assert authentic_summary["skipped_count"] == 2 and authentic_summary["executed_call_count"] == 3
    assert authentic_summary["passed_call_count"] == 1
    def phase_reject(label, changed):
        rejects(label, lambda: driver.backend_gate(changed, identities))
    setup_only = copy.deepcopy(report)
    setup_only["reports"] = [item for item in setup_only["reports"] if item["nodeid"] != capture or item["when"] != "call"]
    next(item for item in setup_only["reports"] if item["nodeid"] == capture and item["when"] == "setup").update(
        outcome="skipped", skip_reason=driver.CAPTURE_SKIP_REASON)
    phase_reject("prior setup-only fake receipt rejected", setup_only)
    for phase in ("setup", "teardown"):
        changed = skip_case(capture, driver.CAPTURE_SKIP_REASON)
        next(item for item in changed["reports"] if item["nodeid"] == capture and item["when"] == "call").update(
            outcome="passed", skip_reason=None)
        next(item for item in changed["reports"] if item["nodeid"] == capture and item["when"] == phase).update(
            outcome="skipped", skip_reason=driver.CAPTURE_SKIP_REASON)
        phase_reject(f"{phase}-phase capture skip rejected", changed)
    for phase in ("setup", "teardown"):
        changed = skip_case(capture, driver.CAPTURE_SKIP_REASON)
        next(item for item in changed["reports"] if item["nodeid"] == capture and item["when"] == phase)["outcome"] = "failed"
        phase_reject(f"capture {phase} failure rejected", changed)
    for phase in ("setup", "call", "teardown"):
        changed = copy.deepcopy(authentic)
        changed["reports"] = [item for item in changed["reports"] if item["nodeid"] != capture or item["when"] != phase]
        phase_reject(f"capture missing {phase} rejected", changed)
    changed = copy.deepcopy(authentic)
    changed["reports"].append(copy.deepcopy(next(item for item in changed["reports"] if item["nodeid"] == capture and item["when"] == "call")))
    phase_reject("duplicate capture call rejected", changed)
    changed = copy.deepcopy(authentic)
    changed["reports"].append({"nodeid": capture, "when": "unexpected", "outcome": "passed", "skip_reason": None})
    phase_reject("extra capture phase rejected", changed)
    changed = copy.deepcopy(authentic)
    changed["reports"].append({"nodeid": "tests/unknown.py::test_case", "when": "call", "outcome": "skipped", "skip_reason": driver.CAPTURE_SKIP_REASON})
    phase_reject("unknown executed capture identity rejected", changed)
    changed = copy.deepcopy(authentic)
    changed["exitstatus"] = 1
    phase_reject("nonzero first-pass exit rejected", changed)
    changed = copy.deepcopy(authentic)
    changed["collected"] = changed["collected"][:-1]
    phase_reject("collection/execution identity mismatch rejected", changed)
    (output / "capture-phase-probes.json").write_text(json.dumps({
        "authentic_call_phase_receipt": authentic, "accepted_summary": authentic_summary,
        "prior_setup_only_receipt": setup_only, "prior_setup_only_result": "rejected",
        "product_imports": False,
    }, indent=2) + "\n")
    rejects("unexpected first-pass skip rejected", lambda: driver.backend_gate(skip_case(ordinary, driver.CAPTURE_SKIP_REASON), identities))
    rejects("wrong capture skip reason rejected", lambda: driver.backend_gate(skip_case(sorted(driver.CAPTURE_NODES)[0], "Skipped: unrelated"), identities))
    replay = {"exitstatus": 0, "collected": sorted(driver.CAPTURE_NODES),
              "reports": [item for item in reports if item["nodeid"] in driver.CAPTURE_NODES]}
    driver.backend_gate(replay, sorted(driver.CAPTURE_NODES), replay=True)
    rejects("extra replay identity rejected", lambda: driver.backend_gate(report, identities, replay=True))
    skipped_replay = skip_case(sorted(driver.CAPTURE_NODES)[0], driver.CAPTURE_SKIP_REASON)
    skipped_replay["collected"] = sorted(driver.CAPTURE_NODES)
    skipped_replay["reports"] = [item for item in skipped_replay["reports"] if item["nodeid"] in driver.CAPTURE_NODES]
    rejects("capture replay skip rejected", lambda: driver.backend_gate(skipped_replay, sorted(driver.CAPTURE_NODES), replay=True))
    wrong = copy.deepcopy(replay)
    wrong["reports"] = wrong["reports"][:-1]
    rejects("incomplete executed phase set rejected", lambda: driver.backend_gate(wrong, sorted(driver.CAPTURE_NODES), replay=True))
    (output / "negative-probes.json").write_text(json.dumps({"rejected": checks, "product_imports": False}, indent=2) + "\n")
    return checks


def runtime_repair_probes(output: Path) -> list[str]:
    """Pure synthetic metadata, failed-observer and observation-history checks."""
    import provenance
    import observe_uv
    import driver
    import types
    from unittest import mock
    checks = []
    def rejects(label, operation):
        try:
            operation()
        except (AssertionError, ValueError):
            checks.append(label)
        else:
            raise AssertionError("repair negative admitted: " + label)
    base = output / "runtime-synthetic"
    prefix = base / "jev-gateway"
    location = prefix / "lib/site-packages"
    metadata = location / "jev_gateway-0.1.3.dist-info"
    metadata.mkdir(parents=True)
    record_name = "jev_gateway-0.1.3.dist-info/RECORD"
    (location / record_name).write_text("synthetic original RECORD bytes\n")
    cache = metadata / "uv_cache.json"
    ctime = 1700000000123456789
    valid = {"timestamp": {"secs_since_epoch": 1700000000, "nanos_since_epoch": 123456789},
             "commit": None, "tags": None, "env": {}, "directories": {}}
    cache.write_text(json.dumps(valid, separators=(",", ":")))
    cache.chmod(0o600)
    def rows():
        data = cache.read_bytes()
        encoded = "sha256=" + base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
        return [[record_name, "", ""], [str(cache.relative_to(location)), encoded, str(len(data))]]
    def classify(record_rows=None):
        return provenance.installed_files(location, prefix, rows() if record_rows is None else record_rows,
            [record_name], record_name, set(), ctime)
    accepted = classify()
    assert accepted[1]["category"] == "uv-0.13.0-local-wheel-cache"
    snapshot = provenance.capture_diagnostics(location, prefix, base / "valid-diagnostics")
    assert snapshot["complete"] and (base / "valid-diagnostics/raw/uv_cache.json").read_bytes() == cache.read_bytes()
    cache_entry = next(item for item in snapshot["inventory"] if Path(item["path"]).name == "uv_cache.json")
    assert cache_entry["mode"] == "0o600" and cache_entry["stat_mode"] == oct(cache.lstat().st_mode)
    for label, value in [("extra cache field", {**valid, "unexpected": True}),
                         ("wrong timestamp", {**valid, "timestamp": {"secs_since_epoch": 0, "nanos_since_epoch": 0}}),
                         ("nonlocal cache fields", {**valid, "env": {"EXTRA": "value"}}),
                         ("boolean timestamp", {**valid, "timestamp": {"secs_since_epoch": True, "nanos_since_epoch": 0}})]:
        cache.write_text(json.dumps(value))
        rejects(label, classify)
    cache.write_bytes(b'{"timestamp":')
    rejects("malformed cache JSON", classify)
    cache.write_bytes(b'{"timestamp":null,"timestamp":null}')
    rejects("duplicate cache JSON keys", classify)
    cache.write_text(json.dumps(valid, separators=(",", ":")))
    rejects("cache requires input timestamp binding", lambda: provenance.uv_cache_metadata(cache.read_bytes(), None))
    rejects("unexpected cache serialization", lambda: provenance.uv_cache_metadata(json.dumps(valid).encode(), ctime))
    wrong = rows(); wrong[1][1] = "sha256=wrong"
    rejects("cache RECORD hash mismatch", lambda: classify(wrong))
    wrong = rows(); wrong[1][2] = "0"
    rejects("cache RECORD size mismatch", lambda: classify(wrong))
    rejects("unrecorded cache metadata", lambda: classify([[record_name, "", ""]]))
    cache.unlink()
    inside = prefix / "cache-alias"
    inside.write_text(json.dumps(valid, separators=(",", ":")))
    cache.symlink_to(inside)
    rejects("cache metadata symlink", classify)
    cache.unlink()
    outside = base / "outside-cache"
    outside.write_text(json.dumps(valid, separators=(",", ":")))
    cache.symlink_to(outside)
    rejects("cache metadata escaped path", classify)
    rejects("diagnostic escaped metadata", lambda: provenance.capture_diagnostics(location, prefix, base / "escaped-diagnostics"))
    assert json.loads((base / "escaped-diagnostics/inventory.json").read_text())["complete"] is False
    cache.unlink()
    cache.write_text(json.dumps({**valid, "unexpected": True}))
    class Distribution:
        def locate_file(self, name):
            return location / name
    def synthetic_attest(*args):
        return {"installed_inventory": classify()}
    modeled_commands = []
    observer_output = base / "observer"
    observer_output.mkdir()
    def modeled_run(command, **kwargs):
        modeled_commands.append(command)
        if len(modeled_commands) == 1:
            return types.SimpleNamespace(returncode=0)
        with mock.patch.object(sys, "argv", ["provenance.py", *command[3:]]), \
             mock.patch.object(provenance.importlib.metadata, "distribution", return_value=Distribution()), \
             mock.patch.object(provenance, "attest", side_effect=synthetic_attest):
            try:
                provenance.main()
            except AssertionError:
                return types.SimpleNamespace(returncode=1)
        raise AssertionError("malformed cache probe unexpectedly passed")
    receipt = {"argv": ["tool", "install", "synthetic.whl"], "wheel_ctime_ns": ctime}
    with mock.patch.dict("os.environ", {"PUBLIC_ACCEPT_REAL_UV": "/synthetic/uv", "UV_TOOL_DIR": str(prefix.parent),
                        "PUBLIC_ACCEPT_PROBE": "synthetic-provenance.py", "PUBLIC_ACCEPT_FORBIDDEN": "[]"}):
        result = observe_uv.forward(receipt["argv"], receipt, base / "synthetic.whl", observer_output, "modeled", modeled_run)
    assert result == 1 and receipt["uv_native_exit"] == 0 and receipt["attestation"]["native_exit"] == 1
    assert receipt["overall_exit"] == 1 and not (observer_output / "modeled-origin.json").exists()
    partial = Path(receipt["attestation"]["partial_diagnostics"])
    assert (partial / "raw/RECORD").read_bytes() == (location / record_name).read_bytes()
    assert (partial / "raw/uv_cache.json").read_bytes() == cache.read_bytes()
    assert json.loads((partial / "failure.json").read_text())["status"] == "failed-attestation"
    checks.append("modeled uv exit 0 plus failed probe exit 1 retains partial bytes and overall 1")
    class AccessDenied(Exception):
        pass
    class Process:
        pid = 2553
        def create_time(self): return 123.0
        def net_connections(self, **kwargs): raise AccessDenied("synthetic denied connection observation")
        def children(self, **kwargs): return [self]
    class Done:
        calls = 0
        def wait(self, delay):
            self.calls += 1
            return self.calls > 1
    commands = [{"pid": 2553, "create_time": 123.0, "label": "synthetic-command", "argv": ["synthetic"], "cwd": "/synthetic", "native_exit": None}]
    observer = types.SimpleNamespace(done=Done(), psutil=types.SimpleNamespace(Process=Process, AccessDenied=AccessDenied,
        NoSuchProcess=type("NoSuchProcess", (Exception,), {})), owned={}, lock=__import__("threading").Lock(),
        commands=commands, observation_errors=[], listeners=set())
    driver.NativeCommands.observe(observer)
    error = observer.observation_errors[0]
    assert error["operation"] == "net_connections(kind=tcp)" and error["create_time"] == 123.0
    assert error["commands_snapshot"][0]["label"] == "synthetic-command"
    closure = {"pid": 2553, "create_time": 123.0, "native_exit": 0, "closure_source": "retained-Popen.poll"}
    unresolved = driver.reconcile_observations([error], [])
    reconciled = driver.reconcile_observations([error], [closure])
    assert unresolved[0]["resolution"] == "unresolved" and reconciled[0]["resolution"] == "owned-native-exit"
    assert reconciled[0]["error"] == error
    for wrong in [{**closure, "create_time": 124.0}, {**closure, "native_exit": None}, {**closure, "closure_source": "inspection-failure"}]:
        assert driver.reconcile_observations([error], [wrong])[0]["resolution"] == "unresolved"
    assert driver.reconcile_observations([{**error, "create_time": None}], [closure])[0]["resolution"] == "unresolved"
    assert driver.reconcile_observations([error], [{**closure, "pid": 2559}])[0]["resolution"] == "unresolved"
    assert driver.reconcile_observations([error], [closure, closure])[0]["resolution"] == "unresolved"
    class DeniedIdentity(Process):
        def create_time(self): raise AccessDenied("synthetic denied identity")
    observer.done = Done()
    observer.psutil.Process = DeniedIdentity
    driver.NativeCommands.observe(observer)
    denied_identity = observer.observation_errors[-1]
    assert denied_identity["operation"] == "create_time" and denied_identity["create_time"] is None
    assert driver.reconcile_observations([denied_identity], [closure])[0]["resolution"] == "unresolved"
    for label, native in [("unresolved", None), ("resolved", 0)]:
        close_output = base / (label + "-close")
        close_output.mkdir()
        child = types.SimpleNamespace(pid=2553, poll=lambda value=native: value)
        command = {"native_exit": None, "create_time": 123.0, "label": "synthetic-command"}
        modeled_close = types.SimpleNamespace(cleanup=lambda: None, done=types.SimpleNamespace(set=lambda: None),
            thread=types.SimpleNamespace(join=lambda **kwargs: None, is_alive=lambda: False),
            observer_state={"started": True, "completed": True, "failed": False, "failure": None},
            processes=[(child, command)], listeners=set(), owned={2553: 123.0},
            evidence=close_output, observation_errors=[error])
        if native is None:
            rejects("unresolved observation still fails close", lambda: driver.NativeCommands.close(modeled_close))
        else:
            driver.NativeCommands.close(modeled_close)
        saved = json.loads((close_output / "owned-processes.json").read_text())
        assert saved["observation_errors"] == [error]
        assert saved["observation_reconciliation"][0]["resolution"] == ("unresolved" if native is None else "owned-native-exit")
    checks.append("operation/context retained; only exact owned native closure reconciles; raw history preserved")
    (output / "runtime-repair-probes.json").write_text(json.dumps({"checks": checks, "valid_schema": valid,
        "accepted_metadata_receipt": accepted, "modeled_uv_and_probe": receipt, "modeled_commands": modeled_commands,
        "observation_error": error, "denied_identity": denied_identity, "unresolved": unresolved, "reconciled": reconciled,
        "mode": "pure-synthetic; no actual uv/product/process execution"}, indent=2) + "\n")
    return checks


def boundary_probes(output: Path) -> list[dict]:
    """Exercise metadata aliases, lazy enumeration and actual observer/close methods on fakes."""
    import provenance
    import driver
    import types
    import threading
    from unittest import mock
    base = output / "boundary-synthetic"
    base.mkdir()
    results = []
    payload = json.dumps({"timestamp": {"secs_since_epoch": 1700000000, "nanos_since_epoch": 123456789},
        "commit": None, "tags": None, "env": {}, "directories": {}}, separators=(",", ":")).encode()
    record_name = "jev_gateway-0.1.3.dist-info/RECORD"
    def hashed(name, data):
        return [name, "sha256=" + base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode(), str(len(data))]
    def reject(label, action):
        try:
            action()
        except (AssertionError, RuntimeError, ValueError) as error:
            results.append({"case": label, "result": "rejected", "type": type(error).__name__, "message": str(error)})
        else:
            raise AssertionError("boundary unexpectedly admitted: " + label)
    original_open = Path.open
    for alias in ("dist-info-root", "location-root", "location-intermediate", "metadata-intermediate"):
        prefix = base / alias
        location = prefix / "lib/site-packages"
        metadata = location / "jev_gateway-0.1.3.dist-info"
        metadata.mkdir(parents=True)
        (metadata / "RECORD").write_bytes(b"private owned RECORD")
        (metadata / "uv_cache.json").write_bytes(payload)
        foreign = prefix / "other-owned-directory"
        foreign.mkdir()
        (foreign / "RECORD").write_bytes(b"private synthetic unrelated RECORD")
        (foreign / "uv_cache.json").write_bytes(payload)
        rows = [[record_name, "", ""], hashed("jev_gateway-0.1.3.dist-info/uv_cache.json", payload)]
        names = [record_name]
        if alias == "dist-info-root":
            shutil.rmtree(metadata)
            metadata.symlink_to(foreign, target_is_directory=True)
        elif alias == "location-root":
            moved = prefix / "real-site-packages"
            location.rename(moved)
            location.symlink_to(moved, target_is_directory=True)
        elif alias == "location-intermediate":
            moved = prefix / "real-lib"
            (prefix / "lib").rename(moved)
            (prefix / "lib").symlink_to(moved, target_is_directory=True)
        else:
            (foreign / "licence").write_bytes(b"foreign synthetic licence")
            (metadata / "nested").symlink_to(foreign, target_is_directory=True)
            names.append("jev_gateway-0.1.3.dist-info/nested/licence")
            rows.append(hashed(names[-1], b"foreign synthetic licence"))
        reads = []
        def tracked_open(path, mode="r", *args, **kwargs):
            if "r" in mode and path.resolve().is_relative_to(foreign):
                reads.append(str(path))
            return original_open(path, mode, *args, **kwargs)
        target = base / (alias + "-diagnostics")
        with mock.patch.object(Path, "open", tracked_open):
            reject(alias + " capture", lambda: provenance.capture_diagnostics(location, prefix, target))
            reject(alias + " classification", lambda: provenance.installed_files(location, prefix, rows, names, record_name, set(), 1700000000123456789))
            if alias == "metadata-intermediate":
                dotted = rows[:-1] + [hashed("./" + names[-1], b"foreign synthetic licence")]
                reject("dot-spelled intermediate alias classification", lambda: provenance.installed_files(location, prefix, dotted, [record_name], record_name, set(), 1700000000123456789))
        assert reads == [], ("aliased foreign bytes read", reads)
        saved = json.loads((target / "inventory.json").read_text())
        assert saved["complete"] is False and "capture_error" in saved
        if alias == "dist-info-root":
            assert not (target / "raw").exists()
        results.append({"case": alias + " no foreign reads", "result": "passed", "reads": reads})
    # A lexical platform alias above the trusted prefix remains permitted.
    actual = base / "real-parent"
    actual.mkdir()
    platform = base / "platform-alias"
    platform.symlink_to(actual, target_is_directory=True)
    trusted = platform / "prefix"
    metadata = trusted / "lib/jev_gateway-0.1.3.dist-info"
    metadata.mkdir(parents=True)
    (metadata / "RECORD").write_bytes(b"owned platform-alias RECORD")
    assert provenance.owned_metadata_path(metadata, trusted) == metadata.resolve()
    assert provenance.owned_metadata_path(metadata.resolve(), trusted) == metadata.resolve()
    assert provenance.capture_diagnostics(metadata.parent, trusted, base / "platform-diagnostics")["complete"]
    results.append({"case": "trusted platform lexical/resolved spellings", "result": "passed"})
    # One iterator advertises arbitrarily many entries, without creating that tree.
    metadata = actual / "prefix/lib/jev_gateway-0.1.3.dist-info"
    marker = metadata / "marker"
    marker.write_bytes(b"synthetic marker")
    counters = {"consumed": 0, "closed": False}
    class Entries:
        def __enter__(self): return self
        def __exit__(self, *args): counters["closed"] = True
        def __iter__(self): return self
        def __next__(self):
            counters["consumed"] += 1
            assert counters["consumed"] <= 600, "instrumented traversal failed to stop"
            return types.SimpleNamespace(path=str(marker), is_dir=lambda **kwargs: False)
    with mock.patch.object(provenance.os, "scandir", lambda path: Entries()):
        reject("lazy enumeration limit", lambda: list(provenance.metadata_entries(metadata, actual / "prefix")))
    assert counters == {"consumed": 513, "closed": True}
    results.append({"case": "instrumented enumeration bound", "result": "passed", **counters})
    counters.update(consumed=0, closed=False)
    streamed = base / "streamed-limit-diagnostics"
    with mock.patch.object(provenance.os, "scandir", lambda path: Entries()):
        reject("capture streaming entry limit", lambda: provenance.capture_diagnostics(metadata.parent, actual / "prefix", streamed))
    assert counters == {"consumed": 512, "closed": True}
    saved = json.loads((streamed / "inventory.json").read_text())
    assert saved["complete"] is False and (streamed / "raw/RECORD").is_file()
    results.append({"case": "instrumented capture stops/closes and retains RECORD", "result": "passed", **counters})
    class AccessDenied(Exception): pass
    class NoSuchProcess(Exception): pass
    class Done:
        calls = 0
        def wait(self, delay):
            self.calls += 1
            return self.calls > 1
        def set(self): pass
    class Child:
        pid = 77
        def create_time(self): return 3.0
        def net_connections(self, **kwargs): raise ValueError("synthetic unexpected connection failure")
    class Root:
        def children(self, **kwargs): return []
    class FatalRoot:
        def children(self, **kwargs): raise RuntimeError("synthetic unexpected child-discovery failure")
    class OtherFatalRoot:
        def children(self, **kwargs): return [Child()]
    for label, root_type in [("normal-stop", Root), ("fatal-discovery", FatalRoot), ("fatal-connection", OtherFatalRoot)]:
        evidence = base / label
        evidence.mkdir()
        obj = types.SimpleNamespace(done=Done(), psutil=types.SimpleNamespace(Process=root_type,
            AccessDenied=AccessDenied, NoSuchProcess=NoSuchProcess), commands=[{"pid": 77, "label": "synthetic-command"}],
            owned={}, lock=threading.Lock(), listeners=set(), observation_errors=[], evidence=evidence)
        if label == "normal-stop":
            driver.NativeCommands.observe(obj)
            assert obj.observer_state == {"started": True, "completed": True, "failed": False, "failure": None}
        else:
            reject(label + " observe", lambda: driver.NativeCommands.observe(obj))
            assert obj.observer_state["failed"] and not obj.observer_state["completed"]
            expected = "children(recursive=True)" if label == "fatal-discovery" else "net_connections(kind=tcp)"
            assert obj.observer_state["failure"]["operation"] == expected
            assert (evidence / "observer-state.json").is_file()
        obj.cleanup = lambda: None
        obj.thread = types.SimpleNamespace(join=lambda **kwargs: None, is_alive=lambda: False)
        obj.processes = [(types.SimpleNamespace(pid=77, poll=lambda: 0), {"native_exit": None, "create_time": 3.0, "label": "synthetic-command"})]
        if label == "normal-stop":
            driver.NativeCommands.close(obj)
            results.append({"case": label + " close", "result": "passed"})
        else:
            reject(label + " close despite native closure", lambda: driver.NativeCommands.close(obj))
        saved = json.loads((evidence / "owned-processes.json").read_text())
        assert saved["observer_state"] == obj.observer_state
    for label in ("unknown-completion", "live-thread"):
        evidence = base / label
        evidence.mkdir()
        obj = types.SimpleNamespace(cleanup=lambda: None, done=types.SimpleNamespace(set=lambda: None),
            thread=types.SimpleNamespace(join=lambda **kwargs: None, is_alive=lambda: label == "live-thread"),
            processes=[], listeners=set(), owned={}, evidence=evidence, observation_errors=[], commands=[])
        if label == "live-thread":
            obj.observer_state = {"started": True, "completed": True, "failed": False, "failure": None}
        reject(label + " close", lambda: driver.NativeCommands.close(obj))
        assert (evidence / "owned-processes.json").exists()
    (output / "boundary-probes.json").write_text(json.dumps({"results": results,
        "mode": "pure synthetic file boundaries/fake process objects; no real threads, scans or signals"}, indent=2) + "\n")
    return results


def smoke_diagnostic_probes(output: Path) -> list[dict]:
    """Exercise the actual driver retention seam with files and fake commands only."""
    import driver
    from unittest import mock
    import types
    results = []
    base = output / "smoke-diagnostic-synthetic"
    base.mkdir()
    extra_secret = "synthetic-store-key-密"
    def setup(label):
        root = base / label
        smoke = root / "original smoke"
        logs = smoke / "evidence"
        logs.mkdir(parents=True)
        home = smoke / ("run-" + "0" * 32) / "runtime home with spaces"
        (home / "logs/nested").mkdir(parents=True)
        (home / "run").mkdir()
        (home / "credentials.json").write_text(json.dumps({"version": 1, "values": {"KEY": extra_secret}}))
        (home / "credentials.json").chmod(0o600)
        (home / ".env").write_text("KEY=synthetic-dotenv-value\n")
        (home / "run/gateway.pid").write_text(json.dumps({"pid": 77, "token": "synthetic-pid-token"}))
        (home / "models.json").write_text(json.dumps({"notes": extra_secret, "api_key": "synthetic-inline-model-key"}))
        state = home.parent / "state/jev-gateway/install.json"
        state.parent.mkdir(parents=True)
        state.write_text(json.dumps({"runtime_dir": str(home)}))
        (home / "jev-records.sqlite3").write_bytes(b"synthetic binary database " + extra_secret.encode())
        (home / "logs/nested/gateway.log").write_text("synthetic-pid-token synthetic-dotenv-value " + extra_secret)
        (logs / "19-command.log").write_text("FAIL repeat command 19 exit 1 " + driver.SMOKE_SECRETS[0] + " " + extra_secret)
        (logs / "checks.json").write_text(json.dumps({"success": False, "installer_sha256": driver.ASSETS["install.sh"][2]}))
        (logs / "nested").mkdir()
        (logs / "nested/18-command.log").write_text("owned nested log")
        evidence = root / "evidence"
        evidence.mkdir()
        return root, smoke, evidence
    class Commands:
        def __init__(self, status, timed_out=False):
            self.commands = []
            self.status = status
            self.timed_out = timed_out
            self.failure = RuntimeError(f"original-public-installer-smoke: native exit {status}, timeout {timed_out}")
        def run(self, argv, outside, env, label, timeout):
            assert timeout == 1800 and label == "original-public-installer-smoke"
            self.commands.append({"argv": argv, "label": label, "pid": 77, "create_time": 3.0,
                                  "native_exit": self.status, "timed_out": self.timed_out})
            if self.status != 0 or self.timed_out:
                raise self.failure
            return self.status
    def run(label, status, timed_out=False, patch=None):
        root, smoke, evidence = setup(label)
        commands = Commands(status, timed_out)
        if patch:
            patch(smoke, evidence)
        bindings = {"source": driver.SOURCE, "hosted_run": "synthetic", "attempt": "1"}
        error = None
        try:
            driver.run_original_smoke(commands, ["synthetic-smoke", "unchanged-argument"], root, {}, smoke, evidence, bindings)
        except RuntimeError as caught:
            error = caught
        if status != 0 or timed_out:
            assert error is commands.failure, "retention masked native primary exception"
        receipt = json.loads((evidence / "original-smoke-retention.json").read_text())
        assert receipt["bindings"]["primary_command"]["native_exit"] == status
        assert receipt["bindings"]["primary_command"]["timed_out"] is timed_out
        results.append({"case": label, "native_exit": status, "timed_out": timed_out,
                        "retention_complete": receipt["complete"], "errors": receipt["errors"], "missing": receipt["missing"],
                        "primary_preserved": error is commands.failure if error else None})
        return smoke, evidence, receipt, error
    for label, status, timeout in [("native-failure", 1, False), ("native-success", 0, False), ("native-timeout", -15, True)]:
        smoke, evidence, receipt, error = run(label, status, timeout)
        assert receipt["complete"] and (error is None if status == 0 else error is not None)
        copied = (evidence / "original-smoke/19-command.log").read_text()
        assert "FAIL repeat command 19 exit 1" in copied and "[redacted]" in copied
        for path in (evidence / "original-smoke").rglob("*"):
            if path.is_file():
                content = path.read_text()
                assert extra_secret not in content and json.dumps(extra_secret)[1:-1] not in content
                assert all(value not in content for value in (*driver.SMOKE_SECRETS, "synthetic-dotenv-value", "synthetic-pid-token", "synthetic-inline-model-key"))
        assert (evidence / "original-smoke/nested/18-command.log").read_text() == "owned nested log"
        assert not list((evidence / "original-smoke").rglob("credentials.json"))
        assert not list((evidence / "original-smoke").rglob("jev-records.sqlite3"))
        cred = next(row for row in receipt["files"] if row["source"].endswith("credentials.json"))
        assert cred["disposition"] == "metadata-only" and cred["source_mode"] == "0o600"
        assert cred["source_sha256"] == hashlib.sha256((smoke / cred["source"]).read_bytes()).hexdigest()
        state = next(row for row in receipt["files"] if row["source"].endswith("state/jev-gateway/install.json"))
        assert state["disposition"] == "metadata-only"
    _, evidence, receipt, error = run("missing-checks", 1, patch=lambda smoke, evidence: (smoke / "evidence/checks.json").unlink())
    assert not receipt["complete"] and "evidence/checks.json" in receipt["missing"]
    assert (evidence / "original-smoke/19-command.log").exists()
    _, _, receipt, error = run("missing-repeat-log", 0, patch=lambda smoke, evidence: (smoke / "evidence/19-command.log").unlink())
    assert not receipt["complete"] and error is not None
    _, _, receipt, _ = run("missing-source-evidence", 1, patch=lambda smoke, evidence: shutil.rmtree(smoke / "evidence"))
    assert not receipt["complete"] and receipt["errors"]
    def alias(smoke, evidence):
        moved = smoke / "foreign-evidence"
        (smoke / "evidence").rename(moved)
        (smoke / "evidence").symlink_to(moved, target_is_directory=True)
    _, evidence, receipt, _ = run("root-alias", 1, patch=alias)
    assert not receipt["complete"] and not (evidence / "original-smoke/19-command.log").exists()
    def intermediate(smoke, evidence):
        moved = smoke / "foreign-nested"
        (smoke / "evidence/nested").rename(moved)
        (smoke / "evidence/nested").symlink_to(moved, target_is_directory=True)
    _, _, receipt, _ = run("intermediate-alias", 1, patch=intermediate)
    assert not receipt["complete"] and receipt["errors"]
    original_open = Path.open
    def fail_copy(path, mode="r", *args, **kwargs):
        if mode == "xb" and path.name == "19-command.log":
            raise OSError("synthetic copy failure")
        return original_open(path, mode, *args, **kwargs)
    with mock.patch.object(Path, "open", fail_copy):
        _, evidence, receipt, _ = run("copy-failure", 1)
    assert not receipt["complete"] and receipt["errors"] and (evidence / "original-smoke-retention-error.json").exists()
    def oversize(smoke, evidence):
        with (smoke / "evidence/19-command.log").open("wb") as stream:
            stream.truncate(10 * 1024 * 1024 + 1)
    _, _, receipt, _ = run("file-bound", 1, patch=oversize)
    assert not receipt["complete"] and receipt["errors"]
    # Instrument the bounded traversal without constructing a large tree.
    root, smoke, evidence = setup("entry-bound")
    actual = driver.metadata_entries
    def too_many(directory, prefix):
        if directory == smoke / "evidence":
            for _ in range(513):
                yield directory / "19-command.log"
        else:
            yield from actual(directory, prefix)
    with mock.patch.object(driver, "metadata_entries", too_many):
        receipt = driver.retain_smoke(smoke, evidence, {})
    assert not receipt["complete"] and len(receipt["files"]) <= 513
    results.append({"case": "combined entry bound", "result": "rejected", "retention_complete": receipt["complete"]})
    root, smoke, evidence = setup("total-bound")
    large = smoke / "evidence/large.log"
    with large.open("wb") as stream:
        stream.truncate(8 * 1024 * 1024)
    def repeated_large(directory, prefix):
        if directory == smoke / "evidence":
            for _ in range(5):
                yield large
        else:
            yield from actual(directory, prefix)
    with mock.patch.object(driver, "metadata_entries", repeated_large):
        receipt = driver.retain_smoke(smoke, evidence, {})
    assert not receipt["complete"] and receipt["read_bytes"] <= 32 * 1024 * 1024
    results.append({"case": "combined byte/read bound", "result": "rejected", "read_bytes": receipt["read_bytes"]})
    # A retention-receipt write failure must retain the exact primary exception in memory.
    root, smoke, evidence = setup("receipt-write-failure")
    commands = Commands(1)
    def fail_receipt(path, mode="r", *args, **kwargs):
        if "w" in mode and path.name == "original-smoke-retention.json":
            raise OSError("synthetic receipt failure")
        return original_open(path, mode, *args, **kwargs)
    with mock.patch.object(Path, "open", fail_receipt):
        try:
            driver.run_original_smoke(commands, ["synthetic"], root, {}, smoke, evidence, {})
        except RuntimeError as error:
            assert error is commands.failure
        else:
            raise AssertionError("lost original failure")
    assert (evidence / "original-smoke-retention-error.json").exists()
    results.append({"case": "retention receipt write failure", "result": "primary preserved/fallback receipt"})
    root, smoke, evidence = setup("unsupported-file-type")
    original_lstat = Path.lstat
    def nonregular(path, *args, **kwargs):
        info = original_lstat(path, *args, **kwargs)
        if path == smoke / "evidence/19-command.log":
            import stat
            return types.SimpleNamespace(st_mode=stat.S_IFIFO | 0o600, st_size=info.st_size,
                                         st_mtime_ns=info.st_mtime_ns, st_ctime_ns=info.st_ctime_ns)
        return info
    with mock.patch.object(Path, "lstat", nonregular):
        receipt = driver.retain_smoke(smoke, evidence, {})
    assert not receipt["complete"] and not (evidence / "original-smoke/19-command.log").exists()
    results.append({"case": "nonregular type before read", "result": "rejected"})
    root, smoke, evidence = setup("launch-error-no-exit")
    failure = OSError("synthetic launch error")
    class NoLaunch:
        commands = [{"label": "previous-command", "native_exit": 0}]
        def run(self, *args, **kwargs): raise failure
    try:
        driver.run_original_smoke(NoLaunch(), ["synthetic"], root, {}, smoke, evidence, {})
    except OSError as caught:
        assert caught is failure
    else:
        raise AssertionError("lost launch error")
    receipt = json.loads((evidence / "original-smoke-retention.json").read_text())
    assert receipt["bindings"]["primary_command"] is None
    results.append({"case": "launch error leaves native exit unknown", "result": "primary preserved; previous exit excluded"})
    error = {"pid": 77, "create_time": 3.0}
    closure = {"pid": 77, "create_time": 3.0, "native_exit": 0, "closure_source": "retained-Popen.poll"}
    assert driver.reconcile_observations([error], [closure])[0]["resolution"] == "owned-native-exit"
    for label, closures in [
        ("PID reuse", [dict(closure, create_time=4.0)]), ("wrong birth", [dict(closure, create_time=2.0)]),
        ("missing birth", [dict(closure, create_time=None)]), ("null exit", [dict(closure, native_exit=None)]),
        ("unrelated closure", [dict(closure, pid=78)]), ("duplicate closure", [closure, dict(closure)]),
        ("parent exit is insufficient", [dict(closure, pid=76)]), ("no nested closure", [])]:
        assert driver.reconcile_observations([error], closures)[0]["resolution"] == "unresolved"
        results.append({"case": label, "result": "unresolved"})
    import threading
    class Denied(Exception): pass
    class Gone(Exception): pass
    class Done:
        calls = 0
        def wait(self, delay):
            self.calls += 1
            return self.calls > 1
    class Child:
        pid = 77
        def create_time(self): return 3.0
        def ppid(self): return 76
        def net_connections(self, **kwargs): raise Denied("synthetic TCP denial")
    class Root:
        def children(self, **kwargs): return [Child()]
    observed = types.SimpleNamespace(done=Done(), psutil=types.SimpleNamespace(Process=Root, AccessDenied=Denied, NoSuchProcess=Gone),
        commands=[], owned={}, lock=threading.Lock(), listeners=set(), observation_errors=[])
    driver.NativeCommands.observe(cast(driver.NativeCommands, observed))
    diagnostic = next(iter(observed.process_diagnostics.values()))
    assert diagnostic["observed_ppid"] == 76 and diagnostic["native_exit"] is None
    assert observed.observation_errors[0]["operation"] == "net_connections(kind=tcp)"
    assert driver.reconcile_observations(observed.observation_errors, [dict(closure, pid=76)])[0]["resolution"] == "unresolved"
    results.append({"case": "observed parent diagnostic without exit inference", "result": "unresolved TCP error retained"})
    # The existing boundary group calls the real observe/close methods and still rejects fatal/unknown states.
    (output / "smoke-diagnostic-probes.json").write_text(json.dumps({"mode": "pure fake commands/files; no runtime/threads/scans/signals",
        "results": results, "observer_failure_coverage": "prior25 boundary probes retained"}, indent=2) + "\n")
    return results


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=root / ".trellis/.runtime/public-installed-preparation/static-evidence")
    output = parser.parse_args().output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    sys.dont_write_bytecode = True
    checks = []
    paths = [root / ".github/workflows/public-installed-013.yml", *sorted(Path(__file__).parent.glob("*"))]
    paths = [path for path in paths if path.is_file()]
    for path in paths:
        if path.suffix == ".py":
            ast.parse(path.read_text(), filename=str(path))
        elif path.suffix == ".json":
            json.loads(path.read_text())
    checks.append("All authored Python AST and JSON parsed without product imports")
    spec = importlib.util.spec_from_file_location("static_preparation_adapters", Path(__file__).with_name("adapt.py"))
    assert spec and spec.loader
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    target = output / "helper"
    if target.exists():
        shutil.rmtree(target)
    report = adapter.prepare(root, target, Path("/hosted/installed/site-packages/jev_gateway"), Path("/hosted/installed/bin/python"), output)
    for entry in report["adapters"]:
        before = root / entry["file"] if entry["file"] != "smoke.py" else root / "scripts/smoke-installed-release.py"
        after = target / entry["file"]
        if before.suffix == ".py":
            a = [ast.dump(node, include_attributes=False) for node in ast.walk(ast.parse(before.read_text())) if isinstance(node, ast.Assert)]
            b = [ast.dump(node, include_attributes=False) for node in ast.walk(ast.parse(after.read_text())) if isinstance(node, ast.Assert)]
            assert a == b, entry["file"]
        elif before.name.endswith(".spec.ts"):
            for line in before.read_text().splitlines():
                if "expect(" in line or "test(" in line:
                    assert line in after.read_text(), line
    checks.append("All six adapters match exact source fragments, preserve assertion AST/text, and reverse to original hashes")
    original_server = root / "tests/fixtures/real-gateway/server.py"
    assert original_server.read_bytes() == (target / "tests/fixtures/real-gateway/server.py").read_bytes()
    assert hashlib.sha256((root / "frontend/tests/fixtures/real-backend.ts").read_bytes()).hexdigest() == "888c40d63d49e7d675b886489b51a6d0f1626c8b1616458a0179d0f55e1e0d0b"
    assert not (target / "jev_gateway").exists()
    checks.append("Original listing/socket server copied byte-identically; helper exposes no source jev_gateway directory")
    requirements = json.loads(Path(__file__).with_name("requirements.json").read_text())
    for row in requirements["requirements"]:
        for name in row.get("files", []):
            path = root / name if name.startswith("tests/") else root / "frontend/tests/browser" / name
            assert path.is_file(), path
    checks.append("Every requirement-to-case file reference exists")
    rejected = negative_probes(output)
    checks.append(f"{len(rejected)} pure negative probes reject invalid provenance/digest/backend receipts")
    repair_checks = runtime_repair_probes(output)
    checks.append(f"{len(repair_checks)} pure runtime-repair metadata/observer/observation checks passed")
    boundary_checks = boundary_probes(output)
    checks.append(f"{len(boundary_checks)} focused metadata/traversal/observer boundary checks passed")
    smoke_checks = smoke_diagnostic_probes(output)
    checks.append(f"{len(smoke_checks)} pure smoke retention/strict closure checks passed")
    command_results = []
    commands = [["sh", "-n", str(root / "scripts/install.sh")],
                *[["node", "--check", str(path)] for path in paths if path.suffix == ".ts"],
                ["ruby", "-e", 'require "yaml"; d=YAML.load_file(ARGV[0]); raise "OS owner mismatch" unless d["jobs"]["installed"]["strategy"]["matrix"]["os"] == ["ubuntu-latest", "macos-latest"]; raise "permissions" unless d["permissions"] == {"contents"=>"read", "actions"=>"read"};', str(paths[0])]]
    for index, command in enumerate(commands):
        result = subprocess.run(command, cwd=root, capture_output=True, text=True, check=False)
        (output / f"static-command-{index}.log").write_text(result.stdout + result.stderr)
        command_results.append({"argv": command, "native_exit": result.returncode})
        assert result.returncode == 0, command
    checks.append("Native shell syntax, Node TypeScript syntax and Ruby YAML checks passed")
    # These are added files, so a complete review patch contains every authored byte.
    patch = []
    inventory = []
    for path in paths:
        relative = str(path.relative_to(root))
        content = path.read_text()
        inventory.append({"path": relative, "mode": oct(path.stat().st_mode & 0o777), "size": path.stat().st_size,
                          "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        patch.extend([f"diff --git a/{relative} b/{relative}\n", "new file mode 100644\n"])
        patch.extend(difflib.unified_diff([], content.splitlines(keepends=True), fromfile="/dev/null", tofile="b/" + relative))
    (output / "scoped.patch").write_text("".join(patch))
    (output / "files.json").write_text(json.dumps(inventory, indent=2) + "\n")
    (output / "static-results.json").write_text(json.dumps({"checks": checks, "commands": command_results,
        "backend_file_count": len(report["backend_scope"]),
        "installed_backend_files": sum(row["scope"] == "installed-backend" for row in report["backend_scope"]),
        "full_typecheck": "Not run by static_check.py. Separate private-helper typecheck receipts can use existing read-only dependencies; hosted driver requires both original and supplementary tsc checks.",
        "runtime": "UNRUN", "patch_sha256": hashlib.sha256((output / "scoped.patch").read_bytes()).hexdigest()}, indent=2) + "\n")
    print(json.dumps({"static_checks": len(checks), "native_commands": len(commands), "authored_files": len(inventory), "runtime": "UNRUN"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
