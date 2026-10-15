import { useWorkspaceActive } from "@/shared/navigation/workspace-activity";
import { useWorkspaceFrames } from "@/shared/navigation/useWorkspaceFrames";
import { useRef } from "react";
import { History, ChevronDown, ArrowUp } from "lucide-react";
import type { PolicyCatalog, ProviderRow, ProvidersPayload, SessionScope, SessionRequestsPayload, SessionRow, SessionsPayload } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import { formatRouteLabel, routeLabelContext } from "@/shared/i18n/route-label";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { RequestDetails } from "./RequestDetails";
import { modelName, requestId, routingReason, text } from "../model/routing-reason";
import { VirtualList } from "./VirtualList";

interface Props {
  policyCatalog?: PolicyCatalog | null;
  sessionScope?: SessionScope;
  onScopeChange?: (scope: SessionScope) => void;
  locale: "en" | "zh-CN";
  providers: ProvidersPayload | null;
  sessions: SessionsPayload | null;
  selectedSessionId: string | null;
  detail: SessionRequestsPayload | null;
  selectedRequestId: string | null;
  sessionPageError: boolean;
  detailPageError: boolean;
  sessionLoading: boolean;
  detailLoading: boolean;
  monitoringError: boolean;
  providerError?: boolean;
  distributionComplete: boolean;
  detailError: boolean;
  sessionListEpoch: number;
  detailListEpoch: number;
  t: ReturnType<typeof useLocale>["t"];
  formatDateTime: ReturnType<typeof useLocale>["formatDateTime"];
  onSelectSession: (sessionId: string) => void;
  onLoadMoreSessions: () => void;
  onLoadMoreDetail: () => void;
  onRetrySessions: () => void;
  onRetryDetail: () => void;
  onRetryMonitoring: () => void;
  onRetrySelectedDetail: () => void;
  onSelectRequest: (requestId: string) => void;
}

const PROVIDER_COLUMNS = ["provider", "key", "attempts", "completed", "successful", "unsuccessful", "incomplete", "avgDuration", "latestResult", "observed"] as const;
type Translate = ReturnType<typeof useLocale>["t"];
type FormatDateTime = ReturnType<typeof useLocale>["formatDateTime"];

function storageNote(payload: { scope?: SessionScope; evidence_available: boolean; storage: { error?: string | null } }, t: Translate): string {
  if (payload.evidence_available) return t("evidenceAvailable");
  const error = payload.storage.error;
  return error === null || error === undefined
    ? t(payload.scope === "retained" ? "evidenceUnavailable" : "evidenceLiveOnly")
    : `${t("evidenceUnavailable")}: ${error}`;
}

function providerCells(row: ProviderRow, t: Translate, formatDateTime: FormatDateTime): string[] {
  return [
    `${row.id} (${row.type})`,
    row.has_api_key ? t("resolvedYes") : t("resolvedNo"),
    row.attempts === null ? t("notRecorded") : String(row.attempts),
    row.completed === null ? t("notRecorded") : String(row.completed),
    row.succeeded === null ? t("notRecorded") : String(row.succeeded),
    row.failed === null ? t("notRecorded") : String(row.failed),
    row.incomplete_evidence === null ? t("notRecorded") : String(row.incomplete_evidence),
    row.average_latency_ms === null ? t("notRecorded") : `${row.average_latency_ms.toFixed(1)} ms`,
    row.last_outcome_at === null
      ? t("notRecorded")
      : `${formatDateTime(row.last_outcome_at)} (${row.last_outcome_ok ? t("succeeded") : t("failed")})`,
    row.observed_condition === null
      ? t("evidenceUnavailable")
      : ({
          no_recent_data: t("noRecentData"),
          all_observed_attempts_succeeded: t("allSucceeded"),
          mixed_outcomes: t("mixedOutcomes"),
          all_observed_attempts_failed: t("allFailed"),
        }[row.observed_condition] ?? row.observed_condition),
  ];
}

