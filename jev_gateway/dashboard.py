"""Read-only dashboard routes and the static asset mount for the operator UI."""

from __future__ import annotations

import base64
import binascii
import ipaddress
import hmac
import json
import math
import os
import re
import secrets
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol

from fastapi import APIRouter, Body, Header, HTTPException, Query
from fastapi.responses import FileResponse, Response
from starlette.staticfiles import StaticFiles

from jev_gateway.canvas_layout import read_layout, write_layout
from jev_gateway.records import StorageUnavailableError


class DashboardState(Protocol):
    """Mutable gateway state consumed without importing the composition root."""

    gateway_api_key: str | None
    models_file: Path
    engine: Any
    routing_activity: Any


Authorize = Callable[[str | None, str | None], None]
RequireWrite = Callable[[str | None], None]


PROVIDER_WINDOW_SECONDS = 900
DEFAULT_THEME_SEED = "#3b66d9"
THEME_FILENAME = "dashboard-theme.json"
_HEX_SEED = re.compile(r"^#[0-9a-f]{3}(?:[0-9a-f]{3})?$", re.IGNORECASE)

# The bundled app needs no inline script, so the script directive stays strict.
# React writes style attributes and CSS variables, which keeps style-src inline.
_CONTENT_SECURITY_POLICY = (
    "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; "
    "connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; "
    "frame-ancestors 'none'"
)
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": _CONTENT_SECURITY_POLICY,
}
_IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
_NO_STORE = "no-store"
DEFAULT_PAGE_SIZE = 30
MAX_PAGE_SIZE = 100


def _page_size(limit: int) -> int:
    if limit < 1 or limit > MAX_PAGE_SIZE:
        raise HTTPException(status_code=400, detail={"error": {
            "message": f"limit must be between 1 and {MAX_PAGE_SIZE}.",
            "type": "invalid_request_error", "param": "limit", "code": "invalid_limit",
        }})
    return limit


def _invalid_cursor() -> HTTPException:
    return HTTPException(status_code=400, detail={"error": {
        "message": "Invalid or mismatched pagination cursor.",
        "type": "invalid_request_error", "param": "cursor", "code": "invalid_cursor",
    }})


def _encode_cursor(secret: bytes, endpoint: str, session_id: str | None, key: list[Any]) -> str:
    payload = json.dumps([1, endpoint, session_id, key], separators=(",", ":"), ensure_ascii=False).encode()
    signature = hmac.digest(secret, payload, "sha256")
    return base64.urlsafe_b64encode(payload + signature).decode().rstrip("=")


def _decode_cursor(
    secret: bytes, cursor: str | None, endpoint: str, session_id: str | None
) -> list[Any] | None:
    if cursor is None:
        return None
    try:
        if len(cursor) > 4096 or not re.fullmatch(r"[A-Za-z0-9_-]+", cursor):
            raise ValueError("cursor encoding")
        raw = base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True)
        payload, signature = raw[:-32], raw[-32:]
        if not hmac.compare_digest(hmac.digest(secret, payload, "sha256"), signature):
            raise ValueError("cursor signature")
        decoded = json.loads(payload)
        if not isinstance(decoded, list) or len(decoded) != 4 or decoded[:3] != [1, endpoint, session_id]:
            raise ValueError("cursor scope")
        key = decoded[3]
        if not isinstance(key, list) or len(key) != 3:
            raise ValueError("cursor key")
        if endpoint == "sessions":
            valid = type(key[0]) is int and key[0] in (0, 1) and isinstance(key[2], str)
        else:
            valid = type(key[2]) is int and key[2] > 0 and key[0] == "request" and key[1] is not None
        if (
            not valid
            or type(key[1]) not in (int, float)
            or key[1] is None
            or not math.isfinite(float(key[1]))
        ):
            raise ValueError("cursor key")
        return key
    except (ValueError, TypeError, IndexError, UnicodeError, binascii.Error) as error:
        raise _invalid_cursor() from error


class DashboardStatic(StaticFiles):
    """Serve the built frontend with tightened headers and a split cache policy.

    Vite emits content-hashed asset names, so those can be cached forever while
    ``index.html`` must never be, or a new build would never reach a browser.
    """

    async def get_response(self, path: str, scope: Any) -> Response:
        response = await super().get_response(path, scope)
        for name, value in _SECURITY_HEADERS.items():
            response.headers[name] = value
        response.headers["Cache-Control"] = (
            _NO_STORE if _is_document(path) else _IMMUTABLE_CACHE
        )
        return response


