# Quality guidelines

> Code and verification standards for backend changes.

## Overview

The project targets Python 3.12 or newer, uses `uv` for dependency and command
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
- Read secrets only through declared credential references and the shared root
  resolver (JSON > local dotenv > captured process values). Do not introduce fixed
  provider-specific environment fallbacks or mutate `os.environ` for candidates.

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
- Real credentials in committed code or test fixtures. Raw values in catalog JSON,
  public snapshots, records, logs or error responses. Protected runtime
  `credentials.json` and synthetic test values follow the credential contract.
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

- Provider keys in `tests/conftest.py` are dummy environment values. Because importing `jev_gateway.gateway` constructs the default application, configure an isolated test runtime before test modules are collected. Never rely on an ignored root `models.json` or the operator's runtime directory to make collection pass. Use `jev_gateway/templates/models.example.json` as the strategy-only installation-template source; populated routing tests use `tests/fixtures/task_aware_matrix.json` or shared builders. Default startup initializes absent files; invalid existing configuration and explicit missing file paths retain strict errors. Empty catalogs are valid incomplete configuration states, not substitute fallback data.
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

Streaming SDK doubles must match the installed public resource interface.
LiteLLM's synchronous iterator can expose only asynchronous `aclose()`. Keep
sync-close compatibility coverage, and include an async-only fixture whose
completed-close counter increments after an async cancellation checkpoint.
Assert once-only awaited cleanup under cancellation and after an executing
worker exits, along with terminal delivery, durable capture and failed-send
behavior. A flag set before cleanup completes cannot prove resource closure.

