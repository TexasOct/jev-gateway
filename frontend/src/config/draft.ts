/**
 * Pure draft state for the visual routing editor.
 *
 * The editor never sends a partial overlay. The server replaces the rule list
 * wholesale and replaces a model's tags when it is named, so this module always
 * emits the complete rule list and every model whose tags or priority differ
 * from the *baseline* file (not from the currently applied overlay). That keeps
 * the stored overlay self-consistent when an operator edits it a second time.
 */

import type {
  ConfigurationPayload,
  LabelRow,
  ModelRow,
  OverlayRulePayload,
  Rule,
  RuleChoice,
  RuleCondition,
  RoutingOverlayPayload,
} from "../api";

export interface ModelDraft {
  id: string;
  tags: string[];
  priority: number;
}

export interface RoutingDraft {
  rules: OverlayRulePayload[];
  models: Record<string, ModelDraft>;
}

function copyConditions(when: Record<string, RuleCondition>): Record<string, RuleCondition> {
  const copy: Record<string, RuleCondition> = {};
  for (const [key, value] of Object.entries(when)) {
    copy[key] = Array.isArray(value) ? [...value] : value;
  }
  return copy;
}

function ruleToDraft(rule: Rule): OverlayRulePayload {
  return { when: copyConditions(rule.when), select: { ...rule.select } };
}

export function draftFromConfiguration(config: ConfigurationPayload): RoutingDraft {
  const models: Record<string, ModelDraft> = {};
  for (const model of config.models) {
    models[model.id] = { id: model.id, tags: [...model.tags], priority: model.priority };
  }
  return { rules: config.rules.map(ruleToDraft), models };
}

export function sameTags(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((tag, index) => tag === b[index]);
}

/** A model belongs to a label when it carries that label's resolved tag. */
export function hasLabelTag(model: ModelDraft, label: LabelRow): boolean {
  return model.tags.includes(label.tag);
}

export function labelMembers(
  draft: RoutingDraft,
  config: ConfigurationPayload,
  label: LabelRow,
): ModelDraft[] {
  return config.models
    .map((model: ModelRow) => draft.models[model.id])
    .filter((model): model is ModelDraft => model !== undefined && hasLabelTag(model, label));
}

export function unassignedModels(
  draft: RoutingDraft,
  config: ConfigurationPayload,
): ModelDraft[] {
  const strategyTags = new Set(config.labels.map((label) => label.tag));
  return config.models
    .map((model: ModelRow) => draft.models[model.id])
    .filter(
      (model): model is ModelDraft =>
        model !== undefined && !model.tags.some((tag) => strategyTags.has(tag)),
    );
}

/** Add or remove one label tag, preserving tags that belong to other strategies. */
export function setLabelMembership(
  draft: RoutingDraft,
  modelId: string,
  tag: string,
  member: boolean,
): RoutingDraft {
  const model = draft.models[modelId];
  if (model === undefined) return draft;
  const withoutTag = model.tags.filter((value) => value !== tag);
  const tags = member ? [...withoutTag, tag] : withoutTag;
  if (sameTags(tags, model.tags)) return draft;
  return {
    ...draft,
    models: { ...draft.models, [modelId]: { ...model, tags } },
  };
}

export function setPriority(draft: RoutingDraft, modelId: string, priority: number): RoutingDraft {
  const model = draft.models[modelId];
  if (model === undefined || model.priority === priority) return draft;
  return { ...draft, models: { ...draft.models, [modelId]: { ...model, priority } } };
}

export function moveRule(draft: RoutingDraft, from: number, to: number): RoutingDraft {
  if (from === to || from < 0 || to < 0 || from >= draft.rules.length || to >= draft.rules.length) {
    return draft;
  }
  const rules = [...draft.rules];
  const [moved] = rules.splice(from, 1);
  if (moved === undefined) return draft;
  rules.splice(to, 0, moved);
  return { ...draft, rules };
}

export function setRuleChoice(
  draft: RoutingDraft,
  index: number,
  patch: Partial<RuleChoice>,
): RoutingDraft {
  const rule = draft.rules[index];
  if (rule === undefined) return draft;
  const rules = [...draft.rules];
  rules[index] = { ...rule, select: { ...rule.select, ...patch } };
  return { ...draft, rules };
}

export function removeRule(draft: RoutingDraft, index: number): RoutingDraft {
  if (index < 0 || index >= draft.rules.length) return draft;
  return { ...draft, rules: draft.rules.filter((_rule, position) => position !== index) };
}

export function toOverlayPayload(
  draft: RoutingDraft,
  config: ConfigurationPayload,
): RoutingOverlayPayload {
  const models: Record<string, { tags: string[]; priority: number }> = {};
  for (const model of config.models) {
    const current = draft.models[model.id];
    if (current === undefined) continue;
    const tagsDiffer = !sameTags(current.tags, model.baseline_tags);
    const priorityDiffers = current.priority !== model.baseline_priority;
    if (tagsDiffer || priorityDiffers) {
      models[model.id] = { tags: [...current.tags], priority: current.priority };
    }
  }
  return {
    version: 1,
    strategy: config.strategy,
    rules: draft.rules.map((rule) => ({
      when: copyConditions(rule.when),
      select: { ...rule.select },
    })),
    models,
  };
}

function describeRule(rule: OverlayRulePayload | Rule): string {
  const conditions = Object.entries(rule.when)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join("|") : String(value)}`)
    .join(", ");
  const label = rule.select.label ?? "no label";
  const selection = rule.select.selection ?? "default selection";
  return `${conditions} → ${label} (${selection})`;
}

export interface DraftDiff {
  changed: boolean;
  rules: string[];
  models: string[];
}

export function diffSummary(draft: RoutingDraft, config: ConfigurationPayload): DraftDiff {
  const rules: string[] = [];
  const originalOrder = config.rules.map((rule) => describeRule(rule));
  const draftOrder = draft.rules.map((rule) => describeRule(rule));
  if (originalOrder.join(" || ") !== draftOrder.join(" || ")) {
    rules.push(`rule order: ${originalOrder.length} → ${draftOrder.length} rules`);
  }
  for (let index = 0; index < draft.rules.length; index += 1) {
    const before = originalOrder[index];
    const after = draftOrder[index];
    if (before !== undefined && after !== undefined && before !== after) {
      rules.push(`rule ${index + 1}: ${before} → ${after}`);
    }
  }

  const models: string[] = [];
  for (const model of config.models) {
    const current = draft.models[model.id];
    if (current === undefined) continue;
    if (!sameTags(current.tags, model.tags)) {
      models.push(`${model.id}: ${model.tags.join(", ") || "(none)"} → ${current.tags.join(", ") || "(none)"}`);
    }
    if (current.priority !== model.priority) {
      models.push(`${model.id}: priority ${model.priority} → ${current.priority}`);
    }
  }
  return { changed: rules.length > 0 || models.length > 0, rules, models };
}
