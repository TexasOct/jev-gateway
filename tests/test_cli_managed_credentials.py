"""CLI consumers use coherent fake credential snapshots without process mutation."""

from __future__ import annotations

import importlib
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import pytest

from jev_gateway import config_transaction
from jev_gateway.cli import config_ops, health
from jev_gateway.cli.main import main
from jev_gateway.provider_config import env_update
from tests.helpers import single_route_document

cli = importlib.import_module("jev_gateway.cli.main")


@pytest.fixture
def runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    document = single_route_document()
    document["gateway"] = {"host": "127.0.0.1", "port": 8123, "api_key_env": "CLI_FIXTURE_KEY"}
    document["providers"][0]["api_key_env"] = "CLI_FIXTURE_KEY"
    document["providers"][0]["param_env"] = {"organization": "CLI_FIXTURE_KEY"}
    document["decision"] = {"enabled": False, "providers": [{"id": "one", "protocol": "system_one", "api_base": "https://decision.example/evaluate", "api_key_env": "CLI_FIXTURE_KEY"}]}
    (tmp_path / "models.json").write_text(json.dumps(document))
    monkeypatch.setenv("CLI_FIXTURE_KEY", "fake-inherited")
    monkeypatch.delenv("CLI_FIXTURE_MISSING", raising=False)
    return tmp_path


@pytest.mark.parametrize("kind,expected", [("literal", "${CLI_FIXTURE_MISSING}"), ("legacy", "fake-expanded"), ("inherited", "fake-inherited"), ("empty", "")])
def test_cli_presence_validation_and_environment(runtime: Path, monkeypatch: pytest.MonkeyPatch, capsys: Any, kind: str, expected: str) -> None:
    if kind == "literal":
        (runtime / ".env").write_bytes(env_update(None, "CLI_FIXTURE_KEY", expected))
    elif kind == "legacy":
        (runtime / ".env").write_text("BASE=fake-expanded\nCLI_FIXTURE_KEY='${BASE}'\n")
    elif kind == "empty":
        (runtime / ".env").write_text("CLI_FIXTURE_KEY=${CLI_FIXTURE_MISSING}\n")
    before = dict(os.environ)
    snapshot = config_ops.load_catalog_env(runtime / "models.json")
    assert snapshot["CLI_FIXTURE_KEY"] == expected
    with pytest.raises(TypeError):
        snapshot["CLI_FIXTURE_KEY"] = "changed"  # type: ignore[index]
    assert main(["--home", str(runtime), "--json", "config", "show"]) == 0
    output = capsys.readouterr().out
    sections = json.loads(output)["data"]["sections"]
    presence = {"name": "CLI_FIXTURE_KEY", "has_value": bool(expected)}
    assert sections["gateway"]["value"]["api_key_env"] == presence
    assert sections["providers"]["value"][0]["api_key_env"] == presence
    assert sections["providers"]["value"][0]["param_env"]["organization"] == presence
    assert sections["decision"]["value"]["providers"][0]["api_key_env"] == presence
    if expected:
        assert expected not in output
    assert main(["--home", str(runtime), "--json", "config", "validate"]) == (0 if expected else 3)
    validation = capsys.readouterr().out
    assert "fake-" not in validation and "${CLI_FIXTURE_MISSING}" not in validation
    assert main(["--home", str(runtime), "--json", "doctor"]) == 0
    diagnosis = json.loads(capsys.readouterr().out)["data"]
    if expected:
        assert diagnosis["catalog"] == "valid"
        assert diagnosis["credentials"] == [{"name": "CLI_FIXTURE_KEY", "key_present": True}]
    else:
        assert diagnosis["catalog"]["valid"] is False
    assert os.environ == before


def test_reload_auth_uses_one_snapshot(runtime: Path, monkeypatch: pytest.MonkeyPatch, capsys: Any) -> None:
    key = "${CLI_FIXTURE_MISSING}"
    (runtime / ".env").write_bytes(env_update(None, "CLI_FIXTURE_KEY", key))
    before = dict(os.environ)
    original = config_ops.read_snapshot
    reads: list[Any] = []

    def read(path: Path) -> Any:
        result = original(path)
        reads.append(result)
        (runtime / ".env").write_text("CLI_FIXTURE_KEY=fake-later\n")
        document = json.loads(path.read_text())
        document["gateway"]["port"] = 9999
        path.write_text(json.dumps(document))
        return result

    class Response:
        def __enter__(self) -> Response:
            return self

        def __exit__(self, *args: Any) -> None:
            pass

        def read(self) -> bytes:
            return b'{"reloaded": true}'

    class Opener:
        def open(self, request: Any, **kwargs: Any) -> Response:
            assert request.full_url == "http://127.0.0.1:8123/v1/routing/reload"
            assert request.get_header("Authorization") == f"Bearer {key}"
            return Response()

    monkeypatch.setattr(config_ops, "read_snapshot", read)
    monkeypatch.setattr(cli.urllib.request, "build_opener", lambda *args: Opener())
    assert main(["--home", str(runtime), "--json", "config", "reload"]) == 0
    assert len(reads) == 1
    assert key not in capsys.readouterr().out
    assert os.environ == before


