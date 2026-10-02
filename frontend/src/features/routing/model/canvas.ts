import type { CanvasLayout, ConfigurationPayload } from "@/shared/api/types";
import { labelMembers, moveRule, setFallback, setLabelMembership, setRuleChoice, workflowEdges } from "./draft";
import type { RoutingDraft, WorkflowEdge } from "./draft";

export const BOARD_WIDTH = 3200;
export const BOARD_HEIGHT = 2200;
export const MIN_ZOOM = 0.5;
const MAX_COORD = 10000;
const NODE_ID = /^(?:questions|fallback|rule-(?:0|[1-9][0-9]{0,3})|(?:zone|model)::.{1,240})$/u;

export type Position = { x: number; y: number };
export function validPosition(value: unknown): value is Position {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const position = value as Record<string, unknown>;
  return Object.keys(position).length === 2 && Number.isInteger(position.x) && Number.isInteger(position.y) &&
    Math.abs(position.x as number) <= MAX_COORD && Math.abs(position.y as number) <= MAX_COORD;
}

export function validLayout(value: unknown): value is CanvasLayout {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const layout = value as Record<string, unknown>;
  if (Object.keys(layout).some((key) => !["version", "nodes", "viewport", "read_error"].includes(key)) ||
    layout.version !== 1 || !validPosition(layout.viewport) || typeof layout.nodes !== "object" ||
    layout.nodes === null || Array.isArray(layout.nodes)) return false;
  const nodes = layout.nodes as Record<string, unknown>;
  return Object.keys(nodes).length <= 256 && Object.entries(nodes).every(([id, position]) => NODE_ID.test(id) &&
    [...id].every((character) => character.codePointAt(0)! > 31 && character.codePointAt(0)! !== 127) && validPosition(position));
}

type LayoutWriteVersion = { generation: number; revision: number };

/** A failure invalidates its whole generation, including newer queued previews. */
export function reconcileLayoutWrite(current: LayoutWriteVersion, request: LayoutWriteVersion, outcome: "saved" | "failed"): "ignore" | "rollback" | "saved" | "latest" {
  if (current.generation !== request.generation) return "ignore";
  if (outcome === "failed") return "rollback";
  return current.revision === request.revision ? "latest" : "saved";
}

/** Serialize PUTs through reconciliation so rollback finishes before a retry starts. */
export function createLayoutWriteQueue(write: (layout: CanvasLayout) => Promise<unknown>) {
  let version: LayoutWriteVersion = { generation: 0, revision: 0 };
  let chain = Promise.resolve();
  let pending = false;
  const invalidate = () => {
    version = { generation: version.generation + 1, revision: version.revision + 1 };
    pending = false;
  };
  return {
    get pending() { return pending; },
    invalidate,
    enqueue(layout: CanvasLayout, saved: (layout: CanvasLayout, latest: boolean) => void, failed: (error: unknown) => void): Promise<void> {
      const request = version = { ...version, revision: version.revision + 1 };
      chain = chain.then(async () => {
        if (request.generation !== version.generation) return;
        pending = true;
        try {
          await write(layout);
        } catch (error: unknown) {
          if (reconcileLayoutWrite(version, request, "failed") === "ignore") return;
          invalidate();
          failed(error);
          return;
        }
        const result = reconcileLayoutWrite(version, request, "saved");
        if (result === "ignore") return;
        pending = false;
        saved(layout, result === "latest");
      });
      return chain;
    },
  };
}

/** Rule positions are slot-based and must be reset or shifted when topology changes. */
export function shiftRuleLayout(nodes: Record<string, Position>, from: number, delta: number): Record<string, Position> {
  const shifted: Record<string, Position> = {};
  for (const [id, position] of Object.entries(nodes)) {
    const match = /^rule-(0|[1-9][0-9]*)$/.exec(id);
    if (!match) { shifted[id] = position; continue; }
    const index = Number(match[1]);
    if (delta < 0 && index === from) continue;
    const next = index >= from ? index + delta : index;
    if (next >= 0) shifted[`rule-${next}`] = position;
  }
  return shifted;
}

