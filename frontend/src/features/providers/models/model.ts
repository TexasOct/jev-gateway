import type { ImportModel, ModelEvidence, CandidateSource, ModelMetadata } from "@/shared/api/types";

export const capabilityFields = ["tools", "vision", "json_mode", "reasoning", "temperature"] as const;
export const modelFields = [...capabilityFields, "reasoning_effort", "input_per_million", "output_per_million", "cache_read_per_million", "cache_write_per_million", "context_window", "max_output_tokens"] as const;
export const modelFieldLabels = { tools: "pmTools", vision: "pmVision", json_mode: "pmJSON", reasoning: "pmReasoning", temperature: "pmTemperature", reasoning_effort: "pmEffort", input_per_million: "pmInputCost", output_per_million: "pmOutputCost", context_window: "pmContext", max_output_tokens: "pmOutput", cache_read_per_million: "mmCacheRead", cache_write_per_million: "mmCacheWrite" } as const;
export type ModelField = typeof modelFields[number];
export type ModelDraft = { values: Record<ModelField, string>; touched: Partial<Record<ModelField, boolean>>; sources: CandidateSource[]; warnings: string[]; metadata?: ModelMetadata; metadataHistory?: ModelMetadata; metadataRefreshBlocked?: boolean; evidence?: ModelEvidence & { upstream_model?: string }; currentMetadata?: ModelMetadata; displayName?: string; enabled?: boolean; tags?: string; priority?: string; quality?: string; originalQuality?: number };
export const emptyModelDraft = (): ModelDraft => ({ values: Object.fromEntries(modelFields.map((field) => [field, ""])) as Record<ModelField, string>, touched: {}, sources: [], warnings: [] });

export function modelDraftChanged(original: ModelDraft, draft: ModelDraft): boolean {
  const pending = (value: ModelDraft) => ({
    displayName: value.displayName?.trim() || "", enabled: value.enabled ?? true,
    tags: value.tags?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [],
    priority: value.priority ?? "100", quality: value.quality ?? "0.5",
    values: modelFields.map((field) => value.values[field]),
    manual: modelFields.map((field) => !!value.touched[field]),
  });
  return JSON.stringify(pending(original)) !== JSON.stringify(pending(draft));
}

function finiteNumber(value: string, minimum: number): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : undefined;
}

