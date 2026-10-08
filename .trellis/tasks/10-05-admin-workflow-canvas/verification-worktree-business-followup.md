# Canvas 业务 worktree 后继补正

本文件是第一阶段交付的后继补正，不是新的执行或验收。它仅新增这一个 untracked 报告，没有产品源码、测试、暂存区或提交变化，没有新的 PASS。

## A. 原报告保留与本文件边界

第一阶段报告 `.trellis/tasks/10-05-admin-workflow-canvas/verification-worktree-business.md` 保持其字节、模式与相对路径不变。父级记录其 SHA-256 为 `4b73e50372473ec473621e6a91ffb19f33b8c7b38dd4b700881e448a2060d742`，字节数 17945，本文件写入前后均不再改动它。

本文件新增于同一目录，名称为 `verification-worktree-business-followup.md`。worktree 的 git 状态在本文件写入前已核对为 clean，仅含原报告一个 untracked 文件；本文件写入后，untracked 文件变为两份，仍无 staged/unstaged 产品 diff。HEAD 仍为 `2ace03a3651b2fd848a8212207af1699b1f6734d`，分支仍为 `work/canvas-business-closure`。

本文件不签发任何 C 行、WF、IA 的独立 PASS，不把 C19 的单行闭合扩散到其余 24 行，不建立新的产品 REWORK，不修改 task.json、index、lifecycle 或任一 acceptance 文档。

## B. 几何结论补正

第一阶段把负 left、English 320 右界和 Input overlap 三类缺口并列，但没有把各自的对象、变量轴和测量字段分开。父级明确指出：Add-node 按钮的负 left 不是新 rule 坐标；originY 是竖轴变量；measureChrome 的 inline left/width 与 CSS cascade 不是时间先后；已有 narrow justify-start/overflow-x-auto 不需重复加 class。以下逐项澄清。

### 对象的区分

三个可观察现象属于三个对象：

1. Add-node 按钮负 left 属于 `.canvas-tools` 工具栏。`RoutingCanvas.tsx` 约 831 行声明该工具栏为 `absolute bottom-3 left-3 z-[7] flex w-[calc(100%-24px)]`，narrow 变体 `max-[600px]:left-2 max-[600px]:w-[calc(100%-16px)] max-[600px]:justify-start max-[600px]:overflow-x-auto`。它的负 left 若出现，来自 `measureChrome`（约 145 至 164 行）通过 `toolbar.style.left = visible.left - viewport.left + (visible.right - visible.left - width) / 2` 写入的 inline left，与 `addNode` 无关。

2. `addNode`（约 449 至 463 行）把新 rule 的左上角放在 `menu.point`，那是 board 坐标，clamp 到 `[0, 9700]`。它与工具栏的 inline left 是两个独立对象。Add-node 按钮点击的 `onClick`（约 839 行）先调用 `canvasAvailableRect(surface.current)`，再以该矩形中心调用 `openMenu`；`openMenu` 再用 `pointerOnBoard` 把 client 坐标反算为 board 坐标。按钮自身的负 left 与这条 rule 创建链无关。

3. 外置 Input port label 的负 left 属于 `RoutingCanvas.tsx` 约 935 行的 `<span className="... absolute w-7 ... text-[9px]" style={{ left: -42, top: input.y - 6 }}>`，是第三个独立对象。

把负 left 直接解释为新 rule 坐标，是把三个对象混为一个。

### originY 的轴

`measureChrome` 约 152 行写入 `originY.current = visible.top - viewport.top + 12`。`pointerOnBoard`（约 612 至 616 行）只把它用于 `rect.top + originY.current` 这一项，即纵向反算的起点偏移。它不改横向的 `rect.left`，也不改 `scrollLeft`。因此 originY 是竖轴变量，不能解释按钮或 label 的水平负 left。

### measureChrome inline 与 CSS cascade 的关系

`canvas-geometry.css` 与 `routing.css` 两个样式文件已逐份重读，前者只有 `node-drag-pulse` keyframe 和两行注释，后者只有 `configured-route-trace` keyframe 和一行注释。二者不含任何几何依赖。真正的几何规则在：

