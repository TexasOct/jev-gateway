"""Bounded source-controlled helper receipts. Importing this module performs no IO.

Native custody and runtime-source admission are separate from JSON authentication.
Only the driver may admit a complete owner after its original native cleanup.
"""
from __future__ import annotations

import hashlib
import hmac
import ast
import contextvars
import json
import math
import os
from pathlib import Path, PosixPath, PurePosixPath, PurePath
import re
import stat
import struct
import subprocess
import sys
import threading
from dataclasses import dataclass
from types import MappingProxyType, MemberDescriptorType, FunctionType
from typing import Any, NoReturn

SCHEMA = "jev-native-owner/1"
MAX32 = (1 << 32) - 1
KINDS = ("descriptor", "started", "terminal", "owner-summary")
FAILURES = (
    "CONTEXT_INVALID", "SOURCE_BINDING", "OWNER_BIRTH", "CALL_ENCODING",
    "SCOPE_BINDING", "CHILD_BIRTH", "CUSTODY_MISMATCH", "EXIT_UNKNOWN",
    "EXIT_INVALID", "START_PUBLISH", "TERMINAL_PUBLISH", "SUMMARY_PUBLISH",
    "ENTRY_BUDGET", "BYTE_BUDGET", "ATTEMPT_OVERFLOW", "COUNTER_SATURATED",
    "ACCOUNTING_UNCERTAIN", "LIVE_AT_FINALIZE", "INTEGRITY_BUILD", "RUNTIME_API",
    "NATIVE_NO_HANDLE", "SOURCE_CHANGED", "COMPONENT_GUARD", "JSON_FORMAT",
    "READER_PARTIAL", "CHAIN_MISMATCH", "AMBIGUOUS", "MISSING_SUMMARY",
    "MISSING_CHAIN", "QUOTA_BINDING", "UNKNOWN_OWNER",
)
LIMITS = MappingProxyType(dict(max_entries=512, max_file_bytes=10485760, max_total_bytes=33554432,
              record_bytes=4096, descriptor_bytes=65536, source_read_bytes=524288,
              json_depth=16, json_nodes=4096, encoder_bytes=65536, encoder_nodes=512,
              encoder_depth=8, encoder_work=1024, encoder_chunk=1024))
OWNER_QUOTAS = MappingProxyType({
    "smoke": (34, 4, 1048576), "backend-collect": (4, 8, 1572864),
    "backend-business": (48, 12, 2097152), "backend-replay": (4, 8, 1572864),
    "listing": (2, 4, 524288), "live": (2, 5, 524288), "default": (2, 4, 524288),
})
SITE_SUBSETS = MappingProxyType({"smoke": ("s01", "s02", "s03"), "listing": ("s04",),
                "default": ("s04",), "live": ("s08",)})
BACKEND_SITES = tuple(f"s{i:02d}" for i in range(5, 15))
SITE_SOURCE = MappingProxyType({
    "s01": ("run", "scripts/smoke-installed-release.py", "main.command"),
    "s02": ("Popen", "scripts/smoke-installed-release.py", "main"),
    "s03": ("run", "scripts/smoke-installed-release.py", "main"),
    "s04": ("Popen", "scripts/public-installed/serve.py", "main"),
    "s05": ("Popen", "tests/test_cli_process.py", "test_owned_rejects_real_python_wrapper_with_module_suffix"),
    "s06": ("Popen", "tests/test_cli_process.py", "test_owned_accepts_real_module_child_with_spaces"),
    "s07": ("run", "tests/test_cli_templates.py", "test_gateway_import_and_pytest_collection_without_cwd_catalog"),
    "s08": ("Popen", "tests/test_credential_live_server.py", "live_gateway"),
    "s09": ("run", "tests/test_global_defaults.py", "test_cli_omitted_packaged_arrays_add_and_safe_snapshot_without_gateway"),
    "s10": ("run", "tests/test_model_metadata_business_oracles.py", "test_actual_installed_backup_is_static_without_new_import_or_network"),
    "s11": ("run", "tests/test_model_metadata_business_oracles.py", "test_actual_native_and_public_asgi_evidence_persists_and_survives_fresh_process"),
    "s12": ("run", "tests/test_model_metadata_review_repairs.py", "test_canonical_association_is_exact_in_active_sqlite_reload_and_fresh_catalog"),
    "s13": ("run", "tests/test_model_revision_and_recovery_chat.py", "test_restarted_process_owner_rejects_previous_revision_token"),
    "s14": ("run", "tests/test_setup.py", "test_cli_setup_does_not_import_gateway"),
})
CALL_MODES = MappingProxyType({
    "s01": ("explicit", "none"), "s02": ("explicit", "none"), "s03": ("explicit", "none"),
    "s04": ("explicit", "none"), "s05": ("inherit", "none"), "s06": ("inherit", "none"),
    "s07": ("explicit", "none"), "s08": ("explicit", "stream"), "s09": ("explicit", "none"),
    "s10": ("inherit", "none"), "s11": ("explicit", "none"), "s12": ("explicit", "none"),
    "s13": ("inherit", "none"), "s14": ("explicit", "input"),
})
IDENTITY_KEYS = ("pid", "birth_hex")
CALL_KEYS = ("argv_mac", "cwd_mac", "kwargs_mac", "env_mode", "env_mac",
             "stdin_mode", "stdin_mac", "snapshot_mac")
BINDING_KEYS = ("descriptor_sha", "sequence", "owner_identity", "site_id",
                "test_scope", "command_ordinal", "call", "child_identity")
KEYS = MappingProxyType({
    "descriptor": ("schema", "kind", "run", "owner_id", "owner_mode", "launch_index",
                   "launch_spec_mac", "inputs", "api", "sites", "allocation", "limits",
                   "key_id", "payload_sha", "mac"),
    "started": ("schema", "kind", *BINDING_KEYS, "stage", "failure_bits", "payload_sha", "mac"),
    "terminal": ("schema", "kind", *BINDING_KEYS, "started_sha", "admitted", "complete",
                 "native_exit", "closure_method", "native_outcome", "error", "failure_bits",
                 "payload_sha", "mac"),
    "owner-summary": ("schema", "kind", "descriptor_sha", "owner_identity",
                      "observed_attempts", "allocated_attempts", "admitted_attempts",
                      "rejected_attempts", "overflow_attempts", "counter_saturated",
                      "accounting_uncertain", "started_published", "terminal_published",
                      "complete_terminals", "incomplete_terminals", "incomplete_admitted",
                      "publication_failures", "failure_bits", "finalized", "protocol_complete",
                      "payload_sha", "mac"),
})


class ReceiptRejected(ValueError):
    """Only a fixed failure code escapes the receipt boundary."""


def reject(code: str = "JSON_FORMAT") -> NoReturn:
    raise ReceiptRejected(code)


def require(condition: bool, code: str = "JSON_FORMAT") -> None:
    if not condition:
        reject(code)


def closed(value: Any, keys: tuple[str, ...]) -> dict[str, Any]:
    require(type(value) is dict and set(value) == set(keys))
    return value


def integer(value: Any, low: int = 0, high: int = MAX32) -> None:
    require(type(value) is int and low <= value <= high)


def boolean(value: Any) -> None:
    require(type(value) is bool)


def text(value: Any, maximum: int) -> None:
    require(type(value) is str and len(value) <= maximum)
    require(all(32 <= ord(c) < 127 for c in value))


def digest(value: Any, length: int = 64) -> None:
    require(type(value) is str and re.fullmatch(f"[0-9a-f]{{{length}}}", value) is not None)


def identity(value: Any, complete: bool = False) -> None:
    if value is None:
        require(not complete)
        return
    closed(value, IDENTITY_KEYS)
    integer(value["pid"], 1, 2147483647)
    birth = value["birth_hex"]
    if birth is None:
        require(not complete)
        return
    text(birth, 32)
    try:
        number = float.fromhex(birth)
    except ValueError:
        reject()
    require(math.isfinite(number) and number > 0 and number.hex() == birth)


def scope(value: Any) -> None:
    if value is not None:
        closed(value, ("node_mac", "phase"))
        digest(value["node_mac"])
        require(value["phase"] in ("setup", "call", "teardown"))


