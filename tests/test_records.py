"""Tests for durable routing evidence storage."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping, Sequence
from dataclasses import replace
from pathlib import Path

import pytest

from jev_gateway.records import (
    AssistantContinuationRecord,
    DecisionRecord,
    OutcomeRecord,
    RequestRecord,
    SqliteRecordStore,
    StorageSettings,
    UpstreamRequestRecord,
    build_config_hash,
    redact_secret_text,
    sanitize_upstream_payload,
)


def _request(request_id: str, *, prompt: str = "secret prompt") -> RequestRecord:
    return RequestRecord(
        request_id=request_id,
        received_at=1000.0,
        session_id="session-1",
        requested_strategy="quality",
        requested_model="auto",
        endpoint="/v1/chat/completions",
        client="127.0.0.1",
        user_agent="test",
        stream=False,
        max_tokens=128,
        tools=None,
        response_format=None,
        messages=[{"role": "user", "content": prompt}],
        prompt=prompt,
        prompt_chars=len(prompt),
        prompt_tokens=3,
        conversation_tokens=3,
        turn_index=1,
        has_tools=False,
        has_vision=False,
        wants_json=False,
    )


def _decision(request_id: str, config_hash: str) -> DecisionRecord:
    return DecisionRecord(
        decision_id=f"dec-{request_id}",
        request_id=request_id,
        session_id="session-1",
        strategy="quality",
        config_hash=config_hash,
        route="provider/model",
        provider="provider",
        upstream_model="model",
        tier="simple",
        reason="first_turn_simple",
        mode="auto",
        turn_index=1,
        switched_from=None,
        blocked_by=None,
        reasoning_effort="low",
        reasoning_effort_source="derived",
        candidates=("provider/model",),
        signals={"score": 0.1, "reasons": ["marker:test"]},
        created_at=1001.0,
    )


def _upstream(request_id: str, payload: dict[str, object]) -> UpstreamRequestRecord:
    return UpstreamRequestRecord(
        decision_id=f"dec-{request_id}",
        request_id=request_id,
        provider="provider",
        model=str(payload.get("model", "openai/model")),
        stream=bool(payload.get("stream")),
        capture_content=True,
        payload=payload,
        created_at=1002.0,
    )


def test_store_joins_request_decision_outcome_and_config(tmp_path: Path) -> None:
    path = tmp_path / "records.sqlite3"
    store = SqliteRecordStore(StorageSettings(enabled=True, path=str(path)))
    config_hash = store.register_config({"policy": {"mode": "fresh"}}, "models.json")
    store.record_request(_request("req-1"))
    store.record_decision(_decision("req-1", config_hash))
    store.record_upstream_request(_upstream("req-1", {
        "model": "openai/model", "stream": False,
        "messages": [{"role": "user", "content": "secret prompt"}],
    }))
    store.record_outcome(
        OutcomeRecord(
            "dec-req-1", "req-1", True, finish_reason="stop",
            prompt_tokens=3, completion_tokens=5, cost_usd=0.001, latency_ms=12,
        )
    )
    assert store.counts() == {
        "requests": 1,
        "decisions": 1,
        "outcomes": 1,
        "upstream_requests": 1,
        "config_versions": 1,
        "assistant_continuations": 0,
    }
    with sqlite3.connect(path) as db:
        route, strategy, ok, signals = db.execute(
            "SELECT route, strategy, ok, signals_json FROM decision_evidence"
        ).fetchone()
        assert (route, strategy, ok) == ("provider/model", "quality", 1)
        assert json.loads(signals)["reasons"] == ["marker:test"]
        assert db.execute("SELECT prompt FROM requests").fetchone()[0] == "secret prompt"
        assert db.execute("SELECT catalog_json FROM config_versions").fetchone()[0]
    store.close()


def test_existing_database_adds_upstream_request_table(tmp_path: Path) -> None:
    path = tmp_path / "records.sqlite3"
    with sqlite3.connect(path) as database:
        database.execute(
            "CREATE TABLE requests (request_id TEXT PRIMARY KEY, "
            "received_at REAL NOT NULL, session_id TEXT, strategy TEXT, "
            "requested_model TEXT, endpoint TEXT NOT NULL, client TEXT, "
            "user_agent TEXT, stream INTEGER NOT NULL DEFAULT 0, max_tokens INTEGER, "
            "has_tools INTEGER NOT NULL DEFAULT 0, has_vision INTEGER NOT NULL DEFAULT 0, "
            "wants_json INTEGER NOT NULL DEFAULT 0, prompt_chars INTEGER NOT NULL DEFAULT 0, "
            "prompt_tokens INTEGER NOT NULL DEFAULT 0, "
            "conversation_tokens INTEGER NOT NULL DEFAULT 0, "
            "turn_index INTEGER NOT NULL DEFAULT 0, "
            "capture_content INTEGER NOT NULL DEFAULT 0, prompt_digest TEXT, "
            "prompt TEXT, messages_json TEXT, tools_json TEXT, response_format_json TEXT)"
        )

    store = SqliteRecordStore(StorageSettings(enabled=True, path=str(path)))

    assert store.counts()["upstream_requests"] == 0
    with sqlite3.connect(path) as database:
        tables = {
            row[0]
            for row in database.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        assert "upstream_requests" in tables
        indexes = {
            row[0] for row in database.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index'"
            )
        }
        assert "idx_upstream_requests_created_at" in indexes
    store.close()


def test_sanitize_upstream_payload_redacts_secrets_and_content() -> None:
    class RuntimeValue:
        def __str__(self) -> str:
            raise AssertionError("str must not be called")

        def __repr__(self) -> str:
            raise AssertionError("repr must not be called")

    payload = {
        "model": "openai/vendor/model",
        "max_tokens": 512,
        "api_key": "top-secret",
        "extra_headers": {"Authorization": "Bearer secret", "X-Test": "ok"},
        "custom_credential": "secret",
        "accessToken": "secret",
        "tenant": "tenant-secret",
        "messages": [{"role": "user", "content": "private"}],
        "tools": [{"function": {"name": "lookup", "description": "private"}}],
        "functions": [{"name": "legacy_private"}],
        "runtime": RuntimeValue(),
        RuntimeValue(): "unknown-key",
        "prediction": {"type": "content", "content": "predicted private text"},
        "metadata": {"private_note": "private metadata"},
        "stop": ["private stop sequence"],
    }

    sanitized = sanitize_upstream_payload(
        payload, secret_fields={"tenant"}, capture_content=False
    )

    assert sanitized["model"] == "openai/vendor/model"
    assert sanitized["max_tokens"] == 512
    assert sanitized["api_key"] == "[REDACTED]"
    assert sanitized["extra_headers"] == "[REDACTED]"
    assert sanitized["custom_credential"] == "[REDACTED]"
    assert sanitized["accessToken"] == "[REDACTED]"
    assert sanitized["tenant"] == "[REDACTED]"
    assert sanitized["messages"] == {"omitted": True, "kind": "array", "count": 1}
    assert sanitized["tools"] == {"omitted": True, "kind": "array", "count": 1}
    assert sanitized["functions"] == {"omitted": True, "kind": "array", "count": 1}
    assert sanitized["runtime"] == "[RuntimeValue]"
    assert sanitized["[RuntimeValue]"] == "unknown-key"
    assert sanitized["prediction"] == {
        "omitted": True,
        "kind": "object",
        "count": 2,
    }
    assert sanitized["metadata"] == {
        "omitted": True,
        "kind": "object",
        "count": 1,
    }
    assert sanitized["stop"] == {"omitted": True, "kind": "array", "count": 1}


def test_sanitize_upstream_payload_marks_hostile_runtime_collections() -> None:
    class HostileMapping(Mapping[str, object]):
        def __getitem__(self, key: str) -> object:
            raise RuntimeError("mapping access must not escape")

        def __iter__(self):
            raise RuntimeError("mapping iteration must not escape")

        def __len__(self) -> int:
            raise RuntimeError("mapping length must not escape")

    class HostileSequence(Sequence[object]):
        def __getitem__(self, index):
            raise RuntimeError("sequence access must not escape")

        def __len__(self) -> int:
            raise RuntimeError("sequence length must not escape")

    sanitized = sanitize_upstream_payload(
        {
            "model": "openai/vendor/model",
            "mapping": HostileMapping(),
            "sequence": HostileSequence(),
            "messages": HostileSequence(),
        },
        capture_content=False,
    )

    assert sanitized == {
        "model": "openai/vendor/model",
        "mapping": "[HostileMapping]",
        "sequence": "[HostileSequence]",
        "messages": {"omitted": True, "kind": "HostileSequence"},
    }


def test_redact_secret_text_masks_credentials_but_keeps_token_counts() -> None:
    text = (
        "Authorization: Bearer sk-abc api_key=xyz token:abc password=foo "
        "max_tokens=12 total_tokens=14 ordinary wording"
    )
    redacted = redact_secret_text(text)
    assert "sk-abc" not in redacted
    assert "xyz" not in redacted
    assert "token:abc" not in redacted
    assert "password=foo" not in redacted
    assert "max_tokens=12" in redacted
    assert "total_tokens=14" in redacted
    assert "ordinary wording" in redacted


def test_session_evidence_includes_incomplete_and_joined_requests(tmp_path: Path) -> None:
    store = SqliteRecordStore(StorageSettings(
        enabled=True, path=str(tmp_path / "records.sqlite3")
    ))
    config_hash = store.register_config({}, "models.json")
    older = _request("req-older", prompt="older")
    newer = RequestRecord(**{
        **_request("req-newer", prompt="newer").__dict__,
        "received_at": 1003.0,
    })
    store.record_request(older)
    store.record_decision(_decision("req-older", config_hash))
    store.record_upstream_request(_upstream("req-older", {
        "model": "openai/model", "messages": [], "reasoning_effort": "low"
    }))
    store.record_outcome(OutcomeRecord("dec-req-older", "req-older", True))
    store.record_request(newer)

    latest = store.latest_session_evidence(("session-1",))
    rows = store.session_request_evidence("session-1")

    assert latest["session-1"]["latest_request"]["request_id"] == "req-newer"
    assert latest["session-1"]["latest_decision"]["route"] == "provider/model"
    assert [row["request"]["request_id"] for row in rows] == [
        "req-newer", "req-older"
    ]
    assert rows[0]["decision"] is None
    assert rows[0]["upstream_request"] is None
    assert rows[0]["outcome"] is None
    assert rows[1]["upstream_request"]["payload"]["reasoning_effort"] == "low"
    assert rows[1]["outcome"]["ok"] is True
    assert store.session_request_evidence("another-session") == []
    store.close()


def test_provider_summary_groups_submitted_attempts_and_window_boundaries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from jev_gateway import records

    recorded_at = [200.0]
    monkeypatch.setattr(records, "_now", lambda: recorded_at[0])
    store = SqliteRecordStore(StorageSettings(
        enabled=True, path=str(tmp_path / "records.sqlite3")
    ))
    attempts = (
        ("at-start", "provider", 100.0, True, 10.0),
        ("failed", "provider", 150.0, False, 30.0),
        ("incomplete", "provider", 175.0, None, None),
        ("other", "other", 160.0, True, None),
        ("at-end", "provider", 200.0, True, 999.0),
    )
    for request_id, provider, submitted_at, ok, latency in attempts:
        store.record_upstream_request(replace(
            _upstream(request_id, {"model": "openai/model"}),
            provider=provider, created_at=submitted_at,
        ))
        if ok is not None:
            recorded_at[0] += 1
            store.record_outcome(OutcomeRecord(
                f"dec-{request_id}", request_id, ok, latency_ms=latency,
            ))
            store.flush()

    summary = store.provider_summary(window_start=100, window_end=200)

    assert summary["provider"] == {
        "attempts": 3, "completed": 2, "succeeded": 1, "failed": 1,
        "incomplete_evidence": 1, "average_latency_ms": 20.0,
        "last_outcome_at": 202.0, "last_outcome_ok": False,
    }
    assert summary["other"] == {
        "attempts": 1, "completed": 1, "succeeded": 1, "failed": 0,
        "incomplete_evidence": 0, "average_latency_ms": None,
        "last_outcome_at": 203.0, "last_outcome_ok": True,
    }
    assert store.provider_summary(window_start=200, window_end=201)[
        "provider"
    ]["attempts"] == 1
    assert store.provider_summary(window_start=300, window_end=400) == {}
    store.close()


def test_session_evidence_uses_queue_order_when_timestamps_match(
    tmp_path: Path,
) -> None:
    store = SqliteRecordStore(StorageSettings(
        enabled=True, path=str(tmp_path / "records.sqlite3")
    ))
    store.record_request(_request("z-first", prompt="first"))
    store.record_request(_request("a-second", prompt="second"))

    latest = store.latest_session_evidence(("session-1",))
    rows = store.session_request_evidence("session-1")

    assert latest["session-1"]["latest_request"]["request_id"] == "a-second"
    assert [row["request"]["request_id"] for row in rows] == [
        "a-second",
        "z-first",
    ]
    store.close()


def test_session_evidence_replaces_invalid_stored_json_with_safe_values(
    tmp_path: Path,
) -> None:
    path = tmp_path / "records.sqlite3"
    store = SqliteRecordStore(StorageSettings(enabled=True, path=str(path)))
    config_hash = store.register_config({}, "models.json")
    store.record_request(_request("req-1"))
    store.record_decision(_decision("req-1", config_hash))
    store.record_upstream_request(_upstream("req-1", {"model": "openai/model"}))
    store.flush()

    with sqlite3.connect(path) as database:
        database.execute(
            "UPDATE requests SET messages_json = 'not-json' WHERE request_id = 'req-1'"
        )
        database.execute(
            "UPDATE decisions SET candidates_json = 'not-json', "
            "signals_json = 'not-json' WHERE request_id = 'req-1'"
        )
        database.execute(
            "UPDATE upstream_requests SET payload_json = 'not-json' "
            "WHERE request_id = 'req-1'"
        )

    rows = store.session_request_evidence("session-1")

    assert rows[0]["request"]["messages"] is None
    assert rows[0]["decision"]["candidates"] == []
    assert rows[0]["decision"]["signals"] == {}
    assert rows[0]["upstream_request"]["payload"] == {}
    store.close()


def test_content_opt_out_keeps_digest_and_evidence(tmp_path: Path) -> None:
    path = tmp_path / "records.sqlite3"
    store = SqliteRecordStore(
        StorageSettings(enabled=True, path=str(path), capture_content=False)
    )
    store.record_request(_request("req-1"))
    store.flush()
    with sqlite3.connect(path) as db:
        digest, prompt, messages, chars = db.execute(
            "SELECT prompt_digest, prompt, messages_json, prompt_chars FROM requests"
        ).fetchone()
        assert digest and prompt is None and messages is None and chars == 13
    store.close()


def test_storage_write_failure_is_not_silent(tmp_path: Path) -> None:
    store = SqliteRecordStore(
        StorageSettings(enabled=True, path=str(tmp_path / "records.sqlite3"))
    )
    store.close()
    with pytest.raises(RuntimeError, match="closed"):
        store.record_request(_request("req-1"))


def test_config_hash_is_stable_across_key_order() -> None:
    assert build_config_hash({"b": 2, "a": 1}) == build_config_hash({"a": 1, "b": 2})


def test_no_retention_limit_by_default(tmp_path: Path) -> None:
    path = tmp_path / "records.sqlite3"
    store = SqliteRecordStore(StorageSettings(enabled=True, path=str(path)))
    for index in range(260):
        store.record_request(_request(f"req-{index}"))
    assert store.counts()["requests"] == 260
    store.close()


def test_request_retention_prunes_joined_upstream_rows(
    tmp_path: Path, monkeypatch
) -> None:
    from jev_gateway import records

    monkeypatch.setattr(records, "PRUNE_INTERVAL", 1)
    store = SqliteRecordStore(StorageSettings(
        enabled=True,
        path=str(tmp_path / "records.sqlite3"),
        max_requests=1,
    ))
    config_hash = store.register_config({}, "models.json")
    store.record_request(_request("old"))
    store.record_decision(_decision("old", config_hash))
    store.record_upstream_request(_upstream("old", {"model": "openai/old"}))
    store.record_request(RequestRecord(**{
        **_request("new").__dict__,
        "received_at": 2000.0,
    }))

    counts = store.counts()

    assert counts["requests"] == 1
    assert counts["decisions"] == 0
    assert counts["upstream_requests"] == 0
    store.close()


def _continuation(
    session_id: str,
    message_key: str,
    provider_type: str = "openai",
    payload: dict[str, object] | None = None,
) -> AssistantContinuationRecord:
    return AssistantContinuationRecord(
        session_id=session_id,
        message_key=message_key,
        provider_type=provider_type,
        payload=payload or {},
        created_at=1000.0,
    )


def test_continuations_survive_reopen_in_insertion_order(tmp_path: Path) -> None:
    path = tmp_path / "records.sqlite3"
    settings = StorageSettings(enabled=True, path=str(path))
    store = SqliteRecordStore(settings)
    store.record_assistant_continuation(
        _continuation(
            "session-1",
            "same-key",
            "deepseek",
            {"reasoning_content": "first"},
        )
    )
    store.record_assistant_continuation(
        _continuation("session-1", "same-key", "openai", {"opaque": [1, 2]})
    )
    store.close()

    reopened = SqliteRecordStore(settings)
    loaded = reopened.load_assistant_continuations("session-1", limit=40)

    assert [(item.message_key, item.provider_type) for item in loaded] == [
        ("same-key", "deepseek"),
        ("same-key", "openai"),
    ]
    assert loaded[0].payload == {"reasoning_content": "first"}
    assert loaded[1].payload == {"opaque": [1, 2]}
    with sqlite3.connect(path) as db:
        columns = {
            row[1]
            for row in db.execute("PRAGMA table_info(assistant_continuations)")
        }
        assert "content" not in columns
        assert "messages_json" not in columns
    reopened.close()


def test_continuation_retention_bounds_turns_and_sessions(tmp_path: Path) -> None:
    path = tmp_path / "records.sqlite3"
    store = SqliteRecordStore(StorageSettings(
        enabled=True,
        path=str(path),
        max_continuations_per_session=2,
        max_continuation_sessions=2,
    ))
    for index in range(3):
        store.record_assistant_continuation(
            _continuation("session-1", f"one-{index}")
        )
    store.record_assistant_continuation(_continuation("session-2", "two"))
    store.record_assistant_continuation(_continuation("session-3", "three"))
    store.flush()

    assert store.load_assistant_continuations("session-1", limit=40) == []
    assert [item.message_key for item in store.load_assistant_continuations(
        "session-2", limit=40
    )] == ["two"]
    assert [item.message_key for item in store.load_assistant_continuations(
        "session-3", limit=40
    )] == ["three"]
    assert store.counts()["assistant_continuations"] == 2
    store.close()


def test_store_reopens_without_losing_evidence(tmp_path: Path) -> None:
    path = tmp_path / "records.sqlite3"
    settings = StorageSettings(enabled=True, path=str(path))
    store = SqliteRecordStore(settings)
    store.record_request(_request("req-1"))
    store.close()

    reopened = SqliteRecordStore(settings)
    assert reopened.counts()["requests"] == 1
    reopened.close()


def test_store_rejects_symlink_path(tmp_path: Path) -> None:
    target = tmp_path / "target.sqlite3"
    target.write_bytes(b"not a database")
    link = tmp_path / "records.sqlite3"
    link.symlink_to(target)
    with pytest.raises(ValueError, match="symlink"):
        SqliteRecordStore(StorageSettings(enabled=True, path=str(link)))
    assert target.read_bytes() == b"not a database"


def test_store_reopen_failure_preserves_old_connection(tmp_path: Path) -> None:
    settings = StorageSettings(enabled=True, path=str(tmp_path / "records.sqlite3"))
    store = SqliteRecordStore(settings)
    with pytest.raises(ValueError, match="restart"):
        store.reopen(StorageSettings(enabled=True, path=str(tmp_path / "missing" / "new.sqlite3")))
    store.record_request(_request("req-1"))
    assert store.counts()["requests"] == 1
    store.close()


def test_sqlite_runs_only_on_dedicated_writer_thread(tmp_path: Path, monkeypatch) -> None:
    import threading

    from jev_gateway import records

    thread_names: list[str] = []
    original = records.sqlite3.connect

    def traced_connect(*args, **kwargs):
        thread_names.append(threading.current_thread().name)
        return original(*args, **kwargs)

    monkeypatch.setattr(records.sqlite3, "connect", traced_connect)
    store = SqliteRecordStore(
        StorageSettings(enabled=True, path=str(tmp_path / "writer.sqlite3"))
    )
    store.record_request(_request("req-1"))
    store.flush()
    assert store.counts()["requests"] == 1
    assert thread_names == ["jev-record-writer"]
    store.close()


def test_full_queue_rejects_without_blocking_request_thread(tmp_path: Path) -> None:
    import threading

    from jev_gateway.records import StorageUnavailableError

    store = SqliteRecordStore(StorageSettings(
        enabled=True, path=str(tmp_path / "records.sqlite3"), queue_size=1
    ))
    entered = threading.Event()
    release = threading.Event()
    store._submit(lambda backend: (entered.set(), release.wait()))
    assert entered.wait(timeout=2)
    store.record_request(_request("req-1"))
    with pytest.raises(StorageUnavailableError, match="queue is full"):
        store.record_request(_request("req-2"))
    release.set()
    store._queue.join()
    assert store.counts()["requests"] == 1
    store.close()


def test_worker_failure_is_reported_to_later_submissions(tmp_path: Path) -> None:
    from jev_gateway.records import StorageUnavailableError

    store = SqliteRecordStore(StorageSettings(
        enabled=True, path=str(tmp_path / "records.sqlite3")
    ))
    store._submit(lambda backend: (_ for _ in ()).throw(RuntimeError("disk failed")))
    with pytest.raises(StorageUnavailableError, match="disk failed"):
        store.flush()
    assert "disk failed" in store.status()["error"]
    with pytest.raises(StorageUnavailableError, match="disk failed"):
        store.record_request(_request("req-1"))
    with pytest.raises(StorageUnavailableError, match="disk failed"):
        store.close()
