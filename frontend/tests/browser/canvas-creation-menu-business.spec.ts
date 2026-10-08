import { writeFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

test.use({ hasTouch: true });

const initial = { version: 1 as const, viewport: { x: 0, y: 0 }, nodes: {
  questions: { x: 40, y: 80 }, "rule-0": { x: 350, y: 80 }, fallback: { x: 350, y: 280 },
  "zone::balanced/default": { x: 650, y: 80 }, "zone::balanced/quality": { x: 650, y: 280 },
  "model::fixture-provider/fixture-model": { x: 1000, y: 80 },
} };
async function frames(page: Page) { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
async function exposed(target: Locator, settle = false) {
  return target.evaluate(async (el, settle) => {
    const sample = () => { const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = el.hasAttribute("data-canvas-node") ? b.top + 18 : b.top + b.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, box: b.toJSON(), hit: el.contains(hit), hitNode: hit?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node"), hitHtml: hit?.outerHTML, focused: el === document.activeElement, focusVisible: el.matches(":focus-visible") }; };
    if (!settle) return sample(); let previous = "", stable = 0;
    for (let frame = 0; frame < 120; frame++) { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); const current = sample(), signature = JSON.stringify(current); stable = signature === previous ? stable + 1 : 0; previous = signature; if (stable === 4) return current; }
    throw new Error("Exposed geometry did not settle in 120 frames");
  }, settle);
}
async function evidence(page: Page, info: TestInfo, name: string, data: unknown) {
  await writeFile(info.outputPath(`${name}.json`), JSON.stringify(data, null, 2));
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}
async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled(); await frames(page);
}
async function setup(page: Page, width: number, locale: "en" | "zh-CN", editable = true) {
  await page.setViewportSize({ width, height: 1000 }); await page.goto("/dashboard/");
  if (locale === "zh-CN") { await page.getByRole("button", { name: en.settings, exact: true }).click(); await page.locator("[data-settings-language]").selectOption(locale); }
  const words = locale === "en" ? en : zhCN;
  await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
  const add = page.getByRole("button", { name: words.canvasAddNode, exact: true });
  if (editable) await expect(add).toBeEnabled(); else await expect(add).toBeDisabled(); await frames(page); return words;
}
async function blankGeometry(page: Page, corner = "center") {
  return page.locator(".routing-canvas-scroll").evaluate((element, corner) => {
    const canvas = element as HTMLElement, b = canvas.getBoundingClientRect();
    const left = Math.max(0, b.left), right = Math.min(innerWidth, b.right);
    let top = Math.max(0, b.top), bottom = Math.min(innerHeight, b.bottom);
    for (const overlay of document.querySelectorAll('[data-canvas-occlusion]')) { const r = overlay.getBoundingClientRect(); if (!r.width || !r.height || r.right <= left || r.left >= right) continue;
      if (overlay.getAttribute("data-canvas-occlusion") === "top") top = Math.max(top, r.bottom); else bottom = Math.min(bottom, r.top); }
    const content = canvas.querySelector<HTMLElement>(".routing-canvas-content")!, zoom = new DOMMatrixReadOnly(getComputedStyle(content).transform).a;
    const originY = Number.parseFloat(getComputedStyle(canvas).getPropertyValue("--canvas-origin-y")) || 0;
    const xs = corner.includes("right") ? [right - 12, right - 36, right - 65] : corner.includes("left") ? [left + 12, left + 36, left + 65] : [.55, .75, .2, .35, .9, .05].map(f => left + (right - left) * f);
    const ys = corner.includes("top") ? [top + 12, top + 36, top + 65] : corner.includes("bottom") ? [bottom - 12, bottom - 36, bottom - 65] : [bottom - 80, bottom - 120, ...[.5, .25, .75, .9, .05].map(f => top + (bottom - top) * f)];
    for (const candidateY of ys) for (const candidateX of xs) { const x = Math.round(candidateX), y = Math.round(candidateY), hit = document.elementFromPoint(x, y);
      if (x <= left || x >= right || y <= top || y >= bottom || !hit || !canvas.contains(hit) || hit.closest("button,[data-canvas-node],[data-canvas-input],[data-canvas-output],[data-canvas-edge]")) continue;
      if (corner === "pan" && x < left + 55) continue;
      const expected = { x: Math.round((x - b.left + canvas.scrollLeft) / zoom), y: Math.round((y - b.top + canvas.scrollTop - originY) / zoom) };
      if (expected.x < 0 || expected.y < 0 || expected.x > 9700 || expected.y > 9700) continue;
      return { x, y, hit: hit.className, canvas: b.toJSON(), scroll: { x: canvas.scrollLeft, y: canvas.scrollTop }, origin: { x: 0, y: originY }, zoom, expected, page: { x: scrollX, y: scrollY }, document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } };
    } throw new Error(`No exposed blank point for ${corner}: ${JSON.stringify({ left, right, top, bottom })}`);
  }, corner);
}
async function tabTo(page: Page, target: Locator) {
  for (let count = 0; count < 120 && !await target.evaluate(el => el === document.activeElement); count++) await page.keyboard.press("Tab");
  await expect(target).toBeFocused(); await frames(page); const at = await exposed(target); expect(at.hit).toBe(true); expect(at.focusVisible).toBe(true); return at;
}
async function created(page: Page, kind: "rule" | "question", words: typeof en) {
  const inspector = page.getByRole("complementary", { name: words.nodeInspector }); await expect(inspector).toBeVisible();
  const id = kind === "rule" ? `rule-${configuration.rules.length}` : "questions", node = page.locator(`[data-canvas-node="${id}"]`);
  await expect(node).toHaveClass(/selected/);
  if (kind === "rule") { await expect(page.locator('[data-canvas-node^="rule-"]')).toHaveCount(configuration.rules.length + 1); await expect(node).toHaveAttribute("data-node-state", "incomplete"); await expect(page.getByText(words.canvasIncompleteDraft, { exact: true })).toBeVisible(); await expect(inspector.getByRole("combobox", { name: words.label, exact: true })).toBeEnabled(); }
  else { const names = inspector.getByRole("textbox", { name: words.questionName, exact: true }); await expect(names).toHaveCount(Object.keys(configuration.questions).length + 1); await expect(names.last()).toHaveValue("question_1"); await expect(inspector.getByRole("textbox", { name: words.instructions, exact: true }).last()).toBeEnabled(); }
  return node;
}
test.afterEach(async ({ page, mockApi }, info) => {
  await writeFile(info.outputPath("terminal.json"), JSON.stringify({ title: info.title, status: info.status, requests: mockApi.requests, unexpected: mockApi.unexpected, layout: mockApi.canvasLayout,
    counts: { generation: mockApi.requests.filter(r => /chat\/completions|responses$/.test(r.path)).length, policyMutations: mockApi.requests.filter(r => r.method !== "GET" && r.path === "/v1/routing/configuration").length, layoutWrites: mockApi.requests.filter(r => r.method === "PUT" && r.path === "/v1/dashboard/canvas-layout").length }, layoutWrites: mockApi.canvasWrites,
    ui: await page.evaluate(() => ({ focus: document.activeElement?.outerHTML, preview: document.querySelectorAll(".canvas-edge-preview,.canvas-marquee,[data-dragging]").length, selected: [...document.querySelectorAll("[data-canvas-node].selected")].map(el => el.getAttribute("data-canvas-node")) })) }, null, 2));
});

