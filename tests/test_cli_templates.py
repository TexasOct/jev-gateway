from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from jev_gateway.catalog import catalog_from_document
from jev_gateway.cli.install_state import init_runtime, read_state
from jev_gateway.request_facts import extract_request_facts
from jev_gateway.strategy import StrategyRegistry
from jev_gateway.strategy.classifier import DecisionStrategy
from jev_gateway.strategy.decision_provider.base import DecisionResult


def test_packaged_models_template_is_valid_and_has_required_sections() -> None:
    root = Path(__file__).resolve().parents[1]
    document = json.loads((root / "jev_gateway/templates/models.example.json").read_text())
    assert {"gateway", "storage", "strategies"} <= document.keys()
    assert "providers" not in document and "models" not in document
    assert "providers" not in document["decision"]
    assert "policy" not in document


def test_template_preserves_auto_dispatch_and_strategy_policies(monkeypatch: pytest.MonkeyPatch) -> None:
    root = Path(__file__).resolve().parents[1]
    document = json.loads((root / "jev_gateway/templates/models.example.json").read_text())
    current = catalog_from_document(document, "template", {})
    assert current.default_strategy == "task_aware"
    for definition, selection, labels in zip(current.strategies[1:], ("quality_first", "cheapest_adequate"), (("routine", "analysis", "critical"), ("budget", "extended", "exception")), strict=True):
        assert definition.kind == "auto"
        assert definition.policy.mode.value == "cached"
        assert definition.policy.selection == selection
        assert tuple(definition.policy.labels) == labels
        assert tuple(route.reasoning_effort for route in definition.policy.labels.values()) == ("low", "medium", "high")
        assert definition.policy.reasoning.mode == "override"
        assert definition.policy.reasoning.fallback == "medium"
        assert definition.policy.reasoning.effort_by_label == {}

    calls: list[str] = []

    class FakeDecisionClient:
        enabled = True

        def __init__(self, _settings: object) -> None:
            pass

        def evaluate(self, state: object, questions: dict, *, valid=None) -> DecisionResult:
            choice = list(questions["routing_tier"]["criteria"])[-1]
            calls.append(choice)
            answers = {"routing_tier": {"choice": choice}}
            assert valid is not None
            assert valid(answers)
            return DecisionResult("fixture", answers)

    from jev_gateway.strategy import registry
    monkeypatch.setattr(registry, "DecisionClient", FakeDecisionClient)
    document["decision"] = {"enabled": True, "providers": [{"id": "fixture", "protocol": "system_one", "api_base": "https://fixture.invalid/evaluate", "api_key_env": "FIXTURE_DECISION_KEY"}]}
    configured = catalog_from_document(document, "decision enabled", {})
    strategies = StrategyRegistry.from_catalog(configured)
    for name, choice in (("quality", "critical"), ("economy", "exception")):
        strategy = strategies.get(name)
        assert isinstance(strategy, DecisionStrategy)
        assert strategy.classifier.refine(extract_request_facts([{"role": "user", "content": "fixture request"}])).route_label == choice
    assert calls == ["critical", "exception"]


def test_gateway_import_and_pytest_collection_without_cwd_catalog(tmp_path) -> None:
    root = Path(__file__).resolve().parents[1]
    isolated_cwd = tmp_path / "clean-checkout"
    isolated_cwd.mkdir()
    env = os.environ.copy()
    for name in ("JEV_GATEWAY_HOME", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "DECISION_API_KEY"):
        env.pop(name, None)
    env["PYTHONPATH"] = str(root)
    script = (
        "import pathlib, sys; "
        "root = pathlib.Path(sys.argv[1]); "
        "assert not (pathlib.Path.cwd() / 'models.json').exists(); "
        "import pytest; "
        "raise SystemExit(pytest.main(['--collect-only', '-q', str(root / 'tests/test_gateway.py')]))"
    )
    result = subprocess.run(
        [sys.executable, "-c", script, str(root)],
        cwd=isolated_cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "tests collected" in result.stdout or "test collected" in result.stdout
    assert not (isolated_cwd / "models.json").exists()


def test_packaged_env_template_has_no_credential_assignments() -> None:
    root = Path(__file__).resolve().parents[1]
    env_template = (root / "jev_gateway/templates/env.example").read_text()
    assert all(not line.strip() or line.startswith("#") for line in env_template.splitlines())
    assert "jev setup" in env_template


def test_init_preserves_runtime_files(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    (runtime / "models.json").write_text("existing")
    result = init_runtime(runtime, ref="main", method="test")
    assert result["files"]["models.json"] == "preserved"
    assert (runtime / "models.json").read_text() == "existing"
    state = read_state()
    assert state is not None
    assert state["runtime_dir"] == str(runtime.resolve())
