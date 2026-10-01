"""Metadata fixtures preserve unknown values, units and serving evidence."""

from __future__ import annotations

import sys
import threading
from typing import Any

import pytest

from jev_gateway import model_metadata as metadata
from jev_gateway.discovery_network import JsonResponse


PROVIDER = {"id": "instance", "type": "openai", "api_base": "https://api.openai.com/v1"}


@pytest.mark.parametrize("supported", [True, False, None])
def test_anthropic_structured_output_is_evidence_only(supported: bool | None) -> None:
    fetched_at = "2026-09-30T00:00:00+00:00"
    result = metadata.native_model_metadata({
        "id": "exact", "capabilities": {"structured_outputs": {"supported": supported}},
    }, "anthropic", "instance", fetched_at)
    assert result["fields"]["json_mode"] is None
    assert "structured_output" not in result["fields"]
    assert result["sources"] == [{
        "source": "native_listing", "source_provider": "instance",
        "source_model": "exact", "fetched_at": fetched_at, "applicable": True,
        "fields": {"structured_output": {
            "value": supported, "source_field": "capabilities.structured_outputs.supported",
        }},
    }]
    assert result["warnings"] == []


def client_for(api: Any = None, catalog: Any = None, router: Any = None, snapshot: Any = None, **kwargs: Any) -> metadata.MetadataClient:
    def fetch(url: str, **request: Any) -> JsonResponse:
        assert not request.get("headers") or set(request["headers"]) <= {"If-None-Match", "If-Modified-Since"}
        assert request["max_bytes"] == 16 * 1024 * 1024
        return JsonResponse({
            metadata.SOURCE_URLS["models_dev"]: api or {},
            metadata.SOURCE_URLS["models_dev_catalog"]: catalog or {},
            metadata.SOURCE_URLS["openrouter"]: router or {},
        }[url])
    return metadata.MetadataClient(fetch=fetch, snapshot_loader=lambda: snapshot or {}, **kwargs)


def test_models_dev_prices_are_usd_per_million_and_unknown_false_stay_distinct() -> None:
    client = client_for(api={"openai": {"models": {"exact": {"id": "exact", "cost": {"input": 0, "output": 8, "cache_read": 0.2, "tiers": [{"tier": {"type": "context", "size": 300000}, "input": 4}]}, "tool_call": False, "reasoning": None, "temperature": False, "structured_output": True, "limit": {"context": 128000, "output": None}, "last_updated": "2024-01-01", "benchmarks": {"quality": 99}}}}})
    result = client.lookup(PROVIDER, ["exact"])
    item = result["items"][0]
    assert item["fields"] == {"input_per_million": 0, "output_per_million": 8, "tools": False, "vision": None, "json_mode": None, "reasoning": None, "temperature": False, "reasoning_effort": None, "context_window": 128000, "max_output_tokens": None}
    source = item["sources"][0]
    assert source["source_updated_at"] == "2024-01-01"
    assert source["fetched_at"] != source["source_updated_at"]
    assert source["pricing"]["tiers"][0]["condition"]["size"] == 300000
    assert source["fields"]["structured_output"]["value"] is True
    assert "quality" not in repr(item)
    assert "pricing_requires_confirmation" in item["warnings"]


def test_openrouter_serving_conversion_and_supported_parameter_evidence() -> None:
    provider = {"id": "router", "type": "openai", "brand_id": "openrouter", "api_base": "https://openrouter.ai/api/v1"}
    client = client_for(router={"data": [{"id": "vendor/exact", "pricing": {"prompt": "0.000002", "completion": "0.000008", "input_cache_read": "0.000001", "overrides": [{"min_prompt_tokens": 200000, "utc_start": 1630, "utc_end": 30, "utc_days": ["monday"], "prompt": "0.000004"}]}, "context_length": 128000, "top_provider": {"max_completion_tokens": 8192}, "architecture": {"input_modalities": ["text", "image"]}, "supported_parameters": ["tools", "response_format", "temperature"]}]})
    item = client.lookup(provider, ["vendor/exact"])["items"][0]
    assert item["fields"]["input_per_million"] == 2
    assert item["fields"]["output_per_million"] == 8
    assert item["fields"]["json_mode"] is True and item["fields"]["reasoning"] is False
    assert item["fields"]["vision"] is True
    assert item["sources"][0]["pricing"]["overrides"][0]["prompt"]["value"] == 4
    override = item["sources"][0]["pricing"]["overrides"][0]
    assert override["min_prompt_tokens"] == 200000
    assert override["utc_start"] == 1630 and override["utc_end"] == 30
    assert override["utc_days"] == ["monday"]


