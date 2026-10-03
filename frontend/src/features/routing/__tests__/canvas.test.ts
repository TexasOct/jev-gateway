import { describe, expect, it } from "vitest";
import type { ConfigurationPayload } from "@/shared/api/types";
import { boardPoint, canonicalViewport, canvasToolShortcut, crossedDragThreshold, dragDisplacement, draggedLayout, classifyConnection, compatibleTargets, connectPoolEdge, defaultPosition, disconnectPoolEdge, handoffInspectorFocus, inspectorFallbackPosition, inspectorPosition, marqueeNodes, moveRuleLayout, planFitViewport, planNodeReveal, reconcileRuleLayout, reconcileRuleSelection, reconnectEdge, restoreCanvasViewport, shiftRuleLayout, translateNodes, unoccludedCanvasRect, validLayout, validPosition, visibleCanvasRect } from "../model/canvas";
import { draftFromConfiguration, workflowEdges } from "../model/draft";

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

describe("connection compatibility and layout interactions", () => {
  const draft = draftFromConfiguration(config);
  it("classifies supported and rejected intents with specific reasons", () => {
    const match = { from: "rule-0", to: "zone::task_aware/craft", kind: "match" as const };
    expect(classifyConnection(draft, config, { kind: "reconnect", edge: match }, "zone::task_aware/ultra")).toEqual({ operation: "match", reason: null });
    expect(classifyConnection(draft, config, { kind: "reconnect", edge: match }, "model::p/a").reason).toBe("unknownLabel");
    expect(classifyConnection(draft, config, { kind: "reconnect", edge: { from: "questions", to: "rule-0", kind: "context" } }, "fallback").reason).toBe("context");
    const stale = { ...match, to: "zone::missing" };
    expect(classifyConnection(draft, config, { kind: "reconnect", edge: stale }, "zone::task_aware/ultra").reason).toBe("stale");
    const pool = { from: "zone::task_aware/craft", to: "model::p/a", kind: "pool" as const };
    expect(classifyConnection(draft, config, { kind: "new-pool", from: pool.from }, "model::p/a").reason).toBe("duplicate");
    const single = disconnectPoolEdge(draft, config, { ...pool, to: "model::p/b" })!;
    expect(classifyConnection(single, config, { kind: "remove", edge: pool }, pool.to).reason).toBe("lastMember");
    expect(classifyConnection(draft, config, { kind: "reconnect", edge: { from: "rule-2", to: "zone::task_aware/craft", kind: "unmatched" } }, "rule-0").reason).toBe("fixed");
    expect(classifyConnection(draft, config, { kind: "reconnect", edge: { from: "rule-0", to: "rule-1", kind: "unmatched" } }, "rule-2").operation).toBe("order");
    const explicit = { ...config, labels: [{ ...config.labels[0]!, resolution: "models" as const }, config.labels[1]!] };
    expect(classifyConnection(draft, explicit, { kind: "new-pool", from: "zone::task_aware/craft" }, "model::p/b").reason).toBe("explicit");
  });
  it("fits readable desktop views and focuses a module or compact group on narrow screens", () => {
    const positions = { questions: { x: 50, y: 80 }, "zone::pool": { x: 850, y: 80 }, "model::p/a": { x: 2200, y: 80 } };
    const board = { width: 3200, height: 2200 };
    const desktop = planFitViewport(positions, "questions", [], { width: 1800, height: 800 }, board);
    expect(desktop.mode).toBe("board");
    expect(desktop.zoom).toBeGreaterThanOrEqual(0.5);
    const mobile = planFitViewport(positions, "model::p/a", [], { width: 350, height: 340 }, board);
    expect(mobile).toMatchObject({ mode: "node", zoom: 1 });
    expect(mobile.scroll.x).toBeGreaterThan(2000);
    expect(mobile.scroll.y).toBe(0);
    const chineseMobile = planFitViewport({ "model::p/c": { x: 2900, y: 1900 } }, "model::p/c", [], { width: 324, height: 489 }, board);
    expect(chineseMobile.mode).toBe("node");
    expect(chineseMobile.zoom).toBe(1);
    expect(chineseMobile.scroll.x).toBe(2833);
    expect(chineseMobile.scroll.y).toBeCloseTo(1683.5);
    const group = planFitViewport(positions, "questions", ["questions", "zone::pool"], { width: 390, height: 340 }, board);
    expect(group.mode).toBe("node");
    expect(group.zoom).toBeGreaterThanOrEqual(0.5);
    const close = { questions: { x: 50, y: 80 }, "rule-0": { x: 260, y: 80 }, "model::p/a": { x: 2200, y: 80 } };
    const focused = planFitViewport(close, "questions", ["questions", "rule-0"], { width: 390, height: 340 }, board);
    expect(focused.mode).toBe("group");
    expect(focused.zoom).toBeGreaterThanOrEqual(0.75);
    expect(focused.scroll.x).toBeGreaterThan(0);
    const crowded = planFitViewport(positions, "questions", [], { width: 1000, height: 350 }, board);
    expect(crowded.mode).toBe("node");
    expect(crowded.zoom).toBeGreaterThanOrEqual(0.5);
    expect(planFitViewport(positions, "questions", [], { width: 0, height: 340 }, board).scroll).toEqual({ x: 0, y: 0 });
    expect(positions["model::p/a"]).toEqual({ x: 2200, y: 80 });
  });

  it("maps zoomed pointer coordinates and multi-selection movement to unscaled layout positions", () => {
    expect(boardPoint({ x: 200, y: 130 }, { x: 100, y: 50 }, { x: 40, y: 20 }, 2)).toEqual({ x: 70, y: 50 });
    expect(boardPoint({ x: 200, y: 130 }, { x: 100, y: 50 }, { x: 40, y: 20 }, 0.25)).toEqual({ x: 560, y: 400 });
    const positions = { a: { x: 20, y: 20 }, b: { x: 240, y: 20 } };
    expect(marqueeNodes({ x: 0, y: 0 }, { x: 220, y: 100 }, positions)).toEqual(["a"]);
    expect(translateNodes(positions, ["a", "b"], { x: 20, y: 10 }, 1000, 800)).toEqual({ a: { x: 40, y: 30 }, b: { x: 260, y: 30 } });
    expect(translateNodes(positions, ["a", "b"], { x: -50, y: -50 }, 1000, 800)).toEqual({ a: { x: 0, y: 0 }, b: { x: 220, y: 0 } });
    expect(translateNodes({ a: { x: 750, y: 700 }, b: { x: 790, y: 710 } }, ["a", "b"], { x: 80, y: 80 }, 1000, 800)).toEqual({ a: { x: 750, y: 705 }, b: { x: 790, y: 715 } });
  });
});

