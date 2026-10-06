import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";

function pendingFixture(): ProviderFixtureState {
  const configuration = providerFixture();
  configuration.gateway = { api_key_env: null, has_api_key: false };
  configuration.gateway_bootstrap_available = true;
  configuration.write_available = false;
  configuration.providers[0]!.has_api_key = false;
  configuration.decision.providers[0]!.has_api_key = false;
  return { configuration, writes: [], validations: [], selectors: [], enforceGatewayAuth: true };
}

async function open(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/");
  // Pending catalogs enter through the standalone setup page before management.
  await expect(page.locator("#setup-key, [data-dashboard-view-nav]")).toBeVisible();
  if (await page.locator("#setup-key").count()) {
    await page.locator("#setup-key").fill("synthetic-fixture-key");
    await page.getByRole("button", { name: "Initialize gateway access key", exact: true }).click();
  }
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture provider", exact: true })).toBeVisible();
}

async function assertNoStoredKey(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext, keys: string[]) {
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }));
  const cookies = await context.cookies();
  for (const key of keys) {
    expect(JSON.stringify({ storage, cookies })).not.toContain(key);
    await expect(page.locator("body")).not.toContainText(key);
  }
}

test("initializes access, configures both provider kinds and never reloads saved keys into forms", async ({ page, context }) => {
  const state = pendingFixture(); await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  const setupKey = page.locator("#setup-key");
  await expect(setupKey).toHaveAttribute("type", "password");
  await expect(page.locator("[data-dashboard-view-nav]")).toHaveCount(0);
  await setupKey.fill("synthetic-bootstrap-key");
  const response = page.waitForResponse((reply) => reply.url().endsWith("/v1/setup") && reply.request().method() === "POST");
  await setupKey.press("Enter");
  expect(JSON.stringify(await (await response).json())).not.toContain("synthetic-bootstrap-key");
  await expect(setupKey).toHaveCount(0);
  expect(state.setupWrites).toEqual([{ expected_revision: "r1", api_key: "synthetic-bootstrap-key" }]);
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add provider", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  const key = page.getByLabel("New gateway access key", { exact: true });
  await expect(key).toHaveAttribute("type", "password");
  await expect(key).toHaveValue("");
  expect(state.gatewayWrites ?? []).toEqual([]);
  expect(state.gatewayHeaders?.filter((request) => request.path === "/v1/routing/configuration").at(-1)?.authorization).toBe("Bearer synthetic-bootstrap-key");
  await page.getByRole("region", { name: "Gateway access key", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  for (const [kind, secret] of [["LLM providers", "synthetic-llm-key"], ["Decision providers", "synthetic-decision-key"]] as const) {
    await page.getByRole("button", { name: kind, exact: true }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const input = page.getByLabel("New provider credential", { exact: true });
    await expect(input).toHaveValue("");
    await input.fill(secret);
    await page.getByRole("button", { name: "Validate and save", exact: true }).click();
    await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Credential action").selectOption("set");
    await expect(input).toHaveValue("");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  }
  await assertNoStoredKey(page, context, ["synthetic-bootstrap-key", "synthetic-llm-key", "synthetic-decision-key"]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  await expect(page.getByLabel("Gateway API key", { exact: true })).toHaveValue("");
  await page.getByLabel("Gateway API key", { exact: true }).fill("synthetic-bootstrap-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await page.getByRole("button", { name: "LLM providers", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Credential action").selectOption("set");
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("");
  await assertNoStoredKey(page, context, ["synthetic-bootstrap-key", "synthetic-llm-key", "synthetic-decision-key"]);
});

test("clears submitted access keys while pending, prevents duplicate writes and survives authenticated rotation", async ({ page, context }) => {
  const state = pendingFixture(); let release!: () => void;
  state.delayGatewayWrite = () => new Promise<void>((resolve) => { release = resolve; });
  await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  const key = page.getByLabel("New gateway access key", { exact: true });
  await key.fill("synthetic-initial-key");
  await key.press("Enter");
  await expect.poll(() => state.gatewayWrites?.length).toBe(1);
  await expect(key).toHaveValue("");
  await expect(key).toBeDisabled();
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save access key", exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await key.fill("synthetic-rotated-key");
  await page.getByRole("button", { name: "Save access key", exact: true }).click();
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toBeEnabled();
  expect(state.gatewayWrites).toHaveLength(2);
  const headers = state.gatewayHeaders?.filter((request) => request.path === "/v1/gateway-credential");
  expect(headers?.[1]?.authorization).toBe("Bearer synthetic-initial-key");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("region", { name: "Gateway access key", exact: true })).toBeVisible();
  expect(state.gatewayHeaders?.filter((request) => request.path === "/v1/provider-configuration").at(-1)?.authorization).toBe("Bearer synthetic-rotated-key");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await expect(key).toHaveValue("");
  await key.fill("synthetic-cancelled-key");
  page.once("dialog", (dialog) => dialog.accept());
  await key.press("Escape");
  await expect(key).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await expect(key).toHaveValue("");
  await assertNoStoredKey(page, context, ["synthetic-initial-key", "synthetic-rotated-key", "synthetic-cancelled-key"]);
});

test("failed replacement retains the key, reports conflict and retries with the refreshed revision", async ({ page, context }) => {
  const state = pendingFixture(); state.rejectGatewayWrite = 409;
  await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  const key = page.getByLabel("New gateway access key", { exact: true });
  await key.fill("synthetic-rejected-key"); await key.press("Enter");
  const access = page.getByRole("region", { name: "Gateway access key", exact: true });
  await expect(access.getByRole("alert")).toContainText(/configuration changed elsewhere/i);
  await expect(page.getByRole("region", { name: "Global default model", exact: true }).getByRole("alert")).toHaveCount(0);
  await expect(key).toHaveValue("synthetic-rejected-key");
  await expect(page.getByText("synthetic-gateway-error-must-not-render")).toHaveCount(0);
  expect(state.configuration.gateway.has_api_key).toBe(true);
  state.configuration.revision = "external-r2";
  await access.getByRole("button", { name: "Reload current configuration", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await key.fill("synthetic-retry-key"); await key.press("Enter");
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toBeEnabled();
  expect(state.gatewayWrites?.[1]?.expected_revision).toBe("external-r2");
  await assertNoStoredKey(page, context, ["synthetic-rejected-key", "synthetic-retry-key"]);
});

test("remote anonymous configuration keeps management locked and explains local setup", async ({ page, context }) => {
  const state = pendingFixture(); state.configuration.gateway_bootstrap_available = false;
  await installProviderFixture(context, state); await page.goto("/dashboard/");
  await expect(page.getByRole("button", { name: "Initialize access key", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-dashboard-view-nav]")).toHaveCount(0);
  await expect(page.locator("#setup-key")).toHaveCount(0);
  await expect(page.getByText(/jev setup --secret-stdin/)).toBeVisible();
  expect(state.gatewayWrites ?? []).toEqual([]);
});

test("waits for a successful rotation response before exposing an old read's early 401", async ({ page, context }) => {
  const state = pendingFixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  const input = page.getByLabel("New gateway access key", { exact: true });
  await input.fill("synthetic-before-race"); await input.press("Enter");
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toBeEnabled();
  let releaseRead: (() => void) | undefined;
  let intercept = true;
  await context.route("**/v1/routing/configuration", async (route) => {
    if (!intercept) return route.fallback();
    intercept = false;
    await new Promise<void>((resolve) => { releaseRead = resolve; });
    return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "invalid_api_key", message: "Synthetic early unauthorized" } }) });
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => typeof releaseRead).toBe("function");
  let releaseWrite: (() => void) | undefined;
  state.delayGatewayWrite = () => new Promise<void>((resolve) => { releaseWrite = resolve; });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await input.fill("synthetic-after-race"); await input.press("Enter");
  await expect.poll(() => typeof releaseWrite).toBe("function");
  const earlyRead = page.waitForResponse((response) => response.url().endsWith("/v1/routing/configuration") && response.status() === 401);
  releaseRead!(); await (await earlyRead).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toHaveCount(0);
  await expect(input).toHaveValue("");
  releaseWrite!();
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toHaveCount(0);
  expect(state.gatewayHeaders?.filter((entry) => entry.path === "/v1/routing/configuration").at(-1)?.authorization).toBe("Bearer synthetic-after-race");
  await assertNoStoredKey(page, context, ["synthetic-before-race", "synthetic-after-race"]);
});

for (const kind of ["llm", "decision"] as const) {
  for (const phase of ["delayValidation", "delayWrite", "delayCatalogRead"] as const) {
    test(`clears ${kind} input immediately while ${phase} is pending`, async ({ page, context }) => {
      const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
      state.configuration.providers[0]!.has_api_key = false;
      state.configuration.decision.providers[0]!.has_api_key = false;
      await installProviderFixture(context, state); await open(page);
      await page.getByRole("button", { name: kind === "llm" ? "LLM providers" : "Decision providers", exact: true }).click();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const input = page.getByLabel("New provider credential", { exact: true });
      const secret = `synthetic-pending-${kind}-${phase}`;
      await input.fill(secret);
      let release: (() => void) | undefined;
      state[phase] = () => new Promise<void>((resolve) => { release = resolve; });
      await page.getByRole("button", { name: "Validate and save", exact: true }).click();
      await expect.poll(() => typeof release).toBe("function");
      await expect(input).toHaveValue("");
      await expect(input).toBeDisabled();
      release!();
      await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
      expect(state.validations[0]?.operations[0]).toMatchObject({ credential: { action: "set", value: secret } });
      expect(state.writes[0]?.operations[0]).toMatchObject({ credential: { action: "set", value: secret } });
      await assertNoStoredKey(page, context, [secret]);
    });
  }
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`local key setup is keyboard accessible at 320px in ${locale}`, async ({ page, context }) => {
    const state = pendingFixture(); await installProviderFixture(context, state);
    await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/dashboard/");
    await page.locator("#setup-key").fill("synthetic-mobile-initial-key");
    await page.getByRole("button", { name: locale === "en" ? "Initialize gateway access key" : "初始化网关访问密钥", exact: true }).click();
    await page.getByRole("button", { name: locale === "en" ? "Settings" : "通用设置", exact: true }).click();
    const initialize = page.getByRole("button", { name: locale === "en" ? "Replace access key" : "替换访问密钥", exact: true });
    await initialize.focus(); await initialize.press("Enter");
    const key = page.getByLabel(locale === "en" ? "New gateway access key" : "新的网关访问密钥", { exact: true });
    await page.screenshot({ path: test.info().outputPath(`credentials-form-${locale}.png`), fullPage: true });
    await key.focus(); await expect(key).toBeFocused(); await key.fill("synthetic-mobile-key");
    page.once("dialog", (dialog) => dialog.accept());
    await key.press("Escape");
    await expect(initialize).toBeFocused();
    const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(width.content).toBeLessThanOrEqual(width.viewport);
    await assertNoStoredKey(page, context, ["synthetic-mobile-key"]);
    await page.screenshot({ path: test.info().outputPath(`credentials-${locale}.png`), fullPage: true });
  });
}
