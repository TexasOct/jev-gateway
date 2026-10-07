import { expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { test, state, type Fixture } from "../fixtures/dialog-regression";
import { configuredModelEdit, openProviderModels, providerModelGroup } from "../fixtures/open-provider-models";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

async function connect(page: Page, fixture: Fixture, locale: "en" | "zh-CN", scheme: "light" | "dark") {
  const m = locale === "en" ? en : zhCN;
  await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(`${fixture.origin}/dashboard/`);
  await page.locator("#gateway-api-key").fill("synthetic-dashboard-key");
  await page.locator("[data-connection-page] button[type=submit]").click();
  await openProviderModels(page, "fixture", { locale });
  await expect(providerModelGroup(page, "fixture").getByRole("region", { name: m.mmExisting, exact: true })).toBeVisible();
  return m;
}

async function draftValues(page: Page) {
  return page.getByRole("dialog").locator("fieldset").evaluate((fieldset) => [...fieldset.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")].map((control) => ({ id: control.id, type: control.type, value: control.value, checked: control instanceof HTMLInputElement ? control.checked : null })));
}

async function lockedEditorKeyboardFocus(page: Page) {
  const dialog = page.getByRole("dialog");
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let step = 0; step < 35; step++) {
      await page.keyboard.press(key);
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((element) => element.contains(document.activeElement) && !document.activeElement?.matches(":disabled"))).toBe(true);
    }
  }
}

