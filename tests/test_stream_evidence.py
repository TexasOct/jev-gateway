"""Completed SDK streams retain outcomes and replayable assistant metadata."""

from __future__ import annotations

import asyncio
import sys
import threading
import types
from functools import partial
from pathlib import Path
from typing import Any

import anyio
import pytest
from pydantic import BaseModel
from starlette.requests import Request

from jev_gateway import gateway
from jev_gateway.provider.base import ResponseCapture, assistant_message_key
from tests.helpers import SMALL_MODEL_ID, catalog_document
from tests.test_gateway import make_stored_config, request


class SDKChunk(BaseModel):
    model: str = "native-returned-model"
    choices: list[dict[str, Any]]
    usage: dict[str, int] | None = None


class SDKIterator:
    def __init__(self, chunks: list[SDKChunk], error: bool = False) -> None:
        self.chunks = iter(chunks)
        self.error = error
        self.reading = False

    def __iter__(self) -> SDKIterator:
        return self

    def __next__(self) -> SDKChunk:
        self.reading = True
        try:
            try:
                return next(self.chunks)
            except StopIteration:
                if self.error:
                    raise RuntimeError("synthetic upstream failure") from None
                raise
        finally:
            self.reading = False


class SDKStream(SDKIterator):
    def __init__(self, chunks: list[SDKChunk], error: bool = False) -> None:
        super().__init__(chunks, error)
        self.closed = 0

    def close(self) -> None:
        assert not self.reading
        self.closed += 1


class AsyncSDKStream(SDKIterator):
    """LiteLLM's sync iteration interface with only an async resource close."""

    def __init__(self, chunks: list[SDKChunk], error: bool = False) -> None:
        super().__init__(chunks, error)
        self.closed = 0
        self.close_started = 0
        self.close_loop: asyncio.AbstractEventLoop | None = None

    async def aclose(self) -> None:
        self.close_started += 1
        self.close_loop = asyncio.get_running_loop()
        assert not self.reading
        # The fixture deliberately relies on the gateway's cancellation shield.
        await anyio.sleep(0)
        self.closed += 1


def assert_stream_closed(stream: SDKStream | AsyncSDKStream) -> None:
    assert stream.closed == 1
    if isinstance(stream, AsyncSDKStream):
        assert stream.close_started == 1
        assert stream.close_loop is not None
        assert not hasattr(stream, "close")


