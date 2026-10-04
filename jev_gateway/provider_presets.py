"""Provider templates shared by CLI onboarding and the management API."""

from __future__ import annotations

import copy
from typing import Any


def _preset(display_name: str, brand: str, transport: str, base: str | None, key: str | None, aliases: list[str], docs: str, *, notes: tuple[str, str] | None = None, fields: list[dict[str, Any]] | None = None, private: bool = False) -> dict[str, Any]:
    result: dict[str, Any] = {
        "display_name": display_name, "brand_id": brand, "icon_id": brand,
        "type": transport, "api_base": base, "api_key_env": key,
        "aliases": aliases, "docs_url": docs, "allow_private_network": private,
    }
    if notes:
        result.update(setup_instructions=notes[0], setup_instructions_zh=notes[1])
    if fields:
        result["setup_fields"] = fields
    return result


def _field(key: str, label: str, chinese: str, *, env: bool = False, required: bool = True, placeholder: str | None = None) -> dict[str, Any]:
    return {
        "key": key, "target": "param_env" if env else "params", "label": label,
        "label_zh": chinese, "required": required,
        **({"placeholder": placeholder} if placeholder else {}),
    }


# URLs and native defaults were checked against installed LiteLLM transports and
# linked supplier documentation. Account and project values remain operator input.
PRESETS: dict[str, dict[str, Any]] = {
    "openai": _preset("OpenAI", "openai", "openai", "https://api.openai.com/v1", "OPENAI_API_KEY", ["Open AI", "GPT", "ChatGPT"], "https://docs.litellm.ai/docs/providers/openai"),
    "anthropic": _preset("Anthropic", "anthropic", "anthropic", None, "ANTHROPIC_API_KEY", ["Claude", "克劳德"], "https://docs.litellm.ai/docs/providers/anthropic"),
    "gemini": _preset("Google Gemini", "gemini", "gemini", None, "GEMINI_API_KEY", ["Google", "谷歌", "AI Studio", "双子座"], "https://ai.google.dev/gemini-api/docs/api-key"),
    "deepseek": _preset("DeepSeek", "deepseek", "deepseek", "https://api.deepseek.com/v1", "DEEPSEEK_API_KEY", ["深度求索", "Deep Seek", "deepseek-chat", "deepseek-reasoner"], "https://api-docs.deepseek.com/"),
    "dashscope": _preset("Qwen / 百炼 (China)", "qwen", "dashscope", None, "DASHSCOPE_API_KEY", ["通义千问", "阿里", "Alibaba", "百炼", "中国"], "https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope", notes=("Use a China-region Model Studio key. Other regions use separate endpoints and credentials.", "使用百炼中国区域的 API 密钥。其他区域的地址与凭据需单独配置。")),
    "dashscope_intl": _preset("Qwen / DashScope (International)", "qwen", "dashscope", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "DASHSCOPE_INTL_API_KEY", ["通义千问", "阿里", "Alibaba", "新加坡", "Singapore", "国际"], "https://docs.litellm.ai/docs/providers/dashscope", notes=("Use the key issued for the matching international region.", "使用与国际区域端点匹配的 API 密钥。")),
    "moonshot_cn": _preset("Moonshot / Kimi (China)", "moonshot", "moonshot", "https://api.moonshot.cn/v1", "MOONSHOT_CN_API_KEY", ["月之暗面", "Kimi", "中国", "moonshot-v1"], "https://platform.moonshot.cn/docs/guide/start-using-kimi-api"),
    "moonshot": _preset("Moonshot / Kimi (International)", "moonshot", "moonshot", None, "MOONSHOT_API_KEY", ["月之暗面", "Kimi", "国际", "kimi-k2"], "https://docs.litellm.ai/docs/providers/moonshot"),
    "zhipu": _preset("Zhipu / 智谱 GLM (China)", "zhipu", "zai", "https://open.bigmodel.cn/api/paas/v4", "ZHIPU_API_KEY", ["智谱", "智谱清言", "BigModel", "GLM", "ChatGLM", "中国"], "https://docs.bigmodel.cn/cn/guide/develop/http/introduction"),
    "zai": _preset("Z.AI / GLM (Global)", "zhipu", "zai", None, "ZAI_API_KEY", ["智谱", "ZAI", "Z.AI", "GLM", "全球"], "https://docs.z.ai/guides/overview/quick-start", notes=("This template uses the general API endpoint. Coding Plan subscriptions use a different endpoint.", "此模板使用通用 API 地址，Coding Plan 订阅的地址不同。")),
    "minimax_cn": _preset("MiniMax (China)", "minimax", "minimax", "https://api.minimaxi.com/v1", "MINIMAX_CN_API_KEY", ["海螺", "MiniMax", "M2", "中国"], "https://platform.minimaxi.com/docs/api-reference/text-openai-api"),
    "minimax": _preset("MiniMax (International)", "minimax", "minimax", None, "MINIMAX_API_KEY", ["海螺", "MiniMax", "M2", "国际"], "https://docs.litellm.ai/docs/providers/minimax"),
    "volcengine": _preset("Doubao / 火山方舟", "doubao", "volcengine", None, "ARK_API_KEY", ["豆包", "字节跳动", "Doubao", "ByteDance", "火山引擎", "Volcengine"], "https://docs.litellm.ai/docs/providers/volcano", notes=("Use an enabled model or Ark inference endpoint ID. A custom base is the Ark root; the native transport adds /api/v3.", "模型名使用已开通的模型或方舟推理端点 ID。自定义地址使用方舟根地址，原生适配器会添加 /api/v3。")),
    "qianfan": _preset("Baidu / 百度千帆", "baidu", "openai", "https://qianfan.baidubce.com/v2", "QIANFAN_API_KEY", ["百度", "文心", "文心一言", "ERNIE", "Qianfan"], "https://cloud.baidu.com/doc/qianfan-api/s/3m7of64lb"),
    "hunyuan": _preset("Tencent / 腾讯混元", "hunyuan", "openai", "https://api.hunyuan.cloud.tencent.com/v1", "HUNYUAN_API_KEY", ["腾讯", "混元", "Tencent", "Hunyuan"], "https://cloud.tencent.com/document/product/1729/111007"),
    "spark": _preset("iFlytek / 讯飞星火", "spark", "openai", "https://spark-api-open.xf-yun.com/v1", "SPARK_API_PASSWORD", ["讯飞", "星火", "iFlytek", "Spark"], "https://www.xfyun.cn/doc/spark/HTTP%E8%B0%83%E7%94%A8%E6%96%87%E6%A1%A3.html", notes=("Use the HTTP API's APIPassword as the credential.", "凭证使用 HTTP API 的 APIPassword。")),
    "stepfun": _preset("StepFun / 阶跃星辰", "stepfun", "openai", "https://api.stepfun.com/v1", "STEPFUN_API_KEY", ["阶跃", "阶跃星辰", "StepFun", "step"], "https://platform.stepfun.com/docs/zh/api-reference/chat"),
    "baichuan": _preset("Baichuan / 百川智能", "baichuan", "openai", "https://api.baichuan-ai.com/v1", "BAICHUAN_API_KEY", ["百川", "百川智能", "Baichuan"], "https://platform.baichuan-ai.com/docs/api"),
    "yi": _preset("01.AI / 零一万物", "yi", "openai", "https://api.lingyiwanwu.com/v1", "YI_API_KEY", ["零一万物", "01.AI", "Yi", "Lingyiwanwu"], "https://platform.lingyiwanwu.com/docs"),
    "siliconflow": _preset("SiliconFlow / 硅基流动 (China)", "siliconcloud", "openai", "https://api.siliconflow.cn/v1", "SILICONFLOW_API_KEY", ["硅基", "硅基流动", "SiliconFlow", "DeepSeek", "Qwen", "中国"], "https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions"),
    "siliconflow_intl": _preset("SiliconFlow (International)", "siliconcloud", "openai", "https://api.siliconflow.com/v1", "SILICONFLOW_INTL_API_KEY", ["硅基流动", "SiliconFlow", "international", "国际"], "https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions"),
    "modelscope": _preset("ModelScope / 魔搭", "modelscope", "modelscope", None, "MODELSCOPE_API_KEY", ["魔搭", "ModelScope", "Qwen", "DeepSeek"], "https://www.modelscope.cn/docs/model-service/API-Inference/intro"),
    "openrouter": _preset("OpenRouter", "openrouter", "openrouter", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", ["Open Router", "聚合", "Claude", "GPT", "Gemini"], "https://openrouter.ai/docs"),
    "xai": _preset("xAI", "xai", "xai", None, "XAI_API_KEY", ["x.ai", "Grok"], "https://docs.x.ai/docs"),
    "mistral": _preset("Mistral AI", "mistral", "mistral", None, "MISTRAL_API_KEY", ["米斯特拉尔", "Codestral", "Magistral"], "https://docs.mistral.ai/api/"),
    "groq": _preset("Groq", "groq", "groq", None, "GROQ_API_KEY", ["GroqCloud", "Llama"], "https://console.groq.com/docs"),
    "cohere": _preset("Cohere", "cohere", "cohere_chat", None, "COHERE_API_KEY", ["Command", "Command R", "Command A"], "https://docs.cohere.com/reference/chat"),
    "together": _preset("Together AI", "together", "together_ai", None, "TOGETHERAI_API_KEY", ["Together", "Llama", "Qwen", "DeepSeek"], "https://docs.together.ai/docs/chat-overview"),
    "fireworks": _preset("Fireworks AI", "fireworks", "fireworks_ai", None, "FIREWORKS_AI_API_KEY", ["Fireworks", "烟花", "accounts/fireworks"], "https://docs.fireworks.ai/getting-started/introduction", notes=("Use the full model resource path. Dedicated deployments can require their own endpoint URL.", "使用完整模型资源路径。专属部署可能需要单独的端点地址。")),
    "perplexity": _preset("Perplexity", "perplexity", "perplexity", None, "PERPLEXITYAI_API_KEY", ["Sonar", "搜索"], "https://docs.perplexity.ai/api-reference/chat-completions"),
    "cerebras": _preset("Cerebras", "cerebras", "cerebras", None, "CEREBRAS_API_KEY", ["Cerebras Inference", "Llama"], "https://inference-docs.cerebras.ai/api-reference/chat-completions"),
    "sambanova": _preset("SambaNova", "sambanova", "sambanova", None, "SAMBANOVA_API_KEY", ["SambaNova Cloud", "Llama"], "https://docs.sambanova.ai/cloud/docs/get-started/supported-models"),
    "nvidia": _preset("NVIDIA NIM", "nvidia", "nvidia_nim", None, "NVIDIA_NIM_API_KEY", ["英伟达", "NVIDIA", "NIM", "Nemotron"], "https://docs.api.nvidia.com/nim/reference/"),
    "huggingface": _preset("Hugging Face", "huggingface", "huggingface", None, "HF_TOKEN", ["HuggingFace", "HF", "抱抱脸", "Inference Providers"], "https://huggingface.co/docs/inference-providers/index"),
    "novita": _preset("Novita AI", "novita", "novita", None, "NOVITA_API_KEY", ["Novita", "诺维塔", "DeepSeek", "Qwen"], "https://novita.ai/docs/guides/llm-api"),
    "azure": _preset("Azure OpenAI", "azure", "azure", "", "AZURE_API_KEY", ["微软", "Microsoft", "Azure", "GPT"], "https://docs.litellm.ai/docs/providers/azure/", notes=("Enter your Azure resource endpoint and its API version. The model ID is your deployment name.", "填写 Azure 资源端点及其 API 版本。模型 ID 使用部署名称。"), fields=[_field("api_version", "Azure API version", "Azure API 版本")]),
    "vertex_ai": _preset("Google Vertex AI", "gemini", "vertex_ai", None, None, ["谷歌云", "Google Cloud", "Vertex", "Gemini", "Claude"], "https://docs.litellm.ai/docs/providers/vertex", notes=("Enter the project and a region supporting your model. Use application default credentials, or declare an environment reference containing service-account JSON or its file path.", "填写项目与支持所选模型的区域。使用应用默认凭据，或声明包含服务账户 JSON 或文件路径的环境变量引用。"), fields=[_field("vertex_project", "Google Cloud project", "Google Cloud 项目"), _field("vertex_location", "Vertex region", "Vertex 区域"), _field("vertex_credentials", "Service-account credential environment reference (optional)", "服务账户凭据环境变量引用（可选）", env=True, required=False, placeholder="PROJECT_CREDENTIALS")]),
    "bedrock": _preset("Amazon Bedrock", "bedrock", "bedrock", None, None, ["亚马逊", "AWS", "Amazon", "Claude", "Nova"], "https://docs.litellm.ai/docs/providers/bedrock", notes=("Enter the AWS region and use an IAM role/profile, or declare access-key and secret-key environment references together. The model must be enabled in your account; inference profiles use their full identifier.", "填写 AWS 区域。使用 IAM 角色或配置文件，或同时声明访问密钥和秘密密钥的环境变量引用。账户需开通所选模型，推理配置使用完整标识。"), fields=[_field("aws_region_name", "AWS region", "AWS 区域"), _field("aws_access_key_id", "Access-key environment reference (optional)", "访问密钥环境变量引用（可选）", env=True, required=False, placeholder="AWS_ACCESS_KEY_ID"), _field("aws_secret_access_key", "Secret-key environment reference (optional)", "秘密密钥环境变量引用（可选）", env=True, required=False, placeholder="AWS_SECRET_ACCESS_KEY"), _field("aws_session_token", "Session-token environment reference (optional)", "会话令牌环境变量引用（可选）", env=True, required=False, placeholder="AWS_SESSION_TOKEN")]),
    "cloudflare": _preset("Cloudflare Workers AI", "cloudflare", "cloudflare", "", "CLOUDFLARE_API_KEY", ["Cloudflare", "Workers AI", "云闪", "@cf"], "https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/", notes=("Enter https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1 and use a Workers AI token.", "填写 https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1，并使用 Workers AI 令牌。")),
    "ollama": _preset("Ollama", "ollama", "ollama_chat", "http://localhost:11434", None, ["本地模型", "local", "Llama", "Qwen"], "https://docs.ollama.com/api/introduction", notes=("Start Ollama and pull a model. The address must be reachable from the gateway process.", "启动 Ollama 并下载模型。网关进程必须能访问填写的地址。"), private=True),
    "lmstudio": _preset("LM Studio", "lmstudio", "lm_studio", "", None, ["LMStudio", "LM Studio", "本地模型", "local"], "https://lmstudio.ai/docs/developer/openai-compat", notes=("Start the local server and enter its base URL including /v1. Declare a key environment reference if server authentication is enabled.", "启动本地服务器，填写包含 /v1 的基础地址。启用服务器认证时请声明密钥环境变量引用。"), private=True),
}


def provider_presets() -> list[dict[str, Any]]:
    result = [{"id": name, "kind": "llm", **copy.deepcopy(template)} for name, template in PRESETS.items()]
    result.append({"id": "system_one", "kind": "decision", "display_name": "System One", "brand_id": None, "icon_id": None, "protocol": "system_one", "api_base": "", "api_key_env": "SYSTEM_ONE_API_KEY"})
    return result
