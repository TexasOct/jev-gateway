import { describe, expect, it } from "vitest";

import type { ConfigurationPayload, LabelRow, ModelRow } from "@/shared/api/types";
import {
  addCriterion,
  addQuestion,
  addRule,
  removeRule,
  diffSummary,
  draftFromConfiguration,
  labelMembers,
  moveRule,
  removeCriterion,
  removeQuestion,
  renameCriterion,
  renameQuestion,
  sameTags,
  setLabelMembership,
  setPriority,
  setRuleChoice,
  setRuleCondition,
  setFallback,
  setQuestion,
  toOverlayPayload,
  toggleRuleCriterion,
  toggleRuleQuestion,
  unassignedModels,
  workflowEdges,
} from "../model/draft";

function label(name: string, tag: string): LabelRow {
  return {
    name,
    score: 0,
    reasoning_effort: null,
    description: "",
    tag,
    resolution: "tag",
    models: [],
  };
}

function model(
  id: string,
  tags: string[],
  priority: number,
  baselineTags: string[],
  baselinePriority: number,
): ModelRow {
  return {
    id,
    provider: id.split("/")[0] ?? "p",
    upstream_model: id.split("/")[1] ?? "m",
    priority,
    baseline_priority: baselinePriority,
    tags,
    baseline_tags: baselineTags,
  };
}

const CRAFT = label("craft", "task_aware/craft");
const ULTRA = label("ultra", "task_aware/ultra");

function configuration(overrides: Partial<ConfigurationPayload> = {}): ConfigurationPayload {
  return {
    write_available: true,
    write_disabled_reason: null,
    strategy: "task_aware",
    baseline_source: "/tmp/models.json",
    overlay: { applied: false, path: "/tmp/routing-overrides.json", error: null },
    config_hash: "hash",
    questions: {},
    fallback: { label: "quick", selection: "balanced" },
    rules: [
      { index: 0, when: { workload: "coding" }, select: { label: "craft", selection: "quality_first" } },
      { index: 1, when: { scale: "large" }, select: { label: "ultra", selection: "quality_first" } },
    ],
    labels: [CRAFT, ULTRA],
    models: [
      model("openai/gpt-6-luna", ["quality/routine", "task_aware/craft"], 10, ["quality/routine", "task_aware/craft"], 10),
      model("openai/gpt-6-astra", ["task_aware/ultra"], 5, [], 20),
      model("deepseek/flash", ["economy/budget"], 10, ["economy/budget"], 10),
    ],
    warnings: [],
    ...overrides,
  };
}

