import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
import type { ProviderKind, ProviderPreset, ProviderProfile } from "../../src/shared/api/types";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";

// Read the shared templates and installed transports once when this module loads.
// LiteLLM uses its bundled metadata and cannot open a network connection here.
const registry = JSON.parse(execFileSync("uv", ["run", "--no-sync", "--offline", "python", "-B", "-c", `
import json
import socket

def block_network(*args, **kwargs):
    raise RuntimeError("Registry loading must not open network connections.")

socket.socket.connect = block_network
socket.socket.connect_ex = block_network
from jev_gateway.provider_presets import PRESETS, provider_presets
from litellm import provider_list
from jev_gateway.strategy.decision_provider import registered_protocols
print(json.dumps({"presets": provider_presets(), "llm_ids": list(PRESETS), "provider_types": list(provider_list), "decision_protocols": list(registered_protocols())}, ensure_ascii=False))
`], {
  cwd: fileURLToPath(new URL("../../../", import.meta.url)),
  encoding: "utf8",
  env: { ...process.env, VIRTUAL_ENV: fileURLToPath(new URL("../../../.venv", import.meta.url)), LITELLM_MODE: "PRODUCTION", LITELLM_LOCAL_MODEL_COST_MAP: "True" },
})) as { presets: ProviderPreset[]; llm_ids: string[]; provider_types: string[]; decision_protocols: string[] };