- 拥有元素的 JSX 内联 Tailwind 类，例如 `.canvas-tools` 的 `max-[600px]:justify-start`、`max-[600px]:overflow-x-auto`、`w-[calc(100%-24px)]`，以及 `.canvas-node-content` 的 `overflow-hidden text-ellipsis whitespace-nowrap`。
- `measureChrome` 在运行时写入的 inline `left`、`width`、`bottom`、`maxHeight` 与 `--canvas-origin-y`、`--canvas-end-space`。
- `AppShell.tsx` 约 230 行 `<nav>` 的 `overflow-x-auto w-fit max-w-full min-w-0`，按钮 `shrink-0 truncate`。
- `model/node-card.ts` 与 `model/canvas.ts` 的 `NODE_CARD_BASE_HEIGHT`、`nodeCardCenter`、`nodeCardPorts`、`canvasAvailableRect`、`inspectorPosition` 等纯函数布局。

measureChrome 写入的 inline left/width 与 CSS cascade 是同一瞬间同时生效的规则源，inline 因优先级覆盖同属性，不存在"inline 在窄屏样式之前执行"的时序结论。窄屏 `justify-start`/`overflow-x-auto` 已经在源码里，重复加同类 class 无意义。真正的未见证根因仍待通过 focus 序列、祖先可用矩形、scrollLeft 和逐帧 bounds 来证伪。

### 待观察事实的字段级别清单

下表把三类缺口各自拆为已确认事实、假设、证伪需要的测量字段和当前 owner，避免把假设当事实。

| 现象 | 已确认事实 | 假设（未证伪） | 证伪所需测量字段 | 当前 owner |
| --- | --- | --- | --- | --- |
| Add-node 按钮负 left | `.canvas-tools` 用 inline left 定位；narrow 类已含 justify-start/overflow-x-auto；Add 按钮的规则创建坐标来自 `menu.point`，与按钮定位无关 | 负 left 由哪个 ancestor bounds 或 focus 时序引入 | 当帧 `getBoundingClientRect`、`getComputedStyle` 的 left/width/position、`.canvas-tools` 的 `scrollLeft`、祖先 `canvasAvailableRect`、focusin/out 序列、`measureChrome` 每次写入前后的 style | `RoutingCanvas.tsx` `measureChrome` 与 `.canvas-tools` JSX |
| English 320 Settings 右界超出 | AppShell `<nav>` 已有 `overflow-x-auto`；Settings 按钮是 nav 成员 | 超出来自 nav 的 flex/width 约束还是祖先 min-width | nav 的 `scrollLeft`、computed width/max-width/min-width、每个 button 的 `shrink-0 truncate` 实际态、viewport/visualViewport 宽度 | `AppShell.tsx` `<nav>` 与 `.canvas-tools` 均可能 |
| 外置 Input ink overlap | label 在透明 z-[2] port 层，`left:-42` 左伸 42px；卡内 summary 的 `overflow-hidden` 裁剪只作用于 56px header 内 | 相邻 label 的真实 ink 相交、以及干净 backdrop 上是否达 4.5:1 | `elementsFromPoint` 交叠文本身份、两个 label 的 `getBoundingClientRect` 相交、以及彻底遮蔽全部 glyph 后的 painted-backdrop 采样 | `RoutingCanvas.tsx` 935 行 label 与 `CanvasNodeContent.tsx` 93 行 summary |

测量字段必须互相区分，不能把 `toolbar.scrollLeft`（滚动位置）当作 computed flex/width（布局结果），把祖先 `availableRect`（可用空间）当作 focus 历史（事件时间线），把当帧 bounds（某一帧的矩形）当作 `measureChrome` 施加的 inline 样式（属性源）。

### 对比度与 overlap 的分离

1.614 与 1.235 两个比值采样到了外置 label 或透明 backdrop 的 ink，因此不能证明卡内成对文字的固有对比度，也不能据此建立颜色 bug。真实 overlap 与干净 backdrop 上的 4.5:1 是两个独立命题。真实 overlap 用交叠文本身份与矩形相交证伪；干净 4.5:1 需要用能把所有 DOM、SVG、伪元素 glyph 都遮蔽、同时保留表面与颜色与几何的采样器测量，现有卡内 span 的 `-webkit-text-fill` 辅助函数漏掉外置 Input ink。干净 4.5:1 保持 UNMEASURED。

较新的 v7 裁切与 overlap 缺口不能笼统归为旧 snapshot。v7 是 48 unique、41 expected、7 unexpected，与早期 fixture 失败分开记录，两套统计不能混列。

## C. 可审查的 UNRUN 执行方案

以下方案保持 UNRUN。它补第一阶段命令方案缺失的 exact executable、argv、cwd、有限 case IDs、fixture/policy/layout oracle、隔离与 deadline、失败保留、现有准入与不能执行的原因。

