"""DeepSeek thinking-mode conversation history adapter."""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from typing import Any

from jev_gateway.sessions import SessionState

from .base import (
    ConversationAdapter,
    ResponseCapture,
    assistant_continuations,
    save_assistant_continuation,
)

_REASONING_CONTENT = "reasoning_content"
_PROVIDER_FIELDS = "provider_specific_fields"
_CROSS_PROVIDER_PLACEHOLDER = " "


def _reasoning_content(message: Mapping[str, Any]) -> str | None:
    direct = message.get(_REASONING_CONTENT)
    if isinstance(direct, str) and direct:
        return direct
    provider_fields = message.get(_PROVIDER_FIELDS)
    if isinstance(provider_fields, Mapping):
        saved = provider_fields.get(_REASONING_CONTENT)
        if isinstance(saved, str) and saved:
            return saved
    return None


class DeepSeekConversationAdapter(ConversationAdapter):
    """Preserve DeepSeek traces and bridge known cross-provider history."""

    def __init__(self) -> None:
        super().__init__("deepseek")

    def prepare_messages(
        self,
        messages: list[dict[str, Any]],
        session: SessionState | None,
    ) -> list[dict[str, Any]]:
        prepared = deepcopy(messages)
        matched = assistant_continuations(session, prepared)
        for index, message in enumerate(prepared):
            if message.get("role") != "assistant":
                continue
            reasoning = _reasoning_content(message)
            if reasoning is not None:
                message[_REASONING_CONTENT] = reasoning
                continue
            continuation = matched.get(index)
            if continuation is None:
                continue
            origin = continuation["provider_type"]
            cached = continuation.get(_REASONING_CONTENT)
            if origin == self.provider_type and cached:
                message[_REASONING_CONTENT] = cached
            elif origin != self.provider_type:
                # This message never had a DeepSeek trace. Mark that known boundary
                # explicitly so LiteLLM does not report it as lost continuation data.
                message[_REASONING_CONTENT] = _CROSS_PROVIDER_PLACEHOLDER
        return prepared

    def capture_response(self, session: SessionState | None) -> ResponseCapture:
        return _DeepSeekResponseCapture(self, session)


class _DeepSeekResponseCapture(ResponseCapture):
    def __init__(
        self,
        adapter: DeepSeekConversationAdapter,
        session: SessionState | None,
    ) -> None:
        super().__init__(adapter.provider_type, session)
        self.reasoning: list[str] = []

    def observe(self, response: Mapping[str, Any]) -> None:
        message, delta = self._message_parts(response)
        super().observe(response)
        if message is not None:
            return
        if delta is None:
            return
        reasoning = _reasoning_content(delta)
        if reasoning is not None:
            self.reasoning.append(reasoning)

    def _save(self, message: Mapping[str, Any]) -> None:
        save_assistant_continuation(
            self.session,
            message,
            self.provider_type,
            reasoning_content=_reasoning_content(message),
        )

    def finish(self) -> None:
        if self.complete:
            return
        message = self._stream_message()
        reasoning = "".join(self.reasoning)
        if reasoning:
            message[_REASONING_CONTENT] = reasoning
        self._save(message)
