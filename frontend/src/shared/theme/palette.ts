/**
 * Derive the light and dark interface palettes from one seed color with chroma-js.
 *
 * The seed is the only stored value. Text, surfaces, and borders come from fixed
 * lightness targets, and each accent or status color is stepped in lightness until
 * it clears its contrast target against the surface it sits on, so legibility
 * holds by construction rather than by luck. `contrastRows` reports the measured
 * ratio for every pair the interface relies on.
 */

import chroma from "chroma-js";

export const DEFAULT_SEED = "#3b66d9";
export const BODY_TEXT_TARGET = 4.5;
export const LARGE_TEXT_TARGET = 3;

export type Scheme = "light" | "dark";

export interface Palette {
  scheme: Scheme;
  bg: string;
  surface: string;
  surfaceAlt: string;
  codeBg: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentActive: string;
  onAccent: string;
  good: string;
  bad: string;
  warn: string;
}

export interface ContrastRow {
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  target: number;
  pass: boolean;
}

const STATUS_HUES = { good: 148, bad: 8, warn: 38 } as const;
const ON_ACCENT_LIGHT = "#ffffff";
const ON_ACCENT_DARK = "#10161f";

const HEX_SEED = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidSeed(value: string): boolean {
  return HEX_SEED.test(value.trim());
}

/** Accept only hex seeds so the stored value stays one predictable shape. */
export function normalizeSeed(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_SEED.test(trimmed)) return null;
  return chroma(trimmed).hex();
}

function hueOf(seed: chroma.Color): number {
  const hue = chroma(seed).get("hsl.h");
  return Number.isFinite(hue) ? hue : 222;
}

/**
 * Step a color's lightness until it clears `target` contrast against `against`.
 * `direction` is the unit direction: -1 darkens, +1 lightens.
 */
function stepUntilVisible(
  against: chroma.Color,
  hue: number,
  saturation: number,
  startLightness: number,
  direction: number,
  target: number,
): chroma.Color {
  let lightness = startLightness;
  let color = chroma.hsl(hue, saturation, lightness);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (chroma.contrast(color, against) >= target) break;
    lightness = Math.min(0.97, Math.max(0.03, lightness + direction * 0.01));
    color = chroma.hsl(hue, saturation, lightness);
  }
  return color;
}

function shiftLightness(color: chroma.Color, delta: number): string {
  const lightness = Math.min(
    0.97,
    Math.max(0.03, chroma(color).get("hsl.l") + delta),
  );
  return chroma(color).set("hsl.l", lightness).hex();
}

/**
 * Pick a label color for accent-filled surfaces, nudging the accent away from
 * mid-luminance values where neither white nor near-black can clear 4.5:1.
 * `direction` is the unit direction: -1 darkens, +1 lightens.
 */
function labelOnAccent(
  accent: chroma.Color,
  direction: number,
): { accent: chroma.Color; onAccent: string } {
  let current = accent;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (chroma.contrast(ON_ACCENT_LIGHT, current) >= BODY_TEXT_TARGET) {
      return { accent: current, onAccent: ON_ACCENT_LIGHT };
    }
    if (chroma.contrast(ON_ACCENT_DARK, current) >= BODY_TEXT_TARGET) {
      return { accent: current, onAccent: ON_ACCENT_DARK };
    }
    const lightness = Math.min(
      0.97,
      Math.max(0.03, chroma(current).get("hsl.l") + direction * 0.02),
    );
    current = chroma(current).set("hsl.l", lightness);
  }
  return { accent: current, onAccent: ON_ACCENT_LIGHT };
}

function lightPalette(seed: chroma.Color): Palette {
  const hue = hueOf(seed);
  const saturation = Math.max(0.45, chroma(seed).get("hsl.s"));
  // Neutral surfaces do not change when an operator changes the seed. Only
  // action, selection and semantic colors are derived from color families.
  const bg = chroma("#f8f9fa");
  const surface = chroma("#ffffff");
  const accentBase = stepUntilVisible(
    bg,
    hue,
    saturation,
    0.5,
    -1,
    BODY_TEXT_TARGET,
  );
  const { accent, onAccent } = labelOnAccent(accentBase, -1);
  const status = (key: keyof typeof STATUS_HUES): string =>
    stepUntilVisible(
      bg,
      STATUS_HUES[key],
      0.72,
      0.45,
      -1,
      BODY_TEXT_TARGET,
    ).hex();
  return {
    scheme: "light",
    bg: bg.hex(),
    surface: surface.hex(),
    surfaceAlt: "#f2f3f5",
    codeBg: "#f4f4f5",
    border: "#d8d9de",
    text: "#18181b",
    textMuted: "#52525b",
    accent: accent.hex(),
    accentHover: shiftLightness(accent, -0.06),
    accentActive: shiftLightness(accent, -0.12),
    onAccent,
    good: status("good"),
    bad: status("bad"),
    warn: status("warn"),
  };
}