def sdk_chunks(reason: str = "stop") -> list[SDKChunk]:
    return [
        SDKChunk(choices=[{"index": 0, "delta": {
            "role": "assistant", "content": "Answer ", "reasoning_content": "Reason ",
        }}]),
        SDKChunk(choices=[{"index": 0, "delta": {
            "content": "complete.", "reasoning_content": "complete.",
        }}]),
        SDKChunk(choices=[{"index": 0, "delta": {}, "finish_reason": reason}]),
        SDKChunk(choices=[], usage={"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18}),
    ]


@pytest.mark.parametrize("stream_type", [SDKStream, AsyncSDKStream])
@pytest.mark.parametrize("provider_type", ["openai", "deepseek"])
@pytest.mark.parametrize("reason", ["stop", "length"])
def test_completed_stream_persists_metadata_and_replays_after_reopen(
    monkeypatch, tmp_path: Path, provider_type: str, reason: str,
    stream_type: type[SDKStream] | type[AsyncSDKStream],
) -> None:
    document = catalog_document()
    document["providers"][0]["type"] = provider_type
    stream = stream_type(sdk_chunks(reason))
    calls: list[dict[str, Any]] = []

    def completion(**kwargs: Any) -> Any:
        calls.append(kwargs)
        if kwargs["stream"]:
            return stream
        return {"model": "native-followup", "choices": [{
            "message": {"role": "assistant", "content": "Followup."}, "finish_reason": "stop",
        }]}

    monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(completion=completion))
    config = make_stored_config(tmp_path, document=document)
    app = gateway.create_app(config)
    session_id = "sdk-complete"
    headers = {"X-JEV-Session-Id": session_id}
    try:
        response = request(app, "POST", "/v1/chat/completions", headers=headers, json={
            "model": "task_aware", "stream": True,
            "stream_options": {"include_usage": True},
            "messages": [{"role": "user", "content": "Synthetic question."}],
        })
        assert response.status_code == 200
        assert response.text.endswith("data: [DONE]\n\n")
        assert '"model": "task_aware"' in response.text
        assert response.headers["x-jev-route"] == SMALL_MODEL_ID
        assert response.headers["cache-control"] == "no-cache"
        assert_stream_closed(stream)
        rows = config.engine.record_store.session_request_evidence(session_id)
        outcome = rows[0]["outcome"]
        assert outcome["ok"] is True
        assert outcome["finish_reason"] == reason
        assert outcome["returned_model"] == "native-returned-model"
        assert (outcome["prompt_tokens"], outcome["completion_tokens"], outcome["total_tokens"]) == (11, 7, 18)
        assert outcome["cost_usd"] is not None
        assert outcome["latency_ms"] >= 0
        session = config.engine.store.get(session_id)
        assert session is not None
        assert session.consecutive_truncations == (1 if reason == "length" else 0)
        saved = config.engine.record_store.load_assistant_continuations(session_id, limit=10)
        assert len(saved) == 1
        assert saved[0].message_key == assistant_message_key({"role": "assistant", "content": "Answer complete."})
        assert saved[0].provider_type == provider_type
    finally:
        config.engine.close()

    # Provider metadata is durable even when the process-local session was lost.
    reopened_document = catalog_document()
    reopened_document["providers"][0]["type"] = "deepseek"
    reopened = make_stored_config(tmp_path, document=reopened_document)
    try:
        followup = request(gateway.create_app(reopened), "POST", "/v1/chat/completions", headers=headers, json={
            "model": "task_aware", "previous_response_id": "synthetic-opaque-response-id",
            "messages": [
                {"role": "user", "content": "Synthetic question."},
                {"role": "assistant", "content": "Answer complete."},
                {"role": "user", "content": "Synthetic followup."},
            ],
        })
        assert followup.status_code == 200
        assert calls[-1]["previous_response_id"] == "synthetic-opaque-response-id"
        assert calls[-1]["messages"][1]["reasoning_content"] == (
            "Reason complete." if provider_type == "deepseek" else " "
        )
    finally:
        reopened.engine.close()


@pytest.mark.parametrize("stream_type", [SDKStream, AsyncSDKStream])
def test_stream_evidence_finalizes_once_after_terminal_asgi_delivery(
    monkeypatch, tmp_path: Path,
    stream_type: type[SDKStream] | type[AsyncSDKStream],
) -> None:
    stream = stream_type(sdk_chunks())
    original_finish = ResponseCapture.finish
    finished: list[None] = []

    def finish(capture: ResponseCapture) -> None:
        finished.append(None)
        original_finish(capture)

    monkeypatch.setattr(ResponseCapture, "finish", finish)
    monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(completion=lambda **kwargs: stream))
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)
    endpoint = next(getattr(route, "endpoint") for route in app.routes
                    if getattr(route, "path", None) == "/v1/chat/completions")

    async def run() -> None:
        scope: dict[str, Any] = {
            "type": "http", "method": "POST", "path": "/v1/chat/completions",
            "headers": [], "query_string": b"", "scheme": "http",
            "server": ("testserver", 80), "client": ("127.0.0.1", 1234),
            "asgi": {"spec_version": "2.4"},
        }
        response = endpoint(
            body=gateway.ChatCompletionRequest(model="task_aware", stream=True, messages=[
                {"role": "user", "content": "Synthetic question."},
            ]), http_request=Request(scope), x_jev_session_id="sdk-delivery", authorization=None,
        )

        async def receive() -> dict[str, Any]:
            return {"type": "http.disconnect"}

        async def send(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.body" and not message.get("more_body", False):
                assert finished == []
                counts = config.engine.record_store.counts()
                assert counts["outcomes"] == counts["assistant_continuations"] == 0
                assert config.routing_activity is not None
                paths = config.routing_activity.snapshot()["paths"]
                assert isinstance(paths, list)
                assert paths[0]["in_flight_streams"] == 1

        await response(scope, receive, send)
        if isinstance(stream, AsyncSDKStream):
            assert stream.close_loop is asyncio.get_running_loop()

    try:
        asyncio.run(run())
        assert len(finished) == 1
        counts = config.engine.record_store.counts()
        assert counts["outcomes"] == counts["assistant_continuations"] == 1
        assert_stream_closed(stream)
        assert config.routing_activity is not None
        assert config.routing_activity.snapshot()["paths"] == []
    finally:
        config.engine.close()


@pytest.mark.parametrize("stream_type", [SDKStream, AsyncSDKStream])
@pytest.mark.parametrize("failure", ["error", "error_after_stop", "incomplete"])
def test_failed_or_incomplete_sdk_stream_never_saves_completed_assistant(
    monkeypatch, tmp_path: Path, failure: str,
    stream_type: type[SDKStream] | type[AsyncSDKStream],
) -> None:
    stream = stream_type(
        sdk_chunks() if failure == "error_after_stop" else sdk_chunks()[:2],
        error=failure != "incomplete",
    )
    finished: list[None] = []
    monkeypatch.setattr(ResponseCapture, "finish", lambda self: finished.append(None))
    monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(completion=lambda **kwargs: stream))
    config = make_stored_config(tmp_path)
    try:
        response = request(gateway.create_app(config), "POST", "/v1/chat/completions", headers={
            "X-JEV-Session-Id": "sdk-failed",
        }, json={"model": "task_aware", "stream": True,
                 "messages": [{"role": "user", "content": "Synthetic question."}]})
        assert response.status_code == 200
        if failure != "incomplete":
            assert "[DONE]" not in response.text
        assert_stream_closed(stream)
        assert finished == []
        assert config.routing_activity is not None
        assert config.routing_activity.snapshot()["paths"] == []
        counts = config.engine.record_store.counts()
        assert counts["assistant_continuations"] == 0
        assert counts["outcomes"] == 1
        outcome = config.engine.record_store.session_request_evidence("sdk-failed")[0]["outcome"]
        assert outcome["ok"] is False
        assert outcome["error_type"] == ("StreamIncomplete" if failure == "incomplete" else "RuntimeError")
        session = config.engine.store.get("sdk-failed")
        assert session is not None
        assert session.consecutive_failures == 1
    finally:
        config.engine.close()


