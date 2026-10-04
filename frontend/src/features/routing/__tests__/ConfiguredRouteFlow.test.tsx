import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConfigurationPayload, LabelRow, ModelRow } from "@/shared/api/types";
import { diffSummary, draftFromConfiguration, setLabelMembership, toOverlayPayload, workflowEdges } from "../model/draft";
import { classifyConnection, compatibleTargets, disconnectPoolEdge, reconnectEdge } from "../model/canvas";
import { projectConfiguredRouteFlow } from "../model/configured-route-flow";
import ConfiguredRouteFlow from "../ConfiguredRouteFlow";

const label = (name: string, tag: string, resolution: LabelRow["resolution"] = "tag", models: string[] = []): LabelRow => ({
  name, tag, resolution, models, score: 0, reasoning_effort: null, description: "",
});
const model = (id: string, tags: string[]): ModelRow => ({
  id, provider: "p", upstream_model: id, priority: 1, baseline_priority: 1, tags, baseline_tags: [...tags],
});
function configuration(): ConfigurationPayload {
  return {
    write_available: true, write_disabled_reason: null, strategy: "route", baseline_source: "fixture",
    overlay: { applied: false, path: "fixture", error: null }, config_hash: "fixture",
    questions: { intent: { type: "choice", instructions: "Which intent?", criteria: { write: "Writing", code: "Coding" } } },
    rules: [
      { index: 0, when: { intent: "write" }, select: { label: "writing" } },
      { index: 1, when: { intent: ["code", "write"] }, select: { label: "coding" } },
    ],
    fallback: { label: "writing" },
    labels: [label("writing", "route/writing"), label("coding", "route/coding", "models", ["p/static"])],
    models: [model("p/writer", ["route/writing"]), model("p/static", []), model("p/other", [])],
    warnings: [],
  };
}

