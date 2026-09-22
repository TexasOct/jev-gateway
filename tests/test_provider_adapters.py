"""Tests for provider-specific conversation history adapters."""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any, cast

from litellm.llms.deepseek.chat.transformation import DeepSeekChatConfig
from litellm.types.llms.openai import AllMessageValues

from jev_gateway.provider import adapter_for
from jev_gateway.provider.base import save_assistant_continuation
from jev_gateway.records import (
    AssistantContinuationRecord,
    NullRecordStore,
    SqliteRecordStore,
    StorageSettings,
)
from jev_gateway.sessions import SessionState


def make_session() -> SessionState:
    return SessionState(
        session_id="session-1",
        route="deepseek/model",
        tier="simple",
        created_at=0,
        updated_at=0,
        switched_at=0,
    )


def test_deepseek_promotes_saved_provider_reasoning_without_mutating_input() -> None:
    messages = [
        {
            "role": "assistant",
            "content": "Done.",
            "provider_specific_fields": {"reasoning_content": "Saved trace."},
        }
    ]

    prepared = adapter_for("deepseek").prepare_messages(messages, make_session())

    assert prepared[0]["reasoning_content"] == "Saved trace."
    assert "reasoning_content" not in messages[0]


def test_non_deepseek_adapter_returns_messages_unchanged() -> None:
    messages = [{"role": "assistant", "content": "Done."}]

    assert adapter_for("openai").prepare_messages(messages, make_session()) is messages


def test_deepseek_marks_known_cross_provider_history_without_warning_gap() -> None:
    session = make_session()
    openai_capture = adapter_for("openai").capture_response(session)
    openai_capture.observe({
        "choices": [{
            "message": {"role": "assistant", "content": "OpenAI answer."}
        }]
    })
    openai_capture.finish()

    prepared = adapter_for("deepseek").prepare_messages(
        [{"role": "assistant", "content": "OpenAI answer."}], session
    )

    assert prepared[0]["reasoning_content"] == " "


def test_deepseek_leaves_unknown_missing_reasoning_visible_to_litellm() -> None:
    prepared = adapter_for("deepseek").prepare_messages(
        [{"role": "assistant", "content": "Unknown answer."}], make_session()
    )

    assert "reasoning_content" not in prepared[0]


def test_known_cross_provider_history_does_not_trigger_litellm_warning(
    caplog,
) -> None:
    session = make_session()
    capture = adapter_for("openai").capture_response(session)
    capture.observe({
        "choices": [{
            "message": {"role": "assistant", "content": "OpenAI answer."}
        }]
    })
    prepared = adapter_for("deepseek").prepare_messages(
        [{"role": "assistant", "content": "OpenAI answer."}], session
    )

    typed_messages = cast(list[AllMessageValues], cast(Any, prepared))
    with caplog.at_level(logging.WARNING, logger="LiteLLM"):
        transformed = DeepSeekChatConfig()._fill_reasoning_content(typed_messages)

    assert transformed[0].get("reasoning_content") == " "
    assert "missing `reasoning_content`" not in caplog.text


def test_openai_captures_streaming_assistant_origin() -> None:
    session = make_session()
    capture = adapter_for("openai").capture_response(session)
    capture.observe({"choices": [{"delta": {"content": "OpenAI "}}]})
    capture.observe({"choices": [{"delta": {"content": "answer."}}]})
    capture.finish()

    prepared = adapter_for("deepseek").prepare_messages(
        [{"role": "assistant", "content": "OpenAI answer."}], session
    )

    assert prepared[0]["reasoning_content"] == " "


def test_deepseek_captures_reasoning_from_streaming_deltas() -> None:
    session = make_session()
    adapter = adapter_for("deepseek")
    capture = adapter.capture_response(session)
    capture.observe({"choices": [{"delta": {"reasoning_content": "First "}}]})
    capture.observe({"choices": [{"delta": {"reasoning_content": "second"}}]})
    capture.observe({"choices": [{"delta": {"content": "Done."}}]})
    capture.finish()

    prepared = adapter.prepare_messages(
        [{"role": "assistant", "content": "Done."}], session
    )

    assert prepared[0]["reasoning_content"] == "First second"


