import type { PolicyCatalog, RoutingActivityPayload } from "@/shared/api/types";
import type { ObservedDestination, RegisteredStrategy } from "./strategy-distribution";

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
export function configuredModels(strategy: RegisteredStrategy | undefined, catalog: PolicyCatalog | null): string[] {
  if (!strategy || !["auto", "policy", "decision", "decision_matrix"].includes(strategy.kind ?? "")) return [];
  const definition = catalog?.strategies?.find((entry) => entry.name === strategy.name);
  if (!definition || definition.kind !== strategy.kind || JSON.stringify(definition.policy) !== JSON.stringify(strategy.policy)) return [];
  const labels = strategy.policy?.["labels"];
  if (!labels || typeof labels !== "object" || Array.isArray(labels) || !Array.isArray(catalog?.models)) return [];
  const models = new Set<string>();
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
    for (const model of catalog.models) {
      if (typeof model.name === "string" && Array.isArray(model.tags) && model.tags.includes(tag)) models.add(model.name);
    }
  }
  return [...models];
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
