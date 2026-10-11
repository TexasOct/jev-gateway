import type { ProviderPreset, ProviderProfile } from "@/shared/api/types";
import { useLocale } from "@/shared/i18n";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select";
import { Field } from "@/shared/ui/Field";
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
      const changeValue = (value: string) => onChange(field.key, submittedCredentialDraft("keep", value));
      return <div className="grid min-w-0 content-start gap-2" key={field.key}>
        <Field id={`action-${field.key}`} label={<>{label} · {t("pmCredential")}</>}>{(props) => <NativeSelect {...props} data-transport-action={field.key} value={draft.action} onChange={(event) => onChange(field.key, { action: event.target.value as TransportDraft["action"], value: "" })}>
            <NativeSelectOption value="keep">{t("pmKeep")}</NativeSelectOption><NativeSelectOption value="set">{t("pmSet")}</NativeSelectOption><NativeSelectOption value="clear">{t("pmClear")}</NativeSelectOption>
          </NativeSelect>}</Field>
        {draft.action !== "clear" && <Field id={`secret-${field.key}`} label={label} error={invalid && <span role="alert">{t(field.key === "vertex_credentials" ? "spJSONInvalid" : "spCredentialInvalid")}</span>}>{(props) =>
          field.key === "vertex_credentials" ? <Textarea {...props} className="min-h-28 [-webkit-text-security:disc]" name={field.key} value={draft.value} placeholder={t("spKeepBlank")} autoComplete="off" spellCheck={false} onInput={(event) => changeValue(event.currentTarget.value)} onChange={(event) => changeValue(event.target.value)} /> :
            <Input {...props} name={field.key} type="password" value={draft.value} placeholder={t("spKeepBlank")} autoComplete="new-password" onInput={(event) => changeValue(event.currentTarget.value)} onChange={(event) => changeValue(event.target.value)} />
        }</Field>}
        {draft.action === "clear" && <p className="m-0 text-xs text-ink-muted">{t("spClearNote")}</p>}
        {presence !== undefined && <p className="m-0 text-xs text-ink-muted">{t(presence ? "pmCredentialConfigured" : "pmCredentialMissing")}</p>}
      </div>;
    })}
  </div>;
}
