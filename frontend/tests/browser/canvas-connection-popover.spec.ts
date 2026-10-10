import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import type { MockApiState } from "../setup/mock-api";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

function setup(state: MockApiState) {
  state.appliedConfiguration = structuredClone(configuration);
  state.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: {
    questions: { x: 40, y: 80 }, "rule-0": { x: 360, y: 80 }, fallback: { x: 360, y: 320 },
    "zone::balanced/default": { x: 900, y: 80 }, "zone::balanced/quality": { x: 900, y: 320 },
    "model::fixture-provider/fixture-model": { x: 1200, y: 80 },
  } };
}

async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function open(page: Page, locale: "en" | "zh-CN" = "en") {
  await page.goto("/dashboard/");
  if (locale === "zh-CN") {
    await page.getByRole("button", { name: en.settings, exact: true }).click();
    await page.locator("[data-settings-language]").selectOption(locale);
  }
  const words = locale === "en" ? en : zhCN;
  await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
  await expect(page.locator('[data-output-node="questions"]').first()).toBeVisible();
  await frames(page);
  return words;
}

async function wirePoint(wire: Locator) {
  return wire.evaluate((element) => {
    const path = element as SVGPathElement, matrix = path.getScreenCTM()!;
    for (const fraction of [.2, .35, .5, .65, .8]) {
      const at = path.getPointAtLength(path.getTotalLength() * fraction).matrixTransform(matrix);
      const x = Math.round(at.x), y = Math.round(at.y);
      if (document.elementFromPoint(x, y) === path) return { x, y };
    }
    throw new Error("No exposed native wire point");
  });
}

async function assertVisibleCard(panel: Locator, width: number, height: number) {
  const geometry = await panel.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const canvas = document.querySelector(".routing-canvas-scroll")!.getBoundingClientRect();
    let top = Math.max(0, canvas.top), bottom = Math.min(innerHeight, canvas.bottom);
    for (const overlay of document.querySelectorAll("[data-canvas-occlusion]")) {
      const box = overlay.getBoundingClientRect();
      if (!box.width || !box.height || box.right <= canvas.left || box.left >= canvas.right) continue;
      if (overlay.getAttribute("data-canvas-occlusion") === "top") top = Math.max(top, box.bottom);
      else bottom = Math.min(bottom, box.top);
    }
    return { bounds: bounds.toJSON(), top, bottom, position: getComputedStyle(element).position,
      inChrome: !!element.closest(".workspace-chrome"), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
  expect(geometry.position).toBe("fixed");
  expect(geometry.inChrome).toBe(false);
  expect(geometry.bounds.width).toBeLessThanOrEqual(252);
  expect(geometry.bounds.left).toBeGreaterThanOrEqual(8);
  expect(geometry.bounds.right).toBeLessThanOrEqual(width - 8);
  expect(geometry.bounds.top).toBeGreaterThanOrEqual(geometry.top + 8);
  expect(geometry.bounds.bottom).toBeLessThanOrEqual(Math.min(height, geometry.bottom) - 8);
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  return geometry;
}

for (const [width, height] of [[1280, 900], [1430, 2511], [390, 740], [320, 740]] as const) {
  for (const locale of ["en", "zh-CN"] as const) {
    test(`compact connection card preserves canvas geometry at ${width}x${height} ${locale}`, async ({ page, mockApi }, info) => {
      setup(mockApi);
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: locale === "en" ? "light" : "dark" });
      const words = await open(page, locale);
      const output = page.locator('[data-output-node="questions"][data-output-kind="context"]').first();
      const panel = page.getByRole("region", { name: words.canvasConnectionActions });
      const before = await output.boundingBox();
      const chromeHeight = await page.locator(".workspace-chrome").evaluate((element) => element.getBoundingClientRect().height);
      await page.getByRole("button", { name: words.canvasAddNode, exact: true }).click();
      const menuStyle = await page.getByRole("menu", { name: words.canvasActions }).evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: style.width, border: style.border, background: style.backgroundColor, padding: style.padding, radius: style.borderRadius, shadow: style.boxShadow };
      });
      await page.keyboard.press("Escape");
      const hit = await output.evaluate((element) => { const box = element.getBoundingClientRect(); return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === element; });
      expect(hit).toBe(true);
      await output.click();
      await expect(panel).toContainText(words.canvasReason_context);
      await expect(panel.getByRole("button", { name: words.canvasDisconnect })).toBeDisabled();
      await frames(page);
      const geometry = await assertVisibleCard(panel, width, height);
      const cardStyle = await panel.evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: style.width, border: style.border, background: style.backgroundColor, padding: style.padding, radius: style.borderRadius, shadow: style.boxShadow };
      });
      expect(cardStyle).toEqual(menuStyle);
      expect(await output.boundingBox()).toEqual(before);
      expect(await page.locator(".workspace-chrome").evaluate((element) => element.getBoundingClientRect().height)).toBe(chromeHeight);
      expect(geometry.bounds.left).toBeLessThanOrEqual(before!.x + before!.width + 8);
      expect(geometry.bounds.right).toBeGreaterThanOrEqual(before!.x);
      await page.screenshot({ path: info.outputPath("compact-connection.png") });
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(output).toBeFocused();
      await output.press("Space");
      await expect(panel).toBeVisible();
      await assertVisibleCard(panel, width, height);
      await panel.getByRole("button", { name: words.cancel, exact: true }).click();
      await expect(output).toBeFocused();
      expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([]);
    });
  }
}