@pytest.mark.parametrize("endpoint", ["https://custom.example/v1", "https://api.openai.com/custom/v1", "http://api.openai.com/v1", "https://api.openai.com:8443/v1"])
def test_native_prices_and_capabilities_are_reference_only_for_custom_endpoints(endpoint: str) -> None:
    client = client_for(api={"openai": {"models": {"exact": {"cost": {"input": 2, "output": 8}, "tool_call": True}}}})
    item = client.lookup({**PROVIDER, "api_base": endpoint}, ["exact"])["items"][0]
    assert item["fields"]["input_per_million"] is None and item["fields"]["tools"] is None
    assert item["sources"][0]["applicable"] is False
    assert item["sources"][0]["fields"]["input_per_million"]["value"] == 2
    assert "reference_only" in item["warnings"]


def test_matching_is_exact_and_canonical_links_are_explicit() -> None:
    client = client_for(catalog={"providers": {"openai": {"models": {"alias": {"id": "alias", "canonical_model_id": "vendor/base"}, "exact": {"cost": {"input": 2}}}}}, "models": {"vendor/base": {"limit": {"context": 64000}, "cost": {"input": 99}}}})
    result = client.lookup(PROVIDER, ["alias", "exa", "exact"])
    assert result["items"][0]["fields"]["context_window"] == 64000
    assert result["items"][0]["fields"]["input_per_million"] is None
    assert result["items"][1]["sources"] == []
    assert result["items"][2]["fields"]["input_per_million"] == 2


def test_source_conflicts_keep_both_candidates_and_null_field() -> None:
    client = client_for(api={"openai": {"models": {"exact": {"cost": {"input": 2}, "tool_call": True}}}}, catalog={"providers": {"openai": {"models": {"exact": {"cost": {"input": 3}, "tool_call": False}}}}})
    item = client.lookup(PROVIDER, ["exact"])["items"][0]
    assert item["fields"]["input_per_million"] is None and item["fields"]["tools"] is None
    assert len(item["sources"]) == 2 and "metadata_conflict" in item["warnings"]


def test_litellm_backup_fallback_has_no_implicit_zero_or_total_input_window() -> None:
    client = client_for(snapshot={"openai/exact": {"litellm_provider": "openai", "input_cost_per_token": 0.000002, "input_cost_per_token_above_272k_tokens_priority": 0.000004, "cache_creation_input_token_cost_above_1hr_above_200k_tokens": 0.000001, "input_dbu_cost_per_token": 99, "max_input_tokens": 128000, "max_output_tokens": 4096, "supports_function_calling": False}, "other": {"litellm_provider": "anthropic", "input_cost_per_token": 0}})
    result = client.lookup(PROVIDER, ["exact", "other"])
    item = result["items"][0]
    assert item["fields"]["input_per_million"] == 2
    assert item["fields"]["output_per_million"] is None
    assert item["fields"]["context_window"] is None and item["fields"]["max_output_tokens"] == 4096
    assert item["fields"]["tools"] is False
    pricing = item["sources"][0]["pricing"]
    assert pricing["input_cost_per_token_above_272k_tokens_priority"]["value"] == 4
    assert pricing["cache_creation_input_token_cost_above_1hr_above_200k_tokens"]["value"] == 1
    assert "input_dbu_cost_per_token" not in pricing
    assert result["items"][1]["sources"] == []


def test_local_backup_is_read_without_importing_litellm(monkeypatch, tmp_path) -> None:
    path = tmp_path / "backup.json"
    path.write_text('{"exact":{"litellm_provider":"openai"}}')
    class Distribution:
        def locate_file(self, name: str) -> Any:
            assert name == "litellm/model_prices_and_context_window_backup.json"
            return path
    monkeypatch.setattr(metadata, "distribution", lambda name: Distribution())
    before = sys.modules.get("litellm")
    assert metadata._load_litellm_snapshot()["exact"]["litellm_provider"] == "openai"
    assert sys.modules.get("litellm") is before


def test_cache_conditional_refresh_throttling_and_stale_failure() -> None:
    now = [0.0]
    calls: list[dict[str, Any]] = []
    failing = [False]
    def fetch(url: str, **request: Any) -> JsonResponse:
        calls.append({"url": url, **request})
        if failing[0]:
            raise RuntimeError("credential and private endpoint must not escape")
        if request["headers"]:
            return JsonResponse(None, 304, {"cache-control": "max-age=60"})
        return JsonResponse({"openai": {"models": {"exact": {"tool_call": False}}}}, headers={"etag": '"fixture-version"', "cache-control": "max-age=60"})
    client = metadata.MetadataClient(fetch=fetch, clock=lambda: now[0], snapshot_loader=lambda: {})
    first = client.lookup(PROVIDER, ["exact"])
    assert first["stale"] is False and len(calls) == 2
    client.lookup(PROVIDER, ["exact"])
    assert len(calls) == 2
    throttled = client.lookup(PROVIDER, ["exact"], refresh=True)
    assert "refresh_throttled" in throttled["items"][0]["warnings"] and len(calls) == 2
    now[0] = 61
    refreshed = client.lookup(PROVIDER, ["exact"])
    assert refreshed["stale"] is False and calls[-1]["headers"] == {"If-None-Match": '"fixture-version"'}
    now[0] = 122
    failing[0] = True
    stale = client.lookup(PROVIDER, ["exact"])
    assert stale["stale"] is True and stale["items"][0]["fields"]["tools"] is False
    assert "credential" not in repr(stale)
    now[0] = 6 * 60 * 60 + 123
    expired = client.lookup(PROVIDER, ["exact"])
    assert expired["items"][0]["fields"]["tools"] is None
    assert len(client.cache) <= 4


