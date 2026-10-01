import type { Locator } from "@playwright/test";
import { test, expect } from "./fixtures";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import { configuration } from "../fixtures/configuration";

async function expectDecorativeIcon(control: Locator, name: string) {
  await expect(control).toHaveAccessibleName(name);
  const svg = control.locator("svg.lucide");
  await expect(svg).toHaveCount(1);
  await expect(svg).toHaveAttribute("aria-hidden", "true");
  await expect(svg).toHaveAttribute("focusable", "false");
  await expect(svg).toHaveAttribute("stroke", "currentColor");
  await expect(svg).toHaveCSS("width", "16px");
  await expect(svg).toHaveCSS("height", "16px");
  await expect(svg).toHaveCSS("pointer-events", "none");
  await expect(svg.locator("title")).toHaveCount(0);
  await expect(svg).not.toHaveAttribute("aria-label");
  await expect(svg).not.toHaveAttribute("tabindex");
  // Text controls inherit platform fonts; assert hit areas and vertical icon alignment.
  const bounds = await control.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const icon = element.querySelector("svg")!.getBoundingClientRect();
    return {
      width: button.width,
      height: button.height,
      viewportWidth: innerWidth,
      insets: [icon.top - button.top, button.bottom - icon.bottom],
    };
  });
  expect(bounds.width).toBeGreaterThanOrEqual(24);
  expect(bounds.height).toBeGreaterThanOrEqual(36);
  expect(bounds.width).toBeLessThanOrEqual(bounds.viewportWidth);
  for (const inset of bounds.insets) expect(inset).toBeGreaterThanOrEqual(-0.5);
}

const scenarios = [
  ...[1280, 390, 320].flatMap((width) => (["en", "zh-CN"] as const).map((locale) => ({ width, locale, font: "system" }))),
  { width: 1280, locale: "en" as const, font: "serif" },
];

