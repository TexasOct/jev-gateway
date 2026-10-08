"""Replay the exact browser-captured model-edit body through the real gateway.

The browser leg (``frontend/tests/browser/real-backend-contracts.spec.ts``)
writes each test's captured ``update_model`` request to a JSON record directory.
This module reads that captured payload and drives it through the real ASGI
gateway, configuration owner, catalog, disk, ``/v1/routing/reload`` and a fresh
process load, asserting the same field values and, for T3, unchanged overlay
bytes. When no capture directory is configured the case reports itself as
skipped rather than inferring the leg from the Python mirror.

Set ``JEV_BROWSER_CAPTURE_DIR`` to the directory holding ``x1.json``/``t3.json``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from jev_gateway import gateway
from jev_gateway.provider_config import revision
from jev_gateway.routing_overlay import overlay_path
from tests.test_model_transaction_publication import sqlite_app, versions
from tests.test_provider_management_api import headers, request


def capture_dir() -> Path | None:
    value = os.environ.get("JEV_BROWSER_CAPTURE_DIR")
    return Path(value) if value else None


def load(name: str) -> dict[str, Any]:
    directory = capture_dir()
    path = (directory / f"{name}.json") if directory else None
    if path is None or not path.exists():
        pytest.skip(f"no browser capture at {path}; run the real-backend browser spec first")
    return json.loads(path.read_text())


def test_x1_browser_captured_body_replays_through_the_real_gateway(tmp_path: Path) -> None:
    """X1: the captured browser body hits validate/PUT/disk/reload/restart identically."""
    captured = load("x1")
    body = captured["requestBody"]
    assert body["operations"][0]["action"] == "update_model"
    assert body["operations"][0]["model_id"] == "test-provider/vendor/only"
    app, config = sqlite_app(tmp_path)
    try:
        # The captured expected_revision belongs to the browser run; re-read the
        # current revision so this replay binds to this real catalog instance.
        body = {**body, "expected_revision": revision(config.models_file)}
        before_versions = versions(config)
        baseline_before = config.models_file.read_bytes()
        validated = request(app, "POST", "/v1/provider-configuration/validate", headers=headers(config), json=body)
        assert validated.status_code == 200 and validated.json()["valid"] is True
        assert validated.json()["applied"] is False
        assert config.models_file.read_bytes() == baseline_before and versions(config) == before_versions
        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert applied.status_code == 200 and applied.json()["applied"] is True
        assert len(versions(config)) == len(before_versions) + 1
        model = captured["requestBody"]["operations"][0]["model"]
        saved = json.loads(config.models_file.read_text())["models"][0]
        assert saved["display_name"] == model["display_name"] == captured["diskDisplayName"]
        assert saved["cost"]["input_per_million"] == model["cost"]["input_per_million"] == captured["diskInputPrice"]
        assert saved["capabilities"]["vision"] is True == captured["diskVision"]
        assert config.engine.catalog.profiles[0].display_name == captured["diskDisplayName"]
        assert config.engine.catalog.profiles[0].cost.input_per_million == captured["diskInputPrice"]
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        reloaded = next(item for item in request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()["models"] if item["name"] == "test-provider/vendor/only")
        assert reloaded["display_name"] == captured["reloadedDisplayName"]
        assert reloaded["cost"]["input_per_million"] == captured["reloadedInputPrice"]
        assert reloaded["capabilities"]["vision"] == captured["reloadedVision"]
        restarted = gateway.load_gateway_config(config.models_file)
        try:
            assert restarted.engine.catalog.profiles[0].display_name == captured["diskDisplayName"]
            assert restarted.engine.catalog.profiles[0].cost.input_per_million == captured["diskInputPrice"]
        finally:
            restarted.engine.close()
    finally:
        config.engine.close()


def test_t3_browser_captured_body_preserves_baseline_and_overlay(tmp_path: Path) -> None:
    """T3: the captured browser body edits price/capability but not overlay ownership."""
    captured = load("t3")
    body = captured["requestBody"]
    assert body["operations"][0]["model_id"] == "test-provider/vendor/only"
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
        body = {**body, "expected_revision": revision(config.models_file)}
        applied = request(app, "PUT", "/v1/provider-configuration", headers=headers(config), json=body)
        assert applied.status_code == 200
        saved = json.loads(config.models_file.read_text())["models"][0]
        assert saved["cost"]["input_per_million"] == captured["savedInputPrice"]
        assert saved["capabilities"]["vision"] is True
        assert saved["tags"] == ["task_aware/base", "quality/keep"] and saved["priority"] == 23
        assert path.read_bytes() == overlay_bytes
        projected = next(item for item in applied.json()["models"] if item["name"] == "test-provider/vendor/only")
        assert projected["tags"] == ["task_aware/overlay"] and projected["priority"] == 7
        assert list(config.engine.catalog.profiles[0].tags) == ["task_aware/overlay"]
    finally:
        config.engine.close()
