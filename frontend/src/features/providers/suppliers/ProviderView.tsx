import { useLayoutEffect, useRef, useState } from "react";
import { useUnsavedChanges } from "@/shared/navigation/useUnsavedChanges";
import { useWorkspaceFrames } from "@/shared/navigation/useWorkspaceFrames";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import type {
  ProviderKind,
  ProviderPreset,
  ProviderProfile,
  ProviderSelector,
} from "@/shared/api/types";
import type { ProviderManagement } from "../shared/useProviderManagement";
import { profileForWrite, searchProfiles } from "../shared/profiles";
import { newSupplierIdentity, transportReference } from "./supplierIdentity";
import { TransportCredentialFields } from "./TransportCredentialFields";
import { submittedCredentialDraft, transportActions, transportFields, validTransportValue, type TransportDraft } from "./transportCredentials";
import { useSupplierConnection } from "./useSupplierConnection";
import { controlClass } from "../shared/constants";
import { ProviderIconPicker } from "./ProviderIconPicker";
import { ProviderIdentity } from "../shared/ProviderIdentity";
import { AssetCredits } from "../shared/AssetCredits";
import { ProviderSetupFields } from "./ProviderSetupFields";
import { initialSetupValues, missingSetupFields, setupForWrite } from "./setup";
import { sameParameterReferences } from "./setupProjection";
import { ModelManagementView } from "../models/ModelManagementView";

type Translate = ReturnType<typeof useLocale>["t"];
type Props = { manager: ProviderManagement; t: Translate };
type Editor = {
  original: ProviderProfile | null;
  draft: ProviderProfile;
  generatedReference: string;
  preset: ProviderPreset | null;
  setup: Record<string, string>;
  advancedReferences: Record<string, boolean>;
};

