# 界面执行清单

- [x] 读 DESIGN.md、spec 和已确认 API；复用现有控件与请求编排方式。
- [x] typed API/client 与 Provider management hook，AppShell 接入独立 workspace。
- [x] 实例分区、brand browse/search、custom forms 和本地 icon picker。
- [x] 接入安全 candidate discovery、模型搜索/勾选/全选/manual。
- [x] metadata 查询、来源/未知/冲突、批量编辑与显式确认，保存/导入后刷新目录。
- [x] 官方 logo 来源/usage/local packaging 核实并保留安全回退。
- [x] frontend unit/API 测试，browser fixtures 和 en/zh-CN/light/dark/窄屏/键盘测试。
- [x] lint/test/build 和专项 browser 通过；root DESIGN.md 当前事实由父会话同步。

依赖配置/发现模块完成实际 HTTP 集成；可先依固定 mock 契约实现。frontend 与 backend 不交叉编辑；品牌资源可独立收集，避免其他视觉任务的 owner 文件重设计。失败只恢复本次 operation 草稿与受控字段，不覆盖用户已有主题/策略改动。

## 前端验收证据（2026-09-30）

`frontend/src/features/providers/` 实现两类实例、供应商搜索、自定义表单、有限图标、稳定 ID、System One、凭证 keep/set/clear 和私网发现开关。API 类型位于 `shared/api/types.ts`，请求复用 `shared/api/client.ts` 的内存网关鉴权。`useProviderManagement` 编排 revision 校验、保存、查询、取消和旧响应隔离，App/AppShell 接入 Provider 页面。未修改主题、CSP、后端、其他页面或已有测试。

模型界面包含候选/已保存实例发现、手工输入、可见范围全选、已导入项跳过、在线来源查询、未知/冲突/参考状态、逐项及批量编辑、完整性阻止提交和显式确认。来源 `applicable: false` 不预填，null 不当作支持或免费。新查询不覆盖已编辑字段，并保留完整来源对象，包括原单位与定价条件。导入成功刷新策略目录，不自动添加 tags。

已完整读取父任务 `api-contract.md` 并对齐：GET 使用 `has_api_key`、模型 `name` 和完整 decision 状态；预设平铺，Anthropic 的 `api_base: null` 与 env reference 保留，默认端点为显式表单选择。validate/PUT 消费完整 snapshot response。Discovery 从 `metadata_envelope`、lookup 从 `metadata` 取得服务器规范化 envelope，保留其 `sources.fields/pricing/source_unit/source_reasoning_effort` 及额外参考字段。导入重建十个 `confirmed` 字段，与实际 routing 值严格对应，并记录各自 source/manual 方法及确认时点；不将 raw `source_provider/source_model` 写入持久化 envelope。刷新保留以前来源，避免 ID 冲突；超过 32 来源时阻止导入，明确要求重新缩小查询。新 unit/browser 用例检查原单位、条件价格、max_input_tokens/structured_output、手工覆盖与 null 确认，并在 mock 保存后读取持久化 envelope。

品牌资源覆盖：DeepSeek 使用官方仓库的未修改 SVG，固定 commit、SHA-256、来源和 MIT 署名在 `features/providers/assets/sources.json` 与 `LICENSE-deepseek.txt`。OpenAI/Anthropic 尚无已核实可打包资源，使用中性首字母；未生成 logo、使用 favicon 或加载远程图形。浏览器测试验证本地 DeepSeek 资源、比例和署名。

本次命令与结果：

```text
npm --prefix frontend run lint
0 errors；4 个既有 shared/i18n/index.tsx Fast Refresh warnings

npm --prefix frontend run test
29 files / 200 tests passed

npm --prefix frontend run build
passed；Vite 提示主 chunk 大于 500 kB

cd frontend
npx tsc -p tests/tsconfig.json
npx playwright test -c tests/browser/provider.config.ts --workers=4
31 passed
```

新 browser fixture 全部使用假凭证和 mock API，拒绝未知来源，不访问真实上游。涵盖 320/390/1280、双语/明暗、表单与模型确认、焦点/Escape、凭证清空、409 草稿保留、只读/401、私网 opt-in、旧响应、筛选全选、metadata retry、批量值、null 决策与导入目录刷新。专项配置使用独立 4182 端口，避免与父会话 4178 browser server 冲突。父会话拥有实际 HTTP 集成、全量 browser、backend regression、docs/spec/root DESIGN.md 更新。

