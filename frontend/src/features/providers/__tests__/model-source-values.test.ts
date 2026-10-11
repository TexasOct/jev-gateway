import { describe, expect, it } from "vitest";
import type { MetadataItem } from "@/shared/api/types";
import { emptyModelDraft, metadataFieldState, modelSourceValues, prefillMetadata, withConfirmedMetadata, draftFromModel, confirmedModel } from "../models/model";

function reference(): MetadataItem {
  const fields = { input_per_million: { value: 2, source_field: "cost.input" }, tools: { value: false, source_field: "tool_call" }, reasoning_effort: { value: [], source_field: "effort" } };
  const source = { source: "models_dev", fetched_at: "2026-10-10T00:00:00Z", applicable: false, fields };
  return { upstream_model: "exact", fields: {}, sources: [{ ...source, source_provider: "openai", source_model: "exact" }], warnings: ["reference_only"], metadata: { version: 1, sources: [{ ...source, id: "reference", provider_id: "openai", model_id: "exact" }] } };
}

describe("explicit model source choices", () => {
  it("offers proxy reference values without automatically accepting them", () => {
    const item = reference();
    const draft = prefillMetadata(emptyModelDraft(), item);
    expect(draft.values.input_per_million).toBe("");
    expect(metadataFieldState(item, "input_per_million")).toBe("reference");
    expect(modelSourceValues(item, "input_per_million").map((choice) => choice.value)).toEqual(["2"]);
    expect(modelSourceValues(item, "tools").map((choice) => choice.value)).toEqual(["false"]);
    expect(modelSourceValues(item, "reasoning_effort").map((choice) => choice.value)).toEqual(["[]"]);
  });
  it("retains provenance and manual ownership when an operator adopts a reference", () => {
    const item = reference();
    const model = { upstream_model: "exact", cost: { input_per_million: 1, output_per_million: 8 }, capabilities: { tools: false, vision: false, json_mode: false, reasoning: false, temperature: true, reasoning_effort: [] }, context_window: 10000, max_output_tokens: 1000 };
    const draft = prefillMetadata(draftFromModel(model), item);
    draft.values.input_per_million = modelSourceValues(item, "input_per_million")[0]!.value;
    draft.touched.input_per_million = true;
    const saved = withConfirmedMetadata(confirmedModel("exact", draft)!, draft, "2026-10-10");
    expect(saved.cost.input_per_million).toBe(2);
    expect(saved.metadata?.fields?.input_per_million).toMatchObject({ status: "confirmed", value: 2, method: "manual", source_ids: ["reference"] });
    expect(saved.metadata?.sources?.[0]?.applicable).toBe(false);
    expect(prefillMetadata(draft, { ...item, sources: [] }).values.input_per_million).toBe("2");
  });
  it("offers each distinct applicable value for a conflict", () => {
    const item = reference();
    item.sources[0]!.applicable = true;
    item.sources.push({ ...item.sources[0]!, source: "models_dev_catalog", fields: { input_per_million: { value: 3, source_field: "cost.input" } } });
    item.sources.push(structuredClone(item.sources[0]!));
    expect(modelSourceValues(item, "input_per_million").map((choice) => choice.value)).toEqual(["2", "3"]);
  });
  it("does not offer unknown, invalid, failed or already known automatic values", () => {
    const item = reference();
    item.sources[0]!.fields.input_per_million!.value = null;
    expect(modelSourceValues(item, "input_per_million")).toEqual([]);
    item.sources[0]!.fields.input_per_million!.value = -1;
    expect(modelSourceValues(item, "input_per_million")).toEqual([]);
    item.sources[0]!.fields.input_per_million!.value = 0;
    expect(modelSourceValues(item, "input_per_million")[0]?.value).toBe("0");
    item.warnings = ["metadata_source_unavailable"];
    expect(modelSourceValues(item, "input_per_million")).toEqual([]);
    item.warnings = []; item.sources[0]!.applicable = true; item.fields.input_per_million = 0;
    expect(modelSourceValues(item, "input_per_million")).toEqual([]);
  });
});