test("C06 native output right click opens the intended menu without connection capture", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initial); await open(page);
  const output = page.locator('[data-output-node="rule-0"][data-output-kind="match"]');
  const at = await exposed(output); expect(at.hit).toBe(true);
  await page.evaluate(() => { document.documentElement.dataset.captures = "0"; document.addEventListener("gotpointercapture", () => { document.documentElement.dataset.captures = String(Number(document.documentElement.dataset.captures) + 1); }); });
  const before = structuredClone(mockApi.canvasLayout); await evidence(page, info, "before-output-right-click", { at, before });
  await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(page.getByRole("menu", { name: en.canvasActions })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: en.canvasReconnect, exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.dataset.captures)).toBe("0");
  await expect(page.locator(".canvas-edge-preview,.canvas-marquee,[data-dragging]")).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(output).toBeFocused();
  expect((await exposed(output)).hit).toBe(true); expect(mockApi.canvasLayout).toEqual(before);
  await evidence(page, info, "cancelled-output-menu", { at: await exposed(output), requests: mockApi.requests });
});

async function wireHit(target: Locator) {
  return target.evaluate(el => { const path = el as SVGPathElement, matrix = path.getScreenCTM()!; const bounds = el.getBoundingClientRect();
    for (const f of [.2, .35, .5, .65, .8]) { const p = path.getPointAtLength(path.getTotalLength() * f).matrixTransform(matrix), x = Math.round(p.x), y = Math.round(p.y);
      if (document.elementFromPoint(x, y) === path) return { x, y, bounds: bounds.toJSON(), identity: path.getAttribute("data-canvas-edge"), hit: true }; }
    throw new Error("Wire has no exposed native hit point");
  });
}

