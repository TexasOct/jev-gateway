import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { WorkspaceActivity } from "@/shared/navigation/workspace-activity";
import { RefreshCw } from "lucide-react";
import type { ConfigurationPayload, SetupStatus } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import type { SchemePreference } from "./hooks/useDashboardTheme";
import { MonitoringView } from "@/features/monitoring/MonitoringView";
import AppearanceView from "@/features/appearance/AppearanceView";
import RoutingEditor from "@/features/routing/RoutingEditor";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { ToolButton } from "@/shared/ui/ToolButton";
import type { Palette } from "@/shared/theme/palette";
import type { RoutingActivityPayload } from "@/shared/api/types";
import type { useMonitoringData } from "./hooks/useMonitoringData";
import { ProviderView } from "@/features/providers/suppliers/ProviderView";
import type { ProviderManagement } from "@/features/providers/shared/useProviderManagement";
import { ConnectionPage } from "./ConnectionPage";
import { GlobalDefaultModel } from "@/features/settings/GlobalDefaultModel";
import { AccessSecurity } from "@/features/settings/AccessSecurity";

type Translate = ReturnType<typeof useLocale>["t"];
type FormatDateTime = ReturnType<typeof useLocale>["formatDateTime"];
export type View = "monitoring" | "strategy" | "providers" | "settings";
type MonitoringData = ReturnType<typeof useMonitoringData>;
type Activity = {
  activity: RoutingActivityPayload | null;
  activityError: boolean;
  activitySequence: number;
  retry: () => void;
};
type Theme = {
  seed: string;
  savedSeed: string;
  schemePreference: SchemePreference;
  setSchemePreference: (value: SchemePreference) => void;
  activePalette: Palette;
  resolvedScheme: "light" | "dark";
  notice: string | null;
  themeLoading: boolean;
  themeError: string | null;
  themeWritePending: boolean;
  saveTheme: (seed?: string) => void;
  resetTheme: () => void;
  changeSeed: (seed: string) => void;
};
type Props = {
  setup?: SetupStatus | null;
  setupLoading?: boolean;
  setupPending?: boolean;
  progressDismissed?: boolean;
  onDismissProgress?: () => void;
  onSetup?: (event: FormEvent<HTMLFormElement>) => void;
  onRetrySetup?: () => void;
  providerManagement?: ProviderManagement;
  onStrategyDirtyChange?: (dirty: boolean) => void;
  onStrategyPendingChange?: (pending: boolean) => void;
  onUnauthorized?: () => void;
  navigationPending?: boolean;
  view: View;
  workspaceActivated?: boolean;
  needsKey: boolean;
  connectionPending?: boolean;
  keyDraft: string;
  error: string | null;
  locale: "en" | "zh-CN";
  setLocale: (value: "en" | "zh-CN") => void;
  t: Translate;
  formatDateTime: FormatDateTime;
  schemePreference: SchemePreference;
  setSchemePreference: (value: SchemePreference) => void;
  configuration: ConfigurationPayload | null;
  monitoring: MonitoringData;
  routeActivity: Activity;
  theme: Theme;
  onOpenView: (view: View) => void;
  onRefresh: () => void;
  onConnect: (event: FormEvent<HTMLFormElement>) => void;
  onKeyDraftChange: (value: string) => void;
  onReloadConfiguration: () => Promise<void>;
  onError: (error: string | null) => void;
  onRetryMonitoring: () => void;
};

function RoutingWorkspace({ configuration, error, onReloadConfiguration, onError, onStrategyDirtyChange, onStrategyPendingChange, onUnauthorized }: Pick<Props, "error" | "onReloadConfiguration" | "onError" | "onStrategyDirtyChange" | "onStrategyPendingChange" | "onUnauthorized"> & { configuration: ConfigurationPayload }) {
  const [informationOpen, setInformationOpen] = useState(false);
  return <RoutingEditor
    key={configuration.config_hash}
    config={configuration}
    error={error}
    onReloaded={onReloadConfiguration}
    onError={onError}
    informationOpen={informationOpen}
    onInformationOpenChange={setInformationOpen}
    onDirtyChange={onStrategyDirtyChange}
    onPendingChange={onStrategyPendingChange}
    onUnauthorized={onUnauthorized}
  />;
}

