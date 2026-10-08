# 模型契约业务闭合：worktree 后继核对（followup）

本文件是 Contracts 后继在独立 worktree 内追加的 child 报告。上一版 `verification-worktree-business.md` 原样保留，本文件只新增，不修改上一版任何字节。全部结论来自被动 stdlib/Git/JSON/hash 只读核对和已允许的 AST/源码定位，没有运行测试、collection、lint、typecheck、build、install、browser、network 或 native 进程，没有调用 candidate/helper/control/auditor，没有进程查询、信号或全局枚举。

## 身份与边界

| 项 | 值 |
| --- | --- |
| 分支 | `work/contracts-business-closure` |
| HEAD | `2ace03a3651b2fd848a8212207af1699b1f6734d`（与父级复核时点一致） |
| 唯一可写仓库 | `/Users/texas/Workspace/jev-gateway-contracts-business` |
| 主仓库 | `/Users/texas/Workspace/jev-gateway`（只读，本上下文未写入/未 stage/未 commit/未 checkout） |
| 新增文件 | `.trellis/tasks/10-05-admin-model-contracts/verification-worktree-business-followup.md` |

本后继不宣称自己是 `trellis-implement`，只作为一般代理在限定只读边界内做文档映射与计划。正式业务状态仍为 15 项继承 PASS / 43 项 OPEN，本文件不提升为任何独立业务 PASS；本文件只提供当前 58 行逐行映射依据与下一阶段 UNRUN 命令计划，不签发运行通过结论。

## 父级指明需纠正的结论

父级 `worktree-first-delivery-review.md` 对上一版提出以下纠正，本文件逐条落实：

1. 旧候选 `9a476c6` 的 44/3/7/2/2 处置不能充当当前 58 行处置。本文件按原 58 行 ID、原顺序，逐行映射 current owner、具名断言/证据、source candidate、binding 匹配、精确剩余 predicate。
2. `catalog._finite_number` 只检查 exact int/float 的有限性；非负条件属于 `_metadata_number`。上一版把两者混为一处，本文件纠正。
3. 六旧缺陷因源码存在不等于运行通过，源码存在不能替代失败恢复与 SQLite 断言的执行证明。
4. F5 已有 `provider-configuration.md` 契约与 `tests/test_metadata_tail_contracts.py::test_effort_raw_bound_and_runtime_canonical_duplicates` 覆盖，不需再问 runtime 16 决策。
5. M13 已有契约与 `test_modality_reference_roundtrip_is_detached` / `test_invalid_modality_source_not_projected_or_persisted` 及 `catalog.model_metadata` 的 reference persistence/ownership/code 断言。
6. Models B07 是真实 browser/API/file/SQLite/SDK 链路，不是 synthetic HTTP 概括；需读实际 B07 driver/assertions/source binding，判断 X1/T3/X5/X6 哪些 predicate 精准复用、哪些仍缺。
7. Suppliers 已 accepted/archive，旧 handoff 缺失不再适用。
8. D4 十失败为 fixture 缺 provider，59 断言及 catalog-only 修正版保持，原 126 两次 revoked/no third 不变。

## 纠正一：`_finite_number` 与 `_metadata_number` 分工

读当前 `jev_gateway/catalog.py`：

```python
def _metadata_number(value: Any) -> bool:        # catalog.py:764
    return _finite_number(value) and value >= 0

def _finite_number(value: Any) -> bool:          # catalog.py:768
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False
```

- `_finite_number` 只做两件事：`type(value) in (int, float)`（拒绝 bool/str/其他）和 `math.isfinite`（拒绝 NaN/±Inf/溢出）。它不检查非负。
- `_metadata_number` 在 `_finite_number` 之上追加 `value >= 0`，即“有限且非负”。
- 价格字段（`profile_from_dict` 的 `cost_value`、`_metadata_source_fields` 的数值分支、`model_metadata` 的 metadata 价格）走 `_metadata_number`，要求非负。
- `quality` 走独立分支 `catalog.py:1153 if not _finite_number(quality)`，只要求有限，不要求非负、不要求 0..1。这正好印证父级对 F4 的说明：`quality=2.5` 在历史候选 `9a476c6` 因 `catalog.py:1137` 的 0..1 上界被拒，而当前源码 `catalog.py:1153` 只做 `_finite_number`，已去掉 0..1 上界。上一版此处写错，已纠正。

## 纠正二：六旧缺陷“源码存在 ≠ 运行通过”

上一版把六历史候选缺陷（候选 `9a476c6` 上复现）说成“当前源码已修复”，并以“源码存在”作为修复证据。父级指出这是不成立的：`defer_config_publication` 存在且由网关写路径调用，但源码存在不能替代失败恢复与 SQLite 断言的执行证明。

本文件将六项改为“源码层面已定位到处理点，但运行证明缺失”，并把运行证明落到下一节的 UNRUN 命令计划。六项与当前源码处理点：