for (const width of [1440, 320]) for (const locale of ["en", "zh-CN"] as const) test(`C06 protected node output wire menus followed by native drag and reconnect ${width} ${locale}`, async ({ page, mockApi }, info) => {
  const fixture = width === 320 ? { ...structuredClone(initial), nodes: {
    questions: { x: 40, y: 80 }, "rule-0": { x: 40, y: 300 }, fallback: { x: 40, y: 500 },
    "zone::balanced/default": { x: 40, y: 700 }, "zone::balanced/quality": { x: 40, y: 900 },
    "model::fixture-provider/fixture-model": { x: 40, y: 1100 },
  } } : structuredClone(initial);
  mockApi.canvasLayout = fixture; const words = await setup(page, width, locale), menu = page.getByRole("menu", { name: words.canvasActions });
  if (width === 320) { await page.getByRole("button", { name: words.canvasZoomOut, exact: true }).click(); await page.getByRole("button", { name: words.canvasZoomOut, exact: true }).click(); await frames(page); }
  const before = structuredClone(mockApi.canvasLayout), records: unknown[] = [];
  for (const id of ["questions", "fallback", "zone::balanced/default", "model::fixture-provider/fixture-model"]) {
    await frames(page); const node = page.locator(`[data-canvas-node="${id}"]`); if (width === 320) await node.scrollIntoViewIfNeeded(); const at = await exposed(node); expect(at.hit, JSON.stringify({ id, at })).toBe(true);
    await page.mouse.click(at.x, at.y, { button: "right" }); await expect(menu).toContainText(words.canvasProtectedNode);
    await expect(menu.getByRole("menuitem", { name: words.remove, exact: true })).toBeDisabled();
    await page.keyboard.press("Escape"); await expect(node).toBeFocused(); records.push({ id, at, returned: await exposed(node) });
    await expect(page.locator(".canvas-edge-preview,.canvas-marquee,[data-dragging]")).toHaveCount(0);
    const inspector = page.getByRole("complementary", { name: words.nodeInspector });
    if (await inspector.count()) await page.getByRole("button", { name: words.closeInspector, exact: true }).click();
  }
  for (const [from, kind, reason] of [["questions", "context", words.canvasReason_context], ["rule-0", "unmatched", words.canvasReason_fixed], ["zone::balanced/default", "pool", words.canvasReason_lastMember]]) {
    const wire = page.locator(`[data-canvas-edge][data-edge-from="${from}"][data-edge-kind="${kind}"]`).first(); if (width === 320) await wire.scrollIntoViewIfNeeded(); const at = await wireHit(wire);
    await page.mouse.click(at.x, at.y, { button: "right" }); await expect(menu).toContainText(reason!); await expect(menu.getByRole("menuitem", { name: words.canvasDisconnect, exact: true })).toBeDisabled();
    await page.keyboard.press("Escape"); await expect(wire).toBeFocused(); records.push({ from, kind, at, focus: await wire.evaluate(el => el === document.activeElement) });
  }
  if (width === 1440) { expect(mockApi.canvasLayout).toEqual(before); expect(mockApi.requests.filter(r => r.method !== "GET")).toEqual([]); }
  else { expect(mockApi.canvasLayout?.nodes).toEqual(before?.nodes); expect(mockApi.requests.filter(r => r.method !== "GET" && r.path !== "/v1/dashboard/canvas-layout")).toEqual([]); }
  const rule = page.locator('[data-canvas-node="rule-0"]'); if (width === 320) await rule.scrollIntoViewIfNeeded(); const start = await exposed(rule); expect(start.hit).toBe(true);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 24, start.y + 16, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => mockApi.canvasLayout?.nodes["rule-0"]).toEqual({ x: fixture.nodes["rule-0"].x + (width === 320 ? 48 : 24), y: fixture.nodes["rule-0"].y + (width === 320 ? 32 : 16) });
  await frames(page); const output = page.locator('[data-output-node="rule-0"][data-output-kind="match"]'), point = await exposed(output); expect(point.hit).toBe(true);
  await page.mouse.click(point.x, point.y, { button: "right" }); await expect(menu.getByRole("menuitem", { name: words.canvasDisconnect, exact: true })).toBeEnabled();
  await menu.getByRole("menuitem", { name: words.canvasDisconnect, exact: true }).click(); await expect(output).toHaveAttribute("data-output-connected", "false");
  await expect(page.getByRole("button", { name: words.reviewChanges, exact: true })).toBeDisabled();
  await frames(page); const disconnected = await exposed(output); expect(disconnected.hit).toBe(true);
  await page.mouse.click(disconnected.x, disconnected.y, { button: "right" }); const panel = page.getByRole("region", { name: words.canvasConnectionActions }); await expect(panel).toContainText(`${words.rule} 1`); await page.keyboard.press("Escape"); await expect(panel).toHaveCount(0); await expect(output).toBeFocused();
  await frames(page);
  const gesture = await page.evaluate(() => { const source = document.querySelector('[data-output-node="rule-0"][data-output-kind="match"]')!, target = document.querySelector('[data-canvas-input="zone::balanced/quality"]')!;
    const points = [source, target].map(el => { const r = el.getBoundingClientRect(), x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2); return { x, y, bounds: r.toJSON(), hit: el.contains(document.elementFromPoint(x, y)) }; }); return points; });
  expect(gesture.every(p => p.hit)).toBe(true); await page.mouse.move(gesture[0]!.x, gesture[0]!.y); await page.mouse.down(); await page.mouse.move(gesture[1]!.x, gesture[1]!.y, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="match"]')).toHaveAttribute("data-edge-to", "zone::balanced/quality");
  await expect(page.locator(".canvas-edge-preview,.canvas-marquee,[data-dragging]")).toHaveCount(0);
  expect(mockApi.requests.filter(r => r.method !== "GET" && r.path !== "/v1/dashboard/canvas-layout")).toEqual([]);
  await evidence(page, info, "menus-and-subsequent-gestures", { records, start, point, gesture, requests: mockApi.requests, layout: mockApi.canvasLayout });
});

