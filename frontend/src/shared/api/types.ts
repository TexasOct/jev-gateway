/** Types for the dashboard API responses and routing writes. No runtime state. */

export interface OverlayState {
  applied: boolean;
  path: string;
  error: string | null;
}

export interface RuleChoice {
  label?: string;
  tier?: string;
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
  score?: number;
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
  defaults?: { default_model: string | null };
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
  defaulted?: boolean;
  reason?: string | null;
  turn_count?: number;
  updated_at?: number;
  first_request_at?: number | null;
  latest_request?: LatestRequest | null;
}

export interface RoutingActivityPath {
  strategy: string;
  route: string;
  provider: string;
  upstream_model: string;
  in_flight_requests: number;
  in_flight_streams: number;
}

export interface RoutingActivityPayload {
  object: "routing.activity";
  scope: "process";
  instance_id: string;
  complete: boolean;
  paths: RoutingActivityPath[];
}

export interface SessionsPayload {
  storage: StorageState;
  evidence_available: boolean;
  data: SessionRow[];
  page_size: number;
  next_cursor: string | null;
  has_more: boolean;
}

export interface StrategyRow {
  name: string;
  description: string | null;
  kind?: string;
  type?: string;
  policy: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface StrategiesPayload {
  object: "list";
  default: string;
  data: StrategyRow[];
}

/** Safe model tags and strategy definitions from the authenticated policy read. */
export interface PolicyCatalog {
  models: { name: string; tags: string[] }[];
  strategies: StrategyRow[];
  defaults?: { default_model: string | null };
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
export type ProviderKind = "llm" | "decision";
export type CredentialChange = { action: "keep" | "clear" } | { action: "set"; value: string };
export type ProviderProfile = {
  id: string;
  type?: string;
  protocol?: string;
  api_base: string | null;
  api_key_env?: string | null;
  display_name?: string | null;
  brand_id?: string | null;
  icon_id?: string | null;
  allow_private_network?: boolean;
  model?: string | null;
  has_api_key?: boolean;
  params?: Record<string, JsonValue>;
  param_env?: Record<string, string>;
  transport_credential_presence?: Record<string, boolean>;
};
export type ProviderSetupField = {
  key: string;
  target: "params" | "param_env";
  label: string;
  label_zh: string;
  required: boolean;
  placeholder?: string;
};
export type ProviderPreset = ProviderProfile & {
  kind: ProviderKind;
  display_name: string;
  aliases?: string[];
  docs_url?: string;
  setup_instructions?: string;
  setup_instructions_zh?: string;
  setup_fields?: ProviderSetupField[];
};
export type ProviderConfiguration = {
  revision: string;
  write_available: boolean;
  defaults?: { default_model: string | null };
  gateway: { api_key_env: string | null; has_api_key: boolean };
  gateway_bootstrap_available: boolean;
  providers: ProviderProfile[];
  decision: { enabled: boolean; default_provider: string | null; timeout_seconds: number; providers: ProviderProfile[] };
  models: ProviderModelView[];
  presets: ProviderPreset[];
  provider_types: string[];
  decision_protocols: string[];
};
export type ImportModel = {
  provider?: string;
  upstream_model: string;
  display_name?: string | null;
  enabled?: boolean;
  tags?: string[];
  priority?: number;
  quality?: number;
  capabilities: { tools: boolean; vision: boolean; json_mode: boolean; reasoning: boolean; temperature: boolean; reasoning_effort: string[] };
  cost: { input_per_million: number; output_per_million: number; cache_read_per_million?: number | null; cache_write_per_million?: number | null };
  context_window: number | null;
  max_output_tokens: number | null;
  metadata?: ModelMetadata;
};
export type ProviderModelView = ImportModel & { name: string; provider: string; tags: string[]; api_base: string | null; provider_type: string; has_api_key: boolean; priority: number; quality: number; routing_overlay_fields?: ("tags" | "priority")[] };
export type ProviderCommandResult = ProviderConfiguration & { valid: true; applied: boolean; imported: number; skipped: number };
export type GatewayCredentialMutation = { expected_revision: string; credential: { action: "set"; value: string } };
export type GatewayCredentialResult = ProviderConfiguration & { valid: true; applied: true };
export type ProviderOperation =
  | { action: "update_model"; model_id: string; model: ImportModel }
  | { action: "set_default_model"; model: string | null }
  | { action: "upsert"; kind: ProviderKind; provider: ProviderProfile; credential: CredentialChange; transport_credentials?: Record<string, CredentialChange> }
  | { action: "delete"; kind: ProviderKind; id: string }
  | { action: "import"; provider_id: string; models: ImportModel[]; confirmed: true };
export type ProviderMutation = { expected_revision: string; operations: ProviderOperation[] };
export type ProviderSelector = ({ provider_id: string } | { provider: ProviderProfile }) & { credential?: CredentialChange; transport_credentials?: Record<string, CredentialChange> };
export type ProviderConnectionResult = {
  provider_id: string | null;
  status: "success" | "authentication_error" | "address_error" | "network_error" | "unsupported" | "incomplete";
  scope: "model_listing";
  model_count: number | null;
  warnings: string[];
};
export type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
export type MetadataFields = {
  input_per_million: number | null; output_per_million: number | null;
  cache_read_per_million?: number | null; cache_write_per_million?: number | null;
  tools: boolean | null; vision: boolean | null; json_mode: boolean | null;
  reasoning: boolean | null; temperature: boolean | null; reasoning_effort: string[] | null;
  context_window: number | null; max_output_tokens: number | null;
};
export type InputModalityReference = {
  value: Array<"text" | "image" | "audio" | "video" | "pdf">;
  source_field: string;
};
export type CandidateSource = {
  source: string; source_provider: string; source_model: string; fetched_at: string;
  applicable: boolean;
  fields: Record<string, { value: boolean | Array<string | null> | number | null; source_field: string; unit?: string; source_unit?: string }>;
  url?: string; schema_revision?: string; source_updated_at?: string; canonical_model_id?: string;
  source_reasoning_effort?: Array<string | null>; pricing?: ProjectedPricing;
  input_modalities?: InputModalityReference;
};
export type MetadataFieldName = keyof MetadataFields;
export type ProjectedPrice = { value: number | null; unit: "USD/M tokens" | "USD/source unit" };
export type ProjectedPriceCondition = {
  condition?: { type: "context"; size: number }; min_prompt_tokens?: number;
  utc_start?: number; utc_end?: number; utc_days?: Array<"monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday">;
  condition_fields?: Array<"context" | "context_length" | "time" | "start_time" | "end_time">;
  context?: number; context_length?: number; time?: string; start_time?: string; end_time?: string;
  unrecognized_conditions?: boolean; threshold_unverified?: boolean;
};
export type ProjectedPricing = Record<string, unknown> & {
  tiers?: Array<ProjectedPriceCondition & Record<string, unknown>>;
  overrides?: Array<ProjectedPriceCondition & Record<string, unknown>>;
  context_over_200k?: ProjectedPriceCondition & Record<string, unknown>;
};
export type MetadataSource = {
  id: string; source?: string; url?: string; fetched_at?: string; source_updated_at?: string;
  provider_id?: string; model_id?: string; unit?: string; field_path?: string; source_unit?: string;
  applicable?: boolean; schema_revision?: string; canonical_model_id?: string;
  source_reasoning_effort?: Array<string | null>;
  input_modalities?: InputModalityReference;
  fields?: Partial<Record<MetadataFieldName | "max_input_tokens" | "structured_output", { value: boolean | Array<string | null> | number | null; source_field: string; unit?: string; source_unit?: string }>>;
  pricing?: ProjectedPricing;
};
export type MetadataConfirmation = { confirmed_at?: string; method?: string };
export type MetadataFieldEvidence = MetadataConfirmation & { status: "known" | "unknown" | "conflict" | "confirmed"; value?: boolean | string[] | number | null; source_ids?: string[] };
export type ModelMetadata = { version: 1; sources?: MetadataSource[]; fields?: Partial<Record<MetadataFieldName, MetadataFieldEvidence>>; confirmation?: MetadataConfirmation };
export type ModelEvidence = { fields: Partial<MetadataFields>; sources: CandidateSource[]; warnings: string[] };
export type DiscoveryItem = { upstream_model: string; qualified_id: string; imported: boolean; metadata: ModelEvidence; metadata_envelope: ModelMetadata };
export type DiscoveryResult = { provider_id: string | null; supported: boolean; complete: boolean; items: DiscoveryItem[]; warnings: string[] };
export type MetadataItem = ModelEvidence & { upstream_model: string; metadata: ModelMetadata };
export type MetadataResult = { items: MetadataItem[]; fetched_at: string | null; stale: boolean; warnings?: string[] };
export type SetupStatus = {
  required: boolean;
  local_setup_available: boolean;
  revision: string;
  has_providers: boolean;
  has_models: boolean;
  routing_ready: boolean;
  next_step: "gateway_key" | "provider" | "model" | "routing" | "ready";
};
