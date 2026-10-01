"""Bounded JSON reads with validated, pinned addresses and verified TLS."""

from __future__ import annotations

import http.client
import ipaddress
import json
import socket
import ssl
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from dataclasses import dataclass
from typing import Any, Callable, Mapping
from urllib.parse import parse_qsl, unquote, urlsplit


class DiscoveryNetworkError(ValueError):
    """Expose only a fixed error category to the management boundary."""

    def __init__(self, code: str) -> None:
        allowed = {
            "invalid_url", "blocked_target", "dns_failed", "timeout", "busy",
            "redirect_rejected", "authentication_failed", "rate_limited",
            "upstream_failed", "response_too_large", "invalid_response",
        }
        self.code = code if code in allowed else "upstream_failed"
        super().__init__(self.code)


@dataclass(frozen=True)
class ValidatedTarget:
    scheme: str
    hostname: str
    port: int
    address: str
    request_target: str
    host_header: str


@dataclass(frozen=True)
class JsonResponse:
    data: Any
    status: int = 200
    headers: Mapping[str, str] | None = None


_DNS_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="jev-discovery-dns")
_DNS_SLOTS = threading.BoundedSemaphore(4)
_PRIVATE_V4 = tuple(ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
_PRIVATE_V6 = ipaddress.ip_network("fc00::/7")
_CREDENTIAL_NAMES = {"key", "api_key", "apikey", "token", "access_token", "secret", "password", "authorization", "credential", "signature", "sig", "auth", "bearer", "accesskey"}


def _resolve(host: str, port: int, timeout: float) -> list[str]:
    if not _DNS_SLOTS.acquire(blocking=False):
        raise DiscoveryNetworkError("busy")

    def work() -> list[str]:
        try:
            return list(dict.fromkeys(str(row[4][0]) for row in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)))
        finally:
            _DNS_SLOTS.release()

    future = _DNS_POOL.submit(work)
    try:
        return future.result(timeout=max(0.001, timeout))
    except FutureTimeout:
        raise DiscoveryNetworkError("timeout") from None
    except OSError:
        raise DiscoveryNetworkError("dns_failed") from None


def _allowed_address(address: str, private: bool) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    if str(ip) in {"168.63.129.16", "fd00:ec2::254"}:
        return False
    # Transition and mapped addresses can hide a different IPv4 destination.
    if isinstance(ip, ipaddress.IPv6Address) and (ip.ipv4_mapped or ip.sixtofour or ip.teredo or ip.scope_id):
        return False
    if ip.is_unspecified or ip.is_multicast or ip.is_link_local:
        return False
    if ip.is_loopback:
        return private
    if ip.is_reserved:
        return False
    if ip.is_global:
        return True
    if not private:
        return False
    return ip.is_loopback or (
        isinstance(ip, ipaddress.IPv4Address) and any(ip in network for network in _PRIVATE_V4)
    ) or (isinstance(ip, ipaddress.IPv6Address) and ip in _PRIVATE_V6)


def validate_target(
    url: str, *, allow_private_network: bool = False, timeout: float = 20.0,
    resolver: Callable[[str, int, float], list[str]] | None = None,
) -> ValidatedTarget:
    """Reject unsafe syntax and every unsafe address in a DNS answer."""
    try:
        if not isinstance(url, str) or len(url) > 8192 or any(ord(c) < 33 or ord(c) == 127 for c in url) or "\\" in url:
            raise ValueError
        parts = urlsplit(url)
        if parts.scheme not in {"https", "http"} or not parts.hostname or parts.username is not None or parts.password is not None or parts.fragment:
            raise ValueError
        if parts.scheme == "http" and not allow_private_network:
            raise ValueError
        if "#" in url or "%" in parts.hostname:
            raise ValueError
        for key, _ in parse_qsl(parts.query, keep_blank_values=True):
            normalized = unquote(key).lower().replace("-", "_")
            if normalized in _CREDENTIAL_NAMES or any(word in normalized for word in ("token", "secret", "password", "credential", "api_key")):
                raise ValueError
        host = parts.hostname.encode("idna").decode("ascii")
        port = parts.port or (443 if parts.scheme == "https" else 80)
        if not 1 <= port <= 65535:
            raise ValueError
        path = parts.path or "/"
        if any(ord(c) < 32 or ord(c) == 127 for c in unquote(path)):
            raise ValueError
    except (ValueError, UnicodeError):
        raise DiscoveryNetworkError("invalid_url") from None
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        addresses = (resolver or _resolve)(host, port, timeout)
    else:
        addresses = [str(literal)]
    if not addresses or any(not _allowed_address(address, allow_private_network) for address in addresses):
        raise DiscoveryNetworkError("blocked_target")
    # HTTP is permitted only for explicitly enabled local/private targets.
    if parts.scheme == "http" and any(ipaddress.ip_address(address).is_global for address in addresses):
        raise DiscoveryNetworkError("blocked_target")
    authority = f"[{host}]" if ":" in host else host
    if port != (443 if parts.scheme == "https" else 80):
        authority += f":{port}"
    return ValidatedTarget(parts.scheme, host, port, addresses[0], path + ("?" + parts.query if parts.query else ""), authority)


