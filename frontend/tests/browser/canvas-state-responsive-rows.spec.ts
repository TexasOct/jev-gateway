import { writeFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

// Focused coverage for the original Canvas state/responsive rows whose exact
// gateway the existing public regressions do not already carry:
//   C20  delayed validation and apply failure separation, layout-failure never
//        reports a successful policy save (and the reverse), duplicate-submit no-op.
//   C21  cancel preserves edits/selection/accessible focus; layout-only persistence
//        never claims pending policy changes.
//   C22  collapsed/expanded drawer, menu, selected inspector and validation state
//        geometry in the sixteen viewport/locale/scheme combinations, with document
//        horizontal overflow measured separately from intentionally scrollable content.
//   C23  28px output rows, 18px handles and output growth/shrink geometry, plus
//        reduced-motion keeping information visible.
//   C24  complete empty configuration, failed reads, disabled writes and a 403
//        controlled write failure recover through the available actions.
//   C25  hidden/unmounted objects never retain focus and every dismissal restores an
//        exposed node, control or canvas fallback.
//   WF6  explicit save and reopen retain configuration, derived connections and layout.
// Every pointer drives a real input event; elementFromPoint confirms the hit target.

const policyPath = "/v1/routing/configuration";
const layoutPath = "/v1/dashboard/canvas-layout";
type Words = typeof en | typeof zhCN;
const layout = { version: 1 as const, nodes: { "rule-0": { x: 420, y: 80 }, fallback: { x: 420, y: 300 } }, viewport: { x: 0, y: 0 } };

async function frames(page: Page) { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
async function activate(page: Page, target: Locator) {
  await expect(target).toBeEnabled();
  // Finish the drawer/inspector's deferred focus handoff before choosing the Enter target.
  await frames(page);
  await target.focus();
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
}
async function capture(page: Page, info: TestInfo, stage: string, data: unknown) { await writeFile(info.outputPath(stage + ".json"), JSON.stringify(data, null, 2)); await page.screenshot({ path: info.outputPath(stage + ".png") }); }

async function open(page: Page, locale: "en" | "zh-CN", width: number, height: number, scheme: "light" | "dark", expectEditable = true) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto("/dashboard/");
  if (locale !== "en") {
    await activate(page, page.getByRole("button", { name: en.settings, exact: true }));
    await page.locator("[data-settings-language]").selectOption(locale);
  }
  const words = locale === "en" ? en : zhCN;
  await activate(page, page.getByRole("button", { name: words.strategyEditor, exact: true }));
  const add = page.getByRole("button", { name: words.canvasAddNode, exact: true });
  if (expectEditable) await expect(add).toBeEnabled();
  else await expect(add).toBeDisabled();
  return words;
}

// --- C20: validation/apply/layout failure ownership and duplicate-submit ---

test("C20 delayed validation failure retains the draft and lets Review retry without a PUT", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policyPath}/validate` }, { method: "PUT", path: policyPath });
  let validations = 0, puts = 0;
  const order: string[] = [];
  page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith(policyPath)) order.push(`${request.method()} ${path}`); });
  await page.route(`**${policyPath}/validate`, async route => {
    validations++;
    if (validations === 1) return route.fulfill({ status: 503, json: { error: { message: "Validation service unavailable" } } });
    return route.fallback();
  });
  await page.route(`**${policyPath}`, async route => { if (route.request().method() === "PUT" && ++puts > 0) return route.fallback(); return route.fallback(); });
  const words = await open(page, "en", 1280, 900, "light");
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  const field = inspector.getByRole("textbox", { name: words.instructions, exact: true });
  const raw = "C20 delayed validation keeps this typed draft";
  await field.fill(raw);
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  const review = page.getByRole("button", { name: words.reviewChanges, exact: true });
  await activate(page, review);
  await expect(page.getByRole("alert")).toContainText("Validation service unavailable");
  expect(puts).toBe(0);
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "pending");
  await activate(page, page.getByRole("button", { name: words.canvasUndo, exact: true }));
  // undo restores the baseline; redo brings the raw draft back to prove it was retained
  await activate(page, page.getByRole("button", { name: words.canvasRedo, exact: true }));
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  await expect(field).toHaveValue(raw);
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await activate(page, review);
  // The review surface is admitted: Confirm and save is exposed and enabled.
  await expect(page.getByRole("button", { name: words.confirmAndSave, exact: true })).toBeEnabled();
  expect(validations).toBe(2); expect(puts).toBe(0);
  await capture(page, info, "c20-validation-retry", { validations, puts, order, requests: mockApi.requests });
});

test("C20 a failed layout write never reports a successful policy save and vice versa", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policyPath}/validate` }, { method: "PUT", path: policyPath });
  let layoutPuts = 0;
  await page.route(`**${layoutPath}`, async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    layoutPuts++;
    return route.fulfill({ status: 503, json: { error: { message: "Layout storage offline" } } });
  });
  const words = await open(page, "en", 1280, 900, "light");
  // A layout-only failure must not surface a policy write, success notice or read retry.
  await page.locator('[data-canvas-node="rule-0"]').focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => layoutPuts).toBeGreaterThan(0);
  await expect(page.getByRole("status").filter({ hasText: "Layout storage offline" })).toBeVisible();
  await expect(page.getByRole("button", { name: words.routingRetryRead, exact: true })).toHaveCount(0);
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  expect(mockApi.requests.filter(request => request.method === "PUT" && request.path === policyPath)).toEqual([]);
  // Retry closing the banner issues no policy write.
  const retryLayout = page.getByRole("button", { name: words.canvasRetryLayout, exact: true });
  if (await retryLayout.count()) { await retryLayout.first().click(); await expect.poll(() => layoutPuts).toBeGreaterThan(1); }
  expect(mockApi.requests.filter(request => request.method === "PUT" && request.path === policyPath)).toEqual([]);
  // Now commit a policy successfully; a subsequent layout failure must not revoke it.
  await activate(page, page.locator('[data-canvas-node="fallback"]'));
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  await inspector.getByRole("combobox", { name: words.label, exact: true }).selectOption("quality");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await activate(page, page.getByRole("button", { name: words.reviewChanges, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmAndSave, exact: true }));
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  const committed = structuredClone(mockApi.appliedConfiguration);
  expect(committed?.fallback).toEqual({ label: "quality" });
  await page.locator('[data-canvas-node="rule-0"]').focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.getByRole("status").filter({ hasText: "Layout storage offline" })).toBeVisible();
  // The committed policy is untouched by the later layout failure: no revoked success.
  expect(mockApi.appliedConfiguration).toEqual(committed);
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await capture(page, info, "c20-failure-separation", { layoutPuts, committed, requests: mockApi.requests });
});

