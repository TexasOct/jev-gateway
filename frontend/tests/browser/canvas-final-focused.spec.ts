import { writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";

const policy = "/v1/routing/configuration", layoutPath = "/v1/dashboard/canvas-layout";
const layout = { version: 1 as const, nodes: { questions: { x: 50, y: 80 }, "rule-0": { x: 420, y: 80 }, fallback: { x: 420, y: 300 } }, viewport: { x: 0, y: 0 } };
async function enter(page: Page, target: Locator) { await expect(target).toBeEnabled(); await target.focus(); await page.keyboard.press("Enter"); }
async function frames(page: Page) { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard/");
  await enter(page, page.getByRole("button", { name: en.strategyEditor, exact: true }));
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
}
async function edit(page: Page, raw: string) {
  await enter(page, page.locator('[data-canvas-node="questions"]'));
  await page.getByRole("complementary", { name: en.nodeInspector }).getByRole("textbox", { name: en.instructions, exact: true }).fill(raw);
  await enter(page, page.getByRole("button", { name: en.closeInspector, exact: true }));
}
async function record(page: Page, info: TestInfo, name: string, data: unknown) {
  await writeFile(info.outputPath(`${name}.json`), JSON.stringify(data, null, 2));
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}

test("C20 genuinely held validation blocks duplicate admission and departure and retains raw draft", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policy}/validate` });
  let release!: () => void, validations = 0;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const payloads: unknown[] = [], dialogs: string[] = [];
  page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.route(`**${policy}/validate`, async route => {
    validations++; payloads.push(route.request().postDataJSON());
    await barrier;
    await route.fulfill({ status: 503, json: { error: { message: "Held validation rejected" } } });
  });
  await open(page);
  const raw = "  Held POST preserves raw instructions\n保留草稿  ";
  await edit(page, raw);
  const review = page.getByRole("button", { name: en.reviewChanges, exact: true });
  await enter(page, review);
  await expect.poll(() => validations).toBe(1);
  try {
    await expect(review).toBeDisabled();
    const settings = page.getByRole("button", { name: en.settings, exact: true });
    await expect(settings).toBeDisabled();
    await review.press("Enter"); await settings.press("Enter");
    await frames(page);
    expect(validations).toBe(1); expect(dialogs).toEqual([]);
    await expect(page.locator("[data-settings-language]")).toHaveCount(0);
    await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "pending");
    expect(mockApi.appliedConfiguration).toBeUndefined();
    expect(mockApi.requests.filter(request => request.method === "PUT" && request.path === policy)).toEqual([]);
    await record(page, info, "c20-held-post", { validations, payloads, dialogs, requests: mockApi.requests });
  } finally { release(); }
  await expect(page.getByRole("alert")).toContainText("Held validation rejected");
  await enter(page, page.locator('[data-canvas-node="questions"]'));
  await expect(page.getByRole("complementary", { name: en.nodeInspector }).getByRole("textbox", { name: en.instructions, exact: true })).toHaveValue(raw);
  expect(payloads).toEqual([{ version: 1, strategy: configuration.strategy, questions: { ...configuration.questions, intent: { ...configuration.questions.intent!, instructions: raw } }, rules: configuration.rules.map(({ when, select }) => ({ when, select })), fallback: configuration.fallback, models: {} }]);
  await record(page, info, "c20-rejected-retained", { raw, validations, payloads, requests: mockApi.requests });
});

test("C21 valid saved policy with held layout-only dirty state blocks then permits clean navigation", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policy}/validate` }, { method: "PUT", path: policy });
  await open(page);
  await edit(page, "C21 valid saved policy snapshot");
  await enter(page, page.getByRole("button", { name: en.reviewChanges, exact: true }));
  await enter(page, page.getByRole("button", { name: en.confirmAndSave, exact: true }));
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  const saved = structuredClone(mockApi.appliedConfiguration), before = structuredClone(mockApi.canvasLayout);
  expect(saved?.questions.intent!.instructions).toBe("C21 valid saved policy snapshot");
  let release!: () => void, puts = 0;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const payloads: unknown[] = [], dialogs: string[] = [];
  page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.route(`**${layoutPath}`, async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    puts++; payloads.push(route.request().postDataJSON()); await barrier; return route.fallback();
  });
  const rule = page.locator('[data-canvas-node="rule-0"]');
  await rule.focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => puts).toBe(1);
  const settings = page.getByRole("button", { name: en.settings, exact: true });
  try {
    await expect(settings).toBeDisabled(); await settings.press("Enter");
    await expect(page.locator("[data-settings-language]")).toHaveCount(0);
    await expect(rule).toHaveCSS("left", "440px");
    await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
    expect(mockApi.appliedConfiguration).toEqual(saved); expect(mockApi.canvasLayout).toEqual(before);
    expect(puts).toBe(1); expect(dialogs).toEqual([]);
    expect(payloads[0]).toEqual({ ...before, nodes: { ...before!.nodes, "rule-0": { x: 440, y: 80 } } });
    await record(page, info, "c21-saved-policy-held-layout", { saved, before, puts, payloads, dialogs, requests: mockApi.requests });
  } finally { release(); }
  await expect(settings).toBeEnabled();
  await expect.poll(() => mockApi.canvasLayout?.nodes["rule-0"]).toEqual({ x: 440, y: 80 });
  const settled = structuredClone(mockApi.canvasLayout), requests = structuredClone(mockApi.requests.filter(request => request.method !== "GET"));
  await settings.click(); await expect(page.locator("[data-settings-language]")).toBeVisible();
  await enter(page, page.getByRole("button", { name: en.strategyEditor, exact: true }));
  await expect(rule).toHaveCSS("left", "440px");
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  expect(dialogs).toEqual([]); expect(mockApi.appliedConfiguration).toEqual(saved); expect(mockApi.canvasLayout).toEqual(settled);
  expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual(requests);
  await record(page, info, "c21-reopened", { saved, settled, puts, payloads, requests });
});

