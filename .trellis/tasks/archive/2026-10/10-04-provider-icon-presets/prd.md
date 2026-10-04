# 厂商图标自由选择与主流厂商预置

## Goal

厂商的新建和编辑都能自由选择图标。预置覆盖国内外主流模型厂商、聚合平台、云平台与本地服务，使用户能从模板开始配置，并在保存后看到所选图标。

## Background

- `frontend/src/features/providers/ProviderIdentity.tsx:9` 只渲染 DeepSeek 品牌素材；`ProviderView.tsx:113` 的高级配置只能选五个通用图标。
- `jev_gateway/provider_presets.py:9` 的 CLI 模板只有 OpenAI、Anthropic、DeepSeek；API 单独按 LiteLLM 注册条件加入 OpenRouter。
- `catalog.py:726` 和 `model.ts:101` 已支持可选 `display_name`、`brand_id`、`icon_id`。这些字段不参与厂商实例和模型身份。
- 用户在任务启动时授权自主实现和完整验证。本任务据此完成规划、审阅、激活与实施。

## Requirements

- R1：在 LLM 和决策厂商新建、编辑的主要表单中提供独立图标入口、当前图标预览和可搜索的图标库。品牌图标、首字母和现有通用图标都能选择，也能恢复自动图标。
- R2：图标选择独立于品牌、实例 ID、协议、地址与模型引用。保存、重新读取和再次编辑都保留选择；取消编辑不写配置。未知旧图标保留并安全回退，素材加载失败后仍能切换到其他图标。
- R3：预置覆盖 OpenAI、Anthropic、Google Gemini、DeepSeek、Qwen、Moonshot/Kimi、智谱/Z.AI、MiniMax、豆包/火山、百度、腾讯、讯飞、阶跃、百川、零一万物，以及 OpenRouter、xAI、Mistral、Groq、Cohere、Together、Fireworks、Perplexity、Cerebras、SambaNova、NVIDIA、Hugging Face、Novita、SiliconFlow、ModelScope、Azure、Vertex AI、Bedrock、Cloudflare、Ollama、LM Studio。区域差异使用不同模板或清楚的配置说明。
- R4：每个模板包含品牌、名称、默认图标、协议、可确定的地址和凭据环境引用，支持中文、英文、模型名与别名搜索。账户专属地址和云端额外配置提供明确入口与说明。CLI 与界面使用相同预置来源。
- R5：品牌素材打包为本地 SVG，记录固定版本来源、官方品牌参考、校验值和许可声明。覆盖双语、明暗主题、桌面、390px 与 320px，支持键盘操作、可见焦点和清楚的选中状态。

## Acceptance criteria

- [x] 新建和编辑两种厂商均可搜索并选择任意品牌或通用图标，恢复自动图标时预览一致。
- [x] 保存后的 API/磁盘配置、列表与重新编辑一致；换图标不改变品牌、协议、实例 ID 或模型引用。
- [x] 未知图标、缺失图标和加载失败正常回退；一次素材失败不影响后续选择。
- [x] R3 的每个厂商有模板且协议在安装的 LiteLLM 注册表中有效；真实资料核对默认地址与特殊配置。
- [x] API、CLI、浏览器验证模板填充、别名搜索、独立图标和只在保存时写配置。
- [x] 所有品牌 SVG 在打包后可从同源路径加载，许可和来源可查；320px/390px/桌面双语主题无水平溢出，键盘可操作。
- [x] 前端 lint、类型检查、单元测试、相关浏览器测试，以及 Python 全量测试、Pyright 和 wheel 构建通过。

逐项证据与验证范围见 `acceptance.md` 和 `research/final-check.md`。

## Boundaries

预置作为新建模板，不自动加入运行中的厂商或未确认模型。保留现有凭据、写入权限、发现网络和原子配置事务边界。图标选择使用本地库；本任务不增加远程图片地址、上传、认证方式或自动模型导入。
