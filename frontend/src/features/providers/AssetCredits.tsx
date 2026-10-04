import { useLocale } from "@/shared/i18n";
import sources from "./assets/sources.json";
import license from "./assets/LICENSE-deepseek.txt?raw";
import collectionLicense from "./assets/LICENSE-lobe-icons.txt?raw";
import { brandIcons } from "./icons";

export function AssetCredits() {
  const { t } = useLocale();
  const linkClass = "break-all text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  return <details className="min-w-0 border-t border-outline pt-3 text-xs text-ink-muted">
    <summary className="min-h-11 cursor-pointer">{t("pmAssetSources")}</summary>
    <p className="break-words">{t("pmAssetUsage")}</p>
    <a className={linkClass} href={sources.deepseek.license_source} target="_blank" rel="noreferrer">DeepSeek: MIT</a>
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{license}</pre>
    <div className="flex flex-wrap gap-3"><a className={linkClass} href={sources.collection.source} target="_blank" rel="noreferrer">{t("pmAssetCollection")}</a><a className={linkClass} href={sources.collection.license_source} target="_blank" rel="noreferrer">MIT</a></div>
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{collectionLicense}</pre>
    <p>{t("pmAssetCoverage")}</p>
    <ul className="grid min-w-0 gap-3 pl-4">{brandIcons.map((icon) => <li key={icon.id} className="min-w-0"><span>{icon.label}: </span><a className={linkClass} href={icon.source} target="_blank" rel="noreferrer">{t("pmAssetOriginal")}</a>{" · "}<a className={linkClass} href={icon.officialReference} target="_blank" rel="noreferrer">{t("pmAssetReference")}</a></li>)}</ul>
  </details>;
}