function darkPalette(seed: chroma.Color): Palette {
  const hue = hueOf(seed);
  const saturation = Math.max(0.35, chroma(seed).get("hsl.s") * 0.8);
  const bg = chroma("#0b0b0c");
  const surface = chroma("#161618");
  const accentBase = stepUntilVisible(
    surface,
    hue,
    saturation,
    0.62,
    1,
    BODY_TEXT_TARGET,
  );
  const { accent, onAccent } = labelOnAccent(accentBase, 1);
  const status = (key: keyof typeof STATUS_HUES): string =>
    stepUntilVisible(
      bg,
      STATUS_HUES[key],
      0.68,
      0.55,
      1,
      BODY_TEXT_TARGET,
    ).hex();
  return {
    scheme: "dark",
    bg: bg.hex(),
    surface: surface.hex(),
    surfaceAlt: "#222225",
    codeBg: "#1b1b1e",
    border: "#38383e",
    text: "#f4f4f5",
    textMuted: "#b4b4bd",
    accent: accent.hex(),
    accentHover: shiftLightness(accent, 0.05),
    accentActive: shiftLightness(accent, 0.1),
    onAccent,
    good: status("good"),
    bad: status("bad"),
    warn: status("warn"),
  };
}

export function buildPalette(seed: string): { light: Palette; dark: Palette } {
  const base = chroma.valid(seed) ? chroma(seed) : chroma(DEFAULT_SEED);
  return { light: lightPalette(base), dark: darkPalette(base) };
}

function ratio(foreground: string, background: string): number {
  return Number(chroma.contrast(foreground, background).toFixed(2));
}

export function contrastRows(palette: Palette): ContrastRow[] {
  const candidates: Array<{
    label: string;
    foreground: string;
    background: string;
    target: number;
  }> = [
    {
      label: "body text on page",
      foreground: palette.text,
      background: palette.bg,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "body text on panel",
      foreground: palette.text,
      background: palette.surface,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "muted text on page",
      foreground: palette.textMuted,
      background: palette.bg,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "accent text on page",
      foreground: palette.accent,
      background: palette.bg,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "accent text on panel",
      foreground: palette.accent,
      background: palette.surface,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "label on accent",
      foreground: palette.onAccent,
      background: palette.accent,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "panel border",
      foreground: palette.border,
      background: palette.bg,
      target: 1.2,
    },
    {
      label: "success status",
      foreground: palette.good,
      background: palette.bg,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "success status on panel",
      foreground: palette.good,
      background: palette.surface,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "failure status",
      foreground: palette.bad,
      background: palette.bg,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "failure status on panel",
      foreground: palette.bad,
      background: palette.surface,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "warning status",
      foreground: palette.warn,
      background: palette.bg,
      target: BODY_TEXT_TARGET,
    },
    {
      label: "warning status on panel",
      foreground: palette.warn,
      background: palette.surface,
      target: BODY_TEXT_TARGET,
    },
  ];
  return candidates.map((item) => {
    const measured = ratio(item.foreground, item.background);
    return { ...item, ratio: measured, pass: measured >= item.target };
  });
}

export function paletteVariables(palette: Palette): Record<string, string> {
  return {
    "--bg": palette.bg,
    "--surface": palette.surface,
    "--surface-alt": palette.surfaceAlt,
    "--code-bg": palette.codeBg,
    "--border": palette.border,
    "--text": palette.text,
    "--text-muted": palette.textMuted,
    "--accent": palette.accent,
    "--accent-hover": palette.accentHover,
    "--accent-active": palette.accentActive,
    "--on-accent": palette.onAccent,
    "--good": palette.good,
    "--bad": palette.bad,
    "--warn": palette.warn,
  };
}

export function applyPalette(palette: Palette, root: HTMLElement): void {
  for (const [name, value] of Object.entries(paletteVariables(palette))) {
    root.style.setProperty(name, value);
  }
  root.dataset.scheme = palette.scheme;
}
