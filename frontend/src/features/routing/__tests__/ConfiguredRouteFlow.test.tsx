import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConfigurationPayload, LabelRow, ModelRow } from "@/shared/api/types";
import { draftFromConfiguration, setLabelMembership } from "../model/draft";
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
  it("keeps first-match order, unmatched chain, fallback and OR conditions", () => {
    const config = configuration();
    const view = projectConfiguredRouteFlow(draftFromConfiguration(config), config);
    expect(view.branches.map(({ id }) => id)).toEqual(["rule-0", "rule-1", "fallback"]);
    expect(view.branches[1]?.conditions).toEqual([{ question: "intent", values: ["code", "write"] }]);
    expect(view.branches[1]?.path.map(({ kind, to }) => [kind, to])).toEqual([
      ["context", "rule-0"], ["unmatched", "rule-1"], ["match", "zone::route/coding"],
    ]);
    expect(view.branches[2]?.path.map(({ kind, to }) => [kind, to])).toEqual([
      ["context", "rule-0"], ["unmatched", "rule-1"], ["unmatched", "fallback"], ["match", "zone::route/writing"],
    ]);
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

  it("takes the direct fallback path with no rules", () => {
    const config = { ...configuration(), rules: [] };
    const view = projectConfiguredRouteFlow(draftFromConfiguration(config), config);
    expect(view.branches.map((branch) => branch.id)).toEqual(["fallback"]);
    expect(view.branches[0]?.path.map((edge) => edge.kind)).toEqual(["context", "match"]);
    expect(view.edges[0]?.to).toBe("fallback");
  });
});

describe("configured route explanation markup", () => {
  it("renders the whole selected path and text without animation for reduced motion", () => {
    const config = configuration();
    const html = renderToStaticMarkup(<ConfiguredRouteFlow draft={draftFromConfiguration(config)} config={config} locale="en" reducedMotion initialSelectedBranchId="fallback" />);
    expect(html).toContain("No rule matches, so fallback selects the label pool");
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
});