describe("draft construction", () => {
  it("copies the loaded rules and models", () => {
    const draft = draftFromConfiguration(configuration());
    expect(draft.rules).toHaveLength(2);
    expect(draft.models["openai/gpt-6-luna"]?.tags).toEqual([
      "quality/routine",
      "task_aware/craft",
    ]);
  });

  it("copies questions and fallback and includes edits in the overlay", () => {
    const config = configuration({ questions: { scale: { type: "choice", instructions: "Choose", criteria: { small: "Small", large: "Large" } } } });
    let draft = draftFromConfiguration(config);
    draft = setQuestion(draft, "scale", { ...draft.questions.scale!, instructions: "Pick scale" });
    draft = setRuleCondition(draft, 0, { scale: "large" });
    draft = setFallback(draft, { label: "ultra" });
    const payload = toOverlayPayload(draft, config);
    expect(payload.questions?.scale?.instructions).toBe("Pick scale");
    expect(payload.rules[0]?.when).toEqual({ scale: "large" });
    expect(payload.fallback?.label).toBe("ultra");
  });

  it("adds, renames, and removes questions while safely updating rule references", () => {
    const config = configuration({ questions: { scale: { type: "choice", instructions: "Choose", criteria: { small: "Small", large: "Large" } }, workload: { type: "choice", instructions: "Task", criteria: { coding: "Coding", writing: "Writing" } } } });
    let draft = draftFromConfiguration(config);
    draft = renameQuestion(draft, "scale", "size");
    expect(draft.rules[1]?.when).toEqual({ size: "large" });
    expect(renameQuestion(draft, "size", "workload")).toBe(draft);
    draft = removeQuestion(draft, "size");
    expect(draft.rules[1]?.when).toEqual({ size: "large" });
    expect(removeQuestion(draft, "size")).toBe(draft);
    draft = removeQuestion(draft, "workload");
    expect(draft.questions.workload).toBeDefined(); // sole predicate cannot be removed
    draft = addQuestion(draft, "audience");
    expect(draft.questions.audience?.criteria).toEqual({ yes: "Yes", no: "No" });
    const withAudience = toggleRuleQuestion(draft, 0, "audience", true);
    expect(withAudience.rules[0]?.when.audience).toBe("yes");
    expect(toggleRuleQuestion(withAudience, 0, "audience", false).rules[0]?.when).toEqual({ workload: "coding" });
  });

  it("renames criterion references in scalar and OR-array conditions and safely removes criteria", () => {
    let draft = draftFromConfiguration(configuration({ questions: { scale: { type: "choice", instructions: "Choose", criteria: { small: "Small", large: "Large", huge: "Huge" } } } }));
    draft = setRuleCondition(draft, 0, { scale: ["small", "large"] });
    draft = renameCriterion(draft, "scale", "small", "tiny");
    expect(draft.rules[0]?.when.scale).toEqual(["tiny", "large"]);
    draft = toggleRuleCriterion(draft, 0, "scale", "huge", true);
    expect(draft.rules[0]?.when.scale).toEqual(["tiny", "large", "huge"]);
    expect(toOverlayPayload(draft, configuration()).rules[0]?.when.scale).toEqual(["tiny", "large", "huge"]);
    draft = removeCriterion(draft, "scale", "tiny");
    expect(draft.rules[0]?.when.scale).toEqual(["large", "huge"]);
    draft = toggleRuleCriterion(draft, 0, "scale", "huge", false);
    expect(draft.rules[0]?.when.scale).toBe("large");
    draft = addCriterion(draft, "scale", "medium");
    expect(draft.questions.scale?.criteria.medium).toBe("medium");
  });

  it("does not mutate the payload it was given", () => {
    const config = configuration();
    const draft = draftFromConfiguration(config);
    setLabelMembership(draft, "openai/gpt-6-astra", CRAFT.tag, true);
    expect(config.models[1]?.tags).toEqual(["task_aware/ultra"]);
  });
});

describe("label membership", () => {
  it("adds one label tag and preserves foreign tags", () => {
    const config = configuration();
    const draft = draftFromConfiguration(config);
    const next = setLabelMembership(draft, "openai/gpt-6-luna", ULTRA.tag, true);
    expect(next.models["openai/gpt-6-luna"]?.tags).toEqual([
      "quality/routine",
      "task_aware/craft",
      "task_aware/ultra",
    ]);
  });

  it("removes only the requested label tag", () => {
    const config = configuration();
    const draft = draftFromConfiguration(config);
    const next = setLabelMembership(draft, "openai/gpt-6-luna", CRAFT.tag, false);
    expect(next.models["openai/gpt-6-luna"]?.tags).toEqual(["quality/routine"]);
  });

  it("reports members per label and leaves unrelated models unassigned", () => {
    const config = configuration();
    const draft = draftFromConfiguration(config);
    expect(labelMembers(draft, config, CRAFT).map((item) => item.id)).toEqual([
      "openai/gpt-6-luna",
    ]);
    expect(unassignedModels(draft, config).map((item) => item.id)).toEqual([
      "deepseek/flash",
    ]);
  });
});

