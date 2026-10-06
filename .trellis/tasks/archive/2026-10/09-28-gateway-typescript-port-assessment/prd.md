# 评估 jev_gateway TypeScript 1:1 移植与依赖替换

## Goal

基于当前实现，并行评估 TypeScript/Node.js 与 Rust 两种等价重构路线的工作量、Python 上游依赖替换与风险，不修改网关实现。主估算按项目实际使用并验证过的 provider 与参数范围，另行估计扩展到完整 LiteLLM provider 覆盖的增量。

## Requirements

- 以工作区当前的 `jev_gateway` 实现为准，盘点服务接口、内部模块、运行行为、测试和部署链路；按 API/SSE 与 provider、路由与配置、存储与 dashboard、CLI 与发布验收分别形成可追溯的模块研究。
- 并行评估 TypeScript/Node.js 与 Rust 两种 1:1 重构路径：分别映射 Python 第三方依赖的替代方案，说明不能机械替换的语义差异与验证方法。
- 按 API/SSE 与 provider、路由与配置、存储与 dashboard、CLI 与交付验收并发调研；给出两条路径分模块工作量、人日区间、假设、风险、关键路径与建议迁移顺序，区分 1:1 行为兼容与可选重构。
- 仅作评估和调研，不修改产品代码，不启动移植。

## Acceptance Criteria

- [ ] 调研结论可追溯至仓库文件，并由独立研究文件覆盖 HTTP/SSE 与 provider、路由与配置、持久化与 dashboard、CLI/发布验收。
- [ ] TypeScript/Node.js 与 Rust 的上游直接依赖及关键传递依赖均有替代/自研/保留边界和风险说明，未知项明确标记。
- [ ] 两条路径分别给出以上各领域的分项工作量区间与合计，检查重复计费，列明估算前提，并指出共用工作和主要差异。
- [ ] 给出可执行的兼容验证与迁移阶段建议，不实施迁移。

## Out of scope

- 改写 `jev_gateway`、迁移前端、替换生产服务或提交代码变更。

## Planning assumptions

- 主估算按项目实际使用并验证过的 provider 与参数范围；扩展到 LiteLLM 完整 provider 覆盖的工作量单独列出。全量覆盖的精确成本需等生产 provider、认证方式及特殊参数清单确定后评估。
- TypeScript 运行时暂按 Node.js 基线评估，并在最终总结中注明。
