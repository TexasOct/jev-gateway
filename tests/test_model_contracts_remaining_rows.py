"""Contracts business closure: X1-X7, T2-T4 and M9 cross-layer joins.

These cases extend the existing owner seams. The UI draft shape is mirrored
faithfully from ``frontend/src/features/providers/models/model.ts`` and
``ModelManagementView.tsx`` so the real ``update_model`` payload is exercised
through genuine ASGI, files and SQLite rather than a response-derived oracle.
"""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import gateway
from jev_gateway.provider_config import revision
from jev_gateway.routing_overlay import overlay_path
from tests.helpers import turns
from tests.test_model_revision_and_recovery_chat import files
from tests.test_model_transaction_publication import sqlite_app, versions, whole_transaction
from tests.test_provider_config import model
from tests.test_provider_config_regressions import edit
from tests.test_provider_management_api import headers, request


EFFORT_TOKENS = ("none", "minimal", "low", "medium", "high", "xhigh", "max")


def ui_confirmed_model(upstream_model: str, values: dict[str, str], *, display_name: str | None,
                       enabled: bool, tags: list[str], priority: int, quality: float,
                       metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    """Mirror of ``confirmedModel`` in model.ts for a valid, fully-populated draft."""
    effort = json.loads(values["reasoning_effort"])
    assert all(entry in EFFORT_TOKENS for entry in effort)
    cost: dict[str, Any] = {
        "input_per_million": float(values["input_per_million"]),
        "output_per_million": float(values["output_per_million"]),
    }
    for field in ("cache_read_per_million", "cache_write_per_million"):
        if values.get(field, "").strip():
            cost[field] = float(values[field])
    entry: dict[str, Any] = {
        "upstream_model": upstream_model,
        "display_name": (display_name.strip() or None) if display_name is not None else None,
        "enabled": enabled,
        "tags": [tag.strip() for tag in tags if tag.strip()],
        "priority": priority,
        "quality": quality,
        "capabilities": {
            "tools": values["tools"] == "true",
            "vision": values["vision"] == "true",
            "json_mode": values["json_mode"] == "true",
            "reasoning": values["reasoning"] == "true",
            "temperature": values["temperature"] == "true",
            "reasoning_effort": effort,
        },
        "cost": cost,
        "context_window": None if values["context_window"] == "null" else int(values["context_window"]),
        "max_output_tokens": None if values["max_output_tokens"] == "null" else int(values["max_output_tokens"]),
    }
    if metadata is not None:
        entry["metadata"] = metadata
    return entry


def ui_update_operation(catalog_name: str, provider: str, entry: dict[str, Any]) -> dict[str, Any]:
    """The exact operation ModelManagementView pushes for an existing model edit."""
    return {"action": "update_model", "model_id": catalog_name, "model": {**entry, "provider": provider}}


def base_values(**overrides: str) -> dict[str, str]:
    values = {
        "tools": "true", "vision": "false", "json_mode": "true", "reasoning": "false",
        "temperature": "true", "reasoning_effort": "[]",
        "input_per_million": "3", "output_per_million": "6",
        "cache_read_per_million": "", "cache_write_per_million": "",
        "context_window": "8192", "max_output_tokens": "1024",
    }
    values.update(overrides)
    return values


def ts_import_model_keys() -> set[str]:
    """Parse the ImportModel top-level keys from the shared TS contract."""
    root = Path(__file__).resolve().parents[1]
    text = (root / "frontend/src/shared/api/types.ts").read_text(encoding="utf-8")
    lines = text.split("export type ImportModel = {", 1)[1].splitlines()[1:]
    keys: set[str] = set()
    depth = 1
    for line in lines:
        stripped = line.strip()
        if depth == 1 and stripped == "};":
            break
        if depth == 1 and ":" in stripped and not stripped.startswith("//"):
            keys.add(stripped.split(":", 1)[0].strip().rstrip("?"))
        depth += stripped.count("{") - stripped.count("}")
    return keys


def catalog_named(tmp_path: Path) -> tuple[Any, gateway.GatewayConfig]:
    """Real ASGI app whose sole model uses a slashed upstream id."""
    app, config = sqlite_app(tmp_path)
    document = json.loads(config.models_file.read_text())
    assert document["models"][0]["upstream_model"] == "vendor/only"
    return app, config


def model_view(app: Any, config: gateway.GatewayConfig) -> dict[str, Any]:
    response = request(app, "GET", "/v1/provider-configuration", headers=headers(config))
    assert response.status_code == 200
    return next(item for item in response.json()["models"] if item["name"] == "test-provider/vendor/only")


# ---------------------------------------------------------------- X1 UI -> ASGI


def test_x1_ui_mirror_matches_the_shared_import_model_contract() -> None:
    """X1: the Python UI-draft mirror emits exactly the shared ImportModel keys."""
    entry = ui_confirmed_model(
        "vendor/only", base_values(cache_read_per_million="0", cache_write_per_million="0.5"),
        display_name="UI", enabled=True, tags=["custom/ui"], priority=41, quality=0.7,
    )
    shared_keys = ts_import_model_keys()
    # confirmedModel omits provider (added by the view) and metadata (added by withConfirmedMetadata).
    assert set(entry) == shared_keys - {"provider", "metadata"}
    assert set(entry) | {"provider", "metadata"} == shared_keys
    assert set(entry["capabilities"]) == {"tools", "vision", "json_mode", "reasoning", "temperature", "reasoning_effort"}
    assert set(entry["cost"]) == {"input_per_million", "output_per_million", "cache_read_per_million", "cache_write_per_million"}
    # withConfirmedMetadata only adds metadata when the draft carries it.
    with_metadata = ui_confirmed_model("vendor/only", base_values(), display_name=None, enabled=True, tags=[], priority=10, quality=0.5, metadata={"version": 1, "sources": [], "fields": {}})
    assert set(with_metadata) == shared_keys - {"provider"}
    # The UI adds the provider to the operation model, matching ModelManagementView.
    operation = ui_update_operation("test-provider/vendor/only", "test-provider", entry)
    assert operation["model"]["provider"] == "test-provider"
    assert operation["model_id"] == "test-provider/vendor/only"


def test_x1_ui_draft_update_model_survives_full_chain(tmp_path: Path) -> None:
    """X1: one real UI draft through validate+PUT must not lose or partially save fields."""
    app, config = sqlite_app(tmp_path)
    try:
        entry = ui_confirmed_model(
            "vendor/only",
            base_values(display_name="", cache_read_per_million="0", cache_write_per_million="0.5"),
            display_name="UI edited model", enabled=True, tags=["custom/ui"], priority=41, quality=0.7,
        )
        operation = ui_update_operation("test-provider/vendor/only", "test-provider", entry)
        body = {"expected_revision": revision(config.models_file), "operations": [operation]}
        before_bytes, before_versions = config.models_file.read_bytes(), versions(config)

        checked = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=body)
        assert checked.status_code == 200 and checked.json()["valid"] is True
        assert checked.json()["applied"] is False and checked.json()["revision"] == body["expected_revision"]
        assert config.models_file.read_bytes() == before_bytes and versions(config) == before_versions

        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert applied.status_code == 200 and applied.json()["applied"] is True
        assert applied.json()["revision"] == revision(config.models_file)

        projected = next(item for item in applied.json()["models"] if item["name"] == "test-provider/vendor/only")
        assert projected["display_name"] == "UI edited model"
        assert projected["cost"] == {"input_per_million": 3.0, "output_per_million": 6.0, "cache_read_per_million": 0.0, "cache_write_per_million": 0.5}
        assert projected["capabilities"]["reasoning_effort"] == []
        assert projected["priority"] == 41 and projected["quality"] == 0.7
        assert projected["tags"] == ["custom/ui"]
        assert projected["context_window"] == 8192 and projected["max_output_tokens"] == 1024

        saved = json.loads(config.models_file.read_text())["models"][0]
        assert saved["display_name"] == "UI edited model"
        assert saved["cost"]["cache_read_per_million"] == 0.0 and saved["cost"]["cache_write_per_million"] == 0.5
        assert saved["tags"] == ["custom/ui"] and saved["priority"] == 41
        assert config.engine.catalog.profiles[0].display_name == "UI edited model"
        assert config.engine.catalog.profiles[0].cost.cache_read_per_million == 0.0
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        reloaded = model_view(app, config)
        assert reloaded == projected
        restarted = gateway.load_gateway_config(config.models_file)
        try:
            assert restarted.engine.catalog.profiles[0].display_name == "UI edited model"
            assert restarted.engine.catalog.profiles[0].cost.cache_write_per_million == 0.5
        finally:
            restarted.engine.close()
    finally:
        config.engine.close()


