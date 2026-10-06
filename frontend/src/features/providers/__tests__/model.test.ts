import { describe, expect, it } from "vitest";
import { confirmedModel, emptyModelDraft, metadataFieldState, prefillMetadata, withConfirmedMetadata } from "../models/model";
import { profileForWrite, searchProfiles } from "../shared/profiles";
import type { ModelMetadata } from "@/shared/api/types";

describe("provider import confirmation", () => {
  it("keeps unknown values unconfirmed, including nullable prices and capabilities", () => {
    const draft = prefillMetadata(emptyModelDraft(), { upstream_model: "m", fields: { tools: null, vision: null, input_per_million: null, output_per_million: null }, sources: [], warnings: [] });
    expect(draft.values.tools).toBe("");
    expect(draft.values.input_per_million).toBe("");
    expect(confirmedModel("m", draft)).toBeNull();
  });
  it("requires all five flags, effort, a price pair and explicit limit decisions", () => {
    const draft = emptyModelDraft();
    draft.values = { ...emptyModelDraft().values, tools: "false", vision: "false", json_mode: "true", reasoning: "true", temperature: "false", reasoning_effort: '["low","high"]', input_per_million: "0", output_per_million: "2.5", context_window: "null", max_output_tokens: "1000" };
    expect(confirmedModel("m", draft)).toMatchObject({ upstream_model: "m", context_window: null, cost: { input_per_million: 0, output_per_million: 2.5 }, capabilities: { temperature: false } });
    for (const field of Object.keys(draft.values).filter((field) => !field.startsWith("cache_"))) {
      expect(confirmedModel("m", { ...draft, values: { ...draft.values, [field]: "" } })).toBeNull();
    }
    expect(confirmedModel("m", { ...draft, values: { ...draft.values, output_per_million: "Infinity" } })).toBeNull();
    expect(confirmedModel("m", { ...draft, values: { ...draft.values, max_output_tokens: "1.5" } })).toBeNull();
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
