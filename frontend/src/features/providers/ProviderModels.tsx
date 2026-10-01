import { useEffect, useState } from "react";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import type { DiscoveryItem, ProviderSelector } from "@/shared/api/types";
import type { ProviderManagement } from "./useProviderManagement";
import { confirmedModel, emptyModelDraft, invalidateModelEvidence, metadataFieldState, modelFields, prefillMetadata, withConfirmedMetadata } from "./model";
import type { ModelDraft, ModelField } from "./model";
import { ModelFields } from "./ModelFields";
import { controlClass } from "./constants";

type Props = { providerId: string; selector: ProviderSelector; manager: ProviderManagement; t: ReturnType<typeof useLocale>["t"]; candidate?: boolean; onDirtyChange: (dirty: boolean) => void };
export function ProviderModels({ providerId, selector, manager, t, candidate = false, onDirtyChange }: Props) {
  const [manual, setManual] = useState("");
  const [manualItems, setManualItems] = useState<DiscoveryItem[]>([]);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ModelDraft>>({});
  const [batch, setBatch] = useState(emptyModelDraft);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState(false);
  const [reviewVersion, setReviewVersion] = useState(manager.evidenceVersion);
  const metadata = manager.metadata;
  const discovery = manager.discovery;

  useEffect(() => {
    void Promise.resolve().then(() => {
      setDrafts((previous) => {
        const next = Object.fromEntries(Object.entries(previous).map(([id, draft]) => [id, reviewVersion === manager.evidenceVersion ? draft : invalidateModelEvidence(draft)]));
        for (const item of manager.evidence) next[item.upstream_model] = prefillMetadata(next[item.upstream_model] ?? emptyModelDraft(), item);
        return next;
      });
      if (discovery) setManualItems((previous) => [...new Map([...previous, ...discovery.items].map((item) => [item.upstream_model, item])).values()]);
      setReviewVersion(manager.evidenceVersion);
      setConfirmed(false);
    });
  }, [manager.evidence, manager.evidenceVersion, reviewVersion, discovery]);

  const configured = new Set((manager.configuration?.models ?? []).filter((model) => model.provider === providerId).map((model) => model.upstream_model));
  const byID = new Map<string, DiscoveryItem>();
  for (const item of [...manualItems, ...(manager.discovery?.items ?? [])]) byID.set(item.upstream_model, { ...item, imported: item.imported || configured.has(item.upstream_model) });
  const visible = [...byID.values()].filter((item) => item.upstream_model.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selectable = visible.filter((item) => !item.imported);
  const selected = selection.filter((id) => !configured.has(id) && !byID.get(id)?.imported);
  const models = selected.map((id) => confirmedModel(id, drafts[id] ?? emptyModelDraft()));
  const evidenceLimit = selected.some((id) => (drafts[id]?.metadata?.sources?.length ?? 0) > 32);
  const ready = reviewVersion === manager.evidenceVersion && models.length > 0 && models.every((model) => model !== null) && !evidenceLimit;
  const busy = manager.pending || manager.loading || manager.querying !== null;
  const writable = manager.configuration?.write_available === true;
  const changeField = (id: string, field: ModelField, value: string) => {
    onDirtyChange(true);
    setDrafts((previous) => {
      const draft = previous[id] ?? emptyModelDraft();
      return { ...previous, [id]: { ...draft, values: { ...draft.values, [field]: value }, touched: { ...draft.touched, [field]: true } } };
    });
    setConfirmed(false);
  };
  const toggle = (id: string, checked: boolean) => {
    onDirtyChange(true);
    setSelection((previous) => checked ? [...new Set([...previous, id])] : previous.filter((value) => value !== id));
    setConfirmed(false);
  };
  const addManual = () => {
    const id = manual.trim();
    if (!id) return;
    setManualItems((previous) => previous.some((item) => item.upstream_model === id) ? previous : [...previous, { upstream_model: id, qualified_id: `${providerId}/${id}`, imported: configured.has(id), metadata: { fields: {}, sources: [], warnings: [] }, metadata_envelope: { version: 1, sources: [] } }]);
    if (!configured.has(id) && !byID.get(id)?.imported) toggle(id, true);
    setManual("");
  };
  const importModels = async () => {
    if (!ready || !confirmed || candidate) return;
    const confirmedAt = new Date().toISOString();
    const valid = models.filter((model) => model !== null).map((model) => withConfirmedMetadata(model, drafts[model.upstream_model] ?? emptyModelDraft(), confirmedAt));
    if (await manager.save([{ action: "import", provider_id: providerId, models: valid, confirmed: true }])) {
      setSelection([]); setConfirmed(false); setNotice(true); onDirtyChange(false);
    }
  };

  return <section className="grid min-w-0 gap-4 border-t border-outline pt-4" aria-label={t("pmModels")} aria-busy={busy}>
    <fieldset disabled={manager.pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
    <div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="m-0 mr-auto text-sm font-semibold">{t("pmModels")}</h3><Button className="min-h-11" disabled={busy || !writable || !providerId} onClick={() => void manager.query(selector, "discovery")}>{t(candidate ? "pmCandidate" : "pmDiscover")}</Button></div>
    {manager.queryError !== null && <div role="alert" className="text-sm text-ink-muted">{t(manager.queryError === 403 ? "pmForbidden" : "pmError")} <Button variant="outline" className="min-h-11" disabled={busy || !writable} onClick={() => void manager.query(selector, manager.lastQueryMode, selected, true)}>{t("pmRetry")}</Button></div>}
    {manager.querying && <p role="status" className="m-0 text-sm text-ink-muted">{t("loading")}</p>}
    {manager.discovery && !manager.discovery.supported && <p className="m-0 text-sm text-ink-muted">{t("pmUnsupported")}</p>}
    {manager.discovery?.supported && !manager.discovery.complete && <p className="m-0 text-sm text-ink-muted">{t("pmIncomplete")}</p>}
    {!byID.size && <p className="m-0 text-sm text-ink-muted">{t("pmEmptyModels")}</p>}
    <form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); addManual(); }}>
      <label className="grid min-w-0 flex-1 gap-1 text-sm"><span>{t("pmManual")}</span><input className={controlClass} value={manual} onChange={(event) => { setManual(event.target.value); onDirtyChange(true); }} /></label>
      <Button className="min-h-11" type="submit" variant="outline" disabled={!manual.trim()}>{t("pmManualAdd")}</Button>
    </form>
    <label className="grid min-w-0 gap-1 text-sm"><span>{t("pmModelSearch")}</span><input className={controlClass} type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <div className="flex flex-wrap items-center gap-2"><Button className="min-h-11" variant="outline" disabled={!selectable.length} onClick={() => { setSelection((previous) => [...new Set([...previous, ...selectable.map((item) => item.upstream_model)])]); setConfirmed(false); onDirtyChange(true); }}>{t("pmSelectVisible")}</Button><Button className="min-h-11" variant="ghost" onClick={() => { setSelection([]); setConfirmed(false); }}>{t("pmClearSelection")}</Button><span role="status" className="text-sm text-ink-muted">{selected.length} / {selectable.length} {t("pmSelection")}</span></div>
    <div className="grid max-h-80 min-w-0 gap-1 overflow-y-auto">
      {visible.map((item) => <label key={item.upstream_model} className="flex min-h-11 min-w-0 items-center gap-3 border-b border-outline py-2 text-sm"><input type="checkbox" disabled={item.imported} checked={selected.includes(item.upstream_model)} onChange={(event) => toggle(item.upstream_model, event.target.checked)} /><span className="min-w-0 flex-1 break-all font-mono">{item.qualified_id}</span>{item.imported && <span className="text-ink-muted">{t("pmImported")}</span>}</label>)}
    </div>
    {selected.length > 0 && <>
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="outline" disabled={busy || !writable} onClick={() => void manager.query(selector, "metadata", selected)}>{t("pmMetadata")}</Button><Button className="min-h-11" variant="ghost" disabled={busy || !writable} onClick={() => void manager.query(selector, "metadata", selected, true)}>{t("pmMetadataRefresh")}</Button></div>
      {metadata && <p className="m-0 break-all text-sm text-ink-muted">{t("pmFetched")}: {metadata.fetched_at ?? t("notRecorded")} {metadata.stale && t("pmMetadataStale")}</p>}
      <details className="min-w-0 border-y border-outline py-3"><summary className="min-h-11 cursor-pointer text-sm font-medium">{t("pmBatch")} ({selected.length})</summary><p className="text-sm text-ink-muted">{t("pmBatchNote")}</p><ModelFields prefix="batch" draft={batch} t={t} onChange={(field, value) => setBatch((previous) => ({ ...previous, values: { ...previous.values, [field]: value } }))} /><Button className="mt-3 min-h-11" variant="outline" onClick={() => {
        setDrafts((previous) => { const next = { ...previous }; for (const id of selected) { const draft = next[id] ?? emptyModelDraft(); const values = { ...draft.values }; const touched = { ...draft.touched }; for (const field of modelFields) if (batch.values[field] !== "") { values[field] = batch.values[field]; touched[field] = true; } next[id] = { ...draft, values, touched }; } return next; }); setConfirmed(false);
      }}>{t("pmBatchApply")}</Button></details>
      {selected.map((id, index) => {
        const draft = drafts[id] ?? emptyModelDraft();
        const evidence = draft.evidence;
        const conflict = evidence && modelFields.some((field) => metadataFieldState(evidence, field) === "conflict");
        const states = evidence ? Object.fromEntries(modelFields.map((field) => [field, metadataFieldState(evidence, field)])) : undefined;
        return <section className="grid min-w-0 gap-3 border-b border-outline pb-4" key={id} aria-label={`${providerId}/${id}`}><h4 className="m-0 break-all font-mono text-sm font-semibold">{providerId}/{id}</h4>{conflict && <p role="status" className="m-0 text-sm text-ink-muted">{t("pmConflictField")}</p>}<ModelFields prefix={`model-${index}`} draft={draft} states={states} t={t} onChange={(field, value) => changeField(id, field, value)} /><details className="min-w-0"><summary className="min-h-11 cursor-pointer text-sm">{t("pmSources")}</summary>{draft.sources.length ? <><p className="text-sm text-ink-muted">{t("pmCurrentEvidence")}</p><pre data-current-evidence className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md bg-panel-muted p-3 text-xs">{JSON.stringify(evidence ?? { fields: {}, sources: [], warnings: [] }, null, 2)}</pre><details><summary className="min-h-11 cursor-pointer text-sm">{t("pmEvidenceHistory")}</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md bg-panel-muted p-3 text-xs">{JSON.stringify({ sources: draft.sources, warnings: draft.warnings }, null, 2)}</pre></details></> : <p className="text-sm text-ink-muted">{t("pmNoSources")}</p>}</details></section>;
      })}
      {!candidate && <><label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} disabled={!ready} onChange={(event) => setConfirmed(event.target.checked)} /><span>{t("pmConfirm")}</span></label>{!ready && <p className="m-0 text-sm text-ink-muted">{t(evidenceLimit ? "pmEvidenceLimit" : "pmRequired")}</p>}<Button className="min-h-11 justify-self-start" disabled={!ready || !confirmed || busy || !writable} onClick={() => void importModels()}>{t("pmImport")} ({selected.length})</Button></>}
    </>}
    {notice && <p role="status" className="m-0 text-sm text-ink-muted">{t(manager.catalogRefreshFailed ? "pmImportRefreshFailed" : "pmImportSaved")} {manager.importResult && <span>{t("pmImportedCount")}: {manager.importResult.imported}; {t("pmSkippedCount")}: {manager.importResult.skipped}</span>}</p>}
    {candidate && <p role="status" className="m-0 text-sm text-ink-muted">{t("pmSaveToImport")}</p>}
    </fieldset>
  </section>;
}
