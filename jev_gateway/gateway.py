"""OpenAI-compatible HTTP gateway that routes each turn of a conversation."""

from __future__ import annotations

import hmac
import json
import logging
import os
import threading
import time
import warnings
from collections.abc import Iterator
from dataclasses import dataclass, replace
from json import JSONDecodeError
from pathlib import Path
from typing import Any, cast

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.exceptions import HTTPException as StarletteHTTPException

from jev_gateway.catalog import GatewaySettings, ModelProfile, load_catalog
from jev_gateway.config import coerce_int
from jev_gateway.decision import (
    Decision,
    RoutingEngine,
    UnknownModelError,
    UnknownStrategyError,
)
from jev_gateway.provider import adapter_for
from jev_gateway.reasoning import leaves_payload_alone
from jev_gateway.records import (
    RecordStore,
    RequestMeta,
    RequestRecord,
    StorageUnavailableError,
    record_store_from_settings,
)
from jev_gateway.sessions import (
    SESSION_HEADER,
    MemorySessionStore,
    SessionState,
    derive_session_id,
)
from jev_gateway.signals import content_text, estimate_tokens, latest_user_text

logger = logging.getLogger(__name__)

# A router has no creation time of its own, and OpenAI requires the field on
# every model entry, so report when this process started.
MODEL_CREATED_AT = coerce_int(time.time())

STRATEGY_HEADER = "X-JEV-Strategy"
_USAGE_SERIALIZER_WARNING = (
    r"^Pydantic serializer warnings:\s+"
    r"PydanticSerializationUnexpectedValue\(Expected `ResponseAPIUsage`"
)

__all__ = [
    "ChatCompletionRequest",
    "GatewayConfig",
    "create_app",
    "decision_headers",
    "load_gateway_config",
    "run_gateway",
]


class ChatCompletionRequest(BaseModel):
    """OpenAI chat completion request with extra LiteLLM parameters preserved."""

    model_config = ConfigDict(extra="allow")

    model: str

    @field_validator("model")
    @classmethod
    def nonempty_model(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("model must be a non-empty string")
        return value
    messages: list[dict[str, Any]] = Field(min_length=1)
    stream: bool = False
    user: str | None = None
    max_tokens: int | None = None
    max_completion_tokens: int | None = None
    tools: list[Any] | None = None
    response_format: dict[str, Any] | None = None


class PreviewRequest(ChatCompletionRequest):
    """Read-only request to compare one or more routing strategies."""

    strategy: list[str] | None = None


@dataclass
class GatewayConfig:
    """Resolved routing engine and client-facing settings for one gateway process."""

    engine: RoutingEngine
    gateway_api_key: str | None
    session_strategy: str
    echo_requested_model: bool = True
    models_file: Path = Path("models.json")

    def apply_settings(self, settings: GatewaySettings) -> None:
        """Apply reloadable catalog settings without changing the bound socket."""
        self.gateway_api_key = settings.api_key
        self.session_strategy = settings.session_strategy
        self.echo_requested_model = settings.echo_requested_model
        self.engine.store.configure(
            ttl_seconds=settings.session_ttl_seconds,
            max_sessions=settings.max_sessions,
        )
        self.engine.set_decision_log_size(settings.decision_log_size)


def runtime_directory() -> Path:
    """Return the explicit runtime directory, or the current directory."""
    configured = os.getenv("JEV_GATEWAY_HOME")
    return Path(configured).expanduser() if configured else Path.cwd()


def _resolve_storage_path(catalog: Any, models_file: Path):
    storage_path = Path(catalog.storage.path)
    if not catalog.storage.enabled or storage_path.is_absolute():
        return catalog
    return replace(
        catalog,
        storage=replace(
            catalog.storage,
            path=str((models_file.parent / storage_path).resolve()),
        ),
    )


def load_gateway_config(models_file: Path | None = None) -> GatewayConfig:
    """Build the gateway configuration from the selected catalog file."""
    path = models_file or runtime_directory() / "models.json"
    path = path.expanduser().resolve()
    load_dotenv(path.parent / ".env", override=True)
    catalog = _resolve_storage_path(load_catalog(path), path)
    settings: GatewaySettings = catalog.gateway
    return GatewayConfig(
        engine=RoutingEngine(
            catalog,
            MemorySessionStore(
                ttl_seconds=settings.session_ttl_seconds,
                max_sessions=settings.max_sessions,
            ),
            decision_log_size=settings.decision_log_size,
            record_store=record_store_from_settings(catalog.storage),
            config_source=str(path),
        ),
        gateway_api_key=settings.api_key,
        session_strategy=settings.session_strategy,
        echo_requested_model=settings.echo_requested_model,
        models_file=path,
    )


def message_text(messages: list[dict[str, Any]]) -> str:
    """Return the latest user message, or reject the request."""
    prompt = latest_user_text(messages)
    if prompt is None:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "message": "messages must include a non-empty user message.",
                    "type": "invalid_request_error",
                    "code": "missing_user_message",
                }
            },
        )
    return prompt


