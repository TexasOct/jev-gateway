import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PolicyCatalog,
  ProvidersPayload,
  RetainedRequest,
  RoutingActivityPayload,
  SessionRequestsPayload,
  SessionsPayload,
} from "@/shared/api/types";
import { LocaleProvider, useLocale } from "@/shared/i18n";
import { MonitoringView } from "../MonitoringView";
import type { StrategiesPayload } from "../model/strategy-distribution";

const strategies: StrategiesPayload = {
  object: "list",
  default: "balanced",
  data: [{ name: "balanced" }, { name: "careful" }],
};

const sessions: SessionsPayload = {
  storage: {},
  evidence_available: true,
  data: [
    {
      session_id: "session-1",
      route: "balanced",
      latest_request: { request_id: "request-1", received_at: 1000, ok: null },
    },
  ],
  page_size: 30,
  next_cursor: null,
  has_more: false,
};
const request: RetainedRequest = {
  request: {
    request_id: "request-1",
    received_at: 1000,
    prompt: "retained private source",
  },
  decision: null,
  upstream_request: null,
  outcome: null,
};
const detail: SessionRequestsPayload = {
  session: { session_id: "session-1", route: "balanced" },
  storage: {},
  evidence_available: true,
  requests: [request],
  page_size: 30,
  next_cursor: null,
  has_more: false,
};
const providers: ProvidersPayload = {
  window: { seconds: 60, start: 0, end: 60, basis: "retained" },
  storage: {},
  evidence_available: true,
  providers: [],
};

