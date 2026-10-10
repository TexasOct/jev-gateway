import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import { openProviderModels, providerModelGroup } from "../fixtures/open-provider-models";
import type { ProviderFixtureState } from "../fixtures/provider-management";

function fixture(): ProviderFixtureState { return { configuration: providerFixture(), writes: [], validations: [], selectors: [] }; }
async function open(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture provider", exact: true })).toBeVisible();
  await openProviderModels(page, "fixture", { importModels: true });
}

test("discovery automatically enriches exact IDs and imports a complete batch without item dialogs", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  expect(state.metadataSelectors?.[0]).toMatchObject({ upstream_models: ["existing", "alpha", "beta"] });
  await page.getByRole("button", { name: "Select all visible unconfigured models" }).click();
  await expect(page.getByText("Already imported: skipped")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("I reviewed the capabilities", { exact: false }).check();
  await page.getByRole("button", { name: "Confirm and import selected models (2)", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]?.operations).toMatchObject([{ action: "import", confirmed: true, models: [{ upstream_model: "alpha" }, { upstream_model: "beta" }] }]);
  expect(state.configuration.models.map((model) => model.upstream_model)).toEqual(["existing", "alpha", "beta"]);
});

test("unknown metadata and query failures preserve a manual route with retry", async ({ page, context }) => {
  const state = fixture(); state.rejectMetadata = 503; await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect(page.getByText("Metadata fetch failed: retry or complete manually").first()).toBeVisible();
  state.metadataUnknown = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(2);
  await page.getByLabel("Search fetched models").fill("alpha");
  await page.getByRole("button", { name: "Select all visible unconfigured models" }).click();
  await expect(page.getByText("Still required:", { exact: false })).toContainText("Input price");
  await expect(page.getByRole("button", { name: "Confirm and import selected models (1)" })).toBeDisabled();
  state.metadataUnknown = false;
  await page.getByRole("button", { name: "Query model metadata", exact: true }).click();
  await expect(page.getByLabel("I reviewed the capabilities", { exact: false })).toBeEnabled();
  expect(state.writes).toEqual([]);
});

test("conflicting and mismatched suggestions stay incomplete", async ({ page, context }) => {
  const state = fixture();
  const source = (price: number) => ({ source: "fixture", source_provider: "fixture", source_model: "alpha", fetched_at: "2026-10-05", applicable: true, fields: { input_per_million: { value: price, source_field: "price" } } });
  state.metadataEvidence = { upstream_model: "alpha", fields: { input_per_million: 1 }, sources: [source(1), source(2)], warnings: ["conflicting_sources"], metadata: { version: 1, sources: [] } };
  await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect(page.getByText("Conflicting evidence").first()).toBeVisible();
  await page.getByLabel("Search fetched models").fill("alpha");
  await page.getByRole("button", { name: "Select all visible unconfigured models" }).click();
  await page.getByRole("region", { name: "fixture/alpha", exact: true }).getByRole("button", { name: "Edit model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("");
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  state.metadataEvidence = { ...state.metadataEvidence, fields: { input_per_million: 99 }, sources: [source(1)] };
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(2);
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("");
  expect(state.writes).toEqual([]);
});

test("committed model save retries catalog reading without another transaction", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Edit model", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Display name", { exact: true }).fill("Committed");
  state.rejectCatalogRead = 503;
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  expect(state.configuration.models[0]?.display_name).toBe("Committed");
  await expect(page.getByRole("alert")).toContainText("Model changes were saved. The strategy catalog could not be refreshed. Retry refresh to read the saved configuration.");
  state.rejectCatalogRead = undefined;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => state.catalogReads).toBe(2);
  expect(state.writes).toHaveLength(1);
});

test("restoring name and enabled closes cleanly while dirty cancel retains values", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Edit model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByLabel("Display name", { exact: true });
  const originalName = await name.inputValue();
  const enabled = dialog.getByLabel("Enabled", { exact: true });
  const originalEnabled = await enabled.isChecked();
  await name.fill("Pending"); await enabled.setChecked(!originalEnabled);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(name).toHaveValue("Pending");
  await name.fill(originalName); await enabled.setChecked(originalEnabled);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0); expect(state.writes).toEqual([]);
});

for (const removed of [false, true]) test(`conflict reload retains complete draft when target ${removed ? "disappears" : "changes"}`, async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Edit model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name", { exact: true }).fill("Retained draft");
  await dialog.getByLabel("Input price (USD / million tokens)").fill("9");
  state.rejectWrite = 409;
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  if (removed) state.configuration.models = [];
  else state.configuration.models[0]!.cost.input_per_million = 77;
  await dialog.getByRole("button", { name: "Reload current configuration", exact: true }).click();
  await expect(dialog.getByLabel("Display name", { exact: true })).toHaveValue("Retained draft");
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
  if (removed) {
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expect(dialog.getByText("Your draft is retained.", { exact: false })).toBeVisible();
  }
  expect(state.writes).toHaveLength(1);
});

