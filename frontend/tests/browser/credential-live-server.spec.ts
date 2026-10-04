import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const url = process.env.JEV_CREDENTIAL_LIVE_URL;
const home = process.env.JEV_CREDENTIAL_LIVE_HOME;
const keys = ["fake-live-inbound", "fake-live-provider", "fake-live-decision", "fake-live-inbound-next"];

test("initializes and rotates credentials against the real gateway without readback", async ({ page, context }) => {
  test.skip(!url || !home, "Start tests.test_credential_live_server and provide its URL and home.");
  await page.goto(`${url}/dashboard/`);
  await expect(page.locator("[data-dashboard-view-nav]")).toHaveCount(0);
  await page.locator("#setup-key").fill(keys[0]!);
  const initialized = page.waitForResponse((response) => response.url().endsWith("/v1/setup") && response.request().method() === "POST");
  await page.locator("#setup-key").press("Enter");
  const initializedResponse = await initialized;
  expect(initializedResponse.status()).toBe(200);
  expect(await initializedResponse.text()).not.toContain(keys[0]!);
  await page.getByRole("button", { name: "Provider & models", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Live fixture provider", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add provider", exact: true })).toBeEnabled();

  for (const [tab, secret] of [["LLM providers", keys[1]!], ["Decision providers", keys[2]!]] as const) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const input = page.getByLabel("New provider credential", { exact: true });
    await expect(input).toHaveValue("");
    await input.fill(secret);
    const saved = page.waitForResponse((response) => response.url().endsWith("/v1/provider-configuration")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Validate and save", exact: true }).click();
    const reply = await saved;
    expect(reply.status()).toBe(200);
    expect(await reply.text()).not.toContain(secret);
    await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Credential action").selectOption("set");
    await expect(input).toHaveValue("");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await expect(input).toHaveCount(0);
  }

  const store = JSON.parse(await readFile(`${home}/credentials.json`, "utf8")) as { values: Record<string, string> };
  expect(store.values).toEqual({ JEV_GATEWAY_API_KEY: keys[0], LIVE_LLM_KEY: keys[1], LIVE_DECISION_KEY: keys[2] });
  const chat = await page.request.post(`${url}/v1/chat/completions`, {
    headers: { Authorization: `Bearer ${keys[0]}` },
    data: { model: "task_aware", messages: [{ role: "user", content: "Verify browser configured transports." }] },
  });
  expect(chat.status()).toBe(200);
  expect(chat.headers()["x-jev-task-type"]).toBe("complex");
  expect((await chat.json()).choices[0].message.content).toBe("Local transport verified.");
  for (const key of keys) expect(await chat.text()).not.toContain(key);

  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  const gatewayInput = page.getByLabel("New gateway access key", { exact: true });
  await expect(gatewayInput).toHaveValue("");
  await gatewayInput.fill(keys[3]!);
  const rotated = page.waitForResponse((response) => response.url().endsWith("/v1/gateway-credential"));
  await page.getByRole("button", { name: "Save access key", exact: true }).click();
  expect((await rotated).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Replace access key", exact: true })).toBeEnabled();
  expect((await page.request.get(`${url}/healthz`, { headers: { Authorization: `Bearer ${keys[0]}` } })).status()).toBe(401);
  expect((await page.request.get(`${url}/healthz`, { headers: { Authorization: `Bearer ${keys[3]}` } })).status()).toBe(200);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Live fixture decision", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  await expect(page.getByLabel("Gateway API key", { exact: true })).toHaveValue("");
  await page.getByLabel("Gateway API key", { exact: true }).fill(keys[3]!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Provider & models", exact: true }).click();
  for (const tab of ["LLM providers", "Decision providers"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Credential action").selectOption("set");
    await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await expect(page.getByLabel("New provider credential", { exact: true })).toHaveCount(0);
  }
  const browser = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }));
  const cookies = await context.cookies();
  for (const key of keys) {
    expect(JSON.stringify({ browser, cookies })).not.toContain(key);
    await expect(page.locator("body")).not.toContainText(key);
  }
  await page.screenshot({ path: test.info().outputPath("real-credential-configuration.png"), fullPage: true });
});
