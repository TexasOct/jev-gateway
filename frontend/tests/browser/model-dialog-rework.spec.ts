import { test, expect } from "../fixtures/provider-browser";
import { configuredModelEdit, openProviderModels } from "../fixtures/open-provider-models";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";

for (const raw of ["existing", "vendor/family/model"]) test(`model evidence and atomic payload preserve raw target ${raw} and verified alias`, async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  const model = state.configuration.models[0]!;
  model.upstream_model = raw;
  model.name = `fixture/${raw}`;
  model.display_name = "Friendly model";
  model.routing_overlay_fields = [];
  const fields = { input_per_million: { value: 1, source_field: "price" } };
  const source = { id: "verified-alias-source", source: "verified_alias", provider_id: "vendor-alias", model_id: "catalog/family/version", canonical_model_id: raw, applicable: true, fields };
  state.metadataEvidence = { upstream_model: raw, fields: { input_per_million: 1 }, warnings: [], sources: [{ source: source.source, source_provider: source.provider_id, source_model: source.model_id, canonical_model_id: raw, applicable: true, fetched_at: "2026-10-05", fields }], metadata: { version: 1, sources: [source] } };
  const captured = structuredClone(state.metadataEvidence);
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await openProviderModels(page, "fixture");
  await configuredModelEdit(page, "fixture", raw).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Edit model: Friendly model · Fixture provider" })).toBeVisible();
  await expect(dialog.getByLabel("Upstream model ID", { exact: true })).toHaveValue(raw);
  await expect(dialog.getByLabel("Upstream model ID", { exact: true })).toHaveAttribute("readonly", "");
  await expect(dialog.getByText(`Internal routing ID: fixture/${raw}`, { exact: true })).toBeHidden();
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await dialog.getByText("Sources and evidence", { exact: true }).click();
  await expect.poll(async () => JSON.parse(await dialog.locator("[data-current-evidence]").innerText())).toEqual(captured);
  await dialog.getByLabel("Display name", { exact: true }).fill("Renamed model");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.metadataSelectors?.[0]).toMatchObject({ upstream_models: [raw] });
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]?.operations).toMatchObject([{ action: "update_model", model_id: `fixture/${raw}`, model: { upstream_model: raw, display_name: "Renamed model", metadata: { sources: [source], fields: { input_per_million: { source_ids: [source.id] } } } } }]);
  expect(state.metadataEvidence).toEqual(captured);
});

for (const readOnly of [false, true]) test(`model editor inspection and guarded keyboard close preserve focus, readonly ${readOnly}`, async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  state.configuration.write_available = !readOnly;
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await openProviderModels(page, "fixture");
  const trigger = configuredModelEdit(page, "fixture", "existing");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.locator("dialog")).toHaveCount(0);
  const name = dialog.getByLabel("Display name", { exact: true });
  if (readOnly) {
    await expect(name).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    expect(await dialog.evaluate((element) => element.contains(document.activeElement) && !document.activeElement?.matches(":disabled"))).toBe(true);
  } else {
    await expect(name).toBeEnabled();
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  for (let step = 0; step < 35; step++) {
    await page.keyboard.press("Tab");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.contains(document.activeElement) && !document.activeElement?.matches(":disabled"))).toBe(true);
  }
  for (let step = 0; step < 35; step++) {
    await page.keyboard.press("Shift+Tab");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.contains(document.activeElement) && !document.activeElement?.matches(":disabled"))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(state.writes).toEqual([]);
});
