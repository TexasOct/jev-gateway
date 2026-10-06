import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const url = process.env.JEV_CREDENTIAL_DEFAULT_URL;
const home = process.env.JEV_CREDENTIAL_DEFAULT_HOME;
const key = "fake-installed-browser-inbound";

test("initializes the fresh installed default catalog through the Dashboard", async ({ page, context }) => {
  test.skip(!url || !home, "Provide a fresh installed-wheel gateway URL and runtime home.");
  await page.goto(`${url}/dashboard/`);
  await expect(page.locator("[data-dashboard-view-nav]")).toHaveCount(0);
  const input = page.locator("#setup-key");
  await expect(input).toHaveValue("");
  await input.fill(key);
  const saved = page.waitForResponse((response) => response.url().endsWith("/v1/setup") && response.request().method() === "POST");
  await input.press("Enter");
  const reply = await saved;
  expect(reply.status()).toBe(200);
  expect(await reply.text()).not.toContain(key);
  await page.getByRole("navigation", { name: "Views", exact: true }).getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add provider", exact: true })).toBeEnabled();
  await expect(input).toHaveCount(0);
  expect((await page.request.get(`${url}/healthz`)).status()).toBe(401);
  expect((await page.request.get(`${url}/healthz`, { headers: { Authorization: `Bearer ${key}` } })).status()).toBe(200);
  const store = JSON.parse(await readFile(`${home}/credentials.json`, "utf8")) as { values: Record<string, string> };
  expect(store.values).toEqual({ JEV_GATEWAY_API_KEY: key });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  await expect(page.getByLabel("Gateway API key", { exact: true })).toHaveValue("");
  await page.getByLabel("Gateway API key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("navigation", { name: "Views", exact: true }).getByRole("button", { name: "Suppliers", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await expect(page.getByLabel("New gateway access key", { exact: true })).toHaveValue("");
  await page.getByRole("region", { name: "Gateway access key", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }));
  expect(JSON.stringify({ storage, cookies: await context.cookies() })).not.toContain(key);
  await expect(page.locator("body")).not.toContainText(key);
  await page.screenshot({ path: test.info().outputPath("installed-default-credential-setup.png"), fullPage: true });
});
