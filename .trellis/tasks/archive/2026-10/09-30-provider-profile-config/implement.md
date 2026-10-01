# 配置底座执行清单

- [x] 完整读取 manifest specs，尤其被注入截断的 dashboard-routing-config.md。
- [x] 新增安全展示/私网/metadata 类型与严格 parser，旧格式默认回归。
- [x] 新增局部 credential mapping，改造 CLI 临时 os.environ，衔接 DecisionClient resolver。
- [x] 统一预设 registry；创建 read/validate/apply、文件锁/revision 与恢复服务。
- [x] gateway 管理 GET/validate/PUT，现有 auth/error/reload 边界保持；补充 fixture 与 failure tests。
- [x] 集成 discovery/metadata callbacks，不复制网络适配器；测试 model import、重复 ID、缺失字段和引用保护。
- [x] 跑 focused tests、pyright；父任务集成后全量回归由主 agent 执行。

重点文件：catalog.py、gateway.py、cli/providers.py、cli/config_ops.py、strategy/decision_provider/__init__.py、strategy/registry.py。旧 CLI/login/logout、baseline/overlay 和请求内存快照必须验证；回滚使用保存的旧字节，不覆盖无关工作。依赖：先交付配置契约，发现/前端按父方案消费。

## Verification evidence

Implementation uses `provider_config.py`, `provider_presets.py`, and `config_transaction.py`. CLI and HTTP share the file lock and recovery transaction. Injected catalog credentials reach DecisionClient through DecisionSettings; registry construction remains unchanged. Non-injected decision callers retain call-time environment lookup.

- `uv run pytest -q tests/test_provider_config.py tests/test_provider_management_api.py tests/test_provider_onboarding_integration.py tests/test_catalog.py tests/test_cli_config_ops.py tests/test_cli_providers.py tests/test_cli_review_regressions.py tests/test_decision_provider.py tests/test_strategy_package.py tests/test_routing_overlay.py`: 137 passed.
- `uv run pytest -q tests/test_gateway.py -k 'configuration or reload or upstream_error or model_list'`: 21 passed, 62 deselected.
- `uvx pyright`: 0 errors, 0 warnings, 0 informations.
- Combined configuration and discovery mock run: `uv run pytest -q tests/test_provider_config.py tests/test_provider_management_api.py tests/test_provider_onboarding_integration.py tests/test_catalog.py tests/test_cli_config_ops.py tests/test_cli_providers.py tests/test_cli_review_regressions.py tests/test_decision_provider.py tests/test_strategy_package.py tests/test_routing_overlay.py tests/test_discovery_network.py tests/test_model_discovery.py tests/test_model_metadata.py`: 218 passed.

New tests cover strict fields, provenance import/round-trip, duplicate preservation, conditional writes, two concurrent writers, credential isolation, protected env/recovery material, activation and multi-file write failures, failed restoration, shared credential rejection, candidate queries, write authorization, safe errors, and legacy decision lookup. Parent-owned onboarding integration passes. Full-suite and frontend acceptance remain with the parent.

HTTP metadata queries add each item's normalized `metadata`; discovery adds `metadata_envelope` beside the discovery adapter's candidate `metadata`. Both normalized values use version 1 sources/fields/confirmation. Confirmed evidence must match imported routing values. Presets are a flat canonical array. Revision tokens are process-keyed HMACs; process restart invalidates earlier tokens. An unresolved `.provider-configuration.recovery` file prevents later writes and requires operator recovery; it is retained with mode 0600 when restoration fails.

The exact schema and snapshot/preset/query examples live in the parent-owned handoff path `../09-30-provider-configuration-experience/api-contract.md`, written by this child. Source records retain applicable/reference-only evidence, source units, schema/canonical links, raw effort, input-only limits, structured-output declarations, and strictly projected cache/tier/override pricing. A source round-trip test checks these independently of routing values.

No frontend, discovery adapter, metadata adapter, docs, specs, existing tests, commits, or task archive changes were made by this child.

## Bounded review corrections

The follow-up addresses the six findings from reviewer `e8dd2361`. Source changes
are limited to `config_transaction.py`, `provider_config.py`, `gateway.py`,
`cli/providers.py`, and the read/write guards in `cli/config_ops.py`. A new focused
file, `tests/test_provider_config_regressions.py`, contains 14 regression cases.
The parent API contract records the literal marker, clear fallback, lock order,
and manual recovery boundary. Existing tests, discovery modules, frontend, task
pointers, commits, and archives were not changed in this follow-up.

1. Credential snapshots use installed dotenv record parsing and variable atoms
   with an immutable local mapping. Unmarked records preserve file order,
   duplicates, bare names, defaults, single-quoted expansion, and external/file
   precedence from `override=True`, without changing `os.environ`. Managed values
   containing `${` receive the exact trailing comment
   `# jev-managed-literal-v1` after their escaped single-quoted assignment. Only
   marked records bypass expansion. No alternate credential file is introduced.
   HTTP validate/PUT, CLI login/add, and reload preserve hostile literal values.
