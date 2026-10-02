import type { PolicyCatalog, RoutingActivityPayload } from "@/shared/api/types";
import type { ObservedDestination, RegisteredStrategy } from "./strategy-distribution";
import { matrixChoiceLabel } from "@/shared/routing/choice-label";

export function validActivity(value: RoutingActivityPayload | null): value is RoutingActivityPayload {
  return value !== null && value.object === "routing.activity" && value.scope === "process"
    && value.complete === true
    && typeof value.instance_id === "string" && value.instance_id.length > 0 && value.instance_id !== "unavailable"
    && Array.isArray(value.paths) && value.paths.every((path) =>
      path !== null && typeof path === "object"
      && typeof path.strategy === "string" && path.strategy.length > 0
      && typeof path.route === "string"
      && typeof path.provider === "string" && path.provider.length > 0
      && typeof path.upstream_model === "string" && path.upstream_model.length > 0
      && Number.isSafeInteger(path.in_flight_requests) && path.in_flight_requests > 0
      && Number.isSafeInteger(path.in_flight_streams) && path.in_flight_streams >= 0
      && path.in_flight_streams <= path.in_flight_requests);
}

export function activePaths(activity: RoutingActivityPayload | null): RoutingActivityPayload["paths"] {
  if (!validActivity(activity)) return [];
  return activity.paths.filter((path) => path.in_flight_requests > 0);
}

export function pathForModel(paths: RoutingActivityPayload["paths"], strategy: string | undefined, id: string | null): boolean {
  return id !== null && paths.some((path) => path.strategy === strategy && `${path.provider}/${path.upstream_model}` === id && path.in_flight_requests > 0);
}

export interface Anchor { x: number; y: number }

/** Translate the two node edges into the diagram's local SVG coordinates. */
export function connectorAnchors(root: DOMRect, from: DOMRect, to: DOMRect, stacked: boolean): { start: Anchor; end: Anchor } {
  return stacked ? {
    start: { x: from.left + from.width / 2 - root.left, y: from.bottom - root.top },
    end: { x: to.left + to.width / 2 - root.left, y: to.top - root.top },
  } : {
    start: { x: from.right - root.left, y: from.top + from.height / 2 - root.top },
    end: { x: to.left - root.left, y: to.top + to.height / 2 - root.top },
  };
}

export function connectorPath(start: Anchor, end: Anchor, stacked: boolean): string {
  return stacked
    ? `M ${start.x} ${start.y} C ${start.x} ${(start.y + end.y) / 2}, ${end.x} ${(start.y + end.y) / 2}, ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} C ${(start.x + end.x) / 2} ${start.y}, ${(start.x + end.x) / 2} ${end.y}, ${end.x} ${end.y}`;
}

export function strategyChoices(registered: readonly RegisteredStrategy[], paths: readonly RoutingActivityPayload["paths"][number][]): { name: string; retired: boolean }[] {
  const names = new Set(registered.map((strategy) => strategy.name));
  return [
    ...registered.map((strategy) => ({ name: strategy.name, retired: false })),
    ...[...new Set(paths.map((path) => path.strategy))].filter((name) => !names.has(name)).map((name) => ({ name, retired: true })),
  ];
}

export interface RouteDestination extends ObservedDestination {
  route: string | null;
  activityOnly: boolean;
  configured: boolean;
}

/** Resolve only built-in label selectors. A policy read from a different catalog
 * revision must not supply pools for the current strategy listing. */
export function configuredRouteModels(strategy: RegisteredStrategy | undefined, catalog: PolicyCatalog | null): { models: string[]; defaultModel: string | null; incomplete: boolean } {
  const unavailable = { models: [], defaultModel: null, incomplete: false };
  if (!strategy || !["auto", "policy", "decision", "decision_matrix"].includes(strategy.kind ?? "")) return unavailable;
  const definition = catalog?.strategies?.find((entry) => entry.name === strategy.name);
  if (!definition || definition.kind !== strategy.kind || JSON.stringify(definition.policy) !== JSON.stringify(strategy.policy) ||
      strategy.options !== undefined && JSON.stringify(definition.options) !== JSON.stringify(strategy.options)) return unavailable;
  const labels = strategy.policy?.["labels"];
  if (!labels || typeof labels !== "object" || Array.isArray(labels) || !Array.isArray(catalog?.models)) return unavailable;
  const selectable = new Set(Object.keys(labels));
  if (strategy.kind === "decision_matrix") {
    selectable.clear();
    const options = definition.options ?? {};
    const first = Object.keys(labels)[0];
    const fallbackLabel = matrixChoiceLabel(options["fallback"], first);
    if (fallbackLabel) selectable.add(fallbackLabel);
    if (Array.isArray(options["rules"])) for (const rule of options["rules"]) {
      const selected = matrixChoiceLabel(rule?.select, first);
      if (selected) selectable.add(selected);
    }
  }
  const models = new Set<string>();
  let emptyTag = false;
  for (const [name, value] of Object.entries(labels)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const label = value as Record<string, unknown>;
    const listed = label["models"];
    if (Array.isArray(listed) && listed.length > 0) {
      for (const id of listed) {
        if (typeof id === "string" && catalog.models.some((model) => model.name === id)) models.add(id);
      }
      continue;
    }
    const tag = typeof label["tag"] === "string" ? label["tag"] : `${strategy.name}/${name}`;
    let members = 0;
    for (const model of catalog.models) {
      if (typeof model.name === "string" && Array.isArray(model.tags) && model.tags.includes(tag)) { models.add(model.name); members += 1; }
    }
    if (members === 0 && selectable.has(name)) emptyTag = true;
  }
  const globalModel = catalog.defaults?.default_model;
  const defaultModel = emptyTag && globalModel && catalog.models.some((model) => model.name === globalModel) ? globalModel : null;
  if (defaultModel) models.add(defaultModel);
  return { models: [...models], defaultModel, incomplete: emptyTag && defaultModel === null };
}

export function configuredModels(strategy: RegisteredStrategy | undefined, catalog: PolicyCatalog | null): string[] {
  return configuredRouteModels(strategy, catalog).models;
}

export function routeDestinations(
  sessions: readonly ObservedDestination[],
  activity: readonly RoutingActivityPayload["paths"][number][],
  configured: readonly string[] = [],
): RouteDestination[] {
  const configuredSet = new Set(configured);
  const result: RouteDestination[] = sessions.map((entry) => ({ ...entry, route: null, activityOnly: false, configured: entry.source === "model" && configuredSet.has(entry.id ?? "") }));
  const known = new Set(sessions.filter((entry) => entry.source === "model").map((entry) => entry.id));
  for (const id of configuredSet) {
    if (known.has(id)) continue;
    known.add(id);
    result.push({ id, source: "model", count: 0, route: null, activityOnly: false, configured: true });
  }
  for (const path of activity) {
    const id = `${path.provider}/${path.upstream_model}`;
    if (!known.has(id)) {
      known.add(id);
      result.push({ id, source: "model", count: 0, route: path.route, activityOnly: true, configured: false });
    }
  }
  return result;
}
