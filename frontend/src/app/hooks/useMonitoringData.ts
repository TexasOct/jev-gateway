import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ApiError, api } from "@/shared/api/client";
import type { PolicyCatalog, ProvidersPayload, SessionRequestsPayload, SessionScope, SessionsPayload, StrategiesPayload } from "@/shared/api/types";
import { appendUnique } from "@/features/monitoring/model/pagination";
import { remainingSessionPages } from "@/features/monitoring/model/session-pages";

const MAX_HISTORY_ROWS = 1000;
const MAX_REQUEST_ROWS = 300;

type Run = (work: () => Promise<void>, current?: () => boolean) => Promise<void>;

export function useMonitoringData(run: Run, onUnauthorized: () => void, suspended = false, active = true) {
  const inspectorActive = useRef(active);
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

  const [sessionScope, setSessionScope] = useState<SessionScope>("live");
  const scopeRef = useRef<SessionScope>("live");
  const [history, setHistory] = useState<SessionsPayload | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPageError, setHistoryPageError] = useState(false);
  const historyGeneration = useRef(0);
  const historyBusy = useRef(false);
  const historyAbort = useRef<AbortController | null>(null);
  const historyPage = useRef<SessionsPayload | null>(null);
  const [historyEpoch, setHistoryEpoch] = useState(0);
  useLayoutEffect(() => {
    if (suspended) {
      ++detailGeneration.current;
      ++sessionGeneration.current;
      ++historyGeneration.current;
      detailAbort.current?.abort();
      historyAbort.current?.abort();
      detailBusy.current = false;
      historyBusy.current = false;
      const generation = detailGeneration.current;
      void Promise.resolve().then(() => {
        if (generation !== detailGeneration.current) return;
        setDetailLoading(false);
        setHistoryLoading(false);
        setSessionLoading(false);
      });
    }
  }, [suspended]);
  useLayoutEffect(() => {
    const details = detailGeneration, sessionsOwner = sessionGeneration, historyOwner = historyGeneration;
    return () => {
      ++details.current;
      ++sessionsOwner.current;
      ++historyOwner.current;
      detailAbort.current?.abort();
      historyAbort.current?.abort();
    };
  }, []);

  const loadHistory = useCallback(async (more = false) => {
    if (!inspectorActive.current) return;
    if (more && (historyBusy.current || !historyPage.current?.has_more || !historyPage.current.next_cursor)) return;
    historyAbort.current?.abort();
    const controller = new AbortController();
    historyAbort.current = controller;
    const generation = ++historyGeneration.current;
    const cursor = more ? historyPage.current?.next_cursor ?? undefined : undefined;
    historyBusy.current = true;
    setHistoryLoading(true);
    setHistoryError(false);
    setHistoryPageError(false);
    if (!more) { historyPage.current = null; setHistory(null); setHistoryEpoch(generation); }
    try {
      const page = await api.sessions(cursor, controller.signal, "retained");
      if (generation !== historyGeneration.current || controller.signal.aborted) return;
      const rows = appendUnique(more ? historyPage.current?.data ?? [] : [], page.data, (row) => row.session_id);
      const limited = rows.length > MAX_HISTORY_ROWS || (rows.length >= MAX_HISTORY_ROWS && page.has_more);
      const merged = { ...page, data: rows.slice(0, MAX_HISTORY_ROWS), display_limited: limited, has_more: page.has_more && !limited, next_cursor: limited ? null : page.next_cursor };
      setHistoryPageError(!page.evidence_available || Boolean(page.storage.error) || page.has_more && (!page.next_cursor || page.next_cursor === cursor));
      historyPage.current = merged;
      setHistory(merged);
    } catch (caught) {
      if (generation === historyGeneration.current && !controller.signal.aborted) {
        if (more) setHistoryPageError(true); else setHistoryError(true);
        if (caught instanceof ApiError && caught.status === 401) onUnauthorized();
      }
    } finally {
      if (generation === historyGeneration.current) { historyBusy.current = false; setHistoryLoading(false); }
    }
  }, [onUnauthorized]);

  const loadMonitoring = useCallback(async () => {
    if (scopeRef.current === "retained") void loadHistory();
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
  }, [loadHistory]);

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
    if (!inspectorActive.current || !selected || !detail?.has_more || !detail.next_cursor || detailBusy.current) return;
    detailBusy.current = true;
    setDetailLoading(true);
    const generation = detailGeneration.current;
    const controller = new AbortController();
    detailAbort.current = controller;
    try {
      const page = await api.sessionRequests(selected, detail.next_cursor, controller.signal, scopeRef.current);
      if (generation === detailGeneration.current) {
        setDetail((current) => {
          if (!current) return current;
          const rows = appendUnique(current.requests, page.requests, (row) => String(row.request["request_id"]));
          const limited = rows.length > MAX_REQUEST_ROWS || (rows.length >= MAX_REQUEST_ROWS && page.has_more);
          return { ...page, requests: rows.slice(0, MAX_REQUEST_ROWS), display_limited: limited, has_more: page.has_more && !limited, next_cursor: limited ? null : page.next_cursor };
        });
        setDetailPageError(page.has_more && (!page.next_cursor || page.next_cursor === detail.next_cursor));
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
    if (inspectorActive.current && sessionId !== null) {
      const controller = new AbortController();
      detailAbort.current = controller;
      try {
        const page = await api.sessionRequests(sessionId, undefined, controller.signal, scopeRef.current);
        if (generation === detailGeneration.current) setDetail(page);
      } catch (caught) {
        if (generation === detailGeneration.current && !controller.signal.aborted) setDetailError(true);
        if (generation === detailGeneration.current && !controller.signal.aborted) throw caught;
      }
    }
  }, []);

  const selectSession = useCallback(
    (sessionId: string) => {
      if (!inspectorActive.current) return;
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
          const page = await api.sessionRequests(sessionId, undefined, controller.signal, scopeRef.current);
          if (generation === detailGeneration.current) setDetail(page);
        } catch (caught) {
          if (generation === detailGeneration.current && !controller.signal.aborted) {
            if (generation === detailGeneration.current) setDetailError(true);
            throw caught;
          }
        }
      }, () => generation === detailGeneration.current);
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

  const selectScope = useCallback((scope: SessionScope) => {
    if (!inspectorActive.current || scope === scopeRef.current) return;
    scopeRef.current = scope;
    setSessionScope(scope);
    resetDetail();
    setSelected(null);
    ++historyGeneration.current;
    historyAbort.current?.abort();
    historyBusy.current = false;
    if (scope === "retained") void loadHistory();
  }, [loadHistory, resetDetail]);

  useLayoutEffect(() => {
    const wasActive = inspectorActive.current;
    inspectorActive.current = active;
    if (!active && wasActive) {
      // The inspector stays mounted between views. Retire its reads separately
      // from the live distribution, which remains a workspace-owned read.
      ++historyGeneration.current;
      ++detailGeneration.current;
      historyAbort.current?.abort();
      detailAbort.current?.abort();
      historyBusy.current = false;
      detailBusy.current = false;
      const generation = historyGeneration.current;
      void Promise.resolve().then(() => {
        if (inspectorActive.current || generation !== historyGeneration.current) return;
        setHistoryLoading(false);
        setDetailLoading(false);
      });
    } else if (active && !wasActive && !suspended) {
      if (scopeRef.current === "retained") void loadHistory();
      if (selected !== null && detail === null) {
        const generation = detailGeneration.current;
        void run(async () => {
          setDetailLoading(true);
          try {
            await refreshSelectedDetail(selected, generation);
          } finally {
            if (generation === detailGeneration.current) setDetailLoading(false);
          }
        }, () => inspectorActive.current && generation === detailGeneration.current);
      }
    }
  }, [active, detail, loadHistory, refreshSelectedDetail, run, selected, suspended]);

  return {
    sessionScope, selectScope, history, historyError, historyLoading, historyPageError, historyEpoch, loadHistory,
    providers, strategies, policyCatalog, strategyError, sessionsComplete, sessions, selected,
    detail, selectedRequestId, sessionPageError, detailPageError, monitoringError,
    providerError, detailError, sessionLoading, detailLoading, sessionListEpoch, detailListEpoch,
    setSelectedRequestId, loadMonitoring, loadMoreSessions, loadMoreDetail,
    resetDetail, refreshSelectedDetail, selectSession, retryDetailPage, retrySelectedDetail,
  };
}
