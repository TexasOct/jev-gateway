# Canvas 业务 worktree 阶段交付

这是 Canvas 实现子代理在一个独立持久 worktree 中产出的业务推进记录。它记录白板 base、分支、C01 至 C25 的覆盖与缺口、确证的 owner 与实际 diff、历史/夹具/产品问题的区分，以及允许执行前的定点计划。它不是独立业务验收，也不签发 C 行、WF 或 IA PASS。

## Base、分支与白板身份

| 项 | 值 |
| --- | --- |
| 唯一可写仓库 | `/Users/texas/Workspace/jev-gateway-canvas-business` |
| 分支 | `work/canvas-business-closure` |
| HEAD | `2ace03a3651b2fd848a8212207af1699b1f6734d` |
| 工作区状态 | clean（无 staged/unstaged 变更） |
| 检查点核对 | `git rev-parse 2ace03a3...` 返回同一 SHA，匹配本任务分配的检查点 |

三个主父诊断绑定的 source hash 逐份重读核对，与检查点当前文件完全一致：

| 文件 | 当前 SHA-256 | 诊断绑定 | 匹配 |
| --- | --- | --- | --- |
| `frontend/src/features/routing/RoutingCanvas.tsx` | `c0726b0625078945bcbe041f78c0cfc462801995a314449b6ac3bf6a5907e156` | 同 | 是 |
| `frontend/src/app/AppShell.tsx` | `9a5ce4e22779d1b8430b8b44030dfb4ef3a9a61ee24eed2054318c733cb23372` | 同 | 是 |
| `frontend/src/styles/index.css` | `71d86bc2ae942e29566ff1c4aa66b0e07aa1717edfbfbd40597276bd9a458017` | 同 | 是 |

检查点 `2ace03a3` 是包含既有 Canvas/AppShell/CSS 改动的提交，不是一次新的验收运行。它没有为任何 C 行新增执行证据。

主仓库 `/Users/texas/Workspace/jev-gateway` 仅作只读证据源。本交付未写入、未 stage、未 commit、未 checkout、未改动 main，也未创建已不存在的 `/Users/texas/Workspace/jev-llmroute-test`。普通 bash 工具绑定旧 cwd，因此所有 shell 通过 `ctx_execute(cwd=…, language=shell)` 执行，输出保持在 5KB 以内且不传 `intent`。

## 阅读过的证据

本 worktree 内的任务文档：`prd.md`、`design.md`、`implement.md`、`implement.jsonl`、`check.jsonl`、`acceptance-plan.md`、`acceptance.md`、`current-status.md`、`routing-child-report.md`、`verification.md`、`task.json`。

父任务 `parallel-business-worktrees.md`；主仓库只读证据：`research/contracts-canvas-original-scope-assessment-1.md`、`research/canvas-current-source-review-diagnosis.md`、`research/canvas-successor-interruption-and-review.md`；Canvas child `research/acceptance-current-business/` 下逐份读到的 `report.md`、`report-current-web.md`、`original-row-evidence-ledger.md`、`original-row-evidence-ledger-current-web.md`，以及 `model-boundary-source-accounting.md`。

规范：`spec/backend/dashboard-routing-config.md`、`spec/backend/quality-guidelines.md`、`spec/guides/cross-layer-thinking-guide.md`、`spec/guides/code-reuse-thinking-guide.md`、`frontend/src/shared/ui/README.md`。`trellis-before-dev` skill 从主仓库 `/Users/texas/Workspace/jev-gateway/.agents/skills/trellis-before-dev/SKILL.md` 读取。frontend spec index (`frontend/index.md`) 实际不存在，未虚构。

关键源码：`RoutingCanvas.tsx`（968 行）、`RoutingEditor.tsx`（926 行）、`components/CanvasNodeContent.tsx`（101 行）、`app/AppShell.tsx`。

## 覆盖：C01 至 C25 与 WF/IA 的现状对照

