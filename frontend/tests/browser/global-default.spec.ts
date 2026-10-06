import { test, expect } from "./fixtures";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";

function fixture(): ProviderFixtureState {
  return { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
}

async function openSettings(page: import("@playwright/test").Page, locale: "en" | "zh-CN" = "en") {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: locale === "en" ? "Settings" : "通用设置", exact: true }).click();
  return page.getByRole("region", { name: locale === "en" ? "Global default model" : "全局默认模型", exact: true });
}

for (const locale of ["en", "zh-CN"] as const) for (const width of [1280, 320]) {
  test(`global default displays, clears and saves through revisioned management (${locale}, ${width})`, async ({ page, context }) => {
    const state = fixture();
    state.configuration.defaults = { default_model: "fixture/existing" };
    await installProviderFixture(context, state);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
    let setupReads = 0;
    await page.route("**/v1/setup", async (route) => {
      setupReads++;
      const ready = state.configuration.defaults?.default_model != null;
      await route.fulfill({ json: { required: false, local_setup_available: true, revision: "fixture", has_providers: true, has_models: true, routing_ready: ready, next_step: ready ? "ready" : "routing" } });
    });
    const region = await openSettings(page, locale);
    const select = region.getByLabel(locale === "en" ? "Global default model" : "全局默认模型", { exact: true });
    const save = region.getByRole("button", { name: locale === "en" ? "Save default model" : "保存默认模型", exact: true });
    const clear = region.getByRole("button", { name: locale === "en" ? "Clear default model" : "清除默认模型", exact: true });
    await expect(select).toHaveValue("fixture/existing");
    await expect(region).toContainText(locale === "en" ? "Current default: fixture/existing" : "当前默认模型: fixture/existing");
    await expect(save).toBeDisabled();
    await clear.click();
    await expect(select).toHaveValue("");
    await expect(clear).toBeDisabled();
    expect(state.writes[0]).toEqual({ expected_revision: "r1", operations: [{ action: "set_default_model", model: null }] });
    await expect(page.getByLabel(locale === "en" ? "Connection setup" : "连接配置进度", { exact: true })).toBeVisible();
    await select.selectOption("fixture/existing");
    await select.focus();
    expect(await select.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await save.click();
    await expect(region.getByRole("status")).toHaveText(locale === "en" ? "Global default model saved." : "全局默认模型已保存。");
    await expect(select).toHaveValue("fixture/existing");
    await expect(page.getByLabel(locale === "en" ? "Connection setup" : "连接配置进度", { exact: true })).toHaveCount(0);
    expect(state.writes[1]).toEqual({ expected_revision: "r2", operations: [{ action: "set_default_model", model: "fixture/existing" }] });
    expect(state.validations).toEqual(state.writes);
    expect(setupReads).toBe(3);
    expect(state.catalogReads).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["jev-dashboard-locale"]);
  });
}

test("global model conflict preserves the draft and retries using a refreshed revision", async ({ page, context }) => {
  const state = fixture(); state.rejectWrite = 409;
  await installProviderFixture(context, state);
  const region = await openSettings(page);
  const select = region.getByLabel("Global default model", { exact: true });
  await select.selectOption("fixture/existing");
  await region.getByRole("button", { name: "Save default model" }).click();
  await expect(region.getByRole("alert")).toContainText("Configuration changed elsewhere");
  await expect(select).toHaveValue("fixture/existing");
  await expect(region.getByRole("button", { name: "Save default model" })).toBeDisabled();
  state.configuration.revision = "external-revision";
  await region.getByRole("button", { name: "Reload current configuration" }).click();
  await expect(region.getByRole("alert")).toHaveCount(0);
  await expect(select).toHaveValue("fixture/existing");
  await region.getByRole("button", { name: "Save default model" }).click();
  await expect(region).toContainText("Global default model saved.");
  expect(state.writes[1]?.expected_revision).toBe("external-revision");
});

test("global model validation failure prevents PUT and a successful read allows retry", async ({ page, context }) => {
  const state = fixture(); state.rejectValidation = 400;
  await installProviderFixture(context, state);
  const region = await openSettings(page);
  await region.getByLabel("Global default model", { exact: true }).selectOption("fixture/existing");
  await region.getByRole("button", { name: "Save default model" }).click();
  await expect(region.getByRole("alert")).toContainText("The global default model could not be saved. Your selection is retained");
  expect(state.writes).toEqual([]);
  state.rejectValidation = undefined;
  await region.getByRole("button", { name: "Reload current configuration" }).click();
  await expect(region.getByRole("alert")).toHaveCount(0);
  await region.getByRole("button", { name: "Save default model" }).click();
  await expect(region).toContainText("Global default model saved.");
  expect(state.writes).toHaveLength(1);
});

