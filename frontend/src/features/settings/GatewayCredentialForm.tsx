import { useEffect, useRef, useState } from "react";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { useUnsavedChanges } from "@/shared/navigation/useUnsavedChanges";
import { controlClass } from "@/features/providers/shared/constants";
import type { ProviderManagement } from "@/features/providers/shared/useProviderManagement";

type Props = { manager: ProviderManagement; t: ReturnType<typeof useLocale>["t"] };

export function GatewayCredentialForm({ manager, t }: Props) {
  const [editing, setEditing] = useState(false);
  const [secret, setSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { navigationGuardRef } = manager;
  useUnsavedChanges(navigationGuardRef, secret !== "", () => {
    setSecret("");
    setEditing(false);
    setAttemptedSave(false);
  }, t("gwDiscard"), manager.pending);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  const config = manager.configuration;
  const error = manager.errorOwner === "gateway" || manager.errorOwner === "read" ? manager.operationError : null;
  const refreshFailed = manager.catalogRefreshFailed && manager.catalogRefreshOwner === "gateway";
  const configured = config?.gateway?.has_api_key;
  const available = manager.active !== false && !!config?.gateway && (config.write_available || (!configured && config.gateway_bootstrap_available));
  const cancel = () => {
    if (manager.pending || (secret && !window.confirm(t("gwDiscard")))) return;
    setSecret("");
    setEditing(false);
    setAttemptedSave(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const submit = async () => {
    const value = secret;
    if (!value.trim() || manager.pending || !available) return;
    setSecret("");
    setSaved(false);
    setAttemptedSave(true);
    if (await manager.saveGatewayCredential(value)) {
      setSecret("");
      setEditing(false);
      setAttemptedSave(false);
      setSaved(true);
      requestAnimationFrame(() => trigger.current?.focus());
    } else setSecret(value);
  };
  const errorText = (status: number) => t(status === 401 ? "gwUnauthorized" : !attemptedSave ? "gwReadError" : status === 409 ? "gwConflict" : status === 403 ? "gwForbidden" : status === 400 ? "gwInvalid" : status >= 500 ? "gwServerError" : "gwNetworkError");
  return <section className="grid min-w-0 gap-3" aria-label={t("gwTitle")} aria-busy={manager.loading || manager.pending}>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <h3 className="m-0 mr-auto text-sm font-semibold">{t("gwTitle")}</h3>
      {configured !== undefined && <span className="text-xs text-ink-muted">{t(configured ? "gwConfigured" : "gwMissing")}</span>}
      {!editing && available && <Button ref={trigger} className="min-h-11" variant="outline" disabled={manager.pending || manager.loading} onClick={() => { setSaved(false); setEditing(true); }}>{t(configured ? "gwReplace" : "gwInitialize")}</Button>}
    </div>
    {manager.loading && <p role="status" className="m-0 text-sm text-ink-muted">{t("gwLoading")}</p>}
    {!manager.loading && configured === undefined && error === null && <div role="status" className="grid gap-2 text-sm text-ink-muted"><p className="m-0">{t("gwUnavailable")}</p><Button variant="outline" className="min-h-11 justify-self-start" disabled={manager.pending} onClick={() => void manager.load()}>{t("pmReload")}</Button></div>}
    {configured === false && <p className="m-0 text-sm text-ink-muted">{t(available ? "gwSetupNote" : "gwSetupUnavailable")}</p>}
    {configured === true && !available && <p role="status" className="m-0 text-sm text-ink-muted">{t("gwForbidden")}</p>}
    {configured !== undefined && <p id="gateway-key-effects" className="m-0 text-sm text-ink-muted">{t(configured ? "gwRotationEffects" : "gwInitializeEffects")}</p>}
    {editing && <form className="grid min-w-0 gap-3" aria-busy={manager.pending} onSubmit={(event) => { event.preventDefault(); void submit(); }} onKeyDown={(event) => { if (event.key === "Escape" && !manager.pending) { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
      <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0" disabled={manager.pending || manager.loading}>
        <label className="grid min-w-0 gap-1 text-sm"><span>{t("gwNewKey")}</span><input ref={input} className={controlClass} type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false} aria-describedby="gateway-key-effects gateway-key-help" required value={secret} onChange={(event) => { setSecret(event.target.value); setSaved(false); }} /></label>
        <p id="gateway-key-help" className="m-0 text-xs text-ink-muted">{t("gwSecretNote")}</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={!secret.trim() || !available}>{t(configured ? "gwSave" : "gwInitialize")}</Button><Button type="button" className="min-h-11" variant="outline" onClick={cancel}>{t("pmCancel")}</Button></div>
      </fieldset>
    </form>}
    {manager.pending && manager.pendingOwner === "gateway" && <p role="status" className="m-0 text-sm text-ink-muted">{t("gwSaving")}</p>}
    {error !== null && <div role="alert" className="grid min-w-0 gap-2 text-sm text-ink-muted"><span>{manager.errorOwner === "read" ? t("gwReadError") : errorText(error)}</span><Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={manager.loading || manager.pending} onClick={() => { setAttemptedSave(false); void manager.load(); }}>{t("pmReload")}</Button></div>}
    {saved && <p role="status" className="m-0 text-sm text-ink-muted">{t(refreshFailed ? "gwSavedRefreshFailed" : "gwSaved")}</p>}
    {saved && refreshFailed && <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={manager.pending || manager.refreshingCatalog} onClick={() => void manager.retryCatalogRefresh()}>{t("pmRetryCatalog")}</Button>}
  </section>;
}