@pytest.mark.parametrize("stream_type", [SDKStream, AsyncSDKStream])
@pytest.mark.parametrize("failure", [
    "disconnect", "send_error", "before_body", "done_send_error", "terminal_send_error",
])
def test_asgi_interruption_closes_sdk_without_finalizing_capture(
    monkeypatch, tmp_path: Path, failure: str,
    stream_type: type[SDKStream] | type[AsyncSDKStream],
) -> None:
    stream = stream_type(sdk_chunks())
    finished: list[None] = []
    monkeypatch.setattr(ResponseCapture, "finish", lambda self: finished.append(None))
    monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(completion=lambda **kwargs: stream))
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)
    endpoint = next(getattr(route, "endpoint") for route in app.routes
                    if getattr(route, "path", None) == "/v1/chat/completions")

    async def run() -> None:
        scope: dict[str, Any] = {
            "type": "http", "method": "POST", "path": "/v1/chat/completions",
            "headers": [], "query_string": b"", "scheme": "http",
            "server": ("testserver", 80), "client": ("127.0.0.1", 1234),
            "asgi": {"spec_version": "2.3"},
        }
        response = endpoint(
            body=gateway.ChatCompletionRequest(model="task_aware", stream=True, messages=[
                {"role": "user", "content": "Synthetic question."},
            ]), http_request=Request(scope), x_jev_session_id="sdk-disconnect", authorization=None,
        )
        disconnect = asyncio.Event()

        async def receive() -> dict[str, Any]:
            await disconnect.wait()
            return {"type": "http.disconnect"}

        async def send(message: dict[str, Any]) -> None:
            if failure == "before_body" and message["type"] == "http.response.start":
                raise OSError("synthetic send failure")
            if failure == "terminal_send_error" and message["type"] == "http.response.body" and not message.get("more_body", False):
                raise OSError("synthetic terminal send failure")
            if message["type"] == "http.response.body" and message.get("body"):
                if failure == "send_error" or (
                    failure == "done_send_error" and b"[DONE]" in message["body"]
                ):
                    raise OSError("synthetic send failure")
                if failure == "disconnect":
                    disconnect.set()
                    await asyncio.sleep(0)

        if failure == "disconnect":
            await response(scope, receive, send)
        else:
            with pytest.raises((OSError, ExceptionGroup)):
                await response(scope, receive, send)

    try:
        asyncio.run(run())
        assert finished == []
        assert_stream_closed(stream)
        assert config.engine.record_store.counts()["assistant_continuations"] == 0
        outcome = config.engine.record_store.session_request_evidence("sdk-disconnect")[0]["outcome"]
        assert outcome["ok"] is False
        assert outcome["error_type"] == "StreamInterrupted"
        assert config.engine.record_store.counts()["outcomes"] == 1
        assert config.routing_activity is not None
        assert config.routing_activity.snapshot()["paths"] == []
    finally:
        config.engine.close()


