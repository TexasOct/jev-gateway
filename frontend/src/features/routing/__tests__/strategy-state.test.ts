import { describe, expect, it } from "vitest";
import type { ConfigurationPayload } from "@/shared/api/types";
import { configuration } from "../../../../tests/fixtures/configuration";
import { addModelNode, removeModelNode, draftFromConfiguration, diffSummary, selectedModelIds, setLabelMembership, toWorkflowPayload, workflowEdges, workflowModels } from "../model/draft";
import { canvasOutputs } from "../model/outputs";
import { classifyConnection, connectPoolEdge, disconnectPoolEdge } from "../model/canvas";
import { createStrategyHistory } from "../model/history";

const ID = configuration.models[0]!.id;
const OTHER = "fixture-provider/unreferenced";
function config(selected?: string[]): ConfigurationPayload {
  return { ...structuredClone(configuration),
    ...(selected === undefined ? {} : { selected_models: selected }),
    models: [...structuredClone(configuration.models), { ...configuration.models[0]!, id: OTHER, upstream_model: "unreferenced", tags: ["foreign/only"], baseline_tags: ["foreign/only"] }],
    definition: { kind: "decision_matrix", policy: { mode: "cached", selection: "balanced", labels: { default: { tag: "balanced/default" }, quality: { tag: "balanced/quality" } } },
      options: { questions: structuredClone(configuration.questions), rules: configuration.rules.map(({ when, select }) => ({ when, select })), fallback: { ...configuration.fallback } } },
  };
}

describe("strategy model selection and wire contracts", () => {
  it("distinguishes explicit empty selection from legacy absence and keeps the complete chooser library", () => {
    const legacy = config();
    const empty = config([]);
    const legacyDraft = draftFromConfiguration(legacy);
    const emptyDraft = draftFromConfiguration(empty);
    expect(selectedModelIds(legacyDraft, legacy)).toEqual([ID]);
    expect(selectedModelIds(emptyDraft, empty)).toEqual([]);
    expect(workflowModels(emptyDraft, empty)).toEqual([]);
    expect(Object.keys(emptyDraft.models)).toEqual([ID, OTHER]);
    expect(Object.keys(canvasOutputs(emptyDraft, empty)).some((id) => id.startsWith("model::"))).toBe(false);
    expect(workflowEdges(emptyDraft, empty).some((edge) => edge.to.startsWith("model::"))).toBe(false);
  });
  it("retains only reachable legacy members and a genuinely inherited default", () => {
    const legacy = config();
    legacy.labels[1]!.models = [OTHER]; legacy.labels[1]!.resolution = "models";
    const draft = draftFromConfiguration(legacy);
    expect(selectedModelIds(draft, legacy)).toEqual([ID]);
    expect(workflowEdges(draft, legacy).some((edge) => edge.to === `model::${OTHER}`)).toBe(false);
    const inherited = { ...legacy, defaults: { default_model: OTHER }, models: legacy.models.map((model) => ({ ...model, tags: [] })) };
    expect(selectedModelIds(draftFromConfiguration(inherited), inherited)).toEqual([OTHER]);
    expect(workflowEdges(draftFromConfiguration(inherited), inherited)).toContainEqual({ from: "zone::balanced/default", to: `model::${OTHER}`, kind: "default" });
  });
  it("adds an imported node, removes only local references and keeps every supplier record and foreign tag", () => {
    const source = config([ID]);
    const original = structuredClone(source);
    const draft = draftFromConfiguration(source);
    const added = addModelNode(draft, source, OTHER);
    expect(addModelNode(added, source, OTHER)).toBe(added);
    expect(addModelNode(added, source, "missing/model")).toBe(added);
    const connected = setLabelMembership(added, OTHER, "balanced/default", true);
    expect(connected.pools?.["balanced/default"]).toEqual([ID, OTHER]);
    expect(connected.models).toBe(draft.models);
    const removed = removeModelNode(connected, source, ID);
    expect(removed.selectedModels).toEqual([OTHER]);
    expect(removed.pools?.["balanced/default"]).toEqual([OTHER]);
    expect(removed.pools?.["balanced/quality"]).toEqual([]);
    expect(removed.models).toBe(draft.models);
    expect(source).toEqual(original);
    expect(workflowModels(removed, source).map((model) => model.id)).toEqual([OTHER]);
    expect(diffSummary(removed, source).changed).toBe(true);
  });
  it("emits a complete local v2 definition with no supplier tags, priority or foreign strategy writes", () => {
    const source = config([ID]);
    const draft = setLabelMembership(addModelNode(draftFromConfiguration(source), source, OTHER), OTHER, "balanced/default", true);
    const body = toWorkflowPayload(draft, source);
    expect(Object.keys(body).sort()).toEqual(["definition", "selected_models", "strategy", "version"]);
    expect(body.version).toBe(2);
    expect(body.selected_models).toEqual([ID, OTHER]);
    expect(body.definition.policy.labels.default).toEqual({ models: [ID, OTHER] });
    expect(body.definition.policy.mode).toBe("cached");
    expect(body.definition.options.questions).toEqual(source.questions);
    body.selected_models.push("mutated"); body.definition.options.questions.intent!.instructions = "mutated";
    expect(draft.selectedModels).toEqual([ID, OTHER]);
    expect(source.questions.intent!.instructions).toBe("Choose a route");
  });
  it("edits explicit pools locally, permits empty pools and rejects unselected or stale targets", () => {
    const source = config([ID]); source.labels.forEach((label) => { label.resolution = "models"; });
    const draft = draftFromConfiguration(source);
    const edge = { from: "zone::balanced/default", to: `model::${ID}`, kind: "pool" as const };
    const disconnected = disconnectPoolEdge(draft, source, edge)!;
    expect(disconnected.pools?.["balanced/default"]).toEqual([]);
    expect(disconnected.models).toBe(draft.models);
    expect(classifyConnection(disconnected, source, { kind: "remove", edge }, edge.to).reason).toBe("stale");
    expect(connectPoolEdge(disconnected, source, edge.from, `model::${OTHER}`)).toBeNull();
    expect(connectPoolEdge(disconnected, source, edge.from, edge.to)?.pools?.["balanced/default"]).toEqual([ID]);
  });
  it("never projects a global default outside the explicit selection", () => {
    const source = { ...config([]), defaults: { default_model: ID } };
    expect(workflowEdges(draftFromConfiguration(source), source).some((edge) => edge.kind === "default")).toBe(false);
  });
  it("keeps history and layout checkpoints independent across strategy switching and deletion", () => {
    const histories = createStrategyHistory<{ draft: ReturnType<typeof draftFromConfiguration>; x: number }>((a, b) => JSON.stringify(a) === JSON.stringify(b));
    const source = config([ID]);
    const a = histories.forStrategy("a"), b = histories.forStrategy("b");
    const initial = { draft: draftFromConfiguration(source), x: 23 };
    a.reset(initial); b.reset({ draft: draftFromConfiguration(config([])), x: 55 });
    a.record({ draft: removeModelNode(initial.draft, source, ID), x: 99 });
    expect(b.canUndo).toBe(false);
    expect(histories.forStrategy("a").undo()).toEqual(initial);
    expect(histories.forStrategy("a").redo()?.draft.selectedModels).toEqual([]);
    histories.remove("a"); expect(histories.forStrategy("a").canUndo).toBe(false);
    expect(histories.forStrategy("b")).toBe(b);
  });
});
