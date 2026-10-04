import { useState } from "react";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import type { ProviderManagement } from "@/features/providers/useProviderManagement";

type Props = {
  manager: ProviderManagement;
  t: ReturnType<typeof useLocale>["t"];
  onOpenProviders: () => void;
};

export function GlobalDefaultModel({ manager, t, onOpenProviders }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const config = manager.configuration;
  const saved = config?.defaults?.default_model ?? "";
  const selected = draft ?? saved;
  const models = config?.models ?? [];
  const missing = selected !== "" && !models.some((model) => model.name === selected);
  const disabled = manager.loading || manager.pending || !config?.write_available;
  const saveDisabled = disabled || manager.error !== null || missing;
  const save = async (value: string) => {
    if (disabled || manager.error !== null || (value !== "" && !models.some((model) => model.name === value))) return;
    setNotice(false);
    if (await manager.save([{ action: "set_default_model", model: value === "" ? null : value }])) {
      setDraft(null);
      setNotice(true);
    }
  };
  const errorText = (status: number) => t(status === 409 ? "pmConflict" : status === 401 ? "authRequired" : status === 403 ? "pmForbidden" : "globalDefaultError");

  return <section aria-label={t("globalDefaultModel")} aria-busy={manager.loading || manager.pending} className="grid min-w-0 gap-3 rounded-lg border border-outline bg-panel p-4">
    <label htmlFor="settings-default-model" className="text-sm font-medium text-ink">{t("globalDefaultModel")}</label>
    <p id="settings-default-model-help" className="m-0 text-sm text-ink-muted">{t("globalDefaultHelp")}</p>
    <p className="m-0 break-all text-xs text-ink-muted">{t("globalDefaultCurrent")}: {config === null ? t("notRecorded") : saved || t("globalDefaultNone")}</p>
    <select id="settings-default-model" value={selected} disabled={disabled} aria-describedby="settings-default-model-help"
      className="min-h-11 w-full min-w-0 max-w-full rounded-md border border-outline bg-panel px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      onChange={(event) => { setDraft(event.target.value); setNotice(false); }}>
      <option value="">{t("globalDefaultNone")}</option>
      {missing && <option value={selected} disabled>{selected} ({t("unavailable")})</option>}
      {models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
    </select>
    {config !== null && models.length === 0 && <div className="grid min-w-0 gap-2 text-sm text-ink-muted"><p className="m-0">{t("globalDefaultNoModels")}</p><Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={manager.pending} onClick={onOpenProviders}>{t("providerModels")}</Button></div>}
    {config !== null && !config.write_available && <p role="status" className="m-0 text-sm text-ink-muted">{t("pmReadOnly")}</p>}
    {manager.loading || manager.pending ? <p role="status" className="m-0 text-sm text-ink-muted">{t("loading")}</p> : null}
    {manager.error !== null && <div role="alert" className="grid min-w-0 gap-2 text-sm text-ink-muted"><span>{errorText(manager.error)}</span><Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={manager.pending || manager.loading} onClick={() => { setNotice(false); void manager.load(); }}>{t("pmReload")}</Button></div>}
    {notice && !manager.catalogRefreshFailed && <p role="status" className="m-0 text-sm text-ink-muted">{t("globalDefaultSaved")}</p>}
    {manager.catalogRefreshFailed && <div role="alert" className="grid min-w-0 gap-2 text-sm text-ink-muted"><span>{t("globalDefaultRefreshFailed")}</span><Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={manager.pending || manager.refreshingCatalog} onClick={() => void manager.retryCatalogRefresh()}>{t("pmRetryCatalog")}</Button></div>}
    <div className="flex min-w-0 flex-wrap gap-2">
      <Button type="button" className="min-h-11" disabled={saveDisabled || selected === saved} onClick={() => void save(selected)}>{t("globalDefaultSave")}</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={disabled || manager.error !== null || saved === ""} onClick={() => void save("")}>{t("globalDefaultClear")}</Button>
    </div>
  </section>;
}
