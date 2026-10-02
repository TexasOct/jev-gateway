#!/usr/bin/env python3
"""Exercise an installed release wheel without using operator paths or upstreams."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wheel', type=Path, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--installer', type=Path, help='Verified public installer to execute instead of a local wheel install')
    args = parser.parse_args()
    if not args.wheel.is_absolute() or not args.work_dir.is_absolute():
        parser.error('wheel and work-dir must be absolute')
    wheel = args.wheel.resolve(strict=True)
    installer: Path | None = None
    if args.installer is not None:
        if not args.installer.is_absolute():
            parser.error('installer must be absolute')
        installer = args.installer.resolve(strict=True)
        embedded = re.findall(rb'^RELEASE_TAG=(.*)$', installer.read_bytes(), re.MULTILINE)
        if embedded != [('v' + args.version).encode()]:
            parser.error('installer embedded tag must match version')
        sidecar = installer.with_name(installer.name + '.sha256').read_bytes()
        expected = hashlib.sha256(installer.read_bytes()).hexdigest().encode()
        if sidecar not in (expected + b'  ' + installer.name.encode(), expected + b'  ' + installer.name.encode() + b'\n'):
            parser.error('installer SHA256 sidecar must match')
    root = args.work_dir.resolve()
    root.mkdir(parents=True, exist_ok=True)
    evidence = root / 'evidence'
    evidence.mkdir(exist_ok=True)
    run = root / ('run-' + uuid.uuid4().hex)
    run.mkdir()
    home = run / 'runtime home with spaces'
    outside = run / 'unrelated cwd'
    outside.mkdir()
    user_home = run / 'user home'
    user_home.mkdir()
    env = os.environ.copy()
    for key in list(env):
        if key.startswith('JEV_') or key in {'PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV', 'UV_PROJECT_ENVIRONMENT', 'UV_PYTHON_PREFERENCE'}:
            env.pop(key)
    env.update(HOME=str(user_home), XDG_CONFIG_HOME=str(run / 'config'),
               XDG_CACHE_HOME=str(run / 'cache'), UV_CACHE_DIR=str(run / 'cache' / 'uv'),
               UV_TOOL_DIR=str(run / 'tools'), UV_TOOL_BIN_DIR=str(run / 'bin'),
               XDG_STATE_HOME=str(run / 'state'), UV_PYTHON_INSTALL_DIR=str(run / 'python'),
               NO_PROXY='127.0.0.1,localhost',
               no_proxy='127.0.0.1,localhost')
    uv = shutil.which('uv')
    if uv is None:
        parser.error('uv must be on PATH')
    jev = run / 'bin' / 'jev'
    checks: list[str] = []
    success = False
    secrets = ['fake-smoke-gateway-key', 'fake-smoke-provider-key']
    foreground: subprocess.Popen[bytes] | None = None
    sequence = 0

    def check(condition: bool, name: str) -> None:
        if not condition:
            raise RuntimeError(name)
        checks.append(name)
        print('PASS ' + name, flush=True)

    def redact(text: str) -> str:
        for value in secrets:
            text = text.replace(value, '[redacted]')
        return text

    def command(argv: list[str]) -> str:
        nonlocal sequence
        sequence += 1
        result = subprocess.run(argv, cwd=outside, env=env, capture_output=True, text=True, timeout=240)
        (evidence / f'{sequence:02d}-command.log').write_text(redact(result.stdout + result.stderr))
        if result.returncode:
            raise RuntimeError(f'command {sequence} failed (exit {result.returncode}); see sanitized evidence')
        return result.stdout

    def cli(*parts: str) -> dict:
        return json.loads(command([str(jev), '--json', *parts]))['data']

    def install() -> None:
        if installer is None:
            command([uv, 'tool', 'install', '--force', '--python', '3.12', '--managed-python', str(wheel)])
        else:
            command(['sh', str(installer), '--no-uv', '--home', str(home)])

    def hashes() -> tuple[str, str]:
        return tuple(hashlib.sha256(p.read_bytes()).hexdigest() for p in (home / 'models.json', home / '.env'))  # type: ignore[return-value]

    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def http(path: str, method: str = 'GET', body: dict | None = None,
             status: int = 200, key: str = secrets[0], extra_headers: dict[str, str] | None = None) -> bytes:
        request = urllib.request.Request(base + path,
            data=None if body is None else json.dumps(body).encode(), method=method,
            headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', **(extra_headers or {})})
        try:
            with opener.open(request, timeout=10) as response:
                code, content = response.status, response.read()
        except urllib.error.HTTPError as error:
            code, content = error.code, error.read()
        if code != status:
            raise RuntimeError(f'{method} {path}: expected {status}, got {code}')
        check(all(value.encode() not in content for value in secrets), method + ' ' + path + ' credentials hidden')
        return content

    def wait_health() -> None:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                health = json.loads(http('/healthz'))
                check(health['status'] == 'ok', 'health ready')
                return
            except (OSError, urllib.error.URLError):
                time.sleep(.25)
        raise RuntimeError('health readiness timed out')

    try:
        install()
        check(cli('--version')['version'] == args.version, 'installed package version')
        python = run / 'tools' / 'jev-gateway' / 'bin' / 'python'
        identity = json.loads(command([str(python), '-c',
            'import sys,json,importlib.metadata; print(json.dumps([list(sys.version_info[:2]),importlib.metadata.version("jev-gateway")]))']))
        check(identity == [[3, 12], args.version], 'managed Python 3.12 and wheel identity')
        parity_script = (
            'import importlib.util,json,pathlib,sys,zipfile; '
            'spec=importlib.util.find_spec("jev_gateway"); '
            'root=pathlib.Path(spec.origin).parent; '
            'archive=zipfile.ZipFile(sys.argv[1]); '
            'names=[name for name in archive.namelist() if name.startswith("jev_gateway/") and not name.endswith("/")]; '
            'assert names, "wheel contains no package files"; '
            'print(json.dumps([name for name in names if not (root / name.removeprefix("jev_gateway/")).is_file() '
            'or (root / name.removeprefix("jev_gateway/")).read_bytes()!=archive.read(name)]))'
        )
        check(json.loads(command([str(python), '-c', parity_script, str(wheel)])) == [], 'installed package matches verified wheel files')
        cli('--home', str(home), 'install', 'init', '--version', args.version,
            '--source', f'https://github.com/TexasOct/jev-gateway/releases/download/v{args.version}/jev_gateway-{args.version}-py3-none-any.whl', '--method', 'isolated')
        config = json.loads((home / 'models.json').read_text())
        check(not config.get('providers') and not config.get('models')
              and not config.get('decision', {}).get('providers'), 'strategy-only packaged defaults')
        definitions = config['strategies']['definitions']
        check({'task_aware', 'quality', 'economy'} <= definitions.keys(), 'default strategy plans retained')
        check(not config['gateway'].get('api_key_env'), 'fresh installation has no management credential reference')
        check(not any(line.strip() and not line.lstrip().startswith('#')
                      for line in (home / '.env').read_text().splitlines()), 'no bundled upstream credentials')
        config['gateway'].update(host='127.0.0.1', port=port)
        (home / 'models.json').write_text(json.dumps(config, indent=2) + '\n')
        check(Path(cli('config', 'path')['home']) == home, 'recorded home outside repository')
        cli('doctor')
        cli('config', 'validate')
        for directory in (run / 'tools', run / 'bin', run / 'state', home):
            probe = directory / ('smoke-probe-' + uuid.uuid4().hex)
            renamed = probe.with_suffix('.renamed')
            created = False
            moved = False
            try:
                with probe.open('x') as stream:
                    created = True
                    stream.write('created')
                check(probe.read_text() == 'created', f'file create/read {directory.name}')
                probe.write_text('updated')
                probe.rename(renamed)
                moved = True
                check(renamed.read_text() == 'updated', f'file update/rename {directory.name}')
                renamed.unlink()
                check(not renamed.exists(), f'file delete {directory.name}')
            finally:
                if moved:
                    renamed.unlink(missing_ok=True)
                elif created:
                    probe.unlink(missing_ok=True)
        cli('start', '--wait', '30')
        wait_health()
        check(cli('status')['status'] == 'running', 'background status')
        setup = json.loads(http('/v1/setup', key=''))
        check(setup['required'] is True and setup['has_providers'] is False
              and setup['has_models'] is False, 'empty installation starts before supplier configuration')
        empty = json.loads(http('/v1/chat/completions', 'POST', {
            'model': 'task_aware', 'messages': [{'role': 'user', 'content': 'synthetic installed setup probe'}]}, status=503, key=''))
        check(empty['error']['code'] == 'setup_incomplete', 'unconfigured generation returns controlled error')
        before = hashes()
        for invalid_key in (secrets[0] + ' ', ' ' + secrets[0], '密' * 16, 'fake-management\tkey'):
            http('/v1/setup', 'POST', {'expected_revision': setup['revision'], 'api_key': invalid_key}, status=400, key='')
            check(hashes() == before, 'transport-incompatible setup key preserves configuration')
        for headers in ({'Origin': 'https://elsewhere.invalid'},
                        {'X-Forwarded-For': '127.0.0.1'}, {'Forwarded': 'for=127.0.0.1'}):
            rejected = json.loads(http('/v1/setup', 'POST', {
                'expected_revision': setup['revision'], 'api_key': secrets[0]}, status=403, key='', extra_headers=headers))
            check(rejected['error']['code'] == 'setup_local_only' and hashes() == before,
                  'bootstrap rejects ' + next(iter(headers)) + ' without configuration writes')
        http('/v1/setup', 'POST', {'expected_revision': 'stale-revision', 'api_key': secrets[0]}, status=409, key='')
        check(hashes() == before, 'stale bootstrap preserves configuration')
        initialized = json.loads(http('/v1/setup', 'POST', {
            'expected_revision': setup['revision'], 'api_key': secrets[0]}, key='', extra_headers={'Origin': base}))
        check(initialized['required'] is False and initialized['next_step'] == 'provider', 'local management-key initialization')
        check((home / '.env').stat().st_mode & 0o777 == 0o600, 'initialized credentials have mode 0600')
        before = hashes()
        http('/v1/setup', 'POST', {'expected_revision': initialized['revision'], 'api_key': secrets[1]}, status=409)
        check(hashes() == before, 'repeat setup preserves management credentials and configuration')
        http('/v1/setup', status=401, key='wrong-key')
        check(json.loads(http('/v1/setup'))['has_models'] is False, 'suppliers and models can be configured later')
        proxy_keys = ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NO_PROXY', 'no_proxy')
        previous_proxy = {name: env.get(name) for name in proxy_keys}
        try:
            for name in proxy_keys:
                env.pop(name, None)
            for name in proxy_keys[:6]:
                env[name] = 'http://127.0.0.1:1'
            proxy_status = cli('status')
            check(proxy_status['status'] == 'running' and proxy_status['health']['reachable'] is True,
                  'CLI readiness ignores invalid exported proxies without NO_PROXY')
        finally:
            for name, value in previous_proxy.items():
                if value is None:
                    env.pop(name, None)
                else:
                    env[name] = value
        database = home / 'jev-records.sqlite3'
        check(database.is_file(), 'SQLite initialized')
        with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
            check(connection.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'SQLite integrity')
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            check({'requests', 'decisions', 'outcomes', 'upstream_requests', 'config_versions',
                   'assistant_continuations'} <= tables, 'SQLite expected schema')
        shell = http('/dashboard').decode()
        assets = set(re.findall(r'(?:src|href)=["\']([^"\']+\.(?:js|css)(?:\?[^"\']*)?)["\']', shell))
        check(bool(assets) and any('.js' in asset for asset in assets) and any('.css' in asset for asset in assets), 'dashboard asset links')
        for asset in sorted(assets):
            check(asset.startswith('/dashboard/'), 'local dashboard asset')
            http(asset)
        http('/v1/provider-configuration', status=401, key='wrong-key')
        snapshot = json.loads(http('/v1/provider-configuration'))
        transaction = {'expected_revision': snapshot['revision'], 'operations': [{
            'action': 'upsert', 'kind': 'llm', 'provider': {'id': 'smoke-provider', 'type': 'openai',
            'api_base': 'https://example.invalid/v1', 'api_key_env': 'JEV_SMOKE_PROVIDER_KEY'},
            'credential': {'action': 'set', 'value': secrets[1]}}]}
        before = hashes()
        http('/v1/provider-configuration/validate', 'POST', transaction)
        check(hashes() == before, 'provider validation preserves files')
        applied = json.loads(http('/v1/provider-configuration', 'PUT', transaction))
        check(applied['applied'] is True, 'provider apply')
        http('/v1/provider-configuration', 'PUT', transaction, status=409)
        fresh = json.loads(http('/v1/provider-configuration'))
        deleted = json.loads(http('/v1/provider-configuration', 'PUT', {
            'expected_revision': fresh['revision'], 'operations': [{'action': 'delete', 'kind': 'llm', 'id': 'smoke-provider'}]}))
        check(deleted['applied'] is True, 'provider delete')
        fresh = json.loads(http('/v1/provider-configuration'))
        transaction['expected_revision'] = fresh['revision']
        recreated = json.loads(http('/v1/provider-configuration', 'PUT', transaction))
        check(recreated['models'] == [], 'provider saved before importing models')
        model_import = {'expected_revision': recreated['revision'], 'operations': [{
            'action': 'import', 'provider_id': 'smoke-provider', 'confirmed': True, 'models': [{
                'upstream_model': 'smoke-model', 'cost': {'input_per_million': 1, 'output_per_million': 2},
                'capabilities': {'tools': True, 'vision': False, 'json_mode': True,
                                 'reasoning': False, 'temperature': True, 'reasoning_effort': []},
                'context_window': 32000, 'max_output_tokens': 4096}]}]}
        imported = json.loads(http('/v1/provider-configuration', 'PUT', model_import))
        check(imported['imported'] == 1, 'confirmed first model import into empty configuration')
        check(json.loads(http('/v1/setup'))['next_step'] == 'routing', 'unassigned model remains editable')
        probe = {'model': 'task_aware', 'messages': [{'role': 'user', 'content': 'synthetic installed routing probe'}]}
        missing_default = json.loads(http('/v1/routing/preview', 'POST', probe, status=503))
        check(missing_default['error']['code'] == 'setup_incomplete', 'empty tag without global default remains controlled')
        default_command = {'expected_revision': imported['revision'], 'operations': [{
            'action': 'set_default_model', 'model': 'smoke-provider/smoke-model'}]}
        before = hashes()
        http('/v1/provider-configuration/validate', 'POST', default_command)
        check(hashes() == before, 'global default validation preserves files')
        saved_default = json.loads(http('/v1/provider-configuration', 'PUT', default_command))
        check(saved_default['defaults']['default_model'] == 'smoke-provider/smoke-model', 'global default saved through baseline owner')
        cli('config', 'reload')
        check(json.loads(http('/v1/setup'))['routing_ready'] is True, 'global default makes empty tag pools usable')
        for strategy in definitions:
            result = json.loads(http('/v1/routing/preview', 'POST', {**probe, 'model': strategy}))['preview'][0]
            check(result['route'] == 'smoke-provider/smoke-model' and result['label'] == result['tier'] == 'default',
                  strategy + ' inherits global default and displays default')
        routing = json.loads(http('/v1/routing/configuration'))
        model = routing['models'][0]
        tags = ['task_aware/' + label for label in definitions['task_aware']['policy']['labels']]
        overlay = {'version': 1, 'strategy': 'task_aware', 'models': {
            model['id']: {'tags': tags, 'priority': model['priority']}}}
        before = hashes()
        http('/v1/routing/configuration/validate', 'POST', overlay)
        check(hashes() == before, 'routing validation preserves files')
        check(json.loads(http('/v1/routing/configuration', 'PUT', overlay))['applied'] is True, 'routing apply')
        cli('config', 'reload')
        check(json.loads(http('/v1/setup'))['routing_ready'] is True, 'configured model pools survive reload')
        preview = json.loads(http('/v1/routing/preview', 'POST', {
            'model': 'task_aware', 'messages': [{'role': 'user', 'content': 'synthetic installed routing probe'}]}))
        check(len(preview['preview']) == 1, 'configured connection is selectable without upstream calls')
        check(json.loads(http('/v1/routing/configuration', 'DELETE'))['overlay_removed'] is True, 'routing delete')
        cli('config', 'reload')
        restored_default = json.loads(http('/v1/routing/preview', 'POST', probe))['preview'][0]
        check(restored_default['label'] == 'default' and restored_default['route'] == 'smoke-provider/smoke-model',
              'overlay removal preserves inherited global default')
        old = cli('status')['pid']
        cli('restart')
        wait_health()
        check(cli('status')['pid'] != old, 'restart changes PID')
        before = hashes()
        old = cli('status')['pid']
        install()
        if installer is None:
            check(cli('restart-if-running')['restarted'] is True, 'repeat install restarts running gateway')
        else:
            check(cli('status')['pid'] != old, 'public installer restarts running gateway')
        wait_health()
        check(cli('status')['pid'] != old and hashes() == before, 'repeat install preserves configuration')
        cli('stop')
        install()
        check(cli('restart-if-running')['restarted'] is False, 'stopped update stays stopped')
        with (evidence / 'foreground.log').open('wb') as log:
            foreground = subprocess.Popen([str(run / 'bin' / 'jev-gateway')], cwd=outside, env=env, stdout=log, stderr=log)
            wait_health()
            check(foreground.poll() is None, 'direct foreground entry point uses recorded home')
            foreground.terminate()
            foreground.wait(timeout=30)
            foreground = None
        preserved = {path: path.read_bytes() for path in (home / 'models.json', home / '.env', home / 'jev-records.sqlite3')}
        cli('uninstall', '--dry-run')
        check(jev.exists(), 'uninstall dry-run preserves executable')
        cli('uninstall')
        check(all(path.read_bytes() == data for path, data in preserved.items()), 'uninstall preserves runtime configuration credentials database')
        check(not jev.exists(), 'uninstall removes isolated executable')
        success = True
        return 0
    except Exception as error:
        print('FAIL ' + redact(str(error)), file=sys.stderr)
        return 1
    finally:
        if foreground is not None and foreground.poll() is None:
            foreground.terminate()
            try:
                foreground.wait(timeout=30)
            except subprocess.TimeoutExpired:
                foreground.kill()
                foreground.wait()
        if jev.exists():
            subprocess.run([str(jev), '--json', 'stop'], cwd=outside, env=env, capture_output=True, timeout=40)
        for log in evidence.glob('*.log'):
            log.write_text(redact(log.read_text(errors='replace')))
        (evidence / 'checks.json').write_text(json.dumps({'success': success, 'version': args.version, 'wheel_sha256': hashlib.sha256(wheel.read_bytes()).hexdigest(),
            'installer_sha256': hashlib.sha256(installer.read_bytes()).hexdigest() if installer else None, 'checks': checks}, indent=2) + '\n')


if __name__ == '__main__':
    raise SystemExit(main())
