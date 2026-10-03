import type { ConfigurationPayload } from "@/shared/api/types";
import type { ConnectionIntent } from "./canvas";
import { invalidQuestions, workflowEdges } from "./draft";
import type { RoutingDraft, WorkflowEdge } from "./draft";
import { nodeCardMetrics } from "./node-card";
import type { NodeDimensions } from "./node-card";

export type CanvasOutput = {
  id: string;
  kind: WorkflowEdge["kind"] | "add";
  name?: string;
  edge?: WorkflowEdge;
  intent: ConnectionIntent;
};

/** Display channels project the canonical graph without changing rule execution. */
export function canvasOutputs(draft: RoutingDraft, config: ConfigurationPayload): Record<string, CanvasOutput[]> {
  const edges = workflowEdges(draft, config);
  const entry = edges[0]!;
  const invalid = new Set(invalidQuestions(draft).map(({ name }) => name));
  const outputs: Record<string, CanvasOutput[]> = {
    questions: Object.entries(draft.questions).filter(([question]) => !invalid.has(question)).flatMap(([question, definition]) =>
      Object.keys(definition.criteria).map((criterion) => ({
        id: JSON.stringify([question, criterion]), kind: "context" as const,
        name: `${question} = ${criterion}`, edge: entry, intent: { kind: "reconnect" as const, edge: entry },
      }))),
  };
  const failure = edges.find((edge) => edge.kind === "failure")!;
  outputs.questions!.push({ id: "failure", kind: "failure", edge: failure, intent: { kind: "reconnect", edge: failure } });
  for (const from of [...draft.rules.map((_, index) => `rule-${index}`), "fallback"]) {
    const match = edges.find((edge) => edge.from === from && edge.kind === "match");
    const unmatched = edges.find((edge) => edge.from === from && edge.kind === "unmatched");
    outputs[from] = [{ id: "match", kind: "match", edge: match,
      intent: match ? { kind: "reconnect", edge: match } : { kind: "new-match", from } }];
    if (unmatched) outputs[from]!.push({ id: "unmatched", kind: "unmatched", edge: unmatched, intent: { kind: "reconnect", edge: unmatched } });
  }
  for (const label of config.labels) {
    const from = `zone::${label.tag}`;
    outputs[from] = edges.filter((edge) => edge.from === from).map((edge) => ({
      id: edge.to, kind: "pool", name: edge.to.slice(7), edge, intent: { kind: "reconnect", edge },
    }));
    if (label.resolution === "tag") outputs[from]!.push({ id: "add", kind: "add", intent: { kind: "new-pool", from } });
  }
  for (const model of config.models) outputs[`model::${model.id}`] = [];
  return outputs;
}

export function canvasDimensions(outputs: Record<string, CanvasOutput[]>): NodeDimensions {
  return Object.fromEntries(Object.entries(outputs).map(([id, rows]) => [id, nodeCardMetrics(rows.length)]));
}
