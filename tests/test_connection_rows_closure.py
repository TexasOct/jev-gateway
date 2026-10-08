"""Connection diagnostics rows C1, C3-C10.

These cases extend the existing owner seams: the connection API tests in
``tests/test_connection_diagnostics.py``, the discovery network tests in
``tests/test_discovery_network.py`` and the management boundary tests in
``tests/test_model_management_boundaries.py``. They drive the real ASGI app,
real files and a controlled loopback stub. No real upstream origin is
contacted; the socket guard below blocks anything that is not this test's own
loopback stub.
"""

from __future__ import annotations

import json
import os
import socket
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from typing import Any, cast

import pytest

from jev_gateway import discovery_network as network
from jev_gateway import gateway, model_discovery
from jev_gateway.discovery_network import DiscoveryNetworkError, JsonResponse
from tests.test_model_transaction_publication import sqlite_app, versions
from tests.test_provider_config_regressions import fixture_app
from tests.test_provider_management_api import headers, request
from tests.helpers import single_route_document


WATCHED = ["models.json", "models.json.bak", "routing-overrides.json", ".env", ".env.backup",
           "credentials.json", "credentials.json.backup", ".provider-configuration.recovery",
           "dashboard-theme.json", "routing-canvas-layout.json"]


def snapshot(directory: Path) -> dict[str, bytes | None]:
    return {name: (directory / name).read_bytes() if (directory / name).exists() else None for name in WATCHED}


@contextmanager
def blocked_outbound() -> Iterator[list[tuple[str, int]]]:
    """Deny every socket.connect to a host other than the loopback stub."""
    attempts: list[tuple[str, int]] = []
    allowed: set[tuple[str, int]] = set()
    original = socket.socket.connect

    def guard(self: socket.socket, address: Any) -> Any:
        host, port = (address[0], address[1]) if isinstance(address, tuple) and len(address) > 1 else (address, 0)
        if (str(host), int(port)) not in allowed:
            attempts.append((str(host), int(port)))
            raise AssertionError(f"outbound socket attempted: {address}")
        return original(self, address)

    socket.socket.connect = guard  # type: ignore[method-assign]
    try:
        yield attempts
    finally:
        socket.socket.connect = original  # type: ignore[method-assign]


@contextmanager
def loopback_listing(handler: Any) -> Iterator[str]:
    """Serve a scripted JSON listing on a private loopback port."""
    class Server(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            status, headers, body = handler(self)
            self.send_response(status)
            for name, value in headers.items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Server)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


def connect_api(app: Any, config: gateway.GatewayConfig, body: dict[str, Any]) -> Any:
    return request(app, "POST", "/v1/provider-connection-test", headers=headers(config), json=body)


@pytest.mark.parametrize("action,expected_reference", [("keep", "fake-before"), ("set", "fake-candidate"), ("clear", "test-route-key")])
@pytest.mark.parametrize("selector", ["saved", "candidate"])
def test_c1_saved_and_candidate_credentials_are_immutable_snapshots(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, selector: str, action: str, expected_reference: str,
) -> None:
    """C1: keep/set/clear resolve the same immutable snapshot without saving it."""
    app, config = sqlite_app(tmp_path)
    try:
        used: list[Any] = []

        def capture(url: str, **kwargs: Any) -> JsonResponse:
            used.append(kwargs["headers"].get("Authorization"))
            return JsonResponse({"data": [{"id": "one"}], "has_more": False})

        monkeypatch.setattr(model_discovery, "safe_get_json", capture)
        body: dict[str, Any] = {"provider_id": "test-provider", "credential": {"action": action, **({"value": "fake-candidate"} if action == "set" else {})}}
        if selector == "candidate":
            body = {"provider": {"id": "candidate", "type": "openai", "api_base": "https://candidate.example/v1", "api_key_env": "TEST_PROVIDER_KEY"}, "credential": {"action": action, **({"value": "fake-candidate"} if action == "set" else {})}}
        before, recorded, environment = snapshot(tmp_path), versions(config), dict(os.environ)
        catalog, registry, key = config.engine.catalog, config.engine.strategies, config.gateway_api_key
        response = connect_api(app, config, body)
        assert response.status_code == 200 and response.json()["status"] == "success"
        assert used == [("Bearer " + expected_reference) if expected_reference else None]
        assert response.json()["warnings"][0] == "generation_unverified"
        assert "fake-candidate" not in response.text and "fake-before" not in response.text
        assert snapshot(tmp_path) == before and versions(config) == recorded and dict(os.environ) == environment
        assert config.engine.catalog is catalog and config.engine.strategies is registry and config.gateway_api_key == key
        read = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()
        assert read["models"][0]["name"] == "test-provider/vendor/only"
        assert action != "clear" or read["providers"][0]["has_api_key"] is True
    finally:
        config.engine.close()


