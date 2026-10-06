import { describe, expect, it } from "vitest";
import { createHistory, menuPosition } from "../model/history";
import { boardPoint, reconcileRuleLayout, reconcileRuleSelection } from "../model/canvas";
import { draftFromConfiguration, removeRule, workflowEdges } from "../model/draft";
import { configuration } from "../../../../tests/fixtures/configuration";
import { createEditableNode } from "../model/commands";
import { incompleteLabels, toOverlayPayload } from "../model/draft";

describe("workflow semantic history", () => {
  it("adds an incomplete ordered rule and a collision-free question configuration without changing catalog entities", () => {
    const draft = draftFromConfiguration(configuration);
    const created = createEditableNode(draft, configuration, "rule")!;
    expect(created.id).toBe("rule-1");
    expect(created.draft.rules[0]).toBe(draft.rules[0]);
    expect(created.draft.rules[1]!.select.label).toBe("");
    expect(incompleteLabels(created.draft, configuration)).not.toHaveLength(0);
    expect(toOverlayPayload(created.draft, configuration).rules![1]!.select.label).toBe("");
    expect(created.draft.models).toBe(draft.models);
    const first = createEditableNode(draft, configuration, "question")!;
    const second = createEditableNode(first.draft, configuration, "question")!;
    expect(second.id).toBe("questions");
    expect(Object.keys(second.draft.questions)).toEqual(["intent", "question_1", "question_2"]);
    expect(createEditableNode({ ...draft, questions: {} }, configuration, "rule")).toBeNull();
  });
  it("restores rule slots together with derived connections and prunes deleted positions", () => {
    const initial = draftFromConfiguration(configuration);
    const draft = { ...initial, rules: [initial.rules[0]!, initial.rules[0]!, initial.rules[0]!] };
    const nodes = { "rule-0": { x: 10, y: 20 }, "rule-1": { x: 30, y: 40 }, "rule-2": { x: 50, y: 60 }, questions: { x: 0, y: 0 } };
    const history = createHistory<{ draft: typeof draft; nodes: typeof nodes | Record<string, { x: number; y: number }> }>((a, b) => JSON.stringify(a) === JSON.stringify(b));
    history.reset({ draft, nodes });
    const mutation = { kind: "remove-many" as const, indices: [0, 2, 0] };
    const next = { draft: removeRule(removeRule(draft, 2), 0), nodes: reconcileRuleLayout(nodes, mutation) };
    history.record(next);
    expect(next.nodes).toEqual({ questions: nodes.questions, "rule-0": nodes["rule-1"] });
    expect(reconcileRuleSelection("rule-1", mutation)).toBe("rule-0");
    expect(reconcileRuleSelection("rule-2", mutation)).toBe("");
    const ids = new Set(["questions", "fallback", "rule-0", ...configuration.labels.map((label) => `zone::${label.tag}`), ...configuration.models.map((model) => `model::${model.id}`)]);
    expect(workflowEdges(next.draft, configuration).every((edge) => ids.has(edge.from) && ids.has(edge.to))).toBe(true);
    expect(history.undo()).toEqual({ draft, nodes });
    expect(history.redo()).toEqual(next);
  });
  it("bounds history, ignores unchanged state, clears redo on edits and clears at save boundaries", () => {
    const history = createHistory<number>((a, b) => a === b, 2);
    history.reset(0); history.record(1); history.record(2); history.record(3);
    expect(history.record(3)).toBe(false);
    expect(history.undo()).toBe(2); expect(history.undo()).toBe(1); expect(history.undo()).toBeNull();
    expect(history.redo()).toBe(2); history.record(4); expect(history.canRedo).toBe(false);
    history.reset(4); expect(history.canUndo).toBe(false); expect(history.canRedo).toBe(false);
  });
  it("maps a scrolled, offset and zoomed pointer and bounds the unscaled menu", () => {
    expect(boardPoint({ x: 480, y: 600 }, { x: 80, y: 160 }, { x: 200, y: 300 }, 0.5)).toEqual({ x: 1200, y: 1480 });
    expect(menuPosition({ x: 319, y: 600 }, { width: 320, height: 640 }, { width: 252, height: 240 })).toEqual({ x: 60, y: 392 });
    expect(menuPosition({ x: -20, y: -40 }, { width: 320, height: 640 }, { width: 252, height: 240 })).toEqual({ x: 8, y: 8 });
  });
});