describe("rule ordering", () => {
  it("allows planning rules for unassigned tag pools before models are imported", () => {
    const config = configuration({ models: [], questions: { scale: { type: "choice", instructions: "Scale", criteria: { small: "Small", large: "Large" } } } });
    const draft = draftFromConfiguration(config);
    expect(unassignedModels(draft, config)).toEqual([]);
    const added = addRule(draft, config, "scale", "large", "craft");
    expect(added.rules).toHaveLength(draft.rules.length + 1);
    expect(toOverlayPayload(added, config).models).toEqual({});
    expect(addRule(draft, config, "scale", "large", "unknown")).toBe(draft);
  });
  it("adds rules only from valid existing conditions and labels", () => {
    const config = configuration({ questions: { scale: { type: "choice", instructions: "Scale", criteria: { small: "Small", large: "Large" } } } });
    const draft = draftFromConfiguration(config);
    const added = addRule(draft, config, "scale", "large", "craft");
    expect(added.rules).toHaveLength(3);
    expect(added.rules[2]).toEqual({ when: { scale: "large" }, select: { label: "craft" } });
    expect(addRule(draft, config, "missing", "large", "craft")).toBe(draft);
    expect(addRule(draft, config, "scale", "unknown", "craft")).toBe(draft);
    expect(addRule(draft, config, "scale", "large", "unsupported")).toBe(draft);
    const explicit = { ...CRAFT, resolution: "models" as const, models: ["openai/gpt-6-luna"] };
    const explicitConfig = configuration({ labels: [explicit, ULTRA] });
    expect(addRule(draft, explicitConfig, "scale", "large", "craft").rules).toHaveLength(3);
    expect(addRule(draft, configuration({ labels: [{ ...explicit, models: ["missing/model"] }, ULTRA] }), "scale", "large", "craft")).toBe(draft);
  });

  it("removes rules safely including the final rule", () => {
    const draft = draftFromConfiguration(configuration());
    expect(removeRule(draft, 1).rules).toHaveLength(1);
    expect(removeRule(removeRule(draft, 0), 0).rules).toEqual([]);
    expect(removeRule(draft, -1)).toBe(draft);
    expect(removeRule(draft, 2)).toBe(draft);
  });

  it("moves a rule to a new position", () => {
    const draft = draftFromConfiguration(configuration());
    const moved = moveRule(draft, 0, 1);
    expect(moved.rules[0]?.select.label).toBe("ultra");
    expect(moved.rules[1]?.select.label).toBe("craft");
  });

  it("ignores an out-of-range move", () => {
    const draft = draftFromConfiguration(configuration());
    expect(moveRule(draft, 0, 9)).toBe(draft);
  });

  it("edits the selected label without touching the conditions", () => {
    const draft = draftFromConfiguration(configuration());
    const edited = setRuleChoice(draft, 0, { label: "ultra" });
    expect(edited.rules[0]?.select.label).toBe("ultra");
    expect(edited.rules[0]?.when).toEqual({ workload: "coding" });
  });

  it("preserves a legacy rule choice until its label is explicitly edited", () => {
    const config = configuration();
    config.rules[0]!.select = { tier: "craft", selection: "balanced" };
    const draft = draftFromConfiguration(config);
    const ranked = setRuleChoice(draft, 0, { selection: "quality_first" });
    expect(ranked.rules[0]!.select).toEqual({ tier: "craft", selection: "quality_first" });
    const changed = setRuleChoice(ranked, 0, { label: "ultra" });
    expect(changed.rules[0]!.select).toEqual({ label: "ultra", selection: "quality_first" });
    expect(draft.rules[0]!.select).toEqual({ tier: "craft", selection: "balanced" });
  });

  it("keeps fallback omission and aliases until an explicit label edit", () => {
    const config = configuration({ fallback: {} });
    const draft = draftFromConfiguration(config);
    expect(setFallback(draft, { selection: "balanced" }).fallback).toEqual({ selection: "balanced" });
    const legacy = setFallback(draft, { tier: "craft" });
    expect(setFallback(legacy, { selection: "balanced" }).fallback).toEqual({ tier: "craft", selection: "balanced" });
    expect(setFallback(legacy, { label: "ultra" }).fallback).toEqual({ label: "ultra" });
    expect(draft.fallback).toEqual({});
  });
});