| 历史缺陷 | 当前源码处理点（已定位，未运行验证） |
| --- | --- |
| E4 嵌套确认文本控制 | `catalog.py:928-930`（`model_metadata` 对每个 source 文本项执行 `ord(c) < 32 or ord(c) == 127` 检查，排除 `applicable/fields/pricing/source_reasoning_effort/input_modalities` 之外的键）；`catalog.py:945`（顶层 `confirmation` 的 `confirmed_at`/`method` 同样检查） |
| F4/X7 quality 范围 | `catalog.py:1153` 只 `_finite_number(quality)`，无 0..1 上界 |
| T8 激活失败残留版本 | `decision.py:493 defer_config_publication()`，`decision.py:508 _register_config` 在 `self._defer_config_publication` 时延后 `record_store.register_config` |
| M4 缺 Anthropic effort 归一 | `model_metadata.py:193` `value = levels if levels or all(type(v) is bool for v in declarations.values()) else None` |
| M2 transport 适用性 | `model_metadata.py:469` `compatible` 映射 + `_serving_matches` 先拒不兼容 transport |
| C6 编码查询与端口 | `discovery_network.py:122 netloc.endswith(":")`、`:127 1 <= port <= 65535`、`:116` 解码 query 键值 `ord(c) < 32 or ord(c) == 127` |

这些处理点只证明“源码里有对应分支”，不证明“该分支在真实失败路径上按契约恢复且 SQLite/config_versions/registry/catalog/字节不变”。运行证明见 UNRUN 计划。

## 纠正三：F5 已有契约与断言，不再问 runtime 16 决策

父级指出 F5 的契约已经固化，不需要再向父级问“是否把 16 上限扩展到 runtime/字段”。

- 契约：`.trellis/spec/backend/provider-configuration.md` 第 214-226 行——“a raw source has at most 16 entries; runtime accepts its seven legal tokens and uses canonical duplicate handling. Non-null known/confirmed effort fields use that same canonical order and deduplication in a copied envelope.”
- 断言：`tests/test_metadata_tail_contracts.py::test_effort_raw_bound_and_runtime_canonical_duplicates`。
  - raw source 16 项：`model_metadata(envelope)` 接受 `source_reasoning_effort: ["low"] * 16`，16+1 项 `pytest.raises(ValueError, match="original effort")`。
  - runtime 重复规范化：`capabilities.reasoning_effort = ["high","low"] * 17` 与 `metadata.fields.reasoning_effort.value = ["low"] * 17` 经 import 后持久化为 canonical `["low","high"]` 与 `["low"]`，caller 记录不变。
- 旧冻结超限失败（`i/test_F5_E4_effort_list_over_limit_rejected_http` 及其两 probe）保留原样；它与当前契约的 oracle 不同：旧 probe 假设“runtime/字段也受 16 上限”，而当前契约只把 16 上限放在 raw source，runtime 七 token 走 canonical 去重。这是两种不同 oracle，不是当前契约违反。旧冻结断言不改不删。

因此 F5 的处置从“contract gap / 需决策”改为：**raw source 16 上限与 runtime canonical 去重已有契约和断言，剩余谓词是“这些断言在当前检查点源码上的实际运行证据”，不是契约决策。** 见 UNRUN 计划。

## 纠正四：M13 已有契约、断言与 source ownership

父级指出 M13 不能继续称为“未定义契约”，`catalog.model_metadata` 已有 reference persistence/ownership/code 断言。

- 参考持久化：`model_metadata.py` `_models_dev`（`input_modalities` 写为 `evidence["input_modalities"] = {"value": list(modalities), "source_field": "modalities.input"}`），在 `catalog.model_metadata` 的 `source_keys` 与 `source["input_modalities"]` 校验中保留。
- ownership：`catalog.py:891-897` 校验 `input_modalities` 形状 `{"value","source_field"}`、modalities 白名单 `{"text","image","audio","video","pdf"}`、`len <= 5`、唯一、path 控制字符。
- 断言：`tests/test_metadata_tail_contracts.py::test_modality_reference_roundtrip_is_detached`（额外模态不成为 routing fact，`input_modalities` reference 持久化回读且 detached）与 `test_invalid_modality_source_not_projected_or_persisted`（非法模态不投影不持久化）。

因此 M13 的处置从“contract gap / 需真实 HTTP 交叉验证”改为：**“额外模态作为 reference evidence 保留、不扩展 runtime capability”已有源码 ownership 与回归断言，剩余谓词是这些断言在当前检查点源码上的实际运行证据，以及 audio/video/pdf 全声明组合是否已被枚举。** 见 UNRUN 计划。上一版“静态 schema 无法表达”的说法不准确，已纠正。

## 纠正五：Models B07 与 X1/T3/X5/X6 的精确复用判定

父级否定了上一版“synthetic HTTP 概括全部 B07”的说法，要求读实际 B07 driver/assertions/source binding。已读：

