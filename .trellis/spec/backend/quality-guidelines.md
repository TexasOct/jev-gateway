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

## Scenario: public installed business acceptance

### 1. Scope / Trigger

Use when verifying the published stable 0.1.3 installer, installed package and
Dashboard business flows. The preparation commit and published product commit
are separate inputs. Static preparation approval permits hosted execution;
installed acceptance requires inspected runtime evidence from both OS owners.

### 2. Signatures

`.github/workflows/public-installed-013.yml` accepts `tag`, `expected_source`
and `producer_run`. It checks out preparation and signed product source into
separate directories. The portable owner is:

```sh
python preparation/scripts/public-installed/driver.py \
  --source "$GITHUB_WORKSPACE/signed-source" \
  --work-dir "$RUNNER_TEMP/public installed acceptance-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" \
  --tag v0.1.3 \
  --expected-source 4d56e438e2f817115e65f9c47519f9adc62d41c1 \
  --producer-run 37967881650
```

The driver requires an ordinary hosted runner and a fresh owned directory under
`RUNNER_TEMP`. Local preparation may run `static_check.py` and pure boundary
probes; it must not run the installer or product under this hosted authority.

The provenance and observation boundaries are:

```python
owned_metadata_path(path: Path, prefix: Path) -> Path
capture_diagnostics(location: Path, prefix: Path, output: Path) -> dict
uv_cache_metadata(data: bytes, wheel_ctime_ns: int | None) -> dict
NativeCommands.observe() -> None
NativeCommands.close() -> None
retain_smoke(smoke: Path, evidence: Path, bindings: dict) -> dict
run_original_smoke(commands, argv: list[str], outside: Path, env: dict,
                   smoke: Path, evidence: Path, bindings: dict) -> None
prepare(source: Path, target: Path, package: Path, python: Path, evidence: Path) -> dict
```

### 3. Contracts

Register a newly introduced `workflow_dispatch` file on default `main` before
dispatching a supported preparation ref. Verify the committed helper bytes and
remote SHA. Preserve the signed product tag and use its actual final public
wheel; a preparation build cannot substitute for that artifact.

Before installation, verify the producer attempt and jobs, tag object/source,
stable release/latest identity, service artifact digest, downloaded ZIP bytes,
four public asset identities and complete bytes, and SHA sidecars. API envelope
agreement does not replace byte verification. Isolate tool, executable, state,
cache, Python, runtime and temporary directories; credentials remain synthetic.

`observe_uv.py` forwards unchanged installer arguments and joins the actual
wheel input to installed `direct_url` metadata before temporary input cleanup.
Every successful install/reinstall requires Python 3.12, `sys.prefix`, distribution
and module-origin checks, no source/editable finder, complete package/static and
license parity, full installed RECORD and dependency origins within the owned
resolved prefix. Classify and hash installer additions, entry points and
source-bound bytecode. Do not author `.pth` files or waive unrecorded/escaped
files. Wheel members, total RECORD rows and hashed rows are separate counts:
the final 0.1.3 wheel has 100 members/100 rows/99 hashed rows, including one
unhashed RECORD self-row; 94 product files include 42 static files.

Pin hosted uv to `0.13.0` and verify the observer's actual executable version.
Its local-wheel `uv_cache.json` is an installer addition recorded with a hash and
size. Match the exact dist-info path, compact serialization, unique keys and
the source-backed `timestamp`, `commit`, `tags`, `env` and `directories` fields.
Local-wheel metadata has null commit/tags and empty maps. Timestamp seconds and
nanoseconds must match the input wheel's captured ctime, not the installed
metadata file's time. Each installation captures its own input timestamp;
the later dependency probe retains the initial origin's verified timestamp for
that same prefix. Actual runtime bytes must confirm these bindings.

Capture raw RECORD and owned metadata before classification. Preserve paths,
stat modes, sizes, hashes and raw-byte references even when attestation fails.
The shared component guard rejects symlinks below the trusted lexical/resolved
prefix anchor before reads or descent; platform aliases above that anchor retain
their existing semantics. Traverse lazily within 512 entries, 10 MiB per file/read
and 32 MiB total. Limits, missing RECORD, aliases and escapes leave an explicit
partial failure. Preserve native uv exit separately from probe/join results and
the overall exit. Promote a staged probe to an origin only after its input and
direct-URL join succeeds. Raw `.pth` captures use nonexecutable copy filenames.

