import { describe, expect, it } from "vitest";
import type { MetadataItem } from "@/shared/api/types";
import { confirmedModel, emptyModelDraft, invalidateModelEvidence, metadataFieldState, prefillMetadata, withConfirmedMetadata } from "./model";

function item(values: Array<number | boolean | string[] | null>, applicable = true): MetadataItem {
  const fields = { input_per_million: values.find((value) => value != null) ?? null };
  const sources = values.map((value, index) => ({ source: `fixture-${index}`, source_provider: "fixture", source_model: "m", fetched_at: "2026-09-30T12:00:00Z", applicable, fields: { input_per_million: { value, source_field: "price" } } }));
  return { upstream_model: "m", fields: fields as MetadataItem["fields"], sources, warnings: [], metadata: { version: 1, sources: sources.map(({ source_provider, source_model, ...source }, index) => ({ ...source, id: `fixture-${index}`, provider_id: source_provider, model_id: source_model })) } };
}

describe("provider evidence regressions", () => {
  it("ignores unknown sources when a known applicable value exists and retains raw null evidence", () => {
    const evidence = item([null, 1]);
    expect(metadataFieldState(evidence, "input_per_million")).toBe("known");
    const draft = prefillMetadata(emptyModelDraft(), evidence);
    expect(draft.values.input_per_million).toBe("1");
    expect(draft.sources[0]?.fields.input_per_million?.value).toBeNull();
    expect(draft.metadata?.sources?.[0]?.fields?.input_per_million?.value).toBeNull();
  });
  it("keeps all-null sources unknown", () => {
    expect(metadataFieldState(item([null, null]), "input_per_million")).toBe("unknown");
    expect(prefillMetadata(emptyModelDraft(), item([null, null])).values.input_per_million).toBe("");
  });
  it("keeps reference-only values unfilled", () => {
    expect(metadataFieldState(item([1], false), "input_per_million")).toBe("reference");
    expect(prefillMetadata(emptyModelDraft(), item([1], false)).values.input_per_million).toBe("");
  });
  it("blocks real conflicts without discarding the conflicting source records", () => {
    const evidence = item([1, 2]);
    expect(metadataFieldState(evidence, "input_per_million")).toBe("conflict");
    const draft = prefillMetadata(emptyModelDraft(), evidence);
    expect(draft.values.input_per_million).toBe("");
    expect(draft.metadata?.sources).toHaveLength(2);
  });
  it.each([0, false, []])("treats explicit %j as known beside null", (value) => {
    expect(metadataFieldState(item([null, value]), "input_per_million")).toBe("known");
  });
  it("uses the latest evidence for values and status while retaining prior normalized provenance", () => {
    let draft = prefillMetadata(emptyModelDraft(), item([1]));
    draft = prefillMetadata(draft, item([2]));
    expect(draft.values.input_per_million).toBe("2");
    expect(draft.evidence?.fields.input_per_million).toBe(2);
    expect(draft.metadata?.sources).toHaveLength(2);
    draft = prefillMetadata(draft, item([null]));
    expect(draft.values.input_per_million).toBe("");
    expect(metadataFieldState(draft.evidence!, "input_per_million")).toBe("unknown");
    expect(draft.metadata?.sources).toHaveLength(3);
  });
  it("preserves operator values through new evidence and serving revision invalidation", () => {
    let draft = prefillMetadata(emptyModelDraft(), item([1]));
    draft.values.input_per_million = "9"; draft.touched.input_per_million = true;
    draft.values.tools = "true";
    draft = invalidateModelEvidence(prefillMetadata(draft, item([null])));
    expect(draft.values.input_per_million).toBe("9");
    expect(draft.values.tools).toBe("");
    expect(draft.evidence).toBeUndefined();
    expect(draft.metadata?.sources).toHaveLength(2);
    expect(confirmedModel("m", draft)).toBeNull();
  });
  it("never marks historic matching evidence as the source of a new confirmation", () => {
    let draft = prefillMetadata(emptyModelDraft(), item([1]));
    draft = invalidateModelEvidence(draft);
    draft.values = { tools: "false", vision: "false", json_mode: "false", reasoning: "false", temperature: "false", reasoning_effort: "[]", input_per_million: "1", output_per_million: "2", context_window: "null", max_output_tokens: "null" };
    const confirmed = withConfirmedMetadata(confirmedModel("m", draft)!, draft, "2026-09-30T12:01:00Z");
    expect(confirmed.metadata?.fields?.input_per_million).toMatchObject({ method: "manual", value: 1, source_ids: ["fixture-0"] });
    expect(confirmed.metadata?.sources).toEqual(draft.metadata?.sources);
  });
});