export type RuleLayoutMutation =
  | { kind: "insert"; index: number }
  | { kind: "remove"; index: number }
  | { kind: "move"; from: number; to: number };

/** Slot layouts follow the exact topology operation, including duplicate rules. */
export function reconcileRuleLayout(
  nodes: Record<string, Position>, mutation: RuleLayoutMutation,
): Record<string, Position> {
  if (mutation.kind === "insert") return shiftRuleLayout(nodes, mutation.index, 1);
  if (mutation.kind === "remove") return shiftRuleLayout(nodes, mutation.index, -1);
  return moveRuleLayout(nodes, mutation.from, mutation.to);
}

export function moveRuleLayout(nodes: Record<string, Position>, from: number, to: number): Record<string, Position> {
  if (from === to || from < 0 || to < 0) return nodes;
  const next: Record<string, Position> = {};
  for (const [id, position] of Object.entries(nodes)) {
    const match = /^rule-(0|[1-9][0-9]*)$/.exec(id);
    if (!match) { next[id] = position; continue; }
    const index = Number(match[1]);
    const target = index === from ? to : from < to && index > from && index <= to ? index - 1 :
      from > to && index >= to && index < from ? index + 1 : index;
    next[`rule-${target}`] = position;
  }
  return next;
}

export function defaultPosition(id: string): Position {
  if (id === "questions") return { x: 50, y: 80 };
  if (id === "fallback") return { x: 50, y: 280 };
  if (id.startsWith("rule-")) {
    const index = Number(id.slice(5));
    return { x: 400 + Math.floor(index / 50) * 210, y: 80 + (index % 50) * 140 };
  }
  if (id.startsWith("zone::")) return { x: 850, y: 80 };
  return { x: 2200, y: 80 };
}

export type ConnectionIntent = { kind: "reconnect"; edge: WorkflowEdge } | { kind: "new-pool"; from: string } | { kind: "remove"; edge: WorkflowEdge };
export type ConnectionReason = "context" | "stale" | "unknownLabel" | "unknownModel" | "explicit" | "duplicate" | "lastMember" | "order" | "fixed" | "invalid";
export type ConnectionResult = { operation: "match" | "order" | "add" | "move" | "remove" | "noop" | null; reason: ConnectionReason | null };
const allow = (operation: Exclude<ConnectionResult["operation"], null>): ConnectionResult => ({ operation, reason: null });
const block = (reason: ConnectionReason): ConnectionResult => ({ operation: null, reason });

/** Classify UI intent only. The draft mutation helpers revalidate on commit. */
export function classifyConnection(draft: RoutingDraft, config: ConfigurationPayload, intent: ConnectionIntent, target: string): ConnectionResult {
  if (intent.kind === "remove" || intent.kind === "reconnect") {
    if (!workflowEdgeExists(draft, config, intent.edge)) return block("stale");
    if (intent.edge.kind === "context") return block("context");
    if (intent.edge.kind === "default") return block("fixed");
  }
  if (intent.kind === "new-pool" || (intent.kind === "reconnect" && intent.edge.kind === "pool") || intent.kind === "remove") {
    const source = intent.kind === "new-pool" ? intent.from : intent.edge.from;
    const label = config.labels.find((item) => `zone::${item.tag}` === source);
    if (!label) return block("unknownLabel");
    if (label.resolution !== "tag") return block("explicit");
    const modelId = target.startsWith("model::") ? target.slice(7) : "";
    if (!Object.hasOwn(draft.models, modelId) || !config.models.some((model) => model.id === modelId)) return block("unknownModel");
    if (intent.kind === "remove") {
      if (intent.edge.to !== target) return block("invalid");
      return labelMembers(draft, config, label).length > 1 ? allow("remove") : block("lastMember");
    }
    if (intent.kind === "new-pool") return draft.models[modelId]!.tags.includes(label.tag) ? block("duplicate") : allow("add");
    if (intent.edge.to === target) return allow("noop");
    if (labelMembers(draft, config, label).length <= 1) return block("lastMember");
    return draft.models[modelId]!.tags.includes(label.tag) ? block("duplicate") : allow("move");
  }
  if (intent.kind === "reconnect" && intent.edge.kind === "match") {
    if (!config.labels.some((label) => `zone::${label.tag}` === target)) return block("unknownLabel");
    return intent.edge.to === target ? allow("noop") : allow("match");
  }
  if (intent.kind === "reconnect" && intent.edge.kind === "unmatched") {
    const from = Number(intent.edge.from.slice(5));
    const to = Number(target.slice(5));
    if (target === intent.edge.to) return allow("noop");
    if (intent.edge.to === "fallback" || target === "fallback") return block("fixed");
    return Number.isInteger(to) && to > from + 1 && to < draft.rules.length ? allow("order") : block("order");
  }
  return block("invalid");
}

