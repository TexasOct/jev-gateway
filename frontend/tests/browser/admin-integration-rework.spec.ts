import { test, expect } from "./fixtures";
import { configuredModelEdit, openProviderModels } from "../fixtures/open-provider-models";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";

test("default conflict remains blocked after selection changes and failed reload", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [], rejectWrite: 409 };
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const region = page.getByRole("region", { name: "Global default model", exact: true });
  const select = region.getByLabel("Global default model", { exact: true });
  const save = region.getByRole("button", { name: "Save default model", exact: true });
  await select.selectOption("fixture/existing");
  await save.click();
  await expect(save).toBeDisabled();
  await select.selectOption("");
  await select.selectOption("fixture/existing");
  await expect(save).toBeDisabled();
  state.rejectRead = 503;
  await region.getByRole("button", { name: "Reload current configuration", exact: true }).click();
  await expect(region.getByRole("alert")).toContainText("The current configuration could not be read.");
  await expect(select).toHaveValue("fixture/existing");
  await expect(save).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  state.rejectRead = undefined;
  state.rejectWrite = undefined;
  state.configuration.revision = "fresh-after-conflict";
  await region.getByRole("button", { name: "Reload current configuration", exact: true }).click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(region).toContainText("Global default model saved.");
  expect(state.writes[1]?.expected_revision).toBe("fresh-after-conflict");
});

test("pending default write exposes disabled navigation and completes one transaction", async ({ page, context }) => {
  let release!: () => void;
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [], delayWrite: () => new Promise<void>((resolve) => { release = resolve; }) };
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const region = page.getByRole("region", { name: "Global default model", exact: true });
  await region.getByLabel("Global default model", { exact: true }).selectOption("fixture/existing");
  await region.getByRole("button", { name: "Save default model", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(page.locator("header").getByRole("button", { name: "Monitoring", exact: true })).toBeDisabled();
  await expect(page.locator("header").getByRole("button", { name: "Refresh", exact: true })).toBeDisabled();
  await expect(region.getByRole("button", { name: "Save default model", exact: true })).toBeDisabled();
  release();
  await expect(region).toContainText("Global default model saved.");
  expect(state.writes).toHaveLength(1);
});

test("saved model catalog retry uses current presentation and performs reads only", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [], rejectCatalogRead: 503 };
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await openProviderModels(page, "fixture");
  await configuredModelEdit(page, "fixture", "existing").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Display name", { exact: true }).fill("Committed");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Model changes were saved. The strategy catalog could not be refreshed.", { exact: false })).toBeVisible();
  expect(state.configuration.models[0]?.display_name).toBe("Committed");
  expect(state.writes).toHaveLength(1);
  state.rejectCatalogRead = undefined;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => state.catalogReads).toBe(2);
  expect(state.writes).toHaveLength(1);
});

for (const origin of ["provider", "model"] as const) {
  test(`${origin} write failure stays with its originating view`, async ({ page, context }) => {
    const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [], rejectWrite: 500 };
    await installProviderFixture(context, state);
    await page.goto("/dashboard/");
    await openProviderModels(page, "fixture");
    if (origin === "provider") await page.locator('[data-provider-edit="fixture"][data-provider-kind="llm"]').click();
    else await configuredModelEdit(page, "fixture", "existing").click();
    await page.getByRole("button", { name: origin === "provider" ? "Validate and save" : "Save", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).last().click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await openProviderModels(page, "fixture");
    await expect(page.getByRole("alert")).toBeVisible();
    expect(state.writes).toHaveLength(1);
  });
}
