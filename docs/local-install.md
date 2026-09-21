# 本地安装 JEV Gateway

JEV Gateway 支持三种本地安装方式：仓库开发模式、uv 隔离 CLI、容器运行。所有方式使用同一个运行目录：

```text
$HOME/.jev-gateway/
├── models.json          # Provider、模型、策略和网关配置
├── .env                 # 仅存放 models.json 所引用的密钥
└── jev-records.sqlite3  # 默认 SQLite 决策与请求记录
```

可以通过 `JEV_GATEWAY_HOME` 指向另一个目录，例如测试环境：

```bash
export JEV_GATEWAY_HOME="$HOME/.jev-gateway-staging"
```

网关启动时从该目录加载 `models.json` 和 `.env`。`storage.path` 使用相对路径时，也会相对于该目录保存。因此，配置、密钥和记录不会散落到启动终端所在目录。

## 方案一：uv 开发安装

适用于开发、调试策略和运行测试。

```bash
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# 获取源码并创建开发环境
git clone <repository-url> jev-gateway
cd jev-gateway
uv sync --all-groups

# 初始化持久运行目录，只在文件不存在时复制模板
./scripts/install-local.sh --editable

# 编辑运行配置和密钥
$EDITOR "$HOME/.jev-gateway/models.json"
$EDITOR "$HOME/.jev-gateway/.env"

# 启动
~/.local/bin/jev-gateway-local
```

`--editable` 使工具命令直接读取当前仓库代码。修改 Python 文件后重启网关即可，无需重新安装。修改 `models.json` 或轮换 `.env` 中已声明的密钥后可调用 reload：

```bash
curl -X POST http://127.0.0.1:8000/v1/routing/reload
```

开发常用命令：

```bash
uv run pytest -q
uv build
uv run jev-gateway
```

`uv run jev-gateway` 适合在 `$HOME/.jev-gateway` 内手动启动：

```bash
cd "$HOME/.jev-gateway"
uv --directory /path/to/jev-gateway run jev-gateway
```

## 方案二：uv 隔离 CLI 安装

适合在本机长期运行，不需要保留开发虚拟环境。

```bash
cd /path/to/jev-gateway
./scripts/install-local.sh
```

脚本会：

1. 使用 `uv tool install` 创建隔离工具环境。
2. 安装 `jev-gateway` CLI。
3. 初始化 `$HOME/.jev-gateway/models.json` 和 `$HOME/.jev-gateway/.env`。
4. 创建 `~/.local/bin/jev-gateway-local`，并自动设置 `JEV_GATEWAY_HOME`。
5. 保留既有 `models.json`、`.env` 和 SQLite 文件，重复执行不会覆盖数据。

启动：

```bash
~/.local/bin/jev-gateway-local
```

若 `~/.local/bin` 已加入 PATH，可以简写为：

```bash
jev-gateway-local
```

否则执行一次：

```bash
uv tool update-shell
```

源码更新后重新安装：

```bash
./scripts/install-local.sh
```

卸载程序但保留运行数据：

```bash
./scripts/uninstall-local.sh
```

确认不再需要配置、密钥和记录后，才手动删除：

```bash
rm -rf "$HOME/.jev-gateway"
```

## 方案三：Homebrew 安装辅助

当前仓库没有公开 tap 或 release URL，因此不能提供一个会失败的 `brew install jev-gateway` formula。Homebrew 在这里负责安装 uv，随后复用已经验证过的 uv 安装器：

```bash
cd /path/to/jev-gateway
./scripts/install-with-brew.sh
```

脚本等价于：

```bash
brew install uv
./scripts/install-local.sh
```

开发模式：

```bash
./scripts/install-with-brew.sh --editable
```

将来发布 GitHub Release 并建立 Homebrew tap 后，可以再补正式的：

```bash
brew tap <owner>/tap
brew install jev-gateway
```

但无论从哪个渠道安装，运行目录都保持为 `$HOME/.jev-gateway`。

## 方案四：Docker 或 Docker Compose

容器使用挂载卷持久化 `$HOME/.jev-gateway`。首次启动时，如果宿主目录中缺少配置，entrypoint 会生成：

- `models.json`，并将 `gateway.host` 设为 `0.0.0.0`
- `.env` 模板

构建并启动：

```bash
mkdir -p "$HOME/.jev-gateway"
docker compose up --build
```

或不使用 Compose：

```bash
docker build -t jev-gateway:local .
docker run --rm \
  --name jev-gateway \
  -p 127.0.0.1:8000:8000 \
  -v "$HOME/.jev-gateway:/home/jev/.jev-gateway" \
  jev-gateway:local
```

首次启动后编辑宿主配置：

```bash
$EDITOR "$HOME/.jev-gateway/models.json"
$EDITOR "$HOME/.jev-gateway/.env"
```

随后重启容器：

```bash
docker compose restart
```

或只重新加载 JSON 配置：

```bash
curl -X POST http://127.0.0.1:8000/v1/routing/reload
```

Compose 默认只将容器端口绑定到 `127.0.0.1`。如需对局域网开放，请显式修改 `compose.yaml` 的 ports 配置，并在 `models.json` 中评估入站鉴权设置。

## wheel 安装

适合把固定版本交付给另一台机器。

```bash
uv build
uv tool install --force dist/jev_gateway-0.1.0-py3-none-any.whl
```

wheel 不包含配置、密钥和运行数据。安装后可将模板初始化到标准目录：

```bash
mkdir -p "$HOME/.jev-gateway"
cp models.example.json "$HOME/.jev-gateway/models.json"
cp .env.example "$HOME/.jev-gateway/.env"
JEV_GATEWAY_HOME="$HOME/.jev-gateway" jev-gateway
```

## 验证

```bash
curl http://127.0.0.1:8000/healthz
curl http://127.0.0.1:8000/v1/routing/strategies
```

项目标识：

```text
Distribution: jev-gateway
Import:       jev_gateway
CLI:          jev-gateway
Runtime:      $HOME/.jev-gateway
```