export type ViewportSize = { width: number; height: number };
export type ViewportPlan = { zoom: number; scroll: Position; mode: "board" | "group" | "node" };
export type Rect = { left: number; top: number; right: number; bottom: number };
export const INSPECTOR_SIZE = { width: 340, height: 460 };
export const MIN_INSPECTOR_HEIGHT = 120;
// At 1x the normal content origin is 12px below the free area's top edge.
const CANONICAL_INSET = { x: 0, y: 12 };
export type ViewportReference = { origin: Position; focal: Position; maxScroll: Position };

/** Schema-v1 viewport: the scroll at 1x with a fixed free-area origin inset. */
export function canonicalViewport(scroll: Position, zoom: number, { origin, focal }: ViewportReference): Position {
  const coordinate = (axis: "x" | "y") => Math.max(-MAX_COORD, Math.min(MAX_COORD,
    Math.round((scroll[axis] + focal[axis] - origin[axis]) / zoom + CANONICAL_INSET[axis])));
  return { x: coordinate("x"), y: coordinate("y") };
}

/** Restore the same board point at the current free-area top left, then clamp. */
export function restoreCanvasViewport(saved: Position, zoom: number, { origin, focal, maxScroll }: ViewportReference): Position {
  const coordinate = (axis: "x" | "y") => Math.max(0, Math.min(maxScroll[axis],
    (saved[axis] - CANONICAL_INSET[axis]) * zoom + origin[axis] - focal[axis]));
  return { x: coordinate("x"), y: coordinate("y") };
}

export function visibleCanvasRect(canvas: Rect, page: Rect): Rect | null {
  const rect = { left: Math.max(canvas.left, page.left), top: Math.max(canvas.top, page.top),
    right: Math.min(canvas.right, page.right), bottom: Math.min(canvas.bottom, page.bottom) };
  return rect.right > rect.left && rect.bottom > rect.top ? rect : null;
}

export function pageViewport(): Rect {
  const viewport = window.visualViewport;
  const rect = viewport ? { left: viewport.offsetLeft, top: viewport.offsetTop,
    right: viewport.offsetLeft + viewport.width, bottom: viewport.offsetTop + viewport.height }
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const header = document.querySelector(".app-header");
  if (header) rect.top = Math.max(rect.top, header.getBoundingClientRect().bottom);
  return rect;
}

/** Overlay bands use their measured DOM bounds, including wrapped controls. */
export function unoccludedCanvasRect(canvas: Rect, page: Rect, occlusions: { edge: "top" | "bottom"; rect: Rect }[]): Rect | null {
  const visible = visibleCanvasRect(canvas, page);
  if (!visible) return null;
  for (const { edge, rect } of occlusions) {
    if (!visibleCanvasRect(rect, visible)) continue;
    if (edge === "top") visible.top = Math.max(visible.top, rect.bottom);
    else visible.bottom = Math.min(visible.bottom, rect.top);
  }
  return visible.bottom > visible.top ? visible : null;
}

