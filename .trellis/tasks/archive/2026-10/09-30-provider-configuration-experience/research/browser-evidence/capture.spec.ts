import { writeFileSync } from "node:fs";
import type { Page, BrowserContext, Route } from "/Users/texas/Workspace/jev-llmroute-test/frontend/node_modules/@playwright/test/index.mjs";
import { test, expect } from "/Users/texas/Workspace/jev-llmroute-test/frontend/tests/fixtures/provider-browser";
import { installProviderFixture, providerFixture } from "/Users/texas/Workspace/jev-llmroute-test/frontend/tests/fixtures/provider-management";
import type { ProviderFixtureState } from "/Users/texas/Workspace/jev-llmroute-test/frontend/tests/fixtures/provider-management";

const evidence = "/Users/texas/Workspace/jev-llmroute-test/.trellis/tasks/09-30-provider-configuration-experience/research/browser-evidence";
const state = (): ProviderFixtureState => ({ configuration: providerFixture(), writes: [], validations: [], selectors: [] });
async function open(page: Page, width: number, locale: "en" | "zh-CN", scheme: "light" | "dark") {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.addInitScript((language) => localStorage.setItem("jev-dashboard-locale", language), locale);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: locale === "en" ? "Provider & models" : "Provider 与模型配置", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture provider", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: locale === "en" ? /^Loading/ : /^加载中/ })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(scheme);
}
function audit(context: BrowserContext) {
  const requests: Array<{ method: string; origin: string; path: string }> = [];
  context.on("request", request => { const url = new URL(request.url()); requests.push({ method: request.method(), origin: url.origin, path: url.pathname }); });
  return requests;
}
async function snapshot(page: Page, name: string, s: ProviderFixtureState, requests: ReturnType<typeof audit>, details: Record<string, unknown> = {}) {
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, scheme: getComputedStyle(document.documentElement).colorScheme, pageHeight: document.documentElement.scrollHeight }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport);
  expect(s.writes).toEqual([]);
  expect(s.validations).toEqual([]);
  expect(requests.filter(request => request.origin !== "http://127.0.0.1:4182")).toEqual([]);
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true, animations: "disabled" });
  writeFileSync(`${evidence}/${name}.json`, JSON.stringify({ screenshot: `${evidence}/${name}.png`, geometry, writes: s.writes.length, validations: s.validations.length, discoveryCalls: s.selectors.length, metadataCalls: s.metadataCalls ?? 0, requests, ...details }, null, 2) + "\n");
}
async function tabFocus(page: Page, label: string) {
  await page.getByLabel(label, { exact: true }).focus();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => { const element = document.activeElement as HTMLElement; return { tag: element.tagName, name: element.getAttribute("name"), text: element.textContent, outlineStyle: getComputedStyle(element).outlineStyle, outlineWidth: getComputedStyle(element).outlineWidth }; });
  expect(focused.outlineStyle).not.toBe("none");
  expect(parseFloat(focused.outlineWidth)).toBeGreaterThan(0);
  return focused;
}