以下结论以 `original-row-evidence-ledger-current-web.md` 的逐行 oracle 为权威，不把实现方自报的纯函数测试当成关闭证据。v7 为 48 个唯一用例、41 个 expected、7 个 unexpected；早期驱动失败统计与 v7 不混列，对比度取样器污染只否定那一组比值的证明力，不据此断言无产品问题。

| 行 | 现状 | 剩余 gateway 缺口（保留原 oracle） |
| --- | --- | --- |
| C01 | OPEN | 每个可创建类型的 fresh 空点创建，含共享 question 配置，required-field 说明，撰写前零 policy PUT。 |
| C02 | OPEN | 每种独立水平/垂直/组合 native scroll/pan 变体，每个 zoom；已加六探针用 toolbar 平移，未证明全部 wheel 变体。 |
| C03 | OPEN | wrapped locale chrome 与每个 measured-origin reflow 下的创建；页面滚动/无第二控件页断言。 |
| C04 | OPEN | 中文 touch 变体、显式 Tab+Enter 与 Tab+Space、受保护/只读创建原因与 focus。物理设备证据在浏览器范围之外。 |
| C05 | OPEN | 空白/节点/边菜单在全部四角、桌面/320、双语；outside-click 无副作用与每个精确 focus 返回目标。 |
| C06 | OPEN | 完整 header/output/wire 取消后 node drag/marquee/pan/connect/reconnect，native capture/preview 与每步 request 不变式。 |
| C07 | OPEN | 每次 delete/undo 后的 selection/inspector/endpoint/reference 恒等；distinct-body 与 last-rule 菜单/Delete 变体。仅数量/布局相等不是闭合。 |
| C08 | OPEN | 完整 Tab-only wire 选择与 match/fallback/member 的 Delete/Backspace 矩阵，每个可移除边类型的 pointer/keyboard 重连。 |
| C09 | OPEN | 每个 context/failure/default 保护、混合 protected group、review/read-only 模式，带实际原因与不变 graph/layout/disk/request 断言。 |
| C10 | OPEN | number/select/instructions-textarea 的 native 删除与文本 undo/redo 矩阵，focus 后裔与当前 ModelDialog，随后回 Canvas 删除。该修订无 raw JSON/contenteditable 面，条件变体不适用。 |
| C11 | OPEN | question/criterion 重命名与移除，加上每个 add/delete/reorder 命令的即时 endpoint/selected-ID/reference 与完整 payload 比较。 |
| C12 | OPEN | 完整 add/configure/move/reorder/disconnect/reconnect/delete 序列；一次 drag 一个 entry、bounded history、全部 toolbar/key 转移、divergent redo 清除、selection 恢复。 |
| C13 | OPEN | 跨 newer inspector edit/history/draft replacement/refresh/suspension 的 held node/connection 变体，capture/preview/no-orphan-write 检查。原始 1587-entry harness 缺失，未重建、未执行。 |
| C14 | OPEN | 每个成功 save/hash/remount/reset 与失败 apply/serialized-write 边界，含 old PUT callbacks、confirmed rollback retry、disclosure 与 busy-owner 断言。 |
| C15 | OPEN | 每个手势一次 contemporaneous start/end native hit/bounds 记录、带 inspector/dense outputs 的 selected distant model/compact group Fit、取消 no-write/no-history 与每个 scroll/zoom/marquee/keyboard 变体。 |
| C16 | OPEN | 每个 supported/generated card/inspector 类型、完整 basic/conditions/advanced 字段清单与渲染可访问态差异；当前 ModelDialog handoff 仍未被该 private snapshot 封存。 |
| C17 | OPEN | 通过表单与适用 advanced 控件交叉编辑单一 draft、repair-target 导航、共享值/字段断言、每个编辑器的显式 cancel/discard。raw JSON/contenteditable 条件变体不适用。 |
| C18 | OPEN | 每个 unsupported/blank/unknown/fallback/server-validation/capacity 变体双语、可见 collapsed 错误、精确 repair 位置与 confirmed-layout/no-false-save 不变式。 |
| C19 | PASS（行级） | 已由原生真实网关保存/新 context 重开 + 填充 ASGI/disk 检查闭合。浏览器命中证据与 ASGI/file 持久化证据仍是分离两层的证据。 |
| C20 | OPEN | 完整 delayed validation/apply/layout/refresh 与 committed-write/failed-refresh GET-only 恢复矩阵，raw 字段保留、duplicate-submit no-op 与 policy/layout 消息归属。 |
| C21 | OPEN | 每次取消后的精确 focus/selection，layout-only 对 clean saved departure，适用的键盘 Escape 取消，每个 dirty/clean 边界。native HTML Dialog/:modal 谓词被取代，不声称执行。 |
| C22 | OPEN | 全部 16 组合的 menu/corner 与每个 deep inspector/drawer/footer 动作可达性/内部滚动断言，带 exposed focus 与分离的 document overflow 测量。几何/PNG 存在本身不闭合动作。 |
| C23 | OPEN | 所有适用 state/locale 小文字的 4.5:1 对比度，用正确的 painted-backdrop 取样器。两个 ancestor 与两个 pixel 诊断因 backdrop/glyph 取样假设失败，未复现产品对比缺陷。 |
| C24 | OPEN | 完整 read-only/forbidden/auth 状态 inspection/pan/Fit 与可恢复 draft 矩阵，精确渲染态区分，以及每个 delayed 操作的当前 suspension/reconnect 归属。历史 readiness/auth/persistence 失败仍为失败。 |
| C25 | OPEN | 完整 keyboard-only add/select/edit/delete/reconnect/undo/review/save 主路径、内部 drawer/inspector/footer 滚动与全部可见 dismissal focus 目标，含当前 ModelDialog handoff。 |

