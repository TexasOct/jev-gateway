"""Provider-agnostic conversation adapter interfaces."""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from collections import defaultdict
from collections.abc import Mapping
from copy import deepcopy
from typing import Any

from jev_gateway.records import (
    AssistantContinuationRecord,
    RecordStore,
)
from jev_gateway.sessions import SessionState

logger = logging.getLogger(__name__)

__all__ = [
    "ConversationAdapter",
    "ResponseCapture",
    "assistant_continuations",
    "assistant_message_key",
    "save_assistant_continuation",
]

_CONTINUATION_STATE_KEY = "assistant_continuations"
_CONTINUATION_HYDRATED_KEY = "assistant_continuations_hydrated"
_CONTINUATION_LOADING_KEY = "assistant_continuations_loading"
_CONTINUATION_PENDING_KEY = "assistant_continuations_pending"
_HISTORY_LIMIT = 40
_SESSION_LOCKS = tuple(threading.Condition() for _ in range(64))


def _history_limit(store: RecordStore | None) -> int:
    value = getattr(store, "continuation_limit", _HISTORY_LIMIT)
    return value if isinstance(value, int) and value > 0 else _HISTORY_LIMIT


def _session_condition(session: SessionState) -> threading.Condition:
    digest = hashlib.sha256(session.session_id.encode()).digest()
    return _SESSION_LOCKS[int.from_bytes(digest[:2], "big") % len(_SESSION_LOCKS)]


