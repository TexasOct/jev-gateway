import { describe, expect, it } from "vitest";
import type { ImportModel, MetadataItem } from "@/shared/api/types";
import { automaticDifferences, confirmedModel, draftFromModel, emptyModelDraft, failedModelRefresh, invalidateModelEvidence, metadataFieldState, modelErrors, prefillMetadata, withConfirmedMetadata, modelDraftChanged } from "../models/model";

const record: ImportModel = { upstream_model: "exact", display_name: "Named model", enabled: false, tags: ["fast"], priority: 4, quality: 0.8, capabilities: { tools: true, vision: false, json_mode: true, reasoning: false, temperature: true, reasoning_effort: [] }, cost: { input_per_million: 1, output_per_million: 2, cache_read_per_million: 0 }, context_window: 10000, max_output_tokens: 1000 };
function evidence(price: number | null): MetadataItem {
  const fields = { input_per_million: price };
  const source = { source: "fixture", fetched_at: "2026-10-05T10:00:00Z", applicable: true, fields: { input_per_million: { value: price, source_field: "input" } } };
  return { upstream_model: "exact", fields, sources: [{ ...source, source_provider: "fixture", source_model: "exact" }], warnings: [], metadata: { version: 1, sources: [{ ...source, id: "fixture", provider_id: "fixture", model_id: "exact" }] } };
}
describe("whole-model workspace drafts", () => {
  it("clears pending changes when names and enabled values are restored", () => {
    const original = draftFromModel(record);
    expect(modelDraftChanged(original, { ...original, displayName: "Changed" })).toBe(true);
    expect(modelDraftChanged(original, { ...original, enabled: true })).toBe(true);
    expect(modelDraftChanged(original, { ...original, displayName: record.display_name!, enabled: false })).toBe(false);
  });
  it("retains explicit manual ownership even when a source value is unchanged", () => {
    const original = prefillMetadata(emptyModelDraft(), evidence(1));
    const manual = { ...original, touched: { input_per_million: true } };
    expect(modelDraftChanged(original, manual)).toBe(true);
    expect(modelDraftChanged(original, { ...manual, touched: {} })).toBe(false);
  });
  it("round trips all runtime fields including optional zero cache pricing", () => {
    expect(confirmedModel(record.upstream_model, draftFromModel(record))).toEqual(record);
  });
  it("restores source ownership even when the numeric value is unchanged", () => {
    const draft = prefillMetadata(draftFromModel(record), evidence(1));
    expect(automaticDifferences(draft)).toEqual([{ field: "input_per_million", before: "1", after: "1" }]);
    delete draft.touched.input_per_million;
    const restored = withConfirmedMetadata(confirmedModel("exact", draft)!, draft, "2026-10-05");
    expect(restored.cost.input_per_million).toBe(1);
    expect(restored.metadata?.fields?.input_per_million?.method).toBe("source");
    expect(restored.metadata?.sources?.length).toBeGreaterThan(0);
  });
  it("protects legacy values without certifying a source", () => {
    const draft = prefillMetadata(draftFromModel(record), evidence(9));
    expect(draft.values.input_per_million).toBe("1");
    expect(withConfirmedMetadata(confirmedModel("exact", draft)!, draft, "2026-10-05").metadata?.fields?.input_per_million?.method).toBe("manual");
  });
  it("keeps a persisted manual override across reopening and exposes restore differences", () => {
    const draft = draftFromModel({ ...record, metadata: { version: 1, fields: { input_per_million: { status: "confirmed", value: 1, method: "manual" } } } });
    const refreshed = prefillMetadata(draft, evidence(5));
    expect(refreshed.values.input_per_million).toBe("1");
    expect(automaticDifferences(refreshed)).toEqual([{ field: "input_per_million", before: "1", after: "5" }]);
    delete refreshed.touched.input_per_million;
    expect(prefillMetadata(refreshed, evidence(5)).values.input_per_million).toBe("5");
  });
  it("retains an unknown automatic value and requires an explicit ownership decision", () => {
    let draft = prefillMetadata(emptyModelDraft(), evidence(1));
    draft = prefillMetadata(draft, evidence(null));
    expect(draft.values.input_per_million).toBe("1");
    expect(modelErrors("exact", draft).input_per_million).toBe("mmReviewEvidence");
    draft.touched.input_per_million = true;
    expect(modelErrors("exact", draft).input_per_million).toBeUndefined();
    expect(automaticDifferences(draft)).toEqual([]);
  });
  it("rejects range, relationship, fractional limit and nonfinite cache values", () => {
    const draft = draftFromModel(record);
    draft.values.max_output_tokens = "10001"; draft.values.cache_write_per_million = "Infinity"; draft.quality = "2";
    expect(modelErrors("exact", draft)).toMatchObject({ max_output_tokens: "mmLimitRelationship", cache_write_per_million: "mmPriceError", quality: "mmQualityError" });
    expect(confirmedModel("exact", draft)).toBeNull();
  });
  it("never infers optional unknown cache prices as zero", () => {
    const draft = draftFromModel(record); draft.values.cache_read_per_million = "";
    expect(confirmedModel("exact", draft)?.cost).not.toHaveProperty("cache_read_per_million");
  });
  it("rejects flat suggestions that disagree with their applicable source", () => {
    const item = evidence(1); item.fields.input_per_million = 9;
    expect(prefillMetadata(emptyModelDraft(), item).values.input_per_million).toBe("");
  });
  it.each([2.5, -2.5])("permits unchanged finite legacy quality %s only for the opened record", (quality) => {
    const draft = draftFromModel({ ...record, quality });
    draft.displayName = "Unrelated edit";
    expect(modelErrors("exact", draft).quality).toBeUndefined();
    const model = confirmedModel("exact", draft)!;
    expect(model.quality).toBe(quality);
    expect(model).not.toHaveProperty("originalQuality");
    draft.quality = String(quality + 1);
    expect(modelErrors("exact", draft).quality).toBe("mmQualityError");
    draft.quality = "0.7";
    expect(modelErrors("exact", draft).quality).toBeUndefined();
    expect(modelErrors("new", { ...emptyModelDraft(), quality: String(quality) }).quality).toBe("mmQualityError");
    draft.quality = "Infinity";
    expect(modelErrors("exact", draft).quality).toBe("mmQualityError");
  });
  it.each(["unknown", "conflict", "reference", "source failure", "HTTP failure"])("retains cache and input facts through %s without recertification", (mode) => {
    const known = evidence(1);
    known.fields.cache_read_per_million = 0;
    known.sources[0]!.fields.cache_read_per_million = { value: 0, source_field: "cache" };
    known.metadata!.sources![0]!.fields!.cache_read_per_million = { value: 0, source_field: "cache" };
    const original = prefillMetadata(draftFromModel(record), known);
    delete original.touched.input_per_million;
    delete original.touched.cache_read_per_million;
    const latest = structuredClone(known);
    latest.metadata!.sources![0]!.fetched_at = "2026-10-06T10:00:00Z";
    if (mode === "unknown") { latest.fields = {}; latest.sources = []; }
    if (mode === "reference") latest.sources[0]!.applicable = false;
    if (mode === "conflict") latest.sources.push({ ...latest.sources[0]!, fields: { input_per_million: { value: 8, source_field: "input" }, cache_read_per_million: { value: 2, source_field: "cache" } } });
    if (mode === "source failure") latest.warnings = ["metadata_source_unavailable"];
    const next = mode === "HTTP failure" ? failedModelRefresh(original, "exact") : prefillMetadata(original, latest);
    expect(next.values.input_per_million).toBe("1");
    expect(next.values.cache_read_per_million).toBe("0");
    expect(next.metadata!.sources![0]).toEqual(original.metadata!.sources![0]);
    expect(modelErrors("exact", next)).toMatchObject({ input_per_million: "mmReviewEvidence", cache_read_per_million: "mmReviewEvidence" });
    expect(confirmedModel("exact", next)).toBeNull();
    expect(metadataFieldState(next.evidence!, "cache_read_per_million")).not.toBe("known");
    next.touched.input_per_million = true; next.touched.cache_read_per_million = true;
    const confirmed = withConfirmedMetadata(confirmedModel("exact", next)!, next, "2026-10-06");
    expect(confirmed.metadata!.fields!.cache_read_per_million!.method).toBe("manual");
    expect(confirmed.metadata!.fields!.cache_read_per_million!.source_ids).toContain("fixture");
    const retry = prefillMetadata({ ...next, touched: { ...next.touched, input_per_million: false, cache_read_per_million: false } }, known);
    expect(confirmedModel("exact", retry)).not.toBeNull();
  });
  it("clears automatic applicability on a changed serving binding while retaining manual fields and history", () => {
    const original = prefillMetadata(draftFromModel(record), evidence(1));
    delete original.touched.input_per_million;
    const next = invalidateModelEvidence(original);
    expect(next.values.input_per_million).toBe("");
    expect(next.values.output_per_million).toBe("2");
    expect(next.metadata).toEqual(original.metadata);
    expect(next.evidence).toBeUndefined();
    expect(confirmedModel("exact", next)).toBeNull();
  });
});
