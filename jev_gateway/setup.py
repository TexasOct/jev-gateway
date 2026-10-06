"""One-time management-key setup using the configuration transaction owner."""

from __future__ import annotations

import copy
from collections.abc import Callable, Mapping
from dataclasses import replace
from pathlib import Path
from typing import Any

from jev_gateway.catalog import Catalog, catalog_from_document
from jev_gateway.config_transaction import configuration_read_lock
from jev_gateway.credentials import validate_reference
from jev_gateway.provider_config import ProviderConfiguration, _references, credential_snapshot, revision
from jev_gateway.routing_overlay import merge_overlay, read_models_document, read_overlay
from jev_gateway.strategy import StrategyRegistry

MANAGEMENT_KEY_ENV = "JEV_GATEWAY_API_KEY"
SETUP_INCOMPLETE_MESSAGE = "Configure a provider and model, then assign routing tags or set a global default model before sending requests."


class SetupAlreadyConfigured(ValueError):
    """Management authentication has already been configured."""


def setup_projection(catalog: Catalog, token: str, *, local: bool = False) -> dict[str, Any]:
    required = not bool(catalog.gateway.api_key)
    enabled = [model for model in catalog.profiles if model.enabled]
    default = catalog.by_name(catalog.defaults.default_model) if catalog.defaults.default_model is not None else None
    ready = bool(enabled) and (default is not None and default.enabled or all(
        any(model.name in route.models for model in enabled) if route.models else any((route.tag or f"{catalog.default_strategy}/{name}") in model.tags for model in enabled)
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
        candidate = merge_overlay(document, overlay)
        reference = (candidate.get("gateway") or {}).get("api_key_env")
        if reference is not None:
            reference = validate_reference(reference)
        # Setup can inspect a pending reference. Runtime catalog loads keep
        # strict gateway resolution so a lost key cannot disable serving auth.
        if reference and not credentials.get(reference, "").strip():
            candidate = copy.deepcopy(candidate)
            candidate["gateway"].pop("api_key_env")
            catalog = catalog_from_document(candidate, str(self.models_file), credentials, allow_missing_credentials=True)
            return replace(catalog, gateway=replace(catalog.gateway, api_key_env=reference))
        return catalog_from_document(candidate, str(self.models_file), credentials, allow_missing_credentials=True)

    def read(self, *, local: bool = False) -> dict[str, Any]:
        with configuration_read_lock(self.models_file):
            catalog = self._catalog(read_models_document(self.models_file), credential_snapshot(self.models_file, external=self.external))
            return setup_projection(catalog, revision(self.models_file), local=local)

    def configure(self, body: Any, *, prepare: Callable[[Catalog], Any] | None = None, activate: Callable[[Catalog, Any], None] | None = None, restore_runtime: Callable[[], None] | None = None) -> dict[str, Any]:
        if not isinstance(body, dict) or set(body) != {"expected_revision", "api_key"} or not isinstance(body.get("expected_revision"), str) or not body["expected_revision"]:
            raise ValueError("expected_revision and api_key are required.")
        key = body["api_key"]
        if not isinstance(key, str) or not 16 <= len(key) <= 8192 or not key.isascii() or any(not 33 <= ord(char) <= 126 for char in key):
            raise ValueError("Management key must contain 16 to 8192 visible ASCII characters without whitespace.")
        with configuration_read_lock(self.models_file):
            document = read_models_document(self.models_file)
            credentials = credential_snapshot(self.models_file, external=self.external)
            current = self._catalog(document, credentials)
            if current.gateway.api_key:
                raise SetupAlreadyConfigured("Management key is already configured.")
            reference = (document.get("gateway") or {}).get("api_key_env")
            if not reference and (_references(document, MANAGEMENT_KEY_ENV) or MANAGEMENT_KEY_ENV in credentials):
                raise ValueError("Management credential variable is already in use.")
            ProviderConfiguration(self.models_file, external=self.external).gateway_credential(
                {"expected_revision": body["expected_revision"], "credential": {"action": "set", "value": key}},
                prepare=prepare if prepare is not None else StrategyRegistry.from_catalog,
                activate=activate if activate is not None else lambda _catalog, _registry: None,
                restore_runtime=restore_runtime if restore_runtime is not None else lambda: None,
            )
            return self.read()
