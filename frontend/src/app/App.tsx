import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  setCredential,
} from "@/shared/api/client";
import type { ConfigurationPayload } from "@/shared/api/types";
import { AppShell } from "./AppShell";
import type { View } from "./AppShell";
import { useDashboardTheme } from "./hooks/useDashboardTheme";
import { useMonitoringData } from "./hooks/useMonitoringData";
import { useRouteActivity } from "./hooks/useRouteActivity";
import { useLocale } from "@/shared/i18n";
import { useProviderManagement } from "@/features/providers/useProviderManagement";

export default function App() {
  const { locale, setLocale, t, formatDateTime } = useLocale();
  const [view, setView] = useState<View>("monitoring");
  const [needsKey, setNeedsKey] = useState(true);
  const [keyDraft, setKeyDraft] = useState("");
  const [connectionPending, setConnectionPending] = useState(true);
  const connectionBusy = useRef(false);
  const initialValidationStarted = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionErrorKey, setConnectionErrorKey] =
    useState<"authRequired" | "enterApiKey" | null>(null);
  const [configuration, setConfiguration] =
    useState<ConfigurationPayload | null>(null);
  const onActivityUnauthorized = useCallback(() => {
    setCredential(null);
    setNeedsKey(true);
    setConnectionErrorKey("authRequired");
  }, []);
  const routeActivity = useRouteActivity(
    view === "monitoring",
    needsKey,
    onActivityUnauthorized,
  );
  const { stop: stopRoutingActivity, restart: restartRoutingActivity } =
    routeActivity;
  const onUnauthorized = useCallback(() => {
    setCredential(null);
    setNeedsKey(true);
    setConnectionErrorKey("authRequired");
    stopRoutingActivity(true);
  }, [stopRoutingActivity]);
  const run = useCallback(
    async (work: () => Promise<void>) => {
      try {
        await work();
        setError(null);
        setConnectionErrorKey(null);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          onUnauthorized();
          setError(t("authRequired"));
          return;
        }
        setConnectionErrorKey(null);
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [onUnauthorized, t],
  );
  const monitoring = useMonitoringData(run, onUnauthorized);
  const { loadMonitoring, resetDetail, refreshSelectedDetail, selected } =
    monitoring;
  const theme = useDashboardTheme(run, t);
  const { loadTheme, clearNotice } = theme;

  const loadConfiguration = useCallback(async () => {
    setConfiguration(await api.configuration());
  }, []);

  const validateConnection = useCallback(async (credential?: string) => {
    if (connectionBusy.current) return;
    connectionBusy.current = true;
    setConnectionPending(true);
    setError(null);
    setConnectionErrorKey(null);
    if (credential !== undefined) setCredential(credential);
    clearNotice();
    try {
      await run(async () => {
        await loadMonitoring();
        await loadTheme();
        setKeyDraft("");
        setNeedsKey(false);
      });
    } finally {
      connectionBusy.current = false;
      setConnectionPending(false);
    }
  }, [clearNotice, loadMonitoring, loadTheme, run]);

  useEffect(() => {
    // Defer state updates and share the submission guard with the initial probe.
    void Promise.resolve().then(() => {
      if (initialValidationStarted.current) return;
      initialValidationStarted.current = true;
      return validateConnection();
    });
  }, [validateConnection]);

  const refresh = useCallback(async () => {
    restartRoutingActivity();
    await run(async () => {
      const generation = resetDetail();
      await loadMonitoring();
      await refreshSelectedDetail(selected, generation);
      await loadConfiguration();
      await loadTheme();
    });
  }, [
    loadConfiguration,
    loadMonitoring,
    loadTheme,
    refreshSelectedDetail,
    resetDetail,
    restartRoutingActivity,
    run,
    selected,
  ]);

  const reloadConfiguration = useCallback(async () => {
    await run(async () => {
      await loadConfiguration();
      await loadMonitoring();
    });
  }, [loadConfiguration, loadMonitoring, run]);
  const refreshProviderCatalog = useCallback(async () => {
    await loadConfiguration();
    await loadMonitoring();
  }, [loadConfiguration, loadMonitoring]);
  const providerManagement = useProviderManagement(view === "providers" && !needsKey, onUnauthorized, refreshProviderCatalog);
  const providerNavigationGuard = providerManagement.navigationGuardRef;
  const cancelProviderQuery = providerManagement.cancelQuery;

  const connect = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (connectionBusy.current || !initialValidationStarted.current) return;
      if (keyDraft.trim() === "") {
        setError(t("enterApiKey"));
        setConnectionErrorKey("enterApiKey");
        return;
      }
      void validateConnection(keyDraft.trim());
    },
    [keyDraft, validateConnection, t],
  );

  const openView = useCallback(
    (next: View) => {
      if (next !== "providers" && view === "providers") {
        if (providerManagement.pending || providerNavigationGuard.current?.() === false) return;
        cancelProviderQuery();
      }
      if (next !== "monitoring") stopRoutingActivity(false);
      setView(next);
      if (needsKey) return;
      if (next === "strategy") void run(loadConfiguration);
      if (next === "settings") void run(loadTheme);
    },
    [loadConfiguration, loadTheme, needsKey, run, stopRoutingActivity, view, providerManagement.pending, providerNavigationGuard, cancelProviderQuery],
  );

  return (
    <AppShell
      view={view}
      providerManagement={providerManagement}
      needsKey={needsKey}
      connectionPending={connectionPending}
      keyDraft={keyDraft}
      error={needsKey && connectionErrorKey !== null ? t(connectionErrorKey) : error}
      locale={locale}
      setLocale={setLocale}
      t={t}
      formatDateTime={formatDateTime}
      schemePreference={theme.schemePreference}
      setSchemePreference={theme.setSchemePreference}
      configuration={configuration}
      monitoring={monitoring}
      routeActivity={routeActivity}
      theme={theme}
      onOpenView={openView}
      onRefresh={() => {
        if (view === "providers" && providerManagement.pending) return;
        void refresh();
        if (view === "providers") void providerManagement.load();
      }}
      onConnect={connect}
      onKeyDraftChange={setKeyDraft}
      onReloadConfiguration={reloadConfiguration}
      onError={setError}
      onRetryMonitoring={() => void run(loadMonitoring)}
    />
  );
}
