import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";
import type { Page } from "@playwright/test";

function fixture(): ProviderFixtureState {
  const configuration = providerFixture();
  configuration.provider_types.push("vertex_ai", "bedrock");
  configuration.presets.push(
    { kind: "llm", id: "vertex_ai", display_name: "Vertex AI", type: "vertex_ai", api_base: null, api_key_env: null, setup_fields: [
      { key: "vertex_project", target: "params", label: "Project", label_zh: "项目", required: true },
      { key: "vertex_location", target: "params", label: "Region", label_zh: "区域", required: true },
      { key: "vertex_credentials", target: "param_env", label: "Service-account reference", label_zh: "服务账号引用", required: false },
    ] },
    { kind: "llm", id: "bedrock", display_name: "Bedrock", type: "bedrock", api_base: null, api_key_env: null, setup_fields: [
      { key: "aws_region_name", target: "params", label: "AWS region", label_zh: "AWS 区域", required: true },
      ...["aws_access_key_id", "aws_secret_access_key", "aws_session_token"].map((key) => ({ key, target: "param_env" as const, label: `${key} reference`, label_zh: `${key} 引用`, required: false })),
    ] },
  );
  return { configuration, writes: [], validations: [], selectors: [] };
}
async function open(page: Page, brand: "Bedrock" | "Vertex AI") {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByRole("button", { name: `${brand} ${brand === "Bedrock" ? "bedrock" : "vertex_ai"}`, exact: true }).click();
  if (brand === "Bedrock") await page.getByLabel("AWS region", { exact: true }).fill("us-east-1");
  else {
    await page.getByLabel("Project", { exact: true }).fill("synthetic-project");
    await page.getByLabel("Region", { exact: true }).fill("us-central1");
  }
  await page.getByRole("combobox", { name: "Cloud authentication", exact: true }).selectOption("direct");
}
async function fillAWS(page: Page) {
  await page.getByLabel("AWS access key ID", { exact: true }).fill("synthetic-aws-id");
  await page.getByLabel("AWS secret access key", { exact: true }).fill("synthetic-aws-secret");
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
}
async function editCloud(page: Page, name = "Bedrock") {
  await page.getByRole("heading", { name, exact: true }).locator("../..").getByRole("button", { name: "Edit", exact: true }).click();
}
async function noReadback(page: Page, state: ProviderFixtureState, secrets: string[]) {
  const snapshot = await page.evaluate(async () => {
    const response = await fetch("/v1/provider-configuration");
    return { response: await response.json(), local: { ...localStorage }, session: { ...sessionStorage }, url: location.href, cookie: document.cookie };
  });
  for (const secret of secrets) {
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(JSON.stringify(state.configuration)).not.toContain(secret);
    expect(JSON.stringify(state.metadataSelectors ?? [])).not.toContain(secret);
    await expect(page.locator("body")).not.toContainText(secret);
  }
  expect(state.unexpected ?? []).toEqual([]);
}

test("whole App canonicalizes Vertex JSON only in transport actions and returns presence after save", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page, "Vertex AI");
  const input = page.getByLabel("Service-account JSON", { exact: true });
  await input.fill("{");
  await expect(page.getByRole("alert")).toContainText("Paste a JSON object");
  await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeDisabled();
  const original = '{\n"type":"service_account",\n"private_key":"synthetic-vertex-key\\nmasked"\n}';
  await input.fill(original);
  expect(await input.evaluate((element) => getComputedStyle(element).getPropertyValue("-webkit-text-security"))).toBe("disc");
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect.poll(() => state.connectionSelectors?.length).toBe(1);
  expect(state.connectionSelectors?.[0]).toMatchObject({ transport_credentials: { vertex_credentials: { action: "set", value: JSON.stringify(JSON.parse(original)) } } });
  await expect(input).toHaveValue(original);
  expect(state.writes).toEqual([]);
  await save(page);
  expect(state.validations).toEqual(state.writes);
  expect(state.writes[0]?.operations).toHaveLength(1);
  expect(state.writes[0]?.operations[0]).toMatchObject({ action: "upsert", provider: { param_env: { vertex_credentials: "JEV_VERTEX_AI_VERTEX_CREDENTIALS" }, params: { vertex_project: "synthetic-project", vertex_location: "us-central1" } }, transport_credentials: { vertex_credentials: { action: "set", value: JSON.stringify(JSON.parse(original)) } } });
  expect(state.configuration.providers.find((provider) => provider.id === "vertex_ai")?.transport_credential_presence).toEqual({ vertex_credentials: true });
  await noReadback(page, state, ["synthetic-vertex-key"]);
  await editCloud(page, "Vertex AI");
  await expect(input).toHaveValue("");
  await save(page);
  expect(state.writes[1]?.operations[0]).not.toHaveProperty("transport_credentials");
  expect(state.configuration.providers.find((provider) => provider.id === "vertex_ai")?.transport_credential_presence?.vertex_credentials).toBe(true);
});

