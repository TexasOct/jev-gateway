import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { Page, Locator } from "@playwright/test";

const before = process.env.SELECT_CAPTURE_BEFORE === "1";
const labels = {
  en: { nav: "Provider & models", edit: "Edit", decision: "Decision providers", transport: "Transport", protocol: "Decision protocol", endpoint: "Endpoint URL", credential: "Credential action", native: "Use the transport's default endpoint" },
  "zh-CN": { nav: "Provider 与模型配置", edit: "编辑", decision: "决策供应商", transport: "传输类型", protocol: "决策协议", endpoint: "端点 URL", credential: "凭证操作", native: "使用传输类型的默认端点" },
};

async function geometry(control: Locator) {
  return control.evaluate((element) => {
    const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, appearance: style.appearance, paddingRight: style.paddingRight, backgroundImage: style.backgroundImage, backgroundPosition: style.backgroundPosition, backgroundSize: style.backgroundSize, backgroundRepeat: style.backgroundRepeat, color: style.color, backgroundColor: style.backgroundColor };
  });
}

async function chooseWithKeyboard(page: Page, control: Locator, initial: string) {
  await page.keyboard.press("Tab");
  await control.focus();
  await page.keyboard.press(initial);
}

async function setup(page: Page, context: import("@playwright/test").BrowserContext, locale: keyof typeof labels) {
  const state = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  const unexpected: string[] = [];
  // These controls must never invoke even a synthetic mutation or discovery API.
  await context.route("**/v1/**", async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.abort("blockedbyclient");
  });
  await page.addInitScript((language) => localStorage.setItem("jev-dashboard-locale", language), locale);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: labels[locale].nav, exact: true }).click();
  return { state, unexpected };
}

for (const width of [320, 390, 1280, 1701, 1920]) for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
  test(`native select geometry ${width}px ${locale} ${scheme}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    const { state, unexpected } = await setup(page, context, locale); const text = labels[locale];
    const measurements = [];
    for (const kind of ["llm", "decision"] as const) {
      if (kind === "decision") await page.getByRole("button", { name: text.decision, exact: true }).click();
      await page.getByRole("button", { name: text.edit, exact: true }).click();
      const select = page.getByRole("combobox", { name: kind === "llm" ? text.transport : text.protocol, exact: true });
      const endpoint = page.getByLabel(text.endpoint, { exact: true });
      await expect(select).toBeVisible(); await expect(endpoint).toBeVisible();
      if (kind === "llm") await expect(page.getByLabel(text.native, { exact: true })).toBeVisible();
      const selected = await geometry(select); const input = await geometry(endpoint);
      measurements.push({ kind, selected, input, topDifference: selected.y - input.y, heightDifference: selected.height - input.height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator("html")).toHaveAttribute("data-scheme", scheme);
      if (!before) {
        for (const control of await page.locator('select:not([multiple]):not([size]), select:not([multiple])[size="1"]').all()) {
          const style = await geometry(control);
          expect(style.appearance).toBe("none"); expect(parseFloat(style.paddingRight)).toBeGreaterThanOrEqual(32);
          expect(style.backgroundImage).toContain("linear-gradient");
          expect(style.backgroundImage).toContain(style.color);
          expect(style.backgroundPosition).toBe("calc(100% - 17px) 50%, calc(100% - 12px) 50%");
          expect(style.backgroundSize).toBe("5px 5px, 5px 5px");
          expect(style.backgroundRepeat).toBe("no-repeat, no-repeat");
        }
        if (width >= 1280) {
          expect(Math.abs(selected.y - input.y)).toBeLessThanOrEqual(1);
          expect(Math.abs(selected.height - input.height)).toBeLessThanOrEqual(1);
          expect(selected.height).toBe(44);
        }
      }
      await page.screenshot({ path: testInfo.outputPath(`${kind}.png`), fullPage: true });
      await page.keyboard.press("Escape");
    }
    await testInfo.attach("geometry", { body: JSON.stringify({ phase: before ? "before" : "after", width, locale, scheme, measurements }, null, 2), contentType: "application/json" });
    expect(state.writes).toEqual([]); expect(state.validations).toEqual([]); expect(state.selectors).toEqual([]); expect(unexpected).toEqual([]);
  });
}

test("native keyboard, focus, disabled and listbox/forced-colors fallback", async ({ page, context }, testInfo) => {
  test.skip(before, "Baseline capture only");
  const { state, unexpected } = await setup(page, context, "en");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const transport = page.getByRole("combobox", { name: "Transport", exact: true });
  await chooseWithKeyboard(page, transport, "a");
  await expect(transport).toHaveValue("anthropic"); await expect(transport).toBeFocused();
  expect(await transport.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  await chooseWithKeyboard(page, transport, "o"); await expect(transport).toHaveValue("openai");
  const credential = page.getByRole("combobox", { name: "Credential action", exact: true });
  await chooseWithKeyboard(page, credential, "s");
  await expect(credential).toHaveValue("set"); await expect(page.getByLabel("New provider credential", { exact: true })).toBeVisible();
  await chooseWithKeyboard(page, credential, "k"); await expect(credential).toHaveValue("keep");
  await credential.evaluate((el) => { (el as HTMLSelectElement).disabled = true; });
  await expect(credential).toBeDisabled(); await transport.focus(); await page.keyboard.press("Tab");
  await expect(credential).not.toBeFocused(); await expect(credential).toHaveValue("keep");
  await credential.evaluate((el) => { (el as HTMLSelectElement).disabled = false; });
  await page.evaluate(() => {
    const host = document.createElement("div"); host.id = "select-fallback-fixture";
    for (const [id, multiple, size] of [["multiple", true, 0], ["listbox", false, 3], ["single", false, 1], ["zero", false, 0]] as const) {
      const select = document.createElement("select"); select.id = id; select.multiple = multiple; select.size = size;
      select.innerHTML = '<option>First</option><option>Second</option><option>Third</option>'; host.append(select);
    }
    document.body.append(host);
  });
  for (const id of ["multiple", "listbox"]) {
    const style = await geometry(page.locator(`#${id}`)); expect(style.appearance).toBe("auto"); expect(style.backgroundImage).toBe("none");
  }
  for (const id of ["single", "zero"]) expect((await geometry(page.locator(`#${id}`))).appearance).toBe("none");
  await page.emulateMedia({ forcedColors: "active" });
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  for (const select of [transport, credential, page.locator("#single"), page.locator("#zero"), page.locator("#listbox"), page.locator("#multiple")]) {
    const style = await geometry(select); expect(style.appearance).toBe("auto"); expect(style.backgroundImage).toBe("none");
  }
  await chooseWithKeyboard(page, transport, "a"); await expect(transport).toHaveValue("anthropic");
  await page.screenshot({ path: testInfo.outputPath("forced-colors.png"), fullPage: true });
  await page.emulateMedia({ forcedColors: "none" }); expect((await geometry(transport)).appearance).toBe("none");
  expect(state.writes).toEqual([]); expect(state.validations).toEqual([]); expect(state.selectors).toEqual([]); expect(unexpected).toEqual([]);
});
