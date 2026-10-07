import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { useLocale } from "@/shared/i18n";
import { Dialog } from "@/shared/ui/Dialog";
import { Button } from "@/shared/ui/button";
import { ModelFields } from "./ModelFields";
import { automaticDifferences, failedModelRefresh, metadataSourceFailed, invalidateModelEvidence, metadataFieldState, modelErrors, modelFields, modelFieldLabels, modelDraftChanged, prefillMetadata } from "./model";
import type { ModelDraft } from "./model";
import { controlClass } from "../shared/constants";

type Translate = ReturnType<typeof useLocale>["t"];
export function ModelDialog({ identity, canonicalId, connectionLabel, initial, evidenceVersion = 0, t, pending, error, queryError, querying = false, onSave, onClose, onRefresh, onReload, onDirtyChange, readOnly = false, routingOverlayFields = [], routingOwnershipUnknown = false, currentRouting, fallbackFocusRef }: { identity: string; canonicalId?: string; connectionLabel?: string; initial: ModelDraft; evidenceVersion?: number; t: Translate; pending: boolean; querying?: boolean; queryError?: number | null; readOnly?: boolean; routingOverlayFields?: ("tags" | "priority")[]; routingOwnershipUnknown?: boolean; currentRouting?: Pick<ModelDraft, "tags" | "priority">; fallbackFocusRef?: RefObject<HTMLElement | null>; error?: number | null; onSave: (draft: ModelDraft) => Promise<boolean>; onClose: () => void; onRefresh?: () => void; onReload?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(initial);
  const [original] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const dirty = modelDraftChanged(baseline, draft);
  const [discard, setDiscard] = useState(false);
  const [restore, setRestore] = useState(false);
  const [restoreFields, setRestoreFields] = useState<string[]>([]);
  const fields = useRef<HTMLFieldSetElement>(null);
  useLayoutEffect(() => {
    if (!pending && !readOnly) return;
    const modal = fields.current?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]');
    if (!modal) return;
    const focused = document.activeElement;
    // A save locks its focused button as well as the fields. Give Radix a
    // stable focus target before the next keyboard traversal.
    if (focused === document.body || (focused instanceof HTMLElement && modal.contains(focused) && focused.matches(":disabled"))) {
      modal.focus({ preventScroll: true });
    }
  }, [pending, readOnly]);
  const [observedEvidenceVersion, setObservedEvidenceVersion] = useState(evidenceVersion);
  if (observedEvidenceVersion !== evidenceVersion) {
    setObservedEvidenceVersion(evidenceVersion);
    setDraft(invalidateModelEvidence(draft));
    setBaseline(invalidateModelEvidence(baseline));
  }
  useEffect(() => {
    const captured = initial.evidence as (NonNullable<ModelDraft["evidence"]> & { upstream_model?: string }) | undefined;
    if (queryError != null) void Promise.resolve().then(() => { setDraft((previous) => failedModelRefresh(previous, identity)); setBaseline((previous) => failedModelRefresh(previous, identity)); });
    else if (initial.metadataRefreshBlocked) void Promise.resolve().then(() => setDraft((previous) => ({ ...previous, metadataRefreshBlocked: true, metadataHistory: initial.metadataHistory })));
    else if (captured?.upstream_model === identity) void Promise.resolve().then(() => { setDraft((previous) => prefillMetadata(previous, captured as NonNullable<ModelDraft["evidence"]> & { upstream_model: string })); setBaseline((previous) => prefillMetadata(previous, captured as NonNullable<ModelDraft["evidence"]> & { upstream_model: string })); });
  }, [initial, identity, queryError]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const errors = modelErrors(identity, draft);
  if (draft.evidence && (draft.evidence as typeof draft.evidence & { upstream_model?: string }).upstream_model !== identity) errors.identity = "mmEvidenceTargetError";
  const differences = automaticDifferences(draft);
  const routingConflicts = routingOverlayFields.filter((field) => currentRouting && draft[field] !== currentRouting[field]);
  const change = (next: ModelDraft) => { setDraft(next); setDiscard(false); };
  const close = () => { if (pending) return; if (dirty) setDiscard(true); else onClose(); };
  const states = draft.evidence ? Object.fromEntries(modelFields.map((field) => [field, metadataFieldState(draft.evidence!, field)])) : undefined;
  return <Dialog fallbackFocusRef={fallbackFocusRef} title={`${t("mmEdit")}: ${original.displayName?.trim() || identity}${connectionLabel ? ` · ${connectionLabel}` : ""}`} onClose={close} footer={<>
    {discard ? <><span className="text-sm">{t("mmDiscardQuestion")}</span><Button variant="outline" onClick={() => setDiscard(false)}>{t("mmKeepEditing")}</Button><Button onClick={() => { onDirtyChange?.(false); onClose(); }}>{t("mmDiscard")}</Button></> : <><Button variant="outline" disabled={pending} onClick={close}>{t("cancel")}</Button><Button disabled={pending || querying || readOnly || routingConflicts.length > 0 || Object.keys(errors).length > 0} onClick={async () => { if (await onSave(draft)) { onDirtyChange?.(false); onClose(); } }}>{t(pending ? "loading" : "mmSave")}</Button></>}
  </>}>
    {readOnly && <p role="status" className="text-sm">{t("mmUnavailableDraft")}</p>}
    {onReload && readOnly && <Button variant="outline" disabled={pending} onClick={onReload}>{t("pmReload")}</Button>}
    <fieldset ref={fields} disabled={pending || readOnly} className="m-0 grid min-w-0 gap-5 border-0 p-0">
      {error != null && <p role="alert" className="m-0 text-sm">{t(error === 409 ? "mmConflictSave" : "pmError")}</p>}
      {error === 409 && onReload && <Button variant="outline" disabled={pending} onClick={onReload}>{t("pmReload")}</Button>}
      {(queryError != null || (draft.evidence && metadataSourceFailed(draft.evidence))) && <p role="alert" className="m-0 text-sm">{t("mmMetadataFailed")}</p>}
      {draft.metadataRefreshBlocked && <p role="alert" className="m-0 text-sm">{t("mmMetadataRefreshBound")}</p>}
      {errors.metadata && <p role="alert" className="m-0 text-sm">{t("pmEvidenceLimit")}</p>}
      {querying && <p role="status" className="m-0 text-sm">{t("loading")}</p>}
      {routingConflicts.length > 0 && <div role="alert" className="grid gap-2 text-sm"><p>{t("mmRoutingReconcile")}: {routingConflicts.map((field) => t(field === "tags" ? "mmTags" : "mmPriority")).join(", ")}</p><Button variant="outline" onClick={() => { const next = { ...draft }; for (const field of routingConflicts) next[field] = currentRouting![field]; change(next); }}>{t("mmRoutingUseCurrent")}</Button></div>}
      <section className="grid gap-3"><h3 className="m-0 text-sm font-semibold">{t("mmBasic")}</h3>
        {connectionLabel && <p className="m-0 text-sm">{t("mmSupplier")}: {connectionLabel}</p>}
        <label className="grid gap-1 text-sm">{t("mmUpstreamId")}<input className={controlClass} readOnly value={identity} /></label>
        {errors.identity && <p role="alert" className="m-0 text-sm">{t(errors.identity as Parameters<Translate>[0])}</p>}
        <p className="m-0 text-xs text-ink-muted">{t("mmIdentityNote")}</p>
        {canonicalId && <details><summary className="min-h-11 cursor-pointer text-sm">{t("pmAdvanced")}</summary><p className="break-all text-xs">{t("mmCanonicalId")}: {canonicalId}</p></details>}
        <label className="grid gap-1 text-sm">{t("mmDisplayName")}<input className={controlClass} value={draft.displayName ?? ""} onChange={(event) => change({ ...draft, displayName: event.target.value })} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled ?? true} onChange={(event) => change({ ...draft, enabled: event.target.checked })} />{t("mmEnabled")}</label>
        {routingOverlayFields.length > 0 && <p className="m-0 text-xs text-ink-muted">{t(routingOwnershipUnknown ? "mmRoutingOwnershipUnknown" : "mmRoutingOwnership")}: {routingOverlayFields.map((field) => t(field === "tags" ? "mmTags" : "mmPriority")).join(", ")}</p>}
        <label className="grid gap-1 text-sm">{t("mmTags")}<input className={controlClass} readOnly={routingOverlayFields.includes("tags")} value={draft.tags ?? ""} onChange={(event) => change({ ...draft, tags: event.target.value })} /></label>
        {(["priority", "quality"] as const).map((field) => <label key={field} className="grid gap-1 text-sm">{t(field === "priority" ? "mmPriority" : "mmQuality")}<input className={controlClass} readOnly={field === "priority" && routingOverlayFields.includes("priority")} type="number" step={field === "priority" ? 1 : "any"} value={draft[field] ?? (field === "priority" ? "100" : "0.5")} aria-invalid={!!errors[field]} onChange={(event) => change({ ...draft, [field]: event.target.value })} />{errors[field] && <span role="alert">{t(errors[field] as Parameters<Translate>[0])}</span>}</label>)}
        {draft.originalQuality !== undefined && Number.isFinite(draft.originalQuality) && (draft.originalQuality < 0 || draft.originalQuality > 1) && <p className="m-0 text-xs text-ink-muted">{t("mmLegacyQuality")}</p>}
      </section>
      <section className="grid gap-3"><h3 className="m-0 text-sm font-semibold">{t("mmParameters")}</h3><p className="m-0 text-xs text-ink-muted">{t("mmPriceUnits")}</p><ModelFields draft={draft} prefix="model-dialog" t={t} states={states} errors={errors} onChange={(field, value) => change({ ...draft, values: { ...draft.values, [field]: value }, touched: { ...draft.touched, [field]: true } })} /></section>
      <div className="flex flex-wrap gap-2">{onRefresh && <Button variant="outline" disabled={pending || querying || readOnly} onClick={onRefresh}>{t("pmMetadataRefresh")}</Button>}<Button variant="outline" disabled={!differences.length || pending || querying} onClick={() => { setRestore(true); setRestoreFields([]); }}>{t("mmRestore")}</Button></div>
      {restore && <section className="grid gap-2" aria-label={t("mmRestore")}><p className="m-0 text-sm">{t("mmRestoreNote")}</p>{differences.map(({ field, before, after }) => <label key={field} className="flex min-h-11 items-center gap-2 break-all text-sm"><input type="checkbox" checked={restoreFields.includes(field)} onChange={(event) => setRestoreFields((previous) => event.target.checked ? [...previous, field] : previous.filter((value) => value !== field))} />{t(modelFieldLabels[field])}: {before} → {after} ({t("mmRestoreSourceOwnership")})</label>)}<Button disabled={!restoreFields.length} onClick={() => { const next = { ...draft, values: { ...draft.values }, touched: { ...draft.touched } }; for (const difference of differences) if (restoreFields.includes(difference.field)) { next.values[difference.field] = difference.after; delete next.touched[difference.field]; } change(next); setRestore(false); }}>{t("mmRestoreApply")}</Button></section>}
      <details><summary className="min-h-11 cursor-pointer text-sm">{t("pmSources")}</summary><p className="text-xs text-ink-muted">{t("mmLegacyNote")}</p><pre data-current-evidence className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(draft.evidence ?? draft.currentMetadata ?? { sources: [] }, null, 2)}</pre><details><summary className="min-h-11 cursor-pointer text-sm">{t("pmEvidenceHistory")}</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(draft.metadataHistory ?? draft.metadata ?? { sources: draft.sources }, null, 2)}</pre></details></details>
    </fieldset>
  </Dialog>;
}
