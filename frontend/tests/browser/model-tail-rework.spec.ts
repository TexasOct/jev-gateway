import { test, expect } from "../fixtures/provider-browser";
import { configuredModelEdit, openProviderModels } from "../fixtures/open-provider-models";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";
import type { MetadataItem } from "../../src/shared/api/types";
import type { Page, TestInfo } from "@playwright/test";

const fresh = (): ProviderFixtureState => ({ configuration: providerFixture(), writes: [], validations: [], selectors: [] });
function evidence(id: string): MetadataItem {
  const fields = { tools: false, vision: false, json_mode: true, reasoning: false, temperature: true, reasoning_effort: [], input_per_million: 2, output_per_million: 3, cache_read_per_million: 0, cache_write_per_million: 4, context_window: 64000, max_output_tokens: 4096 };
  const quotes = Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, { value, source_field: `raw.${field}`, ...(field.endsWith("per_million") ? { unit: "USD/M tokens" } : {}) }]));
  const source = { source: "native_listing", applicable: true, fetched_at: "2026-10-05T01:00:00Z", source_updated_at: "2026-10-01", fields: quotes };
  return { upstream_model: id, fields, sources: [{ ...source, source_provider: "fixture", source_model: id }], warnings: [], metadata: { version: 1, sources: [{ ...source, id: "known-source", provider_id: "fixture", model_id: id }] } };
}
async function open(page: Page, importModels = false) {
  await page.goto("/dashboard/");
  await openProviderModels(page, "fixture", { importModels });
}
async function record(info: TestInfo, state: ProviderFixtureState, details: unknown) {
  await info.attach("requests-and-observations.json", { body: JSON.stringify({ discovery: state.selectors, metadata: state.metadataSelectors, validations: state.validations, writes: state.writes, details }, null, 2), contentType: "application/json" });
}

test("mixed source failure retry targets one item, preserves batch selection and avoids discovery", async ({ page, context }, info) => {
  const state = fresh(); await installProviderFixture(context, state);
  const metadata: Array<{ provider_id: string; upstream_models: string[]; refresh: boolean }> = [];
  await context.route("**/v1/provider-metadata", async (route) => {
    const body = route.request().postDataJSON() as typeof metadata[number]; metadata.push(body);
    const items = body.upstream_models.map((id) => {
      const item = evidence(id);
      if (metadata.length === 1 && id === "alpha") return { ...item, fields: {}, sources: [], warnings: ["metadata_source_unavailable"] };
      if (metadata.length === 1 && id === "beta") return { ...item, fields: {}, sources: [], warnings: [] };
      return item;
    });
    await route.fulfill({ json: { fetched_at: "2026-10-05T01:00:00Z", stale: metadata.length === 1, items } });
  });
  await open(page, true); await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  const alpha = page.locator("label").filter({ has: page.getByRole("checkbox", { name: "fixture/alpha", exact: true }) });
  const beta = page.locator("label").filter({ has: page.getByRole("checkbox", { name: "fixture/beta", exact: true }) });
  await expect(alpha).toContainText("Metadata fetch failed: retry or complete manually");
  await expect(beta).toContainText("Partial or unknown");
  await page.getByRole("button", { name: "Select all visible unconfigured models", exact: true }).click();
  await page.getByRole("button", { name: "Retry: fixture/alpha", exact: true }).click();
  await expect(alpha).toContainText("Matched and ready for review");
  await expect(beta).toContainText("Partial or unknown");
  await expect(page.getByRole("checkbox", { name: "fixture/alpha", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "fixture/beta", exact: true })).toBeChecked();
  expect(metadata[1]).toEqual({ provider_id: "fixture", upstream_models: ["alpha"], refresh: true });
  expect(state.selectors).toHaveLength(1); expect(state.writes).toHaveLength(0);
  await page.screenshot({ path: info.outputPath("scoped-retry.png") });
  await record(info, state, { metadata, alpha: await alpha.innerText(), beta: await beta.innerText() });
});

