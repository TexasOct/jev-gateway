import { test, expect } from "@playwright/test";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";
import { openProviderModels, providerModelGroup } from "../fixtures/open-provider-models";
import type { Page } from "@playwright/test";
import { activity, providers } from "../fixtures/activity";
import { sessionsPageOne } from "../fixtures/sessions";
import { policy, strategies } from "../fixtures/strategies";

test.beforeEach(async ({ context }) => {
  const reads: Record<string, unknown> = {
    "/v1/routing/providers/summary": providers, "/v1/routing/activity": activity,
    "/v1/routing/strategies": strategies, "/v1/routing/policy": policy,
    "/v1/routing/sessions": sessionsPageOne,
    "/v1/dashboard/theme": { version: 1, seed: "#3b66d9" },
  };
  await context.route("**/v1/**", async (route) => {
    const request = route.request();
    const body = reads[new URL(request.url()).pathname];
    if (request.method() === "GET" && body !== undefined) return route.fulfill({ json: body });
    throw new Error(`Unexpected integration request: ${request.method()} ${new URL(request.url()).pathname}`);
  });
  await context.addInitScript(() => localStorage.setItem("jev-dashboard-locale", "en"));
});

const state = (): ProviderFixtureState => ({ configuration: providerFixture(), writes: [], validations: [], selectors: [] });
const readManager = (page: Page) => page.locator("[data-manager]").textContent().then((text) => JSON.parse(text!));

