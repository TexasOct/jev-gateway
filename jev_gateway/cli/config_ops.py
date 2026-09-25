from __future__ import annotations

import copy
import json
import os
import shutil
import tempfile
from contextlib import suppress
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from jev_gateway.catalog import catalog_from_document
from jev_gateway.routing_overlay import read_models_document


def read_document(path: Path) -> dict[str, Any]:
    return read_models_document(path)


def validate_document(document: dict[str, Any], source: str = "models.json") -> None:
    catalog_from_document(document, source)


def backup(path: Path) -> Path | None:
    target = path.with_name("models.json.bak")
    if path.exists():
        shutil.copy2(path, target)
        return target
    return None


def write_document_atomic(path: Path, document: dict[str, Any], *, validate: bool = True) -> None:
    if validate:
        validate_document(document, str(path))
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(document, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        backup(path)
        os.replace(temporary, path)
    except OSError:
        with suppress(OSError):
            os.unlink(temporary)
        raise


def load_catalog_env(path: Path) -> None:
    load_dotenv(path.parent / ".env", override=True)


def redacted_value(variable: str) -> dict[str, Any]:
    return {"name": variable, "has_value": bool(os.getenv(variable))}


def redact_document(document: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(document)
    for provider in result.get("providers", []):
        if isinstance(provider, dict):
            if "params" in provider:
                provider["params"] = dict.fromkeys(provider["params"], "[configured]") if isinstance(provider["params"], dict) else "[configured]"
            key_name = provider.get("api_key_env")
            if isinstance(key_name, str):
                provider["api_key_env"] = redacted_value(key_name)
            params = provider.get("param_env")
            if isinstance(params, dict):
                provider["param_env"] = {k: redacted_value(v) if isinstance(v, str) else None for k, v in params.items()}
    gateway = result.get("gateway")
    if isinstance(gateway, dict) and isinstance(gateway.get("api_key_env"), str):
        gateway["api_key_env"] = redacted_value(gateway["api_key_env"])
    decision = result.get("decision")
    if isinstance(decision, dict):
        for provider in decision.get("providers", []):
            if isinstance(provider, dict) and isinstance(provider.get("api_key_env"), str):
                provider["api_key_env"] = redacted_value(provider["api_key_env"])
    return result
