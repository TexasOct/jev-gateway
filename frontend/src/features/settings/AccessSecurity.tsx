import type { useLocale } from "@/shared/i18n";
import { GatewayCredentialForm } from "./GatewayCredentialForm";
import type { ProviderManagement } from "@/features/providers/shared/useProviderManagement";

type Props = { manager: ProviderManagement; t: ReturnType<typeof useLocale>["t"] };

export function AccessSecurity({ manager, t }: Props) {
  return <section aria-label={t("accessSecurity")} className="grid min-w-0 gap-4 rounded-lg border border-outline bg-panel p-4">
    <div className="grid min-w-0 gap-2">
      <h2 className="m-0 text-sm font-semibold text-ink">{t("accessSecurity")}</h2>
      <p className="m-0 text-sm text-ink-muted">{t("gwClientRole")}</p>
      <p className="m-0 text-sm text-ink-muted">{t("gwDashboardRole")}</p>
      <p className="m-0 text-sm text-ink-muted">{t("gwSupplierRole")}</p>
    </div>
    <GatewayCredentialForm manager={manager} t={t} />
  </section>;
}
