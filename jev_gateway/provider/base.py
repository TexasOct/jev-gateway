"""Provider-agnostic conversation adapter interfaces."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from collections.abc import Mapping
from copy import deepcopy
from typing import Any

from jev_gateway.sessions import SessionState

__all__ = [
    "ConversationAdapter",
    "ResponseCapture",
    "assistant_continuations",
    "assistant_message_key",
    "save_assistant_continuation",
]

_CONTINUATION_STATE_KEY = "assistant_continuations"
_HISTORY_LIMIT = 40


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


def _saved_continuations(session: SessionState | None) -> list[dict[str, str]]:
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


def save_assistant_continuation(
    session: SessionState | None,
    message: Mapping[str, Any],
    provider_type: str,
    *,
    reasoning_content: str | None = None,
) -> None:
    """Append one provider response to the session's bounded continuation log."""
    if session is None or not provider_type:
        return
    key = assistant_message_key(message)
    if key is None:
        return
    record = {"key": key, "provider_type": provider_type}
    if reasoning_content:
        record["reasoning_content"] = reasoning_content
    saved = _saved_continuations(session)
    saved.append(record)
    session.adapter_state[_CONTINUATION_STATE_KEY] = saved[-_HISTORY_LIMIT:]


def assistant_continuations(
    session: SessionState | None,
    messages: list[dict[str, Any]],
) -> dict[int, dict[str, str]]:
    """Match replayed messages to recent provider responses in occurrence order."""
    cached_by_key: dict[str, list[dict[str, str]]] = defaultdict(list)
    for record in _saved_continuations(session):
        cached_by_key[record["key"]].append(record)

    incoming_by_key: dict[str, list[int]] = defaultdict(list)
    for index, message in enumerate(messages):
        key = assistant_message_key(message)
        if key is not None:
            incoming_by_key[key].append(index)

    matched: dict[int, dict[str, str]] = {}
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
        self, provider_type: str = "", session: SessionState | None = None
    ) -> None:
        self.provider_type = provider_type
        self.session = session
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

    def _save(self, message: Mapping[str, Any]) -> None:
        save_assistant_continuation(self.session, message, self.provider_type)

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
    ) -> list[dict[str, Any]]:
        """Return messages in the provider's required history format."""
        del session
        return messages

    def capture_response(self, session: SessionState | None) -> ResponseCapture:
        """Create a capture for a response sent by this provider."""
        return ResponseCapture(self.provider_type, session)
