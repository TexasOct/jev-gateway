import { test, expect } from "./fixtures";
import { configuredModelEdit, openProviderModels } from "../fixtures/open-provider-models";
import { configuration } from "../fixtures/configuration";
import { test as providerTest } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";

providerTest("Settings owns gateway fields and discards simultaneous drafts with one decision", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await openProviderModels(page, "fixture");
  await expect(page.getByRole("region", { name: "Gateway access key", exact: true })).toHaveCount(0);
  await configuredModelEdit(page, "fixture", "existing").click();
  await expect(page.getByRole("region", { name: "Gateway access key", exact: true })).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  const key = page.getByLabel("New gateway access key", { exact: true });
  const model = page.getByRole("combobox", { name: "Global default model", exact: true });
  await key.fill("synthetic-unsaved-settings-key");
  await model.selectOption("fixture/existing");
  let decisions = 0;
  const cancel = async (dialog: import("@playwright/test").Dialog) => { decisions++; await dialog.dismiss(); };
  page.on("dialog", cancel);
  await page.getByRole("button", { name: "Monitoring", exact: true }).click();
  expect(decisions).toBe(1);
  await expect(key).toHaveValue("synthetic-unsaved-settings-key");
  await expect(model).toHaveValue("fixture/existing");
  const dirty = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(dirty).toBe(true);
  page.off("dialog", cancel);
  page.once("dialog", async (dialog) => { decisions++; await dialog.accept(); });
  await page.getByRole("button", { name: "Monitoring", exact: true }).click();
  expect(decisions).toBe(2);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(key).toHaveCount(0);
  await expect(model).toHaveValue("");
  const clean = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(clean).toBe(false);
  expect(state.gatewayWrites ?? []).toEqual([]);
  expect(state.writes).toEqual([]);
  expect(state.validations).toEqual([]);
});

providerTest("a committed Settings write retries only its failed catalog read", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const region = page.getByRole("region", { name: "Global default model", exact: true });
  await region.getByLabel("Global default model", { exact: true }).selectOption("fixture/existing");
  state.rejectCatalogRead = 503;
  await region.getByRole("button", { name: "Save default model", exact: true }).click();
  await expect(region.getByRole("alert")).toBeVisible();
  expect(state.configuration.defaults?.default_model).toBe("fixture/existing");
  expect(state.writes).toHaveLength(1);
  const reads = state.catalogReads ?? 0;
  state.rejectCatalogRead = undefined;
  await region.getByRole("button", { name: "Retry catalog refresh", exact: true }).click();
  await expect(region.getByRole("alert")).toHaveCount(0);
  expect(state.catalogReads).toBeGreaterThan(reads);
  expect(state.writes).toHaveLength(1);
});

providerTest("an unauthorized Settings save retains the draft after reconnect", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Global default model", exact: true }).selectOption("fixture/existing");
  state.rejectWrite = 401;
  await page.getByRole("button", { name: "Save default model", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  await page.getByLabel("Gateway API key", { exact: true }).fill("synthetic-reconnect-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Global default model", exact: true })).toHaveValue("fixture/existing");
  expect(state.configuration.defaults?.default_model).toBeNull();
  expect(state.writes).toHaveLength(1);
});