test("C05 native node Escape returns focus to exposed invoking header", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initial); await open(page);
  const node = page.locator('[data-canvas-node="questions"]'), add = page.getByRole("button", { name: en.canvasAddNode, exact: true });
  await add.focus(); const at = await exposed(node); expect(at.hit).toBe(true);
  await page.mouse.click(at.x, at.y, { button: "right" }); await expect(page.getByRole("menu", { name: en.canvasActions })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(node).toBeFocused(); const returned = await exposed(node, true); await evidence(page, info, "node-return-focus", { at: returned, requests: mockApi.requests }); expect(returned.hit, JSON.stringify(returned)).toBe(true);
});

for (const kind of ["rule", "question"] as const) for (const zoom of [1, .75, 1.25]) for (const mode of ["none", "horizontal", "vertical", "combined", "reflow"] as const) {
  test(`C01 C02 C03 canonical ${kind} creation ${zoom} ${mode}`, async ({ page, mockApi }, info) => {
    mockApi.canvasLayout = structuredClone(initial); const reflow = mode === "reflow", width = reflow ? 320 : 1440;
    const words = await setup(page, width, reflow ? "zh-CN" : "en");
    const canvas = page.locator(".routing-canvas-scroll");
    if (reflow) { const toggle = page.getByRole("button", { name: words.canvasInformation, exact: true }); await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded", "true"); }
    if (zoom !== 1) await page.getByRole("button", { name: zoom < 1 ? words.canvasZoomOut : words.canvasZoomIn, exact: true }).click();
    await frames(page); const beforeMovement = await blankGeometry(page);
    if (["horizontal", "combined", "reflow"].includes(mode)) {
      await canvas.focus(); await page.keyboard.press("h"); await frames(page); const at = await blankGeometry(page, "pan");
      await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x - 45, at.y, { steps: 4 }); await page.mouse.up();
      await expect.poll(() => canvas.evaluate(el => el.scrollLeft)).toBeGreaterThan(beforeMovement.scroll.x);
      await canvas.focus(); await page.keyboard.press("v");
    }
    if (["vertical", "combined", "reflow"].includes(mode)) { const at = await blankGeometry(page); await page.mouse.move(at.x, at.y); await page.mouse.wheel(0, 65); await expect.poll(() => canvas.evaluate(el => el.scrollTop)).toBeGreaterThan(beforeMovement.scroll.y); }
    if (reflow) { await page.mouse.move(12, 10); await page.mouse.wheel(0, 100); await frames(page); expect(await page.evaluate(() => scrollY)).toBe(0); }
    await frames(page); const captured = await blankGeometry(page); expect(captured.zoom).toBe(zoom);
    await evidence(page, info, "captured-original-coordinate", { beforeMovement, captured });
    await page.mouse.click(captured.x, captured.y, { button: "right" });
    const menu = page.getByRole("menu", { name: words.canvasActions });
    await expect(menu.getByRole("menuitem")).toHaveText([words.addRule, words.canvasAddQuestion]);
    await menu.getByRole("menuitem", { name: kind === "rule" ? words.addRule : words.canvasAddQuestion, exact: true }).click();
    const node = await created(page, kind, words), id = kind === "rule" ? `rule-${configuration.rules.length}` : "questions";
    await evidence(page, info, "spatial-before-assertion", { captured, canonical: mockApi.canvasLayout?.nodes[id], requests: mockApi.requests });
    await expect.poll(() => mockApi.canvasLayout?.nodes[id]).toEqual(captured.expected);
    await frames(page); const revealed = await exposed(node); expect(revealed.hit).toBe(true);
    expect(mockApi.requests.filter(r => r.method !== "GET" && r.path !== "/v1/dashboard/canvas-layout")).toEqual([]);
    await evidence(page, info, "canonical-and-reveal", { captured, canonical: mockApi.canvasLayout?.nodes[id], revealed, afterViewport: await canvas.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop })), requests: mockApi.requests });
  });
}

