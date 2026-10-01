# CLI、发行与迁移验收估算

范围：按当前工作区静态阅读。本文只计算 CLI、进程、凭证文件、日志、已有 React 构建接入、容器、发行与安装，以及跨模块的系统级差分和灰度。HTTP 路由、provider transport、策略、catalog、SQLite 实现、dashboard API 的开发和各自单测已由同任务 `research/gateway-inventory.md`、`research/dependency-mapping.md`、`research/rust-path.md` 覆盖，此处不重复计价。文件行号随工作区修改可能漂移。本次没有启动服务、构建产物或执行故障注入。

## 当前合同与容易遗漏的边界

| 边界 | 工作区证据 | 移植验收重点 |
| --- | --- | --- |
| 命令和输出 | `jev_gateway/cli/main.py:29-100,112-253,255-294`；`jev_gateway/cli/output.py:10-17,28-44`；`pyproject.toml:17-19` | 两个入口 `jev`/`jev-gateway`，全局选项，doctor/status/start/stop/restart/logs、config、provider、install init、uninstall；退出码 0 至 6、JSON 单对象形态和 stdout/stderr、帮助/版本/参数错误。`logs --follow --json` 拒绝，`uninstall --purge` 在正式输出前向 stderr 打印计划（`main.py:178-182,248-250`）。不要直接接受 clap 或 Node 解析器默认错误文本。 |
| 进程与健康 | `jev_gateway/cli/process.py:20-108`；`jev_gateway/cli/server.py:11-17`；`jev_gateway/cli/main.py:135-172`；`tests/test_cli_process.py:13-40`；`tests/test_cli_review_regressions.py:84-90` | 新会话启动、日志重定向、PID 与一次性 token、`ps` 命令行和状态的所有权核验、SIGTERM 等待与仅 `--force` 时 SIGKILL；启动后健康等待、已运行/僵尸/外部 PID 的安全行为。当前只向记录的 PID 发信号，不能未经决定改为整个进程组。Windows 当前主动拒绝后台管理。 |
| 凭证与配置命令 | `jev_gateway/cli/secrets.py:15-30,39-86`；`jev_gateway/cli/providers.py:49-55,84-97`；`jev_gateway/cli/config_ops.py:53-54`；`jev_gateway/cli/install_state.py:46-61`；`tests/test_cli_providers.py:15-55`；`tests/test_cli_review_regressions.py:44-62,95-102` | 环境变量/stdin/TTY 三条输入路径，stdin 8 KiB 上限，禁换行和 NUL；`.env` 备份、同目录临时文件、fsync、0600 和替换；只输出 `key_present`，config show 掩码，加载邻近 `.env` 的覆盖优先级。配置与 provider 内容校验属于 catalog 模块，本项仅计 CLI 编排和安全写入。 |
| 日志 | `jev_gateway/logging/config.py:17-19,66-87,134-194,209-257`；`jev_gateway/gateway.py:1481-1489`；`tests/test_logging_config.py:44-138` | pretty/compact/JSON 格式、允许字段、长度限制、异常栈仅保留安全位置、依赖库输出抑制；access log 受配置控制。运行时默认堆栈及第三方 SDK 报错不能带密钥/原始 prompt；进程日志跟随中断要验。 |
| 前端资产 | `frontend/package.json:6-11`；`frontend/vite.config.ts:9-14`；`scripts/build-frontend.sh:10-33`；`pyproject.toml:30-31`；`jev_gateway/dashboard.py:120-145` | 保留现有 TypeScript/React UI，继续输出 `/dashboard/` URL；生成哈希 JS/CSS、HTML 和静态文件缓存/安全头。源时间戳 `--check` 与产物字节/资源引用校验均不能失效；仅迁移打包位置与服务读取方式，不估重写页面。 |
| Docker 与发布 | `Dockerfile:1-42`；`scripts/container-entrypoint.sh:4-26`；`compose.yaml:3-9`；`.github/workflows/release.yml:16-68`；`scripts/validate-release.py:16-91` | 当前 Node 阶段构建资产、Python 阶段构建 wheel、非 root UID 10001 和运行目录卷；CI 先前端 lint/test/build，再 pytest/pyright/wheel 校验；发布安装器、wheel 及各自 SHA256，预发布不会成为 latest。`Dockerfile:5-8` 注释解释跨平台 native lockfile 下采用 `npm install`；迁移需实测所选目标的锁文件可复现性。 |
| 安装/卸载 | `scripts/install.sh:17-90,95-202`；`scripts/install-local.sh:29-50`；`scripts/uninstall-local.sh:5-21`；`jev_gateway/cli/uninstall.py:21-77`；`tests/test_install_script.py:142-202,214-315,324-392` | 指定版本安装器最多委托一次，校验 installer SHA、wheel SHA、唯一 METADATA 名称和版本后才交给 `uv tool install`；Git ref 路径无 release 校验、`--dry-run` 不下载；卸载辨认所拥有 launcher，默认保留 runtime，`--purge` 拒绝危险路径并需确认。旧 shell 安装器无法把新二进制当 wheel 安装，新包要有独立资产/安装协议；维护旧 release 下载和回滚路径。 |