describe("overlay payload", () => {
  it("sends the complete rule list so order is authoritative", () => {
    const config = configuration();
    const draft = moveRule(draftFromConfiguration(config), 0, 1);
    const payload = toOverlayPayload(draft, config);
    expect(payload.version).toBe(1);
    expect(payload.strategy).toBe("task_aware");
    expect(payload.rules.map((rule) => rule.select.label)).toEqual(["ultra", "craft"]);
  });

  it("sends only models that differ from the baseline file", () => {
    const config = configuration();
    const draft = draftFromConfiguration(config);
    // gpt-6-luna matches its baseline entry, so it is not resent.
    expect(Object.keys(toOverlayPayload(draft, config).models)).toEqual([
      "openai/gpt-6-astra",
    ]);
    const changed = setPriority(draft, "openai/gpt-6-luna", 3);
    expect(Object.keys(toOverlayPayload(changed, config).models).sort()).toEqual([
      "openai/gpt-6-astra",
      "openai/gpt-6-luna",
    ]);
  });

  it("keeps an applied overlay self-consistent by comparing against the baseline", () => {
    const config = configuration();
    // gpt-6-astra already differs from the baseline file.
    const draft = draftFromConfiguration(config);
    const payload = toOverlayPayload(draft, config);
    expect(Object.keys(payload.models)).toEqual(["openai/gpt-6-astra"]);
  });

  it("drops a model whose tags returned to the baseline", () => {
    const config = configuration();
    const draft = draftFromConfiguration(config);
    const added = setLabelMembership(draft, "deepseek/flash", CRAFT.tag, true);
    expect(Object.keys(toOverlayPayload(added, config).models)).toContain("deepseek/flash");
    const removed = setLabelMembership(added, "deepseek/flash", CRAFT.tag, false);
    expect(Object.keys(toOverlayPayload(removed, config).models)).not.toContain("deepseek/flash");
  });
});

