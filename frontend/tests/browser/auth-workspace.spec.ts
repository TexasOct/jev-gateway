import { test, expect } from "../fixtures/provider-browser";
import { configuredModelEdit, openProviderModels } from "../fixtures/open-provider-models";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";
import type { Page } from "@playwright/test";

function fixture(): ProviderFixtureState {
  return { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
}
async function reconnect(page: Page) {
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  const key = page.locator("#gateway-api-key");
  await expect(key).toBeFocused();
  await key.fill("synthetic-reconnect-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
}

test("whole App retains simultaneous Settings drafts and scopes failed writes", async ({ page, context }) => {
  const state = fixture();
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  const key = page.getByLabel("New gateway access key", { exact: true });
  const model = page.locator("#settings-default-model");
  await key.fill("synthetic-unsaved-gateway-key");
  await model.selectOption("fixture/existing");
  state.rejectWrite = 401;
  await page.getByRole("button", { name: "Save default model", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeHidden();
  await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");
  await reconnect(page);
  await expect(model).toHaveValue("fixture/existing");
  await expect(key).toHaveValue("synthetic-unsaved-gateway-key");
  expect(state.configuration.defaults?.default_model).toBeNull();
  state.rejectGatewayWrite = 500;
  await page.getByRole("button", { name: "Save access key", exact: true }).click();
  await expect(page.getByRole("region", { name: "Gateway access key", exact: true }).getByRole("alert")).toBeVisible();
  await expect(page.getByRole("region", { name: "Global default model", exact: true }).getByRole("alert")).toHaveCount(0);
  await expect(key).toHaveValue("synthetic-unsaved-gateway-key");
  state.rejectGatewayWrite = 401;
  await page.getByRole("button", { name: "Save access key", exact: true }).click();
  await reconnect(page);
  await expect(key).toHaveValue("synthetic-unsaved-gateway-key");
  await expect(model).toHaveValue("fixture/existing");
  await page.getByRole("button", { name: "Save default model", exact: true }).click();
  await expect(model).toHaveValue("fixture/existing");
  await expect.poll(() => state.configuration.defaults?.default_model).toBe("fixture/existing");
  expect(state.writes).toHaveLength(2);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }))).not.toContain("synthetic-unsaved-gateway-key");
});

test("native model dialog suspends for login and reopens with its failed draft", async ({ page, context }, testInfo) => {
  const state = fixture();
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.setViewportSize({ width: 320, height: 740 });
  await openProviderModels(page, "fixture");
  await configuredModelEdit(page, "fixture", "existing").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name", { exact: true }).fill("Retained model name");
  state.rejectWrite = 401;
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("modal-suspended-login.png") });
  await reconnect(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Display name", { exact: true })).toHaveValue("Retained model name");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("modal-reconnected-draft.png") });
  expect(state.writes).toHaveLength(1);
});

test("whole App retains a supplier name and secret after unauthorized save", async ({ page, context }) => {
  const state = fixture();
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const name = page.getByLabel("Display name", { exact: true });
  const secret = page.getByLabel("New provider credential", { exact: true });
  await name.fill("Unsaved supplier name");
  await secret.fill("synthetic-supplier-retry-key");
  state.rejectWrite = 401;
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await reconnect(page);
  await expect(name).toHaveValue("Unsaved supplier name");
  await expect(secret).toHaveValue("synthetic-supplier-retry-key");
  expect(state.configuration.providers[0]?.display_name).toBe("Fixture provider");
  expect(state.writes).toHaveLength(1);
});

test("pending Settings writes block simultaneous submissions without clearing drafts", async ({ page, context }) => {
  const state = fixture();
  let release!: () => void;
  state.delayWrite = () => new Promise<void>((resolve) => { release = resolve; });
  state.rejectWrite = 503;
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  const key = page.getByLabel("New gateway access key", { exact: true });
  await key.fill("synthetic-pending-gateway-key");
  await page.locator("#settings-default-model").selectOption("fixture/existing");
  await page.getByRole("button", { name: "Save default model", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await expect(key).toBeDisabled();
  await expect(key).toHaveValue("synthetic-pending-gateway-key");
  await expect(page.getByRole("button", { name: "Save access key", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  expect(state.gatewayWrites ?? []).toEqual([]);
  release();
  await expect(page.getByRole("region", { name: "Global default model", exact: true }).getByRole("alert")).toContainText("selection is retained");
  await expect(page.getByRole("region", { name: "Gateway access key", exact: true }).getByRole("alert")).toHaveCount(0);
  await expect(key).toHaveValue("synthetic-pending-gateway-key");
  expect(state.writes).toHaveLength(1);
});

test("Chinese Settings drafts survive reconnect with visible login focus at 320px", async ({ page, context }) => {
  const state = fixture();
  await installProviderFixture(context, state);
  await page.addInitScript(() => localStorage.setItem("jev-dashboard-locale", "zh-CN"));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "通用设置", exact: true }).click();
  await page.getByRole("button", { name: "替换访问密钥", exact: true }).click();
  const key = page.getByLabel("新的网关访问密钥", { exact: true });
  await key.fill("synthetic-chinese-gateway-draft");
  await page.locator("#settings-default-model").selectOption("fixture/existing");
  state.rejectWrite = 401;
  await page.getByRole("button", { name: "保存默认模型", exact: true }).click();
  await expect(page.getByRole("heading", { name: "连接", exact: true })).toBeVisible();
  await expect(page.locator("#gateway-api-key")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("#gateway-api-key").fill("synthetic-chinese-reconnect-key");
  await page.getByRole("button", { name: "连接", exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  await expect(key).toHaveValue("synthetic-chinese-gateway-draft");
  await expect(page.locator("#settings-default-model")).toHaveValue("fixture/existing");
  expect(state.writes).toHaveLength(1);
});

for (const locale of ["en", "zh-CN"] as const) test(`initial gateway setup belongs to Settings at 320px in ${locale}`, async ({ page, context }, testInfo) => {
  const state = fixture();
  state.configuration.gateway.has_api_key = false;
  state.configuration.gateway_bootstrap_available = true;
  state.configuration.write_available = false;
  await installProviderFixture(context, state);
  await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/dashboard/");
  await expect(page.getByRole("heading", { name: locale === "en" ? "Settings" : "通用设置", exact: true })).toBeVisible();
  const access = page.getByRole("region", { name: locale === "en" ? "Access and security" : "访问与安全", exact: true });
  await expect(access).toContainText(locale === "en" ? "no separate administrator key" : "没有独立的管理员密钥");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`initial-settings-${locale}.png`), fullPage: true });
  const clean = await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
  expect(clean).toBe(false);
  await page.locator("#setup-key").fill("synthetic-initial-gateway-key");
  let attempts = 0;
  await page.route("**/v1/setup", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (++attempts === 1) return route.fulfill({ status: 503, json: { error: { message: "Synthetic setup failure" } } });
    return route.fallback();
  });
  const initialize = page.getByRole("button", { name: locale === "en" ? "Initialize gateway access key" : "初始化网关访问密钥", exact: true });
  await initialize.click();
  await expect(access.getByRole("alert")).toContainText("Synthetic setup failure");
  await expect(page.locator("#setup-key")).toHaveValue("synthetic-initial-gateway-key");
  await initialize.click();
  await expect(page.locator("#setup-key")).toHaveCount(0);
  expect(state.setupWrites).toHaveLength(1);
  expect(state.gatewayWrites ?? []).toEqual([]);
  expect(attempts).toBe(2);
});