export function modelErrors(identity: string, draft: ModelDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.evidence) for (const field of modelFields) {
    if (!draft.touched[field] && draft.values[field] && metadataFieldState(draft.evidence, field) !== "known") errors[field] = "mmReviewEvidence";
  }
  if (!identity.trim() || [...identity].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) errors.identity = "mmIdentityError";
  for (const field of capabilityFields) if (!["true", "false"].includes(draft.values[field])) errors[field] = "mmRequired";
  for (const field of ["input_per_million", "output_per_million", "cache_read_per_million", "cache_write_per_million"] as const) {
    if (field.startsWith("cache_") && !draft.values[field]?.trim()) continue;
    if (finiteNumber(draft.values[field], 0) === undefined) errors[field] = "mmPriceError";
  }
  for (const field of ["context_window", "max_output_tokens"] as const) {
    if (draft.values[field] === "null") continue;
    const value = finiteNumber(draft.values[field], 1);
    if (value === undefined || !Number.isInteger(value)) errors[field] = "mmLimitError";
  }
  if (!errors.context_window && !errors.max_output_tokens && draft.values.context_window !== "null" && draft.values.max_output_tokens !== "null" && Number(draft.values.max_output_tokens) > Number(draft.values.context_window)) errors.max_output_tokens = "mmLimitRelationship";
  try {
    const effort: unknown = JSON.parse(draft.values.reasoning_effort);
    if (!Array.isArray(effort) || effort.some((value) => !["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(value))) errors.reasoning_effort = "mmEffortError";
  } catch { errors.reasoning_effort = "mmEffortError"; }
  if (draft.priority === "" || !Number.isInteger(Number(draft.priority ?? 100))) errors.priority = "mmPriorityError";
  const quality = Number(draft.quality ?? 0.5);
  if (draft.quality?.trim() === "" || !Number.isFinite(quality) || ((quality < 0 || quality > 1) && quality !== draft.originalQuality)) errors.quality = "mmQualityError";
  if (!metadataFits(metadataForWrite(draft), draft)) errors.metadata = "pmEvidenceLimit";
  return errors;
}

export function draftFromModel(model: ImportModel): ModelDraft {
  const draft = emptyModelDraft();
  for (const field of modelFields) {
    const value = field.endsWith("per_million") ? model.cost[field as keyof typeof model.cost] : field === "context_window" || field === "max_output_tokens" ? model[field] : model.capabilities[field as keyof typeof model.capabilities];
    draft.values[field] = value === undefined || (field.startsWith("cache_") && value === null) ? "" : Array.isArray(value) ? JSON.stringify(value) : String(value);
    // Legacy runtime values have no source certification; protect them during refresh.
    const method = model.metadata?.fields?.[field]?.method;
    draft.touched[field] = method === "manual" || (value !== undefined && !(field.startsWith("cache_") && value === null) && method !== "source");
  }
  return { ...draft, metadata: model.metadata, currentMetadata: model.metadata, displayName: model.display_name ?? "", enabled: model.enabled ?? true, tags: model.tags?.join(", ") ?? "", priority: String(model.priority ?? 100), quality: String(model.quality ?? 0.5), originalQuality: model.quality ?? 0.5 };
}

export function automaticDifferences(draft: ModelDraft): Array<{ field: ModelField; before: string; after: string }> {
  if (!draft.evidence) return [];
  const automatic = prefillMetadata({ ...draft, values: emptyModelDraft().values, touched: {} }, { ...draft.evidence, upstream_model: "" });
  return modelFields.filter((field) => draft.touched[field] && automatic.values[field] !== "").map((field) => ({ field, before: draft.values[field], after: automatic.values[field] }));
}

export function confirmedModel(upstream_model: string, draft: ModelDraft): ImportModel | null {
  if (Object.keys(modelErrors(upstream_model, draft)).length) return null;
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
    display_name: draft.displayName?.trim() || null,
    enabled: draft.enabled ?? true,
    tags: draft.tags?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [],
    priority: Number(draft.priority ?? 100), quality: Number(draft.quality ?? 0.5),
    capabilities: { tools: v.tools === "true", vision: v.vision === "true", json_mode: v.json_mode === "true", reasoning: v.reasoning === "true", temperature: v.temperature === "true", reasoning_effort: effort as string[] },
    cost: { input_per_million: input, output_per_million: output, ...Object.fromEntries((["cache_read_per_million", "cache_write_per_million"] as const).filter((field) => v[field]?.trim()).map((field) => [field, Number(v[field])])) },
    context_window: context,
    max_output_tokens: limit,
  };
}

export function metadataFieldState(item: ModelEvidence, field: ModelField): "unknown" | "conflict" | "reference" | "known" {
  if (metadataSourceFailed(item)) return "unknown";
  const applicable = item.sources.filter((source) => source.applicable && source.fields[field]?.value != null);
  const values = new Set(applicable.map((source) => JSON.stringify(source.fields[field]?.value)));
  if (values.size > 1) return "conflict";
  if (!applicable.length) return item.sources.some((source) => !source.applicable && source.fields[field]?.value != null) ? "reference" : "unknown";
  if (item.fields[field] == null) return "unknown";
  return values.has(JSON.stringify(item.fields[field])) ? "known" : "conflict";
}

export function metadataSourceFailed(item: ModelEvidence): boolean {
  return item.warnings.includes("metadata_source_unavailable");
}

export function failedModelRefresh(draft: ModelDraft, upstream_model: string): ModelDraft {
  return { ...draft, evidence: { upstream_model, fields: {}, sources: [], warnings: ["metadata_source_unavailable"] }, currentMetadata: { version: 1, sources: [] } };
}

export function prefillMetadata(draft: ModelDraft, item: ModelEvidence & { upstream_model: string; metadata?: ModelMetadata }): ModelDraft {
  const values = { ...draft.values };
  for (const field of modelFields) {
    if (draft.touched[field]) continue;
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
  const metadata = mergeMetadata(draft.metadata, item.metadata);
  const next = { ...draft, values, sources, warnings: [...new Set([...draft.warnings, ...item.warnings])], metadata, evidence: item, currentMetadata: item.metadata, metadataRefreshBlocked: false };
  const persisted = metadataForWrite(next);
  if (!metadataFits(persisted, next)) {
    // Required references cannot be evicted to accept a refresh. Keep the last
    // usable values and certainty; the rejected response remains inspectable.
    return { ...draft, metadataRefreshBlocked: true, metadataHistory: mergeMetadata(draft.metadataHistory ?? draft.metadata, item.metadata) };
  }
  return { ...next, metadata: persisted, metadataHistory: mergeMetadata(draft.metadataHistory ?? draft.metadata, item.metadata) };
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
  for (const { source, historical } of [...(previous?.sources ?? []).map((source) => ({ source, historical: true })), ...(incoming.sources ?? []).map((source) => ({ source, historical: false }))]) {
    const { id: originalID, ...evidence } = source;
    const identity = JSON.stringify(evidence);
    // Stored IDs may both be referenced even when their evidence is identical.
    if (!historical && evidenceSeen.has(identity)) continue;
    let id = originalID;
    let suffix = 1;
    while (ids.has(id)) id = `${originalID.slice(0, 400)}-${suffix++}`;
    sources.push({ ...source, id });
    ids.add(id); evidenceSeen.add(identity);
  }
  // Confirmation rebuilds field references from these intact source records.
  return { version: 1, sources, fields: previous?.fields };
}

function sourceIdentity(source: NonNullable<ModelMetadata["sources"]>[number]): string {
  const { id, ...evidence } = source;
  void id;
  return JSON.stringify(evidence);
}

function fieldReferences(draft: ModelDraft, field: ModelField): string[] {
  const sources = draft.metadata?.sources ?? [];
  const current = new Set((draft.currentMetadata?.sources ?? sources).filter((source) => source.fields?.[field]).map(sourceIdentity));
  const previous = draft.metadata?.fields ? draft.metadata.fields[field]?.source_ids ?? [] : sources.filter((source) => source.fields?.[field]).map((source) => source.id);
  return [...new Set([...previous, ...sources.filter((source) => current.has(sourceIdentity(source))).map((source) => source.id)])];
}

function metadataForWrite(draft: ModelDraft): ModelMetadata | undefined {
  if (!draft.metadata) return undefined;
  if (metadataFits(draft.metadata, draft)) return draft.metadata;
  const required = new Set([...Object.values(draft.metadata.fields ?? {}).flatMap((field) => field?.source_ids ?? []), ...modelFields.flatMap((field) => fieldReferences(draft, field))]);
  // Only unreferenced persistence history may be pruned. The editor keeps it.
  return { ...draft.metadata, sources: draft.metadata.sources?.filter((source) => required.has(source.id)) };
}

function metadataFits(metadata: ModelMetadata | undefined, draft: ModelDraft): boolean {
  if (!metadata) return true;
  const confirmedAt = "2000-01-01T00:00:00.000Z";
  const fields = { ...metadata.fields };
  for (const field of modelFields) {
    const raw = draft.values[field];
    if (!raw) continue;
    let value: boolean | string[] | number | null;
    try { value = JSON.parse(raw); } catch { value = null; }
    const references = fieldReferences(draft, field);
    const current = draft.currentMetadata?.sources ?? metadata.sources ?? [];
    const method = !draft.touched[field] && current.some((source) => source.applicable && JSON.stringify(source.fields?.[field]?.value) === JSON.stringify(value)) ? "source" : "manual";
    const previous = metadata.fields?.[field];
    fields[field] = previous?.status === "confirmed" && previous.method === method && JSON.stringify(previous.value) === JSON.stringify(value) && JSON.stringify(previous.source_ids ?? []) === JSON.stringify(references)
      ? previous : { status: "confirmed", value, source_ids: references, confirmed_at: confirmedAt, method };
  }
  const envelope = JSON.stringify(fields) === JSON.stringify(metadata.fields) ? metadata : { ...metadata, fields, confirmation: { confirmed_at: confirmedAt, method: "reviewed" } };
  return (metadata.sources?.length ?? 0) <= 32 && new TextEncoder().encode(persistenceJSON(envelope)).length <= 262144;
}

function persistenceJSON(value: unknown): string {
  if (typeof value === "number") {
    const token = JSON.stringify(value);
    // The wire token determines Python's int/float type. Fractional decimals
    // below 1e-4 use scientific notation in json.dumps; integer tokens stay ints.
    const pythonToken = token.includes(".") && !token.includes("e") && Math.abs(value) < 1e-4
      ? value.toExponential() : token;
    return pythonToken.replace(/e([+-])(\d)$/, "e$10$2");
  }
  if (Array.isArray(value)) return `[${value.map(persistenceJSON).join(", ")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => `${JSON.stringify(key)}: ${persistenceJSON(item)}`).join(", ")}}`;
  return JSON.stringify(value);
}

export function withConfirmedMetadata(model: ImportModel, draft: ModelDraft, confirmedAt: string): ImportModel {
  const sources = metadataForWrite(draft)?.sources ?? [];
  const fields: NonNullable<ModelMetadata["fields"]> = { ...draft.metadata?.fields };
  for (const field of modelFields) {
    const value = field.endsWith("per_million") ? model.cost[field as keyof typeof model.cost] : field === "context_window" || field === "max_output_tokens" ? model[field] : model.capabilities[field as keyof typeof model.capabilities];
    if (value === undefined) continue;
    const references = fieldReferences(draft, field);
    const currentSources = draft.currentMetadata?.sources ?? sources;
    const fromSource = !draft.touched[field] && currentSources.some((source) => source.applicable && JSON.stringify(source.fields?.[field]?.value) === JSON.stringify(value));
    const method = fromSource ? "source" : "manual";
    const previous = draft.metadata?.fields?.[field];
    fields[field] = previous?.status === "confirmed" && previous.method === method && JSON.stringify(previous.value) === JSON.stringify(value) && JSON.stringify(previous.source_ids ?? []) === JSON.stringify(references)
      ? previous : { status: "confirmed", value, source_ids: references, confirmed_at: confirmedAt, method };
  }
  const unchanged = draft.metadata && JSON.stringify(fields) === JSON.stringify(draft.metadata.fields) && JSON.stringify(sources) === JSON.stringify(draft.metadata.sources);
  return { ...model, metadata: unchanged ? draft.metadata : { version: 1, sources, fields, confirmation: { confirmed_at: confirmedAt, method: "reviewed" } } };
}
