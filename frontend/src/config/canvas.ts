import type { CanvasLayout, ConfigurationPayload } from "../api";
import { labelMembers, moveRule, setFallback, setLabelMembership, setRuleChoice, workflowEdges } from "./draft";
import type { RoutingDraft, WorkflowEdge } from "./draft";

export const BOARD_WIDTH = 3200;
export const BOARD_HEIGHT = 2200;
const MAX_COORD = 10000;
const NODE_ID = /^(?:questions|fallback|rule-(?:0|[1-9][0-9]{0,3})|(?:zone|model)::.{1,240})$/u;

export type Position = { x: number; y: number };
export function validPosition(value: unknown): value is Position {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const position = value as Record<string, unknown>;
  return Object.keys(position).length === 2 && Number.isInteger(position.x) && Number.isInteger(position.y) &&
    Math.abs(position.x as number) <= MAX_COORD && Math.abs(position.y as number) <= MAX_COORD;
}

export function validLayout(value: unknown): value is CanvasLayout {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const layout = value as Record<string, unknown>;
  if (Object.keys(layout).some((key) => !["version", "nodes", "viewport", "read_error"].includes(key)) ||
    layout.version !== 1 || !validPosition(layout.viewport) || typeof layout.nodes !== "object" ||
    layout.nodes === null || Array.isArray(layout.nodes)) return false;
  const nodes = layout.nodes as Record<string, unknown>;
  return Object.keys(nodes).length <= 256 && Object.entries(nodes).every(([id, position]) => NODE_ID.test(id) &&
    [...id].every((character) => character.codePointAt(0)! > 31 && character.codePointAt(0)! !== 127) && validPosition(position));
}

/** Rule positions are slot-based and must be reset or shifted when topology changes. */
export function shiftRuleLayout(nodes: Record<string, Position>, from: number, delta: number): Record<string, Position> {
  const shifted: Record<string, Position> = {};
  for (const [id, position] of Object.entries(nodes)) {
    const match = /^rule-(0|[1-9][0-9]*)$/.exec(id);
    if (!match) { shifted[id] = position; continue; }
    const index = Number(match[1]);
    if (delta < 0 && index === from) continue;
    const next = index >= from ? index + delta : index;
    if (next >= 0) shifted[`rule-${next}`] = position;
  }
  return shifted;
}

export type RuleLayoutMutation =
  | { kind: "insert"; index: number }
  | { kind: "remove"; index: number }
  | { kind: "move"; from: number; to: number };

/** Slot layouts follow the exact topology operation, including duplicate rules. */
export function reconcileRuleLayout(
  nodes: Record<string, Position>, mutation: RuleLayoutMutation,
): Record<string, Position> {
  if (mutation.kind === "insert") return shiftRuleLayout(nodes, mutation.index, 1);
  if (mutation.kind === "remove") return shiftRuleLayout(nodes, mutation.index, -1);
  return moveRuleLayout(nodes, mutation.from, mutation.to);
}

export function moveRuleLayout(nodes: Record<string, Position>, from: number, to: number): Record<string, Position> {
  if (from === to || from < 0 || to < 0) return nodes;
  const next: Record<string, Position> = {};
  for (const [id, position] of Object.entries(nodes)) {
    const match = /^rule-(0|[1-9][0-9]*)$/.exec(id);
    if (!match) { next[id] = position; continue; }
    const index = Number(match[1]);
    const target = index === from ? to : from < to && index > from && index <= to ? index - 1 :
      from > to && index >= to && index < from ? index + 1 : index;
    next[`rule-${target}`] = position;
  }
  return next;
}

export function defaultPosition(id: string): Position {
  if (id === "questions") return { x: 50, y: 80 };
  if (id === "fallback") return { x: 50, y: 280 };
  if (id.startsWith("rule-")) {
    const index = Number(id.slice(5));
    return { x: 400 + Math.floor(index / 50) * 210, y: 80 + (index % 50) * 140 };
  }
  if (id.startsWith("zone::")) return { x: 850, y: 80 };
  return { x: 2200, y: 80 };
}