def test_duplicate_deepseek_messages_restore_distinct_reasoning_in_order() -> None:
    session = make_session()
    adapter = adapter_for("deepseek")
    for reasoning in ("First trace.", "Second trace."):
        capture = adapter.capture_response(session)
        capture.observe({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "Same answer.",
                    "reasoning_content": reasoning,
                }
            }]
        })

    prepared = adapter.prepare_messages(
        [
            {"role": "assistant", "content": "Same answer."},
            {"role": "assistant", "content": "Same answer."},
        ],
        session,
    )

    assert [message["reasoning_content"] for message in prepared] == [
        "First trace.",
        "Second trace.",
    ]


def test_openai_duplicate_does_not_reuse_deepseek_reasoning() -> None:
    session = make_session()
    deepseek_capture = adapter_for("deepseek").capture_response(session)
    deepseek_capture.observe({
        "choices": [{
            "message": {
                "role": "assistant",
                "content": "Same answer.",
                "reasoning_content": "DeepSeek trace.",
            }
        }]
    })
    openai_capture = adapter_for("openai").capture_response(session)
    openai_capture.observe({
        "choices": [{
            "message": {"role": "assistant", "content": "Same answer."}
        }]
    })

    prepared = adapter_for("deepseek").prepare_messages(
        [
            {"role": "assistant", "content": "Same answer."},
            {"role": "assistant", "content": "Same answer."},
        ],
        session,
    )

    assert prepared[0]["reasoning_content"] == "DeepSeek trace."
    assert prepared[1]["reasoning_content"] == " "


def test_openai_captures_streaming_tool_call_origin() -> None:
    session = make_session()
    capture = adapter_for("openai").capture_response(session)
    capture.observe({"choices": [{"delta": {"tool_calls": [{
        "index": 0,
        "id": "call-1",
        "type": "function",
        "function": {"name": "ping", "arguments": "{"},
    }]}}]})
    capture.observe({"choices": [{"delta": {"tool_calls": [{
        "index": 0,
        "function": {"arguments": "}"},
    }]}}]})
    capture.finish()

    prepared = adapter_for("deepseek").prepare_messages(
        [{
            "role": "assistant",
            "content": "",
            "tool_calls": [{
                "id": "call-1",
                "type": "function",
                "function": {"name": "ping", "arguments": "{}"},
            }],
        }],
        session,
    )

    assert prepared[0]["reasoning_content"] == " "


def test_streaming_tool_call_origin_accepts_omitted_or_null_content() -> None:
    session = make_session()
    capture = adapter_for("openai").capture_response(session)
    capture.observe({"choices": [{"delta": {"tool_calls": [{
        "index": 0,
        "id": "call-1",
        "type": "function",
        "function": {"name": "ping", "arguments": "{}"},
    }]}}]})
    capture.finish()
    tool_calls = [{
        "id": "call-1",
        "type": "function",
        "function": {"name": "ping", "arguments": "{}"},
    }]

    omitted = adapter_for("deepseek").prepare_messages(
        [{"role": "assistant", "tool_calls": tool_calls}], session
    )
    null_content = adapter_for("deepseek").prepare_messages(
        [{"role": "assistant", "content": None, "tool_calls": tool_calls}], session
    )

    assert omitted[0]["reasoning_content"] == " "
    assert null_content[0]["reasoning_content"] == " "


def test_deepseek_captures_streaming_tool_call_reasoning() -> None:
    session = make_session()
    adapter = adapter_for("deepseek")
    capture = adapter.capture_response(session)
    capture.observe({"choices": [{"delta": {"reasoning_content": "Use ping."}}]})
    capture.observe({"choices": [{"delta": {"tool_calls": [{
        "index": 0,
        "id": "call-1",
        "type": "function",
        "function": {"name": "ping", "arguments": "{}"},
    }]}}]})
    capture.finish()

    prepared = adapter.prepare_messages(
        [{
            "role": "assistant",
            "content": "",
            "tool_calls": [{
                "id": "call-1",
                "type": "function",
                "function": {"name": "ping", "arguments": "{}"},
            }],
        }],
        session,
    )

    assert prepared[0]["reasoning_content"] == "Use ping."


