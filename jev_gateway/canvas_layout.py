"""Validated, policy-independent dashboard canvas coordinates."""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

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


def read_layout(models_file: Path) -> tuple[dict[str, Any], str | None]:
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


def write_layout(models_file: Path, value: Any) -> dict[str, Any]:
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
