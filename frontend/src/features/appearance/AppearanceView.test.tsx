import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "@/shared/i18n";
import { DEFAULT_SEED } from "@/shared/theme/palette";
import AppearanceView from "./AppearanceView";

function renderView(locale: "en" | "zh-CN" = "en", options: { seed?: string; notice?: string | null; error?: string | null; loading?: boolean } = {}) {
  vi.stubGlobal("window", { localStorage: { getItem: () => locale, setItem: vi.fn() } });
  function View() {
    const { t } = useLocale();
    return <AppearanceView seed={options.seed ?? DEFAULT_SEED} locale={locale} onLocaleChange={() => {}} schemePreference="system" onSchemeChange={() => {}} notice={options.notice ?? null} error={options.error} loading={options.loading} onSeedChange={() => {}} t={t} />;
  }
  return renderToStaticMarkup(<LocaleProvider><View /></LocaleProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("appearance presentation", () => {
  it.each(["en", "zh-CN"] as const)("renders three peer settings rows and localized theme presets in %s", (locale) => {
    const html = renderView(locale);
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).toContain(locale === "en" ? 'aria-label="Language"' : 'aria-label="语言"');
    expect(html).toContain(locale === "en" ? 'aria-label="Color scheme"' : 'aria-label="配色方案"');
    expect(html).toContain('type="color"');
    expect(html).toContain(locale === "en" ? "Blue #3b66d9" : "蓝色 #3b66d9");
    expect(html).toContain(locale === "en" ? "Choose color" : "选择颜色");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("lucide-pencil");
    expect(html).not.toContain("lucide-check");
    expect(html).not.toContain("aria-pressed:border-ink");
    expect(html).toContain('data-selected="false"');
    expect(html).not.toContain('type="text"');
    expect(html).not.toContain("appearance-demo");
    expect(html).not.toContain("appearance-chip");
    expect(html).not.toContain("appearance-table");
    expect(html).not.toContain("Measured contrast");
    expect(html).not.toContain("Save seed");
    expect(html).not.toContain("Reset to default");
  });

  it("keeps a custom seed selected in the native picker", () => {
    const html = renderView("en", { seed: "#d9aa39" });
    expect(html).toContain('type="color" aria-label="Choose color" title="Choose color" value="#d9aa39"');
    expect(html).toContain('data-selected="true"');
    expect(html).not.toContain('aria-pressed="true"');
  });

  it("shows scoped write status, loading and errors and disables controls", () => {
    const html = renderView("zh-CN", { notice: "Saved", error: "Network error", loading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Saved");
    expect(html).toContain("Network error");
    expect(html).not.toContain("配置写入已禁用");
    expect(html).toContain('type="color" aria-label="选择颜色" title="选择颜色" disabled="" value="#3b66d9"');
    expect(html).toContain('aria-pressed="true" title="蓝色 #3b66d9" disabled=""');
  });
});