候选预览保存后继续进入同一模型面板，保留选中项、手工价格与完整来源，再经显式确认导入。新增 browser 用例验证该连续流程没有自动导入或丢失已检查的字段。

## 独立评审修复与回归证据

本轮修复 reviewer `52520178` 确认的五项 P2。修改范围为 Provider feature、App 的目录刷新回调、双语文案、新增 provider unit 文件、provider-management browser spec 及其 fixture。未修改旧共享 browser fixture、monitoring/responsive 测试、主题、CSP、Settings、后端、文档、spec、root DESIGN.md 或任务指针；未提交或归档。

1. 配置 GET 的 revision 变化使旧查询 generation 失效并取消请求，清除当前自动证据。revision 包含凭证文件变化，因此安全投影不变时也失效。模型列表、选择、手工字段与完整历史来源保留；未编辑的旧建议清空，导入确认复位。由本地成功 PUT 返回的新 revision 继续承接相同候选的审阅，不把合法保存误判为外部变更。
2. lookup/discovery 共用按完成顺序更新的证据，模型草稿保存自己的当前 evidence。预填、字段状态和当前来源详情使用同一记录；旧记录单独标为历史，仍完整进入规范 envelope。确认来源方法只依据当前规范来源，历史匹配值不能充当当前自动证据。
3. conflict 比较排除 null/undefined；零、false、空列表仍为明确值。全部 null 为 unknown，reference-only 不预填，实际不同已知值仍显示 conflict，原始 null 来源不删除。
4. 凭证 action 与 password 修改经过已有 discard 检查。拒绝时保持凭证、选中模型和手工价格；接受后清空候选面板及其查询结果。revision 状态不包含秘密，凭证仍仅在页面内存与授权请求体中。
5. App 的 Provider 目录刷新回调直接传播读取失败。PUT 成功后保存返回值和已导入状态，分别显示保存/导入成功但目录刷新失败；重试只读取目录，不重复 validate 或 PUT。清除凭证文案说明仅删除本地赋值，继承环境值仍可能有效。

新增 `evidence-regression.test.ts` 的 10 个 unit cases 覆盖 null+known、all-null、reference-only、真实冲突、显式 zero/false/empty-list、最新证据替换、手工值保留、revision 失效与历史来源不冒充当前确认。新增 12 个 browser cases 覆盖三种外部 revision 变化（endpoint/type/credential）、两种 lookup/discovery 顺序（包含 unknown 与手工覆盖）、null/reference/conflict、两种凭证编辑的拒绝/接受 discard、实际 value-free clear 请求与继承 presence、save/import 的成功 PUT + 失败目录 GET + 只读重试、坏本地图像中性回退。import 恢复后进入策略编辑器，选择 `fixture/alpha` 加入标签并验证结果成员控件。旧候选预览保存连续流程继续通过。

延迟查询测试使用受控 promise，捕获旧响应，刻意让浏览器 transport 忽略 abort，然后等待响应结束与下一帧，验证 generation 保护仍阻止旧值/来源进入导入。测试全部由现有隔离 gateway fixture 提供假数据，不访问真实上游或真实凭证。

实际验证命令和结果：

```text
npm --prefix frontend run lint
exit 0；0 errors，4 个既有 shared/i18n/index.tsx Fast Refresh warnings

npm --prefix frontend run test
exit 0；30 files / 210 tests passed

npm --prefix frontend run build
exit 0；主 JS 587.63 kB，保留 Vite >500 kB chunk 提示

cd frontend
npx tsc -p tests/tsconfig.json
exit 0

npx playwright test -c tests/browser/provider.config.ts --workers=4
exit 0；43 passed (7.8s)，仅使用 4182
```

第一次 provider browser run 为 42 passed / 1 failed：新策略成员测试错误地期待 action select 保留选中值；组件按现有设计重置为空。将断言改为真实新增成员的移除控件后，重跑 browser 类型检查和完整 4182 provider suite，43 全部通过。产品源代码在首次 build 后未再改变。

本轮交回 frontend build 与 4182 的使用权。全量 legacy browser、实际 HTTP/文件事务、后端全量、打包及父任务独立最终评审仍由主会话验收。品牌覆盖保持 1/3；OpenAI/Anthropic 仍为诚实的中性回退，没有新增 logo/license 流程。本轮浏览器中的 inherited presence 来自明确 fixture；真实外部环境回退由后端测试负责。