describe("anchored inspector placement", () => {
  const workspace = { left: 0, top: 100, right: 1000, bottom: 700 };
  const panel = { width: 320, height: 400 };
  const toolbar = { left: 12, top: 640, right: 988, bottom: 688 };
  it("places a panel beside the node without covering the toolbar", () => {
    expect(inspectorPosition({ left: 200, top: 150, right: 390, bottom: 206 }, workspace, panel, toolbar)).toEqual({ x: 402, y: 150, ...panel });
    expect(inspectorPosition({ left: 200, top: 110, right: 390, bottom: 166 }, workspace, panel, toolbar)).toEqual({ x: 402, y: 112, ...panel });
  });
  it("flips and clamps at the canvas edges, including a narrow viewport", () => {
    expect(inspectorPosition({ left: 820, top: 640, right: 980, bottom: 696 }, workspace, panel, toolbar)).toEqual({ x: 488, y: 228, ...panel });
    expect(inspectorPosition({ left: 12, top: 640, right: 202, bottom: 696 }, { left: 0, top: 100, right: 350, bottom: 700 }, { width: 340, height: 460 }, toolbar)).toEqual({ x: 12, y: 168, width: 326, height: 460 });
  });
  it("uses only the intersection of canvas and visible page, even when a tray extends below it", () => {
    const page = { left: 0, top: 0, right: 390, bottom: 600 };
    const canvas = { left: 28, top: -150, right: 362, bottom: 340 };
    const visible = visibleCanvasRect(canvas, page)!;
    expect(visible).toEqual({ left: 28, top: 0, right: 362, bottom: 340 });
    const tools = { left: 40, top: 220, right: 350, bottom: 328 };
    const result = inspectorPosition({ left: 260, top: 260, right: 450, bottom: 316 }, visible, { width: 340, height: 460 }, tools)!;
    expect(result).toEqual({ x: 40, y: 12, width: 310, height: 196 });
    expect(result.y + result.height).toBeLessThan(tools.top);
    expect(result.x + result.width).toBeLessThan(canvas.right);
    expect(visibleCanvasRect({ ...canvas, bottom: -10 }, page)).toBeNull();
    expect(inspectorPosition(canvas, { left: 0, top: 0, right: 320, bottom: 60 }, panel)).toBeNull();
  });
  it("caps dimensions across viewport sizes and all node edges", () => {
    for (const width of [240, 320, 390, 960, 1400]) for (const height of [220, 360, 600]) {
      const bounds = { left: 30, top: 80, right: 30 + width, bottom: 80 + height };
      const tools = { left: 42, top: bounds.bottom - 80, right: bounds.right - 12, bottom: bounds.bottom - 12 };
      for (const x of [-200, 30, width]) for (const y of [-100, 80, height]) {
        const result = inspectorPosition({ left: x, top: y, right: x + 190, bottom: y + 56 }, bounds, { width: 340, height: 460 }, tools);
        const surface = result ?? inspectorFallbackPosition({ ...bounds, bottom: tools.top }, bounds);
        expect(surface.x).toBeGreaterThanOrEqual(bounds.left + 12);
        expect(surface.y).toBeGreaterThanOrEqual(bounds.top + 12);
        expect(surface.x + surface.width).toBeLessThanOrEqual(bounds.right - 12);
        expect(surface.y + surface.height).toBeLessThanOrEqual(result ? tools.top - 12 : bounds.bottom - 12);
        expect(surface.height).toBeGreaterThanOrEqual(120);
      }
    }
  });
  it("leaves the full mobile node available for native pointer dragging", () => {
    for (const width of [320, 390]) {
      const bounds = { left: 0, top: 230, right: width, bottom: 700 };
      for (const y of [250, 365, 600]) {
        const node = { left: 50, top: y, right: 240, bottom: y + 56 };
        const result = inspectorPosition(node, bounds, { width: 340, height: 460 })!;
        expect(result).not.toBeNull();
        expect(result.y + result.height <= node.top - 12 || result.y >= node.bottom + 12).toBe(true);
        expect(result.y).toBeGreaterThanOrEqual(bounds.top + 12);
        expect(result.y + result.height).toBeLessThanOrEqual(bounds.bottom - 12);
      }
    }
  });
  it("reveals a distant node near the top of a 216px free region when centering would hide its inspector", () => {
    const canvas = { left: 0, top: 293, right: 320, bottom: 700 };
    const free = unoccludedCanvasRect(canvas, { left: 0, top: 0, right: 320, bottom: 700 }, [
      { edge: "top", rect: { left: 12, top: 305, right: 308, bottom: 355 } },
      { edge: "bottom", rect: { left: 0, top: 633, right: 320, bottom: 700 } },
      { edge: "bottom", rect: { left: 12, top: 571, right: 308, bottom: 621 } },
    ])!;
    expect(free.bottom - free.top).toBe(216);
    const reference = { origin: { x: 0, y: 74 }, focal: { x: 0, y: 62 }, maxScroll: { x: 2880, y: 2000 } };
    const centered = { left: 65, right: 255, top: 435, bottom: 491 };
    expect(inspectorPosition(centered, free, { width: 340, height: 460 })).toBeNull();
    const result = planNodeReveal({ x: 1200, y: 500 }, { width: 190, height: 56 }, 1, canvas, free, reference, true);
    expect(result.anchor.top).toBe(free.top + 12);
    expect(result.anchor.left).toBeGreaterThanOrEqual(free.left);
    expect(result.anchor.right).toBeLessThanOrEqual(free.right);
    expect(result.inspector).not.toBeNull();
    expect(result.inspector!.y).toBeGreaterThanOrEqual(result.anchor.bottom + 12);
    expect(result.inspector!.y + result.inspector!.height).toBeLessThanOrEqual(free.bottom - 12);
    const tiny = { ...free, bottom: free.top + 90 };
    expect(inspectorPosition(result.anchor, tiny, { width: 340, height: 460 })).toBeNull();
    const fallback = inspectorFallbackPosition(tiny, canvas);
    expect(fallback.height).toBeGreaterThan(64);
    expect(fallback.y + fallback.height).toBeLessThanOrEqual(canvas.bottom);
  });
  it("checks the actual scroll-clamped node before claiming an anchored inspector is possible", () => {
    const canvas = { left: 0, top: 293, right: 320, bottom: 700 };
    const free = { left: 0, top: 376, right: 320, bottom: 536 };
    const reference = { origin: { x: 0, y: 40 }, focal: { x: 0, y: 83 }, maxScroll: { x: 2880, y: 2050 } };
    const nearTop = planNodeReveal({ x: 400, y: 0 }, { width: 190, height: 56 }, 1, canvas, free, reference, true);
    expect(nearTop.scroll.y).toBe(0);
    expect(nearTop.anchor.top).toBeLessThan(free.top);
    expect(nearTop.inspector).not.toBeNull();
  });
  it("hands inspector field focus to the exposed node, or the canvas when its node is occluded", () => {
    const focused = {} as Element;
    let target = "";
    const panel = { ownerDocument: { activeElement: focused }, contains: (item: Element) => item === focused } as unknown as HTMLElement;
    const node = { getBoundingClientRect: () => ({ left: 10, right: 200, top: 40, bottom: 96 }), focus: (options: FocusOptions) => { expect(options.preventScroll).toBe(true); target = "node"; } } as unknown as HTMLElement;
    const canvas = { focus: (options: FocusOptions) => { expect(options.preventScroll).toBe(true); target = "canvas"; } } as HTMLElement;
    handoffInspectorFocus(panel, node, canvas, { left: 0, right: 320, top: 0, bottom: 216 });
    expect(target).toBe("node");
    handoffInspectorFocus(panel, node, canvas, { left: 0, right: 320, top: 100, bottom: 216 });
    expect(target).toBe("canvas");
  });
  it("reserves measured title, drawer and toolbar bounds at tall and narrow viewports", () => {
    for (const [width, height, header] of [[1430, 2511, 78], [1280, 800, 96], [390, 844, 213], [320, 700, 260]]) {
      const canvas = { left: 0, top: header!, right: width!, bottom: height! };
      const title = { left: 12, top: header! + 12, right: width! - 12, bottom: header! + 72 };
      for (const drawerHeight of [90, (height! - header!) * 0.48]) {
        const drawer = { ...canvas, top: height! - drawerHeight };
        const toolbar = { left: 12, right: width! - 12, top: drawer.top - 62, bottom: drawer.top - 12 };
        const available = unoccludedCanvasRect(canvas, { ...canvas, top: 0 }, [
          { edge: "top", rect: title }, { edge: "bottom", rect: drawer }, { edge: "bottom", rect: toolbar },
        ])!;
        expect(available).toEqual({ ...canvas, top: title.bottom, bottom: toolbar.top });
        const positions = { selected: { x: 900, y: 900 } };
        const plan = planFitViewport(positions, "selected", [], { width: width!, height: available.bottom - available.top }, { width: 3200, height: 3200 });
        const nodeTop = available.top + 900 * plan.zoom - plan.scroll.y;
        expect(nodeTop).toBeGreaterThanOrEqual(available.top);
        expect(nodeTop + 56 * plan.zoom).toBeLessThanOrEqual(available.bottom);
        expect(positions.selected).toEqual({ x: 900, y: 900 });
      }
    }
  });
});

