# Provider 配置执行清单

## 执行依据

用户已明确要求实施并确认私网范围。先完成以下技术文件和 manifests，再启动 owning child；父任务只负责集成，根目录 DESIGN.md 属于独立文档基线。

实施与集成验收已完成。Provider 基线为 719 backend tests、Pyright 零诊断、210 frontend units、80 browser cases（Provider 43）、build/bundle、wheel/sdist 与官方 DESIGN lint 全部通过。原配置六项、发现两项、UI 五项和追加 CLI literal-consumer P2 已关闭。主题追加也已通过独立 check 和主端全量：720 backend tests、210 frontend units、81 browser cases，Pyright/build/bundle/重建发行包均通过。完整退出码、日志、包源码/许可字节证据分别见 `research/final-gates/` 和 `research/theme-settings-gates/`，验收映射见 `acceptance.md`。下面的并发记录保留首轮交付和返工过程。任务仍 in_progress，未提交或归档。

## 并发执行记录

用户进一步要求使用 subagent 并发完成全部子任务。四个 owning child 均已通过 task validate 并启动为 in_progress；配置、发现、界面和设计文档分别委派，文件 ownership 与共享 HTTP 契约写入 dispatch。父任务已启动为 in_progress，当前 active task 为父任务，负责集成和验收。

- 配置：agent `7cf49602-8eb8-469` 已交付 catalog/gateway/CLI/事务与 schema；报告 218 个配置/CLI/HTTP/发现联合 mock tests 通过。精确 schema 和示例见 `api-contract.md`，独立 reviewer `e8dd2361-81fb-403` 正在审查事务、凭证和兼容性。
- 发现：agent `1da6c325-ba13-4d3` 已返回三个模块与三个测试文件，报告 73 mock tests 通过、六文件 pyright 零诊断。HTTP 已接入；独立 review 确认两条 P2，修复 agent `10fd87d0-3ec4-462` 正在处理并补充测试。
- 界面：agent `b15148aa-fffe-41a` 已交付 Provider feature、共享 API/types/locales、入口和浏览器测试，报告 200 个 unit、31 个专项 browser 通过。主端已复跑 lint/unit/build 并通过；UI 独立 reviewer 为 `52520178-e7b1-4c4`，全量 browser 与截图 tester 为 `1e71a498-2ac3-4a0`。
- 设计：agent `80c331ea-e324-444` 已返回 root DESIGN.md、child PRD 与 acceptance-evidence.md。官方 lint 为 exit 0、0 errors、0 warnings；28 色源码执行结果吻合，14 条源码断言通过。主 agent 对照初始快照确认 YAML 完全不变，Provider 交互仍标为 planned，未宣称产品或 logo 验收。

主 agent 已运行跨层 `tests/test_provider_onboarding_integration.py`：3 passed in 0.11s。覆盖候选无写入、保存/旧 revision、显式 import/overlay 保留、原厂与代理 metadata 适用性，以及查询后的规范 envelope→逐字段确认→事务导入→磁盘/GET 完整往返；确认值与路由价格不符时拒绝写入。主端 `uvx pyright` 为 0 errors、0 warnings。实施前快照的 legacy 子集 79 passed。完整证据与未验收场景记录在 `acceptance.md`；修复和前端交付后仍需最终全量 gates。

主 agent 已同步 docs/models-config.md、docs/http-api.md、双语 README 与独立 provider code-spec；最终应逐项对照实现。契约文档独立评审提出两条 P2 澄清（允许明确确认的 null limit、扁平建议到嵌套 import 的映射），已修正并加入完整 import JSON 示例。发现 reviewer `e4242b0f-d487-483` 返回 REWORK：原生 structured-output 声明不能直接认证 JSON mode；读取不足 Content-Length 的响应不能视为完整。其余网络/缓存/来源与单位边界通过所检查范围。

HTTP 实际交付额外提供规范 metadata：发现项的 `metadata_envelope`、lookup 项的 `metadata`。其中来源有唯一 `id`，`source_provider` / `source_model` 映射为 `provider_id` / `model_id`；UI owner 已收到契约同步。公开文档已说明版本、字段状态、确认值一致性、版本重启失效与管理错误码。

本地品牌资源覆盖为 1/3：DeepSeek 官方仓库 SVG 与构建产物的 SHA-256 均匹配 provenance manifest；OpenAI/Anthropic 使用中性回退。完整许可 notice 是否随发行包交付仍由 UI reviewer 和父任务打包检查确认。主端 frontend lint exit 0（4 个既有 Fast Refresh warnings）、29 files/200 unit tests、build exit 0（584.86 kB chunk warning）。这些结果不替代全量 browser 和最终审查。

