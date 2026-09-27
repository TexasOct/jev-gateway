# 本地安装 JEV Gateway

JEV Gateway 支持 curl CLI、仓库开发模式、uv 隔离 CLI、容器运行和 wheel 安装。所有方式使用同一个运行目录：

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

## 方案一：curl 安装 CLI

macOS 和 Linux 可直接安装 CLI，无需手动克隆仓库。需要 `curl` 和可通过
`python3` 调用的 Python 3.10+：

```bash
curl -fsSL https://github.com/TexasOct/jev-gateway/releases/latest/download/install.sh | sh -s -- --yes
```

该 URL 获取最新稳定版 Release 的 `install.sh`。脚本内嵌自己的 tag，直接从该
tag 的 URL 下载 `jev_gateway-X.Y.Z-py3-none-any.whl` 和同名 `.sha256` 文件，
校验后才调用 `uv tool install`，不再解析 latest 或查询 GitHub API 寻找 wheel。
安装完成后，`jev install init` 初始化运行目录。重复运行会保留已有的
`models.json`、`.env` 和记录数据库。Release wheel 自带面板，安装和运行都不需要 Node.js。

固定版本或回滚时，使用已发布 tag 的安装脚本；也可替换为明确的预发布 tag：

```bash
curl -fsSL https://github.com/TexasOct/jev-gateway/releases/download/v0.1.0/install.sh | sh -s -- --yes
```

也可以向 Release 安装脚本传入 `--version X.Y.Z`，接受可选前缀 `v` 和
`0.2.0rc1` 这样的预发布版本。请求的 tag 与脚本内嵌 tag 不同时，脚本会下载目标
tag 的 `install.sh` 及其校验文件，检查 SHA256 和内嵌 tag 完全匹配后，再转交给
目标脚本执行一次，并转发安装参数。目标脚本只能安装自己的 wheel，不能继续转交。

没有稳定版时 latest URL 不可用；缺少所选版本的文件、校验文件格式错误、tag
不符或摘要不符时，安装会停止，不会运行未通过校验的子脚本或替换 CLI，也不会
回退到 Git `main`。这里记录的是安装和发布流程，本次改动没有创建任何公开 Release。

`--yes` 允许在缺少 `uv` 时从 `astral.sh` 安装它。非交互环境若不传此参数，需先
安装 `uv`；`--no-uv` 则禁止引导安装 `uv`。`--home DIR` 指定运行目录，
`--no-init` 跳过运行目录初始化。`--dry-run` 只打印计划，不联网、不执行子脚本、
不写入，也不验证文件是否存在或校验和是否正确。通过 `curl` 获取脚本本身仍会联网；
完全离线预览时，应使用已下载的脚本。

仓库中的 `scripts/install.sh` 是未写入 tag 的模板，不能用于 Release 安装，
即使指定 `--version` 也会拒绝。生产安装应使用 Release 产物。
`sh scripts/install.sh --ref REF` 是显式的 Git 源码开发入口，不校验 Release
摘要，且不能与 `--version` 同时使用。需要面板的源码安装请按下方步骤先构建前端，
再使用本地安装器。

安装后使用 `jev start`、`jev status`、`jev stop` 管理服务，详细命令见
[`cli.md`](cli.md)。

Windows 不支持此安装脚本。可使用下方的源码安装或 Docker 方案。维护者的发版步骤见 [`releasing.md`](releasing.md)。

<a id="verify-installer"></a>

### 下载、审阅和校验后执行

`curl | sh` 会直接执行最初下载的脚本，无法先校验这些字节。需要先检查时，
固定一个已发布的 tag，同时从这个 tag 下载脚本和 SHA256 文件。不要分别从
latest URL 获取两者，以免两次下载之间发生版本切换。

以下示例在临时目录中下载，用编辑器审阅，再用 macOS 和 Linux 均可使用的
Python 3 校验摘要、文件名及内嵌 tag，成功后才执行：