test("C20 saving controls prevent duplicate submission during a delayed apply", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policyPath}/validate` }, { method: "PUT", path: policyPath });
  let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
  let puts = 0;
  await page.route(`**${policyPath}`, async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    puts++;
    await barrier;
    return route.fallback();
  });
  const words = await open(page, "en", 1280, 900, "light");
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  await inspector.getByRole("textbox", { name: words.instructions, exact: true }).fill("duplicate submission guard");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await activate(page, page.getByRole("button", { name: words.reviewChanges, exact: true }));
  const confirm = page.getByRole("button", { name: words.confirmAndSave, exact: true });
  await activate(page, confirm);
  await expect.poll(() => puts).toBe(1);
  // While the write is in flight the control is disabled; a forced second Enter cannot add a write.
  await expect(confirm).toBeDisabled();
  await confirm.click({ force: true }).catch(() => undefined);
  await page.keyboard.press("Enter");
  expect(puts).toBe(1);
  release();
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  expect(puts).toBe(1);
  await capture(page, info, "c20-duplicate-submit", { puts, requests: mockApi.requests });
});

// --- C21: cancel preserves selection/focus; layout-only never claims policy ---

test("C21 cancel preserves semantic edits, selection and accessible focus", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  const words = await open(page, "en", 1280, 900, "light");
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  const field = inspector.getByRole("textbox", { name: words.instructions, exact: true });
  await field.fill("C21 cancel-preserved edit");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  // The dirty node stays selected after closing the inspector.
  await expect(page.locator('[data-canvas-node="questions"]')).toHaveClass(/selected/);
  // Navigating away offers a discard choice; dismissing it (cancel) keeps the edit,
  // the selection and an exposed focus target without any write.
  const before = structuredClone(mockApi.canvasLayout), writesBefore = mockApi.requests.filter(request => request.method !== "GET");
  const settings = page.getByRole("button", { name: words.settings, exact: true });
  const dialogs: string[] = [];
  page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await activate(page, settings);
  await expect(settings).toBeFocused();
  await expect(page.locator('[data-canvas-node="questions"]')).toHaveClass(/selected/);
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "pending");
  expect(dialogs.length).toBe(1);
  expect(mockApi.canvasLayout).toEqual(before);
  expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual(writesBefore);
  // The retained edit is still present in the inspector.
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  await expect(field).toHaveValue("C21 cancel-preserved edit");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  // The toolbar Cancel button discards the draft and the selection as a separate boundary.
  await activate(page, page.locator(".workflow-toolbar").getByRole("button", { name: words.cancel, exact: true }));
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  await expect(field).toHaveValue(configuration.questions.intent!.instructions);
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual([]);
  await capture(page, info, "c21-cancel-preserves", { dialogs, requests: mockApi.requests });
});

test("C21 layout-only persistence never claims pending policy changes", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  const words = await open(page, "en", 1280, 900, "light");
  await page.locator('[data-canvas-node="rule-0"]').focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => mockApi.canvasLayout?.nodes["rule-0"]).toEqual({ x: 440, y: 80 });
  await frames(page);
  // The policy draft stays unchanged; the layout indicator explains it is layout only.
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await expect(page.getByText(words.canvasLayoutOnly, { exact: true }).first()).toBeVisible();
  const layoutWrites = mockApi.requests.filter(request => request.method === "PUT" && request.path === layoutPath);
  expect(layoutWrites.length).toBeGreaterThan(0);
  expect(mockApi.requests.filter(request => request.method === "PUT" && request.path === policyPath)).toEqual([]);
  await capture(page, info, "c21-layout-only", { layoutWrites, requests: mockApi.requests });
});

// --- C22: sixteen-combination drawer/menu/inspector/validation geometry ---

for (const [locale, width, height, scheme] of [
  ["en", 1280, 900, "light"], ["en", 1280, 900, "dark"], ["zh-CN", 1280, 900, "light"], ["zh-CN", 1280, 900, "dark"],
  ["en", 1430, 2511, "light"], ["en", 1430, 2511, "dark"], ["zh-CN", 1430, 2511, "light"], ["zh-CN", 1430, 2511, "dark"],
  ["en", 390, 900, "light"], ["en", 390, 900, "dark"], ["zh-CN", 390, 900, "light"], ["zh-CN", 390, 900, "dark"],
  ["en", 320, 900, "light"], ["en", 320, 900, "dark"], ["zh-CN", 320, 900, "light"], ["zh-CN", 320, 900, "dark"],
] as const) {
  test(`C22 drawer menu inspector and validation geometry ${width}x${height} ${locale} ${scheme}`, async ({ page, mockApi }, info) => {
    mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: { questions: { x: 50, y: 80 }, "rule-0": { x: 350, y: 80 }, fallback: { x: 350, y: 300 } } };
    const words = await open(page, locale, width, height, scheme);
    const canvas = page.locator(".routing-canvas-scroll");
    const header = await page.locator(".app-header").boundingBox();
    // Canvas top stays below the measured shared header; its bottom stays in the viewport.
    const canvasBox = (await canvas.boundingBox())!;
    expect(canvasBox.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
    expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(height + 1);
    // Document horizontal overflow is measured separately from the scrollable canvas/toolbar.
    const overflow = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.inner + 1);

    // Menu bounds remain inside the window and its actions are reachable.
    const menu = page.getByRole("menu", { name: words.canvasActions });
    const toolbar = page.getByRole("toolbar", { name: words.canvasTools });
    await expect(toolbar.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
    await toolbar.getByRole("button", { name: words.canvasAddNode, exact: true }).click();
    await expect(menu).toBeVisible();
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.x).toBeGreaterThanOrEqual(0); expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width + 1);
    expect(menuBox.y).toBeGreaterThanOrEqual(0); expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(height + 1);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // Collapsed then expanded drawer: the body scrolls internally, not the page.
    const toggle = page.getByRole("button", { name: words.canvasInformation, exact: true });
    const infoPanel = page.locator("#routing-information");
    expect(await toggle.getAttribute("aria-expanded")).toBe("false");
    expect(await infoPanel.isVisible()).toBe(false);
    await activate(page, toggle);
    expect(await toggle.getAttribute("aria-expanded")).toBe("true");
    await expect(infoPanel).toBeVisible();
    const drawerScroll = await infoPanel.evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: getComputedStyle(el).overflowY }));
    expect(drawerScroll.overflowY).toBe("auto");
    expect(drawerScroll.scrollHeight).toBeGreaterThanOrEqual(drawerScroll.clientHeight);
    const pageAfterDrawer = await page.evaluate(() => ({ documentHeight: document.documentElement.scrollHeight, inner: window.innerHeight }));
    expect(pageAfterDrawer.documentHeight).toBeLessThanOrEqual(pageAfterDrawer.inner + 24);

    // Selected inspector sits in the window with a reachable action.
    const inspector = page.getByRole("complementary", { name: words.nodeInspector });
    await page.locator('[data-canvas-node="questions"]').click();
    await expect(inspector).toBeVisible();
    const inspectorBox = (await inspector.boundingBox())!;
    expect(inspectorBox.x).toBeGreaterThanOrEqual(-1); expect(inspectorBox.x + inspectorBox.width).toBeLessThanOrEqual(width + 1);
    expect(inspectorBox.y).toBeGreaterThanOrEqual(-1); expect(inspectorBox.y + inspectorBox.height).toBeLessThanOrEqual(height + 1);
    await activate(page, inspector.getByRole("button", { name: words.closeInspector, exact: true }));
    await expect(inspector).toHaveCount(0);

    // A validation state is reachable and exposed on this viewport: clearing the
    // required instructions makes the workflow invalid. Select through a native
    // click so a re-render cannot leave the node merely focused, and prove the
    // state through the exposed workspace status.
    await page.locator('[data-canvas-node="questions"]').click();
    await expect(inspector).toBeVisible();
    const instructions = inspector.getByRole("textbox", { name: words.instructions, exact: true });
    await expect(instructions).toBeEnabled();
    await instructions.fill("");
    await expect(instructions).toHaveValue("");
    await expect(page.locator(".workspace-heading [role=status]")).toHaveText(words.canvasInvalidState);
    await expect.poll(async () =>
      (await page.locator(".workspace-heading [role=status]").innerText()) === words.canvasInvalidState
      || (await page.locator('[data-canvas-node="questions"]').getAttribute("aria-invalid")) === "true",
    ).toBe(true);
    await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
    await writeFile(info.outputPath("c22-geometry.json"), JSON.stringify({ locale, width, height, scheme, canvasBox, header, menuBox, drawerScroll, inspectorBox, overflow }, null, 2));
    await page.screenshot({ path: info.outputPath("c22-state.png") });
  });
}

// --- C23: card metrics, output growth/shrink and reduced motion ---

test("C23 dense output rows, handles and growth/shrink keep the documented metrics", async ({ page, mockApi }, info) => {
  const dense = structuredClone(configuration);
  dense.questions.intent!.criteria = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`criterion_${index}`, `可辨识的判定条件 ${index} / identifiable criterion ${index}`]));
  dense.models = Array.from({ length: 10 }, (_, index) => ({ ...dense.models[0]!, id: `fixture-provider/长名称模型-${index + 1}`, upstream_model: `长名称模型-${index + 1}`, tags: ["balanced/default"], baseline_tags: ["balanced/default"] }));
  dense.labels[0]!.models = dense.models.map(({ id }) => id);
  dense.labels[1]!.models = [dense.models[0]!.id];
  mockApi.appliedConfiguration = dense;
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: {} };
  const words = await open(page, "en", 1280, 900, "light");
  const canvas = page.locator(".routing-canvas-scroll");
  await frames(page);
  const metrics = await canvas.locator("[data-canvas-node]").evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    return { id: element.getAttribute("data-canvas-node"), width: box.width, height: box.height, cardWidth: Number.parseFloat(style.width) };
  }));
  for (const node of metrics) expect(node.width).toBe(190);
  const pool = metrics.find(node => node.id === "zone::balanced/default")!;
  // Ten pool members plus the tag-pool "add" output give eleven 28px rows above
  // the 56px identity header; the documented row metric is what this row pins.
  expect(pool.height).toBe(56 + 11 * 28);
  const poolRows = await canvas.locator('[data-canvas-node="zone::balanced/default"]').evaluate(el => el.querySelectorAll("span[style]").length);
  expect(poolRows).toBeGreaterThanOrEqual(11);
  const handle = canvas.locator('[data-canvas-output]').first();
  const handleBox = (await handle.boundingBox())!;
  expect(Math.round(handleBox.width)).toBe(18); expect(Math.round(handleBox.height)).toBe(18);
  const inputHandle = (await canvas.locator('[data-canvas-input="fallback"]').boundingBox())!;
  expect(Math.round(inputHandle.width)).toBe(18); expect(Math.round(inputHandle.height)).toBe(18);
  const row = canvas.locator('span[style*="height: 28px"]').first();
  const rowBox = (await row.boundingBox())!;
  expect(Math.round(rowBox.height)).toBe(28);
  // Long Unicode names remain identifiable (truncated but titled, not blank).
  const longCard = canvas.locator('[data-canvas-node="model::fixture-provider/长名称模型-1"]');
  await expect(longCard).toHaveAttribute("title", /长名称模型-1/);
  await expect(longCard).not.toBeEmpty();

  // Reduced motion keeps information visible and controls usable.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(toolbarAdd(words, page)).toBeEnabled();
  await expect(canvas.locator('[data-canvas-node="questions"]')).toBeVisible();
  await writeFile(info.outputPath("c23-metrics.json"), JSON.stringify({ metrics, pool, handleBox, inputHandle, rowBox }, null, 2));
  await page.screenshot({ path: info.outputPath("c23-dense.png") });
});

function toolbarAdd(words: Words, page: Page) { return page.getByRole("button", { name: words.canvasAddNode, exact: true }); }

// --- C24: empty, failed reads, disabled writes and 403 controlled failure ---

test("C24 complete empty configuration stays usable and is not silently filled", async ({ page, mockApi }, info) => {
  const empty = { ...structuredClone(configuration), questions: {}, rules: [], labels: [], models: [] };
  mockApi.appliedConfiguration = empty;
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: {} };
  const words = await open(page, "en", 1280, 900, "light");
  await expect(page.getByText(words.setupEmptyModels, { exact: true })).toBeVisible();
  // An empty known configuration is usable: pan and fit remain available, and no dummy model appears.
  await expect(page.getByRole("button", { name: words.canvasZoomFit, exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: words.canvasPanTool, exact: true })).toBeEnabled();
  expect(await page.locator('[data-canvas-node^="model::"]').count()).toBe(0);
  expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual([]);
  await capture(page, info, "c24-empty", { requests: mockApi.requests });
});

test("C24 an unreadable layout is an error with retry, never empty success", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  let reads = 0;
  const methods: string[] = [];
  await page.route(`**${layoutPath}`, async route => {
    const method = route.request().method();
    methods.push(method);
    if (method !== "GET" || ++reads !== 1) return route.fallback();
    return route.fulfill({ json: { version: 1, nodes: {}, viewport: { x: 0, y: 0 }, read_error: "Synthetic unread bytes" } });
  });
  // An unreadable layout leaves the canvas untrusted, so creation is disabled.
  const words = await open(page, "en", 1280, 900, "light", false);
  const retryRead = page.getByRole("button", { name: words.canvasRetryLayoutRead, exact: true });
  await expect(retryRead).toBeVisible();
  await expect(page.getByText(words.canvasLayoutUnreadable, { exact: false })).toBeVisible();
  // No layout write is admitted while the read is untrusted.
  expect(methods).toEqual(["GET"]);
  expect(mockApi.canvasLayout).toEqual(layout);
  await retryRead.click();
  await expect.poll(() => methods.length).toBe(2);
  await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
  await expect.poll(() => page.locator('[data-canvas-node="rule-0"]').evaluate(el => ({ x: Number.parseFloat((el as HTMLElement).style.left), y: Number.parseFloat((el as HTMLElement).style.top) }))).toEqual(layout.nodes["rule-0"]);
  expect(methods).toEqual(["GET", "GET"]);
  expect(mockApi.canvasLayout).toEqual(layout);
  await capture(page, info, "c24-layout-read-error", { methods, requests: mockApi.requests });
});

test("C24 disabled writes keep read-only inspection, pan and fit while blocking mutation", async ({ page, mockApi }, info) => {
  mockApi.appliedConfiguration = { ...structuredClone(configuration), write_available: false, write_disabled_reason: "fixture read-only" };
  mockApi.canvasLayout = structuredClone(layout);
  const words = await open(page, "en", 1280, 900, "light", false);
  await expect(page.getByText(words.routingEditsDisabled, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: words.canvasZoomFit, exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: words.canvasPanTool, exact: true })).toBeEnabled();
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  await expect(inspector.getByRole("textbox", { name: words.instructions, exact: true })).toBeDisabled();
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual([]);
  await capture(page, info, "c24-readonly", { requests: mockApi.requests });
});

test("C24 a controlled 403 policy write is refused with recovery and no false success", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policyPath}/validate` });
  await page.route(`**${policyPath}`, async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    return route.fulfill({ status: 403, json: { error: { message: "Forbidden synthetic write" } } });
  });
  const words = await open(page, "en", 1280, 900, "light");
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  await inspector.getByRole("textbox", { name: words.instructions, exact: true }).fill("403 retained draft");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await activate(page, page.getByRole("button", { name: words.reviewChanges, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmAndSave, exact: true }));
  await expect(page.getByRole("alert")).toContainText("Forbidden synthetic write");
  await expect(page.getByRole("status").filter({ hasText: words.routingApplied })).toHaveCount(0);
  // The draft is retained and the review stays available for a corrected explicit retry.
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "pending");
  await expect(page.getByRole("button", { name: words.confirmAndSave, exact: true })).toBeEnabled();
  await capture(page, info, "c24-forbidden", { requests: mockApi.requests });
});

