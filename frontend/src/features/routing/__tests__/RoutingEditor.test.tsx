import { createContext, useContext } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigurationPayload } from "@/shared/api/types";
import { LocaleProvider, messages } from "@/shared/i18n";
import type { Locale } from "@/shared/i18n";
import RoutingEditor from "../RoutingEditor";

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

afterEach(() => vi.unstubAllGlobals());

describe("full canvas editor structure", () => {
  it.each<Locale>(["en", "zh-CN"])("identifies the actual strategy and source with localized policy status in %s", (locale) => {
    vi.stubGlobal("window", { localStorage: { getItem: () => locale } });
    const html = renderEditor();
    const header = html.match(/<header class="workspace-heading[\s\S]*?<\/header>/)![0];
    expect(header).toContain(">task_aware</h2>");
    expect(header).toContain("models.json");
    expect(header).toContain(messages[locale].ruleOrderFirstMatch);
    expect(header).toContain(messages[locale].noPendingChanges);
    expect(header).toContain(messages[locale].noOverlay);
    expect(header).toContain('data-policy-draft="unchanged"');
  });
  it.each<Locale>(["en", "zh-CN"])("keeps localized icon control names, state and DnD attributes in %s", (locale) => {
    vi.stubGlobal("window", { localStorage: { getItem: () => locale } });
    const words = messages[locale];
    const buttons = renderEditor().match(/<button\b[^>]*>.*?<\/button>/g)!;
    const named = (name: string) => buttons.find((button) => button.includes(`aria-label="${name}"`))!;
    const grip = words.reorderRule.replace("{index}", "1").replace("{total}", "1");
    const earlier = words.moveRuleEarlier.replace("{index}", "1");
    const later = words.moveRuleLater.replace("{index}", "1");
    for (const name of [words.canvasSelectTool, words.canvasPanTool, words.canvasAddNode, words.canvasZoomOut, words.canvasZoomIn,
      words.canvasLayoutTools, grip, earlier, later]) {
      const button = named(name);
      expect(button).toBeDefined();
      const svg = button.match(/<svg\b[^>]*>.*?<\/svg>/)![0];
      expect(svg).toContain('class="lucide ');
      expect(svg).toContain('aria-hidden="true" focusable="false"');
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).not.toMatch(/<title|aria-label|tabindex/);
    }
    for (const name of [words.canvasPanLeft, words.canvasPanRight, words.canvasPanUp, words.canvasPanDown]) expect(named(name)).toBeUndefined();
    expect(named(words.canvasLayoutTools)).toContain('aria-haspopup="menu"');
    expect(named(words.canvasLayoutTools)).toContain('aria-expanded="false"');
    expect(buttons.some((button) => button.endsWith(`>${words.canvasArrangeAll}</button>`))).toBe(false);
    expect(named(words.canvasSelectTool)).toContain('aria-pressed="true"');
    expect(named(words.canvasPanTool)).toContain('aria-pressed="false"');
    expect(named(grip)).toContain('aria-roledescription="sortable"');
    expect(named(grip)).toContain('tabindex="0"');
    expect(named(earlier)).toContain('disabled=""');
    expect(named(later)).toContain('disabled=""');
    const disclosure = buttons.find((button) => button.includes('aria-controls="routing-information"'))!;
    expect(disclosure).toContain('aria-expanded="false"');
    expect(disclosure).toContain(words.canvasInformation);
    expect(disclosure).toContain('lucide-chevron-up');
    expect(disclosure).toContain('aria-hidden="true" focusable="false"');
    expect(named(words.canvasZoomReset)).toContain('>1:1</button>');
    expect(buttons.some((button) => button.endsWith(`>${words.canvasZoomFit}</button>`))).toBe(true);
  });
  it("keeps advanced drag handles and drop zones under the editor DnD provider", () => {
    const html = renderEditor();
    expect(html).toContain('class="w-full rounded-md border-0 bg-transparent p-0 text-left font-semibold text-ink focus-visible:outline-2 focus-visible:outline-primary"');
    expect(html).toContain('md:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto]');
    expect(html).toContain('min-h-18 rounded-xl border border-dashed p-3');
  });
  it("starts with collapsed information and no selected-node highlight or inspector", () => {
    const html = renderEditor();
    expect(html).not.toMatch(/<details[^>]*\bopen(?:="")?/);
    expect(html).toContain('aria-expanded="false" aria-controls="routing-information"');
    expect(html).toMatch(/id="routing-information"[^>]* hidden=""/);
    expect(html).not.toContain('class="workflow-inspector absolute');
    expect(html).not.toMatch(/class="routing-canvas-node[^"]* selected/);
    expect(html.indexOf('class="canvas-frame absolute')).toBeLessThan(html.indexOf('class="canvas-tools absolute'));
    expect(html.indexOf('class="routing-canvas-scroll')).toBeLessThan(html.indexOf('Canvas help'));
    expect(html.slice(html.indexOf('id="routing-information"'))).toContain("models.json");
  });
  it("composes chrome, help, advanced controls and review actions in the same workspace", () => {
    const html = renderEditor();
    expect(html.startsWith('<section class="workflow-workspace relative flex-1 isolate min-w-0 min-h-0 overflow-hidden"')).toBe(true);
    expect(html).not.toContain('class="panel"');
    const title = html.indexOf('class="workspace-chrome absolute left-3 right-3 top-3 z-[9]');
    const surface = html.indexOf('class="routing-canvas-scroll');
    const drawer = html.indexOf('class="workflow-drawer absolute bottom-0');
    const information = html.indexOf('id="routing-information"');
    const help = html.indexOf('Canvas help');
    const nodes = html.indexOf('Canvas nodes');
    const rules = html.indexOf('class="rule-add grid');
    const advanced = html.indexOf('md:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto]');
    const controls = html.indexOf('class="workflow-toolbar flex flex-wrap items-center gap-2 border-outline bg-panel p-2 max-[900px]');
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
  it("exposes separate policy and layout guidance without hiding the existing edit paths", () => {
    const html = renderEditor();
    expect(html).toContain('data-policy-draft="unchanged"');
    expect(html).toContain('class="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted"');
    expect(html).toContain('Review changes: No pending changes.');
    expect(html).toContain('Layout only: routing stays unchanged');
    expect(html).toContain('Routing workflow nodes');
    expect(html.indexOf('Routing workflow nodes')).toBeLessThan(html.indexOf('class="rule-add grid'));
    for (const name of ['Questions', 'Rule 1', 'Decision failure fallback', 'craft']) expect(html).toContain(name);
    expect(html).toContain('Question name');
    expect(html).toContain('Label membership');
    expect(html).toContain('Connections (first match order)');
    expect(html).toContain('aria-label="Routing workflow nodes"');
    expect(html).toContain('>Connections (first match order)</summary>');
    expect(html).toContain('[stroke-dasharray:4_4]');
    expect(html).toContain('>Edit rule</button>');
    expect(html).toContain('>Edit questions</button>');
    expect(html).toContain('>Edit fallback</button>');
    expect(html).toContain('>Edit model pool: craft</button>');
    expect(html).toContain('class="canvas-context-actions flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-outline bg-panel px-3 py-2 text-sm text-ink shadow-[0_5px_16px_color-mix(in_srgb,var(--text)_10%,transparent)]" role="status">');
    expect(html).toContain('disabled="">Review changes</button>');
  });
  it("keeps errors in the top workspace overlay even with the drawer collapsed", () => {
    const html = renderToStaticMarkup(<LocaleProvider><RoutingEditor config={config} error="Failed to validate" onError={() => undefined} onReloaded={async () => undefined} /></LocaleProvider>);
    expect(html).toContain('role="alert">Failed to validate');
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('class="canvas-frame absolute inset-0 min-w-0"'));
  });
  it("keeps write controls disabled while read-only navigation is available", () => {
    const html = renderEditor({ ...config, write_available: false });
    expect(html).toMatch(/aria-label="Add node"[^>]*disabled=""/);
    expect(html).toMatch(/aria-label="Select nodes \(V\)" aria-pressed="true"/);
    expect(html).toMatch(/class="cursor-grab[^"]*"[^>]*disabled=""/);
    expect(html).toContain('aria-label="Pan canvas (H)"');
    expect(html).toMatch(/aria-label="Layout tools"[^>]*disabled=""/);
  });
});