for (const [width, locale, scheme] of [[320, "en", "light"], [320, "zh-CN", "dark"], [390, "en", "dark"], [390, "zh-CN", "light"], [1280, "en", "light"], [1280, "zh-CN", "dark"]] as const) {
  test(`web model guarded dismissal supplier-owned ${width} ${locale} ${scheme}`, async ({ page, fixture }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const m = await connect(page, fixture, locale, scheme);
    const initialFiles = fixture.bytes();
    const enclosingPrompts: string[] = [];
    page.on("dialog", async (prompt) => { enclosingPrompts.push(prompt.message()); await prompt.dismiss(); });
    const record = structuredClone(fixture.data.models[0]!);
    const trigger = configuredModelEdit(page, "fixture", "existing", locale);
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.locator("dialog")).toHaveCount(0);
    const name = dialog.getByLabel(m.mmDisplayName, { exact: true });
    const draft = "Owned edited full synthetic name";
    await name.fill(draft);
    const fullDraft = await draftValues(page);
    const snapshots: unknown[] = [];
    const validation = fixture.gate("POST", 400);
    await dialog.getByRole("button", { name: m.mmSave, exact: true }).click();
    await expect.poll(() => !!validation.receipt).toBe(true);
    await expect(name).toBeDisabled();
    await lockedEditorKeyboardFocus(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-state", "open");
    await expect(dialog.getByRole("button", { name: m.cancel, exact: true })).toBeDisabled();
    const pendingBounds = await dialog.boundingBox();
    await page.mouse.click(2, pendingBounds!.y + pendingBounds!.height / 2);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: m.mmDiscard, exact: true })).toHaveCount(0);
    snapshots.push({ phase: "held-validation", state: await state(page), files: fixture.bytes() });
    validation.release();
    await expect(name).toBeEnabled();
    await expect(name).toHaveValue(draft);
    expect(await draftValues(page)).toEqual(fullDraft);
    const dirtyBounds = await dialog.boundingBox();
    await page.mouse.click(2, dirtyBounds!.y + dirtyBounds!.height / 2);
    await expect(dialog.getByRole("button", { name: m.mmDiscard, exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: m.mmKeepEditing, exact: true }).click();
    await expect(name).toHaveValue(draft);
    expect(await draftValues(page)).toEqual(fullDraft);
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: m.mmKeepEditing, exact: true }).click();
    await expect(name).toHaveValue(draft);
    snapshots.push({ phase: "after-keep", state: await state(page) });
    await page.keyboard.press("Escape");
    snapshots.push({ phase: "third-escape", state: await state(page) });
    await info.attach("repeated-guarded-dismissal", { body: JSON.stringify(snapshots), contentType: "application/json" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-state", "open");
    await expect(dialog.getByRole("button", { name: m.mmDiscard, exact: true })).toBeVisible();
    for (let repeat = 0; repeat < 3; repeat++) {
      await dialog.getByRole("button", { name: m.mmKeepEditing, exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(dialog.getByRole("button", { name: m.mmDiscard, exact: true })).toBeVisible();
      await expect(name).toHaveValue(draft);
      expect(await draftValues(page)).toEqual(fullDraft);
    }
    const layout = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const footer = element.querySelector("footer")!.getBoundingClientRect();
      const body = element.querySelector("header + div")!;
      return { width: bounds.width, height: bounds.height, footerBottom: footer.bottom, footerTop: footer.top, overflow: element.scrollWidth > element.clientWidth, bodyScrolls: body.scrollHeight > body.clientHeight, bodyOverflow: getComputedStyle(body).overflowY, scheme: document.documentElement.dataset.scheme };
    });
    expect(layout.width).toBeLessThanOrEqual(width);
    expect(layout.height).toBeLessThanOrEqual(810);
    expect(layout.footerTop).toBeGreaterThanOrEqual(0);
    expect(layout.footerBottom).toBeLessThanOrEqual(900);
    expect(layout.overflow).toBe(false);
    expect(layout.bodyScrolls).toBe(true);
    expect(layout.bodyOverflow).toBe("auto");
    expect(layout.scheme).toBe(scheme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("dirty-consent.png") });
    await dialog.getByRole("button", { name: m.mmKeepEditing, exact: true }).click();
    const write = fixture.gate("PUT", 503);
    await dialog.getByRole("button", { name: m.mmSave, exact: true }).click();
    await expect.poll(() => !!write.receipt).toBe(true);
    await expect(name).toBeDisabled();
    await lockedEditorKeyboardFocus(page);
    const transactions = () => fixture.receipts.filter((r) => (r.path === "/v1/provider-configuration/validate" && r.method === "POST") || (r.path === "/v1/provider-configuration" && r.method === "PUT"));
    expect(transactions()).toHaveLength(3);
    const submitted = structuredClone(transactions());
    for (let repeat = 0; repeat < 4; repeat++) {
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await expect(name).toBeDisabled();
      await expect(dialog.getByRole("button", { name: m.mmDiscard, exact: true })).toHaveCount(0);
      expect(transactions()).toEqual(submitted);
      expect(fixture.bytes()).toEqual(initialFiles);
    }
    snapshots.push({ phase: "held-put", state: await state(page), transactions: structuredClone(transactions()), files: fixture.bytes() });
    write.release();
    await expect(name).toBeEnabled();
    await expect(name).toHaveValue(draft);
    expect(await draftValues(page)).toEqual(fullDraft);
    await expect(dialog.getByRole("alert")).toBeVisible();
    expect(fixture.data.models[0]).toEqual(record);
    expect(fixture.bytes()).toEqual(initialFiles);
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: m.mmKeepEditing, exact: true }).click();
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: m.mmKeepEditing, exact: true }).click();
    await name.fill(record.display_name!);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await name.fill(draft);
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: m.mmDiscard, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(fixture.bytes()).toEqual(initialFiles);
    await trigger.click();
    await name.fill("Saved owned model");
    await dialog.getByRole("button", { name: m.mmSave, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(transactions()).toHaveLength(5);
    expect(transactions().map((r) => [r.method, r.status])).toEqual([["POST", 400], ["POST", 200], ["PUT", 503], ["POST", 200], ["PUT", 200]]);
    expect(transactions()[1]!.body).toEqual(transactions()[2]!.body);
    expect(transactions()[3]!.body).toEqual(transactions()[4]!.body);
    expect(transactions()[2]!.body).toMatchObject({ expected_revision: "r1", operations: [{ action: "update_model", model_id: "fixture/existing", model: { upstream_model: "existing", provider: "fixture", display_name: draft, tags: record.tags, priority: record.priority, quality: record.quality, cost: { input_per_million: record.cost.input_per_million, output_per_million: record.cost.output_per_million }, capabilities: record.capabilities } }] });
    expect(fixture.data.models[0]).toMatchObject({ name: "fixture/existing", display_name: "Saved owned model", tags: record.tags, priority: record.priority, quality: record.quality });
    const finalFiles = fixture.bytes();
    expect(finalFiles["models.json"]).not.toBe(initialFiles["models.json"]);
    for (const file of Object.keys(initialFiles).filter((file) => file !== "models.json")) expect(finalFiles[file]).toBe(initialFiles[file]);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["jev-dashboard-locale"]);
    expect(enclosingPrompts).toEqual([]);
    writeFileSync(info.outputPath("web-dialog-proof.json"), JSON.stringify({ snapshots, final: await state(page), fullDraft, initialFiles, finalFiles, record, canonicalId: "fixture/existing", layout }, null, 2));
  });
}