describe("canonical canvas viewport", () => {
  it("roundtrips 0.5x, 1x and 1.75x around a nonzero origin and focal offset", () => {
    const reference = { origin: { x: 0, y: 210 }, focal: { x: 12, y: 198 }, maxScroll: { x: 6000, y: 5000 } };
    for (const zoom of [0.5, 1, 1.75]) {
      const raw = { x: 420 * zoom - 12, y: 380 * zoom + 12 };
      const saved = canonicalViewport(raw, zoom, reference);
      expect(saved).toEqual({ x: 420, y: 392 });
      expect(restoreCanvasViewport(saved, zoom, reference)).toEqual(raw);
      const changedHeader = { ...reference, origin: { x: 0, y: 255 }, focal: { x: 20, y: 243 } };
      const restored = restoreCanvasViewport(saved, 1, changedHeader);
      expect(canonicalViewport(restored, 1, changedHeader)).toEqual(saved);
    }
    expect(restoreCanvasViewport({ x: 9000, y: 9000 }, 1.75, { ...reference, maxScroll: { x: 170, y: 230 } })).toEqual({ x: 170, y: 230 });
    expect(restoreCanvasViewport({ x: -100, y: -100 }, 0.5, reference)).toEqual({ x: 0, y: 0 });
    const usual = { ...reference, focal: { x: 0, y: 198 } };
    expect(canonicalViewport({ x: 350, y: 500 }, 1, usual)).toEqual({ x: 350, y: 500 });
    expect(restoreCanvasViewport({ x: 350, y: 500 }, 1, usual)).toEqual({ x: 350, y: 500 });
    expect(canonicalViewport({ x: 0, y: 0 }, 0.5, usual).y).toBe(-12);
    expect(restoreCanvasViewport({ x: 0, y: -12 }, 0.5, usual)).toEqual({ x: 0, y: 0 });
  });
});