for (const failure of ["HTTP", "source"] as const) test(`retained automatic cache and price facts need resolution after ${failure} failure`, async ({ page, context }, info) => {
  const state = fresh(); state.metadataEvidence = evidence("existing"); await installProviderFixture(context, state);
  await open(page); await configuredModelEdit(page, "fixture", "existing").click();
  const dialog = page.getByRole("dialog"); const refresh = dialog.getByRole("button", { name: "Refresh metadata sources", exact: true });
  await refresh.click(); await expect(dialog.getByLabel("Cache write (USD/M tokens)", { exact: true })).toHaveValue("4");
  await dialog.getByRole("button", { name: "Restore automatic values", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Input price (USD / million tokens): 1 → 2 (Manual → source)", exact: true }).check();
  await dialog.getByRole("button", { name: "Apply selected values", exact: true }).click();
  if (failure === "HTTP") state.rejectMetadata = 503;
  else state.metadataEvidence = { ...evidence("existing"), warnings: ["metadata_source_unavailable"] };
  await refresh.click(); await expect(dialog.getByRole("alert").filter({ hasText: "Metadata could not be fetched" })).toBeVisible();
  await expect(dialog.getByLabel("Input price (USD / million tokens)", { exact: true })).toHaveValue("2");
  await expect(dialog.getByLabel("Cache read (USD/M tokens)", { exact: true })).toHaveValue("0");
  await expect(dialog.getByLabel("Cache write (USD/M tokens)", { exact: true })).toHaveValue("4");
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Restore automatic values", exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Cache read (USD/M tokens)", { exact: true })).toHaveAttribute("aria-invalid", "true");
  for (const label of ["Input price (USD / million tokens)", "Cache read (USD/M tokens)", "Cache write (USD/M tokens)"]) {
    const control = dialog.getByLabel(label, { exact: true });
    await control.locator("..").getByRole("button", { name: "Confirm retained value", exact: true }).click();
  }
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Save", exact: true }).click(); await expect(dialog).toHaveCount(0);
  const saved = state.configuration.models[0]!;
  for (const field of ["input_per_million", "cache_read_per_million", "cache_write_per_million"] as const) expect(saved.metadata!.fields![field]!.method).toBe("manual");
  expect(saved.metadata!.sources!.map((source) => source.id)).toContain("known-source");
  expect(state.writes).toHaveLength(1); await record(info, state, { saved });
});

test("a scoped HTTP metadata failure leaves another candidate usable in its editor", async ({ page, context }, info) => {
  const state = fresh(); await installProviderFixture(context, state); await open(page, true);
  await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await page.getByRole("button", { name: "Select all visible unconfigured models", exact: true }).click();
  const alpha = page.getByRole("region", { name: "fixture/alpha", exact: true });
  const beta = page.getByRole("region", { name: "fixture/beta", exact: true });
  await alpha.getByRole("button", { name: "Edit model", exact: true }).click();
  state.rejectMetadata = 503;
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Metadata could not be fetched" })).toBeVisible();
  await expect(dialog.getByLabel("Input price (USD / million tokens)", { exact: true })).toHaveValue("1.5");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await beta.getByRole("button", { name: "Edit model", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("checkbox", { name: "fixture/alpha", exact: true }).uncheck();
  await expect(page.getByLabel("I reviewed the capabilities", { exact: false })).toBeEnabled();
  expect(state.selectors).toHaveLength(1); expect(state.writes).toHaveLength(0);
  expect(state.metadataSelectors![1]).toEqual({ provider_id: "fixture", upstream_models: ["alpha"], refresh: true });
  await record(info, state, { betaUsable: true });
});

test("legacy quality can stay unchanged, rejects a different legacy value, and emits no compatibility flags", async ({ page, context }, info) => {
  const state = fresh(); state.configuration.models[0]!.quality = 2.5; await installProviderFixture(context, state);
  await open(page); await configuredModelEdit(page, "fixture", "existing").click();
  const dialog = page.getByRole("dialog"); const quality = dialog.getByRole("spinbutton", { name: /^Quality/ });
  await expect(dialog.getByText("This saved quality is outside the current range.", { exact: false })).toBeVisible();
  await quality.fill("3.5"); await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(state.validations).toHaveLength(0); expect(state.writes).toHaveLength(0);
  await quality.fill("2.5"); await dialog.getByLabel("Display name", { exact: true }).fill("Compatible edit");
  await dialog.getByRole("button", { name: "Save", exact: true }).click(); await expect(dialog).toHaveCount(0);
  const operation = state.writes[0]!.operations[0]!;
  expect(operation.action).toBe("update_model");
  if (operation.action !== "update_model") throw new Error("Expected model update");
  expect(operation.model.quality).toBe(2.5); expect(operation.model).not.toHaveProperty("originalQuality");
  expect(operation.model).not.toHaveProperty("legacy_quality"); await record(info, state, operation);
});