export function canvasAvailableRect(canvas: HTMLElement, includeToolbar = true): Rect | null {
  const occlusions = [...(canvas.closest(".workflow-workspace")?.querySelectorAll<HTMLElement>("[data-canvas-occlusion]") ?? [])]
    .filter((element) => includeToolbar || !element.classList.contains("canvas-tools"))
    .map((element) => ({ edge: element.dataset.canvasOcclusion as "top" | "bottom", rect: element.getBoundingClientRect() }));
  return unoccludedCanvasRect(canvas.getBoundingClientRect(), pageViewport(), occlusions);
}

/** Keep the selected node exposed even when the inspector must stack on mobile. */
export function inspectorPosition(anchor: Rect, workspace: Rect, panel: ViewportSize, toolbar?: Rect): (Position & ViewportSize) | null {
  const padding = 12;
  const left = workspace.left + padding;
  const top = workspace.top + padding;
  const availableBottom = Math.min(workspace.bottom, toolbar?.top ?? workspace.bottom) - padding;
  const width = Math.min(panel.width, workspace.right - left - padding);
  let height = Math.min(panel.height, availableBottom - top);
  if (width <= 0 || height < MIN_INSPECTOR_HEIGHT) return null;
  const right = workspace.right - width - padding;
  const beside = anchor.right + padding;
  const before = anchor.left - width - padding;
  if (beside <= right || before >= left) {
    return { x: Math.max(left, Math.min(right, beside <= right ? beside : before)), y: Math.max(top, Math.min(availableBottom - height, anchor.top)), width, height };
  }
  const above = Math.max(0, anchor.top - padding - top);
  const below = Math.max(0, availableBottom - anchor.bottom - padding);
  height = Math.min(height, Math.max(above, below));
  if (height < MIN_INSPECTOR_HEIGHT) return null;
  const y = below >= above ? anchor.bottom + padding : anchor.top - padding - height;
  return { x: Math.max(left, Math.min(right, anchor.left)), y: Math.max(top, Math.min(availableBottom - height, y)), width, height };
}

/** Center a reveal unless stacking the inspector needs the node near the top. */
export function planNodeReveal(
  at: Position, size: ViewportSize, zoom: number, canvas: Rect, free: Rect,
  reference: ViewportReference, withInspector: boolean,
): { scroll: Position; anchor: Rect; inspector: (Position & ViewportSize) | null } {
  const width = size.width * zoom, height = size.height * zoom;
  const place = (left: number, top: number) => {
    const scroll = {
      x: Math.max(0, Math.min(reference.maxScroll.x, reference.origin.x + at.x * zoom - (left - canvas.left))),
      y: Math.max(0, Math.min(reference.maxScroll.y, reference.origin.y + at.y * zoom - (top - canvas.top))),
    };
    const x = canvas.left + reference.origin.x + at.x * zoom - scroll.x;
    const y = canvas.top + reference.origin.y + at.y * zoom - scroll.y;
    const anchor = { left: x, top: y, right: x + width, bottom: y + height };
    return { scroll, anchor, inspector: inspectorPosition(anchor, free, INSPECTOR_SIZE) };
  };
  const left = free.left + (free.right - free.left - width) / 2;
  const centered = place(left, free.top + (free.bottom - free.top - height) / 2);
  const fullyVisible = (candidate: typeof centered) =>
    candidate.anchor.left >= free.left && candidate.anchor.right <= free.right &&
    candidate.anchor.top >= free.top && candidate.anchor.bottom <= free.bottom;
  if (!withInspector || (fullyVisible(centered) && centered.inspector)) return centered;
  const upper = place(left, free.top + 12);
  if (fullyVisible(upper) && upper.inspector) return upper;
  const lower = place(left, free.bottom - height - 12);
  if (fullyVisible(lower) && lower.inspector) return lower;
  return fullyVisible(centered) ? centered : fullyVisible(upper) ? upper : lower;
}

