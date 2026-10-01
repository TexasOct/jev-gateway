import type { ConfigurationPayload } from "@/shared/api/types";

export const configuration: ConfigurationPayload = {
  write_available: true,
  write_disabled_reason: null,
  strategy: "balanced",
  baseline_source: "fixture",
  overlay: { applied: true, path: "fixture", error: null },
  config_hash: "fixture-hash",
  questions: { intent: { type: "choice", instructions: "Choose a route", criteria: { default: "Default" } } },
  fallback: { label: "default" },
  rules: [{ index: 0, when: { intent: "default" }, select: { label: "default" } }],
  labels: [
    { name: "default", score: 0, reasoning_effort: null, description: "", tag: "balanced/default", resolution: "tag", models: ["fixture-provider/fixture-model"] },
    { name: "quality", score: 1, reasoning_effort: null, description: "Synthetic alternate pool", tag: "balanced/quality", resolution: "tag", models: ["fixture-provider/fixture-model"] },
  ],
  models: [{ id: "fixture-provider/fixture-model", provider: "fixture-provider", upstream_model: "fixture-model", priority: 1, baseline_priority: 1, tags: ["balanced/default", "balanced/quality"], baseline_tags: ["balanced/default", "balanced/quality"] }],
  warnings: [],
};
