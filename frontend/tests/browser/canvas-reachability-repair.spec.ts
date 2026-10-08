import { test, expect } from "./fixtures";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import { writeFile } from "node:fs/promises";
import { configuration } from "../fixtures/configuration";

for (const width of [320, 390, 1280]) for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
  test(`controls expose their full hit targets ${width} ${locale} ${scheme}`, async ({ page, mockApi }, info) => {
    const words = locale === "en" ? en : zhCN;
    const dense = structuredClone(configuration);
    for (let i = 0; i < 30; i++) dense.questions.intent!.criteria[`criterion_${i}`] = `可辨识的条件 ${i} / identifiable criterion ${i}`;
    mockApi.appliedConfiguration = dense;
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.settings, exact: true }).click();
    await page.locator("[data-settings-language]").selectOption(locale);
    await page.locator("[data-settings-scheme]").selectOption(scheme);
    await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    const add = page.getByRole("button", { name: words.canvasAddNode, exact: true });
    await expect(add).toBeEnabled();
    await page.locator('[data-canvas-node="questions"]').focus();
    await page.keyboard.press("Enter");
    const inspector = page.getByRole("complementary", { name: words.nodeInspector });
    await inspector.getByRole("textbox", { name: words.instructions, exact: true }).fill("Changed synthetic instructions");
    await inspector.getByRole("textbox", { name: words.newCriterion, exact: true }).last().focus();
    await page.keyboard.press("Escape");
    await expect(inspector).toHaveCount(0);
    await expect(page.getByRole("button", { name: words.settings, exact: true })).toBeEnabled();
    const viewportBefore = await page.locator(".routing-canvas-scroll").evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop, pageX: scrollX, pageY: scrollY }));
    const writesBefore = mockApi.requests.filter(request => request.method !== "GET");
    const measurements = [];
    for (const [target, container] of [[add, ".canvas-tools"], [page.getByRole("button", { name: words.settings, exact: true }), "[data-dashboard-view-nav]"]] as const) {
      await expect(target).toBeEnabled();
      const reverse = await target.evaluate(el => !!(el.compareDocumentPosition(document.activeElement!) & Node.DOCUMENT_POSITION_FOLLOWING));
      for (let count = 0; count < 180 && !(await target.evaluate(el => el === document.activeElement)); count++) {
        await expect(target).toBeEnabled();
        await page.keyboard.press(reverse ? "Shift+Tab" : "Tab");
      }
      await expect(target).toBeFocused();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const geometry = await target.evaluate((el, selector) => {
        const rect = el.getBoundingClientRect();
        const panel = document.querySelector(selector)!;
        const bounds = panel.getBoundingClientRect();
        const points = [[rect.left + 2, rect.top + rect.height / 2], [rect.right - 2, rect.top + rect.height / 2], [rect.left + rect.width / 2, rect.top + 2], [rect.left + rect.width / 2, rect.bottom - 2]].map(([x, y]) => ({ x, y, hit: el.contains(document.elementFromPoint(x!, y!)) }));
        return { label: el.getAttribute("aria-label") ?? el.textContent, rect: rect.toJSON(), bounds: bounds.toJSON(), scrollLeft: panel.scrollLeft, points, pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
      }, container);
      measurements.push(geometry);
      await writeFile(info.outputPath(`${container === ".canvas-tools" ? "add" : "settings"}-geometry.json`), JSON.stringify(geometry, null, 2));
      await info.attach(`geometry-${container}`, { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
      await page.screenshot({ path: info.outputPath(`${container === ".canvas-tools" ? "add" : "settings"}-focused.png`) });
      expect.soft(geometry.rect.left).toBeGreaterThanOrEqual(geometry.bounds.left);
      expect.soft(geometry.rect.right).toBeLessThanOrEqual(geometry.bounds.right);
      expect.soft(geometry.rect.top).toBeGreaterThanOrEqual(geometry.bounds.top);
      expect.soft(geometry.rect.bottom).toBeLessThanOrEqual(geometry.bounds.bottom);
      expect.soft(geometry.points.every(point => point.hit)).toBe(true);
      expect.soft(geometry.pageWidth).toBeLessThanOrEqual(width);
      expect(await target.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle === "solid" && parseFloat(getComputedStyle(el).outlineWidth) >= 2)).toBe(true);
      if (container === ".canvas-tools") {
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menu", { name: words.canvasActions })).toBeVisible();
        await page.keyboard.press("End");
        await page.keyboard.press("Escape");
        await expect(target).toBeFocused();
      } else {
        const selected = await page.locator('[data-canvas-node].selected').getAttribute("data-canvas-node");
        const cancelled = page.waitForEvent("dialog").then(async dialog => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
        await page.keyboard.press("Enter"); await cancelled;
        await expect(target).toBeFocused();
        await expect(page.locator('[data-canvas-node].selected')).toHaveAttribute("data-canvas-node", selected!);
        await expect(page.locator(".routing-canvas-scroll")).toBeVisible();
      }
    }
    const viewportAfter = await page.locator(".routing-canvas-scroll").evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop, pageX: scrollX, pageY: scrollY }));
    expect(viewportAfter).toEqual(viewportBefore);
    expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual(writesBefore);
    expect(writesBefore.every(request => request.path === "/v1/dashboard/canvas-layout")).toBe(true);
    await info.attach("measurements", { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
  });
}

test.describe("touch explicit addition", () => {
  test.use({ hasTouch: true });
  for (const width of [320, 390]) for (const locale of ["en", "zh-CN"] as const) test(`touch add is exposed ${width} ${locale}`, async ({ page, mockApi }, info) => {
    const words = locale === "en" ? en : zhCN;
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.settings, exact: true }).click();
    await page.locator("[data-settings-language]").selectOption(locale);
    await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    const add = page.getByRole("button", { name: words.canvasAddNode, exact: true });
    await expect(add).toBeEnabled();
    const hit = await add.evaluate(el => {
      const rect = el.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      return { x, y, exposed: el.contains(document.elementFromPoint(x, y)), rect: rect.toJSON() };
    });
    expect(hit.exposed).toBe(true);
    expect(hit.rect.height).toBeGreaterThanOrEqual(40);
    await page.touchscreen.tap(hit.x, hit.y);
    const menu = page.getByRole("menu", { name: words.canvasActions });
    await expect(menu).toBeVisible();
    const item = menu.getByRole("menuitem", { name: words.addRule, exact: true });
    const itemHit = await item.evaluate(el => {
      const rect = el.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      return { x, y, exposed: el.contains(document.elementFromPoint(x, y)) };
    });
    expect(itemHit.exposed).toBe(true);
    await page.touchscreen.tap(itemHit.x, itemHit.y);
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-canvas-node="rule-1"]')).toHaveAttribute("data-node-state", "incomplete");
    await expect.poll(() => mockApi.canvasLayout?.nodes["rule-1"]).toBeDefined();
    expect(mockApi.requests.filter(request => request.method !== "GET" && request.path !== "/v1/dashboard/canvas-layout")).toEqual([]);
    await writeFile(info.outputPath("touch-hit-targets.json"), JSON.stringify({ hit, itemHit, writes: mockApi.canvasWrites }, null, 2));
    await page.screenshot({ path: info.outputPath("touch-created-rule.png") });
  });
});
