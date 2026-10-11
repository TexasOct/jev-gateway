"""Named workflows use isolated synthetic files and no upstream services."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from jev_gateway.catalog import catalog_from_document
from jev_gateway.canvas_layout import layout_path, read_layout, write_layout
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.providers import remove_provider
from jev_gateway.gateway import create_app
from jev_gateway.request_facts import extract_request_facts
from jev_gateway.routing_overlay import (
    empty_workflow, load_catalog_with_overlay, merge_overlay, migrate_overlay,
    overlay_path, read_overlay, referenced_models, validate_overlay_shape, write_overlay,
)
from jev_gateway.sessions import SessionState
from jev_gateway.strategy import StrategyRegistry
from jev_gateway.strategy.contracts import RoutingRequest, SetupIncompleteError
from tests.helpers import LARGE_MODEL_ID, SMALL_MODEL_ID
from tests.test_gateway import matrix_config, request
from tests.test_routing_overlay import matrix_document

AUTH = {"Authorization": "Bearer client-key"}
CONFIGURATION = "/v1/routing/configuration"


def workflow_write(surface: dict[str, Any]) -> dict[str, Any]:
    return {"version": 2, "strategy": surface["strategy"], "selected_models": surface["selected_models"], "definition": surface["definition"]}


@pytest.mark.parametrize("selector", ["", "?strategy=task_aware"])
def test_baseline_reset_retains_explicit_selection_through_reload(tmp_path: Path, selector: str) -> None:
    config = matrix_config(tmp_path)
    document = json.loads(config.models_file.read_text())
    unreferenced = copy.deepcopy(document["models"][1])
    unreferenced.update(upstream_model="unreferenced", tags=[], quality=1, priority=-99)
    document["models"].append(unreferenced)
    document["models"][1]["capabilities"]["tools"] = False
    config.models_file.write_text(json.dumps(document))
    config.engine.reload_catalog(catalog_from_document(document, str(config.models_file)))
    app = create_app(config)
    assert request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": "Other"}).status_code == 200
    layout = {"version": 1, "nodes": {"questions": {"x": 23, "y": 56}}, "viewport": {"x": 2, "y": 3}}
    write_layout(config.models_file, layout)
    before = read_overlay(config.models_file)[0]
    facts = extract_request_facts([{"role": "user", "content": "hello"}], tools=[{"type": "function", "function": {"name": "fixture"}}])
    assert request(app, "DELETE", CONFIGURATION + selector, headers=AUTH).status_code == 200
    surface = request(app, "GET", CONFIGURATION, headers=AUTH).json()
    state = read_overlay(config.models_file)[0]
    assert state["strategies"]["Other"] == before["strategies"]["Other"]
    assert state["models"] == before["models"]
    assert read_layout(config.models_file) == (layout, None)
    assert config.models_file.read_text() == json.dumps(document)
    assert surface["selected_models"] == [SMALL_MODEL_ID, LARGE_MODEL_ID]
    for catalog in (config.engine.catalog, load_catalog_with_overlay(config.models_file)):
        definition = next(item for item in catalog.strategies if item.name == "task_aware")
        assert definition.policy.selected_models == tuple(surface["selected_models"])
        outcome = StrategyRegistry.from_catalog(catalog).get("task_aware").decide(RoutingRequest(facts, None, None, 1, 0), catalog)
        assert outcome.model == SMALL_MODEL_ID
    config.engine.close()


@pytest.mark.parametrize("version", [2.0, 1.0, True, "2", None, 3])
def test_http_versions_reject_before_write_activation_or_publication(tmp_path: Path, version: Any) -> None:
    from tests.test_gateway import make_stored_config
    from tests.test_model_transaction_publication import versions
    document = matrix_document()
    config = make_stored_config(tmp_path, document=document, gateway_api_key="client-key")
    config.models_file = tmp_path / "models.json"
    config.models_file.write_text(json.dumps(document))
    app = create_app(config)
    body = workflow_write(request(app, "GET", CONFIGURATION, headers=AUTH).json())
    body["version"] = version
    baseline = config.models_file.read_bytes()
    snapshot = config.engine.policy_snapshot()
    history = versions(config)
    for method, path in [("POST", CONFIGURATION + "/validate"), ("PUT", CONFIGURATION)]:
        response = request(app, method, path, headers=AUTH, json=body)
        assert response.status_code == 400, response.text
        assert response.json()["error"]["code"] == "invalid_configuration"
        assert config.models_file.read_bytes() == baseline
        assert not overlay_path(config.models_file).exists()
        assert not layout_path(config.models_file).exists()
        assert config.engine.policy_snapshot() == snapshot
        assert versions(config) == history
    config.engine.close()


def test_named_crud_policies_layouts_reload_and_local_removal(tmp_path: Path) -> None:
    config = matrix_config(tmp_path)
    app = create_app(config)
    baseline = config.models_file.read_bytes()
    default = request(app, "GET", CONFIGURATION, headers=AUTH).json()
    assert default["selected_models"] == [SMALL_MODEL_ID, LARGE_MODEL_ID]
    layout = {"version": 1, "nodes": {"questions": {"x": 23, "y": 56}}, "viewport": {"x": 2, "y": 3}}
    assert request(app, "PUT", "/v1/dashboard/canvas-layout", headers=AUTH, json=layout).status_code == 200
    created = request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": "Research"})
    assert created.status_code == 200, created.text
    surface = request(app, "GET", CONFIGURATION + "?strategy=Research", headers=AUTH).json()
    assert surface["selected_models"] == [] and surface["deletable"] is True
    assert request(app, "GET", CONFIGURATION, headers=AUTH).json()["questions"] == default["questions"]
    body = workflow_write(surface)
    body["selected_models"] = [SMALL_MODEL_ID]
    body["definition"]["policy"]["labels"]["routine"]["models"] = [SMALL_MODEL_ID]
    body["definition"]["options"]["questions"]["task"]["instructions"] = "Research only."
    before = overlay_path(config.models_file).read_bytes()
    assert request(app, "POST", CONFIGURATION + "/validate?strategy=Research", headers=AUTH, json=body).status_code == 200
    assert overlay_path(config.models_file).read_bytes() == before
    assert request(app, "PUT", CONFIGURATION + "?strategy=Research", headers=AUTH, json=body).status_code == 200
    other_layout = {"version": 1, "nodes": {"questions": {"x": 100, "y": 200}}, "viewport": {"x": 4, "y": 5}}
    assert request(app, "PUT", "/v1/dashboard/canvas-layout?strategy=Research", headers=AUTH, json=other_layout).status_code == 200
    assert read_layout(config.models_file) == (layout, None)
    assert read_layout(config.models_file, "Research") == (other_layout, None)
    loaded = load_catalog_with_overlay(config.models_file)
    assert next(item for item in loaded.strategies if item.name == "Research").policy.selected_models == (SMALL_MODEL_ID,)
    assert next(item for item in loaded.strategies if item.name == "task_aware").as_dict()["options"]["questions"] == default["questions"]
    state = read_overlay(config.models_file)[0]
    saved_default = copy.deepcopy(state["strategies"]["task_aware"])
    body["selected_models"] = []
    body["definition"]["policy"]["labels"]["routine"]["models"] = []
    assert request(app, "PUT", CONFIGURATION + "?strategy=Research", headers=AUTH, json=body).status_code == 200
    assert read_overlay(config.models_file)[0]["strategies"]["task_aware"] == saved_default
    assert config.models_file.read_bytes() == baseline
    assert config.engine.catalog.by_name(SMALL_MODEL_ID) is not None
    reset = request(app, "DELETE", CONFIGURATION + "?strategy=Research", headers=AUTH)
    assert reset.status_code == 200
    assert request(app, "GET", CONFIGURATION + "?strategy=Research", headers=AUTH).json()["selected_models"] == []
    assert request(app, "DELETE", "/v1/routing/strategies/Research", headers=AUTH).status_code == 200
    assert read_layout(config.models_file, "Research")[0]["nodes"] == {}
    assert not StrategyRegistry.from_catalog(load_catalog_with_overlay(config.models_file)).has("Research")
    assert request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": "Research"}).status_code == 200
    assert read_layout(config.models_file, "Research")[0]["nodes"] == {}
    config.engine.close()


@pytest.mark.parametrize("name", ["", " ", "\u00a0", " trailing ", "auto", "default", "definitions", ".", "..", "bad/name", "bad\nname", "a" * 81, "task_aware"])
def test_invalid_or_duplicate_names_preserve_files_and_runtime(tmp_path: Path, name: str) -> None:
    config = matrix_config(tmp_path)
    app = create_app(config)
    snapshot = config.engine.policy_snapshot()
    baseline = config.models_file.read_bytes()
    response = request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": name})
    assert response.status_code == 400, response.text
    assert config.engine.policy_snapshot() == snapshot
    assert config.models_file.read_bytes() == baseline
    assert not overlay_path(config.models_file).exists()
    assert not layout_path(config.models_file).exists()
    config.engine.close()


@pytest.mark.parametrize("path", ["task_aware", "missing"])
def test_default_and_unknown_deletion_are_safe(tmp_path: Path, path: str) -> None:
    config = matrix_config(tmp_path)
    app = create_app(config)
    assert request(app, "DELETE", f"/v1/routing/strategies/{path}", headers=AUTH).status_code == 400
    assert not overlay_path(config.models_file).exists()
    config.engine.close()


@pytest.mark.parametrize("name", [".Research", "Research..", "Research & review", "研究"])
def test_admitted_names_delete_through_normalized_urls(tmp_path: Path, name: str) -> None:
    from urllib.parse import quote
    import httpx
    config = matrix_config(tmp_path)
    app = create_app(config)
    assert request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": name}).status_code == 200
    url = httpx.URL("http://test/v1/routing/strategies/" + quote(name, safe=""))
    assert request(app, "DELETE", str(url), headers=AUTH).status_code == 200
    assert not config.engine.strategies.has(name)
    config.engine.close()


@pytest.mark.parametrize("mutation", ["unknown", "duplicate", "null", "foreign_pool", "extra", "selector", "credentials", "missing_question", "priority", "pool_shape"])
def test_invalid_selected_workflows_do_not_activate(tmp_path: Path, mutation: str) -> None:
    config = matrix_config(tmp_path)
    app = create_app(config)
    body = workflow_write(request(app, "GET", CONFIGURATION, headers=AUTH).json())
    if mutation == "unknown": body["selected_models"] = ["missing/model"]
    elif mutation == "duplicate": body["selected_models"] *= 2
    elif mutation == "null": body["selected_models"] = None
    elif mutation == "foreign_pool": body["selected_models"] = []
    elif mutation == "extra": body["models"] = {}
    elif mutation == "selector": body["strategy"] = "foreign"
    elif mutation == "credentials": body["definition"]["gateway"] = {"api_key_env": "secret"}
    elif mutation == "missing_question": body["definition"]["options"]["questions"] = {}
    elif mutation == "priority": body["definition"]["policy"]["priority"] = 7
    elif mutation == "pool_shape": body["definition"]["policy"]["labels"]["simple"] = []
    before = config.engine.policy_snapshot()
    for method, path in [("POST", CONFIGURATION + "/validate?strategy=task_aware"), ("PUT", CONFIGURATION + "?strategy=task_aware")]:
        response = request(app, method, path, headers=AUTH, json=body)
        assert response.status_code == 400, response.text
        assert response.json()["error"]["code"] == "invalid_configuration"
        assert config.engine.policy_snapshot() == before
        assert not overlay_path(config.models_file).exists()
    config.engine.close()


def test_v1_migration_preserves_overrides_and_only_referenced_nodes(tmp_path: Path) -> None:
    document = matrix_document()
    document["models"].append({"provider": "small-provider", "upstream_model": "unreferenced"})
    document["policy"] = {"labels": {"routine": {"tag": "task_aware/routine"}, "unused": {"tag": "task_aware/unused"}}}
    document["strategies"]["task_aware"]["options"].update(rules=[], fallback={"label": "routine"})
    document["defaults"] = {"default_model": SMALL_MODEL_ID}
    document["models"][1]["tags"] = ["task_aware/unused"]
    legacy = {"version": 1, "strategy": "task_aware", "rules": [], "fallback": {"label": "routine"}, "models": {SMALL_MODEL_ID: {"priority": 73, "tags": ["foreign/keep"]}}}
    models_file = tmp_path / "models.json"
    models_file.write_text(json.dumps(document))
    baseline = models_file.read_bytes()
    write_overlay(models_file, legacy)
    effective = load_catalog_with_overlay(models_file)
    state = migrate_overlay(legacy, effective)
    assert state["models"] == legacy["models"]
    assert state["strategies"]["task_aware"]["selected_models"] == [SMALL_MODEL_ID]
    migrated = catalog_from_document(merge_overlay(document, state), "migrated")
    profile = migrated.by_name(SMALL_MODEL_ID)
    assert profile is not None and profile.priority == 73
    assert models_file.read_bytes() == baseline
    assert read_overlay(models_file)[0] == legacy
    assert next(item for item in migrated.strategies if item.name == "task_aware").as_dict()["options"] == next(item for item in effective.strategies if item.name == "task_aware").as_dict()["options"]


@pytest.mark.parametrize("mode", ["sticky", "cached", "fresh", "escalate"])
def test_runtime_selection_default_widening_and_pins_stay_selected(mode: str) -> None:
    document = matrix_document()
    document["defaults"] = {"default_model": LARGE_MODEL_ID}
    document["strategies"]["task_aware"].update(selected_models=[SMALL_MODEL_ID], mode=mode)
    catalog = catalog_from_document(document, "selected")
    strategy = StrategyRegistry.from_catalog(catalog).get("task_aware")
    facts = extract_request_facts([{"role": "user", "content": "hello"}], tools=[{"type": "function", "function": {"name": "fixture"}}])
    outcome = strategy.decide(RoutingRequest(facts, None, None, 1, 0), catalog)
    assert outcome.model == SMALL_MODEL_ID
    session = SessionState(session_id="fixture", route=LARGE_MODEL_ID, tier="simple", created_at=0, updated_at=0, switched_at=0)
    assert strategy.decide(RoutingRequest(facts, session, None, 2, 1), catalog).model == SMALL_MODEL_ID
    document["strategies"]["task_aware"]["selected_models"] = []
    empty = catalog_from_document(document, "empty")
    with pytest.raises(SetupIncompleteError):
        StrategyRegistry.from_catalog(empty).get("task_aware").decide(RoutingRequest(facts, None, None, 1, 0), empty)


def test_partial_model_can_be_selected_and_empty_strategy_cannot_inherit_default(tmp_path: Path) -> None:
    document = matrix_document()
    document["models"].append({"provider": "small-provider", "upstream_model": "partial", "capabilities": {"tools": False}, "cost": {"input_per_million": 0}})
    catalog = catalog_from_document(document, "partial")
    state = migrate_overlay({}, catalog)
    state["strategies"]["empty"] = empty_workflow("empty")
    merged = merge_overlay(document, state)
    merged["defaults"] = {"default_model": SMALL_MODEL_ID}
    parsed = catalog_from_document(merged, "empty")
    facts = extract_request_facts([{"role": "user", "content": "hello"}])
    with pytest.raises(SetupIncompleteError):
        StrategyRegistry.from_catalog(parsed).get("empty").decide(RoutingRequest(facts, None, None, 1, 0), parsed)
    entry = state["strategies"]["empty"]
    entry["selected_models"] = ["small-provider/partial"]
    entry["definition"]["policy"]["labels"]["routine"]["models"] = ["small-provider/partial"]
    parsed = catalog_from_document(merge_overlay(document, state), "partial")
    assert StrategyRegistry.from_catalog(parsed).get("empty").decide(RoutingRequest(facts, None, None, 1, 0), parsed).model == "small-provider/partial"


def test_strategy_create_activation_failure_restores_overlay_layout_modes_and_runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    config = matrix_config(tmp_path)
    app = create_app(config)
    write_overlay(config.models_file, {"version": 1, "strategy": "task_aware", "rules": []})
    write_layout(config.models_file, {"version": 1, "nodes": {"questions": {"x": 9, "y": 8}}, "viewport": {"x": 1, "y": 2}})
    paths = [config.models_file, overlay_path(config.models_file), layout_path(config.models_file)]
    for path in paths: path.chmod(0o640)
    before = {path: (path.read_bytes(), path.stat().st_mode) for path in paths}
    runtime = config.engine.policy_snapshot()
    reload = config.engine.reload_catalog
    calls = 0
    def fail_once(*args: Any, **kwargs: Any) -> None:
        nonlocal calls
        calls += 1
        if calls == 1: raise RuntimeError("synthetic activation failure")
        reload(*args, **kwargs)
    monkeypatch.setattr(config.engine, "reload_catalog", fail_once)
    response = request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": "new"})
    assert response.status_code == 500
    assert {path: (path.read_bytes(), path.stat().st_mode) for path in paths} == before
    assert config.engine.policy_snapshot() == runtime
    assert calls == 2 and not (tmp_path / ".provider-configuration.recovery").exists()
    config.engine.close()


@pytest.mark.parametrize("version", [True, 3, 2.0])
def test_overlay_version_is_strict(version: Any) -> None:
    with pytest.raises(ValueError):
        validate_overlay_shape({"version": version, "strategies": {}, "deleted_strategies": [], "models": {}})


def test_baseline_strategy_tombstone_and_scoped_reset_preserve_other_state(tmp_path: Path) -> None:
    document = matrix_document()
    document["strategies"]["alternate"] = copy.deepcopy(document["strategies"]["task_aware"])
    config = matrix_config(tmp_path)
    config.models_file.write_text(json.dumps(document))
    config.engine.reload_catalog(catalog_from_document(document, "fixture"))
    app = create_app(config)
    assert request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": "new"}).status_code == 200
    saved_new = copy.deepcopy(read_overlay(config.models_file)[0]["strategies"]["new"])
    assert request(app, "DELETE", "/v1/routing/strategies/alternate", headers=AUTH).status_code == 200
    assert read_overlay(config.models_file)[0]["deleted_strategies"] == ["alternate"]
    assert not StrategyRegistry.from_catalog(load_catalog_with_overlay(config.models_file)).has("alternate")
    assert request(app, "DELETE", CONFIGURATION, headers=AUTH).status_code == 200
    state = read_overlay(config.models_file)[0]
    assert state["strategies"]["new"] == saved_new
    assert state["deleted_strategies"] == ["alternate"]
    config.engine.close()


@pytest.mark.parametrize("apply", [False, True])
def test_force_supplier_removal_reconciles_v2_references_and_layout_atomically(tmp_path: Path, apply: bool) -> None:
    paths = runtime_paths(tmp_path)
    document = matrix_document()
    document["policy"] = {"labels": {"routine": {"tag": "task_aware/routine"}}}
    document["models"][0]["tags"] = ["task_aware/routine", "foreign/keep"]
    document["models"][1]["tags"] = ["task_aware/routine"]
    document["strategies"]["task_aware"]["options"].update(rules=[], fallback={"label": "routine"})
    paths.models.write_text(json.dumps(document))
    state = migrate_overlay({}, catalog_from_document(document, "supplier"))
    state["strategies"]["other"] = copy.deepcopy(state["strategies"]["task_aware"])
    for entry in state["strategies"].values():
        entry["definition"]["policy"]["labels"] = {"routine": {"models": [SMALL_MODEL_ID, LARGE_MODEL_ID]}}
    write_overlay(paths.models, state)
    layout = {"version": 1, "nodes": {f"model::{SMALL_MODEL_ID}": {"x": 9, "y": 8}, f"model::{LARGE_MODEL_ID}": {"x": 7, "y": 6}}, "viewport": {"x": 1, "y": 2}}
    write_layout(paths.models, layout, "other")
    before = {path: path.read_bytes() for path in [paths.models, overlay_path(paths.models), layout_path(paths.models)]}
    result = remove_provider(paths, "small-provider", force=True, dry_run=not apply)
    assert result["models_removed"] == 1
    if not apply:
        assert {path: path.read_bytes() for path in before} == before
        return
    saved = json.loads(paths.models.read_text())
    assert saved["models"] == [document["models"][1]]
    assert saved["providers"] == [document["providers"][1]]
    for entry in read_overlay(paths.models)[0]["strategies"].values():
        assert entry["selected_models"] == [LARGE_MODEL_ID]
        assert entry["definition"]["policy"]["labels"]["routine"]["models"] == [LARGE_MODEL_ID]
    assert read_layout(paths.models, "other")[0]["nodes"] == {f"model::{LARGE_MODEL_ID}": {"x": 7, "y": 6}}
    assert load_catalog_with_overlay(paths.models).names() == [LARGE_MODEL_ID]


@pytest.mark.parametrize("key,status", [(None, 403), ("wrong", 401), ("client-key", 400)])
def test_strategy_auth_guards_precede_malformed_creation(tmp_path: Path, key: str | None, status: int) -> None:
    config = matrix_config(tmp_path, key=None if key is None else "client-key")
    app = create_app(config)
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    response = request(app, "POST", "/v1/routing/strategies", headers=headers, content="{broken")
    assert response.status_code == status
    assert not overlay_path(config.models_file).exists()
    config.engine.close()


def test_selected_empty_default_reports_setup_and_http_unavailable_without_upstream(tmp_path: Path) -> None:
    from jev_gateway.setup import setup_projection
    config = matrix_config(tmp_path)
    app = create_app(config)
    body = workflow_write(request(app, "GET", CONFIGURATION, headers=AUTH).json())
    body["selected_models"] = []
    for route in body["definition"]["policy"]["labels"].values(): route["models"] = []
    assert request(app, "PUT", CONFIGURATION, headers=AUTH, json=body).status_code == 200
    assert setup_projection(config.engine.catalog, "fixture")["routing_ready"] is False
    response = request(app, "POST", "/v1/routing/preview", headers=AUTH, json={"model": "task_aware", "messages": [{"role": "user", "content": "hello"}]})
    assert response.status_code == 503 and response.json()["error"]["code"] == "setup_incomplete"
    config.engine.close()


def test_disabled_selected_model_and_unselected_default_cannot_route() -> None:
    document = matrix_document()
    document["strategies"]["task_aware"]["selected_models"] = [SMALL_MODEL_ID]
    document["models"][0]["enabled"] = False
    document["defaults"] = {"default_model": LARGE_MODEL_ID}
    catalog = catalog_from_document(document, "disabled")
    strategy = StrategyRegistry.from_catalog(catalog).get("task_aware")
    facts = extract_request_facts([{"role": "user", "content": "hello"}])
    with pytest.raises(SetupIncompleteError):
        strategy.decide(RoutingRequest(facts, None, None, 1, 0), catalog)
    document["models"][0]["enabled"] = True
    catalog = catalog_from_document(document, "manual")
    strategy = StrategyRegistry.from_catalog(catalog).get("task_aware")
    with pytest.raises(SetupIncompleteError, match="not selected"):
        strategy.decide(RoutingRequest(facts, None, catalog.by_name(LARGE_MODEL_ID), 1, 0), catalog)


@pytest.mark.parametrize("overlay", [{}, {"version": 1, "strategy": "task_aware", "rules": []}])
def test_supplier_reconciliation_preserves_legacy_absent_model_overrides(overlay: dict[str, Any]) -> None:
    from jev_gateway.routing_overlay import reconcile_model_references
    assert reconcile_model_references(overlay, {SMALL_MODEL_ID}) == overlay


def test_strategy_activation_failure_does_not_publish_sqlite_candidate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from tests.test_gateway import make_stored_config
    from tests.test_model_transaction_publication import versions
    document = matrix_document()
    config = make_stored_config(tmp_path, document=document, gateway_api_key="client-key")
    config.models_file = tmp_path / "models.json"
    config.models_file.write_text(json.dumps(document))
    app = create_app(config)
    before = versions(config)
    original = config.engine.reload_catalog
    def fail_after_activation(*args: Any, **kwargs: Any) -> None:
        original(*args, **kwargs)
        if any(definition.name == "candidate" for definition in args[0].strategies):
            raise RuntimeError("synthetic post-activation failure")
    monkeypatch.setattr(config.engine, "reload_catalog", fail_after_activation)
    failed = request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": "candidate"})
    assert failed.status_code == 500
    assert versions(config) == before
    assert not config.engine.strategies.has("candidate")
    assert not overlay_path(config.models_file).exists() and not layout_path(config.models_file).exists()
    config.engine.close()


def test_creation_migrates_current_disk_v1_options_instead_of_stale_active_options(tmp_path: Path) -> None:
    config = matrix_config(tmp_path)
    app = create_app(config)
    legacy = {"version": 1, "strategy": "task_aware", "rules": [], "fallback": {"label": "simple"}}
    write_overlay(config.models_file, legacy)
    response = request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": "new"})
    assert response.status_code == 200, response.text
    entry = read_overlay(config.models_file)[0]["strategies"]["task_aware"]
    assert entry["definition"]["options"]["rules"] == []
    assert entry["definition"]["options"]["fallback"] == {"label": "simple"}
    assert entry["selected_models"] == [SMALL_MODEL_ID]
    config.engine.close()


def test_creation_rejects_late_baseline_name_collision_without_rewriting_it(tmp_path: Path) -> None:
    config = matrix_config(tmp_path)
    app = create_app(config)
    document = json.loads(config.models_file.read_text())
    document["strategies"]["late"] = {"kind": "policy"}
    config.models_file.write_text(json.dumps(document))
    before = config.models_file.read_bytes()
    response = request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": "late"})
    assert response.status_code == 400
    assert config.models_file.read_bytes() == before and not overlay_path(config.models_file).exists()
    assert not config.engine.strategies.has("late")
    config.engine.close()


def test_legacy_write_cannot_mutate_global_tags_after_named_migration(tmp_path: Path) -> None:
    config = matrix_config(tmp_path)
    app = create_app(config)
    assert request(app, "POST", "/v1/routing/strategies", headers=AUTH, json={"name": "new"}).status_code == 200
    before = overlay_path(config.models_file).read_bytes()
    baseline = config.models_file.read_bytes()
    for name in ["new", "task_aware"]:
        body = {"version": 1, "strategy": name, "models": {SMALL_MODEL_ID: {"tags": ["foreign/mutated"], "priority": 99}}}
        response = request(app, "PUT", CONFIGURATION, headers=AUTH, json=body)
        assert response.status_code == 400
        assert "read-only" in response.json()["error"]["message"]
        assert config.models_file.read_bytes() == baseline
        assert overlay_path(config.models_file).read_bytes() == before
    config.engine.close()
