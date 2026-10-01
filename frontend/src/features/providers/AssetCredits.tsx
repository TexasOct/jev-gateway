import { useLocale } from "@/shared/i18n";
import sources from "./assets/sources.json";
import license from "./assets/LICENSE-deepseek.txt?raw";

export function AssetCredits() {
  const { t } = useLocale();
  return <details className="min-w-0 border-t border-outline pt-3 text-xs text-ink-muted"><summary className="min-h-11 cursor-pointer">{t("pmAssetSources")}</summary><p className="break-words">{t("pmAssetUsage")}</p><a className="break-all text-primary underline" href={sources.deepseek.license_source} target="_blank" rel="noreferrer">DeepSeek: MIT</a><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{license}</pre><p>{t("pmAssetCoverage")}</p></details>;
}