// Decode screenshot pixels without adding an image dependency.
function pixel(png: Buffer, x: number, y: number): number[] {
  let width = 0, height = 0, channels = 0;
  const chunks: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const size = png.readUInt32BE(at), type = png.toString("ascii", at + 4, at + 8), data = png.subarray(at + 8, at + 8 + size);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); expect(data[8]).toBe(8); expect([2, 6]).toContain(data[9]); channels = data[9] === 6 ? 4 : 3; }
    if (type === "IDAT") chunks.push(data);
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels, image = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row++) for (let col = 0; col < stride; col++) {
    const filter = raw[row * (stride + 1)]!, left = col >= channels ? image[row * stride + col - channels]! : 0, up = row ? image[(row - 1) * stride + col]! : 0, corner = row && col >= channels ? image[(row - 1) * stride + col - channels]! : 0;
    const p = left + up - corner, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
    const delta = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : a <= b && a <= c ? left : b <= c ? up : corner;
    image[row * stride + col] = (raw[row * (stride + 1) + col + 1]! + delta) & 255;
  }
  return [...image.subarray((y * width + x) * channels, (y * width + x) * channels + 3)];
}
function contrast(a: number[], b: number[]) {
  const luminance = (rgb: number[]) => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i]!, 0);
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

for (const scheme of ["light", "dark"] as const) test(`C23 shrink-back and rendered badge and wire states ${scheme}`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  await open(page);
  await page.getByRole("button", { name: en.settings, exact: true }).click();
  await page.locator("[data-settings-scheme]").selectOption(scheme);
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const questions = page.locator('[data-canvas-node="questions"]');
  const metrics = async () => questions.evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, rows: [...el.querySelectorAll('span[style*="height: 28px"]')].map(row => row.getBoundingClientRect().height), ports: [...document.querySelectorAll('[data-output-node="questions"]')].map(port => ({ width: port.getBoundingClientRect().width, height: port.getBoundingClientRect().height })) }));
  await expect(questions).toHaveCSS("height", "140px"); const original = await metrics();
  await enter(page, questions);
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  await inspector.getByLabel(en.newCriterion, { exact: true }).fill("extra_长名称");
  await inspector.getByRole("button", { name: en.add, exact: true }).first().click();
  await expect(questions).toHaveCSS("height", "168px");
  const grown = await metrics(); expect(grown.width).toBe(190); expect(grown.rows).toEqual([28, 28, 28, 28]);
  expect(grown.ports).toEqual(Array.from({ length: 4 }, () => ({ width: 18, height: 18 })));
  await inspector.getByLabel(en.criterionKey, { exact: true }).last().locator("..").locator("..").getByRole("button", { name: en.remove, exact: true }).click();
  await expect(questions).toHaveCSS("height", "140px");
  const shrunk = await metrics(); expect(shrunk).toEqual(original);
  await record(page, info, "shrunk-back", { scheme, original, grown, shrunk });
  await enter(page, page.getByRole("button", { name: en.closeInspector, exact: true }));
  const samples: unknown[] = [];
  async function sample(state: string, badge?: Locator) {
    await frames(page);
    if (badge) {
      await expect(badge).toBeVisible();
      const colors = await badge.evaluate(el => {
        const style = getComputedStyle(el), context = document.createElement("canvas").getContext("2d")!;
        const rgb = (color: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
        return { foreground: rgb(style.color), background: rgb(style.backgroundColor), opacity: style.opacity, bounds: el.getBoundingClientRect().toJSON(), fontSize: style.fontSize };
      });
      expect(colors.foreground[3]).toBe(255); expect(colors.background[3]).toBe(255); expect(colors.opacity).toBe("1");
      const ratio = contrast(colors.foreground.slice(0, 3), colors.background.slice(0, 3)); samples.push({ state, badge: colors, ratio });
      expect.soft(ratio, `${state} badge small text`).toBeGreaterThanOrEqual(4.5);
    }
    const wire = page.locator('[data-canvas-edge][data-edge-from="questions"]').first().locator("..").locator("path").first();
    const data = await wire.evaluate(el => {
      const path = el as SVGPathElement, style = getComputedStyle(path), context = document.createElement("canvas").getContext("2d")!;
      context.fillStyle = style.stroke; context.fillRect(0, 0, 1, 1);
      const point = path.getPointAtLength(path.getTotalLength() * .5).matrixTransform(path.getScreenCTM()!);
      const hit = document.elementFromPoint(point.x, point.y);
      return { rgb: [...context.getImageData(0, 0, 1, 1).data].slice(0, 3), stroke: style.stroke, width: style.strokeWidth, point: { x: point.x, y: point.y }, hit: hit?.getAttribute("data-canvas-edge"), bounds: path.getBoundingClientRect().toJSON() };
    });
    expect(data.hit, "wire midpoint must be exposed").toBeTruthy();
    await wire.evaluate(el => (el as SVGElement).style.visibility = "hidden");
    const backdrop = await page.screenshot({ path: info.outputPath(`${state}-wire-backdrop.png`) });
    await wire.evaluate(el => (el as SVGElement).style.visibility = "");
    const background = pixel(backdrop, Math.round(data.point.x), Math.round(data.point.y));
    const ratio = contrast(data.rgb, background); samples.push({ state, wire: data, background, ratio });
    expect.soft(ratio, `${state} wire`).toBeGreaterThanOrEqual(3);
    await record(page, info, state, { scheme, original, grown, samples });
  }
  // Normal and selected cards have no status badge in this product.
  await enter(page, page.locator('[data-canvas-node="fallback"]'));
  await enter(page, page.getByRole("button", { name: en.closeInspector, exact: true }));
  await expect(questions).toHaveAttribute("data-node-state", "normal"); await sample("normal");
  await enter(page, questions); await enter(page, page.getByRole("button", { name: en.closeInspector, exact: true }));
  await expect(questions).toHaveAttribute("data-node-state", "selected"); await sample("selected-node");
  await enter(page, page.locator('[data-canvas-edge][data-edge-from="questions"]').first());
  await sample("selected-wire");
  await page.getByRole("region", { name: en.canvasConnectionActions }).getByRole("button", { name: en.cancel, exact: true }).click();
  await enter(page, page.getByRole("button", { name: en.canvasAddNode, exact: true }));
  await enter(page, page.getByRole("menuitem", { name: en.addRule, exact: true }));
  const added = page.locator('[data-canvas-node="rule-1"]');
  await expect(added).toHaveAttribute("data-node-state", "incomplete");
  await enter(page, page.getByRole("button", { name: en.closeInspector, exact: true }));
  await sample("incomplete", added.locator(`span[title="${en.canvasIncompleteState}"]`));
  await enter(page, questions); await inspector.getByRole("textbox", { name: en.instructions, exact: true }).fill("");
  await enter(page, page.getByRole("button", { name: en.closeInspector, exact: true }));
  await expect(questions).toHaveAttribute("data-node-state", "invalid");
  await sample("invalid", questions.locator(`span[title="${en.canvasInvalidState}"]`));
  expect(mockApi.requests.filter(request => request.method !== "GET" && request.path !== layoutPath)).toEqual([]);
  await writeFile(info.outputPath("all-states.json"), JSON.stringify({ scheme, original, grown, shrunk, finalInvalidMetrics: await metrics(), samples, requests: mockApi.requests }, null, 2));
});