describe("configured policy projection", () => {
  it("traces selection-only rules and empty fallback through the implicit first label without materializing choices", () => {
    const config = configuration();
    config.defaults = { default_model: "p/other" };
    config.labels = [label("missing", "route/missing")];
    config.rules = [{ index: 0, when: { intent: "code" }, select: { selection: "quality_first" } }];
    config.fallback = {};
    const draft = draftFromConfiguration(config);
    const original = JSON.stringify({ draft, config });
    const view = projectConfiguredRouteFlow(draft, config);
    for (const branch of view.branches) {
      expect(branch).toMatchObject({ label: "missing", poolId: "zone::route/missing", models: ["p/other"], defaulted: true });
      expect(branch.path.map((edge) => edge.kind)).toContain(branch.kind === "default" ? "unmatched" : "match");
      expect(branch.path.map((edge) => edge.kind)).toContain("default");
    }
    expect(view.branches[0]?.selection).toBe("quality_first");
    expect(view.changed).toBe(false);
    const payload = toOverlayPayload(draft, config);
    expect(payload.rules[0]?.select).toEqual({ selection: "quality_first" });
    expect(payload.fallback).toEqual({});
    expect(payload.models).toEqual({});
    expect(payload).not.toHaveProperty("defaults");
    expect(JSON.stringify({ draft, config })).toBe(original);
    const cleared = projectConfiguredRouteFlow(draft, { ...config, defaults: { default_model: null } });
    for (const branch of cleared.branches) expect(branch).toMatchObject({ label: "missing", models: [], defaulted: false, incomplete: true });
  });

  it("keeps the legacy tier alias in read-only match and branch resolution", () => {
    const config = configuration();
    const legacyChoice = { tier: "coding", selection: "balanced" as const };
    config.rules = [{ index: 0, when: { intent: "code" }, select: legacyChoice }];
    const draft = draftFromConfiguration(config);
    expect(projectConfiguredRouteFlow(draft, config).branches[0]).toMatchObject({ label: "coding", models: ["p/static"], poolId: "zone::route/coding" });
    expect(toOverlayPayload(draft, config).rules[0]?.select).toEqual(legacyChoice);
    expect(diffSummary(draft, config).changed).toBe(false);
  });

  it("inherits an untagged global model only through a read-only default edge without dirtying or persisting membership", () => {
    const config = configuration();
    config.defaults = { default_model: "p/other" };
    config.labels = [label("default", "route/default"), label("missing", "route/missing")];
    config.models[0]!.tags = ["route/default"];
    config.models[0]!.baseline_tags = ["route/default"];
    config.rules = [{ index: 0, when: { intent: "code" }, select: { label: "missing" } }];
    config.fallback = { label: "default" };
    const draft = draftFromConfiguration(config);
    const before = JSON.stringify({ draft, config });
    const view = projectConfiguredRouteFlow(draft, config);
    expect(view.branches[0]).toMatchObject({ label: "missing", models: ["p/other"], defaulted: true, incomplete: false });
    expect(view.branches[1]).toMatchObject({ label: "default", models: ["p/writer"], defaulted: false });
    const edge = workflowEdges(draft, config).find((entry) => entry.kind === "default")!;
    expect(edge).toEqual({ from: "zone::route/missing", to: "model::p/other", kind: "default" });
    expect(view.branches[0]?.path).toContainEqual(edge);
    expect(classifyConnection(draft, config, { kind: "remove", edge }, edge.to)).toEqual({ operation: null, reason: "fixed" });
    expect(reconnectEdge(draft, config, edge, "model::p/writer")).toBeNull();
    expect(disconnectPoolEdge(draft, config, edge)).toBeNull();
    expect(compatibleTargets(draft, config, edge)).toEqual([]);
    expect(diffSummary(draft, config).changed).toBe(false);
    const saved = toOverlayPayload(draft, config);
    expect(saved.models).toEqual({});
    expect(saved).not.toHaveProperty("defaults");
    const reloaded = draftFromConfiguration({ ...config, rules: saved.rules.map((rule, index) => ({ ...rule, index })) });
    expect(reloaded.models["p/other"]?.tags).toEqual([]);
    expect(JSON.stringify({ draft, config })).toBe(before);
    const cleared = { ...config, defaults: { default_model: null } };
    expect(workflowEdges(draft, cleared).some((entry) => entry.kind === "default")).toBe(false);
    expect(projectConfiguredRouteFlow(draft, cleared).branches[0]).toMatchObject({ models: [], defaulted: false, incomplete: true });
    const assigned = setLabelMembership(draft, "p/static", "route/missing", true);
    expect(projectConfiguredRouteFlow(assigned, config).branches[0]).toMatchObject({ models: ["p/static"], defaulted: false });
  });
  it("keeps first-match order, unmatched chain, fallback and OR conditions", () => {
    const config = configuration();
    const view = projectConfiguredRouteFlow(draftFromConfiguration(config), config);
    expect(view.branches.map(({ id }) => id)).toEqual(["rule-0", "rule-1", "default", "fallback"]);
    expect(view.branches[1]?.conditions).toEqual([{ question: "intent", values: ["code", "write"] }]);
    expect(view.branches[1]?.path.map(({ kind, to }) => [kind, to])).toEqual([
      ["context", "rule-0"], ["unmatched", "rule-1"], ["match", "zone::route/coding"],
    ]);
    expect(view.branches[2]?.path.map(({ kind, to }) => [kind, to])).toEqual([
      ["context", "rule-0"], ["unmatched", "rule-1"], ["unmatched", "zone::route/writing"],
    ]);
    expect(view.branches[3]?.path.map(({ kind, to }) => [kind, to])).toEqual([["failure", "fallback"], ["match", "zone::route/writing"]]);
    expect(view.branches[1]?.models).toEqual(["p/static"]);
    expect(view.branches[0]?.models).toEqual(["p/writer"]);
    expect(view.questions[0]?.criteria).toEqual([{ name: "write", description: "Writing" }, { name: "code", description: "Coding" }]);
  });

  it("projects draft tag changes while explicit pools stay fixed; never creates metrics or dispatch paths", () => {
    const config = configuration();
    const draft = setLabelMembership(draftFromConfiguration(config), "p/other", "route/writing", true);
    const view = projectConfiguredRouteFlow(draft, config);
    expect(view.changed).toBe(true);
    expect(view.branches[0]?.models).toEqual(["p/writer", "p/other"]);
    expect(view.branches[1]?.models).toEqual(["p/static"]);
    expect(view.branches[0]?.path.every((edge) => edge.kind !== "pool")).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/probability|traffic|health|count|status|attempt|dispatch/);
  });

  it("keeps unmatched default selection independent of the configured failure fallback", () => {
    const config = { ...configuration(), fallback: { label: "coding", selection: "quality_first" } };
    const view = projectConfiguredRouteFlow(draftFromConfiguration(config), config);
    const inherited = view.branches.find((branch) => branch.kind === "default")!;
    const failure = view.branches.find((branch) => branch.kind === "failure")!;
    expect(inherited.label).toBe("writing");
    expect(inherited.selection).toBeNull();
    expect(inherited.path.at(-1)).toEqual({ from: "rule-1", to: "zone::route/writing", kind: "unmatched" });
    expect(failure.label).toBe("coding");
    expect(failure.selection).toBe("quality_first");
    expect(failure.path).toEqual([{ from: "questions", to: "fallback", kind: "failure" }, { from: "fallback", to: "zone::route/coding", kind: "match" }]);
  });

  it("separates the direct default and failure fallback paths with no rules", () => {
    const config = { ...configuration(), rules: [] };
    const view = projectConfiguredRouteFlow(draftFromConfiguration(config), config);
    expect(view.branches.map((branch) => branch.id)).toEqual(["default", "fallback"]);
    expect(view.branches[0]?.path.map((edge) => edge.kind)).toEqual(["context"]);
    expect(view.branches[1]?.path.map((edge) => edge.kind)).toEqual(["failure", "match"]);
    expect(view.edges[0]?.to).toBe("zone::route/writing");
  });
});