test("supplier preview and configured row reuse one canonical model without dismissal writes", async ({ page, fixture }, info) => {
  fixture.data.models = [];
  await page.addInitScript(() => localStorage.setItem("jev-dashboard-locale", "en"));
  await page.goto(`${fixture.origin}/dashboard/`);
  await page.locator("#gateway-api-key").fill("synthetic-dashboard-key");
  await page.locator("[data-connection-page] button[type=submit]").click();
  const group = await openProviderModels(page, "fixture", { importModels: true });
  await page.getByRole("button", { name: en.pmDiscover, exact: true }).click();
  await page.getByRole("button", { name: en.pmSelectVisible, exact: true }).click();
  const preview = page.getByRole("region", { name: "fixture/existing", exact: true });
  const trigger = preview.getByRole("button", { name: en.mmEdit, exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(en.mmDisplayName, { exact: true }).fill("Preview draft");
  for (let repeat = 0; repeat < 4; repeat++) {
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("button", { name: en.mmDiscard, exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: en.mmKeepEditing, exact: true }).click();
    await expect(dialog.getByLabel(en.mmDisplayName, { exact: true })).toHaveValue("Preview draft");
  }
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: en.mmDiscard, exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(fixture.receipts.filter((r) => r.path.includes("provider-configuration") && r.method !== "GET")).toHaveLength(0);
  await trigger.click();
  await dialog.getByLabel(en.mmDisplayName, { exact: true }).fill("Owned imported model");
  for (const field of ["tools", "vision", "json_mode", "reasoning", "temperature"]) await dialog.locator(`#model-dialog-${field}`).selectOption("false");
  await dialog.locator("#model-dialog-reasoning_effort").fill("[]");
  await dialog.locator("#model-dialog-input_per_million").fill("1");
  await dialog.locator("#model-dialog-output_per_million").fill("2");
  await dialog.getByLabel(`${en.pmContext}: ${en.pmLimitUnknown}`, { exact: true }).check();
  await dialog.getByLabel(`${en.pmOutput}: ${en.pmLimitUnknown}`, { exact: true }).check();
  await dialog.getByRole("button", { name: en.mmSave, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(fixture.receipts.filter((r) => r.path.includes("provider-configuration") && r.method !== "GET")).toHaveLength(0);
  await page.getByLabel(en.pmConfirm, { exact: true }).check();
  await page.getByRole("button", { name: `${en.pmImport} (1)`, exact: true }).click();
  await expect.poll(() => fixture.data.models.length).toBe(1);
  const canonical = fixture.data.models[0]!.name;
  expect(canonical).toBe("fixture/existing");
  const list = group.getByRole("region", { name: en.mmExisting, exact: true });
  await list.getByRole("button", { name: en.mmEdit, exact: true }).click();
  await expect(dialog.getByLabel(en.mmDisplayName, { exact: true })).toHaveValue("Owned imported model");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const savedTrigger = configuredModelEdit(page, "fixture", "existing");
  await savedTrigger.click();
  await expect(dialog.getByLabel(en.mmUpstreamId, { exact: true })).toHaveValue("existing");
  await expect(dialog.getByLabel(en.mmDisplayName, { exact: true })).toHaveValue("Owned imported model");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(savedTrigger).toBeFocused();
  expect(fixture.receipts.filter((r) => r.path.includes("provider-configuration") && r.method !== "GET").map((r) => [r.method, r.status])).toEqual([["POST", 200], ["PUT", 200]]);
  writeFileSync(info.outputPath("canonical-entrances.json"), JSON.stringify({ canonical, state: await state(page) }, null, 2));
});

for (const removeModel of [false, true]) test(`model draft survives auth suspension with visible return focus, removed ${removeModel}`, async ({ page, fixture }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await connect(page, fixture, "en", "dark");
  const trigger = configuredModelEdit(page, "fixture", "existing");
  const search = providerModelGroup(page, "fixture").getByLabel(en.mmSearchConfigured, { exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByLabel(en.mmDisplayName, { exact: true });
  await name.fill("Retained after unauthorized save");
  const fullDraft = await draftValues(page);
  const initialFiles = fixture.bytes();
  const write = fixture.gate("PUT", 401);
  await dialog.getByRole("button", { name: en.mmSave, exact: true }).click();
  await expect.poll(() => !!write.receipt).toBe(true);
  write.release();
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
  await expect(page.locator(".app-shell")).toBeHidden();
  await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");
  const key = page.locator("#gateway-api-key");
  await expect(key).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(key).toBeFocused();
  expect(fixture.bytes()).toEqual(initialFiles);
  await page.screenshot({ path: info.outputPath("portal-absent-login.png") });
  if (removeModel) fixture.data.models = [];
  await key.fill("synthetic-dashboard-key");
  await page.locator("[data-connection-page] button[type=submit]").click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(name).toHaveValue("Retained after unauthorized save");
  expect(await draftValues(page)).toEqual(fullDraft);
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  if (removeModel) await expect(name).toBeDisabled();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: en.mmKeepEditing, exact: true }).click();
  await expect(name).toHaveValue("Retained after unauthorized save");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: en.mmDiscard, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(removeModel ? search : trigger).toBeFocused();
  expect(fixture.receipts.filter((receipt) => receipt.path.includes("provider-configuration") && receipt.method !== "GET").map((receipt) => [receipt.method, receipt.status])).toEqual([["POST", 200], ["PUT", 401]]);
  expect(fixture.bytes()).toEqual(initialFiles);
  writeFileSync(info.outputPath("auth-return-focus.json"), JSON.stringify({ removeModel, fullDraft, final: await state(page), files: fixture.bytes() }, null, 2));
});

test("saved rename returns focus to configured search when the initiating row leaves its filter", async ({ page, fixture }) => {
  await connect(page, fixture, "en", "light");
  const search = providerModelGroup(page, "fixture").getByLabel(en.mmSearchConfigured, { exact: true });
  await search.fill("Owned Alpha");
  const trigger = configuredModelEdit(page, "fixture", "existing");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(en.mmDisplayName, { exact: true }).fill("Renamed beyond the filter");
  await dialog.getByRole("button", { name: en.mmSave, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toHaveCount(0);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("Owned Alpha");
  expect(fixture.data.models[0]?.display_name).toBe("Renamed beyond the filter");
  expect(fixture.receipts.filter((receipt) => receipt.path.includes("provider-configuration") && receipt.method !== "GET").map((receipt) => [receipt.method, receipt.status])).toEqual([["POST", 200], ["PUT", 200]]);
});
