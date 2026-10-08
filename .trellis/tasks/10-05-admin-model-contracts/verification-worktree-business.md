# 模型契约业务闭合：worktree 第一阶段核对

本文件由 Contracts 实现上下文（trellis-implement）在独立 worktree 内编写，只做被动的 stdlib/Git 只读核对和有限的源码定位，没有运行测试、collection、lint、typecheck、build、install、browser、network 或 native 进程。本文件是 worktree 内新增的 child 报告，位于 `.trellis/tasks/` 下，随 task 路径 gitignored，不属于产品源码或共享测试。

## 分支、base 与 worktree 身份

| 项 | 值 |
| --- | --- |
| 分支 | `work/contracts-business-closure` |
| HEAD | `2ace03a3651b2fd848a8212207af1699b1f6734d` |
| 检查点一致性 | 与父任务约定的检查点 SHA 完全一致，worktree 干净（`git status --porcelain` 为空） |
| 唯一可写仓库 | `/Users/texas/Workspace/jev-gateway-contracts-business` |
| 主仓库 | `/Users/texas/Workspace/jev-gateway`（只读，本上下文未写入、未 stage、未 commit、未 checkout） |
| 集成提交 | `55d71f0 feat(admin-experience): integrate settings, canvas, suppliers and models` 是本分支 HEAD 的祖先，也是 Models 归档的验收基准提交 |

所有 `git` 命令显式以 worktree 为 cwd 执行；主仓库只用于读取 `.trellis/tasks/.../research/` 与 `archive/` 下被 gitignore 的历史证据（这些目录在 worktree 内不存在）。

## 58 行映射摘要

原 58 行谓词（X1–X7、T1–T12、F1–F5、D1–D5、M1–M13、E1–E6、C1–C10）全文冻结顺序保存在两份权威材料中，本上下文没有改写编号或缩减要求：

- 原计划 `.trellis/tasks/10-05-admin-model-contracts/acceptance-plan.md`
- 后继完整行映射 `acceptance.md` 中的 successor `e3d65fd1` 段落（含原谓词、historical finding、predecessor 剩余证明、owner、具名断言、判定与剩余组合）

后继 `e3d65fd1` 已经对候选 `9a476c601979260415f6afe70490c03749b4c24e` 完成了 58 行全部映射，其行处置为 **44 supported / 3 supported-for-backend / 7 REWORK / 2 contract gap / 2 WAIT_B07**。该候选是一个 detached 的 curated candidate（`refs/heads/task/admin-experience-boundaries-layout`），不是当前 worktree 的源码。

关键结论：当前 worktree 源码（`2ace03a3`，含 `55d71f0` 集成提交）**已经修复后继在 `9a476c6` 上复现的 6 个产品缺陷**。这 6 个缺陷不构成当前必须再改代码的缺陷清单；它们是历史候选上的发现，在集成提交中已被后续修复覆盖。

## 6 个产品缺陷：当前源码逐项核对

| 缺陷 | 后继在 `9a476c6` 的复现 | 当前 worktree 源码状态 | 核对证据 |
| --- | --- | --- | --- |
| E4 嵌套确认文本控制 | `catalog.py:915/932` 未拒换行 | 已修复：`catalog.py:928-930` 对 `confirmed_at`/`method` 的 `evidence`（嵌套 fields）执行 `any(ord(c) < 32 or ord(c) == 127 ...)`；`catalog.py:945` 顶层 `confirmation` 同样检查 | 读 `jev_gateway/catalog.py` |
| F4/X7 quality 范围收窄 | `catalog.py:1137` 限制 0..1，拒绝旧合法 `quality=2.5` | 已修复：`catalog.py` 当前只 `if not _finite_number(quality)`，`_finite_number` 为 `math.isfinite(value) and value >= 0`，无 0..1 上界 | 读 `jev_gateway/catalog.py` + `git show 55d71f0` |
| T8 激活失败残留 SQLite 版本 | `decision.py:461` 提前注册 `config_versions` | 已修复：`decision.py:493` 新增 `defer_config_publication()`，`_register_config` 在 pending 时延后 `record_store.register_config`，激活及恢复 journal 完成后才发布 | 读 `jev_gateway/decision.py` |
| M4 缺 Anthropic effort 变成 known 空 | `model_metadata.py:166` 把漏声明归一为 `[]` | 已修复：`model_metadata.py:193` `value = levels if levels or all(type(v) is bool ...) else None`，`supported=True` 但未命名 level 时报 `None`（unknown） | 读 `jev_gateway/model_metadata.py` |
| M2 transport 不参与 serving 适用性 | `model_metadata.py:459` `_serving_matches` 不看 transport | 已修复：`model_metadata.py:469` 增加 `compatible` transport 映射，`_serving_matches` 先拒不兼容 transport | 读 `jev_gateway/model_metadata.py` |
| C6 编码查询控制与非法端口 | `discovery_network.py:100` 接受编码 CRLF/NUL/DEL 和 `:0`/`:` | 已修复：`discovery_network.py:122` `parts.netloc.endswith(":")` 拒绝空端口，`:127` `1 <= port <= 65535` 拒绝 `:0`；解码后的 query 键值执行 `any(ord(c) < 32 or ord(c) == 127 ...)` | 读 `jev_gateway/discovery_network.py` |

