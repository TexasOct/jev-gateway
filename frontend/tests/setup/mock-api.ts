import type { BrowserContext, Route } from "@playwright/test";
import { activity, providers } from "../fixtures/activity";
import { configuration } from "../fixtures/configuration";
import { emptyDetail, sessionDetail, sessionsPageOne, sessionsPageTwo, sessionRequestsPageOne, sessionRequestsPageTwo } from "../fixtures/sessions";
import type { CanvasLayout, ProviderConfiguration, RoutingActivityPayload, SessionRequestsPayload } from "@/shared/api/types";
import { policy, strategies } from "../fixtures/strategies";

export interface MockApiState {
  requests: Array<{ method: string; path: string }>;
  unexpected: string[];
  rejectNextSessionPage: boolean;
  allowedWrites: Array<{ method: string; path: string; body?: unknown }>;
  detailOverrides: Record<string, SessionRequestsPayload>;
  pagedDetailSessionId: string | null;
  providerOverride?: typeof providers;
  detailFailures: Record<string, number>;
  configurationWarnings: boolean;
  configurationApplied: boolean;
  appliedConfiguration?: typeof configuration;
  canvasLayout?: CanvasLayout;
  canvasWrites?: CanvasLayout[];
  themeSeed: string;
  delayThemeRead?: () => Promise<void>;
  rejectThemeRead?: boolean;
  rejectNextActivity: boolean;
  activityOverride?: RoutingActivityPayload;
  delayNextActivity?: () => Promise<void>;
  delayNextDetail?: () => Promise<void>;
}