test("1280 English light: local DeepSeek library and custom form keyboard behavior", async ({ page, context }) => {
  const s = state();
  s.configuration.presets.push({ kind: "llm", id: "deepseek", display_name: "DeepSeek", brand_id: "deepseek", icon_id: null, type: "deepseek", api_base: "https://api.deepseek.com/v1", api_key_env: "DEEPSEEK_API_KEY" });
  await installProviderFixture(context, s); const requests = audit(context);
  await open(page, 1280, "en", "light");
  await page.getByRole("button", { name: "Add provider", exact: true }).focus();
  await page.keyboard.press("Enter");
  const image = page.getByRole("button", { name: "DeepSeek deepseek", exact: true }).locator("img");
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const artwork = await image.evaluate(element => { const img = element as HTMLImageElement; const rect = img.getBoundingClientRect(); return { src: img.src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, width: rect.width, height: rect.height }; });
  expect(new URL(artwork.src).pathname).toMatch(/^\/dashboard\/assets\/deepseek.*\.svg$/);
  expect(artwork.width / artwork.height).toBeCloseTo(artwork.naturalWidth / artwork.naturalHeight, 1);
  await page.getByText("Supplier artwork and attribution", { exact: true }).click();
  await expect(page.getByText("Copyright (c) 2023 DeepSeek", { exact: false })).toBeVisible();
  const libraryFocus = await tabFocus(page, "Search supplier, alias or transport");
  await snapshot(page, "01-library-1280-en-light", s, requests, { artwork, libraryFocus, enterOpenedLibrary: true });
  await page.getByRole("button", { name: "Custom provider", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Instance ID", { exact: true }).fill("synthetic-custom");
  await page.getByLabel("Display name", { exact: true }).fill("Custom fixture provider");
  await page.getByLabel("Endpoint URL", { exact: true }).fill("https://example.test/custom");
  await page.getByText("Advanced configuration", { exact: true }).click();
  await page.getByRole("button", { name: "Cloud", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Cloud", exact: true })).toHaveAttribute("aria-pressed", "true");
  const formFocus = await tabFocus(page, "Display name");
  await snapshot(page, "02-custom-1280-en-light", s, requests, { formFocus, enterSelectedCloud: true });
  const dialogs: Array<{type:string,message:string,decision:string}> = [];
  page.once("dialog", async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message(), decision: "dismiss" }); await dialog.dismiss(); });
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Custom fixture provider");
  page.once("dialog", async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message(), decision: "accept" }); await dialog.accept(); });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Add provider", exact: true })).toBeFocused();
  expect(dialogs.map(dialog => dialog.type)).toEqual(["confirm", "confirm"]);
  expect(s.writes).toEqual([]);
  writeFileSync(`${evidence}/keyboard-confirmation.json`, JSON.stringify({ libraryFocus, formFocus, enterOpenedLibrary: true, enterOpenedCustom: true, enterSelectedCloud: true, escapeDismissPreservesDraft: true, escapeAcceptRestoresAddFocus: true, nativeConfirmDecisionsThroughPlaywright: dialogs, writes: s.writes.length }, null, 2) + "\n");
});

test("320 Chinese dark: custom provider complete form", async ({ page, context }) => {
  const s = state(); await installProviderFixture(context, s); const requests = audit(context);
  await open(page, 320, "zh-CN", "dark");
  await page.getByRole("button", { name: "添加供应商", exact: true }).focus(); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "自定义供应商", exact: true }).focus(); await page.keyboard.press("Enter");
  await page.getByLabel("实例 ID", { exact: true }).fill("synthetic-custom-long-id");
  await page.getByLabel("显示名称", { exact: true }).fill("自定义供应商示例");
  await page.getByLabel("端点 URL", { exact: true }).fill("https://example.test/custom");
  await page.getByText("高级配置", { exact: true }).click();
  await page.getByRole("button", { name: "云", exact: true }).click();
  const focus = await tabFocus(page, "显示名称");
  await snapshot(page, "03-custom-320-zh-dark", s, requests, { focus });
});

