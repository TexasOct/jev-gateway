import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

// Node-only source contract; keep node types out of the browser TS config.
it("keeps exactly nine purpose-owned stylesheets behind the sole application CSS import", () => {
  const styles = resolve("src/styles");
  const names = [
    "appearance.css", "base.css", "canvas-geometry.css", "index.css", "monitoring.css",
    "routing.css", "shell.css", "tokens.css", "virtual-list.css",
  ];
  expect(readdirSync(styles).sort()).toEqual(names);
  const entry = readFileSync(resolve(styles, "index.css"), "utf8");
  expect([...entry.matchAll(/@import "\.\/([^"\n]+\.css)";/g)].map((match) => match[1])).toEqual([
    "tokens.css", "base.css", "shell.css", "monitoring.css", "routing.css",
    "canvas-geometry.css", "appearance.css", "virtual-list.css",
  ]);
  const sourceImports = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.tsx?$/.test(entry.name)) {
        for (const match of readFileSync(file, "utf8").matchAll(/import\s+["']([^"']+\.css)["']/g)) {
          sourceImports.push([file.replace(`${resolve("src")}/`, ""), match[1]]);
        }
      }
    }
  }
  visit(resolve("src"));
  expect(sourceImports).toEqual([["main.tsx", "./styles/index.css"]]);
  const geometry = readFileSync(resolve("src/features/routing/RoutingCanvas.tsx"), "utf8");
  const editor = readFileSync(resolve("src/features/routing/RoutingEditor.tsx"), "utf8");
  expect(geometry).toMatch(/routing-canvas-scroll[^\n]*absolute inset-0[^\n]*overflow-auto[^\n]*overscroll-contain[^\n]*\[touch-action:none\]/);
  expect(geometry).toMatch(/routing-canvas-board relative min-h-full overflow-clip/);
  expect(geometry).toMatch(/routing-canvas-content absolute left-0 top-\[var\(--canvas-origin-y,0px\)\]/);
  expect(geometry).toMatch(/routing-canvas-node absolute block w-\[190px\] overflow-hidden[^\n]*\[touch-action:none\]/);
  expect(geometry).toContain("height: dimensions[id]!.height");
  expect(geometry).toMatch(/routing-canvas-lines pointer-events-none absolute inset-0/);
  expect(geometry).toMatch(/canvas-edge-handle[^\n]*\[pointer-events:auto\]/);
  expect(geometry).toMatch(/canvas-edge-preview pointer-events-none/);
  expect(geometry).toMatch(/canvas-marquee absolute pointer-events-none/);
  expect(geometry).toMatch(/canvas-tools absolute[^\n]*z-\[7\][^\n]*flex-nowrap[^\n]*overflow-x-auto overflow-y-hidden/);
  expect(geometry).toContain("animate-[node-drag-pulse_0.9s_ease-in-out_infinite_alternate]");
  expect(editor).toMatch(/workflow-workspace relative[^\n]*isolate/);
  expect(editor).toMatch(/workflow-inspector absolute/);
  expect(editor).toMatch(/workflow-drawer absolute/);
  const canvasStyles = readFileSync(resolve(styles, "canvas-geometry.css"), "utf8");
  expect(canvasStyles).toContain("@keyframes node-drag-pulse");
  expect(canvasStyles).not.toMatch(/\.[\w-]+\s*\{/);
  const list = readFileSync(resolve("src/features/monitoring/components/VirtualList.tsx"), "utf8");
  for (const value of ["480px", "280px", "62vh"]) {
    expect(list).toContain(`h-[${value}]`);
    expect(list).toContain(`min-h-[${value}]`);
    expect(list).toContain(`max-h-[${value}]`);
  }
  expect(list).toContain("virtual-row absolute left-0 right-0 overflow-hidden");
  for (const file of ["monitoring.css", "routing.css", "virtual-list.css", "appearance.css"]) {
    expect(readFileSync(resolve(styles, file), "utf8")).not.toMatch(/\.[\w-]+\s*\{/);
  }
});

it("maps shadcn roles to the runtime palette without Preflight or a static dark theme", () => {
  const source = readFileSync(resolve("src/styles/index.css"), "utf8");
  expect(source).toContain('@import "tailwindcss/theme.css" layer(theme)');
  expect(source).toContain('@import "tailwindcss/utilities.css" layer(utilities)');
  expect(source).not.toMatch(/@import\s+["'](?:tailwindcss["']|.*preflight)/);
  expect(source).toContain("@layer base");
  expect(source).toContain("appearance: none");
  expect(source).toContain('@custom-variant dark (&:where([data-scheme="dark"], [data-scheme="dark"] *))');
  for (const declaration of [
    "--color-background: var(--bg)", "--color-foreground: var(--text)",
    "--color-card: var(--surface)", "--color-card-foreground: var(--text)",
    "--color-primary-foreground: var(--on-accent)", "--color-border: var(--border)",
    "--color-ring: var(--accent)", "--color-muted-foreground: var(--text-muted)",
    "--color-destructive: var(--bad)",
  ]) expect(source).toContain(declaration);
});
