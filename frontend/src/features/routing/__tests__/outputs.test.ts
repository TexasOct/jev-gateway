import { describe, expect, it } from "vitest";
import { configuration } from "../../../../tests/fixtures/configuration";
import { alignNodes, arrangeNodes, classifyConnection, connectMatchEdge, disconnectEdge, marqueeNodes, planFitViewport, translateNodes, validLayout } from "../model/canvas";
import { addCriterion, draftFromConfiguration, incompleteLabels, invalidQuestions, removeCriterion, toOverlayPayload, workflowEdges } from "../model/draft";
import { canvasDimensions, canvasOutputs } from "../model/outputs";

describe("semantic output channels", () => {
  it("projects each question/criterion to the canonical ordered entry and preserves stable IDs through growth", () => {
    const draft = draftFromConfiguration(configuration);
    const added = addCriterion(addCriterion(draft, "intent", "code"), "intent", "prose");
    const outputs = canvasOutputs(added, configuration);
    expect(outputs.questions!.filter((row) => row.kind === "context").map((row) => row.name)).toEqual(["intent = default", "intent = other", "intent = code", "intent = prose"]);
    expect(outputs.questions!.filter((row) => row.kind === "context").every((row) => row.edge?.to === "rule-0")).toBe(true);
    expect(outputs.questions!.at(-1)!.edge).toEqual({ from: "questions", to: "fallback", kind: "failure" });
    expect(workflowEdges(added, configuration).filter((edge) => edge.kind === "context")).toHaveLength(1);
    expect(outputs.questions![0]!.id).toBe(canvasOutputs(draft, configuration).questions![0]!.id);
    const shrunk = removeCriterion(added, "intent", "prose");
    expect(canvasDimensions(outputs).questions!.height).toBe(196);
    expect(canvasDimensions(canvasOutputs(shrunk, configuration)).questions!.height).toBe(168);
  });

  it.each(["rule-0", "fallback"])("keeps a repairable %s match slot with an explicit empty label and blocks stale reconnection", (from) => {
    const draft = draftFromConfiguration(configuration);
    const edge = workflowEdges(draft, configuration).find((edge) => edge.from === from && edge.kind === "match")!;
    const cleared = disconnectEdge(draft, configuration, edge)!;
    expect(incompleteLabels(cleared, configuration)).toEqual([from]);
    const payload = toOverlayPayload(cleared, configuration);
    expect(from === "fallback" ? payload.fallback!.label : payload.rules[0]!.select.label).toBe("");
    const slot = canvasOutputs(cleared, configuration)[from]![0]!;
    expect(slot.id).toBe("match");
    expect(slot.edge).toBeUndefined();
    expect(slot.intent).toEqual({ kind: "new-match", from });
    expect(disconnectEdge(cleared, configuration, edge)).toBeNull();
    const repaired = connectMatchEdge(cleared, configuration, from, "zone::balanced/quality")!;
    expect(incompleteLabels(repaired, configuration)).toEqual([]);
    expect(connectMatchEdge(repaired, configuration, from, "zone::balanced/default")).toBeNull();
    expect(repaired.rules[0]!.when).toEqual(draft.rules[0]!.when);
  });

  it("rejects missing, empty and unknown labels and protects fixed context/order links", () => {
    const draft = draftFromConfiguration(configuration);
    for (const label of [undefined, "", "missing"]) {
      expect(incompleteLabels({ ...draft, rules: [{ ...draft.rules[0]!, select: { label } }], fallback: { label } }, configuration)).toEqual(["rule-0", "fallback"]);
    }
    const edges = workflowEdges(draft, configuration);
    expect(disconnectEdge(draft, configuration, edges[0]!)).toBeNull();
    const order = edges.find((edge) => edge.kind === "unmatched")!;
    expect(classifyConnection(draft, configuration, { kind: "remove", edge: order }, order.to).reason).toBe("fixed");
    expect(connectMatchEdge(draft, configuration, "questions", "zone::balanced/default")).toBeNull();
  });

  it("uses resolved explicit members and a separate add output only for tag pools", () => {
    const draft = draftFromConfiguration(configuration);
    const explicit = { ...configuration, labels: [{ ...configuration.labels[0]!, resolution: "models" as const }] };
    draft.models[configuration.models[0]!.id]!.tags = [];
    expect(canvasOutputs(draft, explicit)["zone::balanced/default"]!.map((row) => row.id)).toEqual([`model::${configuration.models[0]!.id}`]);
    expect(canvasOutputs(draft, configuration)["zone::balanced/default"]!.map((row) => row.kind)).toEqual(["add"]);
  });
  it("separates successful no-match default from decision failure and rejects unsupported questions", () => {
    const draft = draftFromConfiguration(configuration);
    const differentFallback = { ...draft, fallback: { label: "quality" } };
    expect(workflowEdges(differentFallback, configuration).find((edge) => edge.kind === "unmatched")!.to).toBe("zone::balanced/default");
    expect(workflowEdges({ ...differentFallback, rules: [] }, configuration)[0]!.to).toBe("zone::balanced/default");
    expect(workflowEdges(differentFallback, configuration).find((edge) => edge.from === "fallback")!.to).toBe("zone::balanced/quality");
    expect(invalidQuestions({ ...draft, questions: { choice: { type: "choice", instructions: "", criteria: { one: "One" } }, score: { type: "score", instructions: "", criteria: {} } } })).toEqual([{ name: "choice", reason: "criteria" }, { name: "score", reason: "type" }]);
  });
  it.each<{ type: string; instructions: string; criteria: Record<string, string>; reason: string }>([
    { type: "score", instructions: "Choose", criteria: { one: "One", two: "Two" }, reason: "type" },
    { type: "noul", instructions: "Choose", criteria: { one: "One", two: "Two" }, reason: "type" },
    { type: "choice", instructions: "Choose", criteria: { one: "One" }, reason: "criteria" },
    { type: "choice", instructions: " \n ", criteria: { one: "One", two: "Two" }, reason: "instructions" },
    { type: "choice", instructions: "Choose", criteria: { "": "One", two: "Two" }, reason: "criterionName" },
    { type: "choice", instructions: "Choose", criteria: { " ": "One", two: "Two" }, reason: "criterionName" },
    { type: "choice", instructions: "Choose", criteria: { one: "", two: "Two" }, reason: "criterionDescription" },
    { type: "choice", instructions: "Choose", criteria: { one: " \t ", two: "Two" }, reason: "criterionDescription" },
  ])("blocks $reason drafts and hides their result channels until repaired", ({ reason, ...question }) => {
    const draft = draftFromConfiguration(configuration);
    const invalid = { ...draft, questions: { ...draft.questions, invalid: question } };
    expect(invalidQuestions(invalid)).toEqual([{ name: "invalid", reason }]);
    const rows = canvasOutputs(invalid, configuration).questions!;
    expect(rows.filter((row) => row.kind === "context").map((row) => row.name)).toEqual(["intent = default", "intent = other"]);
    expect(rows.at(-1)!.kind).toBe("failure");
    const repaired = { ...invalid, questions: { ...invalid.questions, invalid: { type: "choice", instructions: "Choose", criteria: { one: "One", two: "Two" } } } };
    expect(invalidQuestions(repaired)).toEqual([]);
    expect(canvasOutputs(repaired, configuration).questions!.filter((row) => row.kind === "context")).toHaveLength(4);
  });
});

