import { test, expect } from "@playwright/test";
import chroma from "chroma-js";

for (const scheme of ["light", "dark"]) for (const width of [1440, 390, 320]) {
  test(`primitive native compatibility ${scheme} ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`tests/browser/primitives.html?scheme=${scheme}`);
    const input = page.getByLabel("Price / 价格");
    const select = page.getByLabel("Capability / 能力");
    await expect(input).toHaveValue("");
    await page.getByRole("button", { name: "Focus input", exact: true }).click();
    await expect(input).toBeFocused();
    await input.fill("19");
    await expect(page.getByTestId("events")).toHaveText("INPUT:19");
    await input.fill("");
    await page.getByRole("button", { name: "Focus select", exact: true }).click();
    await expect(select).toBeFocused();
    for (const value of ["true", "false", "", "null"]) {
      await select.selectOption(value);
      await expect(select).toHaveValue(value);
      await expect(page.getByTestId("events")).toHaveText(`SELECT:${value}`);
    }
    await page.keyboard.press("y");
    await page.keyboard.press("Tab");
    await expect(select).toHaveValue("true");
    const checkbox = page.getByRole("checkbox", { name: "Review", exact: true });
    expect(await checkbox.evaluate((element) => (element as HTMLInputElement).indeterminate)).toBe(true);
    await page.getByRole("button", { name: "Focus review", exact: true }).click();
    await expect(checkbox).toBeFocused();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await expect(page.getByTestId("events")).toHaveText("INPUT:true");
    await expect(page.getByTestId("submissions")).toHaveText("0");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByTestId("submissions")).toHaveText("1");
    expect(JSON.parse(await page.getByTestId("values").innerText())).toEqual({ draft: "", capability: "true", instructions: "raw instructions", review: "accepted" });
    await expect(page.getByLabel("Disabled field")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Disabled action", exact: true })).toBeDisabled();
    await input.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("submissions")).toHaveText("2");
    await select.focus();
    const geometry = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('[data-slot="input"]')!;
      const select = document.querySelector<HTMLSelectElement>('select')!;
      const icon = document.querySelector<SVGElement>('[data-slot="native-select-icon"]')!;
      const s = getComputedStyle(select), i = getComputedStyle(input);
      const badge = getComputedStyle(document.querySelector('[data-slot="badge"]')!);
      return { inputHeight: input.getBoundingClientRect().height, selectHeight: select.getBoundingClientRect().height, backgroundImage: s.backgroundImage, paddingRight: s.paddingRight, arrowInset: select.getBoundingClientRect().right - icon.getBoundingClientRect().right, arrowColor: getComputedStyle(icon).color, color: s.color, outline: s.outlineStyle, invalidBorder: i.borderColor, destructive: getComputedStyle(document.documentElement).getPropertyValue('--bad').trim(), badgeColor: badge.color, badgeBackground: badge.backgroundColor, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.inputHeight).toBe(44); expect(geometry.selectHeight).toBe(44);
    expect(geometry.backgroundImage).toBe("none"); expect(parseFloat(geometry.paddingRight)).toBeGreaterThanOrEqual(32);
    expect(geometry.arrowInset).toBeGreaterThanOrEqual(12); expect(geometry.arrowColor).toBe(geometry.color);
    expect(geometry.outline).toBe("solid"); expect(geometry.overflow).toBe(false);
    expect(chroma(geometry.invalidBorder).hex()).toBe(chroma(geometry.destructive).hex());
    expect(chroma.contrast(geometry.badgeColor, geometry.badgeBackground)).toBeGreaterThanOrEqual(4.5);
    await testInfo.attach("geometry", { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath("controls.png"), fullPage: true });
    await page.emulateMedia({ forcedColors: "active" });
    await expect(page.locator('[data-slot="native-select-icon"]')).toBeHidden();
    expect(await select.evaluate((element) => getComputedStyle(element).appearance)).toBe("auto");
  });
}
