"""Activation evidence is published after the disk/runtime transaction succeeds."""
import copy
import json
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import gateway, provider_config
from jev_gateway.records import RecordStore, SqliteRecordStore, build_config_hash
from tests.helpers import single_route_document, turns
from tests.test_gateway import install_completion
from tests.test_provider_config import model
from tests.test_provider_management_api import headers, request


def runtime(tmp_path):
    document = single_route_document()
    document['gateway'] = {'api_key_env': 'PUBLICATION_KEY'}
    document['storage'] = {'enabled': True, 'path': str(tmp_path / 'records.sqlite3')}
    (tmp_path / 'models.json').write_text(json.dumps(document))
    (tmp_path / '.env').write_text('PUBLICATION_KEY=fake-management\nTEST_PROVIDER_KEY=fake-provider\n')
    config = gateway.load_gateway_config(tmp_path / 'models.json')
    return gateway.create_app(config), config


def sqlite_store(store: RecordStore) -> SqliteRecordStore:
    assert isinstance(store, SqliteRecordStore)
    return store


def versions(config):
    config.engine.record_store.flush()
    with sqlite3.connect(config.engine.record_store.path) as db:
        return db.execute('SELECT * FROM config_versions ORDER BY config_hash').fetchall()


def files(tmp_path):
    names = ('models.json', 'models.json.bak', '.env', '.env.backup', 'credentials.json',
             'credentials.json.backup', 'routing-overrides.json', '.provider-configuration.recovery')
    return {name: (p.read_bytes(), p.stat().st_mode & 0o777) if (p := tmp_path / name).exists() else None for name in names}


@pytest.mark.parametrize('synchronous', [False, True])
@pytest.mark.parametrize('preexisting', [False, True])
@pytest.mark.parametrize('phase', ['before', 'after', 'settings', 'journal'])
@pytest.mark.parametrize('operation', ['model', 'provider', 'default', 'gateway'])
def test_failed_activation_keeps_exact_versions_and_runtime(tmp_path, monkeypatch, synchronous, preexisting, phase, operation):
    app, config = runtime(tmp_path)
    engine = config.engine
    store = sqlite_store(engine.record_store)
    try:
        if synchronous:
            def register(payload, source):
                snapshot = copy.deepcopy(payload)
                return store._submit(lambda backend: backend.register_config(snapshot, source), wait=True)
            monkeypatch.setattr(store, 'register_config', register)
        endpoint = '/v1/provider-configuration'
        body: dict[str, Any] = {'expected_revision': provider_config.revision(config.models_file)}
        if operation == 'gateway':
            endpoint = '/v1/gateway-credential'
            body['credential'] = {'action': 'set', 'value': 'fake-replacement'}
        elif operation == 'model':
            body['operations'] = [{'action': 'update_model', 'model_id': 'test-provider/vendor/only', 'model': {**model('vendor/only'), 'display_name': 'Candidate'}}]
        elif operation == 'provider':
            body['operations'] = [{'action': 'upsert', 'kind': 'llm', 'provider': {'id': 'test-provider', 'type': 'openai', 'api_base': 'https://changed.example/v1', 'api_key_env': 'TEST_PROVIDER_KEY'}, 'credential': {'action': 'set', 'value': 'fake-replacement'}}]
        else:
            body['operations'] = [{'action': 'set_default_model', 'model': 'test-provider/vendor/only'}]
        candidate = []
        def prepare(catalog):
            candidate.append(catalog)
            return engine.prepare_catalog_reload(catalog)
        if operation == 'gateway':
            # Gateway rotation has the same routing hash when its reference is retained.
            candidate.append(engine.catalog)
        else:
            provider_config.ProviderConfiguration(config.models_file).command(body, prepare=prepare)
        digest = build_config_hash(candidate[-1].routing_snapshot())
        if preexisting:
            previous = (engine.catalog, engine.strategies, engine.config_source)
            engine.reload_catalog(candidate[-1], source='protected-existing-source')
            engine.decide(messages=turns('retained history'), session_id='protected-session')
            engine.reload_catalog(previous[0], source=previous[2], registry=previous[1])
        before_versions = versions(config)
        before_files = files(tmp_path)
        before_history = list(engine._log)
        before_session = engine.store.snapshot('protected-session')
        old = (engine.catalog, engine.strategies, engine.config_hash, engine.config_source, config.gateway_api_key)
        reload = engine.reload_catalog
        settings = config.apply_settings
        failed = False
        def fault(*args, **kwargs):
            nonlocal failed
            if failed:
                return reload(*args, **kwargs)
            failed = True
            if phase == 'after':
                reload(*args, **kwargs)
            raise RuntimeError('synthetic activation failure')
        def settings_fault(value):
            nonlocal failed
            settings(value)
            if not failed:
                failed = True
                raise RuntimeError('synthetic settings failure')
        if phase == 'journal':
            unlink = Path.unlink
            def unlink_fault(path, *args, **kwargs):
                nonlocal failed
                if path.name == '.provider-configuration.recovery' and not failed:
                    failed = True
                    raise OSError('synthetic journal completion failure')
                return unlink(path, *args, **kwargs)
            monkeypatch.setattr(Path, 'unlink', unlink_fault)
        else:
            monkeypatch.setattr(config if phase == 'settings' else engine, 'apply_settings' if phase == 'settings' else 'reload_catalog', settings_fault if phase == 'settings' else fault)
        result = request(app, 'PUT', endpoint, headers=headers(config), json=body)
        assert result.status_code == 500
        assert versions(config) == before_versions
        assert files(tmp_path) == before_files
        assert engine.catalog is old[0] and engine.strategies is old[1]
        assert (engine.config_hash, engine.config_source, config.gateway_api_key) == old[2:]
        assert list(engine._log) == before_history
        assert engine.store.snapshot('protected-session') == before_session
        monkeypatch.setattr(engine, 'reload_catalog', reload)
        monkeypatch.setattr(config, 'apply_settings', settings)
        install_completion(monkeypatch)
        response = request(app, 'POST', '/v1/chat/completions', headers=headers(config), json={'model': 'task_aware', 'messages': turns('hello')})
        assert response.status_code == 200
        assert versions(config) == before_versions
        restarted = gateway.load_gateway_config(config.models_file)
        try:
            assert restarted.engine.config_hash == old[2]
            assert restarted.gateway_api_key == old[4]
        finally:
            restarted.engine.close()
        assert versions(config) == before_versions
        if not preexisting and digest != old[2]:
            assert not any(row[0] == digest for row in before_versions)
    finally:
        engine.close()


