import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";
import type { Page } from "@playwright/test";

function fixture(): ProviderFixtureState { return { configuration: providerFixture(), writes: [], validations: [], selectors: [] }; }
async function open(page: Page) {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Supplier connections" })).toBeVisible();
}
async function edit(page: Page) { await page.getByRole("button", { name: "Edit", exact: true }).click(); }

test("direct entry generates independent instances and keeps identities on rename", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  const add = async (name: string, key: string) => {
    await page.getByRole("button", { name: "Add provider", exact: true }).click();
    await page.getByRole("button", { name: "OpenAI openai", exact: true }).click();
    await expect(page.getByLabel("Instance ID", { exact: true })).not.toBeVisible();
    await expect(page.getByLabel("Credential reference", { exact: true })).not.toBeVisible();
    await page.getByLabel("Display name", { exact: true }).fill(name);
    await page.getByLabel("New provider credential", { exact: true }).fill(key);
    await page.getByRole("button", { name: "Validate and save", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  };
  await add("Personal account", "synthetic-personal-key");
  await add("Team account", "synthetic-team-key");
  const first = state.configuration.providers.find((provider) => provider.display_name === "Personal account")!;
  const second = state.configuration.providers.find((provider) => provider.display_name === "Team account")!;
  expect(first.id).not.toBe(second.id); expect(first.api_key_env).not.toBe(second.api_key_env);
  expect(first.api_key_env).not.toBe("OPENAI_API_KEY");
  for (const profile of [first, second]) {
    expect(profile.api_key_env).toMatch(new RegExp(`^JEV_${profile.id.toUpperCase().replaceAll("-", "_")}_[A-F0-9]{32}_API_KEY$`));
    expect(profile.api_key_env).not.toBe(state.configuration.gateway.api_key_env);
  }
  const row = page.getByRole("heading", { name: "Personal account", exact: true }).locator("../..");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("");
  await page.getByLabel("Display name", { exact: true }).fill("Renamed account");
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Renamed account", exact: true })).toBeVisible();
  const operation = state.writes.at(-1)!.operations[0]!;
  expect(operation).toMatchObject({ action: "upsert", provider: { id: first.id, api_key_env: first.api_key_env }, credential: { action: "keep" } });
  expect(state.configuration.models[0]!.name).toBe("fixture/existing");
});

for (const stage of ["validation", "write"] as const) test(`failed ${stage} retains captured secret; pending and success clear it`, async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page); await edit(page);
  await page.getByLabel("New provider credential", { exact: true }).fill("synthetic-retry-key");
  let release!: () => void;
  if (stage === "validation") { state.rejectValidation = 400; state.delayValidation = () => new Promise<void>((resolve) => { release = resolve; }); }
  else { state.rejectWrite = 500; state.delayWrite = () => new Promise<void>((resolve) => { release = resolve; }); }
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("New provider credential", { exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("synthetic-retry-key");
  state.rejectValidation = undefined;
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  await edit(page);
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("");
  expect(state.writes.at(-1)!.operations[0]).toMatchObject({ credential: { action: "set", value: "synthetic-retry-key" } });
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain("synthetic-retry-key");
});

test("blank replacement keeps existing key; explicit clear preserves identity and reports inherited presence", async ({ page, context }) => {
  const state = fixture(); state.inheritedCredential = true;
  await installProviderFixture(context, state); await open(page); await edit(page);
  await page.getByRole("combobox", { name: "Credential action", exact: true }).selectOption("set");
  await page.getByLabel("New provider credential", { exact: true }).fill("temporary-synthetic-key");
  await page.getByLabel("New provider credential", { exact: true }).fill("");
  await expect(page.getByRole("combobox", { name: "Credential action", exact: true })).toHaveValue("keep");
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[0]!.operations[0]).toMatchObject({ credential: { action: "keep" } });
  await edit(page);
  await page.getByRole("combobox", { name: "Credential action", exact: true }).selectOption("clear");
  await expect(page.getByText("Clear removes", { exact: false })).toBeVisible();
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[1]!.operations[0]).toMatchObject({ provider: { id: "fixture", api_key_env: "FIXTURE_KEY" }, credential: { action: "clear" } });
  await edit(page);
  await expect(page.getByText("A credential is configured. Its value is never returned.", { exact: true })).toBeVisible();
});