const llmPresets = registry.presets.filter((preset) => preset.kind === "llm");
const decisionPresets = registry.presets.filter((preset) => preset.kind === "decision");
type Locale = "en" | "zh-CN";
const messages = (locale: Locale) => locale === "en" ? en : zhCN;
const templateName = (preset: ProviderPreset) => `${preset.display_name} ${preset.type ?? preset.protocol}`;
function presetByID(id: string): ProviderPreset {
  const preset = registry.presets.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Missing shared preset: ${id}`);
  return preset;
}
function fixture(): ProviderFixtureState {
  const configuration = providerFixture();
  configuration.presets = structuredClone(registry.presets);
  configuration.provider_types = [...registry.provider_types];
  configuration.decision_protocols = [...registry.decision_protocols];
  return { configuration, writes: [], validations: [], selectors: [] };
}
async function open(page: Page, context: BrowserContext, state: ProviderFixtureState, locale: Locale = "en") {
  await installProviderFixture(context, state);
  await page.addInitScript((language) => localStorage.setItem("jev-dashboard-locale", language), locale);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: messages(locale).providerModels, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture provider", exact: true })).toBeVisible();
}
async function browse(page: Page, locale: Locale = "en") {
  await page.getByRole("button", { name: messages(locale).pmAdd, exact: true }).click();
  await expect(page.getByLabel(messages(locale).pmSupplierSearch)).toBeVisible();
}
async function choose(page: Page, preset: ProviderPreset, locale: Locale = "en") {
  await browse(page, locale);
  await page.getByRole("button", { name: templateName(preset), exact: true }).click();
  await expect(page.getByLabel(messages(locale).pmID, { exact: true })).toBeVisible();
}
async function cancel(page: Page, locale: Locale = "en", dirty = false) {
  if (dirty) page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: messages(locale).pmCancel, exact: true }).first().click();
  await expect(page.getByRole("button", { name: messages(locale).pmAdd, exact: true })).toBeFocused();
}
function expectedProfile(preset: ProviderPreset, endpoint = preset.api_base, setup: Record<string, string> = {}): ProviderProfile {
  const profile: ProviderProfile = {
    id: preset.id, display_name: preset.display_name, brand_id: preset.brand_id ?? null, icon_id: preset.icon_id ?? null,
    api_base: endpoint, api_key_env: preset.api_key_env ?? null,
    ...(preset.kind === "llm" ? { type: preset.type, allow_private_network: preset.allow_private_network === true } : { protocol: preset.protocol, model: preset.model ?? null }),
  };
  for (const field of preset.setup_fields ?? []) {
    const value = setup[field.key];
    if (value) {
      if (field.target === "params") (profile.params ??= {})[field.key] = value;
      else (profile.param_env ??= {})[field.key] = value;
    }
  }
  return profile;
}
async function preview(page: Page, state: ProviderFixtureState) {
  await page.locator("form").first().getByRole("button", { name: en.pmCandidate, exact: true }).click();
  await page.getByRole("region", { name: en.pmModels, exact: true }).getByRole("button", { name: en.pmCandidate, exact: true }).click();
  await expect.poll(() => state.selectors.length).toBe(1);
  await expect(page.getByLabel(en.pmModelSearch)).toBeVisible();
}
async function save(page: Page, state: ProviderFixtureState) {
  await page.getByRole("button", { name: en.pmSave, exact: true }).click();
  await expect(page.getByText(en.pmSaved, { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.validations).toEqual(state.writes);
}

// Keep the registry subprocess and browser work in one worker for this file.
test.describe.configure({ mode: "default" });
test.beforeAll(() => {
  expect(llmPresets).toHaveLength(41);
  expect(decisionPresets).toHaveLength(1);
  expect(llmPresets.map((preset) => preset.id)).toEqual(registry.llm_ids);
  for (const preset of llmPresets) expect(registry.provider_types, preset.id).toContain(preset.type);
  for (const preset of decisionPresets) expect(registry.decision_protocols, preset.id).toContain(preset.protocol);
});

const templateGroups = [llmPresets.slice(0, 21), llmPresets.slice(21), decisionPresets];
for (const [index, presets] of templateGroups.entries()) {
  test(`shared registry templates ${index + 1} open with exact defaults and cancel without writes`, async ({ page, context }) => {
    const state = fixture();
    const initialConfiguration = structuredClone(state.configuration);
    await open(page, context, state);
    if (presets[0]!.kind === "decision") await page.getByRole("button", { name: en.pmDecision, exact: true }).click();
    for (const preset of presets) await test.step(preset.id, async () => {
      await browse(page);
      const button = page.getByRole("button", { name: templateName(preset), exact: true });
      await expect(button).toBeVisible();
      await expect(button.locator("[data-provider-icon]")).toHaveAttribute("data-provider-icon", preset.icon_id ?? preset.brand_id ?? "automatic");
      await button.click();
      await expect(page.getByLabel(en.pmID, { exact: true })).toHaveValue(preset.id);
      await expect(page.getByLabel(en.pmName, { exact: true })).toHaveValue(preset.display_name);
      await expect(page.getByRole("combobox", { name: preset.kind === "llm" ? en.pmType : en.pmProtocol, exact: true })).toHaveValue(preset.type ?? preset.protocol!);
      await expect(page.getByLabel(en.pmEndpoint, { exact: true })).toHaveValue(preset.api_base ?? "");
      await expect(page.getByLabel(en.pmEnv, { exact: true })).toHaveValue(preset.api_key_env ?? "");
      if (preset.kind === "llm") {
        await expect(page.getByLabel(en.pmNativeEndpoint)).toBeChecked({ checked: preset.api_base === null });
        if (preset.api_base === "") await expect(page.getByLabel(en.pmNativeEndpoint)).toBeDisabled();
        if (preset.api_base === null) await expect(page.getByLabel(en.pmEndpoint, { exact: true })).toBeDisabled();
        else await expect(page.getByLabel(en.pmEndpoint, { exact: true })).toBeEnabled();
        await expect(page.getByLabel(en.pmPrivate, { exact: true })).toBeChecked({ checked: preset.allow_private_network === true });
      }
      const picker = page.locator("[data-provider-icon-picker]");
      await expect(picker.locator("[data-provider-icon]")).toHaveAttribute("data-provider-icon", preset.icon_id ?? preset.brand_id ?? "automatic");
      if (preset.icon_id) {
        await expect.poll(() => picker.locator("img").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        expect(new URL(await picker.locator("img").getAttribute("src") ?? "", page.url()).origin).toBe(new URL(page.url()).origin);
      }
      if (preset.docs_url) await expect(page.getByRole("link", { name: en.pmSetupDocs, exact: true })).toHaveAttribute("href", preset.docs_url);
      if (preset.setup_instructions) await expect(page.getByText(preset.setup_instructions, { exact: true })).toBeVisible();
      for (const field of preset.setup_fields ?? []) {
        const input = page.getByLabel(field.label, { exact: true });
        await expect(input).toBeVisible();
        await expect(input).toHaveValue("");
        await expect(input).toHaveJSProperty("required", field.required);
      }
      const incomplete = preset.api_base === "" || (preset.setup_fields ?? []).some((field) => field.required);
      const saveButton = page.getByRole("button", { name: en.pmSave, exact: true });
      if (incomplete) await expect(saveButton).toBeDisabled();
      else await expect(saveButton).toBeEnabled();
      if (preset.kind === "llm") {
        const candidateButton = page.getByRole("button", { name: en.pmCandidate, exact: true });
        if (incomplete) await expect(candidateButton).toBeDisabled();
        else await expect(candidateButton).toBeEnabled();
      }
      await page.getByText(en.pmAdvanced, { exact: true }).click();
      await expect(page.getByLabel(en.pmBrand, { exact: true })).toHaveValue(preset.brand_id ?? "");
      await cancel(page);
      expect(state.writes).toEqual([]);
      expect(state.validations).toEqual([]);
      expect(state.selectors).toEqual([]);
      expect(state.configuration).toEqual(initialConfiguration);
    });
  });
}

const groupedByRegion = new Map<string, ProviderPreset[]>();
for (const preset of llmPresets) {
  const key = `${preset.brand_id}/${preset.type}`;
  groupedByRegion.set(key, [...groupedByRegion.get(key) ?? [], preset]);
}
const regionalGroups = [...groupedByRegion.values()].filter((presets) => presets.length > 1);
for (const locale of ["en", "zh-CN"] as const) {
  test(`${locale} searches English and Chinese aliases and keeps regional templates distinct`, async ({ page, context }) => {
    const state = fixture();
    await open(page, context, state, locale);
    await browse(page, locale);
    expect(regionalGroups.length).toBeGreaterThanOrEqual(5);
    for (const presets of regionalGroups) {
      const aliases = presets[0]!.aliases!.filter((alias) => presets.every((preset) => preset.aliases?.includes(alias)));
      const english = aliases.find((alias) => /^[A-Za-z]/.test(alias));
      const chinese = aliases.find((alias) => /[\u3400-\u9fff]/.test(alias));
      expect(english).toBeDefined();
      expect(chinese).toBeDefined();
      for (const alias of [english!, chinese!]) {
        await page.getByLabel(messages(locale).pmSupplierSearch).fill(alias);
        for (const preset of presets) await expect(page.getByRole("button", { name: templateName(preset), exact: true })).toBeVisible();
      }
      for (const preset of presets) {
        await page.getByRole("button", { name: templateName(preset), exact: true }).click();
        await expect(page.getByLabel(messages(locale).pmID, { exact: true })).toHaveValue(preset.id);
        await expect(page.getByLabel(messages(locale).pmEndpoint, { exact: true })).toHaveValue(preset.api_base ?? "");
        await expect(page.getByLabel(messages(locale).pmEnv, { exact: true })).toHaveValue(preset.api_key_env ?? "");
        await cancel(page, locale);
        await browse(page, locale);
        await page.getByLabel(messages(locale).pmSupplierSearch).fill(english!);
      }
    }
    await page.getByLabel(messages(locale).pmSupplierSearch).fill("不存在-no-supplier-match");
    await expect(page.getByText(messages(locale).pmNoResults, { exact: true })).toBeVisible();
    expect(state.writes).toEqual([]);
    expect(state.validations).toEqual([]);
    expect(state.selectors).toEqual([]);
  });
}

const setupValues: Record<string, string> = {
  api_version: "2024-10-21", vertex_project: "synthetic-project", vertex_location: "us-central1",
  vertex_credentials: "TEST_VERTEX_CREDENTIALS", aws_region_name: "us-east-1", aws_access_key_id: "TEST_AWS_ACCESS_KEY_ID",
  aws_secret_access_key: "TEST_AWS_SECRET_ACCESS_KEY", aws_session_token: "TEST_AWS_SESSION_TOKEN",
};
// These are boundary cases with different setup contracts, not another preset registry.
for (const id of ["azure", "vertex_ai", "bedrock", "cloudflare", "ollama", "lmstudio"]) {
  test(`${id} sends declared setup, credential references and private defaults to preview and save`, async ({ page, context }) => {
    const state = fixture(); const preset = presetByID(id);
    await open(page, context, state);
    await choose(page, preset);
    let endpoint = preset.api_base;
    if (endpoint === "") {
      await expect(page.getByRole("button", { name: en.pmSave, exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: en.pmCandidate, exact: true })).toBeDisabled();
      endpoint = id === "azure" ? "https://synthetic-resource.openai.azure.com" : id === "cloudflare" ? "https://api.cloudflare.com/client/v4/accounts/synthetic-account/ai/v1" : "http://localhost:1234/v1";
      await page.getByLabel(en.pmEndpoint, { exact: true }).fill(endpoint);
    }
    const values: Record<string, string> = {};
    for (const field of preset.setup_fields ?? []) {
      if (field.required) {
        await expect(page.getByRole("button", { name: en.pmSave, exact: true })).toBeDisabled();
        await expect(page.getByRole("button", { name: en.pmCandidate, exact: true })).toBeDisabled();
        await page.getByLabel(field.label, { exact: true }).fill("   ");
        await expect(page.getByRole("button", { name: en.pmSave, exact: true })).toBeDisabled();
        await expect(page.getByRole("button", { name: en.pmCandidate, exact: true })).toBeDisabled();
      }
      values[field.key] = setupValues[field.key]!;
      expect(values[field.key], field.key).toBeDefined();
      await page.getByLabel(field.label, { exact: true }).fill(`  ${values[field.key]}  `);
    }
    const expected = expectedProfile(preset, endpoint, values);
    await preview(page, state);
    expect(state.selectors[0]).toEqual({ provider: expected, credential: { action: "keep" } });
    expect(state.writes).toEqual([]);
    expect(state.validations).toEqual([]);
    await save(page, state);
    expect(state.writes[0]).toEqual({ expected_revision: "r1", operations: [{ action: "upsert", kind: "llm", provider: expected, credential: { action: "keep" } }] });
    expect(state.configuration.models.map((model) => model.name)).toEqual(["fixture/existing"]);
  });
}

for (const id of ["vertex_ai", "bedrock"]) {
  test(`${id} omits optional credential references when using platform credentials`, async ({ page, context }) => {
    const state = fixture(); const preset = presetByID(id); const values: Record<string, string> = {};
    await open(page, context, state); await choose(page, preset);
    for (const field of preset.setup_fields ?? []) if (field.required) {
      values[field.key] = setupValues[field.key]!;
      await page.getByLabel(field.label, { exact: true }).fill(values[field.key]!);
    }
    await preview(page, state);
    expect(state.selectors[0]).toEqual({ provider: expectedProfile(preset, preset.api_base, values), credential: { action: "keep" } });
    await save(page, state);
    expect(state.writes[0]?.operations[0]).toEqual({ action: "upsert", kind: "llm", provider: expectedProfile(preset, preset.api_base, values), credential: { action: "keep" } });
    expect(state.writes[0]?.operations[0]).not.toHaveProperty("provider.param_env");
  });
}

for (const id of ["azure", "vertex_ai", "bedrock"]) {
  test(`${id} stops sending template setup after changing transport`, async ({ page, context }) => {
    const state = fixture(); const preset = presetByID(id);
    await open(page, context, state); await choose(page, preset);
    for (const field of preset.setup_fields ?? []) await page.getByLabel(field.label, { exact: true }).fill(setupValues[field.key]!);
    if (preset.api_base === null) await page.getByLabel(en.pmNativeEndpoint).uncheck();
    await page.getByLabel(en.pmEndpoint, { exact: true }).fill("https://synthetic-proxy.test/v1");
    await page.getByRole("combobox", { name: en.pmType, exact: true }).selectOption("openai");
    for (const field of preset.setup_fields ?? []) await expect(page.getByLabel(field.label, { exact: true })).toHaveCount(0);
    const expected = { ...expectedProfile(preset, "https://synthetic-proxy.test/v1"), type: "openai" };
    await preview(page, state);
    expect(state.selectors[0]).toEqual({ provider: expected, credential: { action: "keep" } });
    await save(page, state);
    expect(state.writes[0]?.operations[0]).toEqual({ action: "upsert", kind: "llm", provider: expected, credential: { action: "keep" } });
  });
}

test("Chinese cloud setup labels, guidance and cancellation leave configuration untouched", async ({ page, context }) => {
  const state = fixture(); const original = structuredClone(state.configuration);
  await open(page, context, state, "zh-CN");
  for (const preset of llmPresets.filter((entry) => entry.setup_fields?.length)) {
    await choose(page, preset, "zh-CN");
    await expect(page.getByText(preset.setup_instructions_zh!, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: zhCN.pmSetupDocs, exact: true })).toHaveAttribute("href", preset.docs_url!);
    for (const field of preset.setup_fields!) {
      const input = page.getByLabel(field.label_zh, { exact: true });
      await expect(input).toHaveJSProperty("required", field.required);
      await input.fill(setupValues[field.key]!);
    }
    if (preset.api_base === "") await page.getByLabel(zhCN.pmEndpoint, { exact: true }).fill("https://synthetic-resource.openai.azure.com");
    await expect(page.getByRole("button", { name: zhCN.pmSave, exact: true })).toBeEnabled();
    await cancel(page, "zh-CN", true);
  }
  expect(state.configuration).toEqual(original);
  expect(state.writes).toEqual([]); expect(state.validations).toEqual([]); expect(state.selectors).toEqual([]);
});

for (const kind of ["llm", "decision"] as const satisfies readonly ProviderKind[]) {
  test(`${kind} duplicate template suggests -2 using only IDs of the same kind`, async ({ page, context }) => {
    const state = fixture(); const preset = kind === "llm" ? presetByID("openai") : decisionPresets[0]!;
    const profiles = kind === "llm" ? state.configuration.providers : state.configuration.decision.providers;
    const otherKind = kind === "llm" ? state.configuration.decision.providers : state.configuration.providers;
    profiles.push(expectedProfile(preset, "https://existing.test/v1"));
    otherKind.push({ id: `${preset.id}-2`, api_base: "https://other-kind.test/v1", ...(kind === "llm" ? { protocol: "system_one" } : { type: "openai" }) });
    await open(page, context, state);
    if (kind === "decision") await page.getByRole("button", { name: en.pmDecision, exact: true }).click();
    await choose(page, preset);
    await expect(page.getByLabel(en.pmID, { exact: true })).toHaveValue(`${preset.id}-2`);
    await cancel(page);
    expect(profiles).toHaveLength(2); expect(state.writes).toEqual([]); expect(state.validations).toEqual([]);
  });
}

for (const id of ["anthropic", "gemini", "system_one"]) {
  test(`${id} saves native null or explicit decision endpoint with the registry identity`, async ({ page, context }) => {
    const state = fixture(); const preset = presetByID(id);
    await open(page, context, state);
    if (preset.kind === "decision") await page.getByRole("button", { name: en.pmDecision, exact: true }).click();
    await choose(page, preset);
    const endpoint = preset.kind === "decision" ? "https://synthetic-judge.test/evaluate" : null;
    if (endpoint) await page.getByLabel(en.pmEndpoint, { exact: true }).fill(endpoint);
    await save(page, state);
    expect(state.writes[0]?.operations[0]).toEqual({ action: "upsert", kind: preset.kind, provider: expectedProfile(preset, endpoint), credential: { action: "keep" } });
  });
}

for (const id of ["azure", "vertex_ai", "bedrock"]) {
  test(`${id} ordinary edits omit redacted params and parameter references in preview and save`, async ({ page, context }) => {
    const state = fixture(); const preset = presetByID(id);
    state.configuration.providers.push({ ...expectedProfile(preset, preset.api_base || "https://configured-cloud.test/v1"), has_api_key: true, params: { timeout: "[configured]", ...Object.fromEntries((preset.setup_fields ?? []).filter((field) => field.target === "params").map((field) => [field.key, "[configured]"])) }, param_env: { extra_header: "EXISTING_HEADER_REF" } });
    await open(page, context, state);
    await page.getByRole("heading", { name: preset.display_name, exact: true }).locator("../..").getByRole("button", { name: en.pmEdit, exact: true }).click();
    for (const field of preset.setup_fields ?? []) await expect(page.getByLabel(field.label, { exact: true })).toHaveCount(0);
    await page.getByLabel(en.pmName, { exact: true }).fill(`${preset.display_name} renamed`);
    await preview(page, state);
    const expected = { ...expectedProfile(preset, preset.api_base || "https://configured-cloud.test/v1"), display_name: `${preset.display_name} renamed` };
    expect(state.selectors[0]).toEqual({ provider: expected, credential: { action: "keep" } });
    await save(page, state);
    expect(state.writes[0]?.operations[0]).toEqual({ action: "upsert", kind: "llm", provider: expected, credential: { action: "keep" } });
    expect(JSON.stringify([state.selectors, state.writes])).not.toContain("[configured]");
    expect(state.writes[0]?.operations[0]).not.toHaveProperty("provider.params");
    expect(state.writes[0]?.operations[0]).not.toHaveProperty("provider.param_env");
  });
}
