import { describe, expect, it } from "vitest";
import { workflowConfiguration } from "../../../../tests/fixtures/configuration";
import { draftFromConfiguration } from "../model/draft";
import { createCanvasHistoryScope } from "../model/history-scope";

describe("confirmed strategy history discard", () => {
  it("retires the discarded same-hash history and rejects callbacks holding its old reference", () => {
    const scope = createCanvasHistoryScope(7);
    const draft = draftFromConfiguration(workflowConfiguration);
    const admitted = { draft, nodes: { fallback: { x: 420, y: 300 } }, selected: "", selection: [] };
    const dirty = { ...admitted, draft: { ...draft, fallback: { label: "quality" } } };
    const retired = scope.histories.forStrategy("balanced");
    retired.reset(admitted); retired.record(dirty);
    scope.hashes.set("balanced", workflowConfiguration.config_hash);
    scope.cursors.set("balanced", { selected: "fallback", selection: ["fallback"] });

    scope.discard("balanced");
    const reopened = scope.histories.forStrategy("balanced");
    const currentLayout = { ...admitted, nodes: { fallback: { x: 440, y: 300 } } };
    reopened.reset(currentLayout);
    retired.reset(dirty); expect(retired.record(dirty)).toBe(false);
    expect(retired.undo()).toBeNull(); expect(retired.redo()).toBeNull();
    expect(reopened.canUndo).toBe(false); expect(reopened.canRedo).toBe(false);
    reopened.record({ ...currentLayout, nodes: { fallback: { x: 460, y: 300 } } });
    expect(reopened.undo()).toEqual(currentLayout);
    expect(scope.hashes.get("balanced")).toBe(workflowConfiguration.config_hash);
    expect(scope.cursors.has("balanced")).toBe(false);
    expect(scope.pendingSeeds.has("balanced")).toBe(true);
    expect(scope.generations.get("balanced")).toBe(1); expect(scope.owner).toBe(7);
  });

  it("preserves another strategy's admitted layout, cursor and usable undo/redo frames", () => {
    const scope = createCanvasHistoryScope();
    const draft = draftFromConfiguration(workflowConfiguration);
    const initial = { draft, nodes: { questions: { x: 40, y: 30 } }, selected: "questions", selection: ["questions"] };
    const moved = { ...initial, nodes: { questions: { x: 60, y: 30 } } };
    const other = scope.histories.forStrategy("Other"); other.reset(initial); other.record(moved);
    scope.cursors.set("Other", { selected: "questions", selection: ["questions"] });
    scope.hashes.set("Other", "other-accepted");
    scope.discard("balanced");
    expect(scope.histories.forStrategy("Other")).toBe(other);
    expect(other.undo()).toEqual(initial); expect(other.redo()).toEqual(moved);
    expect(scope.cursors.get("Other")).toEqual({ selected: "questions", selection: ["questions"] });
    expect(scope.hashes.get("Other")).toBe("other-accepted");
    expect(scope.generations.has("Other")).toBe(false); expect(scope.pendingSeeds.has("Other")).toBe(false);
  });
});
