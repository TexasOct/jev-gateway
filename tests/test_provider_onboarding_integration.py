"""Cross-module provider onboarding with fixture credentials and upstream data."""

from __future__ import annotations

import asyncio
import copy
import json
import os
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import httpx
import pytest

from jev_gateway import gateway, model_metadata
from jev_gateway.discovery_network import JsonResponse
from tests.helpers import catalog_document


def test_discovery_confirmation_import_preserves_overlay_and_runtime_identity(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Candidates stay transient until a confirmed import reaches the registry."""
    document = catalog_document()
    document["gateway"] = {"api_key_env": "ONBOARDING_GATEWAY_KEY"}
    monkeypatch.setenv("ONBOARDING_GATEWAY_KEY", "fixture-gateway-key")
    monkeypatch.delenv("ONBOARDING_NEW_PROVIDER_KEY", raising=False)
    models_file = tmp_path / "models.json"
    models_file.write_text(json.dumps(document), encoding="utf-8")
    overlay_file = tmp_path / "routing-overrides.json"
    overlay_file.write_text(
        json.dumps(
            {
                "version": 1,
                "strategy": "task_aware",
                "models": {
                    "small-provider/vendor/small-model": {
                        "tags": ["existing/assignment"],
                        "priority": 42,
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    baseline_bytes = models_file.read_bytes()
    overlay_bytes = overlay_file.read_bytes()
    candidate: dict[str, Any] = {
        "id": "new-provider",
        "type": "openai",
        "api_base": "https://fixture.example/v1",
        "api_key_env": "ONBOARDING_NEW_PROVIDER_KEY",
        "display_name": "Fixture provider",
        "allow_private_network": False,
    }
    listing_calls: list[tuple[str, str | None, set[str]]] = []

    def list_models(
        provider: Mapping[str, Any],
        api_key: str | None,
        *,
        imported_ids: set[str],
    ) -> dict[str, Any]:
        listing_calls.append((str(provider["id"]), api_key, imported_ids))
        return {
            "provider_id": provider["id"],
            "supported": True,
            "complete": True,
            "items": [
                {
                    "upstream_model": "vendor/new-model",
                    "qualified_id": "new-provider/vendor/new-model",
                    "imported": False,
                    "metadata": {},
                }
            ],
            "warnings": [],
        }

    monkeypatch.setattr("jev_gateway.model_discovery.discover_models", list_models)
    app = gateway.create_app(gateway.load_gateway_config(models_file))

    async def exercise() -> None:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://gateway.test",
            headers={"Authorization": "Bearer fixture-gateway-key"},
        ) as client:
            snapshot_response = await client.get("/v1/provider-configuration")
            assert snapshot_response.status_code == 200
            initial_revision = snapshot_response.json()["revision"]
            credential = {"action": "set", "value": "fixture-new-provider-key"}
            operation = {
                "action": "upsert",
                "kind": "llm",
                "provider": candidate,
                "credential": credential,
            }
            pending = {"expected_revision": initial_revision, "operations": [operation]}
            validation = await client.post(
                "/v1/provider-configuration/validate", json=pending
            )
            assert validation.status_code == 200
            discovered = await client.post(
                "/v1/provider-discovery",
                json={"provider": candidate, "credential": credential},
            )
            assert discovered.status_code == 200
            assert discovered.json()["items"][0]["qualified_id"] == (
                "new-provider/vendor/new-model"
            )
            assert listing_calls[0][:2] == ("new-provider", "fixture-new-provider-key")
            assert models_file.read_bytes() == baseline_bytes
            assert overlay_file.read_bytes() == overlay_bytes
            assert not (tmp_path / ".env").exists()
            assert "ONBOARDING_NEW_PROVIDER_KEY" not in os.environ
            before_import = await client.get("/v1/models")
            assert "new-provider/vendor/new-model" not in {
                row["id"] for row in before_import.json()["data"]
            }

            saved = await client.put("/v1/provider-configuration", json=pending)
            assert saved.status_code == 200
            snapshot_response = await client.get("/v1/provider-configuration")
            snapshot = snapshot_response.json()
            assert snapshot["revision"] != initial_revision
            assert "fixture-new-provider-key" not in json.dumps(snapshot)
            assert overlay_file.read_bytes() == overlay_bytes
            stale = await client.put("/v1/provider-configuration", json=pending)
            assert stale.status_code == 409

            discovered = await client.post(
                "/v1/provider-discovery", json={"provider_id": "new-provider"}
            )
            assert discovered.status_code == 200
            assert listing_calls[-1][:2] == ("new-provider", "fixture-new-provider-key")
            confirmed_model: dict[str, Any] = {
                "upstream_model": "vendor/new-model",
                "tags": [],
                "cost": {"input_per_million": 0.25, "output_per_million": 0.75},
                "capabilities": {
                    "tools": False,
                    "vision": False,
                    "json_mode": False,
                    "reasoning": False,
                    "temperature": True,
                    "reasoning_effort": [],
                },
                "context_window": None,
                "max_output_tokens": 4096,
            }
            incomplete = dict(confirmed_model)
            del incomplete["context_window"]
            after_provider_bytes = models_file.read_bytes()
            import_operation = {
                "action": "import",
                "provider_id": "new-provider",
                "models": [incomplete],
                "confirmed": True,
            }
            rejected = await client.put(
                "/v1/provider-configuration",
                json={
                    "expected_revision": snapshot["revision"],
                    "operations": [import_operation],
                },
            )
            assert rejected.status_code == 400
            assert models_file.read_bytes() == after_provider_bytes
            import_operation["models"] = [confirmed_model]
            imported = await client.put(
                "/v1/provider-configuration",
                json={
                    "expected_revision": snapshot["revision"],
                    "operations": [import_operation],
                },
            )
            assert imported.status_code == 200
            listed = await client.get("/v1/models")
            assert "new-provider/vendor/new-model" in {
                row["id"] for row in listed.json()["data"]
            }
            assert overlay_file.read_bytes() == overlay_bytes
            baseline = json.loads(models_file.read_text(encoding="utf-8"))
            assert baseline["policy"] == document["policy"]
            assert baseline["strategies"] == document["strategies"]
            assert baseline["models"][:2] == document["models"]
            assert baseline["models"][-1]["provider"] == "new-provider"
            assert baseline["models"][-1]["tags"] == []
            routing = await client.get("/v1/routing/configuration")
            assert routing.status_code == 200
            assert "fixture-new-provider-key" not in routing.text
            assert "fixture-new-provider-key" not in imported.text

    asyncio.run(exercise())


@pytest.mark.parametrize("official", [True, False])
def test_metadata_http_keeps_serving_applicability_and_source_evidence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, official: bool
) -> None:
    """Public suggestions stay transient and cannot certify a custom proxy."""
    document = catalog_document()
    document["gateway"] = {"api_key_env": "ONBOARDING_GATEWAY_KEY"}
    monkeypatch.setenv("ONBOARDING_GATEWAY_KEY", "fixture-gateway-key")
    monkeypatch.delenv("ONBOARDING_METADATA_KEY", raising=False)
    models_file = tmp_path / "models.json"
    models_file.write_text(json.dumps(document), encoding="utf-8")
    baseline_bytes = models_file.read_bytes()
    source_urls: list[str] = []

    def public_source(url: str, **kwargs: Any) -> JsonResponse:
        source_urls.append(url)
        headers = kwargs.get("headers", {})
        assert "authorization" not in {name.lower() for name in headers}
        assert "fixture-upstream-key" not in json.dumps(kwargs)
        if url == model_metadata.SOURCE_URLS["models_dev"]:
            return JsonResponse(
                {
                    "openai": {
                        "models": {
                            "fixture-model": {
                                "id": "fixture-model",
                                "cost": {"input": 2.0, "output": 8.0},
                                "tool_call": False,
                                "structured_output": True,
                                "last_updated": "2026-09-30",
                            }
                        }
                    }
                }
            )
        assert url == model_metadata.SOURCE_URLS["models_dev_catalog"]
        return JsonResponse({"providers": {}, "models": {}})

    monkeypatch.setattr(
        model_metadata,
        "_CLIENT",
        model_metadata.MetadataClient(fetch=public_source, snapshot_loader=lambda: {}),
    )
    app = gateway.create_app(gateway.load_gateway_config(models_file))
    candidate = {
        "id": "metadata-candidate",
        "type": "openai",
        "brand_id": "openai",
        "api_base": (
            "https://api.openai.com/v1" if official else "https://proxy.fixture.example/v1"
        ),
        "api_key_env": "ONBOARDING_METADATA_KEY",
    }

    async def exercise() -> None:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://gateway.test",
            headers={"Authorization": "Bearer fixture-gateway-key"},
        ) as client:
            response = await client.post(
                "/v1/provider-metadata",
                json={
                    "provider": candidate,
                    "credential": {"action": "set", "value": "fixture-upstream-key"},
                    "upstream_models": ["fixture-model"],
                },
            )
            assert response.status_code == 200
            item = response.json()["items"][0]
            assert item["upstream_model"] == "fixture-model"
            fields = item["fields"]
            assert fields["input_per_million"] == (2.0 if official else None)
            assert fields["output_per_million"] == (8.0 if official else None)
            assert fields["tools"] is (False if official else None)
            assert fields["vision"] is None
            assert fields["json_mode"] is None
            source = item["sources"][0]
            assert source["source"] == "models_dev"
            assert source["applicable"] is official
            assert source["source_updated_at"] == "2026-09-30"
            assert source["fields"]["input_per_million"]["source_unit"] == "USD/M tokens"
            assert source["fields"]["structured_output"]["value"] is True
            assert "fixture-upstream-key" not in response.text
            assert models_file.read_bytes() == baseline_bytes
            assert not (tmp_path / ".env").exists()
            assert not (tmp_path / "routing-overrides.json").exists()
            assert "ONBOARDING_METADATA_KEY" not in os.environ
            assert set(source_urls) == {
                model_metadata.SOURCE_URLS["models_dev"],
                model_metadata.SOURCE_URLS["models_dev_catalog"],
            }
            if not official:
                return

            metadata = copy.deepcopy(item["metadata"])
            assert metadata["version"] == 1
            normalized_source = metadata["sources"][0]
            assert normalized_source["provider_id"] == "openai"
            assert normalized_source["model_id"] == "fixture-model"
            assert (
                normalized_source["fields"]["input_per_million"]["source_unit"]
                == "USD/M tokens"
            )
            confirmed_values: dict[str, Any] = {
                "input_per_million": 2.0,
                "output_per_million": 8.0,
                "tools": False,
                "vision": False,
                "json_mode": False,
                "reasoning": False,
                "temperature": True,
                "reasoning_effort": [],
                "context_window": None,
                "max_output_tokens": 4096,
            }
            for field_name, value in confirmed_values.items():
                evidence = metadata["fields"][field_name]
                evidence.update(
                    {
                        "status": "confirmed",
                        "value": value,
                        "method": "source" if evidence.get("source_ids") else "manual",
                    }
                )
            confirmed_model = {
                "upstream_model": "fixture-model",
                "cost": {"input_per_million": 2.0, "output_per_million": 8.0},
                "capabilities": {
                    name: confirmed_values[name]
                    for name in (
                        "tools", "vision", "json_mode", "reasoning", "temperature",
                        "reasoning_effort",
                    )
                },
                "context_window": None,
                "max_output_tokens": 4096,
                "metadata": metadata,
            }
            snapshot_response = await client.get("/v1/provider-configuration")
            revision = snapshot_response.json()["revision"]
            pending = {
                "expected_revision": revision,
                "operations": [
                    {
                        "action": "upsert",
                        "kind": "llm",
                        "provider": candidate,
                        "credential": {"action": "set", "value": "fixture-upstream-key"},
                    },
                    {
                        "action": "import",
                        "provider_id": "metadata-candidate",
                        "models": [confirmed_model],
                        "confirmed": True,
                    },
                ],
            }
            mismatched = copy.deepcopy(pending)
            mismatched["operations"][1]["models"][0]["metadata"]["fields"][
                "input_per_million"
            ]["value"] = 0.0
            rejected = await client.put("/v1/provider-configuration", json=mismatched)
            assert rejected.status_code == 400
            assert models_file.read_bytes() == baseline_bytes
            assert not (tmp_path / ".env").exists()
            saved = await client.put("/v1/provider-configuration", json=pending)
            assert saved.status_code == 200
            persisted = json.loads(models_file.read_text(encoding="utf-8"))["models"][-1]
            assert persisted["metadata"] == metadata
            reread = await client.get("/v1/provider-configuration")
            imported_model = next(
                row for row in reread.json()["models"]
                if row["name"] == "metadata-candidate/fixture-model"
            )
            assert imported_model["metadata"] == metadata
            assert "fixture-upstream-key" not in saved.text
            assert "fixture-upstream-key" not in reread.text

    asyncio.run(exercise())


def test_private_candidate_discovery_keeps_native_reference_evidence_transient(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The HTTP composition preserves local discovery's safe native evidence."""
    document = catalog_document()
    document["gateway"] = {"api_key_env": "ONBOARDING_GATEWAY_KEY"}
    monkeypatch.setenv("ONBOARDING_GATEWAY_KEY", "fixture-gateway-key")
    monkeypatch.delenv("ONBOARDING_LOCAL_PROVIDER_KEY", raising=False)
    models_file = tmp_path / "models.json"
    models_file.write_text(json.dumps(document), encoding="utf-8")
    original_bytes = models_file.read_bytes()
    calls: list[tuple[str, Mapping[str, Any]]] = []

    def upstream_listing(url: str, **kwargs: Any) -> JsonResponse:
        calls.append((url, kwargs))
        assert kwargs["allow_private_network"] is True
        assert kwargs["headers"]["x-api-key"] == "fixture-local-provider-key"
        return JsonResponse(
            {
                "data": [
                    {
                        "id": "local/claude-1",
                        "max_input_tokens": 128000,
                        "max_tokens": 8192,
                        "capabilities": {"structured_outputs": {"supported": False}},
                    }
                ],
                "has_more": False,
            }
        )

    monkeypatch.setattr("jev_gateway.model_discovery.safe_get_json", upstream_listing)
    app = gateway.create_app(gateway.load_gateway_config(models_file))

    async def exercise() -> None:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://gateway.test",
            headers={"Authorization": "Bearer fixture-gateway-key"},
        ) as client:
            response = await client.post(
                "/v1/provider-discovery",
                json={
                    "provider": {
                        "id": "local-provider",
                        "type": "anthropic",
                        "api_base": "http://127.0.0.1:18080/anthropic/v1",
                        "api_key_env": "ONBOARDING_LOCAL_PROVIDER_KEY",
                        "allow_private_network": True,
                    },
                    "credential": {
                        "action": "set", "value": "fixture-local-provider-key"
                    },
                },
            )
            assert response.status_code == 200
            assert calls[0][0] == "http://127.0.0.1:18080/anthropic/v1/models?limit=100"
            assert response.json()["complete"] is True
            item = response.json()["items"][0]
            assert item["qualified_id"] == "local-provider/local/claude-1"
            assert item["imported"] is False
            assert item["metadata"]["fields"]["json_mode"] is None
            envelope = item["metadata_envelope"]
            assert envelope["fields"]["json_mode"]["status"] == "unknown"
            assert envelope["fields"]["context_window"]["value"] is None
            source = envelope["sources"][0]
            assert source["provider_id"] == "local-provider"
            assert source["fields"]["structured_output"]["value"] is False
            assert source["fields"]["max_input_tokens"]["value"] == 128000
            assert envelope["fields"]["max_output_tokens"]["value"] == 8192
            assert "fixture-local-provider-key" not in response.text
            assert models_file.read_bytes() == original_bytes
            assert not (tmp_path / ".env").exists()
            assert "ONBOARDING_LOCAL_PROVIDER_KEY" not in os.environ

    asyncio.run(exercise())