def test_concurrent_saves_keep_both_in_memory() -> None:
    session = make_session()
    barrier = threading.Barrier(3)

    def save(content: str) -> None:
        barrier.wait()
        save_assistant_continuation(
            session,
            {"role": "assistant", "content": content},
            "openai",
            store=NullRecordStore(),
        )

    threads = [
        threading.Thread(target=save, args=(content,))
        for content in ("First.", "Second.")
    ]
    for thread in threads:
        thread.start()
    barrier.wait()
    for thread in threads:
        thread.join(timeout=2)

    saved = session.adapter_state["assistant_continuations"]
    assert len(saved) == 2
    assert {item["provider_type"] for item in saved} == {"openai"}


def test_save_during_hydration_merges_and_persists_pending_record() -> None:
    class BlockingStore(NullRecordStore):
        enabled = True
        continuation_limit = 40

        def __init__(self) -> None:
            self.entered = threading.Event()
            self.release = threading.Event()
            self.written: list[AssistantContinuationRecord] = []

        def load_assistant_continuations(
            self, session_id: str, *, limit: int
        ) -> list[AssistantContinuationRecord]:
            self.entered.set()
            assert self.release.wait(timeout=2)
            return [AssistantContinuationRecord(
                session_id=session_id,
                message_key="old-key",
                provider_type="deepseek",
                payload={"reasoning_content": "old"},
                created_at=1,
            )]

        def record_assistant_continuation(
            self, record: AssistantContinuationRecord
        ) -> None:
            self.written.append(record)

    store = BlockingStore()
    session = make_session()
    loader = threading.Thread(
        target=lambda: adapter_for("deepseek").prepare_messages([], session, store)
    )
    loader.start()
    assert store.entered.wait(timeout=2)

    save_assistant_continuation(
        session,
        {"role": "assistant", "content": "New answer."},
        "openai",
        store=store,
    )
    store.release.set()
    loader.join(timeout=2)

    saved = session.adapter_state["assistant_continuations"]
    assert [item["provider_type"] for item in saved] == ["deepseek", "openai"]
    assert [item.provider_type for item in store.written] == ["openai"]


def test_deepseek_reasoning_survives_store_restart(tmp_path: Path) -> None:
    settings = StorageSettings(
        enabled=True, path=str(tmp_path / "continuations.sqlite3")
    )
    first_store = SqliteRecordStore(settings)
    first_session = make_session()
    capture = adapter_for("deepseek").capture_response(first_session, first_store)
    capture.observe({
        "choices": [{
            "message": {
                "role": "assistant",
                "content": "Same answer.",
                "reasoning_content": "Durable trace.",
            }
        }]
    })
    first_store.close()

    second_store = SqliteRecordStore(settings)
    prepared = adapter_for("deepseek").prepare_messages(
        [{"role": "assistant", "content": "Same answer."}],
        make_session(),
        second_store,
    )

    assert prepared[0]["reasoning_content"] == "Durable trace."
    second_store.close()


def test_cross_provider_origin_survives_store_restart(tmp_path: Path) -> None:
    settings = StorageSettings(
        enabled=True, path=str(tmp_path / "continuations.sqlite3")
    )
    first_store = SqliteRecordStore(settings)
    capture = adapter_for("openai").capture_response(make_session(), first_store)
    capture.observe({
        "choices": [{
            "message": {"role": "assistant", "content": "OpenAI answer."}
        }]
    })
    first_store.close()

    second_store = SqliteRecordStore(settings)
    prepared = adapter_for("deepseek").prepare_messages(
        [{"role": "assistant", "content": "OpenAI answer."}],
        make_session(),
        second_store,
    )

    assert prepared[0]["reasoning_content"] == " "
    second_store.close()


def test_deepseek_bounds_cached_continuation_history() -> None:
    session = make_session()
    adapter = adapter_for("deepseek")
    for index in range(41):
        capture = adapter.capture_response(session)
        capture.observe({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": f"Message {index}",
                    "reasoning_content": f"Trace {index}",
                }
            }]
        })
        capture.finish()

    assert len(session.adapter_state["assistant_continuations"]) == 40
