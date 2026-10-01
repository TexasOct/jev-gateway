import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

// Node-only source contract; keep node types out of the browser TS config.
it("maps shadcn roles to the runtime palette without Preflight or a static dark theme", () => {
  const source = readFileSync(resolve("src/tailwind.css"), "utf8");
  expect(source).toContain('@import "tailwindcss/theme.css" layer(theme)');
  expect(source).toContain('@import "tailwindcss/utilities.css" layer(utilities)');
  expect(source).not.toMatch(/@import\s+["'](?:tailwindcss["']|.*preflight)/);
  expect(source).toContain("@layer base");
  expect(source).toContain("appearance: none");
  expect(source).toContain("border: 1px solid var(--border)");
  expect(source).toContain('@custom-variant dark (&:where([data-scheme="dark"], [data-scheme="dark"] *))');
  for (const declaration of [
    "--color-background: var(--bg)", "--color-foreground: var(--text)",
    "--color-card: var(--surface)", "--color-card-foreground: var(--text)",
    "--color-primary-foreground: var(--on-accent)", "--color-border: var(--border)",
    "--color-ring: var(--accent)", "--color-muted-foreground: var(--text-muted)",
    "--color-destructive: var(--bad)",
  ]) expect(source).toContain(declaration);
});