test("whole App AWS direct credentials replace once, keep blank drafts and clear presence without detaching references", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page, "Bedrock");
  await page.getByLabel("AWS access key ID", { exact: true }).fill("synthetic-aws-id");
  await expect(page.getByRole("button", { name: "Validate and save", exact: true })).toBeDisabled();
  await page.getByLabel("AWS secret access key", { exact: true }).fill("synthetic-aws-secret");
  await page.getByLabel("AWS session token (optional)", { exact: true }).fill("synthetic-aws-token");
  await save(page);
  const saved = state.configuration.providers.find((provider) => provider.id === "bedrock")!;
  expect(saved.transport_credential_presence).toEqual({ aws_access_key_id: true, aws_secret_access_key: true, aws_session_token: true });
  const references = { ...saved.param_env };
  expect(new Set(Object.values(references)).size).toBe(3);
  await editCloud(page);
  for (const label of ["AWS access key ID", "AWS secret access key", "AWS session token (optional)"]) await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
  await page.getByLabel("Display name", { exact: true }).fill("Renamed cloud");
  await page.getByLabel("AWS access key ID", { exact: true }).fill("synthetic-temporary");
  await page.getByLabel("AWS access key ID", { exact: true }).fill("");
  await page.getByRole("combobox", { name: "AWS session token (optional) · Credential action", exact: true }).selectOption("clear");
  await save(page);
  expect(state.writes[1]?.expected_revision).toBe(state.validations[1]?.expected_revision);
  expect(state.writes[1]?.operations[0]).toMatchObject({ provider: { id: "bedrock", param_env: references }, transport_credentials: { aws_access_key_id: { action: "keep" }, aws_session_token: { action: "clear" } } });
  expect(state.writes[1]?.operations[0]).not.toHaveProperty("transport_credentials.aws_secret_access_key");
  expect(state.configuration.providers.find((provider) => provider.id === "bedrock")?.transport_credential_presence).toEqual({ aws_access_key_id: true, aws_secret_access_key: true, aws_session_token: false });
  await noReadback(page, state, ["synthetic-aws-id", "synthetic-aws-secret", "synthetic-aws-token", "synthetic-temporary"]);
  await editCloud(page, "Renamed cloud");
  await page.getByRole("combobox", { name: "Cloud authentication", exact: true }).selectOption("server");
  await page.getByLabel("AWS region", { exact: true }).fill("us-east-1");
  await save(page);
  expect(state.writes[2]?.operations[0]).toMatchObject({ provider: { param_env: {} } });
  expect(state.writes[2]?.operations[0]).not.toHaveProperty("transport_credentials");
  expect(state.configuration.providers.find((provider) => provider.id === "bedrock")?.transport_credential_presence).toEqual({});
});

