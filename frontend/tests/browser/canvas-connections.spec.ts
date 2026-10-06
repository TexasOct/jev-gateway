import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import type { MockApiState } from "../setup/mock-api";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

function setupCatalog(state: MockApiState) {
  const catalog = structuredClone(configuration);
  catalog.models = ["a", "b", "c"].map((name, index) => ({
    ...catalog.models[0]!, id: `fixture-provider/${name}`, upstream_model: name,
    tags: [...(index < 2 ? ["balanced/default"] : []), ...(index === 0 ? ["balanced/quality"] : []), "foreign/tag"],
    baseline_tags: [...(index < 2 ? ["balanced/default"] : []), ...(index === 0 ? ["balanced/quality"] : []), "foreign/tag"],
  }));
  catalog.labels[0]!.models = catalog.models.slice(0, 2).map((model) => model.id);
  catalog.labels[1]!.models = [catalog.models[0]!.id];
  state.appliedConfiguration = catalog;
  state.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: {
    questions: { x: 50, y: 80 }, "rule-0": { x: 360, y: 80 }, fallback: { x: 360, y: 300 },
    "zone::balanced/default": { x: 680, y: 80 }, "zone::balanced/quality": { x: 680, y: 300 },
    "model::fixture-provider/a": { x: 1000, y: 80 }, "model::fixture-provider/b": { x: 1000, y: 180 }, "model::fixture-provider/c": { x: 1000, y: 280 },
  } };
  return catalog;
}

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Strategy workflow", exact: true }).click();
  await expect(page.locator('[data-canvas-output="match"][data-output-node="rule-0"]')).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function clickWire(page: Page, wire: Locator) {
  const point = await wire.evaluate(async (element) => {
    // Layout restoration and locale-dependent chrome can move the SVG between frames.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const path = element as SVGPathElement, matrix = path.getScreenCTM()!;
    for (const fraction of [0.2, 0.3, 0.5, 0.7, 0.8]) {
      const point = path.getPointAtLength(path.getTotalLength() * fraction).matrixTransform(matrix);
      const x = Math.round(point.x), y = Math.round(point.y);
      if ([-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => document.elementFromPoint(x + dx, y + dy) === path))) return { x, y };
    }
    throw new Error("Wire has no exposed native hit point");
  });
  await page.mouse.click(point.x, point.y);
}