for (const width of [1440, 320]) for (const locale of ["en", "zh-CN"] as const) test(`C01 native blank question creates one editable definition ${width} ${locale}`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initial); const words = await setup(page, width, locale), captured = await blankGeometry(page), count = await page.locator("[data-canvas-node]").count();
  await page.mouse.click(captured.x, captured.y, { button: "right" }); await page.getByRole("menuitem", { name: words.canvasAddQuestion, exact: true }).click();
  const node = await created(page, "question", words); await expect(page.locator("[data-canvas-node]")).toHaveCount(count);
  const field = page.getByRole("complementary", { name: words.nodeInspector }).getByRole("textbox", { name: words.instructions, exact: true }).last(); await field.fill("Native created question"); await expect(field).toHaveValue("Native created question");
  await expect(page.getByText(words.canvasQuestionInstructionsError, { exact: false }).first()).toHaveCount(0);
  await evidence(page, info, "question-spatial-oracle", { captured, canonical: mockApi.canvasLayout?.nodes.questions, requests: mockApi.requests });
  expect(mockApi.canvasLayout?.nodes.questions).toEqual(captured.expected);
  expect(mockApi.requests.filter(r => r.method !== "GET" && r.path !== "/v1/dashboard/canvas-layout")).toEqual([]);
  await evidence(page, info, "question-definition-created", { captured, count, revealed: await exposed(node), requests: mockApi.requests });
});

for (const kind of ["rule", "question"] as const) for (const locale of ["en", "zh-CN"] as const) test(`C03 wrapped header movement captured ${kind} ${locale}`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initial); const words = await setup(page, 1440, locale), before = await blankGeometry(page);
  await page.setViewportSize({ width: 320, height: 1000 }); await frames(page); const wrapped = await blankGeometry(page);
  expect(wrapped.canvas.top).toBeGreaterThan(before.canvas.top);
  if (locale === "zh-CN") { await page.setViewportSize({ width: 1440, height: 1000 }); await frames(page); }
  const captured = await blankGeometry(page);
  await page.mouse.click(captured.x, captured.y, { button: "right" }); await page.getByRole("menuitem", { name: kind === "rule" ? words.addRule : words.canvasAddQuestion, exact: true }).click();
  const node = await created(page, kind, words), id = kind === "rule" ? `rule-${configuration.rules.length}` : "questions";
  await expect.poll(() => mockApi.canvasLayout?.nodes[id]).toEqual(captured.expected); await frames(page); expect((await exposed(node)).hit).toBe(true);
  expect(mockApi.requests.filter(r => r.method !== "GET" && r.path !== "/v1/dashboard/canvas-layout")).toEqual([]);
  await evidence(page, info, "wrapped-header-created", { before, wrapped, captured, canonical: mockApi.canvasLayout?.nodes[id], requests: mockApi.requests });
});

test("WF4 question creation restores draft and aggregate layout in one undo and redo", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initial); await open(page); const captured = await blankGeometry(page);
  await page.mouse.click(captured.x, captured.y, { button: "right" }); await page.getByRole("menuitem", { name: en.canvasAddQuestion, exact: true }).click();
  await created(page, "question", en); await expect.poll(() => mockApi.canvasLayout?.nodes.questions).toEqual(captured.expected);
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await page.getByRole("button", { name: en.canvasUndo, exact: true }).click();
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual(initial.nodes);
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await page.getByRole("button", { name: en.canvasRedo, exact: true }).click();
  await created(page, "question", en); await expect.poll(() => mockApi.canvasLayout?.nodes.questions).toEqual(captured.expected);
  expect(mockApi.requests.filter(r => r.method !== "GET" && r.path !== "/v1/dashboard/canvas-layout")).toEqual([]);
  await evidence(page, info, "question-history", { captured, requests: mockApi.requests, writes: mockApi.canvasWrites, layout: mockApi.canvasLayout });
});

