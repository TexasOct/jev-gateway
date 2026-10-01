import { useCallback, useRef, useState } from "react";
import { ApiError, api } from "@/shared/api/client";
import type { PolicyCatalog, ProvidersPayload, SessionRequestsPayload, SessionsPayload, StrategiesPayload } from "@/shared/api/types";
import { appendUnique } from "@/features/monitoring/model/pagination";
import { remainingSessionPages } from "@/features/monitoring/model/session-pages";

type Run = (work: () => Promise<void>) => Promise<void>;

export function useMonitoringData(run: Run, onUnauthorized: () => void) {
  const [providers, setProviders] = useState<ProvidersPayload | null>(null);
  const [strategies, setStrategies] = useState<StrategiesPayload | null>(null);
  const [policyCatalog, setPolicyCatalog] = useState<PolicyCatalog | null>(null);
  const [strategyError, setStrategyError] = useState(false);
  const [sessionsComplete, setSessionsComplete] = useState(false);
  const [sessions, setSessions] = useState<SessionsPayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionRequestsPayload | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [sessionPageError, setSessionPageError] = useState(false);
  const [detailPageError, setDetailPageError] = useState(false);
  const [monitoringError, setMonitoringError] = useState(false);
  const [providerError, setProviderError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sessionListEpoch, setSessionListEpoch] = useState(0);
  const [detailListEpoch, setDetailListEpoch] = useState(0);
  const sessionGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const sessionBusy = useRef(false);
  const detailBusy = useRef(false);
  const detailAbort = useRef<AbortController | null>(null);

  const loadMonitoring = useCallback(async () => {
    const generation = ++sessionGeneration.current;
    sessionBusy.current = false;
    setSessionLoading(false);
    setSessionPageError(false);
    setMonitoringError(false);
    setProviderError(false);
    setStrategyError(false);
    setPolicyCatalog(null);
    setSessionsComplete(false);
    setSessions(null);
    setSessionListEpoch(generation);
    try {
      const [providerResult, strategyResult, sessionResult, policyResult] = await Promise.allSettled([
        api.providers(),
        api.strategies(),
        api.sessions(),
        api.policy(),
      ]);
      if (generation !== sessionGeneration.current) return;
      setProviders(providerResult.status === "fulfilled" ? providerResult.value : null);
      setStrategies(strategyResult.status === "fulfilled" ? strategyResult.value : null);
      setPolicyCatalog(policyResult.status === "fulfilled" ? policyResult.value : null);
      setStrategyError(strategyResult.status === "rejected");
      setMonitoringError(sessionResult.status === "rejected");
      setProviderError(providerResult.status === "rejected");
      const failures = [providerResult, strategyResult, sessionResult, policyResult]
        .flatMap((result) => result.status === "rejected" ? [result.reason] : []);
      const unauthorized = failures.find((reason) => reason instanceof ApiError && reason.status === 401);
      if (sessionResult.status === "fulfilled" && unauthorized === undefined) {
        setSessions(sessionResult.value);
        sessionBusy.current = true;
        setSessionLoading(sessionResult.value.has_more);
        let result;
        try {
          result = await remainingSessionPages(
            sessionResult.value,
            (cursor) => api.sessions(cursor),
            (page) => setSessions(page),
            () => generation === sessionGeneration.current,
          );
        } catch (caught) {
          if (generation !== sessionGeneration.current) return;
          setSessionPageError(true);
          if (caught instanceof ApiError && caught.status === 401) throw caught;
        }
        if (generation === sessionGeneration.current && result && !result.stopped) {
          const storageFailed = result.page.storage.enabled === false || Boolean(result.page.storage.error);
          const complete = !result.page.has_more && !storageFailed && !result.cursorError;
          setSessionsComplete(complete);
          setSessionPageError(result.cursorError || (result.page.has_more && !storageFailed) || storageFailed);
        }
      }
      if (unauthorized !== undefined) throw unauthorized;
      const failure = [providerResult, strategyResult, sessionResult].find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    } finally {
      if (generation === sessionGeneration.current) {
        sessionBusy.current = false;
        setSessionLoading(false);
      }
    }
  }, []);

  const loadMoreSessions = useCallback(async () => {
    if (!sessions || sessionBusy.current) return;
    const storageUnavailable = sessions.storage.enabled === false || Boolean(sessions.storage.error);
    if (!sessions.has_more && !storageUnavailable) return;
    if (sessions.has_more && !sessions.next_cursor) {
      void run(loadMonitoring);
      return;
    }
    if (!sessions.has_more && storageUnavailable) {
      void run(loadMonitoring);
      return;
    }
    sessionBusy.current = true;
    setSessionLoading(true);
    setSessionPageError(false);
    const generation = sessionGeneration.current;
    try {
      const result = await remainingSessionPages(
        sessions,
        (cursor) => api.sessions(cursor),
        (page) => setSessions(page),
        () => generation === sessionGeneration.current,
      );
      if (generation === sessionGeneration.current && !result.stopped) {
        const storageFailed = result.page.storage.enabled === false || Boolean(result.page.storage.error);
        const complete = !result.page.has_more && !storageFailed && !result.cursorError;
        setSessionsComplete(complete);
        setSessionPageError(result.cursorError || (result.page.has_more && !storageFailed) || storageFailed);
      }
    } catch (caught) {
      if (generation === sessionGeneration.current) {
        setSessionPageError(true);
        if (caught instanceof ApiError && caught.status === 401) {
          onUnauthorized();
        }
      }
    } finally {
      if (generation === sessionGeneration.current) {
        sessionBusy.current = false;
        setSessionLoading(false);
      }
    }
  }, [loadMonitoring, onUnauthorized, run, sessions]);

  const loadMoreDetail = useCallback(async () => {
    if (!selected || !detail?.has_more || !detail.next_cursor || detailBusy.current) return;
    detailBusy.current = true;
    setDetailLoading(true);
    const generation = detailGeneration.current;
    const controller = new AbortController();
    detailAbort.current = controller;
    try {
      const page = await api.sessionRequests(selected, detail.next_cursor, controller.signal);
      if (generation === detailGeneration.current) {
        setDetail((current) => current && ({ ...page, requests: appendUnique(current.requests, page.requests, (row) => String(row.request["request_id"])) }));
        setDetailPageError(false);
      }
    } catch (caught) {
      if (generation === detailGeneration.current && !controller.signal.aborted) {
        setDetailPageError(true);
        if (caught instanceof ApiError && caught.status === 401) {
          onUnauthorized();
        }
      }
    } finally {
      if (generation === detailGeneration.current) {
        detailBusy.current = false;
        setDetailLoading(false);
      }
    }
  }, [detail, onUnauthorized, selected]);

  const resetDetail = useCallback(() => {
    detailAbort.current?.abort();
    const generation = ++detailGeneration.current;
    detailBusy.current = false;
    setDetailLoading(false);
    setDetailPageError(false);
    setDetailError(false);
    setDetailListEpoch(generation);
    setDetail(null);
    setSelectedRequestId(null);
    return generation;
  }, []);

  const refreshSelectedDetail = useCallback(async (sessionId: string | null, generation: number) => {
    if (sessionId !== null) {
      const controller = new AbortController();
      detailAbort.current = controller;
      try {
        const page = await api.sessionRequests(sessionId, undefined, controller.signal);
        if (generation === detailGeneration.current) setDetail(page);
      } catch (caught) {
        if (generation === detailGeneration.current && !controller.signal.aborted) setDetailError(true);
        throw caught;
      }
    }
  }, []);

  const selectSession = useCallback(
    (sessionId: string) => {
      detailAbort.current?.abort();
      const generation = ++detailGeneration.current;
      detailBusy.current = false;
      setDetailLoading(false);
      setSelected(sessionId);
      setDetail(null);
      setSelectedRequestId(null);
      setDetailPageError(false);
      setDetailError(false);
      setDetailListEpoch(generation);
      void run(async () => {
        const controller = new AbortController();
        detailAbort.current = controller;
        try {
          const page = await api.sessionRequests(sessionId, undefined, controller.signal);
          if (generation === detailGeneration.current) setDetail(page);
        } catch (caught) {
          if (!controller.signal.aborted) {
            if (generation === detailGeneration.current) setDetailError(true);
            throw caught;
          }
        }
      });
    },
    [run],
  );

  const retryDetailPage = useCallback(() => {
    setDetailPageError(false);
    void loadMoreDetail();
  }, [loadMoreDetail]);

  const retrySelectedDetail = useCallback(() => {
    if (selected !== null) selectSession(selected);
  }, [selected, selectSession]);

  return {
    providers, strategies, policyCatalog, strategyError, sessionsComplete, sessions, selected,
    detail, selectedRequestId, sessionPageError, detailPageError, monitoringError,
    providerError, detailError, sessionLoading, detailLoading, sessionListEpoch, detailListEpoch,
    setSelectedRequestId, loadMonitoring, loadMoreSessions, loadMoreDetail,
    resetDetail, refreshSelectedDetail, selectSession, retryDetailPage, retrySelectedDetail,
  };
}
