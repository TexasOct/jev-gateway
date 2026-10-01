import type { ImportModel, ModelEvidence, CandidateSource, ModelMetadata, ProviderKind, ProviderProfile } from "@/shared/api/types";
import { brandAliases } from "./constants";

export const capabilityFields = ["tools", "vision", "json_mode", "reasoning", "temperature"] as const;
export const modelFields = [...capabilityFields, "reasoning_effort", "input_per_million", "output_per_million", "context_window", "max_output_tokens"] as const;
export type ModelField = typeof modelFields[number];
export type ModelDraft = { values: Record<ModelField, string>; touched: Partial<Record<ModelField, boolean>>; sources: CandidateSource[]; warnings: string[]; metadata?: ModelMetadata; evidence?: ModelEvidence; currentMetadata?: ModelMetadata };
export const emptyModelDraft = (): ModelDraft => ({ values: Object.fromEntries(modelFields.map((field) => [field, ""])) as Record<ModelField, string>, touched: {}, sources: [], warnings: [] });

function finiteNumber(value: string, minimum: number): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : undefined;
}

export function confirmedModel(upstream_model: string, draft: ModelDraft): ImportModel | null {
  const v = draft.values;
  if (capabilityFields.some((field) => v[field] !== "true" && v[field] !== "false")) return null;
  const input = finiteNumber(v.input_per_million, 0);
  const output = finiteNumber(v.output_per_million, 0);
  const context = v.context_window === "null" ? null : finiteNumber(v.context_window, 1);
  const limit = v.max_output_tokens === "null" ? null : finiteNumber(v.max_output_tokens, 1);
  if (input === undefined || output === undefined || context === undefined || limit === undefined || !v.reasoning_effort.trim()) return null;
  if ((context !== null && !Number.isInteger(context)) || (limit !== null && !Number.isInteger(limit))) return null;
  let effort: unknown;
  try { effort = JSON.parse(v.reasoning_effort); } catch { return null; }
  if (!Array.isArray(effort) || effort.some((entry) => typeof entry !== "string" || !["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(entry))) return null;
  return {
    upstream_model,
    capabilities: { tools: v.tools === "true", vision: v.vision === "true", json_mode: v.json_mode === "true", reasoning: v.reasoning === "true", temperature: v.temperature === "true", reasoning_effort: effort as string[] },
    cost: { input_per_million: input, output_per_million: output },
    context_window: context,
    max_output_tokens: limit,
  };
}

export function metadataFieldState(item: ModelEvidence, field: ModelField): "unknown" | "conflict" | "reference" | "known" {
  const applicable = item.sources.filter((source) => source.applicable && source.fields[field]?.value != null);
  const values = new Set(applicable.map((source) => JSON.stringify(source.fields[field]?.value)));
  if (values.size > 1) return "conflict";
  if (!applicable.length) return item.sources.some((source) => !source.applicable && source.fields[field]?.value != null) ? "reference" : "unknown";
  return item.fields[field] == null ? "unknown" : "known";
}

export function prefillMetadata(draft: ModelDraft, item: ModelEvidence & { upstream_model: string; metadata?: ModelMetadata }): ModelDraft {
  const values = { ...draft.values };
  for (const field of modelFields) {
    if (draft.touched[field]) continue;
    values[field] = "";
    const candidate = item.fields[field];
    // A flat field can only prefill when an applicable source supports it.
    if (candidate === undefined || candidate === null || metadataFieldState(item, field) !== "known" || !item.sources.some((source) => source.applicable && source.fields[field])) continue;
    const value = candidate;
    if (capabilityFields.includes(field as typeof capabilityFields[number]) && typeof value === "boolean") values[field] = String(value);
    else if (field === "reasoning_effort" && Array.isArray(value)) values[field] = JSON.stringify(value);
    else if (typeof value === "number" && Number.isFinite(value) && value >= 0) values[field] = String(value);
    // A source returning null is unknown. The operator must choose null explicitly.
  }
  const sources = [...new Map([...draft.sources, ...item.sources].map((source) => [JSON.stringify(source), source])).values()];
  return { ...draft, values, sources, warnings: [...new Set([...draft.warnings, ...item.warnings])], metadata: mergeMetadata(draft.metadata, item.metadata), evidence: item, currentMetadata: item.metadata };
}

export function invalidateModelEvidence(draft: ModelDraft): ModelDraft {
  const values = { ...draft.values };
  for (const field of modelFields) if (!draft.touched[field]) values[field] = "";
  return { ...draft, values, evidence: undefined, currentMetadata: { version: 1, sources: [] } };
}

function mergeMetadata(previous?: ModelMetadata, incoming?: ModelMetadata): ModelMetadata | undefined {
  if (!incoming) return previous;
  const sources: NonNullable<ModelMetadata["sources"]> = [];
  const evidenceSeen = new Set<string>();
  const ids = new Set<string>();
  for (const source of [...(previous?.sources ?? []), ...(incoming.sources ?? [])]) {
    const { id: originalID, ...evidence } = source;
    const identity = JSON.stringify(evidence);
    if (evidenceSeen.has(identity)) continue;
    let id = originalID;
    let suffix = 1;
    while (ids.has(id)) id = `${originalID.slice(0, 400)}-${suffix++}`;
    sources.push({ ...source, id });
    ids.add(id); evidenceSeen.add(identity);
  }
  // Confirmation rebuilds field references from these intact source records.
  return { version: 1, sources };
}

export function withConfirmedMetadata(model: ImportModel, draft: ModelDraft, confirmedAt: string): ImportModel {
  const sources = draft.metadata?.sources ?? [];
  const fields: NonNullable<ModelMetadata["fields"]> = {};
  for (const field of modelFields) {
    const value = field === "input_per_million" || field === "output_per_million" ? model.cost[field] : field === "context_window" || field === "max_output_tokens" ? model[field] : model.capabilities[field];
    const relevant = sources.filter((source) => source.fields?.[field]);
    const currentSources = draft.currentMetadata?.sources ?? sources;
    const fromSource = !draft.touched[field] && currentSources.some((source) => source.applicable && JSON.stringify(source.fields?.[field]?.value) === JSON.stringify(value));
    fields[field] = { status: "confirmed", value, source_ids: relevant.map((source) => source.id), confirmed_at: confirmedAt, method: fromSource ? "source" : "manual" };
  }
  return { ...model, metadata: { version: 1, sources, fields, confirmation: { confirmed_at: confirmedAt, method: "reviewed" } } };
}

export function profileForWrite(profile: ProviderProfile, kind: ProviderKind): ProviderProfile {
  return {
    id: profile.id.trim(), api_base: profile.api_base?.trim() || null, api_key_env: profile.api_key_env?.trim() || null,
    display_name: profile.display_name?.trim() || null, brand_id: profile.brand_id?.trim() || null, icon_id: profile.icon_id?.trim() || null,
    ...(kind === "llm" ? { type: profile.type, allow_private_network: profile.allow_private_network === true } : { protocol: profile.protocol, model: profile.model?.trim() || null }),
  };
}

export function searchProfiles<T extends ProviderProfile & { aliases?: string[] }>(profiles: T[], search: string): T[] {
  const query = search.trim().toLocaleLowerCase();
  return profiles.filter((profile) => [profile.id, profile.display_name, profile.brand_id, profile.type, profile.protocol, ...(profile.aliases ?? []), ...(brandAliases[profile.brand_id ?? profile.id] ?? [])].some((value) => value?.toLocaleLowerCase().includes(query)));
}