聚合行：

| Requirement | 案例 | 现状 |
| --- | --- | --- |
| WF1 | C01-C04 | OPEN |
| WF2 | C05-C06 | OPEN |
| WF3 | C07-C11 | OPEN |
| WF4 | C12-C15 | OPEN |
| WF5 | C16-C18 | OPEN |
| WF6 | C19-C21 | OPEN（C19 行级 PASS 不闭合 WF6） |
| IA3, Canvas | C16, C22-C23 | OPEN |
| IA4, Canvas | C18, C20, C24 | OPEN |
| IA5, Canvas | C04-C05, C10, C17, C21, C25 | OPEN |

OPEN 不等于产品缺陷。它表示已执行子检查之外仍有未执行的精确网关。本交付不把 OPEN 转成 REWORK，也不把 C19 的单行闭合当作全任务闭合。

## 确证的 owner 与实际产品 seam

以下 owner 与 seam 由当前源码逐行确证，不是实现方自我报告，也不是盲目的颜色/布局改动。

### seam 1：Add-node 负 left 与 English 320 Settings 右界超出

`RoutingCanvas.tsx` `measureChrome`（约 145 至 164）在 toolbar 存在时：

- `toolbar.style.left = visible.left - viewport.left + (visible.right - visible.left - width) / 2`，其中 `width = Math.max(0, Math.min(720, visible.right - visible.left - 24))`。
- 该居中发生在 `max-[600px]` 的 `justify-start`/`overflow-x-auto` 变体之前；narrow 变体在 `.canvas-tools` 类的 `max-[600px]:*` 段（约 829 行）里，提供 `justify-start`、`overflow-x-auto`、`w-[calc(100%-16px)]`。窄屏显式 `onKeyDown` 的 ArrowLeft/ArrowRight 循环已存在。

`addNode`（449 至 463）把新 rule 的左上角放在 `menu.point`（board 坐标），clamp 到 `[0, 9700]`，再把该节点纳入 `layoutRef.current.nodes` 并 `persist`。`pointerOnBoard`（612 至 616）通过 `boardPoint` 使用 `rect.left`、`rect.top + originY.current`、`scrollLeft/scrollTop` 与 `zoom` 反算。`originY` 是唯一随测量 chrome 漂移的变量（`measureChrome` 里 `originY.current = visible.top - viewport.top + 12`）。

