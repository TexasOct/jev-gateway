# JEV Gateway v0.1.0 最终验收报告

正式 `v0.1.0` 已发布为公开 stable/latest release。公开 wheel 和公开安装器各通过独立安装验收，实际本地配置已完成私有备份、删除和公开重装。重装后的首次设置、provider 保存、真实模型发现、确认导入、全局默认模型、配置文件编辑、overlay、reload、三策略真实 stream 和同会话续聊均已有通过证据。最终本地服务健康运行，原始业务记录完整保留。

本报告将源码回归、native synthetic 集成、候选真实安装、公开资产、公开安装及实际 operator 验收分别列明。历史失败继续保留，不计入通过次数，也不改写原结果。独立技术、业务及报告审阅为 PASS，任务已归档并完成 journal。报告与归档记录采用 scoped temporary-index 提交，保留共享工作区的其他暂存内容；这些文档记录不改变已验证的发布 tag 或产品文件。

| 需求 | 结果与证据范围 |
| --- | --- |
| 默认配置只有原策略 | 保留 `task_aware`、`quality`、`economy` 的原 policy/options 和自动 dispatch；省略 providers、models、decision-provider 实例及上游凭据。打包模板、源测试、公开安装和实际 fresh baseline 均验证。 |
| 缺失配置初始化 | install 与默认启动只创建缺失文件；已有合法、非法或不可读取文件不会被覆盖，显式缺失路径保持错误。源码及 installed smoke 通过。 |
| 首次管理设置 | 受保护事务原子保存，loopback/same-origin 限制及 proxy header 拒绝；重复、remote、跨 origin、非法/stale/失败写入不替换现有配置。源码/native 验证，实际 setup、409 与 401 guards 通过。 |
| 管理密钥 | 新 key 限制 16 至 8192 个 printable ASCII，无首尾空白；旧加载及 Connect 保留 trim 兼容。CLI secret-env/stdin/no-echo、native 两端边界和实际 48 字符 key 均有证据，浏览器仅内存持有。 |
| 空目录仍可管理 | 完成管理设置即进入控制台，providers/models 可稍后配置，进度可关闭。实际无 provider/model 的双语控制台通过。 |
| Provider 与模型业务 | 从空配置先保存 provider，真实 discovery 返回 2 项、0 警告，确认导入指定模型。凭据 keep/set/clear、revision validation/apply、身份引用及失败反馈有源码/native/browser 覆盖。 |
| 配置编辑及 reload | 实际修改已安装 `models.json` 的 provider display name，先证明 live hash 未改变，再 config validate/reload；新 config hash 和安全投影生效，credential bytes 不变。priority-only overlay 经 reload 保留。 |
| 无可用模型 | 受控 `503 setup_incomplete`，控制台可编辑。实际未配置及 clear global 阶段均证明无新增 request/decision/upstream。 |
| 一个全局默认模型 | 每个 matched 空 tag 精确继承 `defaults.default_model`；save/clear/restore、三策略 preview、真实 headers/decision/outcome/session/retained source 均通过。 |
| Default 与字面标签 | reserved result 为 raw `default`，有明确 `defaulted` source，显示 Default/默认；配置中普通 `default` 保持字面含义。legacy unknown source 不借用 live source。源码/native/browser 覆盖。 |
| 策略编辑兼容 | `{}`、selection-only 与 legacy `tier` 经 validate/merge/save/reload 保留；只有显式 label 编辑移除旧 alias。inferred label/default destination 不进入 draft/overlay。源码及 native/UI 覆盖。 |
| 路由图与响应式 | inherited routes 有明确只读路径，active wire 归属实际 branch；320px drawer 满宽、有界高度及内部滚动。267 unit、120 browser 和 344 native 覆盖英中、桌面/窄屏。 |
| 四个导航及主题归属 | Monitoring、Strategy、Provider、Settings 四入口；Theme 与语言位于 Settings，theme 使用独立 API/file。完整模式、seed 写入、权限、错误/pending、响应式来自源码/mock suites；实际安装 UI 验证只读页面及模型目录。 |
| 真实 stream 与续聊 | 实际公共安装执行 4 次，每次非空文本、HTTP 200、stop、一个 DONE、EOF，无 error/invalid/after-DONE event；正确全局目标/default/source，native finish/model/usage、SDK 参数、每回合新增捕获均通过。第四次携带实际第一轮 assistant，并发生在文件编辑、overlay 与 reload 之后。 |
| 普通重装保留 | 私有候选安装的原 baseline、credential、有效 active overlay 字节不变；五类原业务元组各 3 条及 7 个 config-version 元组在重装及后续调用后保留。独立契约审阅通过。 |
| 公开发布 | 精确 tag commit 的 build、Ubuntu installed-wheel、macOS installed-wheel、release 四 job 成功；stable/latest 四个公共资产、pinned/latest 下载及 sidecars/digests 一致。 |
| 实际 reset/public reinstall | 私有一致备份、归属核对、owned stop、关闭端口、确认无 recovery 后只删除实际存在的配置；公开 installer 退出 0。恢复两个 launchers，54 个安装文件一致，保留全部原始记录。 |
| 最终服务及隐私 | `127.0.0.1:8000`，owned PID 40853，status/doctor 退出 0，带有效 Bearer 的 health 为 ok，活动为空，数据库完整，cleanup warnings 0，鉴权源/历史证据/backup/log prefix 未变。报告不包含秘密或私有请求、响应、reasoning、关联 ID。 |

