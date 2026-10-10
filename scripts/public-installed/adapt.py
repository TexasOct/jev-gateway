"""Copy signed-source tests and record reversible loader/configuration adapters."""
from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path
import shutil
import public_accept_native as native


SOURCE_ONLY = {
    "test_release_validation.py": "Builds a source wheel and inspects publication workflow/source parity.",
    "test_install_local_script.py": "Inspects Docker and local source installation scripts.",
    "test_install_script.py": "Tests source installer with fake uv/curl assets; original public smoke owns installed lifecycle.",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def prepare(source: Path, target: Path, package: Path, python: Path, evidence: Path) -> dict:
    assert not target.exists()
    target.mkdir()
    shutil.copytree(source / "tests", target / "tests", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.copytree(source / "frontend", target / "frontend", ignore=shutil.ignore_patterns("node_modules", "dist", "test-results", "playwright-report"))
    shutil.copytree(source / "docs", target / "docs")
    spec = target / ".trellis/spec/backend"
    spec.mkdir(parents=True)
    shutil.copyfile(source / ".trellis/spec/backend/provider-configuration.md", spec / "provider-configuration.md")
    adapters = []

    def replace(relative: str, pairs: list[tuple[str, str, int]]) -> None:
        path = target / relative
        before = path.read_bytes()
        text = before.decode()
        for old, new, count in pairs:
            assert text.count(old) == count, (relative, old, text.count(old), count)
            assert new not in text, (relative, new)
            text = text.replace(old, new)
        after = text.encode()
        reverse = text
        for old, new, count in reversed(pairs):
            assert reverse.count(new) == count
            reverse = reverse.replace(new, old)
        assert reverse.encode() == before
        path.write_bytes(after)
        existing = next((entry for entry in adapters if entry["file"] == relative), None)
        if existing is not None:
            existing["after_sha256"] = sha(after)
            existing["replacements"].extend({"before": old, "after": new, "count": count} for old, new, count in pairs)
            combined = text
            for entry in reversed(existing["replacements"]):
                assert combined.count(entry["after"]) == entry["count"]
                combined = combined.replace(entry["after"], entry["before"])
            assert sha(combined.encode()) == existing["before_sha256"]
            existing["reverse_sha256"] = sha(combined.encode())
            return
        adapters.append({"file": relative, "before_sha256": sha(before), "after_sha256": sha(after),
                         "reverse_sha256": sha(reverse.encode()), "mode": oct(path.stat().st_mode & 0o777),
                         "replacements": [{"before": old, "after": new, "count": count} for old, new, count in pairs]})

    template = f'Path({str(package / "templates/models.example.json")!r})'
    replace("tests/conftest.py", [
        ('Path(__file__).resolve().parents[1] / "jev_gateway/templates/models.example.json"', template, 1),
        ('    root = Path(__file__).resolve().parents[1]\n    result = subprocess.run(\n        ["npm", "--prefix", "frontend", "run", "build"], cwd=root,\n        capture_output=True, text=True,\n    )\n    if result.returncode:\n        pytest.fail("Dashboard build failed; run npm --prefix frontend install first.\\n" + result.stdout + result.stderr)\n    return root / "jev_gateway/static"',
         f'    return Path({str(package / "static")!r})', 1)])
    replace("tests/test_cli_templates.py", [
        ('(root / "jev_gateway/templates/models.example.json")', template, 2),
        ('(root / "jev_gateway/templates/env.example")', f'Path({str(package / "templates/env.example")!r})', 1)])
    replace("tests/test_global_defaults.py", [
        ('Path(__file__).resolve().parents[1] / "jev_gateway/templates/models.example.json"', template, 1)])
    replace("frontend/tests/fixtures/real-backend.ts", [
        ('const PYTHON = resolve(REPO_ROOT, ".venv", "bin", "python");', 'const PYTHON = process.env.PUBLIC_ACCEPT_PYTHON!;', 1),
        ('const SERVER = resolve(REPO_ROOT, "tests", "fixtures", "real-gateway", "server.py");', 'const SERVER = resolve(process.env.PUBLIC_ACCEPT_HELPER!, "tests", "fixtures", "real-gateway", "server.py");', 1),
        ('const LISTING = resolve(REPO_ROOT, "tests", "fixtures", "real-gateway", "listing.json");', 'const LISTING = resolve(process.env.PUBLIC_ACCEPT_HELPER!, "tests", "fixtures", "real-gateway", "listing.json");', 1),
        ('const argv = ["-u", SERVER, "--port", String(port), "--scratch", scratch, "--listing", LISTING];',
         'const argv = ["-u", process.env.PUBLIC_ACCEPT_SERVER ?? SERVER, "--port", String(port), "--scratch", scratch, "--listing", LISTING];', 1),
        ('const BUNDLE = resolve(REPO_ROOT, "jev_gateway", "static", "index.html");', 'const BUNDLE = resolve(process.env.PUBLIC_ACCEPT_PACKAGE!, "static", "index.html");', 1),
        ('resolve(REPO_ROOT, "jev_gateway", "static", relative)', 'resolve(process.env.PUBLIC_ACCEPT_PACKAGE!, "static", relative)', 1),
        ('{ cwd: REPO_ROOT, env: { ...process.env, PYTHONPATH: REPO_ROOT, PYTHONDONTWRITEBYTECODE: "1" } }',
         '{ cwd: process.env.PUBLIC_ACCEPT_HELPER!, env: { ...process.env, PYTHONPATH: process.env.PUBLIC_ACCEPT_HELPER!, PYTHONDONTWRITEBYTECODE: "1" } }', 1)])
    replace("frontend/tests/browser/real-backend-contracts.spec.ts", [
        ('resolve(repoRoot(), ".venv", "bin", "python")', 'process.env.PUBLIC_ACCEPT_PYTHON!', 1)])
    replace("frontend/tests/browser/provider-presets.spec.ts", [
        ('execFileSync("uv", ["run", "--no-sync", "--offline", "python", "-B", "-c", `',
         'execFileSync(process.env.PUBLIC_ACCEPT_PYTHON!, ["-I", "-B", "-c", `', 1),
        ('env: { ...process.env, VIRTUAL_ENV: fileURLToPath(new URL("../../../.venv", import.meta.url)), LITELLM_MODE:',
         'env: { ...process.env, LITELLM_MODE:', 1)])
    shutil.copy2(source / "scripts/smoke-installed-release.py", target / "smoke.py")
    replace("smoke.py", [("('uv', 'sh', 'ps', 'uname')", "('uv', 'sh', 'ps', 'uname', 'curl', 'python3', 'mktemp', 'rm', 'grep')", 1)])
    shutil.copyfile(Path(__file__).with_name("public_accept_native.py"), target / "public_accept_native.py")
    native_sites = []
    # Each named call is located in its original full function and replaced once.
    # Reversal remains whole-file, including the seven preceding loader adapters.
    for number in (1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14):
        site = f"s{number:02d}"
        operation, signed_file, function = native.SITE_SOURCE[site]
        relative = "smoke.py" if number <= 3 else signed_file
        path = target / relative
        original = source / signed_file
        original_text = original.read_text()
        original_tree = ast.parse(original_text)
        candidates = [node for node in ast.walk(original_tree) if isinstance(node, ast.FunctionDef)
                      and node.name == function.split(".")[-1]]
        original_function = next(node for node in candidates if any(
            isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
            and isinstance(call.func.value, ast.Name) and call.func.value.id == "subprocess"
            and call.func.attr == operation for call in ast.walk(node)))
        calls = [node for node in ast.walk(original_function) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name)
                 and node.func.value.id == "subprocess" and node.func.attr == operation]
        # Smoke main contains nested command; s02/s03 choose their exact main-level call.
        if number == 3:
            calls = [call for call in calls if call.lineno == 399]
        if number == 2:
            calls = [call for call in calls if call.lineno == 371]
        assert len(calls) == 1, (site, len(calls))
        original_call = ast.get_source_segment(original_text, calls[0])
        assert original_call is not None
        current_text = path.read_text()
        context = f"_native_{site}"
        if operation == "run":
            ordinal = ", command_ordinal=sequence" if number == 1 else ""
            new_call = original_call.replace("subprocess.run(",
                f"_native.run_owned(_native.site_context(_native.current_owner(), {site!r}{ordinal}), ", 1)
            replace(relative, [(original_call, new_call, 1)])
        else:
            new_call = original_call.replace("subprocess.Popen(", f"_native.popen_owned({context}, ", 1)
            lines = current_text.splitlines(keepends=True)
            current_tree = ast.parse(current_text)
            current_call = next(node for node in ast.walk(current_tree) if isinstance(node, ast.Call)
                and ast.get_source_segment(current_text, node) == original_call)
            line = lines[current_call.lineno - 1]
            indent = line[:len(line) - len(line.lstrip())]
            new_line = indent + f"{context} = _native.site_context(_native.current_owner(), {site!r})\n" + line
            replace(relative, [(line, new_line, 1), (original_call, new_call, 1)])
            if number in (5, 6):
                current_text = path.read_text()
                node = next(node for node in ast.walk(ast.parse(current_text)) if isinstance(node, ast.FunctionDef)
                            and node.name == function)
                before_function = ast.get_source_segment(current_text, node)
                assert before_function is not None
                old_close = "    finally:\n        child.terminate()\n        child.wait(timeout=3)"
                new_close = "    finally:\n        try:\n            child.terminate()\n            child.wait(timeout=3)\n        finally:\n            _native.record_close(" + context + ", child, primary=__import__('sys').exception())"
                assert before_function.count(old_close) == 1
                replace(relative, [(before_function, before_function.replace(old_close, new_close), 1)])
            if number == 8:
                old_close = """        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)"""
                new_close = "        finally:\n            try:\n" + "\n".join("    " + line for line in old_close.splitlines()[1:]) + \
                    "\n            finally:\n                _native.record_close(" + context + ", process, primary=sys.exception())"
                replace(relative, [(old_close, new_close, 1)])
        native_sites.append(dict(site_id=site, operation=operation, file=signed_file, function=function,
            original_sha=sha(original.read_bytes()), adapted_sha="", call_sha=sha(original_call.encode()),
            reversal_sha=sha(original.read_bytes())))
    for relative in sorted({"smoke.py", *(site["file"] for site in native_sites if site["site_id"] not in ("s01", "s02", "s03"))}):
        replace(relative, [("from __future__ import annotations\n", "from __future__ import annotations\n\nimport public_accept_native as _native\n", 1)])
    replace("smoke.py", [
        ("    sequence = 0\n", "    sequence = 0\n    _native.load_owner(root.parent / 'evidence/native-owners/smoke/descriptor.json', Path(__file__).with_name('public_accept_native.py'), {'scripts/smoke-installed-release.py': Path(__file__)})\n", 1),
        ("            foreground = None\n", "            _native.record_close(_native_s02, foreground, primary=sys.exception())\n            foreground = None\n", 1),
        ("    raise SystemExit(main())", "    try:\n        raise SystemExit(main())\n    finally:\n        _native.finish_owner(_native.current_owner())", 1)])
    smoke_text = (target / "smoke.py").read_text()
    old_cleanup = """        if foreground is not None and foreground.poll() is None:
            foreground.terminate()
            try:
                foreground.wait(timeout=30)
            except subprocess.TimeoutExpired:
                foreground.kill()
                foreground.wait()"""
    new_cleanup = "        try:\n" + "\n".join("    " + line for line in old_cleanup.splitlines()) + \
        "\n        finally:\n            if foreground is not None:\n                _native.record_close(_native_s02, foreground, primary=sys.exception())"
    replace("smoke.py", [(old_cleanup, new_cleanup, 1)])
    for site in native_sites:
        relative = "smoke.py" if site["site_id"] in ("s01", "s02", "s03") else site["file"]
        site["adapted_sha"] = sha((target / relative).read_bytes())
    scope = []
    for path in sorted((target / "tests").glob("test_*.py")):
        original = source / "tests" / path.name
        functions = [node.name for node in ast.walk(ast.parse(original.read_text()))
                     if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_")]
        scope.append({"file": "tests/" + path.name, "sha256": sha(original.read_bytes()), "test_functions": functions,
                      "scope": "source-only" if path.name in SOURCE_ONLY else "installed-backend",
                      "reason": SOURCE_ONLY.get(path.name, "Active runtime/API/CLI/file/database business assertions; imported product is installed.")})
        if path.name in SOURCE_ONLY:
            path.unlink()
    assert not (target / "jev_gateway").exists()
    for adapter in adapters:
        before = source / adapter["file"] if adapter["file"] != "smoke.py" else source / "scripts/smoke-installed-release.py"
        assert sha(before.read_bytes()) == adapter["before_sha256"]
        adapter["source_mode"] = oct(before.stat().st_mode & 0o777)
        assert adapter["source_mode"] == adapter["mode"]
    report = {"adapters": adapters, "backend_scope": scope, "native_sites": native_sites,
              "source_baseline": {"backend_passed": 3209, "backend_optional_skips": 2, "browsers": 655},
              "standalone_cloud": {"scope": "source-only", "cases": 9, "status": "UNRUN"},
              "sealed_historical": {"counts": [126, 110, 9, 18], "status": "UNRUN"}}
    (evidence / "adapters-and-scope.json").write_text(json.dumps(report, indent=2) + "\n")
    return report