def wire_tree(value: Any, depth: int = 0, *, remaining: list[int] | None = None) -> None:
    """Apply primitive constraints to every field, including nested strings."""
    if remaining is None:
        remaining = [LIMITS["json_nodes"]]
    require(remaining[0] > 0)
    remaining[0] -= 1
    require(depth <= LIMITS["json_depth"])
    kind = type(value)
    if kind is str:
        require(all(ord(c) >= 32 and ord(c) != 127 for c in value))
    elif kind is dict:
        require(len(value) <= remaining[0] // 2)
        for key, item in value.items():
            require(type(key) is str)
            wire_tree(key, depth + 1, remaining=remaining)
            wire_tree(item, depth + 1, remaining=remaining)
    elif kind is list:
        require(len(value) <= remaining[0])
        for item in value:
            wire_tree(item, depth + 1, remaining=remaining)
    else:
        require(value is None or kind in (bool, int))


def call(value: Any) -> None:
    if value is None:
        return
    closed(value, CALL_KEYS)
    for key in ("argv_mac", "cwd_mac", "kwargs_mac", "snapshot_mac"):
        digest(value[key])
    require(value["env_mode"] in ("inherit", "explicit"))
    require((value["env_mac"] is None) == (value["env_mode"] == "inherit"))
    require(value["stdin_mode"] in ("none", "input", "stream"))
    require((value["stdin_mac"] is None) == (value["stdin_mode"] == "none"))
    for key in ("env_mac", "stdin_mac"):
        if value[key] is not None:
            digest(value[key])


def allocation(mode: str) -> dict[str, int]:
    require(mode in OWNER_QUOTAS, "QUOTA_BINDING")
    cap, sources, source_bytes = OWNER_QUOTAS[mode]
    return dict(attempt_cap=cap, attempt_entries=4 * cap, source_entries=sources,
                source_bytes=source_bytes, record_write_bytes=8192 * cap,
                record_read_bytes=8192 * cap, encoder_bytes=65536 * cap,
                summary_entries=2, descriptor_entries=2, key_entries=1,
                receipt_directory_entries=1)


def parent_encoder_reserve(mode: str) -> int:
    # Launch-spec encoding and backend phase joins share this owner's existing
    # encoder allowance. No extra global encoder budget or inter-owner borrowing.
    return 65536 + (32768 if mode.startswith("backend-") else 0)


def descriptor(value: dict[str, Any]) -> None:
    run = closed(value["run"], ("run_id", "attempt", "os", "invocation_id"))
    text(run["run_id"], 20)
    require(re.fullmatch(r"[1-9][0-9]{0,19}", run["run_id"]) is not None)
    integer(run["attempt"], 1, 65535)
    require(run["os"] in ("ubuntu-latest", "macos-latest"))
    digest(run["invocation_id"], 32)
    digest(value["owner_id"], 32)
    mode = value["owner_mode"]
    require(type(mode) is str and mode in OWNER_QUOTAS)
    integer(value["launch_index"], 1)
    for key in ("launch_spec_mac", "key_id"):
        digest(value[key])
    inputs = closed(value["inputs"], ("prep_commit", "prep_tree", "prep_manifest",
                    "product_commit", "tag", "tag_object", "wheel_sha", "producer_run",
                    "source_manifest", "helper_sha"))
    for key in ("prep_commit", "product_commit", "tag_object"):
        digest(inputs[key], 40)
    if inputs["prep_tree"] is not None:
        digest(inputs["prep_tree"], 40)
    for key in ("prep_manifest", "wheel_sha", "source_manifest", "helper_sha"):
        digest(inputs[key])
    require(inputs["product_commit"] == "4d56e438e2f817115e65f9c47519f9adc62d41c1")
    require(inputs["tag"] == "v0.1.3" and inputs["tag_object"] == "cf8b1587ba1ea2733db19b979779a2921dee51f8")
    require(inputs["wheel_sha"] == "135f91895bd726622b752aed75734d8eba985b12f0345ea63f0013b86a07dff0")
    require(inputs["producer_run"] == "37967881650")
    api = closed(value["api"], ("implementation", "version", "subprocess_sha", "run_sha",
                  "enter_sha", "exit_sha", "communicate_sha", "poll_sha", "wait_sha",
                  "pathlib_sha", "pathlib_projection_sha"))
    require(api["implementation"] == "cpython")
    text(api["version"], 11)
    require(re.fullmatch(r"3\.12\.[0-9]{1,5}", api["version"]) is not None)
    for key in api:
        if key not in ("implementation", "version"):
            digest(api[key])
    sites = value["sites"]
    require(type(sites) is list and 1 <= len(sites) <= 14)
    ids = []
    for site in sites:
        closed(site, ("site_id", "operation", "file", "function", "original_sha",
                      "adapted_sha", "call_sha", "reversal_sha"))
        require(site["site_id"] in tuple(f"s{i:02d}" for i in range(1, 15)))
        require(site["operation"] in ("Popen", "run"))
        text(site["file"], 160)
        text(site["function"], 160)
        for key in ("original_sha", "adapted_sha", "call_sha", "reversal_sha"):
            digest(site[key])
        require((site["operation"], site["file"], site["function"]) ==
                SITE_SOURCE[site["site_id"]], "SOURCE_BINDING")
        require(site["reversal_sha"] == site["original_sha"], "SOURCE_BINDING")
        ids.append(site["site_id"])
    require(tuple(ids) == SITE_SUBSETS.get(mode, BACKEND_SITES), "SOURCE_BINDING")
    require(closed(value["allocation"], tuple(allocation(mode))) == allocation(mode), "QUOTA_BINDING")
    require(closed(value["limits"], tuple(LIMITS)) == LIMITS, "QUOTA_BINDING")
    # Equality alone admits True == 1: validate every literal's primitive type too.
    for group in (value["allocation"], value["limits"]):
        for number in group.values():
            integer(number)


def validate(value: Any, desc: dict[str, Any] | None = None) -> dict[str, Any]:
    require(type(value) is dict)
    wire_tree(value)
    kind = value.get("kind")
    require(type(kind) is str and kind in KEYS)
    closed(value, KEYS[kind])
    require(value["schema"] == SCHEMA)
    digest(value["payload_sha"])
    digest(value["mac"])
    if kind == "descriptor":
        descriptor(value)
        return value
    digest(value["descriptor_sha"])
    identity(value["owner_identity"])
    integer(value["failure_bits"], 0, (1 << 24) - 1)
    cap = desc["allocation"]["attempt_cap"] if desc else 48
    if desc is not None:
        descriptor(desc)
        require(value["descriptor_sha"] == hashlib.sha256(canonical(desc)).hexdigest(),
                "CHAIN_MISMATCH")
    if kind == "owner-summary":
        for key in ("observed_attempts", "overflow_attempts"):
            integer(value[key])
        for key in ("allocated_attempts", "admitted_attempts", "rejected_attempts",
                    "started_published", "terminal_published", "complete_terminals",
                    "incomplete_terminals", "incomplete_admitted"):
            integer(value[key], 0, cap)
        integer(value["publication_failures"], 0, 2 * cap + 1)
        for key in ("counter_saturated", "accounting_uncertain", "finalized", "protocol_complete"):
            boolean(value[key])
        a, admitted, rejected = (value[k] for k in ("allocated_attempts", "admitted_attempts", "rejected_attempts"))
        starts, ends, good, bad = (value[k] for k in ("started_published", "terminal_published", "complete_terminals", "incomplete_terminals"))
        require(good <= admitted <= a and ends <= starts <= a)
        require(rejected == a - admitted and good + bad == ends)
        require(value["incomplete_admitted"] == admitted - good)
        require(value["accounting_uncertain"] == bool(value["failure_bits"] & (1 << 16)))
        require(value["counter_saturated"] == bool(value["failure_bits"] & (1 << 15)))
        if not value["counter_saturated"] and not value["accounting_uncertain"]:
            require(a == min(value["observed_attempts"], cap))
            require(value["observed_attempts"] == a + value["overflow_attempts"])
        if value["overflow_attempts"]:
            require(bool(value["failure_bits"] & (1 << 14)))
        if value["protocol_complete"]:
            identity(value["owner_identity"], True)
            require(value["finalized"] and value["failure_bits"] == 0)
            require(not value["counter_saturated"] and not value["accounting_uncertain"])
            require(starts == ends == good == admitted == a)
            require(rejected == bad == value["overflow_attempts"] == value["publication_failures"] == 0)
        return value
    integer(value["sequence"], 1, cap)
    site = value["site_id"]
    require(site is None or site in tuple(f"s{i:02d}" for i in range(1, 15)))
    scope(value["test_scope"])
    call(value["call"])
    identity(value["child_identity"])
    ordinal = value["command_ordinal"]
    if ordinal is not None:
        integer(ordinal, 1)
    if site == "s01":
        require(ordinal is not None or value["failure_bits"] != 0)
    else:
        require(ordinal is None)
    if kind == "started":
        require(value["stage"] in ("spawned", "argument-rejected", "launch-failed"))
        if value["stage"] != "spawned":
            require(value["child_identity"] is None and bool(value["failure_bits"] & (1 << 20)))
        if value["stage"] == "argument-rejected":
            require(value["call"] is None)
        if value["failure_bits"] == 0:
            require(value["stage"] == "spawned")
            identity(value["owner_identity"], True)
            identity(value["child_identity"], True)
            require(site is not None and value["call"] is not None)
            require((value["call"]["env_mode"], value["call"]["stdin_mode"]) == CALL_MODES[site], "SOURCE_BINDING")
            if desc is not None:
                require(site in [s["site_id"] for s in desc["sites"]], "SOURCE_BINDING")
                require((value["test_scope"] is not None) ==
                        desc["owner_mode"].startswith("backend-"), "SCOPE_BINDING")
        return value
    digest(value["started_sha"])
    boolean(value["admitted"])
    boolean(value["complete"])
    require(value["native_outcome"] in ("returned", "raised"))
    error = value["error"]
    require((error is None) == (value["native_outcome"] == "returned"))
    if error is not None:
        closed(error, ("kind", "errno"))
        require(error["kind"] in ("ValueError", "TypeError", "FileNotFoundError", "PermissionError",
                    "OSError", "TimeoutExpired", "CalledProcessError", "KeyboardInterrupt",
                    "SystemExit", "OtherException", "OtherBaseException"))
        if error["errno"] is not None:
            integer(error["errno"], -2147483648, 2147483647)
    if value["admitted"]:
        identity(value["owner_identity"], True)
        identity(value["child_identity"], True)
        require(value["call"] is not None and site is not None)
        require((value["call"]["env_mode"], value["call"]["stdin_mode"]) == CALL_MODES[site], "SOURCE_BINDING")
        if desc:
            require(site in [s["site_id"] for s in desc["sites"]], "SOURCE_BINDING")
            require((value["test_scope"] is not None) == desc["owner_mode"].startswith("backend-"), "SCOPE_BINDING")
    if value["complete"]:
        require(value["admitted"] and value["failure_bits"] == 0)
        integer(value["native_exit"], -2147483648, 2147483647)
        require(value["closure_method"] == "actual-Popen.poll")
    else:
        require(value["native_exit"] is None and value["closure_method"] is None)
    return value


def canonical(value: dict[str, Any]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True,
                      allow_nan=False).encode("ascii")


def _signed(value: dict[str, Any], key: bytes, desc: dict[str, Any] | None = None) -> bytes:
    require(type(key) is bytes and len(key) == 32, "INTEGRITY_BUILD")
    require(type(value) is dict and value.get("kind") in KINDS)
    payload = {k: v for k, v in value.items() if k not in ("payload_sha", "mac")}
    # Reject bounds and types before allocating a serialized payload.
    validate(dict(payload, payload_sha="0" * 64, mac="0" * 64), desc)
    data = canonical(payload)
    result = dict(payload, payload_sha=hashlib.sha256(data).hexdigest(),
                  mac=hmac.new(key, SCHEMA.encode() + b"\0" + payload["kind"].encode() + b"\0" + data,
                               hashlib.sha256).hexdigest())
    validate(result, desc)
    encoded = canonical(result)
    require(len(encoded) <= (65536 if result["kind"] == "descriptor" else 4096), "BYTE_BUDGET")
    return encoded


def parsed(data: bytes, key: bytes, desc: dict[str, Any] | None = None) -> dict[str, Any]:
    require(type(data) is bytes and len(data) <= 65536, "BYTE_BUDGET")
    # A lexical preflight bounds nesting before invoking the JSON tree builder.
    depth = nodes = 0
    in_string = escaped = False
    for byte in data:
        if in_string:
            if escaped:
                escaped = False
            elif byte == 92:
                escaped = True
            elif byte == 34:
                in_string = False
        elif byte == 34:
            in_string = True
            nodes += 1
        elif byte in (91, 123):
            depth += 1
            nodes += 1
            require(depth <= 16)
        elif byte in (93, 125):
            depth -= 1
            require(depth >= 0)
        elif byte == 44:
            nodes += 1
        require(nodes <= 4096)

    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result = {}
        for k, v in items:
            require(k not in result)
            result[k] = v
        return result

    def no_float(_: str) -> NoReturn:
        reject()

    def bounded_integer(token: str) -> int:
        require(len(token) <= 11)
        return int(token)

    try:
        value = json.loads(data.decode("utf-8"), object_pairs_hook=pairs,
                           parse_float=no_float, parse_constant=no_float,
                           parse_int=bounded_integer)
    except (ValueError, UnicodeError, RecursionError):
        reject()
    validate(value, desc)
    require(len(data) <= (65536 if value["kind"] == "descriptor" else 4096), "BYTE_BUDGET")
    require(canonical(value) == data)
    expected = _signed(value, key, desc)
    require(hmac.compare_digest(expected, data), "INTEGRITY_BUILD")
    if value["kind"] == "descriptor":
        require(value["key_id"] == hashlib.sha256(key).hexdigest(), "INTEGRITY_BUILD")
    return value


@dataclass
class Ledger:
    """Monotonic fixed allocation; failure never refunds a charge."""
    entries: int
    bytes: int

    def charge(self, *, entries: int = 0, bytes: int = 0) -> None:
        integer(entries)
        integer(bytes)
        require(entries <= self.entries, "ENTRY_BUDGET")
        self.entries -= entries
        require(bytes <= self.bytes, "BYTE_BUDGET")
        self.bytes -= bytes


def saturating(counter: int) -> tuple[int, bool]:
    integer(counter)
    return (counter + 1, False) if counter < MAX32 else (MAX32, True)


class PassiveEncoder:
    """Bounded typed stream hashing without custom methods or retained inputs."""

    def __init__(self, key: bytes, *, paths_approved: bool = False) -> None:
        require(type(key) is bytes and len(key) == 32, "CALL_ENCODING")
        self.key = key
        self.paths_approved = paths_approved
        self.remaining = 65536
        self.nodes = 512
        self.work = 1024

    def step(self, size: int = 0, *, node: bool = False) -> None:
        require(self.work > 0 and size <= self.remaining, "CALL_ENCODING")
        require(not node or self.nodes > 0, "CALL_ENCODING")
        self.work -= 1
        self.remaining -= size
        if node:
            self.nodes -= 1

    def hash(self, domain: str, value: Any, *, streams: bool = False) -> str:
        mac = hmac.new(self.key, b"jev-call/1\0" + domain.encode("ascii") + b"\0", hashlib.sha256)

        def emit(data: bytes) -> None:
            self.step(len(data))
            mac.update(data)

        def visit(v: Any, depth: int, stream: bool = False) -> None:
            require(depth <= 8, "CALL_ENCODING")
            self.step(node=True)
            t = type(v)
            if v is None:
                emit(b"N")
            elif t is bool:
                emit(b"T" if v else b"F")
            elif t is int:
                require(v.bit_length() <= 64, "CALL_ENCODING")
                emit(b"I" + (b"-" if v < 0 else b"+") + abs(v).to_bytes(8, "big"))
            elif t is float:
                emit(b"D" + struct.pack("!d", v))
            elif t is str:
                require(len(v) <= self.remaining, "CALL_ENCODING")
                emit(b"S" + len(v).to_bytes(8, "big"))
                for offset in range(0, len(v), 256):
                    emit(v[offset:offset + 256].encode("utf-8", "surrogatepass"))
            elif t is bytes:
                require(len(v) <= self.remaining, "CALL_ENCODING")
                emit(b"B" + len(v).to_bytes(8, "big"))
                for offset in range(0, len(v), 1024):
                    self.step(min(1024, len(v) - offset))
                    mac.update(memoryview(v)[offset:offset + 1024])
            elif t is list or t is tuple:
                length = len(v)
                require(length <= self.nodes, "CALL_ENCODING")
                emit((b"L" if t is list else b"U") + length.to_bytes(8, "big"))
                visited = 0
                for child in v:
                    require(visited < length, "CALL_ENCODING")
                    visit(child, depth + 1)
                    visited += 1
                require(visited == length and len(v) == length, "CALL_ENCODING")
            elif t is dict:
                require(2 * len(v) <= self.nodes, "CALL_ENCODING")
                emit(b"M" + len(v).to_bytes(8, "big"))
                for k, child in v.items():
                    require(type(k) is str, "CALL_ENCODING")
                    visit(k, depth + 1)
                    visit(child, depth + 1, streams and k in ("stdin", "stdout", "stderr"))
            elif t is PosixPath or t is PurePosixPath:
                require(self.paths_approved, "CALL_ENCODING")
                member = vars(PurePath).get("_raw_paths")
                require(type(member) is MemberDescriptorType, "CALL_ENCODING")
                require(all(vars(cls).get("_raw_paths", member) is member for cls in t.__mro__
                            if cls is not object), "CALL_ENCODING")
                raw = object.__getattribute__(v, "_raw_paths")
                require(type(raw) is list and len(raw) <= self.nodes, "CALL_ENCODING")
                require(all(type(p) is str for p in raw), "CALL_ENCODING")
                emit(b"P" if t is PosixPath else b"Q")
                visit(raw, depth + 1)
            elif stream:
                emit(b"O" + id(v).to_bytes(8, "big"))
            else:
                reject("CALL_ENCODING")

        try:
            visit(value, 0)
        except (AttributeError, RuntimeError, OverflowError, UnicodeError):
            reject("CALL_ENCODING")
        return mac.hexdigest()


def passive_call(encoder: PassiveEncoder, args: Any, cwd: Any, kwargs: dict[str, Any],
                 *, input_value: Any = None) -> dict[str, Any]:
    """Digest-only snapshot. Original objects are neither modified nor copied."""
    require(type(kwargs) is dict, "CALL_ENCODING")
    env = kwargs.get("env")
    stdin = kwargs.get("stdin")
    result = dict(argv_mac=encoder.hash("args", args), cwd_mac=encoder.hash("cwd", cwd),
                  kwargs_mac=encoder.hash("kwargs", kwargs, streams=True),
                  env_mode="inherit" if env is None else "explicit",
                  env_mac=None if env is None else encoder.hash("env", env),
                  stdin_mode="input" if input_value is not None else "none" if stdin is None else "stream",
                  stdin_mac=None, snapshot_mac="0" * 64)
    if input_value is not None:
        result["stdin_mac"] = encoder.hash("input", input_value)
    elif stdin is not None:
        result["stdin_mac"] = encoder.hash("stdin", {"stdin": stdin}, streams=True)
    # Only fixed-size digests/modes enter the final binding, never input strings.
    result["snapshot_mac"] = encoder.hash("snapshot", tuple(result[k] for k in CALL_KEYS[:-1]))
    call(result)
    return result


def file_identity(s: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (s.st_dev, s.st_ino, s.st_mode, s.st_size, s.st_mtime_ns, s.st_ctime_ns)


class _DirectoryGuard:
    """Dir-relative immutable protocol IO; aliases below a trusted anchor reject."""

    def __init__(self, anchor: Path, ledger: Ledger, *, trusted_anchor: Path | None = None) -> None:
        require(type(anchor) is PosixPath, "COMPONENT_GUARD")
        trusted = anchor if trusted_anchor is None else trusted_anchor
        relative = anchor.absolute().relative_to(trusted.absolute())
        require(len(relative.parts) <= 16, "COMPONENT_GUARD")
        self.ancestry: tuple[tuple[Path, tuple[int, int]], ...] = ()
        captured = []
        cursor = trusted.absolute()
        for component in (None, *relative.parts):
            if component is not None:
                cursor = cursor / component
            info = cursor.lstat()
            require(stat.S_ISDIR(info.st_mode), "COMPONENT_GUARD")
            captured.append((cursor, (info.st_dev, info.st_ino)))
        self.ancestry = tuple(captured)
        before = anchor.lstat()
        require(stat.S_ISDIR(before.st_mode) and not stat.S_ISLNK(before.st_mode), "COMPONENT_GUARD")
        self.anchor = anchor.resolve(strict=True)  # platform aliases above the anchor
        self.ledger = ledger
        self.fd = os.open(self.anchor, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        after = os.fstat(self.fd)
        try:
            require((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino), "COMPONENT_GUARD")
            require(stat.S_IMODE(after.st_mode) == 0o700, "COMPONENT_GUARD")
        except BaseException:
            os.close(self.fd)
            self.fd = -1
            raise
        self.root_identity = (after.st_dev, after.st_ino)

    def close(self) -> None:
        if self.fd >= 0:
            os.close(self.fd)
            self.fd = -1

    def _parent(self, relative: str) -> tuple[int, str, tuple[tuple[int, int], ...]]:
        text(relative, 256)
        pieces = relative.split("/")
        require(1 <= len(pieces) <= 16 and all(p and p not in (".", "..") for p in pieces), "COMPONENT_GUARD")
        fd = os.dup(self.fd)
        chain = [self.root_identity]
        try:
            for component in pieces[:-1]:
                before = os.stat(component, dir_fd=fd, follow_symlinks=False)
                require(stat.S_ISDIR(before.st_mode) and stat.S_IMODE(before.st_mode) == 0o700,
                        "COMPONENT_GUARD")
                child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                after = os.fstat(child)
                if ((before.st_dev, before.st_ino) != (after.st_dev, after.st_ino)
                        or stat.S_IMODE(after.st_mode) != 0o700):
                    os.close(child)
                    reject("COMPONENT_GUARD")
                chain.append((after.st_dev, after.st_ino))
                os.close(fd)
                fd = child
            return fd, pieces[-1], tuple(chain)
        except BaseException:
            os.close(fd)
            raise

    def _stable(self) -> None:
        for path, expected in self.ancestry:
            info = path.lstat()
            require(stat.S_ISDIR(info.st_mode) and (info.st_dev, info.st_ino) == expected, "COMPONENT_GUARD")
        now = self.anchor.lstat()
        require(stat.S_ISDIR(now.st_mode) and stat.S_IMODE(now.st_mode) == 0o700
                and (now.st_dev, now.st_ino) == self.root_identity,
                "COMPONENT_GUARD")

    def _parent_stable(self, relative: str, parent: int,
                       chain: tuple[tuple[int, int], ...]) -> None:
        """Reject replacement of any directory below the trusted anchor."""
        self._stable()
        current, _, current_chain = self._parent(relative)
        try:
            actual, expected = os.fstat(parent), os.fstat(current)
            require((actual.st_dev, actual.st_ino) == (expected.st_dev, expected.st_ino),
                    "COMPONENT_GUARD")
            require(chain == current_chain, "COMPONENT_GUARD")
        finally:
            os.close(current)

    def mkdir(self, name: str) -> None:
        self._stable()
        parent, leaf, chain = self._parent(name)
        try:
            self._parent_stable(name, parent, chain)
            self.ledger.charge(entries=1)
            os.mkdir(leaf, 0o700, dir_fd=parent)
            self._parent_stable(name, parent, chain)
        finally:
            os.close(parent)


class OwnedDirectory(_DirectoryGuard):
    """Immutable record operations sharing the component-guard base."""

    def publish(self, name: str, data: bytes, maximum: int = 4096) -> None:
        require(type(data) is bytes and len(data) <= maximum <= 10485760, "BYTE_BUDGET")
        self._stable()
        parent, leaf, chain = self._parent(name)
        temporary = leaf + ".tmp"
        fd = -1
        try:
            self._parent_stable(name, parent, chain)
            self.ledger.charge(entries=2)
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=parent)
            offset = 0
            while offset < len(data):
                part = data[offset:offset + 1024]
                self.ledger.charge(bytes=len(part))
                count = os.write(fd, part)
                require(count > 0, "BYTE_BUDGET")
                offset += count
            final = os.fstat(fd)
            require(stat.S_ISREG(final.st_mode) and stat.S_IMODE(final.st_mode) == 0o600
                    and final.st_nlink == 1, "COMPONENT_GUARD")
            require(final.st_size == len(data), "BYTE_BUDGET")
            require(file_identity(final) == file_identity(os.stat(temporary, dir_fd=parent, follow_symlinks=False)),
                    "COMPONENT_GUARD")
            self._parent_stable(name, parent, chain)
            os.link(temporary, leaf, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
            published = os.stat(leaf, dir_fd=parent, follow_symlinks=False)
            require((published.st_dev, published.st_ino) == (final.st_dev, final.st_ino)
                    and published.st_nlink == 2, "COMPONENT_GUARD")
            os.unlink(temporary, dir_fd=parent)
            require(os.stat(leaf, dir_fd=parent, follow_symlinks=False).st_nlink == 1, "COMPONENT_GUARD")
            self._parent_stable(name, parent, chain)
        finally:
            if fd >= 0:
                os.close(fd)
            os.close(parent)

    def read(self, name: str, maximum: int = 4096) -> bytes:
        require(0 < maximum <= 10485760, "BYTE_BUDGET")
        self._stable()
        parent, leaf, chain = self._parent(name)
        fd = -1
        try:
            self._parent_stable(name, parent, chain)
            before = os.stat(leaf, dir_fd=parent, follow_symlinks=False)
            require(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode) == 0o600
                    and before.st_nlink == 1, "COMPONENT_GUARD")
            require(before.st_size <= maximum, "BYTE_BUDGET")
            fd = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
            require(file_identity(before) == file_identity(os.fstat(fd)), "COMPONENT_GUARD")
            parts = []
            size = 0
            while size < before.st_size:
                count = min(1024, before.st_size - size)
                self.ledger.charge(bytes=count)
                piece = os.read(fd, count)
                require(bool(piece), "READER_PARTIAL")
                parts.append(piece)
                size += len(piece)
            require(file_identity(before) == file_identity(os.fstat(fd)), "COMPONENT_GUARD")
            require(file_identity(before) == file_identity(os.stat(leaf, dir_fd=parent, follow_symlinks=False)),
                    "COMPONENT_GUARD")
            self._parent_stable(name, parent, chain)
            return b"".join(parts)
        finally:
            if fd >= 0:
                os.close(fd)
            os.close(parent)


@dataclass(frozen=True)
class RuntimeFacts:
    """Captured executable identity and supported exact stdlib source binding."""
    executable_identity: tuple[int, int, int, int, int, int]
    api: dict[str, Any]
    subprocess_file: str
    pathlib_file: str


def preparation_inputs(commit: str, manifest: str, helper_sha: str, source_manifest: str,
                       *, captured: bytes, helper: bytes, sites: list[dict[str, Any]]) -> dict[str, Any]:
    require(type(captured) is bytes and len(captured) <= 524288, "BYTE_BUDGET")
    require(hashlib.sha256(captured).hexdigest() == manifest, "SOURCE_BINDING")
    captured_manifest = json.loads(captured)
    digest(commit, 40)
    require(captured_manifest["preparation_head"] == commit and captured_manifest["source"] ==
        "4d56e438e2f817115e65f9c47519f9adc62d41c1", "SOURCE_BINDING")
    require(hashlib.sha256(helper).hexdigest() == helper_sha, "SOURCE_BINDING")
    require(hashlib.sha256(canonical(dict(sites=sites, helper_sha=helper_sha))).hexdigest() == source_manifest,
            "SOURCE_BINDING")
    require(any(row["path"].endswith("/public_accept_native.py") and row["sha256"] == helper_sha
                and row["size"] == len(helper) for row in captured_manifest["files"]), "SOURCE_BINDING")
    digest(manifest)
    return dict(prep_commit=commit, prep_tree=None, prep_manifest=manifest, helper_sha=helper_sha,
        source_manifest=source_manifest, product_commit=captured_manifest["source"], tag="v0.1.3",
        tag_object="cf8b1587ba1ea2733db19b979779a2921dee51f8", wheel_sha="135f91895bd726622b752aed75734d8eba985b12f0345ea63f0013b86a07dff0",
        producer_run="37967881650")


def source_projection(version: str, sub: bytes, paths: bytes, helper: bytes) -> dict[str, Any]:
    """Project exact source fragments; a projection alone grants no approval."""
    require(type(sub) is bytes and type(paths) is bytes and type(helper) is bytes and
            len(sub) <= 524288 and len(paths) <= 524288 and len(helper) <= 524288, "BYTE_BUDGET")
    text(version, 11)
    require(re.fullmatch(r"3\.12\.[0-9]{1,5}", version) is not None, "RUNTIME_API")

    def fragment(data: bytes, name: str, parent: str | None = None) -> bytes:
        try:
            tree = ast.parse(data)
            body = tree.body if parent is None else next(
                node.body for node in tree.body if isinstance(node, ast.ClassDef) and node.name == parent)
            node = next(node for node in body if isinstance(node, ast.FunctionDef) and node.name == name)
            # Line slices include the exact indentation and final source newline.
            return b"".join(data.splitlines(keepends=True)[node.lineno - 1:node.end_lineno])
        except (SyntaxError, StopIteration, UnicodeError):
            reject("RUNTIME_API")

    result: dict[str, Any] = dict(implementation="cpython", version=version,
        subprocess_sha=hashlib.sha256(sub).hexdigest(), pathlib_sha=hashlib.sha256(paths).hexdigest())
    for key, name, parent in (("run_sha", "run", None), ("enter_sha", "__enter__", "Popen"),
            ("exit_sha", "__exit__", "Popen"), ("communicate_sha", "communicate", "Popen"),
            ("poll_sha", "poll", "Popen"), ("wait_sha", "wait", "Popen")):
        result[key] = hashlib.sha256(fragment(sub, name, parent)).hexdigest()
    result["pathlib_projection_sha"] = hashlib.sha256(
        b"jev-path-raw/1\0" + fragment(paths, "__init__", "PurePath") +
        fragment(paths, "__str__", "PurePath") + fragment(helper, "hash", "PassiveEncoder")).hexdigest()
    return result


def projection_matches(source: bytes, helper_source: bytes) -> bool:
    original = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == "run")
    projected = next(node for node in ast.parse(helper_source).body if isinstance(node, ast.FunctionDef) and node.name == "_run_projection")

    class Normalize(ast.NodeTransformer):
        def visit_Attribute(self, node: ast.Attribute) -> ast.AST:
            if isinstance(node.value, ast.Name) and node.value.id == "native":
                return ast.copy_location(ast.Name(id=node.attr, ctx=node.ctx), node)
            return self.generic_visit(node)
        def visit_Name(self, node: ast.Name) -> ast.AST:
            return ast.copy_location(ast.Name(id="Popen", ctx=node.ctx), node) if node.id == "factory" else node
        def visit_ExceptHandler(self, node: ast.ExceptHandler) -> ast.AST:
            if isinstance(node.type, ast.Name) and node.type.id == "BaseException":
                node.type = None
            return self.generic_visit(node)

    original_body = ast.Module(body=original.body[1:], type_ignores=[])
    projected_body = Normalize().visit(ast.Module(body=projected.body[1:], type_ignores=[]))
    return ast.dump(original_body, include_attributes=False) == ast.dump(projected_body, include_attributes=False)


def runtime_prelaunch(executable: Path, ledger: Ledger | None = None, *, helper: bytes | None = None) -> RuntimeFacts:
    """Capture supported source facts; worker checks its actual loaded code."""
    budget = Ledger(4, 1048576) if ledger is None else ledger
    actual = executable.resolve(strict=True)
    info = actual.lstat()
    require(stat.S_ISREG(info.st_mode), "RUNTIME_API")
    if actual == Path(sys.executable).resolve(strict=True):
        require(sys.implementation.name == "cpython" and sys.version_info[:2] == (3, 12), "RUNTIME_API")
        import pathlib
        version = ".".join(str(v) for v in sys.version_info[:3])
        sub_file, path_file = Path(subprocess.__file__), Path(pathlib.__file__)
        source_anchor = sub_file.parent
    else:
        base = actual.parent.parent
        header, _ = read_source(base / "include/python3.12/patchlevel.h", base, budget)
        found = re.search(rb'^#define PY_VERSION\s+"(3\.12\.[0-9]+)"', header, re.MULTILINE)
        if found is None:
            reject("RUNTIME_API")
        version = found.group(1).decode("ascii")
        sub_file, path_file = base / "lib/python3.12/subprocess.py", base / "lib/python3.12/pathlib.py"
        source_anchor = base
    sub, _ = read_source(sub_file, source_anchor, budget)
    paths, _ = read_source(path_file, source_anchor, budget)
    if helper is None:
        helper_path = Path(__file__)
        helper, _ = read_source(helper_path, helper_path.parent, budget)
    require(projection_matches(sub, helper), "RUNTIME_API")
    if actual == Path(sys.executable).resolve(strict=True):
        require(loaded_api_matches(sub, str(sub_file), subprocess), "RUNTIME_API")
    api = source_projection(version, sub, paths, helper)
    require(file_identity(actual.lstat()) == file_identity(info), "SOURCE_CHANGED")
    return RuntimeFacts(file_identity(info), api, str(sub_file), str(path_file))


def loaded_api_matches(source: bytes, filename: str, native: Any) -> bool:
    """Compare loaded functions, including the real constructor, to captured code."""
    compiled = compile(source, filename, "exec", dont_inherit=True)
    code_type = type(compiled)
    class_code = next(code for code in compiled.co_consts if type(code) is code_type and code.co_name == "Popen")
    names = ("__init__", "__enter__", "__exit__", "communicate", "poll", "wait")
    functions = (native.run, *(getattr(native.Popen, name) for name in names))
    expected = (next(code for code in compiled.co_consts if type(code) is code_type and code.co_name == "run"),
        *(next(code for code in class_code.co_consts if type(code) is code_type and code.co_name == name) for name in names))
    return all(type(function) is FunctionType and function.__code__ == code for function, code in zip(functions, expected))


@dataclass
class Slot:
    state: str = "unused"
    binding: dict[str, Any] | None = None
    child: Any = None
    started_sha: str | None = None
    admitted: bool = False
    failures: int = 0
    terminal_attempted: bool = False
    encoder: PassiveEncoder | None = None


@dataclass
class CallContext:
    owner: NativeSession | None
    site_id: str
    command_ordinal: int | None = None
    test_scope: dict[str, Any] | None = None
    ticket: int = 0


def failure(code: str) -> int:
    return 1 << FAILURES.index(code)


def safe_error(error: BaseException | None) -> dict[str, Any] | None:
    if error is None:
        return None
    kinds = (ValueError, TypeError, FileNotFoundError, PermissionError, OSError,
             subprocess.TimeoutExpired, subprocess.CalledProcessError, KeyboardInterrupt, SystemExit)
    kind = type(error)
    name = kind.__name__ if any(kind is known for known in kinds) else "OtherException" if isinstance(error, Exception) else "OtherBaseException"
    errno = error.errno if any(kind is known for known in (FileNotFoundError, PermissionError, OSError)) else None
    if type(errno) is not int or not -2147483648 <= errno <= 2147483647:
        errno = None
    return dict(kind=name, errno=errno)


class NativeSession:
    """Fixed local custody. Receipt failures never replace a native outcome."""

    def __init__(self, desc: dict[str, Any], key: bytes, directory: OwnedDirectory,
                 owner_identity: dict[str, Any], birth: Any, *, native: Any = subprocess,
                 paths_approved: bool = False, source_check: Any = None) -> None:
        validate(desc)
        require(hashlib.sha256(key).hexdigest() == desc["key_id"], "INTEGRITY_BUILD")
        identity(owner_identity, True)
        self.desc, self.key, self.directory = desc, key, directory
        self.descriptor_sha = hashlib.sha256(canonical(desc)).hexdigest()
        self.owner_identity = owner_identity
        self.birth, self.native = birth, native
        self.paths_approved = paths_approved
        self.source_check = source_check
        self.cap = desc["allocation"]["attempt_cap"]
        self.slots = tuple(Slot() for _ in range(self.cap))
        self.lock = threading.Lock()
        self.registry_thread = threading.get_ident()
        self.observed = self.allocated = self.admitted = self.overflow = 0
        self.starts = self.ends = self.good = self.publication_failures = 0
        self.flags = 0
        self.saturated = self.uncertain = self.finalized = False
        self.encoder_left = desc["allocation"]["encoder_bytes"] - parent_encoder_reserve(desc["owner_mode"])

    def flag(self, code: str) -> None:
        self.flags |= failure(code)

    def begin(self, context: CallContext) -> Slot | None:
        context.ticket = 0
        if not self.lock.acquire(blocking=False):
            self.uncertain = True
            self.flag("ACCOUNTING_UNCERTAIN")
            return None
        try:
            if self.finalized:
                self.uncertain = True
                self.flag("ACCOUNTING_UNCERTAIN")
                return None
            if threading.get_ident() != self.registry_thread or any(slot.state == "allocated" for slot in self.slots):
                self.uncertain = True
                self.flag("ACCOUNTING_UNCERTAIN")
                return None
            self.observed, hit = saturating(self.observed)
            self.saturated |= hit
            if hit:
                self.flag("COUNTER_SATURATED")
            if self.allocated == self.cap:
                self.overflow, hit = saturating(self.overflow)
                self.saturated |= hit
                self.flag("ATTEMPT_OVERFLOW")
                if hit:
                    self.flag("COUNTER_SATURATED")
                return None
            self.allocated += 1
            context.ticket = self.allocated
            slot = self.slots[context.ticket - 1]
            slot.state = "allocated"
            return slot
        finally:
            self.lock.release()

    def prepare(self, context: CallContext, slot: Slot, args: tuple[Any, ...],
                kwargs: dict[str, Any], input_value: Any = None) -> None:
        bits = 0
        site: str | None = context.site_id
        test = context.test_scope
        ordinal = context.command_ordinal
        snapshot = None
        try:
            require(site in [row["site_id"] for row in self.desc["sites"]], "SOURCE_BINDING")
            require((test is not None) == self.desc["owner_mode"].startswith("backend-"), "SCOPE_BINDING")
            scope(test)
            require((ordinal is not None) == (site == "s01"), "CONTEXT_INVALID")
            if ordinal is not None:
                integer(ordinal, 1)
            require(self.source_check is not None and self.source_check(site), "SOURCE_CHANGED")
            encoder = PassiveEncoder(self.key, paths_approved=self.paths_approved)
            slot.encoder = encoder
            try:
                snapshot = passive_call(encoder, args, kwargs.get("cwd"), kwargs, input_value=input_value)
                require((snapshot["env_mode"], snapshot["stdin_mode"]) == CALL_MODES[context.site_id], "SOURCE_BINDING")
            finally:
                spent = 65536 - encoder.remaining
                require(spent <= self.encoder_left, "BYTE_BUDGET")
                self.encoder_left -= spent
        except ReceiptRejected as error:
            bits |= failure(error.args[0])
        except BaseException:
            bits |= failure("CALL_ENCODING")
        slot.failures |= bits
        slot.binding = dict(descriptor_sha=self.descriptor_sha, sequence=context.ticket,
            owner_identity=self.owner_identity, site_id=site if site in SITE_SOURCE else None,
            test_scope=test if type(test) is dict else None,
            command_ordinal=ordinal if site == "s01" and type(ordinal) is int and ordinal > 0 else None,
            call=snapshot, child_identity=None)

    def publish_start(self, slot: Slot, stage: str) -> None:
        try:
            data = _signed(dict(schema=SCHEMA, kind="started", **(slot.binding or {}),
                                stage=stage, failure_bits=slot.failures), self.key, self.desc)
            self.directory.publish(f"{slot.binding['sequence']:03d}-started.json", data)
            slot.started_sha = hashlib.sha256(data).hexdigest()
            self.starts += 1
        except BaseException:
            slot.failures |= failure("START_PUBLISH")
            self.publication_failures += 1
        self.flags |= slot.failures

    def _constructed(self, slot: Slot, child: Any) -> None:
        # Only the factory's returned actual object is registered. No adoption API.
        slot.child = child
        try:
            require(type(child) is self.native.Popen, "CUSTODY_MISMATCH")
            integer(child.pid, 1, 2147483647)
            require(slot.binding is not None, "CONTEXT_INVALID")
            slot.binding["child_identity"] = dict(pid=child.pid, birth_hex=None)
            captured = self.birth(child.pid)
            identity(captured, True)
            require(captured["pid"] == child.pid, "CHILD_BIRTH")
            require(slot.binding is not None, "CONTEXT_INVALID")
            slot.binding["child_identity"] = captured
            require(slot.encoder is not None, "CALL_ENCODING")
            before = slot.encoder.remaining
            try:
                actual_args = slot.encoder.hash("args", (child.args,))
                require(actual_args == slot.binding["call"]["argv_mac"], "CUSTODY_MISMATCH")
            finally:
                spent = before - slot.encoder.remaining
                require(spent <= self.encoder_left, "BYTE_BUDGET")
                self.encoder_left -= spent
        except BaseException:
            slot.failures |= failure("CHILD_BIRTH")
        if slot.failures == 0:
            slot.admitted = True
            self.admitted += 1
        self.publish_start(slot, "spawned")
        slot.state = "live"

    def no_handle(self, slot: Slot, stage: str, primary: BaseException) -> None:
        slot.failures |= failure("NATIVE_NO_HANDLE")
        if stage == "argument-rejected" and slot.binding is not None:
            slot.binding["call"] = None
        self.publish_start(slot, stage)
        self._retire(slot, primary)

    def _retire(self, slot: Slot, primary: BaseException | None, *, poll: bool = False) -> None:
        if slot.state == "retired":
            return
        native_exit = None
        if poll:
            try:
                native_exit = slot.child.poll()
            except BaseException:
                slot.failures |= failure("EXIT_UNKNOWN")
        complete = slot.admitted and slot.failures == 0
        if complete and (type(native_exit) is not int or not -2147483648 <= native_exit <= 2147483647):
            slot.failures |= failure("EXIT_UNKNOWN" if native_exit is None else "EXIT_INVALID")
            complete = False
        try:
            if slot.started_sha is not None:
                slot.terminal_attempted = True
                data = _signed(dict(schema=SCHEMA, kind="terminal", **(slot.binding or {}),
                    started_sha=slot.started_sha, admitted=slot.admitted, complete=complete,
                    native_exit=native_exit if complete else None,
                    closure_method="actual-Popen.poll" if complete else None,
                    native_outcome="returned" if primary is None else "raised", error=safe_error(primary),
                    failure_bits=slot.failures), self.key, self.desc)
                self.directory.publish(f"{slot.binding['sequence']:03d}-terminal.json", data)
                self.ends += 1
                self.good += int(complete)
        except BaseException:
            slot.failures |= failure("TERMINAL_PUBLISH")
            self.publication_failures += 1
        finally:
            self.flags |= slot.failures
            slot.child = None
            slot.encoder = None
            slot.binding = None
            slot.state = "retired"

    def close(self, context: CallContext, child: Any, primary: BaseException | None) -> None:
        if threading.get_ident() != self.registry_thread:
            self.uncertain = True
            self.flag("ACCOUNTING_UNCERTAIN")
            return
        if not 1 <= context.ticket <= self.allocated:
            return
        slot = self.slots[context.ticket - 1]
        if slot.state == "retired":
            return
        slot.state = "allocated"
        try:
            require(slot.child is child and type(child) is self.native.Popen, "CUSTODY_MISMATCH")
        except ReceiptRejected:
            slot.failures |= failure("CUSTODY_MISMATCH")
        # One nonblocking native poll only; identity never manufactures a handle.
        self._retire(slot, primary, poll=slot.child is child)

    def finish(self) -> None:
        if self.finalized:
            return
        self.finalized = True
        for slot in self.slots:
            if slot.state not in ("unused", "retired"):
                slot.failures |= failure("LIVE_AT_FINALIZE")
                self._retire(slot, None)
        self.finalized = True
        complete = (self.flags == 0 and self.starts == self.ends == self.good == self.admitted == self.allocated
                    and not self.overflow and not self.publication_failures and not self.uncertain and not self.saturated)
        summary = dict(schema=SCHEMA, kind="owner-summary", descriptor_sha=self.descriptor_sha,
            owner_identity=self.owner_identity, observed_attempts=self.observed, allocated_attempts=self.allocated,
            admitted_attempts=self.admitted, rejected_attempts=self.allocated - self.admitted,
            overflow_attempts=self.overflow, counter_saturated=self.saturated, accounting_uncertain=self.uncertain,
            started_published=self.starts, terminal_published=self.ends, complete_terminals=self.good,
            incomplete_terminals=self.ends - self.good, incomplete_admitted=self.admitted - self.good,
            publication_failures=self.publication_failures, failure_bits=self.flags, finalized=True,
            protocol_complete=complete)
        try:
            self.directory.publish("owner-summary.json", _signed(summary, self.key, self.desc))
        except BaseException:
            self.flag("SUMMARY_PUBLISH")


CURRENT_OWNER: NativeSession | None = None
CURRENT_SCOPE: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar("native_test_scope", default=None)


def current_owner() -> NativeSession | None:
    return CURRENT_OWNER


def site_context(owner: NativeSession | None, site_id: str, command_ordinal: int | None = None,
                 test_scope: dict[str, Any] | None = None) -> CallContext:
    return CallContext(owner, site_id, command_ordinal, CURRENT_SCOPE.get() if test_scope is None else test_scope)


def record_close(context: CallContext, child: Any, *, primary: BaseException | None = None) -> None:
    try:
        if context.owner is not None:
            context.owner.close(context, child, primary)
    except BaseException:
        if context.owner is not None:
            context.owner.flag("ACCOUNTING_UNCERTAIN")
            context.owner.uncertain = True


def finish_owner(owner: NativeSession | None) -> None:
    try:
        if owner is not None:
            owner.finish()
            owner.directory.close()
    except BaseException:
        if owner is not None:
            owner.flag("SUMMARY_PUBLISH")


def _construct(context: CallContext, slot: Slot | None, args: tuple[Any, ...],
               kwargs: dict[str, Any]) -> Any:
    owner = context.owner
    native = subprocess if owner is None else owner.native
    try:
        child = native.Popen(*args, **kwargs)
    except BaseException as error:
        if owner is not None and slot is not None:
            try:
                owner.no_handle(slot, "launch-failed", error)
            except BaseException:
                owner.flag("ACCOUNTING_UNCERTAIN")
                owner.uncertain = True
        raise
    if owner is not None and slot is not None:
        try:
            owner._constructed(slot, child)
        except BaseException:
            owner.flag("ACCOUNTING_UNCERTAIN")
            owner.uncertain = True
    return child


def popen_owned(context: CallContext, /, *popenargs: Any, **kwargs: Any) -> Any:
    owner = context.owner
    slot = None if owner is None else owner.begin(context)
    if slot is not None:
        owner.prepare(context, slot, popenargs, kwargs)
    return _construct(context, slot, popenargs, kwargs)


class _OwnedContext:
    def __init__(self, context: CallContext, slot: Slot, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
        self.context, self.slot, self.args, self.kwargs = context, slot, args, kwargs
        self.child: Any = None

    def __enter__(self) -> Any:
        self.child = _construct(self.context, self.slot, self.args, self.kwargs)
        # Drop the projection's extra argv/kwargs references immediately.
        self.args, self.kwargs = (), {}
        try:
            return self.child.__enter__()
        except BaseException as error:
            record_close(self.context, self.child, primary=error)
            raise

    def __exit__(self, kind: Any, value: Any, traceback: Any) -> Any:
        primary = value
        try:
            return self.child.__exit__(kind, value, traceback)
        except BaseException as error:
            primary = error
            raise
        finally:
            record_close(self.context, self.child, primary=primary)
            self.child = None


def _run_projection(native: Any, factory: Any, popenargs: tuple[Any, ...], kwargs: dict[str, Any],
                    input: Any, capture_output: Any, timeout: Any, check: Any) -> Any:
    """CPython 3.12 subprocess.run projection, Python Software Foundation license.

    Source: CPython Lib/subprocess.py run, retained v3.12.12 source and PSF LICENSE.
    Only the local context factory and explicit BaseException spelling differ.
    The real Popen context owns original stream cleanup/waits and error precedence.
    """
    if input is not None:
        if kwargs.get('stdin') is not None:
            raise ValueError('stdin and input arguments may not both be used.')
        kwargs['stdin'] = native.PIPE
    if capture_output:
        if kwargs.get('stdout') is not None or kwargs.get('stderr') is not None:
            raise ValueError('stdout and stderr arguments may not be used with capture_output.')
        kwargs['stdout'] = native.PIPE
        kwargs['stderr'] = native.PIPE
    with factory(*popenargs, **kwargs) as process:
        try:
            stdout, stderr = process.communicate(input, timeout=timeout)
        except native.TimeoutExpired as exc:
            process.kill()
            if native._mswindows:
                exc.stdout, exc.stderr = process.communicate()
            else:
                process.wait()
            raise
        except BaseException:
            process.kill()
            raise
        retcode = process.poll()
        if check and retcode:
            raise native.CalledProcessError(retcode, process.args, output=stdout, stderr=stderr)
    return native.CompletedProcess(process.args, retcode, stdout, stderr)


def run_owned(context: CallContext, /, *popenargs: Any, input: Any = None,
              capture_output: Any = False, timeout: Any = None, check: Any = False, **kwargs: Any) -> Any:
    owner = context.owner
    native = subprocess if owner is None else owner.native
    slot = None if owner is None else owner.begin(context)
    if slot is None:
        # Exhaustion does not encode, register a handle or replace native run.
        return native.run(*popenargs, input=input, capture_output=capture_output, timeout=timeout, check=check, **kwargs)
    owner.prepare(context, slot, popenargs,
        dict(kwargs, input=input, capture_output=capture_output, timeout=timeout, check=check), input)

    def factory(*args: Any, **native_kwargs: Any) -> _OwnedContext:
        return _OwnedContext(context, slot, args, native_kwargs)

    try:
        return _run_projection(native, factory, popenargs, kwargs, input, capture_output, timeout, check)
    except BaseException as error:
        if slot.state == "allocated":
            try:
                owner.no_handle(slot, "argument-rejected", error)
            except BaseException:
                owner.uncertain = True
                owner.flag("ACCOUNTING_UNCERTAIN")
        raise


def read_source(path: Path, anchor: Path, ledger: Ledger) -> tuple[bytes, tuple[int, int, int, int, int, int]]:
    """Bounded nofollow source read with every relative component retained."""
    root = anchor.absolute()
    relative = path.absolute().relative_to(root)
    require(1 <= len(relative.parts) <= 16, "COMPONENT_GUARD")
    base = root.lstat()
    require(stat.S_ISDIR(base.st_mode), "COMPONENT_GUARD")
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    opened: list[tuple[int, str, tuple[int, int]]] = []
    content_fd = -1
    try:
        require((base.st_dev, base.st_ino) == (os.fstat(fd).st_dev, os.fstat(fd).st_ino), "COMPONENT_GUARD")
        for component in relative.parts[:-1]:
            before = os.stat(component, dir_fd=fd, follow_symlinks=False)
            require(stat.S_ISDIR(before.st_mode), "COMPONENT_GUARD")
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            after = os.fstat(child)
            if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
                os.close(child)
                reject("COMPONENT_GUARD")
            opened.append((fd, component, (after.st_dev, after.st_ino)))
            fd = child
        before = os.stat(relative.name, dir_fd=fd, follow_symlinks=False)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= 524288,
                "COMPONENT_GUARD")
        ledger.charge(entries=1)
        content_fd = os.open(relative.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
        require(file_identity(before) == file_identity(os.fstat(content_fd)), "SOURCE_CHANGED")
        parts: list[bytes] = []
        size = 0
        while size < before.st_size:
            count = min(1024, before.st_size - size)
            ledger.charge(bytes=count)
            part = os.read(content_fd, count)
            require(bool(part), "READER_PARTIAL")
            parts.append(part)
            size += len(part)
        require(file_identity(before) == file_identity(os.fstat(content_fd)), "SOURCE_CHANGED")
        require(file_identity(before) == file_identity(os.stat(relative.name, dir_fd=fd, follow_symlinks=False)),
                "SOURCE_CHANGED")
        for parent, component, captured in opened:
            info = os.stat(component, dir_fd=parent, follow_symlinks=False)
            require(stat.S_ISDIR(info.st_mode) and (info.st_dev, info.st_ino) == captured, "SOURCE_CHANGED")
        now = root.lstat()
        require(stat.S_ISDIR(now.st_mode) and (now.st_dev, now.st_ino) == (base.st_dev, base.st_ino), "SOURCE_CHANGED")
        return b"".join(parts), file_identity(before)
    finally:
        if content_fd >= 0:
            os.close(content_fd)
        os.close(fd)
        for parent, _, _ in opened:
            os.close(parent)


def known_birth(pid: int) -> dict[str, Any]:
    import psutil
    value = psutil.Process(pid).create_time()
    require(type(value) is float and math.isfinite(value) and value > 0, "CHILD_BIRTH")
    return dict(pid=pid, birth_hex=value.hex())


def load_owner(descriptor: Path, trusted_helper: Path,
               expected_sources: dict[str, Path]) -> NativeSession | None:
    """Load only the explicit worker's existing-path descriptor, without adoption."""
    global CURRENT_OWNER
    CURRENT_OWNER = None
    directory = None
    try:
        # These reads consume pre-reserved descriptor/key tokens, not a new walk.
        work = descriptor.parent.parent.parent.parent
        directory = OwnedDirectory(descriptor.parent, Ledger(0, 65536), trusted_anchor=work)
        mode = descriptor.parent.name
        require(mode in OWNER_QUOTAS, "UNKNOWN_OWNER")
        keys = OwnedDirectory(work / "native-owner-keys", Ledger(0, 32), trusted_anchor=work)
        try:
            key = keys.read(mode + ".key", 32)
        finally:
            keys.close()
        desc = parsed(directory.read("descriptor.json", 65536), key)
        require(desc["owner_mode"] == mode, "UNKNOWN_OWNER")
        cap = desc["allocation"]
        directory.ledger = Ledger(cap["attempt_entries"] + cap["summary_entries"],
                                  cap["record_write_bytes"] + 4096)
        source_ledger = Ledger(cap["source_entries"], cap["source_bytes"])
        cached: dict[str, tuple[Path, tuple[int, int, int, int, int, int]]] = {}
        parents: dict[Path, tuple[int, int]] = {}

        def retain_parents(path: Path, anchor: Path) -> None:
            cursor = path.parent
            for _ in range(16):
                info = cursor.lstat()
                require(stat.S_ISDIR(info.st_mode), "COMPONENT_GUARD")
                parents[cursor] = (info.st_dev, info.st_ino)
                if cursor == anchor:
                    return
                cursor = cursor.parent
            reject("COMPONENT_GUARD")

        helper_data, helper_stat = read_source(trusted_helper, trusted_helper.parent, source_ledger)
        require(hashlib.sha256(helper_data).hexdigest() == desc["inputs"]["helper_sha"], "SOURCE_BINDING")
        cached["helper"] = (trusted_helper, helper_stat)
        retain_parents(trusted_helper, trusted_helper.parent)
        for site in desc["sites"]:
            name = site["file"]
            require(name in expected_sources, "SOURCE_BINDING")
        require(sys.implementation.name == "cpython" and sys.version_info[:3] ==
                tuple(int(v) for v in desc["api"]["version"].split(".")), "RUNTIME_API")
        import pathlib
        require(subprocess.__file__ is not None and pathlib.__file__ is not None, "RUNTIME_API")
        sub_file, path_file = Path(subprocess.__file__), Path(pathlib.__file__)
        sub, sub_stat = read_source(sub_file, sub_file.parent, source_ledger)
        paths, path_stat = read_source(path_file, path_file.parent, source_ledger)
        require(source_projection(desc["api"]["version"], sub, paths, helper_data) == desc["api"], "RUNTIME_API")
        require(projection_matches(sub, helper_data), "RUNTIME_API")
        require(loaded_api_matches(sub, str(sub_file), subprocess), "RUNTIME_API")
        names = ("__init__", "__enter__", "__exit__", "communicate", "poll", "wait")
        native_functions = (subprocess.run, *(getattr(subprocess.Popen, name) for name in names))
        path_code = compile(paths, str(path_file), "exec", dont_inherit=True)
        pure_code = next(code for code in path_code.co_consts if type(code) is type(path_code) and code.co_name == "PurePath")
        path_functions = (PurePath.__init__, PurePath.__str__)
        require(all(type(function) is FunctionType and function.__code__ == next(code for code in pure_code.co_consts
            if type(code) is type(path_code) and code.co_name == name) for function, name in
            zip(path_functions, ("__init__", "__str__"))), "RUNTIME_API")
        native_class = subprocess.Popen
        cached["subprocess"] = (sub_file, sub_stat)
        cached["pathlib"] = (path_file, path_stat)
        retain_parents(sub_file, sub_file.parent)
        retain_parents(path_file, path_file.parent)

        def source_check(site_id: str) -> bool:
            require((PurePath.__init__, PurePath.__str__) == path_functions, "RUNTIME_API")
            require(subprocess.Popen is native_class and
                all(current is captured for current, captured in zip(
                    (subprocess.run, *(getattr(subprocess.Popen, name) for name in names)), native_functions)), "RUNTIME_API")
            row = next(site for site in desc["sites"] if site["site_id"] == site_id)
            name = row["file"]
            if name not in cached:
                require(len(cached) < cap["source_entries"], "ENTRY_BUDGET")
                path = expected_sources[name]
                anchor = path.parent if name == "scripts/public-installed/serve.py" else trusted_helper.parent
                data, info = read_source(path, anchor, source_ledger)
                require(hashlib.sha256(data).hexdigest() == row["adapted_sha"], "SOURCE_BINDING")
                cached[name] = (path, info)
                retain_parents(path, anchor)
            # Fixed source cache; drift rejects without a fresh content read or repair.
            for path, captured in cached.values():
                require(file_identity(path.lstat()) == captured, "SOURCE_CHANGED")
            for path, captured_parent in parents.items():
                now = path.lstat()
                require(stat.S_ISDIR(now.st_mode) and (now.st_dev, now.st_ino) == captured_parent,
                        "SOURCE_CHANGED")
            return site_id in [site["site_id"] for site in desc["sites"]]

        CURRENT_OWNER = NativeSession(desc, key, directory, known_birth(os.getpid()), known_birth,
                                     paths_approved=True, source_check=source_check)
        return CURRENT_OWNER
    except BaseException:
        # Missing/invalid required owner summary independently fails the driver.
        if directory is not None:
            directory.close()
        return None


@dataclass(frozen=True)
class HelperClosure:
    pid: int
    birth_hex: str
    native_exit: int
    owner_id: str
    sequence: int
    terminal_sha: str

    def projection(self) -> dict[str, Any]:
        return dict(pid=self.pid, create_time=float.fromhex(self.birth_hex), native_exit=self.native_exit,
            owner_id=self.owner_id, sequence=self.sequence, terminal_sha=self.terminal_sha,
            closure_source="helper-owned-native-receipt/1")


def consume_owner(directory: OwnedDirectory, desc: dict[str, Any], key: bytes, *,
                  actual_owner: dict[str, Any], owner_closed: bool, cleanup_ok: bool,
                  sources: list[dict[str, Any]], api: dict[str, Any], launch_spec_mac: str,
                  expected_scope: Any = None, expected_calls: dict[int, dict[str, Any]] | None = None
                  ) -> tuple[HelperClosure, ...]:
    """Atomic whole-owner admission; no facts escape a rejected summary/chain."""
    require(owner_closed and cleanup_ok, "CUSTODY_MISMATCH")
    identity(actual_owner, True)
    require(desc["api"] == api and desc["sites"] == sources and
            desc["launch_spec_mac"] == launch_spec_mac, "SOURCE_BINDING")
    descriptor_bytes = directory.read("descriptor.json", 65536)
    require(parsed(descriptor_bytes, key) == desc, "CHAIN_MISMATCH")
    summary = parsed(directory.read("owner-summary.json"), key, desc)
    require(summary["kind"] == "owner-summary" and summary["owner_identity"] == actual_owner
            and summary["protocol_complete"], "MISSING_CHAIN")
    count = summary["allocated_attempts"]
    allowed = {"descriptor.json", "owner-summary.json"}
    allowed.update(f"{sequence:03d}-{kind}.json" for sequence in range(1, count + 1)
                   for kind in ("started", "terminal"))
    seen = 0
    with os.scandir(directory.fd) as entries:
        for entry in entries:
            seen += 1
            require(seen <= 2 * desc["allocation"]["attempt_cap"] + 2 and entry.name in allowed,
                    "ENTRY_BUDGET")
    require(seen == len(allowed), "MISSING_CHAIN")
    closures: list[HelperClosure] = []
    union = 0
    for sequence in range(1, count + 1):
        start_bytes = directory.read(f"{sequence:03d}-started.json")
        start = parsed(start_bytes, key, desc)
        terminal_bytes = directory.read(f"{sequence:03d}-terminal.json")
        terminal = parsed(terminal_bytes, key, desc)
        require(start["kind"] == "started" and terminal["kind"] == "terminal", "CHAIN_MISMATCH")
        require(start["sequence"] == sequence and terminal["started_sha"] ==
                hashlib.sha256(start_bytes).hexdigest(), "CHAIN_MISMATCH")
        require(all(start[field] == terminal[field] for field in BINDING_KEYS), "CHAIN_MISMATCH")
        require(terminal["failure_bits"] & start["failure_bits"] == start["failure_bits"], "CHAIN_MISMATCH")
        require(start["stage"] == "spawned" and start["failure_bits"] == 0 and
                terminal["complete"] and terminal["admitted"] and terminal["owner_identity"] == actual_owner,
                "CUSTODY_MISMATCH")
        if desc["owner_mode"].startswith("backend-"):
            require(expected_scope is not None and expected_scope(terminal["test_scope"]), "SCOPE_BINDING")
        else:
            require(terminal["test_scope"] is None, "SCOPE_BINDING")
        if expected_calls is not None:
            require(sequence in expected_calls and terminal["call"] == expected_calls[sequence], "CHAIN_MISMATCH")
        union |= terminal["failure_bits"] | start["failure_bits"]
        child = terminal["child_identity"]
        closures.append(HelperClosure(child["pid"], child["birth_hex"], terminal["native_exit"],
            desc["owner_id"], sequence, hashlib.sha256(terminal_bytes).hexdigest()))
    require(union & summary["failure_bits"] == union, "CHAIN_MISMATCH")
    require(summary["started_published"] == summary["terminal_published"] ==
            summary["complete_terminals"] == count, "CHAIN_MISMATCH")
    identities = [(fact.pid, fact.birth_hex) for fact in closures]
    require(len(set(identities)) == len(identities), "AMBIGUOUS")
    return tuple(closures)


class SharedAllocation:
    """One nontransferable seven-owner allocation, including consumer reserves."""
    def __init__(self) -> None:
        self.claimed: set[str] = set()
        self.entries = 512
        self.bytes = 25690112
        # Charge the complete fixed reservation once, never 512 per owner.
        self.reservation = dict(attempts=96, attempt_entries=384, source_entries=64,
            control_directories=11, descriptor_entries=14, key_entries=7, summary_entries=14,
            result_entries=2, guard_entries=16, source_bytes=12582912,
            attempt_bytes=1572864, encoder_bytes=6291456, control_bytes=5242880)
        require(sum(self.reservation[k] for k in ("attempt_entries", "source_entries", "control_directories",
            "descriptor_entries", "key_entries", "summary_entries", "result_entries", "guard_entries")) == self.entries,
            "QUOTA_BINDING")
        require(sum(self.reservation[k] for k in ("source_bytes", "attempt_bytes", "encoder_bytes", "control_bytes"))
                == self.bytes, "QUOTA_BINDING")

    def claim(self, mode: str) -> dict[str, int]:
        require(mode in OWNER_QUOTAS and mode not in self.claimed, "QUOTA_BINDING")
        self.claimed.add(mode)
        return allocation(mode)


def write_consumption_result(evidence: Path, value: dict[str, Any], ledger: Ledger) -> None:
    data = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True,
                      allow_nan=False).encode("ascii")
    require(len(data) <= 65536, "BYTE_BUDGET")
    directory = OwnedDirectory(evidence, ledger, trusted_anchor=evidence.parent)
    try:
        directory.publish("native-owner-consumption.json", data, 65536)
    finally:
        directory.close()


def scope_digest(owner: NativeSession, nodeid: str) -> str | None:
    encoder = PassiveEncoder(owner.key)
    try:
        return encoder.hash("nodeid", nodeid)
    except BaseException:
        owner.flag("SCOPE_BINDING")
        return None
    finally:
        spent = 65536 - encoder.remaining
        if spent > owner.encoder_left:
            owner.encoder_left = 0
            owner.flag("BYTE_BUDGET")
        else:
            owner.encoder_left -= spent


def helper_sources(helper: Path, preparation: Path) -> dict[str, Path]:
    return {row[1]: (helper / "smoke.py" if site in ("s01", "s02", "s03") else
        preparation / "serve.py" if site == "s04" else helper / row[1])
        for site, row in SITE_SOURCE.items()}


class NativeCoordinator:
    """Driver-retained planned launch and actual owner joins; keys stay private."""
    LABELS = MappingProxyType({"original-public-installer-smoke": "smoke", "installed-backend-collection": "backend-collect",
        "installed-backend-business": "backend-business", "installed-browser-capture-replay": "backend-replay",
        "listing-fixture": "listing", "live-fixture": "live", "default-fixture": "default"})

    def __init__(self, work: Path, helper: Path, preparation: Path, sites: list[dict[str, Any]],
                 inputs: dict[str, Any], run: dict[str, Any], *, capacity: dict[str, Any], capture_bytes: int = 0,
                 helper_capture: bytes | None = None) -> None:
        self.work, self.helper, self.preparation = work, helper, preparation
        self.sites, self.inputs, self.run = sites, inputs, run
        self.capacity = capacity
        self.allocation = SharedAllocation()
        self.owners: dict[str, dict[str, Any]] = {}
        self.phase_scopes: dict[str, set[tuple[str, str]]] = {}
        self.sources = helper_sources(helper, preparation)
        self.root = work / "evidence/native-owners"
        self.keys = work / "native-owner-keys"
        integer(capture_bytes, 0, 524288)
        extra = 0 if helper_capture is None else len(helper_capture)
        require(extra <= 524288, "BYTE_BUDGET")
        if helper_capture is not None:
            require(hashlib.sha256(helper_capture).hexdigest() == inputs["helper_sha"], "SOURCE_BINDING")
        self.control = Ledger(4 - int(bool(capture_bytes)) - int(helper_capture is not None), 1048576 - capture_bytes - extra)
        self.consumer_sources = Ledger(15, 3670016)
        self.results = Ledger(2, 65536)
        self.scope_bytes: dict[str, int] = {}
        self.runtime_cache: dict[Path, tuple[RuntimeFacts, tuple[tuple[Path, tuple[int, int, int, int, int, int]], ...]]] = {}
        self.runtime_helper: bytes | None = helper_capture

    def plan(self, label: str, argv: list[str], cwd: Path, env: dict[str, str], index: int,
             log: Any) -> None:
        if label not in self.LABELS:
            return
        mode = self.LABELS[label]
        require(hashlib.sha256(canonical(dict(sites=self.sites, helper_sha=self.inputs["helper_sha"]))).hexdigest()
            == self.inputs["source_manifest"], "SOURCE_BINDING")
        require(self.capacity.get("complete") is True, "QUOTA_BINDING")
        executable = Path(argv[0]).resolve(strict=True)
        if executable not in self.runtime_cache:
            require(len(self.runtime_cache) < 2, "ENTRY_BUDGET")
            if self.runtime_helper is None:
                path = self.preparation / "public_accept_native.py"
                self.runtime_helper, _ = read_source(path, self.preparation, self.control)
                require(hashlib.sha256(self.runtime_helper).hexdigest() == self.inputs["helper_sha"], "SOURCE_BINDING")
            budget = self.control if mode == "smoke" else self.consumer_sources
            approval = runtime_prelaunch(executable, budget, helper=self.runtime_helper)
            self.runtime_cache[executable] = (approval, tuple((path, file_identity(path.lstat())) for path in
                (executable, Path(approval.subprocess_file), Path(approval.pathlib_file))))
        approval, identities = self.runtime_cache[executable]
        require(all(file_identity(path.lstat()) == captured for path, captured in identities), "SOURCE_CHANGED")
        actual_sources = sum(Path(name).stat().st_size for name in (approval.subprocess_file, approval.pathlib_file))
        require(self.capacity["source_adequacy"][mode]["known_bytes"] + actual_sources <= OWNER_QUOTAS[mode][2], "BYTE_BUDGET")
        cap = self.allocation.claim(mode)
        self.root.mkdir(mode=0o700, exist_ok=True)
        self.keys.mkdir(mode=0o700, exist_ok=True)
        base = self.root / mode
        base.mkdir(mode=0o700)
        key = os.urandom(32)
        encoder = PassiveEncoder(key, paths_approved=True)
        snapshot = passive_call(encoder, (argv,), cwd,
            dict(cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
        launch_mac = snapshot["snapshot_mac"]
        subset = SITE_SUBSETS.get(mode, BACKEND_SITES)
        desc = dict(schema=SCHEMA, kind="descriptor", run=self.run, owner_id=os.urandom(16).hex(),
            owner_mode=mode, launch_index=index, launch_spec_mac=launch_mac, inputs=self.inputs,
            api=approval.api, sites=[site for site in self.sites if site["site_id"] in subset],
            allocation=cap, limits=dict(LIMITS), key_id=hashlib.sha256(key).hexdigest())
        data = _signed(desc, key)
        directory = OwnedDirectory(base, Ledger(2, 65536), trusted_anchor=self.work)
        try:
            keys = OwnedDirectory(self.keys, Ledger(1, 32), trusted_anchor=self.work)
            try:
                keys._stable()
                keys.ledger.charge(entries=1, bytes=32)
                # The key has one reserved entry; no temporary key or upload.
                fd = os.open(mode + ".key", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=keys.fd)
                try:
                    require(os.write(fd, key) == 32 and os.fstat(fd).st_nlink == 1, "READER_PARTIAL")
                    require(file_identity(os.fstat(fd)) == file_identity(os.stat(mode + ".key", dir_fd=keys.fd,
                        follow_symlinks=False)), "COMPONENT_GUARD")
                    keys._stable()
                finally:
                    os.close(fd)
            finally:
                keys.close()
            directory.publish("descriptor.json", data, 65536)
        finally:
            directory.close()
        self.owners[label] = dict(desc=parsed(data, key), key=key, base=base, launch_spec_mac=launch_mac,
                                  actual=None, index=index, api=approval.api, consumed=False,
                                  parent_encoder=encoder, argv_mac=snapshot["argv_mac"])
        self.scope_bytes[label] = 32768 if mode.startswith("backend-") else 0

    def launched(self, label: str, record: dict[str, Any], process: Any) -> None:
        if label not in self.LABELS:
            return
        retained = self.owners.get(label)
        try:
            require(retained is not None, "UNKNOWN_OWNER")
            require(type(process) is subprocess.Popen and process.pid == record["pid"], "CUSTODY_MISMATCH")
            require(retained["parent_encoder"].hash("args", (process.args,)) == retained["argv_mac"], "CUSTODY_MISMATCH")
            birth = record.get("create_time")
            require(type(birth) is float, "OWNER_BIRTH")
            retained["actual"] = dict(pid=record["pid"], birth_hex=birth.hex())
        except BaseException:
            if retained is not None:
                retained["actual"] = None
        finally:
            if retained is not None:
                retained["parent_encoder"] = None

    def register_reports(self, label: str, reports: dict[str, Any]) -> None:
        """Join already-read original receipts; retain only bounded relevant hashes."""
        require(label in self.owners and label not in self.phase_scopes, "UNKNOWN_OWNER")
        retained = self.owners[label]
        applicable = {row[2] for site, row in SITE_SOURCE.items() if site in BACKEND_SITES and site != "s08"}
        applicable.add("test_json_only_actual_http_transports_reload_restart_and_privacy")
        known: set[tuple[str, str]] = set()
        for report in reports["reports"]:
            nodeid = report["nodeid"]
            name = nodeid.rsplit("::", 1)[-1].split("[", 1)[0]
            if name not in applicable:
                continue
            require(report["when"] in ("setup", "call", "teardown"), "SCOPE_BINDING")
            encoder = PassiveEncoder(retained["key"])
            digest_ = encoder.hash("nodeid", nodeid)
            spent = 65536 - encoder.remaining
            require(spent <= self.scope_bytes[label], "BYTE_BUDGET")
            self.scope_bytes[label] -= spent
            known.add((digest_, report["when"]))
            require(len(known) <= 3 * retained["desc"]["allocation"]["attempt_cap"], "ENTRY_BUDGET")
        self.phase_scopes[label] = known

    def consume(self, commands: list[dict[str, Any]], *, cleanup_ok: bool) -> tuple[HelperClosure, ...]:
        require(set(self.owners) == set(self.LABELS), "MISSING_SUMMARY")
        require(len(self.allocation.claimed) == 7, "QUOTA_BINDING")
        for _, identities in self.runtime_cache.values():
            require(all(file_identity(path.lstat()) == captured for path, captured in identities), "SOURCE_CHANGED")
        # Independently verify the complete source table once before any owner contributes facts.
        for name, path in self.sources.items():
            rows = [site for site in self.sites if site["file"] == name]
            data, _ = read_source(path, path.parent if name == "scripts/public-installed/serve.py" else self.helper,
                                  self.consumer_sources)
            require(all(hashlib.sha256(data).hexdigest() == row["adapted_sha"] for row in rows), "SOURCE_CHANGED")
        data, _ = read_source(self.helper / "public_accept_native.py", self.helper, self.consumer_sources)
        require(hashlib.sha256(data).hexdigest() == self.inputs["helper_sha"], "SOURCE_CHANGED")
        facts: list[HelperClosure] = []
        for label, retained in self.owners.items():
            require(not retained["consumed"], "CHAIN_MISMATCH")
            retained["consumed"] = True
            record = commands[retained["index"] - 1]
            require(record["label"] == label and retained["actual"] is not None and
                    record["pid"] == retained["actual"]["pid"] and
                    type(record.get("create_time")) is float and
                    record["create_time"].hex() == retained["actual"]["birth_hex"], "CUSTODY_MISMATCH")
            cap = retained["desc"]["allocation"]
            directory = OwnedDirectory(retained["base"], Ledger(0, cap["record_read_bytes"] + 65536 + 4096),
                                       trusted_anchor=self.work)
            phase_check = None
            if retained["desc"]["owner_mode"].startswith("backend-"):
                require(label in self.phase_scopes, "SCOPE_BINDING")
                phase_check = lambda value, known=self.phase_scopes[label]: (value["node_mac"], value["phase"]) in known
            try:
                owner_facts = consume_owner(directory, retained["desc"], retained["key"],
                    actual_owner=retained["actual"], owner_closed=record["native_exit"] is not None,
                    cleanup_ok=cleanup_ok and not record["timed_out"], sources=retained["desc"]["sites"],
                    api=retained["api"], launch_spec_mac=retained["launch_spec_mac"], expected_scope=phase_check)
                facts.extend(owner_facts)
            finally:
                directory.close()
        identities = [(fact.pid, fact.birth_hex) for fact in facts]
        require(len(identities) == len(set(identities)), "AMBIGUOUS")
        return tuple(facts)


def static_capacity(source: Path, helper: Path, preparation: Path,
                    sites: list[dict[str, Any]]) -> dict[str, Any]:
    """Conservative source-defined call bounds; unknown loops/parameters reject."""
    limitations: list[str] = []

    def call_count(node: ast.AST, weights: dict[str, int]) -> int:
        if isinstance(node, ast.Call):
            name = node.func.id if isinstance(node.func, ast.Name) else (
                node.func.value.id + "." + node.func.attr if isinstance(node.func, ast.Attribute)
                and isinstance(node.func.value, ast.Name) else "")
            return weights.get(name, 0) + sum(call_count(child, weights) for child in ast.iter_child_nodes(node))
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            return 0
        if isinstance(node, ast.If):
            return call_count(node.test, weights) + max(block_count(node.body, weights), block_count(node.orelse, weights))
        if isinstance(node, (ast.For, ast.While)):
            body = block_count(node.body, weights)
            if body == 0:
                return block_count(node.orelse, weights)
            try:
                iterable = ast.literal_eval(node.iter) if isinstance(node, ast.For) else None
                require(type(iterable) in (tuple, list), "QUOTA_BINDING")
                return len(iterable) * body + block_count(node.orelse, weights)
            except (ValueError, TypeError, ReceiptRejected):
                limitations.append("unbounded source loop at line " + str(node.lineno))
                return 97
        if isinstance(node, ast.Try):
            return block_count(node.body, weights) + max([0, *(block_count(h.body, weights) for h in node.handlers)]) + \
                block_count(node.orelse, weights) + block_count(node.finalbody, weights)
        return sum(call_count(child, weights) for child in ast.iter_child_nodes(node))

    def block_count(body: list[ast.stmt], weights: dict[str, int]) -> int:
        return sum(call_count(node, weights) for node in body)

    def function(tree: ast.Module, name: str) -> ast.FunctionDef:
        return next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == name)

    smoke = function(ast.parse((source / "scripts/smoke-installed-release.py").read_bytes()), "main")
    smoke_bound = block_count(smoke.body, {"cli": 1, "command": 1, "install": 1,
                                         "subprocess.Popen": 1, "subprocess.run": 1})
    business = 0
    details = []
    for site in sites:
        if site["site_id"] not in BACKEND_SITES or site["site_id"] == "s08":
            continue
        tree = ast.parse((source / site["file"]).read_bytes())
        fn = function(tree, site["function"])
        multiplicity = 1
        for decorator in fn.decorator_list:
            if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute) and decorator.func.attr == "parametrize":
                try:
                    values = ast.literal_eval(decorator.args[1])
                    require(type(values) in (tuple, list), "QUOTA_BINDING")
                    multiplicity *= len(values)
                except (ValueError, IndexError, ReceiptRejected):
                    limitations.append("unestablished parameter scope " + site["site_id"])
                    multiplicity = 97
        count = multiplicity * block_count(fn.body, {"subprocess.run": 1, "subprocess.Popen": 1})
        business += count
        details.append(dict(site=site["site_id"], bound=count))
    credential = ast.parse((source / "tests/test_credential_live_server.py").read_bytes())
    live_business = block_count(function(credential, "test_json_only_actual_http_transports_reload_restart_and_privacy").body,
                                {"live_gateway": 1})
    business += live_business
    details.append(dict(site="s08", bound=live_business))
    counts = dict(smoke=smoke_bound, **{"backend-collect": 0, "backend-business": business,
        "backend-replay": 0}, listing=1, live=1, default=1)
    for mode, count in counts.items():
        if count > OWNER_QUOTAS[mode][0]:
            limitations.append("attempt capacity " + mode)
    # Import-time native creation is not covered by a function count.
    for name in {site["file"] for site in sites if site["site_id"] in BACKEND_SITES}:
        tree = ast.parse((source / name).read_bytes())
        if block_count(tree.body, {"subprocess.run": 1, "subprocess.Popen": 1}):
            limitations.append("collection-time native creation " + name)
    paths = helper_sources(helper, preparation)
    component_count = len({helper, helper / "tests", preparation})
    sizes = {name: path.stat().st_size for name, path in paths.items()}
    helper_size = (helper / "public_accept_native.py").stat().st_size
    source_adequacy = {}
    for mode in OWNER_QUOTAS:
        subset = SITE_SUBSETS.get(mode, BACKEND_SITES)
        names = {SITE_SOURCE[s][1] for s in subset}
        # Stdlib sizes require exact independently reviewed actual patch sources.
        known_bytes = helper_size + sum(sizes[name] for name in names)
        # Lazy per-call source admission: zero-attempt collect/replay need only
        # helper/subprocess/pathlib. Each additional attempt opens at most one file.
        actual_names = min(len(names), counts[mode])
        reads = actual_names + 3
        if mode in ("backend-collect", "backend-replay"):
            known_bytes = helper_size
        _, slots, budget = OWNER_QUOTAS[mode]
        source_adequacy[mode] = dict(known_bytes=known_bytes, source_reads=reads, reserved_bytes=budget, reserved_entries=slots)
        if reads > slots or known_bytes > budget:
            limitations.append("source allocation " + mode)
    # Each actual source is independently bounded to 524288 bytes when captured.
    # Reserve both stdlib reads now; actual compatibility is checked at use.
    for mode, row in source_adequacy.items():
        if row["known_bytes"] + 2 * 524288 > row["reserved_bytes"] and mode not in ("smoke", "listing", "live", "default"):
            limitations.append("runtime source byte allocation " + mode)
    if component_count > 16:
        limitations.append("source guard component capacity")
    return dict(complete=not limitations, attempt_bounds=counts, business_details=details,
        known_guard_components=component_count, source_adequacy=source_adequacy, limitations=limitations,
        allocation=SharedAllocation().reservation)