| 验证层 | 当前有效结果 | 适用范围 |
| --- | --- | --- |
| Backend | 970 passed | 源码回归 |
| Pyright | 0 errors、0 warnings、0 informations | `uvx --offline pyright` |
| Frontend unit | 267 passed，33 files | 源码/mock |
| Browser | 120 passed | 源码/mock，英中与桌面/窄屏 |
| lint / browser types / build / freshness / lock / shell / validator | 退出 0 | 源码与 artifact；四个已有 lint warnings 和已有 bundle-size warning 保留 |
| Native six-flow | 344 passed | 真实 browser Fetch/TCP/Uvicorn/ASGI/transaction/SQLite，synthetic upstream |
| 候选 macOS installed smoke | 119 passed | 候选 package，synthetic generation |
| 候选真实安装 | 原报告 FAIL，306 passed / 2 failed；独立 required-contract review PASS | 五个核心非空成功流、普通重装与每回合捕获；另有失败的 2048 边界 |
| 只读 retained verifier | 20 passed / 0 failed | 原始 SSE/SQLite 的每回合捕获及旧行保留；没有新调用 |
| 公开 wheel installed smoke | 119 passed，退出 0，83.949 秒 | 公共下载的精确 wheel，独立安装 |
| 公开 installer installed smoke | 119 passed，退出 0，96.742 秒 | 公共下载的精确 installer，独立安装 |
| 实际公开 installer | 退出 0，9 秒 | 正常 HOME、实际 tool/state/bin/runtime |
| 实际首次 runner | 原结果 FAIL，204 passed / 1 failed，generation 0 | setup/provider/discovery/import/global/overlay/empty UI 成功；ready UI 导航假设错误 |
| 实际补充 completion | PASS，239 passed / 0 failed，退出 0，25.152835 秒 | corrected ready UI、4 次此前未执行的真实生成和最终保全审计 |

实际四次生成的客户端 budget 都为 512，SDK `num_retries: 0`、timeout 45；没有提高预算、合并 reasoning 为正文或重复调用直到通过。

| 顺序 | 策略和场景 | prompt tokens | completion tokens | total tokens | reasoning tokens | 可见字符 | 结果 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | task_aware | 39 | 39 | 78 | 36 | 4 | 200 / stop / 1 DONE / EOF |
| 2 | quality | 39 | 13 | 52 | 10 | 4 | 200 / stop / 1 DONE / EOF |
| 3 | economy | 39 | 21 | 60 | 18 | 4 | 200 / stop / 1 DONE / EOF |
| 4 | task_aware，编辑重载后同会话续聊 | 54 | 49 | 103 | 46 | 4 | 200 / stop / 1 DONE / EOF |

四次 cached tokens 均为 0。每轮留存的 route、raw label `default`、`defaulted: true`、native model、finish 和 usage 与实际请求相符。continuation key 标识归一化内容；相同回答可在同一 session 合法出现多次。检查通过 before-ID 与 request/outcome 时间窗口，证明每个完成回合恰有一个正确来源的新捕获，保留旧记录。

