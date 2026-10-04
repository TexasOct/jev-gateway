import { useRef, useState } from "react";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { controlClass } from "./constants";
import type { ProviderManagement } from "./useProviderManagement";

type Props = { manager: ProviderManagement; t: ReturnType<typeof useLocale>["t"] };

export function GatewayCredentialForm({ manager, t }: Props) {
  const [editing, setEditing] = useState(false);
  const [secret, setSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const config = manager.configuration;
  if (!config?.gateway) return null;
  const configured = config.gateway.has_api_key;
  const available = config.write_available || config.gateway_bootstrap_available;
  const cancel = () => {
    setSecret("");
    setEditing(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const submit = async () => {
    const value = secret.trim();
    if (!value || manager.pending || !available) return;
    setSecret("");
    setSaved(false);
    if (await manager.saveGatewayCredential(value)) {
      setEditing(false);
      setSaved(true);
      requestAnimationFrame(() => trigger.current?.focus());
    }
  };
  return <section className="grid min-w-0 gap-2 border-b border-outline pb-4" aria-label={t("gwTitle")}>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <h3 className="m-0 mr-auto text-sm font-semibold">{t("gwTitle")}</h3>
      <span className="text-xs text-ink-muted">{t(configured ? "gwConfigured" : "gwMissing")}</span>
      {!editing && available && <Button ref={trigger} className="min-h-11" variant="outline" disabled={manager.pending || manager.loading} onClick={() => { setSaved(false); setEditing(true); }}>{t(configured ? "gwReplace" : "gwInitialize")}</Button>}
    </div>
    {!configured && <p className="m-0 text-sm text-ink-muted">{t(available ? "gwSetupNote" : "gwSetupUnavailable")}</p>}
    {editing && <form className="grid min-w-0 gap-3" aria-busy={manager.pending} onSubmit={(event) => { event.preventDefault(); void submit(); }} onKeyDown={(event) => { if (event.key === "Escape" && !manager.pending) { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
      <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0" disabled={manager.pending || manager.loading}>
        <label className="grid min-w-0 gap-1 text-sm"><span>{t("gwNewKey")}</span><input className={controlClass} type="password" autoComplete="new-password" required value={secret} onChange={(event) => setSecret(event.target.value)} /></label>
        <p className="m-0 text-xs text-ink-muted">{t("gwSecretNote")}</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={!secret.trim() || !available}>{t(configured ? "gwSave" : "gwInitialize")}</Button><Button type="button" className="min-h-11" variant="outline" onClick={cancel}>{t("pmCancel")}</Button></div>
      </fieldset>
    </form>}
    {saved && <p role="status" className="m-0 text-sm text-ink-muted">{t(manager.catalogRefreshFailed ? "gwSavedRefreshFailed" : "gwSaved")}</p>}
  </section>;
}
