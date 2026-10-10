import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import type { ProviderConfiguration, ProviderMutation, ProviderSelector } from "../../src/shared/api/types";

function fixture(): ProviderConfiguration {
  return { revision: "synthetic", write_available: true, gateway: { api_key_env: "JEV_BEDROCK_AWS_ACCESS_KEY_ID", has_api_key: true }, gateway_bootstrap_available: false,
    providers: [], models: [], decision: { enabled: false, default_provider: null, timeout_seconds: 1, providers: [{ id: "judge", protocol: "system_one", api_base: "https://example.test", api_key_env: "JEV_BEDROCK_AWS_ACCESS_KEY_ID_2" }] }, provider_types: ["vertex_ai", "bedrock"], decision_protocols: ["system_one"], presets: [
      { kind: "llm", id: "vertex_ai", display_name: "Vertex AI", type: "vertex_ai", api_base: null, api_key_env: null, setup_fields: [
        { key: "vertex_project", target: "params", label: "Project", label_zh: "项目", required: true }, { key: "vertex_location", target: "params", label: "Region", label_zh: "区域", required: true }, { key: "vertex_credentials", target: "param_env", label: "Service-account reference", label_zh: "服务账号引用", required: false }] },
      { kind: "llm", id: "bedrock", display_name: "Bedrock", type: "bedrock", api_base: null, api_key_env: null, setup_fields: [
        { key: "aws_region_name", target: "params", label: "AWS region", label_zh: "AWS 区域", required: true }, ...["aws_access_key_id", "aws_secret_access_key", "aws_session_token"].map((key) => ({ key, target: "param_env" as const, label: `${key} reference`, label_zh: `${key} 引用`, required: false }))] },
    ] };
}
async function install(context: BrowserContext, configuration = fixture()) {
  const state = { configuration, validations: [] as ProviderMutation[], writes: [] as ProviderMutation[], selectors: [] as ProviderSelector[], reject: false, rejectWrite: false, pause: null as null | (() => Promise<void>) };
  await context.route("**/v1/provider-**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === "GET") return route.fulfill({ json: state.configuration });
    if (path === "/v1/provider-connection-test") { state.selectors.push(request.postDataJSON()); return route.fulfill({ json: { status: "success", scope: "model_listing", model_count: null, provider_id: null, warnings: [] } }); }
    const payload: ProviderMutation = request.postDataJSON();
    if (path.endsWith("/validate")) {
      state.validations.push(payload); if (state.pause) await state.pause();
      if (state.reject) return route.fulfill({ status: 400, json: { error: { message: "synthetic sharing rejection" } } });
      return route.fulfill({ json: { ...state.configuration, valid: true, applied: false, imported: 0, skipped: 0 } });
    }
    state.writes.push(payload);
    if (state.rejectWrite) return route.fulfill({ status: 500, json: { error: { message: "synthetic write rejection" } } });
    for (const operation of payload.operations) if (operation.action === "upsert" && operation.kind === "llm") {
      const previous = state.configuration.providers.find((profile) => profile.id === operation.provider.id);
      const presence = { ...previous?.transport_credential_presence };
      for (const [key, action] of Object.entries(operation.transport_credentials ?? {})) if (action.action !== "keep") presence[key] = action.action === "set";
      state.configuration.providers = [...state.configuration.providers.filter((profile) => profile.id !== operation.provider.id), { ...previous, ...operation.provider, transport_credential_presence: presence }];
    }
    state.configuration.revision += "-saved";
    return route.fulfill({ json: { ...state.configuration, valid: true, applied: true, imported: 0, skipped: 0 } });
  });
  return state;
}
async function open(page: Page, brand: "Bedrock" | "Vertex AI") {
  await page.goto("/dashboard/tests/browser/supplier-cloud.html");
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByRole("button", { name: `${brand} ${brand === "Bedrock" ? "bedrock" : "vertex_ai"}`, exact: true }).click();
  if (brand === "Bedrock") await page.getByLabel("AWS region", { exact: true }).fill("us-east-1");
  else { await page.getByLabel("Project", { exact: true }).fill("synthetic-project"); await page.getByLabel("Region", { exact: true }).fill("us-central1"); }
}
const save = (page: Page) => page.getByRole("button", { name: "Validate and save", exact: true }).click();
const direct = (page: Page) => page.getByRole("combobox", { name: "Cloud authentication", exact: true }).selectOption("direct");