test("390 English dark: unknown metadata remains blocked", async ({ page, context }) => {
  const s = state(); s.metadataUnknown = true; await installProviderFixture(context, s); const requests = audit(context);
  await open(page, 390, "en", "dark");
  await page.getByRole("button", { name: "Find models", exact: true }).click();
  await page.getByLabel("Upstream model ID", { exact: true }).fill("manual-unknown");
  await page.getByLabel("Upstream model ID", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Query model metadata", exact: true }).click();
  const model = page.getByRole("region", { name: "fixture/manual-unknown", exact: true });
  await expect(model.getByText("Source value is unknown.", { exact: true })).toHaveCount(10);
  await expect(model.getByLabel("Tools", { exact: true })).toHaveValue("");
  await expect(model.getByLabel("Input price (USD / million tokens)")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Confirm and import selected models (1)", exact: true })).toBeDisabled();
  await model.getByText("Sources and evidence", { exact: true }).click();
  await model.getByLabel("Tools", { exact: true }).focus();
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => { const element = document.activeElement as HTMLElement; return { tag: element.tagName, outlineStyle: getComputedStyle(element).outlineStyle, outlineWidth: getComputedStyle(element).outlineWidth }; });
  expect(focus.outlineStyle).not.toBe("none");
  expect(parseFloat(focus.outlineWidth)).toBeGreaterThan(0);
  await snapshot(page, "04-metadata-unknown-390-en-dark", s, requests, { unknownCues: 10, importDisabled: true, focus });
});

test("1280 English light: conflicting metadata exposes source review", async ({ page, context }) => {
  const s = state();
  // Wrap the existing mock fixture's fulfill operation. No HTTP fetch occurs.
  const fixtureContext = new Proxy(context, { get(target, property) {
    if (property === "route") return async (pattern: string, handler: (route: Route) => Promise<void>) => target.route(pattern, async route => {
      const wrappedRoute = new Proxy(route, { get(original, key) {
        if (key === "fulfill") return async (options: Parameters<Route["fulfill"]>[0]) => {
          if (new URL(original.request().url()).pathname === "/v1/provider-metadata" && typeof options.body === "string") {
            const body = JSON.parse(options.body);
            for (const item of body.items) {
              const first = item.sources[0];
              item.sources.push({ ...first, source: "openrouter", url: "https://example.test/conflicting-model-data", fields: { ...first.fields, tools: { value: true, source_field: "tools" }, input_per_million: { value: 4, source_field: "input_per_million", unit: "USD/M tokens" } } });
              item.metadata.sources.push({ ...item.metadata.sources[0], id: "conflicting-fixture-1", source: "openrouter", url: "https://example.test/conflicting-model-data", fields: item.sources[1].fields });
              item.metadata.fields.tools = { status: "conflict", value: null, source_ids: ["native_listing-0", "conflicting-fixture-1"] };
              item.metadata.fields.input_per_million = { status: "conflict", value: null, source_ids: ["native_listing-0", "conflicting-fixture-1"] };
            }
            return original.fulfill({ ...options, body: JSON.stringify(body) });
          }
          return original.fulfill(options);
        };
        const value = Reflect.get(original, key); return typeof value === "function" ? value.bind(original) : value;
      } });
      await handler(wrappedRoute);
    });
    const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
  } });
  await installProviderFixture(fixtureContext, s); const requests = audit(context);
  await open(page, 1280, "en", "light");
  await page.getByRole("button", { name: "Find models", exact: true }).click();
  await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await page.getByLabel("Search fetched models").fill("alpha");
  await page.getByRole("button", { name: "Select all visible unconfigured models", exact: true }).click();
  await page.getByRole("button", { name: "Query model metadata", exact: true }).click();
  const model = page.getByRole("region", { name: "fixture/alpha", exact: true });
  await expect(model.getByText("Sources conflict. Review and enter a value.", { exact: true })).toHaveCount(3);
  await expect(model.getByLabel("Tools", { exact: true })).toHaveValue("");
  await expect(model.getByLabel("Input price (USD / million tokens)")).toHaveValue("");
  await expect(model.getByLabel("Output price (USD / million tokens)")).toHaveValue("3");
  await expect(page.getByRole("button", { name: "Confirm and import selected models (1)", exact: true })).toBeDisabled();
  await model.getByText("Sources and evidence", { exact: true }).click();
  await expect(model.locator("pre")).toContainText("conflicting-model-data");
  await snapshot(page, "05-metadata-conflict-1280-en-light", s, requests, { conflictCues: 3, toolsValue: "", inputPrice: "", outputPrice: "3", importDisabled: true, fixtureOverride: "Existing fixture mock body adds a second applicable source with contradictory tools and input price; no fetch." });
});

test("390 English dark: first entry stays read only before and after load", async ({ page, context }) => {
  const s = state(); s.configuration.write_available = false;
  await installProviderFixture(context, s); const requests = audit(context);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let readSeen = false;
  await context.route("**/v1/provider-configuration", async route => { if (route.request().method() === "GET") { readSeen = true; await gate; } await route.fallback(); });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Provider & models", exact: true }).click();
  await expect.poll(() => readSeen).toBe(true);
  await expect(page.getByRole("button", { name: "Add provider", exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("heading", { name: "Fixture provider", exact: true })).toBeVisible();
  await expect(page.getByText("Configuration writes are disabled.", { exact: false })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Loading/ })).toHaveCount(0);
  for (const name of ["Add provider", "Edit", "Find models", "Delete provider"]) await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Decision providers", exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
  await snapshot(page, "06-readonly-first-entry-390-en-dark", s, requests, { addDisabledWhileLoading: true, disabledAfterLoad: ["Add provider", "Edit", "Find models", "Delete provider"], tabSwitchEnabled: true });
});
