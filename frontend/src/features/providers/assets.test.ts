import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import artwork from "./assets/deepseek.svg?raw";
import license from "./assets/LICENSE-deepseek.txt?raw";
import sources from "./assets/sources.json";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brandIcons } from "./icons";

describe("bundled supplier identities", () => {
  it("ships the unchanged pinned official DeepSeek artwork with attribution", () => {
    expect(createHash("sha256").update(artwork).digest("hex")).toBe(sources.deepseek.sha256);
    expect(sources.deepseek.source).toMatch(/^https:\/\/raw.githubusercontent.com\/deepseek-ai\//);
    expect(license).toContain("Copyright (c) 2023 DeepSeek");
    expect(artwork).not.toMatch(/<script|<foreignObject|\shref=|\son\w+=/i);
    expect(artwork).toContain('viewBox="0 0 195 41.3594"');
  });
  it("packages every registry image unchanged with pinned collection provenance", () => {
    const directory = fileURLToPath(new URL("./assets/", import.meta.url));
    const files = readdirSync(directory).filter((file) => file.endsWith(".svg")).sort();
    expect(files).toEqual(brandIcons.map((icon) => `${icon.id}.svg`).sort());
    expect(Object.keys(sources.icons).sort()).toEqual(brandIcons.filter((icon) => icon.id !== "deepseek").map((icon) => icon.id).sort());
    expect(sources.collection.asset_source_prefix).toContain("82e641b4fece9d1028a127149af9ded00df5ac0c");
    for (const [id, record] of Object.entries(sources.icons)) {
      const svg = readFileSync(`${directory}/${id}.svg`, "utf8");
      expect(createHash("sha256").update(svg).digest("hex"), id).toBe(record.sha256);
      expect(svg, id).toMatch(/^\s*<svg\b/);
      expect(svg, id).not.toMatch(/<script|<foreignObject|\son\w+=|(?:href|xlink:href)\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i);
      expect(record.official_reference).toMatch(/^https:\/\//);
      expect(record.original_file).toMatch(/\.svg$/);
      const icon = brandIcons.find((entry) => entry.id === id)!;
      expect(icon.source).toBe(sources.collection.asset_source_prefix + record.original_file);
      expect(icon.license).toBe(sources.collection.license);
      expect(icon.usage).toContain("community collection");
    }
    const collectionLicense = readFileSync(`${directory}/LICENSE-lobe-icons.txt`, "utf8");
    expect(collectionLicense).toContain("Copyright (c) 2023 LobeHub");
    expect(createHash("sha256").update(collectionLicense).digest("hex")).toBe(sources.collection.license_sha256);
    expect(collectionLicense).toContain("Permission is hereby granted, free of charge");
  });
});
