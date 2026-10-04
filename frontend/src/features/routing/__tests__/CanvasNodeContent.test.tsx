import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigurationPayload } from "@/shared/api/types";
import { LocaleProvider, hasMatchingMessageKeys, messages } from "@/shared/i18n";
import type { Locale } from "@/shared/i18n";
import CanvasNodeContent, { getCanvasNodeKind } from "../components/CanvasNodeContent";
import { draftFromConfiguration } from "../model/draft";
import type { RoutingDraft } from "../model/draft";

const config: ConfigurationPayload = {
  write_available: true, write_disabled_reason: null, strategy: "task_aware", baseline_source: "models.json",
  overlay: { applied: false, path: "routing-overrides.json", error: null }, config_hash: "hash",
  questions: { scale: { type: "choice", instructions: "Choose size", criteria: { small: "Small", large: "Large" } } },
  rules: [{ index: 0, when: { scale: "large" }, select: { label: "craft" } }],
  fallback: { label: "routine" },
  labels: [
    { name: "craft", tag: "task_aware/craft", score: 0, reasoning_effort: null, description: "", resolution: "tag", models: ["p/a"] },
    { name: "routine", tag: "task_aware/routine", score: 0, reasoning_effort: null, description: "", resolution: "models", models: ["p/a", "p/b"] },
  ],
  models: ["a", "b"].map((name) => ({
    id: `p/${name}`, provider: "p", upstream_model: name, priority: 1, baseline_priority: 1,
    tags: name === "a" ? ["task_aware/craft"] : [], baseline_tags: name === "a" ? ["task_aware/craft"] : [],
  })),
  warnings: [],
};

