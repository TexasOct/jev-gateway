from __future__ import annotations

import json
import os
import stat
from importlib import import_module

import pytest

from jev_gateway.catalog import load_catalog
from jev_gateway.credentials import credential_path, credential_snapshot, credential_update, credential_values
from jev_gateway.cli.output import CliError
from jev_gateway.cli.paths import runtime_paths
from jev_gateway.cli.providers import add_provider, list_providers, login, logout
from jev_gateway.cli.secrets import upsert_env
from jev_gateway.cli.main import _parser, _provider_assignments
from jev_gateway.provider_presets import PRESETS
from tests.helpers import catalog_document


@pytest.mark.parametrize("source", ["dotenv", "process"])
@pytest.mark.parametrize("dry_run", [False, True])
@pytest.mark.parametrize("secret", [None, "  synthetic-${LITERAL}-provider  "])
def test_cli_add_retains_legacy_gateway_origin_during_candidate_validation(tmp_path, monkeypatch, source: str, dry_run: bool, secret: str | None) -> None:
    reference = "LEGACY_GATEWAY_KEY"
    raw = "  synthetic-review-key  "
    paths = runtime_paths(tmp_path)
    document = catalog_document()
    document["gateway"] = {"api_key_env": reference}
    paths.models.write_text(json.dumps(document))
    legacy = f"{reference}='{raw}'\r\nKEEP='untouched'\r\n".encode() if source == "dotenv" else b"KEEP='untouched'\r\n"
    paths.env.write_bytes(legacy)
    paths.env.chmod(0o640)
    monkeypatch.setenv(reference, raw if source == "process" else "synthetic-process-key")
    store = credential_path(paths.models)
    store.write_bytes(credential_update(None, "EXISTING_JSON_KEY", "synthetic-existing-json-key"))
    store.chmod(0o600)
    original_environment = dict(os.environ)
    before = {path: (path.read_bytes(), stat.S_IMODE(path.stat().st_mode)) for path in (paths.models, paths.env, store)}

    result = add_provider(paths, preset="openai", provider_id="legacy-add", provider_type=None, api_base=None, api_key_env="NEW_PROVIDER_KEY", models=["fixture-model"], tags=[], secret=secret, dry_run=dry_run)
    assert result["providers"] == ["legacy-add"]
    assert result["models"] == ["legacy-add/fixture-model"]
    assert result["secret_set"] is (secret is not None)
    assert raw not in json.dumps(result) and (secret is None or secret not in json.dumps(result))
    assert (paths.env.read_bytes(), stat.S_IMODE(paths.env.stat().st_mode)) == before[paths.env]
    assert credential_snapshot(paths.models)[reference] == raw
    assert os.environ == original_environment
    if dry_run:
        assert result["dry_run"] is True
        assert {path: (path.read_bytes(), stat.S_IMODE(path.stat().st_mode)) for path in before} == before
        assert not paths.models.with_name("models.json.bak").exists()
        assert not store.with_name("credentials.json.backup").exists()
    else:
        saved = json.loads(paths.models.read_text())
        assert saved["providers"][-1]["id"] == "legacy-add"
        assert paths.models.with_name("models.json.bak").read_bytes() == before[paths.models][0]
        catalog = load_catalog(paths.models, allow_missing_credentials=True)
        assert catalog.gateway.api_key == "synthetic-review-key"
        if secret is not None:
            assert catalog.providers[-1].api_key == secret
            assert credential_values(store.read_bytes())["NEW_PROVIDER_KEY"] == secret
            assert credential_values(store.read_bytes())["EXISTING_JSON_KEY"] == "synthetic-existing-json-key"
            backup = store.with_name("credentials.json.backup")
            assert backup.read_bytes() == before[store][0]
            assert stat.S_IMODE(backup.stat().st_mode) == 0o600
            assert stat.S_IMODE(store.stat().st_mode) == 0o600
        else:
            assert (store.read_bytes(), stat.S_IMODE(store.stat().st_mode)) == before[store]


