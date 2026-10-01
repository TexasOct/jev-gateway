import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";
import { LocaleProvider } from "@/shared/i18n";
import type { Palette } from "@/shared/theme/palette";

afterEach(() => vi.unstubAllGlobals());

it("keeps top-level view navigation labels from setting oversized button widths", () => {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    localStorage: { getItem: () => "en", setItem: vi.fn() },
  });
  const t = vi.fn((key: string) => ({
    monitoring: "Monitoring",
    strategyEditor: "Strategy workflow",
    providerModels: "Provider & models",
    settings: "Settings",
    views: "Views",
    refresh: "Refresh",
    colorScheme: "Color scheme",
    language: "Language",
    english: "English",
    chinese: "Chinese",
  }[key] ?? key));
  const unused = vi.fn();
  const markup = renderToStaticMarkup(
    <LocaleProvider>
      <AppShell
        view="monitoring"
        needsKey={false}
        keyDraft=""
        error={null}
        locale="en"
        setLocale={unused}
        t={t as never}
        formatDateTime={unused as never}
        schemePreference="system"
        setSchemePreference={unused}
        configuration={null}
        monitoring={{
          strategies: null,
          policyCatalog: null,
          strategyError: false,
          sessionsComplete: false,
          providers: null,
          sessions: null,
          selected: null,
          detail: null,
          selectedRequestId: null,
          sessionPageError: false,
          detailPageError: false,
          sessionLoading: false,
          detailLoading: false,
          monitoringError: false,
          providerError: false,
          detailError: false,
          sessionListEpoch: 0,
          detailListEpoch: 0,
          selectSession: unused,
          loadMoreSessions: unused,
          loadMoreDetail: unused,
          retryDetailPage: unused,
          retrySelectedDetail: unused,
          setSelectedRequestId: unused,
        } as never}
        routeActivity={{ activity: null, activityError: false, activitySequence: 0, retry: unused }}
        theme={{
          seed: "#3b66d9",
          savedSeed: "#3b66d9",
          schemePreference: "system",
          setSchemePreference: unused,
          activePalette: {} as Palette,
          resolvedScheme: "light",
          notice: null,
          themeLoading: false,
          themeError: null,
          themeWritePending: false,
          saveTheme: unused,
          resetTheme: unused,
          changeSeed: unused,
        }}
        onOpenView={unused}
        onRefresh={unused}
        onConnect={unused as never}
        onKeyDraftChange={unused}
        onReloadConfiguration={unused as never}
        onError={unused}
        onRetryMonitoring={unused}
      />
    </LocaleProvider>,
  );
  const nav = markup.match(/<nav[^>]*data-dashboard-view-nav[^>]*>[\s\S]*?<\/nav>/)?.[0];
  expect(nav).toBeDefined();
  expect(nav).toContain("w-fit max-w-full");
  expect(nav).toContain("max-w-40");
  expect(nav).not.toContain("flex-1");
  expect(nav).not.toContain("min-w-max");
  expect(nav).toContain("Provider &amp; models");
  expect(nav).toContain("Settings");
  expect(nav).not.toContain("Theme</");
});
