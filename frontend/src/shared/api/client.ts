/**
 * Typed client for the gateway dashboard endpoints.
 *
 * The credential lives in this module's memory only: never localStorage, never
 * sessionStorage, never a cookie, never the URL. `setCredential` is the single
 * write path.
 */

import type {
  CanvasLayout,
  ConfigurationPayload,
  ConfigurationWarning,
  PolicyCatalog,
  ProvidersPayload,
  RoutingActivityPayload,
  RoutingOverlayPayload,
  SessionRequestsPayload,
  SessionsPayload,
  StrategiesPayload,
  ThemePayload,
  SetupStatus,
} from "./types";
import type { ProviderConfiguration, ProviderCommandResult, ProviderMutation, ProviderSelector, DiscoveryResult, MetadataResult, GatewayCredentialMutation, GatewayCredentialResult } from "./types";
import { isValidSetupKey } from "./setup-key";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

let credential: string | null = null;
const pendingGatewayWrites = new Set<Promise<void>>();

export function setCredential(value: string | null): void {
  credential = value;
}

export function hasCredential(): boolean {
  return credential !== null;
}

async function request<T>(path: string, init: RequestInit = {}, retryAuthentication = true): Promise<T> {
  const sentCredential = credential;
  const headers = new Headers(init.headers);
  if (sentCredential !== null) headers.set("Authorization", `Bearer ${sentCredential}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  // Activation may precede the rotation response and its new in-memory key.
  if (response.status === 401 && retryAuthentication && (init.method ?? "GET") === "GET") {
    while (pendingGatewayWrites.size > 0) await Promise.all([...pendingGatewayWrites]);
    if (credential !== null && sentCredential !== credential) return request<T>(path, init, false);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string | null };
    } | null;
    throw new ApiError(
      payload?.error?.message ??
        `Request failed with status ${response.status}`,
      response.status,
      payload?.error?.code ?? null,
    );
  }
  return (await response.json()) as T;
}

async function updateCredential<T>(value: string, write: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  pendingGatewayWrites.add(pending);
  try {
    const result = await write();
    setCredential(value);
    return result;
  } finally {
    pendingGatewayWrites.delete(pending);
    release();
  }
}

function saveGatewayCredential(payload: GatewayCredentialMutation): Promise<GatewayCredentialResult> {
  return updateCredential(payload.credential.value, () => request<GatewayCredentialResult>("/v1/gateway-credential", { method: "PUT", body: JSON.stringify(payload) }));
}

export const api = {
  setup: () => request<SetupStatus>("/v1/setup"),
  initialize: async (expected_revision: string, api_key: string) => {
    if (!isValidSetupKey(api_key)) throw new ApiError("Invalid management key format.", 400, "invalid_setup_key");
    return updateCredential(api_key, () => request<SetupStatus>("/v1/setup", {
      method: "POST", body: JSON.stringify({ expected_revision, api_key }),
    }));
  },
  providerConfiguration: (signal?: AbortSignal) => request<ProviderConfiguration>("/v1/provider-configuration", { signal }),
  saveGatewayCredential,
  validateProviders: (payload: ProviderMutation) => request<ProviderCommandResult>("/v1/provider-configuration/validate", { method: "POST", body: JSON.stringify(payload) }),
  saveProviders: (payload: ProviderMutation) => request<ProviderCommandResult>("/v1/provider-configuration", { method: "PUT", body: JSON.stringify(payload) }),
  discoverModels: (payload: ProviderSelector, signal?: AbortSignal) => request<DiscoveryResult>("/v1/provider-discovery", { method: "POST", body: JSON.stringify(payload), signal }),
  providerMetadata: (payload: ProviderSelector & { upstream_models: string[]; refresh: boolean }, signal?: AbortSignal) => request<MetadataResult>("/v1/provider-metadata", { method: "POST", body: JSON.stringify(payload), signal }),
  providers: () => request<ProvidersPayload>("/v1/routing/providers/summary"),
  routingActivity: (signal?: AbortSignal) =>
    request<RoutingActivityPayload>("/v1/routing/activity", { signal }),
  strategies: () => request<StrategiesPayload>("/v1/routing/strategies"),
  policy: () => request<PolicyCatalog>("/v1/routing/policy"),
  sessions: (cursor?: string, signal?: AbortSignal) =>
    request<SessionsPayload>(
      `/v1/routing/sessions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      { signal },
    ),
  sessionRequests: (sessionId: string, cursor?: string, signal?: AbortSignal) =>
    request<SessionRequestsPayload>(
      `/v1/routing/sessions/${encodeURIComponent(sessionId)}/requests${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      { signal },
    ),
  configuration: () =>
    request<ConfigurationPayload>("/v1/routing/configuration"),
  validateConfiguration: (payload: RoutingOverlayPayload) =>
    request<{ valid: boolean; warnings: ConfigurationWarning[] }>(
      "/v1/routing/configuration/validate",
      { method: "POST", body: JSON.stringify(payload) },
    ),
  applyConfiguration: (payload: RoutingOverlayPayload) =>
    request<{ applied: boolean; warnings: ConfigurationWarning[] }>(
      "/v1/routing/configuration",
      { method: "PUT", body: JSON.stringify(payload) },
    ),
  resetConfiguration: () =>
    request<{ applied: boolean; overlay_removed: boolean }>(
      "/v1/routing/configuration",
      { method: "DELETE" },
    ),
  canvasLayout: () => request<CanvasLayout>("/v1/dashboard/canvas-layout"),
  saveCanvasLayout: (layout: CanvasLayout) =>
    request<CanvasLayout>("/v1/dashboard/canvas-layout", {
      method: "PUT",
      body: JSON.stringify({
        version: layout.version,
        nodes: layout.nodes,
        viewport: layout.viewport,
      }),
    }),
  theme: () => request<ThemePayload>("/v1/dashboard/theme"),
  saveTheme: (seed: string) =>
    request<ThemePayload>("/v1/dashboard/theme", {
      method: "PUT",
      body: JSON.stringify({ version: 1, seed }),
    }),
  resetTheme: () =>
    request<ThemePayload>("/v1/dashboard/theme", { method: "DELETE" }),
};