- 归档企业复核 `archive/2026-10/10-05-admin-model-workspace/research/acceptance-current-business/status-404-recheck-report.md`：fresh 4/4，392 源绑定，HEAD `55d71f0`，源码摘要 `33aebc929f6740e2194a50477120ad60b7cf1133983e34a908c5684f394ab768`。
- 父级 `research/models-status-404-parent-verification.md`：已接受 fresh 4/4 与 392 源绑定，四个 PNG 已核，六表 SQLite 只读与 25 join 已核。
- Models `acceptance.md` 的 `ba6d4bfe` 后继段（“Completed 723d4ad acceptance and 9a476c6 combined-source recheck”）B07 ledger：真实 browser + 真实 loopback gateway（端口 44842，源 HTTP 44843）+ 真实 file/SQLite，浏览器管理请求不被 route-mock；B01-B08 真实 backend-to-gateway ledger。
- `contracts-handoff.md`：明确“Parent Contracts X1/T3 ... remain open”。

逐项判定：

- **X1（真实 UI-to-ASGI 同一提交链路）**：B07 的 `live-confirmed-results.json`、`records.json`、`live-http.jsonl` 记录了真实 browser 通过实际 gateway 完整提交（validate→PUT→GET→disk→reload）的同一链路，这是 X1 所需的核心证据，可以被 X1 精准复用。但 Models 侧自身在 handoff 中把“own SQLite-to-Contracts X1/T3 joins”标为 OPEN（`acceptance.md` 末尾“full owned SQLite-to-Contracts X1/T3 joins ... remain OPEN”），即 Models 侧的 SQLite 六表 join 证据尚未与 Contracts 的 config_versions/reload 谓词对齐。因此 X1 剩余谓词是：**把 B07 的真实 UI-to-ASGI 提交 byte/源绑定与 Contracts 的 `config_versions`、revision、catalog reload 断言在同一最终候选上对齐，并核对 392 源绑定 hash 与当前 `2ace03a3` 是否一致。** 祖先 commit/归档说明不能代替 byte comparison。
- **T3（真实 UI-to-ASGI baseline/overlay 同窗）**：B07 的 overlay membership/priority 保留谓词在 Models B07 里以“baseline policy 与 overlay byte content survive”的形式覆盖（B05/B07 ledger），但 B07 未针对 Contracts X3/T3 的“baseline 与 overlay 两种 membership 同窗、未编辑 baseline membership/priority 不被写回”做逐字断言。T3 剩余谓词是**在最终候选上补充 baseline/overlay 同窗逐字断言**，不能仅靠 B07 的“overlay byte content survives”概括。
- **X5（连接测试语义 + TS/client 对齐）**：B07 不拥有 connection-test 语义（那是 Contracts/Suppliers 的后端 C 矩阵 + `frontend/src/shared/api/client.ts::testProviderConnection` 的 TS 形状）。B07 的“真实 gateway + 真实 ASGI”证据对 X5 只有“客户端不发 secret、真实 ASGI 返回固定 code”的间接支持。X5 剩余谓词是**连接测试六 status 语义（C4 固定 code 词汇表）在真实 ASGI 上的当前源码运行**，加 `client.ts` 的 `ProviderConnectionResult` 形状对齐。见 UNRUN。
- **X6（client 不重试写入 + 409 判读）**：`client.ts` 的 `request` 只在 `(init.method ?? "GET") === "GET"` 且 401 时重试，写入（validate/saveProviders 的 POST/PUT）从不自动重试——这是 X6“客户端收到 409/保存失败不能视为成功、读取重试不能重复提交写入”的直接 source binding。B07 的 `live-http.jsonl` 只记录一次 PUT 也间接支持。X6 剩余谓词是**“提交成功后读取失败只重试 GET、不再发 PUT”的 source 断言在当前 `client.ts`/`useProviderManagement.ts` 的运行验证**（前端 unit 已有对应用例，运行证据见 UNRUN）。

综上：X1/T3/X5/X6 均可部分复用 B07 真实链路证据，但均不能在当前检查点直接判为闭合，剩余谓词分别是“byte/源绑定对齐（X1）、baseline/overlay 同窗逐字断言（T3）、连接测试语义运行（X5）、写入不重试运行（X6）”。两者已在 Models 侧 handoff 里明示“X1/T3 remain open”，这佐证了上述剩余谓词不是本后继臆造。

## 六旧缺陷 + F5/M13 的当前运行证据缺口（逐条）

以下每一项“源码有处理点，运行证据未在当前检查点取得”。运行验证是下一阶段 UNRUN 的主体，不是本文件可单方面签发的结论。

