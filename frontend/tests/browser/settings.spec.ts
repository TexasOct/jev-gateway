import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";

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
  await expect(page.getByRole("button", { name: "Add rule", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset to baseline", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Provider & models", exact: true }).click();
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
