import { test, expect } from "./fixtures";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import { canvasNodeCenterHit } from "./canvas-hit";

async function openDashboard(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/");
  await expect(page.locator('header button[aria-label="Refresh"]')).toBeVisible();
}

test("top-level view buttons stay compact on desktop and usable on mobile", async ({ page }, testInfo) => {
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 820 });
    await openDashboard(page);
    for (const locale of ["en", "zh-CN"]) {
      await page.getByRole("button", { name: /^(Settings|通用设置)$/ }).click();
      await page.locator('select[aria-label="Language"], select[aria-label="语言"]').selectOption(locale);
      const nav = page.locator("[data-dashboard-view-nav]");
      const buttons = nav.getByRole("button");
      await expect(buttons).toHaveCount(4);
      for (const button of await buttons.all()) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeLessThanOrEqual(161);
        expect(box!.width).toBeGreaterThanOrEqual(50);
      }
      const navBox = await nav.boundingBox();
      expect(navBox).not.toBeNull();
      expect(navBox!.width).toBeLessThanOrEqual(width);
      for (let index = 0; index < 4; index++) {
        await buttons.nth(index).click();
        await expect(buttons.nth(index)).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(".app-shell")).toHaveAttribute(
          "data-view", ["monitoring", "strategy", "providers", "settings"][index]!,
        );
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.locator("header").screenshot({ path: testInfo.outputPath(`header-${width}-${locale}.png`) });
    }
  }
});

for (const width of [320, 390, 1280, 1920, 2560]) {
  test(`strategy fills the page while other view containers remain bounded at ${width}px`, async ({ page, mockApi }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openDashboard(page);
    for (const locale of ["en", "zh-CN"] as const) {
      const words = locale === "en" ? en : zhCN;
      await page.getByRole("button", { name: /^(Settings|通用设置)$/, exact: true }).click();
      await page.locator("[data-settings-language]").selectOption(locale);
      for (const scheme of ["light", "dark"]) {
        await page.getByRole("button", { name: words.settings, exact: true }).click();
        await page.locator("[data-settings-scheme]").selectOption(scheme);
        for (const view of [
          { name: words.monitoring, selector: ".monitoring-view", maxWidth: 1280 },
          { name: words.providerModels, selector: '.app-shell[data-view="providers"] main > section', maxWidth: 768 },
          { name: words.settings, selector: '.app-shell[data-view="settings"] main > section', maxWidth: 768 },
          { name: words.strategyEditor, selector: ".workflow-workspace", maxWidth: width },
        ]) {
          await page.getByRole("button", { name: view.name, exact: true }).click();
          const container = page.locator(view.selector);
          await expect(container).toBeVisible();
          const box = await container.boundingBox();
          if (!box) throw new Error("View container has no measurable bounds");
          expect(box.width).toBeLessThanOrEqual(Math.min(width, view.maxWidth));
          expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(2);
          if (width >= 1920) expect(Math.abs(box.width - view.maxWidth)).toBeLessThanOrEqual(2);
          else expect(box.width).toBeGreaterThanOrEqual(Math.min(width - 48, view.maxWidth));
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          if (view.selector === ".workflow-workspace") {
            const canvas = page.locator(".routing-canvas-scroll");
            const canvasBox = await canvas.boundingBox();
            if (!canvasBox) throw new Error("Routing canvas has no measurable bounds");
            const headerBox = await page.locator(".app-header").boundingBox();
            if (!headerBox) throw new Error("Dashboard header has no measurable bounds");
            expect(Math.abs(canvasBox.x)).toBeLessThanOrEqual(2);
            expect(Math.abs(canvasBox.width - width)).toBeLessThanOrEqual(2);
            expect(Math.abs(canvasBox.y - headerBox.y - headerBox.height)).toBeLessThanOrEqual(2);
            expect(canvasBox.height).toBeGreaterThan(300);
            expect(Math.abs(canvasBox.y + canvasBox.height - 900)).toBeLessThanOrEqual(2);
            const information = page.getByRole("button", { name: words.canvasInformation, exact: true });
            await information.click();
            await expect(page.locator(".workflow-info")).toBeVisible();
            const expandedBox = await canvas.boundingBox();
            expect(expandedBox).toEqual(canvasBox);
            await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
            await information.click();
            await expect(page.locator(".workflow-info")).toBeHidden();
            if (width >= 1920) {
              const node = canvas.locator('[data-canvas-node="questions"]');
              await node.focus();
              const { box: nodeBox, hit } = await canvasNodeCenterHit(node);
              if (!nodeBox) throw new Error("Questions node has no measurable bounds");
              expect(hit).toBe("questions");
              if (locale === "en" && scheme === "light") {
                const beforeLeft = await node.evaluate((element) => element.style.left);
                await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
                await page.mouse.down();
                await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 40, nodeBox.y + nodeBox.height / 2 + 16, { steps: 5 });
                await page.mouse.up();
                await expect.poll(() => node.evaluate((element) => element.style.left)).not.toBe(beforeLeft);
              }
            }
          }
          if (width === 1920 && locale === "en" && scheme === "light") {
            await page.screenshot({ path: testInfo.outputPath(`wide-${view.maxWidth}.png`), fullPage: true });
          }
        }
      }
    }
    expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout")).toEqual([]);
  });
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 1430, height: 2511 }, { width: 390, height: 820 }, { width: 320, height: 820 }]) {
  test(`has no document-level horizontal overflow at ${viewport.width}x${viewport.height} in English and Chinese`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDashboard(page);
    for (const scheme of ["light", "dark"]) {
      await page.getByRole("button", { name: /^(Settings|通用设置)$/ }).click();
      await page.locator('select[aria-label="Color scheme"], select[aria-label="配色方案"]').selectOption(scheme);
      for (const locale of ["en", "zh-CN"]) {
        await page.getByRole("button", { name: /^(Settings|通用设置)$/ }).click();
        await page.locator('select[aria-label="Language"], select[aria-label="语言"]').selectOption(locale);
        for (const viewName of [locale === "en" ? "Monitoring" : "监控", locale === "en" ? "Strategy workflow" : "策略工作流"]) {
          await page.getByRole("button", { name: viewName }).click();
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          if (viewName === (locale === "en" ? "Strategy workflow" : "策略工作流")) {
            const canvas = page.locator(".routing-canvas-scroll");
            await expect(canvas).toBeVisible();
            const box = await canvas.boundingBox();
            if (!box) throw new Error("Routing canvas has no measurable box");
            expect(box.height).toBeGreaterThan(300);
            expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 2);
          }
        }
      }
    }
  });
}
