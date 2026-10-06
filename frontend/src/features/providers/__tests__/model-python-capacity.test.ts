import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { ImportModel, ModelMetadata } from "@/shared/api/types";
import { confirmedModel, draftFromModel, modelErrors, withConfirmedMetadata } from "../models/model";

// Exercise the actual Python JSON parser/encoder, including wire int/float types.
function pythonBytes(metadata: ModelMetadata): number {
  return Number(execFileSync("python3", ["-c", "import json,sys; print(len(json.dumps(json.load(sys.stdin), ensure_ascii=False, allow_nan=False).encode()))"], { input: JSON.stringify(metadata), encoding: "utf8" }));
}

function boundaryModel(value: number, target: number): ImportModel {
  const values = { tools: true, vision: false, json_mode: true, reasoning: false, temperature: true, reasoning_effort: ["low", "high"], input_per_million: value, output_per_million: 2, cache_read_per_million: 0, cache_write_per_million: 3, context_window: 64000, max_output_tokens: 4096 };
  const sources = Array.from({ length: 32 }, (_, index) => ({ id: `required-${index}`, source: "native_listing", provider_id: "test-provider", model_id: "capacity", applicable: true, fetched_at: "2026-10-05T12:00:00.000Z", source_updated_at: "2026-08-01", fields: Object.fromEntries(Object.entries(values).map(([field, raw]) => [field, { value: raw, source_field: `raw.${field}` }])) }));
  const metadata: ModelMetadata = { version: 1, sources, fields: Object.fromEntries(Object.entries(values).map(([field, raw]) => [field, { status: "confirmed", value: raw, method: "source", source_ids: sources.map((source) => source.id), confirmed_at: "2026-10-05T12:00:00.000Z" }])), confirmation: { confirmed_at: "2026-10-05T12:00:00.000Z", method: "reviewed" } };
  let remaining = target - pythonBytes(metadata);
  for (const source of sources) for (const evidence of Object.values(source.fields)) {
    const count = Math.min(512 - evidence.source_field.length, Math.floor(remaining / 3));
    evidence.source_field += "汉".repeat(count);
    remaining -= count * 3;
    if (remaining < 3) {
      const tail = Math.min(512 - evidence.source_field.length, remaining);
      evidence.source_field += "x".repeat(tail);
      remaining -= tail;
    }
  }
  expect(remaining).toBe(0);
  expect(pythonBytes(metadata)).toBe(target);
  return { upstream_model: "capacity", capabilities: { tools: true, vision: false, json_mode: true, reasoning: false, temperature: true, reasoning_effort: ["low", "high"] }, cost: { input_per_million: value, output_per_million: 2, cache_read_per_million: 0, cache_write_per_million: 3 }, context_window: 64000, max_output_tokens: 4096, metadata };
}

describe("Python envelope capacity at numeric representation boundaries", () => {
  const numbers = [0, -0, Number.MIN_VALUE, 2.2250738585072014e-308, 1e-7, 1e-6, 0.0000010000000000000002, 0.000009999999999999999, 0.00001, 0.00009999999999999999, 0.0001, 0.1, 1, 1.0000000000000002, 1e16, 1e20, 1e21, 1e23, Number.MAX_VALUE];
  it.each(numbers)("matches Python admission for %s with all sources required", (value) => {
    for (const target of [262144, 262145]) {
      const model = boundaryModel(value, target);
      const draft = draftFromModel(model);
      draft.displayName = "Unrelated display edit";
      expect(modelErrors("capacity", draft)).toEqual(target === 262144 ? {} : { metadata: "pmEvidenceLimit" });
      const confirmed = confirmedModel("capacity", draft);
      expect(confirmed !== null).toBe(target === 262144);
      if (confirmed) {
        const saved = withConfirmedMetadata(confirmed, draft, "2026-10-05T12:01:00.000Z");
        expect(saved.metadata).toEqual(model.metadata);
        expect(saved.metadata?.sources).toHaveLength(32);
        expect(pythonBytes(saved.metadata!)).toBe(target);
        expect(saved.capabilities.reasoning_effort).toEqual(["low", "high"]);
      }
    }
  });
});
