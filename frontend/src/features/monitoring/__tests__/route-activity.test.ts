import { describe, expect, it } from "vitest";
import type { PolicyCatalog, RoutingActivityPayload } from "@/shared/api/types";
import { activePaths, configuredModels, connectorAnchors, connectorPath, pathForModel, routeDestinations, strategyChoices, validActivity } from "../model/route-activity";

const activity: RoutingActivityPayload = { object: "routing.activity", scope: "process", instance_id: "worker", complete: true,
  paths: [{ strategy: "balanced", route: "p/m", provider: "p", upstream_model: "m", in_flight_requests: 1, in_flight_streams: 0 },
    { strategy: "balanced", route: "p/n", provider: "p", upstream_model: "n", in_flight_requests: 1, in_flight_streams: 1 }] };

describe("process route activity", () => {
  it("keeps model paths active while requests remain in flight with no timed expiry", () => {
    expect(activePaths(activity).map((path) => path.upstream_model)).toEqual(["m", "n"]);
    expect(activePaths({ ...activity, paths: [] })).toEqual([]);
  });
  it("suppresses invalid, incomplete and unsupported endpoint responses", () => {
    expect(validActivity(activity)).toBe(true);
    expect(validActivity({ ...activity, complete: false })).toBe(false);
    expect(validActivity({ ...activity, paths: [{ ...activity.paths[0]!, in_flight_requests: 0 }] })).toBe(false);
    expect(validActivity({ ...activity, paths: [{ ...activity.paths[0]!, in_flight_streams: 2 }] })).toBe(false);
    expect(activePaths({ ...activity, paths: [{ ...activity.paths[0]!, in_flight_requests: 0 }] })).toEqual([]);
    expect(activePaths(null)).toEqual([]);
  });
  it("lights only the selected strategy and exact provider/model destination", () => {
    expect(pathForModel(activePaths(activity), "balanced", "p/n")).toBe(true);
    expect(pathForModel(activePaths({ ...activity, paths: [{ ...activity.paths[0]!, in_flight_requests: 0 }, activity.paths[1]!] }), "balanced", "p/m")).toBe(false);
    expect(pathForModel(activePaths(activity), "other", "p/n")).toBe(false);
    expect(pathForModel(activePaths(activity), "balanced", null)).toBe(false);
    expect(pathForModel(activePaths({ ...activity, paths: [] }), "balanced", "p/n")).toBe(false);
  });
  it.each([false, true])("connects the measured node edges in %s layout", (stacked) => {
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;
    const root = rect(20, 30, stacked ? 320 : 900, 500);
    const from = rect(30, 40, stacked ? 300 : 180, 60);
    const to = rect(stacked ? 30 : 510, stacked ? 160 : 190, stacked ? 300 : 360, 80);
    const { start, end } = connectorAnchors(root, from, to, stacked);
    expect(start).toEqual(stacked ? { x: 160, y: 70 } : { x: 190, y: 40 });
    expect(end).toEqual(stacked ? { x: 160, y: 130 } : { x: 490, y: 200 });
    const path = connectorPath(start, end, stacked);
    expect(path).toMatch(new RegExp(`^M ${start.x} ${start.y} C .* ${end.x} ${end.y}$`));
  });
  it("resolves built-in configured pools while custom strategy pools stay unavailable", () => {
    const policy = { labels: { basic: { models: ["p/m"] }, tagged: { tag: "balanced/large" } } };
    const strategy = { name: "balanced", kind: "auto", policy };
    const catalog: PolicyCatalog = { models: [{ name: "p/m", tags: [] }, { name: "p/n", tags: ["balanced/large"] }], strategies: [{ name: "balanced", kind: "auto", policy, description: null }] };
    const configured = configuredModels(strategy, catalog);
    expect(configured).toEqual(["p/m", "p/n"]);
    expect(configuredModels({ ...strategy, kind: "custom" }, catalog)).toEqual([]);
    expect(configuredModels(strategy, { ...catalog, strategies: [] })).toEqual([]);
    expect(configuredModels({ ...strategy, policy: { labels: { implicit: {} } } }, {
      strategies: [{ name: "balanced", kind: "auto", policy: { labels: { implicit: {} } }, description: null }],
      models: [{ name: "p/n", tags: ["balanced/implicit"] }],
    })).toEqual(["p/n"]);
    const destinations = routeDestinations([{ id: "p/m", source: "model", count: 1 }], [activity.paths[0]!], configured);
    expect(destinations.map((item) => [item.id, pathForModel([activity.paths[0]!], "balanced", item.id)])).toEqual([
      ["p/m", true], ["p/n", false],
    ]);
    expect(destinations).toEqual([
      { id: "p/m", source: "model", count: 1, activityOnly: false, configured: true, route: null },
      { id: "p/n", source: "model", count: 0, activityOnly: false, configured: true, route: null },
    ]);
  });
  it("offers a removed strategy under its original name while its stream remains observed", () => {
    const oldPath = { ...activity.paths[1]!, strategy: "removed" };
    const choices = strategyChoices([{ name: "balanced" }], [oldPath, oldPath]);
    expect(choices).toEqual([{ name: "balanced", retired: false }, { name: "removed", retired: true }]);
    expect(pathForModel([oldPath], "removed", "p/n")).toBe(true);
    expect(pathForModel([oldPath], "balanced", "p/n")).toBe(false);
    expect(strategyChoices([{ name: "balanced" }], [])).toEqual([{ name: "balanced", retired: false }]);
  });
  it("keeps activity-only routes separate from counted session destinations", () => {
    expect(routeDestinations([{ id: "p/m", source: "model", count: 2 }], activity.paths)).toEqual([
      { id: "p/m", source: "model", count: 2, activityOnly: false, configured: false, route: null },
      { id: "p/n", source: "model", count: 0, activityOnly: true, configured: false, route: "p/n" },
    ]);
  });
});