export function AppShell({
  setup,
  setupLoading = false,
  setupPending = false,
  progressDismissed = false,
  onDismissProgress,
  onSetup,
  onRetrySetup,
  providerManagement,
  onStrategyDirtyChange,
  onStrategyPendingChange,
  onUnauthorized,
  navigationPending = false,
  view,
  needsKey,
  workspaceActivated = !needsKey,
  connectionPending = false,
  keyDraft,
  error,
  locale,
  setLocale,
  t,
  formatDateTime,
  schemePreference,
  setSchemePreference,
  configuration,
  monitoring,
  routeActivity,
  theme,
  onOpenView,
  onRefresh,
  onConnect,
  onKeyDraftChange,
  onReloadConfiguration,
  onError,
  onRetryMonitoring,
}: Props) {
  const savedFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // A native disabled submit/probe button may blur before its 401 arrives.
    const remember = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest(".app-shell")) savedFocus.current = event.target;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);
  useLayoutEffect(() => {
    if (needsKey && document.activeElement instanceof HTMLElement && document.activeElement.closest(".app-shell")) savedFocus.current = document.activeElement;
    const frame = requestAnimationFrame(() => {
      if (needsKey) document.querySelector<HTMLInputElement>("#gateway-api-key")?.focus();
      else if (!document.querySelector('[role="dialog"][aria-modal="true"][data-state="open"]')) {
        if (savedFocus.current?.isConnected) savedFocus.current.focus();
        if (!document.activeElement?.closest(".app-shell")) document.querySelector<HTMLButtonElement>("[data-dashboard-view-nav] button[aria-pressed='true']")?.focus();
        savedFocus.current = null;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [needsKey, connectionPending]);
  if (setupLoading && !workspaceActivated) {
    return <main className="min-h-dvh bg-page p-4 text-ink"><p role="status">{t("loading")}</p></main>;
  }
  if (setup?.required) {
    return <main className="min-h-dvh bg-page p-4 text-ink">
      <Card className="mx-auto grid w-full min-w-0 max-w-3xl gap-3 p-4">
        <h1 className="m-0 text-lg font-semibold">{t("settings")}</h1>
        <section aria-label={t("accessSecurity")} className="grid gap-3">
        <h2 className="m-0 text-sm font-semibold">{t("accessSecurity")}</h2>
        <p className="m-0 text-ink-muted">{t("setupDescription")}</p>
        <p className="m-0 text-sm text-ink-muted">{t("gwClientRole")}</p>
        <p className="m-0 text-sm text-ink-muted">{t("gwDashboardRole")}</p>
        <p className="m-0 text-sm text-ink-muted">{t("gwSupplierRole")}</p>
        <p className="m-0 text-sm text-ink-muted">{t("gwInitializeEffects")}</p>
        <label className="flex items-center gap-2">{t("language")}
          <select value={locale} onChange={(event) => setLocale(event.target.value as "en" | "zh-CN")}>
            <option value="en">English</option><option value="zh-CN">简体中文</option>
          </select>
        </label>
        {setup.local_setup_available ? <form className="grid gap-3" onSubmit={onSetup}>
          <label htmlFor="setup-key">{t("apiKey")}</label>
          <input id="setup-key" type="password" autoComplete="new-password" minLength={16} maxLength={8192} required disabled={setupPending}
            className="min-h-9 min-w-0 rounded-lg border border-outline bg-panel px-3 text-ink"
            value={keyDraft} onChange={(event) => onKeyDraftChange(event.target.value)} aria-describedby="setup-key-note" />
          <p id="setup-key-note" className="m-0 text-ink-muted">{t("setupKeyNote")}</p>
          <Button type="submit" disabled={setupPending}>{t(setupPending ? "loading" : "setupSubmit")}</Button>
        </form> : <p className="text-ink-muted [overflow-wrap:anywhere]">{t("setupLocalOnly")}</p>}
        <Button type="button" variant="ghost" disabled={setupPending} onClick={onRetrySetup}>{t("setupRetry")}</Button>
        {error && <p role="alert" className="[overflow-wrap:anywhere]">{error}</p>}
        </section>
      </Card>
    </main>;
  }
  if (needsKey && !workspaceActivated) {
    return <ConnectionPage keyDraft={keyDraft} error={error} pending={connectionPending} locale={locale} setLocale={setLocale} t={t} onConnect={onConnect} onKeyDraftChange={onKeyDraftChange} />;
  }
  return (
    <>
    {needsKey && <ConnectionPage keyDraft={keyDraft} error={error} pending={connectionPending} locale={locale} setLocale={setLocale} t={t} onConnect={onConnect} onKeyDraftChange={onKeyDraftChange} />}
    <WorkspaceActivity.Provider value={!needsKey}>
    <div
      hidden={needsKey}
      inert={needsKey}
      aria-hidden={needsKey || undefined}
      style={needsKey ? { display: "none" } : undefined}
      data-view={view}
      className={
        view === "strategy"
          ? "app-shell grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
          : "app-shell min-h-dvh min-w-0 bg-page"
      }
    >
      <header className="app-header relative z-20 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-outline bg-panel px-3 py-2 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-outline bg-panel-muted text-sm font-bold tracking-tight text-primary"
          >
            J
          </span>
          <div className="min-w-0">
            <h1 className="m-0 truncate text-sm font-semibold tracking-tight text-ink">
              JEV Gateway
            </h1>
            <p className="m-0 truncate text-[11px] text-ink-muted">
              {t("dashboardSubtitle")}
            </p>
          </div>
        </div>
        <nav
          data-dashboard-view-nav
          className="col-span-2 row-start-2 flex w-fit max-w-full min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:thin] rounded-lg border border-outline bg-panel-muted p-1 lg:col-span-1 lg:row-start-1"
          aria-label={t("views")}
        >
          {(
            [
              ["monitoring", t("monitoring")],
              ["strategy", t("strategyEditor")],
              ["providers", t("providerModels")],
              ["settings", t("settings")],
            ] as const
          ).map(([target, label]) => (
            <Button
              key={target}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={view === target}
              disabled={navigationPending}
              className="min-w-0 max-w-40 shrink-0 truncate rounded-md px-3 aria-pressed:border-outline aria-pressed:bg-panel aria-pressed:text-primary aria-pressed:shadow-xs"
              onClick={() => onOpenView(target)}
            >
              {label}
            </Button>
          ))}
        </nav>
        <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-1.5 lg:col-start-3">
          {!needsKey && (
            <ToolButton
              aria-label={t("refresh")}
              title={t("refresh")}
              onClick={onRefresh}
              disabled={navigationPending}
            >
              <span
                aria-hidden="true"
                className="inline-flex w-3 items-center justify-center"
              >
                <RefreshCw aria-hidden="true" focusable="false" />
              </span>
              <span className="sr-only xl:not-sr-only">{t("refresh")}</span>
            </ToolButton>
          )}
        </div>
      </header>
      <main
        className={
          view === "strategy"
            ? "mx-auto flex w-full min-h-0 min-w-0 max-w-[1440px] flex-col items-stretch overflow-hidden border-x border-outline p-0"
            : "mx-auto grid w-full min-w-0 max-w-[1440px] content-start gap-4 px-4 py-5 max-[720px]:gap-3 max-[720px]:p-3 lg:px-6"
        }
      >
        {error !== null && !(view === "strategy" && configuration !== null) && (
          <Card className="min-w-0 p-3">
            <div role={setup?.required || needsKey ? "alert" : undefined} className="my-2 rounded border-l-[3px] border-caution bg-panel-muted px-2 py-2 text-ink-muted [overflow-wrap:anywhere]">
              {error}
            </div>
          </Card>
        )}
        {!needsKey && !setupLoading && setup && !setup.required && !setup.routing_ready && view !== "strategy" && (!progressDismissed || view === "settings") && (
          <Card className="mx-auto grid w-full min-w-0 max-w-3xl gap-3 p-4" aria-label={t("setupProgress")}>
            <h2 className="text-sm font-semibold">{t("setupProgress")}</h2>
            <p className="text-ink-muted">{t("setupOptional")}</p>
            <ul className="grid gap-1 text-sm">
              <li>{t("setupProvider")}: {t(setup.has_providers ? "setupDone" : "setupRemaining")}</li>
              <li>{t("setupModel")}: {t(setup.has_models ? "setupDone" : "setupRemaining")}</li>
              <li>{t("globalDefaultModel")}: {t(configuration?.defaults?.default_model ? "setupDone" : "setupRemaining")}</li>
              <li>{t("setupRouting")}: {t(setup.routing_ready ? "setupDone" : "setupRemaining")}</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onOpenView("providers")}>{t("providerModels")}</Button>
              {setup.has_models && <Button variant="outline" onClick={() => onOpenView("settings")}>{t("globalDefaultModel")}</Button>}
              <Button variant="outline" onClick={() => onOpenView("strategy")}>{t("strategyEditor")}</Button>
              <Button variant="ghost" onClick={() => { onDismissProgress?.(); onOpenView("monitoring"); }}>{t("setupLater")}</Button>
            </div>
          </Card>
        )}
        {setupLoading || setup?.required ? null : view === "monitoring" ? (
          <MonitoringView
            strategies={monitoring.strategies}
            policyCatalog={monitoring.policyCatalog}
            strategyError={monitoring.strategyError}
            activity={routeActivity.activity}
            activityError={routeActivity.activityError}
            activitySequence={routeActivity.activitySequence}
            sessionsComplete={monitoring.sessionsComplete}
            locale={locale}
            providers={monitoring.providers}
            sessions={monitoring.sessions}
            selectedSessionId={monitoring.selected}
            detail={monitoring.detail}
            selectedRequestId={monitoring.selectedRequestId}
            sessionPageError={monitoring.sessionPageError}
            detailPageError={monitoring.detailPageError}
            sessionLoading={monitoring.sessionLoading}
            detailLoading={monitoring.detailLoading}
            monitoringError={monitoring.monitoringError}
            providerError={monitoring.providerError}
            detailError={monitoring.detailError}
            sessionListEpoch={monitoring.sessionListEpoch}
            detailListEpoch={monitoring.detailListEpoch}
            t={t}
            formatDateTime={formatDateTime}
            onSelectSession={monitoring.selectSession}
            onLoadMoreSessions={() => void monitoring.loadMoreSessions()}
            onLoadMoreDetail={() => void monitoring.loadMoreDetail()}
            onRetrySessions={() => void monitoring.loadMoreSessions()}
            onRetryDetail={monitoring.retryDetailPage}
            onRetryMonitoring={onRetryMonitoring}
            onRetrySelectedDetail={monitoring.retrySelectedDetail}
            onSelectRequest={monitoring.setSelectedRequestId}
          />
        ) : view === "settings" ? (
          <section className="mx-auto grid w-full min-w-0 max-w-3xl gap-4" aria-label={t("settings")}>
            <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-outline pb-4">
              <h2 className="m-0 w-full text-sm font-semibold text-ink">
                {t("settings")}
              </h2>
            </div>
            <AppearanceView
              seed={theme.seed}
              locale={locale}
              onLocaleChange={setLocale}
              schemePreference={schemePreference}
              onSchemeChange={setSchemePreference}
              notice={theme.notice}
              loading={theme.themeLoading || theme.themeWritePending}
              error={theme.themeError}
              onSeedChange={theme.saveTheme}
              t={t}
            />
            {providerManagement && <AccessSecurity manager={providerManagement} t={t} />}
            {providerManagement && <GlobalDefaultModel manager={providerManagement} t={t} onOpenProviders={() => onOpenView("providers")} />}
          </section>
        ) : view === "providers" ? (
          providerManagement ? <ProviderView manager={providerManagement} t={t} /> : <p role="status">{t("authRequired")}</p>
        ) : configuration === null ? (
          <Card className="min-w-0 p-4">
            <h2 className="mb-2 text-sm font-semibold">{t("configuration")}</h2>
            <div className="text-ink-muted [overflow-wrap:anywhere]">
              {t("loading")}
            </div>
          </Card>
        ) : (
          <RoutingWorkspace
            configuration={configuration}
            error={error}
            onReloadConfiguration={onReloadConfiguration}
            onError={onError}
            onStrategyDirtyChange={onStrategyDirtyChange}
            onStrategyPendingChange={onStrategyPendingChange}
            onUnauthorized={onUnauthorized}
          />
        )}
      </main>
    </div>
    </WorkspaceActivity.Provider>
    </>
  );
}
