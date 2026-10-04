from __future__ import annotations

import copy
import json
from functools import wraps
from collections.abc import Callable
from typing import Any

from jev_gateway.cli.config_ops import read_document, validate_document, write_document_atomic
from jev_gateway.cli.output import CliError, ExitCode
from jev_gateway.cli.paths import RuntimePaths
from jev_gateway.cli.secrets import remove_env, upsert_env
from jev_gateway.provider_presets import PRESETS
from jev_gateway.provider_config import credential_snapshot, _references
from jev_gateway.credentials import credential_path, credential_update, read_credential_bytes
from jev_gateway.config_transaction import configuration_read_lock, optional_bytes, replace_configuration
from jev_gateway.catalog import catalog_from_document, defaults_from_dict
from jev_gateway.routing_overlay import read_overlay, merge_overlay
from jev_gateway.strategy import StrategyRegistry


def _locked(function: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(function)
    def invoke(paths: RuntimePaths, *args: Any, **kwargs: Any) -> Any:
        try:
            with configuration_read_lock(paths.models):
                return function(paths, *args, **kwargs)
        except (ValueError, TypeError) as error:
            raise CliError("invalid_configuration", "Provider configuration validation failed.", ExitCode.INVALID_CONFIG) from error
        except (OSError, RuntimeError) as error:
            raise CliError("operation_failed", "Provider configuration operation failed.", ExitCode.FAILURE) from error
    return invoke


def provider_secret_name(document: dict[str, Any], provider_id: str) -> str:
    for item in document.get("providers", []):
        if isinstance(item, dict) and item.get("id") == provider_id:
            name = item.get("api_key_env")
            if isinstance(name, str) and name:
                return name
            raise CliError("provider_has_no_key_reference", f"Provider {provider_id!r} has no api_key_env.", ExitCode.USAGE)
    preset = PRESETS.get(provider_id)
    if preset:
        if preset["api_key_env"]:
            return str(preset["api_key_env"])
        raise CliError("provider_has_no_key_reference", f"Provider {provider_id!r} has no api_key_env.", ExitCode.USAGE)
    raise CliError("provider_missing", f"Provider {provider_id!r} does not exist and is not a supported preset.", ExitCode.USAGE)


@_locked
def add_provider(paths: RuntimePaths, *, preset: str, provider_id: str | None, provider_type: str | None, api_base: str | None, api_key_env: str | None, models: list[str], tags: list[str], priority: int | None = None, quality: float | None = None, context_window: int | None = None, max_output_tokens: int | None = None, set_defaults: bool = False, secret: str | None = None, dry_run: bool = False, params: dict[str, Any] | None = None, param_env: dict[str, str] | None = None) -> dict[str, Any]:
    if preset not in {*PRESETS, "custom"}:
        raise CliError("unknown_preset", f"Unknown provider preset {preset!r}.", ExitCode.USAGE)
    if not models:
        raise CliError("model_required", "At least one --model is required.", ExitCode.USAGE)
    document = read_document(paths.models)
    identifier = provider_id or preset
    providers = document.setdefault("providers", [])
    entries = document.setdefault("models", [])
    if not isinstance(providers, list) or not isinstance(entries, list):
        raise CliError("invalid_configuration", "Catalog providers and models must be arrays.", ExitCode.INVALID_CONFIG)
    if any(item.get("id") == identifier for item in providers if isinstance(item, dict)):
        raise CliError("provider_exists", f"Provider {identifier!r} already exists.", ExitCode.USAGE)
    template = PRESETS.get(preset, {})
    kind = provider_type or template.get("type")
    base = api_base if api_base is not None else template.get("api_base")
    key_name = api_key_env or str(template.get("api_key_env") or "")
    if template.get("api_base") == "" and not base:
        raise CliError("missing_provider_option", "This preset requires an account-specific --api-base.", ExitCode.USAGE)
    if secret is not None and key_name and _references(document, key_name):
        raise CliError("credential_in_use", "Credential reference is shared by another configuration entry.", ExitCode.USAGE)
    if preset == "custom" and (not kind or not base or not key_name):
        raise CliError("missing_provider_option", "custom requires --type, --api-base, and --api-key-env.", ExitCode.USAGE)
    if secret is not None and not key_name:
        raise CliError("missing_provider_option", "Saving a credential requires --api-key-env.", ExitCode.USAGE)
    if not kind:
        raise CliError("unsupported_provider_type", "Provider type is required.", ExitCode.USAGE)
    provider: dict[str, Any] = {"id": identifier, "type": kind}
    if base:
        provider["api_base"] = base
    if key_name:
        provider["api_key_env"] = key_name
    for field in ("display_name", "brand_id", "icon_id", "allow_private_network"):
        if template.get(field) is not None:
            provider[field] = template[field]
    extra_params = {**copy.deepcopy(template.get("params", {})), **(params or {})}
    extra_env = {**copy.deepcopy(template.get("param_env", {})), **(param_env or {})}
    for field, values in (("params", extra_params), ("param_env", extra_env)):
        if values:
            provider[field] = values
    for field in template.get("setup_fields", []):
        if field["required"] and not provider.get(field["target"], {}).get(field["key"]):
            raise CliError("missing_provider_option", f"This preset requires --{'param-env' if field['target'] == 'param_env' else 'param'} {field['key']}=VALUE.", ExitCode.USAGE)
    candidate = copy.deepcopy(document)
    candidate["providers"].append(provider)
    new_ids = []
    seen_models: set[str] = set()
    for model in models:
        if model in seen_models:
            raise CliError("model_exists", f"Model {identifier}/{model} was specified twice.", ExitCode.USAGE)
        seen_models.add(model)
        if any(item.get("provider") == identifier and item.get("upstream_model") == model for item in entries if isinstance(item, dict)):
            raise CliError("model_exists", f"Model {identifier}/{model} already exists.", ExitCode.USAGE)
        entry: dict[str, Any] = {"provider": identifier, "upstream_model": model}
        if tags:
            entry["tags"] = list(tags)
        if priority is not None:
            entry["priority"] = priority
        if quality is not None:
            entry["quality"] = quality
        if context_window is not None:
            entry["context_window"] = context_window
        if max_output_tokens is not None:
            entry["max_output_tokens"] = max_output_tokens
        if set_defaults:
            entry.setdefault("capabilities", {"tools": True, "vision": True, "json_mode": True, "reasoning": False, "reasoning_effort": [], "temperature": True})
        candidate["models"].append(entry)
        new_ids.append(f"{identifier}/{model}")
    config_env = credential_snapshot(paths.models)
    if key_name and secret is not None:
        config_env = config_env.with_value(key_name, secret)
    try:
        validate_document(candidate, str(paths.models), config_env, allow_missing_credentials=True)
        overlay, error = read_overlay(paths.models)
        if error:
            raise ValueError("Routing overlay must be repaired before changing providers.")
        StrategyRegistry.from_catalog(catalog_from_document(merge_overlay(candidate, overlay), str(paths.models), config_env, allow_missing_credentials=True))
    except (ValueError, TypeError) as exc:
        raise CliError("invalid_configuration", "Provider configuration validation failed.", ExitCode.INVALID_CONFIG) from exc
    if dry_run:
        return {"providers": [identifier], "models": new_ids, "dry_run": True, "secret_set": secret is not None, "api_key_env": key_name or None}
    changes = {paths.models: (json.dumps(candidate, ensure_ascii=False, indent=2) + "\n").encode(), paths.models.with_name("models.json.bak"): optional_bytes(paths.models)}
    if secret is not None and key_name:
        original = read_credential_bytes(paths.models)
        target = credential_path(paths.models)
        changes[target] = credential_update(original, key_name, secret)
        changes[target.with_name("credentials.json.backup")] = original
    replace_configuration(paths.models, changes)
    return {"providers": [identifier], "models": new_ids, "api_key_env": key_name or None, "secret_set": secret is not None}


@_locked
def login(paths: RuntimePaths, provider_id: str, name: str, secret: str | None, dry_run: bool = False) -> dict[str, Any]:
    document = read_document(paths.models) if paths.models.exists() else {"providers": []}
    destination = provider_secret_name(document, provider_id)
    if _references(document, destination, exclude=("llm", provider_id)):
        raise CliError("credential_in_use", "Credential reference is shared by another configuration entry.", ExitCode.USAGE)
    if secret is not None and (not secret or any(character in secret for character in "\r\n\x00")):
        raise CliError("invalid_secret", "Credential must be nonempty and fit on one line.", ExitCode.USAGE)
    if dry_run:
        return {"provider": provider_id, "api_key_env": destination, "secret_set": secret is not None, "dry_run": True}
    if secret is None:
        raise CliError("secret_missing", "A secret source is required.", ExitCode.USAGE)
    upsert_env(paths.env, destination, secret)
    return {"provider": provider_id, "api_key_env": destination, "secret_set": True, "reload_required": True}


@_locked
def logout(paths: RuntimePaths, provider_id: str, dry_run: bool = False) -> dict[str, Any]:
    document = read_document(paths.models) if paths.models.exists() else {"providers": []}
    name = provider_secret_name(document, provider_id)
    if _references(document, name, exclude=("llm", provider_id)):
        raise CliError("credential_in_use", "Credential reference is shared by another configuration entry.", ExitCode.USAGE)
    removed = False if dry_run else remove_env(paths.env, name)
    return {"provider": provider_id, "api_key_env": name, "removed": removed, "dry_run": dry_run, "note": "This does not revoke the upstream key or remove exported shell values."}


@_locked
def list_providers(paths: RuntimePaths) -> list[dict[str, Any]]:
    document = read_document(paths.models)
    counts: dict[str, int] = {}
    for model in document.get("models", []):
        if isinstance(model, dict):
            provider = model.get("provider")
            if isinstance(provider, str):
                counts[provider] = counts.get(provider, 0) + 1
    local_keys = credential_snapshot(paths.models)
    result = []
    for provider in document.get("providers", []):
        if isinstance(provider, dict):
            key_name = provider.get("api_key_env")
            provider_id = provider.get("id")
            public = {key: value for key, value in provider.items() if key != "params"}
            if "params" in provider:
                public["params"] = dict.fromkeys(provider["params"], "[configured]") if isinstance(provider["params"], dict) else "[configured]"
            result.append({**public, "model_count": counts.get(provider_id, 0) if isinstance(provider_id, str) else 0, "key_present": bool(local_keys.get(key_name)) if isinstance(key_name, str) else False})
    return result


@_locked
def remove_provider(paths: RuntimePaths, provider_id: str, force: bool = False, dry_run: bool = False) -> dict[str, Any]:
    document = read_document(paths.models)
    providers = document.get("providers", [])
    models = document.get("models", [])
    if not any(isinstance(item, dict) and item.get("id") == provider_id for item in providers):
        raise CliError("provider_missing", f"Provider {provider_id!r} does not exist.", ExitCode.USAGE)
    owned = [item for item in models if isinstance(item, dict) and item.get("provider") == provider_id]
    default_model = defaults_from_dict(document.get("defaults", {}), str(paths.models)).default_model
    if default_model is not None and any(default_model == f"{provider_id}/{item.get('upstream_model')}" for item in owned):
        raise CliError("provider_in_use", "Provider contains the global default model; clear defaults.default_model before removal.", ExitCode.USAGE)
    if owned and not force:
        raise CliError("provider_in_use", f"Provider {provider_id!r} has models; use --force to remove them.", ExitCode.USAGE)
    affected = sorted({tag for item in owned for tag in item.get("tags", [])})
    candidate = copy.deepcopy(document)
    candidate["providers"] = [item for item in candidate["providers"] if item.get("id") != provider_id]
    candidate["models"] = [item for item in models if item.get("provider") != provider_id]
    credentials = credential_snapshot(paths.models)
    validate_document(candidate, str(paths.models), credentials, allow_missing_credentials=True)
    overlay, error = read_overlay(paths.models)
    if error:
        raise ValueError("Routing overlay must be repaired before changing providers.")
    StrategyRegistry.from_catalog(catalog_from_document(merge_overlay(candidate, overlay), str(paths.models), credentials, allow_missing_credentials=True))
    if not dry_run:
        write_document_atomic(paths.models, candidate, validate=False)
    return {"provider": provider_id, "models_removed": len(owned), "affected_tags": affected, "dry_run": dry_run}
