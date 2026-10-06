import type { ProviderModelView } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { capabilityFields, draftFromModel, modelFieldLabels, modelFields } from "./model";

export function ModelDetails({ id, model, connectionLabel, t, editDisabled, onEdit }: { id: string; model: ProviderModelView; connectionLabel: string; t: ReturnType<typeof useLocale>["t"]; editDisabled: boolean; onEdit: () => void }) {
  const draft = draftFromModel(model);
  return <section id={id} aria-label={t("mmConfiguredDetails")} className="grid min-w-0 gap-3 border-b border-outline pb-5">
    <h2 className="m-0 break-all text-base font-semibold">{t("mmConfiguredDetails")}: {model.display_name || model.upstream_model}</h2>
    <dl className="m-0 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {([["mmSupplier", connectionLabel], ["mmUpstreamId", model.upstream_model], ["mmStatus", t(model.enabled === false ? "mmDisabled" : "mmEnabled")]] as const).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm font-medium">{t(label)}</dt><dd className="m-0 break-all text-sm text-ink-muted">{value}</dd></div>)}
      {modelFields.map((field) => {
        const value = draft.values[field];
        const flag = capabilityFields.includes(field as typeof capabilityFields[number]);
        const shown = !value || value === "null" ? t("mmDetailUnknown") : flag ? t(value === "true" ? "pmSupported" : "pmUnsupportedFlag") : value;
        return <div key={field} className="min-w-0"><dt className="text-sm font-medium">{t(modelFieldLabels[field])}</dt><dd className="m-0 break-all text-sm text-ink-muted">{shown}</dd></div>;
      })}
      {([["mmTags", draft.tags || t("mmNoRoutingTags")], ["mmPriority", draft.priority], ["mmDetailQuality", draft.quality]] as const).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm font-medium">{t(label)}</dt><dd className="m-0 break-all text-sm text-ink-muted">{value}</dd></div>)}
    </dl>
    <p className="m-0 text-xs text-ink-muted">{t("mmDetailPriceUnits")}</p>
    <div><Button variant="outline" className="min-h-11" disabled={editDisabled} onClick={onEdit}>{t("mmEdit")}</Button></div>
  </section>;
}