def completion_payload(
    request: ChatCompletionRequest,
    profile: ModelProfile,
    decision: Decision,
    session: SessionState | None = None,
    continuation_store: RecordStore | None = None,
) -> dict[str, Any]:
    """Build LiteLLM completion arguments from the selected catalog profile.

    The catalog resolves the provider type, optional transport arguments and
    credentials. Model capabilities and routing policy control the remaining
    request adjustments.
    """
    payload = request.model_dump(exclude_none=True)
    payload.pop("model", None)
    payload.pop("stream", None)
    payload["messages"] = adapter_for(profile.provider_type).prepare_messages(
        payload["messages"], session, continuation_store
    )
    if not profile.capabilities.temperature:
        payload.pop("temperature", None)
    apply_reasoning_effort(payload, decision)
    transport = dict(profile.provider_params)
    if profile.api_base is not None:
        transport["api_base"] = profile.api_base
    if profile.api_key is not None:
        transport["api_key"] = profile.api_key
    return {
        **payload,
        **transport,
        "model": f"{profile.provider_type}/{profile.model}",
        "stream": request.stream,
    }


def apply_reasoning_effort(payload: dict[str, Any], decision: Decision) -> None:
    """Write the decided thinking level into the outgoing request.

    A source that leaves the payload alone means the gateway formed no opinion: the
    operator turned the feature off, or the selected route never declared which
    levels it accepts. Both keep whatever the client sent, byte for byte, which is
    what makes an opted-out deployment behave exactly as it did before.
    """
    if leaves_payload_alone(decision.reasoning_effort_source):
        return
    if decision.reasoning_effort is None:
        # Dropped, not forwarded: an unrepresentable value is a guaranteed upstream
        # 502, and a level nobody can name is not a level.
        payload.pop("reasoning_effort", None)
        return
    payload["reasoning_effort"] = decision.reasoning_effort


def decision_headers(decision: Decision) -> dict[str, str]:
    """Expose routing evidence without exposing upstream credentials."""
    headers = {
        "X-JEV-Route": decision.route_name,
        "X-JEV-Provider": decision.provider,
        "X-JEV-Model": decision.model,
        "X-JEV-Route-Label": decision.label,
        "X-JEV-Task-Type": decision.tier,
        "X-JEV-Mode": decision.mode,
        "X-JEV-Reason": decision.reason,
        "X-JEV-Strategy": decision.strategy,
        "X-JEV-Decision-Id": decision.decision_id,
    }
    if decision.request_id:
        headers["X-JEV-Request-Id"] = decision.request_id
    if decision.session_id:
        headers["X-JEV-Session-Id"] = decision.session_id
    if decision.switched_from:
        headers["X-JEV-Switch"] = f"{decision.switched_from}->{decision.route_name}"
    if decision.blocked_by:
        headers["X-JEV-Blocked-By"] = decision.blocked_by
    if decision.reasoning_effort:
        headers["X-JEV-Reasoning-Effort"] = decision.reasoning_effort
    if not leaves_payload_alone(decision.reasoning_effort_source):
        headers["X-JEV-Reasoning-Source"] = decision.reasoning_effort_source
    return headers


