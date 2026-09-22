"""Tests for durable routing evidence storage."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from jev_gateway.records import (
    AssistantContinuationRecord,
    DecisionRecord,
    OutcomeRecord,
    RequestRecord,
    SqliteRecordStore,
    StorageSettings,
    build_config_hash,
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


def test_store_joins_request_decision_outcome_and_config(tmp_path: Path) -> None:
    path = tmp_path / "records.sqlite3"
    store = SqliteRecordStore(StorageSettings(enabled=True, path=str(path)))
    config_hash = store.register_config({"policy": {"mode": "fresh"}}, "models.json")
    store.record_request(_request("req-1"))
    store.record_decision(_decision("req-1", config_hash))
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