| 行 | 源码处理点 | 缺失的运行证据 |
| --- | --- | --- |
| E4 | `catalog.py:928-945` | `test_confirmation_controls_rejected`、`test_http_*` 当前检查点上跑，确认嵌套文本控制 400 且字节不变 |
| F4/X7 | `catalog.py:1153` | `test_legacy_quality_survives_unrelated_edits`、`test_write_quality_exception_cannot_be_forged` 当前检查点上跑，确认 `2.5` 无关编辑保留、越界新增拒绝 |
| T8 | `decision.py:493/508` | `defer_config_publication` 后 `config_versions` 在激活失败时不变、恢复 journal 完成后才发布（SQLite 断言） |
| M4 | `model_metadata.py:193` | `test_native_effort_declaration_states` 当前检查点上跑，Anthropic supported 无 levels → unknown(None) |
| M2 | `model_metadata.py:469` | `test_explicit_transport_channel_relationship` 当前检查点上跑，错误 transport 不 certify OpenAI 价 |
| C6 | `discovery_network.py:122-127` | `validate_target` 对 `:0`/`:`/编码 CRLF/NUL/DEL 拒绝 |
| F5 | `catalog.py:905-907` + `test_effort_raw_bound_and_runtime_canonical_duplicates` | 16 上限 + runtime canonical 去重当前运行 |
| M13 | `catalog.py:891-897` + `test_modality_reference_roundtrip_is_detached` / `test_invalid_modality_source_not_projected_or_persisted` | reference 持久化/detached/非法不投影当前运行，及 audio/video/pdf 全组合是否枚举 |

## 58 行逐行映射（当前检查点 `2ace03a3`）

说明：下表按原 58 行 ID、原顺序。每行给出四列：current owner（现在谁拥有该谓词的主体）、具名断言/证据（已存在、可用于验证的 node/test/report/源定位）、source candidate（当前源码中对应的候选处理点）、binding 匹配与精确剩余 predicate（当前检查点尚未闭合、需要运行证据或跨 owner 对齐的最小谓词）。“已具备源码/断言”只表示定位到，不表示运行通过；正式 15 PASS / 43 OPEN 不变。

