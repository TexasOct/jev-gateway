import { test, expect } from "../fixtures/provider-browser";
import { openProviderModels, providerModelGroup } from "../fixtures/open-provider-models";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";
import type { Page } from "@playwright/test";

function fixture(): ProviderFixtureState {
  const configuration = providerFixture();
  configuration.providers[0] = { ...configuration.providers[0]!, display_name: "OpenAI primary", brand_id: "openai" };
  configuration.providers.push({ ...configuration.providers[0]!, id: "second", display_name: "OpenAI secondary", api_key_env: "SECOND_KEY" });
  configuration.models.push({ ...structuredClone(configuration.models[0]!), name: "second/existing", provider: "second" });
  return { configuration, writes: [], validations: [], selectors: [] };
}
const group = (page: Page, secondary = false) => providerModelGroup(page, secondary ? "second" : "fixture");
async function open(page: Page) {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(page.getByRole("region", { name: "OpenAI primary", exact: true })).toBeVisible();
}
const models = (page: Page, secondary = false, importModels = false) => openProviderModels(page, secondary ? "second" : "fixture", { importModels });
const cancel = (page: Page) => page.getByRole("button", { name: "Cancel", exact: true }).first().click();

test("supplier list shows summaries and editing entries; model editing belongs to the selected supplier", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await expect(page.locator("[data-dashboard-view-nav] button")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Model management", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-provider-models]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Configured models", exact: true })).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search configured models", exact: true })).toHaveCount(0);
  await expect(page.getByText("Discover and import models", { exact: true })).toHaveCount(0);
  for (const name of ["OpenAI primary", "OpenAI secondary"]) {
    const row = page.getByRole("region", { name, exact: true });
    await expect(row.getByText("Configured models: 1", { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  }
  await models(page, true);
  await expect(page.locator('[data-provider-editor="second"]')).toContainText("Edit: OpenAI secondary");
  await expect(group(page)).toHaveCount(0);
  const configured = group(page, true).getByRole("region", { name: "Configured models", exact: true });
  await expect(configured.getByRole("button")).toHaveCount(1);
  await configured.getByRole("button", { name: "Edit model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("second/existing");
  await dialog.getByLabel("Display name", { exact: true }).fill("Secondary only");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes[0]?.operations).toMatchObject([{ action: "update_model", model_id: "second/existing", model: { provider: "second", upstream_model: "existing" } }]);
  expect(state.configuration.models[0]?.display_name).toBeNull();
  await expect(configured.getByText("Secondary only", { exact: true })).toBeVisible();
  await cancel(page);
  await expect(page.locator('[data-provider-edit="second"]')).toBeFocused();
  await expect(page.locator("[data-provider-models]")).toHaveCount(0);
});

test("discovery and Retry use only the opened supplier and clear results when leaving", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await models(page, true, true);
  await group(page, true).getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await expect(group(page, true).getByText("second/alpha", { exact: true })).toBeVisible();
  await cancel(page);
  await models(page, false, true);
  await expect(page.getByText("second/alpha", { exact: true })).toHaveCount(0);
  state.rejectDiscovery = 503;
  await group(page).getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect(group(page).getByRole("alert")).toBeVisible();
  await group(page).getByRole("button", { name: "Retry", exact: true }).click();
  await expect(group(page).getByText("fixture/alpha", { exact: true })).toBeVisible();
  expect(state.selectors).toEqual([{ provider_id: "second" }, { provider_id: "fixture" }, { provider_id: "fixture" }]);
  expect(state.writes).toEqual([]);
});

for (const action of ["connection", "kind", "cancel", "navigation", "escape"] as const) test(`dirty model import protects ${action} transition from the supplier editor`, async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page); await models(page, false, true);
  const primary = group(page);
  await primary.getByLabel("Upstream model ID", { exact: true }).fill("unsaved-model");
  await primary.getByText("Discover and import models", { exact: true }).click();
  const prompts: string[] = [];
  page.once("dialog", async (dialog) => { prompts.push(dialog.message()); await dialog.dismiss(); });
  if (action === "connection") await page.getByRole("button", { name: "Connection settings", exact: true }).click();
  if (action === "kind") await page.getByRole("button", { name: "Decision providers", exact: true }).click();
  if (action === "cancel") await cancel(page);
  if (action === "navigation") await page.getByRole("button", { name: "Settings", exact: true }).click();
  if (action === "escape") { await page.getByRole("button", { name: "Model settings", exact: true }).focus(); await page.keyboard.press("Escape"); }
  expect(prompts).toEqual(["Discard unsaved model changes?"]);
  await expect(primary).toBeVisible();
  await primary.getByText("Discover and import models", { exact: true }).click();
  await expect(primary.getByLabel("Upstream model ID", { exact: true })).toHaveValue("unsaved-model");
  expect(state.writes).toEqual([]);
  page.once("dialog", (dialog) => dialog.accept());
  await cancel(page);
  await models(page, true, true);
  await expect(group(page, true).getByLabel("Upstream model ID", { exact: true })).toHaveValue("");
  await expect(page.getByText("fixture/unsaved-model", { exact: true })).toHaveCount(0);
});

