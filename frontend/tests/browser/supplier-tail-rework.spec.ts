import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";
import type { Locator, Page } from "@playwright/test";

async function type(locator: Locator, text: string) {
  await locator.click();
  await locator.press("ControlOrMeta+A");
  await locator.press("Backspace");
  if (text) await locator.pressSequentially(text);
}
async function open(page: Page) {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
}
const state = (): ProviderFixtureState => ({ configuration: providerFixture(), writes: [], validations: [], selectors: [] });
const save = (page: Page) => page.getByRole("button", { name: "Validate and save", exact: true }).click();

for (const transport of ["ollama_chat", "lm_studio"]) {
  for (const mode of ["anonymous", "authenticated", "advanced"] as const) {
    test(`local ${transport} ${mode} declares only intended primary binding`, async ({ page, context }) => {
      const fixture = state();
      fixture.configuration.presets.push({ id: transport, display_name: "Local fixture", kind: "llm", type: transport, api_base: "http://127.0.0.1:11434", api_key_env: null });
      fixture.configuration.provider_types.push(transport);
      await installProviderFixture(context, fixture); await open(page);
      await page.getByRole("button", { name: "Add provider", exact: true }).click();
      await page.getByRole("button", { name: `Local fixture ${transport}`, exact: true }).click();
      if (mode === "authenticated") await type(page.getByLabel("New provider credential", { exact: true }), "synthetic-local-key");
      if (mode === "advanced") {
        await page.getByText("Advanced configuration", { exact: true }).click();
        await type(page.getByLabel("Credential reference", { exact: true }), "EXPLICIT_LOCAL_KEY");
      }
      await save(page);
      await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
      const operation = fixture.writes[0]?.operations[0];
      expect(operation?.action).toBe("upsert");
      if (!operation || operation.action !== "upsert") throw new Error("Expected supplier mutation");
      expect(operation.provider.api_key_env).toEqual(mode === "anonymous" ? null : mode === "advanced" ? "EXPLICIT_LOCAL_KEY" : expect.stringMatching(/^JEV_/));
      expect(operation.credential.action).toBe(mode === "authenticated" ? "set" : "keep");
    });
  }
}

test("changed loaded revision cancels a probe admitted after the read", async ({ page, context }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch;
    const observed = window as Window & { supplierAborts?: number };
    observed.supplierAborts = 0;
    window.fetch = (input, init) => {
      if (String(input).includes("/v1/provider-connection-test")) init?.signal?.addEventListener("abort", () => { observed.supplierAborts = (observed.supplierAborts ?? 0) + 1; });
      return nativeFetch(input, init);
    };
  });
  const fixture = state(); fixture.rejectValidation = 400;
  await installProviderFixture(context, fixture); await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click(); await save(page);
  await expect(page.getByRole("alert")).toBeVisible();
  let releaseRead!: () => void; const readHeld = new Promise<void>((resolve) => { releaseRead = resolve; });
  let releaseProbe!: () => void; fixture.delayConnection = () => new Promise<void>((resolve) => { releaseProbe = resolve; });
  await context.route("**/v1/provider-configuration", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await readHeld;
    await route.fulfill({ json: { ...fixture.configuration, revision: "external-credential-revision" } });
  });
  const readStarted = page.waitForRequest((request) => request.method() === "GET" && request.url().endsWith("/v1/provider-configuration"));
  await page.getByRole("button", { name: "Reload current configuration", exact: true }).click(); await readStarted;
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect.poll(() => fixture.connectionSelectors?.length).toBe(1);
  releaseRead();
  await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Test connection", exact: true })).toBeEnabled();
  releaseProbe();
  await expect(page.getByText(/Model-list endpoint validated/)).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { supplierAborts?: number }).supplierAborts)).toBe(1);
});

test("uncertain PUT requires successful read before validation and preserves failed-read draft", async ({ page, context }) => {
  const fixture = state(); await installProviderFixture(context, fixture); await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await type(page.getByLabel("New provider credential", { exact: true }), "synthetic-uncertain-key");
  const sequence: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/v1/provider-configuration")) sequence.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  let drop = true; let failedRead = true;
  await context.route("**/v1/provider-configuration", async (route) => {
    if (route.request().method() === "PUT" && drop) {
      drop = false; fixture.configuration.revision = "committed-but-response-lost";
      return route.abort("failed");
    }
    if (route.request().method() === "GET" && failedRead) return route.abort("failed");
    return route.fallback();
  });
  await save(page); await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("synthetic-uncertain-key");
  const first = sequence.length; await save(page);
  await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeEnabled();
  expect(sequence.slice(first)).toEqual(["GET /v1/provider-configuration"]);
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("synthetic-uncertain-key");
  failedRead = false; const second = sequence.length; await save(page);
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(sequence.slice(second, second + 3)).toEqual(["GET /v1/provider-configuration", "POST /v1/provider-configuration/validate", "PUT /v1/provider-configuration"]);
  expect(fixture.validations.at(-1)?.expected_revision).toBe("committed-but-response-lost");
});

