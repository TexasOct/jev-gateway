"""Create absent runtime configuration files without replacing operator data."""

from __future__ import annotations

from importlib.resources import files
from pathlib import Path

from jev_gateway.config_transaction import atomic_bytes, configuration_read_lock


def initialize_configuration(models_file: Path) -> dict[str, str]:
    templates = files("jev_gateway").joinpath("templates")
    results: dict[str, str] = {}
    with configuration_read_lock(models_file):
        for target, packaged in ((models_file, "models.example.json"), (models_file.parent / ".env", "env.example")):
            if target.exists() or target.is_symlink():
                results[target.name] = "preserved"
            else:
                atomic_bytes(target, templates.joinpath(packaged).read_bytes(), protected=target.name == ".env")
                results[target.name] = "created"
    return results
