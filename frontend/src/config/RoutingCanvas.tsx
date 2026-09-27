import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { api } from "../api";
import type { CanvasLayout, ConfigurationPayload } from "../api";
import { useTranslation } from "../i18n";
import CanvasNodeContent, { getCanvasNodeKind } from "./CanvasNodeContent";
import { BOARD_HEIGHT, BOARD_WIDTH, MIN_ZOOM, boardPoint, canonicalViewport, canvasAvailableRect, canvasToolShortcut, classifyConnection, compatibleTargets, connectPoolEdge, createLayoutWriteQueue, crossedDragThreshold, defaultPosition, disconnectPoolEdge, dragDisplacement, draggedLayout, marqueeNodes, nodeDragScrollLock, planFitViewport, planNodeReveal, reconcileRuleLayout, reconnectEdge, restoreCanvasViewport, translateNodes, validLayout } from "./canvas";
import type { ConnectionIntent, ConnectionReason, RuleLayoutMutation } from "./canvas";
import type { Position } from "./canvas";
import { NODE_CARD_BASE_HEIGHT, NODE_CARD_PORT_RADIUS, NODE_CARD_WIDTH, nodeCardCenter, nodeCardPorts, nodeCardPortsWithCenter } from "./node-card";
import { workflowEdges } from "./draft";
import type { RoutingDraft, WorkflowEdge } from "./draft";

interface Props {
  heading: ReactNode;
  // Compose the canvas-owned lists into the editor drawer without leaving DndContext.
  children: (information: ReactNode) => ReactNode;
  draft: RoutingDraft;
  config: ConfigurationPayload;
  disabled: boolean;
  selected: string;
  selection: string[];
  onSelect: (id: string, focusInspector?: boolean) => void;
  onSelection: (ids: string[]) => void;
  onDraft: (draft: RoutingDraft, mutation?: RuleLayoutMutation) => void;
  onError: (message: string) => void;
  onAddRule: () => void;
  canAddRule: boolean;
  onAnchor: (rect: DOMRect | null) => void;
  onDraggingChange?: (dragging: boolean) => void;
  revealNode: { id: string; serial: number } | null;
  onReveal: (id: string) => void;
  inspectorOpen: boolean;
  topology: { serial: number; mutation: RuleLayoutMutation } | null;
}

const emptyLayout = (): CanvasLayout => ({ version: 1, nodes: {}, viewport: { x: 0, y: 0 } });
function viewportReference(canvas: HTMLElement, originY: number) {
  const bounds = canvas.getBoundingClientRect();
  const free = canvasAvailableRect(canvas);
  return { origin: { x: 0, y: originY },
    focal: free ? { x: free.left - bounds.left, y: free.top - bounds.top } : { x: 0, y: originY - 12 },
    maxScroll: { x: Math.max(0, canvas.scrollWidth - canvas.clientWidth), y: Math.max(0, canvas.scrollHeight - canvas.clientHeight) } };
}
const reasonKeys = { context: "canvasReason_context", stale: "canvasReason_stale", unknownLabel: "canvasReason_unknownLabel", unknownModel: "canvasReason_unknownModel", explicit: "canvasReason_explicit", duplicate: "canvasReason_duplicate", lastMember: "canvasReason_lastMember", order: "canvasReason_order", fixed: "canvasReason_fixed", invalid: "canvasReason_invalid" } as const;
function connectionReasonText(t: ReturnType<typeof useTranslation>["t"], reason: ConnectionReason) { return t(reasonKeys[reason]); }

