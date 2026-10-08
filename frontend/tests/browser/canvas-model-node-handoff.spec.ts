import { writeFile } from "node:fs/promises";
import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

const layout = { version: 1 as const, nodes: { questions: { x: 50, y: 80 }, "rule-0": { x: 350, y: 80 }, fallback: { x: 350, y: 300 }, "model::fixture/existing": { x: 700, y: 80 } }, viewport: { x: 0, y: 0 } };

async function frames(page: import("@playwright/test").Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function openStrategy(page: import("@playwright/test").Page, words: typeof en) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
}

async function modelNode(page: import("@playwright/test").Page) {
  const node = page.locator('[data-canvas-node="model::fixture/existing"]');
  await expect(node).toBeVisible();
  await node.scrollIntoViewIfNeeded();
  await frames(page);
  return node;
}

async function exposed(node: import("@playwright/test").Locator) {
  return node.evaluate((el) => { const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + 18; return { x, y, bounds: b.toJSON(), hit: el.contains(document.elementFromPoint(x, y)), connected: el.isConnected }; });
}

// The model node must open the one shared webpage model editor Dialog bound to
// its exact provider/model identity. Read-only inspection writes nothing.
test("strategy model node opens the shared model Dialog bound to its exact identity", async ({ page, context }, info) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [], canvasLayout: structuredClone(layout) };
  await installProviderFixture(context, state);
  const requests: { method: string; path: string }[] = [];
  page.on("request", (request) => requests.push({ method: request.method(), path: new URL(request.url()).pathname }));
  await openStrategy(page, en);
  const node = await modelNode(page);
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
  expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  expect(state.writes).toEqual([]);
  expect(state.canvasWrites ?? []).toEqual([]);
  expect(state.canvasLayout).toEqual(saved);
  const returned = await exposed(node);
  expect(returned.hit).toBe(true); expect(returned.connected).toBe(true);
  await expect(node).toBeFocused();
  await writeFile(info.outputPath("handoff-identity.json"), JSON.stringify({ before, returned, requests, saved }, null, 2));
  await page.screenshot({ path: info.outputPath("handoff-returned-focus.png") });
});

for (const [locale, width, scheme] of [["en", 390, "light"], ["zh-CN", 320, "dark"]] as const) {
  test(`dirty model draft blocks dismissal and returns focus ${locale} ${width} ${scheme}`, async ({ page, context }, info) => {
    const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [], canvasLayout: structuredClone(layout) };
    await installProviderFixture(context, state);
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/dashboard/");
    if (locale === "zh-CN") { await page.getByRole("button", { name: en.settings, exact: true }).click(); await page.locator("[data-settings-language]").selectOption(locale); }
    const words = locale === "en" ? en : zhCN;
    await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
    const node = await modelNode(page);
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
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: words.mmDiscard, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await frames(page);
    expect(state.writes).toEqual([]); expect(state.canvasWrites ?? []).toEqual([]);
    const returned = await exposed(node);
    expect(returned.hit).toBe(true); expect(returned.connected).toBe(true);
    await writeFile(info.outputPath("dirty-draft-returned.json"), JSON.stringify({ at, returned, writes: state.writes }, null, 2));
    await page.screenshot({ path: info.outputPath("dirty-draft-returned.png") });
  });
}

test("pending model write blocks dismissal and failed save retains the draft", async ({ page, context }, info) => {
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [], canvasLayout: structuredClone(layout), delayWrite: () => gate, rejectWrite: 503 };
  await installProviderFixture(context, state);
  await openStrategy(page, en);
  const node = await modelNode(page);
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
});
