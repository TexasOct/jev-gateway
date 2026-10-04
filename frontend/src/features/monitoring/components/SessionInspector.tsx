import type { PolicyCatalog, ProviderRow, ProvidersPayload, RetainedRequest, SessionRequestsPayload, SessionRow, SessionsPayload } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import { formatRouteLabel, routeLabelContext } from "@/shared/i18n/route-label";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { RouteTrace } from "./RouteTrace";
import { VirtualList } from "./VirtualList";

interface Props {
  policyCatalog?: PolicyCatalog | null;
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

function storageNote(payload: { evidence_available: boolean; storage: { error?: string | null } }, t: Translate): string {
  if (payload.evidence_available) return t("evidenceAvailable");
  const error = payload.storage.error;
  return error === null || error === undefined
    ? t("evidenceLiveOnly")
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

function JsonBlock({ name, value, empty }: { name: string; value: unknown; empty: string }) {
  return (
    <details className="mt-[0.35rem] border-t border-outline py-[0.4rem]">
      <summary className="cursor-pointer font-[620]">{name}</summary>
      <pre className="max-h-28 max-w-full overflow-auto mt-[0.4rem] rounded-[0.35rem] bg-code p-[0.6rem] [white-space:pre-wrap] [overflow-wrap:anywhere]" tabIndex={0}>{value === null || value === undefined ? empty : JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function RequestCard({ item, t, formatDateTime, selected, onSelect, policyCatalog }: { item: RetainedRequest; t: Translate; formatDateTime: FormatDateTime; selected: boolean; onSelect: () => void; policyCatalog?: PolicyCatalog | null }) {
  const request = item.request;
  const requestId = typeof request["request_id"] === "string" ? request["request_id"] : t("unknownRequest");
  const receivedAt = typeof request["received_at"] === "number" ? request["received_at"] : null;
  const outcome = item.outcome;
  const status = outcome === null ? t("traceUnknown") : outcome["ok"] === true ? t("succeeded") : t("failed");
  const statusClass = outcome === null ? "text-ink-muted" : outcome["ok"] === true ? "text-positive" : "text-negative";
  return (
    <article className={`request-card flex h-full min-w-0 flex-col overflow-auto rounded-md border border-outline bg-panel-muted p-3 ${selected ? "selected border-primary [box-shadow:inset_0_0_0_1px_var(--accent)]" : ""}`}>
      <button type="button" className="request-select grid min-h-10 w-full gap-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-left text-ink hover:border-outline hover:bg-panel" aria-pressed={selected} onClick={onSelect}>
        <span>{formatDateTime(receivedAt)}</span>
        <span className="text-ink-muted">{requestId} · <span className={statusClass}>{status}</span></span>
      </button>
      {selected ? <RouteTrace item={item} policyCatalog={policyCatalog} /> : null}
      <div className="request-evidence mt-2 min-w-0">
        <JsonBlock name={t("inboundRequest")} value={item.request} empty={t("notRecorded")} />
        <JsonBlock name={t("routingDecision")} value={item.decision} empty={t("notRecorded")} />
        <JsonBlock name={t("upstreamRequest")} value={item.upstream_request} empty={t("notRecorded")} />
        <JsonBlock name={t("outcome")} value={item.outcome} empty={t("notRecorded")} />
      </div>
    </article>
  );
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

function SessionOverview({ session, isPreview, locale, t, formatDateTime, onSelect, policyCatalog }: { session: SessionRow | null; isPreview: boolean; locale: "en" | "zh-CN"; t: Translate; formatDateTime: FormatDateTime; onSelect: () => void; policyCatalog?: PolicyCatalog | null }) {
  if (session === null) return null;
  const latest = session.latest_request ?? null;
  const result = latest === null ? t("notRecorded") : latest.ok === true ? t("succeeded") : latest.ok === false ? t("failed") : t("traceUnknown");
  const resultClass = latest?.ok === true ? "text-positive" : latest?.ok === false ? "text-negative" : "text-ink-muted";
  return (
    <div className="monitoring-overview mt-3 flex min-w-0 items-center justify-between gap-4 rounded-md border border-outline bg-panel-muted p-3 max-[600px]:items-start max-[600px]:flex-col">
      <div className="monitoring-overview-copy grid min-w-0 gap-1.5">
        <div className="monitoring-route break-words text-lg font-semibold text-primary">{session.route ?? t("routeUnavailable")}</div>
        <div className="monitoring-result flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t("latestRecordedRequest")}: {latest?.received_at == null ? t("notRecorded") : formatDateTime(latest.received_at)}</span>
          <span className={resultClass}>{t("recordedResult")}: {result}</span>
        </div>
        <div className="monitoring-meta break-words text-xs text-ink-muted">
          {[session.strategy ?? t("strategyUnavailable"), session.label == null ? t("labelUnavailable") : formatRouteLabel(session.label, t, routeLabelContext(session, policyCatalog)), session.provider && session.upstream_model ? `${session.provider}/${session.upstream_model}` : t("providerUnavailable")].join(" · ")}
        </div>
        {isPreview ? <div className="monitoring-preview-hint text-xs text-ink-muted">{t("previewNotSelected")}</div> : null}
      </div>
      {isPreview ? <Button type="button" size="lg" className="max-[600px]:w-full" onClick={onSelect}>
        {locale === "zh-CN" ? "选择此会话" : "Select this session"}
      </Button> : null}
    </div>
  );
}
export function SessionInspector({ locale, providers, sessions, selectedSessionId, detail, selectedRequestId, sessionPageError, detailPageError, sessionLoading, detailLoading, monitoringError, providerError = false, distributionComplete, detailError, sessionListEpoch, detailListEpoch, t, formatDateTime, onSelectSession, onLoadMoreSessions, onLoadMoreDetail, onRetrySessions, onRetryDetail, onRetryMonitoring, onRetrySelectedDetail, onSelectRequest, policyCatalog }: Props) {
  const copy = (en: string, zh: string) => locale === "zh-CN" ? zh : en;
  const preview = selectedSessionId === null ? sessions?.data[0] ?? null : null;
  const selectedRequestSession = detail?.session;
  const selectedSession = sessions?.data.find((session) => session.session_id === selectedSessionId)
    ?? (selectedSessionId !== null ? {
      session_id: selectedSessionId,
      route: typeof selectedRequestSession?.["route"] === "string" ? selectedRequestSession["route"] : null,
      provider: typeof selectedRequestSession?.["provider"] === "string" ? selectedRequestSession["provider"] : null,
      upstream_model: typeof selectedRequestSession?.["upstream_model"] === "string" ? selectedRequestSession["upstream_model"] : null,
      strategy: typeof selectedRequestSession?.["strategy"] === "string" ? selectedRequestSession["strategy"] : null,
      label: typeof selectedRequestSession?.["label"] === "string" ? selectedRequestSession["label"] : null,
      defaulted: typeof selectedRequestSession?.["defaulted"] === "boolean" ? selectedRequestSession["defaulted"] : undefined,
      reason: typeof selectedRequestSession?.["reason"] === "string" ? selectedRequestSession["reason"] : null,
      turn_count: typeof selectedRequestSession?.["turn_count"] === "number" ? selectedRequestSession["turn_count"] : undefined,
      first_request_at: typeof selectedRequestSession?.["first_request_at"] === "number" ? selectedRequestSession["first_request_at"] : null,
      latest_request: null,
    } satisfies SessionRow : null);
  const activeOverviewSession = monitoringError ? null : selectedSession ?? preview;
  const activeRequestId = selectedRequestId ?? (detail?.requests[0]?.request["request_id"] == null ? null : String(detail.requests[0].request["request_id"]));
  return (
    <>
    {providerError ? <p className="monitoring-attribution col-span-full mt-2 text-xs text-ink-muted" role="status">{copy("Provider observations are unavailable. Session routing results remain available.", "服务商观察记录暂不可用，会话路由结果仍可查看。")}</p> : null}
      <details className="monitoring-secondary col-span-full min-w-0 border-t border-outline py-[0.4rem] [&>summary]:flex [&>summary]:min-h-11 [&>summary]:cursor-pointer [&>summary]:items-center [&>summary]:font-semibold">
        <summary>{copy("Inspect sessions, retained requests and provider observations", "查看会话、留存请求与服务商观察记录")}</summary>
        <div className="monitoring-secondary-grid grid min-w-0 pt-3 grid-cols-[minmax(280px,380px)_minmax(0,1fr)] gap-4 max-[899px]:grid-cols-1">
      <Card className="monitoring-overview-panel col-span-full min-w-0 border-t-[3px] border-t-primary p-4" aria-labelledby="monitoring-overview-title">
        <div className="monitoring-overview-heading flex items-start justify-between gap-4 max-[600px]:gap-2">
          <div className="max-w-[60ch] min-w-0">
            <h2 id="monitoring-overview-title">{selectedSessionId === null ? (locale === "zh-CN" ? "网关活动" : "Gateway activity") : (locale === "zh-CN" ? "所选会话" : "Selected session")}</h2>
            <p className="monitoring-guidance mt-1 text-sm text-ink-muted">{guidance(locale, sessions, selectedSession, detail, t, monitoringError, detailError)}</p>
          </div>
          {preview ? <span className="monitoring-preview-label shrink-0 rounded-md border border-outline px-2 py-1 text-xs text-ink-muted">{t("sessionPreview")}</span> : null}
        </div>
        {monitoringError ? <Button variant="outline" onClick={onRetryMonitoring}>{t("retryPage")}</Button> : null}
        {detailError && !monitoringError ? <Button variant="outline" onClick={onRetrySelectedDetail}>{t("retryPage")}</Button> : null}
        <SessionOverview session={activeOverviewSession} isPreview={selectedSessionId === null && preview !== null} locale={locale} t={t} formatDateTime={formatDateTime} policyCatalog={policyCatalog} onSelect={() => { if (preview) onSelectSession(preview.session_id); }} />
      </Card>

      <Card className="monitoring-sessions-panel col-start-1 min-w-0 p-4 max-[899px]:col-start-1 max-[899px]:row-auto">
        <h2>{t("currentSessions")}</h2>
        <div className="text-ink-muted [overflow-wrap:anywhere]">{sessions === null ? (monitoringError ? t("evidenceUnavailable") : t("loading")) : storageNote(sessions, t)}</div>
        <Separator />
        <VirtualList
          key={sessionListEpoch}
          className="sessions"
          label={t("currentSessions")}
          items={sessions?.data ?? []}
          rowHeight={132}
          getKey={(session) => session.session_id}
          hasMore={Boolean(sessions?.has_more && !sessionPageError)}
          loading={sessionLoading}
          onMore={onLoadMoreSessions}
          footer={sessionPageError ? <Button variant="outline" onClick={onRetrySessions}>{t("retryPage")}</Button> : sessions?.data.length === 0 ? <div className="text-ink-muted [overflow-wrap:anywhere]">{distributionComplete ? t("noLiveSessions") : copy("No sessions loaded yet; the page walk is incomplete.", "尚未读取到会话；分页读取尚未完成。")}</div> : null}
          render={(session: SessionRow) => {
            const latest = session.latest_request ?? null;
            const status = latest === null ? t("traceUnknown") : latest.ok === true ? t("succeeded") : latest.ok === false ? t("failed") : t("traceUnknown");
            return <button type="button" className={`session${session.session_id === selectedSessionId ? " active" : ""} grid h-full w-full content-start gap-1 overflow-hidden rounded-md border bg-panel px-3 py-2 text-left text-xs [overflow-wrap:anywhere] ${session.session_id === selectedSessionId ? "border-primary bg-panel-muted" : "border-outline hover:border-primary hover:bg-panel-muted"}`.replace(session.session_id === selectedSessionId ? "session active grid" : "session grid", session.session_id === selectedSessionId ? "session active" : "session")} aria-pressed={session.session_id === selectedSessionId} onClick={() => onSelectSession(session.session_id)}>
              <span className="route">{session.route ?? t("routeUnavailable")}</span>
              <span className="text-ink-muted [overflow-wrap:anywhere]">{session.session_id}</span>
              <span className="text-ink-muted [overflow-wrap:anywhere]">{session.first_request_at == null ? t("unknownFirstRequest") : formatDateTime(session.first_request_at)}</span>
              <span className="text-ink-muted [overflow-wrap:anywhere]">{[session.strategy ?? t("strategyUnavailable"), session.label == null ? t("labelUnavailable") : formatRouteLabel(session.label, t, routeLabelContext(session, policyCatalog)), session.provider && session.upstream_model ? `${session.provider}/${session.upstream_model}` : t("providerUnavailable"), `${session.turn_count ?? 0} ${t("turns")}`, status].join(" · ")}</span>
            </button>;
          }}
        />
      </Card>

      <Card className="monitoring-requests-panel col-start-2 min-w-0 p-4 max-[899px]:col-start-1 max-[899px]:row-auto">
        <h2>{selectedSessionId === null ? t("selectSession") : selectedSession?.route ?? selectedSessionId}</h2>
        <div className="text-ink-muted [overflow-wrap:anywhere]">{detail === null ? (detailError || monitoringError ? t("evidenceUnavailable") : selectedSessionId === null ? t("noSessionSelected") : t("loadingRequests")) : storageNote(detail, t)}</div>
        <Separator />
        <VirtualList
          key={`${selectedSessionId ?? "none"}-${detailListEpoch}`}
          className="timeline"
          label={t("selectSession")}
          items={detail?.requests ?? []}
          rowHeight={360}
          getKey={(item) => String(item.request["request_id"])}
          hasMore={Boolean(detail?.has_more && !detailPageError)}
          loading={detailLoading}
          onMore={onLoadMoreDetail}
          footer={detailPageError ? <Button variant="outline" onClick={onRetryDetail}>{t("retryPage")}</Button> : detail === null ? <div className="text-ink-muted [overflow-wrap:anywhere]">{detailError || monitoringError ? t("evidenceUnavailable") : selectedSessionId === null ? t("inspectRequests") : t("loading")}</div> : detail.requests.length === 0 ? <div className="text-ink-muted [overflow-wrap:anywhere]">{t("noRetainedRequests")}</div> : null}
          render={(item) => {
            const requestId = String(item.request["request_id"]);
            return <RequestCard item={item} t={t} formatDateTime={formatDateTime} selected={requestId === activeRequestId} policyCatalog={policyCatalog} onSelect={() => onSelectRequest(requestId)} />;
          }}
        />
      </Card>

      <Card className="monitoring-providers-panel col-span-full min-w-0 p-4 max-[899px]:col-span-1 max-[899px]:col-start-1 max-[899px]:row-auto">
        <h2>{t("retainedOutcomes")}</h2>
        <p className="monitoring-provider-caveat text-ink-muted [overflow-wrap:anywhere]">{t("evidenceCaveat")}</p>
        <details className="monitoring-provider-details border-0 p-0">
          <summary className="cursor-pointer font-[620]">{locale === "zh-CN" ? "查看保留的服务商记录" : "Inspect recorded provider observations"}</summary>
          <div className="my-2 text-ink-muted [overflow-wrap:anywhere]">{providers === null ? (monitoringError ? t("evidenceUnavailable") : t("loading")) : storageNote(providers, t)}</div>
          <div className="table-wrap max-w-full overflow-x-auto [&_table]:min-w-[860px] max-[600px]:[&_table]:min-w-0 max-[720px]:[&_thead]:hidden max-[720px]:[&_tr]:block max-[720px]:[&_tr]:border-b max-[720px]:[&_tr]:border-outline max-[720px]:[&_tr]:py-[0.4rem] max-[720px]:[&_td]:flex max-[720px]:[&_td]:justify-between max-[720px]:[&_td]:gap-3 max-[720px]:[&_td]:border-0 max-[720px]:[&_td]:py-[0.15rem] max-[720px]:[&_td]:px-0 max-[720px]:[&_td]:before:content-[attr(data-label)] max-[720px]:[&_td]:before:text-ink-muted max-[720px]:[&_td]:before:font-semibold">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr>{PROVIDER_COLUMNS.map((key) => <th className="border-b border-outline p-2 text-ink-muted" key={key}>{t(key)}</th>)}</tr>
              </thead>
              <tbody>
                {providers === null || providers.providers.length === 0 ? (
                  <tr><td colSpan={PROVIDER_COLUMNS.length} className="border-b border-outline p-2 text-ink-muted">{providers === null ? (monitoringError ? t("evidenceUnavailable") : t("loading")) : t("noConfiguredProviders")}</td></tr>
                ) : providers.providers.map((row) => (
                  <tr key={row.id}>{providerCells(row, t, formatDateTime).map((cell, index) => (
                    <td className="border-b border-outline p-2" key={PROVIDER_COLUMNS[index] ?? String(index)} data-label={t(PROVIDER_COLUMNS[index] ?? "provider")}>{cell}</td>
                  ))}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
        </div>
      </details>
    </>
  );
}