describe("canvas selection and tools", () => {
  it("ignores tool shortcuts in form fields and modified shortcuts", () => {
    expect(canvasToolShortcut("V", false, false)).toBe("select");
    expect(canvasToolShortcut("h", false, false)).toBe("pan");
    expect(canvasToolShortcut("h", true, false)).toBeNull();
    expect(canvasToolShortcut("v", false, true)).toBeNull();
    expect(canvasToolShortcut("x", false, false)).toBeNull();
  });
  it("keeps selected rule identity through moves, insertions and removals", () => {
    expect(reconcileRuleSelection("rule-2", { kind: "move", from: 2, to: 0 })).toBe("rule-0");
    expect(reconcileRuleSelection("rule-0", { kind: "move", from: 2, to: 0 })).toBe("rule-1");
    expect(reconcileRuleSelection("rule-1", { kind: "insert", index: 0 })).toBe("rule-2");
    expect(reconcileRuleSelection("rule-1", { kind: "remove", index: 1 })).toBe("");
    expect(reconcileRuleSelection("questions", { kind: "remove", index: 1 })).toBe("questions");
    expect(reconcileRuleSelection("", { kind: "insert", index: 0 })).toBe("");
  });
});

describe("canvas node interaction", () => {
  it("starts dragging only after the pointer moves beyond the click threshold", () => {
    expect(crossedDragThreshold({ x: 20, y: 20 }, { x: 22, y: 22 })).toBe(false);
    expect(crossedDragThreshold({ x: 20, y: 20 }, { x: 25, y: 20 })).toBe(true);
  });
  it("converts pointer motion to unscaled board motion for saved positions", () => {
    for (const zoom of [0.5, 0.75, 1, 1.75]) {
      const delta = dragDisplacement({ x: 100, y: 100 }, { x: 100 + 28 * zoom, y: 100 - 21 * zoom }, zoom);
      expect(delta).toEqual({ x: 28, y: -21 });
      const start = { "rule-0": { x: 400, y: 80 }, "rule-1": { x: 400, y: 220 } };
      const moved = draggedLayout({ version: 1, nodes: {}, viewport: { x: 0, y: 0 } }, start, delta, 3200, 2200);
      expect(moved.layout.nodes["rule-0"]).toEqual({ x: 428, y: 59 });
      expect(moved.layout.nodes["rule-1"]).toEqual({ x: 428, y: 199 });
      expect(moved.changed).toBe(true);
    }
  });
  it("does not write an unchanged gesture and clamps a group by its combined bounds", () => {
    const start = { node: { x: 0, y: 0 } };
    expect(draggedLayout({ version: 1, nodes: {}, viewport: { x: 0, y: 0 } }, start, { x: 0, y: 0 }, 3200, 2200).changed).toBe(false);
    expect(draggedLayout({ version: 1, nodes: {}, viewport: { x: 0, y: 0 } }, { a: { x: 20, y: 20 }, b: { x: 240, y: 20 } }, { x: -50, y: -50 }, 3200, 2200).layout.nodes).toEqual({ a: { x: 0, y: 0 }, b: { x: 220, y: 0 } });
  });
});

