"""Provider templates shared by CLI onboarding and the management API."""

from __future__ import annotations

from typing import Any

from litellm import provider_list

PRESETS: dict[str, dict[str, str | None]] = {
    "openai": {"type": "openai", "api_base": "https://api.openai.com/v1", "api_key_env": "OPENAI_API_KEY"},
    "anthropic": {"type": "anthropic", "api_base": None, "api_key_env": "ANTHROPIC_API_KEY"},
    "deepseek": {"type": "deepseek", "api_base": "https://api.deepseek.com/v1", "api_key_env": "DEEPSEEK_API_KEY"},
}


def provider_presets() -> list[dict[str, Any]]:
    result = [
        {"id": name, "kind": "llm", "display_name": {"openai": "OpenAI", "anthropic": "Anthropic", "deepseek": "DeepSeek"}[name], "brand_id": name, "icon_id": None, **template}
        for name, template in PRESETS.items()
    ]
    if "openrouter" in provider_list:
        result.append({"id": "openrouter", "kind": "llm", "display_name": "OpenRouter", "brand_id": "openrouter", "icon_id": None, "type": "openrouter", "api_base": "https://openrouter.ai/api/v1", "api_key_env": "OPENROUTER_API_KEY"})
    result.append({"id": "system_one", "kind": "decision", "display_name": "System One", "brand_id": None, "icon_id": None, "protocol": "system_one", "api_base": "", "api_key_env": "SYSTEM_ONE_API_KEY"})
    return result