for (const stage of ["validation", "write", "unauthorized"] as const) test(`whole App cloud ${stage} failure retains all captured drafts and retries once`, async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page, "Bedrock"); await fillAWS(page);
  await page.getByLabel("AWS session token (optional)", { exact: true }).fill("synthetic-session-retry");
  let release!: () => void;
  if (stage === "validation") { state.rejectValidation = 400; state.delayValidation = () => new Promise<void>((resolve) => { release = resolve; }); }
  else { state.rejectWrite = stage === "unauthorized" ? 401 : 500; state.delayWrite = () => new Promise<void>((resolve) => { release = resolve; }); }
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await expect(page.getByLabel("AWS access key ID", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("AWS secret access key", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("AWS session token (optional)", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("AWS access key ID", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Add provider", exact: true })).toBeVisible();
  release();
  if (stage === "unauthorized") {
    await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
    await expect(page.locator(".app-shell")).toBeHidden();
    await page.locator("#gateway-api-key").fill("synthetic-cloud-reconnect-key");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  } else await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("AWS access key ID", { exact: true })).toHaveValue("synthetic-aws-id");
  await expect(page.getByLabel("AWS secret access key", { exact: true })).toHaveValue("synthetic-aws-secret");
  await expect(page.getByLabel("AWS session token (optional)", { exact: true })).toHaveValue("synthetic-session-retry");
  expect(state.configuration.providers.some((provider) => provider.id === "bedrock")).toBe(false);
  state.rejectValidation = undefined;
  await save(page);
  expect(state.writes).toHaveLength(stage === "validation" ? 1 : 2);
  expect(state.configuration.providers.find((provider) => provider.id === "bedrock")?.transport_credential_presence?.aws_secret_access_key).toBe(true);
  await noReadback(page, state, ["synthetic-aws-id", "synthetic-aws-secret", "synthetic-session-retry"]);
});

test("whole App shared transport CLEAR rejects truthfully, preserves every binding and permits Keep", async ({ page, context }) => {
  const state = fixture();
  state.configuration.providers.push({ id: "cloud", display_name: "Shared cloud", type: "bedrock", api_base: null, api_key_env: null, params: { aws_region_name: "[configured]" }, param_env: { aws_access_key_id: "CLOUD_ID", aws_secret_access_key: "CLOUD_SECRET", aws_session_token: "SHARED_TOKEN" }, transport_credential_presence: { aws_access_key_id: true, aws_secret_access_key: true, aws_session_token: true } });
  state.configuration.decision.providers[0]!.api_key_env = "SHARED_TOKEN";
  await installProviderFixture(context, state); await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click(); await editCloud(page, "Shared cloud");
  await page.getByRole("combobox", { name: "AWS session token (optional) · Credential action", exact: true }).selectOption("clear");
  const before = structuredClone(state.configuration);
  await page.getByRole("button", { name: "Validate and save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Shared references cannot be replaced or cleared");
  await expect(page.getByRole("combobox", { name: "AWS session token (optional) · Credential action", exact: true })).toHaveValue("clear");
  expect(state.configuration).toEqual(before); expect(state.writes).toEqual([]);
  await page.getByRole("combobox", { name: "AWS session token (optional) · Credential action", exact: true }).selectOption("keep");
  await save(page);
  expect(state.configuration.providers.find((provider) => provider.id === "cloud")?.param_env?.aws_session_token).toBe("SHARED_TOKEN");
});

test("whole App inherited transport presence survives CLEAR while local-only presence becomes false", async ({ page, context }) => {
  const state = fixture();
  state.configuration.providers.push({ id: "cloud", display_name: "Inherited cloud", type: "bedrock", api_base: null, api_key_env: null, params: { aws_region_name: "[configured]" }, param_env: { aws_access_key_id: "CLOUD_ID", aws_secret_access_key: "CLOUD_SECRET", aws_session_token: "INHERITED_TOKEN" }, transport_credential_presence: { aws_access_key_id: true, aws_secret_access_key: true, aws_session_token: true } });
  state.inheritedTransportCredentials = { INHERITED_TOKEN: true };
  await installProviderFixture(context, state); await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click(); await editCloud(page, "Inherited cloud");
  await page.getByRole("combobox", { name: "AWS session token (optional) · Credential action", exact: true }).selectOption("clear");
  await save(page);
  expect(state.configuration.providers.find((provider) => provider.id === "cloud")?.transport_credential_presence?.aws_session_token).toBe(true);
  expect(state.writes[0]?.operations[0]).toMatchObject({ transport_credentials: { aws_session_token: { action: "clear" } } });
});