test("pending model transaction locks supplier navigation and retains failed draft", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const state = fixture(); await installProviderFixture(context, state); await open(page); await models(page);
  const trigger = group(page).getByRole("button", { name: "Edit model", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name", { exact: true }).fill("Retained");
  let release!: () => void;
  state.delayWrite = () => new Promise<void>((resolve) => { release = resolve; });
  state.rejectWrite = 503;
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  for (const name of ["Decision providers", "Connection settings", "Model settings"]) await expect(page.getByRole("button", { name, exact: true, includeHidden: true })).toBeDisabled();
  await expect(page.locator("[data-dashboard-view-nav] button:enabled")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Display name", { exact: true })).toHaveValue("Retained");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.keyboard.press("Escape");
    await expect(dialog.getByText("Discard unsaved model changes?", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  }
  for (let step = 0; step < 25; step++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await dialog.getByLabel("Cache write (USD/M tokens)").scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(state.configuration.models[0]?.display_name).toBeNull();
});

test("read-only supplier models remain inspectable through their editor", async ({ page, context }) => {
  const state = fixture(); state.configuration.write_available = false;
  await installProviderFixture(context, state); await open(page); await models(page, true);
  await group(page, true).getByRole("button", { name: "Edit model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("second/existing");
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(group(page, true).getByRole("button", { name: "Edit model", exact: true })).toBeFocused();
  expect(state.writes).toEqual([]);
});

test("import conflict reload retains model edits and retries the fresh revision", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page); await models(page, false, true);
  const primary = group(page);
  await primary.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await primary.getByRole("checkbox", { name: "fixture/alpha", exact: true }).check();
  const preview = primary.getByRole("region", { name: "fixture/alpha", exact: true });
  await preview.getByRole("button", { name: "Edit model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name", { exact: true }).fill("Retained import");
  await dialog.getByLabel("Input price (USD / million tokens)").fill("9");
  await dialog.getByLabel("Output price (USD / million tokens)").fill("12");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const confirmation = primary.getByLabel("I reviewed the capabilities", { exact: false });
  await confirmation.check();
  state.rejectWrite = 409;
  await primary.getByRole("button", { name: "Confirm and import selected models (1)", exact: true }).click();
  await expect(primary.getByRole("alert")).toHaveCount(1);
  await expect(primary.getByRole("alert")).toContainText("Configuration changed. Keep this draft, reload configuration and review before retrying.");
  state.configuration.revision = "external-r2";
  await primary.getByRole("button", { name: "Reload current configuration", exact: true }).click();
  await expect(confirmation).not.toBeChecked();
  await expect(primary.getByRole("checkbox", { name: "fixture/alpha", exact: true })).toBeChecked();
  await preview.getByRole("button", { name: "Edit model", exact: true }).click();
  await expect(dialog.getByLabel("Display name", { exact: true })).toHaveValue("Retained import");
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
  await expect(dialog.getByLabel("Output price (USD / million tokens)")).toHaveValue("12");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await primary.getByRole("button", { name: "Query model metadata", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(2);
  await confirmation.check();
  await primary.getByRole("button", { name: "Confirm and import selected models (1)", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.writes[1]).toMatchObject({ expected_revision: "external-r2", operations: [{ action: "import", provider_id: "fixture", models: [{ upstream_model: "alpha", display_name: "Retained import", cost: { input_per_million: 9, output_per_million: 12 } }] }] });
  await expect(primary.getByRole("region", { name: "Configured models", exact: true }).getByText("Retained import", { exact: true })).toBeVisible();
});

test("committed import recovery remains scoped to its supplier and retries reads only", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page); await models(page, false, true);
  const primary = group(page);
  await primary.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await primary.getByRole("checkbox", { name: "fixture/alpha", exact: true }).check();
  await primary.getByLabel("I reviewed the capabilities", { exact: false }).check();
  state.rejectCatalogRead = 503;
  await primary.getByRole("button", { name: "Confirm and import selected models (1)", exact: true }).click();
  await expect(primary.getByRole("alert")).toContainText("Model changes were saved. The strategy catalog could not be refreshed");
  const writesBeforeRetry = structuredClone(state.writes);
  await cancel(page); await models(page, true, true);
  await expect(group(page, true).getByRole("alert")).toHaveCount(0);
  await expect(group(page, true).getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  await cancel(page); await models(page);
  const readsBeforeRetry = state.catalogReads ?? 0;
  state.rejectCatalogRead = undefined;
  await primary.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(primary.getByRole("alert")).toHaveCount(0);
  expect(state.catalogReads).toBe(readsBeforeRetry + 1);
  expect(state.writes).toEqual(writesBeforeRetry);
  expect(state.configuration.models.filter((model) => model.provider === "fixture" && model.upstream_model === "alpha")).toHaveLength(1);
});

test("new and changed connections must be saved before managing models", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.locator('[data-provider-edit="fixture"]').click();
  await page.getByLabel("Endpoint URL", { exact: true }).fill("https://changed.test/v1");
  await expect(page.getByRole("button", { name: "Model settings", exact: true })).toBeDisabled();
  await expect(page.getByText("Save the supplier connection before managing its models.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-provider-models]")).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss()); await cancel(page);
  await expect(page.getByLabel("Endpoint URL", { exact: true })).toHaveValue("https://changed.test/v1");
  page.once("dialog", (dialog) => dialog.accept()); await cancel(page);
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByRole("button", { name: "OpenAI openai", exact: true }).click();
  await expect(page.getByRole("button", { name: "Model settings", exact: true })).toBeDisabled();
  await page.getByLabel("Display name", { exact: true }).fill("New supplier");
  await page.getByLabel("New provider credential", { exact: true }).fill("synthetic-new-key");
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New supplier", exact: true })).toBeVisible();
  const providerId = state.configuration.providers.find((provider) => provider.display_name === "New supplier")!.id;
  const workspace = await openProviderModels(page, providerId, { importModels: true });
  await workspace.getByLabel("Upstream model ID", { exact: true }).fill("manual-new");
  await workspace.getByRole("button", { name: "Add model manually", exact: true }).click();
  await expect(workspace.getByRole("checkbox", { name: `${providerId}/manual-new`, exact: true })).toBeChecked();
  await workspace.getByRole("button", { name: "Query model metadata", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await workspace.getByLabel("I reviewed the capabilities", { exact: false }).check();
  await workspace.getByRole("button", { name: "Confirm and import selected models (1)", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.writes[1]?.operations).toMatchObject([{ action: "import", provider_id: providerId, models: [{ upstream_model: "manual-new" }] }]);
  expect(state.configuration.models.filter((model) => model.provider === providerId).map((model) => model.upstream_model)).toEqual(["manual-new"]);
});

test("decision supplier editor retains its optional model and connection-only behavior", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Decision providers", exact: true }).click();
  await page.locator('[data-provider-edit="judge"][data-provider-kind="decision"]').click();
  await expect(page.getByRole("button", { name: "Model settings", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-provider-models]")).toHaveCount(0);
  await page.getByLabel("Model (optional)", { exact: true }).fill("optional-judge-model");
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture judge", exact: true })).toBeVisible();
  expect(state.writes[0]?.operations).toMatchObject([{ action: "upsert", kind: "decision", provider: { id: "judge", model: "optional-judge-model" } }]);
  expect(state.selectors).toEqual([]);
});

for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) test(`supplier model settings fit 320px in ${locale} ${scheme}`, async ({ page, context }, testInfo) => {
  const state = fixture(); await installProviderFixture(context, state);
  await page.addInitScript((language) => localStorage.setItem("jev-dashboard-locale", language), locale);
  await page.setViewportSize({ width: 320, height: 720 }); await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/dashboard/");
  const workspace = await openProviderModels(page, "second", { locale, importModels: true });
  await expect(workspace.getByRole("button", { name: locale === "en" ? "Fetch upstream models" : "获取上游模型", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`supplier-model-settings-${locale}-${scheme}.png`), fullPage: true });
  expect(state.writes).toEqual([]);
});