```bash
(
  set -eu
  tag=v0.1.0
  base="https://github.com/TexasOct/jev-gateway/releases/download/$tag"
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  cd "$work"
  curl -fsSL --proto '=https' --proto-redir '=https' "$base/install.sh" -o install.sh
  curl -fsSL --proto '=https' --proto-redir '=https' "$base/install.sh.sha256" -o install.sh.sha256
  "${EDITOR:-vi}" install.sh
  python3 - "$tag" <<'PY'
import hashlib
import re
import sys
from pathlib import Path

script = Path("install.sh").read_bytes()
checksum = Path("install.sh.sha256").read_bytes()
match = re.fullmatch(rb"([0-9a-f]{64})  install\.sh\n?", checksum)
if not match or hashlib.sha256(script).hexdigest().encode() != match.group(1):
    sys.exit("Installer SHA256 verification failed")
if re.findall(rb"^RELEASE_TAG=(.*)$", script, re.MULTILINE) != [sys.argv[1].encode()]:
    sys.exit("Installer release tag mismatch")
print("Installer checksum and tag verified")
PY
  sh install.sh --yes
)
```

同一 Release 发布的校验文件能发现传输损坏或文件不一致，但不是独立的发布者签名，
无法防御发布者账号被攻破后同时替换脚本与校验文件。还需要信任 GitHub、Release
发布者，以及允许安装 `uv` 时使用的 `astral.sh` 脚本。

## 方案二：uv 开发安装

适用于开发、调试策略和运行测试。准备 Python 3.10+ 和带 npm 的 Node.js；
Release 工作流使用 Node.js 22。全新检出需要先安装前端依赖并构建面板：

```bash
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# 获取源码并创建开发环境
git clone https://github.com/TexasOct/jev-gateway.git
cd jev-gateway
uv sync --all-groups
npm --prefix frontend install
scripts/build-frontend.sh

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
scripts/build-frontend.sh
scripts/build-frontend.sh --check
uv run pytest -q
uvx pyright
uv build
uv run jev-gateway
```

`jev_gateway/static/` 是 Git 忽略的生成目录，不能依赖仓库提供面板产物。
`scripts/build-frontend.sh` 会安装 npm 依赖并构建；`--check` 只检查产物是否缺失或
过旧。使用面板的测试通过会话级 `dashboard_bundle` fixture 执行一次
`npm --prefix frontend run build`，因此运行完整测试前仍需安装 npm 依赖。

`uv run jev-gateway` 适合在 `$HOME/.jev-gateway` 内手动启动：

```bash
cd "$HOME/.jev-gateway"
uv --directory /path/to/jev-gateway run jev-gateway
```

## 方案三：uv 隔离 CLI 安装

适合在本机长期运行，不需要保留开发虚拟环境。从源码安装前仍需 Python、uv 和
带 npm 的 Node.js，并构建面板；如不想安装 Node.js，使用方案一的 Release wheel。

```bash
cd /path/to/jev-gateway
npm --prefix frontend install
scripts/build-frontend.sh
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
scripts/build-frontend.sh
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

## 方案四：Homebrew 安装辅助

当前仓库没有公开 Homebrew tap，因此不提供 `brew install jev-gateway` formula。
Homebrew 在这里负责安装 uv，随后调用本地安装器。此方式也从源码安装，需先准备
带 npm 的 Node.js 并构建面板：

```bash
cd /path/to/jev-gateway
npm --prefix frontend install
scripts/build-frontend.sh
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

建立 Homebrew tap 后，可以再补正式的：

```bash
brew tap <owner>/tap
brew install jev-gateway
```

但无论从哪个渠道安装，运行目录都保持为 `$HOME/.jev-gateway`。

## 方案五：Docker 或 Docker Compose

Dockerfile 在 Node 阶段从 `frontend/` 构建面板，再复制到 Python 构建阶段，
最后运行 `uv build`，无需宿主机预先生成面板。

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

## 方案六：wheel 安装

适合把固定版本交付给另一台机器。在源码仓库根目录先构建面板，再构建 wheel。
下面以 `pyproject.toml` 中版本为 `0.1.0` 为例；校验脚本需要 Python 3.11+，
传入的 tag 必须与项目版本完全对应，`dist/` 中只能有这一版 wheel：

```bash
uv sync --all-groups
npm --prefix frontend install
scripts/build-frontend.sh
uv build
python3 scripts/validate-release.py v0.1.0 dist
uv tool install --force dist/jev_gateway-0.1.0-py3-none-any.whl
```

校验脚本检查 wheel 内容，把 tag 写入 `dist/install.sh`，并生成脚本和 wheel 的
两个 SHA256 文件。这些本地产物不会自动发布为 GitHub Release。安装好的 wheel
包含面板，不需要 Node.js，也不包含用户配置、密钥和运行数据。安装后可将仓库中的
模板复制到尚未初始化的标准目录；已有运行目录不要再次执行下面的复制命令：

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
