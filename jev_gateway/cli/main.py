from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Mapping
from importlib.metadata import PackageNotFoundError, version as package_version
from pathlib import Path
from typing import Any

from jev_gateway.cli import config_ops, install_state, process, providers, uninstall
from jev_gateway.cli.health import probe
from jev_gateway.cli.output import CliError, ExitCode, emit
from jev_gateway.cli.paths import RuntimePaths, runtime_paths
from jev_gateway.cli.secrets import obtain_secret
from jev_gateway.config_transaction import ConfigurationRecoveryRequired
from jev_gateway.dashboard import browsable_host
from jev_gateway.initialization import initialize_configuration
from jev_gateway.setup import ManagementSetup, SetupAlreadyConfigured
from jev_gateway.provider_config import RevisionConflict
from jev_gateway.provider_presets import PRESETS


def _package_version() -> str:
    try:
        return package_version("jev-gateway")
    except PackageNotFoundError:
        return "unknown"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="jev")
    parser.add_argument("--home")
    parser.add_argument("--json", action="store_true", dest="json_mode")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--version", action="store_true")
    sub = parser.add_subparsers(dest="group", required=True)
    sub.add_parser("doctor")
    sub.add_parser("status")
    setup = sub.add_parser("setup")
    secret_source = setup.add_mutually_exclusive_group()
    secret_source.add_argument("--secret-env")
    secret_source.add_argument("--secret-stdin", action="store_true")
    start = sub.add_parser("start")
    start.add_argument("--foreground", action="store_true")
    start.add_argument("--wait", type=float, default=10)
    stop = sub.add_parser("stop")
    stop.add_argument("--timeout", type=float, default=10)
    stop.add_argument("--force", action="store_true")
    sub.add_parser("restart")
    sub.add_parser("restart-if-running", help=argparse.SUPPRESS)
    logs = sub.add_parser("logs")
    logs.add_argument("-n", type=int, default=50)
    logs.add_argument("--follow", action="store_true")
    config = sub.add_parser("config").add_subparsers(dest="action", required=True)
    config.add_parser("path")
    config.add_parser("show")
    config.add_parser("validate")
    config.add_parser("reload")
    provider = sub.add_parser("provider").add_subparsers(dest="action", required=True)
    provider.add_parser("list")
    add = provider.add_parser("add")
    add.add_argument("preset", choices=[*PRESETS, "custom"])
    add.add_argument("--id")
    add.add_argument("--type")
    add.add_argument("--api-base")
    add.add_argument("--api-key-env")
    add.add_argument("--param", action="append", default=[], metavar="NAME=VALUE", help="Non-secret completion parameter; JSON values or plain text.")
    add.add_argument("--param-env", action="append", default=[], metavar="NAME=ENV", help="Completion parameter supplied by a declared environment reference.")
    add.add_argument("--model", action="append", default=[])
    add.add_argument("--tag", action="append", default=[])
    add.add_argument("--priority", type=int)
    add.add_argument("--quality", type=float)
    add.add_argument("--context-window", type=int)
    add.add_argument("--max-output-tokens", type=int)
    add.add_argument("--set-defaults", action="store_true")
    add.add_argument("--secret-env")
    add.add_argument("--secret-stdin", action="store_true")
    add.add_argument("--dry-run", action="store_true")
    login = provider.add_parser("login")
    login.add_argument("id")
    login.add_argument("--secret-env")
    login.add_argument("--secret-stdin", action="store_true")
    login.add_argument("--dry-run", action="store_true")
    logout = provider.add_parser("logout")
    logout.add_argument("id")
    logout.add_argument("--dry-run", action="store_true")
    remove = provider.add_parser("remove")
    remove.add_argument("id")
    remove.add_argument("--force", action="store_true")
    remove.add_argument("--dry-run", action="store_true")
    install = sub.add_parser("install").add_subparsers(dest="action", required=True)
    init = install.add_parser("init")
    init.add_argument("--home", dest="init_home")
    init.add_argument("--ref")
    init.add_argument("--version")
    init.add_argument("--source")
    init.add_argument("--method", default="isolated")
    init.add_argument("--dry-run", action="store_true")
    uninstall_parser = sub.add_parser("uninstall")
    uninstall_parser.add_argument("--dry-run", action="store_true")
    uninstall_parser.add_argument("--purge", action="store_true")
    uninstall_parser.add_argument("--yes", action="store_true")
    return parser


def _provider_assignments(values: list[str], *, json_values: bool) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for assignment in values:
        name, separator, value = assignment.partition("=")
        if not separator or not name.isidentifier() or not value.strip() or name in result:
            raise CliError("invalid_provider_option", "Provider parameters require unique NAME=VALUE assignments.", ExitCode.USAGE)
        if json_values:
            try:
                result[name] = json.loads(value)
            except json.JSONDecodeError:
                result[name] = value
        else:
            result[name] = value.strip()
    return result