@pytest.mark.parametrize("dry_run", [False, True])
@pytest.mark.parametrize("value", [None, "  synthetic-json-key  "])
def test_cli_add_keeps_gateway_json_and_missing_credential_validation_strict(tmp_path, monkeypatch, dry_run: bool, value: str | None) -> None:
    paths = runtime_paths(tmp_path)
    reference = "STRICT_GATEWAY_KEY"
    monkeypatch.delenv(reference, raising=False)
    document = catalog_document()
    document["gateway"] = {"api_key_env": reference}
    paths.models.write_text(json.dumps(document))
    store = credential_path(paths.models)
    if value is not None:
        paths.env.write_text(f"{reference}='  synthetic-legacy-key  '\n")
        store.write_bytes(credential_update(None, reference, value))
    before = {path: path.read_bytes() if path.exists() else None for path in (paths.models, paths.env, store)}
    with pytest.raises(CliError) as caught:
        add_provider(paths, preset="openai", provider_id="strict-add", provider_type=None, api_base=None, api_key_env="NEW_PROVIDER_KEY", models=["fixture-model"], tags=[], secret="synthetic-provider-key", dry_run=dry_run)
    assert caught.value.code == "invalid_configuration"
    assert caught.value.message == "Provider configuration validation failed."
    assert {path: path.read_bytes() if path.exists() else None for path in before} == before
    assert not paths.models.with_name("models.json.bak").exists()
    assert not store.with_name("credentials.json.backup").exists()


@pytest.mark.parametrize("secret", ["", "  ", "synthetic\nsecret"])
def test_cli_add_rejects_invalid_saved_secret_without_writes(tmp_path, secret: str) -> None:
    paths = runtime_paths(tmp_path)
    paths.models.write_text(json.dumps(catalog_document()))
    before = paths.models.read_bytes()
    with pytest.raises(CliError) as caught:
        add_provider(paths, preset="openai", provider_id="invalid-secret", provider_type=None, api_base=None, api_key_env="NEW_PROVIDER_KEY", models=["fixture-model"], tags=[], secret=secret)
    assert caught.value.code == "invalid_configuration"
    assert paths.models.read_bytes() == before
    assert not credential_path(paths.models).exists()
    assert not paths.models.with_name("models.json.bak").exists()


@pytest.mark.parametrize("preset,options", [("ollama", []), ("lmstudio", ["--api-base", "http://localhost:1234/v1"])])
def test_cli_local_presets_add_without_secret_capture(tmp_path, monkeypatch, capsys, preset, options) -> None:
    cli = import_module("jev_gateway.cli.main")
    paths = runtime_paths(tmp_path)
    paths.models.write_text(json.dumps(catalog_document()))
    monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: True)

    def reject_capture(**kwargs):
        pytest.fail("Local presets must not capture a secret.")

    monkeypatch.setattr(cli, "obtain_secret", reject_capture)
    assert cli.main(["--home", str(tmp_path), "provider", "add", preset, "--model", "fixture", *options]) == 0
    capsys.readouterr()
    provider = json.loads(paths.models.read_text())["providers"][-1]
    assert provider["id"] == preset
    assert provider["icon_id"] == PRESETS[preset]["icon_id"]
    assert "api_key_env" not in provider
    assert not paths.env.exists()
    assert not (tmp_path / "credentials.json").exists()


@pytest.mark.parametrize("configured", [False, True])
def test_cli_local_login_refuses_before_secret_capture(tmp_path, monkeypatch, capsys, configured) -> None:
    cli = import_module("jev_gateway.cli.main")
    paths = runtime_paths(tmp_path)
    document = catalog_document()
    if configured:
        document["providers"].append({"id": "ollama", "type": "ollama_chat"})
    paths.models.write_text(json.dumps(document))
    baseline = paths.models.read_bytes()
    monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: True)

    def reject_capture(**kwargs):
        pytest.fail("Providers without a key reference must not capture a secret.")

    monkeypatch.setattr(cli, "obtain_secret", reject_capture)
    assert cli.main(["--home", str(tmp_path), "provider", "login", "ollama"]) == 2
    assert "has no api_key_env" in capsys.readouterr().err
    assert paths.models.read_bytes() == baseline
    assert not (tmp_path / "credentials.json").exists()


def test_cli_cloud_parameters_keep_declared_references_and_global_defaults(tmp_path, monkeypatch, capsys) -> None:
    cli = import_module("jev_gateway.cli.main")
    paths = runtime_paths(tmp_path)
    paths.models.write_text(json.dumps(catalog_document()))
    monkeypatch.setenv("PROJECT_CREDENTIALS", "fake-service-account-value")
    assert cli.main([
        "--home", str(tmp_path), "--json", "provider", "add", "vertex_ai",
        "--model", "fixture", "--param", "vertex_project=fixture-project",
        "--param", "vertex_location=fixture-region",
        "--param-env", "vertex_credentials=PROJECT_CREDENTIALS", "--set-defaults",
    ]) == 0
    assert json.loads(capsys.readouterr().out)["ok"] is True
    saved = json.loads(paths.models.read_text())
    provider = saved["providers"][-1]
    assert provider["params"] == {"vertex_project": "fixture-project", "vertex_location": "fixture-region"}
    assert provider["param_env"] == {"vertex_credentials": "PROJECT_CREDENTIALS"}
    assert saved["models"][-1]["capabilities"]["tools"] is True
    assert "fake-service-account-value" not in paths.models.read_text()