Process observations retain operation, available identity and command context.
An exact PID/create-time match to one retained Popen closure with an actual
`poll()` exit can reconcile that observation; unknown identities and unmatched
descendants remain unresolved. Keep raw errors. Observer lifecycle records
started/completed/failed and fatal exception context. Close requires explicit
successful completion and a stopped thread, and independently rejects fatal,
unknown, join, cleanup, unresolved-observation and surviving-listener failures.
A process exit cannot clear a failed observer. These hosted contracts do not
authorize local installation or change strict local custody.

The original smoke invocation keeps its arguments, required-success rule and
1800-second deadline. `run_original_smoke` attempts `retain_smoke` in `finally`
before propagating a native failure, timeout or launch error. Bind retention to
the actual command record and preparation/source/run/input identities. A launch
error without a new record leaves the exit unknown; an earlier command's exit
cannot fill it. Retention errors have separate receipts and stderr, while the
original native exception remains primary. Incomplete retention also rejects a
successful smoke.

Retain nested checks, command 19 and text logs beneath uploaded
`evidence/original-smoke/`. Traverse only owned smoke evidence, runtime homes and
the specified install-state file, using the component guard and lazy budgets:
512 combined entries, 10 MiB per file/read and 32 MiB total. Check regular-file
type and source stat identity around reads. Record source hashes, sizes, modes
and times separately from sanitized-copy hashes and sizes. Sanitize synthetic
smoke secrets, collected credential/dotenv/PID/model values and JSON-escaped
forms. Credentials, database bytes, PID/install state and other runtime files
provide hash/stat diagnostics only. Missing sources, checks or repeat logs,
aliases, malformed sanitization context and budget/copy errors leave completion
false. A failure-time snapshot does not prove preservation across a repeat
installation, and a later attempt cannot supply an earlier attempt's missing
logs or establish whether uv executed.

Observed parent PID is diagnostic context only. It supplies no parent birth,
argv or native exit. The driver does not retain the installed CLI's detached
server Popen handle; status, stop, disappearance and the outer smoke's exit
cannot reconcile that descendant's observation. Keep the exact native-closure
rule until genuine owner receipts exist.

`adapt.py` changes only documented interpreter/template/static/helper/PATH
loading seams. Exact reversal and original assertion AST/text remain required.
The private smoke's headless PATH inventory is exactly `uv`, `sh`, `ps`, `uname`,
`curl`, `python3`, `mktemp`, `rm`, `grep`. The original four tools remain; the
five installer tools support repeat installation after PATH is narrowed. The
verified public installer needs grep for embedded-tag validation, curl/python3
for asset verification and mktemp/rm for its temporary workspace. Shell builtins
require no added executable. Keep the original no-Node assertion and prove that
reversing this tuple restores the entire signed source smoke byte for byte.
Helpers contain no source `jev_gateway`; installed Python and guarded listing
fixtures own actual persistence. Bind collected identities to executed phase
reports. Only the original X1/T3 missing-capture cases may skip before browser
capture, with the exact reason and `setup=passed`, `call=skipped`,
`teardown=passed`. Require precisely these phases, native exit 0 and the same
two identities replayed with all phases passed and zero skips after capture.
Count call reports and passed calls separately.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Public/latest, source, artifact or service digest differs | Fail before installation; retain actual receipts |
| Wheel total is confused with hashed rows | Fail the provenance check; preserve the measured inventory |
| Installed addition/dependency escapes the prefix or lacks classification | Fail; retain complete rows and paths without weakening parity |
| Cache schema, version, input timestamp, RECORD hash or size differs | Fail attestation; retain raw metadata and separate uv/probe exits |
| Metadata root/intermediate component is an in-prefix symlink | Reject before foreign reads; retain failed partial capture |
| Metadata traversal/read/byte budget is exceeded | Stop traversal and reject completion; retain owned RECORD and partial evidence |
| Observer is dead without successful completion, or has fatal/join/cleanup failure | Fail cleanup even if owned command exits are known; persist lifecycle and context |
| Observation identity is unknown or lacks one exact native closure | Keep the error unresolved and fail cleanup |
| Original smoke fails, times out or cannot launch | Attempt bounded sanitized retention; preserve its primary exception and actual or unknown exit |
| Narrowed repeat-install PATH lacks grep | Preserve native failure and tag-validation log; repair only the evidenced adapter tool inventory |
| Retention has missing evidence, unsafe paths/types, invalid context or budget/copy/receipt error | Mark incomplete; preserve separate diagnostics and reject native success |
| Observed parent PID, outer command exit or server disappearance lacks a descendant Popen closure | Keep the descendant observation unresolved |
| Native replacement is deleted or validation fails | Preserve exact credentials, reference maps and file modes; retain the draft behavior assertions |
| Unexpected skip, phase, identity or replay skip | Fail the business gate; retain native exit and complete phase reports |
| Preparation/static checks pass | Permit hosted verification only; keep installed acceptance open |

