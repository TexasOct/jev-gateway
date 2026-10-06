import { describe, expect, it } from "vitest";
import type { ImportModel, MetadataItem, ModelMetadata } from "@/shared/api/types";
import { confirmedModel, draftFromModel, modelErrors, prefillMetadata, withConfirmedMetadata } from "../models/model";

const values = { tools: true, vision: false, json_mode: true, reasoning: false, temperature: true, reasoning_effort: [], input_per_million: 1, output_per_million: 2, context_window: 64000, max_output_tokens: 4096 };
const fields = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, source_field: `native.${key}` }]));
function fixture(allReferenced: boolean) {
  const sources = Array.from({ length: 32 }, (_, index) => ({ id: `old-${index}`, source: "native_listing", provider_id: "test-provider", model_id: "bounded", applicable: true, fetched_at: `2026-09-01T00:00:${String(index).padStart(2, "0")}Z`, source_updated_at: "2026-08-01", fields }));
  const metadata: ModelMetadata = { version: 1, sources, fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { status: "confirmed", value, method: "source", source_ids: allReferenced ? sources.map((source) => source.id) : ["old-0"], confirmed_at: "2026-10-01" }])) };
  const model: ImportModel = { upstream_model: "bounded", capabilities: { tools: true, vision: false, json_mode: true, reasoning: false, temperature: true, reasoning_effort: [] }, cost: { input_per_million: 1, output_per_million: 2 }, context_window: 64000, max_output_tokens: 4096, quality: 2.5, metadata };
  const source = { ...structuredClone(sources[0]!), id: "new", fetched_at: "2026-10-05T12:00:00Z" };
  const incoming: MetadataItem = { upstream_model: "bounded", fields: structuredClone(values), sources: [{ ...source, source_provider: "test-provider", source_model: "bounded" }], warnings: [], metadata: { version: 1, sources: [source] } };
  return { model, incoming };
}

describe("bounded model persistence with editor history", () => {
  it("keeps a valid maximum envelope savable when all 32 historical sources are required", () => {
    const { model, incoming } = fixture(true);
    const original = draftFromModel(model);
    original.values.input_per_million = "9"; original.touched.input_per_million = true;
    incoming.fields.output_per_million = 3;
    incoming.sources[0]!.fields.output_per_million = { value: 3, source_field: "native.output_per_million" };
    incoming.metadata!.sources![0]!.fields!.output_per_million = { value: 3, source_field: "native.output_per_million" };
    const draft = prefillMetadata(original, incoming);
    expect(draft.metadataRefreshBlocked).toBe(true);
    expect(draft.values).toEqual(original.values);
    expect(draft.currentMetadata).toEqual(original.currentMetadata);
    expect(draft.metadataHistory?.sources).toHaveLength(33);
    expect(modelErrors("bounded", draft)).toEqual({});
    draft.displayName = "Unrelated edit";
    const saved = withConfirmedMetadata(confirmedModel("bounded", draft)!, draft, "2026-10-05");
    expect(saved.metadata?.sources).toEqual(model.metadata?.sources);
    expect(saved.metadata?.fields?.output_per_million?.source_ids).toEqual(model.metadata?.fields?.output_per_million?.source_ids);
    expect(saved.metadata?.fields?.input_per_million?.method).toBe("manual");
    expect(saved.quality).toBe(2.5);
  });
  it("prunes only unreferenced persistence history, retaining dates and current source binding", () => {
    const { model, incoming } = fixture(false);
    const draft = prefillMetadata(draftFromModel(model), incoming);
    expect(draft.metadataRefreshBlocked).toBe(false);
    expect(draft.metadataHistory?.sources).toHaveLength(33);
    const saved = withConfirmedMetadata(confirmedModel("bounded", draft)!, draft, "2026-10-05");
    expect(saved.metadata?.sources?.map((source) => source.id)).toEqual(["old-0", "new"]);
    expect(saved.metadata?.fields?.input_per_million?.source_ids).toEqual(["old-0", "new"]);
    expect(saved.metadata?.sources?.[1]?.fetched_at).toBe("2026-10-05T12:00:00Z");
    expect(saved.metadata?.fields?.input_per_million?.method).toBe("source");
  });
  it("maps a deduplicated current identity back to existing provenance IDs", () => {
    const { model, incoming } = fixture(true);
    incoming.metadata!.sources![0] = { ...model.metadata!.sources![0]!, id: "different-id" };
    const draft = prefillMetadata(draftFromModel(model), incoming);
    expect(draft.metadataRefreshBlocked).toBe(false);
    const saved = withConfirmedMetadata(confirmedModel("bounded", draft)!, draft, "2026-10-05");
    expect(saved.metadata?.sources).toHaveLength(32);
    expect(saved.metadata?.fields?.tools?.source_ids).not.toContain("different-id");
  });
  it("rejects a refresh that fits the source count but exceeds the UTF-8 envelope limit", () => {
    const { model, incoming } = fixture(false);
    model.metadata!.sources = model.metadata!.sources!.slice(0, 1);
    incoming.metadata!.sources = Array.from({ length: 31 }, (_, index) => ({ ...incoming.metadata!.sources![0]!, id: `large-${index}`, fetched_at: `2026-10-05T12:00:${String(index).padStart(2, "0")}Z`, fields: Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, { ...field, source_field: "界".repeat(512) }])) }));
    const original = draftFromModel(model);
    const draft = prefillMetadata(original, incoming);
    expect(draft.metadataRefreshBlocked).toBe(true);
    expect(draft.metadataHistory?.sources).toHaveLength(32);
    expect(modelErrors("bounded", draft)).toEqual({});
    const saved = withConfirmedMetadata(confirmedModel("bounded", draft)!, draft, "2026-10-05");
    expect(saved.metadata).toEqual(model.metadata);
    expect(saved.metadata?.fields?.tools?.confirmed_at).toBe("2026-10-01");
  });
  it("preserves required stored IDs even when their source bodies are identical", () => {
    const { model, incoming } = fixture(true);
    model.metadata!.sources = model.metadata!.sources!.map((source) => ({ ...model.metadata!.sources![0]!, id: source.id }));
    incoming.metadata!.sources![0] = { ...model.metadata!.sources![0]!, id: "current-alias" };
    const draft = prefillMetadata(draftFromModel(model), incoming);
    expect(draft.metadataRefreshBlocked).toBe(false);
    const saved = withConfirmedMetadata(confirmedModel("bounded", draft)!, draft, "2026-10-05");
    expect(saved.metadata?.sources).toEqual(model.metadata?.sources);
    expect(saved.metadata?.fields?.input_per_million?.source_ids).toEqual(model.metadata?.fields?.input_per_million?.source_ids);
  });
});
