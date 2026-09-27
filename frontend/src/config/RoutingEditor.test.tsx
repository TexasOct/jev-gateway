import { createContext, useContext } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConfigurationPayload } from "../api";
import { LocaleProvider } from "../i18n";
import RoutingEditor from "./RoutingEditor";

// Keep the real DnD hooks, and assert that the advanced editors are descendants
// of the same provider as the board. Server rendering needs no DOM dependency.
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  const Boundary = createContext(false);
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) =>
      <Boundary.Provider value={true}><actual.DndContext {...props} /></Boundary.Provider>,
    useDraggable: (props: Parameters<typeof actual.useDraggable>[0]) => {
      if (!useContext(Boundary)) throw new Error("Draggable outside editor DndContext");
      return actual.useDraggable(props);
    },
    useDroppable: (props: Parameters<typeof actual.useDroppable>[0]) => {
      if (!useContext(Boundary)) throw new Error("Drop zone outside editor DndContext");
      return actual.useDroppable(props);
    },
  };
});

const config: ConfigurationPayload = {
  write_available: true, write_disabled_reason: null, strategy: "task_aware", baseline_source: "models.json",
  overlay: { applied: false, path: "routing-overrides.json", error: null }, config_hash: "hash",
  questions: { scale: { type: "choice", instructions: "Choose size", criteria: { small: "Small", large: "Large" } } },
  fallback: { label: "craft" },
  rules: [{ index: 0, when: { scale: "small" }, select: { label: "craft" } }],
  labels: [{ name: "craft", tag: "task_aware/craft", score: 0, reasoning_effort: null, description: "", resolution: "tag", models: ["p/a"] }],
  models: [{ id: "p/a", provider: "p", upstream_model: "a", priority: 1, baseline_priority: 1,
    tags: ["task_aware/craft"], baseline_tags: ["task_aware/craft"] }],
  warnings: [],
};
const renderEditor = (payload = config) => renderToStaticMarkup(<LocaleProvider><RoutingEditor config={payload} onError={() => undefined} onReloaded={async () => undefined} /></LocaleProvider>);

describe("full canvas editor structure", () => {
  it("keeps advanced drag handles and drop zones under the editor DnD provider", () => {
    const html = renderEditor();
    expect(html).toContain('class="chip-handle"');
    expect(html).toContain('class="rule-row"');
    expect(html).toContain('class="zone"');
  });
  it("starts with collapsed information and no selected-node highlight or inspector", () => {
    const html = renderEditor();
    expect(html).not.toMatch(/<details[^>]*\bopen(?:="")?/);
    expect(html).toContain('aria-expanded="false" aria-controls="routing-information"');
    expect(html).toContain('id="routing-information" class="workflow-info" hidden=""');
    expect(html).not.toContain('class="workflow-inspector"');
    expect(html).not.toContain('class="routing-canvas-node selected');
    expect(html.indexOf('class="canvas-frame"')).toBeLessThan(html.indexOf('class="canvas-tools"'));
    expect(html.indexOf('class="routing-canvas-scroll')).toBeLessThan(html.indexOf('class="canvas-help"'));
    expect(html.indexOf('class="workflow-info"')).toBeLessThan(html.indexOf("models.json"));
  });
  it("composes chrome, help, advanced controls and review actions in the same workspace", () => {
    const html = renderEditor();
    expect(html.startsWith('<section class="workflow-workspace">')).toBe(true);
    expect(html).not.toContain('class="panel"');
    const title = html.indexOf('class="workspace-chrome" data-canvas-occlusion="top"');
    const surface = html.indexOf('class="routing-canvas-scroll');
    const drawer = html.indexOf('class="workflow-drawer" data-canvas-occlusion="bottom"');
    const information = html.indexOf('id="routing-information"');
    const help = html.indexOf('class="canvas-help"');
    const nodes = html.indexOf('class="canvas-lists"');
    const rules = html.indexOf('class="rule-add"');
    const advanced = html.indexOf('class="rule-row"');
    const controls = html.indexOf('class="workflow-toolbar"');
    expect([title, surface, drawer, information, help, nodes, rules, advanced, controls].every((index) => index >= 0)).toBe(true);
    expect(title).toBeLessThan(surface);
    expect(surface).toBeLessThan(drawer);
    expect(drawer).toBeLessThan(information);
    expect(information).toBeLessThan(help);
    expect(help).toBeLessThan(nodes);
    expect(nodes).toBeLessThan(rules);
    expect(rules).toBeLessThan(advanced);
    expect(advanced).toBeLessThan(controls);
    expect(html.slice(controls)).toContain('Review changes');
    expect(html.slice(controls)).toContain('Cancel');
  });
  it("keeps errors in the top workspace overlay even with the drawer collapsed", () => {
    const html = renderToStaticMarkup(<LocaleProvider><RoutingEditor config={config} error="Failed to validate" onError={() => undefined} onReloaded={async () => undefined} /></LocaleProvider>);
    expect(html).toContain('role="alert">Failed to validate');
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('class="canvas-frame"'));
  });
  it("keeps write controls disabled while read-only navigation is available", () => {
    const html = renderEditor({ ...config, write_available: false });
    expect(html).toMatch(/aria-label="Add rule"[^>]*disabled=""/);
    expect(html).toMatch(/aria-label="Select nodes \(V\)" aria-pressed="true"/);
    expect(html).toMatch(/class="handle"[^>]*disabled=""/);
    expect(html).toContain('aria-label="Pan right"');
  });
});
