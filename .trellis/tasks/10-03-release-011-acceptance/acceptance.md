# 公开 0.1.1 发布验收

最终公开版本的产品与安装验收及独立最终评审已通过。发布源码为 `6fc0f0e19e31f52d8e831593e8c530aed7e73141`，对应 [CI run 37132156378](https://github.com/TexasOct/jev-gateway/actions/runs/37132156378) 和稳定/latest [Release 402565482](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.1)。公开 wheel SHA256 为 `2598f5ab58d1c90c1cb4b788bbf2d2193a28f247fc6d6b6ae01ec7e8fd6a2038`。[独立评审](check-final-acceptance.md) 对 R1 至 R7 及收尾准备给出 PASS，无阻塞问题。报告推送、归档、日志和发布说明交付仍须完成，整个任务尚未关闭。

| 需求 | 实际证据与范围 | 结论 |
| --- | --- | --- |
| R1 / AC1 | 三个版本所有者均为 0.1.1，65 个其他锁定依赖未变化。已推送 main 与签名 tag 指向发布源码，CI head 相同；两项功能均在该源码中。报告提交可随后推进 main，保留已验收 tag。 | 通过 |
| R2 / AC2 | 修复后的源码通过 lint、233 项前端 unit、118 项 browser、767 项 pytest、Pyright 零诊断、TypeScript/build/freshness、lock、shell、wheel/sdist 与 release validator。静态构建串行，产物未提交。 | 通过 |
| R3 / AC3 | build、Ubuntu smoke、macOS smoke、release 四个 jobs 全部成功；两平台分别通过 59 项检查，接受同一份 wheel。 | 通过 |
| R4 / AC4 | 稳定/latest 状态，四个指定资产、全部 GitHub digests、两份 sidecar、pinned/latest 安装器、内嵌 tag、Python/version/license/入口/模板均核验。48 个 tagged Python/模板文件及全部 52 个包文件内容匹配，含四个静态文件。 | 通过 |
| R5 / AC5 | 最终实际下载的公开 wheel smoke 59 项、隔离公开安装器 23 项均原生退出 0，success/cleanup true。涵盖带空格运行目录、独立 uv、真实本地鉴权 API、生命周期、重装和卸载保存。 | 通过 |
| R6 / AC6 | 已安装公开 wheel 提供静态资源，未重建。118 项 browser 零失败、跳过、重试或 flaky，零逸出 API；133 项安装后后端测试通过。Key 页六项、画布九项验收逐项映射，其他已连接页面回归通过。 | 通过 |
| R7 / AC7 | 用户批准的两文件变化与预览 SHA256 完全一致。普通默认路径安装器通过 14 项检查、16 条子命令全部退出 0，success/cleanup true。安装 0.1.1 全部 52 个文件一致，原生服务保持运行，鉴权 health/静态资源与入口/元数据通过。批准后完整基线及原始记录保留。 | 通过 |
| R8 / AC8 | 脱敏证据、失败历史、发布说明、spec 与原有工作保存检查已准备，独立最终评审 PASS。Git 推送/归档、日志和公开说明交付完成后关闭此项。 | 收尾中 |

源码与打包证据见 [check-repaired-source.md](check-repaired-source.md)、[preview-fix-gates.json](verification/preview-fix-gates.json)、[repaired-source-gates.json](verification/repaired-source-gates.json)；公开身份链见 [final-artifact-audit.json](verification/final-artifact-audit.json)。两个平台接受同一构建产物，公开下载又与 CI 产物核对。候选包或第一次发布的成功结果不替代这条最终身份链。

安装证据见 [check-final-public-install.md](check-final-public-install.md) 和 [final-public-install-results.json](verification/final-public-install-results.json)。uv 未记录 archive SHA256 时，观察器先校验实际传入 wheel 的名称、大小和 SHA256，再把该路径与安装后的 file URL 连接，并核对整个包的文件集合和字节。观察器路径不写入安装状态。

功能证据见 [check-final-public-browser.md](check-final-public-browser.md)、[final-public-browser-results.json](verification/final-public-browser-results.json)、[final-installed-backend-results.json](verification/final-installed-backend-results.json) 和 [图像/几何清单](verification/final/artifacts-manifest.json)。浏览器的 API 为合成场景；后端测试运行安装后的真实代码，使用临时运行目录、模拟上游与外连保护。真实本地鉴权、数据库和生命周期由安装验收单独验证。语义默认路径/判定失败、容量、原子写保护等子项同时保留相应后端及源码 unit 证据，不扩大浏览器场景的覆盖声明。

默认路径证据见 [check-final-operator.md](check-final-operator.md)、[final-operator-results.json](verification/final-operator-results.json)、[批准后调整](verification/operator-approved-adjustment.json) 与 [父会话复核](verification/parent-final-audit.json)。用户明确批准移除 `defaults`，将 11 个空标签池绑定原模型，并为八个空 overlay 选择补充已有标签。三个策略及其默认策略、类型、条件和选项保持原值；其余已评审值保持原值。该配置仍遵守 0.1.1 的能力、上下文、输出、排除、continuation 和故障处理规则，不保证所有请求都走旧全局固定模型分支。

升级保存的是批准后的七项条目；与批准前比较，两个配置文件是明确例外，其余为四个不变原文件和一个仍未创建的主题文件。原备份与新一致性备份均保留，两个凭据文件权限为 `0600`。所有原始列上的记录按包含类型、NULL、BLOB 与重复次数的 multiset 核验：requests、decisions、upstream_requests、outcomes 各 10 条，assistant_continuations 4 条，均无新增或丢失；config_versions 从原始 10 条，经配置调整后 11 条，升级后为 12 条。SQLite 完整性为 `ok`。没有真实生成、发现或判定供应商请求。

父会话在安装执行结束后再次核对实际安装的 52 个文件、原生模块/home/token 归属、鉴权 health/两个 Dashboard 资源、批准后文件基线和所有原始记录。随后检查全部 708 个当前用户进程的原生命令行，未发现残留验收进程，4178 可绑定。操作者服务保持运行，原有其他开发服务未被停止。tester 的较早检查曾遇到七个扩展元数据访问拒绝；父会话的独立命令行复核没有未解析进程。原始检查失败和修正范围均保留。

以下失败未被后续成功改写：

- 第一次发布两次安装后 browser 均为 117/118，暴露重置后配置预览消失。修复把信息面板开关放在保留挂载的 wrapper 中，继续保留 config-hash 草稿重建；保存收起、重置保留展开。原断言保留，并等待真实配置重载呈现。签名备份、原资产和 tag bundle 保留后，以 tag-specific lease 替换 v0.1.1。
- 第一轮安装来源验证遇到 uv 未记录 archive hash；后续使用真实输入观察与全包核验。后端资格测试曾因 LiteLLM 导入时尝试远程价格表而在收集前失败；最终选用已安装版本自带的本地价格表，保留网络限制和测试断言。
- 首次默认升级安装了正确公开文件，但旧运行配置被当前 schema 拒绝。已核验实际公开 0.1.0 回滚 wheel 的 digest、RECORD 和 54 个产品文件，恢复原运行服务；目标预览和独立审查完成后才取得上述两文件批准。
- 安装后清理扫描的宽泛目录匹配曾误包含原有源码开发服务。后续按验收路径检查并保留该服务；父会话另作完整当前用户命令行复核。所有失败的原生日志和退出记录仍在私有证据目录。

原配置、凭据、SQLite 备份、进程 PID/argv、原生日志与安装环境均留在 `.git/jev-release-011-acceptance/`。私有边界和最终证据根目录为 `0700`，原始日志及备份为 `0600`；安装工具自身保留运行所需权限。提交内容仅含已审阅摘要、退出码、计数、SHA256、合成 UI 图像和几何。最终收尾采用临时 index、签名提交和新 HEAD 的正常 index 重建；保留原有 journal 差异、四个其他任务与独立 Key-page worktree。发布说明见 [release-notes.md](release-notes.md)。