@pytest.mark.parametrize("command", ["status", "start"])
def test_health_consumers_keep_snapshot_during_wait(runtime: Path, monkeypatch: pytest.MonkeyPatch, capsys: Any, command: str) -> None:
    key = "${CLI_FIXTURE_MISSING}"
    (runtime / ".env").write_bytes(env_update(None, "CLI_FIXTURE_KEY", key))
    before = dict(os.environ)
    calls: list[Any] = []
    monkeypatch.setattr(cli.process, "status", lambda *args: {"status": "running"})
    monkeypatch.setattr(cli.process, "start", lambda *args: {"status": "starting"})
    monkeypatch.setattr(cli.time, "sleep", lambda *args: None)

    def get(url: str, *, headers: dict[str, str], **kwargs: Any) -> Any:
        import httpx
        assert url == "http://127.0.0.1:8123/healthz"
        assert headers == {"Authorization": f"Bearer {key}"}
        calls.append(headers)
        (runtime / ".env").write_text("CLI_FIXTURE_KEY=fake-later\n")
        return httpx.Response(503 if command == "start" and len(calls) == 1 else 200, json={"status": "ok"}, request=httpx.Request("GET", url))

    monkeypatch.setattr(health.httpx, "get", get)
    assert main(["--home", str(runtime), "--json", command]) == 0
    assert len(calls) == (2 if command == "start" else 1)
    assert key not in capsys.readouterr().out
    assert os.environ == before


def test_probe_retains_legacy_env_argument_and_explicit_empty_override(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    monkeypatch.setenv("CLI_FIXTURE_KEY", "fake-legacy")
    headers_seen: list[Any] = []

    def get(url: str, *, headers: dict[str, str], **kwargs: Any) -> Any:
        headers_seen.append(headers)
        return httpx.Response(200, json={"status": "ok"}, request=httpx.Request("GET", url))

    monkeypatch.setattr(health.httpx, "get", get)
    assert health.probe("localhost", 8123, 1, "CLI_FIXTURE_KEY")["reachable"]
    assert health.probe("localhost", 8123, api_key_env="CLI_FIXTURE_KEY", api_key="")["reachable"]
    assert headers_seen == [{"Authorization": "Bearer fake-legacy"}, {}]


@pytest.mark.parametrize("command", [["config", "show"], ["config", "validate"], ["config", "reload"], ["doctor"], ["status"], ["start"]])
def test_recovery_blocks_cli_before_file_reads_or_network(runtime: Path, monkeypatch: pytest.MonkeyPatch, capsys: Any, command: list[str]) -> None:
    (runtime / ".provider-configuration.recovery").write_text("fake-sensitive-journal")
    monkeypatch.setattr(config_ops, "read_models_document", lambda *args: pytest.fail("read unresolved document"))
    monkeypatch.setattr(config_ops, "credential_snapshot", lambda *args: pytest.fail("read unresolved credentials"))
    monkeypatch.setattr(cli, "probe", lambda *args, **kwargs: pytest.fail("probed unresolved config"))
    monkeypatch.setattr(cli.process, "status", lambda *args: {"status": "running"})
    monkeypatch.setattr(cli.process, "start", lambda *args: pytest.fail("started unresolved config"))
    assert main(["--home", str(runtime), "--json", *command]) == 3
    output = capsys.readouterr().out
    assert json.loads(output)["error"]["code"] == "configuration_recovery_required"
    assert "fake-sensitive" not in output


def test_snapshot_waits_for_coherent_writer(runtime: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = runtime / "models.json"
    replaced, release, attempting = threading.Event(), threading.Event(), threading.Event()
    original = config_transaction.configuration_lock

    @contextmanager
    def observed_lock(target: Path) -> Iterator[None]:
        attempting.set()
        with original(target):
            yield

    def write() -> None:
        with original(path):
            document = json.loads(path.read_text())
            document["gateway"]["api_key_env"] = "CLI_NEW_FIXTURE_KEY"
            path.write_text(json.dumps(document))
            replaced.set()
            assert release.wait(10)
            (runtime / ".env").write_text("CLI_NEW_FIXTURE_KEY=fake-coherent\n")

    monkeypatch.setattr(config_transaction, "configuration_lock", observed_lock)
    with ThreadPoolExecutor(max_workers=2) as pool:
        writer = pool.submit(write)
        assert replaced.wait(10)
        reader = pool.submit(config_ops.read_snapshot, path)
        try:
            assert attempting.wait(10)
            assert not reader.done()
        finally:
            release.set()
        writer.result(10)
        document, credentials = reader.result(10)
    assert credentials[document["gateway"]["api_key_env"]] == "fake-coherent"
