import { describe, expect, it } from "vitest";

import { hasMatchingMessageKeys, messages } from "./i18n";

describe("dashboard locale dictionaries", () => {
  it("keeps English and Simplified Chinese message keys in sync", () => {
    expect(hasMatchingMessageKeys(messages)).toBe(true);
  });
});