/** A dismissible sheet keeps editing available when a node and panel cannot fit. */
export function inspectorFallbackPosition(free: Rect | null, workspace: Rect): Position & ViewportSize {
  const area = free && free.bottom - free.top >= MIN_INSPECTOR_HEIGHT + 24 ? free : workspace;
  const padding = Math.min(12, (area.bottom - area.top) / 8, (area.right - area.left) / 8);
  return { x: area.left + padding, y: area.top + padding,
    width: Math.min(INSPECTOR_SIZE.width, Math.max(0, area.right - area.left - padding * 2)),
    height: Math.min(INSPECTOR_SIZE.height, Math.max(0, area.bottom - area.top - padding * 2)) };
}

/** Call before removing/hiding inspector content, while its active field exists. */
export function handoffInspectorFocus(panel: HTMLElement | null, node: HTMLElement | null, canvas: HTMLElement | null, free: Rect | null): void {
  if (!panel || !panel.contains(panel.ownerDocument.activeElement)) return;
  const rect = node?.getBoundingClientRect();
  const exposed = rect && free && rect.left >= free.left && rect.right <= free.right && rect.top >= free.top && rect.bottom <= free.bottom;
  (exposed ? node : canvas)?.focus({ preventScroll: true });
}

export function canvasToolShortcut(key: string, editing: boolean, modified: boolean): "select" | "pan" | null {
  if (editing || modified) return null;
  return key.toLowerCase() === "v" ? "select" : key.toLowerCase() === "h" ? "pan" : null;
}

export function reconcileRuleSelection(id: string, mutation: RuleLayoutMutation): string {
  if (!/^rule-\d+$/.test(id)) return id;
  const mapped = reconcileRuleLayout({ [id]: { x: 0, y: 0 } }, mutation);
  return Object.keys(mapped)[0] ?? "";
}

function nodeBounds(ids: string[], positions: Record<string, Position>) {
  const points = ids.map((id) => positions[id]).filter((at): at is Position => at !== undefined);
  if (!points.length) return null;
  return {
    left: Math.min(...points.map((at) => at.x)), top: Math.min(...points.map((at) => at.y)),
    right: Math.max(...points.map((at) => at.x + 190)), bottom: Math.max(...points.map((at) => at.y + 56)),
  };
}

/** Choose a readable view when a whole-board fit would shrink modules beyond use. */
export function planFitViewport(
  positions: Record<string, Position>, selected: string, selection: string[],
  viewport: ViewportSize, board: ViewportSize,
): ViewportPlan {
  const all = nodeBounds(Object.keys(positions), positions);
  const fallback = { zoom: 1, scroll: { x: 0, y: 0 }, mode: "node" as const };
  if (!all || viewport.width <= 0 || viewport.height <= 0) return fallback;
  const fit = (bounds: NonNullable<typeof all>) => Math.min(1.75,
    Math.max(0, viewport.width - 64) / (bounds.right - bounds.left),
    Math.max(0, viewport.height - 64) / (bounds.bottom - bounds.top));
  let bounds = all;
  let mode: ViewportPlan["mode"] = "board";
  let zoom = fit(bounds);
  if (viewport.width < 600 || zoom < MIN_ZOOM) {
    const group = nodeBounds(selection, positions);
    const focusId = selection.find((id) => positions[id]) ?? (positions[selected] ? selected : Object.keys(positions)[0]!);
    const useGroup = selection.length > 1 && group !== null && fit(group) >= 0.75;
    bounds = useGroup ? group! : nodeBounds([focusId], positions)!;
    mode = useGroup ? "group" : "node";
    zoom = Math.min(1, Math.max(MIN_ZOOM, fit(bounds)));
  }
  zoom = Math.max(MIN_ZOOM, zoom);
  return {
    zoom, mode,
    scroll: {
      x: Math.max(0, Math.min(board.width * zoom - viewport.width, (bounds.left + bounds.right) * zoom / 2 - viewport.width / 2)),
      y: Math.max(0, Math.min(board.height * zoom - viewport.height, (bounds.top + bounds.bottom) * zoom / 2 - viewport.height / 2)),
    },
  };
}