| ID | current owner | 具名断言 / 证据 | source candidate | binding 匹配与剩余 predicate |
| --- | --- | --- | --- | --- |
| X1 | gateway/config owner + Models B07 | B07 `live-confirmed-results.json`、`records.json`、`live-http.jsonl`；`test_http_whole_model_revision_and_authorization` | `gateway.py` management route，`provider_config.py` transaction | B07 真实 UI-to-ASGI 提交链可复用，但需 392 源绑定 hash 对齐 `2ace03a3` 且 SQLite-to-Contracts join（Models 已标 OPEN）尚未对齐；byte comparison 未完成 |
| X2 | catalog/profile owner | `test_legacy_defaults_and_new_display_fields`、`test_http_whole_model_revision_and_authorization` | `catalog.py profile_from_dict` 的 display/enabled/cache 分支 | 现有断言覆盖；剩余“routing snapshot 全 null/省略组合未逐项”，运行未在本检查点取得 |
| X3 | shared TS + python metadata owner | `model.test.ts` flat-to-runtime、`test_provider_management_api` query envelope、`test_X3_all_python_types_draft_field_sets` | `catalog.py` 字段映射，`frontend/src/shared/api/types.ts` | 全 Python/TS/helper 字段集合差集未独立枚举；运行未在本检查点取得 |
| X4 | metadata owner | `test_models_dev...`、`test_M3_units...`、`test_M8_E3...` | `model_metadata.py` 三 source adapter | outer stale/time/source normalization 组合未闭合 |
| X5 | connection-test owner + shared client | `test_connection_status_uses_safe_discovery_categories`、`test_C4_remaining_exact_diagnostics`、`client.ts::testProviderConnection` | `gateway.py` connection-test route，`discovery_network.py` | C4 固定 code 词汇表的当前源码运行未取得；client `ProviderConnectionResult` 形状对齐见 X6 |
| X6 | shared client owner | `client.ts` request 401-only-GET 重试；`test_get_validate_apply_and_revision_conflict` | `client.ts`，`useProviderManagement.ts` | 写入不自动重试的 source 已定位；“成功后读取失败只 GET 不重发 PUT”的运行验证未在本检查点取得 |
| X7 | docs/contracts owner | `docs/http-api.md`、`docs/models-config.md`、spec 与 types/HTTP 比较 | 文档 + 契约 | F4/X7 的 quality 兼容已在 `catalog.py:1153` 去掉 0..1；最终文档收口 + F4 运行未取得；仍为 REWORK 类（历史候选）待运行复验 |
| T1 | config transaction owner | `test_validation_and_revision_conflict_write_nothing`、`test_T1_sqlite...` | `config_transaction.py`、`decision.py` | validation 前后字节/version 不变的运行证据未取得；full session/pin/config-version 窗口未覆盖 |
| T2 | catalog identity owner | `test_whole_model_edit_preserves_overlay_and_identity`、`test_http_whole_model...` | `catalog.py` canonical ID / rename 拒绝 | 非法 ID × layout/session/default 引用全组合未闭合 |
| T3 | catalog overlays owner + Models B07 | `test_whole_model_edit_preserves_overlay_and_identity`、B07 B05/B07 overlay byte | `catalog.py` baseline/overlay 交易 | baseline/overlay 同窗逐字断言未补充；B07 只“overlay survive”概括 |
| T4 | catalog overlays owner | `test_ownership` 四参数、`test_whole_model...` | `catalog.py` | no-overlay/多次/foreign tags 端到端未闭合 |
| T5 | config transaction owner | `test_concurrent_writers...`、`test_T5_second_revision...` | `config_transaction.py` | prepare 期间非合作写、restart token 真实 HTTP 组合未覆盖 |
| T6 | config transaction owner | `test_credentials_mixed_transaction...`、`test_T6...` | `provider_config.py` 批量事务 | 凭证 SET × 非法后操作 × config versions 窗口未覆盖 |
| T7 | config transaction owner | `test_T7_candidate_failures_before_any_write` | `config_transaction.py` registry prepare | storage restart/registry failure 全模型操作组合未覆盖 |
| T8 | decision owner | `test_activation_failure_restores...`、`test_T1_T6_T8_sqlite...`、`defer_config_publication` `decision.py:493` | `decision.py _register_config` 延后 | `defer_config_publication` 存在但 SQLite config_versions 不变与 journal 恢复后发布未运行验证 |
| T9 | config/CLI owner | `test_normal_cli_writer...`、`j/test_T9_cli...` | `reload/persistence` 锁序 | 全 CLI/model read/probe/reload 事件组合未覆盖 |
| T10 | import owner | `test_import_provenance...`、`j/test_T10...` | `provider_config.py` import | 同批次 × cross-provider × 完整 manual evidence 组合未覆盖 |
| T11 | privacy/metadata owner | `test_hostile_payload...`、`test_F2/F3/F4/F5...` | `catalog.py` 字段边界 | 未知 cost/capabilities/metadata/redacted 全组合未覆盖 |
| T12 | auth owner | `test_malformed_management_body...`、`test_no_gateway_key...` | `gateway.py` 授权序 | 历史数组 body 400 先于 401/403 的 REWORK 已在后继候选修复，当前源码运行未取得 |
| F1 | catalog display owner | `test_legacy_defaults...`、`test_F1_display...` | `catalog.py display_fields` | 完整 display 边界 + 全 enabled JSON 类型未覆盖 |
| F2 | catalog price owner | `test_F2_raw_nonfinite...`、`test_cache_source_units...` | `catalog.py profile_from_dict cost` + `_metadata_number` | NaN/overflow 原始 JSON + 每字段省略/null/0 round-trip 未覆盖 |
| F3 | catalog limit owner | `test_F3_explicit_limits` | `catalog.py context/output` | 1/大值/两 null 与 confirmed evidence 全组合未覆盖 |
| F4 | catalog quality owner | `test_legacy_quality_survives_unrelated_edits`、`test_loading_quality_stays_strict` | `catalog.py:1153 _finite_number` | `_finite_number` 已修正（无 0..1）；运行证据未取得，历史候选 F4 REWORK 待复验 |
| F5 | metadata owner | `test_effort_raw_bound_and_runtime_canonical_duplicates` | `catalog.py:905-907` + `model_metadata.py _levels` | 契约已固化（raw 16 / runtime canonical）；运行证据未取得，旧冻结超限 oracle 保留说明见纠正三 |
| D1 | routing owner | `test_disabled...`、`x/test_unset_global...` | `decision.py` / engine | 真实 preview 同 case 与单模型全禁用合同未收口 |
| D2 | routing owner | `test_D2_disabled...` | `decision.py` selector 注册 | 三策略 × 三选择全矩阵未覆盖 |
| D3 | routing owner | `test_disabled_default...`、`test_D3...` | `decision.py` default | 空 pool/default 原子调整 × disabled 组合未覆盖 |
| D4 | routing owner | `test_D1_D3_D4_real_put...` | `decision.py` session pin | 见下方“D4 fixture 说明”；真实 PUT 后 sticky/cached/escalate/adaptive/fresh 未覆盖 |
| D5 | routing owner | `test_whole_model_edit...`、`j/test_D5...` | `decision.py` / reasoning | 价格排序/derived effort/temperature/cache-only estimate 全同窗未覆盖 |
| M1 | metadata matching owner | `test_matching_is_exact...`、`test_M1_M2...` | `model_metadata.py _find_models_dev` | 全 latest/base/version/同名片段组合未覆盖 |
| M2 | metadata transport owner | `test_explicit_transport_channel_relationship`、`test_M2...` | `model_metadata.py:469 compatible/_serving_matches` | transport 兼容源码已定位（当前已修），运行证据未取得；历史候选 M2 REWORK 待复验 |
| M3 | metadata units owner | `test_models_dev_prices...`、`test_M3...` | `model_metadata.py _number multiplier` | 全非法值 × 源字段组合未覆盖 |
| M4 | metadata effort owner | `test_native_effort_declaration_states` | `model_metadata.py:193` | supported 无 levels → unknown 源码已定位，运行证据未取得；OpenAI ID-only negative 未覆盖 |
| M5 | metadata snapshot owner | `test_local_backup_is_read...`、`test_M5...` | `model_metadata.py _load_litellm_snapshot` | 错 provider/省略 output 未覆盖 |
| M6 | metadata pricing owner | `test_M6_M7...` | `model_metadata.py _price_details` | batch/flex/priority/audio/weekday/unknown 变体未覆盖 |
| M7 | metadata provenance owner | `test_manual_and_source_confirmation...`、`test_M7...` | `model_metadata.py` source dates | confirmed_at/source_updated_at 全 reload/restart 时间窗未覆盖 |
| M8 | metadata merge owner | `test_source_conflicts...`、`test_M8_E3...` | `provider_config.metadata_envelope` | 非法 candidate conflict 非空仍为历史 REWORK；正常 source null 已符合，运行未覆盖 |
| M9 | metadata refresh owner | `test_manual_and_source_confirmation...`、`test_M9...` | `model_metadata.py lookup` + `provider_config` | detached/conflict/failure 建议 × persisted confirmed 组合未覆盖 |
| M10 | metadata cache owner | `test_cache_conditional...`、`test_M7_M10...` | `model_metadata.py MetadataClient` | 四源总容量 + 全 cache-control + busy 组合未覆盖 |
| M11 | metadata failure owner | `test_M9_M11_M12...`、`test_lookup...` | `model_metadata.py lookup` | invalid JSON/oversize/backup/busy/partial 真实 HTTP 未覆盖 |
| M12 | privacy owner | `test_concurrent_fetch_is_coalesced...`、`api/test_hostile_payload...` | `model_metadata.py _source` headers | 三类 secret × 全公开源 validator 组合未覆盖 |
| M13 | metadata reference owner | `test_modality_reference_roundtrip_is_detached`、`test_invalid_modality_source_not_projected_or_persisted` | `model_metadata.py _models_dev` + `catalog.py:891-897` | 契约与断言已具备（纠正四）；audio/video/pdf 全声明组合枚举 + 运行证据未取得 |
| E1 | import owner | `test_import_requires_explicit_metadata`、`test_E1...` | `provider_config.py _import_model` | complete-record 全 missing + confirmation 状态组合未覆盖 |
| E2 | confirmation owner | `test_E2_confirmed...` | `provider_config.py metadata_envelope` | 全 false/0/[]/null confirmed 不一致组合未覆盖 |
| E3 | confirmation owner | `test_uncertain_metadata...`、`test_M8_E3...` | `provider_config.metadata_envelope` + `catalog.model_metadata` | 历史 E3 REWORK（source 无引用/conflict 非空）已在后继修复，当前运行未取得 |
| E4 | metadata bounds owner | `test_persisted_source_rejects...`、`test_E4...` | `catalog.py model_metadata` + `_metadata_pricing` | 编码边界源码已定位（纠正二），256KiB/32sources/effort16/pricing 深度恰好/超限矩阵运行未取得 |
| E5 | metadata URL owner | `test_metadata_rejects_nonpublic...`、`test_metadata_preserves...` | `catalog.py:840 _metadata_source_url` | 历史 E5 REWORK（loopback 被保存）已在 `_metadata_source_url` 修（`is_global`/reserved/multicast 拒绝），运行未取得；public 合同差异解释未收口 |
| E6 | metadata detachment owner | `test_lookup_returns_detached...`、`test_E2...` | `model_metadata.py copy.deepcopy` | validate/apply 后嵌套 mutation + 固定 confirmed 时钟未覆盖 |
| C1 | connection-test owner | `test_real_connection...`、`test_C1_C3...` | `gateway.py` + `provider_config` credential snapshot | saved/candidate × keep/set/clear × version 组合未覆盖 |
| C2 | auth owner | `test_malformed_management...`、`test_C2...` | `gateway.py` | 数组 body 本地授权序（历史 REWORK）已修，运行未取得；upstream auth 语义见 C4 |
| C3 | connection-test owner | `test_connection_status...`、`test_C1_C3...` | `discovery_network.py` | success 去重 count 运行未在本检查点取得 |
| C4 | connection-test owner | `test_connection_status_uses_safe_discovery_categories`、`test_C4...` | `discovery_network.py` + provider_config | 固定 code 词汇表 + 优先级；历史 C4 已修复复验，当前源码运行未取得 |
| C5 | connection-test owner | `test_C10...`、`test_C4...`、`test_discovery...` | `discovery_network.py` headers | 任意 params secret headers 全组合未覆盖 |
| C6 | network owner | `test_unsafe_url...`、`test_every_dns...`、`i/test_C6...` | `discovery_network.py:100-127 validate_target` | 编码 CRLF/NUL/DEL + `:0`/`:` 源码已定位（纠正二），每个地址族 × opt-in × 编码变体交叉运行未取得 |
| C7 | network owner | `test_connection_uses_validated...`、`test_C7...` | `discovery_network.py` IP pinning | 实际证书错误分类 + 全 no-follow header 未覆盖 |
| C8 | network owner | `test_stream_size...`、`test_dns_budget...`、`z/test_C4_C8...` | `discovery_network.py` bounds | 每停顿阶段 × gzip × pages × total deadline 未覆盖 |
| C9 | network owner | `test_dns_budget...`、`test_C9...` | `discovery_network.py` semaphore | DNS 容量释放 + busy 与 chat 同窗未覆盖 |
| C10 | privacy owner | `test_file_credentials...`、`test_C10...`、`j/test_T9...` | `discovery_network.py` + provider_config | model ID/cursor 含 key 全日志 store 窗口未覆盖 |