实际配置编辑还验证了 tag 分配的合法 overlay 和 preview：有标签时为普通标签、`defaulted: false`；最终恢复 empty-tag/global-default 配置。这一步没有第五次生成。候选真实安装已另行验证 assigned-tag 新会话，其 54 个 package 文件与公开产品文件一致。

| 实际原表 | reset 前原始行 | 最终行 | 原始完整元组 |
| --- | ---: | ---: | --- |
| requests | 6 | 10 | 全部保留，包括 NULL |
| decisions | 6 | 10 | 全部保留，包括 NULL |
| outcomes | 6 | 10 | 全部保留，包括 NULL |
| upstream_requests | 6 | 10 | 全部保留，包括 NULL |
| assistant_continuations | 0 | 4 | 新增 4 个完成回合 |
| config_versions | 1 | 10 | 原始 1 条完整保留；允许正常新增 bookkeeping |

实际 ready UI 在 `1280×900` 检查 English 与中文，24 次已认证读取、4 次模型配置读取、2 次 configured catalog 检查、2 张私有截图。empty UI 在首次 runner 中也通过两个语言。两次 UI 验证均无 pageerror、Connect 后 console error、意外 HTTP 失败、违规请求、浏览器存储秘密命中或 UI generation。连接前预期 401 和对应 Chromium network console error 单独计数；应用控制台入口为 `/dashboard/`，根路径允许返回 404。实际 UI 的这些只读检查不代表真实安装已重做全部窄屏交互或主题写入；完整覆盖以源码/mock/browser 和 native 的各自证据为准。主题 reset 保留 DELETE API/backend 契约，Settings 当前没有独立 reset 按钮。

