import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RetainedRequest } from "@/shared/api/types";
import { LocaleProvider, messages } from "@/shared/i18n";
import type { Locale } from "@/shared/i18n";
import { RouteTrace } from "../components/RouteTrace";
import { adjacentEvidenceLinks } from "../model/route-trace";

const successRequest: RetainedRequest = {
  request: {
    request_id: "synthetic-1",
    received_at: 1_000,
    endpoint: "/v1/chat/completions",
    prompt: "private sample prompt that must never appear in the route summary",
    content_captured: true,
  },
  decision: {
    strategy: "task_aware",
    label: "balanced",
    provider: "openai",
    upstream_model: "gpt-4.1",
    candidates: ["candidate details stay in the record"],
  },
  upstream_request: {
    provider: "openai",
    model: "openai/gpt-4.1",
    payload: { messages: [{ content: "private upstream payload" }] },
  },
  outcome: { ok: true, latency_ms: 27, prompt_tokens: 2 },
};

function renderTrace(item: RetainedRequest | null, locale: Locale = "en"): string {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    localStorage: { getItem: () => locale, setItem: vi.fn() },
  });
  return renderToStaticMarkup(<LocaleProvider><RouteTrace item={item} /></LocaleProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("monitoring route trace", () => {
  it.each<Locale>(["en", "zh-CN"])("labels all four evidence stages in %s", (locale) => {
    const html = renderTrace(successRequest, locale);
    const copy = messages[locale];
    for (const label of [copy.traceRequest, copy.traceDecision, copy.traceUpstream, copy.traceOutcome]) {
      expect(html).toContain(label);
    }
  });

  it("derives success and visible summaries from recorded fields only", () => {
    const html = renderTrace(successRequest);
    expect(html).toContain('data-outcome="success"');
    expect(html).toContain("/v1/chat/completions");
    expect(html).toContain("task_aware · balanced · openai/gpt-4.1");
    expect(html).toContain("openai · openai/gpt-4.1");
    expect(html).not.toContain("private sample prompt");
    expect(html).not.toContain("private upstream payload");
    expect(html).not.toContain("candidate details");
  });

  it("marks each absent field as disconnected and does not invent an in-progress outcome", () => {
    const item: RetainedRequest = {
      request: successRequest.request,
      decision: null,
      upstream_request: null,
      outcome: null,
    };
    const html = renderTrace(item);
    expect(html).toContain('data-outcome="unknown"');
    expect((html.match(/data-presence="missing"/g) ?? []).length).toBe(3);
    expect(adjacentEvidenceLinks([true, false, false, false])).toEqual([false, false, false]);
    expect(adjacentEvidenceLinks([true, true, false, false])).toEqual([true, false, false]);
    expect(adjacentEvidenceLinks([true, false, true, true])).toEqual([false, false, true]);
    expect(html).not.toContain("in progress");
    expect(html).not.toContain("Pending");
  });

  it("renders explicit failure from outcome.ok=false", () => {
    const item: RetainedRequest = {
      ...successRequest,
      outcome: { ok: false, error_type: "synthetic_failure" },
    };
    const html = renderTrace(item);
    expect(html).toContain('data-outcome="failure"');
    expect(html).toContain("Recorded failure · synthetic_failure");
  });

  it("keeps a missing outcome unknown even when the upstream request exists", () => {
    const item: RetainedRequest = { ...successRequest, outcome: null };
    const html = renderTrace(item);
    expect(html).toContain('data-outcome="unknown"');
    expect(html).not.toContain('data-outcome="success"');
    expect(html).not.toContain('data-outcome="failure"');
  });

  it("keeps the empty state explicit without presenting a running request", () => {
    const html = renderTrace(null, "zh-CN");
    expect(html).toContain(messages["zh-CN"].traceChooseRequest);
    expect(html).toContain(messages["zh-CN"].traceUnknown);
    expect(html).not.toContain("Pending");
  });

  it("provides keyboard-accessible playback controls and a polite status region", () => {
    const html = renderTrace(successRequest);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(`>${messages.en.traceReplay}</button>`);
    expect(html).toContain(`>${messages.en.tracePause}</button>`);
    expect(html).toContain(`>${messages.en.traceReset}</button>`);
    expect(html).toMatch(/<summary[^>]*>Inspect recorded fields<\/summary>/);
  });
});