def test_x1_partial_failure_rejects_the_whole_ui_transaction(tmp_path: Path) -> None:
    """X1: a later invalid UI operation must leave the first field unwritten."""
    app, config = sqlite_app(tmp_path)
    try:
        first = ui_confirmed_model("vendor/only", base_values(), display_name="Should not persist", enabled=True, tags=[], priority=10, quality=0.5)
        second = copy.deepcopy(model("vendor/second"))
        second["cost"]["input_per_million"] = -1
        body = {
            "expected_revision": revision(config.models_file),
            "operations": [
                ui_update_operation("test-provider/vendor/only", "test-provider", first),
                {"action": "import", "provider_id": "test-provider", "confirmed": True, "models": [second]},
            ],
        }
        before_bytes, before_versions = config.models_file.read_bytes(), versions(config)
        for method, route in (("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")):
            response = request(app, method, route, headers=headers(config), json=body)
            assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_configuration"
            assert config.models_file.read_bytes() == before_bytes and versions(config) == before_versions
        assert model_view(app, config)["display_name"] != "Should not persist"
    finally:
        config.engine.close()


# ------------------------------------------------- X2 display/enabled/cache chain


def test_x2_display_enabled_cache_across_every_layer(tmp_path: Path) -> None:
    """X2: display/enabled/cache read-write-disk-runtime; optional omission and null stay distinct."""
    app, config = sqlite_app(tmp_path)
    try:
        minimal = {
            "upstream_model": "vendor/only",
            "capabilities": {"tools": True, "vision": False, "json_mode": True, "reasoning": False, "temperature": True, "reasoning_effort": []},
            "cost": {"input_per_million": 1.0, "output_per_million": 2.0},
            "context_window": 4096,
            "max_output_tokens": 512,
        }
        legacy_body = {
            "expected_revision": revision(config.models_file),
            "operations": [{"action": "update_model", "model_id": "test-provider/vendor/only", "model": minimum_entry(minimal)}],
        }
        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=legacy_body)
        assert applied.status_code == 200

        projected = model_view(app, config)
        # Omitted enabled stays true in projection, engine and disk default.
        assert projected["enabled"] is True
        assert config.engine.catalog.profiles[0].enabled is True
        saved = json.loads(config.models_file.read_text())["models"][0]
        # Legacy omission is preserved on disk but still reads back as enabled.
        assert saved.get("enabled", True) is True
        assert json.loads(config.models_file.read_text())["models"][0].get("display_name", None) is None
        # Omitted cache prices stay unknown, never zero.
        assert projected["cost"].get("cache_read_per_million", None) is None
        assert config.engine.catalog.profiles[0].cost.cache_read_per_million is None

        explicit = ui_confirmed_model(
            "vendor/only", base_values(cache_read_per_million="0"),
            display_name=None, enabled=False, tags=[], priority=10, quality=0.5,
        )
        body = {
            "expected_revision": revision(config.models_file),
            "operations": [ui_update_operation("test-provider/vendor/only", "test-provider", explicit)],
        }
        assert request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body).status_code == 200
        projected = model_view(app, config)
        assert projected["enabled"] is False and projected["display_name"] is None
        assert projected["cost"]["cache_read_per_million"] == 0.0
        assert config.engine.catalog.profiles[0].enabled is False
        assert config.engine.catalog.profiles[0].cost.cache_read_per_million == 0.0
        # Disabling the only model leaves no selectable route: deterministic unavailable.
        disabled = request(app, "POST", "/v1/routing/preview", headers=headers(config), json={"model": "test-provider/vendor/only", "messages": turns("disabled")})
        assert disabled.status_code == 503 and disabled.json()["error"]["code"] == "setup_incomplete"
        # Re-enable and null the cache price again to prove the round trip is lossless.
        cleared = ui_confirmed_model("vendor/only", base_values(), display_name="", enabled=True, tags=[], priority=10, quality=0.5)
        cleared["cost"].pop("cache_read_per_million", None)
        body = {"expected_revision": revision(config.models_file), "operations": [ui_update_operation("test-provider/vendor/only", "test-provider", cleared)]}
        assert request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body).status_code == 200
        assert model_view(app, config)["cost"].get("cache_read_per_million", None) is None
    finally:
        config.engine.close()