test("wire click anchors at the hit point, follows scroll and closes outside without changing the draft", async ({ page, mockApi }) => {
  setup(mockApi); await page.setViewportSize({ width: 1280, height: 1000 }); await open(page);
  const wire = page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="match"]');
  const point = await wirePoint(wire);
  await page.mouse.click(point.x, point.y);
  const panel = page.getByRole("region", { name: en.canvasConnectionActions });
  const initial = await assertVisibleCard(panel, 1280, 1000);
  expect(initial.bounds.left).toBeCloseTo(point.x + 8, 0);
  expect(initial.bounds.top).toBeCloseTo(point.y + 8, 0);
  const canvas = page.locator(".routing-canvas-scroll");
  const scroll = await canvas.evaluate((element) => element.scrollTop);
  await page.mouse.move(1150, 700); await page.mouse.wheel(0, 50);
  await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBeGreaterThan(scroll);
  await expect.poll(() => panel.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(initial.bounds.top);
  await assertVisibleCard(panel, 1280, 1000);
  await page.mouse.click(1150, 700);
  await expect(panel).toHaveCount(0);
  await expect(wire).toHaveAttribute("data-edge-to", "zone::balanced/default");
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
});

test("connection card retains click-to-connect destinations and disconnect repair", async ({ page, mockApi }) => {
  setup(mockApi); await page.setViewportSize({ width: 1280, height: 1000 }); await open(page);
  const output = page.locator('[data-output-node="rule-0"][data-canvas-output="match"]');
  const wire = page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="match"]');
  const panel = page.getByRole("region", { name: en.canvasConnectionActions });
  await output.click();
  await page.locator('[data-canvas-node="zone::balanced/quality"]').click();
  await expect(panel).toHaveCount(0);
  await expect(wire).toHaveAttribute("data-edge-to", "zone::balanced/quality");
  await output.click();
  await page.locator('[data-canvas-input="zone::balanced/default"]').click();
  await expect(wire).toHaveAttribute("data-edge-to", "zone::balanced/default");
  await output.press("Enter");
  await panel.getByRole("button", { name: en.canvasDisconnect }).click();
  await expect(output).toHaveAttribute("data-output-connected", "false");
  await expect(page.getByRole("button", { name: en.reviewChanges, exact: true })).toBeDisabled();
  await output.press("Space");
  await panel.getByLabel(en.canvasTarget).selectOption("zone::balanced/quality");
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: en.canvasConnect, exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(wire).toHaveAttribute("data-edge-to", "zone::balanced/quality");
  await expect(page.getByRole("button", { name: en.reviewChanges, exact: true })).toBeEnabled();
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
});