for (const persisted of [false, true]) test(`C01 question full-layout admission persisted aggregate ${persisted}`, async ({ page, mockApi }, info) => {
  const nodes: Record<string, { x: number; y: number }> = {};
  for (let index = 0; index < 256 - Number(persisted); index++) nodes[`rule-${index + 100}`] = { x: 2000, y: 2000 };
  if (persisted) nodes.questions = initial.nodes.questions;
  mockApi.canvasLayout = { version: 1, nodes, viewport: { x: 0, y: 0 } }; await open(page); const captured = await blankGeometry(page), before = structuredClone(mockApi.canvasLayout);
  await page.mouse.click(captured.x, captured.y, { button: "right" }); await page.getByRole("menuitem", { name: en.canvasAddQuestion, exact: true }).click();
  if (persisted) { await created(page, "question", en); await expect.poll(() => mockApi.canvasLayout?.nodes.questions).toEqual(captured.expected); expect(Object.keys(mockApi.canvasLayout!.nodes)).toHaveLength(256); }
  else { await expect(page.getByText(en.canvasLayoutFull, { exact: true })).toBeVisible(); expect(mockApi.canvasLayout).toEqual(before); await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged"); expect(mockApi.requests.filter(r => r.method !== "GET")).toEqual([]); }
  expect(mockApi.requests.filter(r => r.method !== "GET" && r.path !== "/v1/dashboard/canvas-layout")).toEqual([]);
  await evidence(page, info, "question-capacity", { persisted, captured, before, layout: mockApi.canvasLayout, requests: mockApi.requests });
});

test("C04 untrusted layout refuses question and rule creation", async ({ page, mockApi }, info) => {
  await page.route("**/v1/dashboard/canvas-layout", route => route.fulfill({ json: { ...initial, read_error: "synthetic-unreadable" } }));
  await setup(page, 320, "en", false); await expect(page.getByText(en.canvasLayoutUnreadable, { exact: false })).toBeVisible();
  const captured = await blankGeometry(page); await page.mouse.click(captured.x, captured.y, { button: "right" });
  for (const name of [en.addRule, en.canvasAddQuestion]) await expect(page.getByRole("menuitem", { name, exact: true })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged"); expect(mockApi.requests.filter(r => r.method !== "GET")).toEqual([]);
  await evidence(page, info, "untrusted-creation", { captured, requests: mockApi.requests });
});

for (const width of [1280, 320]) for (const locale of ["en", "zh-CN"] as const) for (const kind of ["rule", "question"] as const) for (const route of ["keyboard", "touch"] as const) {
  test(`C04 explicit ${route} ${kind} ${width} ${locale}`, async ({ page, mockApi }, info) => {
    mockApi.canvasLayout = structuredClone(initial); const words = await setup(page, width, locale), add = page.getByRole("button", { name: words.canvasAddNode, exact: true });
    let at;
    if (route === "keyboard") { at = await tabTo(page, add); await page.keyboard.press(kind === "rule" ? "Enter" : "Space"); }
    else { at = await exposed(add); expect(at.hit).toBe(true); await page.touchscreen.tap(at.x, at.y); }
    const action = page.getByRole("menuitem", { name: kind === "rule" ? words.addRule : words.canvasAddQuestion, exact: true });
    if (route === "keyboard") { await page.keyboard.press(kind === "rule" ? "Home" : "End"); await expect(action).toBeFocused(); expect((await exposed(action)).focusVisible).toBe(true); await page.keyboard.press("Enter"); }
    else { const point = await exposed(action); expect(point.hit).toBe(true); await page.touchscreen.tap(point.x, point.y); }
    const node = await created(page, kind, words); await frames(page); const revealed = await exposed(node); await evidence(page, info, "before-reveal-assertion", { revealed, requests: mockApi.requests }); expect(revealed.hit).toBe(true);
    expect(mockApi.requests.filter(r => r.method !== "GET" && r.path !== "/v1/dashboard/canvas-layout")).toEqual([]);
    await evidence(page, info, "explicit-created", { route, browserTouchEmulation: route === "touch", at, revealed: await exposed(node), requests: mockApi.requests });
  });
}

for (const width of [1280, 320]) for (const locale of ["en", "zh-CN"] as const) {
  test(`C05 four blank menu corners Escape outside keyboard ${width} ${locale}`, async ({ page, mockApi }, info) => {
    mockApi.canvasLayout = structuredClone(initial); const words = await setup(page, width, locale), canvas = page.locator(".routing-canvas-scroll"), menu = page.getByRole("menu", { name: words.canvasActions });
    const before = structuredClone(mockApi.canvasLayout);
    for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const at = await blankGeometry(page, corner); await page.mouse.click(at.x, at.y, { button: "right" }); await expect(menu).toBeVisible();
      const rect = await menu.evaluate(el => el.getBoundingClientRect().toJSON()); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.top).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width); expect(rect.bottom).toBeLessThanOrEqual(1000);
      for (const key of ["End", "Home", "ArrowDown", "ArrowUp"]) { await page.keyboard.press(key); const active = await page.evaluate(() => { const el = document.activeElement!, r = el.getBoundingClientRect(); return { role: el.getAttribute("role"), hit: el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)), visible: el.matches(":focus-visible") }; }); expect(active).toEqual({ role: "menuitem", hit: true, visible: true }); }
      await evidence(page, info, `${corner}-menu`, { at, rect }); await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0); await expect(canvas).toBeFocused(); expect((await exposed(canvas)).hit).toBe(true);
      await page.mouse.click(at.x, at.y, { button: "right" }); await expect(menu).toBeVisible();
      const outside = await blankGeometry(page, corner.includes("left") ? "bottom-right" : "bottom-left"); await page.mouse.click(outside.x, outside.y); await expect(menu).toHaveCount(0);
      await expect(page.locator(".canvas-edge-preview,.canvas-marquee,[data-dragging]")).toHaveCount(0); expect(mockApi.canvasLayout?.nodes).toEqual(before?.nodes);
      await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
    }
    expect(mockApi.requests.filter(r => r.method !== "GET")).toEqual([]);
    await evidence(page, info, "corners-complete", { before, after: mockApi.canvasLayout, requests: mockApi.requests });
  });
}