结论：负 left 与 320 Settings 右界超出的根因不在单一 class，而在 `measureChrome` 的居中计算、窄屏 toolbar 布局、`originY` 时序与祖先 bounds/scrollLeft/focus 序列的交互。当前源码已经提供窄屏 `justify-start` 与横向滚动，重复增加同类 class 无意义。根因仍未被证伪，因此不盲改颜色或布局去凑 PASS。

### seam 2：Input label 外置与 overlap/对比度分离

`RoutingCanvas.tsx` 约 935 行在 `pointer-events-none` 的 `z-[2]` port 层里绘制：

```tsx
{id !== "questions" && <span className="absolute w-7 whitespace-nowrap text-right text-[9px] leading-3 text-ink-muted" style={{ left: -42, top: input.y - 6 }}>{t("canvasInput")}</span>}
```

该 label 在卡片裁剪之外，`left: -42` 向左伸出 42px。“canvasInput” 文字与相邻 port 层文字可能重叠，且它位于透明（无背景）的 z-2 层，背靠未绘制的画布背景。`CanvasNodeContent.tsx` 约 93 行只裁剪卡内 summary（`overflow-hidden text-ellipsis whitespace-nowrap`，在 56px header 内），不会约束这个外置 label。

结论：真实 overlap（相邻 Input label 的 ink 相交）与 clean backdrop 对比度必须分开处理。1.614/1.235 这类比值无法证明内聚卡片对比度，因为它们采样到外置 label 或透明 backdrop。保留 4.5:1 的干净背景内聚卡片对比 oracle；若产品创建的坐标确实碰撞，修 placement 或 port-label reservation，而不是盲目重着色 summary。

### seam 3：AppShell nav 已有横向滚动

`AppShell.tsx` 约 230 行的 `<nav>` 已带 `overflow-x-auto`、`w-fit max-w-full min-w-0`，每个视图按钮 `shrink-0 truncate`。因此不能盲目重复加横向滚动类。诊断里的“nav 已横向滚动”与源码一致。

### seam 4：C13 edges-only / optional-held 比较不足

C13 当前比较只在 edges 层面，`actualHeld` 可选，未覆盖 stale positions/draft/selection/write ownership。这不证明 draft/selection/position/write-owner 在真实 held 手势跨 newer state 时保持。历史 1587-entry harness 缺失不能自行豁免原谓词。

### seam 5：v3 导航允许空 nodes layout PUT

v3 导航允许拦截所有 `nodes` 为 `{}` 的 layout PUT，因此不能当作“零写入”的证明。要求显式 no-write 断言覆盖预期的 no-mutation 路径。

## 历史 / 夹具 / 产品问题的区分

历史失败与当前产品缺陷分开，不混为当前 REWORK：

- 历史 REWORK（`f22fff0ef…`）的五个 native 缺陷（canvas layout 401 不触发根重连、deferred viewport 在 root 隐藏后写、in-flight layout/policy 允许 departure、generic header）属于早前 snapshot，当前源码 `RoutingEditor.tsx:555/629` 已加入 activity/operation owner 与真实 strategy 元数据，不能当作当前未复核缺陷直接断言。
- 历史 C13 stale-target、C14 callback/reset/history、C24 initial-GET 失败记录原样保留；后续 public regression 重查了可用的语义 oracle，未证明完整 harness。
- v7 驱动的早期失败（four initial native hit/confirm 假设、layout status selector 假设 `.workspace-heading`、two extended lifecycle/wait、two ancestor contrast、two pixel/glyph contrast）是 harness/取样器问题，不作为产品 REWORK 证据。
- 仍未关闭的产品级 seam 是 seam 1 与 seam 2（几何 overlap/clipping），加 C13/C15/C20/C21/C25 的 gesture/stale/write-owner/no-layout-write 缺口。
- C19 已由独立性证据闭合；它不闭合其余 24 行。

## 执行限制下的当前状态

本阶段未执行、且必须满足具体准入后才能执行的命令：

- 任何测试、collection、lint、typecheck、build、install、browser、network 或 native 进程。
- 九个诊断与 18 个 consumer controls 仍 UNRUN，新 worktree 未授予 native identity / 监督 / 旧九诊断准入。