test("Vertex pasted JSON is canonicalized only in gateway payload; invalid JSON stays editable", async ({ page, context }) => {
  const state = await install(context); await open(page, "Vertex AI"); await direct(page);
  const input = page.getByLabel("Service-account JSON", { exact: true });
  await input.fill("{"); await expect(page.getByRole("alert")).toContainText("Paste a JSON object"); await expect(page.getByRole("button", { name: "Validate and save" })).toBeDisabled();
  const original = '{\n"type":"service_account",\n"private_key":"synthetic\\nmasked"\n}'; await input.fill(original);
  expect(await input.evaluate((element) => getComputedStyle(element).getPropertyValue("-webkit-text-security"))).toBe("disc");
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect.poll(() => state.selectors.length).toBe(1); expect(state.selectors[0]).toMatchObject({ transport_credentials: { vertex_credentials: { action: "set", value: JSON.stringify(JSON.parse(original)) } } });
  const connectionStatus = page.getByRole("status").filter({ hasText: "Model-list endpoint validated." });
  await expect(input).toHaveValue(original); await expect(connectionStatus).toBeVisible(); await expect(connectionStatus).not.toContainText("(null)");
  await save(page); await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[0]!.operations[0]).toMatchObject({ provider: { param_env: { vertex_credentials: "JEV_VERTEX_AI_VERTEX_CREDENTIALS" }, params: { vertex_project: "synthetic-project", vertex_location: "us-central1" } } });
  expect(JSON.stringify(state.configuration)).not.toContain("private_key");
});

test("native auth stays explicit; preset example project never becomes a saved value; AWS direct requires a pair", async ({ page, context }) => {
  const configuration = fixture(); configuration.presets[0]!.params = { vertex_project: "fake-preset-project", vertex_location: "us-central1" };
  const state = await install(context, configuration);
  await page.goto("/dashboard/tests/browser/supplier-cloud.html"); await page.getByRole("button", { name: "Add provider", exact: true }).click(); await page.getByRole("button", { name: "Vertex AI vertex_ai", exact: true }).click();
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(""); await expect(page.getByLabel("Project", { exact: true })).toHaveAttribute("placeholder", "my-project-id"); await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeDisabled();
  await page.getByLabel("Project", { exact: true }).fill("actual-synthetic-project"); await save(page); await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[0]!.operations[0]).toMatchObject({ provider: { params: { vertex_project: "actual-synthetic-project", vertex_location: "us-central1" }, param_env: {} } }); expect(state.writes[0]!.operations[0]).not.toHaveProperty("transport_credentials");
  await page.getByRole("button", { name: "Add provider", exact: true }).click(); await page.getByRole("button", { name: "Bedrock bedrock", exact: true }).click(); await page.getByLabel("AWS region", { exact: true }).fill("us-east-1"); await direct(page);
  await page.getByLabel("AWS access key ID", { exact: true }).fill("synthetic-id"); await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeDisabled();
  await page.getByLabel("AWS secret access key", { exact: true }).fill("synthetic-secret"); await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeEnabled();
  await page.getByLabel("AWS secret access key", { exact: true }).fill(""); await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeDisabled();
});

