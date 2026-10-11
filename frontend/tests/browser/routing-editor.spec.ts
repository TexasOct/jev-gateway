import { test, expect } from "./fixtures";
import type { Locator } from "@playwright/test";
import { en } from "../../src/shared/i18n/en";

async function openDashboard(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/");
  await expect(page.locator('header button[aria-label="Refresh"]')).toBeVisible();
}

test("native route branches retain selection and endpoints with and without reduced motion", async ({ page, mockApi }, info) => {
  const focusEdge = async (target: Locator) => {
    for (let count = 0; count < 180 && !await target.evaluate(element => element === document.activeElement); count++) await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
    const focus = await target.evaluate(element => {
      const path = element as SVGPathElement, matrix = path.getScreenCTM()!;
      const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(matrix);
      return { visible: path.matches(":focus-visible"), points: [{ x: point.x, y: point.y, hit: path.contains(document.elementFromPoint(point.x, point.y)) }] };
    });
    expect(focus.visible).toBe(true); expect(focus.points.every(point => point.hit), JSON.stringify(focus)).toBe(true);
    expect(focus.points.every(point => point.x >= 0 && point.x <= 1280 && point.y >= 0 && point.y <= 900)).toBe(true);
    await info.attach("native-svg-focus", { body: JSON.stringify(focus), contentType: "application/json" });
  };
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openDashboard(page);
  await page.getByRole("button", { name: "Strategy workflow" }).click();
  await expect(page.locator(".workflow-drawer, .workflow-info, [data-flow-state], [data-flow-motion]")).toHaveCount(0);
  const edges = page.locator("[data-canvas-edge]");
  const endpoints = await edges.evaluateAll(elements => elements.map(element => ({ from: element.getAttribute("data-edge-from"), kind: element.getAttribute("data-edge-kind"), to: element.getAttribute("data-edge-to") })));
  const fallbackBranch = page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="unmatched"]');
  await expect(fallbackBranch).toHaveAttribute("data-edge-to", "zone::balanced/default");
  await focusEdge(fallbackBranch); await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: en.canvasConnectionActions })).toContainText("default");
  const activePath = fallbackBranch.locator("..").locator("[data-workflow-edge]");
  await expect(fallbackBranch).toHaveAttribute("aria-pressed", "true");
  await expect(activePath).toHaveCSS("stroke-width", "3px");
  await expect(activePath).toHaveCSS("stroke", /rgb\(\d+, \d+, \d+\)/);
  await expect(activePath).toHaveCSS("stroke-dasharray", "6px, 5px");
  const match = page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="match"]');
  const otherPath = match.locator("..").locator("[data-workflow-edge]");
  await expect(match).toHaveAttribute("aria-pressed", "false");
  await expect(otherPath).toHaveCSS("stroke-width", "2px");
  // ConfiguredRouteFlow tracing is retired. Mounted native edges are static in
  // both preferences; this does not certify an equivalent trace animation.
  await expect(activePath).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape"); await expect(fallbackBranch).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await focusEdge(match); await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: en.canvasConnectionActions })).toContainText("default");
  await expect(page.locator('[data-flow-motion="tracing"]')).toHaveCount(0);
  await expect(match).toHaveAttribute("aria-pressed", "true");
  await expect(otherPath).toHaveCSS("stroke-width", "3px");
  await expect(otherPath).toHaveCSS("stroke", /\d+, \d+, \d+|color\(\)/);
  await expect(otherPath).toHaveCSS("stroke-dasharray", "none");
  await expect(activePath).toHaveCSS("stroke-width", "2px");
  await expect(otherPath).toHaveCSS("animation-name", "none");
  expect(await edges.evaluateAll(elements => elements.map(element => ({ from: element.getAttribute("data-edge-from"), kind: element.getAttribute("data-edge-kind"), to: element.getAttribute("data-edge-to") })))).toEqual(endpoints);
  await page.keyboard.press("Escape"); await expect(match).toBeFocused();
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && !(method === "PUT" && path === "/v1/dashboard/canvas-layout?strategy=balanced"))).toEqual([]);

  // Monitoring interaction checks exercise trace replay controls and stage states separately.
});

