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
  Question,
  RoutingOverlayPayload,
} from "../api";

export interface ModelDraft {
  id: string;
  tags: string[];
  priority: number;
}

export interface RoutingDraft {
  questions: Record<string, Question>;
  rules: OverlayRulePayload[];
  fallback: RuleChoice;
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
  return {
    questions: Object.fromEntries(Object.entries(config.questions).map(([name, question]) => [
      name, { ...question, criteria: { ...question.criteria } },
    ])),
    rules: config.rules.map(ruleToDraft),
    fallback: { ...config.fallback },
    models,
  };
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

function replaceKey<T>(values: Record<string, T>, oldName: string, newName: string): Record<string, T> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key === oldName ? newName : key, value]));
}

function validRename<T>(values: Record<string, T>, oldName: string, newName: string): boolean {
  return Object.hasOwn(values, oldName) && newName.trim() === newName && newName.length > 0 &&
    (oldName === newName || !Object.hasOwn(values, newName));
}

/** Renames references atomically. An invalid or colliding name leaves the draft unchanged. */
export function renameQuestion(draft: RoutingDraft, oldName: string, newName: string): RoutingDraft {
  if (!validRename(draft.questions, oldName, newName) || oldName === newName) return draft;
  return {
    ...draft,
    questions: replaceKey(draft.questions, oldName, newName),
    rules: draft.rules.map((rule) => ({ ...rule, when: replaceKey(rule.when, oldName, newName) })),
  };
}

export function addQuestion(draft: RoutingDraft, name: string): RoutingDraft {
  if (!name.trim() || name.trim() !== name || Object.hasOwn(draft.questions, name)) return draft;
  return setQuestion(draft, name, {
    type: "choice", instructions: name, criteria: { yes: "Yes", no: "No" },
  });
}

/** Keep every rule with at least one condition and at least one question in the catalog. */
export function removeQuestion(draft: RoutingDraft, name: string): RoutingDraft {
  if (!Object.hasOwn(draft.questions, name) || Object.keys(draft.questions).length <= 1 ||
      draft.rules.some((rule) => Object.hasOwn(rule.when, name) && Object.keys(rule.when).length === 1)) return draft;
  const { [name]: _removed, ...questions } = draft.questions;
  void _removed;
  return { ...draft, questions, rules: draft.rules.map((rule) => {
    if (!Object.hasOwn(rule.when, name)) return rule;
    const { [name]: _condition, ...when } = rule.when;
    void _condition;
    return Object.keys(when).length ? { ...rule, when } : rule;
  }) };
}

export function addCriterion(draft: RoutingDraft, questionName: string, name: string): RoutingDraft {
  const question = draft.questions[questionName];
  if (!question || !name.trim() || name.trim() !== name || Object.hasOwn(question.criteria, name)) return draft;
  return setQuestion(draft, questionName, { ...question, criteria: { ...question.criteria, [name]: name } });
}

export function renameCriterion(draft: RoutingDraft, questionName: string, oldName: string, newName: string): RoutingDraft {
  const question = draft.questions[questionName];
  if (!question || !validRename(question.criteria, oldName, newName) || oldName === newName) return draft;
  return {
    ...setQuestion(draft, questionName, { ...question, criteria: replaceKey(question.criteria, oldName, newName) }),
    rules: draft.rules.map((rule) => {
      const value = rule.when[questionName];
      if (value === undefined) return rule;
      const when = { ...rule.when, [questionName]: Array.isArray(value)
        ? value.map((item) => item === oldName ? newName : item)
        : value === oldName ? newName : value };
      return { ...rule, when };
    }),
  };
}