def _is_document(path: str) -> bool:
    normalized = path.replace("\\", "/").lstrip("/")
    return normalized in {"", ".", "index.html"} or normalized.endswith("/index.html")


def static_directory() -> Path:
    """Return the packaged build directory for the dashboard assets."""
    return Path(__file__).resolve().parent / "static"


def browsable_host(host: str) -> str:
    """Return a host an operator can actually open in a browser.

    A bind to an unspecified address (IPv4 or IPv6) serves every interface, which
    is not a browsable address, so it is displayed as loopback.
    """
    candidate = host.strip().strip("[]")
    try:
        if ipaddress.ip_address(candidate).is_unspecified:
            return "127.0.0.1"
    except ValueError:
        return host
    return host


def dashboard_url(host: str, port: int) -> str:
    """Return the dashboard address for the bound host and port."""
    return f"http://{browsable_host(host)}:{port}/dashboard"


def _storage_state(state: DashboardState) -> tuple[dict[str, Any], bool]:
    status = state.engine.record_store.status()
    available = bool(
        state.engine.record_store.enabled
        and status.get("error") is None
        and status.get("alive", True)
    )
    return status, available


def _observed_condition(row: dict[str, Any]) -> str:
    completed = row["completed"]
    if completed == 0:
        return "no_recent_data"
    if row["failed"] == 0:
        return "all_observed_attempts_succeeded"
    if row["succeeded"] == 0:
        return "all_observed_attempts_failed"
    return "mixed_outcomes"


def _unknown_session(session_id: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={
            "error": {
                "message": f"No live session {session_id!r}.",
                "type": "invalid_request_error",
                "param": None,
                "code": "unknown_session",
            }
        },
    )


def theme_path(models_file: Path) -> Path:
    """Return the theme file beside the active models file."""
    return models_file.parent / THEME_FILENAME


def read_theme(models_file: Path) -> tuple[dict[str, Any], str | None]:
    """Return the stored theme, or the default, plus an unreadable-file reason."""
    path = theme_path(models_file)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"version": 1, "seed": DEFAULT_THEME_SEED}, None
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {"version": 1, "seed": DEFAULT_THEME_SEED}, "Could not load dashboard theme."
    try:
        validated = validate_theme_shape(document)
    except (TypeError, ValueError):
        return {"version": 1, "seed": DEFAULT_THEME_SEED}, "Invalid dashboard theme."
    return validated, None


def validate_theme_shape(value: Any) -> dict[str, Any]:
    """Reject unknown keys and anything that is not a hex seed."""
    if not isinstance(value, dict):
        raise TypeError("Theme payload must be an object.")
    unknown = set(value) - {"version", "seed"}
    if unknown:
        raise ValueError(f"Theme payload has unknown keys: {', '.join(sorted(unknown))}.")
    version = value.get("version", 1)
    if type(version) is not int or version != 1:
        raise ValueError("Theme payload version must be 1.")
    seed = value.get("seed")
    if not isinstance(seed, str) or not _HEX_SEED.match(seed.strip()):
        raise ValueError("Theme seed must be a hex color such as #3b66d9.")
    return {"version": 1, "seed": seed.strip().lower()}