test("uncertain supplier outcome also protects the next gateway PUT", async ({ page, context }) => {
  const fixture = state(); await installProviderFixture(context, fixture); await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await type(page.getByLabel("New provider credential", { exact: true }), "synthetic-uncertain-key");
  await context.route("**/v1/provider-configuration", async (route) => {
    if (route.request().method() === "PUT") { fixture.configuration.revision = "uncertain-supplier-revision"; return route.abort("failed"); }
    return route.fallback();
  });
  await save(page); await expect(page.getByRole("alert")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Replace access key", exact: true }).click();
  await type(page.getByLabel("New gateway access key", { exact: true }), "synthetic-gateway-key");
  const sequence: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/v1/provider-configuration") || request.url().endsWith("/v1/gateway-credential")) sequence.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.getByRole("button", { name: "Save access key", exact: true }).click();
  await expect.poll(() => fixture.gatewayWrites?.length).toBe(1);
  expect(sequence.slice(0, 2)).toEqual(["GET /v1/provider-configuration", "PUT /v1/gateway-credential"]);
  expect(fixture.gatewayWrites?.[0]?.expected_revision).toBe("uncertain-supplier-revision");
});

for (const kind of ["llm", "decision"] as const) test(`explicit ${kind} primary CLEAR survives rejection and stays explicit on retry`, async ({ page, context }) => {
  const fixture = state(); fixture.rejectValidation = 400;
  await installProviderFixture(context, fixture); await open(page);
  if (kind === "decision") await page.getByRole("button", { name: "Decision providers", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const action = page.getByRole("combobox", { name: "Credential action", exact: true });
  await action.press("c"); await action.press("Tab");
  await expect(action).toHaveValue("clear");
  await save(page); await expect(page.getByRole("alert")).toBeVisible();
  await expect(action).toHaveValue("clear");
  fixture.rejectValidation = undefined; await save(page);
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(fixture.writes[0]?.operations[0]).toMatchObject({ credential: { action: "clear" } });
});

for (const parameter of ["primary", "aws_access_key_id", "aws_secret_access_key", "aws_session_token", "vertex_credentials"]) {
  test(`native enter/delete ${parameter} submits KEEP without removed value`, async ({ page, context }) => {
    const fixture = state();
    if (parameter !== "primary") {
      const vertex = parameter === "vertex_credentials";
      const keys = vertex ? [parameter] : ["aws_access_key_id", "aws_secret_access_key", "aws_session_token"];
      fixture.configuration.providers[0] = { ...fixture.configuration.providers[0]!, type: vertex ? "vertex_ai" : "bedrock", api_base: null, api_key_env: null, params: {}, param_env: Object.fromEntries(keys.map((key) => [key, `FIXTURE_${key.toUpperCase()}`])), transport_credential_presence: Object.fromEntries(keys.map((key) => [key, true])) };
      fixture.configuration.provider_types.push(vertex ? "vertex_ai" : "bedrock");
      fixture.configuration.presets.push({ id: vertex ? "vertex_ai" : "bedrock", display_name: "Cloud fixture", type: vertex ? "vertex_ai" : "bedrock", kind: "llm", api_base: null, api_key_env: null, setup_fields: keys.map((key) => ({ key, target: "param_env", label: key, label_zh: key, required: false })) });
    }
    await installProviderFixture(context, fixture); await open(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const input = parameter === "primary" ? page.getByLabel("New provider credential", { exact: true }) : page.locator(`#secret-${parameter}`);
    await type(input, parameter === "vertex_credentials" ? '{"type":"synthetic"}' : "synthetic-temporary");
    await type(input, "");
    const action = parameter === "primary" ? page.locator("[data-primary-action]") : page.locator(`[data-transport-action="${parameter}"]`);
    await expect(action).toHaveValue("keep");
    await save(page); await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
    const operation = fixture.writes[0]?.operations[0];
    if (!operation || operation.action !== "upsert") throw new Error("Expected supplier mutation");
    expect(operation.credential).toEqual({ action: "keep" });
    expect(Object.values(operation.transport_credentials ?? {}).every((action) => action.action === "keep")).toBe(true);
    expect(JSON.stringify(operation)).not.toContain("synthetic-temporary");
    expect(JSON.stringify(operation)).not.toContain('"type":"synthetic"');
    expect(operation.provider.api_key_env).toBe(fixture.configuration.providers[0]?.api_key_env);
  });
}

test("selected dark kind uses readable existing ink palette", async ({ page, context }, info) => {
  const fixture = state(); await installProviderFixture(context, fixture);
  await page.emulateMedia({ colorScheme: "dark" }); await open(page);
  const selected = page.getByRole("button", { name: "LLM providers", exact: true });
  const ratio = await selected.evaluate((element) => {
    const style = getComputedStyle(element);
    const rgb = (color: string) => {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map((value) => value / 255);
    };
    const luminance = (color: string) => rgb(color).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index]!, 0);
    const fg = luminance(style.color); const bg = luminance(style.backgroundColor);
    return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
  });
  await info.attach("settled-contrast", { body: JSON.stringify({ ratio }), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("dark-kind.png") });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
