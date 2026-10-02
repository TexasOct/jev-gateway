"""One-time management-key setup using the configuration transaction owner."""

from __future__ import annotations

import copy
import json
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from jev_gateway.catalog import Catalog, catalog_from_document
from jev_gateway.config_transaction import configuration_read_lock, optional_bytes, replace_configuration
from jev_gateway.provider_config import RevisionConflict, _references, credential_snapshot, env_update, revision
from jev_gateway.routing_overlay import merge_overlay, read_models_document, read_overlay
from jev_gateway.strategy import StrategyRegistry

MANAGEMENT_KEY_ENV = "JEV_GATEWAY_MANAGEMENT_KEY"
SETUP_INCOMPLETE_MESSAGE = "Configure a provider and model, then assign routing tags or set a global default model before sending requests."


class SetupAlreadyConfigured(ValueError):
    """Management authentication has already been configured."""


def setup_projection(catalog: Catalog, token: str, *, local: bool = False) -> dict[str, Any]:
    required = not bool(catalog.gateway.api_key)
    ready = bool(catalog.profiles) and (catalog.defaults.default_model is not None or all(
        bool(route.models) or any((route.tag or f"{catalog.default_strategy}/{name}") in model.tags for model in catalog.profiles)
        for name, route in catalog.policy.labels.items()
    ))
    next_step = "gateway_key" if required else "provider" if not catalog.providers else "model" if not catalog.profiles else "routing" if not ready else "ready"
    return {"required": required, "local_setup_available": required and local, "revision": token, "has_providers": bool(catalog.providers), "has_models": bool(catalog.profiles), "routing_ready": ready, "next_step": next_step}


class ManagementSetup:
    def __init__(self, models_file: Path, *, external: Mapping[str, str] | None = None) -> None:
        self.models_file = models_file
        self.external = external

    def _catalog(self, document: dict[str, Any], credentials: Mapping[str, str]) -> Catalog:
        overlay, error = read_overlay(self.models_file)
        if error:
            raise ValueError("Routing overlay could not be read.")
        return catalog_from_document(merge_overlay(document, overlay), str(self.models_file), credentials)

    def read(self, *, local: bool = False) -> dict[str, Any]:
        with configuration_read_lock(self.models_file):
            catalog = self._catalog(read_models_document(self.models_file), credential_snapshot(self.models_file, external=self.external))
            return setup_projection(catalog, revision(self.models_file), local=local)

    def configure(self, body: Any, *, prepare: Callable[[Catalog], Any] | None = None, activate: Callable[[Catalog, Any], None] | None = None, restore_runtime: Callable[[], None] | None = None) -> dict[str, Any]:
        if not isinstance(body, dict) or set(body) != {"expected_revision", "api_key"} or not isinstance(body.get("expected_revision"), str) or not body["expected_revision"]:
            raise ValueError("expected_revision and api_key are required.")
        key = body["api_key"]
        if not isinstance(key, str) or not 16 <= len(key) <= 8192 or key != key.strip() or not key.isascii() or not key.isprintable():
            raise ValueError("Management key must contain 16 to 8192 printable ASCII characters without surrounding whitespace.")
        with configuration_read_lock(self.models_file):
            document = read_models_document(self.models_file)
            credentials = credential_snapshot(self.models_file, external=self.external)
            current = self._catalog(document, credentials)
            if current.gateway.api_key or (document.get("gateway") or {}).get("api_key_env"):
                raise SetupAlreadyConfigured("Management key is already configured.")
            if body["expected_revision"] != revision(self.models_file):
                raise RevisionConflict("Configuration changed. Refresh before applying.")
            if _references(document, MANAGEMENT_KEY_ENV) or MANAGEMENT_KEY_ENV in credentials:
                raise ValueError("Management credential variable is already in use.")
            candidate = copy.deepcopy(document)
            if candidate.get("gateway") is None:
                candidate["gateway"] = {}
            candidate.setdefault("gateway", {})["api_key_env"] = MANAGEMENT_KEY_ENV
            env_path = self.models_file.parent / ".env"
            original_env = optional_bytes(env_path)
            env_content = env_update(original_env, MANAGEMENT_KEY_ENV, key)
            candidate_credentials = credential_snapshot(self.models_file, env_content=env_content, external=self.external)
            catalog_from_document(candidate, str(self.models_file), candidate_credentials)
            catalog = self._catalog(candidate, candidate_credentials)
            prepared = prepare(catalog) if prepare is not None else StrategyRegistry.from_catalog(catalog)
            if body["expected_revision"] != revision(self.models_file):
                raise RevisionConflict("Configuration changed while validating.")
            changes = {self.models_file: (json.dumps(candidate, indent=2) + "\n").encode(), env_path: env_content, env_path.with_name(".env.backup"): original_env, self.models_file.with_name("models.json.bak"): optional_bytes(self.models_file)}
            replace_configuration(self.models_file, changes, activate=(lambda: activate(catalog, prepared)) if activate is not None else None, restore_runtime=restore_runtime)
            return setup_projection(catalog, revision(self.models_file))
