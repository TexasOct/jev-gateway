"""Provider management, credential snapshots, and validated catalog transactions."""

from __future__ import annotations

import copy
import hashlib
import hmac
import io
import json
import os
import re
import secrets
from types import MappingProxyType
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from dotenv.parser import parse_stream
from dotenv.variables import parse_variables
from litellm import provider_list

from jev_gateway.catalog import Catalog, catalog_from_document, provider_from_dict, model_metadata, _metadata_number
from jev_gateway.config_transaction import configuration_read_lock, optional_bytes, replace_configuration
from jev_gateway.provider_presets import provider_presets
from jev_gateway.routing_overlay import merge_overlay, overlay_path, read_models_document, read_overlay
from jev_gateway.strategy import StrategyRegistry
from jev_gateway.strategy.decision_provider import registered_protocols

_REVISION_KEY = secrets.token_bytes(32)


class RevisionConflict(ValueError):
    """The submitted revision does not match the current files."""


def metadata_envelope(candidate: Mapping[str, Any]) -> dict[str, Any]:
    """Convert query evidence into the strict persistence envelope for confirmation."""
    sources: list[dict[str, Any]] = []
    references: dict[str, list[str]] = {}
    values: dict[str, list[Any]] = {}
    allowed = {"tools", "vision", "json_mode", "reasoning", "temperature", "reasoning_effort", "context_window", "max_output_tokens", "input_per_million", "output_per_million"}
    for source in candidate.get("sources", []):
        if not isinstance(source, dict):
            continue
        if len(sources) >= 32:
            raise ValueError("Too many metadata sources.")
        identifier = f"{source.get('source', 'source')}-{len(sources)}"
        record: dict[str, Any] = {"id": identifier}
        for source_key, key in (("source", "source"), ("source_provider", "provider_id"), ("source_model", "model_id"), ("url", "url"), ("fetched_at", "fetched_at"), ("source_updated_at", "source_updated_at"), ("schema_revision", "schema_revision"), ("canonical_model_id", "canonical_model_id"), ("applicable", "applicable"), ("fields", "fields"), ("pricing", "pricing"), ("source_reasoning_effort", "source_reasoning_effort")):
            if source_key in source:
                record[key] = copy.deepcopy(source[source_key])
        sources.append(record)
        for name, evidence in source.get("fields", {}).items():
            if name not in allowed or not isinstance(evidence, dict):
                continue
            references.setdefault(name, []).append(identifier)
            if source.get("applicable") is not False and evidence.get("value") is not None:
                values.setdefault(name, []).append(evidence["value"])
    fields = {}
    for name in allowed:
        field_values = values.get(name, [])
        conflict = bool(field_values) and any(v != field_values[0] for v in field_values[1:])
        value = candidate.get("fields", {}).get(name)
        fields[name] = {"status": "conflict" if conflict else "known" if value is not None else "unknown", "value": value, "source_ids": references.get(name, [])}
    return model_metadata({"version": 1, "sources": sources, "fields": fields})


_LITERAL_MARKER = "# jev-managed-literal-v1"


def credential_snapshot(models_file: Path, *, env_content: bytes | None = None, external: Mapping[str, str] | None = None) -> Mapping[str, str]:
    with configuration_read_lock(models_file):
        inherited = dict(os.environ if external is None else external)
        content = optional_bytes(models_file.parent / ".env") if env_content is None else env_content
        resolved: dict[str, str | None] = {}
        if content is not None:
            for binding in parse_stream(io.StringIO(content.decode())):
                if binding.key is None:
                    continue
                value = binding.value
                if value is not None and not binding.original.string.rstrip().endswith(_LITERAL_MARKER):
                    # dotenv override=True resolves in file order, including duplicate
                    # assignments and bare names, before updating the inherited values.
                    variables = MappingProxyType({**inherited, **resolved})
                    value = "".join(atom.resolve(variables) for atom in parse_variables(value))
                resolved[binding.key] = value
        inherited.update({key: value for key, value in resolved.items() if value is not None})
        return MappingProxyType(inherited)


def revision(models_file: Path) -> str:
    with configuration_read_lock(models_file):
        digest = hmac.new(_REVISION_KEY, digestmod=hashlib.sha256)
        for path in (models_file, overlay_path(models_file), models_file.parent / ".env"):
            data = optional_bytes(path)
            digest.update(path.name.encode() + b"\0")
            digest.update(b"missing" if data is None else len(data).to_bytes(8, "big") + data)
        return digest.hexdigest()


