import { writeFile } from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

const configurationPath = "/v1/routing/configuration";
// Distinct failed-read explanation per catalog; loading must never stand in for a failed read.
const readFailed = { en: "The configuration could not be loaded. Retry the read to open the strategy workspace.", "zh-CN": "无法读取配置。请重试读取以打开策略工作区。" } as const;

async function evidence(page: Page, info: TestInfo, name: string, state: unknown) {
  await writeFile(info.outputPath(`${name}.json`), JSON.stringify(state, null, 2));
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}

for (const [locale, width] of [["en", 1280], ["zh-CN", 320]] as const) test(`failed initial configuration read explains and recovers by retry ${locale} ${width}`, async ({ page }, info) => {
  const words = locale === "en" ? en : zhCN;
  await page.setViewportSize({ width, height: 900 });
  let reads = 0;
  const order: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path === configurationPath) order.push(`${request.method()} ${path}`);
  });
  await page.route(`**${configurationPath}`, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    if (++reads === 1) return route.fulfill({ status: 503, json: { error: { message: "Synthetic configuration read failure" } } });
    return route.fallback();
  });

  await page.goto("/dashboard/");
  if (locale !== "en") {
    await page.getByRole("button", { name: en.settings, exact: true }).click();
    await page.locator("[data-settings-language]").selectOption(locale);
  }
  await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();

  // The failed read explains itself and offers a visible, labelled recovery action.
  const retry = page.getByRole("button", { name: words.routingRetryRead, exact: true });
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(page.getByText(readFailed[locale], { exact: true })).toBeVisible();
  await expect(page.getByText(words.loading, { exact: true })).toHaveCount(0);
  expect(reads).toBe(1);
  await evidence(page, info, "config-read-failed", { reads, order, retryVisible: await retry.isVisible(), loadingVisible: await page.getByText(words.loading, { exact: true }).count() });

  await retry.click();

  // The retry re-admits the read through the existing owner path and renders the workspace.
  const addNode = page.getByRole("button", { name: words.canvasAddNode, exact: true });
  await expect(addNode).toBeEnabled();
  await expect(page.locator(`[data-canvas-node="rule-0"]`)).toBeVisible();
  await expect(retry).toHaveCount(0);
  await expect(page.locator(".workspace-heading")).toContainText(configuration.strategy);
  expect(reads).toBe(2);
  expect(order).toEqual([`GET ${configurationPath}`, `GET ${configurationPath}`]);
  await evidence(page, info, "config-read-recovered", { reads, order, strategy: configuration.strategy });
});
