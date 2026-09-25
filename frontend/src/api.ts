/**
 * Typed client for the gateway dashboard endpoints.
 *
 * The credential lives in this module's memory only: never localStorage, never
 * sessionStorage, never a cookie, never the URL. `setCredential` is the single
 * write path.
 */

export interface OverlayState {
  applied: boolean;
  path: string;
  error: string | null;
}

export interface RuleChoice {
  label?: string;
  selection?: string;
}

export type RuleCondition = string | string[];

export interface Rule {
  index: number;
  when: Record<string, RuleCondition>;
  select: RuleChoice;
}

export interface Question {
  type: string;
  instructions: string;
  criteria: Record<string, string>;
}

export interface LabelRow {
  name: string;
  score: number;
  reasoning_effort: string | null;
  description: string;
  tag: string;
  resolution: "tag" | "models";
  models: string[];
}

export interface ModelRow {
  id: string;
  provider: string;
  upstream_model: string;
  priority: number;
  baseline_priority: number;
  tags: string[];
  baseline_tags: string[];
}

export interface ConfigurationWarning {
  code: string;
  label?: string;
  message: string;
}

export interface ConfigurationPayload {
  write_available: boolean;
  write_disabled_reason: string | null;
  strategy: string;
  baseline_source: string;
  overlay: OverlayState;
  config_hash: string;
  questions: Record<string, Question>;
  fallback: RuleChoice;
  rules: Rule[];
  labels: LabelRow[];
  models: ModelRow[];
  warnings: ConfigurationWarning[];
}

export interface StorageState {
  enabled?: boolean;
  error?: string | null;
  [key: string]: unknown;
}

export interface LatestRequest {
  request_id: string;
  received_at: number;
  prompt?: string | null;
  content_captured?: boolean;
  ok?: boolean | null;
}

export interface SessionRow {
  session_id: string;
  route?: string | null;
  provider?: string | null;
  upstream_model?: string | null;
  strategy?: string | null;
  label?: string | null;
  turn_count?: number;
  updated_at?: number;
  first_request_at?: number | null;
  latest_request?: LatestRequest | null;
}

export interface SessionsPayload {
  storage: StorageState;
  evidence_available: boolean;
  data: SessionRow[];
  page_size: number;
  next_cursor: string | null;
  has_more: boolean;
}

export type EvidenceSection = Record<string, unknown>;

export interface RetainedRequest {
  request: EvidenceSection;
  decision: EvidenceSection | null;
  upstream_request: EvidenceSection | null;
  outcome: EvidenceSection | null;
}

export interface SessionRequestsPayload {
  session: EvidenceSection;
  storage: StorageState;
  evidence_available: boolean;
  requests: RetainedRequest[];
  page_size: number;
  next_cursor: string | null;
  has_more: boolean;
}

export interface ProviderRow {
  id: string;
  type: string;
  configured: boolean;
  has_api_key: boolean;
  attempts: number | null;
  completed: number | null;
  succeeded: number | null;
  failed: number | null;
  incomplete_evidence: number | null;
  average_latency_ms: number | null;
  last_outcome_at: number | null;
  last_outcome_ok: boolean | null;
  observed_condition: string | null;
}

export interface ProvidersPayload {
  window: { seconds: number; start: number; end: number; basis: string };
  storage: StorageState;
  evidence_available: boolean;
  providers: ProviderRow[];
}

export interface CanvasLayout {
  version: 1;
  nodes: Record<string, { x: number; y: number }>;
  viewport: { x: number; y: number };
  read_error?: string | null;
}

export interface ThemePayload {
  version: number;
  seed: string;
}

export interface OverlayRulePayload {
  when: Record<string, RuleCondition>;
  select: RuleChoice;
}

export interface RoutingOverlayPayload {
  version: number;
  strategy: string;
  questions?: Record<string, Question>;
  rules: OverlayRulePayload[];
  fallback?: RuleChoice;
  models: Record<string, { tags?: string[]; priority?: number }>;
}

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

export function setCredential(value: string | null): void {
  credential = value;
}

export function hasCredential(): boolean {
  return credential !== null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (credential !== null) headers.set("Authorization", `Bearer ${credential}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string; code?: string | null } }
      | null;
    throw new ApiError(
      payload?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      payload?.error?.code ?? null,
    );
  }
  return (await response.json()) as T;
}

export const api = {
  providers: () => request<ProvidersPayload>("/v1/routing/providers/summary"),
  sessions: (cursor?: string, signal?: AbortSignal) => request<SessionsPayload>(
    `/v1/routing/sessions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    { signal },
  ),
  sessionRequests: (sessionId: string, cursor?: string, signal?: AbortSignal) =>
    request<SessionRequestsPayload>(
      `/v1/routing/sessions/${encodeURIComponent(sessionId)}/requests${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      { signal },
    ),
  configuration: () => request<ConfigurationPayload>("/v1/routing/configuration"),
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
  saveCanvasLayout: (layout: CanvasLayout) => request<CanvasLayout>("/v1/dashboard/canvas-layout", {
    method: "PUT", body: JSON.stringify({ version: layout.version, nodes: layout.nodes, viewport: layout.viewport }),
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
