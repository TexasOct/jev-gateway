import { test, expect } from "./fixtures";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

for (const width of [1440, 390, 320]) for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
  test(`B shell and connection ${width}px ${locale} ${scheme}`, async ({ page, mockApi }, info) => {
    const words = locale === "en" ? en : zhCN;
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.addInitScript(value => localStorage.setItem("jev-dashboard-locale", value), locale);
    mockApi.themeSeed = "#856ca4";
    await page.goto("/dashboard/");
    const navigation = page.locator("[data-dashboard-view-nav]");
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("button")).toHaveCount(4);
    for (const name of [words.settings, words.providerModels, words.strategyEditor, words.monitoring]) {
      const action = navigation.getByRole("button", { name, exact: true });
      await action.focus();
      await page.keyboard.press("Enter");
      await expect(action).toHaveAttribute("aria-pressed", "true");
      await expect(action).toBeFocused();
      await expect.poll(() => action.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth && element.matches(":focus-visible");
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath("shell.png"), fullPage: true });
    await page.route("**/v1/**", route => route.fulfill({ status: 401, json: { error: { code: "invalid_api_key", message: "Synthetic unauthorized" } } }));
    await page.reload();
    const input = page.locator("#gateway-api-key");
    await expect(input).toBeEnabled();
    await expect(page.locator("[data-dashboard-view-nav]")).toHaveCount(0);
    await expect(input).toHaveAttribute("data-slot", "input");
    await expect(page.getByRole("combobox", { name: words.language, exact: true })).toHaveAttribute("data-slot", "native-select");
    await expect(input).toHaveCSS("height", "44px");
    await input.focus();
    await page.keyboard.press("Tab");
    const submit = page.getByRole("button", { name: words.connect, exact: true });
    await expect(submit).toBeFocused();
    await expect(page.getByRole("alert").locator('[data-slot="alert-description"]')).toBeVisible();
    expect(await page.getByRole("alert").evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(150);
    expect(await submit.evaluate(element => element.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(input).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("connection.png"), fullPage: true });
    expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout")).toEqual([]);
  });
}