def minimum_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """Add the provider back exactly as the management owner requires it."""
    return {"provider": "test-provider", **entry}


# ---------------------------------------------------------------- X3 field kinds


def test_x3_flat_suggestion_fields_map_into_runtime_groups() -> None:
    """X3: suggestion ``fields`` map to cost/capabilities/limits, not a flat runtime."""
    suggestion = {
        "upstream_model": "m",
        "fields": {
            "input_per_million": 1.5, "output_per_million": 9.0,
            "cache_read_per_million": 0.2, "cache_write_per_million": None,
            "tools": True, "vision": False, "json_mode": True, "reasoning": False, "temperature": True,
            "reasoning_effort": ["low", "high"], "context_window": 64000, "max_output_tokens": 8192,
        },
        "sources": [], "warnings": [],
    }
    values = {
        "input_per_million": str(suggestion["fields"]["input_per_million"]),
        "output_per_million": str(suggestion["fields"]["output_per_million"]),
        "cache_read_per_million": str(suggestion["fields"]["cache_read_per_million"]),
        "cache_write_per_million": "",
        "tools": "true", "vision": "false", "json_mode": "true", "reasoning": "false", "temperature": "true",
        "reasoning_effort": json.dumps(suggestion["fields"]["reasoning_effort"]),
        "context_window": str(suggestion["fields"]["context_window"]),
        "max_output_tokens": str(suggestion["fields"]["max_output_tokens"]),
    }
    entry = ui_confirmed_model("m", values, display_name=None, enabled=True, tags=[], priority=10, quality=0.5)
    assert entry["cost"] == {"input_per_million": 1.5, "output_per_million": 9.0, "cache_read_per_million": 0.2}
    assert entry["capabilities"] == {"tools": True, "vision": False, "json_mode": True, "reasoning": False, "temperature": True, "reasoning_effort": ["low", "high"]}
    assert entry["context_window"] == 64000 and entry["max_output_tokens"] == 8192
    # A flat suggestion object must never satisfy the grouped ImportModel contract.
    assert "cost" not in suggestion and "capabilities" not in suggestion


def test_x3_query_object_is_never_saved_as_an_import_model(tmp_path: Path) -> None:
    """X3: the metadata query item shape must be rejected by the management owner."""
    app, config = sqlite_app(tmp_path)
    try:
        query_item = {
            "upstream_model": "vendor/only",
            "fields": {"input_per_million": 1.0},
            "sources": [],
            "warnings": [],
        }
        body = {
            "expected_revision": revision(config.models_file),
            "operations": [{"action": "update_model", "model_id": "test-provider/vendor/only", "model": query_item}],
        }
        before_bytes, before_versions = config.models_file.read_bytes(), versions(config)
        for method, route in (("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")):
            response = request(app, method, route, headers=headers(config), json=body)
            assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_configuration"
            assert config.models_file.read_bytes() == before_bytes and versions(config) == before_versions
    finally:
        config.engine.close()


def test_x3_python_and_typescript_field_sets_agree() -> None:
    """X3: Python envelope names, the shared TS metadata type and the UI field list agree."""
    from jev_gateway.provider_config import metadata_envelope
    from jev_gateway.model_metadata import _empty_fields

    python_fields = set(_empty_fields())
    assert python_fields == {
        "input_per_million", "output_per_million", "cache_read_per_million", "cache_write_per_million",
        "tools", "vision", "json_mode", "reasoning", "temperature", "reasoning_effort",
        "context_window", "max_output_tokens",
    }
    envelope = metadata_envelope({"version": 1, "sources": [], "fields": {}})
    assert set(envelope["fields"]) == python_fields

    root = Path(__file__).resolve().parents[1]
    types_ts = (root / "frontend/src/shared/api/types.ts").read_text(encoding="utf-8")
    model_ts = (root / "frontend/src/features/providers/models/model.ts").read_text(encoding="utf-8")
    for field in python_fields:
        if field == "reasoning_effort":
            assert "reasoning_effort" in types_ts and "reasoning_effort" in model_ts
        else:
            assert field in types_ts and field in model_ts


