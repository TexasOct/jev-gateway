"""Finite source matching, unit, native and provenance business oracles."""
from __future__ import annotations

import hashlib
import json
import os
from importlib.metadata import distribution
from pathlib import Path
import subprocess
import sys
from typing import Any

import pytest

from jev_gateway import model_discovery, model_metadata as metadata
from jev_gateway.discovery_network import JsonResponse
from jev_gateway.provider_config import metadata_envelope
from tests.test_metadata_tail_contracts import test_native_effort_declaration_states as assert_native_effort_state
from tests.test_model_legacy_and_evidence_isolation import FIXED, UPDATED, roundtrip
from tests.test_model_metadata import PROVIDER, client_for
from tests.test_model_revision_and_recovery_chat import files
from tests.test_model_transaction_publication import sqlite_app, versions
from tests.test_model_value_domains import record
from tests.test_provider_management_api import headers, request

PRICE_NAMES = ["input_per_million", "output_per_million", "cache_read_per_million", "cache_write_per_million"]
DEV_KEYS = ["input", "output", "cache_read", "cache_write"]
ROUTER_KEYS = ["prompt", "completion", "input_cache_read", "input_cache_write"]
SNAPSHOT_KEYS = ["input_cost_per_token", "output_cost_per_token", "cache_read_input_token_cost", "cache_creation_input_token_cost"]


def source(adapter: str, row: dict[str, Any]) -> dict[str, Any]:
    if adapter == "dev":
        return metadata._models_dev(row, "models_dev", "openai", "exact", FIXED, True)
    if adapter == "router":
        return metadata._openrouter(row, "vendor/exact", FIXED)
    return metadata._litellm(row, "openai", "exact", FIXED, True)


@pytest.mark.parametrize("container", ["api", "catalog"])
@pytest.mark.parametrize("wrong", ["fragment", "version", "latest", "base", "provider", "row_id"])
def test_exact_serving_ids_do_not_guess(container: str, wrong: str) -> None:
    key = {"fragment": "exact", "version": "vendor/exact-v2", "latest": "vendor/exact/latest", "base": "vendor/base", "provider": "vendor/exact", "row_id": "vendor/exact"}[wrong]
    provider = "anthropic" if wrong == "provider" else "openai"
    row = {"id": "vendor/different" if wrong == "row_id" else key, "cost": {"input": 9}, "tool_call": True}
    rows = {provider: {"models": {key: row}}}
    client = client_for(api=rows if container == "api" else {}, catalog={"providers": rows} if container == "catalog" else {})
    item = client.lookup(PROVIDER, ["vendor/exact"])["items"][0]
    assert item["sources"] == [] and all(v is None for v in item["fields"].values())


@pytest.mark.parametrize("container", ["api", "catalog"])
@pytest.mark.parametrize("association", ["canonical_model_id", "base_model"])
def test_explicit_canonical_facts_retain_association_without_serving_prices(container: str, association: str) -> None:
    rows = {"openai": {"models": {"alias": {"id": "alias", association: "vendor/base", "cost": {"input": 2, "output": 8}}}}}
    catalog = {"providers": rows if container == "catalog" else {}, "models": {"vendor/base": {"tool_call": False, "limit": {"context": 8192}, "cost": {"input": 99, "output": 99, "cache_read": 99, "cache_write": 99}}}}
    item = client_for(api=rows if container == "api" else {}, catalog=catalog).lookup(PROVIDER, ["alias"])["items"][0]
    assert [item["fields"][n] for n in PRICE_NAMES] == [2, 8, None, None]
    assert item["fields"]["tools"] is False and item["fields"]["context_window"] == 8192
    envelope = metadata_envelope(item)
    assert envelope["sources"][0]["canonical_model_id"] == "vendor/base"
    canonical = envelope["sources"][1]
    assert canonical["provider_id"] == "canonical" and canonical["model_id"] == "vendor/base"
    assert not set(PRICE_NAMES) & canonical["fields"].keys() and "pricing" not in canonical
    assert envelope["fields"]["input_per_million"]["source_ids"] == [envelope["sources"][0]["id"]]


