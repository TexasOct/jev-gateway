import { test, expect } from "../fixtures/provider-browser";
import { configuredModelEdit } from "../fixtures/open-provider-models";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";

test("acceptance: Settings owns gateway editing and one decision protects both drafts", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const region = page.getByRole("region", { name: "Access and security", exact: true });
  await expect(region).toContainText("no separate administrator key");
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  const key = page.getByLabel("New gateway access key", { exact: true });
  await key.fill("synthetic-successor-dirty-key");
  await page.locator("#settings-default-model").selectOption("fixture/existing");
  let dialogs = 0;
  page.once("dialog", async (dialog) => { dialogs++; await dialog.dismiss(); });
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  expect(dialogs).toBe(1);
  await expect(key).toHaveValue("synthetic-successor-dirty-key");
  await expect(page.locator("#settings-default-model")).toHaveValue("fixture/existing");
  page.once("dialog", async (dialog) => { dialogs++; await dialog.accept(); });
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  expect(dialogs).toBe(2);
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toHaveCount(0);
  await configuredModelEdit(page, "fixture", "existing").click();
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#settings-default-model")).toHaveValue("");
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await expect(key).toHaveValue("");
  expect(state.writes).toEqual([]);
  expect(state.gatewayWrites ?? []).toEqual([]);
});

test("acceptance: explicitly disabled defaults are explained and excluded from new choices", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  state.configuration.models[0]!.enabled = false;
  state.configuration.defaults = { default_model: "fixture/existing" };
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const selected = page.locator("#settings-default-model option[value='fixture/existing']");
  await expect(selected).toBeDisabled();
  await expect(selected).toContainText("Unavailable");
  await expect(page.getByRole("button", { name: "Save default model", exact: true })).toBeDisabled();
});

test("acceptance: validation started before suspension cannot commit after reconnect", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  let releaseValidation!: () => void;
  state.delayValidation = () => new Promise<void>((resolve) => { releaseValidation = resolve; });
  await installProviderFixture(context, state);
  await context.route("**/v1/dashboard/theme", async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    await route.fulfill({ status: 401, json: { error: { code: "invalid_api_key", message: "Synthetic unauthorized" } } });
  });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#settings-default-model").selectOption("fixture/existing");
  await page.getByRole("button", { name: "Save default model", exact: true }).click();
  await expect.poll(() => !!releaseValidation).toBe(true);
  await page.getByRole("button", { name: "Green #16856b" }).click();
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  await page.locator("#gateway-api-key").fill("synthetic-successor-reconnect-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  releaseValidation();
  await expect(page.getByRole("region", { name: "Global default model", exact: true })).toHaveAttribute("aria-busy", "false");
  expect(state.writes.length, "stale validation must not issue a PUT after a new admission").toBe(0);
  expect(state.configuration.defaults?.default_model).toBeNull();
});
