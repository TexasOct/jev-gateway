import type { RecordedDecision, RetainedRequest, SessionRequestsPayload, SessionsPayload } from "@/shared/api/types";

export const recordedDecision: RecordedDecision = {
  decision_id: "synthetic-decision", strategy: "task_aware", strategy_source: "default",
  route: "openai/gpt-6-luna", provider: "openai", upstream_model: "gpt-6-luna", label: "review", defaulted: false,
  config_hash: "synthetic-recorded-config", reason: "decision_matrix:local:fallback:first_turn_review",
  routing_evidence: {
    classification: { status: "disabled", provider_id: null, answers: {}, attempts: [] },
    rule_status: "classifier_fallback", matched_rule_index: null,
    pool: { label: "review", source: "label_pool", selection: "balanced", candidates: ["openai/gpt-6-luna"] },
  },
  config_context: {
    status: "available", config_hash: "synthetic-recorded-config", decision_enabled: false,
    strategy: { name: "task_aware", kind: "decision_matrix", mode: "fresh", selection: "balanced",
      labels: { review: { models: ["openai/gpt-6-luna"], description: "Synthetic recorded review pool" }, draft: { models: ["openai/gpt-6-luna"] }, engineering: { models: ["openai/gpt-6-sol"] } },
      selected_models: null,
      questions: { workload: { type: "choice", instructions: "Synthetic workload", criteria: { docs: "Documentation", coding: "Implementation" } } },
      rules: [{ index: 7, when: { workload: ["docs"] }, select: { label: "draft", selection: "cheapest_adequate" } }, { index: 3, when: { workload: ["coding"] }, select: { label: "engineering" } }],
      fallback: { label: "review" },
    }, defaults: { default_model: null },
  },
};
const longLine = "Synthetic context with readable long text and Unicode 验证上下文。 ".repeat(18);
export function inspectorRequest(id = "inspector-request-1"): RetainedRequest {
  return {
    request: { request_id: id, received_at: 1700000100, client: "Synthetic desktop client", content_captured: true,
      messages: [{ role: "system", content: "Synthetic folded system instruction" },
        { role: "user", content: `Synthetic selected snapshot, never joined.\n\n${longLine}\n\n\`\`\`typescript\nconst syntheticLongIdentifier = '${"long_content_".repeat(30)}';\n\`\`\`` },
        { role: "assistant", content: "Synthetic previous answer from the inbound context." },
        { role: "tool", content: "Synthetic folded tool output" }], tools: [{ type: "function", function: { name: "synthetic_lookup" } }] },
    decision: structuredClone(recordedDecision), upstream_request: null,
    outcome: { ok: true, total_tokens: 321, latency_ms: 24, cost_usd: 0.001 },
  };
}
export function inspectorDetail(id = "archive-1"): SessionRequestsPayload {
  return { scope: "retained", in_memory: false, memory_session: null, session: { session_id: id }, storage: { enabled: true }, evidence_available: true,
    requests: [inspectorRequest()], page_size: 30, has_more: false, next_cursor: null };
}
export function historyPage(second = false): SessionsPayload {
  return { scope: "retained", storage: { enabled: true }, evidence_available: true,
    data: Array.from({ length: 10 }, (_, index) => {
      const n = index + (second ? 10 : 0) + 1;
      return { session_id: `archive-${n}`, in_memory: false, client: `Synthetic client ${n}`, request_count: 8,
        first_request_at: 1700000000, last_request_at: 1700000100,
        strategy: "task_aware", label: "review", provider: "openai", upstream_model: "gpt-6-luna", defaulted: false,
        routing_evidence: structuredClone(recordedDecision.routing_evidence),
        latest_request: { request_id: "inspector-request-1", received_at: 1700000100, ok: true, content_captured: true } };
    }), page_size: 10, has_more: !second, next_cursor: second ? null : "history-page-2" };
}