# --------------------------------------------------------------- X4 result shapes


def test_x4_discovery_and_metadata_shapes_normalize_sources(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """X4: discovery/metadata envelopes keep ids, units, time, applicability and conditions."""
    app, config = sqlite_app(tmp_path)
    try:
        discovered = {
            "provider_id": "test-provider", "supported": True, "complete": True,
            "warnings": [],
            "items": [{
                "upstream_model": "vendor/only", "qualified_id": "test-provider/vendor/only", "imported": False,
                "metadata": {
                    "fields": {"input_per_million": 2.0},
                    "sources": [{
                        "source_provider": "openai", "source_model": "vendor/only",
                        "fetched_at": "2026-10-08T00:00:00Z", "applicable": True,
                        "fields": {"input_per_million": {"value": 2.0, "source_field": "pricing.input", "unit": "USD/M tokens", "source_unit": "USD/token"}},
                    }],
                    "warnings": [],
                },
            }],
        }
        monkeypatch.setattr(gateway.model_discovery, "discover_models", lambda *_a, **_k: copy.deepcopy(discovered))
        response = request(app, "POST", "/v1/provider-discovery", headers=headers(config), json={"provider_id": "test-provider"})
        assert response.status_code == 200
        item = response.json()["items"][0]
        assert {"upstream_model", "qualified_id", "imported", "metadata", "metadata_envelope"} <= set(item)
        assert item["qualified_id"] == "test-provider/vendor/only"
        source = item["metadata"]["sources"][0]
        assert source["source_provider"] == "openai" and source["source_model"] == "vendor/only"
        envelope_source = item["metadata_envelope"]["sources"][0]
        # source_provider/source_model normalize into provider_id/model_id.
        assert envelope_source["provider_id"] == "openai" and envelope_source["model_id"] == "vendor/only"
        assert envelope_source["applicable"] is True
        assert envelope_source["fields"]["input_per_million"]["unit"] == "USD/M tokens"
        assert envelope_source["fields"]["input_per_million"]["source_unit"] == "USD/token"
        assert item["metadata_envelope"]["fields"]["input_per_million"]["status"] == "known"

        looked_up = {
            "fetched_at": "2026-10-08T00:00:00Z", "stale": False,
            "items": [{
                "upstream_model": "vendor/only", "fields": {"input_per_million": 2.0},
                "sources": [{
                    "source": "native_listing", "source_provider": "openai", "source_model": "vendor/only",
                    "fetched_at": "2026-10-08T00:00:00Z", "applicable": True,
                    "fields": {"input_per_million": {"value": 2.0, "source_field": "pricing.input", "unit": "USD/M tokens"}},
                }],
                "warnings": [],
            }],
        }
        monkeypatch.setattr(gateway.model_metadata, "lookup_model_metadata", lambda *_a, **_k: copy.deepcopy(looked_up))
        metadata = request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={"provider_id": "test-provider", "upstream_models": ["vendor/only"], "refresh": False})
        assert metadata.status_code == 200
        assert {"fetched_at", "stale", "items"} <= set(metadata.json())
        entry = metadata.json()["items"][0]
        assert {"upstream_model", "fields", "sources", "warnings", "metadata"} <= set(entry)
        normalized = entry["metadata"]["sources"][0]
        # source_provider/source_model normalize into provider_id/model_id.
        assert normalized["provider_id"] == "openai" and normalized["model_id"] == "vendor/only"
        assert normalized["applicable"] is True
    finally:
        config.engine.close()


# --------------------------------------------------------- X5 connection-test shape


def test_x5_connection_test_request_response_shape(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """X5: the selector request and finite response shape match the TS contract."""
    app, config = sqlite_app(tmp_path)
    try:
        from jev_gateway.discovery_network import DiscoveryNetworkError

        # Errors keep the same keys and stay independent of the upstream status.
        def reject(*_a: Any, **_k: Any) -> Any:
            raise DiscoveryNetworkError("authentication_failed")

        monkeypatch.setattr(gateway.model_discovery, "safe_get_json", reject)
        auth = request(app, "POST", "/v1/provider-connection-test", headers=headers(config), json={"provider_id": "test-provider"})
        assert auth.status_code == 200 and auth.json()["status"] == "authentication_error"
        assert set(auth.json()) == {"provider_id", "status", "scope", "model_count", "warnings"}
        assert auth.json()["warnings"] == ["generation_unverified", "authentication_failed"]

        captured: list[tuple[dict[str, Any], str | None]] = []

        def listing(provider: dict[str, Any], key: str | None, **_kwargs: Any) -> dict[str, Any]:
            captured.append((provider, key))
            return {"provider_id": provider.get("id"), "supported": True, "complete": True, "items": [{"upstream_model": "only", "qualified_id": "test-provider/only", "imported": False, "metadata": {"fields": {}, "sources": [], "warnings": []}}], "warnings": []}

        monkeypatch.setattr(gateway.model_discovery, "discover_models", listing)
        response = request(app, "POST", "/v1/provider-connection-test", headers=headers(config), json={"provider_id": "test-provider", "credential": {"action": "keep"}})
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"provider_id", "status", "scope", "model_count", "warnings"}
        assert body["status"] in {"success", "authentication_error", "address_error", "network_error", "unsupported", "incomplete"}
        assert body["scope"] == "model_listing"
        assert body["status"] == "success" and body["model_count"] == 1
        assert len(captured) == 1
        assert captured[0][1] == "fake-before"

        root = Path(__file__).resolve().parents[1]
        types_ts = (root / "frontend/src/shared/api/types.ts").read_text(encoding="utf-8")
        client_ts = (root / "frontend/src/shared/api/client.ts").read_text(encoding="utf-8")
        assert "ProviderConnectionResult" in types_ts and '"/v1/provider-connection-test"' in client_ts
        assert 'scope: "model_listing"' in types_ts
        for status in ("success", "authentication_error", "address_error", "network_error", "unsupported", "incomplete"):
            assert status in types_ts
    finally:
        config.engine.close()


