"""Global default references, revisioned writes, and omitted-template CLI edits."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import FrozenInstanceError, replace
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import config_transaction
from jev_gateway.catalog import Catalog, CatalogDefaults, catalog_from_document, defaults_from_dict
from jev_gateway.cli.config_ops import redact_document
from jev_gateway.cli.output import CliError
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.providers import add_provider, remove_provider
from jev_gateway.provider_config import ProviderConfiguration, RevisionConflict, credential_snapshot, env_update, revision
from jev_gateway.routing_overlay import merge_overlay, overlay_path, read_models_document, read_overlay
from jev_gateway.strategy import StrategyRegistry
from tests.helpers import single_route_document

MODEL = "test-provider/vendor/only"
OTHER_MODEL = "test-provider/vendor/other"
SECRET = "fake-global-default-provider-key"
MANAGEMENT_KEY = "fake-global-default-management-key"
TEMPLATE = Path(__file__).resolve().parents[1] / "jev_gateway/templates/models.example.json"


def document() -> dict[str, Any]:
    result = single_route_document()
    result["providers"][0]["api_base"] = "https://provider.invalid/v1"
    result["models"].append({"provider": "test-provider", "upstream_model": "vendor/other"})
    return result


def service(tmp_path: Path, *, tagged: bool = False) -> ProviderConfiguration:
    data = document()
    if tagged:
        data.pop("policy")
        data["strategies"] = {"default": "task_aware", "definitions": {"task_aware": {"kind": "policy", "policy": {"labels": {"routine": {}}}}}}
        data["models"][0]["tags"] = ["task_aware/routine", "quality/kept"]
    data["gateway"] = {"api_key_env": "GLOBAL_TEST_MANAGEMENT_KEY"}
    path = tmp_path / "models.json"
    path.write_text(json.dumps(data))
    (tmp_path / ".env").write_bytes(env_update(env_update(b"# preserved\n", "TEST_PROVIDER_KEY", SECRET), "GLOBAL_TEST_MANAGEMENT_KEY", MANAGEMENT_KEY))
    return ProviderConfiguration(path, external={})


def body(current: ProviderConfiguration, model: Any) -> dict[str, Any]:
    return {"expected_revision": revision(current.models_file), "operations": [{"action": "set_default_model", "model": model}]}


def files(current: ProviderConfiguration) -> dict[str, bytes | None]:
    return {name: config_transaction.optional_bytes(current.models_file.parent / name) for name in ("models.json", ".env", "routing-overrides.json", "models.json.bak", ".env.backup", ".provider-configuration.recovery")}


def read_catalog(current: ProviderConfiguration) -> Catalog:
    overlay, error = read_overlay(current.models_file)
    assert error is None
    return catalog_from_document(merge_overlay(read_models_document(current.models_file), overlay), "fixture", credential_snapshot(current.models_file, external={}))


@pytest.mark.parametrize("defaults", [{}, {"default_model": None}])
def test_defaults_omission_and_null_field_round_trip(defaults: dict[str, Any]) -> None:
    data = document()
    omitted = catalog_from_document(data, "fixture", {"TEST_PROVIDER_KEY": SECRET})
    assert omitted.defaults == CatalogDefaults()
    data["defaults"] = defaults
    explicit = catalog_from_document(data, "fixture", {"TEST_PROVIDER_KEY": SECRET})
    assert explicit.defaults.default_model is None
    assert omitted.routing_snapshot() == explicit.routing_snapshot()
    with pytest.raises(FrozenInstanceError):
        setattr(explicit.defaults, "default_model", MODEL)


@pytest.mark.parametrize("value", [None, [], "", True, 0, {"unknown": None}, {"default_model": "", "unknown": None}, {"default_model": ""}, {"default_model": " \t "}, {"default_model": False}, {"default_model": []}, {"default_model": {}}])
def test_defaults_reject_explicit_null_shapes_unknown_keys_and_wrong_types(value: Any) -> None:
    data = document()
    data["defaults"] = value
    with pytest.raises((ValueError, TypeError), match="defaults"):
        catalog_from_document(data, "fixture", {"TEST_PROVIDER_KEY": SECRET})


@pytest.mark.parametrize("model", ["vendor/only", "only", "task_aware", "auto", "test-provider/missing", "missing/vendor/only", f" {MODEL}", f"{MODEL} "])
def test_default_requires_exact_configured_canonical_id(model: str) -> None:
    data = document()
    data["defaults"] = {"default_model": model}
    with pytest.raises(ValueError, match="configured canonical model id"):
        catalog_from_document(data, "fixture", {"TEST_PROVIDER_KEY": SECRET})


def test_defaults_parser_and_direct_catalog_validation() -> None:
    assert defaults_from_dict({"default_model": MODEL}, "fixture") == CatalogDefaults(MODEL)
    catalog = catalog_from_document(document(), "fixture", {"TEST_PROVIDER_KEY": SECRET})
    with pytest.raises(ValueError, match="configured canonical model id"):
        replace(catalog, defaults=CatalogDefaults("missing/model")).validate()
    empty = json.loads(TEMPLATE.read_text())
    assert "defaults" not in empty
    assert catalog_from_document(empty, "packaged fixture", {}).defaults.default_model is None
    empty["defaults"] = {"default_model": MODEL}
    with pytest.raises(ValueError, match="configured canonical model id"):
        catalog_from_document(empty, "packaged fixture", {})


def test_safe_catalog_provider_and_cli_projections(tmp_path: Path) -> None:
    current = service(tmp_path)
    current.command(body(current, MODEL), apply=True)
    catalog = read_catalog(current)
    raw = json.loads(current.models_file.read_text())
    projections = [catalog.as_dict(), catalog.routing_snapshot(), current.read(), ProviderConfiguration.project(catalog, "fixture"), redact_document(raw, credential_snapshot(current.models_file))]
    for projection in projections:
        assert projection["defaults"] == {"default_model": MODEL}
        assert SECRET not in json.dumps(projection)
        assert MANAGEMENT_KEY not in json.dumps(projection)


def test_revisioned_validation_apply_clear_and_overlay_preservation(tmp_path: Path) -> None:
    current = service(tmp_path, tagged=True)
    overlay = {"version": 1, "strategy": "task_aware", "models": {MODEL: {"tags": ["task_aware/routine", "quality/kept", "economy/added"], "priority": 7}}}
    overlay_path(current.models_file).write_text(json.dumps(overlay))
    before = files(current)
    process = dict(os.environ)
    prepared: list[Any] = []
    activated: list[Any] = []

    def prepare(catalog: Any) -> StrategyRegistry:
        assert catalog.defaults.default_model == MODEL
        assert catalog.by_name(MODEL).priority == 7
        prepared.append(catalog)
        return StrategyRegistry.from_catalog(catalog)

    command = body(current, MODEL)
    checked = current.command(command, prepare=prepare, activate=lambda *args: activated.append(args))
    assert checked["defaults"] == {"default_model": MODEL}
    assert checked["revision"] == command["expected_revision"]
    assert checked["applied"] is False
    assert files(current) == before
    assert activated == []
    assert current.read()["defaults"] == {"default_model": None}
    applied = current.command(command, apply=True, prepare=prepare, activate=lambda *args: activated.append(args))
    assert applied["applied"] is True
    assert applied["revision"] != command["expected_revision"]
    assert len(prepared) == 2 and activated[0][0] is prepared[-1]
    assert json.loads(current.models_file.read_text())["models"] == json.loads(before["models.json"] or b"{}")["models"]
    assert overlay_path(current.models_file).read_bytes() == before["routing-overrides.json"]
    assert (tmp_path / ".env").read_bytes() == before[".env"]
    assert current.read()["models"][0]["priority"] == 7
    assert read_catalog(current).defaults.default_model == MODEL
    with pytest.raises(RevisionConflict):
        current.command(command, apply=True)
    cleared = current.command(body(current, None), apply=True)
    assert cleared["defaults"] == {"default_model": None}
    assert json.loads(current.models_file.read_text())["defaults"] == {"default_model": None}
    assert os.environ == process


@pytest.mark.parametrize("operation", [{"action": "set_default_model"}, {"action": "set_default_model", "model": MODEL, "kind": "llm"}, {"action": "set_default_model", "model": False}, {"action": "set_default_model", "model": []}, {"action": "set_default_model", "model": " \n "}, {"action": "set_default_model", "model": "vendor/only"}, {"action": "set_default_model", "model": "missing/model"}])
def test_invalid_default_operation_preserves_catalog_env_overlay_and_process(tmp_path: Path, operation: dict[str, Any]) -> None:
    current = service(tmp_path)
    before = files(current)
    process = dict(os.environ)
    with pytest.raises((ValueError, TypeError)):
        current.command({"expected_revision": revision(current.models_file), "operations": [operation]}, apply=True)
    assert files(current) == before
    assert os.environ == process


def test_later_invalid_default_rolls_back_pending_credentials_before_write(tmp_path: Path) -> None:
    current = service(tmp_path)
    command = body(current, "missing/model")
    command["operations"].insert(0, {"action": "upsert", "kind": "llm", "provider": document()["providers"][0], "credential": {"action": "set", "value": "fake-never-written"}})
    before = files(current)
    with pytest.raises(ValueError, match="configured canonical model id"):
        current.command(command, apply=True)
    assert files(current) == before


def test_activation_and_disk_failure_restore_default_and_credential_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    current = service(tmp_path)
    before = files(current)
    restored: list[bool] = []

    def fail(catalog: Any, registry: Any) -> None:
        assert catalog.defaults.default_model == MODEL
        raise RuntimeError("synthetic activation failure")

    with pytest.raises(RuntimeError, match="synthetic activation failure"):
        current.command(body(current, MODEL), apply=True, activate=fail, restore_runtime=lambda: restored.append(True))
    assert restored == [True]
    assert files(current) == before
    original = config_transaction.atomic_bytes
    failed = False

    def fail_once(path: Path, content: bytes | None, *, protected: bool = False) -> None:
        nonlocal failed
        if path.name == "models.json.bak" and not failed:
            failed = True
            raise OSError("synthetic replacement failure")
        original(path, content, protected=protected)

    monkeypatch.setattr(config_transaction, "atomic_bytes", fail_once)
    with pytest.raises(OSError, match="synthetic replacement failure"):
        current.command(body(current, MODEL), apply=True)
    assert files(current) == before


def test_invalid_overlay_and_prepare_failure_preserve_default(tmp_path: Path) -> None:
    current = service(tmp_path, tagged=True)
    overlay_path(current.models_file).write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {"unknown/model": {"tags": []}}}))
    before = files(current)
    with pytest.raises(ValueError):
        current.command(body(current, MODEL), apply=True)
    assert files(current) == before
    overlay_path(current.models_file).unlink()
    before = files(current)

    def fail(catalog: Any) -> None:
        raise ValueError("synthetic registry rejection")

    with pytest.raises(ValueError, match="synthetic registry rejection"):
        current.command(body(current, MODEL), apply=True, prepare=fail)
    assert files(current) == before


def test_referenced_provider_delete_and_cli_force_require_explicit_clear(tmp_path: Path) -> None:
    current = service(tmp_path, tagged=True)
    current.command(body(current, MODEL), apply=True)
    before = files(current)
    with pytest.raises(ValueError, match="referenced by models"):
        current.command({"expected_revision": revision(current.models_file), "operations": [{"action": "delete", "kind": "llm", "id": "test-provider"}]}, apply=True)
    for dry_run in (False, True):
        with pytest.raises(CliError, match="clear defaults.default_model") as error:
            remove_provider(runtime_paths(tmp_path), "test-provider", force=True, dry_run=dry_run)
        assert error.value.code == "provider_in_use"
        assert files(current) == before
    current.command(body(current, None), apply=True)
    result = remove_provider(runtime_paths(tmp_path), "test-provider", force=True)
    assert result["models_removed"] == 2
    assert current.read()["providers"] == []
    assert current.read()["models"] == []
    assert current.read()["defaults"] == {"default_model": None}


def test_cli_omitted_packaged_arrays_add_and_safe_snapshot_without_gateway(tmp_path: Path) -> None:
    (tmp_path / "models.json").write_bytes(TEMPLATE.read_bytes())
    (tmp_path / ".env").write_text("# keep\nPRESERVED_FIXTURE_KEY='fake-existing'\n")
    script = """
