"""Structural facts extracted from an OpenAI-compatible request."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

__all__ = ["RequestFacts", "content_text", "count_user_turns", "estimate_tokens", "extract_request_facts", "latest_user_text"]

_CJK = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]")
_IMAGES = {"image_url", "input_image", "image"}


def content_text(content: Any) -> str:
    """Flatten message content without interpreting its meaning."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
        return "\n".join(parts)
    return "" if content is None else json.dumps(content, ensure_ascii=False, sort_keys=True)


def latest_user_text(messages: list[dict[str, Any]]) -> str | None:
    """Return the latest non-empty user message."""
    for message in reversed(messages):
        if message.get("role") == "user":
            text = content_text(message.get("content")).strip()
            if text:
                return text
    return None


def count_user_turns(messages: list[dict[str, Any]]) -> int:
    return sum(message.get("role") == "user" for message in messages)


def estimate_tokens(text: str) -> int:
    """Estimate token count from text length and CJK character count."""
    cjk = len(_CJK.findall(text))
    other = len(text) - cjk
    return cjk + (round(other / 4) if other else 0)


@dataclass(frozen=True)
class RequestFacts:
    prompt: str
    prompt_chars: int
    prompt_tokens: int
    conversation_tokens: int
    requested_max_tokens: int | None
    turn_index: int
    needs_tools: bool
    needs_vision: bool
    needs_json: bool
    route_label: str | None = None


def extract_request_facts(
    messages: list[dict[str, Any]], *, max_tokens: int | None = None,
    tools: list[Any] | None = None, response_format: dict[str, Any] | None = None,
) -> RequestFacts:
    """Extract only request shape needed for prompts and hard model constraints."""
    texts = [content_text(message.get("content")) for message in messages]
    conversation = "\n".join(text for text in texts if text)
    prompt = latest_user_text(messages) or conversation
    needs_vision = any(
        isinstance(part, dict) and part.get("type") in _IMAGES
        for message in messages if isinstance(message.get("content"), list)
        for part in message["content"]
    )
    return RequestFacts(
        prompt=prompt, prompt_chars=len(prompt), prompt_tokens=estimate_tokens(prompt),
        conversation_tokens=estimate_tokens(conversation), requested_max_tokens=max_tokens,
        turn_index=count_user_turns(messages), needs_tools=bool(tools), needs_vision=needs_vision,
        needs_json=bool(isinstance(response_format, dict) and response_format.get("type") in {"json_object", "json_schema"}),
    )
