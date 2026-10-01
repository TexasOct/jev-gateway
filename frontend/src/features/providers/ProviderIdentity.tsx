import { CircuitBoard, Cloud, Globe, Server } from "lucide-react";
import { useState } from "react";
import type { ProviderProfile } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import deepseekLogo from "./assets/deepseek.svg";

export function ProviderIdentity({ provider, t }: { provider: ProviderProfile; t: ReturnType<typeof useLocale>["t"] }) {
  const [failedAsset, setFailedAsset] = useState(false);
  const official = !failedAsset && (provider.icon_id === "deepseek" || (provider.brand_id === "deepseek" && !provider.icon_id));
  const Icon = { server: Server, cloud: Cloud, circuit: CircuitBoard, globe: Globe }[provider.icon_id as "server" | "cloud" | "circuit" | "globe"];
  return <span title={official ? "DeepSeek" : t("pmFallback")} className={`grid h-11 w-24 shrink-0 place-items-center rounded-md border border-outline text-sm text-ink ${official ? "bg-white" : "bg-panel-muted"}`} aria-hidden="true">
    {official ? <img src={deepseekLogo} alt="" className="h-auto max-h-8 w-22 object-contain" onError={() => setFailedAsset(true)} /> : Icon ? <Icon size={20} aria-hidden="true" focusable="false" /> : (provider.display_name || provider.id).slice(0, 2).toUpperCase()}
  </span>;
}