def test_concurrent_chat_waits_for_failed_activation(tmp_path, monkeypatch):
    app, config = runtime(tmp_path)
    entered, release, chat_started = threading.Event(), threading.Event(), threading.Event()
    reload = config.engine.reload_catalog
    failed = False
    def fault(*args, **kwargs):
        nonlocal failed
        reload(*args, **kwargs)
        if not failed:
            failed = True
            entered.set()
            assert release.wait(10)
            raise RuntimeError('synthetic failure')
    monkeypatch.setattr(config.engine, 'reload_catalog', fault)
    sdk = install_completion(monkeypatch)
    before = versions(config)
    old_hash = config.engine.config_hash
    body = {'expected_revision': provider_config.revision(config.models_file), 'operations': [{'action': 'update_model', 'model_id': 'test-provider/vendor/only', 'model': {**model('vendor/only'), 'display_name': 'Candidate'}}]}
    auth = headers(config)
    def chat():
        chat_started.set()
        return request(app, 'POST', '/v1/chat/completions', headers=auth, json={'model': 'task_aware', 'messages': turns('hello')})
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            mutation = pool.submit(request, app, 'PUT', '/v1/provider-configuration', headers=auth, json=body)
            assert entered.wait(10)
            admission = pool.submit(chat)
            assert chat_started.wait(10)
            assert versions(config) == before
            assert not sdk
            release.set()
            assert mutation.result(10).status_code == 500
            assert admission.result(10).status_code == 200
        assert versions(config) == before
        config.engine.record_store.flush()
        with sqlite3.connect(sqlite_store(config.engine.record_store).path) as db:
            assert db.execute('SELECT DISTINCT config_hash FROM decisions').fetchall() == [(old_hash,)]
    finally:
        release.set()
        config.engine.close()


@pytest.mark.parametrize('unavailable', [False, True])
def test_success_publication_is_ordered_and_storage_is_best_effort(tmp_path, monkeypatch, unavailable):
    app, config = runtime(tmp_path)
    store = sqlite_store(config.engine.record_store)
    reload = config.engine.reload_catalog
    register = store.register_config
    events = []
    def observed_register(payload, source):
        events.append('publish')
        assert not (tmp_path / '.provider-configuration.recovery').exists()
        if unavailable:
            raise RuntimeError('synthetic unavailable recorder')
        return register(payload, source)
    def observed_reload(*args, **kwargs):
        reload(*args, **kwargs)
        events.append('activated')
        assert not events.count('publish')
    monkeypatch.setattr(store, 'register_config', observed_register)
    monkeypatch.setattr(config.engine, 'reload_catalog', observed_reload)
    sdk = install_completion(monkeypatch)
    body = {'expected_revision': provider_config.revision(config.models_file), 'operations': [{'action': 'update_model', 'model_id': 'test-provider/vendor/only', 'model': {**model('vendor/only'), 'display_name': 'Committed'}}]}
    try:
        result = request(app, 'PUT', '/v1/provider-configuration', headers=headers(config), json=body)
        assert result.status_code == 200
        assert events == ['activated', 'publish']
        digest = config.engine.config_hash
        assert digest == build_config_hash(config.engine.catalog.routing_snapshot())
        response = request(app, 'POST', '/v1/chat/completions', headers=headers(config), json={'model': 'task_aware', 'messages': turns('hello')})
        assert response.status_code == 200 and sdk
        store.flush()
        with sqlite3.connect(store.path) as db:
            assert db.execute('SELECT DISTINCT config_hash FROM decisions').fetchall() == [(digest,)]
            assert bool(db.execute('SELECT 1 FROM config_versions WHERE config_hash=?', (digest,)).fetchone()) is not unavailable
    finally:
        config.engine.close()
