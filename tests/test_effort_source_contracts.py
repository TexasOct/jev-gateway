"""Canonical routing confirmations and bounded raw provenance transactions."""
from __future__ import annotations

import copy
import json
import socket
import sqlite3
import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import uvicorn

from jev_gateway import gateway, provider_config
from jev_gateway.catalog import model_metadata
from jev_gateway.cli.main import main as cli_main
from jev_gateway.reasoning import EFFORT_LADDER
from jev_gateway.records import SqliteRecordStore
from tests.helpers import turns
from tests.test_activation_publication import runtime
from tests.test_gateway import install_completion
from tests.test_provider_config import model
from tests.test_provider_management_api import headers, request


def metadata(effort: Any, *, status: str = "confirmed", method: str = "source") -> dict[str, Any]:
    return {"version": 1, "sources": [{"id": "来源", "source": "供应商 evidence",
             "url": "https://example.org/evidence", "fetched_at": "2026-10-06T00:00:00Z",
             "source_updated_at": "2026-10-05", "applicable": True,
             "source_reasoning_effort": [None, "vendor/自由", "high", "low", "low"],
             "fields": {"reasoning_effort": {"value": ["vendor/自由", None, "low", "low"],
                        "source_field": "声明.effort", "unit": "vendor unit", "source_unit": "原始"}}}],
            "fields": {"reasoning_effort": {"status": status, "value": effort,
                       "source_ids": ["来源"], "method": method, "confirmed_at": "2026-10-06T00:01:00Z"}},
            "confirmation": {"method": "manual", "confirmed_at": "2026-10-06T00:02:00Z"}}


def version_rows(config: gateway.GatewayConfig) -> list[Any]:
    store = config.engine.record_store
    assert isinstance(store, SqliteRecordStore)
    store.flush()
    with sqlite3.connect(store.path) as db:
        return db.execute("SELECT * FROM config_versions ORDER BY config_hash").fetchall()


def files(root: Path) -> dict[str, Any]:
    names = ("models.json", "models.json.bak", ".env", ".env.backup", "credentials.json",
             "credentials.json.backup", "routing-overrides.json", ".provider-configuration.recovery",
             "dashboard-theme.json", "routing-canvas-layout.json")
    return {name: (p.read_bytes(), p.stat().st_mode & 0o7777) if (p := root / name).exists() else None for name in names}


def body(config: gateway.GatewayConfig, entry: dict[str, Any], action: str) -> dict[str, Any]:
    operation = {"action": "update_model", "model_id": "test-provider/vendor/only", "model": entry} if action == "update" else {
        "action": "import", "provider_id": "test-provider", "confirmed": True, "models": [entry]}
    return {"expected_revision": provider_config.revision(config.models_file), "operations": [operation]}


@pytest.fixture
def active(tmp_path: Path) -> Iterator[tuple[Any, gateway.GatewayConfig]]:
    app, config = runtime(tmp_path)
    assert isinstance(config.engine.record_store, SqliteRecordStore)
    try:
        yield app, config
    finally:
        config.engine.close()