test("routing draft validates before review, requires warning acknowledgement, then explicitly applies and confirms reset", async ({ page, mockApi }) => {
  mockApi.configurationWarnings = true;
  mockApi.allowedWrites.push(
    { method: "POST", path: "/v1/routing/configuration/validate?strategy=balanced" },
    { method: "PUT", path: "/v1/routing/configuration?strategy=balanced" },
    { method: "DELETE", path: "/v1/routing/configuration?strategy=balanced" },
  );
  await openDashboard(page);
  await page.getByRole("button", { name: "Strategy workflow" }).click();
  await expect(page.locator(".workflow-info, .workflow-drawer")).toHaveCount(0);
  await page.locator('[data-canvas-node="fallback"]').focus(); await page.keyboard.press("Enter");
  const fallback = page.locator(".workflow-inspector");
  await fallback.getByLabel("Label").selectOption("quality");
  await expect(page.locator(".workflow-toolbar[data-policy-draft]")).toHaveAttribute("data-policy-draft", "pending");
  await fallback.getByRole("button", { name: "Close node details" }).click();
  await expect(page.getByRole("button", { name: "Review changes" })).toBeEnabled();
  await page.getByRole("button", { name: "Review changes" }).click();
  await expect(page.getByText("Synthetic acknowledgement required")).toBeVisible();
  expect(mockApi.requests.filter(({ method, path }) => method === "POST" && path === "/v1/routing/configuration/validate?strategy=balanced")).toHaveLength(1);
  expect(mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration?strategy=balanced")).toHaveLength(0);
  const acknowledge = page.getByRole("checkbox", { name: "I have reviewed the validation warnings." });
  await expect(acknowledge).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm and save" })).toBeDisabled();
  await acknowledge.check();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect.poll(() => mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration?strategy=balanced").length).toBe(1);
  const validate = mockApi.requests.findIndex(({ method, path }) => method === "POST" && path === "/v1/routing/configuration/validate?strategy=balanced");
  const apply = mockApi.requests.findIndex(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration?strategy=balanced");
  expect(validate).toBeGreaterThan(-1);
  expect(apply).toBeGreaterThan(validate);
  const validateWrite = mockApi.allowedWrites.find(({ method }) => method === "POST");
  const applyWrite = mockApi.allowedWrites.find(({ method }) => method === "PUT");
  expect(validateWrite?.body).toEqual(applyWrite?.body);
  await expect.poll(() => mockApi.configurationApplied).toBe(true);
  await expect(page.locator(".workflow-toolbar[data-policy-draft]")).toHaveAttribute("data-policy-draft", "unchanged");
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("quality");
  await expect(page.locator('[data-canvas-edge][data-edge-from="fallback"]')).toHaveAttribute("data-edge-to", "zone::balanced/quality");
  await page.getByRole("button", { name: "Reset to baseline" }).click();
  await expect(page.getByText("Remove the overlay and restore the baseline configuration?")).toBeVisible();
  expect(mockApi.requests.filter(({ method, path }) => method === "DELETE" && path === "/v1/routing/configuration?strategy=balanced")).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm reset" }).click();
  await expect.poll(() => mockApi.requests.filter(({ method, path }) => method === "DELETE" && path === "/v1/routing/configuration?strategy=balanced").length).toBe(1);
  await expect.poll(() => mockApi.configurationApplied).toBe(false);
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("default");
  await expect(page.locator('[data-canvas-edge][data-edge-from="fallback"]')).toHaveAttribute("data-edge-to", "zone::balanced/default");
  await expect(page.locator(".workflow-toolbar[data-policy-draft]")).toHaveAttribute("data-policy-draft", "unchanged");
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout?strategy=balanced")).toEqual([{ method: "POST", path: "/v1/routing/configuration/validate?strategy=balanced" }, { method: "PUT", path: "/v1/routing/configuration?strategy=balanced" }, { method: "DELETE", path: "/v1/routing/configuration?strategy=balanced" }]);
});

test("canvas supports keyboard node focus and real pointer drag without policy writes", async ({ page, mockApi }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "Strategy workflow" }).click();
  const canvas = page.getByLabel("Routing whiteboard");
  const node = canvas.locator('[data-canvas-node="questions"]');
  await expect(node).toBeVisible();
  const beforeKey = await node.boundingBox();
  if (!beforeKey) throw new Error("Questions node has no visible box");
  await node.focus();
  await node.press("Alt+ArrowRight");
  await expect.poll(async () => (await node.boundingBox())?.x ?? null).not.toBe(beforeKey.x);
  const beforeDrag = await node.boundingBox();
  if (!beforeDrag) throw new Error("Questions node disappeared after keyboard move");
  const center = { x: beforeDrag.x + beforeDrag.width / 2, y: beforeDrag.y + beforeDrag.height / 2 };
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node"), center);
  expect(hit).toBe("questions");
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 55, center.y + 24, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await node.boundingBox())?.x ?? null).not.toBe(beforeDrag.x);
  await expect.poll(() => mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/dashboard/canvas-layout?strategy=balanced").length).toBeGreaterThanOrEqual(2);
  expect(mockApi.requests.filter(({ method, path }) => method === "PUT" && path.includes("configuration"))).toHaveLength(0);
});

test("canvas utilities preserve measured geometry, toolbar controls and real hit targets at supported widths", async ({ page }) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openDashboard(page);
    await page.getByRole("button", { name: "Strategy workflow" }).click();
    const canvas = page.locator(".routing-canvas-scroll");
    const node = canvas.locator('[data-canvas-node="questions"]');
    await expect(node).toBeVisible();
    await expect(node).toHaveCSS("position", "absolute");
    await expect(node).toHaveCSS("width", "190px");
    await expect(node).toHaveCSS("height", "140px");
    await expect(node).toHaveCSS("overflow", "hidden");
    await expect(node).toHaveCSS("touch-action", "none");
    await expect(canvas).toHaveCSS("position", "absolute");
    await expect(canvas).toHaveCSS("overscroll-behavior", "contain");
    await expect(canvas).toHaveCSS("touch-action", "none");
    const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
    await expect(toolbar).toBeVisible();
    const box = await node.boundingBox();
    if (!box) throw new Error(`Questions node has no box at ${width}px`);
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node"), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(hit).toBe("questions");
    await toolbar.getByRole("button", { name: "Fit" }).click();
    await expect(toolbar.locator("output")).toBeVisible();
    await page.getByRole("button", { name: "Monitoring" }).click();
  }
});