`tests/test_release_validation.py:61-75,108-134` 明确要求 wheel 内容等于源文件、资产缺失阻断发布和 CI 顺序。当前测试对本地/容器初始化 `.env` 的权限、`logs --follow` 中断以及实际安装后的升级/降级覆盖有限，迁移期补系统测试；代码上 `scripts/install-local.sh:38-43`、`scripts/container-entrypoint.sh:21-22` 的复制步骤没有显式 chmod 0600，不能未经测试声称现有路径一律保证该权限。

## 两条语言路径的依赖选择

| 职责 | TypeScript/Node.js 候选 | Rust 候选 | 必做的项目层工作 |
| --- | --- | --- | --- |
| 参数与子命令 | Node 内建 `process.argv` 配合自有解析，或评估命令解析库；选包和版本待核实 | `clap` derive 子命令 | 自有退出码/JSON/参数报错适配层；安装身份和版本来源不由解析器提供。`clap` 官方文档仅保证子命令支持，不保证 argparse 兼容 [R3]。 |
| 后台进程 | Node `child_process.spawn` 的 detached/stdio/unref（非 Windows）；平台行为参 [N1] | `std::process::Command`，Unix session/process group 的具体实现待原型确认 [R1] | PID/token 所有权检查、拒绝外部进程、SIGTERM 超时和强制杀死、安全清理、foreground 与日志跟随；跨平台支持范围按现有 macOS/Linux 及 Windows 拒绝行为验收。 |
| 密钥与日志 | `node:fs/promises`、`node:crypto`、自定义 allowlist 格式化；Node fs 操作并发需应用同步 [N2] | 标准库文件 I/O；`tracing-subscriber` JSON 格式候选 [R2] | 文件权限、临时写入/备份、故障恢复与日志字段/异常脱敏由项目实现；文档未证明 rename 在所有目标文件系统原子，也未证明库能自动脱敏。dotenv 覆盖/解析差异已在 `research/dependency-mapping.md` 与 `research/rust-path.md` 讨论，此处只计算 CLI 集成。 |
| 产物 | 复用 Vite 构建；Node 程序包/tarball 或平台二进制工具尚待选择 | 复用 Vite；Rust 各目标 binary + 静态资产目录或嵌入式资源待选择 | 明确入口/版本来源、可验证资产清单、安装前验哈希与身份、旧数据目录/SQLite 的回退读写能力；`cargo install` 只解决 Rust binary 构建和安装的部分问题，不能沿用 wheel 身份验证 [R4]。 |

上述都是候选，未锁定版本、许可证或目标架构。Node 官方文档确认非 Windows 上 `spawn({detached:true})` 会建立新 process group/session [N1]；Rust `Command` 是进程构建器 [R1]；`tracing-subscriber` 的 JSON 输出需相应 feature 且没有本项目 allowlist 合同 [R2]。依赖选型在兼容原型后冻结。

## 人日拆分与口径

一人日按 8 小时净工程时间，假设工程师熟悉目标语言、可拿到脱敏旧库及假上游，保留现有 React UI，主版本只验经确认的实际 provider 配置范围。区间含本项实现、针对性测试、评审及集成调试；不含重新编写 HTTP/provider/路由/存储/dashboard API 和它们的单测，不含真实厂商账户采购、签名或云身份适配。两种语言是替代方案，不把两列相加。低端按单一 macOS/Linux 常见环境及发行目标，较高端按两种 OS、更多架构及旧安装升级回退复杂度；资产目标矩阵未定时需要重新估算。