### 5. Good/Base/Bad Cases

Good: both runners execute the verified public installer, retain all five
installation/reinstallation receipts and original lifecycle assertions, then
inspect actual installed backend/browser and capture replay results. Base:
source checks remain supporting evidence with their original counts. Bad:
accepting a synthetic setup-phase skip for a test that calls `pytest.skip` in
its body, or claiming installed parity from version output alone.

Good: an installer succeeds but attestation fails, so the receipt retains uv
exit 0, probe/overall exit 1, raw metadata and no complete origin. Bad: following
a dist-info directory alias, or accepting a dead observation thread whose
exception was never recorded.

Good: command 19 fails and its sanitized log, checks and bounded runtime
diagnostics are retained before the native failure propagates. Base: a successful
smoke requires complete diagnostics as well as its original assertions. Bad:
copying nested evidence only after a required command returns successfully, or
claiming preservation from a single failure-time snapshot.

Good: both repeat installs retain the nine evidenced tools while the original
no-Node check remains. Bad: interpret `grep: not found` followed by the installer's
invalid-tag message as evidence that the verified public release tag is invalid.

### 6. Tests Required

Require the original application browser identities and separate native
credential supplement, actual selected backend collection/execution sets,
both hosted type gates, exact capture replay, file/database/credential modes
and references, screenshots/traces and owned cleanup receipts. Keep the
source-only cloud component owner and frozen historical controls distinct.
Pure probes must cover authentic call-phase admission, fake setup skips,
missing/duplicate/extra phases, wrong identities/reasons, provenance escapes,
unrecorded additions, count/membership errors and service-digest mismatch.
Preserve every failed attempt; static probes cannot certify actual uv layout.

Challenge root/location/intermediate metadata aliases in capture and classification
with instrumented reads proving no foreign bytes are read. Test platform aliases
above the trusted prefix separately. Bound iterator consumption before overflow
admission and retain RECORD on file/total-budget failure. Model uv/probe launch,
failure, join and successful promotion paths. Exercise normal observer stop,
not-started, incomplete, fatal Exception/BaseException, failed restart, live-thread
and join failure states with fake objects. Fatal failure must still reject after
an exact native closure reconciles an ordinary observation. Preserve old admission
probes and their failures separately from repaired rejection checks.

Exercise the actual retention seam with fake commands and owned synthetic files:
native success/failure/timeout, launch failure without a new command record,
missing checks/repeat log, malformed context, escaped secrets, sensitive-file
exclusion, source/copy modes and hashes, aliases/types and each read budget.
Copy and receipt-write failures must preserve the same primary exception;
incomplete retention must fail native success. Parent-exit, PID reuse, missing
birth, null exit, unrelated and duplicate closure probes stay unresolved. Keep
initial failed reviewer fixtures separate from corrected passing probes.

Inspect the complete verified public installer for the headless release path's
executable requirements. A pure AST check requires the exact nine-tool tuple,
the unchanged no-Node assertion and corresponding installer source fragments.
Mutation probes reject missing grep, added node, added bash and a removed guard;
the exact tuple passes. Retain six adapter reversals and full smoke byte parity.
Fresh parent LSP compares changed Python files with existing fixture diagnostics;
static preparation cannot establish repeat installation or hosted type success.

### 7. Wrong vs Correct

Wrong: require 99 total RECORD rows because 99 entries have hashes, or permit
only setup skips because a synthetic fixture omitted the call report.
Correct: validate the actual archive's complete membership and self-row, then
model the original tests' real phase history with exact identity/reason guards.

Wrong: check only the final metadata file for symlinks, eagerly enumerate before
applying the limit, or equate `thread.is_alive() == False` with successful
observation. Correct: validate every owned component before reading or descent,
use bounded lazy traversal, and require explicit successful observer completion
while retaining fatal failures independently of native process exits.

Wrong: execute a required nested command, then copy its logs after it returns.
Correct: attempt bounded sanitized retention in `finally`, record retention
failure separately and propagate the original native exception unchanged.

Wrong: restore the ordinary system PATH to make repeat installation work, or
remove the no-Node assertion. Correct: preserve the narrow evidenced inventory
and add grep in the existing exact, reversible smoke adapter.
