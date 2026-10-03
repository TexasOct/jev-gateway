# JEV Gateway 0.1.1

Dashboard 的网关 Key 输入现在使用独立连接页。验证成功后进入控制台；错误 Key、网络失败和后续 401 会回到连接页。支持 Enter 提交，连接期间阻止重复请求，凭据继续只保存在内存中。

策略画布增加可直接操作的连线与动态输出端口。操作者可以选择、连接、改接和断开连线，并用鼠标或键盘重新连接未完成的输出。端口随选项数量变化，密集节点自动扩展高度，整理与对齐使用统一几何尺寸。中文文案统一，默认路径与判定失败兜底分别展示。

策略修改继续经过草稿、校验、审阅和应用；布局操作只保存画布布局。未完成的问题或连线会阻止应用，超出布局容量时保留最后有效布局。

重置策略后，已展开的配置预览保持可见。配置变化仍会重建草稿、检查器和交互状态；成功应用后收起信息面板。

本发布对应源码 `6fc0f0e19e31f52d8e831593e8c530aed7e73141` 和 [CI run 37132156378](https://github.com/TexasOct/jev-gateway/actions/runs/37132156378)。Ubuntu 与 macOS 均对同一份 wheel 通过 59 项安装检查。实际下载的公开 wheel 通过 59 项 smoke 检查，公开安装器通过 23 项隔离检查；安装后静态页面通过全部 118 项浏览器用例，安装后后端通过 133 项测试。浏览器使用合成 API，后端使用模拟上游；安装器另外验证真实本地鉴权 API、数据库和生命周期。

wheel SHA256：`2598f5ab58d1c90c1cb4b788bbf2d2193a28f247fc6d6b6ae01ec7e8fd6a2038`。公开资产包括安装器、wheel 及各自的 SHA256 sidecar，共四个文件。

在已明确批准的配置基线上，普通默认路径升级通过 14 项检查，16 条子命令全部退出 0；实际安装的 52 个产品文件与公开 wheel 一致，原有记录、凭据权限与运行服务状态完整保留。

旧运行配置若包含顶层 `defaults`、没有可解析模型的标签池或空的 overlay 选择，0.1.1 会拒绝加载。升级前需用目标版本校验基础配置与合并 overlay，保留私有备份，再审核显式模型池和选择项；本版本不自动迁移这些字段。显式模型引用仍遵守能力、上下文、输出、排除、continuation 和故障处理规则。

固定版本安装可先下载、审阅并校验脚本：

```sh
curl -fL --retry 3 -o install.sh https://github.com/TexasOct/jev-gateway/releases/download/v0.1.1/install.sh
curl -fL --retry 3 -o install.sh.sha256 https://github.com/TexasOct/jev-gateway/releases/download/v0.1.1/install.sh.sha256
# Review install.sh before running it.
# macOS:
shasum -a 256 -c install.sh.sha256
# Linux: use sha256sum -c install.sh.sha256 instead.
sh install.sh --version 0.1.1 --yes
jev --version
jev doctor
```

同一发布者提供的 sidecar 用于核对下载一致性，并非独立签名。完整安装、配置与卸载说明见 [local-install.md](https://github.com/TexasOct/jev-gateway/blob/v0.1.1/docs/local-install.md)。