def test_concurrent_fetch_is_coalesced_without_waiting_or_leaking_keys() -> None:
    entered = threading.Event()
    release = threading.Event()
    calls = []
    def fetch(url: str, **request: Any) -> JsonResponse:
        calls.append(url)
        entered.set()
        assert release.wait(2)
        return JsonResponse({})
    client = metadata.MetadataClient(fetch=fetch, snapshot_loader=lambda: {})
    worker = threading.Thread(target=lambda: client.lookup(PROVIDER, ["exact"]))
    worker.start()
    assert entered.wait(2)
    try:
        concurrent = client.lookup(PROVIDER, ["exact"], refresh=True)
        assert len(calls) == 1
        assert "metadata_busy" in concurrent["items"][0]["warnings"]
    finally:
        release.set()
        worker.join(2)


@pytest.mark.parametrize("price", [None, -1, "NaN", "Infinity", True, "invalid"])
def test_invalid_prices_never_become_free(price: Any) -> None:
    client = client_for(api={"openai": {"models": {"exact": {"cost": {"input": price}}}}})
    assert client.lookup(PROVIDER, ["exact"])["items"][0]["fields"]["input_per_million"] is None


def test_empty_unsupported_and_unknown_provider_do_not_fetch() -> None:
    def forbidden(*args: Any, **kwargs: Any) -> JsonResponse:
        pytest.fail("Unmatched query made a request")
    client = metadata.MetadataClient(fetch=forbidden, snapshot_loader=lambda: pytest.fail("Unexpected backup read"))
    assert client.lookup(PROVIDER, [])["items"] == []
    assert client.lookup({"type": "system_one"}, ["model"])["items"] == []
    assert client.lookup({"type": "unknown"}, ["model"])["items"][0]["fields"]["tools"] is None
    assert client.lookup(PROVIDER, ["<svg>"])["items"] == []


def test_source_limit_and_failed_lookup_preserve_safe_unknown_result(monkeypatch) -> None:
    monkeypatch.setattr(metadata, "SOURCE_LIMIT", 64)
    client = metadata.MetadataClient(fetch=lambda *a, **k: JsonResponse({"unsafe": "fixture-secret" * 100}), snapshot_loader=lambda: {})
    result = client.lookup(PROVIDER, ["exact"])
    assert result["stale"] is True
    assert "fixture-secret" not in repr(result)
    assert result["items"][0]["fields"]["input_per_million"] is None


def test_pinned_models_dev_effort_schema_preserves_unmappable_source_values() -> None:
    client = client_for(api={"openai": {"models": {
        "levels": {"reasoning_options": [{"type": "effort", "values": ["low", "high", "max"]}]},
        "unknown": {"reasoning_options": [{"type": "effort", "values": [None, "default", "high"]}]},
    }}})
    items = client.lookup(PROVIDER, ["levels", "unknown"])["items"]
    assert items[0]["fields"]["reasoning_effort"] == ["low", "high", "max"]
    assert items[1]["fields"]["reasoning_effort"] is None
    assert items[1]["sources"][0]["source_reasoning_effort"] == [None, "default", "high"]
    assert "reasoning_effort_requires_confirmation" in items[1]["warnings"]


def test_lookup_returns_detached_evidence_and_never_changes_confirmed_values(monkeypatch) -> None:
    client = client_for(api={"openai": {"models": {"exact": {"cost": {"input": 2}, "tool_call": False}}}})
    monkeypatch.setattr(metadata, "_CLIENT", client)
    provider = {**PROVIDER, "models": [{"upstream_model": "exact", "cost": {"input_per_million": 42}}]}
    first = metadata.lookup_model_metadata(provider, ["exact"])
    first["items"][0]["sources"][0]["fields"]["input_per_million"]["value"] = 999
    second = metadata.lookup_model_metadata(provider, ["exact"])
    assert second["items"][0]["sources"][0]["fields"]["input_per_million"]["value"] == 2
    assert provider["models"][0]["cost"]["input_per_million"] == 42