def streaming_scope() -> dict[str, Any]:
    return {
        "type": "http", "method": "POST", "path": "/v1/chat/completions",
        "headers": [], "query_string": b"", "scheme": "http",
        "server": ("testserver", 80), "client": ("127.0.0.1", 1234),
        "asgi": {"spec_version": "2.4"},
    }


async def prepare_stream_response(app: Any, scope: dict[str, Any], session_id: str) -> Any:
    endpoint = next(getattr(route, "endpoint") for route in app.routes
                    if getattr(route, "path", None) == "/v1/chat/completions")
    # Exercise the same worker/event-loop bridge as FastAPI's synchronous route.
    return await anyio.to_thread.run_sync(partial(
        endpoint,
        body=gateway.ChatCompletionRequest(model="task_aware", stream=True, messages=[
            {"role": "user", "content": "Synthetic question."},
        ]), http_request=Request(scope), x_jev_session_id=session_id, authorization=None,
    ))


@pytest.mark.parametrize("stream_type", [SDKStream, AsyncSDKStream])
def test_cancelled_scope_shields_actual_sdk_close(
    monkeypatch, tmp_path: Path,
    stream_type: type[SDKStream] | type[AsyncSDKStream],
) -> None:
    stream = stream_type(sdk_chunks())
    finished: list[None] = []
    monkeypatch.setattr(ResponseCapture, "finish", lambda self: finished.append(None))
    monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(completion=lambda **kwargs: stream))
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)

    async def run() -> None:
        scope = streaming_scope()
        response = await prepare_stream_response(app, scope, "sdk-cancelled-scope")

        async def receive() -> dict[str, Any]:
            return {"type": "http.disconnect"}

        with anyio.CancelScope() as cancel_scope:
            async def send(message: dict[str, Any]) -> None:
                if message["type"] == "http.response.body" and message.get("body"):
                    cancel_scope.cancel()
                    await anyio.sleep(0)

            await response(scope, receive, send)
        if isinstance(stream, AsyncSDKStream):
            assert stream.close_loop is asyncio.get_running_loop()

    try:
        asyncio.run(run())
        assert_stream_closed(stream)
        assert finished == []
        counts = config.engine.record_store.counts()
        assert counts["assistant_continuations"] == 0
        assert counts["outcomes"] == 1
        outcome = config.engine.record_store.session_request_evidence("sdk-cancelled-scope")[0]["outcome"]
        assert outcome["ok"] is False
        assert outcome["error_type"] == "StreamInterrupted"
        assert config.routing_activity is not None
        assert config.routing_activity.snapshot()["paths"] == []
    finally:
        config.engine.close()


def test_task_cancellation_waits_for_executing_sdk_iterator_before_aclose(
    monkeypatch, tmp_path: Path,
) -> None:
    class BlockingSDKStream(AsyncSDKStream):
        def __init__(self) -> None:
            super().__init__(sdk_chunks())
            self.entered = threading.Event()
            self.release = threading.Event()
            self.worker_exited = threading.Event()

        def __next__(self) -> SDKChunk:
            self.reading = True
            self.entered.set()
            try:
                assert self.release.wait(timeout=5), "Synthetic worker was not released"
                return super().__next__()
            finally:
                self.reading = False
                self.worker_exited.set()

        async def aclose(self) -> None:
            assert self.worker_exited.is_set()
            await super().aclose()

    stream = BlockingSDKStream()
    finished: list[None] = []
    monkeypatch.setattr(ResponseCapture, "finish", lambda self: finished.append(None))
    monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(completion=lambda **kwargs: stream))
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)

    async def run() -> None:
        scope = streaming_scope()
        response = await prepare_stream_response(app, scope, "sdk-cancelled-worker")

        async def receive() -> dict[str, Any]:
            return {"type": "http.disconnect"}

        async def send(message: dict[str, Any]) -> None:
            pass

        task = asyncio.create_task(response(scope, receive, send))
        try:
            assert await anyio.to_thread.run_sync(stream.entered.wait, 1)
            task.cancel()
            # Let the finalizer start while the provider next() still owns its lock.
            await asyncio.sleep(0)
            assert stream.reading
            assert stream.close_started == stream.closed == 0
        finally:
            stream.release.set()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, timeout=2)
        assert stream.close_loop is asyncio.get_running_loop()

    try:
        asyncio.run(run())
        assert_stream_closed(stream)
        assert finished == []
        counts = config.engine.record_store.counts()
        assert counts["assistant_continuations"] == 0
        assert counts["outcomes"] == 1
        outcome = config.engine.record_store.session_request_evidence("sdk-cancelled-worker")[0]["outcome"]
        assert outcome["ok"] is False
        assert outcome["error_type"] == "StreamInterrupted"
        assert config.routing_activity is not None
        assert config.routing_activity.snapshot()["paths"] == []
    finally:
        stream.release.set()
        config.engine.close()


