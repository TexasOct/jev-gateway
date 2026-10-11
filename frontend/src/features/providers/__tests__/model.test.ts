import { describe, expect, it } from "vitest";
import { confirmedModel, draftFromModel, emptyModelDraft, metadataFieldState, prefillMetadata, withConfirmedMetadata } from "../models/model";
import { profileForWrite, searchProfiles } from "../shared/profiles";
import type { ModelMetadata } from "@/shared/api/types";

describe("provider import confirmation", () => {
  it("keeps unknown values unconfirmed, including nullable prices and capabilities", () => {
    const draft = prefillMetadata(emptyModelDraft(), { upstream_model: "m", fields: { tools: null, vision: null, input_per_million: null, output_per_million: null }, sources: [], warnings: [] });
    expect(draft.values.tools).toBe("");
    expect(draft.values.input_per_million).toBe("");
    const model = confirmedModel("m", draft)!;
    expect(model.capabilities).toEqual({});
    expect(model.cost).toEqual({});
    expect(withConfirmedMetadata(model, draft, "2026-10-11")).not.toHaveProperty("metadata");
  });
  it("allows each basic parameter to remain omitted while validating supplied values", () => {
    const draft = emptyModelDraft();
    draft.values = { ...emptyModelDraft().values, tools: "false", vision: "false", json_mode: "true", reasoning: "true", temperature: "false", reasoning_effort: '["low","high"]', input_per_million: "0", output_per_million: "2.5", context_window: "null", max_output_tokens: "1000" };
    expect(confirmedModel("m", draft)).toMatchObject({ upstream_model: "m", context_window: null, cost: { input_per_million: 0, output_per_million: 2.5 }, capabilities: { temperature: false } });
    for (const field of Object.keys(draft.values).filter((field) => !field.startsWith("cache_"))) {
      expect(confirmedModel("m", { ...draft, values: { ...draft.values, [field]: "" } })).not.toBeNull();
    }
    expect(confirmedModel("m", { ...draft, values: { ...draft.values, output_per_million: "Infinity" } })).toBeNull();
    expect(confirmedModel("m", { ...draft, values: { ...draft.values, max_output_tokens: "1.5" } })).toBeNull();
  });
  it("reopens partial records and keeps false, zero, empty efforts, null and absent facts distinct", () => {
    const partial = { upstream_model: "partial", capabilities: { tools: false, reasoning_effort: [] }, cost: { input_per_million: 0, cache_read_per_million: null }, context_window: null };
    const draft = draftFromModel(partial);
    expect(draft.values).toMatchObject({ tools: "false", vision: "", reasoning_effort: "[]", input_per_million: "0", output_per_million: "", cache_read_per_million: "", context_window: "null", max_output_tokens: "" });
    draft.displayName = "Edited";
    const saved = withConfirmedMetadata(confirmedModel("partial", draft)!, draft, "2026-10-11");
    expect(saved).toMatchObject(partial);
    expect(saved).not.toHaveProperty("max_output_tokens");
    expect(saved.metadata?.fields?.vision).toBeUndefined();
    expect(saved.metadata?.fields?.tools).toMatchObject({ status: "confirmed", value: false, method: "manual" });
    expect(saved.metadata?.fields?.cache_read_per_million).toMatchObject({ status: "confirmed", value: null });
  });
  it("clearing a confirmed optional fact retains evidence without retaining its confirmation", () => {
    const draft = draftFromModel({ upstream_model: "m", capabilities: { tools: false }, cost: {}, metadata: { version: 1, sources: [{ id: "old", fields: { tools: { value: false, source_field: "tools" } } }], fields: { tools: { status: "confirmed", value: false, method: "manual", source_ids: ["old"] } } } });
    draft.values.tools = ""; draft.touched.tools = true;
    const saved = withConfirmedMetadata(confirmedModel("m", draft)!, draft, "2026-10-11");
    expect(saved.capabilities).toEqual({});
    expect(saved.metadata?.fields?.tools).toEqual({ status: "unknown", value: null, source_ids: ["old"] });
    expect(saved.metadata?.sources).toEqual(draft.metadata?.sources);
  });
  it("keeps explicit null metadata and cache prices on unrelated edits", () => {
    const draft = draftFromModel({ upstream_model: "m", capabilities: { tools: false }, cost: { input_per_million: 0, cache_read_per_million: null }, metadata: null });
    draft.displayName = "Renamed";
    const saved = withConfirmedMetadata(confirmedModel("m", draft)!, draft, "2026-10-11");
    expect(saved.metadata).toBeNull();
    expect(saved.cost).toEqual({ input_per_million: 0, cache_read_per_million: null });
    draft.values.cache_read_per_million = "2"; draft.touched.cache_read_per_million = true;
    expect(withConfirmedMetadata(confirmedModel("m", draft)!, draft, "2026-10-11").metadata?.fields?.cache_read_per_million).toMatchObject({ status: "confirmed", value: 2, method: "manual" });
  });
  it("protects a manually confirmed unknown cache price during source refresh", () => {
    const metadata: ModelMetadata = { version: 1, sources: [], fields: { cache_read_per_million: { status: "confirmed", value: null, source_ids: [], method: "manual", confirmed_at: "2026-10-01" } } };
    const draft = draftFromModel({ upstream_model: "m", capabilities: {}, cost: { cache_read_per_million: null }, metadata });
    const next = prefillMetadata(draft, { upstream_model: "m", fields: { cache_read_per_million: 2 }, sources: [{ source: "fixture", source_provider: "fixture", source_model: "m", fetched_at: "2026-10-11", applicable: true, fields: { cache_read_per_million: { value: 2, source_field: "cache" } } }], warnings: [] });
    expect(next.values.cache_read_per_million).toBe("");
    expect(next.touched.cache_read_per_million).toBe(true);
    const saved = withConfirmedMetadata(confirmedModel("m", next)!, next, "2026-10-11");
    expect(saved.cost.cache_read_per_million).toBeNull();
    expect(saved.metadata?.fields?.cache_read_per_million).toEqual(metadata.fields?.cache_read_per_million);
  });
  it("prefills only untouched conflict-free fields and retains source evidence", () => {
    const draft = emptyModelDraft(); draft.values.tools = "false"; draft.touched.tools = true;
    const next = prefillMetadata(draft, { upstream_model: "m", fields: { tools: true, vision: false, input_per_million: null, context_window: null, temperature: null }, sources: [{ source: "fixture", source_provider: "fixture", source_model: "m", fetched_at: "2026-09-30", applicable: true, fields: { tools: { value: true, source_field: "tools" }, vision: { value: false, source_field: "vision" } }, url: "https://example.test/models" }], warnings: ["conflict"] });
    expect(next.values.tools).toBe("false"); expect(next.values.vision).toBe("false");
    expect(next.values.input_per_million).toBe(""); expect(next.values.context_window).toBe(""); expect(next.values.temperature).toBe("");
    expect(next.sources).toHaveLength(1); expect(next.warnings).toEqual(["conflict"]);
  });
  it("keeps custom serving reference-only sources from prefilling and retains their extra evidence", () => {
    const source = { source: "fixture", source_provider: "openai", source_model: "m", fetched_at: "2026-09-30", applicable: false, fields: { input_per_million: { value: 2, source_field: "pricing.input", unit: "USD/M tokens", source_unit: "USD/token" }, max_input_tokens: { value: 10000, source_field: "max_input_tokens" } }, pricing: { tiers: [{ input: 2 }] } };
    const draft = prefillMetadata(emptyModelDraft(), { upstream_model: "m", fields: { input_per_million: 2 }, sources: [source], warnings: [] });
    expect(draft.values.input_per_million).toBe(""); expect(draft.sources).toEqual([source]);
  });
  it("identifies conflicting sources and retains an earlier automatic value for review", () => {
    const sources = [1, 2].map((value) => ({ source: `fixture-${value}`, source_provider: "openai", source_model: "m", fetched_at: "2026-09-30", applicable: true, fields: { input_per_million: { value, source_field: "pricing.input", unit: "USD/M tokens" } } }));
    const item = { upstream_model: "m", fields: { input_per_million: null }, sources, warnings: ["conflicting_sources"] };
    const previous = emptyModelDraft(); previous.values.input_per_million = "1";
    expect(metadataFieldState(item, "input_per_million")).toBe("conflict");
    expect(prefillMetadata(previous, item).values.input_per_million).toBe("1");
    expect(prefillMetadata(previous, item).sources).toEqual(sources);
    previous.touched.input_per_million = true;
    expect(prefillMetadata(previous, item).values.input_per_million).toBe("1");
  });
  it("confirms exact routing values while preserving normalized source units, conditions and extra references", () => {
    const draft = emptyModelDraft();
    draft.values = { ...emptyModelDraft().values, tools: "false", vision: "false", json_mode: "true", reasoning: "false", temperature: "true", reasoning_effort: "[]", input_per_million: "9", output_per_million: "3", context_window: "null", max_output_tokens: "1000" };
    draft.touched.input_per_million = true; draft.touched.context_window = true;
    const metadata: ModelMetadata = { version: 1, sources: [{ id: "native_listing-0", source: "native_listing", provider_id: "fixture", model_id: "m", applicable: true, fields: { tools: { value: false, source_field: "tools" }, input_per_million: { value: 1.5, source_field: "pricing.input", unit: "USD/M tokens", source_unit: "USD/token" }, max_input_tokens: { value: 80000, source_field: "max_input_tokens" }, structured_output: { value: true, source_field: "structured_output" } }, source_reasoning_effort: ["unsupported", null], pricing: { input: { value: 1.5, unit: "USD/M tokens" }, tiers: [{ min_prompt_tokens: 200000, input: { value: 3, unit: "USD/M tokens" } }], overrides: [{ utc_start: 1, utc_end: 2, input: { value: 4, unit: "USD/M tokens" } }] } }] };
    draft.metadata = metadata;
    const model = confirmedModel("m", draft)!;
    const imported = withConfirmedMetadata(model, draft, "2026-09-30T12:01:00Z");
    expect(imported.metadata?.sources).toEqual(metadata.sources);
    expect(imported.metadata?.fields?.input_per_million).toEqual({ status: "confirmed", value: 9, source_ids: ["native_listing-0"], confirmed_at: "2026-09-30T12:01:00Z", method: "manual" });
    expect(imported.metadata?.fields?.tools?.method).toBe("source");
    expect(imported.metadata?.fields?.context_window).toMatchObject({ status: "confirmed", value: null, method: "manual" });
    expect(Object.keys(imported.metadata?.fields ?? {})).toHaveLength(10);
    expect(imported.metadata?.confirmation).toEqual({ confirmed_at: "2026-09-30T12:01:00Z", method: "reviewed" });
    expect(imported.metadata?.sources?.[0]).not.toHaveProperty("source_provider");
  });
  it("keeps separate refreshed evidence records with unique IDs without losing either source", () => {
    const initial: ModelMetadata = { version: 1, sources: [{ id: "source-0", provider_id: "fixture", model_id: "m", fetched_at: "2026-09-30T12:00:00Z", fields: { input_per_million: { value: 1, source_field: "price" } } }] };
    const refreshed: ModelMetadata = { version: 1, sources: [{ ...initial.sources![0]!, fetched_at: "2026-09-30T12:01:00Z", fields: { input_per_million: { value: 2, source_field: "price" } } }] };
    const draft = emptyModelDraft(); draft.metadata = initial;
    const next = prefillMetadata(draft, { upstream_model: "m", fields: {}, sources: [], warnings: [], metadata: refreshed });
    expect(next.metadata?.sources).toHaveLength(2);
    expect(new Set(next.metadata?.sources?.map((source) => source.id)).size).toBe(2);
    expect(next.metadata?.sources?.map((source) => source.fields?.input_per_million?.value)).toEqual([1, 2]);
  });
  it("does not send read projections or the other provider kind's fields", () => {
    const profile = { id: "stable", display_name: "New name", api_base: "https://example.test/v1", type: "openai", protocol: "system_one", model: "optional", has_api_key: true, params: { timeout: "[configured]" as const }, param_env: { header: "REFERENCE" } };
    expect(profileForWrite(profile, "llm")).toEqual({ id: "stable", display_name: "New name", api_base: "https://example.test/v1", type: "openai", allow_private_network: false, api_key_env: null, brand_id: null, icon_id: null });
    expect(profileForWrite(profile, "decision")).toMatchObject({ protocol: "system_one", model: "optional" });
    expect(profileForWrite(profile, "decision")).not.toHaveProperty("type");
  });
  it("searches aliases, display names and transport separately from the immutable ID", () => {
    const profiles = [{ id: "stable", display_name: "OpenAI", aliases: ["GPT"], type: "openai", api_base: "https://example.test" }];
    expect(searchProfiles(profiles, "gpt")).toEqual(profiles); expect(searchProfiles(profiles, "stable")).toEqual(profiles); expect(searchProfiles(profiles, "missing")).toEqual([]);
  });
});