# ------------------------------------------------------ X6 command result semantics


def test_x6_validate_versus_put_revision_applied_and_no_secret(tmp_path: Path) -> None:
    """X6: validate keeps the revision with applied=false; PUT advances it with applied=true."""
    app, config = sqlite_app(tmp_path)
    try:
        body = whole_transaction(app, config)
        original = revision(config.models_file)
        validated = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=body)
        assert validated.status_code == 200
        assert validated.json()["valid"] is True and validated.json()["applied"] is False
        assert validated.json()["revision"] == original
        assert {"valid", "applied", "imported", "skipped", "revision"} <= set(validated.json())
        assert "fake-candidate" not in validated.text
        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert applied.status_code == 200 and applied.json()["applied"] is True
        assert applied.json()["revision"] == revision(config.models_file) != original
        assert "fake-candidate" not in applied.text
        conflict = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "revision_conflict"
        assert "fake-candidate" not in conflict.text
    finally:
        config.engine.close()


def test_x6_client_retries_only_get_after_committed_read_failure() -> None:
    """X6: client.ts retries 401 reads only; the write path never auto-retries."""
    root = Path(__file__).resolve().parents[1]
    client_ts = (root / "frontend/src/shared/api/client.ts").read_text(encoding="utf-8")
    assert 'response.status === 401 && retryAuthentication && (init.method ?? "GET") === "GET"' in client_ts
    assert 'saveProviders: (payload: ProviderMutation) => request<ProviderCommandResult>("/v1/provider-configuration", { method: "PUT"' in client_ts
    assert 'validateProviders: (payload: ProviderMutation) => request<ProviderCommandResult>("/v1/provider-configuration/validate", { method: "POST"' in client_ts


# ------------------------------------------------------------- X7 docs/spec parity


def test_x7_docs_types_and_http_describe_the_new_public_contracts(tmp_path: Path) -> None:
    """X7: docs/spec/type/HTTP/persistence all describe the same new public fields."""
    root = Path(__file__).resolve().parents[1]
    types_ts = (root / "frontend/src/shared/api/types.ts").read_text(encoding="utf-8")
    docs = {
        "docs/models-config.md": (root / "docs/models-config.md").read_text(encoding="utf-8"),
        "docs/http-api.md": (root / "docs/http-api.md").read_text(encoding="utf-8"),
    }
    spec = (root / ".trellis/spec/backend/provider-configuration.md").read_text(encoding="utf-8")
    for field in ("display_name", "enabled", "cache_read_per_million", "cache_write_per_million"):
        assert field in types_ts, field
    assert "provider-connection-test" in docs["docs/http-api.md"]
    assert "model_listing" in docs["docs/http-api.md"]
    assert "update_model" in types_ts
    assert "update_model" in docs["docs/models-config.md"]
    assert "update_model" in docs["docs/http-api.md"]
    assert "revision" in spec and "provider-connection-test" in spec
    assert "model_listing" in spec
    # HTTP projection and persistence agree on the same field names.
    app, config = sqlite_app(tmp_path)
    try:
        body = whole_transaction(app, config)
        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        projected = next(item for item in applied.json()["models"] if item["name"] == "test-provider/vendor/only")
        saved = json.loads(config.models_file.read_text())["models"][0]
        for field in ("display_name", "context_window", "max_output_tokens"):
            assert projected[field] == saved.get(field)
        # The HTTP projection materializes the legacy-enabled default that disk omits.
        assert projected["enabled"] is True and saved.get("enabled", True) is True
        assert projected["cost"] == saved["cost"]
    finally:
        config.engine.close()


# --------------------------------------------- T2 slashed-upstream identity protection


def t2_catalog(tmp_path: Path) -> tuple[Any, gateway.GatewayConfig]:
    app, config = sqlite_app(tmp_path)
    document = json.loads(config.models_file.read_text())
    document["models"][0].update(tags=["task_aware/simple"], priority=23)
    document["defaults"] = {"default_model": "test-provider/vendor/only"}
    config.models_file.write_text(json.dumps(document))
    assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
    return app, config