def resolve_strategy_name(
    engine: RoutingEngine,
    *,
    requested_model: str,
    session: SessionState | None,
) -> tuple[str, bool, str | None]:
    """Resolve a strategy from the OpenAI ``model`` field or session state."""
    clean_model = requested_model.strip()
    if engine.strategies.has(clean_model):
        return clean_model, True, None

    pinned = session.strategy if session is not None else None
    if pinned and engine.strategies.has(pinned):
        return pinned, False, clean_model
    return engine.strategies.default_name, False, clean_model


def unknown_strategy_error(engine: RoutingEngine, name: str) -> HTTPException:
    """Report an explicitly requested strategy that is not registered."""
    return HTTPException(
        status_code=400,
        detail={
            "error": {
                "message": (
                    f"The routing strategy {name!r} does not exist. Available "
                    "strategies: " + ", ".join(engine.strategies.names())
                ),
                "type": "invalid_request_error",
                "param": "strategy",
                "code": "unknown_strategy",
            }
        },
    )


def response_data(response: Any) -> dict[str, Any]:
    """Convert LiteLLM's dict or model response into a JSON response body."""
    if isinstance(response, dict):
        return dict(response)
    if hasattr(response, "model_dump"):
        # LiteLLM may populate a typed usage model with a plain mapping. Serialize
        # the value by its runtime shape instead of warning about LiteLLM's
        # internal annotation mismatch.
        return response.model_dump(exclude_none=True, serialize_as_any=True)
    if hasattr(response, "dict"):
        return response.dict(exclude_none=True)
    return jsonable_encoder(response)


def finish_reason(body: dict[str, Any]) -> str | None:
    """Read the finish reason from a non-streaming response body."""
    choices = body.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not isinstance(first, dict):
        return None
    reason = first.get("finish_reason")
    return reason if isinstance(reason, str) else None


def _next_stream_chunk(response: Iterator[Any]) -> Any:
    """Read one LiteLLM chunk without its known usage annotation warning."""
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=_USAGE_SERIALIZER_WARNING,
            category=UserWarning,
        )
        return next(response)


def sse_chunks(
    response: Iterator[Any],
    model_override: str | None = None,
    observe_chunk: Any | None = None,
) -> Iterator[str]:
    """Encode LiteLLM streaming chunks in OpenAI's SSE format."""
    while True:
        try:
            chunk = _next_stream_chunk(response)
        except StopIteration:
            break
        body = response_data(chunk)
        if observe_chunk is not None:
            observe_chunk(body)
        if model_override is not None:
            body["model"] = model_override
        yield f"data: {json.dumps(body, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"


def require_gateway_key(expected_key: str | None, authorization: str | None) -> None:
    """Require a constant-time Bearer token comparison when auth is enabled."""
    if not expected_key:
        return
    expected_header = f"Bearer {expected_key}"
    if authorization is None or not hmac.compare_digest(authorization, expected_header):
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "message": "Incorrect API key provided.",
                    "type": "invalid_request_error",
                    "param": None,
                    "code": "invalid_api_key",
                }
            },
            headers={"WWW-Authenticate": "Bearer"},
        )


def error_body(
    message: str,
    *,
    type_: str = "invalid_request_error",
    code: str | None = None,
    param: str | None = None,
) -> dict[str, Any]:
    """Build the error wrapper every OpenAI client knows how to parse."""
    return {"error": {"message": message, "type": type_, "param": param, "code": code}}


