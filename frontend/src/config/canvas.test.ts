import { describe, expect, it } from "vitest";
import type { ConfigurationPayload } from "../api";
import { compatibleTargets, connectPoolEdge, defaultPosition, disconnectPoolEdge, moveRuleLayout, reconcileRuleLayout, reconnectEdge, shiftRuleLayout, validLayout, validPosition } from "./canvas";
import { draftFromConfiguration, workflowEdges } from "./draft";

const config: ConfigurationPayload = {
  write_available: true, write_disabled_reason: null, strategy: "task_aware", baseline_source: "models.json",
  overlay: { applied: false, path: "routing-overrides.json", error: null }, config_hash: "hash",
  questions: {}, fallback: { label: "craft" },
  rules: [
    { index: 0, when: { scale: "small" }, select: { label: "craft" } },
    { index: 1, when: { scale: "large" }, select: { label: "ultra" } },
    { index: 2, when: { scale: "huge" }, select: { label: "craft" } },
  ],
  labels: ["craft", "ultra"].map((name) => ({ name, tag: `task_aware/${name}`, score: 0,
    reasoning_effort: null, description: "", resolution: "tag" as const, models: [] })),
  models: ["p/a", "p/b"].map((id) => ({ id, provider: "p", upstream_model: id.slice(2), priority: 1,
    baseline_priority: 1, tags: ["task_aware/craft", "foreign/tag"], baseline_tags: ["task_aware/craft", "foreign/tag"] })),
  warnings: [],
};

describe("canvas coordinates", () => {
  it("shifts slot positions on insert/delete and follows rules on reorder", () => {
    const nodes = { "rule-0": { x: 10, y: 10 }, "rule-1": { x: 20, y: 20 }, "rule-2": { x: 30, y: 30 }, "model::p/a": { x: 7, y: 8 } };
    expect(shiftRuleLayout(nodes, 1, 1)).toEqual({ "rule-0": nodes["rule-0"], "rule-2": nodes["rule-1"], "rule-3": nodes["rule-2"], "model::p/a": nodes["model::p/a"] });
    expect(shiftRuleLayout(nodes, 1, -1)).toEqual({ "rule-0": nodes["rule-0"], "rule-1": nodes["rule-2"], "model::p/a": nodes["model::p/a"] });
    expect(moveRuleLayout(nodes, 0, 2)).toEqual({ "rule-2": nodes["rule-0"], "rule-0": nodes["rule-1"], "rule-1": nodes["rule-2"], "model::p/a": nodes["model::p/a"] });

    expect(reconcileRuleLayout(nodes, { kind: "insert", index: 2 })).toEqual({ "rule-0": nodes["rule-0"], "rule-1": nodes["rule-1"], "rule-3": nodes["rule-2"], "model::p/a": nodes["model::p/a"] });
    expect(reconcileRuleLayout(nodes, { kind: "remove", index: 1 })).toEqual({ "rule-0": nodes["rule-0"], "rule-1": nodes["rule-2"], "model::p/a": nodes["model::p/a"] });
  });

  it("moves exact rule slots in both DnD directions and supports duplicate-rule slot edits", () => {
    const nodes = { "rule-0": { x: 10, y: 10 }, "rule-1": { x: 20, y: 20 }, "rule-2": { x: 30, y: 30 } };
    expect(reconcileRuleLayout(nodes, { kind: "move", from: 2, to: 0 })).toEqual({ "rule-0": nodes["rule-2"], "rule-1": nodes["rule-0"], "rule-2": nodes["rule-1"] });
    expect(reconcileRuleLayout(nodes, { kind: "move", from: 0, to: 2 })).toEqual({ "rule-0": nodes["rule-1"], "rule-1": nodes["rule-2"], "rule-2": nodes["rule-0"] });
    const original = draftFromConfiguration(config);
    const duplicate = { ...original, rules: [original.rules[0]!, original.rules[0]!, original.rules[2]!] };
    expect(reconcileRuleLayout(nodes, { kind: "remove", index: 1 })).toEqual({ "rule-0": nodes["rule-0"], "rule-1": nodes["rule-2"] });
    expect(reconcileRuleLayout(nodes, { kind: "insert", index: 1 })).toEqual({ "rule-0": nodes["rule-0"], "rule-2": nodes["rule-1"], "rule-3": nodes["rule-2"] });
    expect(duplicate.rules[0]).toEqual(duplicate.rules[1]);
  });

  it("validates a strict versioned shape and bounds", () => {
    expect(validLayout({ version: 1, nodes: { "rule-0": { x: 0, y: 10000 } }, viewport: { x: 0, y: 0 } })).toBe(true);
    expect(validPosition({ x: NaN, y: 1 })).toBe(false);
    expect(validPosition({ x: 1, y: true })).toBe(false);
    expect(validLayout({ version: 2, nodes: {}, viewport: { x: 0, y: 0 } })).toBe(false);
    expect(validLayout({ version: 1, nodes: { "bad id": { x: 0, y: 0 } }, viewport: { x: 0, y: 0 } })).toBe(false);
    expect(validLayout({ version: 1, nodes: { "model::p/模型 A": { x: 0, y: 0 } }, viewport: { x: 0, y: 0 } })).toBe(true);
    expect(validLayout({ version: 1, nodes: { "model::p/bad\nname": { x: 0, y: 0 } }, viewport: { x: 0, y: 0 } })).toBe(false);
    expect(defaultPosition("rule-1")).toEqual({ x: 400, y: 220 });
    expect(defaultPosition("rule-250")).toEqual({ x: 1450, y: 80 });
  });
});