export default function RoutingCanvas({ heading, children, draft, config, disabled, selected, selection, onSelect, onSelection, onDraft, onAddRule, canAddRule, onAnchor, onDraggingChange, inspectorOpen, revealNode, onReveal, topology }: Props) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<CanvasLayout>(emptyLayout);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [tool, setTool] = useState<"select" | "pan">("select");
  const panDrag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [fitMode, setFitMode] = useState<"board" | "group" | "node" | null>(null);
  const [marquee, setMarquee] = useState<{ start: Position; end: Position } | null>(null);
  const marqueeRef = useRef<{ pointerId: number; start: Position; end: Position; additive: boolean } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState("");
  const [activeIntent, setActiveIntent] = useState<ConnectionIntent | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const dragEdge = useRef<WorkflowEdge | { from: string; kind: "new-pool" } | null>(null);
  const [edgePointer, setEdgePointer] = useState<Position | null>(null);
  const [pointerCandidate, setPointerCandidate] = useState("");
  const [keyboardTarget, setKeyboardTarget] = useState("");
  const [keyboardPool, setKeyboardPool] = useState("");
  const [keyboardModel, setKeyboardModel] = useState("");
  const [keyboardCandidate, setKeyboardCandidate] = useState("");
  const [edgeChoice, setEdgeChoice] = useState<{ edge: WorkflowEdge; draft: RoutingDraft } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const originY = useRef(0);
  const restoringViewport = useRef(false);
  const viewportRestoreFrame = useRef<number | null>(null);
  const dragNode = useRef<{ pointerId: number; target: HTMLButtonElement; id: string; x: number; y: number; zoom: number; scroll: Position; width: number; height: number; start: Record<string, Position>; layout: CanvasLayout; moved: boolean; changed: boolean } | null>(null);
  const dragScrollLock = useRef<Position | null>(null);
  const draggingChangeRef = useRef(onDraggingChange);
  const dragEndFrame = useRef<number | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draggingNodes, setDraggingNodes] = useState<string[]>([]);
  const [dragPosition, setDragPosition] = useState<Position | null>(null);
  useEffect(() => { draggingChangeRef.current = onDraggingChange; }, [onDraggingChange]);
  useEffect(() => {
    const canvas = surface.current;
    const preventDragScroll = (event: WheelEvent) => { if (dragNode.current?.moved) event.preventDefault(); };
    // React's delegated wheel listener is passive; this listener must cancel native scrolling.
    canvas?.addEventListener("wheel", preventDragScroll, { passive: false });
    return () => canvas?.removeEventListener("wheel", preventDragScroll);
  }, []);
  const holdNodeScroll = (canvas: HTMLElement) => {
    const lock = nodeDragScrollLock(dragNode.current, { x: canvas.scrollLeft, y: canvas.scrollTop }, dragScrollLock.current);
    dragScrollLock.current = lock;
    if (!lock) return false;
    if (canvas.scrollLeft !== lock.x) canvas.scrollLeft = lock.x;
    if (canvas.scrollTop !== lock.y) canvas.scrollTop = lock.y;
    return true;
  };
  const measureChrome = useCallback(() => {
    const canvas = surface.current;
    if (!canvas) return;
    const viewport = canvas.getBoundingClientRect();
    const visible = canvasAvailableRect(canvas, false);
    const toolbar = toolbarRef.current;
    if (toolbar && viewport) {
      toolbar.style.visibility = visible && visible.bottom - visible.top > 24 ? "visible" : "hidden";
      if (visible) {
        originY.current = visible.top - viewport.top + 12;
        canvas.style.setProperty("--canvas-origin-y", `${originY.current}px`);
        canvas.style.setProperty("--canvas-end-space", `${viewport.bottom - visible.bottom + toolbar.offsetHeight + 36}px`);
        const width = Math.max(0, Math.min(720, visible.right - visible.left - 24));
        toolbar.style.left = `${visible.left - viewport.left + (visible.right - visible.left - width) / 2}px`;
        toolbar.style.width = `${width}px`;
        toolbar.style.bottom = `${viewport.bottom - visible.bottom + 12}px`;
        toolbar.style.maxHeight = `${Math.max(0, visible.bottom - visible.top - 24)}px`;
      }
    }
  }, []);
  const reportAnchor = useCallback(() => {
    if (dragNode.current?.moved) return;
    measureChrome();
    const canvas = surface.current;
    if (!canvas) return;
    const available = canvasAvailableRect(canvas);
    const node = [...canvas.querySelectorAll<HTMLButtonElement>("[data-canvas-node]")]
      .find((item) => item.dataset.canvasNode === selected);
    const rect = node?.getBoundingClientRect();
    onAnchor(inspectorOpen && selection.length <= 1 && rect && available && rect.right > available.left && rect.left < available.right && rect.bottom > available.top && rect.top < available.bottom ? rect : null);
  }, [inspectorOpen, measureChrome, onAnchor, selected, selection.length]);
  useEffect(() => {
    const viewport = surface.current;
    const observer = new ResizeObserver(reportAnchor);
    if (viewport) observer.observe(viewport);
    viewport?.closest(".workflow-workspace")?.querySelectorAll("[data-canvas-occlusion]").forEach((element) => observer.observe(element));
    const header = document.querySelector(".app-header");
    if (header) observer.observe(header);
    window.addEventListener("resize", reportAnchor);
    window.addEventListener("scroll", reportAnchor, true);
    window.visualViewport?.addEventListener("resize", reportAnchor);
    window.visualViewport?.addEventListener("scroll", reportAnchor);
    const frame = requestAnimationFrame(reportAnchor);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", reportAnchor); window.removeEventListener("scroll", reportAnchor, true); window.visualViewport?.removeEventListener("resize", reportAnchor); window.visualViewport?.removeEventListener("scroll", reportAnchor); };
  }, [reportAnchor, zoom, layout, selected]);
  const suppressClick = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef(layout);
  const savedLayout = useRef(layout);
  const layoutWrites = useRef(createLayoutWriteQueue((next) => api.saveCanvasLayout(next)));
  const aliveRef = useRef(true);
  const restoreViewport = useCallback((saved: Position) => {
    restoringViewport.current = true;
    if (viewportRestoreFrame.current !== null) cancelAnimationFrame(viewportRestoreFrame.current);
    viewportRestoreFrame.current = requestAnimationFrame(() => {
      measureChrome();
      viewportRestoreFrame.current = requestAnimationFrame(() => {
        const canvas = surface.current;
        if (canvas) {
          const next = restoreCanvasViewport(saved, zoomRef.current, viewportReference(canvas, originY.current));
          canvas.scrollLeft = next.x;
          canvas.scrollTop = next.y;
        }
        viewportRestoreFrame.current = requestAnimationFrame(() => { restoringViewport.current = false; viewportRestoreFrame.current = null; });
      });
    });
  }, [measureChrome]);

  useEffect(() => {
    let alive = true;
    const writes = layoutWrites.current;
    aliveRef.current = true;
    void api.canvasLayout().then((loaded) => {
      if (!alive) return;
      if (validLayout(loaded)) {
        layoutRef.current = loaded;
        savedLayout.current = loaded;
        setLayout(loaded);
        setLayoutError(loaded.read_error ? "unreadable" : null);
        restoreViewport(loaded.viewport);
      } else setLayoutError("unreadable");
      setLoaded(true);
    }).catch((error: unknown) => { if (alive) { setLayoutError(error instanceof Error ? error.message : String(error)); setLoaded(true); } });
    return () => {
      alive = false;
      aliveRef.current = false;
      writes.invalidate();
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      if (clickTimer.current) clearTimeout(clickTimer.current);
      if (viewportRestoreFrame.current !== null) cancelAnimationFrame(viewportRestoreFrame.current);
      if (dragEndFrame.current !== null) cancelAnimationFrame(dragEndFrame.current);
      const drag = dragNode.current;
      dragNode.current = null;
      if (drag) {
        layoutRef.current = drag.layout;
        if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
        if (drag.moved) draggingChangeRef.current?.(false);
      }
    };
  }, [restoreViewport]);

  const nodes = useMemo(() => [
    { id: "questions", text: t("questions") },
    ...draft.rules.map((_, index) => ({ id: `rule-${index}`, text: `${t("rule")} ${index + 1}` })),
    { id: "fallback", text: t("fallback") },
    ...config.labels.map((label) => ({ id: `zone::${label.tag}`, text: label.name })),
    ...config.models.map((model) => ({ id: `model::${model.id}`, text: model.id })),
  ], [draft.rules, config.labels, config.models, t]);
  const edges = workflowEdges(draft, config);
  const addPortNodes = new Set(config.labels.filter((label) => label.resolution === "tag").map((label) => `zone::${label.tag}`));
  const outgoingEdges = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const outgoing = outgoingEdges.get(edge.from) ?? [];
    outgoing.push(edge);
    outgoingEdges.set(edge.from, outgoing);
  }
  const edgePorts = new Map([...outgoingEdges].flatMap(([id, outgoing]) => {
    const ports = addPortNodes.has(id) ? nodeCardPortsWithCenter(outgoing.length) : nodeCardPorts(outgoing.length);
    return outgoing.map((edge, index) => [edge, ports[index]!] as const);
  }));
  const validNodeIds = new Set(nodes.map((node) => node.id));
  const activeEdgeChoice = edgeChoice?.draft === draft && validNodeIds.has(edgeChoice.edge.from) && validNodeIds.has(edgeChoice.edge.to) &&
    edges.some((edge) => edge.from === edgeChoice.edge.from && edge.to === edgeChoice.edge.to && edge.kind === edgeChoice.edge.kind)
    ? edgeChoice.edge : null;
  const positions = useMemo(() => Object.fromEntries(nodes.map((node, index) => {
    const defaultAt = defaultPosition(node.id);
    const at = layout.nodes[node.id] ?? (node.id.startsWith("zone::") ? (() => {
      const position = config.labels.findIndex((label) => `zone::${label.tag}` === node.id);
      return { x: defaultAt.x + Math.floor(position / 50) * 210, y: 80 + (position % 50) * 160 };
    })() : node.id.startsWith("model::") ? (() => {
      const position = index - nodes.length + config.models.length;
      return { x: defaultAt.x + Math.floor(position / 50) * 210, y: 80 + (position % 50) * 110 };
    })() : defaultAt);
    return [node.id, at];
  })) as Record<string, Position>, [nodes, layout.nodes, config.labels, config.models.length]);
  const boardWidth = Math.max(BOARD_WIDTH, ...Object.values(positions).map((at) => at.x + 210));
  const boardHeight = Math.max(BOARD_HEIGHT, ...Object.values(positions).map((at) => at.y + 85));
  const canEdit = loaded && !disabled;
  const canConnect = canEdit && tool === "select";

  const clearNodeGesture = (cancel: boolean) => {
    const drag = dragNode.current;
    if (!drag) return null;
    if (surface.current) holdNodeScroll(surface.current);
    dragNode.current = null;
    if (cancel || drag.moved) {
      suppressClick.current = true;
      if (clickTimer.current) clearTimeout(clickTimer.current);
      clickTimer.current = cancel ? null : setTimeout(() => { suppressClick.current = false; clickTimer.current = null; }, 0);
    }
    if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
    setDraggingNodes([]);
    setDragPosition(null);
    if (drag.moved) draggingChangeRef.current?.(false);
    return drag;
  };
  const rollbackLayout = () => {
    if (scrollTimer.current) { clearTimeout(scrollTimer.current); scrollTimer.current = null; }
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    if (dragEndFrame.current !== null) { cancelAnimationFrame(dragEndFrame.current); dragEndFrame.current = null; }
    // Clear capture before replacing the snapshot, so late move/up/lost-capture events do nothing.
    clearNodeGesture(true);
    layoutRef.current = savedLayout.current;
    setLayout(savedLayout.current);
    restoreViewport(savedLayout.current.viewport);
  };
  const persistRef = useRef<(next: CanvasLayout) => void>(() => undefined);
  const persist = (next: CanvasLayout) => {
    if (!canEdit) return;
    // read_error describes a failed GET; it is never part of a layout PUT.
    const writable: CanvasLayout = { version: 1, nodes: next.nodes, viewport: next.viewport };
    void layoutWrites.current.enqueue(writable, (writable, latest) => {
      savedLayout.current = writable;
      if (aliveRef.current && latest) setLayoutError(null);
    }, (error: unknown) => {
      if (aliveRef.current) {
        rollbackLayout();
        setLayoutError(error instanceof Error ? error.message : String(error));
      }
    });
  };
  const appliedTopology = useRef(0);
  useEffect(() => { persistRef.current = persist; });
  useEffect(() => {
    if (!loaded || !topology || topology.serial === appliedTopology.current) return;
    appliedTopology.current = topology.serial;
    const nodes = reconcileRuleLayout(layoutRef.current.nodes, topology.mutation);
    const next = { ...layoutRef.current, nodes };
    layoutRef.current = next;
    queueMicrotask(() => { if (aliveRef.current) { setLayout(next); persistRef.current(next); } });
  }, [loaded, topology]);
  const moveGroup = (ids: string[], starts: Record<string, Position>, delta: Position, save: boolean) => {
    const additions = ids.filter((id) => !Object.hasOwn(layoutRef.current.nodes, id)).length;
    if (Object.keys(layoutRef.current.nodes).length + additions > 256) { setLayoutError(t("canvasLayoutFull")); return; }
    const next = { ...layoutRef.current, nodes: { ...layoutRef.current.nodes, ...translateNodes(starts, ids, delta, boardWidth, boardHeight) } };
    layoutRef.current = next;
    setLayout(next);
    if (save) persist(next);
  };
  const discardLayout = () => {
    if (layoutWrites.current.pending) return;
    layoutWrites.current.invalidate();
    rollbackLayout();
  };
  const startNode = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || !canEdit || activeEdgeChoice || dragNode.current) return;
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    suppressClick.current = false;
    const ids = selection.includes(id) ? selection.filter((item) => Object.hasOwn(positions, item)) : [id];
    if (event.shiftKey) { suppressClick.current = true; toggleSelection(id); return; }
    const additions = ids.filter((item) => !Object.hasOwn(layoutRef.current.nodes, item)).length;
    if (Object.keys(layoutRef.current.nodes).length + additions > 256) { setLayoutError(t("canvasLayoutFull")); return; }
    dragNode.current = { pointerId: event.pointerId, target: event.currentTarget, id, x: event.clientX, y: event.clientY, zoom: zoomRef.current,
      scroll: { x: surface.current?.scrollLeft ?? 0, y: surface.current?.scrollTop ?? 0 },
      width: boardWidth, height: boardHeight, start: Object.fromEntries(ids.map((item) => [item, positions[item]!])),
      layout: layoutRef.current, moved: false, changed: false };
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragNodeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragNode.current;
    if (!drag || drag.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const start = { x: drag.x, y: drag.y };
    const current = { x: event.clientX, y: event.clientY };
    if (!drag.moved && !crossedDragThreshold(start, current)) return;
    if (!drag.moved) {
      drag.moved = true;
      setDraggingNodes(Object.keys(drag.start));
      onDraggingChange?.(true);
      if (scrollTimer.current) { clearTimeout(scrollTimer.current); scrollTimer.current = null; }
      if (viewportRestoreFrame.current !== null) {
        cancelAnimationFrame(viewportRestoreFrame.current);
        viewportRestoreFrame.current = null;
        restoringViewport.current = false;
      }
    }
    event.preventDefault();
    if (surface.current) holdNodeScroll(surface.current);
    const preview = draggedLayout(drag.layout, drag.start, dragDisplacement(start, current, drag.zoom), drag.width, drag.height);
    drag.changed = preview.changed;
    if (!preview.changed) {
      layoutRef.current = drag.layout;
      setLayout(drag.layout);
      setDragPosition(drag.start[drag.id] ?? null);
      return;
    }
    layoutRef.current = preview.layout;
    setLayout(preview.layout);
    setDragPosition(preview.layout.nodes[drag.id] ?? drag.start[drag.id] ?? null);
  };
  const stopNode = (pointerId: number, cancel = false) => {
    if (dragNode.current?.pointerId !== pointerId) return;
    const drag = clearNodeGesture(cancel)!;
    if (!drag.moved) return;
    if (cancel || !drag.changed) {
      layoutRef.current = drag.layout; setLayout(drag.layout);
    } else persist(layoutRef.current);
    if (dragEndFrame.current !== null) cancelAnimationFrame(dragEndFrame.current);
    dragEndFrame.current = requestAnimationFrame(() => { dragEndFrame.current = null; reportAnchor(); });
  };
  const announce = (reason: ConnectionReason | null) => setFeedback(reason ? connectionReasonText(t, reason) : null);
  const removeEdge = (edge: WorkflowEdge) => {
    if (!canConnect) return;
    const result = classifyConnection(draft, config, { kind: "remove", edge }, edge.to);
    const next = result.reason ? null : disconnectPoolEdge(draft, config, edge);
    if (next === null) announce(result.reason ?? "stale");
    else onDraft(next);
    setEdgeChoice(null);
  };
  const applyEdge = (edge: WorkflowEdge, target: string) => {
    if (!canConnect) return;
    const result = classifyConnection(draft, config, { kind: "reconnect", edge }, target);
    const next = result.reason ? null : reconnectEdge(draft, config, edge, target);
    if (next === null) announce(result.reason ?? "stale");
    else {
      announce(null);
      if (next !== draft) {
      let mutation: RuleLayoutMutation | undefined;
      if (edge.kind === "unmatched" && edge.from.startsWith("rule-") && target.startsWith("rule-")) {
        const sourceIndex = Number(edge.from.slice(5));
        const targetIndex = Number(target.slice(5));
        mutation = { kind: "move", from: targetIndex, to: sourceIndex + 1 };
      }
      onDraft(next, mutation);
      }
    }
    dragEdge.current = null;
    setActiveIntent(null);
    setKeyboardTarget("");
    setEdgePointer(null);
    setEdgeChoice(null);
  };
  const applyPool = (source: string, target: string) => {
    if (!canConnect) return;
    const result = classifyConnection(draft, config, { kind: "new-pool", from: source }, target);
    const next = result.reason ? null : connectPoolEdge(draft, config, source, target);
    if (next === null) announce(result.reason ?? "stale");
    else { announce(null); onDraft(next); }
    dragEdge.current = null;
    setActiveIntent(null);
    setEdgePointer(null);
    setKeyboardModel("");
  };
  const pointerOnBoard = (event: { clientX: number; clientY: number }): Position => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect || !surface.current) return { x: 0, y: 0 };
    return boardPoint({ x: event.clientX, y: event.clientY }, { x: rect.left, y: rect.top + originY.current },
      { x: surface.current.scrollLeft, y: surface.current.scrollTop }, zoom);
  };
  const finishEdge = (event: ReactPointerEvent<SVGCircleElement>) => {
    const active = dragEdge.current;
    if (!active || !canConnect) {
      dragEdge.current = null; setActiveIntent(null); setEdgePointer(null); setHoverTarget(""); setPointerCandidate("");
      return;
    }
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-canvas-node]");
    const target = element?.getAttribute("data-canvas-node") ?? "";
    if (target) {
      if (active.kind === "new-pool") applyPool(active.from, target);
      else applyEdge(active, target);
    } else announce("invalid");
    dragEdge.current = null;
    setActiveIntent(null);
    setEdgePointer(null);
    setHoverTarget("");
    setPointerCandidate("");
  };
  const selectNode = (id: string, focusInspector = false) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (tool === "pan") return;
    if (activeEdgeChoice && canEdit) { applyEdge(activeEdgeChoice, id); return; }
    if (selection.length) onSelection([]);
    onSelect(id, focusInspector);
  };
  const toggleSelection = (id: string) => {
    const current = (selection.length ? selection : selected ? [selected] : []).filter((item) => Object.hasOwn(positions, item));
    onSelection(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const chooseTool = (next: "select" | "pan") => {
    if (dragNode.current) stopNode(dragNode.current.pointerId, true);
    setTool(next);
    setEdgeChoice(null);
    dragEdge.current = null;
    setActiveIntent(null); setEdgePointer(null); setHoverTarget(""); setPointerCandidate("");
    if (next === "pan") onSelection([]);
    panDrag.current = null;
    marqueeRef.current = null;
    setMarquee(null);
  };
  const intent = canConnect ? activeIntent ?? (activeEdgeChoice ? { kind: "reconnect" as const, edge: activeEdgeChoice } : null) : null;
  const selectedCount = selection.length > 1 ? selection.length : 0;
  const pointerReason = intent && pointerCandidate ? classifyConnection(draft, config, intent, pointerCandidate).reason : null;
  const selectedEdge = selectedCount ? undefined : edges.find((edge) => edge.from === selected && compatibleTargets(draft, config, edge).length > 0);
  const zoomTo = (next: number) => {
    if (dragNode.current) stopNode(dragNode.current.pointerId, true);
    const viewport = surface.current;
    const saved = viewport ? canonicalViewport({ x: viewport.scrollLeft, y: viewport.scrollTop }, zoomRef.current, viewportReference(viewport, originY.current)) : layoutRef.current.viewport;
    setFitMode(null);
    zoomRef.current = Math.max(MIN_ZOOM, Math.min(1.75, Math.round(next * 4) / 4));
    setZoom(zoomRef.current);
    restoreViewport(saved);
  };
  const pan = (x: number, y: number) => {
    if (dragNode.current) stopNode(dragNode.current.pointerId, true);
    const viewport = surface.current;
    if (!viewport) return;
    viewport.scrollBy({ left: x * Math.max(160, viewport.clientWidth * 0.7), top: y * Math.max(160, viewport.clientHeight * 0.7), behavior: "instant" });
  };
  const revealedSerial = useRef(0);
  useEffect(() => {
    if (!loaded || !revealNode || revealNode.serial === revealedSerial.current || !positions[revealNode.id]) return;
    const frame = requestAnimationFrame(() => {
      const viewport = surface.current;
      if (!viewport || dragNode.current) return;
      revealedSerial.current = revealNode.serial;
      setTool("select");
      setEdgeChoice(null);
      reportAnchor();
      const rect = viewport.getBoundingClientRect();
      const visible = canvasAvailableRect(viewport);
      if (!visible) return;
      const at = positions[revealNode.id]!;
      const node = [...viewport.querySelectorAll<HTMLButtonElement>("[data-canvas-node]")].find((item) => item.dataset.canvasNode === revealNode.id);
      const plan = planNodeReveal(at, { width: node?.offsetWidth ?? NODE_CARD_WIDTH, height: node?.offsetHeight ?? NODE_CARD_BASE_HEIGHT }, zoom, rect, visible, viewportReference(viewport, originY.current), inspectorOpen);
      viewport.scrollTo({ left: plan.scroll.x, top: plan.scroll.y, behavior: "instant" });
      node?.focus({ preventScroll: true });
      reportAnchor();
    });
    return () => cancelAnimationFrame(frame);
  }, [loaded, revealNode, positions, zoom, reportAnchor, inspectorOpen, draggingNodes.length]);
  const fitBoard = () => {
    if (dragNode.current) stopNode(dragNode.current.pointerId, true);
    const viewport = surface.current;
    if (!viewport || !nodes.length) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    restoringViewport.current = true;
    reportAnchor();
    const visibleBounds = canvasAvailableRect(viewport);
    if (!visibleBounds) { restoringViewport.current = false; return; }
    const width = visibleBounds.right - visibleBounds.left;
    const height = visibleBounds.bottom - visibleBounds.top;
    const plan = planFitViewport(positions, selected, selection,
      { width: Math.min(viewport.clientWidth, width), height: Math.min(viewport.clientHeight, height) }, { width: boardWidth, height: boardHeight });
    setFitMode(plan.mode);
    zoomRef.current = plan.zoom;
    setZoom(plan.zoom);
    const fitPageScroll = () => {
      if (!aliveRef.current || dragNode.current) { restoringViewport.current = false; return; }
      const bounds = viewport.getBoundingClientRect();
      const visible = canvasAvailableRect(viewport);
      viewport.scrollLeft = Math.max(0, plan.scroll.x - (visible ? visible.left - bounds.left : 0));
      viewport.scrollTop = Math.max(0, originY.current + plan.scroll.y - (visible ? visible.top - bounds.top : 0));
      if (plan.mode === "node" && inspectorOpen && positions[selected] && visible) {
        const node = [...viewport.querySelectorAll<HTMLButtonElement>("[data-canvas-node]")].find((item) => item.dataset.canvasNode === selected);
        const reveal = planNodeReveal(positions[selected]!, { width: node?.offsetWidth ?? NODE_CARD_WIDTH, height: node?.offsetHeight ?? NODE_CARD_BASE_HEIGHT }, plan.zoom, bounds, visible, viewportReference(viewport, originY.current), true);
        viewport.scrollLeft = reveal.scroll.x;
        viewport.scrollTop = reveal.scroll.y;
      }
      reportAnchor();
      if (canEdit && layoutError !== "unreadable") {
        const next = { ...layoutRef.current, viewport: canonicalViewport({ x: viewport.scrollLeft, y: viewport.scrollTop }, plan.zoom, viewportReference(viewport, originY.current)) };
        layoutRef.current = next;
        persistRef.current(next);
      }
      requestAnimationFrame(() => { restoringViewport.current = false; });
    };
    requestAnimationFrame(() => requestAnimationFrame(fitPageScroll));
  };
  const edgeDescription = (edge: WorkflowEdge) => `${edge.from} ${edge.kind === "context" ? t("firstMatch") : edge.kind === "match" ? t("match") : edge.kind === "unmatched" ? t("unmatched") : t("modelPool")} ${edge.to}`;
  return <section className="canvas-section" aria-label={t("routingCanvas")}>
    <div className="workspace-chrome" data-canvas-occlusion="top">
    {heading}
    {activeEdgeChoice && <p className="notice" role="status">{t("canvasTarget")} <button type="button" onClick={() => setEdgeChoice(null)}>{t("cancel")}</button></p>}
    {layoutError && <p className="notice warn" role="status">{layoutError === "unreadable" ? t("canvasLayoutUnreadable") : layoutError}{canEdit && <button type="button" onClick={() => { setLayoutError(null); persist(layoutRef.current); }}>{t("canvasRetryLayout")}</button>}{loaded && <button type="button" onClick={discardLayout}>{t("canvasDiscardLayout")}</button>}</p>}
    {feedback && <p className="notice warn" role="status">{feedback}</p>}
    {pointerReason && <p className="notice" role="status">{connectionReasonText(t, pointerReason)}</p>}
    {fitMode && <div className="meta" role="status">{t(fitMode === "board" ? "canvasFitBoardStatus" : fitMode === "group" ? "canvasFitGroupStatus" : "canvasFitNodeStatus")}</div>}
    </div>
    <div className="canvas-frame">
    <div className="canvas-tools" data-canvas-occlusion="bottom" ref={toolbarRef} role="toolbar" aria-label={t("canvasTools")} onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }}>
      <button type="button" title={t("canvasSelectTool")} aria-label={t("canvasSelectTool")} aria-pressed={tool === "select"} onClick={() => chooseTool("select")}>↖</button>
      <button type="button" title={t("canvasPanTool")} aria-label={t("canvasPanTool")} aria-pressed={tool === "pan"} onClick={() => chooseTool("pan")}>✋</button>
      <button type="button" title={t("addRule")} aria-label={t("addRule")} disabled={disabled || !canAddRule} onClick={onAddRule}>＋</button>
      <div className="canvas-zoom" role="group" aria-label={t("canvasZoom")}><button type="button" aria-label={t("canvasZoomOut")} onClick={() => zoomTo(zoom - 0.25)}>−</button><output role="status" aria-live="polite" aria-atomic="true" title={dragPosition ? t("canvasLayoutOnly") : t("canvasZoom")} aria-label={dragPosition ? `${t("canvasLayoutOnly")} · x: ${dragPosition.x}, y: ${dragPosition.y}` : t("canvasZoom")}>{dragPosition ? `${dragPosition.x}, ${dragPosition.y}` : `${Math.round(zoom * 100)}%`}</output><button type="button" aria-label={t("canvasZoomIn")} onClick={() => zoomTo(zoom + 0.25)}>+</button><button type="button" title={t("canvasZoomReset")} aria-label={t("canvasZoomReset")} onClick={() => zoomTo(1)}>1:1</button><button type="button" onClick={fitBoard}>{t("canvasZoomFit")}</button></div>
      <div className="canvas-pan" role="group" aria-label={t("canvasPan")}><button type="button" onClick={() => pan(-1, 0)} aria-label={t("canvasPanLeft")}>←</button><button type="button" onClick={() => pan(1, 0)} aria-label={t("canvasPanRight")}>→</button><button type="button" onClick={() => pan(0, -1)} aria-label={t("canvasPanUp")}>↑</button><button type="button" onClick={() => pan(0, 1)} aria-label={t("canvasPanDown")}>↓</button></div>
    </div>
    <div className={`routing-canvas-scroll tool-${tool}`} ref={surface} tabIndex={0} aria-label={t("routingCanvas")}
      onPointerDown={(event) => { if (event.button !== 0 || marqueeRef.current) return; if (tool === "pan") { panDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); return; } if (event.target instanceof Element && event.target.closest("[data-canvas-node], .canvas-edge-handle") || activeEdgeChoice) return; const point = pointerOnBoard(event); marqueeRef.current = { pointerId: event.pointerId, start: point, end: point, additive: event.shiftKey }; event.currentTarget.setPointerCapture(event.pointerId); setMarquee({ start: point, end: point }); }}
      onPointerMove={(event) => { const drag = panDrag.current; if (drag?.pointerId === event.pointerId) { event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX; event.currentTarget.scrollTop = drag.top + drag.y - event.clientY; return; } if (!marqueeRef.current || marqueeRef.current.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const point = pointerOnBoard(event); marqueeRef.current.end = point; setMarquee({ start: marqueeRef.current.start, end: point }); }}
      onPointerUp={(event) => { if (panDrag.current?.pointerId === event.pointerId) { panDrag.current = null; return; } const current = marqueeRef.current; if (!current || current.pointerId !== event.pointerId) return; const found = marqueeNodes(current.start, current.end, positions); const next = current.additive ? [...new Set([...selection.filter((id) => Object.hasOwn(positions, id)), ...found])] : found; onSelection(next); marqueeRef.current = null; setMarquee(null); }}
      onPointerCancel={(event) => { if (panDrag.current?.pointerId === event.pointerId) panDrag.current = null; if (marqueeRef.current?.pointerId === event.pointerId) { marqueeRef.current = null; setMarquee(null); } }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (dragNode.current) { event.preventDefault(); event.stopPropagation(); stopNode(dragNode.current.pointerId, true); return; }
          setEdgeChoice(null); onSelection([]); return;
        }
        const editing = event.target instanceof Element && !!event.target.closest("input, textarea, select, [contenteditable='true']");
        const next = canvasToolShortcut(event.key, editing, event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
        if (next) { event.preventDefault(); chooseTool(next); }
      }}
      onScroll={(event) => {
        if (holdNodeScroll(event.currentTarget)) return;
        reportAnchor();
        if (!canEdit || restoringViewport.current || layoutError === "unreadable") return;
        const viewport = canonicalViewport({ x: event.currentTarget.scrollLeft, y: event.currentTarget.scrollTop }, zoomRef.current, viewportReference(event.currentTarget, originY.current));
        const next = { ...layoutRef.current, viewport };
        layoutRef.current = next;
        if (scrollTimer.current) clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => persist(layoutRef.current), 450);
      }}>
      <div className="routing-canvas-board" style={{ width: boardWidth * zoom, height: `calc(${boardHeight * zoom}px + var(--canvas-origin-y, 0px) + var(--canvas-end-space, 0px))` }}><div className="routing-canvas-content" style={{ width: boardWidth, height: boardHeight, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
        <svg className="routing-canvas-lines" width={boardWidth} height={boardHeight} aria-hidden="true" pointerEvents="none">
          {edges.map((edge, index) => {
            const from = positions[edge.from]; const to = positions[edge.to];
            if (!from || !to) return null;
            const port = edgePorts.get(edge)!;
            const target = nodeCardCenter("left");
            const sx = from.x + port.x; const sy = from.y + port.y;
            const tx = to.x + target.x; const ty = to.y + target.y;
            return <g key={`${edge.from}:${edge.kind}:${edge.to}`}>
              <path d={`M ${sx} ${sy} C ${sx + 70} ${sy}, ${tx - 70} ${ty}, ${tx} ${ty}`} pointerEvents="none" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={edge.kind === "unmatched" ? "6 5" : undefined} />
              {edge.kind !== "context" && <circle cx={sx} cy={sy} r={port.radius} className="canvas-edge-handle" style={{ strokeWidth: Math.min(2, port.radius / 5) }}
                onPointerDown={(event) => { if (!canEdit || tool === "pan") return; event.currentTarget.setPointerCapture(event.pointerId); dragEdge.current = edge; setActiveIntent({ kind: "reconnect", edge }); setEdgePointer({ x: sx, y: sy }); }}
                onPointerMove={(event) => { if (dragEdge.current) { setEdgePointer(pointerOnBoard(event)); const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node") ?? ""; setHoverTarget(target); setPointerCandidate(target); } }}
                onPointerUp={finishEdge} onPointerCancel={() => { dragEdge.current = null; setActiveIntent(null); setEdgePointer(null); setHoverTarget(""); setPointerCandidate(""); }} />}
              <title>{`${edgeDescription(edge)} #${index + 1}`}</title>
            </g>;
          })}
          {config.labels.filter((label) => label.resolution === "tag").map((label) => {
            const from = positions[`zone::${label.tag}`];
            if (!from) return null;
            const port = nodeCardCenter("right");
            const center = { x: from.x + port.x, y: from.y + port.y };
            return <circle key={`add-${label.tag}`} cx={center.x} cy={center.y} r={NODE_CARD_PORT_RADIUS}
              className="canvas-edge-handle canvas-add-handle"
              onPointerDown={(event) => { if (!canEdit || tool === "pan") return; event.currentTarget.setPointerCapture(event.pointerId); dragEdge.current = { from: `zone::${label.tag}`, kind: "new-pool" }; setActiveIntent({ kind: "new-pool", from: `zone::${label.tag}` }); setEdgePointer(center); }}
              onPointerMove={(event) => { if (dragEdge.current) { setEdgePointer(pointerOnBoard(event)); const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node") ?? ""; setHoverTarget(target); setPointerCandidate(target); } }}
              onPointerUp={finishEdge} onPointerCancel={() => { dragEdge.current = null; setActiveIntent(null); setEdgePointer(null); setHoverTarget(""); setPointerCandidate(""); }}>
              <title>{`${t("canvasAddPoolEdge")} ${label.name}`}</title>
            </circle>;
          })}
          {edgePointer && <circle cx={edgePointer.x} cy={edgePointer.y} r="7" className="canvas-edge-preview" />}
        </svg>
        {nodes.map(({ id, text }) => <button key={id} type="button" data-canvas-node={id} data-node-kind={getCanvasNodeKind(id)}
          className={`routing-canvas-node${selection.length > 1 ? selection.includes(id) ? " selected" : "" : selected === id || selection.includes(id) ? " selected" : ""}${intent && classifyConnection(draft, config, intent, id).reason === null ? " compatible" : intent && hoverTarget === id ? " incompatible" : ""}${draggingNodes.includes(id) ? " dragging" : ""}${!canEdit ? " read-only" : ""}`}
          data-dragging={draggingNodes.includes(id) || undefined}
          style={{ left: positions[id]?.x ?? 0, top: positions[id]?.y ?? 0, width: NODE_CARD_WIDTH, height: NODE_CARD_BASE_HEIGHT, minHeight: NODE_CARD_BASE_HEIGHT, maxHeight: NODE_CARD_BASE_HEIGHT }}
          onDoubleClick={() => onReveal(id)}
          title={`${text} · ${id}`}
          aria-label={text}
          onClick={(event) => { if (event.detail === 0 && event.shiftKey) return; selectNode(id, event.detail === 0); }} onPointerDown={(event) => { if (tool === "select" && !activeEdgeChoice) startNode(event, id); }}
          onPointerMove={dragNodeMove} onPointerUp={(event) => stopNode(event.pointerId)} onPointerCancel={(event) => stopNode(event.pointerId, true)}
          onLostPointerCapture={(event) => stopNode(event.pointerId, true)}
          onKeyDown={(event) => {
            if (dragNode.current) { if (event.key !== "Escape") event.preventDefault(); return; }
            if (event.key === "Enter" || event.key === " ") suppressClick.current = false;
            if (tool === "pan") return;
            if (event.shiftKey && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); toggleSelection(id); return; }
            if (!canEdit || !event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const delta = { x: event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0, y: event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0 };
            const ids = selection.includes(id) ? selection.filter((item) => Object.hasOwn(positions, item)) : [id];
            moveGroup(ids, Object.fromEntries(ids.map((item) => [item, positions[item]!])), delta, true);
          }}>
          <CanvasNodeContent id={id} text={text} draft={draft} config={config} />
        </button>)}
        {marquee && <div className="canvas-marquee" style={{ left: Math.min(marquee.start.x, marquee.end.x), top: Math.min(marquee.start.y, marquee.end.y), width: Math.abs(marquee.end.x - marquee.start.x), height: Math.abs(marquee.end.y - marquee.start.y) }} />}
        </div>
      </div>
    </div>
    </div>
    {children(<>
    <div className="canvas-context-actions" role="status"><span>{dragPosition ? `${t("canvasLayoutOnly")} · ${dragPosition.x}, ${dragPosition.y}` : selectedCount ? t("canvasSelectedCount").replace("{count}", String(selectedCount)) : nodes.find((node) => node.id === selected)?.text ?? t("canvasLayoutOnly")}</span>{selected && !inspectorOpen && tool === "select" && <button type="button" onClick={() => onReveal(selected)}>{t("canvasOpenDetails")}</button>}{selectedEdge && <button type="button" disabled={!canConnect} onClick={() => { setEdgeChoice({ edge: selectedEdge, draft }); setKeyboardTarget(""); }}>{t("canvasReconnect")}</button>}{fitMode && <span>{t(fitMode === "board" ? "canvasFitBoardStatus" : fitMode === "group" ? "canvasFitGroupStatus" : "canvasFitNodeStatus")}</span>}</div>
    <details className="canvas-help"><summary>{t("canvasHelpTitle")}</summary><p className="meta">{t("canvasHelp")}</p></details>
    <div className="canvas-lists"><details><summary>{t("canvasNodeList")}</summary><ul>{nodes.map((node) => <li key={node.id}><button type="button" onClick={() => onReveal(node.id)}>{node.text}</button></li>)}</ul></details>
    <details><summary>{t("canvasEdgeList")}</summary><ol>{edges.map((edge) => <li key={`${edge.from}-${edge.kind}-${edge.to}`}>
      <span>{edgeDescription(edge)}</span>{" "}<button type="button" disabled={!canConnect || compatibleTargets(draft, config, edge).length === 0} onClick={() => { setKeyboardTarget(""); setEdgeChoice({ edge, draft }); }}>{t("canvasReconnect")}</button>{edge.kind === "pool" && <button type="button" disabled={!canConnect || !disconnectPoolEdge(draft, config, edge)} onClick={() => removeEdge(edge)}>{t("remove")}</button>}
      {activeEdgeChoice?.from === edge.from && activeEdgeChoice.to === edge.to && activeEdgeChoice.kind === edge.kind && <><select disabled={!canConnect} aria-label={t("canvasTarget")} value={keyboardTarget} onChange={(event) => setKeyboardTarget(event.target.value)}><option value="">{t("canvasTarget")}</option>{compatibleTargets(draft, config, edge).map((id) => <option key={id} value={id}>{nodes.find((node) => node.id === id)?.text ?? id}</option>)}</select><button type="button" disabled={!canConnect || !keyboardTarget} onClick={() => applyEdge(edge, keyboardTarget)}>{t("canvasConnect")}</button><button type="button" onClick={() => setEdgeChoice(null)}>{t("cancel")}</button><ul>{nodes.filter((node) => classifyConnection(draft, config, { kind: "reconnect", edge }, node.id).reason).map((node) => <li key={node.id}>{node.text}: {connectionReasonText(t, classifyConnection(draft, config, { kind: "reconnect", edge }, node.id).reason!)}</li>)}</ul></>}
    </li>)}</ol>
      <label>{t("canvasAddPoolEdge")} <select value={keyboardPool} disabled={!canConnect} onChange={(event) => { setKeyboardPool(event.target.value); setKeyboardModel(""); }}><option value="">{t("chooseLabel")}</option>{config.labels.filter((label) => label.resolution === "tag").map((label) => <option key={label.tag} value={`zone::${label.tag}`}>{label.name}</option>)}</select></label>
      <select aria-label={t("model")} value={keyboardModel} disabled={!canConnect || !keyboardPool} onChange={(event) => setKeyboardModel(event.target.value)}><option value="">{t("model")}</option>{config.models.filter((model) => !draft.models[model.id]?.tags.includes(keyboardPool.slice(6))).map((model) => <option key={model.id} value={`model::${model.id}`}>{model.id}</option>)}</select>
      <button type="button" disabled={!canConnect || !keyboardPool || !keyboardModel} onClick={() => applyPool(keyboardPool, keyboardModel)}>{t("canvasConnect")}</button>
      {keyboardPool && <label>{t("canvasCheckTarget")} <select value={keyboardCandidate} onChange={(event) => setKeyboardCandidate(event.target.value)}><option value="">{t("canvasTarget")}</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.text}</option>)}</select></label>}
      {keyboardPool && keyboardCandidate && <p role="status">{(() => { const result = classifyConnection(draft, config, { kind: "new-pool", from: keyboardPool }, keyboardCandidate); return result.reason ? connectionReasonText(t, result.reason) : t("canvasTargetAllowed"); })()}</p>}
    </details></div>
    </>)}
  </section>;
}