> 上表“已具备断言”均指可定位到的现有 node/test/报告，不指当前检查点上已运行通过。正式 15 PASS / 43 OPEN 不因本表而改变。

## D4 fixture 说明（保留原样，不改变旧断言）

D4 十个失败（revision12）根因是 `tests/test_provider_config.py:34` 的 `model(...)` payload 缺 `provider` 字段，直接替换进 catalog，`catalog_from_document → profile_from_dict` 第一条谓词即报 `Model entry 0 provider is required`，返回 HTTP 400，未到达后续 session 断言。所以 116 PASS / 10 FAIL 不是 10 个 session 重选缺陷。

已写出的修复方案是“只在这两处 catalog entry 加 `provider: "test-provider"`，保留其余 59 断言和其他十个参数”。这是 catalog-only 修正版，不改变原失败 fixture 本体，不改被 revoke 的 126 准入。原 126 两次结果保持：第一次零 collected/零 executed，第二次 116 PASS / 10 FAIL 并发生 native loading denial；两次 approval 均已撤销，没有第三次执行准入。`ctypes.dlopen` initiator 仍未知，保持 GAP，不续签第三次 native 执行。

## UNRUN 命令计划（下一阶段需父级准入，本文件不执行）

以下每条均给出 exact executable/argv/cwd、有限 case IDs、独立依赖/证据目录、资源角色/期限、网络界限、失败保留/清理、需满足的既有准入、具体阻塞。没有任何命令在本文件编写时执行。