def _catalog_options(paths: RuntimePaths) -> tuple[dict[str, Any], Mapping[str, str], str, int]:
    document, credentials = config_ops.read_snapshot(paths.models)
    host, port = _gateway_address(document)
    return document, credentials, host, port


def _gateway_address(document: dict[str, Any]) -> tuple[str, int]:
    gateway = document.get("gateway", {})
    host = gateway.get("host", "127.0.0.1") if isinstance(gateway, dict) else "127.0.0.1"
    port = gateway.get("port", 8000) if isinstance(gateway, dict) else 8000
    try:
        return str(host), int(port)
    except (TypeError, ValueError) as exc:
        raise CliError("invalid_configuration", "Gateway port must be an integer.", ExitCode.INVALID_CONFIG) from exc


def _start_and_wait(paths: RuntimePaths, document: dict[str, Any], credentials: Mapping[str, str], host: str, port: int, wait: float) -> dict[str, Any]:
    result = process.start(paths, host, port)
    deadline = time.monotonic() + max(wait, 0)
    while time.monotonic() < deadline:
        try:
            current = process.status(paths)
        except CliError as exc:
            if exc.code == "not_running":
                raise CliError("start_failed", "Gateway exited before becoming healthy.", ExitCode.FAILURE) from exc
            raise
        gateway = document.get("gateway", {})
        key_name = gateway.get("api_key_env") if isinstance(gateway, dict) else None
        health = probe(host, port, timeout=min(1.0, max(deadline - time.monotonic(), 0.001)), api_key=credentials.get(key_name, "") if isinstance(key_name, str) else "")
        if health.get("reachable") and current.get("pid") == result.get("pid"):
            return {**result, "status": "running", "health": health}
        time.sleep(min(0.1, max(deadline - time.monotonic(), 0)))
    if wait > 0:
        raise CliError("start_timeout", "Gateway did not become healthy before the wait timeout.", ExitCode.FAILURE)
    return result


