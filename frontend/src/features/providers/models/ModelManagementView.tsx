import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useUnsavedChanges } from "@/shared/navigation/useUnsavedChanges";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { ProviderModels } from "./ProviderModels";
import { ModelDialog } from "./ModelDialog";
import { ModelDetails } from "./ModelDetails";
import { confirmedModel, draftFromModel, prefillMetadata, withConfirmedMetadata } from "./model";
import type { ProviderManagement } from "../shared/useProviderManagement";
import type { ProviderModelView } from "@/shared/api/types";
import { controlClass } from "../shared/constants";

export function ModelManagementView({ manager, t, providerId, onProviderChange, embedded = false }: { manager: ProviderManagement; t: ReturnType<typeof useLocale>["t"]; providerId?: string; onProviderChange?: (providerId: string) => void; embedded?: boolean }) {
  const [selected, setSelected] = useState(providerId ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [openedModel, setOpenedModel] = useState<ProviderModelView | null>(null);
  const [importDirty, setImportDirty] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [editAttempted, setEditAttempted] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const dirty = importDirty || editDirty;
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const detailId = useId();
  // The configured-model search remains visible when a renamed row leaves the filter.
  const fallbackFocusRef = useRef<HTMLInputElement>(null);
  const configuration = manager.configuration;
  const effective = embedded ? providerId ?? "" : selected || providerId || configuration?.providers[0]?.id || "";
  const operationError = manager.errorOwner === "read" || (manager.errorOwner === "model" && (!embedded || manager.modelOperationProviderId === effective)) ? manager.error : null;
  const queryOwned = manager.queryRequest != null && manager.queryRequest.configurationGeneration === manager.configurationGeneration && "provider_id" in manager.queryRequest.selector && manager.queryRequest.selector.provider_id === effective;
  const visibleModels = configuration?.models.filter((record) => record.provider === effective && `${record.name} ${record.display_name ?? ""}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const detail = visibleModels.find((record) => record.name === selectedDetail);
  const openEditor = (record: ProviderModelView) => {
    if (manager.pending) return;
    manager.cancelQuery();
    setEditAttempted(false);
    setOpenedModel(structuredClone(record));
    setEditing(record.name);
  };
  const model = editing ? openedModel : null;
  const currentModel = configuration?.models.find((record) => record.name === editing);
  const targetAvailable = !!currentModel;
  const routingOverlayFields = currentModel?.routing_overlay_fields ?? ["tags", "priority"] as const;
  const source = manager.sourceResponse;
  const evidence = source && source.configurationGeneration === manager.configurationGeneration && "provider_id" in source.selector && source.selector.provider_id === model?.provider && source.upstreamModels.includes(model?.upstream_model ?? "")
    ? manager.evidence.find((item) => item.upstream_model === model?.upstream_model) : undefined;
  const initial = useMemo(() => model ? evidence ? prefillMetadata(draftFromModel(model), evidence) : draftFromModel(model) : null, [model, evidence]);
  const cancelQuery = manager.cancelQuery;
  const discardDrafts = useCallback(() => { cancelQuery(); setImportDirty(false); setEditDirty(false); setEditing(null); setDraftVersion((previous) => previous + 1); }, [cancelQuery]);
  useUnsavedChanges(manager.navigationGuardRef, dirty, discardDrafts, t("mmDiscardQuestion"), manager.pending);
  const switchProvider = (id: string) => { manager.cancelQuery(); setSelected(id); setSelectedDetail(null); setImportDirty(false); setEditDirty(false); setEditing(null); setSwitchTo(null); onProviderChange?.(id); };
  return <div data-provider-models={effective} className="grid min-w-0 gap-5">
    {!embedded && <h1 className="m-0 text-xl font-semibold">{t("mmWorkspace")}</h1>}
    {manager.loading && <p role="status">{t("loading")}</p>}
    {operationError != null && !editing && (!embedded || manager.errorOwner === "read" || manager.modelOperationKind === "update_model") && <p role="alert">{t(operationError === 409 ? "mmConflictSave" : operationError === 403 ? "pmForbidden" : "pmError")} <Button variant="outline" disabled={manager.pending || manager.loading} onClick={() => void manager.load()}>{t("pmRetry")}</Button></p>}
    {configuration && !configuration.write_available && <p role="status">{t("pmForbidden")}</p>}
    {!configuration?.providers.length && !manager.loading && <p>{t("mmNoSuppliers")}</p>}
    {!embedded && <label className="grid gap-1 text-sm">{t("mmSupplier")}<select aria-label={t("mmSupplier")} className={controlClass} value={effective} disabled={manager.pending} onChange={(event) => { if (dirty) setSwitchTo(event.target.value); else switchProvider(event.target.value); }}>{configuration?.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.display_name ?? provider.id}</option>)}</select></label>}
    {switchTo !== null && <div className="flex flex-wrap items-center gap-2" role="alert"><span>{t("mmDiscardQuestion")}</span><Button variant="outline" onClick={() => setSwitchTo(null)}>{t("mmKeepEditing")}</Button><Button onClick={() => switchProvider(switchTo)}>{t("mmDiscard")}</Button></div>}
    <section className="grid min-w-0 gap-3" aria-label={t("mmExisting")}><h2 className="m-0 text-base font-semibold">{t("mmExisting")}</h2><input ref={fallbackFocusRef} className={controlClass} type="search" aria-label={t("mmSearchConfigured")} placeholder={t("mmSearchConfigured")} value={search} onChange={(event) => setSearch(event.target.value)} />
      {visibleModels.map((record) => <div key={record.name} className="flex min-w-0 flex-wrap items-center gap-3 border-b border-outline py-3"><div className="min-w-0 flex-1"><span className="break-all text-sm font-medium">{record.display_name || record.upstream_model}</span><p className="m-0 break-all text-xs text-ink-muted">{record.upstream_model}</p><span className="text-xs text-ink-muted">{t(record.enabled === false ? "mmDisabled" : "mmEnabled")}</span></div>{!embedded && <Button variant="outline" className="min-h-11" aria-expanded={detail?.name === record.name} aria-controls={detail?.name === record.name ? detailId : undefined} disabled={manager.pending} onClick={() => setSelectedDetail(detail?.name === record.name ? null : record.name)}>{t("mmViewDetails")}</Button>}<Button variant="outline" className="min-h-11" disabled={manager.pending} onClick={() => openEditor(record)}>{t("mmEdit")}</Button></div>)}
      {!configuration?.models.some((record) => record.provider === effective) && <p className="text-sm text-ink-muted">{t("mmNoModels")}</p>}
    </section>
    {!embedded && detail && <ModelDetails id={detailId} model={detail} connectionLabel={configuration?.providers.find((provider) => provider.id === detail.provider)?.display_name || detail.provider} t={t} editDisabled={manager.pending || !configuration?.write_available} onEdit={() => openEditor(detail)} />}
    {effective && (embedded ? <details className="min-w-0 border-t border-outline pt-3"><summary className="min-h-11 cursor-pointer text-sm font-medium">{t("mmDiscoveryImport")}</summary><ProviderModels key={`${effective}:${draftVersion}`} providerId={effective} selector={{ provider_id: effective }} manager={manager} t={t} onDirtyChange={setImportDirty} /></details> : <ProviderModels key={`${effective}:${draftVersion}`} providerId={effective} selector={{ provider_id: effective }} manager={manager} t={t} onDirtyChange={setImportDirty} />)}
    {model && initial && <ModelDialog
      fallbackFocusRef={fallbackFocusRef} key={model.name} evidenceVersion={manager.evidenceVersion}
      routingOverlayFields={[...routingOverlayFields]} routingOwnershipUnknown={currentModel?.routing_overlay_fields === undefined}
      currentRouting={currentModel ? draftFromModel(currentModel) : undefined}
      identity={model.upstream_model} canonicalId={model.name}
      connectionLabel={configuration?.providers.find((provider) => provider.id === model.provider)?.display_name || model.provider}
      initial={initial} t={t} pending={manager.pending} querying={queryOwned && manager.querying !== null}
      queryError={queryOwned ? manager.queryError : null} readOnly={!configuration?.write_available || !targetAvailable}
      error={!embedded || editAttempted || manager.errorOwner === "read" ? operationError : null}
      onReload={() => void manager.load()} onDirtyChange={setEditDirty}
      onClose={() => { setEditing(null); setEditDirty(false); }}
      onRefresh={() => void manager.query({ provider_id: model.provider }, "metadata", [model.upstream_model], true)}
      onSave={async (draft) => {
        if (!targetAvailable || !configuration?.write_available) return false;
        const confirmed = confirmedModel(model.upstream_model, draft);
        if (!confirmed) return false;
        for (const field of routingOverlayFields) delete confirmed[field];
        setEditAttempted(true);
        return manager.save([{ action: "update_model", model_id: model.name, model: withConfirmedMetadata({ ...confirmed, provider: model.provider }, draft, new Date().toISOString()) }]);
      }}
    />}
    {(!embedded || manager.modelOperationProviderId === effective) && manager.catalogRefreshFailed && manager.catalogRefreshOwner === "model" && <p role="alert">{t("mmCommittedRefreshFailed")} <Button variant="outline" disabled={manager.pending || manager.refreshingCatalog} onClick={() => void manager.retryCatalogRefresh()}>{t("pmRetry")}</Button></p>}
  </div>;
}