def assistant_message_key(message: Mapping[str, Any]) -> str | None:
    """Return a stable key for the replayable part of an assistant message."""
    if message.get("role") != "assistant":
        return None
    public_message = {
        key: message[key]
        for key in ("role", "content", "tool_calls", "function_call")
        if key in message and message[key] is not None
    }
    # OpenAI-compatible clients replay a tool-only assistant turn with content
    # omitted, null, or an empty string. These forms describe the same message.
    if public_message.get("tool_calls") and not public_message.get("content"):
        public_message.pop("content", None)
    if not public_message.get("content") and not public_message.get("tool_calls"):
        return None
    encoded = json.dumps(
        public_message,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(encoded.encode()).hexdigest()


def _saved_continuations(session: SessionState | None) -> list[dict[str, Any]]:
    if session is None:
        return []
    raw = session.adapter_state.get(_CONTINUATION_STATE_KEY)
    if not isinstance(raw, list):
        return []
    return [
        dict(item)
        for item in raw
        if isinstance(item, dict)
        and isinstance(item.get("key"), str)
        and isinstance(item.get("provider_type"), str)
    ]


def _hydrate_assistant_continuations(
    session: SessionState | None,
    store: RecordStore | None,
) -> None:
    """Load durable provider state once, preserving saves made during the read."""
    if session is None:
        return
    condition = _session_condition(session)
    with condition:
        while session.adapter_state.get(_CONTINUATION_LOADING_KEY):
            condition.wait()
        if session.adapter_state.get(_CONTINUATION_HYDRATED_KEY):
            return
        if store is None or not store.enabled:
            session.adapter_state[_CONTINUATION_HYDRATED_KEY] = True
            return
        session.adapter_state[_CONTINUATION_LOADING_KEY] = True
        session.adapter_state[_CONTINUATION_PENDING_KEY] = []
    try:
        records = store.load_assistant_continuations(
            session.session_id, limit=_history_limit(store)
        )
    except Exception as error:
        records = []
        logger.warning(
            "provider continuation load failed session_id=%s error=%s",
            session.session_id,
            error,
        )
    durable = [
        {
            "key": record.message_key,
            "provider_type": record.provider_type,
            "payload": dict(record.payload),
        }
        for record in records
    ]
    with condition:
        raw_pending = session.adapter_state.pop(_CONTINUATION_PENDING_KEY, [])
        pending = raw_pending if isinstance(raw_pending, list) else []
        durable.extend(
            dict(memory_record)
            for memory_record, _ in pending
            if isinstance(memory_record, dict)
        )
        session.adapter_state[_CONTINUATION_STATE_KEY] = durable[-_history_limit(store):]
        for _, durable_record in pending:
            if isinstance(durable_record, AssistantContinuationRecord):
                _persist_assistant_continuation(store, durable_record)
        session.adapter_state[_CONTINUATION_HYDRATED_KEY] = True
        session.adapter_state[_CONTINUATION_LOADING_KEY] = False
        condition.notify_all()


def _persist_assistant_continuation(
    store: RecordStore | None,
    record: AssistantContinuationRecord,
) -> None:
    if store is None or not store.enabled:
        return
    try:
        store.record_assistant_continuation(record)
    except Exception as error:
        logger.warning(
            "provider continuation write failed session_id=%s provider=%s error=%s",
            record.session_id,
            record.provider_type,
            error,
        )


def save_assistant_continuation(
    session: SessionState | None,
    message: Mapping[str, Any],
    provider_type: str,
    *,
    payload: Mapping[str, Any] | None = None,
    store: RecordStore | None = None,
) -> None:
    """Append provider-owned continuation data to memory and durable storage."""
    if session is None or not provider_type:
        return
    key = assistant_message_key(message)
    if key is None:
        return
    private_payload = dict(payload or {})
    memory_record: dict[str, Any] = {
        "key": key,
        "provider_type": provider_type,
        "payload": private_payload,
    }
    durable_record = AssistantContinuationRecord(
        session_id=session.session_id,
        message_key=key,
        provider_type=provider_type,
        payload=private_payload,
        created_at=time.time(),
    )
    with _session_condition(session):
        pending = session.adapter_state.get(_CONTINUATION_PENDING_KEY)
        if session.adapter_state.get(_CONTINUATION_LOADING_KEY) and isinstance(
            pending, list
        ):
            pending.append((memory_record, durable_record))
        else:
            saved = _saved_continuations(session)
            saved.append(memory_record)
            session.adapter_state[_CONTINUATION_STATE_KEY] = saved[-_history_limit(store):]
            _persist_assistant_continuation(store, durable_record)


def assistant_continuations(
    session: SessionState | None,
    messages: list[dict[str, Any]],
    store: RecordStore | None = None,
) -> dict[int, dict[str, Any]]:
    """Match replayed messages to recent provider responses in occurrence order."""
    _hydrate_assistant_continuations(session, store)
    cached_by_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
    if session is None:
        saved: list[dict[str, Any]] = []
    else:
        with _session_condition(session):
            saved = _saved_continuations(session)
    for record in saved:
        cached_by_key[record["key"]].append(record)

    incoming_by_key: dict[str, list[int]] = defaultdict(list)
    for index, message in enumerate(messages):
        key = assistant_message_key(message)
        if key is not None:
            incoming_by_key[key].append(index)

    matched: dict[int, dict[str, Any]] = {}
    for key, indexes in incoming_by_key.items():
        cached = cached_by_key.get(key, [])
        # A client may truncate old context. Pair the supplied occurrences with
        # the newest matching responses rather than reusing an older duplicate.
        selected = cached[-len(indexes):]
        if not selected:
            continue
        target_indexes = indexes[-len(selected):]
        matched.update(zip(target_indexes, selected, strict=True))
    return matched


def _append_fragment(target: dict[str, Any], source: Mapping[str, Any], key: str) -> None:
    value = source.get(key)
    if not isinstance(value, str):
        return
    current = target.get(key)
    target[key] = f"{current}{value}" if isinstance(current, str) else value


class ResponseCapture:
    """Capture enough of a provider response to identify replayed history."""

    def __init__(
        self,
        provider_type: str = "",
        session: SessionState | None = None,
        store: RecordStore | None = None,
    ) -> None:
        self.provider_type = provider_type
        self.session = session
        self.store = store
        _hydrate_assistant_continuations(session, store)
        self.content: list[str] = []
        self.tool_calls: dict[int, dict[str, Any]] = {}
        self.function_call: dict[str, Any] = {}
        self.complete = False

    def observe(self, response: Mapping[str, Any]) -> None:
        """Observe a complete response or one streaming response chunk."""
        message, delta = self._message_parts(response)
        if message is not None:
            self._save(message)
            self.complete = True
            return
        if delta is None:
            return
        content = delta.get("content")
        if isinstance(content, str):
            self.content.append(content)
        self._observe_tool_calls(delta.get("tool_calls"))
        function_call = delta.get("function_call")
        if isinstance(function_call, Mapping):
            _append_fragment(self.function_call, function_call, "name")
            _append_fragment(self.function_call, function_call, "arguments")

    def finish(self) -> None:
        """Persist an accumulated streaming assistant response."""
        if self.complete:
            return
        message = self._stream_message()
        if assistant_message_key(message) is not None:
            self._save(message)

    def continuation_payload(self, message: Mapping[str, Any]) -> dict[str, Any]:
        """Return opaque provider data needed to replay one assistant turn."""
        del message
        return {}

    def _save(self, message: Mapping[str, Any]) -> None:
        save_assistant_continuation(
            self.session,
            message,
            self.provider_type,
            payload=self.continuation_payload(message),
            store=self.store,
        )

    @staticmethod
    def _message_parts(
        response: Mapping[str, Any],
    ) -> tuple[Mapping[str, Any] | None, Mapping[str, Any] | None]:
        choices = response.get("choices")
        if not isinstance(choices, list) or not choices:
            return None, None
        first = choices[0]
        if not isinstance(first, Mapping):
            return None, None
        message = first.get("message")
        delta = first.get("delta")
        return (
            message if isinstance(message, Mapping) else None,
            delta if isinstance(delta, Mapping) else None,
        )

    def _observe_tool_calls(self, raw: Any) -> None:
        if not isinstance(raw, list):
            return
        for position, fragment in enumerate(raw):
            if not isinstance(fragment, Mapping):
                continue
            raw_index = fragment.get("index", position)
            index = raw_index if isinstance(raw_index, int) else position
            target = self.tool_calls.setdefault(index, {})
            for key in ("id", "type"):
                value = fragment.get(key)
                if isinstance(value, str):
                    target[key] = value
            function = fragment.get("function")
            if isinstance(function, Mapping):
                target_function = target.setdefault("function", {})
                _append_fragment(target_function, function, "name")
                _append_fragment(target_function, function, "arguments")

    def _stream_message(self) -> dict[str, Any]:
        message: dict[str, Any] = {
            "role": "assistant",
            "content": "".join(self.content),
        }
        if self.tool_calls:
            message["tool_calls"] = [
                deepcopy(self.tool_calls[index]) for index in sorted(self.tool_calls)
            ]
        if self.function_call:
            message["function_call"] = dict(self.function_call)
        return message


class ConversationAdapter:
    """Adapt history for one provider without leaking details to routing."""

    def __init__(self, provider_type: str = "") -> None:
        self.provider_type = provider_type

    def prepare_messages(
        self,
        messages: list[dict[str, Any]],
        session: SessionState | None,
        store: RecordStore | None = None,
    ) -> list[dict[str, Any]]:
        """Return messages in the provider's required history format."""
        _hydrate_assistant_continuations(session, store)
        return messages

    def capture_response(
        self,
        session: SessionState | None,
        store: RecordStore | None = None,
    ) -> ResponseCapture:
        """Create a capture for a response sent by this provider."""
        return ResponseCapture(self.provider_type, session, store)
