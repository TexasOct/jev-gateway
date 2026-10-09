import { test, expect } from "../fixtures/provider-browser";
import { configuredModelEdit, openProviderModels, providerModelGroup } from "../fixtures/open-provider-models";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";
import type { MetadataItem } from "../../src/shared/api/types";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import sources from "../../src/features/providers/assets/sources.json" with { type: "json" };
import { en } from "../../src/shared/i18n/en";

function fixture(): ProviderFixtureState { return { configuration: providerFixture(), writes: [], validations: [], selectors: [] }; }
async function open(page: Page) {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture provider", exact: true })).toBeVisible();
}
async function models(page: Page) {
  const group = await openProviderModels(page, "fixture", { importModels: true });
  await expect(group.getByRole("heading", { name: "Configured models", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Supplier connections", exact: true })).toBeVisible();
  return group;
}
async function selectAlpha(page: Page) {
  const group = await models(page);
  await group.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect(group.getByRole("region", { name: "Find models", exact: true })).toHaveAttribute("aria-busy", "false");
  await group.getByLabel("Search fetched models").fill("alpha");
  await group.getByRole("button", { name: "Select all visible unconfigured models" }).click();
  return group.getByRole("region", { name: "fixture/alpha", exact: true });
}
async function editModel(page: Page, id = "fixture/alpha") {
  const providerId = id.slice(0, id.indexOf("/"));
  await providerModelGroup(page, providerId).getByRole("region", { name: id, exact: true }).getByRole("button", { name: "Edit model", exact: true }).click();
  return page.getByRole("dialog");
}
async function savePreview(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function discardModel(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  if (await dialog.getByRole("button", { name: "Discard changes", exact: true }).count()) await dialog.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
function evidence(tools: boolean | null, prices: Array<number | null> = [1], applicable = true): MetadataItem {
  const fields = { tools, input_per_million: prices.find((value) => value != null) ?? null };
  const sources = prices.map((value, index) => ({ source: `fixture-${index}`, source_provider: "fixture", source_model: "alpha", fetched_at: "2026-09-30T12:00:00Z", applicable, fields: { tools: { value: tools, source_field: "tools" }, input_per_million: { value, source_field: "price", unit: "USD/M tokens" } } }));
  return { upstream_model: "alpha", fields, sources, warnings: [], metadata: { version: 1, sources: sources.map(({ source_provider, source_model, ...source }, index) => ({ ...source, id: `fixture-${index}`, provider_id: source_provider, model_id: source_model })) } };
}

for (const change of ["endpoint", "transport", "credential revision"] as const) {
  test(`refresh invalidates delayed query and automatic evidence after ${change} changes`, async ({ page, context }) => {
    const state = fixture();
    state.configuration.models[0]!.metadata = { version: 1, sources: [], fields: {
      tools: { status: "confirmed", value: false, method: "source", source_ids: [] },
      output_per_million: { status: "confirmed", value: 2, method: "source", source_ids: [] },
    } };
    await installProviderFixture(context, state); await open(page); await models(page);
    await configuredModelEdit(page, "fixture", "existing").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Tools", { exact: true })).toHaveValue("false");
    await dialog.getByLabel("Input price (USD / million tokens)").fill("9");
    state.rejectWrite = 409;
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Configuration changed");
    let release!: () => void;
    state.delayMetadata = () => new Promise<void>((resolve) => { release = resolve; });
    state.metadataEvidence = { ...evidence(true, [88]), upstream_model: "existing" };
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = (input, init) => original(input, String(input).includes("/v1/provider-metadata") ? { ...init, signal: undefined } : init);
    });
    const calls = state.metadataCalls ?? 0;
    await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
    await expect.poll(() => state.metadataCalls).toBe(calls + 1);
    state.configuration.revision = "external-revision";
    if (change === "endpoint") state.configuration.providers[0]!.api_base = "https://new-endpoint.test/v1";
    if (change === "transport") state.configuration.providers[0]!.type = "anthropic";
    await dialog.getByRole("button", { name: "Reload current configuration", exact: true }).click();
    await expect.poll(() => state.gatewayHeaders?.filter((entry) => entry.path === "/v1/provider-configuration").length).toBeGreaterThan(1);
    const oldResponse = page.waitForResponse((response) => response.url().endsWith("/v1/provider-metadata"));
    release(); await (await oldResponse).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await expect(dialog.getByLabel("Output price (USD / million tokens)")).toHaveValue("");
    await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
    await expect(dialog.getByLabel("Tools", { exact: true })).toHaveValue("");
    await dialog.getByText("Sources and evidence", { exact: true }).click();
    await expect(dialog.locator("[data-current-evidence]")).not.toContainText("88");
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    expect(state.writes).toHaveLength(1);
    state.metadataEvidence = undefined;
    await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
    await expect(dialog.getByLabel("Tools", { exact: true })).toHaveValue("false");
    await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.writes[1]?.expected_revision).toBe("external-revision");
    expect(state.configuration.models.find((entry) => entry.upstream_model === "existing")?.metadata?.sources?.some((source) => source.fields?.input_per_million?.value === 88)).toBe(false);
  });
}

for (const order of ["lookup to discovery", "discovery to lookup"] as const) {
  test(`latest evidence remains consistent for ${order}, unknowns and manual overrides`, async ({ page, context }) => {
    const state = fixture(); await installProviderFixture(context, state); await open(page);
    await selectAlpha(page);
    let dialog = await editModel(page);
    await dialog.getByLabel("Input price (USD / million tokens)").fill("9");
    await savePreview(page);
    const update = async (value: boolean | null) => {
      state.metadataEvidence = evidence(value);
      if (order === "lookup to discovery") {
        state.discoveryEvidence = evidence(value);
        await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
      } else await page.getByRole("button", { name: "Query model metadata", exact: true }).click();
      await expect(page.getByRole("region", { name: "Find models", exact: true })).toHaveAttribute("aria-busy", "false");
    };
    await update(true);
    dialog = await editModel(page);
    await expect(dialog.getByLabel("Tools", { exact: true })).toHaveValue("true");
    await discardModel(page);
    await update(false);
    dialog = await editModel(page);
    await expect(dialog.getByLabel("Tools", { exact: true })).toHaveValue("false");
    await dialog.getByText("Sources and evidence", { exact: true }).click();
    await expect(dialog.locator("[data-current-evidence]")).toContainText('"tools": false');
    await expect(dialog.locator("[data-current-evidence]")).not.toContainText('"tools": true');
    await discardModel(page);
    await update(null);
    dialog = await editModel(page);
    await expect(dialog.getByLabel("Tools", { exact: true })).toHaveValue("false");
    await expect(dialog.getByLabel("Tools", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByRole("alert").filter({ hasText: "Current source evidence is unknown or conflicting" }).first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
    await dialog.getByText("Sources and evidence", { exact: true }).click();
    await expect(dialog.locator("[data-current-evidence]")).toContainText('"tools": null');
    await discardModel(page);
    // Re-enrich the remaining required fields, then commit a manual capability.
    state.metadataEvidence = undefined;
    await page.getByRole("button", { name: "Query model metadata", exact: true }).click();
    dialog = await editModel(page);
    await dialog.getByLabel("Tools", { exact: true }).selectOption("true");
    await savePreview(page);
    await update(false);
    dialog = await editModel(page);
    await expect(dialog.getByLabel("Tools", { exact: true })).toHaveValue("true");
    await dialog.getByText("Sources and evidence", { exact: true }).click();
    await expect(dialog.locator("[data-current-evidence]")).toContainText('"tools": false');
    await dialog.getByText("Earlier evidence retained for provenance", { exact: true }).click();
    await expect(dialog.locator("details details pre")).toContainText('"value": true');
    expect(state.writes).toEqual([]);
  });
}

test("null beside known evidence prefills, reference-only stays unknown and real conflicts block import", async ({ page, context }) => {
  const state = fixture(); state.metadataEvidence = evidence(false, [null, 1]);
  await installProviderFixture(context, state); await open(page); await selectAlpha(page);
  const dialog = await editModel(page);
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("1");
  await expect(dialog.getByText("Sources conflict. Review and enter a value.", { exact: true })).toHaveCount(0);
  state.metadataEvidence = evidence(true, [7], false);
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("1");
  await expect(dialog.getByText("Reference only: not verified for this serving provider.", { exact: true })).toHaveCount(2);
  state.metadataEvidence = evidence(false, [1, 2]);
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("1");
  await expect(dialog.getByText("Sources conflict. Review and enter a value.", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await discardModel(page);
  await expect(page.getByRole("button", { name: "Confirm and import selected models (1)" })).toBeDisabled();
  expect(state.writes).toEqual([]);
  state.metadataEvidence = undefined;
  await page.getByRole("button", { name: "Query model metadata", exact: true }).click();
  const resolved = await editModel(page);
  await expect(resolved.getByLabel("Input price (USD / million tokens)")).toHaveValue("1.5");
  await expect(resolved.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await resolved.getByLabel("Input price (USD / million tokens)").fill("9");
  await savePreview(page);
  expect(state.writes).toEqual([]);
});

for (const edit of ["action", "password"] as const) {
  test(`candidate credential ${edit} edits and model draft navigation respect rejected and accepted discard`, async ({ page, context }) => {
    const state = fixture(); await installProviderFixture(context, state); await open(page);
    await selectAlpha(page);
    const dialog = await editModel(page);
    await dialog.getByLabel("Input price (USD / million tokens)").fill("9");
    await savePreview(page);
    page.once("dialog", (prompt) => prompt.dismiss());
    await page.locator('[data-provider-edit="fixture"][data-provider-kind="llm"]').click();
    await expect(page.getByText("1 / 1 selected / visible unconfigured", { exact: true })).toBeVisible();
    const retained = await editModel(page);
    await expect(retained.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
    await discardModel(page);
    page.once("dialog", (prompt) => prompt.accept());
    await page.locator('[data-provider-edit="fixture"][data-provider-kind="llm"]').click();
    await page.getByLabel("Credential action").selectOption("set");
    await page.getByLabel("New provider credential", { exact: true }).fill("synthetic-original");
    await page.getByRole("button", { name: "Test connection", exact: true }).click();
    await expect.poll(() => state.connectionSelectors?.length).toBe(1);
    if (edit === "action") await page.getByLabel("Credential action").selectOption("clear");
    else await page.getByLabel("New provider credential", { exact: true }).fill("synthetic-replacement");
    await expect(page.getByText("Model-list endpoint validated. Models returned", { exact: false })).toHaveCount(0);
    page.once("dialog", (prompt) => prompt.dismiss());
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await expect(page.getByLabel("Credential action")).toHaveValue(edit === "action" ? "clear" : "set");
    if (edit === "password") await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("synthetic-replacement");
    page.once("dialog", (prompt) => prompt.accept());
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await models(page);
    await expect(page.getByText("0 / 0 selected / visible unconfigured", { exact: true })).toBeVisible();
    await expect(page.getByText("No models fetched. Retry or add a model manually.", { exact: true })).toBeVisible();
    expect(state.writes).toEqual([]);
  });
}

test("credential clear sends a value-free local clear and reports inherited effective presence", async ({ page, context }) => {
  const state = fixture(); state.inheritedCredential = true; await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Credential action").selectOption("clear");
  await expect(page.getByText("Clear removes this reference's local key", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Validate and save" }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  const operation = state.writes[0]!.operations[0]!;
  expect(operation).toMatchObject({ action: "upsert", credential: { action: "clear" } });
  if (operation.action === "upsert") expect(operation.credential).toEqual({ action: "clear" });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByText("A credential is configured. Its value is never returned.", { exact: true })).toBeVisible();
});

for (const write of ["import", "save"] as const) {
  test(`${write} remains applied after catalog GET failure and read retry never duplicates PUT`, async ({ page, context }) => {
    const state = fixture(); await installProviderFixture(context, state); await open(page);
    if (write === "import") {
      await selectAlpha(page);
      await expect(page.getByLabel("I reviewed the capabilities", { exact: false })).toBeEnabled();
      await page.getByLabel("I reviewed the capabilities", { exact: false }).check();
      state.rejectCatalogRead = 500;
      await page.getByRole("button", { name: "Confirm and import selected models (1)" }).click();
      await expect(page.getByRole("status").filter({ hasText: "The configuration was saved. The strategy catalog could not be refreshed." })).toBeVisible();
      await expect(page.getByText("fixture/alpha", { exact: true }).first()).toBeVisible();
      expect(state.configuration.models.some((model) => model.name === "fixture/alpha")).toBe(true);
    } else {
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByLabel("Display name").fill("Applied despite read failure");
      state.rejectCatalogRead = 500;
      await page.getByRole("button", { name: "Validate and save" }).click();
      await expect(page.getByText("Provider saved. The strategy catalog could not be refreshed.", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Applied despite read failure", exact: true })).toBeVisible();
    }
    // The module that committed the write owns the refresh error and recovery.
    await expect(page.getByRole("alert")).toHaveCount(1);
    await expect(page.getByRole("alert")).toContainText(write === "import" ? "Model changes were saved" : "The configuration write succeeded");
    expect(state.writes).toHaveLength(1); expect(state.catalogReads).toBe(1);
    await page.getByRole("button", { name: "Monitoring", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await openProviderModels(page, "fixture", { importModels: write === "import" });
    await expect(page.getByRole("alert")).toContainText(write === "import" ? "Model changes were saved" : "The configuration write succeeded");
    expect(state.writes).toHaveLength(1); expect(state.catalogReads).toBe(1);
    state.rejectCatalogRead = undefined;
    await page.getByRole("alert").getByRole("button", { name: write === "import" ? "Retry" : "Retry catalog refresh", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(state.catalogReads).toBe(2); expect(state.writes).toHaveLength(1);
    if (write === "import") {
      await page.getByRole("button", { name: "Strategy workflow", exact: true }).click();
      await page.getByRole("button", { name: "Canvas information", exact: false }).click();
      await page.getByText("Legacy editor controls", { exact: true }).click();
      const control = page.getByLabel("Add fixture/alpha to label", { exact: true });
      await expect(control).toBeVisible(); await control.selectOption("balanced/default");
      await expect(page.getByRole("button", { name: "Remove fixture/alpha from balanced/default", exact: true })).toBeVisible();
      expect(state.writes).toHaveLength(1);
    }
  });
}

test("broken local supplier image uses the neutral fallback without changing identity geometry", async ({ page, context }) => {
  const state = fixture(); state.configuration.providers[0]!.brand_id = "deepseek";
  await context.route("**/dashboard/assets/deepseek*.svg", (route) => route.fulfill({ status: 404, body: "" }));
  await installProviderFixture(context, state); await open(page);
  const fallback = page.locator('[title="Neutral icon or initials fallback"]');
  await expect(fallback).toHaveText("FI"); await expect(fallback.locator("img")).toHaveCount(0);
  const bounds = await fallback.boundingBox(); expect(bounds?.width).toBe(96); expect(bounds?.height).toBe(44);
});

test("committed model update reports refresh failure under its supplier and retries one GET without another PUT", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page); await models(page);
  await configuredModelEdit(page, "fixture", "existing").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Input price (USD / million tokens)").fill("9");
  state.rejectCatalogRead = 500;
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveText("Model changes were saved. The strategy catalog could not be refreshed. Retry refresh to read the saved configuration. Retry");
  expect(state.configuration.models[0]!.cost.input_per_million).toBe(9);
  expect(state.writes).toHaveLength(1); expect(state.catalogReads).toBe(1);
  expect(state.writes[0]!.operations).toHaveLength(1);
  expect(state.writes[0]!.operations[0]).toMatchObject({ action: "update_model", model_id: "fixture/existing", model: { upstream_model: "existing", cost: { input_per_million: 9, output_per_million: 2 } } });
  await page.getByRole("button", { name: "Monitoring", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await models(page);
  await expect(page.getByRole("alert")).toContainText("Model changes were saved");
  state.rejectCatalogRead = undefined;
  await page.getByRole("alert").getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.catalogReads).toBe(2); expect(state.writes).toHaveLength(1);
  expect(state.validations).toEqual(state.writes);
});

test("provider editing preserves ID, clears secrets, and sends the shared contract", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Instance ID", exact: true })).not.toBeVisible();
  await page.getByText("Advanced configuration", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Instance ID", exact: true })).toHaveAttribute("readonly", "");
  await page.getByRole("textbox", { name: "Display name" }).fill("Renamed instance");
  await page.getByLabel("Credential action").selectOption("set");
  await page.getByLabel("New provider credential", { exact: true }).fill("synthetic-provider-secret");
  await expect(page.getByLabel("Allow discovery on private networks", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Validate and save" }).click();
  await expect(page.getByRole("heading", { name: "Renamed instance" })).toBeVisible();
  expect(state.writes[0]!.operations[0]).toMatchObject({ action: "upsert", kind: "llm", provider: { id: "fixture", display_name: "Renamed instance", allow_private_network: false }, credential: { action: "set", value: "synthetic-provider-secret" } });
  for (const field of ["has_api_key", "params", "param_env"]) expect(state.writes[0]!.operations[0]).not.toHaveProperty(`provider.${field}`);
  expect(state.validations[0]).toEqual(state.writes[0]);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Credential action").selectOption("set");
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }))).not.toContain("synthetic-provider-secret");
});

test("supplier aliases, custom entry, icon picker and System One are usable", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByLabel("Search supplier, alias or transport").fill("gpt");
  await expect(page.getByRole("button", { name: "OpenAI openai" })).toBeVisible();
  await page.getByLabel("Search supplier, alias or transport").fill("missing");
  await page.getByRole("button", { name: "Custom provider", exact: true }).click();
  await page.getByLabel("Endpoint URL").fill("https://example.test/custom");
  await page.getByText("Advanced configuration", { exact: true }).click();
  await expect(page.getByLabel("Instance ID", { exact: true })).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Choose icon", exact: true }).click();
  await page.getByRole("button", { name: "Cloud", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cloud", exact: true })).toHaveAttribute("aria-pressed", "true");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Add provider", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Decision providers", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Decision protocol")).toHaveValue("system_one");
  await expect(page.getByText("System One requires the full evaluation URL, including its path.")).toBeVisible();
  await page.getByLabel("Model (optional)").fill("judge-model");
  await page.getByRole("button", { name: "Validate and save" }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[0]!.operations[0]).toMatchObject({ kind: "decision", provider: { id: "judge", protocol: "system_one", model: "judge-model" }, credential: { action: "keep" } });
});

test("selection scope, metadata edits and explicit import refresh the catalog", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page); await selectAlpha(page);
  await expect(page.getByText("The fetched list is incomplete.", { exact: false })).toBeVisible();
  await expect(page.getByText("1 / 1 selected / visible unconfigured", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm and import selected models (1)" })).toBeDisabled();
  const dialog = await editModel(page);
  await dialog.getByLabel("Input price (USD / million tokens)").fill("9");
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect(dialog.getByLabel("Output price (USD / million tokens)")).toHaveValue("3");
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("9");
  await expect(dialog.getByLabel("Tools", { exact: true })).toHaveValue("false");
  await savePreview(page);
  await page.getByLabel("I reviewed the capabilities", { exact: false }).check();
  await page.getByRole("button", { name: "Confirm and import selected models (1)" }).click();
  await expect(page.getByText("Selected models imported. The strategy catalog has been refreshed.", { exact: false })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]!.operations[0]).toMatchObject({ action: "import", provider_id: "fixture", confirmed: true, models: [{ upstream_model: "alpha", cost: { input_per_million: 9, output_per_million: 3 } }] });
  const stored = state.configuration.models.find((model) => model.upstream_model === "alpha")!;
  expect(stored.metadata?.sources?.[0]).toMatchObject({ id: "native_listing-0", source: "native_listing", provider_id: "fixture", model_id: "alpha", fields: { input_per_million: { source_unit: "USD/token" }, max_input_tokens: { value: 80000 }, structured_output: { value: true } }, pricing: { tiers: [{ min_prompt_tokens: 200000 }], overrides: [{ utc_start: 1, utc_end: 2 }] } });
  expect(stored.metadata?.sources?.[0]).not.toHaveProperty("source_provider");
  expect(stored.metadata?.fields?.input_per_million).toMatchObject({ status: "confirmed", value: 9, method: "manual", source_ids: ["native_listing-0"] });
  expect(stored.metadata?.fields?.vision).toMatchObject({ status: "confirmed", value: false, method: "source" });
  expect(stored.metadata?.confirmation?.method).toBe("reviewed");
  expect(state.configuration.models.some((model) => model.upstream_model === "beta")).toBe(false);
});

test("unknown metadata blocks import and failed operations remain retryable", async ({ page, context }) => {
  const state = fixture(); state.metadataUnknown = true; state.rejectDiscovery = 503;
  await installProviderFixture(context, state); await open(page); await models(page);
  await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The operation failed");
  await expect(page.getByText("synthetic-private-upstream-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByLabel("Upstream model ID").fill("manual-model");
  await page.getByRole("button", { name: "Add model manually", exact: true }).click();
  await page.getByRole("button", { name: "Query model metadata", exact: true }).click();
  const dialog = await editModel(page, "fixture/manual-model");
  await expect(dialog.getByLabel("Tools", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("");
  await discardModel(page);
  await expect(page.getByRole("button", { name: "Confirm and import selected models (1)" })).toBeDisabled();
  expect(state.writes).toEqual([]);
});

test("revision conflicts preserve the draft and secret and use the refreshed revision", async ({ page, context }) => {
  const state = fixture(); state.rejectWrite = 409;
  await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Display name").fill("Conflict draft");
  await page.getByLabel("Credential action").selectOption("set");
  await page.getByLabel("New provider credential", { exact: true }).fill("synthetic-conflict-key");
  await page.getByRole("button", { name: "Validate and save" }).click();
  await expect(page.getByRole("alert")).toContainText("Configuration changed elsewhere");
  await expect(page.getByLabel("Display name")).toHaveValue("Conflict draft");
  await expect(page.getByLabel("New provider credential", { exact: true })).toHaveValue("synthetic-conflict-key");
  await expect(page.getByText("synthetic-rejected-secret-must-not-render")).toHaveCount(0);
  state.configuration.revision = "r-new";
  await page.getByRole("button", { name: "Reload current configuration" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Credential action").selectOption("keep");
  await page.getByRole("button", { name: "Validate and save" }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  expect(state.writes[1]?.expected_revision).toBe("r-new");
});

test("candidate private-network probing blocks pending navigation and clears results after leaving", async ({ page, context }) => {
  const state = fixture(); let release!: () => void;
  state.delayConnection = () => new Promise<void>((resolve) => { release = resolve; });
  await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByText("Advanced configuration", { exact: true }).click();
  await page.getByLabel("Allow discovery on private networks", { exact: true }).check();
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect.poll(() => state.connectionSelectors?.length).toBe(1);
  expect(state.connectionSelectors?.[0]).toMatchObject({ provider: { id: "fixture", type: "openai", allow_private_network: true }, credential: { action: "keep" } });
  await page.getByRole("button", { name: "Decision providers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fixture judge", exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole("button", { name: "Test connection", exact: true })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Decision providers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture judge", exact: true })).toBeVisible();
  await expect(page.getByText("fixture/alpha", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "LLM providers", exact: true }).click();
  await models(page);
  await expect(page.getByText("No models fetched. Retry or add a model manually.")).toBeVisible();
  expect(state.writes).toEqual([]); expect(state.selectors).toEqual([]);
});

test("read-only and unauthorized configuration reads expose the appropriate recovery", async ({ page, context }) => {
  const state = fixture(); state.configuration.write_available = false;
  await installProviderFixture(context, state); await open(page);
  await expect(page.getByRole("button", { name: "Add provider", exact: true })).toBeDisabled();
  await expect(page.getByText("Configuration writes are disabled.", { exact: false })).toBeVisible();
  state.rejectRead = 401;
  await page.getByRole("button", { name: "Monitoring", exact: true }).click();
  await page.getByRole("button", { name: "Suppliers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  await expect(page.getByText("synthetic-read-error")).toHaveCount(0);
});

test("verified DeepSeek artwork loads locally, preserves proportions and retains attribution", async ({ page, context }) => {
  const state = fixture(); state.configuration.presets.push({ kind: "llm", id: "deepseek", display_name: "DeepSeek", brand_id: "deepseek", icon_id: null, type: "deepseek", api_base: "https://api.deepseek.com/v1", api_key_env: "DEEPSEEK_API_KEY" });
  await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  const image = page.getByRole("button", { name: "DeepSeek deepseek" }).locator("img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const geometry = await image.evaluate((element) => { const img = element as HTMLImageElement; const rect = img.getBoundingClientRect(); return { width: rect.width, height: rect.height, ratio: img.naturalWidth / img.naturalHeight, src: img.src }; });
  expect(geometry.width / geometry.height).toBeCloseTo(geometry.ratio, 1);
  expect(new URL(geometry.src).pathname).toMatch(/^\/dashboard\/assets\/deepseek.*\.svg$/);
  await page.getByText("Supplier artwork and attribution", { exact: true }).click();
  const credits = page.locator("details").filter({ has: page.getByText(en.pmAssetSources, { exact: true }) });
  await expect(credits.getByText(en.pmAssetUsage, { exact: true })).toBeVisible();
  await expect(credits.locator("pre")).toHaveText(readFileSync(new URL("../../src/features/providers/assets/LICENSE-lobe-icons.txt", import.meta.url), "utf8"));
  await expect(credits.getByRole("link", { name: en.pmAssetCollection, exact: true })).toHaveAttribute("href", sources.collection.source);
  await expect(credits.getByRole("link", { name: "MIT", exact: true })).toHaveAttribute("href", sources.collection.license_source);
  const deepseek = credits.locator("li").filter({ hasText: /^DeepSeek:/ });
  await expect(deepseek.getByRole("link", { name: en.pmAssetOriginal, exact: true })).toHaveAttribute("href", sources.collection.asset_source_prefix + sources.icons.deepseek.original_file);
  await expect(deepseek.getByRole("link", { name: en.pmAssetReference, exact: true })).toHaveAttribute("href", sources.icons.deepseek.official_reference);
});

test("metadata retry remains a metadata operation and batch values need an explicit null decision", async ({ page, context }) => {
  const state = fixture(); state.rejectMetadata = 503;
  await installProviderFixture(context, state); await open(page); await models(page);
  await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The operation failed");
  await page.getByRole("button", { name: "Select all visible unconfigured models" }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByLabel("I reviewed the capabilities", { exact: false })).toBeEnabled();
  let dialog = await editModel(page);
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("1.5");
  await discardModel(page);
  expect(state.metadataCalls).toBe(2); expect(state.selectors).toHaveLength(1);
  await page.getByText("Batch values for selected models (2)", { exact: true }).click();
  await page.locator("#batch-input_per_million").fill("7");
  const batch = page.locator("summary").filter({ hasText: /^Batch values for selected models/ }).locator("..");
  await batch.getByLabel("Context window (tokens): Confirm unknown limit (null)").check();
  await batch.getByLabel("Maximum output (tokens): Confirm unknown limit (null)").check();
  await page.getByRole("button", { name: "Apply entered batch values to selected models" }).click();
  for (const id of ["alpha", "beta"]) {
    dialog = await editModel(page, `fixture/${id}`);
    await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("7");
    await expect(dialog.getByLabel("Context window (tokens): Confirm unknown limit (null)")).toBeChecked();
    await discardModel(page);
  }
  await page.getByLabel("I reviewed the capabilities", { exact: false }).check();
  await page.getByRole("button", { name: "Confirm and import selected models (2)" }).click();
  await expect(page.getByText("Selected models imported. The strategy catalog has been refreshed.", { exact: false })).toBeVisible();
  expect(state.writes[0]?.operations[0]).toMatchObject({ action: "import", models: [{ upstream_model: "alpha", context_window: null, max_output_tokens: null, cost: { input_per_million: 7 } }, { upstream_model: "beta", context_window: null, max_output_tokens: null, cost: { input_per_million: 7 } }] });
  expect(state.configuration.models.find((model) => model.upstream_model === "alpha")?.metadata?.fields?.context_window).toMatchObject({ status: "confirmed", value: null, method: "manual" });
});

test("native endpoint presets preserve null and their generated credential reference", async ({ page, context }) => {
  const state = fixture(); state.configuration.presets.push({ kind: "llm", id: "anthropic", display_name: "Anthropic", brand_id: "anthropic", icon_id: null, type: "anthropic", api_base: null, api_key_env: "ANTHROPIC_API_KEY" });
  await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByLabel("Search supplier, alias or transport").fill("claude");
  await page.getByRole("button", { name: "Anthropic anthropic", exact: true }).click();
  await expect(page.getByLabel("Use the transport's default endpoint")).toBeChecked();
  await expect(page.getByLabel("Endpoint URL")).toBeDisabled();
  await expect(page.getByLabel("Credential reference", { exact: true })).not.toBeVisible();
  await page.getByText("Advanced configuration", { exact: true }).click();
  const reference = await page.getByLabel("Credential reference", { exact: true }).inputValue();
  expect(reference).toMatch(/^JEV_ANTHROPIC_[A-F0-9]{32}_API_KEY$/);
  await expect(page.getByLabel("Instance ID", { exact: true })).toHaveValue("anthropic");
  await expect(page.getByLabel("Instance ID", { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "Validate and save" })).toBeDisabled();
  await page.getByLabel("New provider credential", { exact: true }).fill("synthetic-anthropic-key");
  await expect(page.getByLabel("Credential reference", { exact: true })).toHaveValue(reference);
  await page.getByRole("button", { name: "Validate and save" }).click();
  await expect(page.getByRole("heading", { name: "Anthropic", exact: true })).toBeVisible();
  expect(state.writes[0]?.operations[0]).toEqual({ action: "upsert", kind: "llm", provider: { id: "anthropic", display_name: "Anthropic", type: "anthropic", api_base: null, api_key_env: reference, brand_id: "anthropic", icon_id: null, allow_private_network: false }, credential: { action: "set", value: "synthetic-anthropic-key" } });
  expect(state.validations).toEqual(state.writes);
});

test("saving a tested provider opens models with its saved identity for explicit import", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect.poll(() => state.connectionSelectors?.length).toBe(1);
  await page.getByRole("button", { name: "Validate and save" }).click();
  await expect(page.getByText("Provider saved.", { exact: true })).toBeVisible();
  await selectAlpha(page);
  const dialog = await editModel(page);
  await expect(dialog.getByLabel("Input price (USD / million tokens)")).toHaveValue("1.5");
  await dialog.getByLabel("Input price (USD / million tokens)").fill("8");
  await savePreview(page);
  await expect(page.getByText("1 / 1 selected / visible unconfigured", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await page.getByLabel("I reviewed the capabilities", { exact: false }).check();
  await page.getByRole("button", { name: "Confirm and import selected models (1)" }).click();
  await expect(page.getByText("Selected models imported. The strategy catalog has been refreshed.", { exact: false })).toBeVisible();
  expect(state.writes[1]?.operations[0]).toMatchObject({ action: "import", provider_id: "fixture", models: [{ upstream_model: "alpha", cost: { input_per_million: 8 }, metadata: { fields: { input_per_million: { status: "confirmed", value: 8, method: "manual" } } } }] });
});

for (const width of [320, 390]) for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
  test(`model confirmation fits ${width}px ${locale} ${scheme}`, async ({ page, context }) => {
    const state = fixture(); await installProviderFixture(context, state);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.addInitScript((language) => localStorage.setItem("jev-dashboard-locale", language), locale);
    await page.goto("/dashboard/");
    await openProviderModels(page, "fixture", { locale, importModels: true });
    await page.getByLabel(locale === "en" ? "Upstream model ID" : "上游模型 ID").fill("fixture-long-model-name-to-check-responsive-confirmation");
    await page.getByRole("button", { name: locale === "en" ? "Add model manually" : "手动添加模型", exact: true }).click();
    await page.getByRole("button", { name: locale === "en" ? "Query model metadata" : "查询模型元数据", exact: true }).click();
    await page.getByRole("region", { name: "fixture/fixture-long-model-name-to-check-responsive-confirmation", exact: true }).getByRole("button", { name: locale === "en" ? "Edit model" : "编辑模型", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(locale === "en" ? "Tools" : "工具", { exact: true })).toHaveValue("false");
    await dialog.getByText(locale === "en" ? "Sources and evidence" : "来源与证据", { exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByLabel(locale === "en" ? "Tools" : "工具", { exact: true }).focus();
    expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
  });
}

for (const width of [320, 390, 1280]) for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
  test(`provider form fits ${width}px ${locale} ${scheme}`, async ({ page, context }) => {
    const state = fixture(); await installProviderFixture(context, state);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.addInitScript((language) => localStorage.setItem("jev-dashboard-locale", language), locale);
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: locale === "en" ? "Suppliers" : "供应商", exact: true }).click();
    await page.getByRole("button", { name: locale === "en" ? "Edit" : "编辑", exact: true }).click();
    await expect(page.getByLabel(locale === "en" ? "Display name" : "显示名称")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel(locale === "en" ? "Display name" : "显示名称").focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-provider-edit="fixture"][data-provider-kind="llm"]')).toBeFocused();
  });
}