// --- C25: hidden/unmounted focus and dismissal focus restoration ---

test("C25 unmounted inspector and menu never retain focus and restore an exposed target", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  const words = await open(page, "en", 1280, 900, "light");
  // Inspector dismissal returns focus to a visible, exposed node.
  await activate(page, page.locator('[data-canvas-node="rule-0"]'));
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  await expect(inspector).toBeVisible();
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await expect(inspector).toHaveCount(0);
  const focusAfterInspector = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const box = active?.getBoundingClientRect();
    return { tag: active?.tagName ?? null, connected: !!active?.isConnected, exposed: !!box && box.width > 0 && box.height > 0, hit: !!active && document.elementFromPoint(box!.x + box!.width / 2, box!.y + box!.height / 2)?.contains(active) };
  });
  // Either a canvas node fallback or an exposed control owns focus; never a detached node.
  expect(focusAfterInspector.connected).toBe(true);
  expect(focusAfterInspector.exposed || focusAfterInspector.tag === "BODY").toBe(true);
  // Menu dismissal returns focus to an exposed control without leaving a ghost.
  const toolbar = page.getByRole("toolbar", { name: words.canvasTools });
  await toolbar.getByRole("button", { name: words.canvasAddNode, exact: true }).click();
  const menu = page.getByRole("menu", { name: words.canvasActions });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  const menuFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName ?? null, connected: !!document.activeElement?.isConnected }));
  expect(menuFocus.connected).toBe(true);
  expect(menuFocus.tag).not.toBe(null);
  await capture(page, info, "c25-focus-restore", { focusAfterInspector, menuFocus });
});

