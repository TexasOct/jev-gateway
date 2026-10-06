"""Network safety checks use sockets and responses supplied by fixtures."""

from __future__ import annotations

from io import BytesIO
from typing import Any, cast

import pytest

from jev_gateway import discovery_network as network
from jev_gateway import model_discovery as discovery


@pytest.mark.parametrize("url", [
    "http://public.example/models", "https://user:secret@public.example/models",
    "https://public.example/models#fragment", "https://public.example/models?api_key=secret",
    "https://public.example/models?access-token=secret", "https://public.example/models?%61pi%5Fkey=secret",
    "https://public.example/\r\n", "https://public.example/%0d%0a", "file:///etc/passwd", "https://public.example\\@localhost/models",
])
def test_unsafe_url_is_rejected_before_dns(url: str) -> None:
    def resolver(*args: Any) -> list[str]:
        pytest.fail("Unsafe syntax reached DNS")
    with pytest.raises(network.DiscoveryNetworkError, match="invalid_url"):
        network.validate_target(url, resolver=resolver)


@pytest.mark.parametrize("code", [*range(32), 127])
@pytest.mark.parametrize("component", ["/models/{encoded}", "/models?{encoded}=ok", "/models?x={encoded}"])
def test_decoded_controls_reject_before_dns_or_connection(code: int, component: str) -> None:
    def forbidden(*args: Any) -> Any:
        pytest.fail("Unsafe syntax reached DNS or connection")
    url = "https://public.example" + component.format(encoded=f"%{code:02x}")
    with pytest.raises(network.DiscoveryNetworkError, match="^invalid_url$"):
        network.safe_get_json(url, resolver=forbidden, connection_factory=forbidden)


@pytest.mark.parametrize("scheme", ["http", "https"])
@pytest.mark.parametrize("authority", ["public.example", "[2606:4700:4700::1111]", "[::1]"])
@pytest.mark.parametrize("port", ["", "0", "65536", "-1", "abc", "443.0"])
def test_explicit_invalid_ports_reject_before_dns_or_connection(scheme: str, authority: str, port: str) -> None:
    def forbidden(*args: Any) -> Any:
        pytest.fail("Invalid port reached DNS or connection")
    with pytest.raises(network.DiscoveryNetworkError, match="^invalid_url$"):
        network.safe_get_json(
            f"{scheme}://{authority}:{port}/models", allow_private_network=True,
            resolver=forbidden, connection_factory=forbidden,
        )


@pytest.mark.parametrize("authority,address,private", [
    ("public.example", "8.8.8.8", False),
    ("8.8.8.8", "8.8.8.8", False),
    ("[2606:4700:4700::1111]", "2606:4700:4700::1111", False),
    ("127.0.0.1", "127.0.0.1", True),
    ("[::1]", "::1", True),
])
@pytest.mark.parametrize("port", [None, 443, 1, 8443, 65535])
def test_safe_encoding_and_valid_https_ports_preserve_target(
    authority: str, address: str, private: bool, port: int | None,
) -> None:
    suffix = "" if port is None else f":{port}"
    request_target = "/models/a%20b/%2F/%25?x=hello%20world&cursor=a%2Bb%26c%3Dd&%71=ok&empty="
    target = network.validate_target(
        f"https://{authority}{suffix}{request_target}", allow_private_network=private,
        resolver=lambda *_: [address],
    )
    assert target.port == (443 if port is None else port)
    assert target.address == address
    assert target.request_target == request_target
    assert target.host_header == authority + (suffix if port not in {None, 443} else "")


@pytest.mark.parametrize("authority", ["127.0.0.1", "[::1]"])
@pytest.mark.parametrize("port", [None, 80, 1, 8080, 65535])
def test_private_http_preserves_valid_ports(authority: str, port: int | None) -> None:
    suffix = "" if port is None else f":{port}"
    target = network.validate_target(
        f"http://{authority}{suffix}/models?cursor=a%2Bb", allow_private_network=True,
    )
    assert target.port == (80 if port is None else port)
    assert target.host_header == authority + (suffix if port not in {None, 80} else "")
    assert target.request_target == "/models?cursor=a%2Bb"