def create_app(config: GatewayConfig | None = None) -> FastAPI:
    """Create the gateway app. Supplying a config makes the app easy to test."""
    active = config or load_gateway_config()
    reload_lock = threading.Lock()
    app = FastAPI(title="JEV LiteLLM gateway", version="0.2.0")
    app.state.jev_config = active

    @app.exception_handler(StarletteHTTPException)
    async def openai_error_response(
        request: Request, error: StarletteHTTPException
    ) -> JSONResponse:
        detail = error.detail
        nested = detail.get("error") if isinstance(detail, dict) else None
        if isinstance(nested, dict):
            # Normalise the wrapper so every error carries OpenAI's four fields.
            body: dict[str, Any] = {"param": None}
            for key, value in nested.items():
                body[str(key)] = value
            content: dict[str, Any] = {"error": body}
        elif error.status_code == 404:
            content = error_body(f"Invalid URL ({request.method} {request.url.path})")
        else:
            content = error_body(str(detail))
        return JSONResponse(
            status_code=error.status_code, content=content, headers=error.headers
        )

    @app.exception_handler(RequestValidationError)
    async def invalid_request_body(
        request: Request, error: RequestValidationError
    ) -> JSONResponse:
        if request.url.path == "/v1/chat/completions":
            # Read once: the stored request and the malformed-body fallback below
            # both record this same request-scoped value.
            requested_strategy = request.headers.get(STRATEGY_HEADER)
            try:
                raw = await request.body()
                parsed = json.loads(raw)
                body = parsed if isinstance(parsed, dict) else {}
                messages = body.get("messages")
                valid_messages = messages if isinstance(messages, list) else []
                prompt = latest_user_text(valid_messages) if all(
                    isinstance(item, dict) for item in valid_messages
                ) else None
                input_text = "\n".join(
                    content_text(item.get("content")) for item in valid_messages
                    if isinstance(item, dict)
                )
                session_id = derive_session_id(
                    valid_messages if all(isinstance(item, dict) for item in valid_messages) else [],
                    header_value=request.headers.get(SESSION_HEADER),
                    user=body.get("user") if isinstance(body.get("user"), str) else None,
                    strategy=active.session_strategy,
                )
                requested_model = body.get("model")
                active.engine.record_invalid_request(RequestRecord(
                    request_id=active.engine.new_request_id(),
                    received_at=time.time(),
                    session_id=session_id,
                    requested_strategy=requested_strategy,
                    requested_model=requested_model if isinstance(requested_model, str) else None,
                    endpoint=request.url.path,
                    client=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"),
                    stream=bool(body.get("stream")),
                    max_tokens=body.get("max_completion_tokens") if isinstance(body.get("max_completion_tokens"), int) else body.get("max_tokens") if isinstance(body.get("max_tokens"), int) else None,
                    tools=body.get("tools"),
                    response_format=body.get("response_format"),
                    messages=parsed,
                    prompt=prompt or input_text,
                    prompt_chars=len(prompt or input_text),
                    prompt_tokens=estimate_tokens(prompt or input_text),
                    conversation_tokens=estimate_tokens(input_text),
                    turn_index=sum(item.get("role") == "user" for item in valid_messages if isinstance(item, dict)),
                    has_tools=bool(body.get("tools")),
                    has_vision=False,
                    wants_json=False,
                ))
            except (JSONDecodeError, UnicodeDecodeError):
                # Invalid JSON still needs a record. Store the raw body as text,
                # subject to the configured capture_content switch.
                raw = await request.body()
                text = raw.decode("utf-8", errors="replace")
                active.engine.record_invalid_request(RequestRecord(
                    request_id=active.engine.new_request_id(), received_at=time.time(),
                    session_id=None, requested_strategy=requested_strategy,
                    requested_model=None, endpoint=request.url.path,
                    client=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"), stream=False,
                    max_tokens=None, tools=None, response_format=None,
                    messages={"raw_body": text}, prompt=text, prompt_chars=len(text),
                    prompt_tokens=estimate_tokens(text), conversation_tokens=estimate_tokens(text),
                    turn_index=0, has_tools=False, has_vision=False, wants_json=False,
                ))
        failures = error.errors()
        first = failures[0] if failures else {}
        # loc entries can be field names or offsets; only names belong in param.
        location = [
            str(part)
            for part in first.get("loc", ())
            if part != "body" and not isinstance(part, int)
        ]
        param = ".".join(location) or None
        if first.get("type") == "missing" and param:
            message = f"Missing required parameter: '{param}'"
        else:
            message = str(first.get("msg", "Invalid request."))
        return JSONResponse(status_code=400, content=error_body(message, param=param))

    @app.middleware("http")
    async def reject_strategy_query(request: Request, call_next: Any) -> Any:
        if request.url.path in {"/v1/chat/completions", "/v1/routing/preview"} and "strategy" in request.query_params:
            return JSONResponse(
                status_code=400,
                content=error_body(
                    "Query parameter 'strategy' is not supported; use the request body 'model' field.",
                    code="unsupported_parameter",
                    param="strategy",
                ),
            )
        return await call_next(request)

    @app.get("/healthz")
    def healthz(authorization: str | None = Header(default=None)) -> dict[str, Any]:
        require_gateway_key(active.gateway_api_key, authorization)
        storage = active.engine.record_store.status()
        return {
            "status": "degraded" if storage["error"] is not None else "ok",
            "models": active.engine.catalog.names(),
            "policy_mode": active.engine.catalog.policy.mode,
            "default_strategy": active.engine.strategies.default_name,
            "strategies": active.engine.strategies.names(),
            "session_strategy": active.session_strategy,
            "storage_enabled": active.engine.record_store.enabled,
            "storage": storage,
            "sessions": len(active.engine.store),
        }

    @app.get("/v1/models")
    def list_models(authorization: str | None = Header(default=None)) -> dict[str, Any]:
        require_gateway_key(active.gateway_api_key, authorization)
        return {
            "object": "list",
            "data": [
                *[
                    {
                        "id": name,
                        "object": "model",
                        "created": MODEL_CREATED_AT,
                        "owned_by": "jev",
                    }
                    for name in active.engine.strategies.names()
                ],
                *[
                    {
                        "id": name,
                        "object": "model",
                        "created": MODEL_CREATED_AT,
                        "owned_by": "jev",
                    }
                    for name in active.engine.catalog.names()
                ],
            ],
        }

    @app.get("/v1/routing/policy")
    def routing_policy(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        require_gateway_key(active.gateway_api_key, authorization)
        return {
            "session_strategy": active.session_strategy,
            **active.engine.policy_snapshot(),
        }

    @app.get("/v1/routing/strategies")
    def routing_strategies(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """List every registered strategy and its policy."""
        require_gateway_key(active.gateway_api_key, authorization)
        return {
            "object": "list",
            "default": active.engine.strategies.default_name,
            "data": active.engine.strategies.describe(),
        }

    @app.post("/v1/routing/preview", response_model=None)
    def routing_preview(
        body: PreviewRequest,
        x_jev_session_id: str | None = Header(default=None, alias=SESSION_HEADER),
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Return the routing answer for a request without serving or mutating it."""
        require_gateway_key(active.gateway_api_key, authorization)
        message_text(body.messages)
        session_id = derive_session_id(
            body.messages,
            header_value=x_jev_session_id,
            user=body.user,
            strategy=active.session_strategy,
        )
        session = (
            active.engine.store.copy(session_id) if session_id is not None else None
        )
        chosen, explicit, routed_model = resolve_strategy_name(
            active.engine,
            requested_model=body.model,
            session=session,
        )
        if explicit and not active.engine.strategies.has(chosen):
            raise unknown_strategy_error(active.engine, chosen)
        output_budget = body.max_completion_tokens
        if output_budget is None:
            output_budget = body.max_tokens
        # The client's own level, read off the request. JEV only inspects it when the
        # selected route declared a ladder, and the reasoning policy decides whether
        # it is kept, lowered, or replaced.
        requested_reasoning_effort = getattr(body, "reasoning_effort", None)
        if body.strategy is not None:
            selected = body.strategy
        elif explicit:
            selected = [chosen]
        else:
            selected = active.engine.strategies.names()
        if not selected:
            raise HTTPException(
                status_code=400,
                detail={"error": {
                    "message": "strategy must contain at least one name.",
                    "type": "invalid_request_error",
                    "param": "strategy",
                    "code": "unknown_strategy",
                }},
            )
        for name in selected:
            if not active.engine.strategies.has(name):
                raise unknown_strategy_error(active.engine, name)
        try:
            previews = [
                active.engine.preview(
                    messages=body.messages,
                    requested_model=routed_model,
                    session_id=session_id,
                    max_tokens=output_budget,
                    tools=body.tools,
                    response_format=body.response_format,
                    strategy=name,
                    reasoning_effort=requested_reasoning_effort,
                )
                for name in selected
            ]
            return {"default": active.engine.strategies.default_name, "preview": previews}
        except UnknownModelError as error:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "message": (
                            f"The model {body.model!r} does not exist. "
                            "Available catalog models: "
                            + ", ".join(active.engine.catalog.names())
                        ),
                        "type": "invalid_request_error",
                        "param": "model",
                        "code": "model_not_found",
                    }
                },
            ) from error
    @app.post("/v1/routing/reload", response_model=None)
    def reload_routing(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Re-read the routing configuration without restarting the process."""
        require_gateway_key(active.gateway_api_key, authorization)
        try:
            load_dotenv(active.models_file.parent / ".env", override=True)
            catalog = _resolve_storage_path(
                load_catalog(active.models_file), active.models_file
            )
        except (TypeError, ValueError, RuntimeError) as error:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "message": f"Reload rejected: {error}",
                        "type": "invalid_request_error",
                        "param": None,
                        "code": "invalid_configuration",
                    }
                },
            ) from error
        try:
            registry = active.engine.prepare_catalog_reload(catalog)
        except (RuntimeError, ValueError) as error:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "message": f"Reload rejected: {error}",
                        "type": "invalid_request_error",
                        "param": None,
                        "code": "invalid_configuration",
                    }
                },
            ) from error
        try:
            active.engine.record_store.validate_reconfiguration(catalog.storage)
        except StorageUnavailableError as error:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": {
                        "message": f"Reload rejected: {error}",
                        "type": "server_error",
                        "param": "storage",
                        "code": "storage_unavailable",
                    }
                },
            ) from error
        except ValueError as error:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "message": f"Reload rejected: {error}",
                        "type": "invalid_request_error",
                        "param": "storage",
                        "code": "restart_required",
                    }
                },
            ) from error
        with reload_lock:
            try:
                active.engine.record_store.reconfigure(catalog.storage)
            except StorageUnavailableError as error:
                raise HTTPException(
                    status_code=503,
                    detail={
                        "error": {
                            "message": f"Reload rejected: {error}",
                            "type": "server_error",
                            "param": "storage",
                            "code": "storage_unavailable",
                        }
                    },
                ) from error
            active.engine.reload_catalog(
                catalog,
                source=str(active.models_file),
                registry=registry,
            )
            active.apply_settings(catalog.gateway)
        return {
            "reloaded": True,
            "models_file": str(active.models_file),
            **active.engine.policy_snapshot(),
        }

    @app.get("/v1/routing/decisions/{decision_id}", response_model=None)
    def routing_decision(
        decision_id: str,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        require_gateway_key(active.gateway_api_key, authorization)
        found = active.engine.decision(decision_id)
        if found is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "message": f"No decision {decision_id!r} in the log.",
                        "type": "invalid_request_error",
                        "code": "unknown_decision",
                    }
                },
            )
        return found.as_dict()

    @app.get("/v1/routing/sessions/{session_id}", response_model=None)
    def routing_session(
        session_id: str,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        require_gateway_key(active.gateway_api_key, authorization)
        snapshot = active.engine.session_snapshot(session_id)
        if snapshot is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "message": f"No live session {session_id!r}.",
                        "type": "invalid_request_error",
                        "code": "unknown_session",
                    }
                },
            )
        return snapshot

    @app.post("/v1/chat/completions", response_model=None)
    def chat_completions(
        body: ChatCompletionRequest,
        http_request: Request,
        x_jev_session_id: str | None = Header(default=None, alias=SESSION_HEADER),
        authorization: str | None = Header(default=None),
    ) -> JSONResponse | StreamingResponse:
        require_gateway_key(active.gateway_api_key, authorization)
        message_text(body.messages)
        session_id = derive_session_id(
            body.messages,
            header_value=x_jev_session_id,
            user=body.user,
            strategy=active.session_strategy,
        )
        session = (
            active.engine.store.copy(session_id) if session_id is not None else None
        )
        chosen_strategy, explicit, routed_model = resolve_strategy_name(
            active.engine,
            requested_model=body.model,
            session=session,
        )
        # OpenAI deprecates max_tokens in favour of max_completion_tokens, and the
        # newer field wins when a client sends both.
        output_budget = body.max_completion_tokens
        if output_budget is None:
            output_budget = body.max_tokens
        requested_reasoning_effort = getattr(body, "reasoning_effort", None)
        request_id = active.engine.new_request_id()
        # The raw request is stored before routing validates anything, so unknown
        # models and strategies still leave a request row.
        active.engine.record_request(
            request_id=request_id,
            session_id=session_id,
            meta=RequestMeta(
                endpoint=str(http_request.url.path),
                client=http_request.client.host if http_request.client else None,
                user_agent=http_request.headers.get("user-agent"),
                stream=body.stream,
                requested_strategy=chosen_strategy,
            ),
            messages=body.messages,
            requested_model=routed_model,
            max_tokens=output_budget,
            tools=body.tools,
            response_format=body.response_format,
        )

        if explicit and not active.engine.strategies.has(chosen_strategy):
            raise unknown_strategy_error(active.engine, chosen_strategy)

        try:
            decision = active.engine.decide(
                messages=body.messages,
                requested_model=routed_model,
                session_id=session_id,
                max_tokens=output_budget,
                tools=body.tools,
                response_format=body.response_format,
                strategy=chosen_strategy,
                request_id=request_id,
                reasoning_effort=requested_reasoning_effort,
            )
        except UnknownModelError as error:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "message": (
                            f"The model {body.model!r} does not exist. "
                            "Available catalog models: "
                            + ", ".join(active.engine.catalog.names())
                        ),
                        "type": "invalid_request_error",
                        "param": "model",
                        "code": "model_not_found",
                    }
                },
            ) from error
        except UnknownStrategyError as error:
            raise unknown_strategy_error(active.engine, error.name) from error
        profile = active.engine.catalog.by_name(decision.route_name)
        if profile is None:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": {
                        "message": f"Routed model {decision.route_name!r} is missing.",
                        "type": "server_error",
                        "code": "catalog_mismatch",
                    }
                },
            )

        # The decision creates a session on its first turn. Fetch it again so
        # provider adapters can retain opaque continuation metadata.
        session = (
            active.engine.store.get(session_id) if session_id is not None else None
        )

        logger.info(
            "routing decided",
            extra={
                "decision_id": decision.decision_id,
                "request_id": decision.request_id,
                "session_id": decision.session_id,
                "strategy": decision.strategy,
                "capability_gap": decision.blocked_by,
                "label": decision.label,
                "tier": decision.tier,
                "mode": decision.mode,
                "switched_from": decision.switched_from,
                "reasoning_effort": decision.reasoning_effort,
                "reasoning_effort_source": decision.reasoning_effort_source,
                "requested_model": body.model,
                "route": decision.route_name,
                "provider": decision.provider,
                "model": decision.model,
                "reason": decision.reason,
            },
        )

        started = time.perf_counter()
        try:
            from litellm import completion

            response = completion(
                **completion_payload(
                    body,
                    profile,
                    decision,
                    session,
                    active.engine.record_store,
                )
            )
        except HTTPException:
            raise
        except Exception as error:
            latency_ms = (time.perf_counter() - started) * 1000
            active.engine.record_outcome(
                decision,
                ok=False,
                latency_ms=latency_ms,
                error_type=type(error).__name__,
                error_message=str(error),
            )
            logger.warning(
                "routing failed",
                extra={
                    "decision_id": decision.decision_id,
                    "provider": decision.provider,
                    "model": decision.model,
                    "ok": False,
                    "error_type": type(error).__name__,
                    "latency_ms": round(latency_ms, 2),
                },
            )
            logger.debug("upstream failure details", exc_info=True)
            raise HTTPException(
                status_code=502,
                detail={
                    "error": {
                        "message": str(error),
                        "type": type(error).__name__,
                        "code": "upstream_error",
                    }
                },
            ) from error

        headers = decision_headers(decision)
        echoed_model = body.model if active.echo_requested_model else None
        response_capture = adapter_for(profile.provider_type).capture_response(
            session, active.engine.record_store
        )
        if body.stream:
            logger.debug(
                "routing stream started",
                extra={
                    "decision_id": decision.decision_id,
                    "provider": decision.provider,
                    "model": decision.model,
                },
            )

            def recorded_stream() -> Iterator[str]:
                ok = True
                error_type: str | None = None
                try:
                    yield from sse_chunks(
                        cast(Iterator[Any], response),
                        echoed_model,
                        response_capture.observe,
                    )
                except Exception as error:
                    ok = False
                    error_type = type(error).__name__
                    logger.error(
                        "routing stream failed",
                        extra={
                            "decision_id": decision.decision_id,
                            "provider": decision.provider,
                            "model": decision.model,
                            "error_type": error_type,
                        },
                    )
                    logger.debug("stream failure details", exc_info=True)
                    raise
                finally:
                    response_capture.finish()
                    active.engine.record_outcome(
                        decision,
                        ok=ok,
                        latency_ms=(time.perf_counter() - started) * 1000,
                        error_type=error_type,
                    )
                    if ok:
                        logger.info(
                            "routing served",
                            extra={
                                "decision_id": decision.decision_id,
                                "provider": decision.provider,
                                "model": decision.model,
                                "ok": True,
                                "latency_ms": round(
                                    (time.perf_counter() - started) * 1000, 2
                                ),
                            },
                        )

            return StreamingResponse(
                recorded_stream(),
                media_type="text/event-stream",
                headers={**headers, "Cache-Control": "no-cache"},
            )

        result_body = response_data(response)
        response_capture.observe(result_body)
        response_capture.finish()
        upstream_model = result_body.get("model")
        if echoed_model is not None:
            # OpenAI echoes the requested model; the resolved one stays in X-JEV-Model.
            result_body["model"] = echoed_model
        usage = result_body.get("usage")
        active.engine.record_outcome(
            decision,
            ok=True,
            finish_reason=finish_reason(result_body),
            usage=usage if isinstance(usage, dict) else None,
            latency_ms=(time.perf_counter() - started) * 1000,
            returned_model=(
                upstream_model if isinstance(upstream_model, str) else None
            ),
        )
        logger.info(
            "routing served",
            extra={
                "decision_id": decision.decision_id,
                "provider": decision.provider,
                "model": decision.model,
                "ok": True,
                "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )
        return JSONResponse(content=result_body, headers=headers)

    return app


app = create_app(load_gateway_config())


def run_gateway() -> None:
    """Run the gateway using configuration from the selected runtime directory."""
    import uvicorn

    from jev_gateway.logging import (
        suppress_litellm_debug_prints,
        uvicorn_log_config,
    )

    settings = app.state.jev_config.engine.catalog.gateway
    suppress_litellm_debug_prints()
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level=settings.logging.level.lower(),
        access_log=settings.logging.access_log,
        log_config=uvicorn_log_config(
            settings.logging.level,
            settings.logging.output_format,
        ),
    )


if __name__ == "__main__":
    run_gateway()
