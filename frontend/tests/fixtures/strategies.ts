import type { StrategiesPayload } from "@/shared/api/types";

export const strategies: StrategiesPayload = {
  object: "list", default: "balanced", data: [{ name: "balanced", description: "Fixture strategy", policy: {} }],
};
export const policy = {
  models: [{ name: "fixture-provider/fixture-model", tags: ["balanced/default"] }],
  strategies: strategies.data,
};