test("settings permits theme writes while provider and routing writes remain unavailable", async ({ page, mockApi }) => {
  mockApi.appliedConfiguration = { ...configuration, write_available: false };
  mockApi.allowedWrites.push({ method: "PUT", path: "/v1/dashboard/theme" });
  await page.route("**/v1/routing/configuration", async (route) => {
    await route.fulfill({ json: { ...configuration, write_available: false } });
  });
  await page.goto("/dashboard/");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Strategy workflow", exact: true }).click();
  await expect(page.locator(".routing-canvas-scroll")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add node", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset to baseline", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add provider", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Green #16856b" })).toBeEnabled();
  await expect(page.getByLabel("Choose color")).toBeEnabled();
  await page.getByRole("button", { name: "Green #16856b" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Theme seed saved." })).toBeVisible();
  expect(mockApi.allowedWrites[0]?.body).toEqual({ version: 1, seed: "#16856b" });
  expect(mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/dashboard/theme")).toHaveLength(1);
  await expect(page.getByLabel("Language", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Color scheme", { exact: true })).toBeEnabled();
});

test("a late settings read cannot overwrite a newer theme read", async ({ page }) => {
  await page.goto("/dashboard/");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  await page.route("**/v1/dashboard/theme", async (route) => {
    reads++;
    const seed = reads === 1 ? "#112233" : "#445566";
    if (reads === 1) await delayed;
    await route.fulfill({ json: { version: 1, seed } });
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect.poll(() => reads).toBe(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Choose color")).toHaveValue("#445566");
  const lateResponse = page.waitForResponse("**/v1/dashboard/theme");
  release();
  await lateResponse;
  await expect(page.getByLabel("Choose color")).toHaveValue("#445566");
});

test("settings re-entry during a theme write keeps the write pending and skips reads", async ({ page, mockApi }) => {
  await page.goto("/dashboard/");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const picker = page.getByLabel("Choose color");
  await expect(page.getByRole("button", { name: "Blue #3b66d9" })).toBeEnabled();
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  await page.route("**/v1/dashboard/theme", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    writes++;
    await delayed;
    await route.fulfill({ json: { version: 1, seed: "#16856b" } });
  });
  await page.getByRole("button", { name: "Green #16856b" }).click();
  await expect.poll(() => writes).toBe(1);
  const reads = mockApi.requests.filter(({ path }) => path === "/v1/dashboard/theme").length;
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Choose color")).toBeDisabled();
  expect(mockApi.requests.filter(({ path }) => path === "/v1/dashboard/theme")).toHaveLength(reads);
  release();
  await expect(page.getByRole("status").filter({ hasText: "Theme seed saved." })).toBeVisible();
  await expect(picker).toHaveValue("#16856b");
  expect(writes).toBe(1);
});

test("a failed settings theme read is visible and can be retried", async ({ page, mockApi }) => {
  await page.goto("/dashboard/");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
  mockApi.rejectThemeRead = true;
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Synthetic theme read failure").first()).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Synthetic theme read failure")).toHaveCount(0);
});

test("a settings write rejected with 401 requires reconnection without persisting credentials", async ({ page }) => {
  await page.goto("/dashboard/");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Blue #3b66d9" })).toBeEnabled();
  await page.route("**/v1/dashboard/theme", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await route.fulfill({ status: 401, json: { error: { message: "Synthetic unauthorized" } } });
  });
  await page.getByRole("button", { name: "Green #16856b" }).click();
  await expect(page.getByLabel("API key")).toBeVisible();
  await page.getByLabel("API key").fill("synthetic-settings-credential");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByLabel("API key")).toHaveCount(0);
  expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie }))).toEqual({ local: ["jev-dashboard-locale"], session: [], cookie: "" });
});

test("a failed theme write preserves the saved seed and permits one successful retry", async ({ page, mockApi }) => {
  mockApi.allowedWrites.push({ method: "PUT", path: "/v1/dashboard/theme" });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Green #16856b" })).toBeEnabled();
  let attempts = 0;
  await page.route("**/v1/dashboard/theme", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 500, json: { error: { message: "Synthetic theme write failure" } } });
    return route.fallback();
  });
  await page.getByRole("button", { name: "Green #16856b" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic theme write failure" })).toBeVisible();
  expect(mockApi.themeSeed).toBe("#3b66d9");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Choose color")).toHaveValue("#3b66d9");
  await expect(page.getByRole("button", { name: "Green #16856b" })).toBeEnabled();
  await page.getByRole("button", { name: "Green #16856b" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Theme seed saved." })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Choose color")).toHaveValue("#16856b");
  expect(attempts).toBe(2);
  expect(mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/dashboard/theme")).toHaveLength(1);
});