### 隔离、依赖与文件

所有路径以 `/Users/texas/Workspace/jev-gateway` 为根的主仓库 `D = .trellis/.runtime/admin-experience/business-current-source/canvas/diagnostic-geometry-1` 为私有 staging 目录。实际执行还需要把密封的 v7 树和相关依赖拷贝进单独的私有目录，这部分拷贝、清单与 inode 分离尚未发生，也不由本 worktree 执行。

隔离要求：为 browser 运行分配一个未占用的 loopback port，`JEV_BROWSER_PORT` 与 `reuseExistingServer:false`（本 worktree 不拥有该 port 的分配）；synthetic ASGI 与 real gateway 用独立 runtime 目录；不共享或链接主 `node_modules`、`.venv`、`static`、`runtime`；Playwright 输出走隔离的 absolute evidence 目录。禁止任何指向历史或 live 的 symlink/hardlink。

### 可执行命令形状（不执行）

本 worktree 无权分配 owned port 或审核 supervisor，因此只记录 FUTURE-EXECUTION.md 与 `launch-binding.json` 已声明的 argv 形状。若未来按可见的 plan 执行，其形状是：

- server argv：`[<sealed-node>, <D>/source/frontend/node_modules/vite/bin/vite.js, "preview", "--host", "127.0.0.1", "--port", <reserved-owned-port>, "--strictPort"]`，cwd `<D>/source/frontend`。
- runner argv：`[<sealed-node>, <D>/drivers/node_modules/@playwright/test/cli.js, "test", "-c", <D>/config.ts, "canvas-geometry.spec.ts"]`，cwd `<D>/source/frontend`，环境 `JEV_BROWSER_PORT` 与 server `--port` 及 config baseURL 三者文本一致。

`config.ts`（PRIVATE UNRUN）绑定 testDir 到 `D/drivers/tests/browser`，testMatch 为 `canvas-geometry.spec.ts`，tsconfig 到 `D/drivers/tsconfig.json`，workers 1，retries 0，forbidOnly true，Chromium，serviceWorkers block，trace on，timeout 30000ms，expect 5000ms，action/navigation timeout 用 0 默认（由 test 上限约束），server readiness 30000ms。config 不设 webServer，supervisor 必须自己持有 server 与 readiness deadline。

### 有限 case IDs、viewport、locale、scheme

九个诊断 case：

- Add-node 六项：`diagnostic Add-node 390 en light`、`390 en dark`、`320 en light`、`320 en dark`、`320 zh-CN light`、`320 zh-CN dark`。
- Settings 一项：`diagnostic Settings focus 320 en light`。
- placement 两项：`diagnostic incomplete placement 1280 en light`、`1280 en dark`。

这是完整清单，不多不少。每个 case 单次尝试，要求九个 terminal、零 skip/flaky/retry。

### 夹具与 policy/layout 请求 oracle

夹具复用 30 个 criterion 的 `configuration`（spec 中 `criterion_0` 到 `criterion_29`），通过 Settings 的 language/scheme select 切换。policy 与 layout 请求的 oracle：

- Add-node 与 Settings 两个 case 断言 `mockApi.requests` 中非 GET 且非 `/v1/dashboard/canvas-layout` 的请求为空数组，即预期路径外零写入。
- placement case 在 before/immediate/settled 三个检查点记录 `mockApi.canvasLayout` 与 `mockApi.requests`，断言实际请求与 stored layout 一致，且不覆盖 fixture 位置。
- 已确认的 seam 5（C13/v3 导航允许拦截所有 `nodes` 为 `{}` 的 layout PUT）意味着空 nodes 的 layout PUT 不能当零写入证明。要求显式 no-write 断言覆盖预期无 mutation 的路径，而不是依赖 empty-node PUT。

### deadline 与资源角色

- 180 Tab 上限：`tabTo` 用最多 180 次 Tab/Shift+Tab 定位目标，否则抛 "Target unreachable by Tab"。
- 120 frame / four stable：`settle` 在 120 帧内要求连续 4 帧几何快照稳定，否则抛 "Geometry did not settle in 120 frames"。
- test timeout 30000ms，expect 5000ms，server readiness 30000ms。
- collector 结算 cap 1000ms，且不延长原 Playwright test/operation deadline。

资源角色：supervisor 持 server 进程与 readiness；runner 的 Node worker、Chromium browser 及其 renderer/GPU/utility/crashpad 后代必须由 supported 的 IPC/birth 适配器绑定到本次运行；受保护 PID 5830/45232/90027/91413 排除在一切查询与信号之外；shutdown 用 owned handles，不做全局进程枚举或 broad signal。

