import { test, expect } from "./fixtures";

async function openSettings(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/");
  await expect(page.locator('header button[aria-label="Refresh"]')).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}

test("preset selection auto-saves the chosen seed exactly once", async ({ page, mockApi }) => {
  mockApi.allowedWrites.push({ method: "PUT", path: "/v1/dashboard/theme" });
  await openSettings(page);
  await page.getByRole("button", { name: "Green #16856b" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Theme seed saved." })).toBeVisible();
  await expect.poll(() => mockApi.allowedWrites.filter(({ method, path }) => method === "PUT" && path === "/v1/dashboard/theme").length).toBe(1);
  expect(mockApi.allowedWrites.find(({ method }) => method === "PUT")?.body).toEqual({ version: 1, seed: "#16856b" });
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout" && !mockApi.allowedWrites.some((write) => write.method === method && write.path === path))).toEqual([]);
});

test("native color picker input previews are committed through the change event", async ({ page, mockApi }) => {
  mockApi.allowedWrites.push({ method: "PUT", path: "/v1/dashboard/theme" });
  await openSettings(page);
  const picker = page.getByLabel("Choose color");
  await expect(picker.locator("..")).toHaveAttribute("data-selected", "false");
  await picker.evaluate((input: HTMLInputElement) => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "#234567");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(picker).toHaveValue("#234567");
  expect(mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/dashboard/theme")).toHaveLength(0);
  await picker.evaluate((input: HTMLInputElement) => input.dispatchEvent(new Event("change", { bubbles: true })));
  await expect(page.getByRole("status").filter({ hasText: "Theme seed saved." })).toBeVisible();
  await expect.poll(() => mockApi.allowedWrites.filter(({ method }) => method === "PUT").length).toBe(1);
  expect(mockApi.allowedWrites.find(({ method }) => method === "PUT")?.body).toEqual({ version: 1, seed: "#234567" });
  await expect(picker.locator("..")).toHaveAttribute("data-selected", "true");
  await expect(page.locator('[aria-pressed="true"]').filter({ has: page.locator("svg.lucide-check") })).toHaveCount(0);
  const customStyle = await picker.locator("..").evaluate((element) => getComputedStyle(element).boxShadow);
  expect(customStyle).not.toBe("none");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(picker).toHaveValue("#234567");
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 1430, height: 2511 }, { width: 390, height: 820 }, { width: 320, height: 820 }]) {
  test(`has no settings document-level horizontal overflow at ${viewport.width}x${viewport.height} in English and Chinese`, async ({ page, mockApi }, testInfo) => {
    await page.setViewportSize(viewport);
    await openSettings(page);
    for (const scheme of ["light", "dark"]) {
      await page.locator('select[aria-label="Color scheme"], select[aria-label="配色方案"]').selectOption(scheme);
      for (const locale of ["en", "zh-CN"]) {
        await page.locator('select[aria-label="Language"], select[aria-label="语言"]').selectOption(locale);
        mockApi.themeSeed = "#3b66d9";
        await page.getByRole("button", { name: locale === "en" ? "Settings" : "通用设置", exact: true }).click();
        await expect(page.locator('input[type="color"]')).toHaveValue("#3b66d9");
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const settings = page.locator('main > section[aria-label="Settings"], main > section[aria-label="通用设置"]');
        const bounds = await settings.boundingBox();
        expect(bounds).not.toBeNull();
        if (viewport.width >= 768) {
          expect(bounds!.width).toBeLessThanOrEqual(768);
          expect(Math.abs((viewport.width - bounds!.width) / 2 - bounds!.x)).toBeLessThanOrEqual(2);
        } else {
          expect(bounds!.width).toBeLessThanOrEqual(viewport.width);
          expect(bounds!.width).toBeGreaterThan(viewport.width - 40);
        }
        await expect(page.locator("html")).toHaveAttribute("data-scheme", scheme);
        expect(await page.evaluate(() => localStorage.getItem("jev-dashboard-locale"))).toBe(locale);
        const colors = page.getByRole("group", { name: locale === "en" ? "Theme color" : "主题颜色", exact: true });
        const presets = colors.getByRole("button");
        await expect(presets).toHaveCount(3);
        await expect(colors.locator("svg.lucide-check")).toHaveCount(0);
        await expect(colors.locator("svg.lucide-pencil")).toHaveCount(1);
        const circles = await colors.locator("button, [data-custom-color]").evaluateAll((elements) => elements.map((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return { width: box.width, height: box.height, radius: style.borderRadius, border: style.borderTopWidth, shadow: style.boxShadow, background: style.backgroundImage };
        }));
        for (const circle of circles) {
          expect(circle.width).toBe(36);
          expect(circle.height).toBe(36);
          expect(Number.parseFloat(circle.radius)).toBeGreaterThanOrEqual(18);
        }
        expect(circles[0]?.border).toBe("0px");
        expect(circles[0]?.shadow).toContain("2px");
        expect(circles[0]?.shadow).toContain("4px");
        expect(circles[1]?.shadow).toBe("none");
        expect(circles[3]?.background).toContain("conic-gradient");
        const picker = colors.locator('input[type="color"]');
        await presets.last().focus();
        await page.keyboard.press("Tab");
        await expect(picker).toBeFocused();
        const focus = await picker.locator("..").evaluate((element) => ({ width: getComputedStyle(element).outlineWidth, style: getComputedStyle(element).outlineStyle }));
        expect(focus).toEqual({ width: "2px", style: "solid" });
        await picker.evaluate((input: HTMLInputElement) => input.blur());
        await page.screenshot({ path: testInfo.outputPath(`settings-${viewport.width}-${locale}-${scheme}.png`), fullPage: true });
        mockApi.themeSeed = "#234567";
        await page.getByRole("button", { name: locale === "en" ? "Settings" : "通用设置", exact: true }).click();
        await expect(picker).toHaveValue("#234567");
        await expect(picker.locator("..")).toHaveAttribute("data-selected", "true");
        const selectedStyle = await picker.locator("..").evaluate((element) => {
          const style = getComputedStyle(element);
          return { shadow: style.boxShadow, accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() };
        });
        expect(selectedStyle.shadow).toContain("2px");
        expect(selectedStyle.shadow).toContain("4px");
        expect(selectedStyle.accent).not.toBe("");
        await expect(colors.locator('button[aria-pressed="true"]')).toHaveCount(0);
        await picker.focus();
        await expect(picker).toBeFocused();
        await picker.evaluate((input: HTMLInputElement) => input.blur());
        await page.screenshot({ path: testInfo.outputPath(`settings-custom-${viewport.width}-${locale}-${scheme}.png`), fullPage: true });
      }
    }
  });
}
