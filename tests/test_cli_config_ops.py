from __future__ import annotations

import json

import pytest

from jev_gateway.cli.config_ops import redact_document, write_document_atomic


def test_invalid_write_leaves_file_unchanged(tmp_path) -> None:
    path = tmp_path / "models.json"
    original = '{"unchanged": true}\n'
    path.write_text(original)
    with pytest.raises((ValueError, TypeError)):
        write_document_atomic(path, {"providers": [], "models": []})
    assert path.read_text() == original


def test_redaction_never_exposes_value(monkeypatch) -> None:
    monkeypatch.setenv("TOP_SECRET", "secret-value")
    result = redact_document({"providers": [{"api_key_env": "TOP_SECRET"}]})
    assert "secret-value" not in json.dumps(result)
    assert result["providers"][0]["api_key_env"] == {"name": "TOP_SECRET", "has_value": True}
