import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { configuredModelEdit, openProviderModels } from "../fixtures/open-provider-models";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";
import { en } from "../../src/shared/i18n/en";

test("model dialog focus handoff and clean workflow navigation make no layout writes", async ({ page, context, mockApi }, info) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  const requests: { method: string; path: string }[] = [];
  page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith("/v1/")) requests.push({ method: request.method(), path }); });
  mockApi.canvasLayout = { version: 1, nodes: { "rule-0": { x: 420, y: 80 } }, viewport: { x: 0, y: 0 } };
  const saved = structuredClone(mockApi.canvasLayout);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard/");
  await openProviderModels(page, "fixture");
  const trigger = configuredModelEdit(page, "fixture", "existing");
  await trigger.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const exposed = await trigger.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { rect: rect.toJSON(), hit: el.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)), connected: el.isConnected };
  });
  expect(exposed.hit).toBe(true); expect(exposed.connected).toBe(true);
  const strategy = page.getByRole("button", { name: en.strategyEditor, exact: true });
  await strategy.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await expect(page.getByRole("button", { name: en.settings, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: en.settings, exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator("[data-settings-language]")).toBeVisible();
  await strategy.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  expect(requests.filter(request => request.method !== "GET")).toEqual([]);
  expect(requests.filter(request => request.path === "/v1/dashboard/canvas-layout")).toEqual([{ method: "GET", path: "/v1/dashboard/canvas-layout" }, { method: "GET", path: "/v1/dashboard/canvas-layout" }]);
  expect(mockApi.canvasLayout).toEqual(saved); expect(state.writes).toEqual([]);
  await writeFile(info.outputPath("handoff-navigation.json"), JSON.stringify({ exposed, requests, saved }, null, 2));
  await page.screenshot({ path: info.outputPath("workflow-reopened.png") });
});

test("dirty model keeps its input on cancelled dismissal and exposes its trigger after discard", async ({ page, context, mockApi }, info) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  const requests: { method: string; path: string }[] = [];
  page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith("/v1/")) requests.push({ method: request.method(), path }); });
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto("/dashboard/");
  await openProviderModels(page, "fixture");
  const trigger = configuredModelEdit(page, "fixture", "existing");
  await trigger.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog"), name = dialog.getByLabel(en.mmDisplayName, { exact: true });
  await name.focus(); await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.type("Retained dirty model name");
  await page.keyboard.press("Escape");
  await expect(dialog.getByText(en.mmDiscardQuestion, { exact: true })).toBeVisible();
  const tabTo = async (target: import("@playwright/test").Locator) => {
    const reverse = await target.evaluate(el => !!(el.compareDocumentPosition(document.activeElement!) & Node.DOCUMENT_POSITION_FOLLOWING));
    for (let i = 0; i < 80 && !(await target.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press(reverse ? "Shift+Tab" : "Tab");
    await expect(target).toBeFocused();
    expect(await target.evaluate(el => { const rect = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)); })).toBe(true);
  };
  await tabTo(dialog.getByRole("button", { name: en.mmKeepEditing, exact: true })); await page.keyboard.press("Enter");
  await expect(name).toHaveValue("Retained dirty model name"); await expect(dialog.getByText(en.mmDiscardQuestion, { exact: true })).toHaveCount(0);
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await tabTo(dialog.getByRole("button", { name: en.mmDiscard, exact: true })); await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  const focus = await trigger.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { bounds: rect.toJSON(), visible: el.matches(":focus-visible"), hit: el.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) };
  });
  expect(focus.visible).toBe(true); expect(focus.hit).toBe(true);
  expect(requests.filter(request => request.method !== "GET")).toEqual([]); expect(state.writes).toEqual([]); expect(mockApi.canvasWrites ?? []).toEqual([]);
  await writeFile(info.outputPath("dirty-model-handoff.json"), JSON.stringify({ focus, requests, snapshot: state.configuration }, null, 2));
  await page.screenshot({ path: info.outputPath("dirty-model-return-focus.png") });
});
