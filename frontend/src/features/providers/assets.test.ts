import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import artwork from "./assets/deepseek.svg?raw";
import license from "./assets/LICENSE-deepseek.txt?raw";
import sources from "./assets/sources.json";

describe("bundled supplier identities", () => {
  it("ships the unchanged pinned official DeepSeek artwork with attribution", () => {
    expect(createHash("sha256").update(artwork).digest("hex")).toBe(sources.deepseek.sha256);
    expect(sources.deepseek.source).toMatch(/^https:\/\/raw.githubusercontent.com\/deepseek-ai\//);
    expect(license).toContain("Copyright (c) 2023 DeepSeek");
    expect(artwork).not.toMatch(/<script|<foreignObject|\shref=|\son\w+=/i);
    expect(artwork).toContain('viewBox="0 0 195 41.3594"');
  });
  it("records uncovered brands without inventing logos", () => {
    expect(sources.openai.packaged).toBe(false); expect(sources.anthropic.packaged).toBe(false);
  });
});
