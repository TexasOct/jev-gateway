import type {
  PolicyCatalog,
  ProvidersPayload,
  RoutingActivityPayload,
  SessionRequestsPayload,
  SessionsPayload,
} from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import type { StrategiesPayload } from "./model/strategy-distribution";
import { StrategyDistribution } from "./components/StrategyDistribution";
import { SessionInspector } from "./components/SessionInspector";

type Translate = ReturnType<typeof useLocale>["t"];
type FormatDateTime = ReturnType<typeof useLocale>["formatDateTime"];

export interface MonitoringViewProps {
  /** All registered strategies from GET /v1/routing/strategies. Null while loading. */
  strategies?: StrategiesPayload | null;
  policyCatalog?: PolicyCatalog | null;
  strategyError?: boolean;
  /** In-flight routed requests from GET /v1/routing/activity. */
  activity?: RoutingActivityPayload | null;
  activityError?: boolean;
  activitySequence?: number;
  activityMotionPaused?: boolean;
  /** True only after every session cursor has been read successfully. */
  sessionsComplete?: boolean;
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
  detailError: boolean;
  sessionListEpoch: number;
  detailListEpoch: number;
  t: Translate;
  formatDateTime: FormatDateTime;
  onSelectSession: (sessionId: string) => void;
  onLoadMoreSessions: () => void;
  onLoadMoreDetail: () => void;
  onRetrySessions: () => void;
  onRetryDetail: () => void;
  onRetryMonitoring: () => void;
  onRetrySelectedDetail: () => void;
  onSelectRequest: (requestId: string) => void;
}

export function MonitoringView(props: MonitoringViewProps) {
  return (
    <div className="monitoring-view mx-auto grid w-full max-w-[1280px] min-w-0 grid-cols-[minmax(280px,380px)_minmax(0,1fr)] content-start gap-4 max-[899px]:grid-cols-1">
      <StrategyDistribution
        strategies={props.strategies}
        policyCatalog={props.policyCatalog}
        strategyError={props.strategyError}
        activity={props.activity}
        activityError={props.activityError}
        activitySequence={props.activitySequence}
        motionPaused={props.activityMotionPaused}
        sessionsComplete={props.sessionsComplete}
        locale={props.locale}
        sessions={props.sessions}
        sessionPageError={props.sessionPageError}
        monitoringError={props.monitoringError}
        providerError={props.providerError}
        onRetrySessions={props.onRetrySessions}
        onRetryMonitoring={props.onRetryMonitoring}
        t={props.t}
      />
      <SessionInspector
        policyCatalog={props.policyCatalog}
        locale={props.locale}
        providers={props.providers}
        sessions={props.sessions}
        selectedSessionId={props.selectedSessionId}
        detail={props.detail}
        selectedRequestId={props.selectedRequestId}
        sessionPageError={props.sessionPageError}
        detailPageError={props.detailPageError}
        sessionLoading={props.sessionLoading}
        detailLoading={props.detailLoading}
        monitoringError={props.monitoringError}
        providerError={props.providerError}
        detailError={props.detailError}
        distributionComplete={
          Boolean(props.sessionsComplete) &&
          props.sessions !== null &&
          props.sessions.has_more === false &&
          !props.sessionPageError &&
          !props.monitoringError &&
          props.sessions.storage.enabled !== false &&
          !props.sessions.storage.error
        }
        sessionListEpoch={props.sessionListEpoch}
        detailListEpoch={props.detailListEpoch}
        t={props.t}
        formatDateTime={props.formatDateTime}
        onSelectSession={props.onSelectSession}
        onLoadMoreSessions={props.onLoadMoreSessions}
        onLoadMoreDetail={props.onLoadMoreDetail}
        onRetrySessions={props.onRetrySessions}
        onRetryDetail={props.onRetryDetail}
        onRetryMonitoring={props.onRetryMonitoring}
        onRetrySelectedDetail={props.onRetrySelectedDetail}
        onSelectRequest={props.onSelectRequest}
      />
    </div>
  );
}