| 工作包 | Node.js 人日 | Rust 人日 | 计价边界 |
| --- | ---: | ---: | --- |
| CLI 参数、输出、配置/provider/install 命令编排 | 4 至 7 | 5 至 8 | catalog/provider 校验实现排除；包含退出码、TTY/JSON、help/version。 |
| 后台管理、健康、日志跟随、PID/token 所有权 | 3 至 6 | 4 至 7 | 包含信号、僵尸/外部 PID、停止超时；Rust 需处理 Unix 会话启动与进程控制封装。 |
| 凭证文件、初始化状态及日志安全格式 | 4 至 7 | 5 至 8 | `.env` 写入/备份权限、输出脱敏、三种日志形态；不重复 catalog 的 dotenv 解析器研发。 |
| Vite 资产构建接入、静态打包检查 | 2 至 4 | 2 至 4 | 继续使用已存在的 Vite UI；dashboard API/路由的开发排除。 |
| Docker、CI、release 资产和校验器 | 4 至 7 | 5 至 9 | 至少一次 clean build，二进制平台矩阵增大时另估；不含应用业务代码测试。 |
| curl/local 安装、升级/卸载、旧 wheel 回退 | 4 至 8 | 5 至 9 | 现有 wheel 安装器保持可用；新产物另设校验身份，保留运行目录数据。 |
| 共享 Python golden、差分夹具和样本基线 | 8 至 14 | 8 至 14 | 只做一次。固定输入/受控假上游/旧库、响应与持久化快照、密钥替换；若两条路线都原型开发，合并预算也只收一份。包含既有 Python 测试向跨进程协议样本转录，不等于重写 Python 单测。 |
| 目标语言全链路差分、故障注入、灰度及回滚演练 | 9 至 16 | 11 至 20 | 每个候选各跑一次；包含包装两侧的进程/发行路径，不重复具体模块单测。 |
| **此范围合计，单条路径** | **38 至 69** | **45 至 79** | 逐项顺序人日；共同部分 8 至 14，单语言特有 Node 30 至 55、Rust 37 至 65。 |

`research/rust-path.md` 的「CLI、进程控制、密钥文件及日志」10 至 18 人日和「容器、二进制发行、安装/回退」7 至 13 人日是较粗的模块桶；本文 Rust 前三项 14 至 23、发行三项 12 至 22 是更明确的风险拆分，不能把两套桶叠加。其「行为样本、差分夹具」8 至 14 人日对应本文共享 golden；「全链路差分」16 至 28 人日则可按共享样本加 Rust 执行 19 至 34 重新核预算，差异来自灰度、平台矩阵与基线算入方式，应在主报告选同一个口径。这里的总数是交付横切层预算，不是网关整体 1:1 总成本；完整 LiteLLM provider 覆盖的增量仍按 `research/rust-path.md` 的条件式矩阵估算。

## 关键路径与验收矩阵

关键路径是先冻结当前 Python golden、支持的 provider 和发行目标，再构建目标运行时 CLI/密钥/进程合同；使前端静态产物进入候选容器及发行文件；随后跑同一假上游与旧库的全链路差分，最后使用小流量灰度并实操回滚。新的二进制分发协议在 release 之前必须定稿，不能先发布再让旧 `install.sh` 猜资产格式。Rust 的目标三元组/静态链接与 macOS/Linux 构建签名、Node 的最低 runtime 和包安装布局都属于起步门槛，尚未有产品决定。并行写代码可以缩短日历时间，但 golden 冻结、安装身份校验及回滚验证仍串行。

