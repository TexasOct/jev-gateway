import { test, expect } from "@playwright/test";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";

test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route("**/*", (route) => {
    const request = route.request();
    // The component fixture uses Vite source modules; deny all external traffic.
    if (new URL(request.url()).origin === origin && request.method() === "GET" && !new URL(request.url()).pathname.startsWith("/v1/")) return route.continue();
    return route.abort("blockedbyclient");
  });
  await context.addInitScript(() => localStorage.setItem("jev-dashboard-locale", "en"));
});

function state(): ProviderFixtureState { return { configuration: providerFixture(), writes: [], validations: [], selectors: [] }; }
const open = async (page: import("@playwright/test").Page) => { await page.goto("/dashboard/tests/settings/security.html"); await expect(page.getByText("Configured", { exact: true })).toBeVisible(); };
const key = (page: import("@playwright/test").Page) => page.getByLabel("New gateway access key", { exact: true });

test("failed rotation retains its memory draft, retries once, and activates the new Bearer", async ({ page, context }) => {
  const fixture = state(); fixture.rejectGatewayWrite = 500;
  await installProviderFixture(context, fixture); await open(page);
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await expect(key(page)).toBeFocused();
  await expect(key(page)).toHaveAttribute("type", "password");
  await key(page).fill("synthetic-settings-key"); await key(page).press("Enter");
  await expect(page.getByRole("alert")).toContainText("could not save or activate");
  await expect(key(page)).toHaveValue("synthetic-settings-key");
  await expect(page.locator("body")).not.toContainText("synthetic-gateway-error");
  await key(page).press("Enter");
  await expect(page.getByRole("status")).toContainText("Access key saved.");
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toBeFocused();
  expect(fixture.gatewayWrites).toHaveLength(2);
  expect(fixture.gatewayHeaders?.find((request) => request.path === "/v1/routing/configuration")?.authorization).toBe("Bearer synthetic-settings-key");
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await expect(key(page)).toHaveValue("");
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }))).toEqual({ local: { "jev-dashboard-locale": "en" }, session: {}, cookie: "" });
  expect(await context.cookies()).toEqual([]);
  expect(new URL(page.url()).pathname).toBe("/dashboard/tests/settings/security.html");
  expect(new URL(page.url()).search).toBe("");
  await expect(page.locator("body")).not.toContainText("synthetic-settings-key");
});