describe("first-match edge conversion", () => {
  it("rewires a match and fallback choice without changing conditions", () => {
    const draft = draftFromConfiguration(config);
    const changed = reconnectEdge(draft, config, { from: "rule-0", to: "zone::task_aware/craft", kind: "match" }, "zone::task_aware/ultra");
    expect(changed?.rules[0]?.select.label).toBe("ultra");
    expect(changed?.rules[0]?.when).toEqual(draft.rules[0]?.when);
    expect(reconnectEdge(draft, config, { from: "rule-0", to: "zone::task_aware/craft", kind: "match" }, "zone::task_aware/craft")).toBe(draft);
    expect(reconnectEdge(draft, config, { from: "fallback", to: "zone::task_aware/craft", kind: "match" }, "zone::task_aware/ultra")?.fallback.label).toBe("ultra");
  });
  it("reorders only an unmatched successor and preserves an acyclic chain", () => {
    const draft = draftFromConfiguration(config);
    const changed = reconnectEdge(draft, config, { from: "rule-0", to: "rule-1", kind: "unmatched" }, "rule-2");
    expect(changed?.rules.map((rule) => rule.when.scale)).toEqual(["small", "huge", "large"]);
    expect(workflowEdges(changed!, config).filter((edge) => edge.kind === "unmatched").map((edge) => edge.to)).toEqual(["rule-1", "rule-2", "zone::task_aware/craft"]);
    expect(reconnectEdge(draft, config, { from: "rule-1", to: "rule-2", kind: "unmatched" }, "rule-0")).toBeNull();
    expect(reconnectEdge(draft, config, { from: "rule-0", to: "rule-1", kind: "unmatched" }, "fallback")).toBeNull();
    expect(compatibleTargets(draft, config, { from: "rule-0", to: "rule-1", kind: "unmatched" })).not.toContain("fallback");
    expect(compatibleTargets(draft, config, { from: "rule-2", to: "zone::task_aware/craft", kind: "unmatched" })).toEqual([]);
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