test("leaving supplier model settings requires explicit discard before filtering another supplier", async ({ page, context }) => {
  const state = fixture(); state.configuration.providers.push({ ...state.configuration.providers[0]!, id: "second", display_name: "Second connection" });
  await installProviderFixture(context, state); await open(page);
  const first = providerModelGroup(page, "fixture");
  await first.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await first.getByRole("button", { name: "Select all visible unconfigured models" }).click();
  await expect(page.getByLabel("Search instances", { exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await expect(first).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await page.getByLabel("Search instances", { exact: true }).fill("Second");
  await expect(first).toHaveCount(0);
  await expect(page.getByText("fixture/alpha", { exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("existing edits save one full transaction, retain failed inputs and persist manual refresh protection", async ({ page, context }) => {
  const state = fixture();
  state.configuration.models[0]!.tags = ["retained-routing-tag"];
  state.configuration.models[0]!.priority = 8;
  state.configuration.models[0]!.quality = 0.61;
  await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Edit model", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name", { exact: true }).fill("Operator model");
  await dialog.getByLabel("Input price (USD / million tokens)").fill("9");
  await dialog.getByLabel("Cache read (USD/M tokens)").fill("0");
  await dialog.getByLabel("Enabled", { exact: true }).uncheck();
  state.rejectWrite = 503;
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(state.configuration.models[0]?.cost.input_per_million).toBe(1);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes[1]?.expected_revision).toBe("r1");
  expect(state.writes[1]?.operations).toHaveLength(1);
  expect(state.validations).toEqual(state.writes);
  expect(state.writes[1]?.operations).toMatchObject([{ action: "update_model", model_id: "fixture/existing", model: { upstream_model: "existing", provider: "fixture", display_name: "Operator model", enabled: false, tags: ["retained-routing-tag"], priority: 8, quality: 0.61, cost: { input_per_million: 9, output_per_million: 2, cache_read_per_million: 0 }, capabilities: { tools: false }, context_window: null, max_output_tokens: null, metadata: { fields: { input_per_million: { method: "manual" } } } } }]);
  expect(state.writes[1]?.operations[0]).not.toHaveProperty("model.cost.cache_write_per_million");
  expect(state.configuration.models[0]?.name).toBe("fixture/existing");
  expect(state.configuration.models[0]?.provider).toBe("fixture");
  expect(state.configuration.revision).not.toBe("r1");
  await page.getByRole("button", { name: "Edit model", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
  await expect(dialog.getByLabel("Enabled", { exact: true })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Restore automatic values", exact: true }).click();
  await expect(dialog.getByText("Input price (USD / million tokens): 9 → 1.5")).toBeVisible();
  await dialog.getByText("Input price (USD / million tokens): 9 → 1.5").check();
  await dialog.getByRole("button", { name: "Apply selected values", exact: true }).click();
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("1.5");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog.getByText("Discard unsaved model changes?")).toBeVisible();
  await dialog.getByRole("button", { name: "Discard changes", exact: true }).click();
  expect(state.writes).toHaveLength(2);
});

test("whole App metadata failure retains saved values and evidence, then retries and previews a manual restore", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Edit model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Input price (USD / million tokens)").fill("9");
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
  await dialog.getByText("Sources and evidence", { exact: true }).click();
  const sources = JSON.parse((await dialog.locator("[data-current-evidence]").textContent())!).metadata.sources;
  state.rejectMetadata = 503;
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Metadata could not be fetched. Your values are retained");
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
  await expect(dialog.locator("[data-current-evidence]")).toContainText("metadata_source_unavailable");
  await dialog.getByText("Earlier evidence retained for provenance", { exact: true }).click();
  expect(JSON.parse(await dialog.locator("details details pre").innerText()).sources).toEqual(sources);
  await expect(page.getByText("synthetic-metadata-error")).toHaveCount(0);
  expect(state.writes).toEqual([]);
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(3);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
  await dialog.getByRole("button", { name: "Restore automatic values", exact: true }).click();
  await dialog.getByText("Input price (USD / million tokens): 9 → 1.5").check();
  await dialog.getByRole("button", { name: "Apply selected values", exact: true }).click();
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("1.5");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]?.operations[0]).toMatchObject({ action: "update_model", model_id: "fixture/existing", model: { metadata: { fields: { input_per_million: { method: "source", value: 1.5 } }, sources: [{ source: "native_listing", fields: { max_input_tokens: { value: 80000 }, structured_output: { value: true } }, pricing: { tiers: [{ min_prompt_tokens: 200000 }], overrides: [{ utc_start: 1, utc_end: 2 }] } }] } } });
});

for (const width of [320, 1280]) test(`model modal traps/restores focus, guards Escape and keeps its footer reachable at ${width}px`, async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width, height: 720 });
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  const trigger = page.getByRole("button", { name: "Edit model", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name", { exact: true }).fill("Unsaved");
  await page.keyboard.press("Escape");
  await expect(dialog.getByText("Discard unsaved model changes?")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  for (let index = 0; index < 30; index++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await dialog.getByLabel("Cache write (USD/M tokens)").scrollIntoViewIfNeeded();
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeInViewport();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`model-dialog-${width}.png`) });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(state.writes).toEqual([]);
});
