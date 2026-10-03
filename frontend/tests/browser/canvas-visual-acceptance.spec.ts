import { test, expect } from "./fixtures";
import { writeFile } from "node:fs/promises";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

for (const viewport of [
  { width: 320, height: 900 },
  { width: 390, height: 900 },
  { width: 1280, height: 900 },
  { width: 1430, height: 2511 },
]) {
  test(`dense strategy nodes remain readable and reachable at ${viewport.width}x${viewport.height}`, async ({ page, mockApi }, testInfo) => {
    const catalog = structuredClone(configuration);
    catalog.questions.intent!.criteria = {
      default: "默认请求",
      code: "代码与工程实现",
      document: "文档整理与中文文案",
      review: "审阅与质量检查",
      reasoning: "多步骤推理",
      other: "其他请求",
    };
    catalog.models = Array.from({ length: 12 }, (_, index) => ({
      ...catalog.models[0]!,
      id: `fixture-provider/模型名称较长的可选输出-${index + 1}`,
      upstream_model: `模型名称较长的可选输出-${index + 1}`,
      tags: ["balanced/default", ...(index === 0 ? ["balanced/quality"] : [])],
      baseline_tags: ["balanced/default", ...(index === 0 ? ["balanced/quality"] : [])],
    }));
    catalog.labels[0]!.models = catalog.models.map(({ id }) => id);
    catalog.labels[1]!.models = [catalog.models[0]!.id];
    mockApi.appliedConfiguration = catalog;

    await page.setViewportSize(viewport);
    await page.goto("/dashboard/");
    await expect(page.locator('header button[aria-label="Refresh"]')).toBeVisible();
    for (const locale of ["en", "zh-CN"] as const) {
      const words = locale === "en" ? en : zhCN;
      await page.getByRole("button", { name: /^(Settings|通用设置)$/, exact: true }).click();
      await page.locator("[data-settings-language]").selectOption(locale);
      for (const scheme of ["light", "dark"]) {
        await page.getByRole("button", { name: words.settings, exact: true }).click();
        await page.locator("[data-settings-scheme]").selectOption(scheme);
        await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
        const canvas = page.locator(".routing-canvas-scroll");
        const toolbar = page.getByRole("toolbar", { name: words.canvasTools });
        await expect(toolbar).toBeVisible();
        await toolbar.getByRole("button", { name: words.canvasZoomFit, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-scheme", scheme);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const canvasBox = await canvas.boundingBox();
        const headerBox = await page.locator(".app-header").boundingBox();
        expect(canvasBox).not.toBeNull();
        expect(canvasBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
        expect(canvasBox!.y + canvasBox!.height).toBeLessThanOrEqual(viewport.height + 1);

        const questions = canvas.locator('[data-canvas-node="questions"]');
        await expect(questions).toBeVisible();
        const hit = await questions.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return document.elementFromPoint(box.x + box.width / 2, box.y + 20)?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node");
        });
        expect(hit).toBe("questions");
        await page.keyboard.press("Tab");
        await questions.focus();
        await expect(questions).toBeFocused();
        expect(await questions.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
        await expect(questions).toHaveCSS("outline-style", "solid");

        const geometry = await canvas.locator("[data-canvas-node]").evaluateAll((elements) => elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            id: element.getAttribute("data-canvas-node"),
            left: Number.parseFloat(style.left), top: Number.parseFloat(style.top),
            width: Number.parseFloat(style.width), height: Number.parseFloat(style.height),
            fontSize: style.fontSize,
          };
        }));
        expect(geometry.find(({ id }) => id === "questions")!.height).toBeGreaterThan(56);
        expect(geometry.find(({ id }) => id === "zone::balanced/default")!.height).toBeGreaterThan(300);
        for (const node of geometry) {
          expect(node.width).toBe(190);
          expect(node.height).toBeGreaterThanOrEqual(56);
        }
        const columns: Record<string, typeof geometry> = {};
        for (const node of geometry) (columns[String(node.left)] ??= []).push(node);
        for (const nodes of Object.values(columns)) {
          const ordered = [...nodes].sort((a, b) => a.top - b.top);
          for (let index = 1; index < ordered.length; index++) {
            expect(ordered[index]!.top).toBeGreaterThanOrEqual(ordered[index - 1]!.top + ordered[index - 1]!.height + 12);
          }
        }
        await writeFile(testInfo.outputPath(`geometry-${locale}-${scheme}.json`), JSON.stringify({
          viewport, locale, scheme, canvas: canvasBox, header: headerBox, nodes: geometry,
          documentWidth: await page.evaluate(() => document.documentElement.scrollWidth),
        }, null, 2));
        await page.screenshot({ path: testInfo.outputPath(`strategy-${viewport.width}-${locale}-${scheme}.png`), fullPage: true });
        await testInfo.attach(`geometry-${locale}-${scheme}`, { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
      }
    }
    expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout")).toEqual([]);
  });
}