/** Inverse viewport mapping keeps saved coordinates independent of zoom. */
export function boardPoint(client: Position, rect: Position, scroll: Position, zoom: number): Position {
  return { x: (client.x - rect.x + scroll.x) / zoom, y: (client.y - rect.y + scroll.y) / zoom };
}

/** A node press becomes a drag only after the pointer travels more than four CSS pixels. */
export function crossedDragThreshold(start: Position, current: Position): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > 4;
}

/** Convert the captured pointer's CSS-pixel displacement to unscaled board coordinates. */
export function dragDisplacement(start: Position, current: Position, zoom: number): Position {
  return { x: (current.x - start.x) / zoom, y: (current.y - start.y) / zoom };
}

/** Retain the lock after release to ignore scroll events from the final correction. */
export function nodeDragScrollLock(drag: { moved: boolean; scroll: Position } | null, current: Position, previous: Position | null): Position | null {
  if (drag?.moved) return drag.scroll;
  return previous && current.x === previous.x && current.y === previous.y ? previous : null;
}

/** Preview a group from the gesture snapshot, never from an earlier preview frame. */
export function draggedLayout(layout: CanvasLayout, starts: Record<string, Position>, delta: Position, width: number, height: number): { layout: CanvasLayout; changed: boolean } {
  const ids = Object.keys(starts);
  const moved = translateNodes(starts, ids, delta, width, height);
  const changed = ids.some((id) => moved[id]!.x !== starts[id]!.x || moved[id]!.y !== starts[id]!.y);
  return { layout: changed ? { ...layout, nodes: { ...layout.nodes, ...moved } } : layout, changed };
}
export function marqueeNodes(start: Position, end: Position, positions: Record<string, Position>): string[] {
  const left = Math.min(start.x, end.x), right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y);
  return Object.entries(positions).filter(([, at]) => at.x < right && at.x + 190 > left && at.y < bottom && at.y + 56 > top).map(([id]) => id);
}
export function translateNodes(positions: Record<string, Position>, ids: string[], delta: Position, width: number, height: number): Record<string, Position> {
  if (!ids.length) return {};
  const points = ids.map((id) => positions[id]!);
  const dx = Math.max(-Math.min(...points.map((point) => point.x)),
    Math.min(Math.min(9790, width - 210) - Math.max(...points.map((point) => point.x)), Math.round(delta.x)));
  const dy = Math.max(-Math.min(...points.map((point) => point.y)),
    Math.min(Math.min(9915, height - 85) - Math.max(...points.map((point) => point.y)), Math.round(delta.y)));
  return Object.fromEntries(ids.map((id) => [id, { x: positions[id]!.x + dx, y: positions[id]!.y + dy }]));
}

