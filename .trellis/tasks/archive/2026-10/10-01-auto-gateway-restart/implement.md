# 实施计划

## 步骤

1. 在 `jev_gateway/cli/process.py` / `jev_gateway/cli/main.py` 设计并实现仅当已有受管理网关运行时才重启的命令路径；返回明确的重启/未运行状态。未知归属 PID 不发送信号、不另起进程。
2. 抽取或复用 `jev start` 的健康等待逻辑，确保重启路径最多等待 10 秒健康检查。
3. 修改 `scripts/install.sh` 的 Release wheel 分支，在 wheel 安装成功后调用新 CLI 行为，传入目标 `--home`；调用点不受 `--no-init` 控制。保持 `--ref`、dry-run、资产验证失败和安装失败不触发重启。
4. 扩展 CLI 进程管理和安装器测试，覆盖成功、原本未运行、PID 所有权无法确认、停止超时、健康启动失败/超时、`--no-init`、Release 与 `--ref` 边界及安装失败。
5. 更新 `docs/cli.md` 与 `docs/local-install.md`，描述 Release 更新会重启正在运行的受管理网关、10 秒健康检查、no-op 和错误处理行为。

## 验证

- `uv run pytest tests/test_install_script.py tests/test_cli_process.py tests/test_cli_main.py -q`
- `uv run pytest -q`
- 对改动的 Python 文件运行项目配置的类型检查；检查 shell 脚本语法：`sh -n scripts/install.sh`。

## 风险检查点

- 确认“是否运行”的检测不依赖可能失败的 HTTP 健康检查，且不会把前台或外部管理进程误认为可管理进程。
- 确认 pidfile 存在但 token/home/命令校验失败时，不会向该进程发送信号，也不会启动冲突的新进程。
- 确认 wheel 已替换而 restart 失败时，输出清楚区分安装结果与服务恢复结果。
- 确认 `--home` 与 `JEV_GATEWAY_HOME` 的优先级在安装器检测、停止、启动过程中一致。
- 不触碰本任务以外的工作树变更；提交阶段按 Trellis 流程单独确认文件范围。
