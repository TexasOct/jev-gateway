import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { LocaleProvider, useLocale } from "@/shared/i18n";
import { SessionInspector } from "../components/SessionInspector";

afterEach(() => vi.unstubAllGlobals());

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