def _dispatch(args: argparse.Namespace, paths: RuntimePaths) -> tuple[Any, int]:
    group, action = args.group, getattr(args, "action", None)
    if group == "setup":
        try:
            initialize_configuration(paths.models)
            service = ManagementSetup(paths.models)
            status = service.read()
            if not status["required"]:
                raise SetupAlreadyConfigured("Management key is already configured.")
            secret = obtain_secret(env_name=args.secret_env, stdin_secret=args.secret_stdin, json_mode=args.json_mode, quiet=args.quiet)
            return service.configure({"expected_revision": status["revision"], "api_key": secret}), 0
        except ConfigurationRecoveryRequired:
            raise
        except SetupAlreadyConfigured as exc:
            raise CliError("setup_already_configured", "Management key is already configured.", ExitCode.INVALID_CONFIG) from exc
        except RevisionConflict as exc:
            raise CliError("revision_conflict", "Configuration changed. Run setup again.", ExitCode.INVALID_CONFIG) from exc
        except (ValueError, TypeError, OSError, RuntimeError) as exc:
            raise CliError("setup_failed", "Could not configure the management key. Check configuration and secret input.", ExitCode.INVALID_CONFIG) from exc
    if group == "doctor":
        data: dict[str, Any] = {"install_state": install_state.read_state() or {"status": "unmanaged"}, "runtime_dir": str(paths.home), "models_exists": paths.models.exists(), "env_exists": paths.env.exists(), "credentials": []}
        if paths.models.exists():
            try:
                document, credentials = config_ops.read_snapshot(paths.models)
                config_ops.validate_document(document, str(paths.models), credentials)
                data["catalog"] = "valid"
                data["credentials"] = [{"name": item.get("api_key_env"), "key_present": bool(credentials.get(item.get("api_key_env", "")))} for item in document.get("providers", []) if isinstance(item, dict) and isinstance(item.get("api_key_env"), str)]
            except (ValueError, TypeError):
                data["catalog"] = {"valid": False, "message": "Invalid gateway configuration."}
        return data, 0
    if group == "status":
        result = process.status(paths)
        document, credentials, host, port = _catalog_options(paths)
        gateway = document.get("gateway", {})
        key_name = gateway.get("api_key_env") if isinstance(gateway, dict) else None
        health = probe(host, port, api_key=credentials.get(key_name, "") if isinstance(key_name, str) else "")
        result.update({"host": host, "port": port, "health": health})
        if not health.get("reachable"):
            raise CliError("running_unreachable", "Gateway process is alive but health endpoint is unreachable.", ExitCode.FAILURE)
        return result, 0
    if group == "start":
        document, credentials, host, port = _catalog_options(paths)
        if args.foreground:
            import subprocess
            command = [sys.executable, "-c", "from jev_gateway.gateway import run_gateway; run_gateway()"]
            completed = subprocess.run(command, env={**os.environ, "JEV_GATEWAY_HOME": str(paths.home)}, check=False)
            if completed.returncode:
                raise CliError("start_failed", "Gateway exited without starting.", ExitCode.FAILURE)
            return {"status": "stopped"}, 0
        return _start_and_wait(paths, document, credentials, host, port, args.wait), 0
    if group == "stop":
        if args.timeout < 0:
            raise CliError("invalid_timeout", "--timeout must be nonnegative.", ExitCode.USAGE)
        return process.stop(paths, args.timeout, args.force), 0
    if group == "restart-if-running":
        identity = process.running_for_update(paths)
        if identity is None:
            return {"status": "not_running", "restarted": False}, 0
        # Validate the new installation before stopping the known-good process.
        document, credentials, host, port = _catalog_options(paths)
        process.stop_if_owned(paths, expected=identity)
        return {**_start_and_wait(paths, document, credentials, host, port, 10), "restarted": True}, 0
    if group == "restart":
        try:
            process.stop(paths)
        except CliError as exc:
            if exc.code != "not_running":
                raise
        _, _, host, port = _catalog_options(paths)
        return process.start(paths, host, port), 0
    if group == "logs":
        if args.n < 0:
            raise CliError("invalid_line_count", "-n must be nonnegative.", ExitCode.USAGE)
        if args.follow:
            if args.json_mode:
                raise CliError("unsupported_output_mode", "--follow cannot produce a single JSON document.", ExitCode.USAGE)
            process.follow_logs(paths)
            return "", 0
        text = process.recent_logs(paths, args.n)
        return text, 0
    if group == "config":
        if action == "path":
            return {"home": str(paths.home), "models": str(paths.models), "env": str(paths.env), "credentials": str(paths.home / "credentials.json"), "records": str(paths.records), "pid": str(paths.pid), "log": str(paths.log)}, 0
        document, credentials = config_ops.read_snapshot(paths.models)
        if action == "show":
            writes = {"providers": "writable", "models": "writable", **{key: "read_only" for key in document if key not in {"providers", "models"}}}
            return {"sections": {key: {"write_access": writes[key], "value": config_ops.redact_document({key: value}, credentials)[key]} for key, value in document.items()}}, 0
        if action == "validate":
            try:
                config_ops.validate_document(document, str(paths.models), credentials)
            except (ValueError, TypeError) as exc:
                raise CliError("invalid_configuration", "Invalid gateway configuration.", ExitCode.INVALID_CONFIG) from exc
            return {"valid": True, "path": str(paths.models)}, 0
        if action == "reload":
            host, port = _gateway_address(document)
            gateway = document.get("gateway", {})
            key_name = gateway.get("api_key_env") if isinstance(gateway, dict) else None
            headers = {}
            if isinstance(key_name, str) and credentials.get(key_name):
                headers["Authorization"] = f"Bearer {credentials[key_name]}"
            url = f"http://{browsable_host(host)}:{port}/v1/routing/reload"
            request = urllib.request.Request(url, method="POST", headers=headers)
            try:
                opener = urllib.request.build_opener(urllib.request.HTTPHandler())
                with opener.open(request, timeout=3) as response:
                    return json.loads(response.read()), 0
            except urllib.error.HTTPError as exc:
                code = "reload_unauthorized" if exc.code == 401 else "reload_failed"
                raise CliError(code, f"Reload request failed with HTTP {exc.code}.", ExitCode.FAILURE) from exc
            except OSError as exc:
                raise CliError("reload_failed", "Could not reach the running gateway.", ExitCode.FAILURE) from exc
    if group == "provider":
        if action == "list":
            return providers.list_providers(paths), 0
        if action == "add":
            if args.secret_env and args.secret_stdin:
                raise CliError("secret_source_conflict", "Choose either --secret-env or --secret-stdin.", ExitCode.USAGE)
            key_reference = args.api_key_env or PRESETS.get(args.preset, {}).get("api_key_env")
            secret = obtain_secret(env_name=args.secret_env, stdin_secret=args.secret_stdin, json_mode=args.json_mode, quiet=args.quiet) if not args.dry_run and (args.secret_env or args.secret_stdin or (key_reference and sys.stdin.isatty() and not args.json_mode and not args.quiet)) else None
            return providers.add_provider(paths, preset=args.preset, provider_id=args.id, provider_type=args.type, api_base=args.api_base, api_key_env=args.api_key_env, models=args.model, tags=args.tag, priority=args.priority, quality=args.quality, context_window=args.context_window, max_output_tokens=args.max_output_tokens, set_defaults=args.set_defaults, secret=secret, dry_run=args.dry_run, params=_provider_assignments(args.param, json_values=True), param_env=_provider_assignments(args.param_env, json_values=False)), 0
        if action == "login":
            if args.secret_env and args.secret_stdin:
                raise CliError("secret_source_conflict", "Choose either --secret-env or --secret-stdin.", ExitCode.USAGE)
            document = config_ops.read_document(paths.models) if paths.models.exists() else {"providers": []}
            providers.provider_secret_name(document, args.id)
            secret = obtain_secret(env_name=args.secret_env, stdin_secret=args.secret_stdin, json_mode=args.json_mode, quiet=args.quiet) if not args.dry_run and (args.secret_env or args.secret_stdin or (sys.stdin.isatty() and not args.json_mode and not args.quiet)) else None
            return providers.login(paths, args.id, args.secret_env or "", secret, args.dry_run), 0
        if action == "logout":
            return providers.logout(paths, args.id, args.dry_run), 0
        if action == "remove":
            return providers.remove_provider(paths, args.id, args.force, args.dry_run), 0
    if group == "install" and action == "init":
        runtime = Path(args.init_home).expanduser().resolve() if args.init_home else paths.home
        if args.version is not None:
            if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:(?:a|b|rc)[0-9]+)?", args.version):
                raise CliError("invalid_install_source", "Invalid release version.", ExitCode.USAGE)
            expected = f"https://github.com/TexasOct/jev-gateway/releases/download/v{args.version}/jev_gateway-{args.version}-py3-none-any.whl"
            if args.ref is not None or args.source != expected:
                raise CliError("invalid_install_source", "Wheel installs require the matching published release URL and cannot specify --ref.", ExitCode.USAGE)
        elif args.source is not None:
            raise CliError("invalid_install_source", "--source requires --version.", ExitCode.USAGE)
        if args.dry_run:
            return {"runtime_dir": str(runtime), "dry_run": True}, 0
        return install_state.init_runtime(runtime, ref=args.ref or "main", method=args.method, version=args.version, source=args.source), 0
    if group == "uninstall":
        if args.purge and not args.dry_run:
            print(json.dumps(uninstall.plan_uninstall(purge=True, home=paths.home)), file=sys.stderr)
        return uninstall.execute_uninstall(purge=args.purge, dry_run=args.dry_run, yes=args.yes, confirm=sys.stdin.isatty() and not args.json_mode, home=paths.home), 0
    raise CliError("not_implemented", f"Command {group}.{action or ''} is not implemented.", ExitCode.FAILURE)


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    if "--json" in raw_argv and ("--help" in raw_argv or "-h" in raw_argv):
        emit("help", {"help": parser.format_help()}, json_mode=True)
        return 0
    # A version option after "install init" describes the installed wheel, not the CLI.
    if "--version" in raw_argv and ("install" not in raw_argv or raw_argv.index("--version") < raw_argv.index("install")):
        json_mode = "--json" in raw_argv
        if json_mode:
            emit("version", {"version": _package_version()}, json_mode=True)
        else:
            print(f"jev {_package_version()}")
        return 0
    try:
        args = parser.parse_args(raw_argv)
    except SystemExit as exc:
        if exc.code == 0:
            return 0
        if "--json" in raw_argv:
            emit("usage", error=CliError("usage_error", "Invalid command arguments. See jev --help.", ExitCode.USAGE), json_mode=True)
            return int(ExitCode.USAGE)
        return int(exc.code) if isinstance(exc.code, int) else int(ExitCode.USAGE)
    command = args.group + (f".{args.action}" if getattr(args, "action", None) else "")
    paths = runtime_paths(args.home)
    try:
        data, code = _dispatch(args, paths)
        emit(command, data, json_mode=args.json_mode, quiet=args.quiet)
        return code
    except CliError as exc:
        emit(command, error=exc, json_mode=args.json_mode, quiet=args.quiet)
        return int(exc.exit_code)
    except ConfigurationRecoveryRequired:
        mapped = CliError("configuration_recovery_required", "An unresolved configuration recovery file exists.", ExitCode.INVALID_CONFIG)
        emit(command, error=mapped, json_mode=args.json_mode, quiet=args.quiet)
        return int(mapped.exit_code)
    except (OSError, ValueError, TypeError) as exc:
        mapped = CliError("invalid_configuration" if isinstance(exc, (ValueError, TypeError)) else "operation_failed", str(exc), ExitCode.INVALID_CONFIG if isinstance(exc, (ValueError, TypeError)) else ExitCode.FAILURE)
        emit(command, error=mapped, json_mode=args.json_mode, quiet=args.quiet)
        return int(mapped.exit_code)


if __name__ == "__main__":
    raise SystemExit(main())
