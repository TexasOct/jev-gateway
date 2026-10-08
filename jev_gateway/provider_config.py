"""Provider management, credential snapshots, and validated catalog transactions."""

from __future__ import annotations

import copy
import hashlib
import hmac
import json
import secrets
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from litellm import provider_list

from jev_gateway.catalog import Catalog, catalog_from_document, provider_from_dict, model_metadata, _metadata_number, _finite_number
from jev_gateway.config_transaction import configuration_read_lock, optional_bytes, replace_configuration
from jev_gateway.credentials import credential_snapshot, env_update, credential_path, credential_update, read_credential_bytes, validate_secret, validate_reference
from jev_gateway.model_metadata import _automatic_metadata_value
from jev_gateway.provider_presets import provider_presets
from jev_gateway.reasoning import ladder_from_list
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
    allowed = {"tools", "vision", "json_mode", "reasoning", "temperature", "reasoning_effort", "context_window", "max_output_tokens", "input_per_million", "output_per_million", "cache_read_per_million", "cache_write_per_million"}
    for source in candidate.get("sources", []):
        if not isinstance(source, dict):
            continue
        if len(sources) >= 32:
            raise ValueError("Too many metadata sources.")
        identifier = f"{source.get('source', 'source')}-{len(sources)}"
        record: dict[str, Any] = {"id": identifier}
        for source_key, key in (("source", "source"), ("source_provider", "provider_id"), ("source_model", "model_id"), ("url", "url"), ("fetched_at", "fetched_at"), ("source_updated_at", "source_updated_at"), ("schema_revision", "schema_revision"), ("canonical_model_id", "canonical_model_id"), ("applicable", "applicable"), ("fields", "fields"), ("pricing", "pricing"), ("source_reasoning_effort", "source_reasoning_effort"), ("input_modalities", "input_modalities")):
            if source_key in source:
                record[key] = copy.deepcopy(source[source_key])
        sources.append(record)
        for name, evidence in source.get("fields", {}).items():
            if name not in allowed or not isinstance(evidence, dict):
                continue
            references.setdefault(name, []).append(identifier)
            if source.get("applicable") is not False and evidence.get("value") is not None:
                value = _automatic_metadata_value(name, evidence["value"])
                if value is not None:
                    values.setdefault(name, []).append(value)
    fields = {}
    for name in allowed:
        field_values = values.get(name, [])
        conflict = bool(field_values) and any(v != field_values[0] for v in field_values[1:])
        value = None if conflict else _automatic_metadata_value(name, candidate.get("fields", {}).get(name))
        fields[name] = {"status": "conflict" if conflict else "known" if value is not None else "unknown", "value": value, "source_ids": references.get(name, [])}
    return model_metadata({"version": 1, "sources": sources, "fields": fields})


def revision(models_file: Path) -> str:
    with configuration_read_lock(models_file):
        digest = hmac.new(_REVISION_KEY, digestmod=hashlib.sha256)
        for path in (models_file, overlay_path(models_file), models_file.parent / ".env", credential_path(models_file)):
            data = read_credential_bytes(models_file) if path == credential_path(models_file) else optional_bytes(path)
            digest.update(path.name.encode() + b"\0")
            digest.update(b"missing" if data is None else len(data).to_bytes(8, "big") + data)
        return digest.hexdigest()


def _references(document: dict[str, Any], name: str, *, exclude: tuple[str, str] | tuple[str, str, str] | None = None) -> int:
    gateway = document.get("gateway") or {}
    decision = document.get("decision") or {}
    if not isinstance(gateway, dict) or not isinstance(decision, dict):
        raise ValueError("Gateway and decision configuration must be objects.")
    count = int(gateway.get("api_key_env") == name)
    for kind, entries in (("llm", document.get("providers", [])), ("decision", decision.get("providers", []))):
        for item in entries:
            if not isinstance(item, dict):
                raise ValueError("Provider entries must be objects.")
            if exclude != (kind, item.get("id")):
                count += int(item.get("api_key_env") == name)
            bindings = item.get("param_env", {})
            if not isinstance(bindings, dict):
                raise ValueError("Provider param_env must be an object.")
            count += sum(value == name and exclude != (kind, item.get("id"), parameter) for parameter, value in bindings.items())
    return count


def _credential_action(credential: Any) -> tuple[str, str | None]:
    if not isinstance(credential, dict) or credential.get("action") not in {"keep", "set", "clear"}:
        raise ValueError("Invalid credential action.")
    action = credential["action"]
    if set(credential) != ({"action", "value"} if action == "set" else {"action"}):
        raise ValueError("Invalid credential action fields.")
    return action, validate_secret(credential["value"]) if action == "set" else None


