import type { useLocale } from "@/shared/i18n";
import { capabilityFields, modelFields } from "./model";
import type { ModelDraft, ModelField } from "./model";
import { controlClass } from "./constants";

type Translate = ReturnType<typeof useLocale>["t"];
const labels = { tools: "pmTools", vision: "pmVision", json_mode: "pmJSON", reasoning: "pmReasoning", temperature: "pmTemperature", reasoning_effort: "pmEffort", input_per_million: "pmInputCost", output_per_million: "pmOutputCost", context_window: "pmContext", max_output_tokens: "pmOutput" } as const;

export function ModelFields({ draft, onChange, t, prefix, states }: { draft: ModelDraft; onChange: (field: ModelField, value: string) => void; t: Translate; prefix: string; states?: Partial<Record<ModelField, "unknown" | "conflict" | "reference" | "known">> }) {
  return <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {modelFields.map((field) => {
      const id = `${prefix}-${field}`;
      const value = draft.values[field];
      const flag = capabilityFields.includes(field as typeof capabilityFields[number]);
      const limit = field === "context_window" || field === "max_output_tokens";
      return <div key={field} className="grid min-w-0 content-start gap-1">
        <label htmlFor={id} className="text-sm font-medium text-ink">{t(labels[field])}</label>
        {flag ? <select id={id} className={controlClass} value={value} onChange={(event) => onChange(field, event.target.value)}>
          <option value="">{t("pmUnknown")}</option><option value="true">{t("pmSupported")}</option><option value="false">{t("pmUnsupportedFlag")}</option>
        </select> : <>
          {limit && <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted"><input type="checkbox" aria-label={`${t(labels[field])}: ${t("pmLimitUnknown")}`} checked={value === "null"} onChange={(event) => onChange(field, event.target.checked ? "null" : "")} />{t("pmLimitUnknown")}</label>}
          <input id={id} className={controlClass} type={field === "reasoning_effort" ? "text" : "number"} min={limit ? 1 : 0} step={limit ? 1 : "any"} disabled={value === "null"} value={value === "null" ? "" : value} placeholder={field === "reasoning_effort" ? '["low","high"]' : t(limit ? "pmLimitKnown" : "pmUnknown")} onChange={(event) => onChange(field, event.target.value)} />
        </>}
        {states?.[field] && states[field] !== "known" && <span className="text-xs text-ink-muted">{t(states[field] === "conflict" ? "pmConflictField" : states[field] === "reference" ? "pmReference" : "pmSourceUnknown")}</span>}
      </div>;
    })}
  </div>;
}
