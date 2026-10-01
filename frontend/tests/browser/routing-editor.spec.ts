import { test, expect } from "./fixtures";

async function openDashboard(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/");
  await expect(page.locator('header button[aria-label="Refresh"]')).toBeVisible();
}

test("shows configured route explanation with and without reduced motion", async ({ page, mockApi }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "Strategy workflow" }).click();
  const expand = page.locator(".workflow-drawer button[aria-controls='routing-information']");
  await expect(expand).toBeVisible();
  await expand.click();
  const fallbackBranch = page.getByRole("region", { name: "Configured route" }).getByRole("button", { name: "Fallback" });
  await expect(fallbackBranch).toBeVisible();
  await fallbackBranch.click();
  await expect(page.getByRole("status").filter({ hasText: "No rule matches" })).toBeVisible();
  const activePath = page.locator('[data-flow-state="active"]').first();
  await expect(activePath).toHaveCSS("stroke-width", "2.5px");
  await expect(activePath).toHaveCSS("stroke", /rgb\(\d+, \d+, \d+\)/);
  const dashedPath = page.locator("path[class*='stroke-dasharray:3_3']").last();
  await expect(dashedPath).toBeVisible();
  await expect(dashedPath).toHaveAttribute("data-flow-state", "active");
  await expect(dashedPath).toHaveClass(/\[stroke-dasharray:3_3\]/);
  await expect(dashedPath).toHaveCSS("stroke-width", "2.5px");
  await expect(dashedPath).toHaveCSS("stroke", /rgb\(\d+, \d+, \d+\)/);
  const idlePaths = page.locator('[data-flow-state="idle"]');
  await expect(idlePaths.first()).toHaveCSS("stroke-width", "1.5px");
  await expect(idlePaths.first()).toHaveAttribute("data-flow-state", "idle");
  const animated = page.locator('[data-flow-motion="tracing"]');
  await expect(animated.first()).toBeVisible();
  await expect.poll(() => animated.first().evaluate((element) => getComputedStyle(element).animationName)).toBe("configured-route-trace");
  await expect.poll(() => animated.first().evaluate((element) => getComputedStyle(element).animationIterationCount)).toBe("1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("region", { name: "Configured route" }).getByRole("button", { name: "Rule 1" }).click();
  await expect(page.getByRole("status").filter({ hasText: "selected rule matches" })).toBeVisible();
  await expect(page.locator('[data-flow-motion="tracing"]')).toHaveCount(0);
  const staticPath = page.locator('[data-flow-state="active"]').first();
  await expect(staticPath).toBeVisible();
  await expect(staticPath).toHaveCSS("stroke-width", "2.5px");
  await expect(staticPath).toHaveCSS("stroke", /\d+, \d+, \d+|color\(\)/);
  await expect(staticPath).toHaveCSS("stroke-dasharray", "none");
  const idlePath = page.locator('[data-flow-state="idle"]').first();
  await expect(idlePath).toHaveCSS("stroke-width", "1.5px");
  await expect.poll(() => staticPath.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);

  // Monitoring interaction checks exercise trace replay controls and stage states separately.
});

test("routing draft validates before review, requires warning acknowledgement, then explicitly applies and confirms reset", async ({ page, mockApi }) => {
  mockApi.configurationWarnings = true;
  mockApi.allowedWrites.push(
    { method: "POST", path: "/v1/routing/configuration/validate" },
    { method: "PUT", path: "/v1/routing/configuration" },
    { method: "DELETE", path: "/v1/routing/configuration" },
  );
  await openDashboard(page);
  await page.getByRole("button", { name: "Strategy workflow" }).click();
  await page.getByRole("button", { name: "Canvas information and advanced editors" }).click();
  await page.getByRole("button", { name: "Edit fallback" }).click();
  const fallback = page.locator(".workflow-inspector");
  await fallback.getByLabel("Label").selectOption("quality");
  await expect(fallback).toContainText("Pending changes");
  await fallback.getByRole("button", { name: "Close node details" }).click();
  await expect(page.getByRole("button", { name: "Review changes" })).toBeEnabled();
  await page.getByRole("button", { name: "Review changes" }).click();
  await expect(page.getByText("Synthetic acknowledgement required")).toBeVisible();
  expect(mockApi.requests.filter(({ method, path }) => method === "POST" && path.endsWith("/validate"))).toHaveLength(1);
  expect(mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration")).toHaveLength(0);
  const acknowledge = page.getByRole("checkbox", { name: "I have reviewed the validation warnings." });
  await expect(acknowledge).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm and save" })).toBeDisabled();
  await acknowledge.check();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect.poll(() => mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration").length).toBe(1);
  const validate = mockApi.requests.findIndex(({ method, path }) => method === "POST" && path.endsWith("/validate"));
  const apply = mockApi.requests.findIndex(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration");
  expect(validate).toBeGreaterThan(-1);
  expect(apply).toBeGreaterThan(validate);
  const validateWrite = mockApi.allowedWrites.find(({ method }) => method === "POST");
  const applyWrite = mockApi.allowedWrites.find(({ method }) => method === "PUT");
  expect(validateWrite?.body).toEqual(applyWrite?.body);
  await expect.poll(() => mockApi.configurationApplied).toBe(true);
  await page.locator(".workflow-drawer button[aria-controls='routing-information']").click();
  await expect(page.getByRole("region", { name: "Configured route" }).getByText("Draft policy preview · matches the currently applied policy")).toBeVisible();
  await page.getByRole("button", { name: "Reset to baseline" }).click();
  await expect(page.getByText("Remove the overlay and restore the baseline configuration?")).toBeVisible();
  expect(mockApi.requests.filter(({ method, path }) => method === "DELETE" && path === "/v1/routing/configuration")).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm reset" }).click();
  await expect.poll(() => mockApi.requests.filter(({ method, path }) => method === "DELETE" && path === "/v1/routing/configuration").length).toBe(1);
  await expect.poll(() => mockApi.configurationApplied).toBe(false);
  await expect(page.getByRole("region", { name: "Configured route" }).getByText("Draft policy preview · matches the currently applied policy")).toBeVisible();
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
  await expect.poll(() => mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/dashboard/canvas-layout").length).toBeGreaterThanOrEqual(2);
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
    await expect(node).toHaveCSS("height", "56px");
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
