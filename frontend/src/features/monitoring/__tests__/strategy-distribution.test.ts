import { describe, expect, it } from "vitest";
import type { SessionsPayload } from "@/shared/api/types";
import { distributeSessions } from "../model/strategy-distribution";

const strategies = [{ name: "balanced" }, { name: "careful" }];
function page(data: SessionsPayload["data"], has_more: boolean): SessionsPayload {
  return { data, has_more, next_cursor: has_more ? "next" : null, page_size: 30, storage: {}, evidence_available: true };
}

describe("current live-session distribution", () => {
  it("requires a complete cursor traversal before certifying zero and deduplicates session IDs across pages", () => {
    const first = page([{ session_id: "a", strategy: "balanced", provider: "p", upstream_model: "m" }], true);
    const next = page([
      { session_id: "a", strategy: "balanced", provider: "p", upstream_model: "m" },
      { session_id: "b", strategy: "balanced", provider: "p", upstream_model: "m" },
    ], false);
    const partial = distributeSessions(strategies, [first], false);
    expect(partial.complete).toBe(false);
    expect(partial.strategies[1]?.count).toBe(0);
    const result = distributeSessions(strategies, [first, next], true);
    expect(result.complete).toBe(true);
    expect(result.sessions).toHaveLength(2);
    expect(result.strategies[0]?.destinations).toEqual([{ id: "p/m", source: "model", count: 2 }]);
    expect(result.strategies[1]?.count).toBe(0);
    expect(distributeSessions(strategies, [first], true).complete).toBe(false);
  });

  it("separates selected models, route fallback, unknown attribution and unregistered strategies", () => {
    const result = distributeSessions(strategies, [page([
      { session_id: "a", strategy: "balanced", provider: "p", upstream_model: "one", route: "other" },
      { session_id: "b", strategy: "balanced", provider: "p", upstream_model: "two" },
      { session_id: "c", strategy: "balanced", route: "legacy" },
      { session_id: "d", strategy: "balanced" },
      { session_id: "e", route: "legacy" },
      { session_id: "f", strategy: "removed" },
    ], false)], true);
    expect(result.strategies[0]?.destinations).toEqual([
      { id: "p/one", source: "model", count: 1 }, { id: "p/two", source: "model", count: 1 },
      { id: "legacy", source: "route", count: 1 }, { id: null, source: "unknown", count: 1 },
    ]);
    expect(result.unattributed.count).toBe(1);
    expect(result.unregistered.map((item) => item.name)).toEqual(["removed"]);
  });

  it("keeps empty or failed walks incomplete, with no claimed zero", () => {
    expect(distributeSessions(strategies, [], false).complete).toBe(false);
    expect(distributeSessions(strategies, [page([], true)], false).complete).toBe(false);
    expect(distributeSessions(strategies, [page([], false)], true).complete).toBe(true);
  });
});
