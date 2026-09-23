import { describe, expect, it } from "vitest";

import {
  BODY_TEXT_TARGET,
  DEFAULT_SEED,
  buildPalette,
  contrastRows,
  isValidSeed,
  normalizeSeed,
  paletteVariables,
} from "./palette";

const SEEDS = ["#3b66d9", "#0f766e", "#b45309", "#7c3aed", "#111827", "#dc2626"];

describe("seed normalization", () => {
  it("accepts a hex color and returns the canonical form", () => {
    expect(normalizeSeed("  #3B66D9 ")).toBe("#3b66d9");
  });

  it("rejects values that are not colors", () => {
    for (const value of ["", "blue", "#12", "rgb(1,2)", "javascript:alert(1)"]) {
      expect(normalizeSeed(value)).toBeNull();
      expect(isValidSeed(value)).toBe(false);
    }
  });
});

describe("palette derivation", () => {
  it("derives both schemes from the default seed", () => {
    const { light, dark } = buildPalette(DEFAULT_SEED);
    expect(light.scheme).toBe("light");
    expect(dark.scheme).toBe("dark");
    expect(light.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(dark.accent).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps the default seed as the light accent family", () => {
    const { light } = buildPalette(DEFAULT_SEED);
    const accent = light.accent.slice(1);
    expect(accent).not.toBe(DEFAULT_SEED.slice(1));
    expect(light.accent).not.toBe(light.text);
  });

  it("moves the accent when the seed changes", () => {
    const accents = SEEDS.map((seed) => buildPalette(seed).light.accent);
    expect(new Set(accents).size).toBe(SEEDS.length);
  });

  it("falls back to the default seed for an unusable value", () => {
    expect(buildPalette("not-a-color")).toEqual(buildPalette(DEFAULT_SEED));
  });
});

describe("contrast reporting", () => {
  it("meets the body text target for every seed it is given", () => {
    for (const seed of SEEDS) {
      const { light, dark } = buildPalette(seed);
      for (const palette of [light, dark]) {
        for (const row of contrastRows(palette)) {
          expect(row.pass, `${seed} ${palette.scheme} ${row.label} = ${row.ratio}`).toBe(true);
        }
      }
    }
  });

  it("reports the measured ratio rather than the target", () => {
    const rows = contrastRows(buildPalette(DEFAULT_SEED).light);
    const body = rows.find((row) => row.label === "body text on page");
    expect(body).toBeDefined();
    expect(body?.target).toBe(BODY_TEXT_TARGET);
    expect(body?.ratio).toBeGreaterThan(BODY_TEXT_TARGET);
  });
});

describe("css variables", () => {
  it("exposes every palette entry", () => {
    const variables = paletteVariables(buildPalette(DEFAULT_SEED).light);
    expect(Object.keys(variables).sort()).toEqual(
      [
        "--accent",
        "--accent-active",
        "--accent-hover",
        "--on-accent",
        "--bad",
        "--bg",
        "--border",
        "--code-bg",
        "--good",
        "--surface",
        "--surface-alt",
        "--text",
        "--text-muted",
        "--warn",
      ].sort(),
    );
    for (const value of Object.values(variables)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