### 前提：独立依赖与证据目录

- QA 独占 `.venv`：`UV_PROJECT_ENVIRONMENT=<worktree>/.venv-qa`，不由开发 `.venv` 共享。用 `uv sync --all-groups` 安装，记录 lockfile 前后 hash。
- QA 独占前端 `node_modules` 与 `static/`：`npm --prefix frontend ci`，`JEV_GATEWAY_HOME=<worktree>/.qa-runtime`，`UV_CACHE_DIR=<worktree>/.qa-cache`，不得重定义 `HOME`/`CODEX_HOME`。
- 证据目录：`<worktree>/.trellis/tasks/10-05-admin-model-contracts/evidence/followup-exec/`，gitignored，只写 child 证据，不写产品/共享测试。
- 网络界限：全部元数据/发现/连接测试用 fixture/injected fetch/loopback，禁用真实公网 generation；connection-test 的 C 矩阵走 loopback socket stub，不真连公网。

### 分组一：六旧缺陷 + F5/M13 的定点运行验证（后端，无 browser）

executable/argv（单条，cwd=`<worktree>`）：

```sh
uv run pytest -q \
  tests/test_metadata_tail_contracts.py::test_effort_raw_bound_and_runtime_canonical_duplicates \
  tests/test_metadata_tail_contracts.py::test_confirmation_controls_rejected \
  tests/test_metadata_tail_contracts.py::test_native_effort_declaration_states \
  tests/test_metadata_tail_contracts.py::test_explicit_transport_channel_relationship \
  tests/test_metadata_tail_contracts.py::test_modality_reference_roundtrip_is_detached \
  tests/test_metadata_tail_contracts.py::test_invalid_modality_source_not_projected_or_persisted \
  tests/test_metadata_tail_contracts.py::test_legacy_quality_survives_unrelated_edits \
  tests/test_metadata_tail_contracts.py::test_write_quality_exception_cannot_be_forged \
  tests/test_metadata_tail_contracts.py::test_loading_quality_stays_strict \
  -p tests.conftest -q -s --basetemp <worktree>/.qa-runtime/pytest-basetemp \
  -o cache_dir=<worktree>/.qa-runtime/pytest-cache
```

- 有限 case IDs：上列九个函数（含 `test_confirmation_controls_rejected` 的 4×2×2 参数、`test_native_effort_declaration_states` 的 8 参数、`test_explicit_transport_channel_relationship` 的 16 参数、`test_legacy_quality_survives_unrelated_edits` 的 2×3 参数等），不展开全量。
- 覆盖：F5（raw 16/runtime canonical）、E4（嵌套控制）、M4（effort 未声明）、M2（transport）、M13（reference 持久化/detached）、F4/X7（quality 兼容）。
- 缺口：T8（SQLite config_versions）与 C6（validate_target 编码/端口）不在本组，单独分组二。

```sh
uv run pytest -q \
  tests/test_provider_config_regressions.py::test_failed_activation_restores_files_and_runtime \
  tests/test_admin_model_contracts.py::test_failed_activation_restores_runtime_files_and_safe_error \
  tests/test_discovery_network.py::test_unsafe_url_is_rejected_before_dns \
  -p tests.conftest -q -s --basetemp <worktree>/.qa-runtime/pytest-basetemp \
  -o cache_dir=<worktree>/.qa-runtime/pytest-cache
```