test("committed global default survives a routing read failure and retry does not repeat PUT", async ({ page, context }) => {
  const state = fixture(); state.rejectCatalogRead = 503;
  await installProviderFixture(context, state);
  const region = await openSettings(page);
  await region.getByLabel("Global default model", { exact: true }).selectOption("fixture/existing");
  await region.getByRole("button", { name: "Save default model" }).click();
  await expect(region.getByRole("alert")).toContainText("The global default model was saved, but routing data could not be refreshed");
  expect(state.configuration.defaults?.default_model).toBe("fixture/existing");
  expect(state.writes).toHaveLength(1);
  state.rejectCatalogRead = undefined;
  await region.getByRole("button", { name: "Retry catalog refresh" }).click();
  await expect(region.getByRole("alert")).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  expect(state.catalogReads).toBe(2);
});

test("pending global model save disables controls and prevents navigation and duplicate writes", async ({ page, context }) => {
  const state = fixture(); let release!: () => void;
  state.delayWrite = () => new Promise<void>((resolve) => { release = resolve; });
  await installProviderFixture(context, state);
  const region = await openSettings(page);
  await region.getByLabel("Global default model", { exact: true }).selectOption("fixture/existing");
  await region.getByRole("button", { name: "Save default model" }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(region.getByLabel("Global default model", { exact: true })).toBeDisabled();
  const monitoring = page.locator("header").getByRole("button", { name: "Monitoring", exact: true });
  const refresh = page.locator("header").getByRole("button", { name: "Refresh", exact: true });
  await expect(monitoring).toBeDisabled();
  await expect(refresh).toBeDisabled();
  await expect(region).toBeVisible();
  release();
  await expect(region).toContainText("Global default model saved.");
  await expect(monitoring).toBeEnabled();
  await expect(refresh).toBeEnabled();
  expect(state.writes).toHaveLength(1);
  expect(state.validations).toHaveLength(1);
});

test("global model read-only state keeps appearance usable and refuses writes", async ({ page, context }) => {
  const state = fixture(); state.configuration.write_available = false;
  state.configuration.defaults = { default_model: "fixture/existing" };
  await installProviderFixture(context, state);
  const region = await openSettings(page);
  await expect(region.getByLabel("Global default model", { exact: true })).toBeDisabled();
  await expect(region.getByRole("button", { name: "Clear default model" })).toBeDisabled();
  await expect(page.getByLabel("Language", { exact: true })).toBeEnabled();
  expect(state.writes).toEqual([]);
});

test("empty model catalog links to Suppliers and incomplete routing offers the global setting", async ({ page, context }) => {
  const state = fixture(); state.configuration.models = []; delete state.configuration.defaults;
  await installProviderFixture(context, state);
  const region = await openSettings(page);
  await expect(region).toContainText("Import a model under a connection in Suppliers");
  await expect(region.getByLabel("Global default model", { exact: true })).toHaveValue("");
  await region.getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Views", exact: true }).getByRole("button", { name: "Suppliers", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toHaveCount(0);
  await page.route("**/v1/setup", (route) => route.fulfill({ json: { required: false, local_setup_available: true, revision: "fixture", has_providers: true, has_models: true, routing_ready: false, next_step: "routing" } }));
  await page.reload();
  const progress = page.getByLabel("Connection setup", { exact: true });
  await progress.getByRole("button", { name: "Global default model", exact: true }).click();
  await expect(page.getByRole("region", { name: "Global default model", exact: true })).toBeVisible();
});

test("failed global model read is retryable and unauthorized read returns to Connect", async ({ page, context }) => {
  const state = fixture(); state.rejectRead = 503;
  await installProviderFixture(context, state);
  const region = await openSettings(page);
  await expect(region.getByRole("alert")).toContainText("The current configuration could not be read");
  await expect(region.getByLabel("Global default model", { exact: true })).toBeDisabled();
  state.rejectRead = undefined;
  await region.getByRole("button", { name: "Reload current configuration" }).click();
  await expect(region.getByLabel("Global default model", { exact: true })).toBeEnabled();
  state.rejectRead = 401;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  expect(state.writes).toEqual([]);
});
