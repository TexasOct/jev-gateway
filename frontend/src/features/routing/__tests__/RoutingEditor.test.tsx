import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigurationPayload } from "@/shared/api/types";
import { LocaleProvider, messages } from "@/shared/i18n";
import type { Locale } from "@/shared/i18n";
import RoutingEditor from "../RoutingEditor";
import { workflowConfiguration as configuration } from "../../../../tests/fixtures/configuration";

const config: ConfigurationPayload = {
  ...configuration,
  models: [...configuration.models, { id: "p/unselected", provider: "p", upstream_model: "unselected", priority: 0, baseline_priority: 0, tags: [], baseline_tags: [] }],
};
const renderEditor = (payload = config, error?: string) => renderToStaticMarkup(<LocaleProvider><RoutingEditor config={payload} error={error} onError={() => undefined} onReloaded={async () => undefined} /></LocaleProvider>);
const buttonMarkup = (html: string, name: string) => html.match(/<button\b[^>]*>.*?<\/button>/g)!.find((button) => button.includes(name))!;
afterEach(() => vi.unstubAllGlobals());

describe("named workflow presentation", () => {
  it.each<Locale>(["en", "zh-CN"])("keeps native strategy/model actions, geometry and tools in %s", (locale) => {
    vi.stubGlobal("window", { localStorage: { getItem: () => locale } });
    const words = messages[locale], html = renderEditor();
    expect(html).toContain('class="strategy-controls');
    expect(html).toContain(`>${words.strategy}<`);
    expect(html).toContain('value="balanced" selected=""');
    for (const name of [words.workflowCreate, words.workflowDelete, words.workflowAddModel, words.reviewChanges, words.discardChanges, words.resetBaseline]) expect(html).toContain(name);
    for (const name of [words.canvasSelectTool, words.canvasPanTool, words.canvasAddNode, words.canvasZoomOut, words.canvasZoomIn, words.canvasLayoutTools]) {
      const button = html.match(/<button\b[^>]*>.*?<\/button>/g)!.find((item) => item.includes(`aria-label="${name}"`))!;
      expect(button).toBeDefined();
      expect(button).toContain('aria-hidden="true" focusable="false"');
      expect(button).toContain('stroke="currentColor"');
    }
    expect(html).toContain('data-canvas-node="model::fixture-provider/fixture-model"');
    expect(html).not.toContain('data-canvas-node="model::p/unselected"');
    expect(html).toContain('width:190px');
    expect(html).toContain('h-[56px]');
    expect(html).toContain('height:28px');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="' + words.canvasZoomReset + '"');
    expect(html).toContain('>1:1</button>');
  });
  it("groups policy actions at the top left and separates canvas tools at the bottom center", () => {
    const html = renderEditor();
    for (const marker of ["workflow-info", "workflow-drawer", "workspace-heading", "workspace-status", "routing-information", "Canvas help", "Advanced editors", "fixture</code>"]) expect(html).not.toContain(marker);
    expect(html).not.toContain('class="workflow-inspector');
    const chrome = html.indexOf('class="workspace-chrome absolute left-3 right-3 top-3');
    const policy = html.indexOf('class="canvas-policy-controls');
    const actions = html.indexOf('class="workflow-toolbar');
    const panel = html.indexOf('class="canvas-tools');
    const tools = html.indexOf('class="canvas-tool-buttons');
    expect(chrome).toBeGreaterThan(0); expect(policy).toBeGreaterThan(chrome);
    expect(actions).toBeGreaterThan(policy); expect(panel).toBeGreaterThan(actions); expect(tools).toBeGreaterThan(panel);
    expect(html).toContain('data-canvas-occlusion="bottom"');
    expect(html).toContain('data-policy-draft="unchanged"');
    expect(buttonMarkup(html, messages.en.reviewChanges)).toContain('disabled=""');
  });
  it("explicit empty selection mounts no model node while preserving the chooser library", () => {
    const html = renderEditor({ ...config, selected_models: [] });
    expect(html).not.toContain('data-canvas-node="model::');
    expect(html).toContain("Add model");
    expect(config.models).toHaveLength(2);
  });
  it("retains visible errors and read-only native navigation with disabled mutations", () => {
    const html = renderEditor({ ...config, write_available: false }, "Failed to validate");
    expect(html).toContain('role="alert">Failed to validate');
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('class="canvas-frame'));
    expect(html).toMatch(/aria-label="Add node"[^>]*disabled=""/);
    expect(buttonMarkup(html, messages.en.workflowCreate)).toContain('disabled=""');
    expect(html).toContain('aria-label="Pan canvas (H)"');
    expect(html).toMatch(/aria-label="Layout tools"[^>]*disabled=""/);
    expect(html).toContain('aria-label="Select nodes (V)" aria-pressed="true"');
  });
  it.each(["uneditable", "missing-definition"])("disables semantic model selection for %s while leaving strategy creation under its owner", (state) => {
    const payload = structuredClone(config);
    if (state === "uneditable") payload.editable = false;
    else delete payload.definition;
    expect(payload.write_available).toBe(true);
    const html = renderEditor(payload);
    expect(buttonMarkup(html, messages.en.workflowAddModel)).toContain('disabled=""');
    expect(buttonMarkup(html, messages.en.workflowCreate)).not.toContain('disabled=""');
    expect(html).toContain('data-policy-draft="unchanged"');
    expect(html).toContain('data-canvas-edge=');
  });
});