def write_theme(models_file: Path, seed: str) -> dict[str, Any]:
    """Persist one seed atomically next to the active models file."""
    document = validate_theme_shape({"version": 1, "seed": seed})
    path = theme_path(models_file)
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=f".{path.name}.", delete=False,
        ) as stream:
            temporary = stream.name
            stream.write(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
        os.replace(temporary, path)
    finally:
        if temporary is not None and os.path.exists(temporary):
            os.unlink(temporary)
    return document


def remove_theme(models_file: Path) -> bool:
    """Delete the theme file, reporting whether one was present."""
    path = theme_path(models_file)
    try:
        path.unlink()
    except FileNotFoundError:
        return False
    return True


def create_dashboard_router(
    state: DashboardState, authorize: Authorize, require_write: RequireWrite
) -> APIRouter:
    """Create dashboard routes bound to mutable gateway state."""
    router = APIRouter()
    cursor_secret = secrets.token_bytes(32)

    @router.get("/dashboard", response_class=FileResponse)
    def dashboard_shell() -> FileResponse:
        """Serve the built shell without the trailing-slash redirect.

        The static mount serves hashed assets under /dashboard/assets; this route
        keeps GET /dashboard itself a 200, as it was before the bundled build.
        """
        index = static_directory() / "index.html"
        if not index.is_file():
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "message": "Dashboard assets are not built in this install.",
                        "type": "invalid_request_error",
                        "param": None,
                        "code": "dashboard_not_built",
                    }
                },
            )
        return FileResponse(
            index, headers={**_SECURITY_HEADERS, "Cache-Control": _NO_STORE}
        )

    @router.get("/v1/routing/activity", response_model=None)
    def routing_activity(
        authorization: str | None = Header(default=None),
    ) -> Response:
        authorize(state.gateway_api_key, authorization)
        activity = state.routing_activity
        if activity is None:
            return Response(
                content=json.dumps({"object": "routing.activity", "scope": "process", "instance_id": "unavailable", "complete": False, "paths": []}),
                media_type="application/json",
                headers={"Cache-Control": _NO_STORE},
            )
        return Response(
            content=json.dumps(activity.snapshot(), separators=(",", ":")),
            media_type="application/json",
            headers={"Cache-Control": _NO_STORE},
        )

    @router.get("/v1/routing/providers/summary", response_model=None)
    def routing_provider_summary(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        authorize(state.gateway_api_key, authorization)
        end = time.time()
        start = end - PROVIDER_WINDOW_SECONDS
        storage, evidence_available = _storage_state(state)
        evidence: dict[str, dict[str, Any]] = {}
        if evidence_available:
            try:
                evidence = state.engine.record_store.provider_summary(
                    window_start=start, window_end=end
                )
            except (StorageUnavailableError, RuntimeError, ValueError) as error:
                storage = {**storage, "error": str(error)}
                evidence_available = False
        providers: list[dict[str, Any]] = []
        metric_names = (
            "attempts", "completed", "succeeded", "failed",
            "incomplete_evidence", "average_latency_ms", "last_outcome_at",
            "last_outcome_ok",
        )
        for profile in state.engine.catalog.providers:
            row: dict[str, Any] = {
                "id": profile.name,
                "type": profile.type,
                "configured": True,
                "has_api_key": bool(profile.api_key),
            }
            if evidence_available:
                metrics = evidence.get(profile.name, {})
                row.update({
                    name: metrics.get(name, 0 if name in metric_names[:5] else None)
                    for name in metric_names
                })
                row["observed_condition"] = _observed_condition(row)
            else:
                row.update(dict.fromkeys(metric_names, None))
                row["observed_condition"] = None
            providers.append(row)
        return {
            "window": {
                "seconds": PROVIDER_WINDOW_SECONDS,
                "start": start,
                "end": end,
                "basis": "upstream_requests.created_at",
            },
            "storage": storage,
            "evidence_available": evidence_available,
            "providers": providers,
        }

    @router.get("/v1/routing/sessions", response_model=None)
    def routing_sessions(
        authorization: str | None = Header(default=None),
        limit: int = Query(default=DEFAULT_PAGE_SIZE),
        cursor: str | None = Query(default=None),
    ) -> dict[str, Any]:
        authorize(state.gateway_api_key, authorization)
        size = _page_size(limit)
        before = _decode_cursor(cursor_secret, cursor, "sessions", None)
        snapshots = state.engine.store.snapshots()
        storage, evidence_available = _storage_state(state)
        evidence: dict[str, dict[str, Any]] = {}
        if evidence_available and snapshots:
            try:
                evidence = state.engine.record_store.latest_session_evidence(
                    tuple(item["session_id"] for item in snapshots)
                )
            except (StorageUnavailableError, RuntimeError, ValueError) as error:
                storage = {**storage, "error": str(error)}
                evidence_available = False
        data: list[dict[str, Any]] = []
        for snapshot in snapshots:
            # The inspection snapshot can contain events. Only project safe list fields.
            item = {key: snapshot.get(key) for key in (
                "session_id", "route", "strategy", "label", "turn_count",
                "updated_at", "first_request_at",
            )}
            if isinstance(snapshot.get("defaulted"), bool):
                item["defaulted"] = snapshot["defaulted"]
            found = evidence.get(snapshot["session_id"], {})
            latest = found.get("latest_request")
            decision = found.get("latest_decision")
            if isinstance(decision, dict):
                item.update(
                    route=decision.get("route") or item.get("route"),
                    provider=decision.get("provider"),
                    upstream_model=decision.get("upstream_model"),
                    strategy=decision.get("strategy") or item.get("strategy"),
                    label=decision.get("label") or item.get("label"),
                )
                # Source must describe the retained selection, even when a
                # legacy decision has no source and its label equals the live one.
                item.pop("defaulted", None)
                if isinstance(decision.get("defaulted"), bool):
                    item["defaulted"] = decision["defaulted"]
            else:
                profile = state.engine.catalog.by_name(str(item.get("route", "")))
                item["provider"] = profile.provider if profile is not None else None
                item["upstream_model"] = profile.model if profile is not None else None
            item["latest_request"] = latest
            data.append(item)
        def order_key(item: dict[str, Any]) -> tuple[int, float, str]:
            latest = item["latest_request"]
            return (
                int(latest is not None),
                latest["received_at"] if latest is not None else item["updated_at"],
                item["session_id"],
            )

        data.sort(key=order_key, reverse=True)
        if before is not None:
            data = [item for item in data if order_key(item) < tuple(before)]
        has_more = len(data) > size
        data = data[:size]
        next_cursor = (
            _encode_cursor(cursor_secret, "sessions", None, list(order_key(data[-1])))
            if has_more else None
        )
        return {
            "storage": storage,
            "evidence_available": evidence_available,
            "data": data,
            "page_size": size,
            "has_more": has_more,
            "next_cursor": next_cursor,
        }

    @router.get("/v1/routing/sessions/{session_id:path}/requests", response_model=None)
    def routing_session_requests(
        session_id: str,
        authorization: str | None = Header(default=None),
        limit: int = Query(default=DEFAULT_PAGE_SIZE),
        cursor: str | None = Query(default=None),
    ) -> dict[str, Any]:
        authorize(state.gateway_api_key, authorization)
        size = _page_size(limit)
        before = _decode_cursor(cursor_secret, cursor, "requests", session_id)
        snapshot = state.engine.store.snapshot(session_id)
        if snapshot is None:
            raise _unknown_session(session_id)
        storage, evidence_available = _storage_state(state)
        retained: list[dict[str, Any]] = []
        last_key: tuple[float, int] | None = None
        has_more = False
        if evidence_available:
            try:
                retained, last_key, has_more = state.engine.record_store.session_request_page(
                    session_id, limit=size,
                    before=(before[1], before[2]) if before is not None else None,
                )
            except (StorageUnavailableError, RuntimeError, ValueError) as error:
                storage = {**storage, "error": str(error)}
                evidence_available = False
        return {
            "session": snapshot,
            "storage": storage,
            "evidence_available": evidence_available,
            "requests": retained if evidence_available else [],
            "page_size": size,
            "has_more": has_more,
            "next_cursor": (
                _encode_cursor(cursor_secret, "requests", session_id,
                               ["request", last_key[0], last_key[1]])
                if has_more and last_key is not None else None
            ),
        }

    @router.get("/v1/dashboard/canvas-layout", response_model=None)
    def dashboard_canvas_layout(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        authorize(state.gateway_api_key, authorization)
        document, error = read_layout(state.models_file)
        return {**document, "read_error": error}

    @router.put("/v1/dashboard/canvas-layout", response_model=None)
    def save_dashboard_canvas_layout(
        body: Any = Body(...),
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        require_write(authorization)
        try:
            return write_layout(state.models_file, body)
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=400, detail={"error": {
                "message": str(error), "type": "invalid_request_error",
                "param": "layout", "code": "invalid_canvas_layout",
            }}) from error
        except OSError as error:
            raise HTTPException(status_code=500, detail={"error": {
                "message": "Could not save canvas layout.", "type": "invalid_request_error",
                "param": None, "code": "canvas_layout_write_failed",
            }}) from error

    @router.get("/v1/dashboard/theme", response_model=None)
    def dashboard_theme(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        authorize(state.gateway_api_key, authorization)
        document, error = read_theme(state.models_file)
        return {**document, "read_error": error}

    @router.put("/v1/dashboard/theme", response_model=None)
    def save_dashboard_theme(
        body: dict[str, Any],
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        authorize(state.gateway_api_key, authorization)
        try:
            document = validate_theme_shape(body)
            write_theme(state.models_file, document["seed"])
        except (TypeError, ValueError) as error:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "message": str(error),
                        "type": "invalid_request_error",
                        "param": "seed",
                        "code": "invalid_theme",
                    }
                },
            ) from error
        except OSError as error:
            raise HTTPException(
                status_code=500,
                detail={"error": {
                    "message": "Could not save dashboard theme.",
                    "type": "invalid_request_error", "param": None,
                    "code": "theme_write_failed",
                }},
            ) from error
        return document

    @router.delete("/v1/dashboard/theme", response_model=None)
    def reset_dashboard_theme(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        authorize(state.gateway_api_key, authorization)
        removed = remove_theme(state.models_file)
        return {"version": 1, "seed": DEFAULT_THEME_SEED, "removed": removed}

    return router
