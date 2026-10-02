import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { LocaleProvider, useLocale } from "@/shared/i18n";
import { SessionInspector } from "../components/SessionInspector";
import type { Locale } from "@/shared/i18n";
import type { PolicyCatalog, SessionRow } from "@/shared/api/types";

afterEach(() => vi.unstubAllGlobals());

it.each<Locale>(["en", "zh-CN"])("preserves pinned default source in preview, list and detail-only overview in %s", (locale) => {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    localStorage: { getItem: () => locale, setItem: vi.fn() },
  });
  const catalog: PolicyCatalog = { models: [], strategies: [{ name: "task_aware", description: null, policy: { labels: { default: {}, missing: {} } } }] };
  const noop = vi.fn();
  function View({ defaulted, detailOnly, selected }: { defaulted: boolean; detailOnly: boolean; selected: boolean }) {
    const { t, formatDateTime } = useLocale();
    const session: SessionRow = { session_id: "pin", route: "p/global", strategy: "task_aware", label: "default", defaulted, reason: "session_pinned", provider: "p", upstream_model: "global", turn_count: 50 };
    return <SessionInspector policyCatalog={catalog}
      locale={locale} t={t} formatDateTime={formatDateTime} providers={null}
      sessions={{ data: detailOnly ? [] : [session], storage: {}, evidence_available: true, page_size: 30, has_more: false, next_cursor: null }}
      selectedSessionId={selected || detailOnly ? "pin" : null}
      detail={detailOnly ? { session: { ...session }, storage: {}, evidence_available: true, requests: [], page_size: 30, has_more: false, next_cursor: null } : null}
      selectedRequestId={null} sessionPageError={false} detailPageError={false} sessionLoading={false} detailLoading={false}
      monitoringError={false} detailError={false} distributionComplete sessionListEpoch={0} detailListEpoch={0}
      onSelectSession={noop} onLoadMoreSessions={noop} onLoadMoreDetail={noop} onRetrySessions={noop} onRetryDetail={noop}
      onRetryMonitoring={noop} onRetrySelectedDetail={noop} onSelectRequest={noop} />;
  }
  for (const defaulted of [false, true]) for (const selected of [false, true]) for (const detailOnly of [false, true]) {
    const html = renderToStaticMarkup(<LocaleProvider><View defaulted={defaulted} selected={selected} detailOnly={detailOnly} /></LocaleProvider>);
    const label = defaulted ? locale === "en" ? "Default" : "默认" : "default";
    expect(html.match(new RegExp(`task_aware · ${label} · p/global`, "g"))).toHaveLength(detailOnly ? 1 : 2);
  }
});

it.each<Locale>(["en", "zh-CN"])("renders default and custom labels in session previews and rows in %s", (locale) => {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    localStorage: { getItem: () => locale, setItem: vi.fn() },
  });
  const noop = vi.fn();
  function View({ label, selected }: { label: string; selected: boolean }) {
    const { t, formatDateTime } = useLocale();
    return <SessionInspector
      locale={locale} t={t} formatDateTime={formatDateTime}
      providers={null} sessions={{ data: [{ session_id: "one", route: "p/m", strategy: "task_aware", label, provider: "p", upstream_model: "m" }], storage: {}, evidence_available: true, page_size: 30, has_more: false, next_cursor: null }}
      selectedSessionId={selected ? "one" : null} detail={null} selectedRequestId={null}
      sessionPageError={false} detailPageError={false} sessionLoading={false} detailLoading={false}
      monitoringError={false} detailError={false} distributionComplete={true}
      sessionListEpoch={0} detailListEpoch={0}
      onSelectSession={noop} onLoadMoreSessions={noop} onLoadMoreDetail={noop}
      onRetrySessions={noop} onRetryDetail={noop} onRetryMonitoring={noop}
      onRetrySelectedDetail={noop} onSelectRequest={noop}
    />;
  }
  for (const selected of [false, true]) {
    for (const label of ["default", "Custom label", "Default"]) {
      const html = renderToStaticMarkup(<LocaleProvider><View label={label} selected={selected} /></LocaleProvider>);
      const displayed = label === "default" ? locale === "en" ? "Default" : "默认" : label;
      expect(html.match(new RegExp(`task_aware · ${displayed} · p/m`, "g"))).toHaveLength(2);
      expect(html).toContain(`aria-pressed="${selected}"`);
    }
  }
});

it("keeps the latest session an unselected preview with no detail fetch", () => {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    localStorage: { getItem: () => "en", setItem: vi.fn() },
  });
  const select = vi.fn();
  const noop = vi.fn();
  function View() {
    const { locale, t, formatDateTime } = useLocale();
    return <SessionInspector
      locale={locale} t={t} formatDateTime={formatDateTime}
      providers={null} sessions={{ data: [{ session_id: "one", route: "p/m", latest_request: { request_id: "r", received_at: 1000, ok: null } }], storage: {}, evidence_available: true, page_size: 30, has_more: false, next_cursor: null }}
      selectedSessionId={null} detail={null} selectedRequestId={null}
      sessionPageError={false} detailPageError={false} sessionLoading={false} detailLoading={false}
      monitoringError={false} detailError={false} distributionComplete={true}
      sessionListEpoch={0} detailListEpoch={0}
      onSelectSession={select} onLoadMoreSessions={noop} onLoadMoreDetail={noop}
      onRetrySessions={noop} onRetryDetail={noop} onRetryMonitoring={noop}
      onRetrySelectedDetail={noop} onSelectRequest={noop}
    />;
  }
  const html = renderToStaticMarkup(<LocaleProvider><View /></LocaleProvider>);
  expect(html).toContain("This session is not selected.");
  expect(html).toContain("Recorded result: Outcome unknown");
  expect(html).toMatch(/class="session [^"]*" aria-pressed="false"/);
  expect(select).not.toHaveBeenCalled();
});
