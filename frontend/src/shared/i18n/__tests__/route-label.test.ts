import { describe, expect, it } from "vitest";
import type { PolicyCatalog } from "@/shared/api/types";
import { formatRouteLabel, routeLabelContext } from "../route-label";
import { messages } from "..";

const catalog: PolicyCatalog = {
  defaults: { default_model: "p/global" },
  models: [{ name: "p/literal", tags: ["route/default"] }, { name: "p/global", tags: [] }],
  strategies: [{ name: "route", kind: "policy", description: null, policy: { labels: { default: {}, missing: {} } } }],
};

describe("route label source evidence", () => {
  it.each(["en", "zh-CN"] as const)("distinguishes literal labels and global outcomes in %s, including pins", (locale) => {
    const t = () => messages[locale].defaultRouteLabel;
    for (const reason of ["first_turn_default", "session_pinned", "session_sticky", "output_truncated"]) {
      expect(formatRouteLabel("default", t, routeLabelContext({ strategy: "route", reason, defaulted: false }, catalog))).toBe("default");
      expect(formatRouteLabel("default", t, routeLabelContext({ strategy: "route", reason, defaulted: true }, catalog))).toBe(t());
    }
    expect(formatRouteLabel("default", t, routeLabelContext({ strategy: "route", reason: "first_turn_default" }, catalog))).toBe("default");
    expect(formatRouteLabel("default", t, routeLabelContext({ strategy: "route", reason: "rule_0:missing:empty_tag_default" }, catalog))).toBe(t());
    expect(formatRouteLabel("default", t, { defaulted: false, reason: "empty_tag_default" })).toBe("default");
    expect(formatRouteLabel("missing", t, { defaulted: true })).toBe("missing");
  });

  it("preserves compatibility for omitted, null and unknown markers", () => {
    const t = () => "Default";
    for (const source of [{}, { defaulted: null }, { defaulted: "unknown" }]) {
      expect(formatRouteLabel("default", t, source)).toBe("Default");
      expect(formatRouteLabel("default", t, { ...source, declaredLiteralDefault: true })).toBe("default");
    }
    expect(formatRouteLabel("default-custom", t)).toBe("default-custom");
  });
});