def _transport_actions(provider: dict[str, Any], actions: Any) -> list[tuple[str, str, str, str | None]]:
    if not isinstance(actions, dict) or len(actions) > 128:
        raise ValueError("Transport credentials must be a bounded object.")
    bindings = provider.get("param_env", {})
    if not isinstance(bindings, dict):
        raise ValueError("Provider param_env must be an object.")
    result = []
    for parameter, credential in actions.items():
        if not isinstance(parameter, str) or not parameter.isascii() or not parameter.isidentifier() or len(parameter) > 256 or parameter not in bindings:
            raise ValueError("Transport credential requires a declared parameter binding.")
        reference = validate_reference(bindings[parameter])
        action, value = _credential_action(credential)
        result.append((parameter, reference, action, value))
    return result


def _import_model(entry: Any, provider_id: str, *, existing_model: Mapping[str, Any] | None = None) -> dict[str, Any]:
    if not isinstance(entry, dict):
        raise ValueError("Import models must be objects.")
    result = copy.deepcopy(entry)
    if "quality" in result:
        quality = result["quality"]
        unchanged = existing_model is not None and "quality" in existing_model and _finite_number(existing_model["quality"]) and quality == existing_model["quality"]
        if not _finite_number(quality) or (not 0 <= quality <= 1 and not unchanged):
            raise ValueError("New or changed model quality must be between 0 and 1.")
    upstream = result.get("upstream_model")
    if not isinstance(upstream, str) or not upstream.strip() or upstream != upstream.strip() or len(upstream) > 256 or any(ord(char) < 32 or ord(char) == 127 for char in upstream):
        raise ValueError("Model upstream_model must be bounded nonempty text without surrounding whitespace or controls.")
    if result.get("provider", provider_id) != provider_id:
        raise ValueError("Imported model provider does not match provider_id.")
    result["provider"] = provider_id
    capabilities = result.get("capabilities")
    if not isinstance(capabilities, dict) or any(type(capabilities.get(key)) is not bool for key in ("tools", "vision", "json_mode", "reasoning", "temperature")) or not isinstance(capabilities.get("reasoning_effort"), list):
        raise ValueError("Import requires five capability booleans and a reasoning_effort list.")
    capabilities["reasoning_effort"] = list(ladder_from_list(capabilities["reasoning_effort"], "Import capabilities.reasoning_effort"))
    costs = result.get("cost")
    required_prices = {"input_per_million", "output_per_million"}
    optional_prices = {"cache_read_per_million", "cache_write_per_million"}
    if not isinstance(costs, dict) or not required_prices <= set(costs) or set(costs) - (required_prices | optional_prices) or any(not _metadata_number(value) for key, value in costs.items() if key in required_prices or value is not None):
        raise ValueError("Import requires explicit finite nonnegative input and output prices.")
    for name in ("context_window", "max_output_tokens"):
        if name not in result or (result[name] is not None and (type(result[name]) is not int or result[name] <= 0)):
            raise ValueError("Import requires explicit null or positive integer limits.")
    metadata = model_metadata(result.get("metadata"))
    for name, evidence in metadata.get("fields", {}).items():
        actual = capabilities.get(name) if name in capabilities else costs.get(name) if name in costs else result.get(name)
        if evidence["status"] == "confirmed" and ("value" not in evidence or evidence["value"] != actual):
            raise ValueError("Confirmed metadata must match imported routing values.")
    if isinstance(result.get("metadata"), dict):
        result["metadata"] = metadata
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
            catalog = catalog_from_document(merge_overlay(document, overlay), str(self.models_file), env, allow_missing_credentials=True)
            return self.project(catalog, revision(self.models_file), overlay=overlay, write_available=write_available)

    @staticmethod
    def project(catalog: Catalog, token: str, *, overlay: Mapping[str, Any] | None = None, write_available: bool = False) -> dict[str, Any]:
        return {
            "revision": token, "write_available": write_available,
            "gateway": {"api_key_env": catalog.gateway.api_key_env, "has_api_key": bool(catalog.gateway.api_key)},
            "gateway_bootstrap_available": False,
            "providers": [item.as_dict() for item in catalog.providers],
            "decision": catalog.decision.as_dict(),
            "defaults": catalog.defaults.as_dict(),
            "models": [{**item.as_dict(), "routing_overlay_fields": [field for field in ("tags", "priority") if field in (overlay or {}).get("models", {}).get(item.name, {})]} for item in catalog.profiles],
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
            overlay, error = read_overlay(self.models_file)
            if error:
                raise ValueError("Routing overlay must be repaired before changing providers.")
            candidate.setdefault("providers", [])
            candidate.setdefault("models", [])
            env_path = self.models_file.parent / ".env"
            original_env = optional_bytes(env_path)
            env_content = original_env
            secret_path = credential_path(self.models_file)
            original_credentials = read_credential_bytes(self.models_file)
            credential_content = original_credentials
            credential_changes: list[tuple[str, tuple[str, str] | tuple[str, str, str]]] = []
            imported = skipped = 0
            for operation in operations:
                if not isinstance(operation, dict):
                    raise ValueError("Operation must be an object.")
                action = operation.get("action")
                if action == "update_model":
                    if set(operation) != {"action", "model_id", "model"} or not isinstance(operation["model_id"], str):
                        raise ValueError("Invalid model update operation.")
                    existing_model = next((m for m in candidate["models"] if f"{m['provider']}/{m['upstream_model']}" == operation["model_id"]), None)
                    if existing_model is None:
                        raise ValueError("Model does not exist.")
                    entry = _import_model(operation["model"], existing_model["provider"], existing_model=existing_model)
                    if entry.get("upstream_model") != existing_model["upstream_model"]:
                        raise ValueError("Model identity is immutable; import a new model to change its upstream identity.")
                    # Routing membership belongs to its baseline/overlay owner. Optional
                    # attributes omitted by older clients retain their stored values.
                    for field in ("tags", "priority", "quality", "metadata"):
                        if field not in entry and field in existing_model:
                            entry[field] = copy.deepcopy(existing_model[field])
                    for field in overlay.get("models", {}).get(operation["model_id"], {}):
                        if field in existing_model:
                            entry[field] = copy.deepcopy(existing_model[field])
                        else:
                            entry.pop(field, None)
                    entry = _import_model(entry, existing_model["provider"], existing_model=existing_model)
                    candidate["models"][candidate["models"].index(existing_model)] = entry
                    continue
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
                    required = {"action", "kind", "provider", "credential"}
                    if not required <= set(operation) or set(operation) - (required | {"transport_credentials"}) or not isinstance(operation["provider"], dict) or (kind != "llm" and "transport_credentials" in operation):
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
                        credential_changes.append((reference, (kind, identifier)))
                        if secret_action == "set" and "value" not in credential:
                            raise ValueError("Set requires a credential value.")
                        value = validate_secret(credential.get("value")) if secret_action == "set" else None
                        credential_content = credential_update(credential_content, reference, value)
                        if secret_action == "clear":
                            env_content = env_update(env_content, reference, None)
                    if existing is not None:
                        entries[entries.index(existing)] = provider
                    else:
                        entries.append(provider)
                    for parameter, reference, transport_action, value in _transport_actions(provider, operation.get("transport_credentials", {})):
                        if transport_action == "keep":
                            continue
                        owner = (kind, identifier, parameter)
                        if _references(candidate, reference, exclude=owner):
                            raise ValueError("Credential reference is shared; update each reference explicitly.")
                        credential_changes.append((reference, owner))
                        credential_content = credential_update(credential_content, reference, value)
                        if transport_action == "clear":
                            env_content = env_update(env_content, reference, None)
                else:
                    raise ValueError("Unsupported provider operation.")
            for reference, owner in credential_changes:
                if _references(candidate, reference, exclude=owner):
                    raise ValueError("Credential reference is shared; update each reference explicitly.")
            env = credential_snapshot(self.models_file, env_content=env_content or b"", credential_content=credential_content or b'{"version":1,"values":{}}', external=self.external)
            overlay, error = read_overlay(self.models_file)
            if error:
                raise ValueError("Routing overlay must be repaired before changing providers.")
            # Validate both baseline and effective catalog before preparing runtime state.
            catalog_from_document(candidate, str(self.models_file), env, allow_missing_credentials=True)
            catalog = catalog_from_document(merge_overlay(candidate, overlay), str(self.models_file), env, allow_missing_credentials=True)
            for operation in operations:
                if operation.get("action") == "set_default_model" and operation.get("model") is not None:
                    profile = catalog.by_name(operation["model"])
                    if profile is None or not profile.enabled:
                        raise ValueError("Default model must reference an enabled configured model.")
            registry = prepare(catalog) if prepare else StrategyRegistry.from_catalog(catalog)
            if apply:
                if body["expected_revision"] != revision(self.models_file):
                    raise RevisionConflict("Configuration changed while validating.")
                changes = {self.models_file: (json.dumps(candidate, ensure_ascii=False, indent=2) + "\n").encode(), self.models_file.with_name("models.json.bak"): optional_bytes(self.models_file)}
                if env_content != original_env:
                    changes[env_path] = env_content
                    changes[env_path.with_name(".env.backup")] = original_env
                if credential_content != original_credentials:
                    changes[secret_path] = credential_content
                    changes[secret_path.with_name("credentials.json.backup")] = original_credentials
                replace_configuration(self.models_file, changes, activate=(lambda: activate(catalog, registry)) if activate else None, restore_runtime=restore_runtime)
            return {"valid": True, "applied": apply, "imported": imported, "skipped": skipped, **self.project(catalog, revision(self.models_file), overlay=overlay, write_available=True)}

    def gateway_credential(self, body: Any, *, prepare: Callable[[Catalog], Any], activate: Callable[[Catalog, Any], None], restore_runtime: Callable[[], None]) -> dict[str, Any]:
        if not isinstance(body, dict) or set(body) != {"expected_revision", "credential"} or not isinstance(body["expected_revision"], str) or not body["expected_revision"]:
            raise ValueError("Invalid gateway credential operation.")
        credential = body["credential"]
        if not isinstance(credential, dict) or set(credential) != {"action", "value"} or credential["action"] != "set":
            raise ValueError("Gateway credential requires set.")
        value = validate_secret(credential["value"])
        if not value.isascii() or any(not (33 <= ord(char) <= 126) for char in value):
            raise ValueError("Gateway credential must contain visible ASCII characters without whitespace.")
        with configuration_read_lock(self.models_file):
            if body["expected_revision"] != revision(self.models_file):
                raise RevisionConflict("Configuration changed. Refresh before applying.")
            document = read_models_document(self.models_file)
            candidate = copy.deepcopy(document)
            if candidate.get("gateway") is None:
                candidate["gateway"] = {}
            gateway = candidate.setdefault("gateway", {})
            if not isinstance(gateway, dict):
                raise ValueError("Gateway configuration must be an object.")
            reference = gateway.get("api_key_env") or "JEV_GATEWAY_API_KEY"
            # The current gateway reference itself is counted once.
            if _references(candidate, reference) > int(gateway.get("api_key_env") == reference):
                raise ValueError("Gateway credential reference is shared.")
            gateway["api_key_env"] = reference
            original = read_credential_bytes(self.models_file)
            content = credential_update(original, reference, value)
            env = credential_snapshot(self.models_file, credential_content=content, external=self.external)
            overlay, error = read_overlay(self.models_file)
            if error:
                raise ValueError("Routing overlay must be repaired before changing credentials.")
            catalog_from_document(candidate, str(self.models_file), env, allow_missing_credentials=True)
            catalog = catalog_from_document(merge_overlay(candidate, overlay), str(self.models_file), env, allow_missing_credentials=True)
            registry = prepare(catalog)
            if body["expected_revision"] != revision(self.models_file):
                raise RevisionConflict("Configuration changed while validating.")
            path = credential_path(self.models_file)
            changes = {
                self.models_file: (json.dumps(candidate, ensure_ascii=False, indent=2) + "\n").encode(),
                self.models_file.with_name("models.json.bak"): optional_bytes(self.models_file),
                path: content,
                path.with_name("credentials.json.backup"): original,
            }
            replace_configuration(self.models_file, changes, activate=lambda: activate(catalog, registry), restore_runtime=restore_runtime)
            return {"valid": True, "applied": True, **self.project(catalog, revision(self.models_file), overlay=overlay, write_available=True)}

    def discovery_provider(self, body: Any) -> tuple[dict[str, Any], str | None, set[str]]:
        if not isinstance(body, dict) or ("provider_id" in body) == ("provider" in body):
            raise ValueError("Supply exactly one of provider_id or provider.")
        if set(body) - {"provider_id", "provider", "credential", "transport_credentials"}:
            raise ValueError("Invalid provider selector fields.")
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
            transport_actions = _transport_actions(provider, body.get("transport_credentials", {}))
            credential = body.get("credential", {"action": "keep"})
            _credential_action(credential)
            reference = provider.get("api_key_env")
            if credential["action"] != "keep":
                if not isinstance(reference, str):
                    raise ValueError("Candidate credential requires an env reference.")
            # Resolve all edits together so CLEAR reveals only inherited sources.
            env_content = optional_bytes(self.models_file.parent / ".env")
            content = read_credential_bytes(self.models_file)
            actions = [(validate_reference(reference), *_credential_action(credential))] if credential["action"] != "keep" else []
            actions.extend((ref, action, value) for _parameter, ref, action, value in transport_actions if action != "keep")
            for ref, action, value in actions:
                content = credential_update(content, ref, value)
                if action == "clear":
                    env_content = env_update(env_content, ref, None)
            env = credential_snapshot(self.models_file, external=self.external, env_content=env_content or b"", credential_content=content or b'{"version":1,"values":{}}')
            profile = provider_from_dict(provider, 0, env, allow_missing_credentials=True)
            imported = {f"{m['provider']}/{m['upstream_model']}" for m in document.get("models", [])}
            return provider, profile.api_key, imported