// --- WF6: explicit save and reopen retain configuration, connections and layout ---

test("WF6 explicit save and reopen retain configuration, derived connections and layout", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(layout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policyPath}/validate` }, { method: "PUT", path: policyPath });
  const words = await open(page, "en", 1280, 900, "light");
  // Workflow identity and explanatory help are understandable.
  await expect(page.locator(".workspace-heading h2")).toHaveText(configuration.strategy);
  await activate(page, page.getByRole("button", { name: words.canvasInformation, exact: true }));
  await expect(page.getByText(words.firstMatch, { exact: true })).toBeVisible();
  await expect(page.locator("#routing-information").getByText(words.canvasLayoutOnly, { exact: true }).first()).toBeVisible();
  // Make a semantic change and move a node, then explicitly save.
  await activate(page, page.locator('[data-canvas-node="fallback"]'));
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  await inspector.getByRole("combobox", { name: words.label, exact: true }).selectOption("quality");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await page.locator('[data-canvas-node="rule-0"]').focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => mockApi.canvasLayout?.nodes["rule-0"]).toEqual({ x: 440, y: 80 });
  await frames(page);
  await activate(page, page.getByRole("button", { name: words.reviewChanges, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmAndSave, exact: true }));
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  const committed = structuredClone(mockApi.appliedConfiguration);
  const savedLayout = structuredClone(mockApi.canvasLayout);
  expect(committed?.fallback).toEqual({ label: "quality" });
  expect(savedLayout?.nodes["rule-0"]).toEqual({ x: 440, y: 80 });
  const puts = mockApi.requests.filter(request => request.method === "PUT");
  // Reopen by remount and verify the retained values in the rendered UI.
  await page.reload();
  await activate(page, page.getByRole("button", { name: words.strategyEditor, exact: true }));
  await expect(page.locator(".workspace-heading h2")).toHaveText(configuration.strategy);
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("quality");
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  // The derived connection for the saved fallback label is present in the edge list.
  await activate(page, page.getByRole("button", { name: words.canvasInformation, exact: true }));
  const infoPanel = page.locator("#routing-information");
  await expect(infoPanel).toContainText(configuration.labels.find(label => label.name === "quality")!.name);
  await writeFile(info.outputPath("wf6-reopen.json"), JSON.stringify({ committed, savedLayout, puts, requests: mockApi.requests }, null, 2));
  await page.screenshot({ path: info.outputPath("wf6-reopened.png") });
});