for (const width of [1280, 320]) for (const locale of ["en", "zh-CN"] as const) test(`C05 node edge corner bounds keyboard dismissal and return focus ${width} ${locale}`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initial); const words = await setup(page, width, locale);
  const menu = page.getByRole("menu", { name: words.canvasActions }), records: unknown[] = [];
  const seeds: Record<string, Awaited<ReturnType<typeof blankGeometry>>> = {};
  for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"]) seeds[corner] = await blankGeometry(page, corner);
  const offsets = await page.evaluate(() => {
    const rule = document.querySelector('[data-canvas-node="rule-0"]')!.getBoundingClientRect();
    const output = document.querySelector('[data-output-node="rule-0"][data-output-kind="unmatched"]')!.getBoundingClientRect();
    const target = document.querySelector('[data-canvas-node="zone::balanced/default"]')!.getBoundingClientRect();
    const input = document.querySelector('[data-canvas-input="zone::balanced/default"]')!.getBoundingClientRect();
    return { outputY: output.top + output.height / 2 - rule.top, inputY: input.top + input.height / 2 - target.top };
  });
  for (const kind of ["node", "edge"] as const) for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
    const geometry = seeds[corner]!, right = corner.includes("right"), bottom = corner.includes("bottom");
    const x = Math.round((geometry.x - geometry.canvas.left + geometry.scroll.x) / geometry.zoom);
    const y = Math.round((geometry.y - geometry.canvas.top + geometry.scroll.y - geometry.origin.y) / geometry.zoom);
    const fixture = structuredClone(initial);
    for (const [index, id] of Object.keys(fixture.nodes).entries()) fixture.nodes[id as keyof typeof fixture.nodes] = { x: 1500, y: 1500 + index * 200 };
    if (kind === "node") fixture.nodes["rule-0"] = { x: Math.max(0, x - (right ? 178 : 12)), y: Math.max(0, y - 18) };
    else if (right) {
      fixture.nodes["rule-0"] = { x: Math.max(0, x - 230), y: Math.max(0, y - offsets.outputY) };
      fixture.nodes["zone::balanced/default"] = { x: x + 80, y: Math.max(0, y + (bottom ? -200 : 200)) };
    } else {
      fixture.nodes["zone::balanced/default"] = { x: 80, y: Math.max(0, y - offsets.inputY) };
      fixture.nodes["rule-0"] = { x: 0, y: Math.max(0, y + (bottom ? -200 : 200)) };
    }
    fixture.viewport = { x: 0, y: 0 }; mockApi.canvasLayout = fixture; await setup(page, width, locale);
    const target = kind === "node" ? page.locator('[data-canvas-node="rule-0"]') : page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="unmatched"]');
    const at = await target.evaluate((el, corner) => {
      const r = el.getBoundingClientRect(), points: { x: number; y: number }[] = [];
      if (el instanceof SVGPathElement) { const matrix = el.getScreenCTM()!, length = el.getTotalLength(); for (let offset = 1; offset < length; offset++) { const p = el.getPointAtLength(offset).matrixTransform(matrix); points.push({ x: Math.round(p.x), y: Math.round(p.y) }); } }
      else points.push({ x: Math.round(corner.includes("right") ? r.right - 12 : r.left + 12), y: Math.round(r.top + 18) });
      const canvas = document.querySelector(".routing-canvas-scroll")!.getBoundingClientRect();
      const visible = points.filter(p => p.x > 0 && p.x < innerWidth && p.y > canvas.top && p.y < Math.min(innerHeight, canvas.bottom) && el.contains(document.elementFromPoint(p.x, p.y)));
      visible.sort((a, b) => {
        const distance = (p: { x: number; y: number }) => (corner.includes("right") ? innerWidth - p.x : p.x) + (corner.includes("bottom") ? Math.min(innerHeight, canvas.bottom) - p.y : p.y - canvas.top);
        return distance(a) - distance(b);
      });
      if (!visible[0]) throw new Error(`No exposed ${corner} ${el.tagName} point`);
      return { ...visible[0], bounds: r.toJSON(), hit: true, canvas: canvas.toJSON(), window: { width: innerWidth, height: innerHeight } };
    }, corner);
    await evidence(page, info, `${kind}-${corner}-invocation`, { geometry, fixture, at });
    expect(right ? width - at.x : at.x).toBeLessThanOrEqual(120);
    const before = structuredClone(mockApi.canvasLayout), writes = mockApi.requests.filter(r => r.method !== "GET").length;
    await page.mouse.click(at.x, at.y, { button: "right" }); await expect(menu).toBeVisible();
    const bounds = await menu.evaluate(el => el.getBoundingClientRect().toJSON());
    expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.top).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(width); expect(bounds.bottom).toBeLessThanOrEqual(1000);
    for (const key of ["End", "Home", "ArrowDown", "ArrowUp"]) {
      await page.keyboard.press(key); const focused = await page.evaluate(() => { const el = document.activeElement!, r = el.getBoundingClientRect(); return { role: el.getAttribute("role"), hit: el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)), visible: el.matches(":focus-visible") }; });
      expect(focused).toEqual({ role: "menuitem", hit: true, visible: true });
    }
    await evidence(page, info, `${kind}-${corner}-menu`, { geometry, fixture, at, bounds });
    await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0); await expect(target).toBeFocused();
    const returned = await page.evaluate(({ x, y }) => ({ focus: document.activeElement?.outerHTML, hit: document.activeElement?.contains(document.elementFromPoint(x, y)), visible: document.activeElement?.matches(":focus-visible") }), at);
    expect(returned.hit).toBe(true); expect(returned.visible).toBe(true);
    await page.mouse.click(at.x, at.y, { button: "right" }); await expect(menu).toBeVisible();
    const outside = await blankGeometry(page); await page.mouse.click(outside.x, outside.y); await expect(menu).toHaveCount(0);
    await expect(page.locator(".canvas-edge-preview,.canvas-marquee,[data-dragging]")).toHaveCount(0);
    expect(mockApi.canvasLayout).toEqual(before); expect(mockApi.requests.filter(r => r.method !== "GET")).toHaveLength(writes);
    await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
    records.push({ kind, corner, at, bounds, returned, outside, before });
  }
  await evidence(page, info, "node-edge-corners-complete", { records, requests: mockApi.requests });
});