describe("first-match edge conversion", () => {
  it("rewires a match and fallback choice without changing conditions", () => {
    const draft = draftFromConfiguration(config);
    const changed = reconnectEdge(draft, config, { from: "rule-0", to: "zone::task_aware/craft", kind: "match" }, "zone::task_aware/ultra");
    expect(changed?.rules[0]?.select.label).toBe("ultra");
    expect(changed?.rules[0]?.when).toEqual(draft.rules[0]?.when);
    expect(reconnectEdge(draft, config, { from: "fallback", to: "zone::task_aware/craft", kind: "match" }, "zone::task_aware/ultra")?.fallback.label).toBe("ultra");
  });
  it("reorders only an unmatched successor and preserves an acyclic chain", () => {
    const draft = draftFromConfiguration(config);
    const changed = reconnectEdge(draft, config, { from: "rule-0", to: "rule-1", kind: "unmatched" }, "rule-2");
    expect(changed?.rules.map((rule) => rule.when.scale)).toEqual(["small", "huge", "large"]);
    expect(workflowEdges(changed!, config).filter((edge) => edge.kind === "unmatched").map((edge) => edge.to)).toEqual(["rule-1", "rule-2", "fallback"]);
    expect(reconnectEdge(draft, config, { from: "rule-1", to: "rule-2", kind: "unmatched" }, "rule-0")).toBeNull();
    expect(reconnectEdge(draft, config, { from: "rule-0", to: "rule-1", kind: "unmatched" }, "fallback")).toBeNull();
    expect(compatibleTargets(draft, config, { from: "rule-0", to: "rule-1", kind: "unmatched" })).toContain("fallback");
  });
  it("moves model membership between tag labels without dropping foreign tags", () => {
    const draft = draftFromConfiguration(config);
    const withoutTarget = disconnectPoolEdge(draft, config, { from: "zone::task_aware/craft", to: "model::p/b", kind: "pool" })!;
    const changed = reconnectEdge(withoutTarget, config, { from: "zone::task_aware/craft", to: "model::p/a", kind: "pool" }, "model::p/b");
    expect(changed).toBeNull();
    expect(withoutTarget.models["p/a"]?.tags).toContain("task_aware/craft");
    expect(withoutTarget.models["p/b"]?.tags).toEqual(["foreign/tag"]);
    expect(disconnectPoolEdge(draft, config, { from: "zone::task_aware/craft", to: "model::p/a", kind: "pool" })?.models["p/a"]?.tags).toEqual(["foreign/tag"]);
    expect(reconnectEdge(draft, config, { from: "rule-0", to: "zone::task_aware/craft", kind: "match" }, "model::p/a")).toBeNull();
  });
  it("adds a model link, rejects a duplicate, and preserves the source pool", () => {
    const draft = draftFromConfiguration(config);
    const first = disconnectPoolEdge(draft, config, { from: "zone::task_aware/craft", to: "model::p/b", kind: "pool" })!;
    expect(disconnectPoolEdge(first, config, { from: "zone::task_aware/craft", to: "model::p/a", kind: "pool" })).toBeNull();
    const added = connectPoolEdge(first, config, "zone::task_aware/craft", "model::p/b")!;
    expect(added.models["p/a"]?.tags).toContain("task_aware/craft");
    expect(added.models["p/b"]?.tags).toContain("task_aware/craft");
    expect(connectPoolEdge(added, config, "zone::task_aware/craft", "model::p/b")).toBeNull();
    expect(reconnectEdge(draft, config, { from: "zone::task_aware/craft", to: "model::p/a", kind: "pool" }, "model::p/b")).toBeNull();
    expect(connectPoolEdge(first, config, "zone::task_aware/ultra", "model::p/b")?.models["p/b"]?.tags).toContain("task_aware/ultra");
    expect(compatibleTargets(first, config, { from: "zone::task_aware/craft", to: "model::p/a", kind: "pool" })).not.toContain("model::p/b");
    expect(compatibleTargets(draft, config, { from: "zone::task_aware/craft", to: "model::p/a", kind: "pool" })).toEqual(["model::p/a"]);
  });
  it("rejects stale, fabricated, explicit-model and contradictory links", () => {
    const draft = draftFromConfiguration(config);
    expect(reconnectEdge(draft, config, { from: "rule-1", to: "zone::task_aware/craft", kind: "match" }, "zone::task_aware/ultra")).toBeNull();
    expect(reconnectEdge(draft, config, { from: "rule-0", to: "rule-2", kind: "unmatched" }, "rule-1")).toBeNull();
    const explicit = { ...config, labels: [{ ...config.labels[0]!, resolution: "models" as const }, config.labels[1]!] };
    expect(connectPoolEdge(draft, explicit, "zone::task_aware/craft", "model::p/a")).toBeNull();
    expect(compatibleTargets(draft, config, { from: "questions", to: "rule-0", kind: "context" })).toEqual([]);
    expect(workflowEdges(draft, config)[0]).toEqual({ from: "questions", to: "rule-0", kind: "context" });
  });
});
