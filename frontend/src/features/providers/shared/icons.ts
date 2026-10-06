import type { ProviderProfile } from "@/shared/api/types";
import sources from "../assets/sources.json";

const images = import.meta.glob<string>("../assets/*.svg", { eager: true, query: "?url&no-inline", import: "default" });
export type BrandIcon = { id: string; label: string; aliases: string[]; url: string; source: string; officialReference: string; originalFile: string; sha256: string; license: string; usage: string };
const entries: Array<[string, string, string[]]> = [
  ["deepseek", "DeepSeek", ["Deep Seek", "深度求索", "R1", "V3"]],
  ["openai", "OpenAI", ["GPT", "ChatGPT", "o1", "o3"]],
  ["anthropic", "Anthropic", ["Claude", "Sonnet", "Opus", "Haiku"]],
  ["gemini", "Google Gemini", ["Google", "Vertex AI", "谷歌"]],
  ["qwen", "Qwen", ["DashScope", "Alibaba", "阿里", "通义千问", "百炼"]],
  ["moonshot", "Moonshot", ["月之暗面", "Moonshot AI"]],
  ["kimi", "Kimi", ["月之暗面", "K2", "K2.5"]],
  ["zhipu", "Zhipu / Z.AI", ["智谱", "GLM", "ChatGLM", "zai", "Z.AI"]],
  ["minimax", "MiniMax", ["海螺", "Hailuo", "M2", "M2.5"]],
  ["doubao", "Doubao", ["豆包", "ByteDance", "字节跳动", "Seed"]],
  ["volcengine", "Volcengine", ["火山引擎", "Ark", "火山方舟"]],
  ["baidu", "Baidu", ["百度", "文心", "ERNIE", "千帆", "Qianfan"]],
  ["hunyuan", "Tencent Hunyuan", ["腾讯混元", "Hunyuan"]],
  ["tencentcloud", "Tencent Cloud", ["腾讯云", "Tencent"]],
  ["spark", "iFLYTEK Spark", ["讯飞", "星火", "iFLYTEK"]],
  ["stepfun", "StepFun", ["阶跃星辰", "Step"]],
  ["baichuan", "Baichuan", ["百川", "百川智能"]],
  ["yi", "01.AI / Yi", ["零一万物", "Ling", "01ai"]],
  ["siliconcloud", "SiliconFlow", ["硅基流动", "Silicon Cloud"]],
  ["modelscope", "ModelScope", ["魔搭", "Model Scope"]],
  ["openrouter", "OpenRouter", ["Open Router"]],
  ["xai", "xAI", ["Grok", "x.ai"]],
  ["mistral", "Mistral", ["Mixtral", "Codestral", "Le Chat"]],
  ["groq", "Groq", ["GroqCloud"]],
  ["cohere", "Cohere", ["Command", "Aya"]],
  ["together", "Together AI", ["Together", "TogetherAI"]],
  ["fireworks", "Fireworks AI", ["Fireworks"]],
  ["perplexity", "Perplexity", ["Sonar", "困惑"]],
  ["cerebras", "Cerebras", ["Cerebras Cloud"]],
  ["sambanova", "SambaNova", ["Samba Nova"]],
  ["nvidia", "NVIDIA", ["NIM", "英伟达", "Nemotron"]],
  ["huggingface", "Hugging Face", ["HuggingFace", "HF"]],
  ["novita", "Novita AI", ["Novita"]],
  ["azure", "Microsoft Azure", ["Azure OpenAI", "微软", "Microsoft"]],
  ["bedrock", "Amazon Bedrock", ["AWS Bedrock", "亚马逊"]],
  ["aws", "Amazon Web Services", ["AWS", "Amazon", "亚马逊云"]],
  ["cloudflare", "Cloudflare", ["Workers AI"]],
  ["ollama", "Ollama", ["本地", "Local"]],
  ["lmstudio", "LM Studio", ["LMStudio", "本地", "Local"]],
];

export const brandIcons: BrandIcon[] = entries.map(([id, label, aliases]) => {
  const record = id === "deepseek" ? sources.deepseek : sources.icons[id as keyof typeof sources.icons];
  return {
    id, label, aliases, url: images[`../assets/${id}.svg`]!,
    source: "source" in record ? record.source : sources.collection.asset_source_prefix + record.original_file,
    officialReference: record.official_reference, sha256: record.sha256,
    originalFile: "file" in record ? record.file : record.original_file,
    license: "license" in record ? record.license : sources.collection.license,
    usage: "usage" in record ? record.usage : sources.collection.usage,
  };
});
export const genericIcons = ["initials", "server", "cloud", "circuit", "globe"] as const;
export const genericIconLabels = { initials: "pmIconInitials", server: "pmIconServer", cloud: "pmIconCloud", circuit: "pmIconCircuit", globe: "pmIconGlobe" } as const;
const byID = new Map(brandIcons.map((icon) => [icon.id, icon]));
const brandMappings: Record<string, string> = {
  google: "gemini", vertex: "gemini", vertex_ai: "gemini", dashscope: "qwen", dashscope_intl: "qwen", qwen_intl: "qwen",
  zai: "zhipu", z_ai: "zhipu", zhipu_global: "zhipu", minimax_cn: "minimax", minimax_global: "minimax",
  moonshot_cn: "moonshot", moonshot_global: "moonshot", moonshot_intl: "moonshot", kimi_cn: "kimi", kimi_global: "kimi",
  siliconflow: "siliconcloud", siliconflow_intl: "siliconcloud", azure_openai: "azure", amazon_bedrock: "bedrock",
  hugging_face: "huggingface", lm_studio: "lmstudio", together_ai: "together", fireworks_ai: "fireworks", tencent: "hunyuan", iflytek: "spark", zeroone: "yi",
};

export function brandIcon(id?: string | null): BrandIcon | undefined {
  if (!id) return undefined;
  const key = id.toLowerCase();
  return byID.get(brandMappings[key] ?? key);
}

export function resolvedIconID(provider: ProviderProfile): string | null {
  if (provider.icon_id) return provider.icon_id;
  return brandIcon(provider.brand_id || provider.id)?.id ?? null;
}

export function searchIcons(search: string): BrandIcon[] {
  const query = search.trim().toLocaleLowerCase();
  return brandIcons.filter((icon) => [icon.id, icon.label, ...icon.aliases, ...Object.keys(brandMappings).filter((key) => brandMappings[key] === icon.id)].some((value) => value.toLocaleLowerCase().includes(query)));
}

export function profileIconAliases(provider: ProviderProfile): string[] {
  const icon = brandIcon(provider.brand_id || provider.id);
  return icon ? [icon.label, ...icon.aliases] : provider.id === "system_one" ? ["SystemOne", "System One"] : [];
}