Continuation keys identify normalized assistant content. Separate turns can
produce the same key in one session. Durable captures append per occurrence,
and provider replay matches occurrences in order. Verify the new record for
each completed turn and preservation of earlier records; requiring exactly one
same-key record across the whole session incorrectly rejects repeated answers.
When inspecting completed evidence, the request/outcome window can distinguish
the new capture from older same-content turns.

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
npm --prefix frontend install
scripts/build-frontend.sh
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
npm --prefix frontend install
scripts/build-frontend.sh
uv run pytest -q
uvx pyright
uv build
```

Full tests and source wheel builds require Node.js with npm in addition to
Python and uv. The Release workflow uses Node.js 22 and Python 3.12. Tests that
need the dashboard must request the session-scoped `dashboard_bundle` fixture
from `tests/conftest.py`; it always runs `npm --prefix frontend run build` once,
so it requires npm dependencies installed beforehand. Never assume generated
assets exist in a fresh Git checkout. Installed Release wheels already contain
the dashboard and need no Node.js.

`uv run pytest -q` and `uv build` are the repository's documented verification
commands after the frontend setup above. Pyright is configured by
`pyrightconfig.json` for Python 3.12 and includes both `jev_gateway` and `tests`.
It may be run through `uvx` because it is not declared in the development
dependency group.

When the change touches `frontend/`, generated `jev_gateway/static/`,
`pyproject.toml`, or the `Dockerfile`, add the frontend gates:

```bash
npm --prefix frontend run lint
npm --prefix frontend run test
scripts/build-frontend.sh --check
```

`scripts/build-frontend.sh` installs frontend dependencies and creates the
ignored bundle under `jev_gateway/static/`; release packaging must run it before
the Python tests and `uv build`. `scripts/build-frontend.sh --check` only detects
missing or stale output; it does not build. Do not commit generated bundles. See
[Dashboard and routing configuration](./dashboard-routing-config.md) for the
serving, CSP, and packaging contracts.

For Release packaging, use Python 3.12+ and validate the built artifacts with
the tag that exactly matches `pyproject.toml`:

```bash
uv build
python3 scripts/validate-release.py v0.1.0 dist
```

Substitute the intended version and use an output directory with exactly one
wheel. Keep `pyproject.toml` project metadata, `jev_gateway/__init__.py` package
metadata and the root `jev-gateway` entry in `uv.lock` on the same version. A
version bump must preserve the resolved dependency versions and pass
`uv lock --check`. Validation must confirm wheel metadata, entry points, templates, license,
dashboard shell and referenced assets, and exact file parity with the built
source tree. It also stamps the source installer's release-tag placeholder into
`dist/install.sh`, checks shell syntax, and generates installer and wheel SHA256
sidecars. The workflow uploads those four explicit paths only, after frontend
and Python verification passes. Local validation does not publish a Release.

The tag workflow builds once on Ubuntu and passes those same four artifacts to
installed-wheel smoke jobs on Ubuntu and macOS. Publication depends on both
smoke jobs. Run `scripts/smoke-installed-release.py` with absolute `--wheel` and
`--work-dir` paths and the expected `--version` to reproduce that gate locally.
The script uses separate uv tool, executable, state, and runtime directories,
launches outside the checkout, and verifies a runtime path containing spaces.
Its configuration writes use dummy JSON-only credentials and local APIs; it checks
empty protected store initialization, backups, gateway rotation and safe responses
without calling generation providers. Lifecycle checks include foreground startup,
bundled dashboard assets, running/stopped update behavior, and uninstall preservation.

When splitting publication into a job without checkout, provide repository
context explicitly to `gh release create` through `--repo` or `GH_REPO`.
An explicit repository path passed to `gh api` does not provide that context
to a later command.

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
It excludes generated Trellis integration tooling under `.pi/`, `.agents/`, and
`.trellis/` from application checks. The repository also has authored TypeScript
under `frontend/`; its lint, type, unit and browser gates remain required.

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

Authored application scope: `jev_gateway/`, `frontend/`, `tests/`, `docs/`, `README.md`, `scripts/`, and
the authored `.trellis/spec/backend/` and `.trellis/tasks/` artifacts.

### Why the config also disables rules

`ignore` is honored by every walk-based scan, so the generated tree is already
skipped there. It is not consulted by the explicit diagnostic probe lane
(`lens_diagnostics` with `source: "lsp"` and named `paths`), which resolves the
paths it is given. The only durable lever that also covers that lane is
`rules.<id>.disable`, because a disposition mark is content-anchored and stops
matching as soon as Trellis rewrites the file.

Those twelve ids are ast-grep rules for authored application code. Their current
project-wide disable state does not certify `frontend/`. If changing that policy,
remove the needed id from `rules.generated-trellis-tooling.disable` rather than
excluding authored files. This task does not change the analyzer configuration.

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

## Scenario: release toolchain and lock applicability

### 1. Scope / Trigger

Use when changing hosted frontend installation or release source verification.
Linux optional native records retain their `libc` applicability in the committed
lock. An older npm writer can remove it even when the build and tests pass.

### 2. Signatures

The hosted build selects Node `22.23.3`, then runs these commands before any
frontend installation or inherited fixture build:

```sh
npm install --global npm@11.16.0
test "$(node --version)" = v22.23.3
test "$(npm --version)" = 11.16.0
npm --prefix frontend install
```

### 3. Contracts

Preflight and tag builds use the same asserted toolchain. npm 11.16.0 preserves
`libc`; older writers before 11.11.0 omit it from shrinkwrap serialization.
Keep package membership, versions, resolved URLs, integrity and platform fields.
Use `npm install` for the existing optional-binding contract. Global npm setup
belongs to ephemeral hosted runners and does not authorize an operator upgrade.
The hosted workflow sets `LITELLM_LOCAL_MODEL_COST_MAP: 'True'` so LiteLLM imports
use bundled pricing data. Upstream calls still require the existing test mocks.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Actual Node/npm differs from the pin | Fail before frontend installation |
| Installation or a fixture changes tracked source | Preserve the complete diff; fail the source gate |
| Build or either same-wheel OS smoke fails | Do not publish from that attempt |
| Local diagnostic adds optional WASI records | Retain that difference; do not substitute its lock into CI |

### 5. Good/Base/Bad Cases

Good: the pinned writer retains glibc/musl fields and the original tracked-diff
gate passes. Base: Docker keeps its independent Node 24 Alpine build. Bad:
deleting applicability, restoring the lock after installation, or accepting a
derived private fixed-point lock as proof of the original hosted source.

### 6. Tests Required

Inspect actual version assertions, the complete source gate and final artifact
validator. Both OS smoke jobs must consume the same final wheel and retain
native exits and ordered check evidence. A Node 24/Darwin serializer probe does
not replace Node 22/Linux installation. Preserve failed attempts separately.

### 7. Wrong vs Correct

Wrong: accept green tests after npm has rewritten the tracked lock. Correct:
pin the compatible writer before every inherited npm path and require the
unchanged tracked-source gate to pass before building the final assets.
