# Dashboard visual overhaul implementation plan

## Baseline and scope

- [ ] Start only after the user approves the final planning summary and `task.py start` succeeds.
- [ ] Before editing, capture `git status --short`, current task and active dashboard task artifacts. Record overlapping dirty files; do not reset or overwrite them.
- [ ] Inspect `trellis-before-dev` guidance and relevant frontend/build/security specs, refreshing the source findings in `research/current-baseline.md` where they changed.
- [ ] Mark ownership for shared shell/tokens, monitoring, strategy/canvas, appearance, integration, and generated assets. The canvas/editor pair is one ownership unit.

## Implementation sequence

The shell/token child establishes shared tokens and file ownership first. Monitoring, strategy and appearance children may proceed only after their contracts are stable, with disjoint source-file ownership. The parent owns integration and final cross-view verification; it is not a fourth competing writer to shared files.

- [ ] Agree and document shared neutral token, spacing, type, radius, control, and dark/light scheme mapping. Keep the seed-derived accent and existing theme persistence API.
- [ ] Implement shared shell and shadcn-like primitives using existing Tailwind and project-owned components. Preserve English/Chinese labels and keyboard access. Keep API/auth logic in its current owner.
- [ ] Redesign strategy diagram and complete canvas paint treatment, using the supplied Magpie image as the visual reference. Improve visibility of existing question/rule/fallback/model-pool/connection editing, clearly distinguish policy edits from layout edits, and retain existing invalid-connection reasons. Keep current node geometry, graph semantics, data attributes, hit testing and event/save logic. Implement any explanatory motion only from configured policy state, with a static reduced-motion equivalent.
- [x] Add a strategy-first simple monitoring view with the monitoring child's approved read-only activity telemetry. Its model-path animation follows in-flight request/stream state for the exact destination, including exact per-request attribution and safe stale-data handling. Fetch the registered strategies endpoint for the browse list, including strategies without live sessions. Enumerate every current-session cursor page, deduplicate session IDs and group each row by latest known strategy/model before showing complete counts. Preserve unknown attribution as an explicit bucket and incomplete/error states. Keep configured model pools visually distinct from observed live sessions; do not equate session counts with request counts. Move session/request browsing to secondary detail while preserving pagination, virtual-list focus, request loading/error/empty distinctions, evidence meaning, playback boundaries, privacy, and provider-state caveats.
- [ ] Redesign appearance interaction and presentation while preserving seed preview/save/reset and contrast checks through the existing API.
- [ ] Integrate responsive layout and both locales/themes. Remove or replace old CSS only after verifying utility precedence and computed styles. Do not modify generated gateway assets outside the build workflow.
- [ ] Verify a failed multi-page session traversal can resume from its last successful cursor through the final page. Verify theme write serialization, stale notice clearing and surfaced errors. Check status text contrast against 4.5:1 in both schemes.
- [x] Add prominent edit shortcuts for questions, each rule, fallback and each model pool. Keep the drawer open while opening the inspector; distinguish policy connection editing from layout-only canvas selection/movement. Add focused structural regression coverage and preserve all existing handlers.
- [ ] Recheck real-browser keyboard/pointer editing and policy-vs-layout save behavior after the usability refinement. The local synthetic browser confirmed the monitoring data and workflow shortcut visibility and verified `elementFromPoint` targets the rule node; exercise actual edits, connection choices, layout save, and policy PUT separation before declaring acceptance.
- [ ] Review the complete diff by ownership. Confirm no unrelated dirty changes were lost or inadvertently swept into the task.
- [ ] Do not commit the whole current working tree: the starting tree already contained unrelated active dashboard edits. Present a scoped commit plan and exclude all unreviewed pre-existing changes and generated `jev_gateway/static/` output.

## Child deliverables

