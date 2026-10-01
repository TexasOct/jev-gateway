"""Listing protocol fixtures never access upstream providers."""

from __future__ import annotations

import copy
from typing import Any

import pytest

from jev_gateway import model_discovery as discovery
from jev_gateway.discovery_network import DiscoveryNetworkError, JsonResponse


def test_openai_keeps_prefix_credentials_and_qualified_import_identity() -> None:
    provider = {"id": "proxy", "type": "openai", "api_base": "https://example.test/prefix/v1", "params": {"organization": "org-test", "extra_headers": {"secret": "ignored"}}}
    before = copy.deepcopy(provider)
    seen = []
    def fetch(url: str, **kwargs: Any) -> JsonResponse:
        seen.append((url, kwargs))
        return JsonResponse({"data": [{"id": "team/model"}, {"id": "team/model"}, {"id": "other"}]})
    result = discovery.discover_models_with_dependencies(provider, "fixture-secret", imported_ids={"proxy/team/model", "elsewhere/other"}, fetch=fetch)
    assert result["complete"] is True
    assert [item["qualified_id"] for item in result["items"]] == ["proxy/team/model", "proxy/other"]
    assert [item["imported"] for item in result["items"]] == [True, False]
    assert seen[0][0] == "https://example.test/prefix/v1/models"
    assert seen[0][1]["headers"] == {"Authorization": "Bearer fixture-secret", "OpenAI-Organization": "org-test"}
    assert result["items"][0]["metadata"]["fields"]["tools"] is None
    assert "fixture-secret" not in repr(result)
    assert provider == before


def test_anthropic_native_auth_version_paging_and_metadata() -> None:
    seen = []
    def fetch(url: str, **kwargs: Any) -> JsonResponse:
        seen.append((url, kwargs))
        if len(seen) == 1:
            return JsonResponse({"data": [{"id": "first", "max_input_tokens": 200000, "max_tokens": 32000, "capabilities": {"image_input": {"supported": False}, "thinking": {"supported": True}, "effort": {"supported": True, "low": {"supported": True}, "max": {"supported": False}}}}], "has_more": True, "last_id": "first"})
        return JsonResponse({"data": [{"id": "second"}], "has_more": False})
    result = discovery.discover_models_with_dependencies({"id": "native", "type": "anthropic", "api_base": "https://example.test/prefix"}, "fixture-secret", imported_ids=set(), fetch=fetch)
    assert result["complete"] is True
    assert seen[0][0] == "https://example.test/prefix/v1/models?limit=100"
    assert seen[1][0].endswith("limit=100&after_id=first")
    assert seen[0][1]["headers"] == {"anthropic-version": "2023-06-01", "x-api-key": "fixture-secret"}
    metadata = result["items"][0]["metadata"]
    assert metadata["fields"]["vision"] is False
    assert metadata["fields"]["reasoning_effort"] == ["low"]
    assert metadata["fields"]["context_window"] is None
    assert metadata["fields"]["max_output_tokens"] == 32000
    assert metadata["sources"][0]["fields"]["max_input_tokens"]["value"] == 200000


def test_deepseek_metadata_is_based_on_explicit_fields_only() -> None:
    result = discovery.discover_models_with_dependencies({"id": "ds", "type": "deepseek", "allow_private_network": True, "api_base": "http://localhost:8080/prefix"}, None, imported_ids=set(), fetch=lambda url, **kwargs: JsonResponse({"data": [{"id": "reasoner", "context_window": 100000, "max_output_tokens": None, "input_modalities": ["text"], "effort": {"supported_levels": ["high", "max"]}}]}))
    assert result["complete"] is True
    fields = result["items"][0]["metadata"]["fields"]
    assert fields["vision"] is False
    assert fields["reasoning"] is None
    assert fields["input_per_million"] is None
    assert fields["reasoning_effort"] == ["high", "max"]


@pytest.mark.parametrize("transport", ["system_one", "gemini", "azure", "unknown"])
def test_unsupported_transport_never_calls_models(transport: str) -> None:
    def forbidden(*args: Any, **kwargs: Any) -> JsonResponse:
        pytest.fail("Unsupported transport made a request")
    result = discovery.discover_models_with_dependencies({"id": "instance", "type": transport}, None, imported_ids=set(), fetch=forbidden)
    assert result == {"provider_id": "instance", "supported": False, "complete": False, "items": [], "warnings": ["discovery_unsupported"]}