以上 6 项的核对都是直接读取当前源码字节完成的，不是从 `55d71f0` 的 diff 反推。当前源码干净（无未提交改动），这 6 处修复就是当前生效的行为。

## 2 个 contract gap（需契约决策，不是已证实的代码缺陷）

| 行 | 内容 | 当前源码状态 | 需要的决策 |
| --- | --- | --- | --- |
| F5 | effort 列表 16 上限 | `catalog.py:907` 对 `source_reasoning_effort` 强制执行 `len > 16`；运行时字段 `reasoning_effort` 与 `metadata.fields.reasoning_effort` 使用 `ladder_from_list`，未应用 16 上限 | 冻结谓词只把 16 上限写在 source evidence；是否把运行时/字段也限制为 16 需要父级/owner 明确契约，不能在无契约前提下擅自加运行时拒绝 |
| M13 | 额外模态（audio/video/pdf）作为 reference evidence 保留 | `model_metadata.py:230` 当前把完整 `modalities.input` 列表写入 `input_modalities = {value, source_field}`，audio/video/pdf 已在 reference 中保留；只有 `vision`(image) 被提升为 routing bool | 后继称静态 schema 无法表达该要求；当前源码似乎已通过 `input_modalities` 保留完整列表。是否关闭 M13 需要重新用真实 HTTP 探针与后继断言交叉验证，不能仅凭源码阅读关闭合 |

这两项都不是「当前已证实的代码缺陷」。F5 是契约未收口，M13 可能需要重新执行验证而非改代码。

## 2 个 WAIT_B07 行（依赖 Models 证据，不是代码缺口）

- X1：真实 UI-to-ASGI 同一提交链路，等待 Models B07 `ba6d4bfe` 经父级对最终候选的交付证据。
- T3：真实 UI-to-ASGI baseline/overlay 同窗，同样依赖 B07 父级证据。

这两行不是后端代码可以单方面关闭的；它们跨越 Consumers（Models）owner，按任务约束报告父级，不在本上下文扩展范围。

## D4 十个失败：构造级根因，不是 session 缺陷

`contracts-original126-revision12-root-cause/report.md` 已确认 D4 十个失败是 fixture 构造错误：`tests/test_provider_config.py:34` 的 `model(...)` payload 没有 `provider` 字段，直接替换进 catalog，而 management owner `provider_config.py:132` 才会补这个字段。`catalog_from_document` → `profile_from_dict` 第一条谓词就报 `Model entry 0 provider is required`，返回 HTTP 400，没到后续 session 断言。

这意味着 116 PASS / 10 FAIL 不是「10 个 session 重选缺陷」。修复方案已写明：只在这两处 catalog entry 加 `provider: "test-provider"`，保留其余 59 断言和其他十个参数。但该 fixture 是冻结源码，运行需要父级准入；本上下文不改变原失败 fixture、不重跑原 126、不修改原失败断言或审批。

## 复用 Models/Suppliers 证明

- Models 已独立验收并归档（`archive/2026-10/10-05-admin-model-workspace/archive-note.md`），绑定基准提交 `55d71f0`（与本上下文当前源码同源）、源码摘要 `33aebc929f6740e2194a50477120ad60b7cf1133983e34a908c5684f394ab768`。
- Suppliers 已归档（`archive/2026-10/10-05-admin-supplier-connections`）。
- 旧报告 `acceptance-complete-f7809bc/report.md` 当时「缺少 Models/Suppliers handoff」的措辞，现在已被这两个归档验收覆盖；不能继续把旧 handoff 缺失当作当前阻塞（与父级 `contracts-canvas-original-scope-assessment-1.md` 的结论一致）。

