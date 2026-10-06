"""Real SQLite evidence survives rejected routing overlay activation."""
from __future__ import annotations

import copy
import json

import pytest

from jev_gateway import gateway
from jev_gateway.catalog import catalog_from_document
from jev_gateway.credentials import credential_snapshot
from jev_gateway.records import SqliteRecordStore, build_config_hash
from jev_gateway.routing_overlay import merge_overlay, overlay_path, write_overlay
from tests.helpers import single_route_document, turns
from tests.test_activation_publication import files, versions
from tests.test_gateway import install_completion
from tests.test_provider_management_api import headers, request


@pytest.mark.parametrize('operation,initial_present', [('apply', False), ('apply', True), ('reset', True)])
@pytest.mark.parametrize('synchronous', [False, True])
@pytest.mark.parametrize('preexisting', [False, True])
@pytest.mark.parametrize('phase', ['before', 'after'])
def test_failed_overlay_preserves_disk_runtime_and_versions(tmp_path, monkeypatch, operation, synchronous, preexisting, phase, initial_present):
    document = single_route_document()
    document['gateway'] = {'api_key_env': 'PUBLICATION_KEY'}
    document['storage'] = {'enabled': True, 'path': str(tmp_path / 'records.sqlite3')}
    path = tmp_path / 'models.json'
    path.write_text(json.dumps(document))
    (tmp_path / '.env').write_text('PUBLICATION_KEY=fake-management\nTEST_PROVIDER_KEY=fake-provider\n')
    initial = {'version': 1, 'strategy': 'task_aware', 'models': {'test-provider/vendor/only': {'priority': 23}}}
    candidate = {**initial, 'models': {'test-provider/vendor/only': {'priority': 47}}}
    # Load the overlay first so reset's baseline hash has never been published.
    if initial_present:
        write_overlay(path, initial)
        overlay_path(path).chmod(0o640)
    config = gateway.load_gateway_config(path)
    app = gateway.create_app(config)
    engine = config.engine
    store = engine.record_store
    assert isinstance(store, SqliteRecordStore)
    reload = engine.reload_catalog
    try:
        if synchronous:
            def register(payload, source):
                snapshot = copy.deepcopy(payload)
                return store._submit(lambda backend: backend.register_config(snapshot, source), wait=True)
            monkeypatch.setattr(store, 'register_config', register)
        target = catalog_from_document(merge_overlay(document, candidate) if operation == 'apply' else document, str(path), credential_snapshot(path, external=config.credential_environment), allow_missing_credentials=True)
        digest = build_config_hash(target.routing_snapshot())
        old = (engine.catalog, engine.strategies, engine.config_hash, engine.config_source, config.gateway_api_key)
        if preexisting:
            reload(target, source='retained-source')
            reload(old[0], source=old[3], registry=old[1])
        engine.decide(messages=turns('retained history'), session_id='protected-session')
        before_versions, before_files = versions(config), files(tmp_path)
        assert any(row[0] == digest for row in before_versions) is preexisting
        history = list(engine._log)
        session = engine.store.snapshot('protected-session')
        failed = False
        def fault(*args, **kwargs):
            nonlocal failed
            if failed:
                return reload(*args, **kwargs)
            failed = True
            if phase == 'after':
                reload(*args, **kwargs)
            raise RuntimeError('synthetic overlay activation failure')
        monkeypatch.setattr(engine, 'reload_catalog', fault)
        result = request(app, 'PUT' if operation == 'apply' else 'DELETE', '/v1/routing/configuration', headers=headers(config), **({'json': candidate} if operation == 'apply' else {}))
        assert result.status_code == 500
        assert versions(config) == before_versions
        assert files(tmp_path) == before_files
        assert engine.catalog is old[0] and engine.strategies is old[1]
        assert (engine.config_hash, engine.config_source, config.gateway_api_key) == old[2:]
        assert list(engine._log) == history
        assert engine.store.snapshot('protected-session') == session
        monkeypatch.setattr(engine, 'reload_catalog', reload)
        sdk = install_completion(monkeypatch)
        result = request(app, 'POST', '/v1/chat/completions', headers=headers(config), json={'model': 'task_aware', 'messages': turns('hello')})
        assert result.status_code == 200 and len(sdk) == 1
        assert versions(config) == before_versions
    finally:
        engine.close()


@pytest.mark.parametrize('operation', ['apply', 'reset'])
@pytest.mark.parametrize('unavailable', [False, True])
def test_overlay_success_publishes_after_activation_and_recorder_is_best_effort(tmp_path, monkeypatch, operation, unavailable):
    document = single_route_document()
    document['gateway'] = {'api_key_env': 'PUBLICATION_KEY'}
    document['storage'] = {'enabled': True, 'path': str(tmp_path / 'records.sqlite3')}
    path = tmp_path / 'models.json'
    path.write_text(json.dumps(document))
    (tmp_path / '.env').write_text('PUBLICATION_KEY=fake-management\nTEST_PROVIDER_KEY=fake-provider\n')
    overlay = {'version': 1, 'strategy': 'task_aware', 'models': {'test-provider/vendor/only': {'priority': 23}}}
    if operation == 'reset':
        write_overlay(path, overlay)
    config = gateway.load_gateway_config(path)
    app = gateway.create_app(config)
    engine = config.engine
    register, reload = engine.record_store.register_config, engine.reload_catalog
    events = []
    def observed_register(payload, source):
        events.append('publish')
        assert overlay_path(path).exists() is (operation == 'apply')
        if unavailable:
            raise RuntimeError('synthetic recorder unavailable')
        return register(payload, source)
    def observed_reload(*args, **kwargs):
        reload(*args, **kwargs)
        assert not events
        events.append('activated')
    monkeypatch.setattr(engine.record_store, 'register_config', observed_register)
    monkeypatch.setattr(engine, 'reload_catalog', observed_reload)
    try:
        result = request(app, 'PUT' if operation == 'apply' else 'DELETE', '/v1/routing/configuration', headers=headers(config), **({'json': overlay} if operation == 'apply' else {}))
        assert result.status_code == 200
        assert events == ['activated', 'publish']
        digest = engine.config_hash
        assert any(row[0] == digest for row in versions(config)) is not unavailable
        sdk = install_completion(monkeypatch)
        result = request(app, 'POST', '/v1/chat/completions', headers=headers(config), json={'model': 'task_aware', 'messages': turns('hello')})
        assert result.status_code == 200 and len(sdk) == 1
    finally:
        engine.close()
