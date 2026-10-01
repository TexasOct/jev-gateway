"""Bounded, process-local in-flight routing activity for monitoring."""

from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass

MAX_REQUESTS = 4096
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ActivityPath:
    strategy: str
    route: str
    provider: str
    upstream_model: str


class ActivityRegistry:
    """Track unfinished attributed upstream requests without payloads."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.instance_id = uuid.uuid4().hex
        self._requests: dict[str, tuple[ActivityPath, bool]] = {}
        self._complete = True

    def begin_request(self, token: str, path: ActivityPath) -> bool:
        return self._begin(token, path, streaming=False)

    def mark_stream(self, token: str) -> bool:
        """Mark an already-tracked request as streaming for diagnostics."""
        try:
            with self._lock:
                current = self._requests.get(token)
                if current is None:
                    self._complete = False
                    return False
                path, _streaming = current
                self._requests[token] = (path, True)
                return True
        except Exception:
            self._degrade()
            return False

    def _begin(self, token: str, path: ActivityPath, *, streaming: bool) -> bool:
        try:
            with self._lock:
                current = self._requests.get(token)
                if current is not None:
                    if current != (path, streaming):
                        self._complete = False
                        return False
                    return True
                if len(self._requests) >= MAX_REQUESTS:
                    self._complete = False
                    return False
                self._requests[token] = (path, streaming)
                return True
        except Exception:
            self._degrade()
            return False

    def finish_request(self, token: str) -> None:
        try:
            with self._lock:
                self._requests.pop(token, None)
        except Exception:
            self._degrade()

    def snapshot(self) -> dict[str, object]:
        try:
            with self._lock:
                counts: dict[ActivityPath, tuple[int, int]] = {}
                for path, streaming in self._requests.values():
                    requests, streams = counts.get(path, (0, 0))
                    counts[path] = (requests + 1, streams + int(streaming))
                paths: list[dict[str, object]] = []
                if self._complete:
                    for path, (requests, streams) in counts.items():
                        paths.append({
                            "strategy": path.strategy,
                            "route": path.route,
                            "provider": path.provider,
                            "upstream_model": path.upstream_model,
                            "in_flight_requests": requests,
                            "in_flight_streams": streams,
                        })
                    paths.sort(key=lambda item: (
                        str(item["strategy"]), str(item["route"]),
                        str(item["provider"]), str(item["upstream_model"]),
                    ))
                return self._projection(self._complete, paths)
        except Exception:
            self._degrade()
            return self._projection(False, [])

    def _projection(self, complete: bool, paths: list[dict[str, object]]) -> dict[str, object]:
        return {
            "object": "routing.activity",
            "scope": "process",
            "instance_id": self.instance_id,
            "complete": complete,
            "paths": paths,
        }

    def _degrade(self) -> None:
        with self._lock:
            self._complete = False
        logger.warning("routing activity unavailable")

    def clear(self) -> None:
        with self._lock:
            self._requests.clear()
