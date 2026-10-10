import { expect, type Page } from "@playwright/test";

type Locale = "en" | "zh-CN";

type ModelEntryOptions = { locale?: Locale; importModels?: boolean };

export function providerModelGroup(page: Page, providerId: string) {
  return page.locator(`[data-provider-models=${JSON.stringify(providerId)}]`);
}

export async function openProviderModels(page: Page, providerId: string, { locale = "en", importModels = false }: ModelEntryOptions = {}) {
  const suppliers = page.locator("[data-dashboard-view-nav]").getByRole("button", { name: locale === "en" ? "Suppliers" : "供应商", exact: true });
  if (await suppliers.getAttribute("aria-pressed") !== "true") await suppliers.click();
  const group = providerModelGroup(page, providerId);
  if (!await group.isVisible()) {
    const current = page.locator(`[data-provider-editor=${JSON.stringify(providerId)}]`);
    if (!await current.isVisible()) {
      if (await page.locator("[data-provider-editor]").isVisible()) {
        await page.getByRole("button", { name: locale === "en" ? "Cancel" : "取消", exact: true }).first().click();
      }
      await page.locator(`[data-provider-edit=${JSON.stringify(providerId)}][data-provider-kind="llm"]`).click();
    }
    await page.getByRole("button", { name: locale === "en" ? "Model settings" : "模型配置", exact: true }).click();
  }
  await expect(group).toBeVisible();
  if (importModels) {
    const summary = group.locator("summary").filter({ hasText: locale === "en" ? /^Discover and import models$/ : /^发现与导入模型$/ });
    const disclosure = summary.locator("..");
    if (await disclosure.getAttribute("open") === null) await summary.click();
    await expect(disclosure).toHaveAttribute("open", "");
  }
  return group;
}

export function configuredModelEdit(page: Page, providerId: string, upstreamModel: string, locale: Locale = "en") {
  const models = providerModelGroup(page, providerId).getByRole("region", { name: locale === "en" ? "Configured models" : "已配置模型", exact: true });
  const record = models.locator(":scope > div").filter({ has: page.getByText(upstreamModel, { exact: true }) });
  return record.getByRole("button", { name: locale === "en" ? "Edit model" : "编辑模型", exact: true });
}