def test_c3_empty_listing_succeeds_with_zero_and_unverified_generation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """C3: a complete empty listing is success with count zero, never a failure."""
    app, config = fixture_app(tmp_path)
    monkeypatch.setattr(model_discovery, "safe_get_json", lambda *a, **k: JsonResponse({"data": [], "has_more": False}))
    try:
        response = connect_api(app, config, {"provider_id": "test-provider"})
        assert response.status_code == 200
        assert response.json() == {"provider_id": "test-provider", "status": "success", "scope": "model_listing", "model_count": 0, "warnings": ["generation_unverified", "listing_succeeded"]}
        assert "billing" not in response.text.lower() and "balance" not in response.text.lower()
    finally:
        config.engine.close()


def test_c3_count_matches_the_listing_after_dedup_and_filtering(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """C3/model_count: only unique, valid IDs count."""
    app, config = fixture_app(tmp_path)
    monkeypatch.setattr(model_discovery, "safe_get_json", lambda *a, **k: JsonResponse({"data": [{"id": "a"}, {"id": "a"}, {"id": "b"}, {"id": "b"}, {"id": "c"}], "has_more": False}))
    try:
        response = connect_api(app, config, {"provider_id": "test-provider"})
        assert response.status_code == 200 and response.json()["model_count"] == 3
        assert response.json()["status"] == "success" and response.json()["scope"] == "model_listing"
    finally:
        config.engine.close()


@pytest.mark.parametrize("scenario,status,diagnostic", [
    ("authentication_failed", "authentication_error", "authentication_failed"),
    ("blocked_target", "address_error", "address_unavailable"),
    ("invalid_url", "address_error", "address_unavailable"),
    ("redirect_rejected", "address_error", "address_unavailable"),
    ("dns_failed", "network_error", "upstream_failed"),
    ("timeout", "network_error", "upstream_failed"),
    ("upstream_failed", "network_error", "upstream_failed"),
    ("listing_unsupported", "unsupported", "listing_unsupported"),
    ("invalid_response", "incomplete", "listing_incomplete"),
])
def test_c4_fixed_status_and_diagnostic_vocabulary(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, scenario: str, status: str, diagnostic: str) -> None:
    """C4: each raised category maps to its documented fixed status and code."""
    app, config = fixture_app(tmp_path)
    monkeypatch.setattr(model_discovery, "safe_get_json", lambda *a, **k: (_ for _ in ()).throw(DiscoveryNetworkError(scenario)))
    try:
        response = connect_api(app, config, {"provider_id": "test-provider"})
        assert response.status_code == 200
        assert response.json()["status"] == status and response.json()["warnings"] == ["generation_unverified", diagnostic]
    finally:
        config.engine.close()


def test_c4_authentication_precedes_other_categories(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """C4: authentication wins when an incomplete page also raises auth."""
    app, config = fixture_app(tmp_path)
    calls = {"count": 0}

    def fetch(url: str, **kwargs: Any) -> JsonResponse:
        calls["count"] += 1
        if calls["count"] == 1:
            return JsonResponse({"data": [{"id": "one"}], "has_more": True, "last_id": "one"})
        raise DiscoveryNetworkError("authentication_failed")

    monkeypatch.setattr(model_discovery, "safe_get_json", fetch)
    try:
        response = connect_api(app, config, {"provider_id": "test-provider"})
        assert response.json()["status"] == "authentication_error"
        assert response.json()["model_count"] == 1
    finally:
        config.engine.close()


def test_c4_upstream_auth_is_semantic_not_dashboard_401(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """C4: an upstream auth failure stays HTTP 200 distinct from a local 401."""
    app, config = fixture_app(tmp_path)
    monkeypatch.setattr(model_discovery, "safe_get_json", lambda *a, **k: (_ for _ in ()).throw(DiscoveryNetworkError("authentication_failed")))
    try:
        upstream = connect_api(app, config, {"provider_id": "test-provider"})
        assert upstream.status_code == 200 and upstream.json()["status"] == "authentication_error"
        assert "WWW-Authenticate" not in upstream.headers
        local = request(app, "POST", "/v1/provider-connection-test", json={"provider_id": "test-provider"})
        assert local.status_code == 401 and local.json()["error"]["code"] == "invalid_api_key"
    finally:
        config.engine.close()


@pytest.mark.parametrize("provider_type,expected", [("openai", "Authorization"), ("deepseek", "Authorization"), ("anthropic", "x-api-key")])
def test_c5_header_authentication_per_provider_and_no_url_credential(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, provider_type: str, expected: str) -> None:
    """C5: each provider authenticates by header; the key never enters the URL."""
    app, config = fixture_app(tmp_path)
    seen: dict[str, Any] = {}

    def capture(url: str, **kwargs: Any) -> JsonResponse:
        seen["url"] = url
        seen["headers"] = kwargs["headers"]
        return JsonResponse({"data": [{"id": "one"}], "has_more": False})

    monkeypatch.setattr(model_discovery, "safe_get_json", capture)
    try:
        body = {"provider": {"id": "candidate", "type": provider_type, "api_base": "https://candidate.example/v1", "api_key_env": "TEST_PROVIDER_KEY"}, "credential": {"action": "set", "value": "fake-candidate"}}
        response = connect_api(app, config, body)
        assert response.status_code == 200
        assert "fake-candidate" not in seen["url"] and "fake-candidate" not in response.text
        assert seen["headers"].get(expected) in {"Bearer fake-candidate", "fake-candidate"}
        assert "anthropic-version" in seen["headers"] if provider_type == "anthropic" else "anthropic-version" not in seen["headers"]
    finally:
        config.engine.close()


def test_c5_unsupported_transport_never_calls_generation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """C5: an unsupported transport performs no listing, generation or evaluation call."""
    app, config = fixture_app(tmp_path)
    monkeypatch.setattr(model_discovery, "safe_get_json", lambda *a, **k: pytest.fail("unsupported transport reached the network"))
    monkeypatch.setattr(model_discovery, "discover_models", lambda *a, **k: pytest.fail("unsupported transport reached discovery"))
    try:
        response = connect_api(app, config, {"provider": {"id": "cloud", "type": "bedrock", "api_base": "https://cloud.example/v1", "api_key_env": "CLOUD_KEY"}, "credential": {"action": "clear"}})
        assert response.status_code == 200
        assert response.json() == {"provider_id": "cloud", "status": "unsupported", "scope": "model_listing", "model_count": 0, "warnings": ["generation_unverified", "discovery_unsupported"]}
    finally:
        config.engine.close()


@pytest.mark.parametrize("url", [
    "ftp://example.test/models",
    "https://user:pass@example.test/models",
    "https://example.test/models?api_key=secret",
    "https://example.test/models#fragment",
    "https://example.test/mo\\dels",
    "https://example.test:0/models",
    "https://example.test:/models",
])
def test_c6_dangerous_url_shapes_reject_before_connect(url: str) -> None:
    """C6: scheme, userinfo, query secret, fragment, backslash and port abuse reject."""
    with pytest.raises(DiscoveryNetworkError):
        network.validate_target(url, resolver=lambda *_: ["8.8.8.8"])


@pytest.mark.parametrize("address", ["169.254.169.254", "fe80::1", "0.0.0.0", "::", "224.0.0.1", "ff02::1", "100.100.100.200", "::ffff:127.0.0.1", "2002:7f00:1::"])
def test_c6_metadata_unspecified_multicast_link_local_reject(address: str) -> None:
    """C6: cloud-metadata, unspecified, multicast, link-local and mapped targets reject."""
    with pytest.raises(DiscoveryNetworkError, match="blocked_target"):
        network.validate_target(f"https://[{address}]/models" if ":" in address else f"https://{address}/models", allow_private_network=True)


def test_c6_private_and_loopback_need_explicit_opt_in() -> None:
    """C6: a private address honours the strict per-provider opt-in."""
    with pytest.raises(DiscoveryNetworkError, match="blocked_target"):
        network.validate_target("https://10.0.0.1/models", resolver=lambda *_: ["10.0.0.1"])
    target = network.validate_target("https://10.0.0.1/models", allow_private_network=True, resolver=lambda *_: ["10.0.0.1"])
    assert target.address == "10.0.0.1"


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
def test_c6_redirects_are_rejected_before_following(status: int) -> None:
    """C6/C7: every redirect status is rejected, never followed to a new address."""
    class Response:
        def __init__(self) -> None:
            self.status = status

        def getheaders(self) -> list[tuple[str, str]]:
            return [("Location", "https://evil.example/v1/models")]

        def getheader(self, name: str, default: Any = None) -> Any:
            return default

    class Connection:
        sock = None

        def connect(self) -> None:
            pass

        def request(self, *a: Any, **k: Any) -> None:
            pass

        def getresponse(self) -> Response:
            return Response()

        def close(self) -> None:
            pass

    with pytest.raises(DiscoveryNetworkError, match="redirect_rejected"):
        network.safe_get_json("https://example.test/models", headers={"Authorization": "Bearer synthetic"}, resolver=lambda *_: ["93.184.216.34"], connection_factory=lambda *_: Connection())


def test_c7_connects_to_the_validated_numeric_address_without_re_resolving(monkeypatch: pytest.MonkeyPatch) -> None:
    """C7: connect uses the validated IP; the hostname stays for TLS/SNI and Host."""
    seen: dict[str, Any] = {}

    class Sock:
        def settimeout(self, value: float) -> None:
            assert 0 < value <= 20

        def connect(self, address: Any) -> None:
            seen["address"] = address

        def close(self) -> None:
            pass

    class Ctx:
        def wrap_socket(self, sock: Any, *, server_hostname: str) -> Any:
            seen["sni"] = server_hostname
            return sock

    monkeypatch.setattr(network.socket, "socket", lambda *a: Sock())
    monkeypatch.setattr(network.ssl, "create_default_context", lambda: Ctx())
    monkeypatch.setattr(network.socket, "getaddrinfo", lambda *a, **k: pytest.fail("connection re-resolved the hostname"))
    target = network.validate_target("https://api.example.test:8443/prefix/models", resolver=lambda *_: ["93.184.216.34"])
    network._PinnedConnection(target, network.time.monotonic() + 20).connect()
    assert seen["address"] == ("93.184.216.34", 8443)
    assert seen["sni"] == "api.example.test"
    assert target.host_header == "api.example.test:8443"


def test_c8_truncated_body_before_declared_length_is_incomplete() -> None:
    """C8: a body shorter than Content-Length becomes incomplete, never accepted."""
    class Sock:
        def makefile(self, *a: Any, **k: Any) -> Any:
            return BytesIO(b"HTTP/1.1 200 OK\r\nContent-Length: 50\r\n\r\n{\"data\":[]}")

    response = network.http.client.HTTPResponse(cast(network.socket.socket, Sock()))
    response.begin()
    with pytest.raises(DiscoveryNetworkError, match="^invalid_response$"):
        network.safe_get_json("https://example.test/models", resolver=lambda *_: ["8.8.8.8"], connection_factory=lambda *_: type("C", (), {"sock": None, "connect": lambda self: None, "request": lambda self, *a, **k: None, "getresponse": lambda self: response, "close": lambda self: None})())


def test_c8_page_and_model_and_cursor_bounds_are_enforced(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """C8: the page limit, the model limit and a looping cursor return bounded totals."""
    app, config = fixture_app(tmp_path)
    pages = {"count": 0}

    def fetch(url: str, **kwargs: Any) -> JsonResponse:
        pages["count"] += 1
        return JsonResponse({"data": [{"id": f"m{pages['count']}"}], "has_more": True, "last_id": f"m{pages['count']}"})

    monkeypatch.setattr(model_discovery, "safe_get_json", fetch)
    try:
        response = connect_api(app, config, {"provider_id": "test-provider"})
        assert response.status_code == 200 and response.json()["status"] == "incomplete"
        assert response.json()["model_count"] <= model_discovery.MAX_MODELS
        assert pages["count"] <= model_discovery.MAX_PAGES + 1
    finally:
        config.engine.close()


def test_c8_looping_cursor_stops_bounded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """C8: a repeated cursor ends the walk instead of looping forever."""
    app, config = fixture_app(tmp_path)
    calls = {"count": 0}

    def fetch(url: str, **kwargs: Any) -> JsonResponse:
        calls["count"] += 1
        return JsonResponse({"data": [{"id": "one"}], "has_more": True, "last_id": "one"})

    monkeypatch.setattr(model_discovery, "safe_get_json", fetch)
    try:
        response = connect_api(app, config, {"provider_id": "test-provider"})
        assert calls["count"] <= 3
        assert response.json()["status"] == "incomplete"
    finally:
        config.engine.close()


def test_c9_semaphore_and_dns_capacity_release_on_every_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """C9: slots and DNS capacity return to the pool after success and failure."""
    app, config = fixture_app(tmp_path)
    monkeypatch.setattr(model_discovery, "safe_get_json", lambda *a, **k: JsonResponse({"data": [{"id": "one"}], "has_more": False}))
    before = model_discovery._SLOTS._value  # type: ignore[attr-defined]
    try:
        for _ in range(6):
            assert connect_api(app, config, {"provider_id": "test-provider"}).status_code == 200
        assert model_discovery._SLOTS._value == before  # type: ignore[attr-defined]
        # Saturate the pool and confirm the slot is reclaimed after the failure.
        acquired = [model_discovery._SLOTS.acquire(blocking=False) for _ in range(before)]
        assert all(acquired)
        try:
            assert connect_api(app, config, {"provider_id": "test-provider"}).json()["warnings"] == ["generation_unverified", "upstream_failed"]
        finally:
            for _ in acquired:
                model_discovery._SLOTS.release()
        monkeypatch.setattr(model_discovery, "safe_get_json", lambda *a, **k: (_ for _ in ()).throw(DiscoveryNetworkError("upstream_failed")))
        for _ in range(6):
            connect_api(app, config, {"provider_id": "test-provider"})
        assert model_discovery._SLOTS._value == before  # type: ignore[attr-defined]
    finally:
        config.engine.close()


def test_c9_busy_state_is_isolated_and_never_imports(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """C9: a busy probe reports network_error without importing, and chat still serves."""
    app, config = sqlite_app(tmp_path)
    monkeypatch.setattr(model_discovery, "safe_get_json", lambda *a, **k: (_ for _ in ()).throw(DiscoveryNetworkError("busy")))
    try:
        before, recorded = snapshot(tmp_path), versions(config)
        response = connect_api(app, config, {"provider_id": "test-provider"})
        assert response.status_code == 200 and response.json()["status"] == "network_error"
        assert snapshot(tmp_path) == before and versions(config) == recorded
        assert request(app, "POST", "/v1/routing/preview", headers=headers(config), json={"model": "test-provider/vendor/only", "messages": [{"role": "user", "content": "busy"}]}).status_code in {200, 503}
    finally:
        config.engine.close()


@pytest.mark.parametrize("hostile", [
    "RuntimeError: Authorization: Bearer synthetic-private-key at https://private.example/v1",
    "DiscoveryNetworkError: api_key=synthetic-private-key",
])
def test_c10_hostile_exception_text_never_reaches_the_response(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, hostile: str) -> None:
    """C10: raw exception text, endpoints and keys never surface."""
    app, config = fixture_app(tmp_path)
    monkeypatch.setattr(model_discovery, "safe_get_json", lambda *a, **k: (_ for _ in ()).throw(RuntimeError(hostile)))
    try:
        response = connect_api(app, config, {"provider_id": "test-provider"})
        assert response.status_code == 200
        assert "synthetic-private-key" not in response.text and "private.example" not in response.text
        assert response.json()["status"] == "network_error"
        assert "RuntimeError" not in response.text and "DiscoveryNetworkError" not in response.text
    finally:
        config.engine.close()


def test_c10_failed_candidate_never_activates(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """C10: a failed probe leaves the saved provider and catalog untouched."""
    app, config = fixture_app(tmp_path)
    monkeypatch.setattr(model_discovery, "safe_get_json", lambda *a, **k: (_ for _ in ()).throw(DiscoveryNetworkError("authentication_failed")))
    try:
        catalog, key = config.engine.catalog, config.gateway_api_key
        response = connect_api(app, config, {"provider": {"id": "candidate", "type": "openai", "api_base": "https://candidate.example/v1", "api_key_env": "CANDIDATE_KEY"}, "credential": {"action": "set", "value": "fake-candidate"}})
        assert response.status_code == 200 and response.json()["status"] == "authentication_error"
        assert config.engine.catalog is catalog and config.gateway_api_key == key
        read = request(app, "GET", "/v1/provider-configuration", headers=headers(config)).json()
        assert all(provider["id"] != "candidate" for provider in read["providers"])
        assert "fake-candidate" not in json.dumps(read)
    finally:
        config.engine.close()
