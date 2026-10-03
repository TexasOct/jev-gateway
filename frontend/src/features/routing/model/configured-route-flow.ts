import type { ConfigurationPayload, RuleCondition } from "@/shared/api/types";
import { diffSummary, workflowEdges } from "./draft";
import type { RoutingDraft, WorkflowEdge } from "./draft";

export interface ConfiguredBranch {
  id: string;
  kind: "rule" | "default" | "failure";
  order: number | null;
  conditions: { question: string; values: string[] }[];
  label: string | null;
  selection: string | null;
  poolId: string | null;
  models: string[];
  /** Only the policy decision path is highlighted. Pool edges describe eligibility. */
  path: WorkflowEdge[];
}

export interface ConfiguredRouteFlowProjection {
  questions: { name: string; instructions: string; criteria: { name: string; description: string }[] }[];
  branches: ConfiguredBranch[];
  edges: WorkflowEdge[];
  changed: boolean;
}

function valuesOf(condition: RuleCondition): string[] {
  return Array.isArray(condition) ? [...condition] : [condition];
}

/** Read-only view of the existing first-match graph. No topology is inferred from layout. */
export function projectConfiguredRouteFlow(
  draft: RoutingDraft,
  config: ConfigurationPayload,
): ConfiguredRouteFlowProjection {
  const edges = workflowEdges(draft, config);
  const context = edges.find((edge) => edge.kind === "context");
  const branches = [...draft.rules.map((rule, index) => ({
    id: `rule-${index}`,
    kind: "rule" as const,
    order: index + 1,
    conditions: Object.entries(rule.when).map(([question, value]) => ({ question, values: valuesOf(value) })),
    choice: rule.select,
  })), { id: "default", kind: "default" as const, order: null, conditions: [], choice: { label: config.labels[0]?.name, selection: undefined } },
  { id: "fallback", kind: "failure" as const, order: null, conditions: [], choice: draft.fallback }];

  return {
    questions: Object.entries(draft.questions).map(([name, question]) => ({
      name,
      instructions: question.instructions,
      criteria: Object.entries(question.criteria).map(([criterion, description]) => ({ name: criterion, description })),
    })),
    branches: branches.map(({ id, kind, order, conditions, choice }) => {
      const match = edges.find((edge) => edge.from === id && edge.kind === "match");
      const poolId = kind === "default" && config.labels[0] ? `zone::${config.labels[0].tag}` : match?.to ?? null;
      const models = poolId === null ? [] : edges
        .filter((edge) => edge.from === poolId && edge.kind === "pool")
        .map((edge) => edge.to.slice("model::".length));
      const failure = edges.find((edge) => edge.kind === "failure");
      const path: WorkflowEdge[] = kind === "failure" ? failure ? [failure] : [] : context ? [context] : [];
      for (let previous = 0; previous < (kind === "failure" ? 0 : kind === "default" ? draft.rules.length : (order ?? 1) - 1); previous += 1) {
        const unmatched = edges.find((edge) => edge.from === `rule-${previous}` && edge.kind === "unmatched");
        if (unmatched) path.push(unmatched);
      }
      if (match) path.push(match);
      return {
        id,
        kind,
        order,
        conditions,
        label: choice.label ?? null,
        selection: choice.selection ?? null,
        poolId,
        models,
        path,
      };
    }),
    edges,
    changed: diffSummary(draft, config).changed,
  };
}
