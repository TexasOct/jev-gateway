import { mkdir, chmod, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const key = "synthetic-connection-key";

function luminance(color: string) {
  const channels = color.match(/^rgb\(([^)]+)\)$/)?.[1]?.split(",").map(Number);
  if (!channels || channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    throw new Error(`Expected an opaque computed RGB color, received ${color}`);
  }
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [red, green, blue] = linear;
  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error(`Missing RGB channels in ${color}`);
  }
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

async function requireKey(page: Page) {
  const state = { requests: [] as { path: string; authorization: string | undefined }[], expired: false, abortTheme: false, initialDelay: null as Promise<void> | null, themeDelay: null as Promise<void> | null };
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const protectedRead = /^\/v1\/(routing\/(providers\/summary|strategies|policy|sessions|activity|configuration)|dashboard\/(theme|canvas-layout)|provider-configuration)$/.test(url.pathname);
    if (url.origin !== "http://127.0.0.1:4178" || request.method() !== "GET" || !protectedRead) return route.fallback();
    const authorization = request.headers().authorization;
    state.requests.push({ path: url.pathname, authorization });
    if (!authorization && state.initialDelay) await state.initialDelay;
    if (authorization !== `Bearer ${key}` || state.expired) {
      return route.fulfill({ status: 401, json: { error: { message: "Synthetic unauthorized", code: "invalid_api_key" } } });
    }
    if (url.pathname === "/v1/dashboard/theme") {
      if (state.themeDelay) await state.themeDelay;
      if (state.abortTheme) return route.abort("failed");
    }
    return route.fallback();
  });
  return state;
}

async function expectConnection(page: Page) {
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  await expect(page.locator("[data-dashboard-view-nav]")).toHaveCount(0);
  await expect(page.locator(".app-header, .routing-canvas-scroll")).toHaveCount(0);
  await expect(page.getByText("Current sessions", { exact: true })).toHaveCount(0);
}

test("401 hides the console; blank input sends nothing and Enter waits for validation with one trimmed Bearer attempt", async ({ page }) => {
  const state = await requireKey(page);
  await page.goto("/dashboard/");
  await expectConnection(page);
  const input = page.getByLabel("Gateway API key", { exact: true });
  await expect(input).toBeEnabled();
  await expect(input).toHaveAttribute("type", "password");
  const requests = state.requests.length;
  await input.fill("   ");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Enter the gateway API key");
  expect(state.requests).toHaveLength(requests);

  const gate = deferred();
  state.themeDelay = gate.promise;
  await input.fill(`  ${key}  `);
  await input.press("Enter");
  await expect.poll(() => state.requests.filter(({ path, authorization }) => path === "/v1/dashboard/theme" && authorization).length).toBe(1);
  await expectConnection(page);
  await expect(page.getByRole("status")).toHaveText("Checking connection…");
  await expect(input).toBeDisabled();
  await expect(input).toHaveValue(`  ${key}  `);
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeDisabled();
  await page.locator("form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  expect(state.requests.filter(({ path, authorization }) => path === "/v1/routing/providers/summary" && authorization)).toHaveLength(1);
  expect(state.requests.filter(({ authorization }) => authorization).every(({ authorization }) => authorization === `Bearer ${key}`)).toBe(true);
  gate.release();
  await expect(page.locator("[data-dashboard-view-nav]")).toBeVisible();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
});

test("initial validation holds the page and excludes overlapping manual and locale-triggered probes", async ({ page }) => {
  const state = await requireKey(page);
  const gate = deferred();
  state.initialDelay = gate.promise;
  await page.goto("/dashboard/");
  await expect.poll(() => state.requests.length).toBe(4);
  await expect(page.getByLabel("Gateway API key", { exact: true })).toBeDisabled();
  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  expect(state.requests).toHaveLength(4);
  gate.release();
  await expect(page.getByRole("button", { name: "连接", exact: true })).toBeEnabled();
  expect(state.requests).toHaveLength(4);
  await expect(page.locator("[data-dashboard-view-nav]")).toHaveCount(0);
});

test("blank-key errors follow locale changes without new validation requests", async ({ page }) => {
  const state = await requireKey(page);
  await page.goto("/dashboard/");
  const input = page.getByLabel("Gateway API key", { exact: true });
  await expect(input).toBeEnabled();
  await input.fill("   ");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Enter the gateway API key.");
  const count = state.requests.length;
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await expect(page.getByRole("alert")).toHaveText("请输入网关 API 密钥。");
  await page.getByLabel("语言", { exact: true }).selectOption("en");
  await expect(page.getByRole("alert")).toHaveText("Enter the gateway API key.");
  expect(state.requests).toHaveLength(count);
});

test("wrong keys and a true network abort stay on the page with a retained draft and allow retry", async ({ page }) => {
  const state = await requireKey(page);
  await page.goto("/dashboard/");
  const input = page.getByLabel("Gateway API key", { exact: true });
  await expect(input).toBeEnabled();
  await input.fill("synthetic-wrong-key");
  await input.press("Enter");
  await expect(input).toBeEnabled();
  await expectConnection(page);
  await expect(page.getByRole("alert")).toContainText("Authentication required");
  await expect(input).toHaveValue("synthetic-wrong-key");
  state.abortTheme = true;
  await input.fill(key);
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Failed to fetch");
  await expectConnection(page);
  await expect(input).toHaveValue(key);
  state.abortTheme = false;
  await input.press("Enter");
  await expect(page.locator("[data-dashboard-view-nav]")).toBeVisible();
});

test("activity 401 clears the credential, stops polling, hides remembered data and reload cannot restore the key", async ({ page, context }) => {
  const state = await requireKey(page);
  await page.goto("/dashboard/");
  const input = page.getByLabel("Gateway API key", { exact: true });
  await expect(input).toBeEnabled();
  await input.fill(key);
  await input.press("Enter");
  await expect(page.locator("[data-dashboard-view-nav]")).toBeVisible();
  await expect.poll(() => state.requests.filter(({ path }) => path === "/v1/routing/activity").length).toBeGreaterThan(0);
  state.expired = true;
  await expectConnection(page);
  const count = state.requests.length;
  await page.waitForTimeout(3_200);
  expect(state.requests).toHaveLength(count);
  await expect(input).toHaveValue("");
  // A failed post-401 attempt must use the new draft, then clear it from module memory.
  await input.fill("synthetic-wrong-key");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(input).toBeEnabled();
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie, url: location.href }));
  expect(storage.local).toEqual({ "jev-dashboard-locale": "en" });
  expect(storage.session).toEqual({});
  expect(storage.cookie).toBe("");
  expect(storage.url).not.toContain(key);
  expect(await context.cookies()).toEqual([]);
  state.expired = false;
  const beforeReload = state.requests.length;
  await page.reload();
  await expectConnection(page);
  await expect(input).toHaveValue("");
  expect(state.requests.slice(beforeReload).every(({ authorization }) => authorization === undefined)).toBe(true);
});