def test_json_upsert_preserves_legacy_and_protects_backup(tmp_path) -> None:
    env = tmp_path / ".env"
    env.write_text("KEEP=value\nOPENAI_API_KEY=old\n")
    upsert_env(env, "OPENAI_API_KEY", "new-secret")
    assert "KEEP=value" in env.read_text()
    assert "OPENAI_API_KEY=old" in env.read_text()
    credentials = tmp_path / "credentials.json"
    assert json.loads(credentials.read_text())["values"]["OPENAI_API_KEY"] == "new-secret"
    assert stat.S_IMODE(credentials.stat().st_mode) == 0o600
    upsert_env(env, "OPENAI_API_KEY", "rotated-secret")
    backup = tmp_path / "credentials.json.backup"
    assert "new-secret" in backup.read_text()
    assert stat.S_IMODE(backup.stat().st_mode) == 0o600


def test_login_before_add_and_logout(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    paths.home.mkdir(exist_ok=True)
    paths.models.write_text(json.dumps(catalog_document()))
    login(paths, "openai", "OPENAI_KEY_INPUT", "not-to-output")
    assert "not-to-output" in (tmp_path / "credentials.json").read_text()
    before = paths.models.read_bytes()
    result = logout(paths, "openai")
    assert result["removed"] is True
    assert paths.models.read_bytes() == before
    assert "not-to-output" not in (tmp_path / "credentials.json").read_text()


def test_add_requires_models_and_preserves_existing_on_duplicate(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    paths = runtime_paths(tmp_path)
    paths.home.mkdir(exist_ok=True)
    paths.models.write_text(json.dumps(catalog_document()))
    before = paths.models.read_bytes()
    with pytest.raises(CliError, match="already exists"):
        add_provider(paths, preset="openai", provider_id="small-provider", provider_type=None, api_base=None, api_key_env=None, models=["x"], tags=[])
    assert paths.models.read_bytes() == before


def test_provider_list_only_exposes_presence(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    paths.home.mkdir(exist_ok=True)
    monkeypatch.setenv("OPENAI_API_KEY", "hidden")
    paths.models.write_text(json.dumps(catalog_document()))
    assert list_providers(paths)[0]["key_present"] is True
    assert "hidden" not in json.dumps(list_providers(paths))


def test_cli_parser_accepts_every_shared_preset() -> None:
    for preset in PRESETS:
        assert _parser().parse_args(["provider", "add", preset, "--model", "fixture"]).preset == preset


def test_parameter_arguments_preserve_json_and_explicit_environment_names() -> None:
    assert _provider_assignments(["vertex_project=project-name", "timeout=20", 'custom=["one","two"]'], json_values=True) == {"vertex_project": "project-name", "timeout": 20, "custom": ["one", "two"]}
    assert _provider_assignments(["vertex_credentials=PROJECT_CREDENTIALS"], json_values=False) == {"vertex_credentials": "PROJECT_CREDENTIALS"}
    for values in (["missing"], ["x="], ["bad-name=1"], ["timeout=1", "timeout=2"]):
        with pytest.raises(CliError, match="unique NAME=VALUE"):
            _provider_assignments(values, json_values=True)


def test_cli_add_preserves_explicit_provider_parameters_and_identity(tmp_path, monkeypatch) -> None:
    paths = runtime_paths(tmp_path)
    paths.models.write_text(json.dumps(catalog_document()))
    monkeypatch.setenv("FIXTURE_ORGANIZATION", "fake-organization")
    add_provider(paths, preset="openai", provider_id="icon-preset-instance", provider_type=None, api_base=None, api_key_env=None, models=["fixture-model"], tags=[], params={"timeout": 20}, param_env={"organization": "FIXTURE_ORGANIZATION"})
    provider = json.loads(paths.models.read_text())["providers"][-1]
    assert provider["id"] == "icon-preset-instance"
    assert provider["params"] == {"timeout": 20}
    assert provider["param_env"] == {"organization": "FIXTURE_ORGANIZATION"}
    assert "fake-organization" not in paths.models.read_text()


def test_cli_rejects_literal_credentials_in_provider_parameters_without_writing(tmp_path) -> None:
    paths = runtime_paths(tmp_path)
    paths.models.write_text(json.dumps(catalog_document()))
    baseline = paths.models.read_bytes()
    with pytest.raises(CliError, match="validation failed"):
        add_provider(paths, preset="openai", provider_id="bad", provider_type=None, api_base=None, api_key_env=None, models=["fixture-model"], tags=[], params={"aws_secret_access_key": "fake-must-not-persist"})
    assert paths.models.read_bytes() == baseline
