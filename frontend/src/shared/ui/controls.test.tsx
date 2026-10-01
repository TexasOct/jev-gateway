import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { buttonVariants } from "./button-variants";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { Separator } from "./separator";
import { cn } from "./utils";

describe("shared dashboard controls", () => {
  it("keeps native button semantics, disabled state and localized accessible names", () => {
    const html = renderToStaticMarkup(<Button disabled aria-label="刷新" ref={createRef<HTMLButtonElement>()}>刷新</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('data-variant="default"');
    expect(html).toContain('data-size="default"');
    expect(html).toContain('aria-label="刷新"');
    expect(html).toContain("disabled=");
    expect(html).not.toContain("ref=");
    expect(renderToStaticMarkup(<Button type="submit">Save</Button>)).toContain('type="submit"');
  });

  it("uses Slot for a single child without adding button attributes to a link", () => {
    const html = renderToStaticMarkup(<Button asChild variant="link" className="px-2!" aria-label="Documentation"><a href="/dashboard">Read</a></Button>);
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('aria-label="Documentation"');
    expect(html).toContain("px-2!");
    expect(html).not.toContain("type=");
    expect(html).not.toContain("px-4!");
  });

  it("merges Tailwind v4 overrides and keeps legacy style bridges scoped to owned controls", () => {
    expect(cn("px-4 text-ink", { hidden: false }, "px-2 text-negative")).toBe("px-2 text-negative");
    expect(cn("bg-primary!", "bg-panel!")).toBe("bg-panel!");
    expect(buttonVariants({ variant: "outline", size: "icon" })).toContain("min-h-10");
    expect(buttonVariants({ variant: "outline" })).toContain("border-solid!");
    expect(buttonVariants({ variant: "destructive" })).toContain("text-destructive-foreground!");
    expect(buttonVariants({ variant: "destructive" })).not.toContain("text-white");
    expect(buttonVariants()).toContain("focus-visible:outline-ring!");
    expect(buttonVariants()).toContain("motion-reduce:transition-none");
  });

  it("exposes all Card slots without choosing a document heading or landmark", () => {
    const html = renderToStaticMarkup(<Card className="gap-2" aria-label="Recorded result">
      <CardHeader><CardTitle><h2>Recorded result</h2></CardTitle><CardDescription>Retained evidence</CardDescription><CardAction><Button variant="ghost">Inspect</Button></CardAction></CardHeader>
      <CardContent>Result</CardContent><CardFooter>Details</CardFooter>
    </Card>);
    for (const slot of ["card", "card-header", "card-title", "card-description", "card-action", "card-content", "card-footer"]) {
      expect(html).toContain(`data-slot="${slot}"`);
    }
    expect(html).toContain("gap-2");
    expect(html).not.toContain("gap-4");
    expect(html).toContain("border-solid");
    expect(html).not.toContain("shadow-");
    expect(html).not.toContain('role="region"');
    expect(html).toContain("<h2>Recorded result</h2>");
  });

  it("delegates decorative and orientation accessibility to Radix Separator", () => {
    const decorative = renderToStaticMarkup(<Separator />);
    expect(decorative).toContain('role="none"');
    expect(decorative).toContain('data-orientation="horizontal"');
    expect(decorative).not.toContain("aria-orientation");
    const vertical = renderToStaticMarkup(<Separator decorative={false} orientation="vertical" aria-label="Sections" />);
    expect(vertical).toContain('role="separator"');
    expect(vertical).toContain('aria-orientation="vertical"');
    expect(vertical).toContain('aria-label="Sections"');
  });

});
