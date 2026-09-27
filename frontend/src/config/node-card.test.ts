import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigurationPayload } from "../api";
import { LocaleProvider } from "../i18n";
import RoutingCanvas from "./RoutingCanvas";
import { marqueeNodes, translateNodes } from "./canvas";
import { draftFromConfiguration } from "./draft";
import { NODE_CARD_BASE_HEIGHT, NODE_CARD_CONTENT_HEIGHT, NODE_CARD_CONTENT_INSET, NODE_CARD_PORT_RADIUS, NODE_CARD_ROWS, nodeCardCenter, nodeCardMetrics, nodeCardPorts, nodeCardPortsWithCenter } from "./node-card";

afterEach(() => vi.unstubAllGlobals());

describe("node card geometry", () => {
  it("matches the three rendered rows without unused measured height", () => {
    expect(NODE_CARD_ROWS).toEqual({ type: 12, title: 16, summary: 12 });
    expect(NODE_CARD_CONTENT_HEIGHT + 2 * NODE_CARD_CONTENT_INSET).toBe(NODE_CARD_BASE_HEIGHT);
    expect(nodeCardMetrics()).toEqual({ width: 190, height: 56 });
  });

  it("shares the existing marquee and joint movement bounds", () => {
    const card = nodeCardMetrics();
    const positions = { questions: { x: 10, y: 20 } };
    expect(marqueeNodes({ x: 10, y: 20 + card.height - 1 }, { x: 11, y: 20 + card.height }, positions)).toEqual(["questions"]);
    expect(marqueeNodes({ x: 10, y: 20 + card.height }, { x: 11, y: 20 + card.height + 1 }, positions)).toEqual([]);
    const moved = translateNodes(positions, ["questions"], { x: 20000, y: 20000 }, 11000, 11000).questions!;
    expect(moved.x + card.width).toBeLessThanOrEqual(10000);
    expect(moved.y + card.height).toBeLessThanOrEqual(10000);
  });

  it("centers single edges and separates match/order ports symmetrically", () => {
    expect(nodeCardCenter("left")).toEqual({ x: 0, y: 28 });
    expect(nodeCardCenter("right")).toEqual({ x: 190, y: 28 });
    expect(nodeCardPorts(0)).toEqual([]);
    expect(nodeCardPorts(1)).toEqual([{ x: 190, y: 28, radius: 9 }]);
    expect(nodeCardPorts(2).map((port) => port.y)).toEqual([18, 38]);
    expect(nodeCardPorts(3).map((port) => port.y)).toEqual([10, 28, 46]);
  });

  it.each([1, 2, 3, 6, 256])("bounds %i sibling handles without overlapping the center add port", (count) => {
    for (const withCenterPort of [false, true]) {
      const ports = withCenterPort ? nodeCardPortsWithCenter(count) : nodeCardPorts(count);
      expect(ports).toEqual(withCenterPort ? nodeCardPortsWithCenter(count) : nodeCardPorts(count));
      expect(new Set(ports.map((port) => port.y)).size).toBe(count);
      const ordered = [...ports].sort((a, b) => a.y - b.y);
      if (withCenterPort || count > 2) expect(ports).toEqual(ordered);
      for (const [index, port] of ordered.entries()) {
        expect(port.x).toBe(nodeCardMetrics().width);
        expect(port.radius).toBeGreaterThan(0);
        expect(port.y - port.radius).toBeGreaterThanOrEqual(0);
        expect(port.y + port.radius).toBeLessThanOrEqual(nodeCardMetrics().height);
        if (withCenterPort) expect(Math.abs(port.y - nodeCardCenter("right").y)).toBeGreaterThanOrEqual(port.radius + NODE_CARD_PORT_RADIUS);
        if (index) expect(port.y - ordered[index - 1]!.y).toBeGreaterThanOrEqual(port.radius + ordered[index - 1]!.radius);
      }
    }
  });

  it.each(["en", "zh-CN"])("keeps all five roles at the same cap with long Unicode contents in %s", (locale) => {
    vi.stubGlobal("window", { localStorage: { getItem: () => locale } });
    const name = "模型👩🏽‍💻e\u0301".repeat(15);
    const id = `供应商/${name}`;
    const config: ConfigurationPayload = {
      write_available: true, write_disabled_reason: null, strategy: "task_aware", baseline_source: "models.json",
      overlay: { applied: false, path: "routing-overrides.json", error: null }, config_hash: "hash",
      questions: { [name]: { type: "choice", instructions: name, criteria: { [name]: name } } },
      rules: [{ index: 0, when: { [name]: name.repeat(20) }, select: { label: name } }],
      fallback: { label: name },
      labels: [{ name, tag: `task_aware/${name}`, score: 0, reasoning_effort: null, description: name, resolution: "tag", models: [id] }],
      models: [{ id, provider: "供应商", upstream_model: name, priority: 1, baseline_priority: 1, tags: [`task_aware/${name}`], baseline_tags: [] }],
      warnings: [],
    };
    const noop = () => undefined;
    const html = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(RoutingCanvas, {
      heading: "", children: () => null, draft: draftFromConfiguration(config), config,
      disabled: false, selected: "", selection: [], onSelect: noop, onSelection: noop, onDraft: noop,
      onError: noop, onAddRule: noop, canAddRule: true, onAnchor: noop, revealNode: null,
      onReveal: noop, inspectorOpen: false, topology: null,
    })));
    const cards = [...html.matchAll(/<button[^>]*data-canvas-node="[^"]+"[^>]*>/g)].map(([tag]) => tag);
    expect(cards).toHaveLength(5);
    for (const card of cards) expect(card).toContain("width:190px;height:56px;min-height:56px;max-height:56px");
    for (const kind of ["questions", "rule", "fallback", "label", "model"]) expect(html).toContain(`data-node-kind="${kind}"`);
    expect(html).toContain(name);
    expect(html).toContain(name.repeat(20));
    expect(html).not.toContain("height:380px");
    expect(html).toContain('cx="1040" cy="108" r="9" class="canvas-edge-handle canvas-add-handle"');
  });
});