test("discard guards Escape and navigation, restores focus and cleans up on unmount", async ({ page, context }) => {
  await installProviderFixture(context, state()); await open(page);
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await key(page).fill("synthetic-unsaved-key");
  page.once("dialog", (dialog) => dialog.dismiss()); await key(page).press("Escape");
  await expect(key(page)).toHaveValue("synthetic-unsaved-key");
  page.once("dialog", (dialog) => dialog.dismiss()); await page.getByRole("button", { name: "Leave settings", exact: true }).click();
  await expect(key(page)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept()); await key(page).press("Escape");
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await key(page).fill("synthetic-discard-key");
  page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Leave settings", exact: true }).click();
  await expect(page.getByRole("region", { name: "Access and security", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await expect(key(page)).toHaveValue("");
  await page.getByRole("button", { name: "Leave settings", exact: true }).click();
  await expect(page.getByRole("region", { name: "Access and security", exact: true })).toHaveCount(0);
});

test("committed rotation reports catalog failure and retries the read without another write", async ({ page, context }) => {
  const fixture = state(); fixture.rejectCatalogRead = 500;
  await installProviderFixture(context, fixture); await open(page);
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await key(page).fill("synthetic-committed-key"); await key(page).press("Enter");
  await expect(page.getByRole("status")).toContainText("Access key saved and active");
  await expect(key(page)).toHaveCount(0);
  fixture.rejectCatalogRead = undefined;
  await page.getByRole("button", { name: "Retry catalog refresh", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Access key saved.");
  expect(fixture.gatewayWrites).toHaveLength(1);
});

test("320px initialization uses keyboard and prevents duplicate pending writes", async ({ page, context }) => {
  const fixture = state(); fixture.configuration.gateway.has_api_key = false;
  fixture.configuration.gateway_bootstrap_available = true; fixture.configuration.write_available = false;
  let release!: () => void;
  fixture.delayGatewayWrite = () => new Promise<void>((resolve) => { release = resolve; });
  await installProviderFixture(context, fixture); await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/dashboard/tests/settings/security.html");
  const trigger = page.getByRole("button", { name: "Initialize access key", exact: true });
  await trigger.focus(); await trigger.press("Enter");
  await expect(key(page)).toBeFocused(); await key(page).fill("synthetic-initialized-key"); await key(page).press("Enter");
  await expect.poll(() => fixture.gatewayWrites?.length).toBe(1);
  await expect(key(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Initialize access key", exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Saving and activating");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Leave settings", exact: true }).click();
  await expect(key(page)).toBeVisible();
  release();
  await expect(page.getByRole("status")).toContainText("Access key saved.");
  expect(fixture.gatewayWrites).toHaveLength(1);
});

test("revision conflict retains the key through reload and submits the new revision", async ({ page, context }) => {
  const fixture = state(); fixture.rejectGatewayWrite = 409;
  await installProviderFixture(context, fixture); await open(page);
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await key(page).fill("synthetic-conflict-key"); await key(page).press("Enter");
  await expect(page.getByRole("alert")).toContainText("configuration changed elsewhere");
  fixture.configuration.revision = "new-revision";
  await page.getByRole("button", { name: "Reload current configuration", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(key(page)).toHaveValue("synthetic-conflict-key");
  await expect(key(page)).toBeEnabled();
  await key(page).press("Enter");
  await expect(page.getByRole("status")).toContainText("Access key saved.");
  expect(fixture.gatewayWrites?.at(-1)?.expected_revision).toBe("new-revision");
});

test("an initial failed read shows an unknown state and offers a successful retry", async ({ page, context }) => {
  const fixture = state(); fixture.rejectRead = 503;
  await installProviderFixture(context, fixture); await page.goto("/dashboard/tests/settings/security.html");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Not configured", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toHaveCount(0);
  fixture.rejectRead = undefined;
  await page.getByRole("button", { name: "Reload current configuration", exact: true }).click();
  await expect(page.getByText("Configured", { exact: true })).toBeVisible();
});

test("remote initialization and read-only replacement expose their permission requirements", async ({ page, context }) => {
  const fixture = state(); fixture.configuration.gateway.has_api_key = false; fixture.configuration.write_available = false;
  await installProviderFixture(context, fixture); await page.goto("/dashboard/tests/settings/security.html");
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
  await expect(page.getByText("For remote setup", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Initialize access key", exact: true })).toHaveCount(0);
  fixture.configuration.gateway.has_api_key = true;
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Replacement requires the current gateway key");
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toHaveCount(0);
  expect(fixture.gatewayWrites ?? []).toEqual([]);
});

test("320px Chinese settings keep access and actions inside the viewport", async ({ page, context }, testInfo) => {
  await context.addInitScript(() => localStorage.setItem("jev-dashboard-locale", "zh-CN"));
  await installProviderFixture(context, state()); await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/dashboard/tests/settings/security.html");
  await page.getByRole("button", { name: "替换访问密钥", exact: true }).click();
  await expect(page.getByLabel("新的网关访问密钥", { exact: true })).toBeFocused();
  await expect(page.getByLabel("新的网关访问密钥", { exact: true })).toHaveValue("");
  const save = page.getByRole("button", { name: "保存访问密钥", exact: true });
  await save.scrollIntoViewIfNeeded();
  const box = await save.boundingBox();
  expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Only an empty password field is captured; all other tests keep screenshots off.
  await page.screenshot({ path: testInfo.outputPath("settings-zh-320-empty.png"), fullPage: true, mask: [page.locator('input[type="password"]')] });
  await page.getByLabel("新的网关访问密钥", { exact: true }).press("Escape");
  await expect(page.getByRole("button", { name: "替换访问密钥", exact: true })).toBeFocused();
});
