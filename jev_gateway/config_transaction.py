"""Cooperative configuration locking and recoverable atomic file replacement."""

from __future__ import annotations

import base64
import fcntl
import json
import os
import stat
import tempfile
import threading
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from pathlib import Path

_LOCKS: dict[str, threading.RLock] = {}
_LOCKS_GUARD = threading.Lock()
_HELD = threading.local()


class ConfigurationRecoveryRequired(RuntimeError):
    """Disk configuration cannot be consumed until an operator repairs it."""


def require_readable_configuration(models_file: Path) -> None:
    """Call only while holding the cooperative configuration lock."""
    activating = getattr(_HELD, "activating", set())
    if str(models_file.resolve()) not in activating and (models_file.parent / ".provider-configuration.recovery").exists():
        raise ConfigurationRecoveryRequired("An unresolved configuration recovery file exists.")


@contextmanager
def configuration_read_lock(models_file: Path) -> Iterator[None]:
    """Wait for normal writers, then reject unresolved partial transactions."""
    with configuration_lock(models_file):
        require_readable_configuration(models_file)
        yield


def atomic_bytes(path: Path, content: bytes | None, *, protected: bool = False) -> None:
    if content is None:
        path.unlink(missing_ok=True)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        mode = getattr(_HELD, "restore_modes", {}).get(path)
        if mode is not None:
            os.fchmod(fd, mode)
        elif protected:
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def optional_bytes(path: Path) -> bytes | None:
    try:
        return path.read_bytes()
    except FileNotFoundError:
        return None


@contextmanager
def configuration_lock(models_file: Path) -> Iterator[None]:
    path = models_file.resolve().parent / ".provider-configuration.lock"
    with _LOCKS_GUARD:
        local = _LOCKS.setdefault(str(path), threading.RLock())
    with local:
        held = getattr(_HELD, "paths", set())
        if str(path) in held:
            yield
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            _HELD.paths = held | {str(path)}
            yield
        finally:
            _HELD.paths = held
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)


def replace_configuration(
    models_file: Path,
    changes: Mapping[Path, bytes | None],
    *,
    activate: Callable[[], None] | None = None,
    restore_runtime: Callable[[], None] | None = None,
) -> None:
    """Keep a protected recovery journal until disk and runtime activation succeed."""
    previous = {path: optional_bytes(path) for path in changes}
    previous_modes = {path: stat.S_IMODE(path.stat().st_mode) for path, data in previous.items() if data is not None}
    journal = models_file.parent / ".provider-configuration.recovery"
    if journal.exists():
        raise RuntimeError("An unresolved configuration recovery file exists.")
    content = json.dumps({path.name: base64.b64encode(data).decode() if data is not None else None for path, data in previous.items()}).encode()
    atomic_bytes(journal, content, protected=True)
    try:
        for path, data in changes.items():
            atomic_bytes(path, data, protected=path.name.startswith(".env") or path.name in {"credentials.json", "credentials.json.backup"})
        if activate is not None:
            # All replacements are complete. The owning callback may reenter
            # readers under the same lock without mistaking its journal for an
            # unresolved transaction. Other threads/processes still wait.
            activating = getattr(_HELD, "activating", set())
            _HELD.activating = activating | {str(models_file.resolve())}
            try:
                activate()
            finally:
                _HELD.activating = activating
        journal.unlink()
    except Exception:
        # A failed restore intentionally keeps the journal for operator recovery.
        failures: list[Exception] = []
        for path, data in previous.items():
            restore_modes = getattr(_HELD, "restore_modes", {})
            _HELD.restore_modes = previous_modes
            try:
                atomic_bytes(path, data, protected=path.name.startswith(".env") or path.name in {"credentials.json", "credentials.json.backup"})
            except Exception as error:
                failures.append(error)
            finally:
                _HELD.restore_modes = restore_modes
        if restore_runtime is not None:
            try:
                restore_runtime()
            except Exception as error:
                failures.append(error)
        if failures:
            raise RuntimeError("Configuration recovery failed; protected recovery material was retained.") from None
        journal.unlink(missing_ok=True)
        raise
