import { describe, expect, it } from "vitest";

import { hasMatchingMessageKeys, messages } from "./index";

describe("dashboard locale dictionaries", () => {
  it("keeps English and Simplified Chinese message keys in sync", () => {
    expect(hasMatchingMessageKeys(messages)).toBe(true);
    expect(messages.en.providerModels).toBeDefined();
    expect(messages["zh-CN"].settings).toBeDefined();
  });
});