def test_empty_partial_invalid_and_hostile_errors_have_distinct_states() -> None:
    provider = {"id": "p", "type": "openai", "api_base": "https://example.test/v1"}
    empty = discovery.discover_models_with_dependencies(provider, None, imported_ids=set(), fetch=lambda *a, **k: JsonResponse({"data": []}))
    assert empty["complete"] is True and empty["warnings"] == ["empty_listing"]
    calls = 0
    def partial(*args: Any, **kwargs: Any) -> JsonResponse:
        nonlocal calls
        calls += 1
        if calls == 1:
            return JsonResponse({"data": [{"id": "first"}], "has_more": True, "last_id": "first"})
        raise DiscoveryNetworkError("authentication_failed")
    result = discovery.discover_models_with_dependencies(provider, "fixture-secret", imported_ids=set(), fetch=partial)
    assert result["complete"] is False and len(result["items"]) == 1
    assert result["warnings"] == ["authentication_failed"]
    def hostile(*args: Any, **kwargs: Any) -> JsonResponse:
        raise RuntimeError("fixture-secret")
    result = discovery.discover_models_with_dependencies(provider, "fixture-secret", imported_ids=set(), fetch=hostile)
    assert result["warnings"] == ["upstream_failed"] and "fixture-secret" not in repr(result)
    result = discovery.discover_models_with_dependencies(provider, "fixture-secret", imported_ids=set(), fetch=lambda *a, **k: JsonResponse({"data": [{"id": "<script>"}, {"id": "fixture-secret"}, {"id": "valid"}]}))
    assert result["complete"] is False and len(result["items"]) == 1


def test_models_pages_and_total_time_are_bounded() -> None:
    provider = {"id": "p", "type": "openai", "api_base": "https://example.test/v1"}
    result = discovery.discover_models_with_dependencies(provider, None, imported_ids=set(), fetch=lambda *a, **k: JsonResponse({"data": [{"id": f"m-{i}"} for i in range(1001)]}))
    assert len(result["items"]) == 1000 and result["warnings"] == ["model_limit"] and result["complete"] is False
    count = 0
    def page(*args: Any, **kwargs: Any) -> JsonResponse:
        nonlocal count
        count += 1
        return JsonResponse({"data": [{"id": f"m-{count}"}], "has_more": True, "last_id": f"m-{count}"})
    result = discovery.discover_models_with_dependencies(provider, None, imported_ids=set(), fetch=page)
    assert count == 20 and result["warnings"] == ["page_limit"]
    current = [0.0]
    def slow(*args: Any, **kwargs: Any) -> JsonResponse:
        current[0] += 21
        return JsonResponse({"data": [{"id": "late"}]})
    result = discovery.discover_models_with_dependencies(provider, None, imported_ids=set(), fetch=slow, clock=lambda: current[0])
    assert result["items"] == [] and result["warnings"] == ["timeout"]


def test_base_credentials_and_cyclic_pagination_are_rejected() -> None:
    provider = {"id": "p", "type": "openai", "api_base": "https://example.test/v1?token=fixture-secret"}
    result = discovery.discover_models_with_dependencies(provider, None, imported_ids=set(), fetch=lambda *a, **k: pytest.fail("Credential query reached transport"))
    assert result["warnings"] == ["invalid_url"]
    provider["api_base"] = "https://example.test/v1"
    result = discovery.discover_models_with_dependencies(provider, None, imported_ids=set(), fetch=lambda *a, **k: JsonResponse({"data": [{"id": "same"}], "has_more": True, "last_id": "same"}))
    assert result["warnings"] == ["invalid_pagination"] and result["complete"] is False


def test_cancellation_releases_discovery_capacity() -> None:
    def cancelled(*args: Any, **kwargs: Any) -> JsonResponse:
        raise KeyboardInterrupt
    provider = {"id": "p", "type": "openai", "api_base": "https://example.test/v1"}
    for _ in range(5):
        with pytest.raises(KeyboardInterrupt):
            discovery.discover_models_with_dependencies(provider, None, imported_ids=set(), fetch=cancelled)
    result = discovery.discover_models_with_dependencies(provider, None, imported_ids=set(), fetch=lambda *a, **k: JsonResponse({"data": []}))
    assert result["complete"] is True
