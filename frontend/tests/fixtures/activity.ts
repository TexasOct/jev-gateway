import type { ProvidersPayload, RoutingActivityPayload } from "@/shared/api/types";

export const providers: ProvidersPayload = {
  window: { seconds: 60, start: 0, end: 60, basis: "retained" },
  storage: { enabled: true }, evidence_available: true, providers: [],
};
export const activity: RoutingActivityPayload = {
  object: "routing.activity", scope: "process", instance_id: "fixture", complete: true, paths: [],
};