@pytest.mark.parametrize("channel,transport,endpoint,applicable", [
    ("openai", "openai", "https://api.openai.com/v1", True), ("openai", "openai", "https://api.openai.com:443/v1/", True),
    ("openai", "openai", None, False), ("anthropic", "anthropic", None, True), ("deepseek", "deepseek", None, True), ("openrouter", "openrouter", None, True),
    ("deepseek", "openai", "https://api.deepseek.com/v1", True), ("openrouter", "openai", "https://openrouter.ai/api/v1", True),
    ("openai", "anthropic", "https://api.openai.com/v1", False), ("anthropic", "openai", "https://api.anthropic.com/v1", False),
    ("openai", "openai", "https://proxy.example/v1", False), ("openai", "openai", "http://api.openai.com/v1", False),
    ("openai", "openai", "https://api.openai.com:8443/v1", False), ("openai", "openai", "https://api.openai.com/custom/v1", False),
    ("openai", "openai", "https://api.openai.com:/v1", False), ("openai", "openai", "https://api.openai.com/v1?key=x", False),
])
def test_effective_serving_channel_controls_applicability(channel: str, transport: str, endpoint: Any, applicable: bool) -> None:
    provider = {"id": "instance", "brand_id": channel, "type": transport, "api_base": endpoint, "display_name": "Official-looking", "icon_id": "openai", "allow_private_network": True}
    item = client_for(api={channel: {"models": {"exact": {"cost": {"input": 2}, "tool_call": False}}}}).lookup(provider, ["exact"])["items"][0]
    assert item["fields"]["input_per_million"] == (2 if applicable else None)
    assert item["fields"]["tools"] is (False if applicable else None)
    assert item["sources"][0]["applicable"] is applicable
    assert item["sources"][0]["fields"]["input_per_million"]["value"] == 2
    assert ("reference_only" in item["warnings"]) is not applicable


def test_openrouter_billing_is_its_own_channel() -> None:
    provider = {"type": "openai", "brand_id": "openrouter", "api_base": "https://openrouter.ai/api/v1"}
    api = {"openai": {"models": {"vendor/exact": {"cost": {"input": 70}}}}, "openrouter": {"models": {"vendor/exact": {"cost": {"input": 2}}}}}
    item = client_for(api=api, router={"data": [{"id": "vendor/exact", "pricing": {"prompt": "0.000002"}}]}).lookup(provider, ["vendor/exact"])["items"][0]
    assert item["fields"]["input_per_million"] == 2
    assert {s["source_provider"] for s in item["sources"]} == {"openrouter"}
    assert "metadata_conflict" not in item["warnings"]
    proxy = client_for(api=api, router={"data": [{"id": "vendor/exact", "pricing": {"prompt": "0.000002"}}]}).lookup({**provider, "api_base": "https://proxy.example/v1"}, ["vendor/exact"])["items"][0]
    assert proxy["fields"]["input_per_million"] is None and all(s["applicable"] is False for s in proxy["sources"])
    assert all(s["source"] != "openrouter" for s in proxy["sources"])


@pytest.mark.parametrize("adapter", ["dev", "router", "snapshot"])
@pytest.mark.parametrize("index", range(4))
@pytest.mark.parametrize("raw,per_token,per_million", [(0, 0, 0), (2, 0.000002, 2), (0.2, 0.0000002, 0.2)])
def test_independent_unit_equations(adapter: str, index: int, raw: float, per_token: float, per_million: float) -> None:
    key = (DEV_KEYS if adapter == "dev" else ROUTER_KEYS if adapter == "router" else SNAPSHOT_KEYS)[index]
    prices = {key: raw if adapter == "dev" else per_token}
    row = {"cost": prices} if adapter == "dev" else {"pricing": prices} if adapter == "router" else prices
    evidence = source(adapter, row)
    field = evidence["fields"][PRICE_NAMES[index]]
    assert field["value"] == pytest.approx(per_million) and field["unit"] == "USD/M tokens"
    assert field["source_unit"] == ("USD/M tokens" if adapter == "dev" else "USD/token")
    assert field["source_field"] == ("cost." if adapter == "dev" else "pricing." if adapter == "router" else "") + key
    candidate = metadata._merge_candidates([evidence], [])
    assert candidate["fields"][PRICE_NAMES[index]] == pytest.approx(per_million)
    assert all(candidate["fields"][n] is None for n in PRICE_NAMES if n != PRICE_NAMES[index])


