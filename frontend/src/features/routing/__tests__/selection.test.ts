import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/en";
import { zhCN } from "@/shared/i18n/zh-CN";
import { selectionCaption } from "../model/selection";

describe("selection captions", () => {
  it("localizes only built-ins and preserves custom configuration identifiers", () => {
    for (const words of [en, zhCN]) {
      expect(selectionCaption("cheapest_adequate", (key) => words[key])).toBe(words.selectionCheapest);
      expect(selectionCaption("quality_first", (key) => words[key])).toBe(words.selectionQuality);
      expect(selectionCaption("balanced", (key) => words[key])).toBe(words.selectionBalanced);
      expect(selectionCaption("custom/选择", (key) => words[key])).toBe("custom/选择");
      expect(selectionCaption(undefined, (key) => words[key])).toBe(words.inheritedSelection);
    }
  });
});