@pytest.mark.parametrize("stream_type", [SDKStream, AsyncSDKStream])
@pytest.mark.parametrize("failure_at", ["capture", "response_constructor"])
def test_route_worker_closes_sdk_if_stream_response_cannot_be_prepared(
    monkeypatch, tmp_path: Path, failure_at: str,
    stream_type: type[SDKStream] | type[AsyncSDKStream],
) -> None:
    stream = stream_type(sdk_chunks())
    finished: list[None] = []
    monkeypatch.setattr(ResponseCapture, "finish", lambda self: finished.append(None))
    monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(completion=lambda **kwargs: stream))
    config = make_stored_config(tmp_path)
    app = gateway.create_app(config)

    def fail_preparation(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("synthetic stream preparation failure")

    if failure_at == "capture":
        monkeypatch.setattr(ResponseCapture, "__init__", fail_preparation)
    else:
        monkeypatch.setattr(gateway.StreamingResponse, "__init__", fail_preparation)

    async def run() -> None:
        with pytest.raises(RuntimeError, match="synthetic stream preparation failure"):
            await prepare_stream_response(app, streaming_scope(), "sdk-prepare-failed")
        if isinstance(stream, AsyncSDKStream):
            assert stream.close_loop is asyncio.get_running_loop()

    try:
        asyncio.run(run())
        assert_stream_closed(stream)
        assert finished == []
        counts = config.engine.record_store.counts()
        assert counts["assistant_continuations"] == 0
        if failure_at == "response_constructor":
            assert counts["outcomes"] == 1
            outcome = config.engine.record_store.session_request_evidence("sdk-prepare-failed")[0]["outcome"]
            assert outcome["ok"] is False
            assert outcome["error_type"] == "StreamInterrupted"
        assert config.routing_activity is not None
        assert config.routing_activity.snapshot()["paths"] == []
    finally:
        config.engine.close()


def test_async_sdk_close_failure_is_bounded_and_does_not_mask_delivered_stream(
    monkeypatch, tmp_path: Path, caplog: pytest.LogCaptureFixture,
) -> None:
    class FailingCloseSDKStream(AsyncSDKStream):
        async def aclose(self) -> None:
            await super().aclose()
            raise RuntimeError("synthetic private close details")

    stream = FailingCloseSDKStream(sdk_chunks())
    monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(completion=lambda **kwargs: stream))
    config = make_stored_config(tmp_path)
    try:
        response = request(gateway.create_app(config), "POST", "/v1/chat/completions", headers={
            "X-JEV-Session-Id": "sdk-close-failure",
        }, json={"model": "task_aware", "stream": True,
                 "messages": [{"role": "user", "content": "Synthetic question."}]})
        assert response.status_code == 200
        assert response.text.endswith("data: [DONE]\n\n")
        assert_stream_closed(stream)
        warnings = [record for record in caplog.records
                    if record.getMessage() == "upstream stream close failed"]
        assert len(warnings) == 1
        assert getattr(warnings[0], "error_type") == "RuntimeError"
        assert "synthetic private close details" not in caplog.text
        counts = config.engine.record_store.counts()
        assert counts["outcomes"] == counts["assistant_continuations"] == 1
        outcome = config.engine.record_store.session_request_evidence("sdk-close-failure")[0]["outcome"]
        assert outcome["ok"] is True
        assert config.routing_activity is not None
        assert config.routing_activity.snapshot()["paths"] == []
    finally:
        config.engine.close()