def env_update(content: bytes | None, name: str, value: str | None) -> bytes:
    if not isinstance(name, str) or not name.isascii() or not name.isidentifier():
        raise ValueError("Credential variable name must be an ASCII identifier.")
    if value is not None and (not isinstance(value, str) or not value or len(value.encode()) > 8192 or any(c in value for c in "\r\n\x00")):
        raise ValueError("Credential must be nonempty and fit on one line within 8 KiB.")
    text = (content or b"").decode()
    output: list[str] = []
    # Dotenv bindings retain their original record bytes, including multiline
    # values. Remove only the selected assignments and keep adjacent blank lines.
    for binding in parse_stream(io.StringIO(text)):
        original = binding.original.string
        if binding.key != name:
            output.append(original)
            continue
        prefix = re.match(r"\s*", original)
        assert prefix is not None
        whitespace = prefix.group()
        boundary = max(whitespace.rfind("\n"), whitespace.rfind("\r"))
        if boundary >= 0:
            output.append(whitespace[:boundary + 1])
    result = "".join(output)
    if value is not None:
        escaped = value.replace("\\", "\\\\").replace("'", "\\'")
        marker = f" {_LITERAL_MARKER}" if "${" in value else ""
        line_ending = re.search(r"\r\n|\n|\r", text)
        newline = line_ending.group() if line_ending is not None else "\n"
        if result and not result.endswith(("\r", "\n")):
            result += newline
        result += f"{name}='{escaped}'{marker}{newline}"
    return result.encode()


def _references(document: dict[str, Any], name: str, *, exclude: tuple[str, str] | None = None) -> int:
    gateway = document.get("gateway") or {}
    decision = document.get("decision") or {}
    if not isinstance(gateway, dict) or not isinstance(decision, dict):
        raise ValueError("Gateway and decision configuration must be objects.")
    count = int(gateway.get("api_key_env") == name)
    for kind, entries in (("llm", document.get("providers", [])), ("decision", decision.get("providers", []))):
        for item in entries:
            if exclude == (kind, item.get("id")):
                continue
            count += int(item.get("api_key_env") == name)
            count += sum(value == name for value in item.get("param_env", {}).values())
    return count


def _import_model(entry: Any, provider_id: str) -> dict[str, Any]:
    if not isinstance(entry, dict):
        raise ValueError("Import models must be objects.")
    result = copy.deepcopy(entry)
    if result.get("provider", provider_id) != provider_id:
        raise ValueError("Imported model provider does not match provider_id.")
    result["provider"] = provider_id
    capabilities = result.get("capabilities")
    if not isinstance(capabilities, dict) or any(type(capabilities.get(key)) is not bool for key in ("tools", "vision", "json_mode", "reasoning", "temperature")) or not isinstance(capabilities.get("reasoning_effort"), list):
        raise ValueError("Import requires five capability booleans and a reasoning_effort list.")
    costs = result.get("cost")
    if not isinstance(costs, dict) or set(costs) != {"input_per_million", "output_per_million"} or any(not _metadata_number(value) for value in costs.values()):
        raise ValueError("Import requires explicit finite nonnegative input and output prices.")
    for name in ("context_window", "max_output_tokens"):
        if name not in result or (result[name] is not None and (type(result[name]) is not int or result[name] <= 0)):
            raise ValueError("Import requires explicit null or positive integer limits.")
    metadata = model_metadata(result.get("metadata"))
    for name, evidence in metadata.get("fields", {}).items():
        actual = capabilities.get(name) if name in capabilities else costs.get(name) if name in costs else result.get(name)
        if evidence["status"] == "confirmed" and ("value" not in evidence or evidence["value"] != actual):
            raise ValueError("Confirmed metadata must match imported routing values.")
    return result


