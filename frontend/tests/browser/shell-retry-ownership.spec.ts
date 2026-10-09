import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const path = "/v1/routing/configuration";
async function openFailed(page: Page) {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Strategy workflow", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry configuration read", exact: true })).toBeVisible();
}
async function reconnect(page: Page) {
  let suspend = true;
  await page.route("**/v1/dashboard/theme", route => {
    if (suspend) {
      suspend = false;
      return route.fulfill({ status: 401, json: { error: { message: "controlled suspension" } } });
    }
    return route.fallback();
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  await page.locator("#gateway-api-key").fill("synthetic-shell-reconnect");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
}

test("current shell retry 401 suspends authentication", async ({ page }) => {
  let reads = 0;
  await page.route(`**${path}`, route => route.fulfill({ status: ++reads === 1 ? 503 : 401, json: { error: { message: "controlled read failure" } } }));
  await openFailed(page);
  await page.getByRole("button", { name: "Retry configuration read", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  expect(reads).toBe(2);
  await expect(page.locator(".app-shell")).toBeHidden();
});

for (const status of [200, 503, 401]) {
  test(`retired shell retry ${status} cannot affect reconnected Settings`, async ({ page }) => {
    let reads = 0;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${path}`, async route => {
      if (++reads === 1) return route.fulfill({ status: 503, json: { error: { message: "initial read failed" } } });
      await held;
      if (status === 200) return route.fallback();
      return route.fulfill({ status, json: { error: { message: "obsolete shell retry failure" } } });
    });
    await openFailed(page);
    await page.getByRole("button", { name: "Retry configuration read", exact: true }).click();
    await expect.poll(() => reads).toBe(2);
    await reconnect(page);
    const settled = page.waitForResponse(response => response.url().endsWith(path) && response.status() === status);
    release();
    await (await settled).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator("[data-connection-page]")).toHaveCount(0);
    await expect(page.getByText("obsolete shell retry failure", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  });
  test(`retired shell retry ${status} preserves reconnect and newer busy owner`, async ({ page }) => {
    let reads = 0;
    let releaseOld!: () => void;
    let releaseNew!: () => void;
    const old = new Promise<void>(resolve => { releaseOld = resolve; });
    const newer = new Promise<void>(resolve => { releaseNew = resolve; });
    await page.route(`**${path}`, async route => {
      const read = ++reads;
      if (read === 1 || read === 3) return route.fulfill({ status: 503, json: { error: { message: "initial read failed" } } });
      if (read === 2) {
        await old;
        if (status === 200) return route.fallback();
        return route.fulfill({ status, json: { error: { message: "obsolete shell retry failure" } } });
      }
      await newer;
      return route.fulfill({ status: 503, json: { error: { message: "current retry failure" } } });
    });
    await openFailed(page);
    await page.getByRole("button", { name: "Retry configuration read", exact: true }).click();
    await expect.poll(() => reads).toBe(2);
    await expect(page.getByText("Loading…", { exact: true })).toBeVisible();
    await reconnect(page);
    await page.getByRole("button", { name: "Strategy workflow", exact: true }).click();
    const retry = page.getByRole("button", { name: "Retry configuration read", exact: true });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect.poll(() => reads).toBe(4);
    const settled = page.waitForResponse(response => response.url().endsWith(path) && response.status() === status);
    releaseOld();
    await (await settled).finished();
    // A round trip through the browser task queue lets the delivered fetch continuation run.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator("[data-connection-page]")).toHaveCount(0);
    await expect(page.getByText("obsolete shell retry failure", { exact: true })).toHaveCount(0);
    await expect(page.locator("[data-canvas-node=questions]")).toHaveCount(0);
    await expect(page.getByText("Loading…", { exact: true })).toBeVisible();
    await expect(retry).toHaveCount(0);
    releaseNew();
    await expect(page.getByText("current retry failure", { exact: true })).toBeVisible();
    await expect(retry).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  });
}

test("rapid shell retry input admits one read and retains repeat failure", async ({ page }) => {
  let reads = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${path}`, async route => {
    if (++reads === 1) return route.fulfill({ status: 503, json: { error: { message: "initial read failed" } } });
    await held;
    return route.fulfill({ status: 503, json: { error: { message: "repeat read failed" } } });
  });
  await openFailed(page);
  const retry = page.getByRole("button", { name: "Retry configuration read", exact: true });
  const bounds = (await retry.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { clickCount: 2 });
  await expect.poll(() => reads).toBe(2);
  await expect(page.getByText("Loading…", { exact: true })).toBeVisible();
  release();
  await expect(page.getByText("repeat read failed", { exact: true })).toBeVisible();
  await expect(retry).toBeVisible();
  expect(reads).toBe(2);
});