describe("configured route explanation markup", () => {
  it.each(["rule-0", "default", "fallback"])("highlights only the selected branch's inherited wire when all share a pool (%s)", (selected) => {
    const config = configuration();
    config.defaults = { default_model: "p/other" };
    config.labels = [label("missing", "route/missing")];
    config.rules = [{ index: 0, when: { intent: "code" }, select: { selection: "quality_first" } }];
    config.fallback = {};
    const html = renderToStaticMarkup(<ConfiguredRouteFlow draft={draftFromConfiguration(config)} config={config} locale="en" reducedMotion initialSelectedBranchId={selected} />);
    const inherited = [...html.matchAll(/<path[^>]*data-flow-kind="default"[^>]*>/g)].map(([path]) => path);
    expect(inherited).toHaveLength(3);
    expect(inherited.filter((path) => path.includes('data-flow-state="active"'))).toHaveLength(1);
    expect(inherited.filter((path) => path.includes('data-flow-state="idle"'))).toHaveLength(2);
  });

  it.each(["en", "zh-CN"] as const)("shows final inherited default and matched rule evidence in %s", (locale) => {
    const config = configuration();
    config.defaults = { default_model: "p/other" };
    config.labels = [label("default", "route/default"), label("missing", "route/missing")];
    config.rules = [{ index: 0, when: { intent: "code" }, select: { label: "missing" } }];
    config.fallback = { label: "default" };
    config.models[0]!.tags = ["route/default"];
    const draft = draftFromConfiguration(config);
    const render = (payload: ConfigurationPayload) => renderToStaticMarkup(<ConfiguredRouteFlow draft={draft} config={payload} locale={locale} reducedMotion initialSelectedBranchId="rule-0" />);
    const html = render(config);
    expect(html).toContain(locale === "en" ? "Default · inherited global model" : "默认 · 继承全局模型");
    expect(html).toContain(locale === "en" ? "not a pool member" : "不是模型池成员");
    expect(html).toContain("missing");
    expect(html).toContain(">default</p>");
    expect(html).toContain("p/other");
    expect(html).toContain('data-flow-kind="default"');
    const cleared = render({ ...config, defaults: { default_model: null } });
    expect(cleared).not.toContain("p/other");
    expect(cleared).not.toContain('data-flow-kind="default"');
    expect(cleared).toContain(locale === "en" ? "Settings" : "通用设置");
  });
  it("renders the whole selected path and text without animation for reduced motion", () => {
    const config = configuration();
    const html = renderToStaticMarkup(<ConfiguredRouteFlow draft={draftFromConfiguration(config)} config={config} locale="en" reducedMotion initialSelectedBranchId="default" />);
    expect(html).toContain("No rule matches, so the first policy label is selected");
    expect(html).toContain("Earlier rules do not match");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toMatch(/stroke-primary stroke-\[2\.5\]/);
    expect(html).not.toContain("animate-[configured-route-trace_");
    expect(html).toMatch(/stroke-outline stroke-\[1\.5\]/);
    expect(html).toContain("does not imply simultaneous requests");
    expect(html).not.toMatch(/rate limited|requests per second|provider health|probability/i);
  });

  it("labels changed drafts in Chinese and traces only when motion is permitted", () => {
    const config = configuration();
    const draft = setLabelMembership(draftFromConfiguration(config), "p/other", "route/writing", true);
    const html = renderToStaticMarkup(<ConfiguredRouteFlow draft={draft} config={config} locale="zh-CN" reducedMotion={false} initialSelectedBranchId="rule-0" />);
    expect(html).toContain("策略草稿预览");
    expect(html).toContain("animate-[configured-route-trace_900ms_ease-out_1_both]");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain("不表示同时请求");
  });
  it("shows one direct context path and no unmatched path when there are no rules", () => {
    const config = { ...configuration(), rules: [] };
    const html = renderToStaticMarkup(<ConfiguredRouteFlow draft={draftFromConfiguration(config)} config={config} locale="en" reducedMotion initialSelectedBranchId="default" />);
    expect(html.match(/data-flow-kind="context"/g)).toHaveLength(1);
    expect(html).not.toContain('data-flow-kind="unmatched"');
    expect(html).toContain("Valid answers use the first policy label when no rules are configured.");
  });
});
