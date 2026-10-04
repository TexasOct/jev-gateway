import { describe, expect, it } from "vitest";
import { brandIcon, brandIcons, genericIcons, resolvedIconID, searchIcons } from "./icons";
import { newPresetInstanceID, profileForWrite, searchProfiles } from "./model";

describe("provider icon registry", () => {
  it("prefills templates with an unused instance ID", () => {
    expect(newPresetInstanceID("openai", [])).toBe("openai");
    expect(newPresetInstanceID("openai", [{ id: "openai", api_base: null }, { id: "openai-2", api_base: null }])).toBe("openai-3");
  });
  it("resolves explicit icons independently of brand and transport", () => {
    for (const icon of [...brandIcons.map((entry) => entry.id), ...genericIcons, "saved-future-icon"]) {
      const profile = { id: "custom", api_base: null, brand_id: "deepseek", icon_id: icon, type: "openai" };
      expect(resolvedIconID(profile)).toBe(icon);
      expect(profileForWrite(profile, "llm")).toMatchObject({ id: "custom", brand_id: "deepseek", type: "openai", icon_id: icon });
    }
  });
  it("uses automatic brand or exact known instance identity without guessing", () => {
    expect(resolvedIconID({ id: "proxy", api_base: null, brand_id: "qwen", icon_id: null })).toBe("qwen");
    expect(resolvedIconID({ id: "openai", api_base: null, icon_id: null })).toBe("openai");
    expect(resolvedIconID({ id: "openai-proxy", api_base: null, icon_id: null })).toBeNull();
    expect(resolvedIconID({ id: "openai", api_base: null, brand_id: "unknown" })).toBeNull();
    expect(brandIcon("azure_openai")?.id).toBe("azure");
    expect(brandIcon("dashscope_intl")?.id).toBe("qwen");
    expect(brandIcon("zai")?.id).toBe("zhipu");
  });
  it("searches labels, IDs, Chinese and model aliases from the same registry", () => {
    for (const [query, expected] of [["claude", "anthropic"], ["通义千问", "qwen"], ["GLM", "zhipu"], ["azure_openai", "azure"], ["Sonar", "perplexity"], ["  CHATGPT ", "openai"]]) {
      expect(searchIcons(query!).map((icon) => icon.id)).toContain(expected);
    }
    expect(searchIcons("unknown-future-provider")).toEqual([]);
    expect(searchProfiles([{ id: "old-proxy", api_base: null, brand_id: "qwen" }], "通义千问")).toHaveLength(1);
    expect(searchProfiles([{ id: "azure_openai", api_base: null }], "Microsoft")).toHaveLength(1);
  });
});
