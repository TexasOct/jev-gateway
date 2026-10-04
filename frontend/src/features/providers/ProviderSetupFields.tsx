import type { ProviderPreset } from "@/shared/api/types";
import { useLocale } from "@/shared/i18n";
import { controlClass } from "./constants";

type Props = {
  preset: ProviderPreset;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
};

export function ProviderSetupFields({ preset, values, onChange }: Props) {
  const { locale, t } = useLocale();
  const instructions = locale === "zh-CN" ? preset.setup_instructions_zh ?? preset.setup_instructions : preset.setup_instructions;
  return <div className="grid min-w-0 gap-3">
    {instructions && <p className="m-0 break-words text-sm text-ink-muted">{instructions}</p>}
    {!!preset.setup_fields?.length && <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {preset.setup_fields.map((field) => <label className="grid min-w-0 gap-1 text-sm" key={`${field.target}-${field.key}`}>
        <span>{locale === "zh-CN" ? field.label_zh ?? field.label : field.label}</span>
        <input className={controlClass} name={field.key} required={field.required} value={values[field.key] ?? ""} placeholder={field.placeholder} autoComplete="off" onChange={(event) => onChange(field.key, event.target.value)} />
      </label>)}
    </div>}
    {preset.docs_url && <a className="w-fit max-w-full break-words text-sm text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={preset.docs_url} target="_blank" rel="noopener noreferrer">{t("pmSetupDocs")}</a>}
  </div>;
}
