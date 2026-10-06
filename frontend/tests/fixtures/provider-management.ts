import type { BrowserContext } from "@playwright/test";
import type { CanvasLayout, GatewayCredentialMutation, ImportModel, MetadataItem, ProviderConfiguration, ProviderModelView, ProviderMutation, ProviderSelector, SetupStatus } from "../../src/shared/api/types";
import { isValidSetupKey } from "../../src/shared/api/setup-key";
import { configuration as routingConfiguration } from "./configuration";

/** Model the browser-visible transaction boundary, without keeping secret bytes. */
function mutationError(configuration: ProviderConfiguration, body: ProviderMutation): { status: number; code: string; message: string } | null {
  const invalid = (message: string) => ({ status: 400, code: "invalid_provider_configuration", message });
  if (body.expected_revision !== configuration.revision) return { status: 409, code: "revision_conflict", message: "Configuration changed elsewhere" };
  if (!configuration.write_available) return { status: 403, code: "write_unavailable", message: "Configuration writes are disabled" };
  const profiles = [...configuration.providers.map((provider) => ({ kind: "llm", ...provider })), ...configuration.decision.providers.map((provider) => ({ kind: "decision", ...provider }))];
  // Sharing is checked against the complete candidate, including later bindings.
  for (const operation of body.operations) {
    if (operation.action === "upsert") {
      if (Object.values(operation.provider.params ?? {}).includes("[configured]")) return invalid("Redacted parameter markers cannot be saved");
      const index = profiles.findIndex((profile) => profile.kind === operation.kind && profile.id === operation.provider.id);
      const profile = { ...profiles[index], ...operation.provider, kind: operation.kind };
      if (index < 0) profiles.push(profile); else profiles[index] = profile;
    } else if (operation.action === "delete") {
      const index = profiles.findIndex((profile) => profile.kind === operation.kind && profile.id === operation.id);
      if (index >= 0) profiles.splice(index, 1);
    }
  }
  const consumers: string[] = [configuration.gateway.api_key_env ?? "", ...profiles.flatMap((profile) => [profile.api_key_env ?? "", ...Object.values(profile.param_env ?? {})])];
  for (const operation of body.operations) {
    if (operation.action === "upsert") {
      const profile = profiles.find((entry) => entry.kind === operation.kind && entry.id === operation.provider.id)!;
      const changes = [{ reference: profile.api_key_env, credential: operation.credential }, ...Object.entries(operation.transport_credentials ?? {}).map(([parameter, credential]) => ({ reference: profile.param_env?.[parameter], credential }))];
      for (const { reference, credential } of changes) {
        if (credential.action === "keep") continue;
        if (!reference) return invalid("Credential changes require a declared reference");
        if (credential.action === "set" && (!credential.value.trim() || /[\r\n\0]/.test(credential.value))) return invalid("Invalid credential value");
        if (consumers.filter((consumer) => consumer === reference).length > 1) return invalid("Shared references cannot be replaced or cleared");
      }
    } else if (operation.action === "update_model") {
      const existing = configuration.models.find((model) => model.name === operation.model_id);
      if (!existing || operation.model.upstream_model !== existing.upstream_model || (operation.model.provider !== undefined && operation.model.provider !== existing.provider)) return invalid("Model identity cannot change");
    } else if (operation.action === "import") {
      if (!operation.confirmed || !configuration.providers.some((provider) => provider.id === operation.provider_id)) return invalid("Confirmed models require a configured supplier");
    }
    if (operation.action === "update_model" || operation.action === "import") {
      for (const model of operation.action === "update_model" ? [operation.model] : operation.models) {
        if (operation.action === "import" && configuration.models.some((existing) => existing.provider === operation.provider_id && existing.upstream_model === model.upstream_model)) continue;
        if (!model.upstream_model.trim() || Object.values(model.cost).some((value) => value !== null && (!Number.isFinite(value) || value < 0))) return invalid("Invalid model price or identity");
        if ([model.context_window, model.max_output_tokens].some((value) => value !== null && (!Number.isInteger(value) || value <= 0))) return invalid("Invalid model token limit");
        if (model.context_window !== null && model.max_output_tokens !== null && model.max_output_tokens > model.context_window) return invalid("Maximum output exceeds context window");
      }
    }
  }
  return null;
}

function modelView(provider: string, upstream_model: string, imported?: ImportModel): ProviderModelView {
  return {
    upstream_model, name: `${provider}/${upstream_model}`, provider, tags: [], api_base: "https://example.test/v1", provider_type: "openai", has_api_key: true, priority: 0, quality: 0.5,
    capabilities: { tools: false, vision: false, json_mode: true, reasoning: false, temperature: true, reasoning_effort: [] },
    display_name: null, enabled: true,
    routing_overlay_fields: [],
    context_window: null, max_output_tokens: null,
    ...imported,
    cost: { input_per_million: 1, output_per_million: 2, cache_read_per_million: null, cache_write_per_million: null, ...imported?.cost },
  };
}