@pytest.mark.parametrize("action", ["update", "import"])
@pytest.mark.parametrize("method", ["source", "manual"])
@pytest.mark.parametrize("effort", [[], ["high", "low"], ["low", "low"], ["low"] * 17, list(reversed(EFFORT_LADDER))])
def test_canonical_write_agrees_on_disk_get_runtime_reload_and_cli(
    active: tuple[Any, gateway.GatewayConfig], action: str, method: str, effort: list[str], capsys: pytest.CaptureFixture[str],
) -> None:
    app, config = active
    entry = model("vendor/only" if action == "update" else "vendor/new")
    entry["capabilities"]["reasoning_effort"] = copy.deepcopy(effort)
    entry["metadata"] = metadata(copy.deepcopy(effort), method=method)
    original = copy.deepcopy(entry)
    expected = [level for level in EFFORT_LADDER if level in effort]
    payload = body(config, entry, action)
    before = files(config.models_file.parent)
    rows = version_rows(config)
    assert request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=payload).status_code == 200
    assert files(config.models_file.parent) == before and version_rows(config) == rows
    response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=payload)
    assert response.status_code == 200
    assert entry == original
    saved = json.loads(config.models_file.read_text())["models"][-1 if action == "import" else 0]
    get = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"][-1 if action == "import" else 0]
    for record in (saved, get, response.json()["models"][-1 if action == "import" else 0]):
        assert record["capabilities"]["reasoning_effort"] == expected
        assert record["metadata"]["fields"]["reasoning_effort"]["value"] == expected
        expected_metadata = copy.deepcopy(original["metadata"])
        expected_metadata["fields"]["reasoning_effort"]["value"] = expected
        assert record["metadata"] == expected_metadata
    profile = config.engine.catalog.by_name("test-provider/" + entry["upstream_model"])
    assert profile is not None and list(profile.capabilities.reasoning_effort) == expected
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    restarted = gateway.load_gateway_config(config.models_file)
    try:
        profile = restarted.engine.catalog.by_name("test-provider/" + entry["upstream_model"])
        assert profile is not None and profile.as_dict()["metadata"] == saved["metadata"]
    finally:
        restarted.engine.close()
    assert cli_main(["--home", str(config.models_file.parent), "--json", "config", "validate"]) == 0
    capsys.readouterr()
    assert cli_main(["--home", str(config.models_file.parent), "--json", "config", "show"]) == 0
    output = json.loads(capsys.readouterr().out)
    assert output["data"]["sections"]["models"]["value"][-1 if action == "import" else 0]["metadata"] == saved["metadata"]


@pytest.mark.parametrize("status,value", [("known", ["high", "low", "low"]), ("confirmed", []),
                                          ("known", None), ("confirmed", None), ("unknown", None), ("conflict", None)])
def test_metadata_copy_preserves_null_ownership_and_raw_history(status: str, value: Any) -> None:
    original = metadata(value, status=status)
    baseline = copy.deepcopy(original)
    result = model_metadata(original)
    assert original == baseline and result is not original
    assert result["sources"] == original["sources"]
    assert result["confirmation"] == original["confirmation"]
    expected = ["low", "high"] if isinstance(value, list) and value else value
    assert result["fields"]["reasoning_effort"]["value"] == expected
    result["sources"][0]["source_reasoning_effort"].append("isolated")
    assert original == baseline


@pytest.mark.parametrize("state", ["absent", "null", "empty"])
def test_import_does_not_invent_optional_metadata(state: str) -> None:
    entry = model()
    if state != "absent":
        entry["metadata"] = None if state == "null" else {}
    if state == "empty":
        with pytest.raises(ValueError, match="version"):
            provider_config._import_model(entry, "test-provider")
        return
    result = provider_config._import_model(entry, "test-provider")
    assert ("metadata" in result) == (state == "null")
    if state == "null":
        assert result["metadata"] is None


def test_import_compares_canonical_semantics_and_does_not_mutate_the_input() -> None:
    entry = model()
    entry["capabilities"]["reasoning_effort"] = ["high", "low", "low"]
    entry["metadata"] = metadata(["low", "high"])
    original = copy.deepcopy(entry)
    result = provider_config._import_model(entry, "test-provider")
    assert entry == original
    assert result["capabilities"]["reasoning_effort"] == ["low", "high"]
    assert result["metadata"]["fields"]["reasoning_effort"]["value"] == ["low", "high"]
    result["metadata"]["sources"][0]["source_reasoning_effort"].append("isolated")
    assert entry == original


def test_legacy_catalog_projects_canonical_evidence_without_writing(active: tuple[Any, gateway.GatewayConfig]) -> None:
    app, config = active
    document = json.loads(config.models_file.read_text())
    document["models"][0].setdefault("capabilities", {})["reasoning_effort"] = ["high", "low", "low"]
    document["models"][0]["metadata"] = metadata(["high", "low", "low"])
    config.models_file.write_text(json.dumps(document))
    before = files(config.models_file.parent)
    projected = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"][0]
    assert projected["metadata"]["fields"]["reasoning_effort"]["value"] == ["low", "high"]
    assert projected["capabilities"]["reasoning_effort"] == ["low", "high"]
    assert files(config.models_file.parent) == before


