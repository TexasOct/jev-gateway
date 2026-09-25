"""Policy-independent dashboard whiteboard persistence."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from jev_gateway.canvas_layout import (
    default_layout,
    read_layout,
    validate_layout,
    write_layout,
)


def test_layout_round_trip_and_corrupt_default(tmp_path: Path) -> None:
    models_file = tmp_path / "models.json"
    assert read_layout(models_file) == (default_layout(), None)
    document = {"version": 1, "nodes": {"questions": {"x": 10, "y": 20},
        "rule-0": {"x": 20, "y": 30}, "zone::task_aware/craft": {"x": 50, "y": 40},
        "model::p/模型 A": {"x": 60, "y": 70}}, "viewport": {"x": 40, "y": 50}}
    assert write_layout(models_file, document) == document
    assert read_layout(models_file) == (document, None)
    path = tmp_path / "routing-canvas-layout.json"
    assert json.loads(path.read_text()) == document
    path.write_text("{broken", encoding="utf-8")
    layout, error = read_layout(models_file)
    assert layout == default_layout() and error
    path.write_bytes(b" " * 65537)
    layout, error = read_layout(models_file)
    assert layout == default_layout() and error


@pytest.mark.parametrize("value", [
    {"version": 2, "nodes": {}, "viewport": {"x": 0, "y": 0}},
    {"version": 1, "nodes": {"bad id": {"x": 1, "y": 2}}, "viewport": {"x": 0, "y": 0}},
    {"version": 1, "nodes": {"model::p/line\nbreak": {"x": 1, "y": 2}}, "viewport": {"x": 0, "y": 0}},
    {"version": 1, "nodes": {"rule-0": {"x": True, "y": 0}}, "viewport": {"x": 0, "y": 0}},
    {"version": 1, "nodes": {"questions": {"x": 10001, "y": 0}}, "viewport": {"x": 0, "y": 0}},
    {"version": 1, "nodes": {}, "viewport": {"x": 0, "y": 0, "zoom": 2}},
    {"version": 1, "nodes": {}, "viewport": {"x": 0, "y": 0}, "secret": "oops"},
    {"version": 1, "nodes": {f"rule-{i}": {"x": 0, "y": 0} for i in range(257)}, "viewport": {"x": 0, "y": 0}},
])
def test_layout_rejects_invalid_shape(value: object) -> None:
    with pytest.raises(ValueError):
        validate_layout(value)


def test_layout_size_check_matches_written_encoding(tmp_path: Path) -> None:
    models_file = tmp_path / "models.json"
    document = {"version": 1, "nodes": {f"model::p/m{i}": {"x": 9999, "y": 9999} for i in range(256)},
                "viewport": {"x": 0, "y": 0}}
    write_layout(models_file, document)
    assert read_layout(models_file) == (document, None)