@pytest.mark.parametrize("display", ["Renamed model", "重命名模型", None, ""])
def test_t2_display_changes_keep_slashed_identity(tmp_path: Path, display: str | None) -> None:
    """T2: slash upstream id survives display-name edits with references intact."""
    app, config = t2_catalog(tmp_path)
    try:
        layout = tmp_path / "routing-canvas-layout.json"
        layout.write_text(json.dumps({"version": 1, "nodes": {"model::test-provider/vendor/only": {"x": 3, "y": 4}}, "viewport": {"x": 0, "y": 0}}))
        config.engine.decide(messages=turns("pin"), requested_model="test-provider/vendor/only", session_id="t2-pin")
        session = config.engine.store.get("t2-pin")
        assert session is not None
        entry = ui_confirmed_model("vendor/only", base_values(), display_name=display, enabled=True, tags=["task_aware/simple"], priority=23, quality=0.5)
        body = {"expected_revision": revision(config.models_file), "operations": [ui_update_operation("test-provider/vendor/only", "test-provider", entry)]}
        response = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert response.status_code == 200
        projected = next(item for item in response.json()["models"] if item["name"] == "test-provider/vendor/only")
        assert projected["provider"] == "test-provider" and projected["name"] == "test-provider/vendor/only"
        saved = json.loads(config.models_file.read_text())
        assert saved["models"][0]["provider"] == "test-provider"
        assert saved["models"][0]["upstream_model"] == "vendor/only"
        assert saved["defaults"]["default_model"] == "test-provider/vendor/only"
        assert saved["policy"]["tier_models"]["simple"] == ["test-provider/vendor/only"]
        assert json.loads(layout.read_text())["nodes"] == {"model::test-provider/vendor/only": {"x": 3, "y": 4}}
        assert config.engine.store.get("t2-pin") is session
        assert config.engine.catalog.profiles[0].provider == "test-provider"
    finally:
        config.engine.close()


@pytest.mark.parametrize("mutation", ["provider", "upstream", "separate_id", "bare_upstream", "missing_canonical", "whitespace_id"])
def test_t2_rename_and_new_model_attempts_reject_with_zero_writes(tmp_path: Path, mutation: str) -> None:
    """T2: rename/new-model attempts through identity edits must return 400 and write nothing."""
    app, config = t2_catalog(tmp_path)
    try:
        entry = ui_confirmed_model("vendor/only", base_values(), display_name="Attempt", enabled=True, tags=[], priority=23, quality=0.5)
        operation = ui_update_operation("test-provider/vendor/only", "test-provider", entry)
        if mutation == "provider":
            operation["model"]["provider"] = "other-provider"
        elif mutation == "upstream":
            operation["model"]["upstream_model"] = "vendor/renamed"
        elif mutation == "separate_id":
            operation["model"]["id"] = "test-provider/vendor/renamed"
            operation["model"]["name"] = "test-provider/vendor/renamed"
        elif mutation == "bare_upstream":
            operation["model"]["upstream_model"] = "only"
        elif mutation == "missing_canonical":
            operation["model_id"] = "test-provider/vendor/absent"
        else:
            operation["model_id"] = "   "
        body = {"expected_revision": revision(config.models_file), "operations": [operation]}
        before_bytes, before_versions = config.models_file.read_bytes(), versions(config)
        for method, route in (("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")):
            response = request(app, method, route, headers=headers(config), json=body)
            assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_configuration"
            assert config.models_file.read_bytes() == before_bytes and versions(config) == before_versions
    finally:
        config.engine.close()


# --------------------------------------------------------- T3 baseline/overlay window


def test_t3_real_ui_edit_preserves_baseline_and_overlay_membership(tmp_path: Path) -> None:
    """T3: a real UI model edit must not rewrite the unedited baseline or the overlay."""
    app, config = sqlite_app(tmp_path)
    try:
        baseline = json.loads(config.models_file.read_text())
        baseline["models"][0].update(tags=["task_aware/base", "quality/keep"], priority=23)
        config.models_file.write_text(json.dumps(baseline))
        path = overlay_path(config.models_file)
        path.write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {
            "test-provider/vendor/only": {"tags": ["task_aware/overlay"], "priority": 7},
        }}))
        overlay_bytes = path.read_bytes()
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        # The UI edits price and one capability only; membership is untouched.
        entry = ui_confirmed_model("vendor/only", base_values(input_per_million="4.25", vision="true"), display_name=None, enabled=True, tags=["task_aware/base", "quality/keep"], priority=23, quality=0.5)
        body = {"expected_revision": revision(config.models_file), "operations": [ui_update_operation("test-provider/vendor/only", "test-provider", entry)]}
        validated = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=body)
        assert validated.status_code == 200 and path.read_bytes() == overlay_bytes
        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert applied.status_code == 200
        saved = json.loads(config.models_file.read_text())["models"][0]
        assert saved["tags"] == ["task_aware/base", "quality/keep"] and saved["priority"] == 23
        assert saved["cost"]["input_per_million"] == 4.25 and saved["capabilities"]["vision"] is True
        assert path.read_bytes() == overlay_bytes
        projected = next(item for item in applied.json()["models"] if item["name"] == "test-provider/vendor/only")
        assert projected["tags"] == ["task_aware/overlay"] and projected["priority"] == 7
        assert list(config.engine.catalog.profiles[0].tags) == ["task_aware/overlay"]
        assert config.engine.catalog.profiles[0].priority == 7
        assert model_view(app, config)["tags"] == ["task_aware/overlay"]
    finally:
        config.engine.close()


# ------------------------------------------------------------ T4 overlay boundaries