function renderNode(id: string, text: string, locale: Locale = "en", draft: RoutingDraft = draftFromConfiguration(config), payload = config) {
  vi.stubGlobal("window", { localStorage: { getItem: () => locale } });
  return renderToStaticMarkup(<LocaleProvider><CanvasNodeContent id={id} text={text} draft={draft} config={payload} /></LocaleProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("canvas node content", () => {
  it.each<Locale>(["en", "zh-CN"])("keeps empty tag identity and names its inherited default in %s", (locale) => {
    const payload = { ...config, defaults: { default_model: "p/b" }, models: config.models.map((model) => ({ ...model, tags: [] })) };
    const draft = draftFromConfiguration(payload);
    const before = JSON.stringify({ draft, payload });
    const html = renderNode("zone::task_aware/craft", "craft", locale, draft, payload);
    expect(html).toContain('title="craft">craft</span>');
    expect(html).toContain(locale === "en" ? "Default · inherited global model" : "默认 · 继承全局模型");
    expect(html).not.toContain(locale === "en" ? "1 model" : "1 个模型");
    expect(JSON.stringify({ draft, payload })).toBe(before);
    const cleared = renderNode("zone::task_aware/craft", "craft", locale, draft, { ...payload, defaults: { default_model: null } });
    expect(cleared).not.toContain(locale === "en" ? "Default · inherited global model" : "默认 · 继承全局模型");
  });
  it.each<Locale>(["en", "zh-CN"])("renders all six localized types with decorative library icons and current summaries in %s", (locale) => {
    const words = messages[locale];
    const cases = [
      ["questions", "questions", words.canvasNodeQuestions, words.canvasNodeQuestionCountOne.replace("{count}", "1")],
      ["rule-0", "rule", words.rule, "scale=large → craft"],
      ["fallback", "fallback", words.fallback, `${words.label}: routine`],
      ["zone::task_aware/craft", "label", words.canvasNodeLabelPool, words.canvasNodeModelCountOne.replace("{count}", "1")],
      ["model::p/a", "model", words.canvasNodeModel, `${words.provider}: p`],
      ["unexpected", "unknown", words.canvasNodeUnknown, words.canvasNodeUnavailable],
    ];
    const icons = new Set<string>();
    for (const [id, kind, name, summary] of cases) {
      const html = renderNode(id!, "Existing title", locale);
      expect(html).toContain(`data-node-kind="${kind}"`);
      expect(html).toContain(`>${name}</span>`);
      expect(html).toContain('text-sm font-semibold leading-4 text-ink" title="Existing title">Existing title</span>');
      expect(html).toContain(`text-[11px] leading-3 text-ink-muted" title="${summary}">${summary}</span>`);
      const svg = html.match(/<svg\b[^>]*>.*?<\/svg>/)![0];
      expect(svg).toContain('width="14" height="14"');
      expect(svg).toContain('stroke="currentColor" stroke-width="1.8"');
      expect(svg).toContain('aria-hidden="true" focusable="false"');
      expect(svg).not.toMatch(/<title|aria-label|tabindex/);
      expect(html).not.toMatch(/<(button|input|a|div)\b/);
      icons.add(svg.match(/class="lucide (lucide-[^ "]+)/)![1]!);
    }
    expect(icons.size).toBe(6);
    expect(hasMatchingMessageKeys(messages)).toBe(true);
  });

  it("uses unsaved question, condition, fallback and tag-membership edits without mutating inputs", () => {
    const draft = draftFromConfiguration(config);
    draft.questions.task = { type: "choice", instructions: "Choose task", criteria: { code: "Code", prose: "Prose" } };
    draft.rules[0] = { when: { scale: ["small", "large"], task: "code" }, select: { label: "routine" } };
    draft.fallback = { label: "craft" };
    draft.models["p/b"]!.tags.push("task_aware/craft");
    const before = JSON.stringify({ draft, config });

    expect(renderNode("questions", "Questions", "en", draft)).toContain('title="2 questions"');
    expect(renderNode("rule-0", "Rule 1", "en", draft)).toContain('title="scale=(small | large), task=code → routine"');
    expect(renderNode("fallback", "Fallback", "en", draft)).toContain('title="Label: craft"');
    expect(renderNode("zone::task_aware/craft", "craft", "en", draft)).toContain('title="2 models"');
    expect(JSON.stringify({ draft, config })).toBe(before);
  });

  it("counts explicit pools from their model list rather than draft tags", () => {
    const draft = draftFromConfiguration(config);
    draft.models["p/a"]!.tags = [];
    expect(renderNode("zone::task_aware/routine", "routine", "en", draft)).toContain('title="2 models"');
    expect(renderNode("zone::task_aware/craft", "craft", "en", draft)).toContain('title="0 models"');
    expect(renderNode("questions", "Questions", "en", { ...draft, questions: {} })).toContain('title="0 questions"');
  });

  it("keeps full long titles and summaries escaped in text and tooltip attributes", () => {
    const title = '<img src=x onerror="alert(1)"> & ' + "Long model name ".repeat(40);
    const encoded = title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const draft = draftFromConfiguration(config);
    draft.rules[0] = { when: { scale: "<script>bad()</script>" }, select: { label: 'craft & "routine"' } };
    const html = renderNode("rule-0", title, "en", draft);
    expect(html).toContain(`text-sm font-semibold leading-4 text-ink" title="${encoded}">${encoded}</span>`);
    expect(html).toContain('title="scale=&lt;script&gt;bad()&lt;/script&gt; → craft &amp; &quot;routine&quot;"');
    expect(html).not.toMatch(/<(img|script)\b/);
  });

  it.each(["", "unexpected", "rule--1", "rule-01", "rule-10000", "zone::", "model::", "model::p/a\n", "zone::bad\u0000tag"])("uses a neutral fallback for malformed node ID %j", (id) => {
    expect(getCanvasNodeKind(id)).toBe("unknown");
    const html = renderNode(id, "");
    expect(html).toContain('data-node-kind="unknown"');
    expect(html).toContain('text-sm font-semibold leading-4 text-ink" title="Node">Node</span>');
    expect(html).toContain("Details unavailable");
  });

  it.each(["rule-99", "zone::missing", "model::missing"])("shows unavailable details for a missing entity %s without inventing data", (id) => {
    const html = renderNode(id, "Missing", "zh-CN");
    expect(html).toContain('title="详情不可用"');
    expect(html).not.toContain("0 个模型");
  });

  it("handles empty conditions, missing destinations and missing providers", () => {
    const draft = draftFromConfiguration(config);
    draft.rules[0] = { when: {}, select: {} };
    draft.fallback = {};
    expect(renderNode("rule-0", "Rule 1", "en", draft)).toContain('title="No conditions → Label unavailable"');
    expect(renderNode("fallback", "Fallback", "en", draft)).toContain('title="Label unavailable"');
    const payload = { ...config, models: config.models.map((model) => ({ ...model, provider: "" })) };
    expect(renderNode("model::p/a", "p/a", "en", draft, payload)).toContain('title="Provider unavailable"');
  });

  it("recognizes Unicode pool and model IDs without treating their contents as markup", () => {
    expect(getCanvasNodeKind("zone::task_aware/代码")).toBe("label");
    expect(getCanvasNodeKind("model::供应商/模型")).toBe("model");
    expect(getCanvasNodeKind("rule-0")).toBe("rule");
    expect(getCanvasNodeKind("rule-9999")).toBe("rule");
  });
});