export function removeCriterion(draft: RoutingDraft, questionName: string, name: string): RoutingDraft {
  const question = draft.questions[questionName];
  if (!question || !Object.hasOwn(question.criteria, name) || Object.keys(question.criteria).length <= 2 ||
      draft.rules.some((rule) => {
        const value = rule.when[questionName];
        return value !== undefined && (Array.isArray(value) ? value.length === 1 && value[0] === name : value === name) &&
          Object.keys(rule.when).length === 1;
      })) return draft;
  const { [name]: _removed, ...criteria } = question.criteria;
  void _removed;
  return {
    ...setQuestion(draft, questionName, { ...question, criteria }),
    rules: draft.rules.map((rule) => {
      const value = rule.when[questionName];
      if (value === undefined) return rule;
      const remaining = (Array.isArray(value) ? value : [value]).filter((item) => item !== name);
      const when = { ...rule.when };
      if (!remaining.length) delete when[questionName];
      else if (remaining.length === 1) when[questionName] = remaining[0]!;
      else when[questionName] = remaining;
      return { ...rule, when };
    }),
  };
}

export function setRuleCondition(
  draft: RoutingDraft,
  index: number,
  when: Record<string, RuleCondition>,
): RoutingDraft {
  const rule = draft.rules[index];
  if (rule === undefined) return draft;
  const rules = [...draft.rules];
  rules[index] = { ...rule, when: copyConditions(when) };
  return { ...draft, rules };
}

/** Keep OR arrays intact when editing a single criterion or question. */
export function toggleRuleCriterion(draft: RoutingDraft, index: number, question: string, criterion: string, enabled: boolean): RoutingDraft {
  const rule = draft.rules[index];
  if (!rule || !Object.hasOwn(draft.questions[question]?.criteria ?? {}, criterion)) return draft;
  const current = rule.when[question];
  if (current === undefined) return draft;
  const values = Array.isArray(current) ? current : [current];
  const next = enabled ? [...new Set([...values, criterion])] : values.filter((item) => item !== criterion);
  if (!next.length || next.length === values.length && next.every((item, position) => item === values[position])) return draft;
  return setRuleCondition(draft, index, { ...rule.when, [question]: next.length === 1 ? next[0]! : next });
}

export function toggleRuleQuestion(draft: RoutingDraft, index: number, question: string, enabled: boolean): RoutingDraft {
  const rule = draft.rules[index];
  const definition = draft.questions[question];
  if (!rule || !definition) return draft;
  const when = copyConditions(rule.when);
  if (enabled) {
    if (when[question] !== undefined) return draft;
    const first = Object.keys(definition.criteria)[0];
    if (!first) return draft;
    when[question] = first;
  } else {
    if (when[question] === undefined || Object.keys(when).length <= 1) return draft;
    delete when[question];
  }
  return setRuleCondition(draft, index, when);
}

export function setFallback(draft: RoutingDraft, patch: Partial<RuleChoice>): RoutingDraft {
  return { ...draft, fallback: { ...draft.fallback, ...patch } };
}

export function setQuestion(
  draft: RoutingDraft,
  name: string,
  question: Question,
): RoutingDraft {
  return { ...draft, questions: { ...draft.questions, [name]: { ...question, criteria: { ...question.criteria } } } };
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

export function addRule(
  draft: RoutingDraft,
  config: ConfigurationPayload,
  question: string,
  criterion: string,
  label: string,
  selection?: string,
): RoutingDraft {
  const labelDefinition = config.labels.find((item) => item.name === label);
  // Use the known selectable catalog options; full catalog validity remains the server's authority.
  const hasResolvedModels = labelDefinition !== undefined && (labelDefinition.resolution === "models"
    ? labelDefinition.models.some((id) => Object.hasOwn(draft.models, id))
    : config.models.some((model) => draft.models[model.id]?.tags.includes(labelDefinition.tag)));
  if (!Object.hasOwn(draft.questions[question]?.criteria ?? {}, criterion) || !hasResolvedModels) return draft;
  const choices: RuleChoice = selection ? { label, selection } : { label };
  return { ...draft, rules: [...draft.rules, { when: { [question]: criterion }, select: choices }] };
}

export function removeRule(draft: RoutingDraft, index: number): RoutingDraft {
  if (!Number.isInteger(index) || index < 0 || index >= draft.rules.length) return draft;
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
    questions: Object.fromEntries(Object.entries(draft.questions).map(([name, question]) => [
      name, { ...question, criteria: { ...question.criteria } },
    ])),
    rules: draft.rules.map((rule) => ({
      when: copyConditions(rule.when),
      select: { ...rule.select },
    })),
    fallback: { ...draft.fallback },
    models,
  };
}