test("redacted saved account settings are preserved on keep and require re-entry when detaching cloud auth", async ({ page, context }) => {
  const configuration = fixture(); configuration.providers.push({ id: "cloud", display_name: "Saved Vertex", type: "vertex_ai", api_base: null, params: { vertex_project: "[configured]", vertex_location: "[configured]", vertex_credentials: "[configured]" }, param_env: { vertex_credentials: "EXISTING_JSON" }, transport_credential_presence: { vertex_credentials: true } });
  const state = await install(context, configuration); await page.goto("/dashboard/tests/browser/supplier-cloud.html"); await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(""); await expect(page.getByLabel("Service-account JSON", { exact: true })).toHaveValue(""); await save(page); await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[0]!.operations[0]).not.toHaveProperty("provider.params"); expect(JSON.stringify(state.writes)).not.toContain("[configured]");
  // The fixture returns the safe snapshot again, as the gateway does.
  state.configuration.providers[0]!.params = { vertex_project: "[configured]", vertex_location: "[configured]", vertex_credentials: "[configured]" };
  await page.getByRole("button", { name: "Edit", exact: true }).click(); await page.getByRole("combobox", { name: "Cloud authentication", exact: true }).selectOption("server"); await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeDisabled();
  await page.getByLabel("Project", { exact: true }).fill("actual-synthetic-project"); await page.getByLabel("Region", { exact: true }).fill("us-central1"); await save(page); await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[1]!.operations[0]).toMatchObject({ provider: { param_env: {}, params: { vertex_project: "actual-synthetic-project", vertex_location: "us-central1" } } }); expect(state.writes[1]!.operations[0]).not.toHaveProperty("transport_credentials");
});

for (const stage of ["validation", "write"] as const) test(`${stage} failure restores every cloud draft and blocks pending navigation`, async ({ page, context }) => {
  const state = await install(context); await open(page, "Bedrock"); await direct(page);
  await page.getByLabel("AWS access key ID", { exact: true }).fill("synthetic-id"); await page.getByLabel("AWS secret access key", { exact: true }).fill("synthetic-secret");
  await page.getByRole("combobox", { name: "AWS session token (optional) · Credential action", exact: true }).selectOption("clear");
  let release!: () => void; state.pause = () => new Promise<void>((resolve) => { release = resolve; }); state.reject = stage === "validation"; state.rejectWrite = stage === "write";
  await save(page); await expect.poll(() => !!release).toBe(true);
  await expect(page.getByLabel("AWS access key ID", { exact: true })).toHaveValue(""); await expect(page.getByLabel("AWS access key ID", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Leave workspace" }).click(); await expect(page.getByRole("heading", { name: "Add provider" })).toBeVisible();
  release(); await expect(page.getByRole("alert")).toBeVisible(); await expect(page.getByLabel("AWS access key ID", { exact: true })).toHaveValue("synthetic-id"); await expect(page.getByLabel("AWS secret access key", { exact: true })).toHaveValue("synthetic-secret");
  await expect(page.getByRole("combobox", { name: "AWS session token (optional) · Credential action", exact: true })).toHaveValue("clear");
  state.pause = null; state.reject = false; state.rejectWrite = false; await save(page); await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click(); await expect(page.getByLabel("AWS access key ID", { exact: true })).toHaveValue("");
  expect(state.writes.at(-1)!.operations[0]).toMatchObject({ transport_credentials: { aws_access_key_id: { action: "set", value: "synthetic-id" }, aws_secret_access_key: { action: "set", value: "synthetic-secret" }, aws_session_token: { action: "clear" } } });
});

test("bindings survive rename and blank replacement; explicit clear and server auth remain distinct", async ({ page, context }) => {
  const configuration = fixture(); configuration.providers.push({ id: "existing", display_name: "Existing cloud", type: "bedrock", api_base: null, params: { aws_region_name: "us-east-1", aws_access_key_id: "[configured]" }, param_env: { aws_access_key_id: "EXISTING_ID", aws_secret_access_key: "EXISTING_SECRET" }, transport_credential_presence: { aws_access_key_id: true, aws_secret_access_key: false } });
  const state = await install(context, configuration); await page.goto("/dashboard/tests/browser/supplier-cloud.html"); await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Cloud authentication", exact: true })).toHaveValue("direct"); await expect(page.getByLabel("AWS access key ID", { exact: true })).toHaveValue("");
  await page.getByLabel("Display name", { exact: true }).fill("Renamed cloud"); await page.getByLabel("AWS access key ID", { exact: true }).fill("temporary"); await page.getByLabel("AWS access key ID", { exact: true }).fill("");
  await page.getByRole("combobox", { name: "AWS secret access key · Credential action", exact: true }).selectOption("clear"); await save(page); await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[0]!.operations[0]).toMatchObject({ provider: { id: "existing", param_env: { aws_access_key_id: "EXISTING_ID", aws_secret_access_key: "EXISTING_SECRET" } }, transport_credentials: { aws_access_key_id: { action: "keep" }, aws_secret_access_key: { action: "clear" } } });
  expect(state.writes[0]!.operations[0]).not.toHaveProperty("provider.params");
  await page.getByRole("button", { name: "Edit", exact: true }).click(); await page.getByRole("combobox", { name: "Cloud authentication", exact: true }).selectOption("server"); await expect(page.getByText("The server must already have access", { exact: false })).toBeVisible(); await save(page); await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[1]!.operations[0]).toMatchObject({ provider: { param_env: {} } }); expect(state.writes[1]!.operations[0]).not.toHaveProperty("transport_credentials");
});