async function drag(page: Page, source: Locator, target: Locator) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const a = await source.boundingBox(), b = await target.boundingBox();
  if (!a || !b) throw new Error("Missing native port bounds");
  expect(await source.evaluate((element) => { const rect = element.getBoundingClientRect(); return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element; })).toBe(true);
  expect(await target.evaluate((element) => { const rect = element.getBoundingClientRect(); return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element; })).toBe(true);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`selects the exact question result wire and names its output in ${locale}`, async ({ page, mockApi }, testInfo) => {
    setupCatalog(mockApi); await open(page);
    const words = locale === "en" ? en : zhCN;
    if (locale === "zh-CN") {
      await page.getByRole("button", { name: en.settings, exact: true }).click();
      await page.locator("[data-settings-language]").selectOption(locale);
      await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    }
    const wires = page.locator('[data-canvas-edge][data-edge-from="questions"][data-edge-kind="context"]');
    const pressed = page.locator('[data-canvas-edge][aria-pressed="true"]');
    const panel = page.getByRole("region", { name: words.canvasConnectionActions });
    await expect(wires).toHaveCount(2);
    for (const [index, criterion] of ["default", "other"].entries()) {
      const wire = wires.nth(index);
      const tuple = JSON.stringify(["questions", JSON.stringify(["intent", criterion]), "rule-0"]);
      await clickWire(page, wire);
      await expect(pressed).toHaveCount(1);
      await expect(pressed).toHaveAttribute("data-canvas-edge", tuple);
      await expect(panel.locator("p").first()).toHaveText(`${words.questions} · intent = ${criterion} → ${words.rule} 1`);
      await expect(panel).toContainText(words.canvasReason_context);
      await expect(panel.getByRole("button", { name: words.canvasDisconnect })).toBeDisabled();
      await panel.getByRole("button", { name: words.cancel, exact: true }).click();
      await expect(pressed).toHaveCount(0);

      await wire.focus(); await wire.press("Enter");
      await expect(pressed).toHaveCount(1);
      await expect(pressed).toHaveAttribute("data-canvas-edge", tuple);
      await expect(panel.locator("p").first()).toHaveText(`${words.questions} · intent = ${criterion} → ${words.rule} 1`);
      await expect(panel).toContainText(words.canvasReason_context);
      if (criterion === "other") await page.screenshot({ path: testInfo.outputPath(`connection-${locale}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(pressed).toHaveCount(0);
      await expect(wire).toBeFocused();
    }
    await page.locator('[data-output-node="questions"][data-output-kind="context"]').last().click();
    await expect(pressed).toHaveCount(1);
    await expect(pressed).toHaveAttribute("data-canvas-edge", JSON.stringify(["questions", JSON.stringify(["intent", "other"]), "rule-0"]));
    await expect(panel.locator("p").first()).toHaveText(`${words.questions} · intent = other → ${words.rule} 1`);
    await page.getByRole("button", { name: words.canvasPanTool, exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(pressed).toHaveCount(0);
    expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
  });
}

test("selects native wires, disconnects and repairs match outputs before review", async ({ page, mockApi }) => {
  setupCatalog(mockApi);
  await open(page);
  const wire = page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="match"]');
  await clickWire(page, wire);
  const panel = page.getByRole("region", { name: "Connection actions" });
  await expect(panel.locator("p").first()).toHaveText("Rule 1 · Match → default");
  await expect(page.locator(".workflow-inspector")).toHaveCount(0);
  await panel.getByRole("button", { name: "Disconnect connection" }).click();
  const output = page.locator('[data-output-node="rule-0"][data-canvas-output="match"]');
  await expect(output).toHaveAttribute("data-output-connected", "false");
  await expect(wire).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review changes", exact: true })).toBeDisabled();
  await expect(page.getByText("Connect every rule match and fallback output to an existing label before reviewing this draft.", { exact: true })).toBeVisible();
  await output.focus(); await output.press("Enter");
  await expect(panel.locator("p").first()).toHaveText("Rule 1 · Match");
  await panel.getByLabel("Choose destination").selectOption("zone::balanced/quality");
  await panel.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(output).toHaveAttribute("data-output-connected", "true");
  await expect(page.getByRole("button", { name: "Review changes", exact: true })).toBeEnabled();
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
  await page.screenshot({ path: "../.trellis/tasks/10-03-strategy-workflow-canvas-editing/verification/canvas-repaired-draft.png" });
  await drag(page, output, page.locator('[data-canvas-input="zone::balanced/default"]'));
  await expect(page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="match"]')).toHaveAttribute("data-edge-to", "zone::balanced/default");
});

test("adds and disconnects pool members with native drag and preserves foreign tags through apply", async ({ page, mockApi }) => {
  setupCatalog(mockApi);
  mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate" }, { method: "PUT", path: "/v1/routing/configuration" });
  await open(page);
  const add = page.locator('[data-output-node="zone::balanced/default"][data-canvas-output="add"]');
  const target = page.locator('[data-canvas-input="model::fixture-provider/c"]');
  const pool = page.locator('[data-canvas-node="zone::balanced/default"]');
  await expect(pool).toHaveCSS("height", "140px");
  await drag(page, add, target);
  const added = page.locator('[data-output-node="zone::balanced/default"][data-canvas-output="model::fixture-provider/c"]');
  await expect(added).toBeVisible();
  await expect(pool).toHaveCSS("height", "168px");
  await added.click();
  const panel = page.getByRole("region", { name: "Connection actions" });
  await expect(panel.locator("p").first()).toHaveText("default · fixture-provider/c → fixture-provider/c");
  await panel.getByRole("button", { name: "Disconnect connection" }).click();
  await expect(pool).toHaveCSS("height", "140px");
  await drag(page, add, target);
  await expect(added).toBeVisible();
  await expect(pool).toHaveCSS("height", "168px");
  await page.getByRole("button", { name: "Review changes", exact: true }).click();
  expect(mockApi.requests.filter(({ method, path }) => method === "PUT" && path.includes("configuration"))).toEqual([]);
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect.poll(() => mockApi.appliedConfiguration!.models.find((model) => model.id === "fixture-provider/c")!.tags).toEqual(["foreign/tag", "balanced/default"]);
});

test("reconnects an empty failure fallback by pointer drag and cancels keyboard connection controls", async ({ page, mockApi }) => {
  setupCatalog(mockApi); await open(page);
  const output = page.locator('[data-output-node="fallback"][data-canvas-output="match"]');
  await output.focus(); await output.press("Space");
  const panel = page.getByRole("region", { name: "Connection actions" });
  await expect(panel).toBeVisible();
  await expect(panel.locator("p").first()).toHaveText("Decision failure fallback · Match → default");
  await panel.getByLabel("Choose destination").press("Escape");
  await expect(panel).toHaveCount(0); await expect(output).toBeFocused();
  // Removing the top connection panel changes the measured content origin over two frames.
  // Read native bounds after that layout settles, then confirm the port is exposed.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  expect(await output.evaluate((element) => { const rect = element.getBoundingClientRect(); return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element; })).toBe(true);
  const box = await output.boundingBox();
  await page.mouse.move(box!.x + 9, box!.y + 9); await page.mouse.down();
  await page.mouse.move(box!.x + 40, box!.y + 20);
  await expect(page.locator(".canvas-edge-preview")).toHaveCount(1);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(page.locator(".canvas-edge-preview")).toHaveCount(0);
  await expect(output).toHaveAttribute("data-output-connected", "true");
  await output.click(); await panel.getByRole("button", { name: "Disconnect connection" }).click();
  await expect(output).toHaveAttribute("data-output-connected", "false");
  await output.focus(); await output.press("Enter");
  await expect(panel.locator("p").first()).toHaveText("Decision failure fallback · Match");
  await page.keyboard.press("Escape");
  await expect(output).toBeFocused();
  await drag(page, output, page.locator('[data-canvas-input="zone::balanced/quality"]'));
  await expect(page.locator('[data-canvas-edge][data-edge-from="fallback"][data-edge-to="zone::balanced/quality"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Review changes", exact: true })).toBeEnabled();
});

test("question options grow and shrink ports and dense handles keep full size and exact wire centers", async ({ page, mockApi }) => {
  const catalog = setupCatalog(mockApi);
  catalog.models = Array.from({ length: 12 }, (_, index) => ({ ...catalog.models[0]!, id: `fixture-provider/member-${index}`, upstream_model: `member-${index}` }));
  catalog.labels[0]!.models = catalog.models.map((model) => model.id);
  await open(page);
  const pool = page.locator('[data-canvas-node="zone::balanced/default"]');
  await expect(pool).toHaveCSS("height", "420px");
  const geometry = await page.locator('[data-output-node="zone::balanced/default"]').evaluateAll((ports) => ports.map((port) => { const box = port.getBoundingClientRect(); return { width: box.width, height: box.height, y: box.y }; }));
  expect(geometry).toHaveLength(13);
  for (const [index, port] of geometry.entries()) { expect(port.width).toBe(18); expect(port.height).toBe(18); if (index) expect(port.y - geometry[index - 1]!.y).toBe(28); }
  const wire = page.locator('[data-canvas-edge][data-edge-from="zone::balanced/default"]').first();
  const endpoint = await wire.evaluate((element) => { const point = (element as SVGPathElement).getPointAtLength(0).matrixTransform((element as SVGPathElement).getScreenCTM()!); return { x: point.x, y: point.y }; });
  const port = await page.locator('[data-output-node="zone::balanced/default"]').first().boundingBox();
  expect(endpoint.x).toBeCloseTo(port!.x + 9, 1); expect(endpoint.y).toBeCloseTo(port!.y + 9, 1);
  await expect(wire.locator("..").locator("path").first()).toHaveAttribute("marker-end", "url(#canvas-arrow)");
  const destination = await wire.getAttribute("data-edge-to");
  const input = page.locator(`[data-canvas-input="${destination}"]`);
  const inputBox = await input.boundingBox();
  const end = await wire.evaluate((element) => { const path = element as SVGPathElement; const point = path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()!); return { x: point.x, y: point.y }; });
  expect(end.x).toBeCloseTo(inputBox!.x + 9, 1); expect(end.y).toBeCloseTo(inputBox!.y + 9, 1);
  const cardBox = await page.locator(`[data-canvas-node="${destination}"]`).boundingBox();
  expect(inputBox!.x + 9).toBeCloseTo(cardBox!.x, 1);
  const poolBox = await pool.boundingBox();
  expect(port!.x + 9).toBeCloseTo(poolBox!.x + poolBox!.width, 1);
  const questions = page.locator('[data-canvas-node="questions"]');
  await questions.click();
  const inspector = page.locator(".workflow-inspector");
  await inspector.getByLabel("New criterion key").fill("extra");
  await inspector.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(page.locator('[data-output-node="questions"]')).toHaveCount(4);
  await expect(questions).toHaveCSS("height", "168px");
  await inspector.getByLabel("Criterion key", { exact: true }).last().locator("..").locator("..").getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator('[data-output-node="questions"]')).toHaveCount(3);
  await expect(questions).toHaveCSS("height", "140px");
});

test("aligns a selected group and restores its layout without policy writes", async ({ page, mockApi }) => {
  setupCatalog(mockApi); mockApi.canvasLayout!.nodes["rule-0"]!.y = 320; await open(page);
  const first = page.locator('[data-canvas-node="questions"]'), second = page.locator('[data-canvas-node="rule-0"]');
  await first.focus(); await first.press("Shift+Enter"); await second.focus(); await second.press("Shift+Enter");
  await page.getByRole("button", { name: "Align left", exact: true }).click();
  await expect.poll(() => mockApi.canvasLayout?.nodes["rule-0"]?.x).toBe(50);
  await page.getByRole("button", { name: "Align top", exact: true }).click();
  await expect.poll(() => mockApi.canvasLayout?.nodes["rule-0"]?.y).toBe(80);
  await page.reload();
  await page.getByRole("button", { name: "Strategy workflow", exact: true }).click();
  await expect(page.locator('[data-canvas-node="rule-0"]')).toHaveCSS("left", "50px");
  await expect(page.locator('[data-canvas-node="rule-0"]')).toHaveCSS("top", "80px");
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
});

test("guards fixed paths, explicit pools, last members and read-only connection actions", async ({ page, mockApi }) => {
  const catalog = setupCatalog(mockApi);
  catalog.labels[1]!.resolution = "models";
  await open(page);
  const panel = page.getByRole("region", { name: "Connection actions" });
  await page.locator('[data-output-node="questions"][data-output-kind="context"]').first().click();
  await expect(panel).toContainText("These paths are fixed"); await expect(panel.getByRole("button", { name: "Disconnect connection" })).toBeDisabled();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  const explicit = page.locator('[data-output-node="zone::balanced/quality"]');
  await expect(explicit).toHaveCount(1); await explicit.focus(); await explicit.press("Enter");
  await expect(panel).toContainText("explicit, read-only model list");
  await expect(panel.getByRole("button", { name: "Disconnect connection" })).toBeDisabled();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  const firstMember = page.locator('[data-output-node="zone::balanced/default"]').first();
  await firstMember.click(); await panel.getByRole("button", { name: "Disconnect connection" }).click();
  await firstMember.click(); await expect(panel).toContainText("Keep at least one model");
  await expect(panel.getByRole("button", { name: "Disconnect connection" })).toBeDisabled();
  catalog.write_available = false;
  await page.reload();
  await page.getByRole("button", { name: "Strategy workflow", exact: true }).click();
  await page.locator('[data-output-node="rule-0"][data-canvas-output="match"]').click();
  await expect(panel).toContainText("read-only or under review");
  await expect(panel.getByRole("button", { name: "Connect", exact: true })).toHaveCount(0);
});

test("blocks unsupported question drafts with a specific error", async ({ page, mockApi }) => {
  const catalog = setupCatalog(mockApi); catalog.questions.intent!.criteria = { default: "One" };
  await open(page);
  await expect(page.getByText("intent: Each choice question needs at least two criteria before review.", { exact: true })).toBeVisible();
  await page.locator('[data-canvas-node="fallback"]').click();
  await page.locator(".workflow-inspector").getByLabel("Label").selectOption("quality");
  await expect(page.getByRole("button", { name: "Review changes", exact: true })).toBeDisabled();
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
});

for (const field of ["Instructions", "Criterion description"] as const) {
  test(`blocks blank ${field.toLowerCase()} and restores result ports after repair`, async ({ page, mockApi }) => {
    setupCatalog(mockApi); await open(page);
    await page.locator('[data-canvas-node="questions"]').click();
    const input = page.locator(".workflow-inspector").getByRole("textbox", { name: field, exact: true }).first();
    await input.fill("   ");
    const message = field === "Instructions" ? "Enter question instructions before review." : "Every criterion needs a nonempty description before review.";
    await expect(page.getByText(`intent: ${message}`, { exact: true })).toBeVisible();
    await expect(page.locator('[data-output-node="questions"][data-output-kind="context"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review changes", exact: true })).toBeDisabled();
    await input.fill("Repaired question text");
    await expect(page.locator('[data-output-node="questions"][data-output-kind="context"]')).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Review changes", exact: true })).toBeEnabled();
    expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
  });
}

test("a stale native connection gesture cannot overwrite a newer inspector edit", async ({ page, mockApi }) => {
  setupCatalog(mockApi); await open(page);
  await page.locator('[data-canvas-node="rule-0"]').click();
  const choice = page.locator(".workflow-inspector").getByLabel("Label");
  await expect(choice).toBeVisible();
  const output = page.locator('[data-output-node="rule-0"][data-canvas-output="match"]');
  const box = await output.boundingBox();
  await page.mouse.move(box!.x + 9, box!.y + 9); await page.mouse.down();
  await choice.selectOption("quality");
  await page.mouse.move(box!.x + 60, box!.y + 30, { steps: 3 }); await page.mouse.up();
  await expect(page.getByText("This connection has changed. Select it again.", { exact: true })).toBeVisible();
  await expect(choice).toHaveValue("quality");
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
});

test("rejects an oversized arrange-all operation visibly without a layout or policy PUT", async ({ page, mockApi }) => {
  const catalog = setupCatalog(mockApi);
  catalog.models = Array.from({ length: 257 }, (_, index) => ({ ...catalog.models[0]!, id: `fixture-provider/member-${index}`, upstream_model: `member-${index}`, tags: [] }));
  mockApi.canvasLayout = { version: 1, nodes: {}, viewport: { x: 0, y: 0 } };
  await open(page);
  const writes = mockApi.requests.filter(({ method }) => method === "PUT").length;
  await page.getByRole("button", { name: "Arrange all", exact: true }).click();
  await expect(page.getByText("Cannot save this arrangement: layout supports 256 nodes, coordinates within 10000 and at most 65536 encoded bytes.", { exact: false })).toBeVisible();
  expect(mockApi.requests.filter(({ method }) => method === "PUT")).toHaveLength(writes);
});