def test_runtime_duplicates_and_raw_sixteen_entry_arrays_have_separate_bounds(
    active: tuple[Any, gateway.GatewayConfig],
) -> None:
    app, config = active
    entry = model("vendor/only")
    entry["capabilities"]["reasoning_effort"] = ["low"] * 17
    entry["metadata"] = metadata(["low"] * 17)
    raw = [None, "供应商/freeform"] * 8
    entry["metadata"]["sources"][0]["source_reasoning_effort"] = copy.deepcopy(raw)
    entry["metadata"]["sources"][0]["fields"]["reasoning_effort"]["value"] = copy.deepcopy(raw)
    assert request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body(config, entry, "update")).status_code == 200
    saved = json.loads(config.models_file.read_text())["models"][0]
    assert saved["capabilities"]["reasoning_effort"] == ["low"]
    assert saved["metadata"]["fields"]["reasoning_effort"]["value"] == ["low"]
    assert saved["metadata"]["sources"][0]["source_reasoning_effort"] == raw
    assert saved["metadata"]["sources"][0]["fields"]["reasoning_effort"]["value"] == raw


@pytest.mark.parametrize("action", ["update", "import"])
@pytest.mark.parametrize("bad", ["mismatch", "unknown-token", "source17", "fields17", "source33", "missing-reference", "unknown-nonnull", "conflict-nonnull", "oversize-duplicates"])
def test_invalid_records_preserve_files_sqlite_runtime_and_healthy_chat(
    active: tuple[Any, gateway.GatewayConfig], action: str, bad: str, monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, config = active
    entry = model("vendor/only" if action == "update" else "vendor/new")
    entry["capabilities"]["reasoning_effort"] = ["low"]
    entry["metadata"] = metadata(["low"])
    data = entry["metadata"]
    if bad == "mismatch":
        data["fields"]["reasoning_effort"]["value"] = ["high"]
    elif bad == "unknown-token":
        entry["capabilities"]["reasoning_effort"] = ["moderate"]
    elif bad == "source17":
        data["sources"][0]["source_reasoning_effort"] = ["自由"] * 17
    elif bad == "fields17":
        data["sources"][0]["fields"]["reasoning_effort"]["value"] = [None] * 17
    elif bad == "source33":
        data["sources"] = [{"id": str(i)} for i in range(33)]
        data["fields"]["reasoning_effort"]["source_ids"] = ["0"]
    elif bad == "missing-reference":
        data["fields"]["reasoning_effort"]["source_ids"] = ["absent\x7f"]
    elif bad in {"unknown-nonnull", "conflict-nonnull"}:
        data["fields"]["reasoning_effort"]["status"] = bad.split("-")[0]
    else:
        data["fields"]["reasoning_effort"]["value"] = ["low"] * 40000
        assert len(json.dumps(data, ensure_ascii=False).encode()) > 262144
    before, rows = files(config.models_file.parent), version_rows(config)
    old = (config.engine.catalog, config.engine.strategies, config.engine.config_hash)
    response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body(config, entry, action))
    assert response.status_code == 400
    assert files(config.models_file.parent) == before and version_rows(config) == rows
    assert config.engine.catalog is old[0] and config.engine.strategies is old[1] and config.engine.config_hash == old[2]
    calls = install_completion(monkeypatch)
    assert request(app, "POST", "/v1/chat/completions", headers=headers(config), json={"model": "task_aware", "messages": turns("healthy synthetic")}).status_code == 200
    assert len(calls) == 1 and version_rows(config) == rows


