import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import type { DiscoveryItem, ProviderSelector } from "@/shared/api/types";
import type { ProviderManagement } from "../shared/useProviderManagement";
import { modelDraftChanged, modelFieldLabels, modelErrors, confirmedModel, emptyModelDraft, failedModelRefresh, invalidateModelEvidence, metadataFieldState, metadataSourceFailed, modelFields, prefillMetadata, withConfirmedMetadata } from "./model";
import type { ModelDraft } from "./model";
import { ModelDialog } from "./ModelDialog";
import { ModelFields } from "./ModelFields";
import { controlClass } from "../shared/constants";

type Props = { providerId: string; selector: ProviderSelector; manager: ProviderManagement; t: ReturnType<typeof useLocale>["t"]; candidate?: boolean; onDirtyChange: (dirty: boolean) => void };
export function ProviderModels({ providerId, selector, manager, t, candidate = false, onDirtyChange }: Props) {
  const [emptyDialogDraft] = useState(emptyModelDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [manualItems, setManualItems] = useState<DiscoveryItem[]>([]);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ModelDraft>>({});
  const [baselines, setBaselines] = useState<Record<string, ModelDraft>>({});
  const [batch, setBatch] = useState(emptyModelDraft);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const [reviewVersion, setReviewVersion] = useState(manager.evidenceVersion);
  const [queryTargets, setQueryTargets] = useState<string[]>([]);
  const fallbackFocusRef = useRef<HTMLInputElement>(null);
  const sourceMatches = manager.sourceResponse != null && manager.sourceResponse.configurationGeneration === manager.configurationGeneration && JSON.stringify(manager.sourceResponse.selector) === JSON.stringify(selector);
  const queryOwned = manager.queryRequest != null && manager.queryRequest.configurationGeneration === manager.configurationGeneration && JSON.stringify(manager.queryRequest.selector) === JSON.stringify(selector);
  const queryError = queryOwned ? manager.queryError : null;
  const metadata = sourceMatches ? manager.metadata : null;
  const discovery = sourceMatches ? manager.discovery : null;

  useEffect(() => {
    let current = true;
    void Promise.resolve().then(() => {
      if (!current) return;
      setDrafts((previous) => {
        const next = Object.fromEntries(Object.entries(previous).map(([id, draft]) => {
          if (reviewVersion === manager.evidenceVersion) return [id, draft];
          // Keep provenance and manual ownership; invalidate current automatic facts.
          return [id, invalidateModelEvidence(draft)];
        }));
        if (sourceMatches) for (const item of manager.evidence) {
          if (manager.sourceResponse?.upstreamModels.includes(item.upstream_model)) next[item.upstream_model] = prefillMetadata(next[item.upstream_model] ?? emptyModelDraft(), item);
        }
        if (queryError !== null && manager.lastQueryMode === "metadata") for (const id of queryTargets.length ? queryTargets : manager.queryRequest?.upstreamModels ?? []) {
          next[id] = failedModelRefresh(next[id] ?? emptyModelDraft(), id);
        }
        return next;
      });
      setBaselines((previous) => {
        const next = Object.fromEntries(Object.entries(previous).map(([id, draft]) => [id, reviewVersion === manager.evidenceVersion ? draft : invalidateModelEvidence(draft)]));
        if (sourceMatches) for (const item of manager.evidence) {
          if (manager.sourceResponse?.upstreamModels.includes(item.upstream_model)) next[item.upstream_model] = prefillMetadata(next[item.upstream_model] ?? emptyModelDraft(), item);
        }
        return next;
      });
      if (discovery) setManualItems((previous) => [...new Map([...previous, ...discovery.items].map((item) => [item.upstream_model, item])).values()]);
      setReviewVersion(manager.evidenceVersion);
      if (sourceMatches || queryError !== null || reviewVersion !== manager.evidenceVersion) setConfirmed(false);
    });
    return () => { current = false; };
  }, [manager.evidence, manager.evidenceVersion, manager.sourceResponse, manager.queryRequest, queryError, manager.lastQueryMode, queryTargets, reviewVersion, discovery, sourceMatches]);

  const configured = new Set((manager.configuration?.models ?? []).filter((model) => model.provider === providerId).map((model) => model.upstream_model));
  const byID = new Map<string, DiscoveryItem>();
  for (const item of [...manualItems, ...(discovery?.items ?? [])]) byID.set(item.upstream_model, { ...item, imported: item.imported || configured.has(item.upstream_model) });
  const visible = [...byID.values()].filter((item) => item.upstream_model.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selectable = visible.filter((item) => !item.imported);
  const selected = selection.filter((id) => !configured.has(id) && !byID.get(id)?.imported);
  const dirty = selected.length > 0 || manual.trim().length > 0 || modelDraftChanged(emptyDialogDraft, batch) || Object.entries(drafts).some(([id, draft]) => modelDraftChanged(baselines[id] ?? emptyDialogDraft, draft));
  useLayoutEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const models = selected.map((id) => confirmedModel(id, drafts[id] ?? emptyModelDraft()));
  const evidenceLimit = selected.some((id) => (drafts[id]?.metadata?.sources?.length ?? 0) > 32);
  const ready = reviewVersion === manager.evidenceVersion && models.length > 0 && models.every((model) => model !== null) && !evidenceLimit;
  const busy = manager.pending || manager.loading || manager.querying !== null;
  const writable = manager.configuration?.write_available === true;
  const failedTargets = queryError !== null && manager.lastQueryMode === "metadata" ? queryTargets.length ? queryTargets : manager.queryRequest?.upstreamModels ?? [] : [];
  const query = (mode: "discovery" | "metadata", ids: string[] = [], refresh = false) => {
    setQueryTargets(ids);
    void manager.query(selector, mode, ids, refresh);
  };
  const toggle = (id: string, checked: boolean) => {
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
    setImportFailed(false);
    const confirmedAt = new Date().toISOString();
    const valid = models.filter((model) => model !== null).map((model) => withConfirmedMetadata(model, drafts[model.upstream_model] ?? emptyModelDraft(), confirmedAt));
    if (await manager.save([{ action: "import", provider_id: providerId, models: valid, confirmed: true }])) {
      setSelection([]); setConfirmed(false); setNotice(true); setBatch(emptyModelDraft());
      setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !valid.some((model) => model.upstream_model === id))));
      setBaselines((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !valid.some((model) => model.upstream_model === id))));
    } else setImportFailed(true);
  };

  return <section className="grid min-w-0 gap-4 border-t border-outline pt-4" aria-label={t("pmModels")} aria-busy={manager.pending || manager.loading || (queryOwned && manager.querying !== null)}>
    <fieldset disabled={manager.pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
    <div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="m-0 mr-auto text-sm font-semibold">{t("pmModels")}</h3><Button className="min-h-11" disabled={busy || !writable || !providerId} onClick={() => query("discovery")}>{t(candidate ? "pmCandidate" : "pmDiscover")}</Button></div>
    {queryError !== null && <div role="alert" className="text-sm text-ink-muted">{t(queryError === 403 ? "pmForbidden" : "pmError")} <Button variant="outline" className="min-h-11" disabled={busy || !writable} onClick={() => query(manager.lastQueryMode, queryTargets.length ? queryTargets : manager.queryRequest?.upstreamModels ?? [...byID.keys()], true)}>{t("pmRetry")}</Button></div>}
    {queryOwned && manager.querying && <p role="status" className="m-0 text-sm text-ink-muted">{t("loading")}</p>}
    {discovery && !discovery.supported && <p className="m-0 text-sm text-ink-muted">{t("pmUnsupported")}</p>}
    {discovery?.supported && !discovery.complete && <p className="m-0 text-sm text-ink-muted">{t("pmIncomplete")}</p>}
    {!byID.size && <p className="m-0 text-sm text-ink-muted">{t("pmEmptyModels")}</p>}
    <form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); addManual(); }}>
      <label className="grid min-w-0 flex-1 gap-1 text-sm"><span>{t("pmManual")}</span><input className={controlClass} value={manual} onChange={(event) => setManual(event.target.value)} /></label>
      <Button className="min-h-11" type="submit" variant="outline" disabled={!manual.trim()}>{t("pmManualAdd")}</Button>
    </form>
    <label className="grid min-w-0 gap-1 text-sm"><span>{t("pmModelSearch")}</span><input ref={fallbackFocusRef} className={controlClass} type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <div className="flex flex-wrap items-center gap-2"><Button className="min-h-11" variant="outline" disabled={!selectable.length} onClick={() => { setSelection((previous) => [...new Set([...previous, ...selectable.map((item) => item.upstream_model)])]); setConfirmed(false); }}>{t("pmSelectVisible")}</Button><Button className="min-h-11" variant="ghost" onClick={() => { setSelection([]); setConfirmed(false); }}>{t("pmClearSelection")}</Button><span role="status" className="text-sm text-ink-muted">{selected.length} / {selectable.length} {t("pmSelection")}</span></div>
    <div className="grid max-h-80 min-w-0 gap-1 overflow-y-auto">
      {visible.map((item) => {
        const evidence = drafts[item.upstream_model]?.evidence;
        const failed = !!evidence && metadataSourceFailed(evidence);
        return <div key={item.upstream_model} className="flex min-w-0 flex-wrap items-center gap-2 border-b border-outline py-2"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm"><input type="checkbox" aria-label={item.qualified_id} disabled={item.imported} checked={selected.includes(item.upstream_model)} onChange={(event) => toggle(item.upstream_model, event.target.checked)} /><span className="min-w-0 flex-1 break-all font-mono">{item.qualified_id}</span><span className="text-xs text-ink-muted">{t(item.imported ? "mmImportedSkip" : failed ? "mmFetchFailed" : evidence && modelFields.some((field) => metadataFieldState(evidence, field) === "conflict") ? "mmConflict" : confirmedModel(item.upstream_model, drafts[item.upstream_model] ?? emptyModelDraft()) ? "mmMatched" : "mmPartial")}</span></label>{failed && !item.imported && <Button variant="outline" className="min-h-11" aria-label={`${t("pmRetry")}: ${item.qualified_id}`} disabled={busy || !writable} onClick={() => query("metadata", [item.upstream_model], true)}>{t("pmRetry")}</Button>}</div>;
      })}
    </div>
    {selected.length > 0 && <>
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="outline" disabled={busy || !writable} onClick={() => query("metadata", selected)}>{t("pmMetadata")}</Button><Button className="min-h-11" variant="ghost" disabled={busy || !writable} onClick={() => query("metadata", selected, true)}>{t("pmMetadataRefresh")}</Button></div>
      {metadata && <p className="m-0 break-all text-sm text-ink-muted">{t("pmFetched")}: {metadata.fetched_at ?? t("notRecorded")} {metadata.stale && t("pmMetadataStale")}</p>}
      <details className="min-w-0 border-y border-outline py-3"><summary className="min-h-11 cursor-pointer text-sm font-medium">{t("pmBatch")} ({selected.length})</summary><p className="text-sm text-ink-muted">{t("pmBatchNote")}</p><ModelFields prefix="batch" draft={batch} t={t} onChange={(field, value) => setBatch((previous) => ({ ...previous, values: { ...previous.values, [field]: value } }))} /><Button className="mt-3 min-h-11" variant="outline" onClick={() => {
        setDrafts((previous) => { const next = { ...previous }; for (const id of selected) { const draft = next[id] ?? emptyModelDraft(); const values = { ...draft.values }; const touched = { ...draft.touched }; for (const field of modelFields) if (batch.values[field] !== "") { values[field] = batch.values[field]; touched[field] = true; } next[id] = { ...draft, values, touched }; } return next; }); setConfirmed(false);
      }}>{t("pmBatchApply")}</Button></details>
      {selected.map((id) => {
        const draft = drafts[id] ?? emptyModelDraft();
        const missing = Object.keys(modelErrors(id, draft));
        return <section key={id} className="flex min-w-0 flex-wrap items-center gap-2 border-b border-outline py-2" aria-label={`${providerId}/${id}`}><span className="min-w-0 flex-1 break-all text-sm">{id}</span><Button className="min-h-11" variant="outline" onClick={() => setEditing(id)}>{t("mmEdit")}</Button>
          <dl className="m-0 grid w-full min-w-0 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">{modelFields.map((field) => <div key={field} className="flex min-w-0 flex-wrap gap-x-2"><dt className="text-ink-muted">{t(modelFieldLabels[field])}</dt><dd className="m-0 break-all">{draft.values[field] === "true" ? t("pmSupported") : draft.values[field] === "false" ? t("pmUnsupportedFlag") : draft.values[field] === "null" ? t("pmLimitUnknown") : draft.values[field] || t("pmSourceUnknown")}</dd></div>)}</dl>
          {draft.warnings.length > 0 && <p className="m-0 w-full text-xs text-ink-muted">{t("mmSourceConditions")}</p>}
          {draft.metadataRefreshBlocked && <p role="alert" className="m-0 w-full text-xs text-ink-muted">{t("mmMetadataRefreshBound")}</p>}
          <details className="w-full min-w-0"><summary className="min-h-11 cursor-pointer text-xs">{t("pmSources")}</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(draft.evidence ?? draft.currentMetadata ?? { sources: [] }, null, 2)}</pre></details>
          {missing.length > 0 && <p className="m-0 w-full break-all text-xs text-ink-muted">{t("mmRemaining")}: {missing.map((field) => t(modelFieldLabels[field as keyof typeof modelFieldLabels] ?? "mmRequired")).join("; ")}</p>}</section>;
      })}
      {editing && <ModelDialog fallbackFocusRef={fallbackFocusRef} key={editing} identity={editing} canonicalId={`${providerId}/${editing}`} connectionLabel={manager.configuration?.providers.find((provider) => provider.id === providerId)?.display_name || providerId} evidenceVersion={manager.evidenceVersion} initial={drafts[editing] ?? emptyDialogDraft} t={t} pending={manager.pending} querying={queryOwned && manager.querying !== null} queryError={failedTargets.includes(editing) ? queryError : null} onClose={() => setEditing(null)} onRefresh={() => query("metadata", [editing], true)} onSave={async (draft) => { setDrafts((previous) => ({ ...previous, [editing]: draft })); setConfirmed(false); return true; }} />}
      {!candidate && <><label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} disabled={!ready} onChange={(event) => setConfirmed(event.target.checked)} /><span>{t("pmConfirm")}</span></label>{!ready && <p className="m-0 text-sm text-ink-muted">{t(evidenceLimit ? "pmEvidenceLimit" : "pmRequired")}</p>}<Button className="min-h-11 justify-self-start" disabled={!ready || !confirmed || busy || !writable} onClick={() => void importModels()}>{t("pmImport")} ({selected.length})</Button></>}
    </>}
    {notice && manager.modelOperationProviderId === providerId && manager.modelOperationKind === "import" && <p role="status" className="m-0 text-sm text-ink-muted">{t(manager.catalogRefreshFailed ? "pmImportRefreshFailed" : "pmImportSaved")} {manager.importResult && <span>{t("pmImportedCount")}: {manager.importResult.imported}; {t("pmSkippedCount")}: {manager.importResult.skipped}</span>}</p>}
    {importFailed && manager.modelOperationProviderId === providerId && manager.modelOperationKind === "import" && manager.errorOwner === "model" && <div role="alert" className="grid gap-2 text-sm text-ink-muted"><span>{t(manager.error === 409 ? "mmConflictSave" : "pmError")}</span><Button variant="outline" className="min-h-11 justify-self-start" disabled={manager.pending || manager.loading} onClick={() => void manager.load()}>{t("pmReload")}</Button></div>}
    {candidate && <p role="status" className="m-0 text-sm text-ink-muted">{t("pmSaveToImport")}</p>}
    </fieldset>
  </section>;
}
