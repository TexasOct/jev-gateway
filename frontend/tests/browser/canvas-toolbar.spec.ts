import { test, expect } from "./fixtures";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import { configuration } from "../fixtures/configuration";

for (const { width, height } of [{ width: 1280, height: 900 }, { width: 1430, height: 2511 }, { width: 390, height: 900 }, { width: 320, height: 900 }]) {
  for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
    test(`canvas toolbar stays one row and exposes layout actions by keyboard at ${width}px ${locale} ${scheme}`, async ({ page, mockApi }, testInfo) => {
      const words = locale === "en" ? en : zhCN;
      await page.setViewportSize({ width, height });
      await page.goto("/dashboard/");
      await page.getByRole("button", { name: en.settings, exact: true }).click();
      await page.locator("[data-settings-language]").selectOption(locale);
      await page.locator("[data-settings-scheme]").selectOption(scheme);
      await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
      const toolbar = page.getByRole("toolbar", { name: words.canvasTools });
      const tool = (name: string) => toolbar.getByRole("button", { name, exact: true });
      const layout = tool(words.canvasLayoutTools);
      await expect(layout).toBeEnabled();
      await expect(tool(words.canvasUndo)).toBeDisabled();
      await expect(tool(words.canvasRedo)).toBeDisabled();
      await expect(toolbar.getByRole("button")).toHaveCount(10);
      for (const name of [words.canvasArrangeAll, words.canvasAlignLeft, words.canvasAlignTop, words.canvasPanLeft, words.canvasPanRight, words.canvasPanUp, words.canvasPanDown]) {
        await expect(toolbar.getByRole("button", { name, exact: true })).toHaveCount(0);
      }
      const geometry = await toolbar.evaluate((element) => {
        const buttons = [...element.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
        return { rows: Math.max(...buttons.map((box) => box.top)) - Math.min(...buttons.map((box) => box.top)), height: element.getBoundingClientRect().height };
      });
      expect(geometry.rows).toBeLessThanOrEqual(1);
      expect(geometry.height).toBeLessThanOrEqual(60);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("toolbar.png"), fullPage: true });

      await tool(words.canvasSelectTool).focus();
      await page.keyboard.press("End");
      await expect(layout).toBeFocused();
      await expect.poll(() => layout.evaluate((element) => {
        const box = element.getBoundingClientRect(), parent = element.closest('[role="toolbar"]')!.getBoundingClientRect();
        return box.left >= parent.left && box.right <= parent.right && document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
      })).toBe(true);
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu", { name: words.canvasLayoutTools });
      const arrange = menu.getByRole("menuitem", { name: words.canvasArrangeAll, exact: true });
      await expect(arrange).toBeFocused();
      await expect(layout).toHaveAttribute("aria-expanded", "true");
      await expect(menu.getByRole("menuitem", { name: words.canvasAlignLeft, exact: true })).toBeDisabled();
      await expect(menu.getByRole("menuitem", { name: words.canvasAlignTop, exact: true })).toBeDisabled();
      await page.keyboard.press("ArrowDown");
      await expect(arrange).toBeFocused();
      const menuBox = await menu.boundingBox(), toolbarBox = await toolbar.boundingBox();
      expect(menuBox!.x).toBeGreaterThanOrEqual(8);
      expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(width - 8);
      expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(toolbarBox!.y);
      await page.screenshot({ path: testInfo.outputPath("layout-menu.png"), fullPage: true });
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(layout).toBeFocused();
      await layout.click();
      await expect(menu).toBeVisible();
      await layout.click();
      await expect(menu).toHaveCount(0);
      await layout.click();
      await page.keyboard.press("Shift+Tab");
      await expect(menu).toHaveCount(0);
      await expect(tool(words.canvasZoomFit)).toBeFocused();
      await layout.focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      await expect(menu).toHaveCount(0);
      await expect(layout).not.toBeFocused();
      await tool(words.canvasSelectTool).focus();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await expect(menu).toHaveCount(0);
      await expect(layout).toBeFocused();
      await expect.poll(() => Object.keys(mockApi.canvasLayout?.nodes ?? {}).length).toBeGreaterThan(0);
      await expect(tool(words.canvasUndo)).toBeEnabled();
      await page.keyboard.press("Home");
      await expect(tool(words.canvasSelectTool)).toBeFocused();
      const canvas = page.locator(".routing-canvas-scroll");
      await canvas.focus(); await page.keyboard.press("h");
      await expect(tool(words.canvasPanTool)).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("v");
      await expect(tool(words.canvasSelectTool)).toHaveAttribute("aria-pressed", "true");
    });
  }
}

test("layout menu aligns a selected group, saves only layout and supports undo/redo", async ({ page, mockApi }) => {
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: { "rule-0": { x: 350, y: 80 }, fallback: { x: 550, y: 300 } } };
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const rule = page.locator('[data-canvas-node="rule-0"]'), fallback = page.locator('[data-canvas-node="fallback"]');
  await rule.focus(); await rule.press("Shift+Space");
  await fallback.focus(); await fallback.press("Shift+Space");
  const layout = page.getByRole("button", { name: en.canvasLayoutTools, exact: true });
  await layout.click();
  const menu = page.getByRole("menu", { name: en.canvasLayoutTools });
  await expect(menu.getByRole("menuitem", { name: en.canvasAlignLeft, exact: true })).toBeEnabled();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect.poll(() => mockApi.canvasLayout?.nodes.fallback?.x).toBe(350);
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: en.canvasUndo, exact: true }).click();
  await expect.poll(() => mockApi.canvasLayout?.nodes.fallback?.x).toBe(550);
  await page.getByRole("button", { name: en.canvasRedo, exact: true }).click();
  await expect.poll(() => mockApi.canvasLayout?.nodes.fallback?.x).toBe(350);
  await layout.click();
  await page.keyboard.press("End"); await page.keyboard.press("Enter");
  await expect.poll(() => mockApi.canvasLayout?.nodes.fallback?.y).toBe(80);
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout")).toEqual([]);
  await expect(page.locator('.workspace-status[data-policy-draft="unchanged"]')).toBeVisible();
});

for (const locale of ["en", "zh-CN"] as const) {
  test(`read-only toolbar blocks changes and keeps navigation available in ${locale}`, async ({ page, mockApi }) => {
    const words = locale === "en" ? en : zhCN;
    mockApi.appliedConfiguration = { ...configuration, write_available: false, write_disabled_reason: "config_writes_disabled" };
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.settings, exact: true }).click();
    await page.locator("[data-settings-language]").selectOption(locale);
    await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    const toolbar = page.getByRole("toolbar", { name: words.canvasTools });
    const tool = (name: string) => toolbar.getByRole("button", { name, exact: true });
    for (const name of [words.canvasAddNode, words.canvasUndo, words.canvasRedo, words.canvasLayoutTools]) await expect(tool(name)).toBeDisabled();
    for (const name of [words.canvasSelectTool, words.canvasPanTool, words.canvasZoomIn, words.canvasZoomOut, words.canvasZoomFit]) await expect(tool(name)).toBeEnabled();
    await tool(words.canvasSelectTool).focus();
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    await expect(tool(words.canvasZoomOut)).toBeFocused();
    await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
    await expect(tool(words.canvasZoomOut)).toBeDisabled();
    await tool(words.canvasZoomReset).click();
    await tool(words.canvasZoomIn).click(); await tool(words.canvasZoomIn).click(); await tool(words.canvasZoomIn).click();
    await expect(tool(words.canvasZoomIn)).toBeDisabled();
    await tool(words.canvasZoomFit).click();
    expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([]);
  });
}
