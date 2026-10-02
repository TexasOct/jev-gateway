import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { ProviderConfiguration } from "@/shared/api/types";
import { LocaleProvider, useLocale } from "@/shared/i18n";
import type { Locale } from "@/shared/i18n";
import type { ProviderManagement } from "@/features/providers/useProviderManagement";
import { GlobalDefaultModel } from "./GlobalDefaultModel";

afterEach(() => vi.unstubAllGlobals());

const configuration: ProviderConfiguration = {
  revision: "fixture", write_available: true, defaults: { default_model: "p/model" },
  providers: [], decision: { enabled: false, default_provider: null, timeout_seconds: 1, providers: [] },
  models: [{ name: "p/model", provider: "p", upstream_model: "model", tags: [], api_base: null, provider_type: "openai", has_api_key: false, priority: 0, quality: 0.5,
    capabilities: { tools: false, vision: false, json_mode: false, reasoning: false, temperature: true, reasoning_effort: [] }, cost: { input_per_million: 1, output_per_million: 2 }, context_window: null, max_output_tokens: null }],
  presets: [], provider_types: [], decision_protocols: [],
};

function renderSettings(locale: Locale, overrides: Partial<ProviderManagement> = {}): string {
  vi.stubGlobal("window", { localStorage: { getItem: () => locale, setItem: vi.fn() } });
  const manager = { configuration, loading: false, pending: false, error: null, catalogRefreshFailed: false, refreshingCatalog: false, save: vi.fn(), load: vi.fn(), retryCatalogRefresh: vi.fn(), ...overrides } as ProviderManagement;
  function View() {
    const { t } = useLocale();
    return <GlobalDefaultModel manager={manager} t={t} onOpenProviders={vi.fn()} />;
  }
  return renderToStaticMarkup(<LocaleProvider><View /></LocaleProvider>);
}

it.each<Locale>(["en", "zh-CN"])("renders the saved global default and canonical model option in %s", (locale) => {
  const html = renderSettings(locale);
  expect(html).toContain(locale === "en" ? "Current default: p/model" : "当前默认模型: p/model");
  expect(html).toContain('<option value="p/model" selected="">p/model</option>');
  expect(html).toContain(locale === "en" ? "Clear default model" : "清除默认模型");
});

it("disables global model controls while loading, pending or read-only", () => {
  for (const overrides of [{ loading: true }, { pending: true }, { configuration: { ...configuration, write_available: false } }]) {
    const html = renderSettings("en", overrides);
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Clear default model<\/button>/);
  }
});

it("offers provider navigation when there are no imported models", () => {
  const html = renderSettings("zh-CN", { configuration: { ...configuration, defaults: undefined, models: [] } });
  expect(html).toContain("请先在 Provider 与模型配置中导入模型");
  expect(html).toContain("未设置全局默认模型");
});

it("distinguishes revision conflict from a committed write whose refresh failed", () => {
  expect(renderSettings("en", { error: 409 })).toContain("Configuration changed elsewhere");
  const html = renderSettings("en", { catalogRefreshFailed: true });
  expect(html).toContain("The global default model was saved, but routing data could not be refreshed");
  expect(html).toContain("Retry catalog refresh");
});