export function ProviderView({ manager, t }: Props) {
  const connection = useSupplierConnection(manager.onUnauthorized, manager.configurationGeneration);
  const [kind, setKind] = useState<ProviderKind>("llm");
  const [search, setSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [credentialAction, setCredentialAction] = useState<
    "keep" | "set" | "clear"
  >("keep");
  const [secret, setSecret] = useState("");
  const [transportDrafts, setTransportDrafts] = useState<Record<string, TransportDraft>>({});
  const [authMethod, setAuthMethod] = useState<"server" | "direct">("server");
  const [notice, setNotice] = useState(false);
  const root = useRef<HTMLElement | null>(null);
  const scheduleFrame = useWorkspaceFrames(manager.active);
  const focusOwner = useRef({ generation: 0, focus: 0, frame: 0 });
  useLayoutEffect(() => {
    const ownership = focusOwner.current;
    const moved = () => { ++ownership.focus; };
    document.addEventListener("focusin", moved, true);
    return () => {
      ++ownership.generation;
      window.cancelAnimationFrame(ownership.frame);
      document.removeEventListener("focusin", moved, true);
    };
  }, []);
  const scheduleFocus = (target: () => HTMLElement | null | undefined) => {
    const ownership = focusOwner.current;
    window.cancelAnimationFrame(ownership.frame);
    const generation = ++ownership.generation;
    const focus = ownership.focus;
    ownership.frame = scheduleFrame(() => {
      if (generation === ownership.generation && focus === ownership.focus) target()?.focus();
    });
  };
  const [baseline, setBaseline] = useState("");
  const returnTrigger = useRef<{ kind: ProviderKind; id: string } | null>(null);
  const [compatibleReference, setCompatibleReference] = useState(false);
  const semanticState = (draft: ProviderProfile, setup: Record<string, string>, auth: string, action: string, value: string, transport: Record<string, TransportDraft>) => JSON.stringify({ draft, setup, auth, action: action === "set" && !value ? "keep" : action, value, transport: Object.fromEntries(Object.entries(transport).filter(([, item]) => item.action === "clear" || (item.action === "set" && item.value))) });
  const dirty = !!editor && semanticState(editor.draft, editor.setup, authMethod, credentialAction, secret, transportDrafts) !== baseline;
  const { navigationGuardRef } = manager;
  const config = manager.configuration;
  const disabled = manager.pending || !config?.write_available;
  const operationError = manager.errorOwner === "read" || manager.errorOwner === "provider" ? manager.error : null;
  const refreshFailed = manager.catalogRefreshFailed && manager.catalogRefreshOwner === "provider";
  const profiles =
    kind === "llm"
      ? (config?.providers ?? [])
      : (config?.decision.providers ?? []);
  const presets = (config?.presets ?? []).filter(
    (preset) =>
      (preset.kind ?? (preset.protocol ? "decision" : "llm")) === kind,
  );
  const options =
    kind === "llm"
      ? (config?.provider_types ?? [])
      : (config?.decision_protocols ?? []);

  const discard = () => {
    setEditor(null);
    setSecret("");
    setCredentialAction("keep");
    setTransportDrafts({});
    setAuthMethod("server");
    setBrowsing(false);
    connection.reset();
    manager.cancelQuery();
    const trigger = returnTrigger.current;
    scheduleFocus(() =>
      Array.from(root.current?.querySelectorAll<HTMLButtonElement>("[data-provider-edit]") ?? []).find((button) => button.dataset.providerEdit === trigger?.id && button.dataset.providerKind === trigger?.kind) ?? root.current?.querySelector<HTMLButtonElement>("[data-provider-add]"),
    );
  };
  useUnsavedChanges(navigationGuardRef, dirty, discard, t("pmDiscard"), manager.pending || connection.pending);
  const leave = () => {
    if (manager.pending || connection.pending) return false;
    if (navigationGuardRef.current?.() === false) return false;
    discard();
    return true;
  };
  const openEditor = (
    profile: ProviderProfile | null,
    preset?: ProviderPreset,
  ) => {
    if (!leave()) return;
    const identity = newSupplierIdentity(preset?.id ?? (kind === "llm" ? "supplier" : "decision"), [ ...(config?.providers ?? []), ...(config?.decision.providers ?? []) ], config?.gateway.api_key_env);
    const draft = profile
      ? { ...profile }
      : {
          id: identity.id,
          display_name: preset?.display_name ?? "",
          brand_id: preset?.brand_id ?? "",
          icon_id: preset?.icon_id ?? null,
          api_base: preset ? preset.api_base : "",
          api_key_env: preset && ["vertex_ai", "bedrock", "ollama_chat", "lm_studio"].includes(preset.type ?? "") && !preset.api_key_env ? null : identity.api_key_env,
          ...(kind === "llm"
            ? {
                type: preset?.type ?? options[0] ?? "",
                allow_private_network: preset?.allow_private_network === true,
              }
            : {
                protocol: preset?.protocol ?? options[0] ?? "",
                model: preset?.model ?? "",
              }),
        };
    const selectedPreset = profile ? presets.find((item) => kind === "llm" ? item.type === profile.type : item.protocol === profile.protocol) ?? null : preset ?? null;
    const setup = initialSetupValues(selectedPreset ?? undefined);
    for (const field of selectedPreset?.setup_fields ?? []) {
      const value = profile ? (field.target === "params" ? profile.params : profile.param_env)?.[field.key] : undefined;
      setup[field.key] = profile ? value === "[configured]" ? "" : String(value ?? "") : field.target === "param_env" ? "" : setup[field.key] ?? "";
    }
    if (!profile && selectedPreset?.type === "vertex_ai") setup.vertex_project = "";
    const initialAuth = transportFields(selectedPreset).some((field) => !!profile?.param_env?.[field.key]) ? "direct" : "server";
    returnTrigger.current = profile ? { kind, id: profile.id } : null;
    setBaseline(semanticState(draft, setup, initialAuth, "keep", "", {}));
    setCompatibleReference(false);
    setAuthMethod(initialAuth);
    setTransportDrafts({});
    setEditor({
      original: profile,
      draft,
      generatedReference: identity.api_key_env,
      preset: selectedPreset,
      setup,
      advancedReferences: {},
    });
    setNotice(false);
    scheduleFocus(() => root.current?.querySelector<HTMLSelectElement>("form select"));
  };
  const change = (
    field: keyof ProviderProfile,
    value: string | boolean | null,
  ) => {
    connection.reset();
    if (field === "api_key_env") setCompatibleReference(true);
    if (field === "type") { setTransportDrafts({}); setAuthMethod("server"); }
    const platformTransport = field === "type" && typeof value === "string" && ["vertex_ai", "bedrock"].includes(value) && !editor?.original?.api_key_env;
    if (platformTransport) { setSecret(""); setCredentialAction("keep"); }
    setEditor((previous) =>
      previous
        ? {
            ...previous,
            draft: { ...previous.draft, [field]: value, ...(platformTransport ? { api_key_env: null } : {}) },
          }
        : previous,
    );
    setNotice(false);
  };
  const changeCredential = (action: typeof credentialAction, value: string) => {
    connection.reset();
    setCredentialAction(action);
    setSecret(value);
    setEditor((previous) =>
      previous ? { ...previous, draft: { ...previous.draft, api_key_env: action === "set" && !previous.draft.api_key_env?.trim() ? previous.generatedReference : previous.draft.api_key_env } } : previous,
    );
    manager.cancelQuery();
    setNotice(false);
  };
  const changeSetup = (key: string, value: string) => {
    connection.reset();
    manager.cancelQuery();
    if (transportFields(template).some((field) => field.key === key) && value.trim()) setAuthMethod("direct");
    setEditor((previous) =>
      previous
        ? {
            ...previous,
            setup: { ...previous.setup, [key]: value },
            advancedReferences: { ...previous.advancedReferences, [key]: template?.setup_fields?.some((field) => field.key === key && field.target === "param_env") === true },
          }
        : previous,
    );
    setNotice(false);
  };
  const credential =
    credentialAction === "set" && secret
      ? { action: "set" as const, value: secret }
      : { action: credentialAction === "clear" ? "clear" as const : "keep" as const };
  const template =
    editor?.preset &&
    (kind === "llm"
      ? editor.preset.type === editor.draft.type
      : editor.preset.protocol === editor.draft.protocol)
      ? editor.preset
      : presets.find((preset) => kind === "llm" ? preset.type === editor?.draft.type : preset.protocol === editor?.draft.protocol) ?? null;
  const platformCredential = kind === "llm" && ["vertex_ai", "bedrock"].includes(editor?.draft.type ?? "") && !editor?.original?.api_key_env;
  const opened = baseline ? JSON.parse(baseline) as { setup: Record<string, string>; auth: string } : null;
  const paramsDirty = !!editor && !!opened && (template?.setup_fields?.some((field) => field.target === "params" && editor.setup[field.key] !== opened.setup[field.key]) === true || (opened.auth !== authMethod && authMethod === "server"));
  const incompleteSetup =
    !!editor &&
    (missingSetupFields(editor.original && editor.draft.type === editor.original.type && editor.draft.protocol === editor.original.protocol && !paramsDirty && template ? { ...template, setup_fields: template.setup_fields?.filter((field) => field.target !== "params") } : template, editor.setup) ||
      (template?.api_base === "" && !editor.draft.api_base?.trim()));
  const cloudFields = transportFields(template);
  const requiredCloudKeys = template?.type === "bedrock" ? ["aws_access_key_id", "aws_secret_access_key"] : template?.type === "vertex_ai" ? ["vertex_credentials"] : [];
  const directIncomplete = authMethod === "direct" && requiredCloudKeys.some((key) => {
    const draft = transportDrafts[key];
    if (draft?.action === "clear") return true;
    if (draft?.action === "set" && draft.value) return !validTransportValue(key, draft.value);
    if (!editor?.setup[key]?.trim()) return true;
    const original = editor.original;
    if (!original || editor.setup[key] !== original.param_env?.[key]) return !editor.advancedReferences[key];
    return original.transport_credential_presence?.[key] === false;
  });
  const deliberateClear = !!editor?.original && Object.values(transportDrafts).some((draft) => draft.action === "clear");
  const transportInvalid = authMethod === "direct" && Object.entries(transportDrafts).some(([key, draft]) => draft.action === "set" && !!draft.value && !validTransportValue(key, draft.value));
  const transportCredentials = authMethod === "direct" && !transportInvalid ? transportActions(transportDrafts) : undefined;
  const writableProfile = editor
    ? {
        ...profileForWrite(editor.draft, kind),
        ...setupForWrite(template ? { ...template, params: Object.fromEntries(Object.entries(editor.draft.params ?? template.params ?? {}).filter(([, value]) => value !== "[configured]")), param_env: editor.draft.param_env ?? template.param_env } : null, editor.setup),
      }
    : null;
  if (writableProfile && cloudFields.length && authMethod === "server") {
    writableProfile.param_env = { ...writableProfile.param_env };
    for (const field of cloudFields) delete writableProfile.param_env[field.key];
  }
  if (writableProfile && editor && (template || editor.original)) {
    // An empty projection must still declare removals of optional references.
    const references = writableProfile.param_env ?? (template ? {} : { ...editor.draft.param_env });
    const originalReferences = editor.original?.param_env ?? {};
    if (editor.original && editor.draft.type !== editor.original.type) {
      const originalTemplate = presets.find((preset) => preset.type === editor.original?.type);
      for (const field of transportFields(originalTemplate ?? null)) delete references[field.key];
    }
    const unchanged = sameParameterReferences(references, originalReferences);
    if (editor.original && unchanged && !Object.keys(transportCredentials ?? {}).length) delete writableProfile.param_env;
    else if (editor.original || Object.keys(references).length) writableProfile.param_env = references;
  }
  if (writableProfile?.params) for (const field of cloudFields) delete writableProfile.params[field.key];
  if (writableProfile && editor && !editor.original && !compatibleReference && ["ollama_chat", "lm_studio"].includes(editor.draft.type ?? "") && credential.action !== "set") writableProfile.api_key_env = null;
  if (writableProfile && editor?.original && !paramsDirty && editor.draft.type === editor.original.type && editor.draft.protocol === editor.original.protocol) delete writableProfile.params;
  const changeTransport = (key: string, draft: TransportDraft) => {
    connection.reset();
    manager.cancelQuery();
    setTransportDrafts((previous) => ({ ...previous, [key]: draft }));
    setEditor((previous) => {
      if (!previous) return previous;
      const reserved = [config?.gateway.api_key_env, ...[...(config?.providers ?? []), ...(config?.decision.providers ?? [])].flatMap((profile) => [profile.api_key_env, ...Object.values(profile.param_env ?? {})]), previous.draft.api_key_env, ...Object.values(previous.setup)].filter((value): value is string => !!value);
      const reference = previous.setup[key] || (draft.action === "clear" || (draft.action === "set" && draft.value) ? transportReference(previous.draft.id, key, reserved) : "");
      return { ...previous, setup: { ...previous.setup, [key]: reference } };
    });
    setNotice(false);
  };
  const identityConflict = !!editor && !editor.original && [...(config?.providers ?? []), ...(config?.decision.providers ?? [])].some((profile) => profile.id === editor.draft.id);
  const missingNewCredential = !!editor && !editor.original && !platformCredential && !["ollama_chat", "lm_studio"].includes(editor.draft.type ?? "") && credential.action !== "set" && !compatibleReference;
  const save = async (form: HTMLFormElement) => {
    if (!editor || !writableProfile || disabled || connection.pending || incompleteSetup || identityConflict) return;
    // Native editing can precede React's last rendered draft. Capture before clearing.
    const submittedSecret = form.querySelector<HTMLInputElement>("[data-primary-secret]")?.value ?? "";
    const primaryAction = form.querySelector<HTMLSelectElement>("[data-primary-action]")?.value ?? "keep";
    const primaryDraft = submittedCredentialDraft(primaryAction, submittedSecret);
    const submittedCredential = primaryDraft.action === "set" ? { action: "set" as const, value: primaryDraft.value } : { action: primaryDraft.action };
    const submittedTransport = Object.fromEntries(cloudFields.map((field) => {
      const action = form.querySelector<HTMLSelectElement>(`[data-transport-action="${field.key}"]`)?.value;
      const value = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#secret-${field.key}`)?.value ?? "";
      return [field.key, submittedCredentialDraft(action, value)] as const;
    }).filter(([key, draft]) => key in transportDrafts || draft.action !== "keep"));
    if (Object.entries(submittedTransport).some(([key, draft]) => draft.action === "set" && !validTransportValue(key, draft.value))) return;
    if (!editor.original && !platformCredential && !["ollama_chat", "lm_studio"].includes(editor.draft.type ?? "") && submittedCredential.action !== "set" && !compatibleReference) return;
    const submittedClear = !!editor.original && Object.values(submittedTransport).some((draft) => draft.action === "clear");
    const submittedIncomplete = authMethod === "direct" && requiredCloudKeys.some((key) => {
      const draft = submittedTransport[key];
      if (draft?.action === "clear") return true;
      if (draft?.action === "set") return !validTransportValue(key, draft.value);
      const reference = editor.setup[key]?.trim();
      if (!reference) return true;
      if (!editor.original || reference !== editor.original.param_env?.[key]) return !editor.advancedReferences[key];
      return editor.original.transport_credential_presence?.[key] === false;
    });
    if (submittedIncomplete && !submittedClear) return;
    const submittedProfile = { ...writableProfile, ...(!editor.original && !compatibleReference && ["ollama_chat", "lm_studio"].includes(editor.draft.type ?? "") ? { api_key_env: submittedCredential.action === "set" ? editor.generatedReference : null } : {}) };
    const submittedActions = authMethod === "direct" ? transportActions(submittedTransport) : undefined;
    setSecret("");
    setTransportDrafts(Object.fromEntries(Object.entries(submittedTransport).map(([key, draft]) => [key, { ...draft, value: "" }])));
    connection.reset();
    const success = await manager.save([
      kind === "llm"
        ? { action: "upsert", kind: "llm", provider: submittedProfile, credential: submittedCredential, ...(submittedActions && Object.keys(submittedActions).length ? { transport_credentials: submittedActions } : {}) }
        : { action: "upsert", kind: "decision", provider: submittedProfile, credential: submittedCredential },
    ]);
    if (success) {
      setSecret("");
      setCredentialAction("keep");
      setTransportDrafts({});
      setEditor(null);
      connection.reset();
      manager.cancelQuery();
      setNotice(true);
      requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("[data-provider-add]")?.focus());
    } else {
      setSecret(submittedSecret);
      setCredentialAction(submittedCredential.action);
      setTransportDrafts(submittedTransport);
    }
  };
  const errorText = (status: number) =>
    t(
      status === 409
        ? "pmConflict"
        : status === 401
          ? "authRequired"
          : status === 403
            ? "pmForbidden"
            : status === 400 ? "spRejected" : "pmError",
    );
  const field = (
    name: keyof ProviderProfile,
    label: keyof typeof import("@/shared/i18n/en").en,
    required = false,
    locked = false,
    disabledField = false,
  ) => (
    <label className="grid min-w-0 gap-1 text-sm" key={name}>
      <span>{t(label)}</span>
      <input
        className={controlClass}
        name={name}
        required={required}
        readOnly={locked}
        disabled={disabledField}
        value={String(editor?.draft[name] ?? "")}
        autoComplete="off"
        onChange={(event) => change(name, event.target.value)}
      />
    </label>
  );
  const candidateSelector: ProviderSelector | null = writableProfile
    ? { provider: writableProfile, credential, ...(kind === "llm" && transportCredentials && Object.keys(transportCredentials).length ? { transport_credentials: transportCredentials } : {}) }
    : null;

  return (
    <section
      ref={root}
      className="mx-auto grid w-full min-w-0 max-w-3xl gap-4 text-ink"
      aria-label={t("spConnections")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !manager.pending && !(event.target instanceof Element && event.target.closest("dialog"))) {
          event.preventDefault();
          leave();
        }
      }}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-outline pb-3">
        <h2 className="m-0 mr-auto text-sm font-semibold">
          {t("spConnections")}
        </h2>
        {(["llm", "decision"] as const).map((target) => (
          <Button
            className="min-h-11 aria-pressed:border-primary aria-pressed:bg-panel-muted aria-pressed:text-ink"
            key={target}
            variant="outline"
            aria-pressed={kind === target}
            disabled={manager.pending}
            onClick={() => {
              if (target !== kind && leave()) {
                setKind(target);
                setSearch("");
                setSupplierSearch("");
              }
            }}
          >
            {t(target === "llm" ? "pmLLM" : "pmDecision")}
          </Button>
        ))}
      </div>
      {manager.loading && (
        <p role="status" className="m-0 text-sm text-ink-muted">
          {t("loading")}
        </p>
      )}
      {operationError !== null && (
        <div role="alert" className="grid min-w-0 gap-2 text-sm text-ink-muted">
          <span>{errorText(operationError)}</span>
          <Button
            className="min-h-11 justify-self-start"
            variant="outline"
            disabled={manager.pending}
            onClick={() => void manager.load()}
          >
            {t("pmReload")}
          </Button>
        </div>
      )}
      {config && !config.write_available && (
        <p role="status" className="m-0 text-sm text-ink-muted">
          {t("pmReadOnly")}
        </p>
      )}
      {notice && (
        <p role="status" className="m-0 text-sm text-ink-muted">
          {t(refreshFailed ? "pmSaveRefreshFailed" : "pmSaved")}
        </p>
      )}
      {refreshFailed && (
        <div role="alert" className="grid gap-2 text-sm text-ink-muted">
          <span>{t("pmRefreshFailed")}</span>
          <Button
            className="min-h-11 justify-self-start"
            variant="outline"
            disabled={manager.pending || manager.refreshingCatalog}
            onClick={() => void manager.retryCatalogRefresh()}
          >
            {t("pmRetryCatalog")}
          </Button>
        </div>
      )}
      {editor ? (
        <>
          <form
            className="grid min-w-0 gap-4"
            aria-busy={manager.pending || connection.pending}
            onSubmit={(event) => {
              event.preventDefault();
              void save(event.currentTarget);
            }}
          >
            <fieldset
              disabled={manager.pending || connection.pending}
              className="m-0 grid min-w-0 gap-4 border-0 p-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="m-0 mr-auto text-sm font-semibold">
                  {t(editor.original ? "pmEdit" : "pmAdd")}
                </h3>
                <Button
                  type="button"
                  className="min-h-11"
                  variant="ghost"
                  disabled={manager.pending}
                  onClick={leave}
                >
                  {t("pmCancel")}
                </Button>
              </div>
              <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1 text-sm">
                  <span>{t(kind === "llm" ? "pmType" : "pmProtocol")}</span>
                  <select
                    className={controlClass}
                    required
                    value={
                      kind === "llm" ? editor.draft.type : editor.draft.protocol
                    }
                    onChange={(event) =>
                      change(
                        kind === "llm" ? "type" : "protocol",
                        event.target.value,
                      )
                    }
                  >
                    <option value="">{t("pmUnknown")}</option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option === "system_one" ? "System One" : option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="sm:row-start-2">{field("display_name", "pmName", true)}</div>
                <div className="grid min-w-0 content-start gap-1 sm:col-start-2 sm:row-start-1">
                  {field(
                    "api_base",
                    "pmEndpoint",
                    true,
                    false,
                    kind === "llm" && editor.draft.api_base === null,
                  )}
                  {kind === "llm" && (
                    <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
                      <input
                        type="checkbox"
                        disabled={template?.api_base === ""}
                        checked={editor.draft.api_base === null}
                        onChange={(event) =>
                          change("api_base", event.target.checked ? null : "")
                        }
                      />
                      {t("pmNativeEndpoint")}
                    </label>
                  )}
                </div>
                {kind === "decision" && (
                  <>
                    <p className="m-0 text-sm text-ink-muted sm:col-span-2">
                      {t("pmSystemURL")}
                    </p>
                    {field("model", "pmModel")}
                  </>
                )}
                {!platformCredential && <label className="grid min-w-0 gap-1 text-sm">
                  <span>{t("pmCredential")}</span>
                  <select
                    data-primary-action
                    className={controlClass}
                    value={credentialAction}
                    onChange={(event) =>
                      changeCredential(
                        event.target.value as typeof credentialAction,
                        "",
                      )
                    }
                  >
                    <option value="keep">{t("pmKeep")}</option>
                    <option value="set">{t("pmSet")}</option>
                    <option value="clear">{t("pmClear")}</option>
                  </select>
                </label>}
                {!platformCredential && credentialAction !== "clear" && (
                  <label className="grid min-w-0 gap-1 text-sm">
                    <span>{t("pmSecret")}</span>
                    <input
                      data-primary-secret
                      className={controlClass}
                      type="password"
                      value={secret}
                      placeholder={t("spKeepBlank")}
                      autoComplete="new-password"
                      onInput={(event) => changeCredential(event.currentTarget.value ? "set" : "keep", event.currentTarget.value)}
                      onChange={(event) =>
                        changeCredential(event.target.value ? "set" : "keep", event.target.value)
                      }
                    />
                  </label>
                )}
                <p className="m-0 text-xs text-ink-muted sm:col-span-2">
                  {t(platformCredential ? "spPlatformCredentials" : "pmSecretNote")}
                </p>
                {credentialAction === "clear" && <p role="status" className="m-0 text-sm text-ink-muted sm:col-span-2">{t("spClearNote")}</p>}
                {editor.original && (
                  <p className="m-0 text-xs text-ink-muted sm:col-span-2">
                    {t(
                      editor.original.has_api_key
                        ? "pmCredentialConfigured"
                        : "pmCredentialMissing",
                    )}
                  </p>
                )}
              </div>
              {!!cloudFields.length && template && <>
                <label className="grid min-w-0 gap-1 text-sm"><span>{t("spAuthMethod")}</span>
                  <select className={controlClass} value={authMethod} onChange={(event) => { connection.reset(); manager.cancelQuery(); setAuthMethod(event.target.value as typeof authMethod); }}>
                    <option value="server">{t("spServerAuth")}</option><option value="direct">{t("spDirectAuth")}</option>
                  </select>
                </label>
                <p className="m-0 text-xs text-ink-muted">{t(authMethod === "server" ? "spServerAuthNote" : "pmSecretNote")}</p>
                {authMethod === "direct" && <TransportCredentialFields preset={template} profile={editor.original ?? editor.draft} drafts={transportDrafts} onChange={changeTransport} />}
                {directIncomplete && <p role="status" className="m-0 text-sm text-ink-muted">{t(template.type === "bedrock" ? "spAWSPair" : "spVertexRequired")}</p>}
              </>}
              {template && (
                <ProviderSetupFields
                  preset={template}
                  values={editor.setup}
                  onChange={changeSetup}
                  preserveRequired={!!editor.original && !paramsDirty}
                />
              )}
              {editor.original && template?.setup_fields?.some((field) => field.target === "params") && <p className="m-0 text-xs text-ink-muted">{t("spAccountKeep")}</p>}
              {incompleteSetup && (
                <p className="m-0 text-sm text-ink-muted" role="status">
                  {t("pmSetupRequired")}
                </p>
              )}
              {identityConflict && <p role="alert" className="m-0 text-sm text-ink-muted">{t("spIdentityConflict")}</p>}
              {missingNewCredential && <p role="status" className="m-0 text-sm text-ink-muted">{t("pmCredentialMissing")}</p>}
              {manager.pending && <p role="status" className="m-0 text-sm text-ink-muted">{t("spSaving")}</p>}
              <details className="min-w-0 border-y border-outline py-3">
                <summary className="min-h-11 cursor-pointer text-sm font-medium">
                  {t("pmAdvanced")}
                </summary>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <p className="m-0 text-xs text-ink-muted sm:col-span-2">{t("spIdentityNote")}</p>
                  {field("id", "pmID", true, true)}
                  {field("api_key_env", "pmEnv", kind === "decision" || credentialAction === "set")}
                  <p className="m-0 text-xs text-ink-muted sm:col-span-2">{t("spReferenceNote")}</p>
                  {template && <div className="sm:col-span-2"><ProviderSetupFields preset={template} values={editor.setup} onChange={changeSetup} advanced /></div>}
                  {field("brand_id", "pmBrand")}
                  <p className="m-0 text-xs text-ink-muted sm:col-span-2">
                    {t("pmPreserved")}
                  </p>
                  {kind === "llm" && <div className="grid gap-1 sm:col-span-2">
                    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={editor.draft.allow_private_network === true} onChange={(event) => change("allow_private_network", event.target.checked)} />{t("pmPrivate")}</label>
                    <p className="m-0 text-xs text-ink-muted">{t("pmPrivateNote")}</p>
                  </div>}
                  <div className="sm:col-span-2"><ProviderIconPicker provider={editor.draft} t={t} disabled={disabled} onChange={(id) => change("icon_id", id)} /></div>
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  type="submit"
                  disabled={
                    disabled ||
                    missingNewCredential ||
                    identityConflict ||
                    connection.pending || transportInvalid ||
                    (directIncomplete && !deliberateClear) ||
                    incompleteSetup ||
                    !editor.draft.id.trim() ||
                    (!(kind === "llm" && editor.draft.api_base === null) &&
                      !editor.draft.api_base?.trim())
                  }
                >
                  {t("pmSave")}
                </Button>
                <Button
                  className="min-h-11"
                  type="button"
                  variant="outline"
                  disabled={manager.pending}
                  onClick={leave}
                >
                  {t("pmCancel")}
                </Button>
                  <Button
                    className="min-h-11"
                    type="button"
                    variant="ghost"
                    disabled={
                      connection.pending || manager.pending ||
                      missingNewCredential ||
                      incompleteSetup ||
                      transportInvalid ||
                      directIncomplete ||
                      !editor.draft.id.trim() ||
                      (editor.draft.api_base !== null &&
                        !editor.draft.api_base?.trim())
                    }
                    onClick={() => { if (candidateSelector) void connection.test(candidateSelector, kind); }}
                  >
                    {t(connection.pending ? "spTesting" : "spTest")}
                  </Button>
              </div>
              <p className="m-0 text-xs text-ink-muted">{t(kind === "llm" ? "spTestScope" : "spDecisionScope")}</p>
              {connection.result && <p role="status" className="m-0 text-sm text-ink-muted">{t(connection.statusKey!)}{connection.result.status === "success" && connection.result.model_count !== null && ` (${connection.result.model_count})`}</p>}
              {connection.error !== null && <p role="alert" className="m-0 text-sm text-ink-muted">{errorText(connection.error)} {t("spTestRetry")}</p>}
            </fieldset>
          </form>
        </>
      ) : browsing ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 mr-auto text-sm font-semibold">
              {t("pmSuppliers")}
            </h3>
            <Button className="min-h-11" variant="ghost" onClick={leave}>
              {t("pmCancel")}
            </Button>
          </div>
          <label className="grid min-w-0 gap-1 text-sm">
            <span>{t("pmSupplierSearch")}</span>
            <input
              className={controlClass}
              type="search"
              value={supplierSearch}
              onChange={(event) => setSupplierSearch(event.target.value)}
            />
          </label>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {searchProfiles(presets, supplierSearch).map((preset) => (
              <Button
                key={`${preset.kind}-${preset.id}`}
                className="h-auto min-h-16 min-w-0 justify-start whitespace-normal p-3 text-left"
                variant="outline"
                onClick={() => openEditor(null, preset)}
              >
                <ProviderIdentity provider={preset} t={t} />
                <span className="min-w-0 break-words">
                  {preset.display_name || preset.id}
                  <span className="block break-all text-xs text-ink-muted">
                    {preset.type || preset.protocol}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          {!searchProfiles(presets, supplierSearch).length && (
            <p className="m-0 text-sm text-ink-muted">{t("pmNoResults")}</p>
          )}
          <Button
            className="min-h-11 justify-self-start"
            variant="outline"
            onClick={() => openEditor(null)}
          >
            {t("pmCustom")}
          </Button>
          <AssetCredits />
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-1 text-sm">
              <span>{t("pmSearch")}</span>
              <input
                className={controlClass}
                type="search"
                value={search}
                disabled={manager.pending}
                onChange={(event) => {
                  const next = event.target.value;
                  const nextIDs = new Set(searchProfiles(profiles, next).map((profile) => profile.id));
                  const hidesGroup = searchProfiles(profiles, search).some((profile) => !nextIDs.has(profile.id));
                  if (hidesGroup && navigationGuardRef.current?.() === false) return;
                  setSearch(next);
                }}
              />
            </label>
            <Button
              data-provider-add
              className="min-h-11"
              disabled={disabled}
              onClick={() => {
                if (!leave()) return;
                setBrowsing(true);
                setSupplierSearch("");
              }}
            >
              {t("pmAdd")}
            </Button>
          </div>
          <div className="grid min-w-0 gap-2">
            {searchProfiles(profiles, search).map((profile) => (
              <section
                aria-label={profile.display_name || profile.id}
                data-supplier-id={profile.id}
                key={profile.id}
                className="grid min-w-0 gap-3 border-b border-outline pb-4"
              >
              <div
                className="flex min-w-0 flex-wrap items-center gap-3 border-b border-outline py-3"
              >
                <ProviderIdentity provider={profile} t={t} />
                <div className="min-w-0 flex-1">
                  <h3 className="m-0 break-words text-sm font-semibold">
                    {profile.display_name || profile.id}
                  </h3>
                  <p className="m-0 break-all font-mono text-xs text-ink-muted">
                    {profile.type || profile.protocol}
                  </p>
                  {kind === "llm" && <p className="m-0 text-xs text-ink-muted">{t("spModelCount")}: {config?.models.filter((model) => model.provider === profile.id).length ?? 0}</p>}
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <Button
                    data-provider-edit={profile.id}
                    data-provider-kind={kind}
                    className="min-h-11"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => openEditor(profile)}
                  >
                    {t("pmEdit")}
                  </Button>
                  <Button
                    className="min-h-11"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => {
                      if (!leave()) return;
                      if (window.confirm(t("pmDeleteConfirm")))
                        void manager.save([
                          { action: "delete", kind, id: profile.id },
                        ]);
                    }}
                  >
                    {t("pmDelete")}
                  </Button>
                </div>
              </div>
              {kind === "llm" && <ModelManagementView manager={manager} t={t} providerId={profile.id} embedded />}
              </section>
            ))}
          </div>
          {!profiles.length && (
            <p className="m-0 text-sm text-ink-muted">
              {t("noConfiguredProviders")}
            </p>
          )}
          {profiles.length > 0 && !searchProfiles(profiles, search).length && (
            <p className="m-0 text-sm text-ink-muted">{t("pmNoResults")}</p>
          )}
        </>
      )}
    </section>
  );
}