独立 review 后继续返工：配置六项（旧 dotenv、reload 竞争、CLI 共享 key、clear presence、journal 读屏障、正常 CLI 写入期间等待锁）由 `705a96f8-511e-45f` 修复；UI 五项（目标配置变更的旧查询、证据一致性、null 冲突、credential 草稿、写入与刷新结果）由 `e34b6d62-0a81-447` 修复。发现两项已修正，主端 82 个 focused tests 与 4 个 HTTP integration 通过。

全量 browser 初跑 65/68，通过全部 31 个 Provider cases；两条旧 monitoring selector 和一条 shared mock 未支持 Provider GET 的失败由 `0828ff89-a1bf-42d` 做基线对照与测试适配，不修改 Settings/其他产品职责。tester `1e71a498-2ac3-4a0` 已释放端口并交付六图；主端已检查。DeepSeek 完整许可已确认包含于 JS，新增 `research/verify-package-assets.py` 用于最终 wheel/sdist 字节与 notice 检查。最终 gates 必须在各修复 owner 交付后重跑。

## 顺序与交付

- [x] 配置子任务：环境映射解析、展示/私网字段、严格 metadata envelope、统一预设、事务服务与管理 API。
- [x] 发现子任务：安全 HTTP、OpenAI/Anthropic/DeepSeek 适配、公共元数据归一化/缓存、完整性和显式 import 校验。
- [x] 界面子任务：两分区、浏览搜索、本地 logo/图标、规范表单、候选发现、模型选择和批量 metadata 确认。
- [x] 集成：API/types/fixtures 一致，已导入目录刷新进入既有策略选择，配置和凭证失败回滚。
- [x] 文档子任务：root DESIGN.md 的现状核对、来源与资产使用规则、官方 lint；未验收状态明确。实际 logo 收集及其来源清单仍由界面子任务验收。
- [x] 独立 check agent 阅读全部 owned 改动，修正后跑必要项目 gates，记录验收证据。
- [x] 更新 backend specs 与 docs/models-config.md、docs/http-api.md；英文 README 与中文镜像如需改变保持一致。

## 验证

迭代先运行新模块与相关 catalog/CLI/gateway/decision 测试，最终运行：

```bash
PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true uv run pytest -q
PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true uvx pyright
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
npm --prefix frontend run test:browser
scripts/build-frontend.sh --check
uv build
npx --yes @google/design.md@0.4.0 lint --format json DESIGN.md
```

真实浏览器覆盖 en/zh-CN、明暗、320/390/桌面、键盘、取消/失败重试、先进入 Provider 的写权限、metadata unknown、来源冲突、全选范围、重复导入及 stale 响应。产品测试不发真实上游请求。

## 风险与回滚

catalog/gateway/CLI 为配置 owner；App/共享 API 为前端集成 owner；新增 feature/module 各自独占。不得覆盖 dirty staged 内容。更改旧 env 加载方式需要 CLI/decision 兼容回归，更新管理 HTTP baseline write spec。事务失败先恢复 old bytes/runtime；不使用全仓 reset。未完成验收项保持 unchecked，不用 task validate 代替产品验收；commit/archive 另按用户授权处理。

## 主题设置追加执行（用户已授权）

边界：`jev_gateway/dashboard.py` 只改 theme PUT/DELETE 的授权依赖；`AppearanceView.tsx` 改选中外圈和彩色笔控件；`AppShell.tsx` 解开 routing 写权限与主题编辑的绑定。相关 unit/gateway/browser 测试更新真实契约。主端同步 `docs/http-api.md`、`docs/models-config.md`、root `DESIGN.md` 和 dashboard spec。其他 task 状态、Provider 模块、路由算法、palette/CSP 和全局样式不变。

- [x] 实现 theme 独立授权与外圈/自定义入口；必要边界测试覆盖无 key 成功和有 key 401。
- [x] 检查原生 input/change、pending/错误/旧响应回归，浏览器验证同尺寸、外圈、笔图标和双语/明暗/320px。
- [x] 独立 check、frontend lint/unit/build、backend pytest/Pyright、browser、bundle 检查。
- [x] 同步主题授权与视觉文档，并追加验收证据。前面的 Provider 全量记录为本次追加前基线。

实现 `646cf363-9c81-471`、独立 check `7106a0e6-6349-4c0` 均已交付。原生取色器使用 input 草稿和带 cleanup 的 native change listener，以独立事件验证零预览写入/一次提交。主端已查看四张保留截图，读回 reviewer 两处文档修正，源码、样式/palette/hook 保留范围和最终发行包均有证据。系统原生取色器弹窗和其他浏览器引擎未自动化验证。
