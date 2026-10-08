import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  setCredential,
} from "@/shared/api/client";
import type { ConfigurationPayload, SetupStatus } from "@/shared/api/types";
import { AppShell } from "./AppShell";
import type { View } from "./AppShell";
import { useDashboardTheme } from "./hooks/useDashboardTheme";
import { useMonitoringData } from "./hooks/useMonitoringData";
import { useRouteActivity } from "./hooks/useRouteActivity";
import { useLocale } from "@/shared/i18n";
import { useProviderManagement } from "@/features/providers/shared/useProviderManagement";
import { isValidSetupKey } from "@/shared/api/setup-key";
import { hasUnsavedChanges } from "@/shared/navigation/unsaved-changes";

export default function App() {
  const { locale, setLocale, t, formatDateTime } = useLocale();
  const [view, setView] = useState<View>("monitoring");
  const [canvasModel, setCanvasModel] = useState<{ provider: string; upstream: string } | null>(null);
  const [strategyDirty, setStrategyDirty] = useState(false);
  const [strategyPending, setStrategyPending] = useState(false);
  const [needsKey, setNeedsKey] = useState(true);
  const [workspaceActivated, setWorkspaceActivated] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [connectionPending, setConnectionPending] = useState(true);
  const connectionBusy = useRef(false);
  const initialValidationStarted = useRef(false);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupPending, setSetupPending] = useState(false);
  const [progressDismissed, setProgressDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionErrorKey, setConnectionErrorKey] =
    useState<"authRequired" | "enterApiKey" | null>(null);
  const [configuration, setConfiguration] =
    useState<ConfigurationPayload | null>(null);
  const onActivityUnauthorized = useCallback(() => {
    setCredential(null);
    setSetup(null);
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
    setSetup(null);
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

  const loadSetup = useCallback(async () => {
    const status = await api.setup();
    setSetup(status);
    return status;
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
        const status = await loadSetup();
        setSetupLoading(false);
        if (status.required) return;
        await loadMonitoring();
        await loadTheme();
        setKeyDraft("");
        setNeedsKey(false);
        setWorkspaceActivated(true);
      });
    } finally {
      connectionBusy.current = false;
      setConnectionPending(false);
      setSetupLoading(false);
    }
  }, [clearNotice, loadSetup, loadMonitoring, loadTheme, run]);

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
      await loadSetup();
    });
  }, [
    loadConfiguration,
    loadMonitoring,
    loadTheme,
    loadSetup,
    refreshSelectedDetail,
    resetDetail,
    restartRoutingActivity,
    run,
    selected,
  ]);

  const reloadConfiguration = useCallback(async (current: () => boolean) => {
    // A configuration read belongs to the editor operation that admitted it.
    // Propagate its failure; a committed policy must never be replayed to retry a read.
    const next = await api.configuration();
    if (!current()) return;
    setConfiguration(next);
    await run(async () => {
      try {
        if (current()) await loadMonitoring();
        if (current()) await loadSetup();
      } catch (caught) {
        if (current()) throw caught;
      }
    });
  }, [loadMonitoring, loadSetup, run]);
  const refreshProviderCatalog = useCallback(async () => {
    await loadConfiguration();
    await loadMonitoring();
    await loadSetup();
  }, [loadConfiguration, loadMonitoring, loadSetup]);
  const managementView = view === "providers" || view === "settings";
  // The shared model editor Dialog can also open from a workflow canvas model
  // node, so the configuration manager stays active while that request exists.
  const providerManagement = useProviderManagement((managementView || canvasModel !== null) && !needsKey, onUnauthorized, refreshProviderCatalog);
  const providerNavigationGuard = providerManagement.navigationGuardRef;
  const cancelProviderQuery = providerManagement.cancelQuery;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!strategyDirty && !strategyPending && !(managementView && providerManagement.pending) &&
          !(managementView && hasUnsavedChanges(providerNavigationGuard))) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [strategyDirty, strategyPending, managementView, providerManagement.pending, providerNavigationGuard]);

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

  const submitSetup = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup || setupPending || connectionBusy.current || !setup.local_setup_available) return;
    if (!isValidSetupKey(keyDraft)) {
      setError(t("setupKeyInvalid"));
      return;
    }
    connectionBusy.current = true;
    setConnectionPending(true);
    setSetupPending(true);
    const submittedKey = keyDraft;
    try {
      await run(async () => {
        const status = await api.initialize(setup.revision, submittedKey);
        setSetup(status);
        setView("settings");
        setKeyDraft("");
        try {
          await loadMonitoring();
          await loadTheme();
          await loadSetup();
          await loadConfiguration();
          setNeedsKey(false);
          setWorkspaceActivated(true);
        } catch (caught) {
          if (caught instanceof ApiError && caught.status === 401) throw caught;
          throw new Error(t("setupRefreshFailed"), { cause: caught });
        }
      });
    } finally {
      connectionBusy.current = false;
      setConnectionPending(false);
      setSetupPending(false);
    }
  }, [setup, setupPending, keyDraft, t, run, loadMonitoring, loadTheme, loadSetup, loadConfiguration]);

  const openView = useCallback(
    (next: View) => {
      if (needsKey) return false;
      if (strategyPending) return false;
      if (managementView && providerManagement.pending) return false;
      if (next === view) {
        if (next === "settings") void run(loadTheme);
        return false;
      }
      if (view === "strategy" && strategyDirty && !window.confirm(t("strategyDiscard"))) return false;
      if (managementView) {
        if (providerNavigationGuard.current?.() === false) return false;
        cancelProviderQuery();
      }
      setStrategyDirty(false);
      if (next !== "monitoring") stopRoutingActivity(false);
      setView(next);
      if (needsKey) return true;
      if (next === "strategy") void run(loadConfiguration);
      if (next === "settings") void run(loadTheme);
      return true;
    },
    [loadConfiguration, loadTheme, needsKey, run, stopRoutingActivity, view, managementView, strategyDirty, strategyPending, t, providerManagement.pending, providerNavigationGuard, cancelProviderQuery],
  );

  return (
    <AppShell
      view={view}
      workspaceActivated={workspaceActivated}
      setup={setup}
      setupLoading={setupLoading}
      setupPending={setupPending}
      progressDismissed={progressDismissed}
      onDismissProgress={() => setProgressDismissed(true)}
      onSetup={submitSetup}
      onRetrySetup={() => void validateConnection()}
      providerManagement={providerManagement}
      canvasModel={canvasModel}
      onOpenCanvasModel={(identity) => { setCanvasModel(identity); return true; }}
      onCloseCanvasModel={() => setCanvasModel(null)}
      onStrategyDirtyChange={setStrategyDirty}
      onStrategyPendingChange={setStrategyPending}
      onUnauthorized={onUnauthorized}
      navigationPending={strategyPending || (managementView && providerManagement.pending)}
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
        if (needsKey) return;
        if (strategyPending) return;
        if (managementView && providerManagement.pending) return;
        if (view === "strategy" && strategyDirty && !window.confirm(t("strategyDiscard"))) return;
        if (managementView && providerNavigationGuard.current?.() === false) return;
        if (managementView) cancelProviderQuery();
        void refresh();
        if (managementView) void providerManagement.load();
      }}
      onConnect={connect}
      onKeyDraftChange={setKeyDraft}
      onReloadConfiguration={reloadConfiguration}
      onError={setError}
      onRetryMonitoring={() => void run(loadMonitoring)}
    />
  );
}