for (const { width, locale, font } of scenarios) {
    test(`icon controls preserve names, geometry and interactions in ${locale} at ${width}px with ${font} font`, async ({ page, mockApi }) => {
      const words = locale === "en" ? en : zhCN;
      mockApi.appliedConfiguration = {
        ...configuration,
        rules: [...configuration.rules, { index: 1, when: { intent: "default" }, select: { label: "quality" } }],
      };
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dashboard/");
      if (font !== "system") await page.addStyleTag({ content: `body { font-family: ${font}; }` });
      await page.getByRole("button", { name: en.settings, exact: true }).click();
      await page.getByLabel(en.language, { exact: true }).selectOption(locale);
      const refresh = page.locator("header").getByRole("button", { name: words.refresh, exact: true });
      await expectDecorativeIcon(refresh, words.refresh);
      await expect(refresh).toHaveCSS("height", "36px");
      const reads = () => mockApi.requests.filter(({ path }) => path === "/v1/routing/strategies").length;
      const beforeRefresh = reads();
      await refresh.focus();
      await refresh.press("Enter");
      await expect.poll(reads).toBeGreaterThan(beforeRefresh);
      await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();

      const toolbar = page.getByRole("toolbar", { name: words.canvasTools });
      const tool = (name: string) => toolbar.getByRole("button", { name, exact: true });
      for (const name of [words.canvasSelectTool, words.canvasPanTool, words.addRule, words.canvasZoomOut, words.canvasZoomIn,
        words.canvasPanLeft, words.canvasPanRight, words.canvasPanUp, words.canvasPanDown]) {
        const button = tool(name);
        await expectDecorativeIcon(button, name);
        await expect(button).toHaveCSS("width", "40px");
        await expect(button).toHaveCSS("height", "40px");
      }
      await expect(tool(words.canvasZoomReset)).toHaveText("1:1");
      await expect(tool(words.canvasZoomFit)).toHaveText(words.canvasZoomFit);
      await expect(tool(words.canvasSelectTool)).toHaveAttribute("aria-pressed", "true");
      await tool(words.canvasSelectTool).focus();
      await page.keyboard.press("ArrowRight");
      await expect(tool(words.canvasPanTool)).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(tool(words.canvasPanTool)).toHaveAttribute("aria-pressed", "true");
      await expect(tool(words.canvasSelectTool)).toHaveAttribute("aria-pressed", "false");
      await tool(words.canvasSelectTool).click();
      await expect(tool(words.canvasSelectTool)).toHaveAttribute("aria-pressed", "true");

      await tool(words.canvasZoomIn).click();
      await expect(toolbar.locator("output")).toHaveText("125%");
      await tool(words.canvasZoomOut).click();
      await expect(toolbar.locator("output")).toHaveText("100%");
      const canvas = page.locator(".routing-canvas-scroll");
      for (const [forward, backward, axis] of [
        [words.canvasPanRight, words.canvasPanLeft, "scrollLeft"],
        [words.canvasPanDown, words.canvasPanUp, "scrollTop"],
      ] as const) {
        const before = await canvas.evaluate((element, key) => element[key], axis);
        await tool(forward).click();
        await expect.poll(() => canvas.evaluate((element, key) => element[key], axis)).toBeGreaterThan(before);
        const after = await canvas.evaluate((element, key) => element[key], axis);
        await tool(backward).click();
        await expect.poll(() => canvas.evaluate((element, key) => element[key], axis)).toBeLessThan(after);
      }

      const nodes = canvas.locator("[data-canvas-node]");
      for (const kind of ["questions", "rule", "fallback", "label", "model"]) {
        const node = nodes.filter({ has: page.locator(`[data-node-kind="${kind}"]`) }).first();
        const svg = node.locator("svg.lucide");
        await expect(node).toHaveCSS("width", "190px");
        await expect(node).toHaveCSS("height", "56px");
        await expect(svg).toHaveCSS("width", "14px");
        await expect(svg).toHaveCSS("height", "14px");
        await expect(svg).toHaveAttribute("stroke-width", "1.8");
        await expect(svg).toHaveAttribute("stroke", "currentColor");
        await expect(svg).toHaveAttribute("aria-hidden", "true");
        await expect(svg).toHaveAttribute("focusable", "false");
      }
      // Start on the emitted SVG to exercise bubbling through the node's drag target.
      const node = canvas.locator('[data-canvas-node="questions"]');
      await node.focus();
      await tool(words.canvasZoomFit).click();
      // Fit restores the viewport over nested animation frames before pointer input.
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      }));
      const iconBox = await node.locator("svg").boundingBox();
      if (!iconBox) throw new Error("Questions icon has no box");
      const point = { x: iconBox.x + iconBox.width / 2, y: iconBox.y + iconBox.height / 2 };
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node"), point)).toBe("questions");
      const beforeDrag = await node.evaluate((element) => element.style.left);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 35, point.y + 12, { steps: 5 });
      await page.mouse.up();
      await expect.poll(() => node.evaluate((element) => element.style.left)).not.toBe(beforeDrag);

      const disclosure = page.getByRole("button", { name: words.canvasInformation, exact: true });
      await expectDecorativeIcon(disclosure, words.canvasInformation);
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");
      await expect(disclosure.locator("svg")).toHaveClass(/lucide-chevron-up/);
      await disclosure.focus();
      await disclosure.press("Enter");
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      await expect(disclosure.locator("svg")).toHaveClass(/lucide-chevron-down/);
      await expect(page.locator("#routing-information")).toBeVisible();
      await disclosure.click();
      await expect(page.locator("#routing-information")).toBeHidden();
      await tool(words.addRule).click();
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(".rule-add select").first()).toBeFocused();

      await page.getByRole("button", { name: words.editQuestions, exact: true }).first().click();
      const close = page.getByRole("button", { name: words.closeInspector, exact: true });
      await expectDecorativeIcon(close, words.closeInspector);
      await expect(close).toHaveCSS("height", "36px");
      await close.focus();
      await close.press("Enter");
      await expect(page.locator(".workflow-inspector")).toHaveCount(0);

      // Native rule-row controls keep sortable attributes and localized reorder actions.
      if (await disclosure.getAttribute("aria-expanded") === "false") await disclosure.click();
      await page.getByText(words.advancedEditors, { exact: true }).click();
      const earlierName = (index: number) => words.moveRuleEarlier.replace("{index}", String(index));
      const laterName = (index: number) => words.moveRuleLater.replace("{index}", String(index));
      const gripName = words.reorderRule.replace("{index}", "1").replace("{total}", "2");
      const grip = page.getByRole("button", { name: gripName, exact: true });
      await expectDecorativeIcon(grip, gripName);
      await expect(grip).toHaveCSS("height", "36px");
      await expect(grip).toHaveAttribute("aria-roledescription", "sortable");
      const first = page.getByRole("button", { name: earlierName(1), exact: true });
      const down = page.getByRole("button", { name: laterName(1), exact: true });
      const up = page.getByRole("button", { name: earlierName(2), exact: true });
      const last = page.getByRole("button", { name: laterName(2), exact: true });
      await expectDecorativeIcon(first, earlierName(1));
      await expectDecorativeIcon(down, laterName(1));
      await expect(first).toBeDisabled();
      await expect(last).toBeDisabled();
      const conditions = page.locator(".rule-condition");
      await expect(conditions.first()).toContainText("→ default");
      await down.click();
      await expect(conditions.first()).toContainText("→ quality");
      await up.focus();
      await up.press("Enter");
      await expect(conditions.first()).toContainText("→ default");
      await grip.focus();
      await grip.press("Space");
      await expect(grip).toHaveAttribute("aria-pressed", "true");
      // KeyboardSensor attaches its document keydown listener in a deferred task.
      await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
      await grip.press("Space");
      await expect(grip).not.toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout")).toEqual([]);
    });
}
