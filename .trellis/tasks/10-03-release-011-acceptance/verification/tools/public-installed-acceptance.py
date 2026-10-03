#!/usr/bin/env python3
"""Accept the verified public installer with isolated or ordinary operator paths."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import shlex
import socket
import subprocess
import sys
from urllib.parse import unquote, urlsplit
from acceptance_common import (clean_environment, digest, private_directory, public_assets,
                               require, snapshot_runtime, verify_installed_package, verify_runtime, write_json)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default="0.1.1")
    parser.add_argument("--assets-manifest", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True, help="fresh private run directory")
    parser.add_argument("--scope", choices=["isolated", "browser", "operator"], required=True)
    parser.add_argument("--operator-home", type=Path, default=Path.home() / ".jev-gateway")
    parser.add_argument("--operator-bin-dir", type=Path, default=Path.home() / ".local/bin")
    parser.add_argument("--operator-tool-dir", type=Path, default=Path.home() / ".local/share/uv/tools")
    parser.add_argument("--owner-cli", type=Path, help="baseline installed owner CLI, if public shims are absent")
    parser.add_argument("--expect-initial-state", choices=["running", "stopped"],
                        help="operator preflight state; refuse if the live state has changed")
    args = parser.parse_args()
    installer, wheel, manifest = public_assets(args.assets_manifest, args.version)
    require(args.work_dir.is_absolute(), "work-dir must be absolute")
    root = private_directory(args.work_dir)
    require(not any(root.iterdir()), "use a fresh installer acceptance directory")
    outside = private_directory(root / "unrelated cwd")
    env = clean_environment()
    operator = args.scope == "operator"
    home = args.operator_home.expanduser().resolve() if operator else root / "runtime home with spaces"
    bins = args.operator_bin_dir.expanduser().resolve() if operator else root / "bin"
    tools = args.operator_tool_dir.expanduser().resolve() if operator else root / "tools"
    if not operator:
        env.update(UV_TOOL_DIR=str(tools), UV_TOOL_BIN_DIR=str(bins), XDG_STATE_HOME=str(root / "state"),
                   UV_PYTHON_INSTALL_DIR=str(root / "python"), UV_CACHE_DIR=str(root / "uv-cache"))
    else:
        # Preserve operator exports, including dotenv interpolation references.
        # Explicit tool paths and --home select the ordinary installation.
        env.update(UV_TOOL_DIR=str(tools), UV_TOOL_BIN_DIR=str(bins))
        env.update({name: value for name, value in os.environ.items()
                    if name.startswith("JEV_") and name not in {"JEV_GATEWAY_HOME", "JEV_INSTALL_DELEGATED_TAG"}})
    env["PATH"] = str(bins) + os.pathsep + env["PATH"]
    public_jev = bins / "jev"
    jev = public_jev
    installed_python = tools / "jev-gateway/bin/python3"
    if operator:
        jev = args.owner_cli.expanduser().absolute() if args.owner_cli else (
            public_jev if public_jev.is_file() else tools / "jev-gateway/bin/jev")
    checks: list[str] = []
    result: dict = {"success": False, "version": args.version, "scope": args.scope,
                    "wheel_sha256": digest(wheel), "installer_sha256": digest(installer), "checks": checks}
    sequence = 0
    initially_running: bool | None = None
    native_initial: dict | None = None
    operator_mutation_started = False
    foreground: subprocess.Popen | None = None
    baseline: dict | None = None
    database = home / "jev-records.sqlite3"
    uv_observer = root / "uv-input-observer"
    def check(condition: bool, name: str) -> None:
        require(condition, name)
        checks.append(name)
        print("PASS " + name, flush=True)

    def command(argv: list[str], name: str, stopped_status: bool = False) -> str:
        nonlocal sequence
        sequence += 1
        completed = subprocess.run(argv, env=env, cwd=outside, capture_output=True, text=True, timeout=300)
        # Operator commands can include credentials or record content in errors.
        # Keep only the exit and label, never arbitrary child output.
        write_json(root / f"command-{sequence:02d}.json", {"name": name, "exit_code": completed.returncode})
        stopped = False
        if stopped_status and completed.returncode == 4:
            payload = json.loads(completed.stdout)
            stopped = payload.get("ok") is False and payload.get("command") == "status" and payload.get("error", {}).get("code") == "not_running"
        require(completed.returncode == 0 or stopped, "installed command failed: " + name)
        return completed.stdout

    def native_owner(label: str) -> dict:
        payload = json.loads(command([str(installed_python), "-I", str(Path(__file__).with_name("native-owner.py")),
                                      "--home", str(home), "--evidence", str(root / (label + "-native-owner.json"))],
                                     "native process ownership"))
        require(payload["state"] in {"running", "stopped"}, "native process ownership unverified")
        return payload

    def cli(*parts: str) -> dict:
        if operator and parts and parts[0] in {"start", "stop", "restart", "config"} and parts not in {
            ("config", "path"), ("config", "validate"),
        }:
            native_owner(f"before-cli-{sequence + 1:02d}")
        payload = json.loads(command([str(jev), "--json", "--home", str(home), *parts],
                                     "CLI " + " ".join(parts), parts == ("status",)))
        if payload.get("error", {}).get("code") == "not_running":
            return {"status": "not_running"}
        require(payload.get("ok") is True, "installed CLI envelope failed")
        return payload["data"]

    def install(no_init: bool = False) -> None:
        nonlocal jev, operator_mutation_started
        if operator:
            current = native_owner("immediately-before-install")
            require(current == native_initial, "operator ownership or initial state changed before install")
            operator_mutation_started = True
        # This executes the downloaded script. Its own checksum-verified public
        # wheel download and automatic restart remain part of the acceptance.
        options = ["--no-init"] if no_init else []
        before_inputs = set(uv_observer.glob("wheel-input-*.json"))
        command(["sh", str(installer), "--version", args.version, "--yes", "--no-uv", "--home", str(home), *options],
                "public installer" + (" no-init" if no_init else " ordinary"))
        captured = set(uv_observer.glob("wheel-input-*.json")) - before_inputs
        check(len(captured) == 1, "public installer supplied one verified wheel to uv")
        observed = json.loads(captured.pop().read_text())
        check(observed["sha256"] == manifest["sha256"][wheel.name],
              "installer uv input matches exact public wheel SHA256")
        result.setdefault("installer_wheel_inputs", []).append({
            key: observed[key] for key in ("filename", "sha256", "size_bytes")
        })
        if operator:
            check(public_jev.is_file() and (bins / "jev-gateway").is_file(), "ordinary installer restores both public shims")
            jev = public_jev

    def installed_identity() -> dict:
        identity = json.loads(command([str(installed_python), "-I", "-c",
            'import sys,json,importlib.metadata as m; d=m.distribution("jev-gateway"); '
            'print(json.dumps({"version":d.version,"python":list(sys.version_info[:2]),'
            '"location":str(d.locate_file("jev_gateway")),"direct_url":json.loads(d.read_text("direct_url.json") or "{}")}))'],
            "installed wheel provenance"))
        check(identity["version"] == args.version and identity["python"] == [3, 12], "installed version and managed Python 3.12")
        source = identity["direct_url"].get("archive_info", {})
        recorded_hash = source.get("hashes", {}).get("sha256", source.get("hash", "").removeprefix("sha256="))
        if recorded_hash:
            check(recorded_hash == manifest["sha256"][wheel.name],
                  "installer installed the verified public wheel SHA256")
        else:
            # uv can omit archive hashes for a local wheel. Join its file URL to
            # the exact bytes observed immediately before the real uv invocation.
            origin = urlsplit(identity["direct_url"].get("url", ""))
            observed_inputs = [json.loads(path.read_text()) for path in uv_observer.glob("wheel-input-*.json")]
            check(origin.scheme == "file" and origin.netloc in {"", "localhost"}
                  and any(Path(unquote(origin.path)).resolve() == Path(observed["input_path"]).resolve()
                          and observed["sha256"] == manifest["sha256"][wheel.name]
                          for observed in observed_inputs),
                  "installer installed the verified public wheel SHA256")
        result["uv_archive_sha256_recorded"] = bool(recorded_hash)
        result["wheel_identity_method"] = "uv archive hash" if recorded_hash else "observed installer input joined to installed file URL"
        check(Path(cli("config", "path")["home"]).resolve() == home, "recorded installation home")
        result["installed_python"] = str(installed_python)
        result["installed_package"] = identity["location"]
        result["package_files_compared"] = verify_installed_package(wheel, Path(identity["location"]))
        check(True, "all installed package files match downloaded public wheel")
        return identity

    def dashboard(status: dict) -> None:
        require(status.get("host") in (None, "127.0.0.1", "localhost", "0.0.0.0", "::1", "::"), "operator service must be locally reachable")
        probe = Path(__file__).with_name("authenticated-dashboard.py")
        payload = json.loads(command([str(installed_python), "-I", str(probe),
                                      "--home", str(home), "--port", str(int(status["port"]))],
                                     "authenticated installed dashboard probe"))
        check(payload.get("success") is True and payload.get("health") == "ok", "installed authenticated health ready")
        check(payload["asset_count"] >= 2, "installed bundled dashboard JS and CSS reachable")

    try:
        require(shutil.which("uv", path=env["PATH"]) is not None, "existing uv required; acceptance never bootstraps uv")
        real_uv = Path(shutil.which("uv", path=env["PATH"]) or "").resolve(strict=True)
        private_directory(uv_observer)
        proxy = uv_observer / "uv"
        proxy.write_text("#!/bin/sh\nexec " + shlex.quote(sys.executable) + " "
                         + shlex.quote(str(Path(__file__).with_name("verified-installer-uv.py"))) + ' "$@"\n')
        proxy.chmod(0o700)
        env.update(JEV_ACCEPTANCE_REAL_UV=str(real_uv), JEV_ACCEPTANCE_WHEEL_NAME=wheel.name,
                   JEV_ACCEPTANCE_WHEEL_SHA256=manifest["sha256"][wheel.name],
                   JEV_ACCEPTANCE_UV_INPUT_DIR=str(uv_observer))
        env["PATH"] = str(uv_observer) + os.pathsep + env["PATH"]
        if operator:
            require(jev.is_file() and installed_python.is_file(), "existing tool-environment owner CLI and Python required")
            native_initial = native_owner("baseline")
            require(args.expect_initial_state is None or native_initial["state"] == args.expect_initial_state,
                    "operator state differs from confirmed preflight")
            cli("doctor")
            cli("config", "validate")
            configured = json.loads((home / "models.json").read_text()).get("storage", {}).get("path", "jev-records.sqlite3")
            database = Path(configured).expanduser()
            database = database.resolve() if database.is_absolute() else (home / database).resolve()
            initial = cli("status")
            initially_running = native_initial["state"] == "running"
            require((initial["status"] == "running") == initially_running, "CLI and native initial service state disagree")
            result["initial_service_state"] = native_initial["state"]
            result["baseline_owner_cli"] = str(jev)
            baseline = snapshot_runtime(home, database, root / "operator-backup")
            install()
            installed_identity()
            cli("doctor")
            cli("config", "validate")
            current = cli("status")
            native_current = native_owner("after-install")
            check((native_current["state"] == "running") == initially_running, "native upgrade preserves initial service state")
            check((current["status"] == "running") == initially_running, "ordinary upgrade preserves initial service state")
            if initially_running:
                check(current["pid"] != initial["pid"], "ordinary running upgrade changes owned PID")
                dashboard(current)
            result["preservation"] = verify_runtime(home, baseline)
            check(True, "operator bytes backups permissions and original typed row multisets preserved")
        else:
            initially_running = False
            install()
            installed_identity()
            if args.scope == "browser":
                check(cli("status")["status"] == "not_running", "browser install leaves managed gateway stopped")
            else:
                document = json.loads((home / "models.json").read_text())
                with socket.socket() as available:
                    available.bind(("127.0.0.1", 0))
                    port = available.getsockname()[1]
                document["gateway"].update(host="127.0.0.1", port=port, api_key_env="JEV_RELEASE_GATEWAY_KEY")
                names: set[str] = set()
                def credential_names(value: object) -> None:
                    if isinstance(value, dict):
                        for key, item in value.items():
                            if key == "api_key_env" and isinstance(item, str):
                                names.add(item)
                            credential_names(item)
                    elif isinstance(value, list):
                        for item in value:
                            credential_names(item)
                credential_names(document)
                (home / "models.json").write_text(json.dumps(document, indent=2) + "\n")
                (home / ".env").write_text("".join(name + "=synthetic-release-acceptance-key\n" for name in sorted(names)))
                (home / ".env").chmod(0o600)
                (home / ".env.backup").write_bytes((home / ".env").read_bytes())
                (home / ".env.backup").chmod(0o600)
                (home / "models.json.bak").write_bytes((home / "models.json").read_bytes())
                (home / "routing-overrides.json").write_text('{"version":1,"strategy":"task_aware","models":{}}\n')
                (home / "dashboard-theme.json").write_text('{"version":1,"seed":"#3b66d9"}\n')
                (home / "routing-canvas-layout.json").write_text('{"version":1,"nodes":{},"viewport":{"x":0,"y":0}}\n')
                cli("doctor")
                cli("config", "validate")
                cli("start", "--wait", "30")
                current = cli("status")
                dashboard(current)
                baseline = snapshot_runtime(home, database, root / "isolated-backup")
                cli("config", "reload")
                cli("restart")
                check(cli("status")["pid"] != current["pid"], "explicit restart changes PID")
                before = cli("status")
                install(no_init=True)
                current = cli("status")
                check(current["status"] == "running" and current["pid"] != before["pid"], "public running reinstall restarts owned gateway")
                dashboard(current)
                verify_runtime(home, baseline)
                cli("stop")
                install(no_init=True)
                check(cli("status")["status"] == "not_running", "public stopped reinstall stays stopped")
                env["JEV_GATEWAY_HOME"] = str(home)
                # The driver owns this foreground child directly. Its output is
                # discarded; commands and synthetic checks have separate evidence.
                foreground = subprocess.Popen([str(bins / "jev-gateway")], env=env, cwd=outside,
                                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                dashboard({"host": "127.0.0.1", "port": port})
                check(foreground.poll() is None, "foreground entry point outside checkout")
                foreground.terminate()
                foreground.wait(timeout=30)
                foreground = None
                result["preservation"] = verify_runtime(home, baseline)
                preserved = {path.name: digest(path) for path in home.iterdir() if path.is_file()
                             and not path.name.endswith(("-wal", "-shm")) and path.name != ".provider-configuration.lock"}
                cli("uninstall", "--dry-run")
                check(jev.exists(), "uninstall preview preserves executable")
                cli("uninstall")
                check(not jev.exists(), "uninstall removes isolated executable")
                check(all((home / name).is_file() and digest(home / name) == value for name, value in preserved.items()),
                      "uninstall preserves configuration credentials overlays backups and database bytes")
        result["success"] = True
    except Exception as error:
        result["error_type"] = type(error).__name__
        if isinstance(error, RuntimeError):
            result["failed_check"] = str(error)
        print("FAIL installer acceptance; inspect private result and command exits", flush=True)
    finally:
        cleanup_ok = True
        try:
            if foreground is not None and foreground.poll() is None:
                foreground.terminate()
                try:
                    foreground.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    foreground.kill()
                    foreground.wait(timeout=10)
            if operator and operator_mutation_started:
                require(jev.is_file() and installed_python.is_file(), "owner CLI unavailable for final state restoration")
            if initially_running is not None and jev.exists() and (not operator or operator_mutation_started):
                if operator:
                    native_owner("before-state-restoration")
                running = cli("status")["status"] == "running"
                if initially_running and not running:
                    cli("start", "--wait", "30")
                elif not initially_running and running:
                    cli("stop")
                check((cli("status")["status"] == "running") == initially_running, "initial running or stopped service state restored")
            if baseline is not None:
                verify_runtime(home, baseline)
        except Exception as error:
            cleanup_ok = False
            result["cleanup_error_type"] = type(error).__name__
        result["cleanup_success"] = cleanup_ok
        result["success"] = result["success"] and cleanup_ok
        write_json(root / "public-installed-result.json", result)
    return 0 if result["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