def test_t4_overlay_boundaries_keep_foreign_and_default_ownership(tmp_path: Path) -> None:
    """T4: overlay boundary edits protect foreign tags, defaults and overlay references."""
    app, config = sqlite_app(tmp_path)
    try:
        baseline = json.loads(config.models_file.read_text())
        baseline["models"][0].update(tags=["task_aware/base"], priority=23)
        baseline["providers"].append({**baseline["providers"][0], "id": "other-provider"})
        other = copy.deepcopy(baseline["models"][0])
        other.update(provider="other-provider", upstream_model="vendor/other")
        baseline["models"].append(other)
        baseline["defaults"] = {"default_model": "other-provider/vendor/other"}
        config.models_file.write_text(json.dumps(baseline))
        path = overlay_path(config.models_file)
        path.write_text(json.dumps({"version": 1, "strategy": "task_aware", "models": {
            "test-provider/vendor/only": {"tags": ["task_aware/overlay", "foreign/strategy"], "priority": 7},
        }}))
        overlay_bytes = path.read_bytes()
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200

        # Sequential edits across cost, capability and metadata must not enter the overlay.
        for index, (price, vision) in enumerate(((1.0, True), (2.0, False), (3.5, True))):
            entry = ui_confirmed_model("vendor/only", base_values(input_per_million=str(price), vision="true" if vision else "false"), display_name=None, enabled=True, tags=["task_aware/base"], priority=23, quality=0.5)
            body = {"expected_revision": revision(config.models_file), "operations": [ui_update_operation("test-provider/vendor/only", "test-provider", entry)]}
            applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
            assert applied.status_code == 200, index
            assert path.read_bytes() == overlay_bytes
            saved = json.loads(config.models_file.read_text())
            assert saved["models"][0]["tags"] == ["task_aware/base"] and saved["models"][0]["priority"] == 23
            assert saved["models"][1] == other and saved["defaults"]["default_model"] == "other-provider/vendor/other"
            assert saved["models"][0]["cost"]["input_per_million"] == price
            assert "overlay" not in json.dumps(saved["models"][0])

        # An explicit baseline tags/priority edit changes the baseline only.
        explicit = ui_confirmed_model("vendor/only", base_values(), display_name=None, enabled=True, tags=["task_aware/base", "quality/keep"], priority=31, quality=0.5)
        body = {"expected_revision": revision(config.models_file), "operations": [ui_update_operation("test-provider/vendor/only", "test-provider", explicit)]}
        assert request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body).status_code == 200
        saved = json.loads(config.models_file.read_text())
        # The overlay owns this model's tags/priority: a submitted membership change
        # cannot rewrite the baseline, and the overlay bytes stay untouched.
        assert saved["models"][0]["tags"] == ["task_aware/base"] and saved["models"][0]["priority"] == 23
        assert path.read_bytes() == overlay_bytes
        projected = model_view(app, config)
        assert projected["tags"] == ["task_aware/overlay", "foreign/strategy"] and projected["priority"] == 7

        # A model the overlay does not reference still allows an explicit membership edit.
        other_entry = ui_confirmed_model("vendor/other", base_values(), display_name=None, enabled=True, tags=["task_aware/base", "quality/keep"], priority=31, quality=0.5)
        body = {"expected_revision": revision(config.models_file), "operations": [ui_update_operation("other-provider/vendor/other", "other-provider", other_entry)]}
        assert request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body).status_code == 200
        saved = json.loads(config.models_file.read_text())
        assert saved["models"][1]["tags"] == ["task_aware/base", "quality/keep"] and saved["models"][1]["priority"] == 31
        assert path.read_bytes() == overlay_bytes
        assert saved["defaults"]["default_model"] == "other-provider/vendor/other"

        # Cancel-then-save: a stale validate that is never applied leaves bytes and overlay intact.
        stale = {"expected_revision": revision(config.models_file), "operations": [ui_update_operation("test-provider/vendor/only", "test-provider", ui_confirmed_model("vendor/only", base_values(input_per_million="9"), display_name=None, enabled=True, tags=["task_aware/base"], priority=23, quality=0.5))]}
        assert request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=stale).status_code == 200
        assert path.read_bytes() == overlay_bytes
    finally:
        config.engine.close()


# ------------------------------------------------------------- M9 refresh / restore


def test_m9_refresh_never_writes_catalog_or_confirmed_runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """M9: metadata lookup is nonmutating and manual values survive changed/null/failed suggestions."""
    app, config = sqlite_app(tmp_path)
    try:
        manual = ui_confirmed_model(
            "vendor/only", base_values(input_per_million="7"), display_name="Manual", enabled=True,
            tags=[], priority=23, quality=0.5,
            metadata={"version": 1, "confirmation": {"method": "manual", "confirmed_at": "2026-10-08T00:00:00Z"}, "fields": {
                "input_per_million": {"status": "confirmed", "value": 7, "method": "manual", "confirmed_at": "2026-10-08T00:00:00Z"},
            }},
        )
        body = {"expected_revision": revision(config.models_file), "operations": [ui_update_operation("test-provider/vendor/only", "test-provider", manual)]}
        assert request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body).status_code == 200
        baseline_bytes, before_versions = config.models_file.read_bytes(), versions(config)

        for suggestion in ("changed", "null", "conflicting", "failed", "stale"):
            payload: dict[str, Any] = {"fetched_at": "2026-10-09T00:00:00Z", "stale": suggestion == "stale", "items": [{"upstream_model": "vendor/only", "fields": {"input_per_million": None}, "sources": [], "warnings": []}]}
            if suggestion == "changed":
                payload["items"][0]["fields"]["input_per_million"] = 99.0
            elif suggestion == "conflicting":
                payload["items"][0]["sources"] = [
                    {"source": "a", "source_provider": "openai", "source_model": "vendor/only", "fetched_at": "2026-10-09T00:00:00Z", "applicable": True, "fields": {"input_per_million": {"value": 1.0, "source_field": "x"}}},
                    {"source": "b", "source_provider": "openai", "source_model": "vendor/only", "fetched_at": "2026-10-09T00:00:00Z", "applicable": True, "fields": {"input_per_million": {"value": 2.0, "source_field": "x"}}},
                ]
            elif suggestion == "failed":
                payload["items"][0]["warnings"] = ["metadata_source_unavailable"]
            monkeypatch.setattr(gateway.model_metadata, "lookup_model_metadata", lambda *_a, _p=copy.deepcopy(payload), **_k: copy.deepcopy(_p))
            response = request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={"provider_id": "test-provider", "upstream_models": ["vendor/only"], "refresh": True})
            assert response.status_code == 200, suggestion
            assert config.models_file.read_bytes() == baseline_bytes, suggestion
            assert versions(config) == before_versions, suggestion
        assert config.engine.catalog.profiles[0].cost.input_per_million == 7.0
        assert model_view(app, config)["cost"]["input_per_million"] == 7.0
        saved = json.loads(config.models_file.read_text())["models"][0]
        assert saved["metadata"]["fields"]["input_per_million"]["status"] == "confirmed"
        assert saved["metadata"]["fields"]["input_per_million"]["value"] == 7
    finally:
        config.engine.close()