describe("diff summary", () => {
  it("reports question, rule condition/selection, and fallback values", () => {
    const config = configuration({ questions: { scale: { type: "choice", instructions: "Choose", criteria: { small: "Small", large: "Large" } } } });
    let draft = draftFromConfiguration(config);
    draft = setQuestion(draft, "scale", { ...draft.questions.scale!, instructions: "Pick" });
    draft = setRuleCondition(draft, 0, { scale: ["small", "large"] });
    draft = setRuleChoice(draft, 0, { selection: "balanced" });
    draft = setFallback(draft, { label: "ultra" });
    const diff = diffSummary(draft, config);
    expect(diff.questions[0]?.after).toContain("instructions");
    expect(diff.rules[0]?.after).toContain("balanced");
    expect(diff.fallback[0]?.after).toContain("ultra");
  });

  it("builds first-match chains for zero, one, and many rules", () => {
    const base = configuration({ rules: [], questions: {} });
    expect(workflowEdges(draftFromConfiguration(base), base)[0]).toEqual({ from: "questions", to: "fallback", kind: "context" });
    const one = draftFromConfiguration(configuration({ rules: configuration().rules.slice(0, 1) }));
    expect(workflowEdges(one, configuration()).filter((edge) => edge.kind === "unmatched").map((edge) => edge.to)).toEqual(["fallback"]);
    const many = draftFromConfiguration(configuration());
    expect(workflowEdges(many, configuration()).filter((edge) => edge.kind === "unmatched").map((edge) => edge.to)).toEqual(["rule-1", "fallback"]);
  });

  it("projects match, unmatched, fallback, label pool, and model edges", () => {
    const config = configuration({ fallback: { label: "craft" } });
    const edges = workflowEdges(draftFromConfiguration(config), config);
    expect(edges).toContainEqual({ from: "rule-0", to: "zone::task_aware/craft", kind: "match" });
    expect(edges).toContainEqual({ from: "rule-0", to: "rule-1", kind: "unmatched" });
    expect(edges).toContainEqual({ from: "rule-1", to: "fallback", kind: "unmatched" });
    expect(edges).toContainEqual({ from: "rule-1", to: "zone::task_aware/ultra", kind: "match" });
    expect(edges).toContainEqual({ from: "fallback", to: "zone::task_aware/craft", kind: "match" });
    expect(edges).toContainEqual({ from: "zone::task_aware/craft", to: "model::openai/gpt-6-luna", kind: "pool" });
  });

  it("is empty for an untouched draft", () => {
    const config = configuration();
    const diff = diffSummary(draftFromConfiguration(config), config);
    expect(diff.changed).toBe(false);
    expect(diff.rules).toEqual([]);
    expect(diff.models).toEqual([]);
  });

  it("reports changed questions, rules, fallback, tags, and priority independently", () => {
    const config = configuration({ questions: { scale: { type: "choice", instructions: "Choose", criteria: { small: "Small", large: "Large" } } } });
    let draft = draftFromConfiguration(config);
    draft = renameQuestion(draft, "scale", "size");
    draft = setRuleCondition(draft, 0, { size: ["small", "large"] });
    draft = setFallback(draft, { label: "craft" });
    draft = setLabelMembership(draft, "deepseek/flash", CRAFT.tag, true);
    draft = setPriority(draft, "deepseek/flash", 2);
    const diff = diffSummary(draft, config);
    expect(diff.questions.map((item) => item.subject)).toEqual(["scale", "size"]);
    expect(diff.rules[0]?.after).toContain("small|large");
    expect(diff.fallback[0]?.after).toContain("craft");
    expect(diff.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ subject: "deepseek/flash tags" }),
      expect.objectContaining({ subject: "deepseek/flash", before: "10", after: "2" }),
    ]));
  });

  it("does not emit an invalid selection value for an empty condition edit", () => {
    const config = configuration({ questions: { scale: { type: "choice", instructions: "Choose", criteria: { small: "Small", large: "Large" } } } });
    const draft = draftFromConfiguration(config);
    const selected = toggleRuleQuestion(draft, 0, "scale", true);
    expect(selected.rules[0]?.when.scale).toBe("small");
    expect(toggleRuleCriterion(selected, 0, "scale", "small", false)).toBe(selected);
  });

  it("uses explicit static model pools regardless of tag edits", () => {
    const staticLabel = { ...CRAFT, resolution: "models" as const, models: ["deepseek/flash"] };
    const config = configuration({ labels: [staticLabel, ULTRA] });
    const draft = setLabelMembership(draftFromConfiguration(config), "openai/gpt-6-luna", CRAFT.tag, false);
    expect(workflowEdges(draft, config)).toContainEqual({ from: `zone::${CRAFT.tag}`, to: "model::deepseek/flash", kind: "pool" });
    expect(workflowEdges(draft, config)).not.toContainEqual({ from: `zone::${CRAFT.tag}`, to: "model::openai/gpt-6-luna", kind: "pool" });
  });

  it("names the models and rules that changed", () => {
    const config = configuration();
    const draft = setLabelMembership(
      draftFromConfiguration(config),
      "openai/gpt-6-astra",
      CRAFT.tag,
      true,
    );
    const diff = diffSummary(draft, config);
    expect(diff.changed).toBe(true);
    expect(diff.models[0]?.subject).toContain("openai/gpt-6-astra");
  });
});

describe("tag comparison", () => {
  it("ignores ordering", () => {
    expect(sameTags(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameTags(["a"], ["a", "b"])).toBe(false);
  });
});
