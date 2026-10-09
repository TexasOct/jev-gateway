"""Copy signed-source tests and record reversible loader/configuration adapters."""
from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path
import shutil


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
    shutil.copy2(source / "scripts/smoke-installed-release.py", target / "smoke.py")
    replace("smoke.py", [("('uv', 'sh', 'ps', 'uname')", "('uv', 'sh', 'ps', 'uname', 'curl', 'python3', 'mktemp', 'rm')", 1)])
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
    report = {"adapters": adapters, "backend_scope": scope,
              "source_baseline": {"backend_passed": 3209, "backend_optional_skips": 2, "browsers": 655},
              "standalone_cloud": {"scope": "source-only", "cases": 9, "status": "UNRUN"},
              "sealed_historical": {"counts": [126, 110, 9, 18], "status": "UNRUN"}}
    (evidence / "adapters-and-scope.json").write_text(json.dumps(report, indent=2) + "\n")
    return report