可复用这些已完成子任务的证据来映射 X1/T3（UI 消费者）、X3（字段集合）、X5/X6（供应商消费者、连接测试诊断）等行，但它们的浏览器证据是「合成 HTTP fixture 上的消费者行为」，不能单独替代真实 UI-to-ASGI 同一链路（X1/T3）或真实 ASGI 服务器证据。

## 原生 ctypes.dlopen 缺口

原 126 第二次的 native `ctypes.dlopen` 拒绝仍无法归因到具体 initiator（依赖/函数/库/测试），`report.md` 标记为 GAP。当前没有证据表明这是业务代码缺陷；它属于 native/监督执行层，不构成本业务阶段的代码修改依据，也不以任何方式续签第三次 126 或 native 执行。

## 实际执行过与 UNRUN

**实际执行过（本上下文）**：

- 读 worktree HEAD/branch/status，核对检查点 SHA 与干净状态。
- 读 Humanizer SKILL、`trellis-before-dev`、父任务 `parallel-business-worktrees.md`、Contracts 全部子任务文档（prd/design/implement/acceptance/acceptance-plan/connection-diagnostics-rework/current-status/check.jsonl/implement.jsonl/task.json）。
- 读主仓库只读参考：`contracts-canvas-original-scope-assessment-1.md`、`contracts-original126-revision12-root-cause/report.md`、`acceptance-complete-f7809bc/report.md`、`10-05-admin-model-workspace/archive-note.md`。
- 直接读当前 worktree 源码的 6 个缺陷位置，确认全部已修复。
- `git show 55d71f0` / `git merge-base --is-ancestor` 确认集成提交与修复归属。

**UNRUN（本上下文）**：

- 所有 pytest collection / 执行 / lint / typecheck / build / install / browser / network / native 进程。
- 没有运行任何旧冻结 helper、control、断言或 replica。
- 没有签发任何独立业务 PASS，没有 stage / commit / push / 发布 / 归档。

## 下一步准入计划

1. **确认当前源码与后继 `e3d65fd1` 的候选差异是「修复已集成」，而不是「候选回退了修复」**。这一点已经通过 `55d71f0` 是当前 HEAD 祖先、6 处修复在源码中存在、worktree 干净三项证据成立。需要父级复核源码 hash 以确认当前 `2ace03a3` 与 Models 归档摘要 `33aebc929...`（绑定 `55d71f0`）一致。
2. **对已修复的 6 项做一次定点验证**，而不是重跑全量。这需要父级准入一个隔离的、只读依赖已安装的 pytest 子集，验证这 6 个后继复现用例在当前源码上从 fail 变 pass。具体隔离方案、命令、所有权需要父级批准后才能执行；本上下文不自行启动。
3. **F5 / M13 两项契约收口**：向父级报告，需要 owner 明确（a）是否把 16 上限扩展到运行时/字段，（b）M13 是否视为已由 `input_modalities` reference 保留关闭。收口后才能进入执行。
4. **X1 / T3 等待 Models B07 父级证据**：这是跨 owner 依赖，报告父级统一对最终候选做 hash 与 source/API 一致性核对。
5. **D4 fixture 修复**：只加 `provider`，保留其余断言，需要父级准入后才能在独立隔离环境跑；不改原失败 fixture 本体。
6. **native ctypes 缺口**：继续 GAP，不续签第三次 126，不执行 native。

当前不存在「已证实的当前代码缺陷」需要最小 diff 修复。6 个历史候选缺陷已在集成提交中修复。若父级复核确认这 6 项修复的验证证据（定点 pytest）尚未存在，那么「重跑这 6 项的定点验证」就是本阶段最准确的下一步，而不是发明新的代码修改。

## 可审查文件路径

- 本报告：`.trellis/tasks/10-05-admin-model-contracts/verification-worktree-business.md`（gitignored child 报告）
- 58 行冻结：`.trellis/tasks/10-05-admin-model-contracts/acceptance-plan.md`（原计划）与 `acceptance.md`（后继完整行映射）
- 6 处修复对应源码：`jev_gateway/catalog.py`、`jev_gateway/decision.py`、`jev_gateway/model_metadata.py`、`jev_gateway/discovery_network.py`
- D4 根因与 fixture 修复方案：主仓库 `.trellis/tasks/10-05-admin-experience/research/contracts-original126-revision12-root-cause/report.md`
- Models 复用证据：主仓库 `.trellis/tasks/archive/2026-10/10-05-admin-model-workspace/archive-note.md`

这些都要由独立验收上下文核对，作者自查不替代独立验收。