@pytest.mark.parametrize("address", ["127.0.0.1", "::1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "fd00::1"])
def test_private_addresses_need_explicit_opt_in(address: str) -> None:
    host = f"[{address}]" if ":" in address else address
    with pytest.raises(network.DiscoveryNetworkError, match="blocked_target"):
        network.validate_target(f"https://{host}/models")
    target = network.validate_target(f"http://{host}/models", allow_private_network=True)
    assert target.address == address


@pytest.mark.parametrize("address", ["169.254.169.254", "fe80::1", "0.0.0.0", "::", "224.0.0.1", "ff02::1", "100.100.100.200", "168.63.129.16", "fd00:ec2::254", "::ffff:127.0.0.1", "2002:7f00:1::"])
def test_dangerous_addresses_stay_blocked_after_opt_in(address: str) -> None:
    host = f"[{address}]" if ":" in address else address
    with pytest.raises(network.DiscoveryNetworkError, match="blocked_target"):
        network.validate_target(f"https://{host}/models", allow_private_network=True)


def test_every_dns_answer_is_checked_and_public_http_stays_blocked() -> None:
    with pytest.raises(network.DiscoveryNetworkError, match="blocked_target"):
        network.validate_target("https://example.test/models", resolver=lambda *_: ["8.8.8.8", "10.0.0.1"])
    with pytest.raises(network.DiscoveryNetworkError, match="blocked_target"):
        network.validate_target("http://example.test/models", allow_private_network=True, resolver=lambda *_: ["8.8.8.8"])


def test_connection_uses_validated_ip_and_original_sni(monkeypatch) -> None:
    seen: dict[str, Any] = {}
    class Socket:
        def settimeout(self, value: float) -> None:
            assert 0 < value <= 20
        def connect(self, address: Any) -> None:
            seen["address"] = address
        def close(self) -> None:
            pass
    class Context:
        def wrap_socket(self, sock: Any, *, server_hostname: str) -> Any:
            seen["sni"] = server_hostname
            return sock
    monkeypatch.setattr(network.socket, "socket", lambda *args: Socket())
    monkeypatch.setattr(network.ssl, "create_default_context", lambda: Context())
    monkeypatch.setattr(network.socket, "getaddrinfo", lambda *args, **kwargs: pytest.fail("Connection resolved hostname again"))
    target = network.validate_target("https://api.example.test:8443/prefix/models", resolver=lambda *_: ["8.8.8.8"])
    connection = network._PinnedConnection(target, network.time.monotonic() + 20)
    connection.connect()
    assert seen == {"address": ("8.8.8.8", 8443), "sni": "api.example.test"}
    assert target.host_header == "api.example.test:8443"


class Response:
    def __init__(self, *, status: int = 200, body: bytes = b'{"data":[]}', headers: dict[str, str] | None = None) -> None:
        self.status = status
        self.body = body
        self.headers = headers or {}
    def getheaders(self) -> list[tuple[str, str]]:
        return list(self.headers.items())
    def getheader(self, name: str, default: Any = None) -> Any:
        return self.headers.get(name, default)
    def read1(self, size: int) -> bytes:
        chunk, self.body = self.body[:size], self.body[size:]
        return chunk


def memory_response(wire: bytes) -> network.http.client.HTTPResponse:
    class MemorySocket:
        def makefile(self, *args: Any, **kwargs: Any) -> BytesIO:
            return BytesIO(wire)
    response = network.http.client.HTTPResponse(cast(network.socket.socket, MemorySocket()))
    response.begin()
    return response


def fetch_response(response: Response | network.http.client.HTTPResponse, **kwargs: Any) -> network.JsonResponse:
    class Connection:
        sock = None
        def connect(self) -> None:
            pass
        def request(self, method: str, target: str, *, headers: Any) -> None:
            assert method == "GET"
            assert target == "/prefix/models"
            assert headers["Host"] == "example.test"
            assert headers["Authorization"] == "Bearer fixture-secret"
        def getresponse(self) -> Response | network.http.client.HTTPResponse:
            return response
        def close(self) -> None:
            pass
    return network.safe_get_json("https://example.test/prefix/models", headers={"Authorization": "Bearer fixture-secret"}, resolver=lambda *_: ["8.8.8.8"], connection_factory=lambda *_: Connection(), **kwargs)


def test_declared_length_truncation_rejects_valid_json_at_eof() -> None:
    response = memory_response(b'HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n{"data":[]}')
    with pytest.raises(network.DiscoveryNetworkError, match="^invalid_response$") as error:
        fetch_response(response)
    assert error.value.code == "invalid_response"


def test_truncated_later_page_preserves_previously_fetched_items() -> None:
    first_body = b'{"data":[{"id":"first"}],"has_more":true,"last_id":"first"}'
    pages = iter([
        memory_response(b"HTTP/1.1 200 OK\r\nContent-Length: " + str(len(first_body)).encode() + b"\r\n\r\n" + first_body),
        memory_response(b'HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n{"data":[]}'),
    ])
    urls: list[str] = []
    def fetch(url: str, **kwargs: Any) -> network.JsonResponse:
        urls.append(url)
        return fetch_response(next(pages))
    result = discovery.discover_models_with_dependencies(
        {"id": "p", "type": "anthropic", "api_base": "https://example.test/prefix"},
        "fixture-secret", imported_ids={"p/first"}, fetch=fetch,
    )
    assert urls == [
        "https://example.test/prefix/v1/models?limit=100",
        "https://example.test/prefix/v1/models?limit=100&after_id=first",
    ]
    assert result["supported"] is True
    assert result["complete"] is False
    assert result["warnings"] == ["invalid_response"]
    assert [item["qualified_id"] for item in result["items"]] == ["p/first"]
    assert result["items"][0]["imported"] is True


@pytest.mark.parametrize("framing", [b"Content-Length: 11", b"", b"Transfer-Encoding: chunked\r\nContent-Length: 100"])
def test_real_http_reader_accepts_complete_json_with_supported_framing(framing: bytes) -> None:
    body = b'{"data":[]}'
    if framing.startswith(b"Transfer-Encoding"):
        body = b"b\r\n" + body + b"\r\n0\r\n\r\n"
    response = memory_response(b"HTTP/1.1 200 OK\r\n" + framing + b"\r\n\r\n" + body)
    assert fetch_response(response).data == {"data": []}


def test_zero_length_body_keeps_json_validation_and_bodyless_304_is_valid() -> None:
    with pytest.raises(network.DiscoveryNetworkError, match="^invalid_response$"):
        fetch_response(memory_response(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n"))
    assert fetch_response(memory_response(b"HTTP/1.1 304 Not Modified\r\nContent-Length: 0\r\n\r\n")).status == 304


@pytest.mark.parametrize("status,code", [(301, "redirect_rejected"), (302, "redirect_rejected"), (307, "redirect_rejected"), (401, "authentication_failed"), (403, "authentication_failed"), (404, "address_not_found"), (405, "listing_unsupported"), (501, "listing_unsupported"), (429, "rate_limited"), (500, "upstream_failed")])
def test_errors_are_fixed_and_redirects_are_never_followed(status: int, code: str) -> None:
    with pytest.raises(network.DiscoveryNetworkError, match=code) as error:
        fetch_response(Response(status=status, body=b"fixture-secret"))
    assert "fixture-secret" not in str(error.value)


def test_stream_size_encoding_and_json_boundaries() -> None:
    assert fetch_response(Response()).data == {"data": []}
    assert fetch_response(Response(status=304)).status == 304
    with pytest.raises(network.DiscoveryNetworkError, match="response_too_large"):
        fetch_response(Response(body=b"x" * 101), max_bytes=100)
    with pytest.raises(network.DiscoveryNetworkError, match="response_too_large"):
        fetch_response(Response(headers={"Content-Length": "101"}), max_bytes=100)
    with pytest.raises(network.DiscoveryNetworkError, match="invalid_response"):
        fetch_response(Response(body=b"fixture-secret"))
    with pytest.raises(network.DiscoveryNetworkError, match="invalid_response"):
        fetch_response(Response(headers={"Content-Encoding": "gzip"}))


def test_transport_exception_text_is_never_returned() -> None:
    def broken(*args: Any) -> Any:
        raise RuntimeError("https://example.test/?secret=fixture-secret")
    with pytest.raises(network.DiscoveryNetworkError, match="upstream_failed") as error:
        network.safe_get_json("https://example.test/models", resolver=lambda *_: ["8.8.8.8"], connection_factory=broken)
    assert "fixture-secret" not in str(error.value)


def test_total_deadline_interrupts_stalled_headers_without_external_network() -> None:
    client, server = network.socket.socketpair()
    class Connection(network.http.client.HTTPConnection):
        def __init__(self, *args: Any) -> None:
            super().__init__("example.test")
        def connect(self) -> None:
            self.sock = client
    try:
        with pytest.raises(network.DiscoveryNetworkError, match="timeout"):
            network.safe_get_json("https://example.test/models", timeout=0.02, resolver=lambda *_: ["8.8.8.8"], connection_factory=Connection)
    finally:
        client.close()
        server.close()


def test_dns_budget_is_part_of_total_timeout(monkeypatch) -> None:
    seen = []
    def resolver(host: str, port: int, timeout: float) -> list[str]:
        seen.append(timeout)
        raise network.DiscoveryNetworkError("timeout")
    with pytest.raises(network.DiscoveryNetworkError, match="timeout"):
        network.safe_get_json("https://example.test/models", timeout=1000, resolver=resolver)
    assert 0 < seen[0] <= 20
