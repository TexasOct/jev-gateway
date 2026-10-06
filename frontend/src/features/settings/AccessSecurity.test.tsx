import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "@/shared/i18n";
import type { Locale } from "@/shared/i18n";
import type { ProviderManagement } from "@/features/providers/shared/useProviderManagement";
import { AccessSecurity } from "./AccessSecurity";

afterEach(() => vi.unstubAllGlobals());

function render(locale: Locale, overrides: Partial<ProviderManagement> = {}) {
  vi.stubGlobal("window", { localStorage: { getItem: () => locale } });
  const manager = {
    configuration: { gateway: { has_api_key: true, api_key_env: "DO_NOT_RENDER_REFERENCE" }, write_available: true, gateway_bootstrap_available: false },
    active: true, loading: false, pending: false, error: null, operationError: null, errorOwner: "read", navigationGuardRef: { current: null },
    ...overrides,
  } as ProviderManagement;
  function View() { const { t } = useLocale(); return <AccessSecurity manager={manager} t={t} />; }
  return renderToStaticMarkup(<LocaleProvider><View /></LocaleProvider>);
}

it.each<Locale>(["en", "zh-CN"])("explains all credential roles without showing saved values in %s", (locale) => {
  const html = render(locale);
  expect(html).toContain(locale === "en" ? "Access and security" : "访问与安全");
  expect(html).toContain(locale === "en" ? "no separate administrator key" : "没有独立的管理员密钥");
  expect(html).toContain(locale === "en" ? "Replacement takes effect immediately" : "替换后立即生效");
  expect(html).not.toContain("DO_NOT_RENDER_REFERENCE");
  expect(html).not.toContain("<input");
});

it("offers bootstrap only when no gateway key exists", () => {
  const pending = { gateway: { has_api_key: false, api_key_env: null }, write_available: false, gateway_bootstrap_available: true } as ProviderManagement["configuration"];
  expect(render("en", { configuration: pending })).toContain("Initialize access key</button>");
  expect(render("en", { configuration: { ...pending!, gateway: { has_api_key: true, api_key_env: null } } })).not.toContain("Replace access key</button>");
});

it("shows status and recovery when the configuration is unavailable", () => {
  expect(render("en", { configuration: null, loading: true })).toContain("Reading gateway access status");
  const html = render("en", { configuration: null });
  expect(html).toContain("Gateway access status is unavailable");
  expect(html).toContain("Reload current configuration</button>");
  expect(html).not.toContain("Not configured");
});

it.each([400, 401, 403, 409, 500, 0])("gives safe configuration recovery instructions for status %s", (error) => {
  const html = render("en", { operationError: error, errorOwner: error === 401 ? "gateway" : "read" });
  expect(html).toContain('role="alert"');
  expect(html).toContain(error === 401 ? "no longer authorized" : "Gateway configuration could not be read");
  expect(html).toContain("Reload current configuration</button>");
});

it("does not report another Settings operation as a gateway failure", () => {
  expect(render("en", { errorOwner: "default", operationError: 500 })).not.toContain('role="alert"');
  expect(render("en", { errorOwner: "read", operationError: 503 })).toContain("Gateway configuration could not be read");
});