test("shared-reference rejection preserves draft and exposes recovery explanation", async ({ page, context }) => {
  const state = fixture(); state.rejectValidation = 400;
  await installProviderFixture(context, state); await open(page); await edit(page);
  await page.getByRole("combobox", { name: "Credential action", exact: true }).selectOption("clear");
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Shared references cannot be replaced or cleared");
  await expect(page.getByRole("combobox", { name: "Credential action", exact: true })).toHaveValue("clear");
  await page.getByText("Advanced configuration", { exact: true }).click();
  await expect(page.getByLabel("Credential reference", { exact: true })).toHaveValue("FIXTURE_KEY");
  expect(state.writes).toEqual([]);
});

test("dirty cancel and navigation keep input unless discarded; decision tests cannot claim remote success", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page); await edit(page);
  await page.getByLabel("Display name", { exact: true }).fill("Unsaved connection");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Cancel", exact: true }).last().click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Unsaved connection");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Unsaved connection");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Display name", { exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-provider-edit="fixture"][data-provider-kind="llm"]')).toBeFocused();
  await page.getByRole("button", { name: "Decision providers", exact: true }).click(); await edit(page);
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(page.getByText("No remote availability was verified.", { exact: false })).toBeVisible();
  await expect(page.getByText("Only saving validates its configuration", { exact: false })).toBeVisible();
  expect(state.writes).toEqual([]); expect(state.selectors).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) test(`symbol-only local DeepSeek renders under CSP on narrow ${scheme} screen`, async ({ page, context }, testInfo) => {
  const state = fixture(); state.configuration.providers[0]!.brand_id = "deepseek";
  await installProviderFixture(context, state);
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: scheme });
  await context.route("**/dashboard/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'" } });
  });
  await open(page);
  const image = page.locator('[data-provider-icon="deepseek"] img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const source = await image.getAttribute("src"); expect(source).toMatch(/^\/dashboard\/assets\/deepseek-[^/]+\.svg$/);
  const svg = await (await page.request.get(source!)).text();
  expect(svg.match(/<path\b/g)).toHaveLength(1); expect(svg).not.toContain("<g");
  await page.screenshot({ path: testInfo.outputPath(`supplier-symbol-${scheme}.png`), fullPage: true });
  await edit(page);
  await expect(page.getByLabel("Instance ID", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`supplier-${scheme}.png`), fullPage: true });
});

