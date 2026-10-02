import { useEffect, useRef, useState } from "react";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import type { ProviderKind, ProviderPreset, ProviderProfile, ProviderSelector } from "@/shared/api/types";
import type { ProviderManagement } from "./useProviderManagement";
import { profileForWrite, searchProfiles } from "./model";
import { controlClass, identityIcons } from "./constants";
import { ProviderIdentity } from "./ProviderIdentity";
import { ProviderModels } from "./ProviderModels";
import { AssetCredits } from "./AssetCredits";

type Translate = ReturnType<typeof useLocale>["t"];
type Props = { manager: ProviderManagement; t: Translate };
type Editor = { original: ProviderProfile | null; draft: ProviderProfile; dirty: boolean };
const iconLabels = { initials: "pmIconInitials", server: "pmIconServer", cloud: "pmIconCloud", circuit: "pmIconCircuit", globe: "pmIconGlobe" } as const;

export function ProviderView({ manager, t }: Props) {
  const [kind, setKind] = useState<ProviderKind>("llm");
  const [search, setSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [credentialAction, setCredentialAction] = useState<"keep" | "set" | "clear">("keep");
  const [secret, setSecret] = useState("");
  const [modelProvider, setModelProvider] = useState<ProviderProfile | null>(null);
  const [candidatePreview, setCandidatePreview] = useState(false);
  const [modelDirty, setModelDirty] = useState(false);
  const [notice, setNotice] = useState(false);
  const root = useRef<HTMLElement | null>(null);
  const { navigationGuardRef } = manager;
  useEffect(() => {
    navigationGuardRef.current = () => !(editor?.dirty || modelDirty) || window.confirm(t("pmDiscard"));
    return () => { navigationGuardRef.current = null; };
  }, [editor?.dirty, modelDirty, navigationGuardRef, t]);
  const config = manager.configuration;
  const disabled = manager.pending || !config?.write_available;
  const profiles = kind === "llm" ? config?.providers ?? [] : config?.decision.providers ?? [];
  const presets = (config?.presets ?? []).filter((preset) => (preset.kind ?? (preset.protocol ? "decision" : "llm")) === kind);
  const options = kind === "llm" ? config?.provider_types ?? [] : config?.decision_protocols ?? [];

  const leave = () => {
    if ((editor?.dirty || modelDirty) && !window.confirm(t("pmDiscard"))) return false;
    setEditor(null); setSecret(""); setCredentialAction("keep"); setBrowsing(false); setModelProvider(null); setCandidatePreview(false); manager.cancelQuery();
    setModelDirty(false);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("[data-provider-add]")?.focus());
    return true;
  };
  const openEditor = (profile: ProviderProfile | null, preset?: ProviderPreset) => {
    if (!leave()) return;
    const draft = profile ? { ...profile } : {
      id: "", display_name: preset?.display_name ?? "", brand_id: preset?.brand_id ?? "", icon_id: preset?.icon_id ?? null,
      api_base: preset ? preset.api_base : "", api_key_env: preset?.api_key_env ?? "",
      ...(kind === "llm" ? { type: preset?.type ?? options[0] ?? "", allow_private_network: false } : { protocol: preset?.protocol ?? options[0] ?? "", model: preset?.model ?? "" }),
    };
    setEditor({ original: profile, draft, dirty: false });
    setNotice(false);
  };
  const change = (field: keyof ProviderProfile, value: string | boolean | null) => {
    if (candidatePreview && modelDirty && !window.confirm(t("pmDiscard"))) return;
    setEditor((previous) => previous ? { ...previous, draft: { ...previous.draft, [field]: value }, dirty: true } : previous);
    if (candidatePreview) { manager.cancelQuery(); setCandidatePreview(false); setModelDirty(false); }
    setNotice(false);
  };
  const changeCredential = (action: typeof credentialAction, value: string) => {
    if (candidatePreview && modelDirty && !window.confirm(t("pmDiscard"))) return;
    setCredentialAction(action); setSecret(value);
    setEditor((previous) => previous ? { ...previous, dirty: true } : previous);
    manager.cancelQuery(); setCandidatePreview(false); setModelDirty(false); setNotice(false);
  };
  const credential = credentialAction === "set" ? { action: "set" as const, value: secret } : { action: credentialAction };
  const save = async () => {
    if (!editor || disabled) return;
    const success = await manager.save([{ action: "upsert", kind, provider: profileForWrite(editor.draft, kind), credential }]);
    setSecret("");
    if (success) {
      setCredentialAction("keep"); setEditor(null); setCandidatePreview(false);
      if (candidatePreview && kind === "llm") {
        setModelProvider({ ...editor.draft }); manager.cancelQuery(true);
      } else { manager.cancelQuery(); setModelDirty(false); }
      setNotice(true);
    }
  };
  const errorText = (status: number) => t(status === 409 ? "pmConflict" : status === 401 ? "authRequired" : status === 403 ? "pmForbidden" : "pmError");
  const field = (name: keyof ProviderProfile, label: keyof typeof import("@/shared/i18n/en").en, required = false, locked = false, disabledField = false) => <label className="grid min-w-0 gap-1 text-sm" key={name}><span>{t(label)}</span><input className={controlClass} name={name} required={required} readOnly={locked} disabled={disabledField} value={String(editor?.draft[name] ?? "")} autoComplete="off" onChange={(event) => change(name, event.target.value)} /></label>;
  const candidateSelector: ProviderSelector | null = editor ? { provider: profileForWrite(editor.draft, kind), credential } : null;

  return <section ref={root} className="mx-auto grid w-full min-w-0 max-w-3xl gap-4 text-ink" aria-label={t("providerModels")} onKeyDown={(event) => { if (event.key === "Escape" && !manager.pending) { event.preventDefault(); leave(); } }}>
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-outline pb-3">
      <h2 className="m-0 mr-auto shrink-0 text-sm font-semibold">{t("providerModels")}</h2>
      {(["llm", "decision"] as const).map((target) => <Button className="min-h-11 aria-pressed:border-primary aria-pressed:bg-panel-muted aria-pressed:text-primary" key={target} variant="outline" aria-pressed={kind === target} disabled={manager.pending} onClick={() => { if (target !== kind && leave()) { setKind(target); setSearch(""); setSupplierSearch(""); } }}>{t(target === "llm" ? "pmLLM" : "pmDecision")}</Button>)}
    </div>
    {manager.loading && <p role="status" className="m-0 text-sm text-ink-muted">{t("loading")}</p>}
    {manager.error !== null && <div role="alert" className="grid min-w-0 gap-2 text-sm text-ink-muted"><span>{errorText(manager.error)}</span><Button className="min-h-11 justify-self-start" variant="outline" disabled={manager.pending} onClick={() => void manager.load()}>{t("pmReload")}</Button></div>}
    {config && !config.write_available && <p role="status" className="m-0 text-sm text-ink-muted">{t("pmReadOnly")}</p>}
    {notice && <p role="status" className="m-0 text-sm text-ink-muted">{t(manager.catalogRefreshFailed ? "pmSaveRefreshFailed" : "pmSaved")}</p>}
    {manager.catalogRefreshFailed && <div role="alert" className="grid gap-2 text-sm text-ink-muted"><span>{t("pmRefreshFailed")}</span><Button className="min-h-11 justify-self-start" variant="outline" disabled={manager.pending || manager.refreshingCatalog} onClick={() => void manager.retryCatalogRefresh()}>{t("pmRetryCatalog")}</Button></div>}
    {editor ? <><form className="grid min-w-0 gap-4" aria-busy={manager.pending} onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={manager.pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <div className="flex flex-wrap items-center gap-2"><h3 className="m-0 mr-auto text-sm font-semibold">{t(editor.original ? "pmEdit" : "pmAdd")}</h3><Button type="button" className="min-h-11" variant="ghost" disabled={manager.pending} onClick={leave}>{t("pmCancel")}</Button></div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {field("id", "pmID", true, editor.original !== null)}{field("display_name", "pmName")}
        <p className="m-0 text-xs text-ink-muted sm:col-span-2">{t("pmImmutable")}</p>
        <label className="grid min-w-0 gap-1 text-sm"><span>{t(kind === "llm" ? "pmType" : "pmProtocol")}</span><select className={controlClass} required value={kind === "llm" ? editor.draft.type : editor.draft.protocol} onChange={(event) => change(kind === "llm" ? "type" : "protocol", event.target.value)}><option value="">{t("pmUnknown")}</option>{options.map((option) => <option key={option} value={option}>{option === "system_one" ? "System One" : option}</option>)}</select></label>
        <div className="grid min-w-0 content-start gap-1">{field("api_base", "pmEndpoint", true, false, kind === "llm" && editor.draft.api_base === null)}{kind === "llm" && <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted"><input type="checkbox" checked={editor.draft.api_base === null} onChange={(event) => change("api_base", event.target.checked ? null : "")} />{t("pmNativeEndpoint")}</label>}</div>
        {kind === "decision" && <><p className="m-0 text-sm text-ink-muted sm:col-span-2">{t("pmSystemURL")}</p>{field("model", "pmModel")}</>}
        {field("api_key_env", "pmEnv", kind === "decision" || credentialAction === "set")}
        <label className="grid min-w-0 gap-1 text-sm"><span>{t("pmCredential")}</span><select className={controlClass} value={credentialAction} onChange={(event) => changeCredential(event.target.value as typeof credentialAction, "")}><option value="keep">{t("pmKeep")}</option><option value="set">{t("pmSet")}</option><option value="clear">{t("pmClear")}</option></select></label>
        {credentialAction === "set" && <label className="grid min-w-0 gap-1 text-sm"><span>{t("pmSecret")}</span><input className={controlClass} type="password" required value={secret} autoComplete="new-password" onChange={(event) => changeCredential("set", event.target.value)} /></label>}
        <p className="m-0 text-xs text-ink-muted sm:col-span-2">{t("pmSecretNote")}</p>
        {editor.original && <p className="m-0 text-xs text-ink-muted sm:col-span-2">{t(editor.original.has_api_key ? "pmCredentialConfigured" : "pmCredentialMissing")}</p>}
        {kind === "llm" && <div className="grid min-w-0 gap-1 sm:col-span-2"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={editor.draft.allow_private_network === true} onChange={(event) => change("allow_private_network", event.target.checked)} />{t("pmPrivate")}</label><p className="m-0 text-xs text-ink-muted">{t("pmPrivateNote")}</p></div>}
      </div>
      <details className="min-w-0 border-y border-outline py-3"><summary className="min-h-11 cursor-pointer text-sm font-medium">{t("pmAdvanced")}</summary><div className="grid min-w-0 gap-3 sm:grid-cols-2">{field("brand_id", "pmBrand")}<fieldset className="m-0 min-w-0 border-0 p-0"><legend className="mb-1 text-sm">{t("pmIcon")}</legend><div className="flex flex-wrap gap-2">{identityIcons.map((icon) => <Button className="min-h-11 aria-pressed:border-primary aria-pressed:bg-panel-muted aria-pressed:text-primary" type="button" variant="outline" key={icon} aria-pressed={(editor.draft.icon_id ?? "initials") === icon} onClick={() => change("icon_id", icon)}>{t(iconLabels[icon])}</Button>)}</div></fieldset><p className="m-0 text-xs text-ink-muted sm:col-span-2">{t("pmPreserved")}</p></div></details>
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={disabled || !editor.draft.id.trim() || (!(kind === "llm" && editor.draft.api_base === null) && !editor.draft.api_base?.trim()) || (credentialAction === "set" && !secret)}>{t("pmSave")}</Button><Button className="min-h-11" type="button" variant="outline" disabled={manager.pending} onClick={leave}>{t("pmCancel")}</Button>{kind === "llm" && <Button className="min-h-11" type="button" variant="ghost" disabled={disabled || !editor.draft.id.trim() || (editor.draft.api_base !== null && !editor.draft.api_base?.trim()) || (credentialAction === "set" && !secret)} onClick={() => { manager.cancelQuery(); setCandidatePreview(true); }}>{t("pmCandidate")}</Button>}</div>
      </fieldset>
    </form>{candidatePreview && candidateSelector && <ProviderModels key={editor.draft.id} providerId={editor.draft.id} selector={candidateSelector} manager={manager} t={t} onDirtyChange={setModelDirty} candidate />}</> : modelProvider ? <>
      <div className="flex min-w-0 flex-wrap items-center gap-3"><ProviderIdentity provider={modelProvider} t={t} /><h3 className="m-0 min-w-0 basis-36 flex-1 break-words text-sm font-semibold">{modelProvider.display_name || modelProvider.id}</h3><Button className="min-h-11" variant="outline" disabled={manager.pending} onClick={leave}>{t("pmBack")}</Button></div>
      <ProviderModels key={modelProvider.id} providerId={modelProvider.id} selector={{ provider_id: modelProvider.id }} manager={manager} t={t} onDirtyChange={setModelDirty} />
    </> : browsing ? <>
      <div className="flex flex-wrap items-center gap-2"><h3 className="m-0 mr-auto text-sm font-semibold">{t("pmSuppliers")}</h3><Button className="min-h-11" variant="ghost" onClick={leave}>{t("pmCancel")}</Button></div>
      <label className="grid min-w-0 gap-1 text-sm"><span>{t("pmSupplierSearch")}</span><input className={controlClass} type="search" value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} /></label>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">{searchProfiles(presets, supplierSearch).map((preset) => <Button key={`${preset.kind}-${preset.id}`} className="h-auto min-h-16 min-w-0 justify-start whitespace-normal p-3 text-left" variant="outline" onClick={() => openEditor(null, preset)}><ProviderIdentity provider={preset} t={t} /><span className="min-w-0 break-words">{preset.display_name || preset.id}<span className="block break-all text-xs text-ink-muted">{preset.type || preset.protocol}</span></span></Button>)}</div>
      {!searchProfiles(presets, supplierSearch).length && <p className="m-0 text-sm text-ink-muted">{t("pmNoResults")}</p>}
      <Button className="min-h-11 justify-self-start" variant="outline" onClick={() => openEditor(null)}>{t("pmCustom")}</Button>
      <AssetCredits />
    </> : <>
      <div className="flex min-w-0 flex-wrap items-end gap-2"><label className="grid min-w-0 flex-1 gap-1 text-sm"><span>{t("pmSearch")}</span><input className={controlClass} type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><Button data-provider-add className="min-h-11" disabled={disabled} onClick={() => { setBrowsing(true); setSupplierSearch(""); }}>{t("pmAdd")}</Button></div>
      <div className="grid min-w-0 gap-2">{searchProfiles(profiles, search).map((profile) => <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-outline py-3" key={profile.id}><ProviderIdentity provider={profile} t={t} /><div className="min-w-0 flex-1"><h3 className="m-0 break-words text-sm font-semibold">{profile.display_name || profile.id}</h3><p className="m-0 break-all font-mono text-xs text-ink-muted">{profile.id} · {profile.type || profile.protocol}</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button className="min-h-11" variant="outline" disabled={disabled} onClick={() => openEditor(profile)}>{t("pmEdit")}</Button>{kind === "llm" && <Button className="min-h-11" variant="outline" disabled={disabled} onClick={() => { manager.cancelQuery(); setModelProvider(profile); }}>{t("pmModels")}</Button>}<Button className="min-h-11" variant="ghost" disabled={disabled} onClick={() => { if (window.confirm(t("pmDeleteConfirm"))) void manager.save([{ action: "delete", kind, id: profile.id }]); }}>{t("pmDelete")}</Button></div></div>)}</div>
      {!profiles.length && <p className="m-0 text-sm text-ink-muted">{t("noConfiguredProviders")}</p>}
      {profiles.length > 0 && !searchProfiles(profiles, search).length && <p className="m-0 text-sm text-ink-muted">{t("pmNoResults")}</p>}
    </>}
  </section>;
}
