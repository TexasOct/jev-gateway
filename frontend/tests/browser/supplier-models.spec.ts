import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";
import type { Page } from "@playwright/test";

function fixture(): ProviderFixtureState {
  const configuration = providerFixture();
  configuration.providers[0] = { ...configuration.providers[0]!, display_name: "OpenAI primary", brand_id: "openai" };
  configuration.providers.push({ ...configuration.providers[0]!, id: "second", display_name: "OpenAI secondary", api_key_env: "SECOND_KEY" });
  configuration.models.push({ ...structuredClone(configuration.models[0]!), name: "second/existing", provider: "second" });
  return { configuration, writes: [], validations: [], selectors: [] };
}
const group = (page: Page, secondary = false) => page.getByRole("region", { name: secondary ? "OpenAI secondary" : "OpenAI primary", exact: true });
async function open(page: Page) {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(group(page)).toBeVisible();
}

test("four destinations and same-brand suppliers each own their configured model Edit entry", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await expect(page.locator("[data-dashboard-view-nav] button")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Model management", exact: true })).toHaveCount(0);
  for (const secondary of [false, true]) {
    const models = group(page, secondary).getByRole("region", { name: "Configured models", exact: true });
    await expect(models.getByRole("button")).toHaveCount(1);
    await expect(models.getByRole("button", { name: "Edit model", exact: true })).toBeVisible();
    await expect(models.getByText("existing", { exact: true }).first()).toBeVisible();
  }
  await group(page, true).getByRole("button", { name: "Edit model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("second/existing");
  await dialog.getByLabel("Display name", { exact: true }).fill("Secondary only");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes[0]?.operations).toMatchObject([{ action: "update_model", model_id: "second/existing", model: { provider: "second", upstream_model: "existing" } }]);
  expect(state.configuration.models[0]?.display_name).toBeNull();
  await expect(group(page, true).getByText("Secondary only", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Decision providers", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit model", exact: true })).toHaveCount(0);
});

test("failed discovery after another supplier succeeded shows error and Retry only for its request owner", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  for (const secondary of [false, true]) await group(page, secondary).getByText("Discover and import models", { exact: true }).click();
  await group(page, true).getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await expect(group(page, true).getByText("second/alpha", { exact: true })).toBeVisible();
  await expect(group(page).getByText("second/alpha", { exact: true })).toHaveCount(0);
  state.rejectDiscovery = 503;
  await group(page).getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect(group(page).getByRole("alert")).toBeVisible();
  await expect(group(page, true).getByRole("alert")).toHaveCount(0);
  await expect(group(page, true).getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  await group(page).getByRole("button", { name: "Retry", exact: true }).click();
  await expect(group(page).getByText("fixture/alpha", { exact: true })).toBeVisible();
  expect(state.selectors).toEqual([{ provider_id: "second" }, { provider_id: "fixture" }, { provider_id: "fixture" }]);
  expect(state.writes).toEqual([]);
});

for (const action of ["filter", "kind", "editor", "presets", "delete"] as const) test(`dirty model import protects supplier ${action} transition`, async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  const primary = group(page);
  await primary.getByText("Discover and import models", { exact: true }).click();
  await primary.getByLabel("Upstream model ID", { exact: true }).fill("unsaved-model");
  // Collapse without unmounting the draft; supplier transitions still see it.
  await primary.getByText("Discover and import models", { exact: true }).click();
  const perform = async () => {
    if (action === "filter") await page.getByLabel("Search instances", { exact: true }).fill("secondary");
    if (action === "kind") await page.getByRole("button", { name: "Decision providers", exact: true }).click();
    if (action === "editor") await primary.getByRole("button", { name: "Edit", exact: true }).click();
    if (action === "presets") await page.getByRole("button", { name: "Add provider", exact: true }).click();
    if (action === "delete") await primary.getByRole("button", { name: "Delete provider", exact: true }).click();
  };
  const prompts: string[] = [];
  page.once("dialog", async (dialog) => { prompts.push(dialog.message()); await dialog.dismiss(); });
  await perform();
  expect(prompts).toEqual(["Discard unsaved model changes?"]);
  await expect(primary).toBeVisible();
  await primary.getByText("Discover and import models", { exact: true }).click();
  await expect(primary.getByLabel("Upstream model ID", { exact: true })).toHaveValue("unsaved-model");
  expect(state.writes).toEqual([]);
});