test("edge context menu and keyboard edge list open the same card and return focus", async ({ page, mockApi }) => {
  setup(mockApi); await page.setViewportSize({ width: 1280, height: 1000 }); await open(page);
  const output = page.locator('[data-output-node="rule-0"][data-canvas-output="match"]');
  const panel = page.getByRole("region", { name: en.canvasConnectionActions });
  await output.click({ button: "right" });
  const menu = page.getByRole("menu", { name: en.canvasActions });
  const menuBounds = await menu.boundingBox();
  await menu.getByRole("menuitem", { name: en.canvasReconnect }).press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(panel).toBeVisible();
  expect((await panel.boundingBox())!.x).toBeCloseTo(menuBounds!.x + 8, 0);
  await page.keyboard.press("Escape");
  await expect(output).toBeFocused();
  await page.getByRole("button", { name: en.canvasInformation, exact: true }).click();
  const summary = page.locator("summary").filter({ hasText: en.canvasEdgeList });
  await summary.focus(); await page.keyboard.press("Enter"); await page.keyboard.press("Tab");
  const entry = page.getByRole("button", { name: en.canvasSelectConnection, exact: true }).first();
  await expect(entry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel).toContainText(en.canvasReason_context);
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(8);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(992);
  await page.keyboard.press("Escape");
  await expect(entry).toBeFocused();
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
});

test("an open connection card stays within the canvas after viewport reflow and closes on Tab departure", async ({ page, mockApi }) => {
  setup(mockApi); await page.setViewportSize({ width: 1280, height: 1000 }); await open(page);
  const output = page.locator('[data-output-node="questions"][data-output-kind="context"]').first();
  const panel = page.getByRole("region", { name: en.canvasConnectionActions });
  await output.press("Enter");
  await page.setViewportSize({ width: 320, height: 740 });
  await frames(page);
  await expect(panel).toBeVisible();
  await assertVisibleCard(panel, 320, 740);
  await expect(panel.getByLabel(en.canvasTarget)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: en.cancel, exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(panel).toHaveCount(0);
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
});

for (const width of [1280, 320]) {
  for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
    test(`connection port near ${corner} keeps the card visible at ${width}px`, async ({ page, mockApi }) => {
      setup(mockApi);
      mockApi.canvasLayout!.nodes["rule-0"] = { x: corner.includes("right") ? width - 210 : -171, y: corner.includes("bottom") ? 250 : 0 };
      await page.setViewportSize({ width, height: 740 }); await open(page);
      const output = page.locator('[data-output-node="rule-0"][data-canvas-output="match"]');
      const panel = page.getByRole("region", { name: en.canvasConnectionActions });
      const point = await output.evaluate((element) => {
        const box = element.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
        return { x, y, hit: document.elementFromPoint(x, y) === element };
      });
      expect(point.hit).toBe(true);
      expect(corner.includes("right") ? width - point.x : point.x).toBeLessThanOrEqual(20);
      await page.mouse.click(point.x, point.y);
      await assertVisibleCard(panel, width, 740);
      await page.keyboard.press("Escape");
      await expect(output).toBeFocused();
      await expect(output).toHaveAttribute("data-output-connected", "true");
      expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([]);
    });
  }
}

test("read-only port opens a compact restriction card with keyboard and outside dismissal", async ({ page, mockApi }) => {
  setup(mockApi); mockApi.appliedConfiguration!.write_available = false;
  await page.setViewportSize({ width: 320, height: 740 }); await open(page);
  const output = page.locator('[data-output-node="questions"][data-output-kind="context"]').first();
  const panel = page.getByRole("region", { name: en.canvasConnectionActions });
  await output.click();
  await expect(panel).toContainText(en.canvasReadOnly);
  await expect(panel.getByRole("button", { name: en.canvasConnect, exact: true })).toHaveCount(0);
  await assertVisibleCard(panel, 320, 740);
  await page.keyboard.press("Escape");
  await expect(output).toBeFocused();
  await output.press("Enter");
  await expect(panel).toContainText(en.canvasReadOnly);
  await page.getByRole("button", { name: en.canvasPanTool, exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([]);
});