2. Reload acquires `reload_lock` then the shared file lock before reads and holds
   both through registry preparation, storage validation, activation, and gateway
   settings. A paused old preparation and concurrent PUT finish with the committed
   display name and key in both the disk catalog and active catalog.
3. CLI add checks the common reference helper before setting a credential.
   Separate gateway, LLM, decision, and `param_env` fixtures reject a shared set
   without changing catalog/env bytes or process environment.
4. Clear removes local assignments while retaining inherited external fallback.
   Disabled decision and required LLM fixtures agree across validate, PUT, read,
   reload, later keep, and candidate clear preview. A required LLM without fallback
   rejects clear before writing. Removing an optional reference keeps credential
   omission semantics even if the external variable exists.
5. A shared read barrier waits for the cooperative lock before checking the
   recovery journal or reading baseline, overlay, credentials, or revision inputs.
   The failure injection replaces the endpoint, fails the env write, and fails
   baseline restoration, leaving the new endpoint beside the old key on disk.
   Startup refuses that state; management returns fixed 500
   `provider_configuration_failed`; reload and routing management return safe 400
   `invalid_configuration`. Discovery and metadata adapter call counts remain zero.
   The previous active catalog and model-list read remain available. Repairing only
   the temporary fixture files and removing its journal permits reload again.
   An owning activation callback can reenter readers after all replacements finish.
6. Event-controlled actual CLI addition pauses after baseline replacement, while
   its journal and file lock are held. Startup and reload readers wait, then receive
   the new provider with its new credential after commit. No sleeps or real HTTP
   calls are used. Related routing read/validate/apply/reset paths follow the same
   lock and journal boundary, so they cannot activate an unresolved mixed catalog.

Verification used `LITELLM_LOCAL_MODEL_COST_MAP=true` for every pytest command and
fake keys/mock adapters only:

- Config/API/CLI/catalog/decision/overlay/onboarding plus discovery-network,
  model-discovery, and metadata files: **257 passed**. Command:
  `uv run pytest -q tests/test_provider_config_regressions.py tests/test_provider_config.py tests/test_provider_management_api.py tests/test_provider_onboarding_integration.py tests/test_catalog.py tests/test_cli_config_ops.py tests/test_cli_providers.py tests/test_cli_review_regressions.py tests/test_decision_provider.py tests/test_decision_matrix.py tests/test_decision_strategy.py tests/test_strategy_package.py tests/test_routing_overlay.py tests/test_discovery_network.py tests/test_model_discovery.py tests/test_model_metadata.py --tb=short`.
- Gateway configuration/reload/upstream-error/model-list selection: **21 passed,
  62 deselected**, using
  `uv run pytest -q tests/test_gateway.py -k 'configuration or reload or upstream_error or model_list' --tb=short`.
- After strengthening recovery error-code assertions, final focused rerun:
  `uv run pytest -q tests/test_provider_config_regressions.py tests/test_provider_onboarding_integration.py --tb=short`:
  **18 passed**, including the main-owned four onboarding cases.
- Full `uvx pyright`: **0 errors, 0 warnings, 0 informations**.
- Scoped `git diff --check`: exit 0.

Recovery remains manual, and uncooperative editors can bypass file locking.
Generic dotenv consumers do not interpret JEV's literal marker. Full-suite,
frontend, and package gates remain with the main session; these results do not
claim those gates or the pending read-only review.

## CLI managed-credential follow-up

The remaining CLI read consumers now use `config_ops.read_snapshot`, which checks
the recovery journal under `configuration_read_lock` before reading the document
and immutable `credential_snapshot`. Show, validate, doctor, reload, status, and
start share that mapping for presence, validation, Authorization, and health
polling. Reload reads once; start polls with its captured host, port, and key.
`load_catalog_env` remains callable and returns a mapping without changing
`os.environ`. Redaction keeps its default environment semantics for existing
callers and accepts explicit credentials for CLI use. Health accepts an explicit
resolved key while retaining its existing positional/env-name interface; an
explicit empty key disables environment fallback. Gateway child processes keep
their own configuration/environment resolution. Recovery errors are safe CLI
JSON errors, and doctor/validate use fixed validation failure text.

Product changes are limited to `cli/config_ops.py`, `cli/main.py`, and
`cli/health.py`; new coverage is `tests/test_cli_managed_credentials.py` (15 cases).
Fixtures cover managed `${CLI_FIXTURE_MISSING}` literals, legacy interpolation,
inherited fallback, empty presence, unchanged process environment, all redaction
projections, reload authentication, repeated start polling, health API
compatibility, journal barriers, and event-controlled coherent writer/read
serialization. All credentials are fake; network and processes are mocked.

- New coverage plus existing CLI config/provider/review tests and the 14 prior
  credential regressions: **41 passed**.
- All nine CLI test files: **42 passed**.
- `uvx pyright jev_gateway/cli/config_ops.py jev_gateway/cli/main.py
  jev_gateway/cli/health.py tests/test_cli_managed_credentials.py`: **0 errors,
  0 warnings, 0 informations**.

Both pytest runs set `LITELLM_LOCAL_MODEL_COST_MAP=true`. Full-suite, frontend,
and package verification remain with the main session.