- `09-28-dashboard-shell-visual-system`: shared shell, theme/token mapping and integration-owned files (`App.tsx`, `main.tsx`, `i18n.tsx`, shared styles, package/build configuration and project-owned UI primitives).
- `09-28-strategy-monitoring-home`: registered strategy browser, live-session distribution, model-specific activity connections, secondary session/request detail and monitoring-specific view/styles/tests. Owns approved process-local backend activity instrumentation and additive read-only monitoring contract. Coordinate a single writer with the shell owner for `App.tsx`, `api.ts` and `i18n.tsx`; no overlapping shared-file edits.
- `09-28-strategy-canvas-visual-redesign`: coupled `RoutingEditor.tsx` and `RoutingCanvas.tsx`, config-specific styles/tests, no interaction logic change. Ask the shell owner for any shared style/token integration.
- `09-28-dashboard-appearance-redesign`: appearance view/styles/tests with preserved seed behavior; shared palette and `App.tsx` edits belong to the shell owner.

Every child requires its own design/implementation artifacts and curated manifests before starting. Their order and shared-file boundaries are explicit here; a parent link alone does not resolve dependencies.

## 合并旧任务后的执行项（2026-09-30）

源任务已获用户批准按“已合并”归档，逐项映射在 `research/legacy-task-consolidation.md`。这里承接待办，不把旧的已执行测试当作当前验收；监控子任务无需重新激活，剩余跨视图监控验收由父任务承担。

- [ ] 核对映射中的 4 项全局画布缺口、10 项旧 UI 验收及旧工作流浏览器缺口，在对应子任务记录当前证据；原先已通过的实现和研究资料作为回归基线保留。
- [ ] 父任务验证原始证据键盘访问、preview/selected 与详情各状态、虚拟滚动/焦点、多页遍历恢复，覆盖 activity 的 401/超时/页面隐藏与恢复/迟到响应，以及 route trace 在选择/草稿/关闭/卸载变化时的取消边界。跨文件修改先与 shell 和策略负责人确认 ownership。
- [ ] shell、appearance、策略画布子任务分别完成新增的结构/主题/手势验收后，父任务执行桌面和高屏、390px/320px、双语、双主题、reduced motion 的合成浏览器交互与截图审阅。
- [ ] 在最终树重跑原 `09-27` 收尾门槛：frontend lint/unit/typecheck/build、bundle freshness、正式隔离 browser suite、相关 gateway/security 测试、完整 `uv run pytest -q`、`uvx pyright` 与 `uv build`。保留测试发现、目标目录和源码/CSS 归属检查；不访问真实网关或上游。
- [ ] 完成全范围检查和现有 spec 一致性复核后再提出限定文件的提交方案。旧任务未完成的提交确认在此继续跟踪；本次合并不执行 Git 暂存或提交，不自动勾选任何验收。

## Verification

Run from repository root:

```bash
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
sh scripts/build-frontend.sh --check
uv run pytest -q tests/test_gateway.py -k 'dashboard or canvas_layout or configuration'
git diff --check
```

Run broader project tests if edits cross the targeted gateway/security boundaries. Build and freshness checks must run after the final frontend edit.

Browser-test a local synthetic setup with `/v1/` intercepted. Never test against the user's live gateway or use real records/config/logs. Cover desktop, 390px and 320px; EN and ZH; light and dark; reduced motion; multi-page live-session grouping by strategy/model, incomplete cursor/error/unknown-attribution states, and secondary session/request access; detail loading, empty, error and missing evidence; policy draft, validation, review, warning acknowledgement, apply and reset; pointer selection/pan/marquee/drag/connection; zoom/Fit and inspector reachability; layout save independently from policy save; keyboard focus and list scrolling. Check document overflow and actual `elementFromPoint`/pointer interactions, not screenshots alone.

## Risk and rollback points

- Stop before changing coordinate or hit-target geometry. If style changes alter canvas dimensions or overlay measurements, update the geometry contract and tests in the same task, then re-run focused browser checks.
- Keep policy mutations and layout writes separate. Verify that view playback, selection and layout updates do not issue policy PUT requests.
- Keep theme writes to the existing seed shape; verify seed changes do not break neutral surface contrast.
- On failure, revert only reviewed redesign-owned hunks. Never use `git reset --hard`, blanket checkout, or commits containing unrelated in-progress modifications.
- Do not commit until the Trellis finish gate is complete and the user approves the scoped commit.