import builtins, json, os, stat, sys
from pathlib import Path
original_import = builtins.__import__
def guarded(name, *args, **kwargs):
    assert name not in {'jev_gateway.gateway', 'jev_gateway.operatorconfig'}
    return original_import(name, *args, **kwargs)
builtins.__import__ = guarded
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.providers import add_provider
from jev_gateway.catalog import catalog_from_document
from jev_gateway.provider_config import credential_snapshot, ProviderConfiguration
paths = runtime_paths(Path(sys.argv[1]))
before = paths.models.read_bytes()
process = dict(os.environ)
secret = 'fake-${PRESERVED_FIXTURE_KEY}-literal'
kwargs = dict(preset='custom', provider_id='new-fixture', provider_type='openai', api_base='https://new.invalid/v1', api_key_env='NEW_GLOBAL_FIXTURE_KEY', models=['vendor/new'], tags=[], secret=secret)
preview = add_provider(paths, **kwargs, dry_run=True)
assert preview['dry_run'] and paths.models.read_bytes() == before
assert not paths.models.with_name('models.json.bak').exists()
result = add_provider(paths, **kwargs)
assert secret not in json.dumps(result)
credentials = credential_snapshot(paths.models, external={})
assert credentials['NEW_GLOBAL_FIXTURE_KEY'] == secret
assert credentials['PRESERVED_FIXTURE_KEY'] == 'fake-existing'
saved = json.loads(paths.models.read_text())
assert saved['strategies'] == json.loads(before)['strategies']
assert saved['models'][0]['upstream_model'] == 'vendor/new'
assert paths.models.with_name('models.json.bak').read_bytes() == before
assert stat.S_IMODE(paths.models.with_name('credentials.json').stat().st_mode) == 0o600
snapshot = ProviderConfiguration(paths.models, external={}).read()
assert snapshot['models'][0]['name'] == 'new-fixture/vendor/new'
assert snapshot['providers'][0]['has_api_key']
assert snapshot['defaults'] == {'default_model': None}
assert secret not in json.dumps(snapshot)
assert os.environ == process
assert 'jev_gateway.gateway' not in sys.modules
assert 'jev_gateway.operatorconfig' not in sys.modules
print('fresh omitted-template CLI add and safe snapshot passed')
"""
    result = subprocess.run([sys.executable, "-c", script, str(tmp_path)], cwd=TEMPLATE.parents[2], env={**os.environ, "PYTHON_DOTENV_DISABLED": "1", "LITELLM_LOCAL_MODEL_COST_MAP": "true"}, text=True, capture_output=True)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize("field,value", [("providers", None), ("providers", {}), ("models", None), ("models", {})])
def test_cli_add_preserves_invalid_explicit_arrays(tmp_path: Path, field: str, value: Any) -> None:
    current = service(tmp_path)
    data = document()
    data[field] = value
    current.models_file.write_text(json.dumps(data))
    before = files(current)
    with pytest.raises(CliError, match="must be arrays"):
        add_provider(runtime_paths(tmp_path), preset="custom", provider_id="new", provider_type="openai", api_base="https://new.invalid/v1", api_key_env="NEW_GLOBAL_FIXTURE_KEY", models=["new"], tags=[], secret="fake-new")
    assert files(current) == before


def test_cli_add_invalid_default_preserves_existing_provider_models_and_keys(tmp_path: Path) -> None:
    current = service(tmp_path)
    data = json.loads(current.models_file.read_text())
    data["defaults"] = {"default_model": "unknown/model"}
    current.models_file.write_text(json.dumps(data))
    before = files(current)
    with pytest.raises(CliError, match="validation failed"):
        add_provider(runtime_paths(tmp_path), preset="custom", provider_id="new", provider_type="openai", api_base="https://new.invalid/v1", api_key_env="NEW_GLOBAL_FIXTURE_KEY", models=["new"], tags=[], secret="fake-new")
    assert files(current) == before


def test_cli_add_keeps_existing_defaults_models_credentials_and_overlay(tmp_path: Path) -> None:
    current = service(tmp_path, tagged=True)
    current.command(body(current, MODEL), apply=True)
    overlay = {"version": 1, "strategy": "task_aware", "models": {MODEL: {"tags": ["task_aware/routine", "quality/kept"], "priority": 23}}}
    overlay_path(current.models_file).write_text(json.dumps(overlay))
    before = json.loads(current.models_file.read_text())
    env = (tmp_path / ".env").read_bytes()
    overlay_bytes = overlay_path(current.models_file).read_bytes()
    process = dict(os.environ)
    result = add_provider(runtime_paths(tmp_path), preset="custom", provider_id="new", provider_type="openai", api_base="https://new.invalid/v1", api_key_env="NEW_GLOBAL_FIXTURE_KEY", models=["new"], tags=[], secret="fake-new")
    assert result["models"] == ["new/new"]
    saved = json.loads(current.models_file.read_text())
    assert saved["providers"][:-1] == before["providers"]
    assert saved["models"][:-1] == before["models"]
    assert saved["strategies"] == before["strategies"]
    assert saved["defaults"] == before["defaults"]
    assert (tmp_path / ".env").read_bytes() == env
    assert json.loads((tmp_path / "credentials.json").read_text())["values"]["NEW_GLOBAL_FIXTURE_KEY"] == "fake-new"
    assert overlay_path(current.models_file).read_bytes() == overlay_bytes
    snapshot = current.read()
    assert snapshot["defaults"] == {"default_model": MODEL}
    assert snapshot["models"][0]["priority"] == 23
    assert credential_snapshot(current.models_file, external={})["TEST_PROVIDER_KEY"] == SECRET
    assert os.environ == process


def test_import_and_global_default_share_one_validated_transaction(tmp_path: Path) -> None:
    from tests.test_provider_config import model

    current = service(tmp_path)
    command = body(current, "test-provider/vendor/new")
    command["operations"].insert(0, {"action": "import", "provider_id": "test-provider", "models": [model()], "confirmed": True})
    before = files(current)
    validated = current.command(command)
    assert validated["defaults"] == {"default_model": "test-provider/vendor/new"}
    assert validated["imported"] == 1
    assert files(current) == before
    applied = current.command(command, apply=True)
    assert applied["defaults"] == validated["defaults"]
    assert current.read()["defaults"] == validated["defaults"]
    assert current.read()["models"][-1]["name"] == "test-provider/vendor/new"


def test_http_default_auth_validate_activate_reload_and_rollback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from tests.test_provider_management_api import request
    from jev_gateway import gateway
    from jev_gateway.decision import RoutingEngine
    from jev_gateway.sessions import MemorySessionStore

    current = service(tmp_path)
    catalog = read_catalog(current)
    config = gateway.GatewayConfig(RoutingEngine(catalog, MemorySessionStore()), catalog.gateway.api_key, "derived", models_file=current.models_file)
    app = gateway.create_app(config)
    auth = {"Authorization": f"Bearer {MANAGEMENT_KEY}"}
    initial = request(app, "GET", "/v1/provider-configuration", headers=auth)
    assert initial.status_code == 200
    assert initial.json()["defaults"] == {"default_model": None}
    command = body(current, MODEL)
    before = files(current)
    for method, endpoint in (("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")):
        assert request(app, method, endpoint, json=command).status_code == 401
    assert files(current) == before
    validated = request(app, "POST", "/v1/provider-configuration/validate", headers=auth, json=command)
    assert validated.status_code == 200 and validated.json()["defaults"] == {"default_model": MODEL}
    assert config.engine.catalog.defaults.default_model is None
    assert files(current) == before
    applied = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=command)
    assert applied.status_code == 200
    assert config.engine.catalog.defaults.default_model == MODEL
    assert request(app, "PUT", "/v1/provider-configuration", headers=auth, json=command).status_code == 409
    assert config.engine.policy_snapshot()["defaults"] == {"default_model": MODEL}
    saved = json.loads(current.models_file.read_text())
    saved["defaults"] = {"default_model": OTHER_MODEL}
    current.models_file.write_text(json.dumps(saved))
    assert request(app, "POST", "/v1/routing/reload", headers=auth).status_code == 200
    assert config.engine.catalog.defaults.default_model == OTHER_MODEL
    previous = config.engine.catalog
    valid_bytes = current.models_file.read_bytes()
    saved["models"] = [entry for entry in saved["models"] if entry["upstream_model"] != "vendor/other"]
    current.models_file.write_text(json.dumps(saved))
    invalid_reload = request(app, "POST", "/v1/routing/reload", headers=auth)
    assert invalid_reload.status_code == 400
    assert config.engine.catalog is previous
    current.models_file.write_bytes(valid_bytes)
    reload_catalog = config.engine.reload_catalog

    def fail_once(candidate: Any, source: str | None = None, **kwargs: Any) -> None:
        if candidate is not previous:
            raise RuntimeError("fake-hostile-secret-error")
        reload_catalog(candidate, source, **kwargs)

    monkeypatch.setattr(config.engine, "reload_catalog", fail_once)
    before = files(current)
    failed = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body(current, None))
    assert failed.status_code == 500
    assert "fake-hostile-secret-error" not in failed.text
    assert config.engine.catalog is previous
    assert files(current) == before
    monkeypatch.setattr(config.engine, "reload_catalog", reload_catalog)
    invalid = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body(current, "missing/model"))
    assert invalid.status_code == 400
    assert files(current) == before
    cleared = request(app, "PUT", "/v1/provider-configuration", headers=auth, json=body(current, None))
    assert cleared.status_code == 200
    assert config.engine.catalog.defaults.default_model is None
    assert SECRET not in cleared.text and MANAGEMENT_KEY not in cleared.text
