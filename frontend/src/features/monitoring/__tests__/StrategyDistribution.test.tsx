import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { LocaleProvider, useLocale } from "@/shared/i18n";
import { StrategyDistribution } from "../components/StrategyDistribution";

afterEach(() => vi.unstubAllGlobals());

it.each(["en", "zh-CN"] as const)("shows an untagged inherited model as configured before any sessions in %s", (locale) => {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    localStorage: { getItem: () => locale, setItem: vi.fn() },
  });
  const strategy = { name: "balanced", kind: "policy", description: null, policy: { labels: { default: {}, missing: {} } } };
  function View({ cleared }: { cleared: boolean }) {
    const { t } = useLocale();
    return <StrategyDistribution
      strategies={{ object: "list", default: "balanced", data: [strategy] }}
      policyCatalog={{ defaults: { default_model: cleared ? null : "p/global" }, strategies: [strategy], models: [{ name: "p/global", tags: [] }, { name: "p/literal", tags: ["balanced/default"] }] }}
      sessions={{ storage: {}, evidence_available: true, data: [], page_size: 30, has_more: false, next_cursor: null }}
      sessionsComplete sessionPageError={false} monitoringError={false} locale={locale} t={t}
      onRetrySessions={vi.fn()} onRetryMonitoring={vi.fn()} />;
  }
  const html = renderToStaticMarkup(<LocaleProvider><View cleared={false} /></LocaleProvider>);
  expect(html).toContain('data-route-target="p/global"');
  expect(html).toContain(locale === "en" ? "Default · inherited global model" : "默认 · 继承全局模型");
  expect(html).toContain(locale === "en" ? "Configured · no sessions" : "已配置 · 无会话");
  expect(html).toContain('data-route-target="p/literal"');
  const cleared = renderToStaticMarkup(<LocaleProvider><View cleared /></LocaleProvider>);
  expect(cleared).not.toContain('data-route-target="p/global"');
  expect(cleared).not.toContain("data-global-default");
  expect(cleared).toContain(locale === "en" ? "Settings" : "通用设置");
});

it("constrains strategy tab width while preserving the name and count", () => {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    localStorage: { getItem: () => "en", setItem: vi.fn() },
  });
  const longName = "strategy-with-a-very-long-name-that-should-not-expand-the-tab";
  function View() {
    const { t } = useLocale();
    return <StrategyDistribution
      strategies={{ object: "list", default: longName, data: [{ name: longName }] }}
      sessions={{ storage: {}, evidence_available: true, data: [{ session_id: "one", strategy: longName, provider: "p", upstream_model: "m" }], page_size: 30, has_more: false, next_cursor: null }}
      sessionsComplete={true}
      sessionPageError={false} monitoringError={false} locale="en" t={t}
      onRetrySessions={vi.fn()} onRetryMonitoring={vi.fn()}
    />;
  }
  const html = renderToStaticMarkup(<LocaleProvider><View /></LocaleProvider>);
  expect(html).toContain("max-w-[min(13rem,75vw)]");
  expect(html).toContain("min-w-0 truncate");
  expect(html).toContain("shrink-0 text-xs text-ink-muted tabular-nums");
  expect(html).toContain(longName);
  expect(html).toMatch(/<small[^>]*>1<\/small>/);
});

it("keeps partial session counts distinct from in-flight activity", () => {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    localStorage: { getItem: () => "en", setItem: vi.fn() },
  });
  const retry = vi.fn();
  function View() {
    const { t } = useLocale();
    return <StrategyDistribution
      strategies={{ object: "list", default: "balanced", data: [{ name: "balanced" }] }}
      sessions={{ storage: {}, evidence_available: true, data: [{ session_id: "one", strategy: "balanced", provider: "p", upstream_model: "m" }], page_size: 30, has_more: true, next_cursor: "next" }}
      sessionsComplete={false}
      sessionPageError={true} monitoringError={false} locale="en" t={t}
      onRetrySessions={retry} onRetryMonitoring={retry}
    />;
  }
  const html = renderToStaticMarkup(<LocaleProvider><View /></LocaleProvider>);
expect(html).toContain("Partial");
  expect(html).toContain("Activity unavailable");
  expect(html).toMatch(/<span[^>]*>1\+<\/span>/);
  expect(retry).not.toHaveBeenCalled();
});