### 失败保留、清理与现有准入

失败必须保留失败证据与截图、trace、缺失绑定，不 retry 不延长 deadline。清理只能经 owned handles，不借用 `run-remaining.py` 这类只查 loopback 关闭、不绑定 descendant birth 的启动器。

现有准入：`launch-binding.json` 的 `admitted` 为 false，reservedOwnedPort 为 null，ownershipReceipt 为 null，fixtureEnvironment 与 runner/server 的 port 项为 null。blockers 明确列出：reserved owned port 未分配、私有 source/dependency/browser 的 regular separate-inode 拷贝与完整 manifest 未准备、native Node/Chromium IPC 与 descendant ownership 适配器未实现、无 launch admission。九诊断与 18 consumer controls 继续 UNRUN。

### 不能执行的原因

本 worktree 没有 native 或 supervision 授权，不能分配 owned port、审核 supervisor 或绑定 descendant ownership。不能以新的 private diagnostic identity 绕过旧九诊断既有未获准状态；若新的有限 command 与旧九诊断不同，则必须写清差异与独立的准入，且本方案不授权任何差异执行。不能以扩大 Broker/acquisition/sealing 代替业务推进。

因此本方案只作为可审查的 UNRUN 说明交付，不实际运行任何进程。

## D. C13/C15/C20/C21/C25 的最小缺项与已有 public regression owner

C13、C15、C20、C21、C25 的缺项与第一阶段一致，此处写最小未闭合谓词和对应的已存在 public regression owner。edges-only / optional-held 比较、empty-node layout PUT 都不足以证明相应行的关闭；缺失的 1587-entry harness 不能豁免。

| 行 | 最小未闭合谓词 | 已有 public regression owner |
| --- | --- | --- |
| C13 | 跨 newer inspector edit、history、draft replacement、refresh、suspension 的 held node/connection；capture/preview/no-orphan-write；原始 1587-entry harness 缺失未重建未执行 | `canvas-tail-rework.spec.ts`、`canvas-workflow-actions.spec.ts` |
| C15 | 每次手势一次 contemporaneous start/end 的 native hit/bounds 记录；带 inspector/dense outputs 的 selected distant model/compact group Fit；取消 no-write/no-history 与每个 scroll/zoom/marquee/keyboard 变体 | `canvas-hit.spec.ts`、`canvas-visual-acceptance.spec.ts` |
| C20 | 完整 delayed validation/apply/layout/refresh 与 committed-write/failed-refresh 的 GET-only 恢复矩阵；raw 字段保留、duplicate-submit no-op 与 policy/layout 消息归属 | `canvas-header.spec.ts`、集成 `async-boundaries.spec.ts` |
| C21 | 每次取消后的精确 focus/selection；layout-only 对 clean saved departure；适用的键盘 Escape 取消；每个 dirty/clean 边界 | `canvas-workflow-actions.spec.ts`、`canvas-header.spec.ts` |
| C25 | 完整 keyboard-only add/select/edit/delete/reconnect/undo/review/save 主路径；内部 drawer/inspector/footer 滚动；全部可见 dismissal focus 目标；当前 ModelDialog handoff | `canvas-workflow-actions.spec.ts`、`canvas-connections.spec.ts` |

上述 owner 是当前 worktree 内已存在的 public 测试文件，代表可复用并需扩展的语义回归，不表示这些行已被关闭。C13 的 draft/selection/position/write owner 仍无直接确证根因，C15 的 Fit 与 no-write、C20 的写归属、C21 的 focus 返回、C25 的键盘主路径均仍是精确状态与写入归属证明缺项，不是可以靠 edges-only 或 empty-node PUT 豁免的完成。

任一缺项在获得直接确证根因前，本后继只交付精确诊断与 UNRUN plan，不做猜测性 patch。若出现必要的当前 source bug，须先明确 owner，且只限于 `frontend/src/features/routing/` 与必要的 AppShell/CSS 边界，不改变已接受行为。

## 最终状态

新增文件：`verification-worktree-business-followup.md`（本文件，唯一新增）。真实变更：无产品源码、无测试、无 index、无 lifecycle、无 task.json 变化；worktree 的 untracked 文件由一份增至两份。UNRUN：九诊断、18 consumer controls、110 Contracts controls 保持原状；无新执行、无新 PASS、无新 REWORK。