test("sharing rejection offers recovery; reserved refs are generated independently without ordinary reference entry", async ({ page, context }) => {
  const state = await install(context); await open(page, "Bedrock"); await direct(page); await page.getByLabel("AWS access key ID", { exact: true }).fill("synthetic-id"); await page.getByLabel("AWS secret access key", { exact: true }).fill("synthetic-secret"); state.reject = true; await save(page);
  await expect(page.getByRole("alert")).toContainText("Retry with Keep"); await expect(page.getByLabel("AWS access key ID", { exact: true })).toHaveValue("synthetic-id");
  expect(state.validations[0]!.operations[0]).toMatchObject({ provider: { param_env: { aws_access_key_id: "JEV_BEDROCK_AWS_ACCESS_KEY_ID_3" } } });
  state.reject = false; await save(page); await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add provider", exact: true }).click(); await page.getByRole("button", { name: "Bedrock bedrock", exact: true }).click(); await page.getByLabel("AWS region", { exact: true }).fill("us-east-1"); await direct(page); await page.getByLabel("AWS access key ID", { exact: true }).fill("synthetic-second"); await page.getByLabel("AWS secret access key", { exact: true }).fill("synthetic-second-secret"); await save(page); await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.configuration.providers[0]!.param_env!.aws_access_key_id).not.toBe(state.configuration.providers[1]!.param_env!.aws_access_key_id);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain("synthetic-id"); expect(page.url()).not.toContain("synthetic");
});

for (const scheme of ["light", "dark"] as const) test(`narrow ${scheme} supports keyboard, locale changes, dirty cloud cancel`, async ({ page, context }) => {
  await install(context); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: scheme }); await open(page, "Bedrock"); await direct(page);
  const input = page.getByLabel("AWS access key ID", { exact: true }); await input.focus(); await page.keyboard.type("synthetic-keyboard"); await expect(input).toHaveAttribute("type", "password");
  page.once("dialog", (dialog) => dialog.dismiss()); await page.getByRole("button", { name: "Leave workspace" }).click(); await expect(input).toHaveValue("synthetic-keyboard");
  await page.getByRole("button", { name: "中文", exact: true }).click(); await expect(page.getByRole("combobox", { name: "云平台认证", exact: true })).toHaveValue("direct"); await expect(page.getByLabel("AWS 访问密钥 ID", { exact: true })).toHaveValue("synthetic-keyboard");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  page.once("dialog", (dialog) => dialog.accept()); await page.getByLabel("AWS 访问密钥 ID", { exact: true }).focus(); await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "添加供应商", exact: true })).toBeFocused();
});
