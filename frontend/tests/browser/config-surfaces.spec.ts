import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";
import { openProviderModels } from "../fixtures/open-provider-models";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import type { Locator, Page, TestInfo } from "@playwright/test";

async function capture(page: Page, owner: Locator, name: string, info: TestInfo) {
  await expect(owner).toBeVisible();
  await info.attach(`${name}-geometry`, { contentType: "application/json", body: JSON.stringify(await owner.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, scrollWidth: element.scrollWidth, viewport: innerWidth, overflow: [...element.querySelectorAll("*")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { tag: node.tagName, text: node.textContent?.slice(0, 100), className: node.getAttribute("class"), right: rect.right, width: rect.width };
    }).filter((node) => node.right > innerWidth) };
  }), null, 2) });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await owner.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

for (const { width, locale, scheme } of [
  { width: 320, locale: "en", scheme: "dark" },
  { width: 390, locale: "zh-CN", scheme: "light" },
] as const) {
  for (const readOnly of [false, true]) test(`B model states ${width}px ${locale} ${scheme} readonly ${readOnly}`, async ({ page, context }, info) => {
    const text = locale === "en" ? en : zhCN;
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.addInitScript((language) => localStorage.setItem("jev-dashboard-locale", language), locale);
    const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
    state.configuration.write_available = !readOnly;
    await installProviderFixture(context, state);
    await page.goto("/dashboard/");
    const models = await openProviderModels(page, "fixture", { locale });
    const trigger = models.getByRole("button", { name: text.mmEdit, exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    const save = dialog.getByRole("button", { name: text.mmSave, exact: true });
    if (readOnly) {
      await expect(save).toBeDisabled();
      await capture(page, dialog, "model-readonly", info);
      await dialog.getByRole("button", { name: text.cancel, exact: true }).click();
      await expect(trigger).toBeFocused();
      expect(state.writes).toEqual([]);
    } else {
      await dialog.getByLabel(text.mmDisplayName, { exact: true }).fill("Retained / 失败后保留的模型名称");
      let release!: () => void;
      state.delayWrite = () => new Promise<void>((resolve) => { release = resolve; });
      state.rejectWrite = 503;
      await save.click();
      await expect.poll(() => state.writes.length).toBe(1);
      await expect(dialog.getByRole("button", { name: text.loading, exact: true })).toBeDisabled();
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement) && !document.activeElement?.matches(":disabled"))).toBe(true);
      await capture(page, dialog, "model-pending", info);
      release();
      await expect(dialog.getByRole("alert")).toBeVisible();
      await expect(dialog.getByLabel(text.mmDisplayName, { exact: true })).toHaveValue("Retained / 失败后保留的模型名称");
      await capture(page, dialog, "model-failed-save", info);
      await page.keyboard.press("Escape");
      await dialog.getByRole("button", { name: text.mmKeepEditing, exact: true }).click();
      await page.keyboard.press("Escape");
      await dialog.getByRole("button", { name: text.mmDiscard, exact: true }).click();
      await expect(trigger).toBeFocused();
      expect(state.writes).toHaveLength(1);
      expect(state.configuration.models[0]!.display_name).toBeNull();
    }
  });
}

for (const width of [1440, 390, 320]) for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
  test(`B configuration surfaces ${width}px ${locale} ${scheme}`, async ({ page, context }, info) => {
    const text = locale === "en" ? en : zhCN;
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.addInitScript((language) => localStorage.setItem("jev-dashboard-locale", language), locale);
    const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
    state.configuration.providers[0]!.display_name = "OpenAI production / 团队供应商 / long supplier connection name";
    const base = state.configuration.models[0]!;
    state.configuration.models = Array.from({ length: 8 }, (_, index) => ({ ...structuredClone(base), upstream_model: `model-${index}`, name: `fixture/model-${index}`, display_name: `Long model ${index} / 多语言模型名称 / production-model-with-long-name` }));
    await installProviderFixture(context, state);
    await context.route("**/v1/dashboard/theme", (route) => route.fulfill({ json: { version: 1, seed: "#d9aa39" } }));
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: text.settings, exact: true }).click();
    const settings = page.getByRole("region", { name: text.appearance, exact: true }).locator("..");
    expect(await settings.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(768);
    await expect(page.locator("html")).toHaveAttribute("data-scheme", scheme);
    await expect(page.locator("[data-custom-color]")).toHaveAttribute("data-selected", "true");
    await capture(page, settings, "settings-custom", info);
    await page.getByRole("button", { name: text.providerModels, exact: true }).click();
    const suppliers = page.getByRole("region", { name: text.spConnections, exact: true });
    expect(await suppliers.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(768);
    await capture(page, suppliers, "supplier-list", info);
    await page.locator('[data-provider-edit="fixture"]').click();
    await capture(page, suppliers, "supplier-editor", info);
    const transport = page.getByRole("combobox", { name: text.pmType, exact: true });
    await transport.focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const bounds = element.getBoundingClientRect();
      return element.matches(":focus-visible") && bounds.width > 0 && bounds.left >= 0 && bounds.right <= innerWidth;
    })).toBe(true);
    const models = await openProviderModels(page, "fixture", { locale });
    await capture(page, models, "configured-models", info);
    const trigger = models.getByRole("button", { name: text.mmEdit, exact: true }).nth(7);
    await trigger.scrollIntoViewIfNeeded();
    await expect(trigger).toBeInViewport();
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await capture(page, dialog, "model-editor", info);
    const field = dialog.locator("#model-dialog-tools");
    await expect(field).toHaveAccessibleName(text.pmTools);
    await field.focus();
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await dialog.getByRole("button", { name: text.cancel, exact: true }).click();
    await expect(trigger).toBeFocused();
    await openProviderModels(page, "fixture", { locale, importModels: true });
    const manual = models.getByLabel(text.pmManual, { exact: true });
    for (let index = 0; index < 5; index++) {
      await manual.fill(`dense-candidate-${index}-长模型名称-with-long-upstream-id`);
      await models.getByRole("button", { name: text.pmManualAdd, exact: true }).click();
    }
    await models.getByText(`${text.pmBatch} (5)`, { exact: true }).click();
    await capture(page, models, "dense-import", info);
    const confirm = models.getByLabel(text.pmConfirm, { exact: true });
    await confirm.scrollIntoViewIfNeeded();
    await expect(confirm).toBeInViewport();
    await expect(confirm).toBeDisabled();
    expect(state.writes).toEqual([]);
    expect(state.validations).toEqual([]);
    expect(state.selectors).toEqual([]);
  });
}
