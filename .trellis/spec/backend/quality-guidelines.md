# Quality guidelines

> Code and verification standards for backend changes.

## Overview

The project targets Python 3.10 or newer, uses `uv` for dependency and command
execution, pytest for tests, and Pyright for static type checking. Packaging uses
setuptools and exposes `jev-gateway = jev_gateway.gateway:run_gateway`.

There is no repository Ruff, Black, mypy, pytest, tox, or pre-commit
configuration. Do not present an ad hoc formatter run as an enforced project
standard. Follow the existing code style and use Pyright plus the test suite as
the required checks.

## Required code patterns

### Types and data contracts

- Start Python modules with `from __future__ import annotations` after the module
  docstring.
- Annotate public and private function parameters and return values.
- Use frozen dataclasses for immutable request, decision, catalog, record, and
  strategy contract values. Existing examples include `RoutingRequest`,
  `StrategyOutcome`, `StorageSettings`, and the record dataclasses.
- Use `Protocol` for replaceable behavior such as `RoutingStrategy` and
  `RecordStore`.
- Use `Literal` or validated strings for closed configuration choices.
- Treat nested catalog and policy objects as read-only even when Python cannot
  make every contained dictionary immutable.

### Boundaries

- Validate external JSON and static configuration at its entry point.
- Keep FastAPI and `HTTPException` concerns in `gateway.py`.
- Keep strategy implementations behind the registry and strategy contracts.
- Keep provider continuation logic behind `provider.adapter_for()`.
- Keep record delivery best-effort and independent of gateway availability.
- Read secrets only through environment variable names declared by configuration.
  Do not introduce new fixed provider-specific environment fallbacks.

### Language and naming

- Code comments, docstrings, log messages, and error messages use English.
- Chinese and other languages are valid test and signal data, not implementation
  prose.
- Use descriptive functions rather than large explanatory comments. Module and
  class docstrings describe ownership or contract; inline comments explain
  non-obvious compatibility, security, or ordering constraints.
- Follow the naming rules in `directory-structure.md`.

## Forbidden patterns

- Bare `except:` or an unlogged broad exception swallow.
- Mutable default arguments.
- `print()` in package runtime code.
- Plaintext credentials in Python, JSON, tests, logs, or error responses.
- Provider-specific routing branches in `RoutingEngine` when the strategy or
  provider registry can own the behavior.
- Direct SQLite work from request threads.
- Evidence-storage failures that turn successful routing into an HTTP failure.
- Bare upstream model names where a canonical `provider/upstream_model` ID is
  required.
- Scattered `os.getenv()` calls for undeclared fallback configuration.
- Tests that call real upstream APIs.

A broad `except Exception` is permitted at an availability boundary only when it
has a documented fallback, preserves degradation state, or logs the dropped
operation. Examples are record submission and upstream response handling.

## Test organization

Tests live in the flat `tests/` package:

- `tests/test_<module>.py` mirrors core modules.
- Feature-level files cover cross-module contracts, such as
  `test_routing_strategies.py`, `test_provider_adapters.py`, and
  `test_custom_labels.py`.
- `tests/conftest.py` owns shared fixtures.
- `tests/helpers.py` owns catalog builders, route builders, prompts, and
  `FakeClock`.

Tests are function-based and named `test_<expected_behavior>`. Use
`pytest.mark.parametrize` for the same contract across several modes or values.
Use `pytest.raises(..., match=...)` to verify both the exception type and the
specific validation message.

There is no async pytest plugin. Gateway tests define an async request helper,
use `httpx.ASGITransport(app=app)`, and execute it with `asyncio.run()`. Follow
that pattern unless the project deliberately adds an async test plugin.

## Test isolation

Tests must not require network access or real credentials.

- Provider keys in `tests/conftest.py` are dummy environment values.
- Gateway tests replace the `litellm` module with a `types.SimpleNamespace`
  containing a controlled `completion` function.
- Time-sensitive tests use `FakeClock` and explicit `advance()` calls.
- SQLite tests use `tmp_path` and real temporary database files when persistence
  behavior matters.
- Configuration builders in `tests/helpers.py` should be extended rather than
  duplicating full catalog documents in each test.

Test both the successful path and the boundary that owns failure behavior. For a
configuration field, cover parsing, serialization, runtime behavior, and invalid
input. For schema evolution, test a database created with the earlier shape.
For streaming behavior, test both stream consumption and final outcome recording.

## Packaging

`pyproject.toml` declares `license = "AGPL-3.0-or-later"` as a PEP 639 SPDX
string. That syntax needs `setuptools>=77`, so `build-system.requires` must stay
at 77 or higher.

> **Warning**: `uv build` runs in an isolated environment that resolves the
> newest setuptools, so a mismatched floor passes locally and fails for anyone
> building with a pinned or constrained setuptools. On setuptools 76 the build
> dies in `build_sdist` with `project.license` must be `file` or `text`.

When you touch the license, the build backend, or the build requirement floor,
prove the metadata rather than trusting the build exit code:

```bash
uv build
python3 - <<'PY'
import glob, zipfile
whl = sorted(glob.glob("dist/*.whl"))[-1]
with zipfile.ZipFile(whl) as z:
    meta = z.read([n for n in z.namelist() if n.endswith("METADATA")][0]).decode()
    print("\n".join(l for l in meta.splitlines() if l.startswith("License")))
    print([n for n in z.namelist() if "LICENSE" in n.upper()])
PY
```