export interface WorkflowEdge {
  from: string;
  to: string;
  kind: "context" | "match" | "unmatched" | "pool";
}

/** Ordered first-match graph; links to pools follow the effective draft membership. */
export function workflowEdges(draft: RoutingDraft, config: ConfigurationPayload): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [{ from: "questions", to: draft.rules.length ? "rule-0" : "fallback", kind: "context" }];
  draft.rules.forEach((rule, index) => {
    const tag = config.labels.find((label) => label.name === rule.select.label)?.tag;
    if (tag !== undefined) edges.push({ from: `rule-${index}`, to: `zone::${tag}`, kind: "match" });
    edges.push({ from: `rule-${index}`, to: index + 1 < draft.rules.length ? `rule-${index + 1}` : "fallback", kind: "unmatched" });
  });
  const fallbackTag = config.labels.find((label) => label.name === draft.fallback.label)?.tag;
  if (fallbackTag !== undefined) edges.push({ from: "fallback", to: `zone::${fallbackTag}`, kind: "match" });
  for (const label of config.labels) {
    for (const model of label.resolution === "models" ? label.models : labelMembers(draft, config, label).map((item) => item.id)) {
      edges.push({ from: `zone::${label.tag}`, to: `model::${model}`, kind: "pool" });
    }
  }
  return edges;
}

function describeRule(rule: OverlayRulePayload | Rule): string {
  const conditions = Object.entries(rule.when)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join("|") : String(value)}`)
    .join(", ");
  const label = rule.select.label ?? "no label";
  const selection = rule.select.selection ?? "default selection";
  return `${conditions} → ${label} (${selection})`;
}

export interface DraftChange {
  subject: string;
  before: string;
  after: string;
}

export interface DraftDiff {
  changed: boolean;
  questions: DraftChange[];
  rules: DraftChange[];
  fallback: DraftChange[];
  models: DraftChange[];
}

export function diffSummary(draft: RoutingDraft, config: ConfigurationPayload): DraftDiff {
  const rules: DraftChange[] = [];
  const originalOrder = config.rules.map((rule) => describeRule(rule));
  const draftOrder = draft.rules.map((rule) => describeRule(rule));
  if (originalOrder.length !== draftOrder.length) {
    rules.push({ subject: "rule count", before: String(originalOrder.length), after: String(draftOrder.length) });
  }
  for (let index = 0; index < draft.rules.length; index += 1) {
    const before = originalOrder[index];
    const after = draftOrder[index];
    const original = config.rules[index];
    if (JSON.stringify(original === undefined ? undefined : { when: original.when, select: original.select }) !== JSON.stringify(draft.rules[index])) {
      rules.push({ subject: String(index + 1), before: before ?? "", after: after ?? "" });
    }
  }

  const questions: DraftChange[] = [];
  for (const name of new Set([...Object.keys(config.questions), ...Object.keys(draft.questions)])) {
    const before = config.questions[name];
    const after = draft.questions[name];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      questions.push({ subject: name, before: JSON.stringify(before) ?? "", after: JSON.stringify(after) ?? "" });
    }
  }
  const fallback: DraftChange[] = [];
  if (JSON.stringify(draft.fallback) !== JSON.stringify(config.fallback)) {
    fallback.push({ subject: "fallback", before: JSON.stringify(config.fallback), after: JSON.stringify(draft.fallback) });
  }

  const models: DraftChange[] = [];
  for (const model of config.models) {
    const current = draft.models[model.id];
    if (current === undefined) continue;
    if (!sameTags(current.tags, model.tags)) {
      models.push({ subject: `${model.id} tags`, before: model.tags.join(", "), after: current.tags.join(", ") });
    }
    if (current.priority !== model.priority) {
      models.push({ subject: model.id, before: String(model.priority), after: String(current.priority) });
    }
  }
  return { changed: questions.length > 0 || rules.length > 0 || fallback.length > 0 || models.length > 0, questions, rules, fallback, models };
}