@pytest.mark.parametrize("adapter", ["dev", "router", "snapshot"])
@pytest.mark.parametrize("index", range(4))
@pytest.mark.parametrize("bad", [None, -1, True, False, "invalid", "NaN", "Infinity", "-Infinity", "1e400", float("nan"), float("inf"), [], {}])
def test_invalid_source_prices_remain_unknown(adapter: str, index: int, bad: Any) -> None:
    key = (DEV_KEYS if adapter == "dev" else ROUTER_KEYS if adapter == "router" else SNAPSHOT_KEYS)[index]
    prices = {key: bad}
    evidence = source(adapter, {"cost": prices} if adapter == "dev" else {"pricing": prices} if adapter == "router" else prices)
    item = metadata._merge_candidates([evidence], [])
    assert all(item["fields"][n] is None for n in PRICE_NAMES)
    envelope = metadata_envelope(item)
    assert envelope["fields"][PRICE_NAMES[index]]["status"] == "unknown" and envelope["fields"][PRICE_NAMES[index]]["value"] is None


@pytest.mark.parametrize("transport", ["openai", "anthropic", "deepseek"])
def test_native_reasoner_name_without_declarations_proves_no_facts(transport: str) -> None:
    result = metadata.native_model_metadata({"id": "vendor/reasoner-latest"}, transport, "instance", FIXED)
    assert all(v is None for v in result["fields"].values()) and result["sources"][0]["fields"] == {}


def test_explicit_native_reference_fields_and_effort() -> None:
    result = metadata.native_model_metadata({"id": "exact", "max_tokens": 1024, "max_input_tokens": 8192, "capabilities": {"image_input": {"supported": False}, "structured_outputs": {"supported": True}, "thinking": {"supported": False}, "effort": {"supported": True, "low": {"supported": True}, "high": {"supported": False}}}}, "anthropic", "instance", FIXED)
    assert result["fields"]["vision"] is False and result["fields"]["reasoning"] is False
    assert result["fields"]["reasoning_effort"] == ["low"] and result["fields"]["max_output_tokens"] == 1024
    assert result["fields"]["context_window"] is None and result["fields"]["json_mode"] is None
    source_fields = result["sources"][0]["fields"]
    assert source_fields["max_input_tokens"] == {"value": 8192, "source_field": "max_input_tokens", "unit": "tokens"}
    assert source_fields["structured_output"]["value"] is True
    deepseek = metadata.native_model_metadata({"id": "exact", "context_window": 8192, "max_output_tokens": 1024, "input_modalities": ["text"], "effort": {"supported_levels": ["low", "high"]}}, "deepseek", "instance", FIXED)
    assert deepseek["fields"]["vision"] is False and deepseek["fields"]["context_window"] == 8192
    assert deepseek["fields"]["reasoning_effort"] == ["low", "high"] and deepseek["fields"]["reasoning"] is None


@pytest.mark.parametrize("declaration,expected", [
    ({"supported": False}, []), ({"supported": True}, None),
    ({"supported": True, "low": {"supported": False}}, None),
    ({"supported": True, "low": {"supported": True}}, ["low"]),
    ({"supported": True, **{name: {"supported": False} for name in ("low", "medium", "high", "xhigh", "max")}}, []),
    ({"supported": True, **{name: {"supported": True} for name in ("low", "medium", "high", "xhigh", "max")}}, ["low", "medium", "high", "xhigh", "max"]),
])
def test_native_effort_states_execute_the_existing_exact_oracle(declaration: dict[str, Any], expected: Any) -> None:
    assert_native_effort_state(declaration, expected)


@pytest.mark.parametrize("parameters", ["missing", None, [], ["tools", "response_format", "temperature", "reasoning"], [1]])
def test_complete_parameter_declaration_differs_from_missing_or_null(parameters: Any) -> None:
    row = {"supported_parameters": parameters} if parameters != "missing" else {}
    result = metadata._merge_candidates([metadata._openrouter(row, "vendor/exact", FIXED)], [])
    for field in ["tools", "json_mode", "temperature", "reasoning"]:
        assert result["fields"][field] is (True if isinstance(parameters, list) and parameters and parameters[0] == "tools" else False if parameters == [] else None)