@pytest.mark.parametrize("slot", ["id", "source", "fetched_at", "source_updated_at", "provider_id", "model_id", "unit", "field_path", "source_unit", "schema_revision", "canonical_model_id", "source_field", "field_unit", "field_source_unit", "source_reasoning_effort", "field_reasoning_effort"])
@pytest.mark.parametrize("marker", ["正常证据", "\x00", "\x1f", "\x7f"], ids=["unicode", "NUL", "C0", "DEL"])
def test_every_raw_text_slot_rejects_controls_with_rebound_references(
    active: tuple[Any, gateway.GatewayConfig], slot: str, marker: str,
) -> None:
    app, config = active
    entry = model("vendor/only")
    entry["capabilities"]["reasoning_effort"] = ["low"]
    data = metadata(["low"])
    source, text = data["sources"][0], "evidence-" + marker
    if slot == "id":
        source[slot] = text
        data["fields"]["reasoning_effort"]["source_ids"] = [text]
    elif slot == "source_reasoning_effort":
        source[slot] = [text, None]
    elif slot == "field_reasoning_effort":
        source["fields"]["reasoning_effort"]["value"] = [text, None]
    elif slot in {"source_field", "field_unit", "field_source_unit"}:
        source["fields"]["reasoning_effort"][slot.removeprefix("field_")] = text
    else:
        source[slot] = text
    entry["metadata"] = data
    before, rows = files(config.models_file.parent), version_rows(config)
    old = (config.engine.catalog, config.engine.strategies, config.engine.config_hash)
    response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body(config, entry, "update"))
    assert response.status_code == (200 if marker == "正常证据" else 400)
    if marker != "正常证据":
        assert files(config.models_file.parent) == before and version_rows(config) == rows
        assert config.engine.catalog is old[0] and config.engine.strategies is old[1] and config.engine.config_hash == old[2]
        assert text not in response.text and len(response.text) < 1024


