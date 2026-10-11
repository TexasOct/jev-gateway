"""Validated, policy-independent dashboard canvas coordinates."""

from __future__ import annotations

import json
import os
import re
import tempfile
import copy
from pathlib import Path
from typing import Any

from jev_gateway.config_transaction import configuration_read_lock
from jev_gateway.routing_overlay import validate_strategy_name

FILENAME = "routing-canvas-layout.json"
MAX_BYTES = 65536
MAX_NODES = 256
MAX_COORD = 10000
_NODE_ID = re.compile(r"^(?:questions|fallback|rule-(?:0|[1-9][0-9]{0,3})|(?:zone|model)::[^\x00-\x1f\x7f]{1,240})$")


def layout_path(models_file: Path) -> Path:
    return models_file.parent / FILENAME


def default_layout() -> dict[str, Any]:
    return {"version": 1, "nodes": {}, "viewport": {"x": 0, "y": 0}}


def validate_layout(value: Any) -> dict[str, Any]:
    if isinstance(value, dict) and value.get("version") == 2:
        if set(value) != {"version", "strategies"} or type(value["version"]) is not int or not isinstance(value["strategies"], dict) or len(value["strategies"]) > 64:
            raise ValueError("Invalid version 2 canvas layout.")
        for name, layout in value["strategies"].items():
            validate_strategy_name(name)
            if not isinstance(layout, dict) or set(layout) != {"nodes", "viewport"}:
                raise ValueError("Strategy layout requires nodes and viewport only.")
            validate_layout({"version": 1, **layout})
        if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > MAX_BYTES:
            raise ValueError("Canvas layout exceeds size limit.")
        return value
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value) or set(value) != {"version", "nodes", "viewport"}:
        raise ValueError("Canvas layout requires version, nodes, and viewport only.")
    if type(value["version"]) is not int or value["version"] != 1:
        raise ValueError("Unsupported canvas layout version.")
    nodes = value["nodes"]
    if not isinstance(nodes, dict) or len(nodes) > MAX_NODES:
        raise ValueError("Invalid canvas node count.")
    for node_id, position in nodes.items():
        if not isinstance(node_id, str) or not _NODE_ID.fullmatch(node_id):
            raise ValueError("Invalid canvas node ID.")
        _position(position)
    _position(value["viewport"])
    if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > MAX_BYTES:
        raise ValueError("Canvas layout exceeds size limit.")
    return value


def _position(value: Any) -> None:
    if not isinstance(value, dict) or set(value) != {"x", "y"} or any(
        type(value[axis]) is not int or abs(value[axis]) > MAX_COORD for axis in ("x", "y")
    ):
        raise ValueError("Canvas coordinates must be bounded integers.")


def read_layout_document(models_file: Path) -> tuple[dict[str, Any], str | None]:
    try:
        with layout_path(models_file).open("rb") as stream:
            data = stream.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("Canvas layout exceeds size limit.")
        return validate_layout(json.loads(data)), None
    except FileNotFoundError:
        return default_layout(), None
    except (OSError, UnicodeError, ValueError, TypeError):
        return default_layout(), "Could not load canvas layout."


def read_layout(models_file: Path, strategy: str | None = None) -> tuple[dict[str, Any], str | None]:
    name = validate_strategy_name(strategy or "task_aware")
    with configuration_read_lock(models_file):
        document, error = read_layout_document(models_file)
        if document["version"] == 2:
            return {"version": 1, **copy.deepcopy(document["strategies"].get(name, {"nodes": {}, "viewport": {"x": 0, "y": 0}}))}, error
        return (document if name == "task_aware" else default_layout()), error


def without_strategy_layout(models_file: Path, name: str) -> dict[str, Any]:
    document, error = read_layout_document(models_file)
    if error:
        raise ValueError("Canvas layout must be repaired before changing strategies.")
    if document["version"] == 1:
        document = {"version": 2, "strategies": {"task_aware": {"nodes": document["nodes"], "viewport": document["viewport"]}}}
    document["strategies"].pop(name, None)
    return validate_layout(document)


def reconcile_layout_models(models_file: Path, removed: set[str]) -> dict[str, Any]:
    document, error = read_layout_document(models_file)
    if error:
        raise ValueError("Canvas layout must be repaired before removing models.")
    layouts = document["strategies"].values() if document["version"] == 2 else [document]
    for layout in layouts:
        layout["nodes"] = {node: position for node, position in layout["nodes"].items() if node not in {f"model::{model}" for model in removed}}
    return validate_layout(document)


def write_layout_document(models_file: Path, value: Any) -> dict[str, Any]:
    document = validate_layout(value)
    path = layout_path(models_file)
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=f".{path.name}.", delete=False,
        ) as stream:
            temporary = stream.name
            # Use the same encoding as the size check; pretty printing can
            # otherwise produce a file that the next read rejects.
            stream.write(json.dumps(document, ensure_ascii=False, separators=(",", ":")))
        os.replace(temporary, path)
    finally:
        if temporary is not None and os.path.exists(temporary):
            os.unlink(temporary)
    return document


def write_layout(models_file: Path, value: Any, strategy: str | None = None) -> dict[str, Any]:
    name = validate_strategy_name(strategy or "task_aware")
    layout = validate_layout(value)
    if layout["version"] != 1:
        raise ValueError("Layout writes require a single version 1 layout.")
    with configuration_read_lock(models_file):
        previous, error = read_layout_document(models_file)
        if error:
            raise ValueError("Canvas layout must be repaired before writing.")
        if strategy is None and previous["version"] == 1:
            return write_layout_document(models_file, layout)
        if previous["version"] == 1:
            previous = {"version": 2, "strategies": {"task_aware": {"nodes": previous["nodes"], "viewport": previous["viewport"]}}}
        previous["strategies"][name] = {"nodes": layout["nodes"], "viewport": layout["viewport"]}
        write_layout_document(models_file, previous)
        return layout
