import { writeFile } from "node:fs/promises";
import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";
import type { Page } from "@playwright/test";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

const layout = { version: 1 as const, nodes: { questions: { x: 50, y: 80 }, "rule-0": { x: 350, y: 80 }, fallback: { x: 350, y: 300 }, "model::fixture/existing": { x: 700, y: 80 } }, viewport: { x: 0, y: 0 } };
const layoutBase = "/v1/dashboard/canvas-layout", layoutPath = `${layoutBase}?strategy=balanced`;
const selectedModels = ["fixture-provider/fixture-model", "fixture/existing"];
type RequestEntry = { method: string; path: string; body: string | null };
type ExposureLedger = { requests: RequestEntry[]; completed: { method: string; status: number; body: unknown }[]; pending: Promise<void>[]; errors: string[]; baseline?: unknown };
const exposure = new WeakMap<Page, ExposureLedger>();
test.beforeEach(async ({ page }) => {
  const ledger: ExposureLedger = { requests: [], completed: [], pending: [], errors: [] };
  exposure.set(page, ledger);
  page.on("request", request => { const url = new URL(request.url()); ledger.requests.push({ method: request.method(), path: url.pathname + url.search, body: request.postData() }); });
  page.on("response", response => {
    if (new URL(response.url()).pathname !== layoutBase) return;
    ledger.pending.push(response.json().then(body => { ledger.completed.push({ method: response.request().method(), status: response.status(), body }); }).catch(error => { ledger.errors.push(String(error)); }));
  });
});
test.afterEach(async ({ page }, info) => {
  const ledger = exposure.get(page)!;
  await Promise.all(ledger.pending);
  await writeFile(info.outputPath("exposure-boundary.json"), JSON.stringify({ requests: ledger.requests, completed: ledger.completed, baseline: ledger.baseline, errors: ledger.errors }, null, 2));
  expect(ledger.errors).toEqual([]);
});
const mutations = (requests: RequestEntry[]) => requests.filter(request => request.method !== "GET");

async function frames(page: import("@playwright/test").Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function openStrategy(page: import("@playwright/test").Page, words: typeof en) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
}