test("decision direct key saves with generated identity; optional model remains independent", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Decision providers", exact: true }).click();
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByRole("button", { name: "System One system_one", exact: true }).click();
  await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeDisabled();
  await page.getByText("Advanced configuration", { exact: true }).click();
  const reference = await page.getByLabel("Credential reference", { exact: true }).inputValue();
  expect(reference).toMatch(/^JEV_SYSTEM_ONE_[A-F0-9]{32}_API_KEY$/);
  await page.getByText("Advanced configuration", { exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Team judge");
  await page.getByLabel("Endpoint URL", { exact: true }).fill("https://example.test/evaluate");
  await page.getByLabel("New provider credential", { exact: true }).fill("synthetic-decision-key");
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Team judge", exact: true })).toBeVisible();
  expect(state.writes[0]!.operations[0]).toEqual({ action: "upsert", kind: "decision", provider: { id: "system_one", display_name: "Team judge", brand_id: null, icon_id: null, protocol: "system_one", api_base: "https://example.test/evaluate", api_key_env: reference, model: null }, credential: { action: "set", value: "synthetic-decision-key" } });
  expect(state.validations).toEqual(state.writes);
});

test("native cloud account setup keeps platform and advanced credential paths explicit", async ({ page, context }) => {
  const state = fixture();
  state.configuration.presets.push({ id: "vertex_ai", kind: "llm", display_name: "Vertex AI", type: "vertex_ai", api_base: null, api_key_env: null, setup_fields: [
    { key: "vertex_project", target: "params", label: "Project", label_zh: "项目", required: true },
    { key: "vertex_location", target: "params", label: "Region", label_zh: "区域", required: true },
    { key: "vertex_credentials", target: "param_env", label: "Service-account reference", label_zh: "服务账号引用", required: false },
  ] });
  state.configuration.provider_types.push("vertex_ai");
  await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByRole("button", { name: "Vertex AI vertex_ai", exact: true }).click();
  await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeDisabled();
  await expect(page.getByText("Vertex uses the gateway server's Application Default Credentials", { exact: false })).toBeVisible();
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Service-account reference", { exact: true })).not.toBeVisible();
  await page.getByLabel("Project", { exact: true }).fill("synthetic-project");
  await page.getByLabel("Region", { exact: true }).fill("us-central1");
  await page.getByText("Advanced configuration", { exact: true }).click();
  await page.getByLabel("Service-account reference", { exact: true }).fill("EXISTING_VERTEX_JSON");
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vertex AI", exact: true })).toBeVisible();
  expect(state.writes[0]!.operations[0]).toMatchObject({ provider: { api_base: null, api_key_env: null, params: { vertex_project: "synthetic-project", vertex_location: "us-central1" }, param_env: { vertex_credentials: "EXISTING_VERTEX_JSON" } }, credential: { action: "keep" } });
});

for (const kind of ["llm", "decision"] as const) test(`${kind} ordinary creation requires a key until advanced reference compatibility is deliberately selected`, async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  if (kind === "decision") await page.getByRole("button", { name: "Decision providers", exact: true }).click();
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByRole("button", { name: "Custom provider", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Compatible account");
  await page.getByLabel("Endpoint URL", { exact: true }).fill("https://example.test/compatible");
  await expect(page.getByLabel("Instance ID", { exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Credential reference", { exact: true })).not.toBeVisible();
  for (const name of ["Validate and save", "Test connection"]) await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  await page.getByText("Advanced configuration", { exact: true }).click();
  const id = await page.getByLabel("Instance ID", { exact: true }).inputValue();
  const allocated = await page.getByLabel("Credential reference", { exact: true }).inputValue();
  expect(allocated).toMatch(new RegExp(`^JEV_${id.toUpperCase()}_[A-F0-9]{32}_API_KEY$`));
  await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeDisabled();
  await page.getByLabel("Credential reference", { exact: true }).fill("EXISTING_COMPATIBLE_REFERENCE");
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  if (kind === "llm") {
    await expect.poll(() => state.connectionSelectors?.length).toBe(1);
    expect(state.connectionSelectors?.[0]).toHaveProperty("provider.api_key_env", "EXISTING_COMPATIBLE_REFERENCE");
  } else await expect(page.getByText("No remote availability was verified.", { exact: false })).toBeVisible();
  expect(state.writes).toEqual([]); expect(state.validations).toEqual([]);
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ expected_revision: "r1", operations: [{ action: "upsert", kind, provider: { id, display_name: "Compatible account", brand_id: null, icon_id: null, api_base: "https://example.test/compatible", api_key_env: "EXISTING_COMPATIBLE_REFERENCE", ...(kind === "llm" ? { type: "openai", allow_private_network: false } : { protocol: "system_one", model: null }) }, credential: { action: "keep" } }] }]);
  expect(state.validations).toEqual(state.writes);
});

test("primary allocation avoids gateway, primary and binding collisions and stays fixed through typing, probes and rejected writes", async ({ page, context }) => {
  const state = fixture();
  const stem = `JEV_OPENAI_${"11".repeat(16)}_API_KEY`;
  state.configuration.gateway.api_key_env = stem;
  state.configuration.providers[0]!.api_key_env = `${stem}_2`;
  state.configuration.decision.providers[0]!.param_env = { shared_header: `${stem}_3` };
  await page.addInitScript(() => {
    const random = crypto.getRandomValues.bind(crypto);
    let calls = 0;
    Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint8Array<ArrayBuffer>) => {
      if (array instanceof Uint8Array && array.length === 16) { calls++; array.fill(0x11); return array; }
      return random(array);
    } });
    Object.defineProperty(window, "supplierAllocationCalls", { get: () => calls });
  });
  await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByRole("button", { name: "OpenAI openai", exact: true }).click();
  await page.getByText("Advanced configuration", { exact: true }).click();
  const reference = `${stem}_4`;
  await expect(page.getByLabel("Credential reference", { exact: true })).toHaveValue(reference);
  const before = structuredClone(state.configuration);
  const allocations = await page.evaluate(() => Reflect.get(window, "supplierAllocationCalls") as number);
  expect(allocations).toBe(1);
  for (const name of ["Collision-safe account", "Renamed draft"]) {
    await page.getByLabel("Display name", { exact: true }).fill(name);
    await page.getByLabel("New provider credential", { exact: true }).fill(`synthetic-${name}`);
    await page.getByRole("button", { name: "Test connection", exact: true }).click();
    await expect.poll(() => state.connectionSelectors?.length).toBe(name === "Collision-safe account" ? 1 : 2);
    await expect(page.getByRole("button", { name: "Test connection", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Credential reference", { exact: true })).toHaveValue(reference);
  }
  state.rejectWrite = 500;
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("synthetic-Renamed draft");
  await expect(page.getByLabel("Credential reference", { exact: true })).toHaveValue(reference);
  expect(state.configuration).toEqual(before);
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(2); expect(state.validations).toEqual(state.writes);
  expect(state.writes[0]).toEqual(state.writes[1]);
  for (const selector of state.connectionSelectors!) expect(selector).toHaveProperty("provider.api_key_env", reference);
  for (const mutation of state.writes) expect(mutation.operations[0]).toHaveProperty("provider.api_key_env", reference);
  expect(await page.evaluate(() => Reflect.get(window, "supplierAllocationCalls"))).toBe(allocations);
  expect(state.configuration.providers[0]!.api_key_env).toBe(`${stem}_2`);
  expect(state.configuration.gateway.api_key_env).toBe(stem);
  expect(state.configuration.decision.providers[0]!.param_env).toEqual({ shared_header: `${stem}_3` });
});

test("primary CLEAR protects its own transport consumer and Keep preserves the complete saved binding map", async ({ page, context }) => {
  const state = fixture();
  state.configuration.providers[0]!.param_env = { extra_header: "FIXTURE_HEADER", authorization: "FIXTURE_KEY" };
  const before = structuredClone(state.configuration);
  await installProviderFixture(context, state); await open(page); await edit(page);
  await page.getByRole("combobox", { name: "Credential action", exact: true }).selectOption("clear");
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Shared references cannot be replaced or cleared");
  await expect(page.getByRole("combobox", { name: "Credential action", exact: true })).toHaveValue("clear");
  expect(state.writes).toEqual([]); expect(state.configuration).toEqual(before);
  await page.getByRole("combobox", { name: "Credential action", exact: true }).selectOption("keep");
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[0]!.operations[0]).not.toHaveProperty("provider.param_env");
  expect(state.writes[0]!.operations[0]).toHaveProperty("credential", { action: "keep" });
  expect(state.configuration.providers[0]!.param_env).toEqual(before.providers[0]!.param_env);
  expect(state.configuration.providers[0]!.api_key_env).toBe(before.providers[0]!.api_key_env);
});