function providerConfigurationSnapshot(catalog: typeof configuration): ProviderConfiguration {
  return {
    revision: "fixture-provider-revision",
    write_available: catalog.write_available,
    providers: [...new Set(catalog.models.map(({ provider }) => provider))].map((id) => ({
      id, type: "openai", display_name: id, api_base: "https://example.test/v1",
      api_key_env: "FIXTURE_PROVIDER_KEY", has_api_key: true,
      brand_id: null, icon_id: null, allow_private_network: false, params: {}, param_env: {},
    })),
    decision: { enabled: false, default_provider: null, timeout_seconds: 1.5, providers: [] },
    models: catalog.models.map((model) => ({
      name: model.id, provider: model.provider, upstream_model: model.upstream_model,
      tags: model.tags, priority: model.priority, quality: 0.5,
      api_base: "https://example.test/v1", provider_type: "openai", has_api_key: true,
      capabilities: { tools: false, vision: false, json_mode: true, reasoning: false, temperature: true, reasoning_effort: [] },
      cost: { input_per_million: 1, output_per_million: 2 },
      context_window: null, max_output_tokens: null,
    })),
    presets: [
      { kind: "llm", id: "openai", display_name: "Fixture OpenAI", brand_id: null, icon_id: null, type: "openai", api_base: "https://example.test/v1", api_key_env: "FIXTURE_PROVIDER_KEY" },
      { kind: "decision", id: "system_one", display_name: "System One", brand_id: null, icon_id: null, protocol: "system_one", api_base: "", api_key_env: "FIXTURE_DECISION_KEY" },
    ],
    provider_types: ["openai"],
    decision_protocols: ["system_one"],
  };
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Installs before page navigation; unknown traffic fails closed, including cross-origin requests. */
export async function installMockApi(context: BrowserContext, state: MockApiState) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4178") {
      state.unexpected.push(request.url());
      await route.abort("blockedbyclient");
      return;
    }
    if (request.method() === "GET" && (url.pathname === "/dashboard/" || /^\/dashboard\/assets\/[^/]+\.(?:js|css|svg|png|woff2?)$/.test(url.pathname))) {
      await route.continue();
      return;
    }
    const method = request.method();
    state.requests.push({ method, path: `${url.pathname}${url.search}` });
    if (method === "PUT" && url.pathname === "/v1/dashboard/canvas-layout") {
      state.canvasLayout = request.postDataJSON() as CanvasLayout;
      (state.canvasWrites ??= []).push(structuredClone(state.canvasLayout));
      return fulfill(route, state.canvasLayout);
    }
    const allowedWrite = state.allowedWrites.find((write) => write.method === method && write.path === url.pathname);
    if (allowedWrite) {
      allowedWrite.body = request.postDataJSON();
      if (method === "POST" && url.pathname === "/v1/routing/configuration/validate") {
        return fulfill(route, { valid: true, warnings: state.configurationWarnings ? [{ code: "synthetic", message: "Synthetic acknowledgement required" }] : [] });
      }
      if (url.pathname === "/v1/routing/configuration" && method === "PUT") {
        state.configurationApplied = true;
        const payload = allowedWrite.body as { questions?: typeof configuration.questions; rules?: typeof configuration.rules; fallback?: typeof configuration.fallback; models?: Record<string, { tags: string[]; priority: number }> };
        const current = state.appliedConfiguration ?? configuration;
        state.appliedConfiguration = {
          ...current,
          questions: payload.questions ?? configuration.questions,
          rules: (payload.rules ?? configuration.rules).map((rule, index) => ({ ...rule, index })),
          fallback: payload.fallback ?? configuration.fallback,
          models: current.models.map((model) => ({ ...model, ...payload.models?.[model.id] })),
          config_hash: "fixture-hash-applied",
          overlay: { ...configuration.overlay, applied: true },
        };
        return fulfill(route, { applied: true, warnings: [] });
      }
      if (url.pathname === "/v1/routing/configuration" && method === "DELETE") {
        state.configurationApplied = false;
        state.appliedConfiguration = undefined;
        return fulfill(route, { applied: true, overlay_removed: true });
      }
      if (url.pathname === "/v1/dashboard/theme" && method === "PUT") { state.themeSeed = (allowedWrite.body as { seed?: string } | undefined)?.seed ?? "#3b66d9"; return fulfill(route, { version: 1, seed: state.themeSeed }); }
      if (url.pathname === "/v1/dashboard/theme" && method === "DELETE") { state.themeSeed = "#3b66d9"; return fulfill(route, { version: 1, seed: state.themeSeed }); }
      return fulfill(route, { version: 1, seed: "#3b66d9" });
    }
    if (method !== "GET") {
      state.unexpected.push(`${method} ${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    if (url.pathname === "/v1/provider-configuration" && url.search === "") return fulfill(route, providerConfigurationSnapshot(state.appliedConfiguration ?? configuration));
    if (url.pathname === "/v1/routing/providers/summary") return fulfill(route, state.providerOverride ?? providers);
    if (url.pathname === "/v1/routing/activity") {
      if (state.delayNextActivity) { const delay = state.delayNextActivity; state.delayNextActivity = undefined; await delay(); }
      if (state.rejectNextActivity) { state.rejectNextActivity = false; return fulfill(route, { error: { message: "Synthetic activity failure" } }, 503); }
      return fulfill(route, state.activityOverride ?? activity);
    }
    if (url.pathname === "/v1/routing/strategies") return fulfill(route, strategies);
    if (url.pathname === "/v1/routing/policy") return fulfill(route, policy);
    if (url.pathname === "/v1/routing/configuration") return fulfill(route, state.appliedConfiguration ?? { ...configuration, overlay: { ...configuration.overlay, applied: state.configurationApplied } });
    if (url.pathname === "/v1/dashboard/theme") {
      if (state.delayThemeRead) { const delay = state.delayThemeRead; state.delayThemeRead = undefined; await delay(); }
      if (state.rejectThemeRead) { state.rejectThemeRead = false; return fulfill(route, { error: { message: "Synthetic theme read failure" } }, 503); }
      return fulfill(route, { version: 1, seed: state.themeSeed });
    }
    if (url.pathname === "/v1/dashboard/canvas-layout") return fulfill(route, state.canvasLayout ?? { version: 1, nodes: {}, viewport: { x: 0, y: 0 } });
    if (url.pathname === "/v1/routing/sessions") {
      const cursor = url.searchParams.get("cursor");
      if (cursor === "fixture-page-2") {
        if (state.rejectNextSessionPage) {
          state.rejectNextSessionPage = false;
          return fulfill(route, { error: { message: "Fixture page failed" } }, 503);
        }
        return fulfill(route, sessionsPageTwo);
      }
      if (cursor !== null) {
        state.unexpected.push(`${method} ${url.pathname}${url.search}`);
        await route.abort("blockedbyclient");
        return;
      }
      return fulfill(route, sessionsPageOne);
    }
    const detailMatch = url.pathname.match(/^\/v1\/routing\/sessions\/([^/]+)\/requests$/);
    if (detailMatch) {
      const id = decodeURIComponent(detailMatch[1]!);
      const failure = state.detailFailures[id];
      if (failure !== undefined) return fulfill(route, { error: { message: `Synthetic detail failure (${id})` } }, failure);
      if (state.delayNextDetail) { const delay = state.delayNextDetail; state.delayNextDetail = undefined; await delay(); }
      const cursor = url.searchParams.get("cursor");
      if (cursor === "fixture-request-page-2" && state.pagedDetailSessionId === id) return fulfill(route, sessionRequestsPageTwo(id));
      if (cursor !== null) {
        state.unexpected.push(`${method} ${url.pathname}${url.search}`);
        await route.abort("blockedbyclient");
        return;
      }
      const override = state.detailOverrides[id];
      if (override) return fulfill(route, override);
      if (id === "session-empty") return fulfill(route, emptyDetail);
      if (state.pagedDetailSessionId === id) return fulfill(route, sessionRequestsPageOne(id));
      return fulfill(route, sessionDetail(id));
    }
    state.unexpected.push(`${method} ${url.pathname}${url.search}`);
    await route.abort("blockedbyclient");
  });
}