async function modelNode(page: Page, state: ProviderFixtureState, words: typeof en | typeof zhCN) {
  const status = page.getByRole("toolbar", { name: words.canvasTools }).locator("output");
  await expect(status).toHaveAttribute("title", words.canvasZoom);
  await expect(page.locator('.workflow-toolbar[data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  const node = page.locator('[data-canvas-node="model::fixture/existing"]');
  await expect(node).toBeVisible();
  for (let count = 0; count < 180 && !await node.evaluate(element => element === document.activeElement); count++) await page.keyboard.press("Tab");
  await expect(node).toBeFocused();
  expect(await node.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  await frames(page);
  const viewport = await page.locator(".routing-canvas-scroll").evaluate(canvas => {
    const content = canvas.querySelector(".routing-canvas-content")!;
    return { x: Math.round(canvas.scrollLeft), y: Math.round(canvas.scrollTop), scale: new DOMMatrixReadOnly(getComputedStyle(content).transform).a };
  });
  expect(viewport.scale).toBe(1);
  const expected = { ...layout, viewport: { x: viewport.x, y: viewport.y } };
  const changed = viewport.x !== layout.viewport.x || viewport.y !== layout.viewport.y;
  const ledger = exposure.get(page)!;
  const pendingStatus = await status.textContent();
  if (changed) await expect.poll(() => ledger.completed.filter(response => response.method === "PUT").length).toBe(1);
  await expect(status).toHaveText("100%");
  await expect(page.locator('.workflow-toolbar[data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  const writes = changed ? [expected] : [];
  expect(state.canvasWrites ?? []).toEqual(writes);
  expect(ledger.completed.filter(response => response.method === "PUT")).toEqual(writes.map(body => ({ method: "PUT", status: 200, body })));
  expect(mutations(ledger.requests)).toEqual(writes.map(body => ({ method: "PUT", path: layoutPath, body: JSON.stringify(body) })));
  expect(state.canvasLayout).toEqual(changed ? expected : layout);
  expect(state.writes).toEqual([]); expect(state.validations).toEqual([]); expect(state.unexpected ?? []).toEqual([]);
  const baseline = structuredClone({ requests: ledger.requests, canvasWrites: state.canvasWrites ?? [], canvasLayout: state.canvasLayout, configuration: state.configuration, viewport, pendingStatus, savedStatus: await status.textContent() });
  ledger.baseline = baseline;
  return { node, baseline };
}

async function exposed(node: import("@playwright/test").Locator) {
  return node.evaluate((el) => { const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + 18; return { x, y, bounds: b.toJSON(), hit: el.contains(document.elementFromPoint(x, y)), connected: el.isConnected }; });
}

// The model node must open the one shared webpage model editor Dialog bound to
// its exact provider/model identity. Read-only inspection writes nothing.
test("strategy model node opens the shared model Dialog bound to its exact identity", async ({ page, context }, info) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [], routingSelectedModels: selectedModels, canvasLayout: structuredClone(layout) };
  await installProviderFixture(context, state);
  const requests: { method: string; path: string }[] = [];
  page.on("request", (request) => { const url = new URL(request.url()); requests.push({ method: request.method(), path: url.pathname + url.search }); });
  await openStrategy(page, en);
  const { node, baseline } = await modelNode(page, state, en);
  const before = await exposed(node);
  expect(before.hit).toBe(true);
  const saved = structuredClone(state.canvasLayout);
  await node.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const heading = dialog.getByRole("heading").first();
  await expect(heading).toContainText("existing");
  await expect(heading).toContainText(en.mmEdit);
  await expect(heading).toContainText("Fixture provider");
  // The editor is bound to the exact upstream identity, not a display alias.
  await expect(dialog.getByLabel(en.mmUpstreamId).first()).toHaveValue("existing");
  await expect(dialog.getByLabel(en.mmDisplayName, { exact: true })).toHaveValue("");
  // The read-only inspection performed no layout, policy or credential write.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(requests.filter((request) => request.method !== "GET")).toEqual(mutations(baseline.requests).map(({ method, path }) => ({ method, path })));
  expect(state.writes).toEqual([]);
  expect(state.canvasWrites ?? []).toEqual(baseline.canvasWrites);
  expect(mutations(exposure.get(page)!.requests)).toEqual(mutations(baseline.requests));
  expect(state.configuration).toEqual(baseline.configuration);
  expect(state.canvasLayout).toEqual(saved);
  const returned = await exposed(node);
  expect(returned.hit).toBe(true); expect(returned.connected).toBe(true);
  await expect(node).toBeFocused();
  await writeFile(info.outputPath("handoff-identity.json"), JSON.stringify({ before, returned, requests, saved }, null, 2));
  await page.screenshot({ path: info.outputPath("handoff-returned-focus.png") });
});

for (const [locale, width, scheme] of [["en", 390, "light"], ["zh-CN", 320, "dark"]] as const) {
  test(`dirty model draft blocks dismissal and returns focus ${locale} ${width} ${scheme}`, async ({ page, context }, info) => {
    const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [], routingSelectedModels: selectedModels, canvasLayout: structuredClone(layout) };
    await installProviderFixture(context, state);
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/dashboard/");
    if (locale === "zh-CN") { await page.getByRole("button", { name: en.settings, exact: true }).click(); await page.locator("[data-settings-language]").selectOption(locale); }
    const words = locale === "en" ? en : zhCN;
    await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
    const { node, baseline } = await modelNode(page, state, words);
    const at = await exposed(node); expect(at.hit).toBe(true);
    await node.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const name = dialog.getByLabel(words.mmDisplayName, { exact: true });
    const raw = "Canvas bound 名称";
    await name.focus(); await page.keyboard.type(raw);
    await page.keyboard.press("Escape");
    await expect(dialog.getByText(words.mmDiscardQuestion, { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: words.mmKeepEditing, exact: true }).click();
    await expect(name).toHaveValue(raw); await expect(dialog).toBeVisible();
    expect(state.canvasWrites ?? []).toEqual(baseline.canvasWrites);
    expect(mutations(exposure.get(page)!.requests)).toEqual(mutations(baseline.requests));
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: words.mmDiscard, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await frames(page);
    expect(state.writes).toEqual([]); expect(state.canvasWrites ?? []).toEqual(baseline.canvasWrites);
    expect(mutations(exposure.get(page)!.requests)).toEqual(mutations(baseline.requests));
    expect(state.canvasLayout).toEqual(baseline.canvasLayout);
    expect(state.configuration).toEqual(baseline.configuration);
    const returned = await exposed(node);
    expect(returned.hit).toBe(true); expect(returned.connected).toBe(true);
    await writeFile(info.outputPath("dirty-draft-returned.json"), JSON.stringify({ at, returned, writes: state.writes }, null, 2));
    await page.screenshot({ path: info.outputPath("dirty-draft-returned.png") });
  });
}

test("pending model write blocks dismissal and failed save retains the draft", async ({ page, context }, info) => {
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [], routingSelectedModels: selectedModels, canvasLayout: structuredClone(layout), delayWrite: () => gate, rejectWrite: 503 };
  await installProviderFixture(context, state);
  await openStrategy(page, en);
  const { node, baseline } = await modelNode(page, state, en);
  const at = await exposed(node); expect(at.hit).toBe(true);
  await page.mouse.click(at.x, at.y); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const name = dialog.getByLabel(en.mmDisplayName, { exact: true });
  const raw = "Pending canvas model";
  await name.fill(raw);
  await dialog.getByRole("button", { name: en.mmSave, exact: true }).focus(); await page.keyboard.press("Enter");
  await expect.poll(() => state.writes.length).toBe(1);
  // A pending write locks the draft and clears the busy controls.
  await expect(name).toBeDisabled();
  await expect(dialog.getByRole("button", { name: en.loading, exact: true })).toBeDisabled();
  // Dismissal during a pending write neither closes the dialog nor drops the draft.
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible(); await expect(name).toHaveValue(raw);
  expect(state.canvasWrites ?? []).toEqual(baseline.canvasWrites);
  expect(state.canvasLayout).toEqual(baseline.canvasLayout);
  await expect(dialog.getByRole("button", { name: en.mmKeepEditing, exact: true })).toHaveCount(0);
  release();
  // The admission then fails with the owned synthetic rejection; the draft survives.
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog).toBeVisible(); await expect(name).toHaveValue(raw); await expect(name).toBeEnabled();
  expect(state.writes).toHaveLength(1);
  expect(state.configuration.models[0]!.display_name).not.toBe(raw);
  await writeFile(info.outputPath("pending-and-failure.json"), JSON.stringify({ writes: state.writes, truth: state.configuration.models[0] }, null, 2));
  await page.screenshot({ path: info.outputPath("pending-failed-retained.png") });
  // A clean dismissal still returns focus to the visible canvas trigger.
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: en.mmDiscard, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const returned = await exposed(node);
  expect(returned.hit).toBe(true); expect(returned.connected).toBe(true);
  expect(state.canvasWrites ?? []).toEqual(baseline.canvasWrites);
  expect(state.canvasLayout).toEqual(baseline.canvasLayout);
  expect(mutations(exposure.get(page)!.requests)).toEqual([
    ...mutations(baseline.requests),
    ...state.validations.map(body => ({ method: "POST", path: "/v1/provider-configuration/validate", body: JSON.stringify(body) })),
    ...state.writes.map(body => ({ method: "PUT", path: "/v1/provider-configuration", body: JSON.stringify(body) })),
  ]);
});