def test_m9_restore_auto_requires_explicit_difference_selection(tmp_path: Path) -> None:
    """M9: restore-auto must produce a new complete transaction with read-back provenance."""
    app, config = sqlite_app(tmp_path)
    try:
        manual = ui_confirmed_model(
            "vendor/only", base_values(input_per_million="7"), display_name="Manual", enabled=True,
            tags=[], priority=23, quality=0.5,
            metadata={"version": 1, "confirmation": {"method": "manual", "confirmed_at": "2026-10-08T00:00:00Z"}, "fields": {
                "input_per_million": {"status": "confirmed", "value": 7, "method": "manual", "confirmed_at": "2026-10-08T00:00:00Z"},
            }},
        )
        body = {"expected_revision": revision(config.models_file), "operations": [ui_update_operation("test-provider/vendor/only", "test-provider", manual)]}
        assert request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body).status_code == 200
        before_versions = versions(config)
        baseline_bytes = config.models_file.read_bytes()

        # Restore to the automatic value is only a new transaction when the field is chosen.
        restored = ui_confirmed_model(
            "vendor/only", base_values(input_per_million="1"), display_name="Manual", enabled=True,
            tags=[], priority=23, quality=0.5,
            metadata={"version": 1, "confirmation": {"method": "reviewed", "confirmed_at": "2026-10-09T00:00:00Z"}, "sources": [
                {"id": "native-0", "source": "native_listing", "provider_id": "openai", "model_id": "vendor/only",
                 "fetched_at": "2026-10-09T00:00:00Z", "applicable": True,
                 "fields": {"input_per_million": {"value": 1.0, "source_field": "pricing.input"}}},
            ], "fields": {
                "input_per_million": {"status": "confirmed", "value": 1, "method": "source", "source_ids": ["native-0"], "confirmed_at": "2026-10-09T00:00:00Z"},
            }},
        )
        body = {"expected_revision": revision(config.models_file), "operations": [ui_update_operation("test-provider/vendor/only", "test-provider", restored)]}
        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert applied.status_code == 200 and len(versions(config)) == len(before_versions) + 1
        assert config.models_file.read_bytes() != baseline_bytes
        reread = model_view(app, config)
        assert reread["cost"]["input_per_million"] == 1.0
        assert reread["metadata"]["fields"]["input_per_million"]["value"] == 1
        assert reread["metadata"]["fields"]["input_per_million"]["source_ids"] == ["native-0"]
    finally:
        config.engine.close()


def test_m9_unknown_source_cannot_satisfy_a_strict_required_field(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """M9: an unknown suggestion cannot stand in for a missing required runtime field."""
    app, config = sqlite_app(tmp_path)
    try:
        # A lookup returns an unknown input price; it must not become a runtime value.
        monkeypatch.setattr(gateway.model_metadata, "lookup_model_metadata", lambda *_a, **_k: {
            "fetched_at": "2026-10-09T00:00:00Z", "stale": False,
            "items": [{"upstream_model": "vendor/only", "fields": {"input_per_million": None}, "sources": [], "warnings": []}],
        })
        lookup = request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={"provider_id": "test-provider", "upstream_models": ["vendor/only"], "refresh": False})
        assert lookup.status_code == 200
        assert lookup.json()["items"][0]["metadata"]["fields"]["input_per_million"]["status"] == "unknown"

        # A "restore" that drops the required runtime price still fails strict import.
        incomplete = {"upstream_model": "vendor/only", "capabilities": {"tools": True, "vision": False, "json_mode": True, "reasoning": False, "temperature": True, "reasoning_effort": []}, "cost": {"output_per_million": 2.0}, "context_window": None, "max_output_tokens": 512, "provider": "test-provider"}
        body = {"expected_revision": revision(config.models_file), "operations": [{"action": "update_model", "model_id": "test-provider/vendor/only", "model": incomplete}]}
        before_bytes, before_versions = config.models_file.read_bytes(), versions(config)
        original_input = model_view(app, config)["cost"]["input_per_million"]
        for method, route in (("POST", "/v1/provider-configuration/validate"), ("PUT", "/v1/provider-configuration")):
            response = request(app, method, route, headers=headers(config), json=body)
            assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_configuration"
            assert config.models_file.read_bytes() == before_bytes and versions(config) == before_versions
        assert model_view(app, config)["cost"]["input_per_million"] == original_input
    finally:
        config.engine.close()