test("a successful connection keeps credentials out of browser storage and reload needs a fresh key", async ({ page, context }) => {
  const state = await requireKey(page);
  await page.goto("/dashboard/");
  const input = page.getByLabel("Gateway API key", { exact: true });
  await expect(input).toBeEnabled();
  await input.fill(key);
  await input.press("Enter");
  await expect(page.locator("[data-dashboard-view-nav]")).toBeVisible();
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }))).toEqual({ local: { "jev-dashboard-locale": "en" }, session: {}, cookie: "" });
  expect(await context.cookies()).toEqual([]);
  expect(page.url()).toBe("http://127.0.0.1:4178/dashboard/");
  const count = state.requests.length;
  await page.reload();
  await expectConnection(page);
  await expect(input).toHaveValue("");
  expect(state.requests.slice(count).every(({ authorization }) => authorization === undefined)).toBe(true);
});

test("anonymous gateways retain normal navigation", async ({ page }) => {
  await page.goto("/dashboard/");
  await expect(page.locator("[data-dashboard-view-nav]")).toBeVisible();
  for (const name of ["Strategy workflow", "Provider & models", "Settings", "Monitoring"]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
});

for (const locale of ["en", "zh-CN"] as const) {
  for (const width of [1280, 320]) {
    for (const scheme of ["light", "dark"] as const) {
      test(`connection geometry and keyboard focus: ${locale}, ${width}px, ${scheme}`, async ({ page }, testInfo) => {
        const state = await requireKey(page);
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto("/dashboard/");
        await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeEnabled();
        const requestCount = state.requests.length;
        await page.getByLabel("Language", { exact: true }).selectOption(locale);
        await expect(page.getByRole("alert")).toHaveText(locale === "en"
          ? "Authentication required. Enter the gateway API key to continue."
          : "需要身份验证。请输入网关 API 密钥以继续。");
        expect(state.requests).toHaveLength(requestCount);
        const label = locale === "en" ? "Gateway API key" : "网关 API 密钥";
        const input = page.getByLabel(label, { exact: true });
        await input.focus();
        await expect(input).toBeFocused();
        const geometry = await input.evaluate((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, outline: style.outlineStyle, outlineWidth: style.outlineWidth, scroll: document.documentElement.scrollWidth, viewport: innerWidth, scheme: document.documentElement.dataset.scheme };
        });
        expect(geometry.left).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(width);
        expect(geometry.width).toBeGreaterThan(200);
        expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.scheme).toBe(scheme);
        expect(geometry.outline).not.toBe("none");
        expect(parseFloat(geometry.outlineWidth)).toBeGreaterThan(0);
        await input.press("Tab");
        const button = page.getByRole("button", { name: locale === "en" ? "Connect" : "连接", exact: true });
        await expect(button).toBeFocused();
        await expect(button).toBeEnabled();
        const colors = await button.evaluate(async (element) => {
          // Theme changes transition the button colors; measure the settled label.
          void getComputedStyle(element).color;
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
          const style = getComputedStyle(element);
          return { foreground: style.color, background: style.backgroundColor, opacity: style.opacity };
        });
        expect(colors.opacity).toBe("1");
        const foreground = luminance(colors.foreground);
        const background = luminance(colors.background);
        const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        const evidencePath = testInfo.outputPath("button-contrast.json");
        await mkdir(dirname(evidencePath), { recursive: true, mode: 0o700 });
        await chmod(dirname(evidencePath), 0o700);
        await writeFile(evidencePath, JSON.stringify({ locale, width, scheme, ...colors, contrast }, null, 2), { mode: 0o600 });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
        await expect(page.locator("[data-dashboard-view-nav]")).toHaveCount(0);
        if ((locale === "en" && width === 1280) || (locale === "zh-CN" && width === 320)) {
          await input.fill(key);
          const path = testInfo.outputPath(`${locale}-${width}-${scheme}.png`);
          await page.screenshot({ path, fullPage: true });
          await chmod(path, 0o600);
        }
      });
    }
  }
}
