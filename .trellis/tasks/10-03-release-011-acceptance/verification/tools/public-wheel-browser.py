#!/usr/bin/env python3
"""Derive Playwright configuration and run the full suite on public wheel assets."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

from acceptance_common import (clean_environment, digest, private_directory, public_assets,
                               require, write_json)


SCREENSHOT_SOURCE = 'path: "../.trellis/tasks/10-03-strategy-workflow-canvas-editing/verification/canvas-repaired-draft.png"'
SCREENSHOT_TARGET = 'path: process.env.JEV_PUBLIC_REPAIRED_SCREENSHOT!'


def derive(repo: Path, root: Path, expected_tests: int, workers: int) -> Path:
    source = repo / "frontend"
    playwright = source / "node_modules/@playwright/test/index.mjs"
    require(playwright.is_file(), "installed frontend @playwright/test required")
    original = (source / "playwright.config.ts").read_text()
    require("retries: 0" in original and "forbidOnly: true" in original and "fullyParallel: true" in original,
            "source Playwright policy changed; review derived config")
    require("4178" in original and "reuseExistingServer: false" in original, "source loopback ownership policy changed")
    derived = private_directory(root / "derived-frontend")
    tests = private_directory(derived / "tests")
    browser = private_directory(tests / "browser")
    # A private mirror keeps relative imports and test assertions intact. Source
    # fixtures and UI translations are symlinked, never independently rewritten.
    for target, link in ((source / "node_modules", derived / "node_modules"),
                         (source / "src", derived / "src"),
                         (source / "tests/fixtures", tests / "fixtures"),
                         (source / "tests/setup", tests / "setup")):
        link.symlink_to(target, target_is_directory=True)
    (derived / "tsconfig.json").write_bytes((source / "tsconfig.json").read_bytes())
    (derived / "package.json").write_text('{"type":"module","private":true}\n')
    files = []
    for path in sorted((source / "tests/browser").glob("*.spec.ts")):
        content = path.read_text()
        changes = []
        if path.name == "canvas-connections.spec.ts":
            require(content.count(SCREENSHOT_SOURCE) == 1, "review changed canvas screenshot destination")
            content = content.replace(SCREENSHOT_SOURCE, SCREENSHOT_TARGET)
            changes.append("redirect one historical screenshot destination to this run's durable path")
        (browser / path.name).write_text(content)
        files.append({"source": str(path), "sha256": digest(path), "derived_sha256": digest(browser / path.name), "changes": changes})
    (browser / "fixtures.ts").symlink_to(source / "tests/browser/fixtures.ts")
    results = private_directory(root / "browser-results")
    artifacts = private_directory(results / "artifacts")
    config = root / "playwright.public-wheel.config.mjs"
    config.write_text(f'''import {{ defineConfig, devices }} from {json.dumps(playwright.as_uri())};
export default defineConfig({{
  testDir: {json.dumps(str(browser))},
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: {workers},
  outputDir: {json.dumps(str(artifacts))},
  reporter: [
    ["list"],
    ["json", {{ outputFile: {json.dumps(str(results / "results.json"))} }}],
    ["html", {{ outputFolder: {json.dumps(str(results / "html"))}, open: "never" }}],
  ],
  use: {{
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4178/dashboard/",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {{ args: ["--disable-background-networking", "--disable-component-update",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] }},
  }},
  // The Python driver owns the exact ASGI child and checks its readiness token.
  // No Vite, npm build, webServer reuse, retries or test selection filters.
}});
''')
    write_json(root / "derived-config.json", {"source_config": str(source / "playwright.config.ts"),
               "source_config_sha256": digest(source / "playwright.config.ts"), "tests": files,
               "expected_tests": expected_tests, "retries": 0, "port": 4178,
               "screenshot_redirect": str(results / "canvas-repaired-draft.png")})
    for path in (config, derived / "tsconfig.json", derived / "package.json", *browser.glob("*.spec.ts")):
        path.chmod(0o600)
    return config


def test_cases(value: dict) -> list[dict]:
    found = []
    for suite in value.get("suites", []):
        found.extend(test_cases(suite))
    for spec in value.get("specs", []):
        found.extend(spec.get("tests", []))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default="0.1.1")
    parser.add_argument("--source-repo", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True, help="fresh path under .git/jev-release-011-acceptance")
    parser.add_argument("--assets-manifest", type=Path)
    parser.add_argument("--installed-python", type=Path, help="Python belonging to the public browser install")
    parser.add_argument("--expected-tests", type=int, default=118)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--mode", choices=["prepare", "list", "run"], default="prepare")
    args = parser.parse_args()
    repo = args.source_repo.expanduser().resolve(strict=True)
    root = args.work_dir.expanduser().resolve()
    allowed = (repo / ".git/jev-release-011-acceptance").resolve()
    require(root.is_relative_to(allowed) and root != allowed, "derived configs must be under private release acceptance directory")
    require(args.expected_tests > 0 and args.workers > 0, "positive test count and worker count required")
    if args.mode == "run":
        require(args.assets_manifest is not None and args.installed_python is not None, "public assets and installed Python required")
        public_assets(args.assets_manifest, args.version)
        require(args.installed_python.is_file(), "installed public-wheel Python required")
    private_directory(root)
    require(not any(root.iterdir()), "use a fresh browser evidence directory for each invocation")
    config = derive(repo, root, args.expected_tests, args.workers)
    if args.mode == "prepare":
        print("Prepared " + str(config))
        return 0
    node = shutil.which("node")
    require(node is not None, "existing Node.js required")
    cli = repo / "frontend/node_modules/@playwright/test/cli.js"
    env = clean_environment()
    env.pop("NODE_OPTIONS", None)
    env.update(JEV_PUBLIC_REPAIRED_SCREENSHOT=str(root / "browser-results/canvas-repaired-draft.png"),
               PLAYWRIGHT_HTML_OPEN="never")
    command = [node, str(cli), "test", "--config", str(config)]
    listing = subprocess.run([*command, "--list", "--reporter=json"], cwd=root, env=env,
                             capture_output=True, text=True, timeout=60)
    (root / "discovery.json").write_text(listing.stdout)
    (root / "discovery.stderr.log").write_text(listing.stderr)
    require(listing.returncode == 0, "Playwright discovery failed")
    discovered = json.loads(listing.stdout)
    cases = test_cases(discovered)
    require(len(cases) == args.expected_tests and not discovered.get("errors"), "full browser test count differs from expected")
    require(discovered["config"]["projects"][0]["retries"] == 0, "derived config must have no retries")
    print(f"Discovered all {len(cases)} browser tests; retries=0")
    if args.mode == "list":
        return 0
    result = {"success": False, "version": args.version, "discovered_tests": len(cases),
              "synthetic_apis": True, "retries": 0, "origin": "http://127.0.0.1:4178"}
    process: subprocess.Popen | None = None
    token = uuid.uuid4().hex
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 4178))
        server = Path(__file__).with_name("wheel-dashboard-server.py")
        server_argv = [str(args.installed_python.absolute()), "-I", str(server), "--version", args.version,
                       "--assets-manifest", str(args.assets_manifest.resolve()), "--evidence-dir", str(root), "--token", token]
        # Preserve the venv executable path; resolving its symlink would select
        # the base interpreter and lose the wheel's installed site-packages.
        with (root / "asgi.log").open("wb") as log:
            process = subprocess.Popen(server_argv, cwd=root, env=env, stdout=log, stderr=log)
            deadline = time.monotonic() + 30
            while True:
                require(process.poll() is None, "owned ASGI child exited before readiness")
                try:
                    with opener.open("http://127.0.0.1:4178/__acceptance", timeout=1) as response:
                        ready = json.loads(response.read())
                    require(ready.get("token") == token and ready.get("version") == args.version,
                            "port 4178 is served by an unrelated process")
                    break
                except (OSError, urllib.error.URLError):
                    require(time.monotonic() < deadline, "owned ASGI readiness timeout")
                    time.sleep(0.2)
            with (root / "playwright.log").open("wb") as test_log:
                execution = subprocess.run(command, cwd=root, env=env, stdout=test_log, stderr=test_log, timeout=1800)
            report = json.loads((root / "browser-results/results.json").read_text())
            executed = test_cases(report)
            require(execution.returncode == 0 and len(executed) == args.expected_tests, "full browser regression failed")
            require(not report.get("errors") and all(test.get("status") == "expected" and len(test.get("results", [])) == 1
                    and test["results"][0].get("status") == "passed" for test in executed),
                    "browser regression contains skipped failed or retried tests")
            require(json.loads((root / "escaped-api-requests.json").read_text()) == [], "browser API escaped synthetic fixtures")
            served = json.loads((root / "served-wheel.json").read_text())
            result.update(success=True, executed_tests=len(executed), served_wheel=served)
    except Exception as error:
        result["error_type"] = type(error).__name__
        if isinstance(error, RuntimeError):
            result["failed_check"] = str(error)
        print("FAIL public-wheel browser acceptance; inspect private evidence")
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
        result["owned_asgi_child_stopped"] = process is None or process.poll() is not None
        write_json(root / "browser-result.json", result)
        # Reports and screenshots are retained. Symlinked source files are never
        # traversed while protecting the private evidence permissions.
        for path in root.rglob("*"):
            if not path.is_symlink():
                path.chmod(0o700 if path.is_dir() else 0o600)
    return 0 if result["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
