# 评估交付执行计划

## 有序工作清单

- [x] 建立源码/测试/运行时依赖盘点与行为合同研究。
- [x] 完成 TypeScript/Node.js 依赖替代研究，记录 FastAPI/Pydantic、HTTPX、LiteLLM、dotenv、Uvicorn 的边界。
- [x] 完成 Rust 原生路线研究及有限 provider 支持假设下的粗估。
- [x] 并发完成 API/SSE/provider、路由/配置、存储/dashboard、CLI/发行/验收四个领域的细分研究。
- [ ] 逐项阅读各域报告，对齐人日假设与覆盖边界，标注重复计费并形成统一估算汇总。
- [ ] 交叉核对全项目区间、兼容验证矩阵、依赖替代结论、迁移阶段和回滚方案。
- [ ] 对照 PRD 验收条件审阅报告完整性，提交规划总结供用户确认。

## 产物位置

- `research/gateway-inventory.md`
- `research/dependency-mapping.md`
- `research/rust-path.md`
- `research/api-provider-estimate.md`
- `research/routing-config-estimate.md`
- `research/storage-monitoring-estimate.md`
- `research/cli-release-validation-estimate.md`
- `research/estimate-reconciliation.md`（正在委托审查）

## 验证方式

- 所有估算须说明包括哪些实现/测试工作，确认跨报告没有重复相加。
- 结论锚定当前源码与测试的路径/行号，不将假 LiteLLM 测试当作真实 provider wire 证明。
- 工作量分别给出有限 provider 范围与全量 LiteLLM provider 的处理办法；全量未知时不伪造固定总价。
- 只读检查 `git status` 确认产品代码未改；允许本任务研究与规划文件变更。
- 不运行网关改写、依赖安装或迁移测试，因为这次是评估任务。

## 风险与回退

调研文件只在当前 Trellis 任务目录内增改；若估算对账发现口径缺证据，则保留各域区间并明确无法合并的原因，不通过扩大假设制造确定总数。任何实现移植都需后续单独任务和新的范围确认。
