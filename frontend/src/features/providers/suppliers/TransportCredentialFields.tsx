import type { ProviderPreset, ProviderProfile } from "@/shared/api/types";
import { useLocale } from "@/shared/i18n";
import { controlClass } from "../shared/constants";
import { submittedCredentialDraft, transportFields, validTransportValue, type TransportDraft } from "./transportCredentials";

type Props = {
  preset: ProviderPreset;
  profile: ProviderProfile;
  drafts: Record<string, TransportDraft>;
  onChange: (key: string, draft: TransportDraft) => void;
};
export function TransportCredentialFields({ preset, profile, drafts, onChange }: Props) {
  const { t } = useLocale();
  return <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    {transportFields(preset).map((field) => {
      const draft = drafts[field.key] ?? { action: "keep", value: "" };
      const label = t(field.key === "vertex_credentials" ? "spVertexJSON" : field.key === "aws_access_key_id" ? "spAWSAccess" : field.key === "aws_secret_access_key" ? "spAWSSecret" : "spAWSToken");
      const invalid = draft.action === "set" && !!draft.value && !validTransportValue(field.key, draft.value);
      const presence = profile.transport_credential_presence?.[field.key];
      const errorId = `credential-error-${field.key}`;
      const changeValue = (value: string) => onChange(field.key, submittedCredentialDraft("keep", value));
      return <div className="grid min-w-0 content-start gap-2" key={field.key}>
        <label className="grid min-w-0 gap-1 text-sm"><span>{label} · {t("pmCredential")}</span>
          <select data-transport-action={field.key} className={controlClass} value={draft.action} onChange={(event) => onChange(field.key, { action: event.target.value as TransportDraft["action"], value: "" })}>
            <option value="keep">{t("pmKeep")}</option><option value="set">{t("pmSet")}</option><option value="clear">{t("pmClear")}</option>
          </select>
        </label>
        {draft.action !== "clear" && <div className="grid min-w-0 gap-1 text-sm"><label htmlFor={`secret-${field.key}`}>{label}</label>
          {field.key === "vertex_credentials" ? <textarea id={`secret-${field.key}`} className={`${controlClass} min-h-28 [-webkit-text-security:disc]`} name={field.key} value={draft.value} placeholder={t("spKeepBlank")} autoComplete="off" spellCheck={false} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} onInput={(event) => changeValue(event.currentTarget.value)} onChange={(event) => changeValue(event.target.value)} /> :
            <input id={`secret-${field.key}`} className={controlClass} name={field.key} type="password" value={draft.value} placeholder={t("spKeepBlank")} autoComplete="new-password" aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} onInput={(event) => changeValue(event.currentTarget.value)} onChange={(event) => changeValue(event.target.value)} />}
        </div>}
        {invalid && <p id={errorId} role="alert" className="m-0 text-xs text-ink-muted">{t(field.key === "vertex_credentials" ? "spJSONInvalid" : "spCredentialInvalid")}</p>}
        {draft.action === "clear" && <p className="m-0 text-xs text-ink-muted">{t("spClearNote")}</p>}
        {presence !== undefined && <p className="m-0 text-xs text-ink-muted">{t(presence ? "pmCredentialConfigured" : "pmCredentialMissing")}</p>}
      </div>;
    })}
  </div>;
}
