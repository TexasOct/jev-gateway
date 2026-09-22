"""Provider-specific conversation history adapters."""

from __future__ import annotations

from collections.abc import Mapping

from .base import ConversationAdapter, ResponseCapture
from .deepseek import DeepSeekConversationAdapter

__all__ = ["ConversationAdapter", "ResponseCapture", "adapter_for"]

_ADAPTERS: Mapping[str, ConversationAdapter] = {
    "deepseek": DeepSeekConversationAdapter(),
}


def adapter_for(provider_type: str) -> ConversationAdapter:
    """Return the adapter registered for a LiteLLM provider type."""
    return _ADAPTERS.get(provider_type, ConversationAdapter(provider_type))