The wheel must report `License-Expression: AGPL-3.0-or-later` and package the
`LICENSE` file. Do not add a `License ::` Trove classifier; PEP 639 deprecates it
and setuptools 77 or newer rejects it alongside the SPDX `license` field.

To exercise the floor without editing `pyproject.toml`, build with a constraint:

```bash
printf 'setuptools==76.1.0\n' > /tmp/bc.txt
uv build --build-constraints /tmp/bc.txt
```

## Verification commands

Run commands from the repository root.

```bash
uv sync --all-groups
uv run pytest -q
uvx pyright
uv build
```

`uv run pytest -q` and `uv build` are the repository's documented verification
commands. Pyright is configured by `pyrightconfig.json` for Python 3.10 and
includes both `jev_gateway` and `tests`. It may be run through `uvx` because it is
not declared in the development dependency group.

Ruff is not currently configured. You may use `uvx ruff check` as an additional
local diagnostic, but do not make it a completion requirement or run automatic
formatting without a repository configuration and an explicit project decision.

For a focused change, run the narrow test file while iterating, then run the full
suite before completion. Examples:

```bash
uv run pytest -q tests/test_records.py
uv run pytest -q tests/test_gateway.py
uv run pytest -q
```

## pi-lens configuration

The repository root carries `.pi-lens.json`, the project-scoped pi-lens config.
It exists for one reason: this repository contains no hand-written JavaScript or
TypeScript, so the only JS/TS in the tree is the generated Trellis integration
tooling under `.pi/`, `.agents/`, and `.trellis/`. Static analysis of that
regenerated code produces findings nobody can act on.

The config draws one line: content Trellis owns or regenerates is out of scope,
and content this project authors stays in scope.

| Out of scope | Why |
| --- | --- |
| `.pi/**`, `.agents/**` | Trellis-generated Pi and agent integration |
| `AGENTS.md` | Trellis-managed instruction block |
| `.trellis/scripts/**`, `.trellis/agents/**` | Trellis tooling, replaced by `trellis update` |
| `.trellis/spec/guides/**` | Trellis-shipped thinking-guide templates |
| `.trellis/workspace/**` | Machine-written session journals |
| `.trellis/workflow.md`, `.trellis/config.yaml` | Trellis runtime templates |

Still analyzed: `jev_gateway/`, `tests/`, `docs/`, `README.md`, `scripts/`, and
the authored `.trellis/spec/backend/` and `.trellis/tasks/` artifacts.

### Why the config also disables rules

`ignore` is honored by every walk-based scan, so the generated tree is already
skipped there. It is not consulted by the explicit diagnostic probe lane
(`lens_diagnostics` with `source: "lsp"` and named `paths`), which resolves the
paths it is given. The only durable lever that also covers that lane is
`rules.<id>.disable`, because a disposition mark is content-anchored and stops
matching as soon as Trellis rewrites the file.

Those twelve ids are ast-grep rules for hand-written application code. Keep them
in mind if this repository ever gains hand-written JavaScript or TypeScript:
remove the id you need from `rules.generated-trellis-tooling.disable` rather than
excluding the file.

Two limits of the config are known and accepted:

- Numeric TypeScript diagnostics (`2307`, `2580`, and similar) are not rule ids
  and cannot be disabled. Probing `.pi/extensions/trellis/index.ts` directly still
  reports them. They never appear in a normal scan.
- `rules.disable` is project-wide by design; pi-lens offers no path-scoped rule
  policy. That is why it is combined with `ignore` rather than used alone.

## Review checklist

### Contract and layering

- [ ] The change lives in the existing owner module or extension registry.
- [ ] Public request, strategy, record, and response shapes remain consistent
      across parsing, execution, serialization, documentation, and tests.
- [ ] A new strategy does not add implementation-specific branches to the engine.
- [ ] A new provider adapter is registered and accessed through the facade.
- [ ] Catalog and policy objects are not mutated after construction.

### Reliability and security

- [ ] Invalid configuration fails with a precise message before live state is
      replaced.
- [ ] Upstream and streaming failures preserve the established response and
      recording semantics.
- [ ] Storage failure cannot gate chat availability.
- [ ] Logs and errors contain no prompt content, tokens, credentials, or
      continuation payloads.
- [ ] SQL uses bound parameters and schema compatibility is tested.

### Verification

- [ ] New behavior has focused tests, including invalid or degraded paths.
- [ ] `uv run pytest -q` passes.
- [ ] `uvx pyright` passes.
- [ ] `uv build` passes when packaging or the entry point could be affected.
- [ ] Relevant product documentation under `README.md` or `docs/` is updated when
      user-visible configuration or routing behavior changes.

## Reference examples

- Typed immutable contracts: `jev_gateway/strategy/contracts.py`
- Strict configuration parsing: `jev_gateway/catalog.py`
- Test builders and deterministic time: `tests/helpers.py`
- Network-free ASGI tests: `tests/test_gateway.py`
- Real SQLite behavior tests: `tests/test_records.py`
- Static analysis scope: `pyrightconfig.json`