function guidance(locale: "en" | "zh-CN", sessions: SessionsPayload | null, selected: SessionRow | null, detail: SessionRequestsPayload | null, t: Translate, monitoringError: boolean, detailError: boolean): string {
  if (monitoringError) return locale === "zh-CN" ? "无法读取当前会话。请重试。" : "Could not load current sessions. Try again.";
  if (sessions === null) return t("loading");
  if (sessions.data.length === 0 && selected === null) return locale === "zh-CN"
    ? "暂无活动会话。向网关发送请求后，会话会显示在这里。"
    : "No active sessions yet. Send a request through the gateway to see one here.";
  if (selected === null) return locale === "zh-CN"
    ? "选择一个会话以查看它的请求记录和路由详情。"
    : "Select a session to view its requests and routing details.";
  if (detailError) return locale === "zh-CN" ? "无法读取所选会话的请求记录。请重试。" : "Could not load requests for this session. Try again.";
  if (detail === null) return locale === "zh-CN"
    ? "已选择会话，正在读取可用的保留请求记录。"
    : "Session selected. Loading any retained request records.";
  if (detail.requests.length === 0) return locale === "zh-CN"
    ? "此会话当前没有可用的保留请求记录。会话信息仍可查看。"
    : "No retained request records are available for this session. Session information is still available.";
  return locale === "zh-CN"
    ? "已显示最近保留的请求。选择请求可查看路由轨迹和记录的结果。"
    : "The latest retained requests are listed below. Select one to inspect its route trace and recorded outcome.";
}