for (const kind of ["rule", "question"] as const) for (const width of [1280, 320]) for (const locale of ["en", "zh-CN"] as const) test(`C03 current origin across drawer reflow ${kind} ${width} ${locale}`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initial); const words = await setup(page, width, locale), canvas = page.locator(".routing-canvas-scroll"), toggle = page.getByRole("button", { name: words.canvasInformation, exact: true });
  const records: unknown[] = [];
  for (const stage of ["collapsed", "expanded", "collapsed-again"]) {
    const expanded = stage === "expanded" ? "true" : "false";
    if (await toggle.getAttribute("aria-expanded") !== expanded) await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded", expanded); await frames(page);
    const captured = await blankGeometry(page); expect(captured.document.height).toBeLessThanOrEqual(1000); expect(captured.page.y).toBe(0);
    await page.mouse.click(captured.x, captured.y, { button: "right" }); await page.getByRole("menuitem", { name: kind === "rule" ? words.addRule : words.canvasAddQuestion, exact: true }).click();
    const node = await created(page, kind, words), id = kind === "rule" ? `rule-${configuration.rules.length}` : "questions";
    await expect.poll(() => mockApi.canvasLayout?.nodes[id]).toEqual(captured.expected);
    await frames(page); const revealed = await exposed(node); expect(revealed.hit).toBe(true); records.push({ stage, captured, canonical: mockApi.canvasLayout?.nodes[id], revealed });
    await evidence(page, info, stage, records.at(-1)); await page.getByRole("button", { name: words.closeInspector, exact: true }).click(); await canvas.focus(); await page.keyboard.press("ControlOrMeta+z");
    if (kind === "rule") await expect(node).toHaveCount(0);
    else { await expect.poll(() => mockApi.canvasLayout?.nodes.questions).toEqual(initial.nodes.questions); await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged"); }
  }
  expect(mockApi.requests.filter(r => r.method !== "GET" && r.path !== "/v1/dashboard/canvas-layout")).toEqual([]); await evidence(page, info, "reflow-complete", { records, requests: mockApi.requests });
});

for (const locale of ["en", "zh-CN"] as const) test(`C04 read-only creation restrictions ${locale}`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initial); mockApi.appliedConfiguration = { ...structuredClone(configuration), write_available: false };
  const words = await setup(page, 320, locale, false); await expect(page.getByText(words.routingEditsDisabled, { exact: true })).toBeVisible();
  const point = await blankGeometry(page); await page.mouse.click(point.x, point.y, { button: "right" }); const menu = page.getByRole("menu", { name: words.canvasActions });
  await expect(menu.getByRole("menuitem", { name: words.addRule, exact: true })).toBeDisabled(); await expect(menu.getByRole("menuitem", { name: words.canvasAddQuestion, exact: true })).toBeDisabled();
  await page.keyboard.press("Escape"); expect(mockApi.canvasLayout).toEqual(initial); expect(mockApi.requests.filter(r => r.method !== "GET")).toEqual([]);
  await evidence(page, info, "readonly-creation-disabled", { point, requests: mockApi.requests });
});
