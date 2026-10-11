import type { ConfigurationPayload } from "@/shared/api/types";

export const configuration: ConfigurationPayload = {
  write_available: true,
  write_disabled_reason: null,
  strategy: "balanced",
  baseline_source: "fixture",
  overlay: { applied: true, path: "fixture", error: null },
  config_hash: "fixture-hash",
  questions: { intent: { type: "choice", instructions: "Choose a route", criteria: { default: "Default", other: "Other" } } },
  fallback: { label: "default" },
  rules: [{ index: 0, when: { intent: "default" }, select: { label: "default" } }],
  labels: [
    { name: "default", score: 0, reasoning_effort: null, description: "", tag: "balanced/default", resolution: "tag", models: ["fixture-provider/fixture-model"] },
    { name: "quality", score: 1, reasoning_effort: null, description: "Synthetic alternate pool", tag: "balanced/quality", resolution: "tag", models: ["fixture-provider/fixture-model"] },
  ],
  models: [{ id: "fixture-provider/fixture-model", provider: "fixture-provider", upstream_model: "fixture-model", priority: 1, baseline_priority: 1, tags: ["balanced/default", "balanced/quality"], baseline_tags: ["balanced/default", "balanced/quality"] }],
  warnings: [],
};

/** Current management response; the original fixture remains a v1 consumer input. */
export const workflowConfiguration: ConfigurationPayload = {
  ...configuration,
  selected_models: ["fixture-provider/fixture-model"],
  editable: true, deletable: false, runtime_default: "balanced",
  definition: {
    kind: "decision_matrix",
    policy: { labels: { default: { models: ["fixture-provider/fixture-model"] }, quality: { models: ["fixture-provider/fixture-model"] } } },
    options: { questions: configuration.questions, rules: configuration.rules.map(({ when, select }) => ({ when, select })), fallback: configuration.fallback },
  },
};

/** Build an editable response after a test customizes the legacy catalog. */
export function editableConfiguration(catalog: ConfigurationPayload = configuration): ConfigurationPayload {
  const current = structuredClone(catalog);
  return {
    ...current,
    selected_models: current.selected_models ?? current.models.map(({ id }) => id),
    editable: true, deletable: false, runtime_default: current.strategy,
    definition: {
      kind: "decision_matrix",
      policy: { labels: Object.fromEntries(current.labels.map((label) => [label.name, { models: [...label.models] }])) },
      options: { questions: current.questions, rules: current.rules.map(({ when, select }) => ({ when, select })), fallback: current.fallback },
    },
  };
}