/** Only edits representable by the ordered matrix are accepted. */
export function reconnectEdge(
  draft: RoutingDraft, config: ConfigurationPayload, edge: WorkflowEdge, target: string,
): RoutingDraft | null {
  // Only an edge in the current graph can be rewired. Stale gestures must not
  // overwrite an edit made while the pointer was in flight.
  if (!workflowEdgeExists(draft, config, edge)) return null;
  const label = config.labels.find((item) => `zone::${item.tag}` === target);
  if (edge.kind === "match" && label) {
    if (edge.from === "fallback") return setFallback(draft, { label: label.name });
    if (/^rule-(?:0|[1-9][0-9]*)$/.test(edge.from)) {
      const index = Number(edge.from.slice(5));
      return draft.rules[index] ? setRuleChoice(draft, index, { label: label.name }) : null;
    }
  }
  if (edge.kind === "pool" && edge.from.startsWith("zone::") && target.startsWith("model::")) {
    const source = config.labels.find((item) => `zone::${item.tag}` === edge.from);
    const model = target.slice(7);
    if (source?.resolution === "tag" && Object.hasOwn(draft.models, model)) {
      if (!edge.to.startsWith("model::") || !Object.hasOwn(draft.models, edge.to.slice(7))) return null;
      if (edge.to !== target && labelMembers(draft, config, source).length <= 1) return null;
      if (edge.to === target) return draft;
      if (draft.models[model]!.tags.includes(source.tag)) return null;
      return setLabelMembership(
        setLabelMembership(draft, edge.to.slice(7), source.tag, false), model, source.tag, true,
      );
    }
  }
  if (edge.kind === "unmatched" && edge.from.startsWith("rule-") && target.startsWith("rule-")) {
    const from = Number(edge.from.slice(5));
    const to = Number(target.slice(5));
    // The successor of the current rule may move immediately after it; no skipping or cycles.
    if (Number.isInteger(from) && Number.isInteger(to) && to > from + 1 && to < draft.rules.length) {
      return moveRule(draft, to, from + 1);
    }
  }
  // Last unmatched edge is necessarily fallback. Removing an edge or arbitrary topology is invalid.
  return null;
}

export function disconnectPoolEdge(draft: RoutingDraft, config: ConfigurationPayload, edge: WorkflowEdge): RoutingDraft | null {
  if (edge.kind !== "pool" || !workflowEdgeExists(draft, config, edge) || !edge.from.startsWith("zone::") || !edge.to.startsWith("model::")) return null;
  const label = config.labels.find((item) => `zone::${item.tag}` === edge.from);
  const model = edge.to.slice(7);
  return label?.resolution === "tag" && labelMembers(draft, config, label).length > 1 && Object.hasOwn(draft.models, model) &&
    draft.models[model]!.tags.includes(label.tag) ? setLabelMembership(draft, model, label.tag, false) : null;
}

/** A new label-to-model link adds membership without removing other links. */
export function connectPoolEdge(draft: RoutingDraft, config: ConfigurationPayload, source: string, target: string): RoutingDraft | null {
  const label = config.labels.find((item) => `zone::${item.tag}` === source);
  const model = target.startsWith("model::") ? target.slice(7) : "";
  return label?.resolution === "tag" && Object.hasOwn(draft.models, model) &&
    !draft.models[model]!.tags.includes(label.tag) ? setLabelMembership(draft, model, label.tag, true) : null;
}

/** Reject inert explicit-model edits and removal of the last resolved model. */
export function changeLabelMembership(
  draft: RoutingDraft, config: ConfigurationPayload, modelId: string, tag: string, member: boolean,
): RoutingDraft | null {
  const label = config.labels.find((item) => item.tag === tag);
  const model = draft.models[modelId];
  if (!label || label.resolution !== "tag" || !model) return null;
  if (!member && model.tags.includes(tag) && labelMembers(draft, config, label).length <= 1) return null;
  return setLabelMembership(draft, modelId, tag, member);
}

function workflowEdgeExists(draft: RoutingDraft, config: ConfigurationPayload, edge: WorkflowEdge): boolean {
  // Check the whole tuple; a target alone can exist on several distinct edges.
  return workflowEdges(draft, config).some((current) =>
    current.from === edge.from && current.to === edge.to && current.kind === edge.kind);
}

export function compatibleTargets(draft: RoutingDraft, config: ConfigurationPayload, edge: WorkflowEdge): string[] {
  if (!workflowEdgeExists(draft, config, edge)) return [];
  if (edge.kind === "match") return config.labels.map((label) => `zone::${label.tag}`);
  if (edge.kind === "pool") {
    const label = config.labels.find((item) => `zone::${item.tag}` === edge.from);
    if (label?.resolution !== "tag") return [];
    const canMove = labelMembers(draft, config, label).length > 1;
    return config.models.flatMap((model) => model.id === edge.to.slice(7) ||
      canMove && !draft.models[model.id]?.tags.includes(label.tag) ? [`model::${model.id}`] : []);
  }
  if (!edge.from.startsWith("rule-")) return [];
  const from = Number(edge.from.slice(5));
  return [
    ...draft.rules.flatMap((_, index) => index > from + 1 ? [`rule-${index}`] : []),
    "fallback",
  ];
}
