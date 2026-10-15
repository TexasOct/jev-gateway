import type { ProviderConfiguration } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import { DecisionDiagnostic } from "./DecisionDiagnostic";
import { Button } from "@/shared/ui/button";

type Props = {
  decision: ProviderConfiguration["decision"];
  disabled: boolean;
  onToggle: () => void;
  diagnostic?: boolean;
  onUnauthorized?: () => void;
  configurationGeneration?: string | number;
  t: ReturnType<typeof useLocale>["t"];
};

export function DecisionRoutingControl({ decision, disabled, onToggle, t, diagnostic = false, onUnauthorized, configurationGeneration }: Props) {
  const ready = decision.providers.some((provider) => provider.has_api_key === true);
  const status = !decision.providers.length
    ? "pmDecisionNeedsProvider"
    : !ready
      ? "pmDecisionNeedsCredential"
      : decision.enabled ? "pmDecisionEnabled" : "pmDecisionDisabled";
  return (
    <section aria-label={t("pmDecisionRouting")} className="grid min-w-0 gap-2 border-b border-outline pb-3">
      <h3 className="m-0 text-sm font-semibold">{t("pmDecisionRouting")}</h3>
      <p role="status" className="m-0 text-sm text-ink-muted">{t(status)}</p>
      <Button
        className="min-h-11 justify-self-start"
        variant="outline"
        disabled={disabled || (!decision.enabled && !ready)}
        onClick={onToggle}
      >
        {t(decision.enabled ? "pmDecisionDisable" : "pmDecisionEnable")}
      </Button>
      {diagnostic && decision.providers.map((provider) => <div key={provider.id} className="mt-1 grid min-w-0 gap-2 border-t border-outline pt-3"><span className="text-xs font-semibold [overflow-wrap:anywhere]">{provider.display_name || provider.id}</span><DecisionDiagnostic selector={{ provider_id: provider.id }} configurationGeneration={configurationGeneration} disabled={disabled} onUnauthorized={onUnauthorized} t={t} /></div>)}
    </section>
  );
}
