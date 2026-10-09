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