因此本交付不包含新的 PASS、不签发独立业务 acceptance、不归档任务、不 stage/commit/publish。九个诊断与 18 个 consumer controls 的状态原样保留。

## 允许执行前的定点计划（不变式与隔离方案）

以下计划在获得具体准入前不会执行。它描述每个未执行网关的隔离、命令与所有权，供父级核对后放行。

1. **隔离**：为 browser 运行分配 unused loopback port，`JEV_BROWSER_PORT` 与 `reuseExistingServer:false`；为 synthetic ASGI/real-gateway 分配独立 runtime 目录；不共享或链接主 `node_modules`/`.venv`/`static`/`runtime`；Playwright 输出走 `testInfo.outputPath` 或隔离的 absolute evidence 目录。避免并行运行替换同一 `jev_gateway/static`。

2. **几何诊断（seam 1/2 的可证伪）**：以新的 private diagnostic identity 复现六条 Add-node 路径与 English-320 Settings focus，先记录 settled geometry，不做 corrective test 滚动；捕获一张 incomplete light/dark placement 与 clean backdrop。对 seam 2，用 `elementFromPoint` 与 `getBoundingClientRect` 捕捉 stored/default 坐标与相交文本身份，分离真实 overlap 与 clean backdrop 对比度。

3. **最小修复范围**：仅对能从现有证据确证的产品问题修改 `frontend/src/features/routing/` 及必要的 AppShell/CSS 边界、相关 tests 与 Canvas 验收文档。几何根因仍未证实时，提供精确诊断缺项与保留原 oracle 的定点执行计划，不盲改颜色/布局。

4. **不变式**：保留 C01 至 C25 原谓词与程序；保留 C19 保存重开与独立 policy/layout 保存；不削弱 hit oracle、不 skip/retry/延长 deadline、不放宽旧断言；不通过测试修正 scroll；不把 native Dialog/HID/物理设备替代为 synthetic PointerEvent。

5. **跨域边界**：不改变已完成 Settings/Suppliers/Models 行为与 Contracts backend；保留现有 Radix 网页 Dialog、draft/pending/failed-save/auth/reconnect/focus；保留 pointer 操作、native selects/color input、window.confirm、beforeunload。若跨 owner 或已完成行为受影响，在交付中指出具体跨域影响，不直接扩展范围。

## 当前实际执行与 UNRUN 项

已执行（全部只读/元数据）：

- 核对 worktree HEAD / 分支 / clean 状态 / 检查点 SHA。
- 重读并逐 byte 核对三份 source hash 绑定。
- 逐份读取父级、Canvas child 证据文件与规范，准确记录缺失文件（frontend spec index 不存在，未虚构）。
- 逐行定位 seam 1/2/3 与 `addNode`/`pointerOnBoard`/`measureChrome`/`openMenu` 的实际 owner。

UNRUN（保留原状）：

- 九个诊断与 18 个 consumer controls。
- 全部 browser/ASGI/real-gateway 执行与截图生成。
- 任何 C 行、WF、IA 的直接验收执行。
- native identity / 监督 / 旧九诊断准入下的任何命令。

## 可审查文件路径

- 本交付：`/Users/texas/Workspace/jev-gateway-canvas-business/.trellis/tasks/10-05-admin-workflow-canvas/verification-worktree-business.md`
- 当前源码 seam：`frontend/src/features/routing/RoutingCanvas.tsx`（本 worktree 内，968 行），`frontend/src/features/routing/components/CanvasNodeContent.tsx`，`frontend/src/app/AppShell.tsx`
- 权威缺口矩阵：主仓库只读 `/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-05-admin-workflow-canvas/research/acceptance-current-business/original-row-evidence-ledger-current-web.md`
- 主父诊断：`/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-05-admin-experience/research/canvas-current-source-review-diagnosis.md`

改动记录：本阶段只写入本交付文档，未改动任何 product source、public test、index、lifecycle 或 task 元数据。
