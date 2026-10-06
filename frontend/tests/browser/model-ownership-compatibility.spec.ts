import { test, expect } from "../fixtures/provider-browser";
import { configuredModelEdit, openProviderModels } from "../fixtures/open-provider-models";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";

test("legacy snapshots without ownership flags keep routing fields read-only and preserve them on model save", async ({ page, context }) => {
  const configuration = providerFixture();
  delete configuration.models[0]!.routing_overlay_fields;
  configuration.models[0]!.tags = ["legacy-workflow-tag"];
  configuration.models[0]!.priority = -7;
  const state: ProviderFixtureState = { configuration, writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state); await page.goto("/dashboard/");
  await openProviderModels(page, "fixture");
  await configuredModelEdit(page, "fixture", "existing").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Routing tags (comma separated)", { exact: true })).toHaveAttribute("readonly", "");
  await expect(dialog.getByLabel("Priority", { exact: true })).toHaveAttribute("readonly", "");
  await expect(dialog.getByText("Field ownership is unavailable", { exact: false })).toBeVisible();
  await dialog.getByLabel("Display name", { exact: true }).fill("Compatible rename");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes[0]?.operations).toHaveLength(1);
  expect(state.writes[0]?.operations[0]).not.toHaveProperty("model.tags");
  expect(state.writes[0]?.operations[0]).not.toHaveProperty("model.priority");
  expect(state.configuration.models[0]).toMatchObject({ tags: ["legacy-workflow-tag"], priority: -7, display_name: "Compatible rename" });
});

test("current baseline snapshots declare no routing ownership and allow both baseline fields", async ({ page, context }) => {
  const configuration = providerFixture();
  expect(configuration.models[0]?.routing_overlay_fields).toEqual([]);
  const state: ProviderFixtureState = { configuration, writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state); await page.goto("/dashboard/");
  await openProviderModels(page, "fixture");
  await configuredModelEdit(page, "fixture", "existing").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Routing tags (comma separated)", { exact: true })).not.toHaveAttribute("readonly", "");
  await expect(dialog.getByLabel("Priority", { exact: true })).not.toHaveAttribute("readonly", "");
  await expect(dialog.getByText("Field ownership is unavailable", { exact: false })).toHaveCount(0);
  await dialog.getByLabel("Routing tags (comma separated)", { exact: true }).fill("baseline-edited");
  await dialog.getByLabel("Priority", { exact: true }).fill("-9");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes[0]?.operations[0]).toMatchObject({ action: "update_model", model_id: "fixture/existing", model: { tags: ["baseline-edited"], priority: -9 } });
});
