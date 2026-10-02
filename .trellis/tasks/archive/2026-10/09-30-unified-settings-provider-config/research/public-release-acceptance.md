# 公开 v0.1.0 发布与安装验收

正式发布已完成。公开 wheel 与公开安装器分别在隔离环境执行一次安装验收，均退出 0，各通过 119 项；随后实际本地配置已备份、删除并通过同一公开安装器重装。本文件记录发布、资产、安装和 reset 的结果。实际重装后的配置业务、真实生成和页面验收另行记录，不能由这些安装检查替代。

| 项目 | 当前证据 |
| --- | --- |
| Release | `402022958`，`v0.1.0`，公开、stable、latest，非 draft/prerelease |
| 精确发布 commit | `019a3030ad735db63167bc5176f245f89293c0e4` |
| annotated tag | `a0acbdf6584b4aafbc10aaf8d6e55a0dada0e121`，peeled commit 为上行 commit |
| workflow | `37040920350`，headSha 与发布 commit 相同 |
| 四个 CI job | build、Ubuntu installed-wheel、macOS installed-wheel、release 全部 completed/success |
| 公共下载 | pinned/latest 的四份资产共八次下载，大小、GitHub digest、sidecar 和对应下载字节一致 |
| wheel 内容 | 54 个 package 文件与当前产品源码完全一致；版本 `0.1.0`，Python `>=3.12`，`AGPL-3.0-or-later`，包含许可证及两个 console entry point |
| 独立公开 wheel 安装 | 119 项，success true，退出 0，83.949 秒 |
| 独立公开 installer 安装 | 119 项，success true，退出 0，96.742 秒 |
| 实际本地 installer | 正常 HOME 与默认 tool/state/bin 目录，退出 0，9 秒，已有 agent 鉴权源未变 |

公开 wheel SHA256：

```text
8fa9585c86a12f873ee2fc894c10243a25bca3673222a1c00a7d8cf35200cb9f
```

公开 `install.sh` SHA256：

```text
2147aa40b8048a17244eeae4dd976e5647a53165a50613bb74467668069aa63d
```

[Release](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.0) 和 [workflow](https://github.com/TexasOct/jev-gateway/actions/runs/37040920350) 可公开查看。四个资产为 `install.sh`、`install.sh.sha256`、`jev_gateway-0.1.0-py3-none-any.whl` 及 wheel 的 `.sha256`。工作流先构建一次，再将相同资产交给两个平台的 installed-wheel 检查，通过后发布。候选 wheel 的 archive hash `57e49d26d089d3bbe4b06f2e7b03d0344a11a04e881ed4549f84beb4da4f6914` 与公开 wheel hash 不同；两者的 54 个产品文件均与当前源码逐字节一致。

替换前已备份旧 release `401261321`、四个原资产、旧 annotated tag `d4eb6b79799d30c6ae3a413813eabe131084d379` 与 Git bundle，并再次验证原始 digest 和 bundle。替换只删除已授权的旧 v0.1.0 release；tag push 使用对应旧 tag object 的 `--force-with-lease`。新 tag 和 release ID 已分别核对，release notes 保留真实测试的历史失败及其范围。

实际 reset 在 `/Users/texas/.jev-gateway` 进行。父代理确认原服务归属、健康和端口后，分别在停止前后保存受保护配置及一致 SQLite backup，执行 integrity check，导出全部原始列和行。确认 recovery marker 不存在、停止后的配置未变、status 退出 4 且端口关闭，才删除实际存在的 `models.json` 和 `.env`。数据库、日志、run 与 installation state 均保留；不存在的配置 companion 没有被伪报为已删除。

| 原始表 | reset 后公开重装的原始元组保留 |
| --- | --- |
| requests | 6 条，完整保留 |
| decisions | 6 条，完整保留 |
| outcomes | 6 条，完整保留 |
| upstream_requests | 6 条，完整保留 |
| assistant_continuations | 原始 0 条 |
| config_versions | 1 条，完整保留；允许新增正常 bookkeeping |

实际 installer 使用验证后的 pinned 文件执行 `sh install.sh --version 0.1.0 --home /Users/texas/.jev-gateway --yes`，恢复 `/Users/texas/.local/bin/jev` 和 `jev-gateway`。安装后独立 probe 证明默认 uv tool 内的 Python `3.12.11`、LiteLLM `1.103.2`、版本 `0.1.0` 和 54 个公开 package 文件一致，原始元组及数据库完整性保留，`.env` 为 `0600`。新默认配置只有原来的三个策略，没有上游实例、模型或 decision-provider 实例，setup 投影为 required/local available、无 provider/model、routing 未 ready。

真实业务核对需要完整 SDK/内容记录，因此在任何新生成前，父代理为本次实际验收设置 `storage.enabled: true`、`capture_content: true`、`max_requests: null`，在共享配置锁内原子保存后停止并重新启动自己拥有的服务。存储参数通过启动生效。原始 fresh baseline 字节单独留存；后续 runner 要求显式 `PUBLIC_READY`、精确资产 hash、全部原始元组和父代理步骤凭据，并限于四次新生成，不能自行安装、reset、恢复或发送进程信号。

这些安装 smoke 使用 synthetic generation。真实上游和实际页面的结果应以最终业务报告为准。此前候选的普通重装另有有效 overlay、配置/凭据字节和已填充五类业务表的保留证据；它与本次故意删除配置、保留原始实际记录的 reset 分别验收。

证据根目录为 `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/`。发布依据为 `publication-ci-final.json`、`verified-public-assets.json`、`release-notes-applied.json`，两个公共 smoke 的依据为各自 `evidence/checks.json`。实际 reset 与重装依据为 `operator-reset-result.json`、`operator-public-install-result.json`、`actual-installed-probe.json`、`actual-fresh-start.json` 及 `actual-operator-final/parent-state.json`。原始一致 backup 为 `operator-backup-final-_7i62rrb/`，目录 `0700`、文件 `0600`。私有配置、凭据、请求、响应、reasoning 和关联标识没有复制进本报告。