| 验收面 | 共享 Python golden | Node 专项 | Rust 专项及通过条件 |
| --- | --- | --- | --- |
| CLI | 同样输入比较 JSON key、错误 code/退出码、stdout/stderr、help/version、stdin/TTY、`--dry-run`；现成入口 `tests/test_cli_main.py:11-56`、`tests/test_cli_review_regressions.py:18-102` | 构建后以真实 `jev`/`jev-gateway` 可执行入口验证 Node 版本来源和信号退出 | 多目标 binary 按同一 corpus 跑，核对 `clap` 错误适配；不得在不支持平台默默改变结果。 |
| 凭证/日志/进程 | 0600、备份/原子替换失败、密钥不进 stdout/stderr/日志、错误 trace 脱敏；PID 不可伪造、SIGTERM/超时/force；`tests/test_logging_config.py:44-138`、`tests/test_cli_process.py:13-40` | 真实 `spawn`、fs 异步并发写入、SIGINT 退出 `logs --follow`、二进制/运行时更新后旧 PID | Unix 会话和二进制身份、文件权限与崩溃后临时文件；通过条件为永不误杀外部 PID、密钥不泄漏，强制终止仅在要求时。 |
| HTTP/流/状态跨层 | 同一受控上游记录原始请求、返回同步/分块/失败；比较 status/header/body/SSE `[DONE]`、活动状态、outcome、SQLite 续接；入口 `tests/test_gateway.py:729-852,1259-1526,1808-2056,2080-2442`、`tests/test_records.py:90-162,430-604` | 断开浏览器/代理连接、下游背压、abort 后无遗留 Node 任务与重复记录 | 断开 Rust stream 时上游释放，异步/阻塞队列停止和 flush 边界；通过条件为差分符合已冻结 Python 基线及公开 API，不将未知异常原文返回。实际取消时 Python 行为须先测，不能从代码推断 outcome 一定落库。 |
| 故障注入 | 非 2xx/半途断流/连接超时、队列满、磁盘写失败、重载坏配置、旧 SQLite、错误凭证、无前端 asset；比较稳定错误和回滚后原状态 | Node 进程强杀、未处理拒绝、平台 native 包缺失、复用旧 `.env` | Rust panic/任务取消/目标 triple 缺失；通过条件是无敏感信息泄露、无损坏旧配置且可恢复启动。配置/存储模块自身修复工时不在本表。 |
| 打包安装 | 用 `tests/test_install_script.py:142-392`、`tests/test_release_validation.py:61-134` 保持历史 wheel 校验路径；静态资源 URL、哈希、无遗漏资产、预发布/latest 标签 | 新包校验哈希/身份，离线或伪下载重放 install/upgrade/uninstall；Node runtime 版本与卷持久性 | 每个选定 OS/arch 的 binary 和容器 clean build、权限及链接依赖；新安装协议验证目标架构/哈希/版本，旧 wheel 不受损。 |
| 灰度回滚 | 固定一份脱敏生产近似配置与旧库副本，影子读/预览先行，保留原 Python wheel/镜像与安装脚本 | 小流量逐步切换；每阶段比较 5xx、延迟、SSE 完成率、记录缺口，遇阈值退回 Python | 同条件切流和回滚；验收为回滚后旧 wheel 可读配置和数据库、CLI/仪表盘可启动且没有写入破坏旧 schema 的不可逆迁移。阈值由运维/产品先定，本文不伪造数值。 |

Python golden 可共用输入、脱敏 JSON/二进制样本、假上游、正常和失败预期、旧库副本以及机密哨兵扫描。目标语言独有的是构建/安装工具链、PID/信号/权限落地、SDK 流取消和异步清理、不同架构资产验证。共享夹具必须记录不确定行为（例如客户端取消时的落库时机），不能把现有 monkeypatch 通过当成真实供应商 wire 兼容证据。

## 已核外部资料及未决项

- [N1] Node 官方 child_process 文档：https://nodejs.org/api/child_process.html （`spawn`、非 Windows 的 detached session/process group、stdio/unref）。
- [N2] Node 官方 fs 文档：https://nodejs.org/api/fs.html （`fs/promises` 的文件方法及异步操作不自动线程安全）；跨文件系统 rename 原子性、chmod 生效范围仍待目标平台故障注入。
- [R1] Rust 标准库 Command 文档：https://doc.rust-lang.org/std/process/struct.Command.html （进程构建器；Unix session 等价策略需另验）。
- [R2] tracing-subscriber JSON 格式：https://docs.rs/tracing-subscriber/latest/tracing_subscriber/fmt/format/struct.Json.html （有 feature 限制，不代替项目脱敏）。
- [R3] clap derive 子命令：https://docs.rs/clap/latest/clap/_derive/_tutorial/index.html （不承诺 argparse 诊断兼容）。
- [R4] Cargo install：https://doc.rust-lang.org/cargo/commands/cargo-install.html （binary 安装能力；旧 wheel 资产校验另由本项目实现）。

仍待确认的输入：真实安装基数与升级来源、支持的目标 OS/架构、Node 最低版本、Rust 目标三元组和链接模式、真实使用的 provider 清单、旧 SQLite 可回滚规则、灰度观测阈值；这些改变发行和验收区间，不能从候选依赖名称推断。外部页面的 `/latest/` 不是本项目已锁定版本，也没有据此声明具体最新版本或跨语言行为等价。
