import { Fragment } from "react";
import type { useLocale } from "@/shared/i18n";
import { capabilityFields, modelFields, modelFieldLabels } from "./model";
import type { ModelDraft, ModelField } from "./model";
import { Field } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select";
import { Checkbox } from "@/shared/ui/checkbox";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

type Translate = ReturnType<typeof useLocale>["t"];

export function ModelFields({ draft, onChange, t, prefix, states, errors = {} }: { draft: ModelDraft; onChange: (field: ModelField, value: string) => void; t: Translate; prefix: string; errors?: Record<string, string>; states?: Partial<Record<ModelField, "unknown" | "conflict" | "reference" | "known">> }) {
  return <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {modelFields.map((field) => {
      const id = `${prefix}-${field}`;
      const value = draft.values[field];
      const error = errors[field];
      const flag = capabilityFields.includes(field as typeof capabilityFields[number]);
      const limit = field === "context_window" || field === "max_output_tokens";
      const section = field === "tools" ? "mmCapabilities" : field === "input_per_million" ? "mmPrices" : field === "context_window" ? "mmLimits" : null;
      return <Fragment key={field}>{section && <h4 className="col-span-full m-0 border-t border-outline pt-3 text-sm font-semibold">{t(section)}</h4>}<div data-model-field={field} className="grid min-w-0 content-start gap-1">
        <Field id={id} label={t(modelFieldLabels[field])} error={error && <span role="alert">{t(error as Parameters<Translate>[0])}</span>}>{(props) => flag ? <NativeSelect {...props} value={value} onChange={(event) => onChange(field, event.target.value)}>
          <NativeSelectOption value="">{t("pmUnknown")}</NativeSelectOption><NativeSelectOption value="true">{t("pmSupported")}</NativeSelectOption><NativeSelectOption value="false">{t("pmUnsupportedFlag")}</NativeSelectOption>
        </NativeSelect> : <>
          {limit && <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted"><Checkbox aria-label={`${t(modelFieldLabels[field])}: ${t("pmLimitUnknown")}`} checked={value === "null"} onChange={(event) => onChange(field, event.target.checked ? "null" : "")} />{t("pmLimitUnknown")}</label>}
          <Input {...props} type={field === "reasoning_effort" ? "text" : "number"} min={limit ? 1 : 0} step={limit ? 1 : "any"} disabled={value === "null"} value={value === "null" ? "" : value} placeholder={field === "reasoning_effort" ? '["low","high"]' : t(limit ? "pmLimitKnown" : "pmUnknown")} onChange={(event) => onChange(field, event.target.value)} />
        </>}</Field>
        {error === "mmReviewEvidence" && <Button variant="outline" onClick={() => onChange(field, value)}>{t("mmKeepValue")}</Button>}
        <Badge variant="outline">{t(!value ? "pmSourceUnknown" : draft.touched[field] ? "mmManual" : states?.[field] === "known" || (!states && draft.currentMetadata?.fields?.[field]?.method === "source") ? "mmAutomatic" : "pmSourceUnknown")}</Badge>
        {states?.[field] && states[field] !== "known" && <span className="text-xs text-ink-muted">{t(states[field] === "conflict" ? "pmConflictField" : states[field] === "reference" ? "pmReference" : "pmSourceUnknown")}</span>}
      </div></Fragment>;
    })}
  </div>;
}
