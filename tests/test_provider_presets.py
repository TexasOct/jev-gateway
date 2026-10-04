"""Shared templates must be complete, parseable and separate from live providers."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from litellm import provider_list

from jev_gateway.catalog import provider_from_dict
from jev_gateway.cli.output import CliError
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.providers import add_provider
from jev_gateway.provider_presets import PRESETS, provider_presets
from tests.helpers import catalog_document


def test_presets_cover_mainstream_supplier_families() -> None:
    brands = {preset["brand_id"] for preset in provider_presets() if preset["kind"] == "llm"}
    assert {
        "openai", "anthropic", "gemini", "deepseek", "qwen", "moonshot", "zhipu",
        "minimax", "doubao", "baidu", "hunyuan", "spark", "stepfun", "baichuan", "yi",
        "siliconcloud", "modelscope", "openrouter", "xai", "mistral", "groq", "cohere",
        "together", "fireworks", "perplexity", "cerebras", "sambanova", "nvidia",
        "huggingface", "novita", "azure", "bedrock", "cloudflare", "ollama", "lmstudio",
    } <= brands
    assert {"vertex_ai", "azure", "bedrock"} <= set(PRESETS)


def test_cli_and_api_use_one_llm_registry_with_documented_defaults() -> None:
    projected = {preset["id"]: preset for preset in provider_presets() if preset["kind"] == "llm"}
    assert set(projected) == set(PRESETS)
    for name, template in PRESETS.items():
        preset = projected[name]
        assert preset["type"] in provider_list
        assert preset["display_name"] and preset["brand_id"] and preset["icon_id"]
        assert preset["docs_url"].startswith("https://")
        assert isinstance(preset["aliases"], list) and preset["aliases"]
        assert not {"api_key", "messages", "model"} & set(preset)
        for field in ("type", "api_base", "api_key_env", "brand_id", "icon_id"):
            assert preset[field] == template[field]
    decision = [preset for preset in provider_presets() if preset["kind"] == "decision"]
    assert len(decision) == 1 and decision[0]["protocol"] == "system_one"


def test_presets_return_detached_metadata() -> None:
    original = provider_presets()
    modified = provider_presets()
    modified[0]["display_name"] = "changed"
    modified[0]["aliases"].append("changed")
    assert provider_presets() == original


@pytest.mark.parametrize("name", list(PRESETS))
def test_every_preset_can_be_parsed_with_explicit_account_values(name: str) -> None:
    template = PRESETS[name]
    fields = {"id", "type", "api_base", "api_key_env", "display_name", "brand_id", "icon_id", "params", "param_env", "allow_private_network"}
    provider: dict[str, Any] = {"id": name, **{field: copy.deepcopy(value) for field, value in template.items() if field in fields}}
    if provider.get("api_base") == "":
        provider["api_base"] = "https://account.example/v1"
    for field in template.get("setup_fields", []):
        if field["required"]:
            provider.setdefault(field["target"], {}).setdefault(field["key"], "FIXTURE_REFERENCE" if field["target"] == "param_env" else "fixture-account")
    credentials = {name: "fake-extra-credential" for name in provider.get("param_env", {}).values()}
    if provider.get("api_key_env"):
        credentials[provider["api_key_env"]] = "fake-preset-credential"
    parsed = provider_from_dict(provider, 0, credentials)
    assert parsed.name == name and parsed.type == template["type"]
    assert parsed.icon_id == template["icon_id"]
    assert "fake-preset-credential" not in json.dumps(parsed.as_dict())
    assert "fake-extra-credential" not in json.dumps(parsed.as_dict())


@pytest.mark.parametrize("name", ["azure", "vertex_ai", "bedrock"])
def test_cli_refuses_incomplete_cloud_setup_without_writing(tmp_path: Path, name: str) -> None:
    paths = runtime_paths(tmp_path)
    paths.models.write_text(json.dumps(catalog_document()))
    baseline = paths.models.read_bytes()
    with pytest.raises(CliError, match="requires"):
        add_provider(paths, preset=name, provider_id="cloud-fixture", provider_type=None, api_base=None, api_key_env=None, models=["fixture-model"], tags=[])
    assert paths.models.read_bytes() == baseline