function renderView(
  overrides: Partial<React.ComponentProps<typeof MonitoringView>> = {},
  locale: "en" | "zh-CN" = "en",
) {
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
    localStorage: { getItem: () => locale, setItem: vi.fn() },
  });
  function View() {
    const { locale, t, formatDateTime } = useLocale();
    return (
      <MonitoringView
        locale={locale}
        t={t}
        formatDateTime={formatDateTime}
        providers={providers}
        sessions={sessions}
        selectedSessionId="session-1"
        detail={detail}
        selectedRequestId={null}
        sessionPageError={false}
        detailPageError={false}
        sessionLoading={false}
        detailLoading={false}
        monitoringError={false}
        detailError={false}
        sessionListEpoch={0}
        detailListEpoch={0}
        onSelectSession={() => {}}
        onLoadMoreSessions={() => {}}
        onLoadMoreDetail={() => {}}
        onRetrySessions={() => {}}
        onRetryDetail={() => {}}
        onRetryMonitoring={() => {}}
        onRetrySelectedDetail={() => {}}
        onSelectRequest={() => {}}
        {...overrides}
      />
    );
  }
  return renderToStaticMarkup(
    <LocaleProvider>
      <View />
    </LocaleProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("monitoring presentation", () => {
  it("keeps the full recorded source disclosures alongside the selected route trace", () => {
    const html = renderView();
    expect(html).toContain("route-trace");
    expect(html).toContain("retained private source");
    expect(html).toContain("Inbound request");
    expect(html).toContain("Routing decision");
    expect(html).toContain("Upstream request");
    expect(html).toContain('data-outcome="unknown"');
    expect(html).not.toContain("Pending");
  });

  it("explains initial and detail errors without claiming an empty or loading session", () => {
    const html = renderView({
      sessions: null,
      providers: null,
      selectedSessionId: null,
      detail: null,
      monitoringError: true,
    });
    expect(html).toContain("Could not load current sessions. Try again.");
    expect(html).not.toContain("No configured providers");
    expect(html).not.toContain("No active sessions yet");
    const detailHtml = renderView({ detail: null, detailError: true });
    expect(detailHtml).toContain(
      "Could not load requests for this session. Try again.",
    );
    expect(detailHtml).not.toContain(
      "No retained request records are available",
    );
  });

  it("does not call the latest-session preview a selected session", () => {
    const html = renderView({ selectedSessionId: null, detail: null });
    expect(html).toContain(
      "Select a session to view its requests and routing details.",
    );
    expect(html).toContain("Latest session preview");
    expect(html).toContain("This session is not selected.");
    expect(html).toMatch(/class="session [^"]*" aria-pressed="false"/);
    expect(html).not.toContain("Session selected. Loading");
  });

  it.each(["en", "zh-CN"] as const)(
    "labels recorded time and result in %s without selecting the preview",
    (locale) => {
      const copy =
        locale === "en"
          ? {
              timestamp: "Latest recorded request",
              result: "Recorded result",
              preview: "Latest session preview",
              hint: "This session is not selected.",
              yes: "Succeeded",
              no: "Failed",
              unknown: "Outcome unknown",
              absent: "Not recorded",
            }
          : {
              timestamp: "最近留存的请求",
              result: "留存结果",
              preview: "最新会话预览",
              hint: "尚未选择此会话。",
              yes: "成功",
              no: "失败",
              unknown: "结果未知",
              absent: "未记录",
            };
      const onSelectSession = vi.fn();
      for (const [latest, outcome] of [
        [{ request_id: "request-1", received_at: 1000, ok: true }, copy.yes],
        [{ request_id: "request-1", received_at: 1000, ok: false }, copy.no],
        [
          { request_id: "request-1", received_at: 1000, ok: null },
          copy.unknown,
        ],
        [null, copy.absent],
      ] as const) {
        const html = renderView(
          {
            sessions: {
              ...sessions,
              data: [
                {
                  session_id: "session-1",
                  route: "balanced",
                  latest_request: latest,
                },
              ],
            },
            selectedSessionId: null,
            detail: null,
            onSelectSession,
          },
          locale,
        );
        expect(html).toContain(`${copy.timestamp}:`);
        expect(html).toContain(`>${copy.result}: ${outcome}</span>`);
        expect(html).toContain(copy.preview);
        expect(html).toContain(copy.hint);
        expect(html).toMatch(/class="session [^"]*" aria-pressed="false"/);
      }
      expect(onSelectSession).not.toHaveBeenCalled();
    },
  );

  it.each(["en", "zh-CN"] as const)(
    "shows selected-session detail loading and failure in %s",
    (locale) => {
      const loading =
        locale === "en"
          ? "Loading retained requests for the selected session"
          : "正在读取所选会话的保留请求";
      const notSelected =
        locale === "en" ? "No session selected" : "尚未选择会话";
      const html = renderView({ detail: null }, locale);
      expect(html).toMatch(/class="session active [^"]*" aria-pressed="true"/);
      expect(html).toContain(loading);
      expect(html).not.toContain(notSelected);
      const failed = renderView({ detail: null, detailError: true }, locale);
      expect(failed).not.toContain(loading);
      expect(failed).toContain(
        locale === "en"
          ? "Could not load requests for this session. Try again."
          : "无法读取所选会话的请求记录。请重试。",
      );
      const unselected = renderView(
        { selectedSessionId: null, detail: null },
        locale,
      );
      expect(unselected).toContain(notSelected);
      expect(unselected).not.toContain(loading);
    },
  );

  it("uses semantic Tailwind utilities for monitoring surfaces and leaves virtual geometry scoped", () => {
    const html = renderView();
    expect(html).toContain("grid w-full max-w-[1280px]");
    expect(html).toContain("bg-panel-muted");
    expect(html).toContain("border-t-primary");
    expect(html).toContain("min-h-10 w-full");
  });

  it.each(["en", "zh-CN"] as const)(
    "distinguishes complete zero, observed route fallback and partial loading in %s",
    (locale) => {
      const complete = renderView(
        {
          strategies,
          sessionsComplete: true,
          sessions: {
            ...sessions,
            data: [
              {
                session_id: "session-1",
                strategy: "balanced",
                route: "fallback",
              },
            ],
          },
        },
        locale,
      );
      expect(complete).toMatch(/<span class="min-w-0 truncate">careful<\/span><small[^>]*>0<\/small>/);
      const zero = renderView(
        {
          strategies,
          sessionsComplete: true,
          sessions: { ...sessions, data: [] },
        },
        locale,
      );
      expect(zero).toContain(
        locale === "en"
          ? "No live sessions for this strategy."
          : "此策略没有活动会话。",
      );
      expect(complete).toContain(
        locale === "en"
          ? "Recorded · model unknown"
          : "已记录 · 模型未知",
      );
      expect(complete).toContain("fallback");
      const partial = renderView(
        {
          strategies,
          sessions: {
            ...sessions,
            has_more: true,
            next_cursor: "next",
            data: [],
          },
          sessionPageError: true,
        },
        locale,
      );
      expect(partial).toContain(
        locale === "en"
          ? "Partial"
          : "部分",
      );
      expect(partial).not.toContain(
        locale === "en"
          ? "No live sessions for this strategy."
          : "此策略没有活动会话。",
      );
    },
  );

  it("keeps attribution unknown and storage failure distinct from an empty distribution", () => {
    const html = renderView({
      strategies,
      sessionsComplete: true,
      sessions: {
        ...sessions,
        data: [{ session_id: "orphan" }],
        storage: { error: "offline" },
      },
    });
    expect(html).toContain("Storage unavailable");
    expect(html).toContain("Unknown strategy");
    expect(renderView({ strategies: null, strategyError: true })).toContain(
      "Could not list registered strategies.",
    );
  });

  it.each(["en", "zh-CN"] as const)(
    "describes in-flight paths without implying a recent-arrival window in %s",
    (locale) => {
      const activity: RoutingActivityPayload = {
        object: "routing.activity",
        scope: "process",
        instance_id: "worker",
        complete: true,
        paths: [
          {
            strategy: "balanced",
            route: "p/m",
            provider: "p",
            upstream_model: "m",
            in_flight_requests: 1,
            in_flight_streams: 0,
          },
        ],
      };
      const html = renderView(
        {
          strategies,
          activity,
          sessions: { ...sessions, data: [] },
          sessionsComplete: true,
        },
        locale,
      );
      expect(html).toContain(
        locale === "en"
          ? "In flight"
          : "进行中",
      );
      expect(html).not.toContain(
        locale === "en" ? "recent routed arrival" : "近期到达",
      );
    },
  );

  it("shows configured explicit model B without a session or active request, and does not invent custom pools", () => {
    const listed = {
      ...strategies,
      data: [
        {
          name: "balanced",
          kind: "auto",
          policy: { labels: { fast: { models: ["p/a", "p/b"] } } },
        },
        {
          name: "careful",
          kind: "custom",
          policy: { labels: { fast: { models: ["p/fake"] } } },
        },
      ],
    };
    const catalog: PolicyCatalog = {
      strategies: listed.data.map((entry) => ({ ...entry, description: null })),
      models: [
        { name: "p/a", tags: [] },
        { name: "p/b", tags: [] },
        { name: "p/fake", tags: [] },
      ],
    };
    const html = renderView({
      strategies: listed,
      policyCatalog: catalog,
      sessionsComplete: true,
      sessions: {
        ...sessions,
        data: [
          {
            session_id: "one",
            strategy: "balanced",
            provider: "p",
            upstream_model: "a",
          },
        ],
      },
    });
    expect(html).toContain("p/b");
    expect(html).toContain(
      "Configured · no sessions",
    );
    expect(html).toMatch(
      /<strong[^>]*>p\/b<\/strong><small[^>]*>Configured · no sessions<\/small><\/div><span[^>]*>—<\/span>/,
    );
    expect(html).not.toContain("p/fake");
    const partial = renderView({
      strategies: listed,
      policyCatalog: catalog,
      sessions: { ...sessions, data: [] },
    });
    expect(partial).toContain("p/a");
    expect(partial).toContain(
      "Configured · partial",
    );
  });

  it("discloses the evidence caveat before the collapsed provider table", () => {
    const html = renderView();
    expect(html.indexOf("monitoring-provider-caveat")).toBeLessThan(
      html.indexOf("monitoring-provider-details"),
    );
  });
});
