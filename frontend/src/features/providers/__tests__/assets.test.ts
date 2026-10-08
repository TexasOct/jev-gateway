import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import artwork from "../assets/deepseek.svg?raw";
import sources from "../assets/sources.json";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brandIcons } from "../shared/icons";

describe("bundled supplier identities", () => {
  it("ships the unchanged pinned Lobe DeepSeek whale symbol", () => {
    expect(createHash("sha256").update(artwork).digest("hex")).toBe(sources.icons.deepseek.sha256);
    expect(sources.icons.deepseek.original_file).toBe("deepseek-color.svg");
    expect(artwork).not.toMatch(/<script|<foreignObject|\shref=|\son\w+=/i);
    expect(artwork).toContain('viewBox="0 0 24 24"');
    expect(artwork).toContain('fill="#4D6BFE"');
    expect(artwork.match(/<path\b/g)).toHaveLength(1);
    expect(artwork).not.toMatch(/<text|<g|clipPath/);
    expect(sources.icons.deepseek.sha256).toBe("deba5f98a5c1796e20fcac3149bcd7eb8a32f0bdd04d048819400b1f28bd1439");
  });
  it("packages every registry image unchanged with pinned collection provenance", () => {
    const directory = fileURLToPath(new URL("../assets/", import.meta.url));
    const files = readdirSync(directory).filter((file) => file.endsWith(".svg")).sort();
    expect(files).toEqual(brandIcons.map((icon) => `${icon.id}.svg`).sort());
    expect(Object.keys(sources.icons).sort()).toEqual(brandIcons.map((icon) => icon.id).sort());
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
