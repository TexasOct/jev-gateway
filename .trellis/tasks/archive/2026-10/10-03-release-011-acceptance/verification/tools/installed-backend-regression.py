#!/usr/bin/env python3
"""Run existing routing/API regressions using the installed public wheel package."""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

from acceptance_common import private_directory, public_assets, require, write_json


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-repo", type=Path, required=True)
    parser.add_argument("--installed-python", type=Path, required=True)
    parser.add_argument("--assets-manifest", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    args = parser.parse_args()
    repo = args.source_repo.resolve(strict=True)
    _, wheel, manifest = public_assets(args.assets_manifest, "0.1.1")
    root = private_directory(args.work_dir)
    require(not any(root.iterdir()), "fresh backend regression directory required")
    tests = private_directory(root / "tests")
    names = ["test_decision_matrix.py", "test_routing_overlay.py", "test_canvas_layout.py", "test_gateway.py"]
    hashes = {}
    for name in ["__init__.py", "helpers.py", *names]:
        source = repo / "tests" / name
        shutil.copyfile(source, tests / name)
        hashes[name] = hashlib.sha256(source.read_bytes()).hexdigest()
    (tests / "fixtures").symlink_to(repo / "tests/fixtures", target_is_directory=True)
    original = (repo / "tests/conftest.py").read_text()
    tree = ast.parse(original)
    fixture = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "dashboard_bundle")
    lines = original.splitlines(keepends=True)
    replacement = (
        'def dashboard_bundle() -> Path:\n'
        '    """Use installed public assets without rebuilding the frontend."""\n'
        '    from jev_gateway.dashboard import static_directory\n'
        '    static = static_directory().resolve()\n'
        '    assert "site-packages" in static.parts\n'
        '    return static\n'
    )
    (tests / "conftest.py").write_text("".join(lines[:fixture.lineno - 1]) + replacement + "".join(lines[fixture.end_lineno:]))
    env = os.environ.copy()
    for name in list(env):
        if name.startswith(("JEV_", "PYTEST_")) or name in {"PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"}:
            env.pop(name)
    env.update(PYTEST_DISABLE_PLUGIN_AUTOLOAD="1", PYTHONDONTWRITEBYTECODE="1")
    # pytest is acceptance tooling only; no product package is reinstalled.
    setup = subprocess.run(["uv", "pip", "install", "--python", str(args.installed_python.absolute()), "pytest"],
                           env=env, cwd=root, capture_output=True, text=True)
    (root / "pytest-setup.log").write_text(setup.stdout + setup.stderr)
    require(setup.returncode == 0, "install isolated pytest tooling")
    runner = root / "runner.py"
    runner.write_text('''import hashlib, importlib.metadata, json, pathlib, sys, zipfile
root = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(root))
import jev_gateway, pytest
package = pathlib.Path(jev_gateway.__file__).resolve().parent
assert "site-packages" in package.parts
assert importlib.metadata.version("jev-gateway") == "0.1.1"
wheel = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(wheel) as z:
    files = {n.removeprefix("jev_gateway/"): z.read(n) for n in z.namelist()
             if n.startswith("jev_gateway/") and not n.endswith("/")}
assert all((package / n).read_bytes() == b for n, b in files.items())
(root / "provenance.json").write_text(json.dumps({"package": str(package), "version": "0.1.1",
    "wheel_sha256": hashlib.sha256(wheel.read_bytes()).hexdigest(), "package_files_compared": len(files)}))
resources = root / "jev_gateway"
resources.mkdir()
(resources / "templates").symlink_to(package / "templates", target_is_directory=True)
def no_outbound(event, arguments):
    if event in {"socket.connect", "socket.getaddrinfo"}:
        raise RuntimeError("outbound networking disabled for installed regression")
sys.addaudithook(no_outbound)
raise SystemExit(pytest.main(["-q", "--import-mode=importlib", *sys.argv[2:]]))
''')
    execution = subprocess.run([str(args.installed_python.absolute()), "-I", str(runner), str(wheel),
                                *[str(tests / name) for name in names]], cwd=root, env=env,
                               capture_output=True, text=True)
    output = execution.stdout + execution.stderr
    (root / "pytest.log").write_text(output)
    counts = re.findall(r"(\d+) passed", output)
    result = {"success": execution.returncode == 0 and bool(counts), "exit": execution.returncode,
              "version": "0.1.1", "wheel_sha256": manifest["sha256"][wheel.name],
              "passed": int(counts[-1]) if counts else 0, "source_test_hashes": hashes,
              "fixture_adaptation": "dashboard_bundle returns installed static directory; assertions unchanged",
              "outbound_networking_disabled": True}
    write_json(root / "result.json", result)
    print(json.dumps({key: result[key] for key in ["success", "exit", "passed", "version"]}))
    return 0 if result["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