正式 release 为 [v0.1.0](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.0)，ID `402022958`。annotated tag `a0acbdf6584b4aafbc10aaf8d6e55a0dada0e121` 指向 commit `019a3030ad735db63167bc5176f245f89293c0e4`。[workflow 37040920350](https://github.com/TexasOct/jev-gateway/actions/runs/37040920350) 使用该 head，四 job 均 completed/success。最后 readback 再次确认 tag、latest release、四个 digest 未变。

```text
公开 wheel SHA256
8fa9585c86a12f873ee2fc894c10243a25bca3673222a1c00a7d8cf35200cb9f

公开 install.sh SHA256
2147aa40b8048a17244eeae4dd976e5647a53165a50613bb74467668069aa63d

54-file package manifest SHA256
1117650fdc38c3f77776b7703f891e8e42347a6f822861b2aaee362928256bb9
```

候选 wheel archive SHA `57e49d26d089d3bbe4b06f2e7b03d0344a11a04e881ed4549f84beb4da4f6914` 与公共 wheel archive SHA 不同。实际补充执行前后分别逐字节核对公共 wheel、已安装包与当前 54 个 package 文件，mismatch 为 0，未从 checkout 导入。当前运行环境是 default uv tool 的 Python `3.12.11`、LiteLLM `1.103.2`，版本 `0.1.0`，Python 声明 `>=3.12`，许可证 `AGPL-3.0-or-later`。

旧 release `401261321`、四份资产、旧 annotated tag 与 Git bundle 在替换前已备份并复核。仅已授权的 v0.1.0 被替换，tag 使用精确旧 object 的 lease。rollback 材料位于 `/Users/texas/.cache/jev-release-backups/v0.1.0-20261002T062815Z-hemev9tu/`。实际 operator 原配置、日志、run、install state、停止前后的一致 SQLite 和原始元组位于 `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/operator-backup-final-_7i62rrb/`，目录 `0700`、文件 `0600`。原服务停止并确认无 recovery 后，实际只删除 `models.json` 和 `.env`；records/log/run/state 得以保留。

公开 installer 恢复 `/Users/texas/.local/bin/jev` 与 `jev-gateway`。正常运行目录是 `/Users/texas/.jev-gateway`，实际 CLI 位于 `/Users/texas/.local/share/uv/tools/jev-gateway/bin/jev`，install state 位于 `/Users/texas/.local/state/jev-gateway/install.json`。管理与上游密钥保存在受保护 `.env`；本报告不回显。为本次完整业务记录核对，启动时使用 `storage.enabled: true`、`capture_content: true`、`max_requests: null`。存储设置经 owned stop/start 生效，业务配置和 overlay 通过 reload 激活。最终服务保持 running，API 地址 `http://127.0.0.1:8000`，控制台 `http://127.0.0.1:8000/dashboard/`。

保留的失败及边界如下。

| 原失败 | 处理与当前结论 |
| --- | --- |
| 早期 backend 2 failed / 893 passed，以及源类型、dotenv 原始 span、literal default、implicit choices、branch wire、drawer 问题 | 实际产品修复并有新的完整 gates；原报告与失败日志继续保留。最终 970/267/120/344 只引用新完成的检查。 |
| 初期 SDK cleanup 使用 sync close | 改为与真实 LiteLLM async-only `aclose` 相符的 awaited/shielded cleanup，含线程协调与失败/断连/send/terminal 场景回归。实际最后日志 warnings 0；实际 SDK close 次数未插桩。 |
| `UV_OFFLINE=1` fresh managed Python 找不到 interpreter | 原失败保存；正常解析 Python 后的独立新安装通过。 |
| `uv run pyright` 无可执行文件 | 原 exit 2 保存；既有 `uvx --offline pyright` 通过，没有放宽类型检查。 |
| native 历史失败、browser locator、旧 CSS 字符串断言和 overlay 兼容失败 | 分别修复产品或测试定位并重做相应 gates；历史 suites 和 assertion 保留。 |
| 候选六调用报告 306/2 | 原 FAIL 不变。全 session `len(matched)==1` 的 continuation 断言错误由只读 20/0 verifier 和独立审阅纠正，五个核心成功流满足业务契约。 |
| 刻意 2048-token length 探针 | 可见字符 0，reasoning 字符 8657，provider 报告全部 2048 completion tokens 为 reasoning；200/length/DONE/EOF 和 native usage 正常。可见输出断言仍失败，未提高 budget、改写正文或重试；四次最终短 stream 不取消此边界。 |
| 实际首次 runner 204/1 | ready helper 在 Provider 列表找 canonical model，未进入实际 Find models 工作区。独立 source/DOM 诊断后保存原 helper，修正导航与目录/Settings 检查。原结果及全部字节未变；原 generation 0，补充只执行剩余 4 次。 |
| 最终 readback 无 Bearer 的 health 请求返回 401 | 安全 guard 正常；状态及 doctor 仍为 0。随后使用现有内存凭据的健康读取为 ok。两次观察分别保存，没有新生成。 |

Provider 实例启用/禁用开关、独立的 upstream active-health API/UI 和 per-strategy default 仍为明确 deferred 范围。现有 `decision.enabled` 是分类器设置，凭据存在、配置验证、发现和生成分别证明各自能力。手工确认的价格/能力是 operator estimate；这些实际 stream 证明受测 provider 的 plain-text 行为，不认证计费、tools、vision、JSON mode、temperature 或全部 reasoning controls，也不保证任意 budget 都有可见正文。

完整证据根目录为 `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/`。当前源码 gates 在 `overlay-final-gates/` 和 `overlay-final-continuation-gates/`，native 最终依据是 `native-close-layout/audit-20261002T153153.009228Z.json`，候选真实范围在 `final-installed-business/`。公开身份和 CI 在 `verified-public-assets.json`、`publication-ci-final.json`；public wheel/installer 各自 `evidence/checks.json` 为安装依据。实际原失败目录为 `actual-operator-final/run-20261002T183342.080502Z/`，补充通过目录为 `actual-operator-final/run-20261002T185219.184877Z/`，执行依据为 `completion-command.json`、`completion-safe-summary.json` 和原始 `results.json`，最终 live readback 为 `final-live-state.json`。所有私有 HTTP/CLI/SSE/conversation/截图、秘密与关联标识均留在受保护本地证据目录。

相关范围说明见 [候选验收](./final-candidate-acceptance.md)、[候选业务契约审阅](./installed-business-requirements-review.md)、[只读 retained 复核](./installed-business-evidence-audit.md) 和 [公开发布验收](./public-release-acceptance.md)。共享工作区原有的 `Dockerfile`、`compose.yaml` 暂存删除及后来出现的 `GlobalDefaultModel.tsx` 暂存格式化均单独保留，产品 tag 仍指向精确验收的 commit。
