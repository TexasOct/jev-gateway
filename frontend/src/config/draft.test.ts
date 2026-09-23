import { describe, expect, it } from "vitest";

import type { ConfigurationPayload, LabelRow, ModelRow } from "../api";
import {
  diffSummary,
  draftFromConfiguration,
  labelMembers,
  moveRule,
  sameTags,
  setLabelMembership,
  setPriority,
  setRuleChoice,
  toOverlayPayload,
  unassignedModels,
} from "./draft";

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
  it("is empty for an untouched draft", () => {
    const config = configuration();
    const diff = diffSummary(draftFromConfiguration(config), config);
    expect(diff.changed).toBe(false);
    expect(diff.rules).toEqual([]);
    expect(diff.models).toEqual([]);
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
    expect(diff.models.join(" ")).toContain("openai/gpt-6-astra");
  });
});

describe("tag comparison", () => {
  it("ignores ordering", () => {
    expect(sameTags(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameTags(["a"], ["a", "b"])).toBe(false);
  });
});