def sized_metadata(size: int, number: int | float) -> dict[str, Any]:
    data = metadata(["high", "low"] * 9)
    data["fields"]["input_per_million"] = {"status": "known", "value": number}
    data["sources"] = [{"id": "来源" if i == 0 else str(i), "source_reasoning_effort": [None, "自由"] * 8} for i in range(32)]
    for source in data["sources"]:
        for key in ("source", "provider_id", "model_id", "unit", "field_path", "schema_revision"):
            source[key] = ""
    left = size - len(json.dumps(data, ensure_ascii=False, allow_nan=False).encode())
    for source in data["sources"]:
        for key in ("source", "provider_id", "model_id", "unit", "field_path", "schema_revision"):
            count = min(left // 3, 512)
            source[key] = "证" * count
            left -= count * 3
            tail = min(left, 512 - count)
            source[key] += "x" * tail
            left -= tail
    assert left == 0
    assert len(json.dumps(data, ensure_ascii=False, allow_nan=False).encode()) == size
    return data


@pytest.mark.parametrize("size", [262143, 262144, 262145])
@pytest.mark.parametrize("number", [1, 1.0, 1e-6, 0.00009999, 0.0001])
def test_original_utf8_numeric_envelope_bound_precedes_effort_projection(
    active: tuple[Any, gateway.GatewayConfig], size: int, number: int | float,
) -> None:
    app, config = active
    entry = model("vendor/only")
    entry["capabilities"]["reasoning_effort"] = ["high", "low"]
    entry["metadata"] = sized_metadata(size, number)
    before, rows = files(config.models_file.parent), version_rows(config)
    # Actual JSON tokens are decoded by the HTTP boundary before authoritative size validation.
    wire = json.dumps(body(config, entry, "update"), ensure_ascii=False)
    response = request(app, "PUT", "/v1/provider-configuration", headers={**headers(config), "Content-Type": "application/json"}, content=wire)
    assert response.status_code == (200 if size <= 262144 else 400)
    if size > 262144:
        assert files(config.models_file.parent) == before and version_rows(config) == rows
    else:
        stored = json.loads(config.models_file.read_text())["models"][0]
        assert stored["metadata"]["fields"]["reasoning_effort"]["value"] == ["low", "high"]
        assert stored["metadata"]["sources"] == entry["metadata"]["sources"]


@pytest.mark.parametrize("token,parsed", [("1", 1), ("1e0", 1.0), ("0.000001", 1e-6), ("1e-6", 1e-6)])
def test_wire_numeric_tokens_use_python_types_at_the_exact_envelope_limit(
    active: tuple[Any, gateway.GatewayConfig], token: str, parsed: int | float,
) -> None:
    app, config = active
    entry = model("vendor/only")
    entry["capabilities"]["reasoning_effort"] = ["low", "high"]
    entry["metadata"] = sized_metadata(262144, parsed)
    payload = body(config, entry, "update")
    wire = json.dumps(payload, ensure_ascii=False)
    needle = '"input_per_million": {"status": "known", "value": ' + json.dumps(parsed) + "}"
    replacement = '"input_per_million": {"status": "known", "value": ' + token + "}"
    assert wire.count(needle) == 1
    wire = wire.replace(needle, replacement)
    decoded = json.loads(wire)["operations"][0]["model"]["metadata"]
    assert type(decoded["fields"]["input_per_million"]["value"]) is type(parsed)
    assert len(json.dumps(decoded, ensure_ascii=False).encode()) == 262144
    response = request(app, "PUT", "/v1/provider-configuration", headers={**headers(config), "Content-Type": "application/json"}, content=wire)
    assert response.status_code == 200
    saved = json.loads(config.models_file.read_text())["models"][0]
    assert type(saved["metadata"]["fields"]["input_per_million"]["value"]) is type(parsed)


def test_real_http_rejections_and_activation_rollback_allow_later_chat(
    active: tuple[Any, gateway.GatewayConfig], monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, config = active
    calls = install_completion(monkeypatch)
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    ready = threading.Event()

    class Server(uvicorn.Server):
        async def startup(self, sockets: list[socket.socket] | None = None) -> None:
            await super().startup(sockets)
            ready.set()

    server = Server(uvicorn.Config(app, log_config=None, access_log=False, lifespan="off"))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]})
    thread.start()
    try:
        assert ready.wait(10)
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", trust_env=False) as client:
            for action in ("import", "update"):
                entry = model("vendor/new" if action == "import" else "vendor/only")
                entry["capabilities"]["reasoning_effort"] = ["low"]
                entry["metadata"] = metadata(["high"])
                before, rows = files(config.models_file.parent), version_rows(config)
                response = client.put("/v1/provider-configuration", headers=headers(config), json=body(config, entry, action))
                assert response.status_code == 400
                entry["metadata"] = metadata(["low"])
                entry["metadata"]["sources"][0]["source"] = "bad\x7f"
                assert client.put("/v1/provider-configuration", headers=headers(config), json=body(config, entry, action)).status_code == 400
                assert files(config.models_file.parent) == before and version_rows(config) == rows
            reload = config.engine.reload_catalog
            previous = config.engine.catalog

            def fail(catalog: Any, *args: Any, **kwargs: Any) -> None:
                reload(catalog, *args, **kwargs)
                if catalog is not previous:
                    raise RuntimeError("synthetic activation failure")

            entry = model("vendor/only")
            entry["capabilities"]["reasoning_effort"] = ["high", "low", "low"]
            entry["metadata"] = metadata(["low", "high"])
            before, rows = files(config.models_file.parent), version_rows(config)
            registry, digest = config.engine.strategies, config.engine.config_hash
            monkeypatch.setattr(config.engine, "reload_catalog", fail)
            assert client.put("/v1/provider-configuration", headers=headers(config), json=body(config, entry, "update")).status_code == 500
            assert files(config.models_file.parent) == before and version_rows(config) == rows
            assert config.engine.catalog is previous and config.engine.strategies is registry and config.engine.config_hash == digest
            monkeypatch.setattr(config.engine, "reload_catalog", reload)
            assert client.post("/v1/chat/completions", headers=headers(config), json={"model": "task_aware", "messages": turns("healthy after rollback")}).status_code == 200
            assert len(calls) == 1 and version_rows(config) == rows
    finally:
        server.should_exit = True
        thread.join(10)
        listener.close()
        assert not thread.is_alive()
        with socket.socket() as probe:
            assert probe.connect_ex(("127.0.0.1", port)) != 0
