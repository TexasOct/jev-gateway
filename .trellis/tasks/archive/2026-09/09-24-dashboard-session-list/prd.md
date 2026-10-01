# 监控会话列表信息调整

## Goal

在 dashboard 监控界面左侧列表中展示简明的会话元数据，用首次请求时间、session ID 等信息替代可能很长的上下文内容。

## Confirmed facts

- 父 dashboard 任务已更新为移除列表消息预览，并要求展示当前 live session 首次 intake 时间及最新请求排序。
- 当前监控数据来自实时会话和留存请求；历史或已过期会话不属于列表范围。
- `requests.received_at` 适合代表请求进入时间，但 SQLite 的保留上限会清理旧行；`SessionState.created_at` 则是成功路由后创建内存会话的时间。两者都不能直接保证真实首次请求时间。

## Requirements

- 左侧列表不展示上下文、用户消息预览或大段请求内容。
- 列表展示 session ID、首次请求时间；保留有助于辨识会话的精简状态和路由信息，具体字段经现有 API 核对后确定。
- 首次请求时间应为当前 live session 在本进程中第一次被接收的请求时间，且不受留存记录裁剪、内容捕获开关或证据存储降级影响；需考虑请求记录先于路由、会话创建可能晚于首个请求，以及会话过期或淘汰后的生命周期。
- 无可验证时间时显示未知，不以最新请求或首次成功路由时间冒充。
- 列表 API 不查询或返回 `prompt`、消息及其他上下文内容；详情 API 保持现有证据呈现。
- 不改变点击会话后的详情证据展示或现有鉴权边界。
- session list 与选中会话的 request list 均支持服务端 cursor 分页和客户端虚拟滚动。滚动到接近底部时请求下一页，按需传输和渲染条目。
- session selector 和 request timeline 使用两个独立固定高度窗口，`height`、`min-height`、`max-height` 相等，分别按桌面和窄屏断点设置。request timeline 的高度大于 session selector，以给详情记录留出查看空间。
- 分页不得改变 live session TTL、请求留存上限或历史会话范围。Request list 按 `received_at DESC, rowid DESC` 游标分页；sessions list 为合并 live memory 与留存证据后的有序结果集分页，cursor 绑定 endpoint 与排序键，并由服务端做完整性校验。详情 cursor 还绑定 session ID；分页请求仍须通过现有 Bearer 鉴权。
- 分页按尽力一致实现，不创建跨请求数据库快照。翻页期间新增、过期或更新 live session，以及证据裁剪，都可能使项目在排序中移动，造成漏项或后续页变化。客户端按稳定 session/request ID 去重；不承诺快照一致或并发变化下无遗漏。

## Acceptance criteria

- [ ] 左侧列表在有长上下文的会话中也只渲染简明元数据，无消息预览。
- [ ] 首次请求时间反映本进程内当前 live session 的首次请求，即使早期 SQLite 证据被裁剪、捕获关闭或存储不可用也保持正确；缺失数据有明确占位。
- [ ] 列表接口不读取或输出请求上下文字段，长上下文不会增大列表响应。
- [ ] session ID 可辨识，会话选中和刷新行为保持不变。
- [ ] 详情视图仍可查看现有允许显示的留存证据。
- [ ] session list 和 request list 各自拥有固定高度的虚拟滚动区域。接近底部时取下一页，窗口外记录不创建 DOM 元素，空列表与满列表容器高度相同。
- [ ] API cursor 分页有明确 page size 上限、`next_cursor`/`has_more` 字段和稳定排序；会话详情分页仍只允许访问当前 live session。
- [ ] 滚动加载下一页时仅拉取该页记录。静态数据集分页不重复、不遗漏；分页期间源数据变化时允许后续页变化，客户端按 ID 去重；无效及跨 session cursor 被拒绝。
- [ ] 请求列表采用 `(received_at, rowid)` 复合排序键，跨页顺序稳定；session 列表游标含确定的排序键和 `session_id` tie-breaker。
- [ ] 两个窗口的最大高度与最小高度相等，内容高度不会撑开外层 panel。request timeline 窗口明显高于 session selector；窄屏可调整数值，但每个窗口在该断点仍固定。
- [ ] API 为两类列表返回有界 page、`next_cursor` 和 `has_more`；cursor 错误或用于错误 endpoint/session 时返回明确 4xx，不泄漏数据。
- [ ] 分页为尽力一致：cursor 基于稳定排序键与接口/session 绑定，不创建跨请求数据库快照。分页期间新增或过期的 session、留存裁剪可能改变后续页；客户端按稳定 ID 去重，UI 不承诺全程快照一致。
- [ ] 切换会话、手动刷新以及请求返回期间不混入旧会话数据，滚动加载失败后可重试，已有记录与选中项不丢失。
- [ ] 相关前后端测试覆盖首次请求、被拒绝请求早于会话创建、会话过期/淘汰、存储缺失及内容不进入列表的情形。

## Out of scope

- 改变会话 TTL、留存策略或增加历史会话浏览。
- 改变请求详情中的内容捕获和脱敏策略。
- 记录跨进程重启或 live session 淘汰后的历史首次请求时间。
