import { test, expect } from "./fixtures";
import { en } from "../../src/shared/i18n/en";
import { configuration } from "../fixtures/configuration";
import type { CanvasLayout } from "../../src/shared/api/types";

const path = "/v1/dashboard/canvas-layout";
const saved: CanvasLayout = { version: 1, nodes: { "rule-0": { x: 420, y: 80 } }, viewport: { x: 0, y: 0 } };

for (const status of [503, 401]) for (const newer of [false, true]) test(`obsolete validation ${status} cannot deliver after reconnect with newer=${newer}`, async ({ page, mockApi }, info) => {
  let releaseMetadata!: () => void, releaseValidation!: () => void, releaseCurrent!: () => void;
  const metadata = new Promise<void>((resolve) => { releaseMetadata = resolve; });
  const validation = new Promise<void>((resolve) => { releaseValidation = resolve; });
  const currentValidation = new Promise<void>((resolve) => { releaseCurrent = resolve; });
  let metadataCalls = 0, validations = 0;
  const order: string[] = [];
  mockApi.canvasLayout = structuredClone(saved);
  mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate" });
  await page.route("**/v1/routing/strategies", async (route) => {
    if (++metadataCalls !== 2) return route.fallback();
    order.push("metadata admitted"); await metadata;
    order.push("metadata 401");
    await route.fulfill({ status: 401, json: { error: { message: "Synthetic metadata suspension" } } });
  });
  await page.route("**/v1/routing/configuration/validate", async (route) => {
    expect(route.request().method()).toBe("POST");
    if (++validations === 2) {
      order.push("current validation admitted"); await currentValidation;
      order.push("current validation resolved");
      return route.fulfill({ json: { valid: true, warnings: [] } });
    }
    order.push("validation admitted"); await validation;
    order.push("obsolete validation rejected");
    await route.fulfill({ status, json: { error: { message: "OBSOLETE VALIDATION FAILURE" } } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await page.locator('[data-canvas-node="fallback"]').focus(); await page.keyboard.press("Enter");
  await page.getByRole("complementary", { name: en.nodeInspector }).getByRole("combobox", { name: en.label, exact: true }).selectOption("quality");
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await page.getByRole("button", { name: en.reviewChanges, exact: true }).click();
  await expect.poll(() => validations).toBe(1);
  releaseMetadata();
  await expect(page.locator("#gateway-api-key")).toBeVisible();
  await page.locator("#gateway-api-key").fill("synthetic-tail-reconnect-key");
  await page.getByRole("button", { name: en.connect, exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  if (newer) {
    await page.getByRole("button", { name: en.reviewChanges, exact: true }).click();
    await expect.poll(() => validations).toBe(2);
  }
  const rejected = page.waitForResponse((response) => response.url().endsWith("/v1/routing/configuration/validate"));
  releaseValidation(); expect((await rejected).status()).toBe(status);
  if (newer) {
    await expect(page.getByRole("button", { name: en.reviewChanges, exact: true })).toBeDisabled();
    await expect(page.locator(".workspace-heading")).toContainText(en.canvasValidatingPolicy);
  } else await expect(page.getByRole("button", { name: en.reviewChanges, exact: true })).toBeEnabled();
  await expect(page.getByText("OBSOLETE VALIDATION FAILURE", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  await expect(page.locator("[data-policy-draft]").first()).toHaveAttribute("data-policy-draft", "pending");
  if (newer) {
    releaseCurrent();
    await expect(page.getByRole("button", { name: en.confirmAndSave, exact: true })).toBeEnabled();
  }
  expect(order).toEqual(newer ? ["metadata admitted", "validation admitted", "metadata 401", "current validation admitted", "obsolete validation rejected", "current validation resolved"] : ["metadata admitted", "validation admitted", "metadata 401", "obsolete validation rejected"]);
  expect(validations).toBe(newer ? 2 : 1);
  expect(mockApi.requests.filter((request) => request.method !== "GET")).toEqual([]);
  await info.attach("request-order", { body: JSON.stringify(order), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`reconnected-${status}.png`), fullPage: true });
});

for (const failure of ["http", "invalid", "read_error"] as const) test(`unresolved ${failure} layout retries GET and preserves saved nodes`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(saved);
  let reads = 0;
  const methods: string[] = [];
  await page.route(`**${path}`, async (route) => {
    const method = route.request().method(); methods.push(method);
    if (method !== "GET" || ++reads !== 1) return route.fallback();
    if (failure === "http") await route.fulfill({ status: 503, json: { error: { message: "Synthetic unread layout" } } });
    else await route.fulfill({ json: failure === "invalid" ? { version: 999 } : { version: 1, nodes: {}, viewport: { x: 0, y: 0 }, read_error: "Synthetic unread bytes" } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const retryRead = page.getByRole("button", { name: new RegExp(`^(${en.canvasRetryLayoutRead}|${en.canvasRetryLayout})$`) });
  await expect(retryRead).toBeVisible();
  await expect.soft(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeDisabled();
  expect(methods).toEqual(["GET"]); expect(mockApi.canvasLayout).toEqual(saved);
  await retryRead.click();
  await expect.poll(() => methods.length).toBe(2);
  expect.soft(methods).toEqual(["GET", "GET"]);
  expect.soft(mockApi.canvasLayout).toEqual(saved);
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  expect(methods).toEqual(["GET", "GET"]);
  const node = page.locator('[data-canvas-node="rule-0"]');
  await expect.poll(() => node.evaluate((element) => ({ x: parseFloat((element as HTMLElement).style.left), y: parseFloat((element as HTMLElement).style.top) }))).toEqual(saved.nodes["rule-0"]);
  await node.focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => mockApi.canvasLayout?.nodes["rule-0"]).toEqual({ x: 440, y: 80 });
  expect(mockApi.canvasLayout?.viewport).toEqual(saved.viewport);
  expect(methods).toEqual(["GET", "GET", "PUT"]);
  expect(mockApi.requests.filter((request) => request.method !== "GET" && request.path !== path)).toEqual([]);
  await info.attach("request-order", { body: JSON.stringify(methods), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`read-recovery-${failure}.png`), fullPage: true });
});

test("known-layout write error safely retries the rolled-back snapshot", async ({ page, mockApi }) => {
  mockApi.canvasLayout = structuredClone(saved);
  const attempts: CanvasLayout[] = [];
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    attempts.push(route.request().postDataJSON() as CanvasLayout);
    if (attempts.length === 1) await route.fulfill({ status: 503, json: { error: { message: "Synthetic write failure" } } });
    else await route.fallback();
  });
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  await page.locator('[data-canvas-node="rule-0"]').focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect(page.getByRole("button", { name: en.canvasRetryLayout, exact: true })).toBeVisible();
  expect(mockApi.canvasLayout).toEqual(saved);
  await page.getByRole("button", { name: en.canvasRetryLayout, exact: true }).click();
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[0]?.nodes["rule-0"]).toEqual({ x: 440, y: 80 });
  expect(attempts[1]).toEqual(saved);
  await expect(page.getByRole("button", { name: en.canvasRetryLayout, exact: true })).toHaveCount(0);
  expect(mockApi.canvasLayout).toEqual(saved);
});

test("a GET admitted before suspension cannot replace the reconnect snapshot", async ({ page, mockApi }) => {
  mockApi.canvasLayout = structuredClone(saved);
  let releaseRead!: () => void, releaseMetadata!: () => void;
  const read = new Promise<void>((resolve) => { releaseRead = resolve; });
  const metadata = new Promise<void>((resolve) => { releaseMetadata = resolve; });
  let reads = 0, metadataCalls = 0;
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== "GET" || ++reads !== 1) return route.fallback();
    await read;
    await route.fulfill({ json: { version: 1, nodes: { "rule-0": { x: 900, y: 600 } }, viewport: { x: 300, y: 200 } } });
  });
  await page.route("**/v1/routing/strategies", async (route) => {
    if (++metadataCalls !== 2) return route.fallback();
    await metadata; await route.fulfill({ status: 401, json: { error: { message: "Synthetic metadata suspension" } } });
  });
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect.poll(() => reads).toBe(1); releaseMetadata();
  await expect(page.locator("#gateway-api-key")).toBeVisible();
  await page.locator("#gateway-api-key").fill("synthetic-tail-read-reconnect");
  await page.getByRole("button", { name: en.connect, exact: true }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  expect(reads).toBe(2);
  const old = page.waitForResponse((response) => response.url().endsWith(path));
  releaseRead(); await old;
  const node = page.locator('[data-canvas-node="rule-0"]');
  await expect.poll(() => node.evaluate((element) => parseFloat((element as HTMLElement).style.left))).toBe(420);
  await node.focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => mockApi.canvasWrites?.length).toBe(1);
  expect(mockApi.canvasLayout).toEqual({ ...saved, nodes: { "rule-0": { x: 440, y: 80 } } });
  expect(mockApi.requests.filter((request) => request.method !== "GET")).toEqual([{ method: "PUT", path }]);
});

for (const missing of [false, true]) test(`legitimate ${missing ? "missing-file default" : "empty GET"} allows native layout writes`, async ({ page, mockApi }) => {
  if (!missing) mockApi.canvasLayout = { version: 1, nodes: {}, viewport: { x: 0, y: 0 } };
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  await page.locator('[data-canvas-node="rule-0"]').focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => mockApi.canvasWrites?.length).toBe(1);
  expect(mockApi.canvasLayout?.nodes["rule-0"]).toBeDefined();
  expect(mockApi.requests.filter((request) => request.method !== "GET")).toEqual([{ method: "PUT", path }]);
  expect(mockApi.appliedConfiguration ?? configuration).toEqual(configuration);
});
