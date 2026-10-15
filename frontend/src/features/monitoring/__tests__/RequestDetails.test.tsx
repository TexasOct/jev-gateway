import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/shared/i18n";
import type { RetainedRequest } from "@/shared/api/types";
import { RequestDetails } from "../components/RequestDetails";
import { inspectorRequest } from "../../../../tests/fixtures/routing-inspector";

afterEach(() => vi.unstubAllGlobals());
function render(item: RetainedRequest, locale = "en") {
  vi.stubGlobal("window", { localStorage: { getItem: () => locale }, matchMedia: () => ({ matches: false }) });
  return renderToStaticMarkup(<LocaleProvider><RequestDetails item={item} /></LocaleProvider>);
}
it.each(["en", "zh-CN"])("keeps classifier failure independent from successful replies in %s", locale => {
  const item = inspectorRequest();
  const html = render(item, locale);
  expect(html).toContain(locale === "en" ? "Classification disabled" : "分类已关闭");
  expect(html).toContain(locale === "en" ? "Recorded result: Succeeded" : "留存结果: 成功");
  expect(html).toContain(locale === "en" ? "Configuration at recording time" : "记录时的配置");
  expect(html).toContain("synthetic-recorded-config");
});
it("shows accepted answers and the recorded matching rule without using today's configuration", () => {
  const item = inspectorRequest();
  item.decision!.routing_evidence!.classification = { status: "accepted", provider_id: "judge", answers: { workload: { choice: "docs" } }, attempts: [{ provider_id: "judge", status: "accepted", http_status: 200, elapsed_ms: 10 }] };
  item.decision!.routing_evidence!.rule_status = "matched";
  item.decision!.routing_evidence!.matched_rule_index = 7;
  item.decision!.routing_evidence!.pool!.label = "draft";
  const html = render(item);
  expect(html).toContain("Accepted classification matched rule 7");
  expect(html).toContain("Documentation");
  expect(html).toContain("workload = docs");
  expect(html).toContain("cheapest_adequate");
  expect(html).toContain("HTTP 200");
});
it.each(["accepted_unmatched", "manual", "session_reuse"] as const)("keeps the %s path distinct", path => {
  const item = inspectorRequest();
  item.decision!.routing_evidence!.rule_status = path;
  const html = render(item);
  expect(html).toContain(path === "accepted_unmatched" ? "strategy default branch" : path === "manual" ? "selected a model manually" : "Reused the session model");
});
it("separates a populated literal default label, the global model default and missing legacy evidence", () => {
  const item = inspectorRequest();
  item.decision!["label"] = "default";
  item.decision!["defaulted"] = false;
  expect(render(item)).toContain("Literal label: default");
  item.decision!["defaulted"] = true;
  expect(render(item)).toContain("Global default model");
  item.decision = { label: "default" };
  item.outcome = null;
  const html = render(item);
  expect(html).toContain("Routing evidence is incomplete");
  expect(html).toContain("Outcome unknown");
  expect(html).not.toContain("0 ms");
  expect(html).not.toContain("Pending");
  expect(html).toContain("Current configuration is not used");
});
it("does not render retained message bodies when capture is explicitly off", () => {
  const item = inspectorRequest();
  item.request["content_captured"] = false;
  const html = render(item);
  const context = html.slice(html.indexOf('class="context-snapshot'), html.indexOf("Illustrative playback"));
  expect(context).toContain("Content not captured");
  expect(context).not.toContain("Synthetic selected snapshot");
});

it.each([{}, { rule_status: "classifier_fallback" as const }, { classification: { status: "accepted" as const } }])("keeps partially projected legacy evidence safe and unknown", evidence => {
  const item = inspectorRequest();
  item.decision!.routing_evidence = evidence;
  if (item.decision!.config_context?.status === "available") item.decision!.config_context.decision_enabled = null;
  const html = render(item);
  expect(html).toContain("Not recorded / unknown");
  expect(html).not.toContain("The strategy policy selected the model");
  expect(html).toContain("Classification enabled at recording: Not recorded / unknown");
});

it("keeps actual eligible candidates available when the configuration snapshot is missing", () => {
  const item = inspectorRequest();
  item.decision!.config_context = { status: "unavailable", config_hash: "lost" };
  const html = render(item);
  expect(html).toContain("Eligible candidates · 1");
  expect(html).toContain("<li>openai/gpt-6-luna</li>");
  expect(html).toContain("The recorded configuration is unavailable");
});