- 覆盖：T8（activation 后 config_versions 不变 + journal 恢复）与 C6（validate_target 对编码 controls/`:0`/`:` 拒绝）。若这些现有 node 未覆盖“defer_config_publication 后 config_versions 不变”的精确 SQLite 断言（即 `test_T1_T6_T8_sqlite_versions_unchanged_on_failure`），则补充独立 child probe，不改共享测试；该 node 属于后续 successors `i/test_T1_T6_T8_sqlite_versions_unchanged_on_failure` 名下，运行需父级准入该 child harness。

资源角色/期限：后端单线程，pytest `-p tests.conftest` 先建隔离 runtime；期限上限 15 分钟；超时保留 `pytest-basetemp`/`pytest-cache` 退出，不清理证据目录。
失败保留/清理：失败日志与 `--junitxml=<evidence>/group1.xml` 保留；`pytest-basetemp`/`pytest-cache` 属一次性，跑完按 child 边界清理，不动操作者目录。
需满足的既有准入：父级授权运行这些现有 tracked node（非冻结旧 harness）；不动 `tests/test_provider_config.py:34` fixture。
具体阻塞：`test_T1_T6_T8_sqlite_versions_unchanged_on_failure` 是后继 successor 的 child harness，不在当前 tracked `tests/`，运行需父级先接受该 harness 入库或另行准入。

### 分组二：D4 catalog-only 修正版（不改原 fixture）

executable/argv：

```sh
uv run pytest -q \
  tests/test_provider_config.py \
  -p tests.conftest -q -s --basetemp <worktree>/.qa-runtime/pytest-basetemp \
  -o cache_dir=<worktree>/.qa-runtime/pytest-cache
```

- 有限 case IDs：只跑一个 catalog-only 修正版（在独立 child probe 内复制 `model(...)` payload 并补 `provider: "test-provider"`，保留其余 59 断言与十个参数），不是重跑原 126。
- 覆盖：确认补 provider 后 116+10 全 pass，且原 59 断言与十个参数 byte 不变。
- 资源/期限/网络/清理同上。
- 需满足的既有准入：父级明确批准“catalog-only 修正版”运行；不改原失败 fixture 本体，不改被 revoke 的 126 准入。
- 具体阻塞：原 126 两次 approval 已撤销、无第三次准入；运行该 catalog-only 版需新的、限定的、单独的准入，不是续签原 126。

### 分组三：X1/T3/X5/X6 复用 B07 真实链路 + 源绑定对齐（只读，不运行）

本组不运行任何命令，只做被动核对，因 B07 证据在主仓库已归档、其运行环境（真实 browser + loopback gateway 44842/44843 + 392 源绑定）不在本 worktree 可复现。

- 需核对：B07 `live-http.jsonl` 记录的 validate/PUT/GET 顺序与 X1 的“同一次完整提交”是否一致（读 `live-http.jsonl` 行序）；`records.json`/`results/parent-*-review.json` 的 392 源签名与当前 `2ace03a3` 的 backend/shared-API 聚合 hash 是否一致（需父级重算 worktree 的 52/5 文件聚合，现行 `acceptance.md` 记录的是后继候选 hash，非当前 worktree）。
- 需补充：T3 的 baseline/overlay 同窗逐字断言（当前 `test_whole_model_edit_preserves_overlay_and_identity` 是否覆盖“未编辑 baseline membership/priority 不被写回 overlay bytes 不变”的逐字比较）；X5 的 C4 code 词汇在真实 ASGI 的当前运行；X6 的“成功后读取失败只 GET 不重发 PUT”在前端 unit 的当前运行。
- 具体阻塞：392 源绑定 hash 与当前 worktree 的 backend/shared-API 聚合不一致时，不能宣称 X1 复用；祖先 commit/归档说明不能代替 byte comparison（父级已明示）。

### 约束与不越界

- 不运行 tests/collection/lint/typecheck/build/install/browser/network/native。
- 不调用 candidate/helper/control/auditor、不做模拟运行。
- 不进程查询/信号/全局枚举，保护 PIDs 5830/45232/90027/91413。
- 不扩展 Broker/acquisition/sealing，不改 acceptedSettings/Suppliers/Models/Canvas/main/任务 JSON/旧断言失败审批。
- 不 stage/commit/merge/publish/归档/额外 delegate。
- 主 runtime 原 110 控制继续 UNRUN。

## 交付边界与最终结论

本文件新增 `.trellis/tasks/10-05-admin-model-contracts/verification-worktree-business-followup.md`，不修改上一版报告任何字节，不修改任何产品源码、共享测试、文档、任务 JSON 或旧断言。真正修改为零（只新增一个 gitignored child 报告）。

当前没有已证实的 product bug 需要造最小 patch；源码层面需确认的运行证据缺口已逐条落到分组一/二的 UNRUN 命令（exact executable/argv/cwd、有限 case IDs、独立依赖/证据目录、资源/期限、网络界限、失败保留、准入、阻塞）。正式业务状态维持 15 项继承 PASS / 43 项 OPEN，本文件不签发任何独立 PASS 或 REWORK 升级；父级需独立复核并在授予具体准入后由独立验收上下文执行上述 UNRUN 项。
