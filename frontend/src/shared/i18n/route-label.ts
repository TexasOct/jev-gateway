import type { PolicyCatalog } from "@/shared/api/types";

type Translate = (key: "defaultRouteLabel") => string;

export interface RouteLabelContext {
  defaulted?: unknown;
  reason?: unknown;
  declaredLiteralDefault?: boolean;
}

/** Explicit outcome evidence wins over the current catalog, including session pins. */
export function routeLabelContext(source: { defaulted?: unknown; reason?: unknown; strategy?: unknown }, catalog?: PolicyCatalog | null): RouteLabelContext {
  const labels = catalog?.strategies.find((strategy) => strategy.name === source.strategy)?.policy["labels"];
  return {
    defaulted: source.defaulted,
    reason: source.reason,
    declaredLiteralDefault: labels !== null && typeof labels === "object" && !Array.isArray(labels) && Object.hasOwn(labels, "default"),
  };
}

export function formatRouteLabel(label: string, t: Translate, source: RouteLabelContext = {}): string {
  if (label !== "default" || source.defaulted === false) return label;
  if (source.defaulted === true || typeof source.reason === "string" && /(?:^|[:;\s])empty_tag_default(?:$|[:;\s])/.test(source.reason)) return t("defaultRouteLabel");
  return source.declaredLiteralDefault ? label : t("defaultRouteLabel");
}