function SessionOverview({ session, isPreview, locale, t, formatDateTime, onSelect }: { session: SessionRow | null; isPreview: boolean; locale: "en" | "zh-CN"; t: Translate; formatDateTime: FormatDateTime; onSelect: () => void; policyCatalog?: PolicyCatalog | null }) {
  if (session === null) return null;
  const latest = session.latest_request ?? null;
  const result = latest === null ? t("notRecorded") : latest.ok === true ? t("succeeded") : latest.ok === false ? t("failed") : t("traceUnknown");
  const resultClass = latest?.ok === true ? "text-positive" : latest?.ok === false ? "text-negative" : "text-ink-muted";
  return (
    <div className="monitoring-overview mt-3 flex min-w-0 items-center justify-between gap-4 rounded-md border border-outline bg-panel-muted p-3 max-[600px]:items-start max-[600px]:flex-col">
      <div className="monitoring-overview-copy grid min-w-0 gap-1.5">
        <div className="monitoring-route break-words text-lg font-semibold text-primary">{session.client ?? session.session_id}</div>
        <div className="monitoring-result flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t("latestRecordedRequest")}: {latest?.received_at == null ? t("notRecorded") : formatDateTime(latest.received_at)}</span>
          <Badge variant="outline" className={resultClass}>{t("recordedResult")}: {result}</Badge>
        </div>
        <div className="monitoring-meta break-words text-xs text-ink-muted">
          {[session.strategy ?? t("strategyUnavailable"), session.label == null ? t("labelUnavailable") : formatRouteLabel(session.label, t, routeLabelContext(session)), session.provider && session.upstream_model ? `${session.provider}/${session.upstream_model}` : t("providerUnavailable")].join(" · ")}
        </div>
        {isPreview ? <div className="monitoring-preview-hint text-xs text-ink-muted">{t("previewNotSelected")}</div> : null}
      </div>
      {isPreview ? <Button type="button" size="lg" className="max-[600px]:w-full" onClick={onSelect}>
        {locale === "zh-CN" ? "选择此会话" : "Select this session"}
      </Button> : null}
    </div>
  );
}
export function SessionInspector({ locale, providers, sessions, selectedSessionId, detail, selectedRequestId, sessionPageError, detailPageError, sessionLoading, detailLoading, monitoringError, providerError = false, distributionComplete, detailError, sessionListEpoch, detailListEpoch, t, formatDateTime, onSelectSession, onLoadMoreSessions, onLoadMoreDetail, onRetrySessions, onRetryDetail, onRetryMonitoring, onRetrySelectedDetail, onSelectRequest, sessionScope = "live", onScopeChange }: Props) {
  const scheduleFrame = useWorkspaceFrames(useWorkspaceActive());
  const root = useRef<HTMLElement>(null);
  const copy = (en: string, zh: string) => locale === "zh-CN" ? zh : en;
  const preview = selectedSessionId === null ? sessions?.data[0] ?? null : null;
  const selectedSession = sessions?.data.find((session) => session.session_id === selectedSessionId)
    ?? (selectedSessionId !== null ? { ...detail?.session, session_id: selectedSessionId } as SessionRow : null);
  const activeRequestId = selectedRequestId ?? (detail?.requests[0] ? requestId(detail.requests[0]) : null);
  const activeRequest = detail?.requests.find((item) => requestId(item) === activeRequestId) ?? null;
  const heading = sessionScope === "retained" ? t("retainedSessions") : t("currentSessions");
  const returnToList = (kind: "sessions" | "timeline", key: string | null, index: number, height: number) => {
    const list = root.current?.querySelector<HTMLElement>(`.virtual-list.${kind}`);
    if (!list || key === null) return;
    list.scrollTop = index * height;
    list.dispatchEvent(new Event("scroll", { bubbles: true }));
    scheduleFrame(() => {
      if (!list.isConnected || list.closest("[inert], [hidden]")) return;
      const row = [...list.querySelectorAll<HTMLElement>(".virtual-row")].find((element) => element.dataset.key === key);
      row?.querySelector<HTMLButtonElement>("button")?.focus();
      list.scrollIntoView({ block: "center" });
    });
  };
  return <section ref={root} className="session-workspace col-span-full min-w-0 rounded-lg border border-outline bg-panel" aria-labelledby="inspector-title">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-outline p-4 max-[600px]:p-3">
      <div className="min-w-0"><h1 id="inspector-title" className="m-0 text-xl font-semibold tracking-tight">{t("inspectorTitle")}</h1><p className="mt-1 mb-0 text-sm text-ink-muted">{t("inspectorSubtitle")}</p></div>
      <div className="flex max-w-full flex-wrap gap-1 rounded-md border border-outline bg-panel-muted p-1" aria-label={copy("Session scope", "会话范围")}>
        {(["live", "retained"] as const).map((scope) => <Button key={scope} variant="ghost" size="sm" className={`min-h-10 whitespace-normal ${sessionScope === scope ? "bg-panel text-primary shadow-sm" : "text-ink-muted"}`} aria-pressed={sessionScope === scope} onClick={() => onScopeChange?.(scope)}>{scope === "retained" ? <History aria-hidden="true" className="size-3.5" /> : null}{t(scope === "live" ? "currentSessions" : "retainedSessions")}</Button>)}
      </div>
    </header>
    <div className="grid min-w-0 grid-cols-[260px_minmax(0,1fr)] max-[899px]:grid-cols-1">
      <aside className="monitoring-sessions-panel min-w-0 border-r border-outline p-3 max-[899px]:border-r-0 max-[899px]:border-b" aria-label={copy("Session selection", "会话选择")}>
        <h2 className="m-0 text-sm font-semibold">{heading}</h2>
        <p className="mt-1 mb-3 text-xs leading-5 text-ink-muted">{t(sessionScope === "retained" ? "historyScopeNote" : "liveScopeNote")}</p>
        {monitoringError ? <p role="status" className="text-xs text-ink-muted">{copy("Could not load current sessions. Try again.", "无法读取当前会话。请重试。")}</p> : null}
        {monitoringError ? <Button variant="outline" onClick={onRetryMonitoring}>{t("retryPage")}</Button> : null}
        <VirtualList key={`${sessionScope}-${sessionListEpoch}`} className="sessions" label={heading} items={sessions?.data ?? []} rowHeight={132} getKey={(session) => session.session_id}
          hasMore={Boolean(sessions?.has_more && !sessionPageError)} loading={sessionLoading} onMore={onLoadMoreSessions}
          footer={sessionPageError ? <Button variant="outline" onClick={onRetrySessions}>{t("retryPage")}</Button> : sessions === null && !monitoringError ? <p role="status" className="p-2 text-xs text-ink-muted">{t("loading")}</p> : sessions?.evidence_available === false && sessionScope === "retained" ? <p role="status" className="p-2 text-xs text-ink-muted">{t("evidenceUnavailable")}</p> : sessions?.data.length === 0 ? <p className="p-2 text-xs text-ink-muted">{sessionScope === "retained" ? t("emptyHistory") : distributionComplete ? t("noLiveSessions") : copy("No sessions loaded yet; the page walk is incomplete.", "尚未读取到会话；分页读取尚未完成。")}</p> : null}
          render={(session) => {
            const latest = session.latest_request;
            const count = session.request_count;
            const last = session.latest_decision ?? session;
            const fallback = session.routing_evidence?.rule_status === "classifier_fallback" || session.latest_decision?.routing_evidence?.rule_status === "classifier_fallback";
            return <button type="button" className={`session${session.session_id === selectedSessionId ? " active" : ""} grid h-full w-full content-start gap-1 overflow-hidden rounded-md border px-3 py-2 text-left text-xs [overflow-wrap:anywhere] ${session.session_id === selectedSessionId ? "border-primary bg-panel-muted" : "border-outline bg-panel hover:border-primary hover:bg-panel-muted"}`} aria-pressed={session.session_id === selectedSessionId} onClick={() => onSelectSession(session.session_id)}>
              <span className="flex min-w-0 items-center justify-between gap-2"><strong className="truncate">{session.client ?? session.session_id}</strong>{sessionScope === "retained" ? <span className="shrink-0 text-[10px] text-ink-muted">{session.in_memory === true ? t("inMemory") : session.in_memory === false ? t("retainedOnly") : t("evidenceUnknown")}</span> : null}</span>
              {session.client ? <span className="truncate text-ink-muted">{session.session_id}</span> : null}
              <span className="truncate text-ink-muted">{formatDateTime(latest?.received_at ?? session.last_request_at)}</span>
              <span className="line-clamp-2 text-ink-muted">{[session.strategy ?? t("strategyUnavailable"), session.label == null ? t("labelUnavailable") : formatRouteLabel(session.label, t, routeLabelContext(session)), session.provider && session.upstream_model ? `${session.provider}/${session.upstream_model}` : t("providerUnavailable")].join(" · ")}</span>
              <span className="flex min-w-0 justify-between gap-2 text-ink-muted"><span>{count === undefined ? session.turn_count === undefined ? t("countUnknown") : `${session.turn_count} ${t("turns")}` : `${count} ${t("requestCount")}`}</span><span className={fallback ? "text-caution" : ""}>{fallback ? t("fallbackRecorded") : last["ok"] === false || latest?.ok === false ? t("failed") : latest?.ok === true ? t("succeeded") : t("traceUnknown")}</span></span>
            </button>;
          }} />
        {sessions?.display_limited && <p role="status" className="mt-2 text-xs text-ink-muted">{copy("Showing the first 1,000 retained sessions. Refresh to restart from the newest records.", "已显示前 1,000 个留存会话，刷新可从最新记录重新读取。")}</p>}
        {sessions && <p className="mt-2 mb-0 text-xs text-ink-muted [overflow-wrap:anywhere]">{storageNote(sessions, t)}</p>}
      </aside>
      <div className="min-w-0 p-4 max-[600px]:p-3">
        <section className="monitoring-overview-panel min-w-0 border-b border-outline pb-3" aria-labelledby="monitoring-overview-title">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="monitoring-overview-title" className="m-0 text-base">{selectedSessionId === null ? t("sessionPreview") : copy("Selected session", "所选会话")}</h2>{selectedSessionId !== null && <Button variant="ghost" size="sm" onClick={() => returnToList("sessions", selectedSessionId, Math.max(0, sessions?.data.findIndex((session) => session.session_id === selectedSessionId) ?? 0), 132)}><ArrowUp aria-hidden="true" className="size-3.5" />{t("backToSessions")}</Button>}</div>
          <p className="monitoring-guidance mt-1 mb-0 text-xs text-ink-muted">{guidance(locale, sessions, selectedSession, detail, t, monitoringError, detailError)}</p>
          {detailError && <Button variant="outline" onClick={onRetrySelectedDetail}>{t("retryPage")}</Button>}
          <SessionOverview session={monitoringError ? null : selectedSession ?? preview} isPreview={selectedSessionId === null && preview !== null} locale={locale} t={t} formatDateTime={formatDateTime} onSelect={() => { if (preview) onSelectSession(preview.session_id); }} />
        </section>
        <section className="monitoring-requests-panel min-w-0 py-3" aria-label={copy("Requests", "请求列表")}>
          <h3 className="mt-0 mb-1 text-sm">{copy("Requests", "请求列表")}{detail ? ` · ${detail.requests.length}${detail.has_more ? "+" : ""}` : ""}</h3>
          <p role="status" className="mt-0 mb-2 text-xs text-ink-muted [overflow-wrap:anywhere]">{detail === null ? detailError || monitoringError ? t("evidenceUnavailable") : selectedSessionId === null ? t("noSessionSelected") : t("loadingRequests") : storageNote(detail, t)}</p>
          <VirtualList key={`${selectedSessionId ?? "none"}-${detailListEpoch}`} className="timeline" label={t("selectSession")} items={detail?.requests ?? []} rowHeight={88} getKey={requestId}
            hasMore={Boolean(detail?.has_more && !detailPageError)} loading={detailLoading} onMore={onLoadMoreDetail}
            footer={detailPageError ? <Button variant="outline" onClick={onRetryDetail}>{t("retryPage")}</Button> : detail === null ? <p className="p-2 text-xs text-ink-muted">{detailError || monitoringError ? t("evidenceUnavailable") : selectedSessionId === null ? t("inspectRequests") : t("loading")}</p> : detail.evidence_available === false ? <p role="status" className="p-2 text-xs text-ink-muted">{t("evidenceUnavailable")}</p> : detail.requests.length === 0 ? <p className="p-2 text-xs text-ink-muted">{t("noRetainedRequests")}</p> : null}
            render={(item) => {
              const id = requestId(item);
              const selected = id === activeRequestId;
              return <Button type="button" variant="ghost" className={`request-select grid h-full min-h-10 w-full content-center justify-stretch gap-1 overflow-hidden whitespace-normal rounded-md border px-3 py-2 text-left text-xs ${selected ? "border-primary bg-panel-muted" : "border-outline hover:bg-panel-muted"}`} aria-pressed={selected} onClick={() => onSelectRequest(id)}>
                <span className="flex min-w-0 items-center justify-between gap-2"><span className="truncate">{formatDateTime(typeof item.request["received_at"] === "number" ? item.request["received_at"] : null)} · {id}</span><span className={`shrink-0 ${item.outcome?.["ok"] === true ? "text-positive" : item.outcome?.["ok"] === false ? "text-negative" : "text-ink-muted"}`}>{item.outcome?.["ok"] === true ? t("succeeded") : item.outcome?.["ok"] === false ? t("failed") : t("traceUnknown")}</span></span>
                <span className="truncate font-medium">{routingReason(item.decision, t, locale)}</span>
                <span className="truncate text-ink-muted">{text(item.decision?.["label"]) ?? t("labelUnavailable")} · {modelName(item.decision) ?? t("notRecorded")}{typeof item.outcome?.["total_tokens"] === "number" ? ` · ${item.outcome["total_tokens"]} tokens` : ""}</span>
              </Button>;
            }} />
          {detail?.display_limited && <p role="status" className="text-xs text-ink-muted">{copy("Showing the first 300 retained requests. Refresh to restart from the newest records.", "已显示前 300 次留存请求，刷新可从最新记录重新读取。")}</p>}
          {detailLoading && <p role="status" className="text-xs text-ink-muted">{t("loading")}</p>}
        </section>
        {activeRequest ? <div className="min-w-0 border-t border-outline pt-4"><div className="mb-3 flex justify-end"><Button variant="ghost" size="sm" onClick={() => returnToList("timeline", activeRequestId, detail?.requests.findIndex((item) => requestId(item) === activeRequestId) ?? 0, 88)}><ArrowUp aria-hidden="true" className="size-3.5" />{t("backToRequests")}</Button></div><RequestDetails key={activeRequestId} item={activeRequest} /></div> : null}
      </div>
    </div>
    <section className="monitoring-providers-panel min-w-0 border-t border-outline p-4 max-[600px]:p-3">
      <p className="monitoring-provider-caveat text-xs leading-5 text-ink-muted">{t("evidenceCaveat")}</p>
      <details className="monitoring-provider-details min-w-0"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><ChevronDown aria-hidden="true" className="size-4" />{copy("Inspect recorded provider observations", "查看保留的服务商记录")}</summary>
        <h2 className="mt-3 text-sm">{t("retainedOutcomes")}</h2>
        {providerError && <p role="status" className="text-xs text-ink-muted">{copy("Provider observations are unavailable. Session routing results remain available.", "服务商观察记录暂不可用，会话路由结果仍可查看。")}</p>}
        <div className="my-2 text-xs text-ink-muted [overflow-wrap:anywhere]">{providers === null ? providerError ? t("evidenceUnavailable") : t("loading") : storageNote(providers, t)}</div>
        <div className="table-wrap max-w-full overflow-x-auto [&_table]:min-w-[860px] max-[600px]:[&_table]:min-w-0 max-[720px]:[&_thead]:hidden max-[720px]:[&_tr]:block max-[720px]:[&_tr]:border-b max-[720px]:[&_tr]:border-outline max-[720px]:[&_tr]:py-[0.4rem] max-[720px]:[&_td]:flex max-[720px]:[&_td]:justify-between max-[720px]:[&_td]:gap-3 max-[720px]:[&_td]:border-0 max-[720px]:[&_td]:py-[0.15rem] max-[720px]:[&_td]:px-0 max-[720px]:[&_td]:before:content-[attr(data-label)] max-[720px]:[&_td]:before:text-ink-muted max-[720px]:[&_td]:before:font-semibold"><table className="w-full border-collapse text-left text-xs"><thead><tr>{PROVIDER_COLUMNS.map((key) => <th className="border-b border-outline p-2 text-ink-muted" key={key}>{t(key)}</th>)}</tr></thead><tbody>{providers === null || providers.providers.length === 0 ? <tr><td colSpan={PROVIDER_COLUMNS.length} className="border-b border-outline p-2 text-ink-muted">{providers === null ? t("evidenceUnavailable") : t("noConfiguredProviders")}</td></tr> : providers.providers.map((row) => <tr key={row.id}>{providerCells(row, t, formatDateTime).map((cell, index) => <td className="border-b border-outline p-2" key={index} data-label={t(PROVIDER_COLUMNS[index] ?? "provider")}>{cell}</td>)}</tr>)}</tbody></table></div>
      </details>
    </section>
  </section>;
}