export function providerFixture(): ProviderConfiguration {
  return {
    revision: "r1", write_available: true, defaults: { default_model: null },
    gateway: { api_key_env: "FIXTURE_GATEWAY_KEY", has_api_key: true },
    gateway_bootstrap_available: false,
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
  connectionSelectors?: ProviderSelector[];
  delayConnection?: () => Promise<void>;
  connectionStatus?: "success" | "authentication_error" | "address_error" | "network_error" | "unsupported" | "incomplete";
  unexpected?: string[];
  rejectWrite?: number;
  delayWrite?: () => Promise<void>;
  rejectValidation?: number;
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
  inheritedTransportCredentials?: Record<string, boolean>;
  gatewayWrites?: GatewayCredentialMutation[];
  setupWrites?: Array<{ expected_revision: string; api_key: string }>;
  gatewayKey?: string;
  enforceGatewayAuth?: boolean;
  gatewayHeaders?: Array<{ path: string; authorization: string | undefined }>;
  rejectGatewayWrite?: number;
  delayGatewayWrite?: () => Promise<void>;
  delayValidation?: () => Promise<void>;
  delayCatalogRead?: () => Promise<void>;
  canvasLayout?: CanvasLayout;
  canvasWrites?: CanvasLayout[];
};
export async function installProviderFixture(context: BrowserContext, state: ProviderFixtureState) {
  const stage = (body: ProviderMutation) => {
    const candidate = structuredClone(state.configuration);
    let imported = 0; let skipped = 0;
    for (const operation of body.operations) {
      if (operation.action === "set_default_model") {
        candidate.defaults = { default_model: operation.model };
      } else if (operation.action === "upsert") {
        const list = operation.kind === "llm" ? candidate.providers : candidate.decision.providers;
        const index = list.findIndex((provider) => provider.id === operation.provider.id);
        const previous = list[index];
        const references = operation.provider.param_env ?? previous?.param_env ?? {};
        const presence = Object.fromEntries(Object.entries(references).map(([parameter, reference]) => [parameter, state.inheritedTransportCredentials?.[reference] === true || (previous?.param_env?.[parameter] === reference && previous?.transport_credential_presence?.[parameter] === true)]));
        const params = operation.provider.params === undefined ? previous?.params ?? {} : Object.fromEntries(Object.keys(operation.provider.params).map((parameter) => [parameter, "[configured]"]));
        const view = { ...previous, ...operation.provider, has_api_key: operation.credential.action === "set" || state.inheritedCredential === true || (operation.credential.action === "keep" && previous?.has_api_key === true), ...(operation.kind === "llm" ? { params, param_env: references, transport_credential_presence: presence } : {}) };
        if (operation.kind === "llm") for (const [parameter, credential] of Object.entries(operation.transport_credentials ?? {})) {
          const reference = view.param_env?.[parameter];
          if (!reference) throw new Error("Transport credential requires a declared reference");
          view.transport_credential_presence![parameter] = credential.action === "set" || state.inheritedTransportCredentials?.[reference] === true || (credential.action === "keep" && previous?.transport_credential_presence?.[parameter] === true);
        }
        if (index >= 0) list[index] = view; else list.push(view);
      } else if (operation.action === "update_model") {
        const index = candidate.models.findIndex((model) => model.name === operation.model_id);
        const existing = candidate.models[index];
        if (!existing || operation.model.upstream_model !== existing.upstream_model) throw new Error("Model identity cannot change");
        const updated = { ...existing, ...operation.model, display_name: operation.model.display_name ?? null, enabled: operation.model.enabled ?? true, cost: { cache_read_per_million: null, cache_write_per_million: null, ...operation.model.cost }, name: existing.name, provider: existing.provider, upstream_model: existing.upstream_model };
        if (existing.routing_overlay_fields?.includes("tags")) updated.tags = existing.tags;
        if (existing.routing_overlay_fields?.includes("priority")) updated.priority = existing.priority;
        candidate.models[index] = updated;
      } else if (operation.action === "import") {
        for (const model of operation.models) {
          if (!candidate.models.some((existing) => existing.provider === operation.provider_id && existing.upstream_model === model.upstream_model)) { candidate.models.push(modelView(operation.provider_id, model.upstream_model, model)); ++imported; }
          else ++skipped;
        }
      } else if (operation.action === "delete") {
        const list = operation.kind === "llm" ? candidate.providers : candidate.decision.providers;
        const index = list.findIndex((provider) => provider.id === operation.id); if (index >= 0) list.splice(index, 1);
      }
    }
    return { candidate, imported, skipped };
  };
  const setupStatus = (): SetupStatus => {
    const required = !state.configuration.gateway.has_api_key;
    const hasProviders = state.configuration.providers.length > 0;
    const hasModels = state.configuration.models.length > 0;
    const routingReady = hasModels && (state.configuration.defaults?.default_model != null || routingConfiguration.labels.every((label) => label.models.length > 0));
    return { required, local_setup_available: required && state.configuration.gateway_bootstrap_available, revision: state.configuration.revision, has_providers: hasProviders, has_models: hasModels, routing_ready: routingReady, next_step: required ? "gateway_key" : !hasProviders ? "provider" : !hasModels ? "model" : !routingReady ? "routing" : "ready" };
  };
  await context.route("**/v1/setup", async (route) => {
    const request = route.request();
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "GET") return reply(setupStatus());
    if (request.method() !== "POST") return route.abort("blockedbyclient");
    if (state.configuration.gateway.has_api_key) return reply({ error: { code: "setup_already_configured", message: "Management key is already configured." } }, 409);
    if (!state.configuration.gateway.has_api_key && !state.configuration.gateway_bootstrap_available) return reply({ error: { code: "setup_local_only", message: "Local setup required" } }, 403);
    const body = request.postDataJSON() as { expected_revision: string; api_key: string };
    (state.setupWrites ??= []).push(body);
    if (body.expected_revision !== state.configuration.revision) return reply({ error: { message: "Synthetic revision conflict" } }, 409);
    if (!isValidSetupKey(body.api_key)) return reply({ error: { code: "invalid_setup_key", message: "Invalid management key format." } }, 400);
    state.gatewayKey = body.api_key;
    state.configuration.gateway = { api_key_env: state.configuration.gateway.api_key_env ?? "JEV_GATEWAY_API_KEY", has_api_key: true };
    state.configuration.gateway_bootstrap_available = false;
    state.configuration.write_available = true;
    state.configuration.revision = `setup-r${state.setupWrites.length}`;
    return reply(setupStatus());
  });
  await context.route("**/v1/gateway-credential", async (route) => {
    const request = route.request();
    if (request.method() !== "PUT") return route.abort("blockedbyclient");
    if (!state.configuration.gateway.has_api_key && !state.configuration.gateway_bootstrap_available) return route.fulfill({ status: 403, json: { error: { code: "gateway_bootstrap_unavailable", message: "Local setup required" } } });
    const body = request.postDataJSON() as GatewayCredentialMutation;
    (state.gatewayWrites ??= []).push(body);
    if (state.delayGatewayWrite) { const delay = state.delayGatewayWrite; state.delayGatewayWrite = undefined; await delay(); }
    const reply = (payload: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    if (state.rejectGatewayWrite) { const status = state.rejectGatewayWrite; state.rejectGatewayWrite = undefined; return reply({ error: { message: "synthetic-gateway-error-must-not-render" } }, status); }
    if (body.expected_revision !== state.configuration.revision) return reply({ error: { message: "Synthetic revision conflict" } }, 409);
    state.gatewayKey = body.credential.value;
    state.configuration.gateway = { api_key_env: state.configuration.gateway.api_key_env ?? "JEV_GATEWAY_API_KEY", has_api_key: true };
    state.configuration.gateway_bootstrap_available = false;
    state.configuration.write_available = true;
    state.configuration.revision = `gateway-r${state.gatewayWrites!.length}`;
    return reply({ ...state.configuration, valid: true, applied: true });
  });
  await context.route("**/v1/dashboard/canvas-layout", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      state.canvasLayout = request.postDataJSON() as CanvasLayout;
      (state.canvasWrites ??= []).push(structuredClone(state.canvasLayout));
    } else if (request.method() !== "GET") {
      (state.unexpected ??= []).push(`${request.method()} /v1/dashboard/canvas-layout`);
      return route.abort("blockedbyclient");
    }
    return route.fulfill({ json: state.canvasLayout ?? { version: 1, nodes: {}, viewport: { x: 0, y: 0 } } });
  });
  await context.route("**/v1/routing/configuration", async (route) => {
    if (route.request().method() !== "GET") {
      (state.unexpected ??= []).push(`${route.request().method()} /v1/routing/configuration`);
      return route.abort("blockedbyclient");
    }
    state.catalogReads = (state.catalogReads ?? 0) + 1;
    if (state.delayCatalogRead) { const delay = state.delayCatalogRead; state.delayCatalogRead = undefined; await delay(); }
    if (state.rejectCatalogRead) return route.fulfill({ status: state.rejectCatalogRead, contentType: "application/json", body: JSON.stringify({ error: { message: "synthetic-catalog-read-error" } }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...routingConfiguration, write_available: state.configuration.write_available, defaults: state.configuration.defaults, models: [...routingConfiguration.models, ...state.configuration.models.map((model) => ({ id: model.name, provider: model.provider, upstream_model: model.upstream_model, priority: model.priority, baseline_priority: model.priority, tags: model.tags, baseline_tags: model.tags }))] }) });
  });
  await context.route("**/v1/provider-**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/v1/provider-configuration" && request.method() === "GET") return state.rejectRead ? reply({ error: { message: "synthetic-read-error" } }, state.rejectRead) : reply(state.configuration);
    if (path === "/v1/provider-configuration/validate" && request.method() === "POST") {
      const body = request.postDataJSON() as ProviderMutation;
      state.validations.push(body);
      if (state.delayValidation) { const delay = state.delayValidation; state.delayValidation = undefined; await delay(); }
      if (state.rejectValidation) return reply({ error: { message: "synthetic-validation-error" } }, state.rejectValidation);
      const error = mutationError(state.configuration, body);
      if (error) return reply({ error: { code: error.code, message: error.message } }, error.status);
      try {
        const { candidate, imported, skipped } = stage(body);
        return reply({ ...candidate, valid: true, applied: false, imported, skipped });
      } catch {
        return reply({ error: { code: "invalid_provider_configuration", message: "Invalid candidate configuration" } }, 400);
      }
    }
    if (path === "/v1/provider-configuration" && request.method() === "PUT") {
      const body = request.postDataJSON() as ProviderMutation; state.writes.push(body);
      if (state.delayWrite) { const delay = state.delayWrite; state.delayWrite = undefined; await delay(); }
      if (state.rejectWrite) { const status = state.rejectWrite; state.rejectWrite = undefined; return reply({ error: { message: "synthetic-rejected-secret-must-not-render" } }, status); }
      const error = mutationError(state.configuration, body);
      if (error) return reply({ error: { code: error.code, message: error.message } }, error.status);
      try {
        const { candidate, imported, skipped } = stage(body);
        candidate.revision = `r${state.writes.length + 1}`;
        Object.assign(state.configuration, candidate);
        return reply({ ...state.configuration, valid: true, applied: true, imported, skipped });
      } catch {
        return reply({ error: { code: "invalid_provider_configuration", message: "Invalid candidate configuration" } }, 400);
      }
    }
    if (path === "/v1/provider-discovery" && request.method() === "POST") {
      const body = request.postDataJSON() as ProviderSelector; state.selectors.push(body);
      if (state.delayDiscovery) { const delay = state.delayDiscovery; state.delayDiscovery = undefined; await delay(); }
      if (state.rejectDiscovery) { const status = state.rejectDiscovery; state.rejectDiscovery = undefined; return reply({ error: { message: "synthetic-private-upstream-error" } }, status); }
      const id = "provider_id" in body ? body.provider_id : body.provider.id;
      return reply({ provider_id: id, supported: true, complete: false, warnings: [], items: ["existing", "alpha", "beta"].map((model) => ({ upstream_model: model, qualified_id: `${id}/${model}`, imported: state.configuration.models.some((configured) => configured.provider === id && configured.upstream_model === model), metadata: state.discoveryEvidence ?? { fields: {}, sources: [], warnings: [] }, metadata_envelope: state.discoveryEvidence?.metadata ?? { version: 1, sources: [] } })) });
    }
    if (path === "/v1/provider-connection-test" && request.method() === "POST") {
      const selector = request.postDataJSON() as ProviderSelector;
      (state.connectionSelectors ??= []).push(selector);
      if (state.delayConnection) { const delay = state.delayConnection; state.delayConnection = undefined; await delay(); }
      const status = state.connectionStatus ?? "success";
      return reply({ provider_id: "provider_id" in selector ? selector.provider_id : selector.provider.id, status, scope: "model_listing", model_count: status === "success" ? 3 : null, warnings: [] });
    }
    if (path === "/v1/provider-metadata" && request.method() === "POST") {
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
    (state.unexpected ??= []).push(`${request.method()} ${path}`);
    await route.abort("blockedbyclient");
    throw new Error(`Unexpected provider API: ${request.method()} ${path}`);
  });
  await context.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const authorization = request.headers().authorization;
    (state.gatewayHeaders ??= []).push({ path, authorization });
    if (state.enforceGatewayAuth && state.gatewayKey && authorization !== `Bearer ${state.gatewayKey}`) {
      return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "Synthetic unauthorized", code: "invalid_api_key" } }) });
    }
    return route.fallback();
  });
  const port = process.env.JEV_BROWSER_PORT ?? "4178";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("Invalid JEV_BROWSER_PORT");
  const origin = `http://127.0.0.1:${Number(port)}`;
  // This last-installed route checks every request before endpoint-specific mocks.
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.fallback();
    (state.unexpected ??= []).push(`${request.method()} ${url.origin}${url.pathname}`);
    await route.abort("blockedbyclient");
    throw new Error(`Unexpected browser origin: ${url.origin}`);
  });
}