class ProviderConfiguration:
    def __init__(self, models_file: Path, *, external: Mapping[str, str] | None = None) -> None:
        self.models_file = models_file
        self.external = external

    def read(self, *, write_available: bool = False) -> dict[str, Any]:
        with configuration_read_lock(self.models_file):
            document = read_models_document(self.models_file)
            env = credential_snapshot(self.models_file, external=self.external)
            overlay, error = read_overlay(self.models_file)
            if error:
                raise ValueError("Routing overlay could not be read.")
            catalog = catalog_from_document(merge_overlay(document, overlay), str(self.models_file), env)
            return self.project(catalog, revision(self.models_file), write_available=write_available)

    @staticmethod
    def project(catalog: Catalog, token: str, *, write_available: bool = False) -> dict[str, Any]:
        return {
            "revision": token, "write_available": write_available,
            "providers": [item.as_dict() for item in catalog.providers],
            "decision": catalog.decision.as_dict(),
            "defaults": catalog.defaults.as_dict(),
            "models": [item.as_dict() for item in catalog.profiles],
            "presets": provider_presets(), "provider_types": list(provider_list),
            "decision_protocols": list(registered_protocols()),
        }

    def command(self, body: Any, *, apply: bool = False, prepare: Callable[[Catalog], Any] | None = None, activate: Callable[[Catalog, Any], None] | None = None, restore_runtime: Callable[[], None] | None = None) -> dict[str, Any]:
        if not isinstance(body, dict) or set(body) != {"expected_revision", "operations"} or not isinstance(body.get("expected_revision"), str) or not body["expected_revision"]:
            raise ValueError("expected_revision and operations are required.")
        operations = body["operations"]
        if not isinstance(operations, list) or not operations or len(operations) > 1000:
            raise ValueError("operations must be a nonempty bounded list.")
        with configuration_read_lock(self.models_file):
            if body["expected_revision"] != revision(self.models_file):
                raise RevisionConflict("Configuration changed. Refresh before applying.")
            document = read_models_document(self.models_file)
            candidate = copy.deepcopy(document)
            candidate.setdefault("providers", [])
            candidate.setdefault("models", [])
            env_path = self.models_file.parent / ".env"
            original_env = optional_bytes(env_path)
            env_content = original_env
            imported = skipped = 0
            for operation in operations:
                if not isinstance(operation, dict):
                    raise ValueError("Operation must be an object.")
                action = operation.get("action")
                if action == "set_default_model":
                    if set(operation) != {"action", "model"}:
                        raise ValueError("Invalid default model operation.")
                    model = operation["model"]
                    if model is not None and (not isinstance(model, str) or not model.strip()):
                        raise ValueError("Default model must be a nonempty string or null.")
                    candidate.setdefault("defaults", {})["default_model"] = model
                    continue
                if action == "import":
                    if set(operation) != {"action", "provider_id", "models", "confirmed"} or operation["confirmed"] is not True:
                        raise ValueError("Import requires confirmed: true and explicit model records.")
                    provider_id = operation["provider_id"]
                    if not any(p["id"] == provider_id for p in candidate["providers"]):
                        raise ValueError("Import provider is not configured.")
                    if not isinstance(operation["models"], list) or not operation["models"] or len(operation["models"]) > 1000:
                        raise ValueError("Import models must be a nonempty bounded list.")
                    ids = {(m["provider"], m["upstream_model"]) for m in candidate["models"]}
                    for raw in operation["models"]:
                        entry = _import_model(raw, provider_id)
                        identity = (provider_id, entry.get("upstream_model"))
                        if identity in ids:
                            skipped += 1
                            continue
                        candidate["models"].append(entry)
                        ids.add(identity)
                        imported += 1
                    continue
                kind = operation.get("kind")
                if kind not in {"llm", "decision"}:
                    raise ValueError("Provider kind must be llm or decision.")
                if kind == "decision" and candidate.get("decision") is None:
                    candidate["decision"] = {}
                entries = candidate["providers"] if kind == "llm" else candidate.setdefault("decision", {}).setdefault("providers", [])
                if action == "delete":
                    if set(operation) != {"action", "kind", "id"} or not isinstance(operation["id"], str):
                        raise ValueError("Invalid provider delete operation.")
                    identifier = operation["id"]
                    if not any(p["id"] == identifier for p in entries):
                        raise ValueError("Provider does not exist.")
                    if kind == "llm" and any(m["provider"] == identifier for m in candidate["models"]):
                        raise ValueError("Provider is referenced by models; remove references first.")
                    entries[:] = [p for p in entries if p["id"] != identifier]
                elif action == "upsert":
                    if set(operation) != {"action", "kind", "provider", "credential"} or not isinstance(operation["provider"], dict):
                        raise ValueError("Invalid provider upsert operation.")
                    provider = copy.deepcopy(operation["provider"])
                    identifier = provider.get("id")
                    if not isinstance(identifier, str) or not identifier.strip():
                        raise ValueError("Provider id is required.")
                    existing = next((p for p in entries if p["id"] == identifier), None)
                    if existing is not None:
                        for field in ("params", "param_env"):
                            if field not in provider and field in existing:
                                provider[field] = copy.deepcopy(existing[field])
                    if isinstance(provider.get("params"), dict) and any(v == "[configured]" for v in provider["params"].values()):
                        raise ValueError("Redacted parameter markers cannot be saved.")
                    credential = operation["credential"]
                    if not isinstance(credential, dict) or credential.get("action") not in {"keep", "set", "clear"} or set(credential) - {"action", "value"}:
                        raise ValueError("Invalid credential action.")
                    secret_action = credential["action"]
                    if secret_action != "set" and "value" in credential:
                        raise ValueError("Only set accepts a credential value.")
                    if secret_action != "keep":
                        reference = provider.get("api_key_env")
                        if secret_action == "clear" and reference is None and existing is not None:
                            reference = existing.get("api_key_env")
                        if not isinstance(reference, str):
                            raise ValueError("Credential changes require api_key_env.")
                        if _references(candidate, reference, exclude=(kind, identifier)):
                            raise ValueError("Credential reference is shared; update each reference explicitly.")
                        env_content = env_update(env_content, reference, credential.get("value") if secret_action == "set" else None)
                        if secret_action == "set" and "value" not in credential:
                            raise ValueError("Set requires a credential value.")
                    if existing is not None:
                        entries[entries.index(existing)] = provider
                    else:
                        entries.append(provider)
                else:
                    raise ValueError("Unsupported provider operation.")
            env = credential_snapshot(self.models_file, env_content=env_content or b"", external=self.external)
            overlay, error = read_overlay(self.models_file)
            if error:
                raise ValueError("Routing overlay must be repaired before changing providers.")
            # Validate both baseline and effective catalog before preparing runtime state.
            catalog_from_document(candidate, str(self.models_file), env)
            catalog = catalog_from_document(merge_overlay(candidate, overlay), str(self.models_file), env)
            for item in catalog.decision.providers:
                if catalog.decision.enabled and not env.get(item.api_key_env):
                    raise ValueError("Enabled decision providers require configured credentials.")
            registry = prepare(catalog) if prepare else StrategyRegistry.from_catalog(catalog)
            if apply:
                if body["expected_revision"] != revision(self.models_file):
                    raise RevisionConflict("Configuration changed while validating.")
                changes = {self.models_file: (json.dumps(candidate, ensure_ascii=False, indent=2) + "\n").encode(), self.models_file.with_name("models.json.bak"): optional_bytes(self.models_file)}
                if env_content != original_env:
                    changes[env_path] = env_content
                    changes[env_path.with_name(".env.backup")] = original_env
                replace_configuration(self.models_file, changes, activate=(lambda: activate(catalog, registry)) if activate else None, restore_runtime=restore_runtime)
            return {"valid": True, "applied": apply, "imported": imported, "skipped": skipped, **self.project(catalog, revision(self.models_file), write_available=True)}

    def discovery_provider(self, body: Any) -> tuple[dict[str, Any], str | None, set[str]]:
        if not isinstance(body, dict) or ("provider_id" in body) == ("provider" in body):
            raise ValueError("Supply exactly one of provider_id or provider.")
        with configuration_read_lock(self.models_file):
            document = read_models_document(self.models_file)
            env = credential_snapshot(self.models_file, external=self.external)
            if "provider_id" in body:
                provider = next((p for p in document.get("providers", []) if p["id"] == body["provider_id"]), None)
                if provider is None:
                    raise ValueError("LLM provider does not exist.")
                provider = copy.deepcopy(provider)
            else:
                provider = copy.deepcopy(body["provider"])
                if not isinstance(provider, dict):
                    raise ValueError("Provider must be an object.")
            credential = body.get("credential", {"action": "keep"})
            if not isinstance(credential, dict) or credential.get("action") not in {"keep", "set", "clear"} or set(credential) - {"action", "value"}:
                raise ValueError("Invalid candidate credential action.")
            if credential["action"] != "set" and "value" in credential:
                raise ValueError("Only set accepts a credential value.")
            reference = provider.get("api_key_env")
            if credential["action"] != "keep":
                if not isinstance(reference, str):
                    raise ValueError("Candidate credential requires an env reference.")
                if credential["action"] == "clear":
                    env = credential_snapshot(self.models_file, external=self.external, env_content=env_update(optional_bytes(self.models_file.parent / ".env"), reference, None))
                else:
                    env_update(b"", reference, credential.get("value"))
                    if not isinstance(credential.get("value"), str):
                        raise ValueError("Set requires a credential value.")
                    env = MappingProxyType({**env, reference: credential["value"]})
            profile = provider_from_dict(provider, 0, env)
            imported = {f"{m['provider']}/{m['upstream_model']}" for m in document.get("models", [])}
            return provider, profile.api_key, imported
