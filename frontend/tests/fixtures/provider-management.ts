import type { BrowserContext } from "@playwright/test";
import type { ImportModel, MetadataItem, ProviderConfiguration, ProviderModelView, ProviderMutation, ProviderSelector } from "../../src/shared/api/types";
import { configuration as routingConfiguration } from "./configuration";

function modelView(provider: string, upstream_model: string, imported?: ImportModel): ProviderModelView {
  return {
    upstream_model, name: `${provider}/${upstream_model}`, provider, tags: [], api_base: "https://example.test/v1", provider_type: "openai", has_api_key: true, priority: 0, quality: 0.5,
    capabilities: { tools: false, vision: false, json_mode: true, reasoning: false, temperature: true, reasoning_effort: [] },
    cost: { input_per_million: 1, output_per_million: 2 }, context_window: null, max_output_tokens: null,
    ...imported,
  };
}

export function providerFixture(): ProviderConfiguration {
  return {
    revision: "r1", write_available: true,
    providers: [{ id: "fixture", display_name: "Fixture provider", type: "openai", api_base: "https://example.test/v1", api_key_env: "FIXTURE_KEY", has_api_key: true, allow_private_network: false, brand_id: null, icon_id: null, params: { timeout: "[configured]" }, param_env: { extra_header: "FIXTURE_HEADER" } }],
    decision: { enabled: false, default_provider: null, timeout_seconds: 1.5, providers: [{ id: "judge", display_name: "Fixture judge", protocol: "system_one", api_base: "https://example.test/evaluate", api_key_env: "JUDGE_KEY", has_api_key: true, brand_id: null, icon_id: null, model: null }] },
    models: [modelView("fixture", "existing")],
    presets: [{ kind: "llm", id: "openai", display_name: "OpenAI", brand_id: "openai", icon_id: null, type: "openai", api_base: "https://api.openai.com/v1", api_key_env: "OPENAI_API_KEY" }, { kind: "decision", id: "system_one", display_name: "System One", protocol: "system_one", api_base: "", api_key_env: "SYSTEM_ONE_API_KEY" }],
    provider_types: ["openai", "anthropic", "deepseek"], decision_protocols: ["system_one"],
  };
}
export type ProviderFixtureState = {
  configuration: ProviderConfiguration;
  writes: ProviderMutation[];
  validations: ProviderMutation[];
  selectors: ProviderSelector[];
  rejectWrite?: number;
  rejectDiscovery?: number;
  delayDiscovery?: () => Promise<void>;
  metadataUnknown?: boolean;
  rejectRead?: number;
  rejectMetadata?: number;
  metadataCalls?: number;
  delayMetadata?: () => Promise<void>;
  discoveryEvidence?: MetadataItem;
  metadataEvidence?: MetadataItem;
  metadataSelectors?: ProviderSelector[];
  rejectCatalogRead?: number;
  catalogReads?: number;
  inheritedCredential?: boolean;
};
export async function installProviderFixture(context: BrowserContext, state: ProviderFixtureState) {
  await context.route("**/v1/dashboard/canvas-layout", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: 1, nodes: {}, viewport: { x: 0, y: 0 } }) }));
  await context.route("**/v1/routing/configuration", async (route) => {
    state.catalogReads = (state.catalogReads ?? 0) + 1;
    if (state.rejectCatalogRead) return route.fulfill({ status: state.rejectCatalogRead, contentType: "application/json", body: JSON.stringify({ error: { message: "synthetic-catalog-read-error" } }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...routingConfiguration, models: [...routingConfiguration.models, ...state.configuration.models.map((model) => ({ id: model.name, provider: model.provider, upstream_model: model.upstream_model, priority: model.priority, baseline_priority: model.priority, tags: model.tags, baseline_tags: model.tags }))] }) });
  });
  await context.route("**/v1/provider-**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/v1/provider-configuration" && request.method() === "GET") return state.rejectRead ? reply({ error: { message: "synthetic-read-error" } }, state.rejectRead) : reply(state.configuration);
    if (path === "/v1/provider-configuration/validate") { state.validations.push(request.postDataJSON()); return reply({ ...state.configuration, valid: true, applied: false, imported: 0, skipped: 0 }); }
    if (path === "/v1/provider-configuration" && request.method() === "PUT") {
      const body = request.postDataJSON() as ProviderMutation; state.writes.push(body);
      let imported = 0; let skipped = 0;
      if (state.rejectWrite) { const status = state.rejectWrite; state.rejectWrite = undefined; return reply({ error: { message: "synthetic-rejected-secret-must-not-render" } }, status); }
      for (const operation of body.operations) {
        if (operation.action === "upsert") {
          const list = operation.kind === "llm" ? state.configuration.providers : state.configuration.decision.providers;
          const existing = list.findIndex((provider) => provider.id === operation.provider.id);
          const view = { ...operation.provider, has_api_key: operation.credential.action === "set" || state.inheritedCredential === true || (operation.credential.action === "keep" && list[existing]?.has_api_key === true), ...(operation.kind === "llm" ? { params: list[existing]?.params ?? {}, param_env: list[existing]?.param_env ?? {} } : {}) };
          if (existing >= 0) list[existing] = view; else list.push(view);
        } else if (operation.action === "import") {
          for (const model of operation.models) {
            if (!state.configuration.models.some((existing) => existing.provider === operation.provider_id && existing.upstream_model === model.upstream_model)) { state.configuration.models.push(modelView(operation.provider_id, model.upstream_model, model)); ++imported; }
            else ++skipped;
          }
        } else {
          const list = operation.kind === "llm" ? state.configuration.providers : state.configuration.decision.providers;
          const index = list.findIndex((provider) => provider.id === operation.id); if (index >= 0) list.splice(index, 1);
        }
      }
      state.configuration.revision = `r${state.writes.length + 1}`;
      return reply({ ...state.configuration, valid: true, applied: true, imported, skipped });
    }
    if (path === "/v1/provider-discovery") {
      const body = request.postDataJSON() as ProviderSelector; state.selectors.push(body);
      if (state.delayDiscovery) { const delay = state.delayDiscovery; state.delayDiscovery = undefined; await delay(); }
      if (state.rejectDiscovery) { const status = state.rejectDiscovery; state.rejectDiscovery = undefined; return reply({ error: { message: "synthetic-private-upstream-error" } }, status); }
      const id = "provider_id" in body ? body.provider_id : body.provider.id;
      return reply({ provider_id: id, supported: true, complete: false, warnings: [], items: ["existing", "alpha", "beta"].map((model) => ({ upstream_model: model, qualified_id: `${id}/${model}`, imported: state.configuration.models.some((configured) => configured.provider === id && configured.upstream_model === model), metadata: state.discoveryEvidence ?? { fields: {}, sources: [], warnings: [] }, metadata_envelope: state.discoveryEvidence?.metadata ?? { version: 1, sources: [] } })) });
    }
    if (path === "/v1/provider-metadata") {
      state.metadataCalls = (state.metadataCalls ?? 0) + 1;
      const selector = request.postDataJSON() as ProviderSelector;
      (state.metadataSelectors ??= []).push(selector);
      // Capture before waiting so an external revision cannot alter the old response.
      const delayedEvidence = state.metadataEvidence;
      if (state.delayMetadata) { const delay = state.delayMetadata; state.delayMetadata = undefined; await delay(); }
      if (state.rejectMetadata) { const status = state.rejectMetadata; state.rejectMetadata = undefined; return reply({ error: { message: "synthetic-metadata-error" } }, status); }
      const body = request.postDataJSON() as { upstream_models: string[] };
      return reply({ fetched_at: "2026-09-30T12:00:00Z", stale: false, items: body.upstream_models.map((upstream_model) => {
        if (delayedEvidence) return { ...delayedEvidence, upstream_model };
        const fields = state.metadataUnknown ? { tools: null, vision: null, json_mode: null, reasoning: null, temperature: null, reasoning_effort: null, input_per_million: null, output_per_million: null, context_window: null, max_output_tokens: null } : { tools: false, vision: false, json_mode: true, reasoning: false, temperature: true, reasoning_effort: [], input_per_million: 1.5, output_per_million: 3, context_window: 100000, max_output_tokens: 1000 };
        const sourceFields = { ...Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, { value, source_field: field, ...(field.endsWith("per_million") ? { unit: "USD/M tokens", source_unit: "USD/token" } : {}) }])), max_input_tokens: { value: 80000, source_field: "max_input_tokens" }, structured_output: { value: true, source_field: "structured_output" } };
        const commonSource = { source: "native_listing", applicable: true, url: "https://example.test/model-data", fetched_at: "2026-09-30T12:00:00Z", fields: sourceFields, source_reasoning_effort: ["unsupported-fixture-effort"], pricing: { input: { value: 1.5, unit: "USD/M tokens" }, tiers: [{ min_prompt_tokens: 200000, input: { value: 3, unit: "USD/M tokens" } }], overrides: [{ utc_start: 1, utc_end: 2, prompt: { value: 4, unit: "USD/M tokens" } }] } };
        return { upstream_model, fields, sources: [{ ...commonSource, source_provider: "fixture", source_model: upstream_model }], warnings: [], metadata: { version: 1, sources: [{ ...commonSource, id: "native_listing-0", provider_id: "fixture", model_id: upstream_model }], fields: Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, { status: value === null ? "unknown" : "known", value, source_ids: value === null ? [] : ["native_listing-0"] }])) } };
      }) });
    }
    await route.abort("blockedbyclient");
  });
}