describe("expanded layout geometry", () => {
  const dimensions = { questions: { width: 190, height: 420 }, "rule-0": { width: 190, height: 112 }, "rule-1": { width: 190, height: 112 }, fallback: { width: 190, height: 84 } };
  it("arranges stage nodes using their actual height and aligns only the selected group", () => {
    const positions = arrangeNodes(Object.keys(dimensions), dimensions);
    expect(positions["rule-1"]!.y).toBe(positions["rule-0"]!.y + 112 + 48);
    expect(positions.fallback!.y).toBe(positions["rule-1"]!.y + 112 + 48);
    expect(alignNodes(positions, ["rule-1", "fallback"], "y")).toEqual({ "rule-1": positions["rule-1"], fallback: { ...positions.fallback!, y: positions["rule-1"]!.y } });
  });
  it("includes lower output rows in marquee, movement clamps and fit bounds", () => {
    const positions = { questions: { x: 50, y: 80 } };
    expect(marqueeNodes({ x: 51, y: 499 }, { x: 52, y: 501 }, positions, dimensions)).toEqual(["questions"]);
    const moved = translateNodes(positions, ["questions"], { x: 10000, y: 10000 }, 1000, 800, dimensions).questions!;
    expect(moved.y + dimensions.questions.height + 29).toBe(800);
    const fit = planFitViewport(positions, "questions", [], { width: 320, height: 550 }, { width: 3200, height: 2200 }, dimensions);
    expect(fit.zoom).toBe(1);
    expect(80 + 420 - fit.scroll.y).toBeLessThanOrEqual(550);
  });
  it("splits cumulative heights over 20000 rather than piling nodes at the coordinate limit", () => {
    const dimensions = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`rule-${index}`, { width: 190, height: 2000 }]));
    const arranged = arrangeNodes(Object.keys(dimensions), dimensions);
    expect(new Set(Object.values(arranged).map(({ x, y }) => `${x},${y}`)).size).toBe(12);
    expect(new Set(Object.values(arranged).map(({ x }) => x)).size).toBe(3);
    expect(Object.values(arranged).every(({ y }) => y + 2000 <= 10000)).toBe(true);
  });
  it("reserves overflowing stage widths before placing label pools and model sinks", () => {
    const dimensions = {
      questions: { width: 190, height: 9000 },
      ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`rule-${index}`, { width: 190, height: 2000 }])),
      fallback: { width: 190, height: 84 },
      "zone::default": { width: 190, height: 300 },
      "model::provider/model": { width: 190, height: 56 },
    };
    const arranged = arrangeNodes(Object.keys(dimensions), dimensions);
    const rulesRight = Math.max(...Object.entries(arranged).filter(([id]) => id.startsWith("rule-") || id === "fallback").map(([, { x }]) => x + 190));
    expect(arranged["zone::default"]!.x).toBeGreaterThanOrEqual(rulesRight + 160);
    expect(arranged["model::provider/model"]!.x).toBeGreaterThanOrEqual(arranged["zone::default"]!.x + 190 + 160);
    const boxes = Object.entries(arranged).map(([id, position]) => ({ ...position, ...dimensions[id as keyof typeof dimensions] }));
    for (const [index, box] of boxes.entries()) {
      for (const other of boxes.slice(index + 1)) {
        expect(box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y).toBe(true);
      }
    }
    expect(validLayout({ version: 1, nodes: arranged, viewport: { x: 0, y: 0 } })).toBe(true);
    expect(Object.values(arranged).every(({ x, y }) => x >= 0 && x <= 10000 && y >= 0 && y <= 10000)).toBe(true);
  });
  it("rejects 257 saved nodes, oversized Unicode encoding and out-of-range overflow columns", () => {
    const ids = Array.from({ length: 257 }, (_, index) => `rule-${index}`);
    expect(validLayout({ version: 1, nodes: arrangeNodes(ids, {}), viewport: { x: 0, y: 0 } })).toBe(false);
    const unicode = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`model::${"模".repeat(235)}${index}`, { x: 0, y: 0 }]));
    expect(validLayout({ version: 1, nodes: unicode, viewport: { x: 0, y: 0 } })).toBe(false);
    const tall = Object.fromEntries(ids.map((id) => [id, { width: 190, height: 9990 }]));
    expect(validLayout({ version: 1, nodes: arrangeNodes(ids.slice(0, 50), tall), viewport: { x: 0, y: 0 } })).toBe(false);
  });
});