@pytest.mark.parametrize("levels,expected", [(None, None), ([], []), (["low", "high"], ["low", "high"]), (["vendor"], None)])
def test_deepseek_effort_exact_declaration(levels: Any, expected: Any) -> None:
    item = metadata.native_model_metadata({"id": "exact", "effort": {"supported_levels": levels}}, "deepseek", "instance", FIXED)
    assert item["fields"]["reasoning_effort"] == expected


@pytest.mark.parametrize("key,provider,matched", [("openai/exact", "openai", True), ("exact", "openai", True), ("anthropic/exact", "openai", False), ("openai/exact", "anthropic", False), ("exact-latest", "openai", False)])
def test_static_snapshot_key_and_provider_are_exact(key: str, provider: str, matched: bool) -> None:
    item = client_for(snapshot={key: {"litellm_provider": provider, "input_cost_per_token": 0.000002}}).lookup(PROVIDER, ["exact"])["items"][0]
    assert item["fields"]["input_per_million"] == (2 if matched else None)
    assert item["fields"]["output_per_million"] is None and item["fields"]["tools"] is None


def test_actual_installed_backup_is_static_without_new_import_or_network(tmp_path: Path) -> None:
    package = distribution("litellm")
    path = Path(str(package.locate_file("litellm/model_prices_and_context_window_backup.json")))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    script = '''import builtins,json,socket,sys,hashlib
from importlib.metadata import distribution
real_import=builtins.__import__
def blocked_import(name,*args,**kwargs):
 if name.split('.')[0]=='litellm': raise AssertionError('New LiteLLM import forbidden')
 return real_import(name,*args,**kwargs)
builtins.__import__=blocked_import
def forbidden(*args,**kwargs): raise AssertionError('Network forbidden')
socket.getaddrinfo=forbidden
socket.socket.connect=forbidden
from jev_gateway import model_metadata as m
m.safe_get_json=forbidden
d=distribution('litellm');p=d.locate_file('litellm/model_prices_and_context_window_backup.json')
data=m._load_litellm_snapshot()
assert 'litellm' not in sys.modules
assert data==json.loads(p.read_bytes())
row=data['gpt-4o-mini'];assert row['litellm_provider']=='openai'
c=m.MetadataClient(fetch=lambda *a,**k:m.JsonResponse({}))
i=c.lookup({'type':'openai','api_base':'https://api.openai.com/v1'},['gpt-4o-mini'])['items'][0]
assert abs(i['fields']['input_per_million']-0.15)<1e-12
assert abs(i['fields']['output_per_million']-0.6)<1e-12
assert i['fields']['context_window'] is None and i['fields']['json_mode'] is None
assert i['sources'][0]['fields']['max_input_tokens']['value']==128000
print(json.dumps({'version':d.version,'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'fields':i['fields']}))
'''
    result = subprocess.run([sys.executable, "-c", script], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    observed = json.loads(result.stdout)
    assert observed["version"] == package.version and observed["path"] == str(path) and observed["sha256"] == digest
    (tmp_path / "installed-distribution-evidence.json").write_text(json.dumps(observed, indent=2))


def test_conditional_prices_are_reference_not_cheapest_flat_quotes() -> None:
    evidence = metadata._models_dev({"cost": {"input": 2, "output": 8, "cache_read": 0.2, "cache_write": 9, "request": 1, "image": 3, "web_search": 4, "input_audio": 6, "tiers": [{"input": 0.01, "tier": {"type": "context", "size": 200000}}]}}, "models_dev", "openai", "exact", FIXED, True)
    item = metadata._merge_candidates([evidence], [])
    assert [item["fields"][n] for n in PRICE_NAMES] == [2, 8, 0.2, 9]
    prices = evidence["pricing"]
    assert prices["tiers"][0] == {"input": {"value": 0.01, "unit": "USD/M tokens"}, "condition": {"type": "context", "size": 200000}}
    for name in ["request", "image", "web_search"]:
        assert prices[name]["unit"] == "USD/source unit"
    assert prices["input_audio"]["value"] == 6 and "input_audio" not in item["fields"]
    legacy = metadata._models_dev({"cost": {"context_over_200k": {"input": 0.01}}}, "models_dev", "openai", "exact", FIXED, True)
    assert legacy["pricing"]["context_over_200k"]["threshold_unverified"] is True
    assert metadata._merge_candidates([legacy], [])["fields"]["input_per_million"] is None
    router = metadata._openrouter({"pricing": {"prompt": "0.000002", "input_cache_write_1h": "0.000006", "overrides": [{"prompt": "0.00000001", "min_prompt_tokens": 200000, "utc_start": 1630, "utc_end": 30, "utc_days": ["monday"], "condition": {"time": "12:30", "context_length": 200000}, "untrusted_vendor_condition": "discard"}]}}, "vendor/exact", FIXED)
    assert router["pricing"]["input_cache_write_1h"]["value"] == 6
    override = router["pricing"]["overrides"][0]
    assert override["utc_days"] == ["monday"] and override["utc_start"] == 1630 and override["utc_end"] == 30
    assert override["time"] == "12:30" and override["context_length"] == 200000 and override["min_prompt_tokens"] == 200000
    assert override["unrecognized_conditions"] is True and "untrusted_vendor_condition" not in override
    assert metadata._merge_candidates([router], [])["fields"]["input_per_million"] == 2
    assert metadata._merge_candidates([router], [])["fields"]["cache_write_per_million"] is None
    metadata_envelope(item)
    metadata_envelope(metadata._merge_candidates([router], []))


@pytest.mark.parametrize("key", ["input_cost_per_token_batches", "output_cost_per_token_flex", "input_cost_per_token_priority", "input_cost_per_token_above_272k_tokens_priority", "cache_creation_input_token_cost_above_1hr_above_200k_tokens", "cache_read_input_audio_token_cost", "citation_cost_per_token"])
def test_snapshot_conditional_rates_do_not_promote_to_base_fields(key: str) -> None:
    evidence = metadata._litellm({key: 0.000002}, "openai", "exact", FIXED, True)
    assert evidence["pricing"][key] == {"value": 2, "unit": "USD/M tokens"}
    assert all(metadata._merge_candidates([evidence], [])["fields"][n] is None for n in PRICE_NAMES)
    metadata_envelope(metadata._merge_candidates([evidence], []))


@pytest.mark.parametrize("adapter", ["router", "snapshot"])
@pytest.mark.parametrize("key", ["request", "image", "web_search"])
def test_source_unit_charges_are_not_multiplied_or_promoted(adapter: str, key: str) -> None:
    evidence = source(adapter, {"pricing": {key: 0.003}} if adapter == "router" else {key: 0.003})
    assert evidence["pricing"][key] == {"value": 0.003, "unit": "USD/source unit"}
    assert all(v is None for v in metadata._merge_candidates([evidence], [])["fields"].values())


@pytest.mark.parametrize("name,first,second", [("tools", False, True), ("reasoning", True, False), ("input_per_million", 0, 2), ("output_per_million", 0, 2), ("cache_read_per_million", 0, 0.2), ("cache_write_per_million", 9, 10), ("reasoning_effort", [], ["high"]), ("context_window", 8192, 16384), ("max_output_tokens", 1024, 2048)])
@pytest.mark.parametrize("relation", ["null", "same", "conflict", "reference", "all_unknown"])
def test_merge_state_and_canonical_references_agree(name: str, first: Any, second: Any, relation: str) -> None:
    values = [None, None] if relation == "all_unknown" else [first, None if relation == "null" else first if relation == "same" else second]
    sources = [{"source": source_name, "source_provider": "openai", "source_model": "exact", "fetched_at": FIXED, "applicable": not (index == 1 and relation == "reference"), "fields": {name: {"value": value, "source_field": name}}} for index, (source_name, value) in enumerate(zip(["native_listing", "models_dev"], values))]
    candidate = metadata._merge_candidates(sources, [])
    envelope = metadata_envelope(candidate)
    status = "unknown" if relation == "all_unknown" else "conflict" if relation == "conflict" else "known"
    expected = None if status != "known" else first
    assert candidate["fields"][name] == expected
    assert envelope["fields"][name] == {"status": status, "value": expected, "source_ids": ["native_listing-0", "models_dev-1"]}
    assert [s["fields"][name]["value"] for s in envelope["sources"]] == values
    assert ("metadata_conflict" in candidate["warnings"]) is (relation == "conflict")


def test_cosmetic_brand_changes_never_authenticate_proxy_rates() -> None:
    client = client_for(api={"openai": {"models": {"exact": {"cost": {"input": 2}}}}, "anthropic": {"models": {"exact": {"cost": {"input": 7}}}}})
    for brand, label, icon in [("openai", "OpenAI", "openai"), ("openai", "Renamed", "server"), ("anthropic", "Anthropic", "anthropic")]:
        item = client.lookup({"type": "openai", "api_base": "https://proxy.example/v1", "brand_id": brand, "display_name": label, "icon_id": icon}, ["exact"])["items"][0]
        assert item["fields"]["input_per_million"] is None and item["sources"][0]["applicable"] is False
        assert item["sources"][0]["fields"]["input_per_million"]["value"] == (2 if brand == "openai" else 7)


def test_conditional_and_unit_evidence_survives_real_publication(tmp_path: Path) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        dev = source("dev", {"cost": {"input": 2, "output": 8, "cache_read": 0.2, "cache_write": 9, "request": 1, "input_audio": 6, "tiers": [{"input": 0.01, "tier": {"type": "context", "size": 200000}}], "context_over_200k": {"input": 0.02}}})
        # Legacy evidence is a separate declaration when modern tiers are present.
        legacy = source("dev", {"cost": {"context_over_200k": {"input": 0.02}}})
        snapshot = source("snapshot", {"cache_creation_input_token_cost_above_1hr_above_200k_tokens": 0.000002, "input_cost_per_token_batches": 0.00000001, "output_cost_per_token_flex": 0.000003, "input_cost_per_token_priority": 0.000004, "cache_read_input_audio_token_cost": 0.000005})
        router = source("router", {"pricing": {"prompt": "0.000002", "input_cache_write_1h": "0.000006", "overrides": [{"prompt": "0.00000001", "utc_days": ["monday"], "utc_start": 1630, "utc_end": 30, "condition": {"time": "12:30"}, "vendor_condition": True}]}})
        envelope = metadata_envelope(metadata._merge_candidates([dev, legacy, snapshot, router], []))
        envelope["fields"]["input_per_million"].update(status="confirmed", method="source", confirmed_at=FIXED)
        entry = record()
        entry["cost"]["input_per_million"] = 2
        entry["metadata"] = envelope
        projected = roundtrip(app, config, entry, "update")
        assert projected["metadata"] == envelope and projected["cost"] == entry["cost"]
        assert json.loads(config.models_file.read_text())["models"][0]["metadata"] == envelope
        assert projected["cost"]["input_per_million"] == 2 and projected["cost"]["cache_read_per_million"] == 0
        assert projected["metadata"]["sources"][0]["pricing"]["request"]["unit"] == "USD/source unit"
        assert projected["metadata"]["sources"][1]["pricing"]["context_over_200k"]["threshold_unverified"] is True
        assert projected["metadata"]["sources"][3]["pricing"]["overrides"][0]["unrecognized_conditions"] is True
    finally:
        config.engine.close()


def test_actual_native_and_public_asgi_evidence_persists_and_survives_fresh_process(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    app, config = sqlite_app(tmp_path)
    try:
        document = json.loads(config.models_file.read_text())
        document["providers"][0].update(type="anthropic", brand_id="anthropic", api_base="https://api.anthropic.com/v1")
        config.models_file.write_text(json.dumps(document))
        assert request(app, "POST", "/v1/routing/reload", headers=headers(config)).status_code == 200
        monkeypatch.setattr(model_discovery, "timestamp", lambda: FIXED)
        monkeypatch.setattr(metadata, "timestamp", lambda: FIXED)

        def listing(_url: str, **kwargs: Any) -> JsonResponse:
            assert kwargs["headers"]["x-api-key"] == "fake-before"
            return JsonResponse({"data": [{"id": "vendor/only", "max_tokens": 1024, "max_input_tokens": 8192, "capabilities": {"image_input": {"supported": False}}}], "has_more": False})

        monkeypatch.setattr(model_discovery, "safe_get_json", listing)
        client = client_for(api={"anthropic": {"models": {"vendor/only": {"id": "vendor/only", "cost": {"input": 0, "output": 2}, "last_updated": UPDATED, "limit": {"output": 1024}}}}})
        monkeypatch.setattr(metadata, "_CLIENT", client)
        before, stored, catalog = files(tmp_path), versions(config), config.engine.catalog
        native_response = request(app, "POST", "/v1/provider-discovery", headers=headers(config), json={"provider_id": "test-provider"})
        public_response = request(app, "POST", "/v1/provider-metadata", headers=headers(config), json={"provider_id": "test-provider", "upstream_models": ["vendor/only"]})
        assert native_response.status_code == public_response.status_code == 200
        native = native_response.json()["items"][0]["metadata"]
        public = public_response.json()["items"][0]
        assert files(tmp_path) == before and versions(config) == stored and config.engine.catalog is catalog
        combined = metadata._merge_candidates(native["sources"] + public["sources"], [])
        envelope = metadata_envelope(combined)
        ids = {s["id"] for s in envelope["sources"]}
        assert all(set(f["source_ids"]) <= ids for f in envelope["fields"].values())
        assert envelope["fields"]["max_output_tokens"] == {"status": "known", "value": 1024, "source_ids": ["native_listing-0", "models_dev-1"]}
        src = envelope["sources"][1]
        assert src["provider_id"] == "anthropic" and src["model_id"] == "vendor/only" and src["applicable"] is True
        assert src["schema_revision"] == "f4f37ea6a4315ebdb733a49c35499aa93fd35840"
        assert src["fetched_at"] == FIXED and src["source_updated_at"] == UPDATED
        assert "source_updated_at" not in envelope["sources"][0]
        assert src["fields"]["input_per_million"] == {"value": 0, "source_field": "cost.input", "unit": "USD/M tokens", "source_unit": "USD/M tokens"}
        confirmed = "2026-10-08T08:00:00+00:00"
        envelope["fields"]["input_per_million"].update(status="confirmed", method="source", confirmed_at=confirmed)
        entry = record()
        entry["cost"]["input_per_million"] = 0
        entry["metadata"] = envelope
        assert roundtrip(app, config, entry, "update")["metadata"] == envelope
        script = '''import json,socket,sys,os
os.environ['LITELLM_LOCAL_MODEL_COST_MAP']='True'
def forbidden(*a,**k): raise AssertionError('Fresh-process network forbidden')
socket.getaddrinfo=forbidden;socket.socket.connect=forbidden
from jev_gateway.catalog import load_catalog
print(json.dumps(load_catalog(__import__('pathlib').Path(sys.argv[1])).profiles[0].as_dict()['metadata']))
'''
        result = subprocess.run([sys.executable, "-c", script, str(config.models_file)], cwd=Path(__file__).resolve().parents[1], env={**os.environ, "LITELLM_LOCAL_MODEL_COST_MAP": "True"}, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        assert json.loads(result.stdout) == envelope
    finally:
        config.engine.close()


def test_304_validation_time_keeps_quote_date_and_never_certifies_a_model(monkeypatch: pytest.MonkeyPatch) -> None:
    time = [0.0]
    date = [FIXED]
    calls: list[dict[str, Any]] = []

    def fetch(_url: str, **kwargs: Any) -> JsonResponse:
        calls.append(kwargs)
        if kwargs["headers"]:
            assert kwargs["headers"] == {"If-None-Match": '"quote-v1"'}
            return JsonResponse(None, 304, {"cache-control": "max-age=60"})
        return JsonResponse({"openai": {"models": {"exact": {"cost": {"input": 2}, "last_updated": UPDATED}}}}, headers={"etag": '"quote-v1"', "cache-control": "max-age=60"})

    monkeypatch.setattr(metadata, "timestamp", lambda: date[0])
    client = metadata.MetadataClient(fetch=fetch, clock=lambda: time[0], snapshot_loader=lambda: {})
    first = client.lookup(PROVIDER, ["exact"])["items"][0]
    time[0] = 61.0
    date[0] = "2026-10-08T09:00:00+00:00"
    second = client.lookup(PROVIDER, ["exact"])["items"][0]
    assert first["fields"] == second["fields"] and len(calls) == 4
    assert {s["fetched_at"] for s in first["sources"]} == {FIXED}
    assert {s["fetched_at"] for s in second["sources"]} == {date[0]}
    assert {s["source_updated_at"] for s in second["sources"]} == {UPDATED}
    envelope = metadata_envelope(second)
    assert envelope["fields"]["input_per_million"]["status"] == "known"
    assert "confirmed_at" not in envelope["fields"]["input_per_million"] and "confirmation" not in envelope
