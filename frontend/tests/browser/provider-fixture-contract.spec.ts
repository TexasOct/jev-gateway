import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";
import type { ProviderMutation } from "../../src/shared/api/types";
import type { Page } from "@playwright/test";

function fixture(): ProviderFixtureState { return { configuration: providerFixture(), writes: [], validations: [], selectors: [] }; }
async function command(page: Page, body: ProviderMutation, validate = false) {
  return page.evaluate(async ({ payload, preview }) => {
    const reply = await fetch(`/v1/provider-configuration${preview ? "/validate" : ""}`, { method: preview ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: payload });
    return { status: reply.status, body: await reply.json() };
  }, { payload: JSON.stringify(body), preview: validate });
}

// These exercise the synthetic fixture itself; real HTTP tests prove the server.
test("fixture rejects stale revisions and invalid qualified identities without partially applying a batch", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await page.goto("/dashboard/");
  const before = structuredClone(state.configuration);
  const model = structuredClone(state.configuration.models[0]!);
  const stale: ProviderMutation = { expected_revision: "stale", operations: [{ action: "update_model", model_id: model.name, model }] };
  expect((await command(page, stale, true)).status).toBe(409);
  expect((await command(page, stale)).status).toBe(409);
  const invalid: ProviderMutation = { expected_revision: "r1", operations: [{ action: "set_default_model", model: model.name }, { action: "update_model", model_id: "other/existing", model }] };
  expect((await command(page, invalid)).status).toBe(400);
  expect(state.configuration).toEqual(before);
  expect(state.configuration.defaults?.default_model).toBeNull();
});

test("fixture skips duplicate imports and applies an exact model update with the real optional-field defaults", async ({ page, context }) => {
  const state = fixture();
  const existing = state.configuration.models[0]!;
  existing.tags = ["retained"];
  existing.priority = 4;
  existing.quality = 0.75;
  existing.display_name = "Old optional name";
  existing.enabled = false;
  existing.cost.cache_read_per_million = 5;
  await installProviderFixture(context, state); await page.goto("/dashboard/");
  const model = { upstream_model: "alpha", capabilities: { ...existing.capabilities }, cost: { input_per_million: 1, output_per_million: 2 }, context_window: null, max_output_tokens: null };
  const payload: ProviderMutation = { expected_revision: "r1", operations: [{ action: "import", provider_id: "fixture", confirmed: true, models: [model, model, { ...model, upstream_model: "existing" }] }] };
  const preview = await command(page, payload, true);
  expect(preview.status).toBe(200);
  expect(preview.body).toMatchObject({ revision: "r1", applied: false, imported: 1, skipped: 2 });
  expect(preview.body.models).toHaveLength(2);
  expect(state.configuration.models).toHaveLength(1);
  const imported = await command(page, payload);
  expect(imported.status).toBe(200);
  expect(imported.body).toMatchObject({ imported: 1, skipped: 2 });
  expect(state.configuration.models).toHaveLength(2);
  expect(state.configuration.models[0]).toEqual(existing);
  const updated = await command(page, { expected_revision: state.configuration.revision, operations: [{ action: "update_model", model_id: "fixture/existing", model: { ...model, upstream_model: "existing" } }] });
  expect(updated.status).toBe(200);
  expect(state.configuration.models[0]).toMatchObject({ name: "fixture/existing", provider: "fixture", upstream_model: "existing", display_name: null, enabled: true, tags: ["retained"], priority: 4, quality: 0.75, cost: { cache_read_per_million: null, cache_write_per_million: null } });
});

test("fixture rechecks complete-candidate sharing and never echoes transport secret bytes or raw params", async ({ page, context }) => {
  const state = fixture(); await installProviderFixture(context, state); await page.goto("/dashboard/");
  const provider = { id: "cloud", type: "bedrock", api_base: null, api_key_env: null, params: { aws_region_name: "synthetic-region" }, param_env: { aws_secret_access_key: "CLOUD_SECRET" } };
  const binding = { action: "upsert" as const, kind: "llm" as const, provider, credential: { action: "keep" as const }, transport_credentials: { aws_secret_access_key: { action: "set" as const, value: "synthetic-transport-secret" } } };
  const shared: ProviderMutation = { expected_revision: "r1", operations: [binding, { action: "upsert", kind: "decision", provider: { id: "second-judge", protocol: "system_one", api_base: "https://example.test/evaluate", api_key_env: "CLOUD_SECRET" }, credential: { action: "keep" } }] };
  const before = structuredClone(state.configuration);
  expect((await command(page, shared, true)).status).toBe(400);
  expect((await command(page, shared)).status).toBe(400);
  expect(state.configuration).toEqual(before);
  const preview = await command(page, { expected_revision: "r1", operations: [binding] }, true);
  expect(preview.status).toBe(200);
  expect(preview.body).toMatchObject({ revision: "r1", applied: false });
  expect(preview.body.providers.find((entry: { id: string }) => entry.id === "cloud")).toMatchObject({ transport_credential_presence: { aws_secret_access_key: true } });
  expect(JSON.stringify(preview.body)).not.toContain("synthetic-transport-secret");
  expect(state.configuration).toEqual(before);
  const reply = await command(page, { expected_revision: "r1", operations: [binding] });
  expect(reply.status).toBe(200);
  expect(JSON.stringify(reply.body)).not.toContain("synthetic-transport-secret");
  expect(JSON.stringify(reply.body)).not.toContain("synthetic-region");
  expect(reply.body.providers.find((entry: { id: string }) => entry.id === "cloud")).toMatchObject({ params: { aws_region_name: "[configured]" }, param_env: { aws_secret_access_key: "CLOUD_SECRET" }, transport_credential_presence: { aws_secret_access_key: true } });
});