test("pending model transaction locks supplier filtering and navigation and retains failed draft", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  const trigger = group(page).getByRole("button", { name: "Edit model", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name", { exact: true }).fill("Retained");
  let release!: () => void;
  state.delayWrite = () => new Promise<void>((resolve) => { release = resolve; });
  state.rejectWrite = 503;
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(page.getByLabel("Search instances", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Decision providers", exact: true })).toBeDisabled();
  await expect(page.locator("[data-dashboard-view-nav] button:enabled")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Display name", { exact: true })).toHaveValue("Retained");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(dialog.getByLabel("Display name", { exact: true })).toHaveValue("Retained");
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.keyboard.press("Escape");
    await expect(dialog.getByText("Discard unsaved model changes?", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Display name", { exact: true })).toHaveValue("Retained");
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

test("read-only supplier models remain inspectable in the unified editor", async ({ page, context }) => {
  const state = fixture(); state.configuration.write_available = false;
  await installProviderFixture(context, state); await open(page);
  await group(page, true).getByRole("button", { name: "Edit model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("second/existing");
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(group(page, true).getByRole("button", { name: "Edit model", exact: true })).toBeFocused();
  expect(state.writes).toEqual([]);
});

test("import conflict reload retains selected model and manual edits before retrying the fresh revision", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  const primary = group(page);
  await primary.getByRole("button", { name: "Edit model", exact: true }).click();
  const savedEditor = page.getByRole("dialog");
  await savedEditor.getByLabel("Display name", { exact: true }).fill("Previously saved primary");
  await savedEditor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(savedEditor).toHaveCount(0);
  await primary.getByText("Discover and import models", { exact: true }).click();
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
  await expect(group(page, true).getByRole("alert")).toHaveCount(0);
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
  await expect.poll(() => state.writes.length).toBe(3);
  expect(state.writes[2]).toMatchObject({ expected_revision: "external-r2", operations: [{ action: "import", provider_id: "fixture", models: [{ upstream_model: "alpha", display_name: "Retained import", cost: { input_per_million: 9, output_per_million: 12 } }] }] });
  await expect(primary.getByRole("region", { name: "Configured models", exact: true }).getByText("Retained import", { exact: true })).toBeVisible();
});

test("committed import recovery belongs only to its supplier and retries reads without discarding another draft", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  const primary = group(page); const secondary = group(page, true);
  await secondary.getByRole("button", { name: "Edit model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name", { exact: true }).fill("Previously saved secondary");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  for (const supplier of [primary, secondary]) await supplier.getByText("Discover and import models", { exact: true }).click();
  await secondary.getByLabel("Upstream model ID", { exact: true }).fill("secondary-unsaved-draft");
  await primary.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await primary.getByRole("checkbox", { name: "fixture/alpha", exact: true }).check();
  await primary.getByLabel("I reviewed the capabilities", { exact: false }).check();
  state.rejectCatalogRead = 503;
  await primary.getByRole("button", { name: "Confirm and import selected models (1)", exact: true }).click();
  await expect(primary.getByRole("alert")).toContainText("Model changes were saved. The strategy catalog could not be refreshed");
  await expect(secondary.getByRole("alert")).toHaveCount(0);
  await expect(secondary.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  expect(state.writes.filter((write) => write.operations.some((operation) => operation.action === "import"))).toHaveLength(1);
  const writesBeforeRetry = structuredClone(state.writes);
  const readsBeforeRetry = state.catalogReads ?? 0;
  state.rejectCatalogRead = undefined;
  await primary.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(primary.getByRole("alert")).toHaveCount(0);
  expect(state.catalogReads).toBe(readsBeforeRetry + 1);
  expect(state.writes).toEqual(writesBeforeRetry);
  await expect(secondary.getByLabel("Upstream model ID", { exact: true })).toHaveValue("secondary-unsaved-draft");
  expect(state.configuration.models.filter((model) => model.provider === "fixture" && model.upstream_model === "alpha")).toHaveLength(1);
});
