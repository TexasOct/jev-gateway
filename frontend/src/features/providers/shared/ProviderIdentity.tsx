import { CircuitBoard, Cloud, Globe, Server } from "lucide-react";
import { useState } from "react";
import type { ProviderProfile } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import { brandIcon, resolvedIconID } from "./icons";

const genericIconComponents = { server: Server, cloud: Cloud, circuit: CircuitBoard, globe: Globe };

export function ProviderIdentity({ provider, t, compact = false }: { provider: ProviderProfile; t: ReturnType<typeof useLocale>["t"]; compact?: boolean }) {
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const id = resolvedIconID(provider);
  const brand = brandIcon(id);
  const image = brand && failedURL !== brand.url ? brand : undefined;
  const Icon = id !== null && Object.hasOwn(genericIconComponents, id) ? genericIconComponents[id as keyof typeof genericIconComponents] : undefined;
  return <span title={image ? image.label : t("pmFallback")} data-provider-icon={id ?? "automatic"} className={`grid h-11 shrink-0 place-items-center rounded-md border border-outline text-sm text-ink ${compact ? "w-14" : "w-24"} ${image ? "bg-white" : "bg-panel-muted"}`} aria-hidden="true">
    {image ? <img key={image.url} src={image.url} alt="" className={`object-contain h-8 ${image.id === "deepseek" ? "w-auto" : "w-8"} ${image.id === "kimi" ? "drop-shadow-[0_0_1px_#111]" : ""}`} onError={() => setFailedURL(image.url)} /> : Icon ? <Icon size={20} aria-hidden="true" focusable="false" /> : (provider.display_name || provider.id).slice(0, 2).toUpperCase()}
  </span>;
}