test("suspend and resume during validation never submits its old write", async ({ page, context }) => {
  const fixture = state();
  let release!: () => void;
  fixture.delayValidation = () => new Promise<void>((resolve) => { release = resolve; });
  await installProviderFixture(context, fixture);
  await page.goto("/dashboard/tests/integration/async-boundaries.html");
  await expect.poll(async () => (await readManager(page)).revision).toBe("r1");
  await page.getByRole("button", { name: "Write default", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await expect.poll(async () => (await readManager(page)).active).toBe(false);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect.poll(async () => (await readManager(page)).active).toBe(true);
  release();
  await expect.poll(async () => (await readManager(page)).pending).toBe(false);
  expect(fixture.writes).toEqual([]);
});

test("HTTP 401 probes suspend but semantic upstream authentication errors stay visible", async ({ page, context }) => {
  const fixture = state();
  fixture.connectionStatus = "authentication_error";
  await installProviderFixture(context, fixture);
  await page.goto("/dashboard/tests/integration/async-boundaries.html");
  await page.getByRole("button", { name: "Probe", exact: true }).click();
  await expect(page.locator("[data-probe]")).toContainText('"status":"authentication_error"');
  expect((await readManager(page)).active).toBe(true);
  await page.route("**/v1/provider-connection-test", (route) => route.fulfill({ status: 401, json: { error: { message: "Synthetic unauthorized" } } }));
  await page.getByRole("button", { name: "Probe", exact: true }).click();
  await expect.poll(async () => (await readManager(page)).active).toBe(false);
});

test("suspended probes ignore a delayed response and reject new probes", async ({ page, context }) => {
  const fixture = state();
  let release!: () => void;
  let calls = 0;
  await installProviderFixture(context, fixture);
  await page.route("**/v1/provider-connection-test", async (route) => { ++calls; await new Promise<void>((resolve) => { release = resolve; }); await route.fulfill({ json: { provider_id: "fixture", status: "success", scope: "model_listing", model_count: 4, warnings: [] } }); });
  await page.goto("/dashboard/tests/integration/async-boundaries.html");
  await page.getByRole("button", { name: "Probe", exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await page.getByRole("button", { name: "Probe", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  release();
  await expect(page.locator("[data-probe]")).toContainText('"pending":false');
  await expect(page.locator("[data-probe]")).toContainText('"result":null');
  expect(calls).toBe(1);
});

test("a supplier address write invalidates delayed metadata from the prior channel", async ({ page, context }) => {
  const fixture = state();
  let release!: () => void;
  fixture.delayMetadata = () => new Promise<void>((resolve) => { release = resolve; });
  await installProviderFixture(context, fixture);
  await page.goto("/dashboard/tests/integration/async-boundaries.html");
  await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole("button", { name: "Write supplier", exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect.poll(async () => (await readManager(page)).pending).toBe(false);
  release();
  await expect.poll(async () => (await readManager(page)).source).toBeNull();
  expect((await readManager(page)).evidence).toEqual([]);
});

test("a committed write survives suspension and reports the omitted consumer refresh", async ({ page, context }) => {
  const fixture = state();
  let release!: () => void;
  fixture.delayWrite = () => new Promise<void>((resolve) => { release = resolve; });
  await installProviderFixture(context, fixture);
  await page.goto("/dashboard/tests/integration/async-boundaries.html");
  await expect.poll(async () => (await readManager(page)).revision).toBe("r1");
  await page.getByRole("button", { name: "Write default", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  release();
  await expect.poll(async () => (await readManager(page)).pending).toBe(false);
  const result = await readManager(page);
  expect(result.revision).toBe("r2"); expect(result.catalogRefreshFailed).toBe(true); expect(result.refreshes).toBe(0);
  expect(fixture.writes).toHaveLength(1);
});

test("conflict reload retains selected imports, manual values and unsubmitted IDs with fresh bound evidence", async ({ page, context }) => {
  const fixture = state();
  await installProviderFixture(context, fixture);
  await page.goto("/dashboard/tests/integration/async-boundaries.html");
  await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect.poll(async () => (await readManager(page)).evidence.length).toBe(3);
  await page.getByRole("checkbox", { name: "fixture/alpha", exact: true }).check();
  await page.getByLabel("Upstream model ID", { exact: true }).fill("unsubmitted-new-model");
  await page.getByRole("button", { name: "Edit model", exact: true }).click();
  await page.locator("#model-dialog-input_per_million").fill("9.75");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("checkbox", { name: /I reviewed/ }).check();
  fixture.rejectWrite = 409;
  await page.getByRole("button", { name: /Confirm and import selected models/ }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  fixture.configuration = { ...fixture.configuration, revision: "external-r3" };
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect.poll(async () => (await readManager(page)).revision).toBe("external-r3");
  await expect(page.getByRole("checkbox", { name: "fixture/alpha", exact: true })).toBeChecked();
  await expect(page.getByLabel("Upstream model ID", { exact: true })).toHaveValue("unsubmitted-new-model");
  await page.getByRole("button", { name: "Query model metadata", exact: true }).click();
  await expect.poll(async () => (await readManager(page)).source?.upstreamModels).toEqual(["alpha"]);
  await page.getByRole("button", { name: "Edit model", exact: true }).click();
  await expect(page.locator("#model-dialog-input_per_million")).toHaveValue("9.75");
  await expect(page.locator("#model-dialog-input_per_million").locator("..")).toContainText("Manual");
  expect(fixture.writes[0]!.operations[0]!.action).toBe("import");
  const operation = fixture.writes[0]!.operations[0]!;
  if (operation.action === "import") expect(operation.models[0]!.metadata?.fields?.input_per_million?.method).toBe("manual");
});

test("whole App keeps one committed write through a refresh 401 and retries only its reads", async ({ page, context }) => {
  const fixture = state();
  await installProviderFixture(context, fixture);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#settings-default-model").selectOption("fixture/existing");
  fixture.rejectCatalogRead = 401;
  await page.getByRole("button", { name: "Save default model", exact: true }).click();
  await expect(page.locator("#gateway-api-key")).toBeFocused();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.configuration.defaults?.default_model).toBe("fixture/existing");
  fixture.rejectCatalogRead = undefined;
  await page.locator("#gateway-api-key").fill("synthetic-reconnect-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  await expect(page.locator("#settings-default-model")).toHaveValue("fixture/existing");
  await openProviderModels(page, "fixture");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const refreshAlert = page.getByRole("region", { name: "Global default model", exact: true }).getByRole("alert");
  await expect(refreshAlert).toBeVisible();
  await expect(refreshAlert).toContainText("The global default model was saved");
  await refreshAlert.getByRole("button", { name: "Retry catalog refresh", exact: true }).click();
  await expect(refreshAlert).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
});

test("whole App policy validation 401 preserves its draft and returns focus to visible login", async ({ page, context }) => {
  const fixture = state();
  await installProviderFixture(context, fixture);
  await page.route("**/v1/routing/configuration/validate", (route) => route.fulfill({ status: 401, json: { error: { message: "Synthetic policy authentication failure" } } }));
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Strategy workflow", exact: true }).click();
  await page.getByRole("button", { name: "Canvas information and advanced editors", exact: true }).click();
  await page.getByRole("button", { name: "Edit fallback", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Node inspector", exact: true });
  await inspector.getByRole("combobox", { name: "Label", exact: true }).selectOption("quality");
  await inspector.getByRole("button", { name: "Close node details", exact: true }).click();
  await page.getByRole("button", { name: "Review changes", exact: true }).click();
  await expect(page.locator("#gateway-api-key")).toBeFocused();
  await expect(page.locator(".app-shell")).toBeHidden();
  await page.locator("#gateway-api-key").fill("synthetic-routing-reconnect-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  await expect(page.locator("[data-policy-draft]").first()).toHaveAttribute("data-policy-draft", "pending");
  await page.getByRole("button", { name: "Canvas information and advanced editors", exact: true }).click();
  await page.getByRole("button", { name: "Edit fallback", exact: true }).click();
  await expect(inspector.getByRole("combobox", { name: "Label", exact: true })).toHaveValue("quality");
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest(".app-shell"))).toBe(true);
});

test("operation errors stay with their view while a genuine current catalog read error remains visible", async ({ page, context }) => {
  const fixture = state();
  await installProviderFixture(context, fixture);
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Rejected supplier name");
  fixture.rejectWrite = 500;
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await openProviderModels(page, "fixture");
  await expect(providerModelGroup(page, "fixture").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit model", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
  await page.getByRole("dialog").getByLabel("Display name", { exact: true }).fill("Rejected model name");
  fixture.rejectWrite = 500;
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  fixture.rejectRead = 503;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload current configuration", exact: true })).toBeVisible();
});

for (const owner of ["default", "gateway"] as const) test(`whole App committed ${owner} write finishes during external theme suspension and retries GETs only`, async ({ page, context }) => {
  const fixture = state();
  let release!: () => void;
  const delay = () => new Promise<void>((resolve) => { release = resolve; });
  if (owner === "default") fixture.delayWrite = delay;
  else fixture.delayGatewayWrite = delay;
  await installProviderFixture(context, fixture);
  await page.route("**/v1/dashboard/theme", (route) => route.request().method() === "GET" ? route.fallback() : route.fulfill({ status: 401, json: { error: { message: "Synthetic external theme suspension" } } }));
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  if (owner === "default") {
    await page.locator("#settings-default-model").selectOption("fixture/existing");
    await page.getByRole("button", { name: "Save default model", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Replace access key", exact: true }).click();
    await page.getByLabel("New gateway access key", { exact: true }).fill("synthetic-committed-during-suspension-key");
    await page.getByRole("button", { name: "Save access key", exact: true }).click();
  }
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole("button", { name: "Green #16856b", exact: true }).click();
  await expect(page.locator("#gateway-api-key")).toBeFocused();
  release();
  await expect.poll(() => fixture.configuration.revision).toBe(owner === "default" ? "r2" : "gateway-r1");
  await expect(page.getByRole("button", { name: "Retry catalog refresh", exact: true, includeHidden: true })).toBeEnabled();
  await page.locator("#gateway-api-key").fill(owner === "gateway" ? "synthetic-committed-during-suspension-key" : "synthetic-default-reconnect-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  if (owner === "default") await expect(page.locator("#settings-default-model")).toHaveValue("fixture/existing");
  const methods: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/v1/")) methods.push(request.method()); });
  const before = fixture.catalogReads ?? 0;
  await page.getByRole("button", { name: "Retry catalog refresh", exact: true }).click();
  await expect.poll(() => fixture.catalogReads ?? 0).toBeGreaterThan(before);
  await expect(page.getByRole("button", { name: "Retry catalog refresh", exact: true })).toHaveCount(0);
  expect(methods.length).toBeGreaterThan(0);
  expect(methods.every((method) => method === "GET")).toBe(true);
  expect(fixture.writes).toHaveLength(owner === "default" ? 1 : 0);
  expect(fixture.gatewayWrites ?? []).toHaveLength(owner === "gateway" ? 1 : 0);
});

test("queued canvas scroll and hidden resize cannot save after layout 401; pending departure is blocked", async ({ page, context }) => {
  const fixture = state();
  let release!: () => void;
  let writes = 0;
  await installProviderFixture(context, fixture);
  await page.route("**/v1/dashboard/canvas-layout", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { version: 1, nodes: {}, viewport: { x: 0, y: 0 } } });
    ++writes;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ status: 401, json: { error: { message: "Synthetic layout authentication failure" } } });
  });
  let discards = 0;
  page.on("dialog", async (dialog) => { ++discards; await dialog.accept(); });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Strategy workflow", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add node", exact: true })).toBeEnabled();
  const node = page.locator('[data-canvas-node="questions"]');
  await node.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => writes).toBe(1);
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Settings", exact: true }).evaluate((button) => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(page.locator(".app-shell")).toHaveAttribute("data-view", "strategy");
  expect(discards).toBe(0);
  await page.locator(".routing-canvas-scroll").evaluate((element) => { element.scrollLeft += 70; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  release();
  await expect(page.locator("#gateway-api-key")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 740 });
  await page.waitForTimeout(600);
  expect(writes).toBe(1);
  await page.locator("#gateway-api-key").fill("synthetic-layout-reconnect-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  await expect(node).toBeVisible();
  expect(writes).toBe(1);
});

test("whole App supplier probe distinguishes raw permission/configuration failures and reauthenticates with retained fields", async ({ page, context }) => {
  const fixture = state();
  await installProviderFixture(context, fixture);
  let status = 400;
  await page.route("**/v1/provider-connection-test", (route) => route.fulfill({ status, json: { error: { message: "Synthetic probe rejection" } } }));
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const name = page.getByLabel("Display name", { exact: true });
  const key = page.getByLabel("New provider credential", { exact: true });
  await name.fill("Retained probe draft");
  await key.fill("synthetic-probe-draft-key");
  const probe = page.getByRole("button", { name: "Test connection", exact: true });
  await probe.click();
  await expect(page.getByRole("alert")).toContainText("configuration was rejected");
  status = 403;
  await probe.click();
  await expect(page.getByRole("alert")).toContainText("requires the configured gateway API key");
  await expect(name).toHaveValue("Retained probe draft");
  status = 401;
  await probe.click();
  await expect(page.locator("#gateway-api-key")).toBeFocused();
  await page.locator("#gateway-api-key").fill("synthetic-probe-reconnect-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  await expect(name).toHaveValue("Retained probe draft");
  await expect(key).toHaveValue("synthetic-probe-draft-key");
  expect(fixture.writes).toEqual([]);
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest(".app-shell"))).toBe(true);
});