/** Only edits representable by the ordered matrix are accepted. */
export function reconnectEdge(
  draft: RoutingDraft, config: ConfigurationPayload, edge: WorkflowEdge, target: string,
): RoutingDraft | null {
  // Only an edge in the current graph can be rewired. Stale gestures must not
  // overwrite an edit made while the pointer was in flight.
  const connection = classifyConnection(draft, config, { kind: "reconnect", edge }, target);
  if (!connection.operation) return null;
  if (connection.operation === "noop") return draft;
  const label = config.labels.find((item) => `zone::${item.tag}` === target);
  if (edge.kind === "match" && label) {
    if (edge.from === "fallback") return setFallback(draft, { label: label.name });
    if (/^rule-(?:0|[1-9][0-9]*)$/.test(edge.from)) {
      const index = Number(edge.from.slice(5));
      return draft.rules[index] ? setRuleChoice(draft, index, { label: label.name }) : null;
    }
  }
  if (edge.kind === "unmatched" && target === edge.to) return draft;
  if (edge.kind === "pool" && edge.from.startsWith("zone::") && target.startsWith("model::")) {
    const source = config.labels.find((item) => `zone::${item.tag}` === edge.from);
    const model = target.slice(7);
    if (source?.resolution === "tag" && Object.hasOwn(draft.models, model)) {
      if (!edge.to.startsWith("model::") || !Object.hasOwn(draft.models, edge.to.slice(7))) return null;
      if (edge.to !== target && labelMembers(draft, config, source).length <= 1) return null;
      if (edge.to === target) return draft;
      if (draft.models[model]!.tags.includes(source.tag)) return null;
      return setLabelMembership(
        setLabelMembership(draft, edge.to.slice(7), source.tag, false), model, source.tag, true,
      );
    }
  }
  if (edge.kind === "unmatched" && edge.from.startsWith("rule-") && target.startsWith("rule-")) {
    const from = Number(edge.from.slice(5));
    const to = Number(target.slice(5));
    // The successor of the current rule may move immediately after it; no skipping or cycles.
    if (Number.isInteger(from) && Number.isInteger(to) && to > from + 1 && to < draft.rules.length) {
      return moveRule(draft, to, from + 1);
    }
  }
  // Last unmatched edge is necessarily fallback. Removing an edge or arbitrary topology is invalid.
  return null;
}

export function disconnectPoolEdge(draft: RoutingDraft, config: ConfigurationPayload, edge: WorkflowEdge): RoutingDraft | null {
  if (edge.kind !== "pool" || classifyConnection(draft, config, { kind: "remove", edge }, edge.to).reason) return null;
  const label = config.labels.find((item) => `zone::${item.tag}` === edge.from);
  const model = edge.to.slice(7);
  return label?.resolution === "tag" && labelMembers(draft, config, label).length > 1 && Object.hasOwn(draft.models, model) &&
    draft.models[model]!.tags.includes(label.tag) ? setLabelMembership(draft, model, label.tag, false) : null;
}

/** A new label-to-model link adds membership without removing other links. */
export function connectPoolEdge(draft: RoutingDraft, config: ConfigurationPayload, source: string, target: string): RoutingDraft | null {
  if (classifyConnection(draft, config, { kind: "new-pool", from: source }, target).reason) return null;
  const label = config.labels.find((item) => `zone::${item.tag}` === source);
  const model = target.startsWith("model::") ? target.slice(7) : "";
  return label?.resolution === "tag" && Object.hasOwn(draft.models, model) &&
    !draft.models[model]!.tags.includes(label.tag) ? setLabelMembership(draft, model, label.tag, true) : null;
}

/** Reject inert explicit-model edits and removal of the last resolved model. */
export function changeLabelMembership(
  draft: RoutingDraft, config: ConfigurationPayload, modelId: string, tag: string, member: boolean,
): RoutingDraft | null {
  const label = config.labels.find((item) => item.tag === tag);
  const model = draft.models[modelId];
  if (!label || label.resolution !== "tag" || !model) return null;
  if (!member && model.tags.includes(tag) && labelMembers(draft, config, label).length <= 1) return null;
  return setLabelMembership(draft, modelId, tag, member);
}

function workflowEdgeExists(draft: RoutingDraft, config: ConfigurationPayload, edge: WorkflowEdge): boolean {
  // Check the whole tuple; a target alone can exist on several distinct edges.
  return workflowEdges(draft, config).some((current) =>
    current.from === edge.from && current.to === edge.to && current.kind === edge.kind);
}

export function compatibleTargets(draft: RoutingDraft, config: ConfigurationPayload, edge: WorkflowEdge): string[] {
  if (edge.kind === "unmatched" && edge.to === "fallback") return [];
  const candidates = ["questions", "fallback", ...draft.rules.map((_, index) => `rule-${index}`),
    ...config.labels.map((label) => `zone::${label.tag}`), ...config.models.map((model) => `model::${model.id}`)];
  return candidates.filter((target) => classifyConnection(draft, config, { kind: "reconnect", edge }, target).reason === null);
}
