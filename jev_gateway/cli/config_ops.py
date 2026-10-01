from __future__ import annotations

import copy
import json
import os
import shutil
from pathlib import Path
from typing import Any
from collections.abc import Mapping

from jev_gateway.catalog import catalog_from_document
from jev_gateway.routing_overlay import read_models_document
from jev_gateway.config_transaction import configuration_read_lock, optional_bytes, replace_configuration
from jev_gateway.provider_config import credential_snapshot


def read_document(path: Path) -> dict[str, Any]:
    with configuration_read_lock(path):
        return read_models_document(path)


def read_snapshot(path: Path) -> tuple[dict[str, Any], Mapping[str, str]]:
    """Read the document and immutable credentials from one coherent commit."""
    with configuration_read_lock(path):
        return read_models_document(path), credential_snapshot(path)


def validate_document(document: dict[str, Any], source: str = "models.json", credentials: Mapping[str, str] | None = None) -> None:
    catalog_from_document(document, source, credentials)


def backup(path: Path) -> Path | None:
    target = path.with_name("models.json.bak")
    if path.exists():
        shutil.copy2(path, target)
        return target
    return None


def write_document_atomic(path: Path, document: dict[str, Any], *, validate: bool = True) -> None:
    with configuration_read_lock(path):
        if validate:
            validate_document(document, str(path), credential_snapshot(path))
        replace_configuration(path, {
            path: (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode(),
            path.with_name("models.json.bak"): optional_bytes(path),
        })


def load_catalog_env(path: Path) -> Mapping[str, str]:
    """Compatibility entry point returning credentials without changing the process."""
    return credential_snapshot(path)


def redacted_value(variable: str, credentials: Mapping[str, str] | None = None) -> dict[str, Any]:
    environment = os.environ if credentials is None else credentials
    return {"name": variable, "has_value": bool(environment.get(variable))}


def redact_document(document: dict[str, Any], credentials: Mapping[str, str] | None = None) -> dict[str, Any]:
    result = copy.deepcopy(document)
    for provider in result.get("providers", []):
        if isinstance(provider, dict):
            if "params" in provider:
                provider["params"] = dict.fromkeys(provider["params"], "[configured]") if isinstance(provider["params"], dict) else "[configured]"
            key_name = provider.get("api_key_env")
            if isinstance(key_name, str):
                provider["api_key_env"] = redacted_value(key_name, credentials)
            params = provider.get("param_env")
            if isinstance(params, dict):
                provider["param_env"] = {k: redacted_value(v, credentials) if isinstance(v, str) else None for k, v in params.items()}
    gateway = result.get("gateway")
    if isinstance(gateway, dict) and isinstance(gateway.get("api_key_env"), str):
        gateway["api_key_env"] = redacted_value(gateway["api_key_env"], credentials)
    decision = result.get("decision")
    if isinstance(decision, dict):
        for provider in decision.get("providers", []):
            if isinstance(provider, dict) and isinstance(provider.get("api_key_env"), str):
                provider["api_key_env"] = redacted_value(provider["api_key_env"], credentials)
    return result
