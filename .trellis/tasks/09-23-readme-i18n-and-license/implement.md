# Implement: README 多语言重构与 AGPL-3.0 协议落地

设计依据：`design.md`。需求与验收：`prd.md`。

## 执行前

- [ ] 确认当前分支为 `main`，工作区中 `jev_gateway/dashboard.py`、`models.example.json`、`tests/test_task_aware_matrix.py` 的既有改动属于另一个任务，本次不提交它们。
- [ ] 记录 `docs/` 三篇文档的改动前基线，供 AC7 比对：

```bash
for f in docs/local-install.md docs/models-config.md docs/routing-design.md; do
  printf '%s %s %s\n' "$f" "$(grep -c '^#' "$f")" "$(wc -l < "$f")"
done
```

## 步骤

### 1. 协议落地

- [ ] 取 AGPL-3.0 全文，写入根目录 `LICENSE`：

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
head -3 LICENSE && tail -3 LICENSE && wc -l LICENSE
```

预期首行包含 `GNU AFFERO GENERAL PUBLIC LICENSE`，末行包含 `Version 3, 19 November 2007` 相关的结尾段落。文件应为纯文本，无 markdown 包裹。

- [ ] `pyproject.toml` 补 `license = "AGPL-3.0-or-later"` 与 `authors = [{ name = "TexasOct" }]`。不加 Trove `License ::` classifier。
- [ ] 验证打包元数据：

```bash
uv build
python3 - <<'PY'
import glob, zipfile
whl = sorted(glob.glob("dist/*.whl"))[-1]
with zipfile.ZipFile(whl) as z:
    name = [n for n in z.namelist() if n.endswith("METADATA")][0]
    meta = z.read(name).decode()
for line in meta.splitlines():
    if line.startswith(("License", "Author", "Metadata-Version")):
        print(line)
PY
```

预期看到 `License-Expression: AGPL-3.0-or-later`，以及 wheel 内含 `LICENSE`。若 `License-Expression` 缺失或构建报错，按 `design.md` 的「构建风险」回退。

### 2. 新增 `docs/http-api.md`

- [ ] 按 `design.md` 第 2 节的列表写全端点、鉴权、`X-JEV-*` 响应头、策略选择接口、reload。用英文。
- [ ] 内容以 `jev_gateway/gateway.py` 的实际路由与响应头为准，不照抄旧 README 的表述；发现不一致时以代码为准，并在最终报告中列出差异。

```bash
grep -nE '@app\.(get|post)\("' jev_gateway/gateway.py
grep -rn 'X-JEV' jev_gateway/ | grep -v dashboard.py
```

### 3. 重写 `README.md`（英文）

- [ ] 按 `design.md` 第 2 节的「保留在 README 的部分」重建结构，目标 120 到 160 行。
- [ ] 引用策略图：

```markdown
![Routing strategies](docs/routing-strategy-map.svg)
```

- [ ] 修正 D4：README 中出现的密钥变量名必须与 `.env.example`、`models.example.json` 一致，使用 `DEEPSEEK_API_KEY` 与 `OPENAI_API_KEY`。
- [ ] 补协议章节，写明 AGPL-3.0 以及网络服务运营者的源码提供义务。
- [ ] 补文档索引表，指向 `docs/local-install.md`、`docs/models-config.md`、`docs/routing-design.md`、`docs/http-api.md`。

### 4. 写 `README.zh-CN.md`

- [ ] 与英文版章节一一对应，标题层级与顺序不得偏离。
- [ ] 顶部语言切换条为 `[English](README.md) | **简体中文**`。
- [ ] 链接目标与英文版相同，不改写为中文文档以外的路径。

### 5. 补齐 `docs/` 中的缺口

- [ ] 只补 `design.md` 表格里标为「需补」的条目：进程不读取固定 `JEV_API_BASE`/`JEV_API_KEY`/`JEV_ROUTES`/`JEV_MODELS_FILE`；reload 的 `restart_required` 行为若 `docs/http-api.md` 已写，`docs/local-install.md` 不再重复。
- [ ] 三篇原有文档不得删除既有章节。只允许新增段落。

## 验证

```bash
# AC7 基线比对：标题数与行数只增不减
for f in docs/local-install.md docs/models-config.md docs/routing-design.md; do
  printf '%s %s %s\n' "$f" "$(grep -c '^#' "$f")" "$(wc -l < "$f")"
done

# AC5 密钥变量名一致性
python3 - <<'PY'
import json, re, pathlib
declared = set(re.findall(r'^\s*([A-Z0-9_]*API_KEY)', pathlib.Path(".env.example").read_text(), re.M))
cat = json.loads(pathlib.Path("models.example.json").read_text())
declared |= {p["api_key_env"] for p in cat.get("providers", []) if p.get("api_key_env")}
used = set()
for f in ["README.md", "README.zh-CN.md"]:
    used |= set(re.findall(r'\b([A-Z0-9_]*API_KEY)\b', pathlib.Path(f).read_text()))
print("declared:", sorted(declared))
print("used:    ", sorted(used))
print("undeclared:", sorted(used - declared) or "none")
PY

# AC3 语言互链
grep -n "README" README.md README.zh-CN.md | grep -i "zh-CN\|English"

# AC6 策略图引用
grep -n "routing-strategy-map" README.md README.zh-CN.md

# AC9 回归
uv run pytest -q
uvx pyright
uv build
```

- [ ] 逐条勾掉 `prd.md` 的 AC1 到 AC9。
- [ ] 检查两份 README 的章节标题数与顺序一致：

```bash
grep -c '^## ' README.md README.zh-CN.md
```

## 回滚点

| 位置 | 回滚方式 |
| --- | --- |
| 写 `LICENSE` 与 `pyproject.toml` 之后 | `git checkout -- pyproject.toml && rm LICENSE` |
| 重写 `README.md` 之前 | 旧版本在 `git show HEAD:README.md`，先复制到 `/tmp/README.md.bak` |
| `docs/` 补段之后 | `git checkout -- docs/` |

## 提交边界

本次只提交：`LICENSE`、`README.md`、`README.zh-CN.md`、`docs/http-api.md`、`pyproject.toml`，以及 `docs/` 下的补充段落。`jev_gateway/dashboard.py`、`models.example.json`、`tests/test_task_aware_matrix.py`、`models.json` 不在本次提交范围内。
