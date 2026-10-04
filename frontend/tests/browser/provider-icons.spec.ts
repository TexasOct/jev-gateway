import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";
import type { BrowserContext, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const sources = JSON.parse(readFileSync(new URL("../../src/features/providers/assets/sources.json", import.meta.url), "utf8")) as { deepseek: { sha256: string }; icons: Record<string, { sha256: string }> };

const csp = "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
function fixture(): ProviderFixtureState { return { configuration: providerFixture(), writes: [], validations: [], selectors: [] }; }
async function install(context: BrowserContext, state: ProviderFixtureState) {
  await installProviderFixture(context, state);
  await context.route("**/dashboard/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": csp } });
  });
}
async function open(page: Page) {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Provider & models", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture provider", exact: true })).toBeVisible();
}
function picker(page: Page) { return page.locator("[data-provider-icon-picker]"); }
async function edit(page: Page) {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(picker(page)).toBeVisible();
  await picker(page).getByRole("button", { name: "Choose icon", exact: true }).click();
}

for (const kind of ["llm", "decision"] as const) {
  test(`${kind} old custom instance freely chooses, saves, reads, resets and cancels icons`, async ({ page, context }) => {
    const state = fixture();
    const profile = kind === "llm" ? state.configuration.providers[0]! : state.configuration.decision.providers[0]!;
    profile.brand_id = "unrecognized-old-brand";
    const original = { ...profile };
    await install(context, state); await open(page);
    if (kind === "decision") await page.getByRole("button", { name: "Decision providers", exact: true }).click();
    await edit(page);
    await picker(page).getByLabel("Search icons by brand, alias or model name").fill("通义千问");
    await picker(page).getByRole("button", { name: "Qwen", exact: true }).click();
    await expect(picker(page).locator("[data-current-icon]")).toHaveText("Qwen");
    await expect(picker(page).getByRole("button", { name: "Qwen", exact: true })).toHaveAttribute("aria-pressed", "true");
    const image = picker(page).locator(":scope > div").first().locator("img");
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(state.writes).toEqual([]); expect(state.validations).toEqual([]);
    await page.getByRole("button", { name: "Validate and save", exact: true }).click();
    await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
    expect(state.writes[0]?.operations[0]).toMatchObject({ action: "upsert", kind, provider: { id: original.id, brand_id: original.brand_id, icon_id: "qwen", api_base: original.api_base, ...(kind === "llm" ? { type: original.type } : { protocol: original.protocol }) } });
    expect(state.configuration.models[0]!.name).toBe("fixture/existing");
    await page.reload();
    await page.getByRole("button", { name: "Provider & models", exact: true }).click();
    if (kind === "decision") await page.getByRole("button", { name: "Decision providers", exact: true }).click();
    await edit(page);
    await expect(picker(page).locator("[data-current-icon]")).toHaveText("Qwen");
    for (const name of ["Initials", "Server", "Cloud", "Circuit", "Globe"]) {
      await picker(page).getByRole("button", { name, exact: true }).click();
      await expect(picker(page).getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(picker(page).locator(":scope > div").first().locator("img")).toHaveCount(0);
    }
    await picker(page).getByRole("button", { name: "Automatic", exact: true }).click();
    await expect(picker(page).locator("[data-current-icon]")).toHaveText("Automatic");
    await page.getByRole("button", { name: "Validate and save", exact: true }).click();
    await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
    expect(state.writes[1]?.operations[0]).toMatchObject({ provider: { icon_id: null, brand_id: original.brand_id } });
    await edit(page);
    await picker(page).getByLabel("Search icons by brand, alias or model name").fill("Claude");
    await picker(page).getByRole("button", { name: "Anthropic", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Add provider", exact: true })).toBeFocused();
    expect(state.writes).toHaveLength(2);
    await edit(page); await expect(picker(page).locator("[data-current-icon]")).toHaveText("Automatic");
  });

  test(`${kind} custom create exposes compact picker outside advanced settings`, async ({ page, context }) => {
    const state = fixture(); await install(context, state); await open(page);
    if (kind === "decision") await page.getByRole("button", { name: "Decision providers", exact: true }).click();
    await page.getByRole("button", { name: "Add provider", exact: true }).click();
    await page.getByRole("button", { name: "Custom provider", exact: true }).click();
    await expect(picker(page)).toBeVisible();
    await expect(picker(page).getByRole("button", { name: "Choose icon", exact: true })).toHaveAttribute("aria-expanded", "false");
    expect(await picker(page).evaluate((element) => element.closest("details"))).toBeNull();
    await page.getByLabel("Instance ID", { exact: true }).fill(`${kind}-custom`);
    await page.getByLabel("Endpoint URL").fill("https://example.test/custom");
    if (kind === "decision") await page.getByLabel("Credential reference", { exact: true }).fill("CUSTOM_JUDGE_KEY");
    await picker(page).getByRole("button", { name: "Choose icon", exact: true }).click();
    await picker(page).getByRole("button", { name: "OpenAI", exact: true }).click();
    expect(state.writes).toEqual([]);
    await page.getByRole("button", { name: "Validate and save", exact: true }).click();
    await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
    expect(state.writes[0]?.operations[0]).toMatchObject({ kind, provider: { id: `${kind}-custom`, brand_id: null, icon_id: "openai" } });
  });
}

for (const icon of ["future-brand-icon", "constructor", "__proto__", "toString", "hasOwnProperty"]) test(`unknown saved icon ${icon} stays visible and survives ordinary editing`, async ({ page, context }) => {
  const state = fixture(); state.configuration.providers[0]!.icon_id = icon; state.configuration.providers[0]!.brand_id = "deepseek";
  await install(context, state); await open(page); await edit(page);
  await expect(picker(page).locator("[data-current-icon]")).toHaveText(icon);
  await expect(picker(page).locator(":scope > div").first().locator("img")).toHaveCount(0);
  await page.getByLabel("Display name").fill("Old identity retained");
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Old identity retained", exact: true })).toBeVisible();
  expect(state.writes[0]?.operations[0]).toMatchObject({ provider: { icon_id: icon, brand_id: "deepseek" } });
});

test("adding an already configured template prefills a new ID and cancel writes nothing", async ({ page, context }) => {
  const state = fixture();
  state.configuration.providers.push({ id: "openai", type: "openai", api_base: null }, { id: "openai-2", type: "openai", api_base: null });
  state.configuration.presets[0]!.api_base = null;
  await install(context, state); await open(page);
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByRole("button", { name: "OpenAI openai", exact: true }).click();
  await expect(page.getByLabel("Instance ID", { exact: true })).toHaveValue("openai-3");
  await expect(page.getByLabel("Endpoint URL")).toBeDisabled();
  await expect(page.getByLabel("Use the transport's default endpoint")).toBeChecked();
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  expect(state.writes).toEqual([]); expect(state.configuration.providers).toHaveLength(3);
});

test("failed image preserves 96x44 fallback and switching to a good URL recovers", async ({ page, context }) => {
  const state = fixture(); state.configuration.providers[0]!.brand_id = "deepseek";
  await install(context, state);
  await context.route("**/dashboard/assets/deepseek*.svg", (route) => route.fulfill({ status: 404, body: "" }));
  await open(page); await edit(page);
  const current = picker(page).locator(":scope > div").first().locator("[data-provider-icon]");
  await expect(current.locator("img")).toHaveCount(0);
  await expect(current).toHaveText("FI");
  const bounds = await current.boundingBox(); expect(bounds?.width).toBe(96); expect(bounds?.height).toBe(44);
  await picker(page).getByRole("button", { name: "OpenAI", exact: true }).click();
  await expect.poll(() => current.locator("img").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(current).toHaveAttribute("title", "OpenAI");
  expect(state.writes).toEqual([]);
});

test("all packaged SVGs load as same-origin files under gateway CSP and preserve proportions", async ({ page, context }) => {
  const state = fixture(); await install(context, state);
  const violations: string[] = [];
  page.on("console", (message) => { if (message.text().includes("Content Security Policy")) violations.push(message.text()); });
  await open(page); await edit(page);
  const images = picker(page).locator('div[aria-label="Brand icon library"] img');
  await expect(images).toHaveCount(Object.keys(sources.icons).length + 1);
  await expect.poll(() => images.evaluateAll((elements) => elements.every((element) => (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const assets = await images.evaluateAll((elements) => elements.map((element) => {
    const image = element as HTMLImageElement; const rect = image.getBoundingClientRect();
    return { src: image.src, width: rect.width, height: rect.height, ratio: image.naturalWidth / image.naturalHeight, background: getComputedStyle(image.parentElement!).backgroundColor, filter: getComputedStyle(image).filter };
  }));
  for (const asset of assets) {
    expect(new URL(asset.src).origin).toBe(new URL(page.url()).origin);
    expect(new URL(asset.src).pathname).toMatch(/^\/dashboard\/assets\/[^/]+\.svg$/);
    expect(asset.width / asset.height).toBeCloseTo(asset.ratio, 1);
    expect(asset.background).toBe("rgb(255, 255, 255)");
    if (!new URL(asset.src).pathname.includes("deepseek")) { expect(asset.width).toBe(32); expect(asset.height).toBe(32); }
    if (new URL(asset.src).pathname.includes("kimi")) expect(asset.filter).toContain("drop-shadow");
    const filename = new URL(asset.src).pathname.split("/").at(-1)!;
    const id = filename.slice(0, filename.indexOf("-"));
    const expectedHash = id === "deepseek" ? sources.deepseek.sha256 : sources.icons[id]!.sha256;
    const emitted = readFileSync(new URL(`../../../jev_gateway/static/assets/${filename}`, import.meta.url));
    expect(createHash("sha256").update(emitted).digest("hex"), id).toBe(expectedHash);
  }
  expect(new Set(assets.map((asset) => asset.src)).size).toBe(Object.keys(sources.icons).length + 1);
  expect(violations).toEqual([]);
  await picker(page).getByLabel("Search icons by brand, alias or model name").fill("azure_openai");
  await expect(picker(page).getByRole("button", { name: "Microsoft Azure", exact: true })).toBeVisible();
  await picker(page).getByLabel("Search icons by brand, alias or model name").fill("GLM");
  await expect(picker(page).getByRole("button", { name: "Zhipu / Z.AI", exact: true })).toBeVisible();
  await picker(page).getByLabel("Search icons by brand, alias or model name").fill("no-matching-icon");
  await expect(picker(page).getByRole("status")).toHaveText("No matching icons.");
});

test("keyboard selection never submits and Escape closes library before leaving form", async ({ page, context }) => {
  const state = fixture(); await install(context, state); await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const toggle = picker(page).getByRole("button", { name: "Choose icon", exact: true });
  await toggle.focus(); await page.keyboard.press("Enter");
  await picker(page).getByLabel("Search icons by brand, alias or model name").fill("claude");
  await page.keyboard.press("Enter");
  expect(state.writes).toEqual([]); expect(state.validations).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(picker(page).getByRole("button", { name: "Anthropic", exact: true })).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Space");
  await expect(picker(page).locator("[data-current-icon]")).toHaveText("Anthropic");
  expect(state.writes).toEqual([]); expect(state.validations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Display name")).toBeVisible();
});

test("automatic reset restores a recognized brand while explicit generic icons suppress it", async ({ page, context }) => {
  const state = fixture(); state.configuration.providers[0]!.brand_id = "deepseek";
  await install(context, state); await open(page); await edit(page);
  const current = picker(page).locator(":scope > div").first().locator("[data-provider-icon]");
  await expect(current).toHaveAttribute("data-provider-icon", "deepseek");
  for (const name of ["Initials", "Cloud"]) {
    await picker(page).getByRole("button", { name, exact: true }).click();
    await expect(current.locator("img")).toHaveCount(0);
  }
  await picker(page).getByRole("button", { name: "Automatic", exact: true }).click();
  await expect(current).toHaveAttribute("data-provider-icon", "deepseek");
  await expect.poll(() => current.locator("img").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(state.writes).toEqual([]);
});

test("pending save disables icon changes, search and disclosure", async ({ page, context }) => {
  const state = fixture(); await install(context, state);
  let release!: () => void;
  let validating = false;
  await context.route("**/v1/provider-configuration/validate", async (route) => {
    validating = true;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...state.configuration, valid: true, applied: false, imported: 0, skipped: 0 }) });
  });
  await open(page); await edit(page);
  await picker(page).getByRole("button", { name: "OpenAI", exact: true }).click();
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect.poll(() => validating).toBe(true);
  await expect(picker(page).getByRole("button", { name: "Close icon library", exact: true })).toBeDisabled();
  await expect(picker(page).getByRole("button", { name: "Cloud", exact: true })).toBeDisabled();
  await expect(picker(page).getByRole("button", { name: "Anthropic", exact: true })).toBeDisabled();
  await expect(picker(page).getByLabel("Search icons by brand, alias or model name")).toBeDisabled();
  release();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
});

for (const width of [1280, 390, 320]) for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
  test(`icon library fits ${width}px ${locale} ${scheme}`, async ({ page, context }, testInfo) => {
    const state = fixture(); await install(context, state);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.addInitScript((language) => localStorage.setItem("jev-dashboard-locale", language), locale);
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: locale === "en" ? "Provider & models" : "Provider 与模型配置", exact: true }).click();
    await page.getByRole("button", { name: locale === "en" ? "Edit" : "编辑", exact: true }).click();
    const toggle = picker(page).getByRole("button", { name: locale === "en" ? "Choose icon" : "选择图标", exact: true });
    await toggle.click();
    const search = picker(page).getByLabel(locale === "en" ? "Search icons by brand, alias or model name" : "按品牌、别名或模型名称搜索图标");
    await search.focus(); await page.keyboard.press("Tab");
    expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await picker(page).scrollIntoViewIfNeeded();
    await picker(page).screenshot({ path: testInfo.outputPath(`provider-icons-${width}-${locale}-${scheme}.png`) });
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    expect(state.writes).toEqual([]);
  });
}
