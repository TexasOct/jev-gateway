"""Immutable credential resolution and bounded, literal local credential storage."""

from __future__ import annotations

import io
import json
import os
import re
from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from types import MappingProxyType
from typing import Any

from dotenv.parser import parse_stream
from dotenv.variables import parse_variables

from jev_gateway.config_transaction import configuration_read_lock, optional_bytes

_LITERAL_MARKER = "# jev-managed-literal-v1"
_MAX_FILE_BYTES = 1024 * 1024
_MAX_REFERENCES = 1024


@dataclass(frozen=True, eq=False)
class CredentialSnapshot(Mapping[str, str]):
    """Raw credentials with literal-reference origins preserved for gateway parsing."""

    _values: Mapping[str, str] = field(repr=False)
    literal_references: frozenset[str] = frozenset()

    def __post_init__(self) -> None:
        object.__setattr__(self, "_values", MappingProxyType(dict(self._values)))
        object.__setattr__(self, "literal_references", frozenset(self.literal_references))

    def __getitem__(self, name: str) -> str:
        return self._values[name]

    def __iter__(self) -> Iterator[str]:
        return iter(self._values)

    def __len__(self) -> int:
        return len(self._values)

    def with_value(self, name: str, value: str) -> CredentialSnapshot:
        """Overlay a pending literal value while retaining existing source metadata."""
        return CredentialSnapshot({**self._values, name: value}, self.literal_references | {name})


def credential_path(models_file: Path) -> Path:
    return models_file.parent / "credentials.json"


def validate_reference(name: Any) -> str:
    if not isinstance(name, str) or not name.isascii() or not name.isidentifier() or len(name) > 256:
        raise ValueError("Credential reference must be an ASCII identifier within 256 characters.")
    return name


def validate_secret(value: Any) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.encode()) > 8192 or any(c in value for c in "\r\n\x00"):
        raise ValueError("Credential must be nonempty and fit on one line within 8 KiB.")
    return value


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name, value in pairs:
        if name in result:
            raise ValueError("Duplicate credential fields.")
        result[name] = value
    return result


def credential_values(content: bytes | None) -> dict[str, str]:
    if content is None:
        return {}
    try:
        if len(content) > _MAX_FILE_BYTES:
            raise ValueError("Credential file exceeds its limit.")
        document = json.loads(content, object_pairs_hook=_unique_object)
        if not isinstance(document, dict) or set(document) != {"version", "values"} or type(document["version"]) is not int or document["version"] != 1:
            raise ValueError("Invalid credential shape.")
        values = document["values"]
        if not isinstance(values, dict) or len(values) > _MAX_REFERENCES:
            raise ValueError("Invalid credential values.")
        return {validate_reference(name): validate_secret(value) for name, value in values.items()}
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise ValueError("Credential file is invalid.") from None


def read_credential_bytes(models_file: Path) -> bytes | None:
    try:
        with credential_path(models_file).open("rb") as stream:
            content = stream.read(_MAX_FILE_BYTES + 1)
        credential_values(content)
        return content
    except FileNotFoundError:
        return None
    except OSError:
        raise ValueError("Credential file could not be read.") from None


def credential_update(content: bytes | None, name: str, value: str | None) -> bytes:
    validate_reference(name)
    values = credential_values(content)
    if value is None:
        values.pop(name, None)
    else:
        values[name] = validate_secret(value)
    encoded = (json.dumps({"version": 1, "values": values}, ensure_ascii=False, indent=2) + "\n").encode()
    credential_values(encoded)
    return encoded


def credential_snapshot(models_file: Path, *, env_content: bytes | None = None, credential_content: bytes | None = None, external: Mapping[str, str] | None = None) -> CredentialSnapshot:
    with configuration_read_lock(models_file):
        inherited = dict(os.environ if external is None else external)
        content = optional_bytes(models_file.parent / ".env") if env_content is None else env_content
        resolved: dict[str, str | None] = {}
        if content is not None:
            try:
                for binding in parse_stream(io.StringIO(content.decode())):
                    if binding.key is None:
                        continue
                    value = binding.value
                    if value is not None and not binding.original.string.rstrip().endswith(_LITERAL_MARKER):
                        variables = MappingProxyType({**inherited, **resolved})
                        value = "".join(atom.resolve(variables) for atom in parse_variables(value))
                    resolved[binding.key] = value
            except UnicodeError:
                raise ValueError("Legacy credential file is invalid.") from None
        inherited.update({key: value for key, value in resolved.items() if value is not None})
        literal = credential_values(read_credential_bytes(models_file) if credential_content is None else credential_content)
        inherited.update(literal)
        return CredentialSnapshot(inherited, frozenset(literal))


def env_update(content: bytes | None, name: str, value: str | None) -> bytes:
    validate_reference(name)
    if value is not None:
        validate_secret(value)
    text = (content or b"").decode()
    output: list[str] = []
    # Preserve unselected dotenv records, including multiline values and CRLF.
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