class _PinnedConnection(http.client.HTTPConnection):
    def __init__(self, target: ValidatedTarget, deadline: float) -> None:
        super().__init__(target.hostname, target.port, timeout=max(0.001, deadline - time.monotonic()))
        self.target = target
        self.deadline = deadline

    def connect(self) -> None:
        target = self.target
        family = socket.AF_INET6 if ":" in target.address else socket.AF_INET
        sock = socket.socket(family, socket.SOCK_STREAM)
        try:
            sock.settimeout(max(0.001, self.deadline - time.monotonic()))
            # socket.connect receives a numeric address, so DNS cannot change it.
            sock.connect((target.address, target.port))
            if target.scheme == "https":
                sock.settimeout(max(0.001, self.deadline - time.monotonic()))
                sock = ssl.create_default_context().wrap_socket(sock, server_hostname=target.hostname)
            self.sock = sock
        except BaseException:
            sock.close()
            raise


def safe_get_json(
    url: str, *, headers: Mapping[str, str] | None = None,
    allow_private_network: bool = False, timeout: float = 20.0,
    max_bytes: int = 4 * 1024 * 1024,
    resolver: Callable[[str, int, float], list[str]] | None = None,
    connection_factory: Callable[[ValidatedTarget, float], Any] | None = None,
) -> JsonResponse:
    """Fetch one page without proxies, redirects, compression or TLS overrides."""
    deadline = time.monotonic() + min(20.0, max(0.001, timeout))
    connection: Any = None
    timer: threading.Timer | None = None
    try:
        target = validate_target(url, allow_private_network=allow_private_network, timeout=max(0.001, deadline - time.monotonic()), resolver=resolver)
        if time.monotonic() >= deadline:
            raise DiscoveryNetworkError("timeout")
        request_headers = {"Host": target.host_header, "Accept": "application/json", "Accept-Encoding": "identity", "Connection": "close"}
        for key, value in (headers or {}).items():
            if key.lower() in {"host", "connection", "accept-encoding"} or not isinstance(value, str) or any(ord(c) < 32 or ord(c) == 127 for c in key + value):
                raise DiscoveryNetworkError("invalid_url")
            request_headers[key] = value
        connection = (connection_factory or _PinnedConnection)(target, deadline)
        connection.connect()

        def interrupt() -> None:
            try:
                if connection.sock is not None:
                    connection.sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

        timer = threading.Timer(max(0.001, deadline - time.monotonic()), interrupt)
        timer.daemon = True
        timer.start()
        connection.request("GET", target.request_target, headers=request_headers)
        response = connection.getresponse()
        if 300 <= response.status < 400 and response.status != 304:
            raise DiscoveryNetworkError("redirect_rejected")
        if response.status in {401, 403}:
            raise DiscoveryNetworkError("authentication_failed")
        if response.status == 429:
            raise DiscoveryNetworkError("rate_limited")
        if response.status not in {200, 304}:
            raise DiscoveryNetworkError("upstream_failed")
        safe_headers = {name.lower(): value for name, value in response.getheaders() if name.lower() in {"etag", "last-modified", "cache-control"} and len(value) <= 1024 and all(32 <= ord(c) < 127 for c in value)}
        if response.status == 304:
            return JsonResponse(None, 304, safe_headers)
        if response.getheader("Content-Encoding", "identity").lower() != "identity":
            raise DiscoveryNetworkError("invalid_response")
        length = response.getheader("Content-Length")
        if length is not None and (not length.isdigit() or int(length) > max_bytes):
            raise DiscoveryNetworkError("response_too_large")
        # Chunked framing overrides Content-Length in HTTPResponse.
        expected_length = int(length) if length is not None and response.getheader("Transfer-Encoding", "").lower() != "chunked" else None
        body = bytearray()
        while True:
            if time.monotonic() >= deadline:
                raise DiscoveryNetworkError("timeout")
            chunk = response.read1(min(65536, max_bytes + 1 - len(body)))
            if not chunk:
                break
            body.extend(chunk)
            if len(body) > max_bytes:
                raise DiscoveryNetworkError("response_too_large")
        if time.monotonic() >= deadline:
            raise DiscoveryNetworkError("timeout")
        if expected_length is not None and len(body) < expected_length:
            raise DiscoveryNetworkError("invalid_response")
        return JsonResponse(json.loads(body), headers=safe_headers)
    except DiscoveryNetworkError:
        raise
    except (TimeoutError, socket.timeout):
        raise DiscoveryNetworkError("timeout") from None
    except (json.JSONDecodeError, UnicodeError, RecursionError):
        raise DiscoveryNetworkError("invalid_response") from None
    except Exception:
        code = "timeout" if time.monotonic() >= deadline else "upstream_failed"
        raise DiscoveryNetworkError(code) from None
    finally:
        if timer is not None:
            timer.cancel()
        if connection is not None:
            try:
                connection.close()
            except OSError:
                pass
