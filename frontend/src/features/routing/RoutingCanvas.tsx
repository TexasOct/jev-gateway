import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceActive } from "@/shared/navigation/workspace-activity";
import { useWorkspaceFrames } from "@/shared/navigation/useWorkspaceFrames";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Hand, Minus, MousePointer2, Plus, Undo2, Redo2 } from "lucide-react";
import { api, ApiError } from "@/shared/api/client";
import type { CanvasLayout, ConfigurationPayload } from "@/shared/api/types";
import { useTranslation } from "@/shared/i18n";
import { formatRouteLabel } from "@/shared/i18n/route-label";
import CanvasNodeContent, { getCanvasNodeKind } from "./components/CanvasNodeContent";
import { BOARD_HEIGHT, BOARD_WIDTH, MIN_ZOOM, alignNodes, arrangeNodes, boardPoint, canonicalViewport, canvasAvailableRect, canvasToolShortcut, classifyConnection, compatibleTargets, connectMatchEdge, connectPoolEdge, createLayoutWriteQueue, crossedDragThreshold, disconnectEdge, dragDisplacement, draggedLayout, intentTargets, marqueeNodes, nodeDragScrollLock, planFitViewport, planNodeReveal, reconcileRuleLayout, reconnectEdge, restoreCanvasViewport, translateNodes, validLayout } from "./model/canvas";
import type { ConnectionIntent, ConnectionReason, RuleLayoutMutation } from "./model/canvas";
import type { Position } from "./model/canvas";
import { Button } from "@/shared/ui/button";
import { ToolButton } from "@/shared/ui/ToolButton";
import { NODE_CARD_BASE_HEIGHT, NODE_CARD_OUTPUT_HEIGHT, NODE_CARD_WIDTH, nodeCardCenter, nodeCardPorts } from "./model/node-card";
import { canvasDimensions, canvasOutputs } from "./model/outputs";
import type { CanvasOutput } from "./model/outputs";
import { removeRule, invalidQuestions, incompleteLabels, workflowEdges } from "./model/draft";
import { createEditableNode } from "./model/commands";
import { createHistory, isTextEditing, menuPosition } from "./model/history";
import type { RoutingDraft, WorkflowEdge } from "./model/draft";

type VisualOutput = { from: string; output: CanvasOutput };

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
  onUnauthorized?: () => void;
  canAddRule: boolean;
  historyBoundary?: number;
  discardBoundary?: number;
  onAnchor: (rect: DOMRect | null) => void;
  onDraggingChange?: (dragging: boolean) => void;
  onLayoutDirtyChange?: (dirty: boolean) => void;
  revealNode: { id: string; serial: number } | null;
  onReveal: (id: string) => void;
  /** Open the shared model editor Dialog for the model node's exact identity.
   * Returns true when the node was a model node the parent owns. */
  onOpenModel?: (identity: { provider: string; upstream: string }) => boolean;
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
// The measured toolbar keeps its stable class hook; ordinary presentation is utility-styled.

export default function RoutingCanvas({ heading, children, draft, config, disabled, selected, selection, onSelect, onSelection, onDraft, canAddRule, historyBoundary = 0, discardBoundary = 0, onAnchor, onDraggingChange, onLayoutDirtyChange, inspectorOpen, revealNode, onReveal, onOpenModel, topology, onUnauthorized }: Props) {
  const active = useWorkspaceActive();
  const requestAnimationFrame = useWorkspaceFrames(active);
  const activeRef = useRef(active);
  const activityGeneration = useRef(0);
  useLayoutEffect(() => {
    if (!active) ++activityGeneration.current;
    activeRef.current = active;
    const generation = activityGeneration;
    return () => { activeRef.current = false; ++generation.current; };
  }, [active]);
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
  const [activeConnection, setActiveConnection] = useState<{ intent: ConnectionIntent; visual?: VisualOutput } | null>(null);
  const activeIntent = activeConnection?.intent ?? null;
  const [intentDraft, setIntentDraft] = useState<RoutingDraft | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [layoutSaving, setLayoutSaving] = useState(false);
  useEffect(() => { onLayoutDirtyChange?.(layoutSaving); }, [layoutSaving, onLayoutDirtyChange]);
  const [loaded, setLoaded] = useState(false);
  const [readRetry, setReadRetry] = useState(0);
  const trustedLayout = useRef(false);
  const [storedMenu, setMenu] = useState<{ x: number; y: number; point: Position; node?: string; edge?: WorkflowEdge; draft: RoutingDraft } | null>(null);
  const menu = storedMenu?.draft === draft ? storedMenu : null;
  const menuRef = useRef<HTMLDivElement>(null);
  const menuOrigin = useRef<HTMLElement | SVGElement | null>(null);
  type Snapshot = { draft: RoutingDraft; nodes: CanvasLayout["nodes"]; selected: string; selection: string[] };
  const history = useRef(createHistory<Snapshot>((a, b) => JSON.stringify([a.draft, a.nodes]) === JSON.stringify([b.draft, b.nodes])));
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyAvailability, setHistoryAvailability] = useState({ undo: false, redo: false });
  const restoringHistory = useRef(false);
  const historyBoundaryRef = useRef(historyBoundary);
  const discardBoundaryRef = useRef(discardBoundary);
  const baselineDraft = useRef(draft);
  const baselineNodes = useRef<CanvasLayout["nodes"] | null>(null);
  const dragEdge = useRef<{ intent: ConnectionIntent; visual: VisualOutput; draft: RoutingDraft; start: Position; moved: boolean; pointerId: number } | null>(null);
  const connectionDraft = useRef<RoutingDraft | null>(null);
  const connectionOrigin = useRef<HTMLElement | SVGElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [edgePointer, setEdgePointer] = useState<Position | null>(null);
  const [pointerCandidate, setPointerCandidate] = useState("");
  const [keyboardTarget, setKeyboardTarget] = useState("");
  const [keyboardPool, setKeyboardPool] = useState("");
  const [keyboardModel, setKeyboardModel] = useState("");
  const [keyboardCandidate, setKeyboardCandidate] = useState("");
  const surface = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const originY = useRef(0);
  const restoringViewport = useRef(false);
  const viewportRestoreFrame = useRef<number | null>(null);
  const dragNode = useRef<{ pointerId: number; target: HTMLButtonElement; id: string; draft: RoutingDraft; x: number; y: number; zoom: number; scroll: Position; width: number; height: number; start: Record<string, Position>; layout: CanvasLayout; moved: boolean; changed: boolean } | null>(null);
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
    if (!activeRef.current) return;
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
    if (!activeRef.current) return;
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
    if (!active) return;
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
  }, [active, reportAnchor, zoom, layout, selected, requestAnimationFrame]);
  const suppressClick = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef(layout);
  const savedLayout = useRef(layout);
  const layoutInFlight = useRef(false);
  const unauthorizedRef = useRef(onUnauthorized);
  useLayoutEffect(() => { unauthorizedRef.current = onUnauthorized; }, [onUnauthorized]);
  const writeLayout = useCallback(async (next: CanvasLayout) => {
    if (!activeRef.current || !trustedLayout.current) return;
    const generation = activityGeneration.current;
    const current = () => activeRef.current && generation === activityGeneration.current;
    layoutInFlight.current = true;
    try { await api.saveCanvasLayout(next); if (current()) savedLayout.current = next; }
    catch (caught) {
      if (current() && caught instanceof ApiError && caught.status === 401) unauthorizedRef.current?.();
      throw caught;
    } finally {
      layoutInFlight.current = false;
      if (aliveRef.current && current()) setLayoutSaving(layoutWrites.current.pending);
    }
  }, []);
  const layoutWrites = useRef(createLayoutWriteQueue(api.saveCanvasLayout));
  useLayoutEffect(() => { layoutWrites.current = createLayoutWriteQueue(writeLayout); }, [writeLayout]);
  const aliveRef = useRef(true);
  useEffect(() => {
    if (active) return;
    layoutWrites.current.invalidate();
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = null;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = null;
    if (viewportRestoreFrame.current !== null) cancelAnimationFrame(viewportRestoreFrame.current);
    if (dragEndFrame.current !== null) cancelAnimationFrame(dragEndFrame.current);
    viewportRestoreFrame.current = null; dragEndFrame.current = null;
    restoringViewport.current = false;
    const drag = dragNode.current;
    dragNode.current = null;
    if (drag) {
      layoutRef.current = drag.layout;
      if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
    }
    dragEdge.current = null; panDrag.current = null; marqueeRef.current = null;
    dragScrollLock.current = null; connectionDraft.current = null;
    void Promise.resolve().then(() => {
      setLayout(layoutRef.current); setLayoutSaving(layoutInFlight.current); setMenu(null); setMarquee(null);
      setActiveConnection(null); setIntentDraft(null); setEdgePointer(null);
      setDraggingNodes([]); setDragPosition(null); draggingChangeRef.current?.(false);
    });
  }, [active]);
  const restoreViewport = useCallback((saved: Position) => {
    if (!activeRef.current) return;
    restoringViewport.current = true;
    if (viewportRestoreFrame.current !== null) cancelAnimationFrame(viewportRestoreFrame.current);
    viewportRestoreFrame.current = requestAnimationFrame(() => {
      if (!activeRef.current) return;
      measureChrome();
      viewportRestoreFrame.current = requestAnimationFrame(() => {
        if (!activeRef.current) return;
        const canvas = surface.current;
        if (canvas) {
          const next = restoreCanvasViewport(saved, zoomRef.current, viewportReference(canvas, originY.current));
          canvas.scrollLeft = next.x;
          canvas.scrollTop = next.y;
        }
        viewportRestoreFrame.current = requestAnimationFrame(() => { restoringViewport.current = false; viewportRestoreFrame.current = null; });
      });
    });
  }, [measureChrome, requestAnimationFrame]);

  useEffect(() => {
    let alive = true;
    const writes = layoutWrites.current;
    aliveRef.current = true;
    if (!active) return () => { aliveRef.current = false; };
    const generation = activityGeneration.current;
    const current = () => alive && activeRef.current && generation === activityGeneration.current;
    trustedLayout.current = false;
    queueMicrotask(() => { if (current()) setLoaded(false); });
    void api.canvasLayout().then((loaded) => {
      if (!current()) return;
      if (validLayout(loaded) && !loaded.read_error) {
        trustedLayout.current = true;
        layoutRef.current = loaded;
        savedLayout.current = loaded;
        setLayout(loaded);
        setLayoutError(null);
        restoreViewport(loaded.viewport);
        setLoaded(true);
      } else { setLayoutError("unreadable"); setLoaded(false); }
    }).catch((error: unknown) => { if (current()) { if (error instanceof ApiError && error.status === 401) unauthorizedRef.current?.(); setLayoutError(error instanceof Error ? error.message : String(error)); setLoaded(false); } });
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
  }, [active, readRetry, restoreViewport]);

  const nodes = useMemo(() => [
    { id: "questions", text: t("questions") },
    ...draft.rules.map((_, index) => ({ id: `rule-${index}`, text: `${t("rule")} ${index + 1}` })),
    { id: "fallback", text: t("fallback") },
    ...config.labels.map((label) => ({ id: `zone::${label.tag}`, text: label.name })),
    ...config.models.map((model) => ({ id: `model::${model.id}`, text: model.id })),
  ], [draft.rules, config.labels, config.models, t]);
  const edges = workflowEdges(draft, config);
  const outputs = useMemo(() => canvasOutputs(draft, config), [draft, config]);
  const dimensions = useMemo(() => canvasDimensions(outputs), [outputs]);
  const defaults = useMemo(() => arrangeNodes(nodes.map((node) => node.id), dimensions), [nodes, dimensions]);
  const displayEdges = Object.entries(outputs).flatMap(([from, rows]) => rows.flatMap((output, index) =>
    output.edge ? [{ from, output, port: nodeCardPorts(rows.length)[index]! }] : []));
  const positions = useMemo(() => Object.fromEntries(nodes.map((node) => [node.id, layout.nodes[node.id] ?? defaults[node.id]!])) as Record<string, Position>, [nodes, layout.nodes, defaults]);
  const boardWidth = Math.max(BOARD_WIDTH, ...Object.entries(positions).map(([id, at]) => at.x + dimensions[id]!.width + 20));
  const boardHeight = Math.max(BOARD_HEIGHT, ...Object.entries(positions).map(([id, at]) => at.y + dimensions[id]!.height + 29));
  const canEdit = active && loaded && !disabled;
  const canConnect = canEdit && tool === "select";
  const persistRef = useRef<(next: CanvasLayout) => void>(() => undefined);
  const clearConnectionGesture = useCallback(() => {
    const gesture = dragEdge.current;
    dragEdge.current = null;
    const origin = connectionOrigin.current;
    if (gesture && origin?.hasPointerCapture(gesture.pointerId)) origin.releasePointerCapture(gesture.pointerId);
    connectionDraft.current = null;
    setActiveConnection(null); setIntentDraft(null); setEdgePointer(null); setKeyboardTarget("");
    setHoverTarget(""); setPointerCandidate("");
  }, []);

  const clearNodeGesture = useCallback((cancel: boolean) => {
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
  }, []);
  useLayoutEffect(() => {
    if (dragEdge.current && dragEdge.current.draft !== draft) {
      clearConnectionGesture();
      queueMicrotask(() => { if (activeRef.current) setFeedback(t("canvasReason_stale")); });
    }
    const drag = dragNode.current;
    if (!drag || drag.draft === draft) return;
    // A slot can now identify a different rule. Cancel capture before topology remaps it.
    clearNodeGesture(true);
    layoutRef.current = drag.layout;
    const generation = activityGeneration.current;
    queueMicrotask(() => {
      if (!aliveRef.current || !activeRef.current || generation !== activityGeneration.current) return;
      setLayout(drag.layout);
      if (layoutWrites.current.pending || JSON.stringify(drag.layout) !== JSON.stringify(savedLayout.current)) persistRef.current(layoutRef.current);
      else setLayoutSaving(false);
    });
  }, [draft, clearNodeGesture, clearConnectionGesture, t]);
  const rollbackLayout = () => {
    if (scrollTimer.current) { clearTimeout(scrollTimer.current); scrollTimer.current = null; }
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    if (dragEndFrame.current !== null) { cancelAnimationFrame(dragEndFrame.current); dragEndFrame.current = null; }
    // Clear capture before replacing the snapshot, so late move/up/lost-capture events do nothing.
    clearNodeGesture(true);
    layoutRef.current = savedLayout.current;
    setLayout(savedLayout.current);
    setLayoutSaving(layoutWrites.current.pending);
    restoreViewport(savedLayout.current.viewport);
  };
  const persist = (next: CanvasLayout) => {
    if (!canEdit || !activeRef.current || !trustedLayout.current) return;
    const generation = activityGeneration.current;
    const current = () => aliveRef.current && activeRef.current && generation === activityGeneration.current && trustedLayout.current;
    setLayoutSaving(true);
    // read_error describes a failed GET; it is never part of a layout PUT.
    const writable: CanvasLayout = { version: 1, nodes: next.nodes, viewport: next.viewport };
    void layoutWrites.current.enqueue(writable, (writable, latest) => {
      if (!current()) return;
      savedLayout.current = writable;
      if (aliveRef.current && latest) { setLayoutError(null); setLayoutSaving(scrollTimer.current !== null || !!dragNode.current?.moved); }
    }, (error: unknown) => {
      if (current()) {
        setLayoutSaving(false);
        rollbackLayout();
        setLayoutError(error instanceof Error ? error.message : String(error));
      }
    });
  };
  const appliedTopology = useRef(0);
  useEffect(() => { persistRef.current = persist; });
  useEffect(() => {
    if (!active || !loaded || !topology || topology.serial === appliedTopology.current) return;
    appliedTopology.current = topology.serial;
    const nodes = reconcileRuleLayout(layoutRef.current.nodes, topology.mutation);
    const next = { ...layoutRef.current, nodes };
    layoutRef.current = next;
    const generation = activityGeneration.current;
    queueMicrotask(() => { if (aliveRef.current && activeRef.current && generation === activityGeneration.current) { setLayout(next); persistRef.current(next); } });
  }, [active, loaded, topology]);
  useEffect(() => {
    if (!active || !loaded || dragNode.current?.moved) return;
    if (discardBoundaryRef.current !== discardBoundary) {
      discardBoundaryRef.current = discardBoundary;
      if (baselineNodes.current) {
        const next = { ...layoutRef.current, nodes: baselineNodes.current };
        const changed = JSON.stringify(next) !== JSON.stringify(layoutRef.current);
        layoutRef.current = next;
        const generation = activityGeneration.current;
        if (changed) queueMicrotask(() => { if (aliveRef.current && activeRef.current && generation === activityGeneration.current) { setLayout(next); persistRef.current(next); } });
      }
    }
    const snapshot = { draft, nodes: layoutRef.current.nodes, selected, selection };
    if (historyBoundaryRef.current !== historyBoundary) {
      historyBoundaryRef.current = historyBoundary;
      history.current.reset(snapshot);
      baselineDraft.current = draft;
      baselineNodes.current = snapshot.nodes;
    } else if (restoringHistory.current) restoringHistory.current = false;
    else history.current.record(snapshot);
    if (baselineNodes.current === null || JSON.stringify(draft) === JSON.stringify(baselineDraft.current)) baselineNodes.current = snapshot.nodes;
    const generation = activityGeneration.current;
    queueMicrotask(() => { if (aliveRef.current && activeRef.current && generation === activityGeneration.current) { setHistoryRevision((value) => value + 1); setHistoryAvailability({ undo: history.current.canUndo, redo: history.current.canRedo }); } });
  }, [active, draft, layout.nodes, loaded, selected, selection, historyBoundary, discardBoundary]);
  useEffect(() => {
    if (!active || !menu) return;
    const origin = menuOrigin.current;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const boundMenu = () => {
      const element = menuRef.current; if (!element) return;
      const view = window.visualViewport;
      const width = view?.width ?? window.innerWidth, height = view?.height ?? window.innerHeight;
      const left = view?.offsetLeft ?? 0, top = view?.offsetTop ?? 0;
      element.style.maxWidth = `${Math.max(0, width - 16)}px`;
      element.style.maxHeight = `${Math.max(0, height - 16)}px`;
      const at = menuPosition({ x: menu.x - left, y: menu.y - top }, { width, height }, { width: element.offsetWidth, height: element.offsetHeight });
      element.style.left = `${at.x + left}px`; element.style.top = `${at.y + top}px`;
    };
    boundMenu(); window.addEventListener("resize", boundMenu);
    window.visualViewport?.addEventListener("resize", boundMenu);
    window.visualViewport?.addEventListener("scroll", boundMenu);
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) { setMenu(null); origin?.focus({ preventScroll: true }); } };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMenu(null); origin?.focus({ preventScroll: true }); } };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", dismiss, true); document.removeEventListener("keydown", escape, true); window.removeEventListener("resize", boundMenu); window.visualViewport?.removeEventListener("resize", boundMenu); window.visualViewport?.removeEventListener("scroll", boundMenu); };
  }, [active, menu]);
  const travelHistory = (redo: boolean) => {
    if (!canEdit) return;
    const drag = clearNodeGesture(true);
    if (drag) { layoutRef.current = drag.layout; setLayout(drag.layout); setLayoutSaving(layoutWrites.current.pending); }
    clearConnectionGesture(); setMenu(null);
    const snapshot = redo ? history.current.redo() : history.current.undo();
    if (!snapshot) return;
    restoringHistory.current = true;
    const next = { ...layoutRef.current, nodes: snapshot.nodes };
    layoutRef.current = next; setLayout(next); persist(next);
    onDraft(snapshot.draft);
    if (snapshot.selection.length > 1) onSelection(snapshot.selection);
    else if (snapshot.selected) onSelect(snapshot.selected);
    else onSelection([]);
    setHistoryRevision((value) => value + 1);
    setHistoryAvailability({ undo: history.current.canUndo, redo: history.current.canRedo });
  };
  const openMenu = (event: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, node?: string, edge?: WorkflowEdge) => {
    event.preventDefault(); event.stopPropagation();
    if (dragNode.current || dragEdge.current || panDrag.current || marqueeRef.current) return;
    menuOrigin.current = document.activeElement as HTMLElement | SVGElement | null;
    cancelConnection();
    if (node) onSelect(node);
    const at = menuPosition({ x: event.clientX, y: event.clientY }, { width: window.innerWidth, height: window.innerHeight }, { width: 252, height: 240 });
    setMenu({ ...at, point: pointerOnBoard(event), node, edge, draft });
  };
  const addNode = (kind: "rule" | "question") => {
    if (!canEdit || !menu) return;
    const created = createEditableNode(draft, config, kind);
    if (!created) return;
    if (kind === "rule" && !canAddRule) return;
    const id = created.id;
    const at = { x: Math.round(Math.max(0, Math.min(9700, menu.point.x))), y: Math.round(Math.max(0, Math.min(9700, menu.point.y))) };
    if (!Object.hasOwn(layoutRef.current.nodes, id) && Object.keys(layoutRef.current.nodes).length >= 256) { setFeedback(t("canvasLayoutFull")); return; }
    const nextLayout = { ...layoutRef.current, nodes: { ...layoutRef.current.nodes, [id]: at } };
    layoutRef.current = nextLayout; setLayout(nextLayout); persist(nextLayout);
    onDraft(created.draft); onSelect(id, true); onReveal(id);
    setMenu(null);
  };
  const deleteNode = (id: string) => {
    if (!canEdit) return;
    if (!/^rule-\d+$/.test(id)) { setFeedback(t("canvasProtectedNode")); return; }
    const index = Number(id.slice(5));
    const next = removeRule(draft, index);
    if (next !== draft) { onDraft(next, { kind: "remove", index }); onSelection([]); surface.current?.focus({ preventScroll: true }); }
    setMenu(null);
  };
  const deleteSelection = () => {
    const indices = selection.filter((id) => /^rule-\d+$/.test(id)).map((id) => Number(id.slice(5))).sort((a, b) => b - a);
    if (!indices.length) { setFeedback(t("canvasProtectedNode")); return; }
    const next = indices.reduce((current, index) => removeRule(current, index), draft);
    onDraft(next, { kind: "remove-many", indices });
    onSelection([]); surface.current?.focus({ preventScroll: true });
    if (indices.length !== selection.length) setFeedback(t("canvasProtectedNode"));
  };
  const moveGroup = (ids: string[], starts: Record<string, Position>, delta: Position, save: boolean) => {
    const additions = ids.filter((id) => !Object.hasOwn(layoutRef.current.nodes, id)).length;
    if (Object.keys(layoutRef.current.nodes).length + additions > 256) { setLayoutError(t("canvasLayoutFull")); return; }
    const next = { ...layoutRef.current, nodes: { ...layoutRef.current.nodes, ...translateNodes(starts, ids, delta, boardWidth, boardHeight, dimensions) } };
    layoutRef.current = next;
    setLayout(next);
    if (save) persist(next);
  };
  const saveArrangement = (positions: Record<string, Position>) => {
    if (!canEdit) return;
    const next = { ...layoutRef.current, nodes: { ...layoutRef.current.nodes, ...positions } };
    if (!validLayout(next) || Object.entries(positions).some(([id, at]) => at.x + dimensions[id]!.width > 10000 || at.y + dimensions[id]!.height > 10000)) { setLayoutError(t("canvasLayoutLimits")); return; }
    layoutRef.current = next; setLayout(next); persist(next);
  };
  const discardLayout = () => {
    if (layoutWrites.current.pending) return;
    layoutWrites.current.invalidate();
    rollbackLayout();
  };
  const startNode = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || !canEdit || activeIntent || dragNode.current) return;
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    suppressClick.current = false;
    const ids = selection.includes(id) ? selection.filter((item) => Object.hasOwn(positions, item)) : [id];
    if (event.shiftKey) { suppressClick.current = true; toggleSelection(id); return; }
    const additions = ids.filter((item) => !Object.hasOwn(layoutRef.current.nodes, item)).length;
    if (Object.keys(layoutRef.current.nodes).length + additions > 256) { setLayoutError(t("canvasLayoutFull")); return; }
    dragNode.current = { pointerId: event.pointerId, target: event.currentTarget, id, draft, x: event.clientX, y: event.clientY, zoom: zoomRef.current,
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
      setLayoutSaving(true);
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
    const preview = draggedLayout(drag.layout, drag.start, dragDisplacement(start, current, drag.zoom), drag.width, drag.height, dimensions);
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
      // Starting a drag absorbs a pending viewport debounce. Cancel must still save that
      // pre-drag viewport, and supersede any older queued revision with its restored snapshot.
      if (layoutWrites.current.pending || JSON.stringify(drag.layout) !== JSON.stringify(savedLayout.current)) persist(drag.layout);
      else setLayoutSaving(false);
    } else {
      persist(layoutRef.current);
      history.current.record({ draft, nodes: layoutRef.current.nodes, selected, selection });
      if (JSON.stringify(draft) === JSON.stringify(baselineDraft.current)) baselineNodes.current = layoutRef.current.nodes;
      setHistoryRevision((value) => value + 1);
      setHistoryAvailability({ undo: history.current.canUndo, redo: history.current.canRedo });
    }
    if (dragEndFrame.current !== null) cancelAnimationFrame(dragEndFrame.current);
    dragEndFrame.current = requestAnimationFrame(() => { dragEndFrame.current = null; reportAnchor(); });
  };
  const announce = (reason: ConnectionReason | null) => setFeedback(reason ? connectionReasonText(t, reason) : null);
  const removeEdge = (edge: WorkflowEdge) => {
    if (!canConnect) return;
    const result = classifyConnection(draft, config, { kind: "remove", edge }, edge.to);
    const next = result.reason ? null : disconnectEdge(draft, config, edge);
    if (next === null) announce(result.reason ?? "stale");
    else onDraft(next);
    setActiveConnection(null);
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
    setActiveConnection(null);
    setKeyboardTarget("");
    setEdgePointer(null);
  };
  const applyPool = (source: string, target: string) => {
    if (!canConnect) return;
    const result = classifyConnection(draft, config, { kind: "new-pool", from: source }, target);
    const next = result.reason ? null : connectPoolEdge(draft, config, source, target);
    if (next === null) announce(result.reason ?? "stale");
    else { announce(null); onDraft(next); }
    dragEdge.current = null;
    setActiveConnection(null);
    setEdgePointer(null);
    setKeyboardModel("");
  };
  const pointerOnBoard = (event: { clientX: number; clientY: number }): Position => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect || !surface.current) return { x: 0, y: 0 };
    return boardPoint({ x: event.clientX, y: event.clientY }, { x: rect.left, y: rect.top + originY.current },
      { x: surface.current.scrollLeft, y: surface.current.scrollTop }, zoom);
  };
  const applyIntent = (intent: ConnectionIntent, target: string) => {
    if (!canConnect) return;
    if (connectionDraft.current !== draft) { announce("stale"); cancelConnection(); return; }
    if (intent.kind === "reconnect") { applyEdge(intent.edge, target); cancelConnection(); return; }
    if (intent.kind === "new-pool") { applyPool(intent.from, target); cancelConnection(); return; }
    if (intent.kind === "new-match") {
      const result = classifyConnection(draft, config, intent, target);
      const next = result.reason ? null : connectMatchEdge(draft, config, intent.from, target);
      if (next) { onDraft(next); announce(null); cancelConnection(); }
      else announce(result.reason ?? "stale");
    }
  };
  const cancelConnection = () => {
    clearConnectionGesture();
    const origin = connectionOrigin.current;
    const box = origin?.getBoundingClientRect();
    const free = surface.current && canvasAvailableRect(surface.current);
    if (origin?.isConnected && box && free && box.left >= free.left && box.right <= free.right && box.top >= free.top && box.bottom <= free.bottom) origin.focus({ preventScroll: true });
    else surface.current?.focus({ preventScroll: true });
  };
  const openConnection = (intent: ConnectionIntent, origin: HTMLElement | SVGElement, visual?: VisualOutput) => {
    onSelection([]);
    connectionDraft.current = draft; connectionOrigin.current = origin;
    setIntentDraft(draft);
    const from = intent.kind === "reconnect" || intent.kind === "remove" ? intent.edge.from : intent.from;
    const output = outputs[from]?.find((row) => intent.kind === "reconnect" || intent.kind === "remove"
      ? row.edge?.to === intent.edge.to && row.edge.kind === intent.edge.kind
      : row.id === (intent.kind === "new-match" ? "match" : "add"));
    setActiveConnection({ intent, visual: visual ?? (output ? { from, output } : undefined) }); setKeyboardTarget(""); announce(null);
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("select, button")?.focus({ preventScroll: true }));
  };
  const finishEdge = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = dragEdge.current;
    if (!active) return;
    if (!canConnect) {
      cancelConnection();
      return;
    }
    dragEdge.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!active.moved) { dragEdge.current = null; setEdgePointer(null); openConnection(active.intent, event.currentTarget, active.visual); return; }
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-canvas-node], [data-canvas-input]");
    const target = element?.getAttribute("data-canvas-node") ?? element?.getAttribute("data-canvas-input") ?? "";
    if (active.draft !== draft) announce("stale");
    else if (target) applyIntent(active.intent, target);
    else announce("invalid");
    dragEdge.current = null;
    setActiveConnection(null);
    setEdgePointer(null);
    setHoverTarget("");
    setPointerCandidate("");
  };
  const selectNode = (id: string, focusInspector = false) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (tool === "pan") return;
    if (activeIntent && canEdit) { applyIntent(activeIntent, id); return; }
    if (selection.length) onSelection([]);
    onSelect(id, focusInspector);
  };
  // A model node opens the one shared model editor Dialog for its exact
  // provider/upstream identity. The canvas resolves the identity from the
  // configuration; the shell owns the Dialog and its write boundary.
  const openModelNode = (id: string, trigger?: HTMLElement | null) => {
    if (!id.startsWith("model::") || !onOpenModel) return false;
    const model = config.models.find((item) => `model::${item.id}` === id);
    if (!model) return false;
    trigger?.focus({ preventScroll: true });
    return onOpenModel({ provider: model.provider, upstream: model.upstream_model });
  };
  const toggleSelection = (id: string) => {
    const current = (selection.length ? selection : selected ? [selected] : []).filter((item) => Object.hasOwn(positions, item));
    onSelection(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const chooseTool = (next: "select" | "pan") => {
    if (dragNode.current) stopNode(dragNode.current.pointerId, true);
    if (dragEdge.current || activeIntent) cancelConnection();
    setTool(next);
    dragEdge.current = null;
    setActiveConnection(null); setEdgePointer(null); setHoverTarget(""); setPointerCandidate("");
    if (next === "pan") onSelection([]);
    panDrag.current = null;
    marqueeRef.current = null;
    setMarquee(null);
  };
  const intent = activeIntent;
  const intentStale = !!activeIntent && intentDraft !== draft;
  const outputName = (output: CanvasOutput) => output.name ?? t(output.kind === "add" ? "canvasAddPoolEdge" : output.kind === "failure" ? "canvasQuestionFailure" : output.kind === "match" ? "match" : "unmatched");
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
    if (!active || !loaded || !revealNode || revealNode.serial === revealedSerial.current || !positions[revealNode.id]) return;
    const frame = requestAnimationFrame(() => {
      if (!activeRef.current) return;
      const viewport = surface.current;
      if (!viewport || dragNode.current) return;
      revealedSerial.current = revealNode.serial;
      setTool("select");
      setActiveConnection(null);
      reportAnchor();
      const rect = viewport.getBoundingClientRect();
      const visible = canvasAvailableRect(viewport);
      if (!visible) return;
      const at = positions[revealNode.id]!;
      const node = [...viewport.querySelectorAll<HTMLButtonElement>("[data-canvas-node]")].find((item) => item.dataset.canvasNode === revealNode.id);
      const plan = planNodeReveal(at, dimensions[revealNode.id]!, zoom, rect, visible, viewportReference(viewport, originY.current), inspectorOpen);
      viewport.scrollTo({ left: plan.scroll.x, top: plan.scroll.y, behavior: "instant" });
      node?.focus({ preventScroll: true });
      reportAnchor();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, loaded, revealNode, positions, dimensions, zoom, reportAnchor, inspectorOpen, draggingNodes.length, requestAnimationFrame]);
  const fitBoard = () => {
    if (!activeRef.current) return;
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
      { width: Math.min(viewport.clientWidth, width), height: Math.min(viewport.clientHeight, height) }, { width: boardWidth, height: boardHeight }, dimensions);
    setFitMode(plan.mode);
    zoomRef.current = plan.zoom;
    setZoom(plan.zoom);
    const fitPageScroll = () => {
      if (!aliveRef.current || !activeRef.current || dragNode.current) { restoringViewport.current = false; return; }
      const bounds = viewport.getBoundingClientRect();
      const visible = canvasAvailableRect(viewport);
      viewport.scrollLeft = Math.max(0, plan.scroll.x - (visible ? visible.left - bounds.left : 0));
      viewport.scrollTop = Math.max(0, originY.current + plan.scroll.y - (visible ? visible.top - bounds.top : 0));
      if (plan.mode === "node" && inspectorOpen && positions[selected] && visible) {
        const reveal = planNodeReveal(positions[selected]!, dimensions[selected]!, plan.zoom, bounds, visible, viewportReference(viewport, originY.current), true);
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
  const defaultPath = t("inheritedDefaultPath").replace("{label}", formatRouteLabel("default", t, { defaulted: true }));
  const edgeDescription = (edge: WorkflowEdge) => `${nodes.find((node) => node.id === edge.from)?.text ?? edge.from} · ${edge.kind === "default" ? defaultPath : edge.kind === "context" ? t("questions") : edge.kind === "failure" ? t("canvasQuestionFailure") : edge.kind === "match" ? t("match") : edge.kind === "unmatched" ? t("unmatched") : t("modelPool")} → ${nodes.find((node) => node.id === edge.to)?.text ?? edge.to}`;
  const outputDescription = ({ from, output }: VisualOutput) => {
    const source = nodes.find((node) => node.id === from)?.text ?? from;
    const destination = output.edge?.to;
    return `${source} · ${outputName(output)}${destination ? ` → ${nodes.find((node) => node.id === destination)?.text ?? destination}` : ""}`;
  };
  const nodeState = (id: string) => {
    if (id === "questions" && invalidQuestions(draft).length) return "invalid";
    if (incompleteLabels(draft, config).some((item) => item === id)) return "incomplete";
    return selected === id || selection.includes(id) ? "selected" : "normal";
  };
  return <section className="canvas-section absolute inset-0 min-w-0" aria-label={t("routingCanvas")} data-history-revision={historyRevision} onKeyDown={(event) => {
    if (isTextEditing(event.target) || disabled || menu) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && (key === "z" || key === "y")) { event.preventDefault(); event.stopPropagation(); travelHistory(key === "y" || event.shiftKey); return; }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault(); event.stopPropagation();
      if (activeConnection?.intent.kind === "reconnect") removeEdge(activeConnection.intent.edge);
      else if (selection.length > 1) deleteSelection();
      else { const focused = event.target instanceof Element ? event.target.closest("[data-canvas-node]")?.getAttribute("data-canvas-node") : null; if (focused || selected) deleteNode(focused || selected); }
    }
  }}>
    {menu && <div ref={menuRef} role="menu" aria-label={t("canvasActions")} className="fixed z-50 grid w-[252px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] gap-1 overflow-auto rounded-lg border border-outline bg-panel p-2 text-sm text-ink shadow-lg [&_button]:min-h-10 [&_button]:rounded-md [&_button]:px-2 [&_button]:text-start [&_button:hover]:bg-panel-muted [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-primary" style={{ left: menu.x, top: menu.y }} onKeyDown={(event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }}>
      {menu.node ? <><button role="menuitem" type="button" onClick={() => { if (!openModelNode(menu.node!)) onReveal(menu.node!); setMenu(null); }}>{menu.node.startsWith("model::") ? t("canvasOpenModel") : t("canvasOpenDetails")}</button><button role="menuitem" type="button" disabled={!canEdit || !menu.node.startsWith("rule-")} onClick={() => deleteNode(menu.node!)}>{t("remove")}</button>{!menu.node.startsWith("rule-") && <p className="p-2 text-xs text-ink-muted">{t("canvasProtectedNode")}</p>}</> : menu.edge ? <><button role="menuitem" type="button" onClick={(event) => { openConnection({ kind: "reconnect", edge: menu.edge! }, event.currentTarget); setMenu(null); }}>{t("canvasReconnect")}</button><button role="menuitem" type="button" disabled={!canEdit || !!classifyConnection(draft, config, { kind: "remove", edge: menu.edge }, menu.edge.to).reason} onClick={() => { removeEdge(menu.edge!); setMenu(null); }}>{t("canvasDisconnect")}</button>{(() => { const reason = classifyConnection(draft, config, { kind: "remove", edge: menu.edge }, menu.edge.to).reason; return reason ? <p className="p-2 text-xs text-ink-muted">{connectionReasonText(t, reason)}</p> : null; })()}</> : <><span className="px-2 py-1 text-xs text-ink-muted">{t("canvasAddNode")}</span><button role="menuitem" type="button" disabled={!canEdit || !canAddRule} onClick={() => addNode("rule")}>{t("addRule")}</button><button role="menuitem" type="button" disabled={!canEdit} onClick={() => addNode("question")}>{t("canvasAddQuestion")}</button><p className="px-2 text-xs text-ink-muted">{t("canvasQuestionEntry")}</p></>}
    </div>}
    <div className="workspace-chrome absolute left-3 right-3 top-3 z-[9] pointer-events-none [&>*]:pointer-events-auto" data-canvas-occlusion="top">
    {heading}
    <p className="min-h-4 truncate text-xs text-ink-muted" role="status" title={layoutSaving ? t("canvasSavingLayout") : t("canvasLayoutOnly")}>{!loaded ? t("loading") : layoutSaving ? t("canvasSavingLayout") : t("canvasLayoutOnly")}</p>
    {intent && <div ref={panelRef} className="canvas-connection-panel flex max-h-52 flex-wrap items-end gap-2 overflow-auto rounded-lg border border-primary bg-panel p-3 text-sm text-ink shadow-lg" role="region" aria-label={t("canvasConnectionActions")} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelConnection(); } }}>
      <p className="w-full break-words text-xs text-ink-muted">{activeConnection?.visual ? outputDescription(activeConnection.visual) : intent.kind === "reconnect" || intent.kind === "remove" ? edgeDescription(intent.edge) : `${nodes.find((node) => node.id === intent.from)?.text ?? intent.from} · ${t(intent.kind === "new-match" ? "match" : "canvasAddPoolEdge")}`}</p>
      {intentStale ? <p role="status">{t("canvasReason_stale")}</p> : !canConnect ? <p role="status">{t("canvasReadOnly")}</p> : <>
        <label className="grid min-w-0 flex-1 gap-1">{t("canvasTarget")}<select className="min-h-9 max-w-full rounded-md border border-outline bg-panel px-2" value={keyboardTarget} onChange={(event) => setKeyboardTarget(event.target.value)}>
          <option value="">{t("canvasTarget")}</option>{intentTargets(draft, config, intent).map((id) => <option key={id} value={id}>{nodes.find((node) => node.id === id)?.text ?? id}</option>)}
        </select></label>
        <Button type="button" disabled={!keyboardTarget} onClick={() => applyIntent(intent, keyboardTarget)}>{t("canvasConnect")}</Button>
        {intent.kind === "reconnect" && <Button variant="outline" type="button" disabled={!!classifyConnection(draft, config, { kind: "remove", edge: intent.edge }, intent.edge.to).reason} onClick={() => { removeEdge(intent.edge); cancelConnection(); }}>{t("canvasDisconnect")}</Button>}
        {intent.kind === "reconnect" && (() => { const reason = classifyConnection(draft, config, { kind: "remove", edge: intent.edge }, intent.edge.to).reason; return reason ? <p className="w-full text-xs text-ink-muted" role="status">{connectionReasonText(t, reason)}</p> : null; })()}
      </>}
      <Button variant="outline" type="button" onClick={cancelConnection}>{t("cancel")}</Button>
    </div>}
    {layoutError && <p className="notice warn" role="status">{layoutError === "unreadable" ? t("canvasLayoutUnreadable") : layoutError}{active && !loaded && <button type="button" onClick={() => setReadRetry((value) => value + 1)}>{t("canvasRetryLayoutRead")}</button>}{canEdit && <button type="button" onClick={() => { setLayoutError(null); persist(layoutRef.current); }}>{t("canvasRetryLayout")}</button>}{loaded && <button type="button" onClick={discardLayout}>{t("canvasDiscardLayout")}</button>}</p>}
    {feedback && <p className="notice warn" role="status">{feedback}</p>}
    {pointerReason && <p className="notice" role="status">{connectionReasonText(t, pointerReason)}</p>}
    {fitMode && <div className="meta" role="status">{t(fitMode === "board" ? "canvasFitBoardStatus" : fitMode === "group" ? "canvasFitGroupStatus" : "canvasFitNodeStatus")}</div>}
    </div>
    <div className="canvas-frame absolute inset-0 min-w-0">
    <div className="canvas-tools absolute bottom-3 left-3 z-[7] flex w-[calc(100%-24px)] flex-wrap items-center justify-center gap-[0.3rem] overflow-auto rounded-lg border border-outline bg-panel p-[0.35rem] shadow-[0_4px_16px_color-mix(in_srgb,var(--text)_12%,transparent)] max-[600px]:bottom-2 max-[600px]:left-2 max-[600px]:w-[calc(100%-16px)] max-[600px]:min-h-12 max-[600px]:flex-nowrap max-[600px]:justify-start max-[600px]:overflow-x-auto max-[600px]:overflow-y-hidden max-[600px]:gap-[0.2rem] max-[600px]:p-[0.2rem] max-[600px]:[scrollbar-width:thin] max-[600px]:[touch-action:pan-x] max-[600px]:[&>button]:h-10 max-[600px]:[&>button]:min-h-10 max-[600px]:[&>button]:min-w-10 max-[600px]:[&>button]:flex-none max-[600px]:[&>button]:px-[0.35rem] max-[600px]:[&>button]:text-base max-[600px]:[&>div]:flex-none max-[600px]:[&_button]:whitespace-nowrap]" data-canvas-occlusion="bottom" ref={toolbarRef} role="toolbar" aria-label={t("canvasTools")} onFocusCapture={(event) => {
      const toolbar = event.currentTarget, target = event.target;
      requestAnimationFrame(() => {
        if (!activeRef.current || document.activeElement !== target) return;
        const bounds = toolbar.getBoundingClientRect(), button = target.getBoundingClientRect();
        // Reveal the whole control and focus ring without scrolling the canvas or page.
        if (button.left < bounds.left + 5) toolbar.scrollLeft += button.left - bounds.left - 5;
        else if (button.right > bounds.right - 5) toolbar.scrollLeft += button.right - bounds.right + 5;
      });
    }} onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }}>
      <Button variant={tool === "select" ? "default" : "outline"} size="icon" className="min-h-10 min-w-10" type="button" title={t("canvasSelectTool")} aria-label={t("canvasSelectTool")} aria-pressed={tool === "select"} onClick={() => chooseTool("select")}><MousePointer2 aria-hidden="true" focusable="false" /></Button>
      <Button variant={tool === "pan" ? "default" : "outline"} size="icon" className="min-h-10 min-w-10" type="button" title={t("canvasPanTool")} aria-label={t("canvasPanTool")} aria-pressed={tool === "pan"} onClick={() => chooseTool("pan")}><Hand aria-hidden="true" focusable="false" /></Button>
      <Button variant="outline" className="min-h-10" type="button" aria-label={t("canvasAddNode")} disabled={!canEdit} onClick={(event) => { const rect = surface.current && canvasAvailableRect(surface.current); if (rect) openMenu({ clientX: (rect.left + rect.right) / 2, clientY: (rect.top + rect.bottom) / 2, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation() }); }}><Plus aria-hidden="true" focusable="false" />{t("canvasAddNode")}</Button>
      <Button variant="outline" size="icon" type="button" aria-label={t("canvasUndo")} disabled={!canEdit || !historyAvailability.undo} onClick={() => travelHistory(false)}><Undo2 aria-hidden="true" /></Button>
      <Button variant="outline" size="icon" type="button" aria-label={t("canvasRedo")} disabled={!canEdit || !historyAvailability.redo} onClick={() => travelHistory(true)}><Redo2 aria-hidden="true" /></Button>
      <ToolButton type="button" disabled={!canEdit} onClick={() => saveArrangement(defaults)}>{t("canvasArrangeAll")}</ToolButton>
      <ToolButton type="button" disabled={!canEdit || selectedCount < 2} onClick={() => saveArrangement(alignNodes(positions, selection, "x"))}>{t("canvasAlignLeft")}</ToolButton>
      <ToolButton type="button" disabled={!canEdit || selectedCount < 2} onClick={() => saveArrangement(alignNodes(positions, selection, "y"))}>{t("canvasAlignTop")}</ToolButton>
      <div className="canvas-zoom flex flex-wrap items-center justify-center gap-[0.3rem] max-[600px]:flex-nowrap max-[600px]:gap-[0.2rem]" role="group" aria-label={t("canvasZoom")}><Button variant="outline" size="icon" className="min-h-10 min-w-10" type="button" aria-label={t("canvasZoomOut")} onClick={() => zoomTo(zoom - 0.25)}><Minus aria-hidden="true" focusable="false" /></Button><output className="min-w-12 text-center tabular-nums max-[600px]:min-w-10" role="status" aria-live="polite" aria-atomic="true" title={dragPosition ? t("canvasLayoutOnly") : t("canvasZoom")} aria-label={dragPosition ? `${t("canvasLayoutOnly")} · x: ${dragPosition.x}, y: ${dragPosition.y}` : t("canvasZoom")}>{dragPosition ? `${dragPosition.x}, ${dragPosition.y}` : `${Math.round(zoom * 100)}%`}</output><Button variant="outline" size="icon" className="min-h-10 min-w-10" type="button" aria-label={t("canvasZoomIn")} onClick={() => zoomTo(zoom + 0.25)}><Plus aria-hidden="true" focusable="false" /></Button><ToolButton type="button" onClick={() => zoomTo(1)} title={t("canvasZoomReset")} aria-label={t("canvasZoomReset")}>1:1</ToolButton><ToolButton type="button" onClick={fitBoard}>{t("canvasZoomFit")}</ToolButton></div>
      <div className="canvas-pan flex gap-[0.3rem] max-[600px]:flex-nowrap max-[600px]:gap-[0.2rem]" role="group" aria-label={t("canvasPan")}><Button variant="outline" size="icon" className="min-h-10 min-w-10" type="button" onClick={() => pan(-1, 0)} aria-label={t("canvasPanLeft")}><ArrowLeft aria-hidden="true" focusable="false" /></Button><Button variant="outline" size="icon" className="min-h-10 min-w-10" type="button" onClick={() => pan(1, 0)} aria-label={t("canvasPanRight")}><ArrowRight aria-hidden="true" focusable="false" /></Button><Button variant="outline" size="icon" className="min-h-10 min-w-10" type="button" onClick={() => pan(0, -1)} aria-label={t("canvasPanUp")}><ArrowUp aria-hidden="true" focusable="false" /></Button><Button variant="outline" size="icon" className="min-h-10 min-w-10" type="button" onClick={() => pan(0, 1)} aria-label={t("canvasPanDown")}><ArrowDown aria-hidden="true" focusable="false" /></Button></div>
    </div>
    <div className={`routing-canvas-scroll absolute inset-0 max-w-full min-h-0 overflow-auto overscroll-contain [touch-action:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${tool === "pan" ? "tool-pan" : "tool-select"}`} ref={surface} tabIndex={0} aria-label={t("routingCanvas")}
      onContextMenu={(event) => { if (event.target instanceof Element && event.target.closest("[data-canvas-node], [data-canvas-input], [data-canvas-output], [data-canvas-edge]")) return; openMenu(event); }}
      onPointerDown={(event) => { if (event.button !== 0 || marqueeRef.current) return; if (event.target instanceof Element && event.target.closest("[data-canvas-node], [data-canvas-input], [data-canvas-output], [data-canvas-edge]")) return; if (tool === "pan") { panDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); return; } if (intent) return; const point = pointerOnBoard(event); marqueeRef.current = { pointerId: event.pointerId, start: point, end: point, additive: event.shiftKey }; event.currentTarget.setPointerCapture(event.pointerId); setMarquee({ start: point, end: point }); }}
      onPointerMove={(event) => { const drag = panDrag.current; if (drag?.pointerId === event.pointerId) { event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX; event.currentTarget.scrollTop = drag.top + drag.y - event.clientY; return; } if (!marqueeRef.current || marqueeRef.current.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const point = pointerOnBoard(event); marqueeRef.current.end = point; setMarquee({ start: marqueeRef.current.start, end: point }); }}
      onPointerUp={(event) => { if (panDrag.current?.pointerId === event.pointerId) { panDrag.current = null; return; } const current = marqueeRef.current; if (!current || current.pointerId !== event.pointerId) return; const found = marqueeNodes(current.start, current.end, positions, dimensions); const next = current.additive ? [...new Set([...selection.filter((id) => Object.hasOwn(positions, id)), ...found])] : found; onSelection(next); marqueeRef.current = null; setMarquee(null); }}
      onPointerCancel={(event) => { if (panDrag.current?.pointerId === event.pointerId) panDrag.current = null; if (marqueeRef.current?.pointerId === event.pointerId) { marqueeRef.current = null; setMarquee(null); } }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (dragNode.current) { event.preventDefault(); event.stopPropagation(); stopNode(dragNode.current.pointerId, true); return; }
          if (intent || dragEdge.current) { event.preventDefault(); event.stopPropagation(); cancelConnection(); return; }
          onSelection([]); return;
        }
        const editing = isTextEditing(event.target);
        const next = canvasToolShortcut(event.key, editing, event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
        if (next) { event.preventDefault(); chooseTool(next); }
      }}
      onScroll={(event) => {
        if (!activeRef.current) return;
        if (holdNodeScroll(event.currentTarget)) return;
        reportAnchor();
        if (!canEdit || restoringViewport.current || layoutError === "unreadable") return;
        const viewport = canonicalViewport({ x: event.currentTarget.scrollLeft, y: event.currentTarget.scrollTop }, zoomRef.current, viewportReference(event.currentTarget, originY.current));
        const next = { ...layoutRef.current, viewport };
        layoutRef.current = next;
        // This viewport change is unsaved during the debounce interval as well as during its PUT.
        setLayoutSaving(true);
        if (scrollTimer.current) clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => { scrollTimer.current = null; persist(layoutRef.current); }, 450);
      }}>
      <div className="routing-canvas-board relative min-h-full overflow-clip bg-panel bg-[radial-gradient(var(--border)_0.9px,transparent_0.9px)] bg-[length:20px_20px]" style={{ width: boardWidth * zoom, height: `calc(${boardHeight * zoom}px + var(--canvas-origin-y, 0px) + var(--canvas-end-space, 0px))` }}><div className="routing-canvas-content absolute left-0 top-[var(--canvas-origin-y,0px)]" style={{ width: boardWidth, height: boardHeight, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
        <svg className="routing-canvas-lines pointer-events-none absolute inset-0 text-ink-muted" width={boardWidth} height={boardHeight} pointerEvents="none">
          <defs><marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
          {displayEdges.map(({ output, port }) => {
            const edge = output.edge!;
            const from = positions[edge.from]; const to = positions[edge.to];
            if (!from || !to) return null;
            const target = nodeCardCenter("left", outputs[edge.to]?.length ?? 0);
            const sx = from.x + port.x; const sy = from.y + port.y;
            const tx = to.x + target.x; const ty = to.y + target.y;
            const path = `M ${sx} ${sy} C ${sx + 70} ${sy}, ${tx - 70} ${ty}, ${tx} ${ty}`;
            const chosen = activeConnection?.visual?.from === edge.from && activeConnection.visual.output.id === output.id;
            return <g key={`${edge.from}:${output.id}`}>
              <path data-workflow-edge={edge.kind} d={path} fill="none" stroke={chosen ? "var(--accent)" : "currentColor"} strokeWidth={chosen ? 3 : 2} strokeDasharray={edge.kind === "unmatched" || edge.kind === "default" ? "6 5" : undefined} markerEnd="url(#canvas-arrow)" />
              {edge.kind === "default" && <text x={(sx + tx) / 2} y={(sy + ty) / 2 - 8} className="fill-ink-muted text-xs" pointerEvents="none">{defaultPath}</text>}
              {<path data-canvas-edge={JSON.stringify([edge.from, output.id, edge.to])} data-edge-kind={edge.kind} data-edge-from={edge.from} data-edge-to={edge.to}
                d={path} fill="none" stroke="transparent" strokeWidth="16" className="cursor-pointer [pointer-events:stroke] focus-visible:stroke-primary/30" role="button" tabIndex={0}
                aria-label={`${t("canvasSelectConnection")}: ${outputName(output)} · ${edgeDescription(edge)}`} aria-pressed={chosen}
                onContextMenu={(event) => openMenu(event, undefined, edge)}
                onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (tool === "select") openConnection(output.intent, event.currentTarget, { from: edge.from, output }); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openConnection(output.intent, event.currentTarget, { from: edge.from, output }); } }} />}
            </g>;
          })}
          {edgePointer && <circle cx={edgePointer.x} cy={edgePointer.y} r="7" className="canvas-edge-preview pointer-events-none fill-primary opacity-75" />}
        </svg>
        {nodes.map(({ id, text }) => <button key={id} type="button" data-canvas-node={id} data-node-kind={getCanvasNodeKind(id)}
          data-node-state={nodeState(id)} aria-invalid={nodeState(id) === "invalid" || nodeState(id) === "incomplete" || undefined}
          onContextMenu={(event) => openMenu(event, id)}
          className={`routing-canvas-node absolute block w-[190px] overflow-hidden p-0 text-left [touch-action:none] cursor-grab text-ink [--canvas-node-accent:var(--text-muted)] [background:color-mix(in_srgb,var(--canvas-node-accent)_5%,var(--surface))] [border:1px_solid_color-mix(in_srgb,var(--canvas-node-accent)_45%,var(--border))] [border-inline-start:3px_solid_var(--canvas-node-accent)] [box-shadow:0_3px_14px_color-mix(in_srgb,var(--text)_10%,transparent)] rounded-lg data-[node-kind=questions]:[--canvas-node-accent:var(--accent)] data-[node-kind=questions]:rounded-xl data-[node-kind=rule]:[--canvas-node-accent:var(--good)] data-[node-kind=rule]:rounded data-[node-kind=fallback]:[--canvas-node-accent:var(--warn)] data-[node-kind=fallback]:[border-style:dashed] data-[node-kind=fallback]:[border-inline-start-style:solid] data-[node-kind=label]:[--canvas-node-accent:var(--accent)] data-[node-kind=label]:[border-inline-start-style:double] data-[node-kind=label]:[border-radius:0.75rem_0.25rem_0.25rem_0.75rem] data-[node-kind=model]:[border-inline-start-width:1px] data-[node-kind=model]:[border-inline-end:3px_solid_var(--canvas-node-accent)] data-[node-kind=model]:rounded hover:not-disabled:[background:color-mix(in_srgb,var(--canvas-node-accent)_9%,var(--surface))] hover:not-disabled:[border-color:var(--canvas-node-accent)] focus-visible:outline-[3px] focus-visible:outline-text focus-visible:outline-offset-1 ${tool === "pan" ? "cursor-grab" : ""}${selection.length > 1 ? selection.includes(id) ? " selected outline-[3px] outline-primary outline-offset-0" : "" : selected === id || selection.includes(id) ? " selected outline-[3px] outline-primary outline-offset-0" : ""}${intent && classifyConnection(draft, config, intent, id).reason === null ? " compatible [outline:3px_dashed_var(--accent)] outline-offset-0" : intent && hoverTarget === id ? " incompatible opacity-[0.68]" : ""}${draggingNodes.includes(id) ? " dragging z-[4] cursor-grabbing [box-shadow:0_6px_18px_color-mix(in_srgb,var(--text)_22%,transparent)] animate-[node-drag-pulse_0.9s_ease-in-out_infinite_alternate] motion-reduce:animate-none" : ""}${!canEdit ? " read-only cursor-default shadow-none" : ""}`}
          data-dragging={draggingNodes.includes(id) || undefined}
          style={{ left: positions[id]?.x ?? 0, top: positions[id]?.y ?? 0, width: NODE_CARD_WIDTH, height: dimensions[id]!.height, zIndex: draggingNodes.includes(id) ? 4 : selected === id || selection.includes(id) ? 2 : 1, borderColor: nodeState(id) === "invalid" || nodeState(id) === "incomplete" ? "var(--warn)" : undefined }}
          onDoubleClick={(event) => { if (!openModelNode(id, event.currentTarget)) onReveal(id); }}
          title={`${text} · ${id}`}
          aria-label={text}
          onClick={(event) => { if (event.detail === 0 && event.shiftKey) return; if (event.detail === 0 && id.startsWith("model::")) { if (openModelNode(id, event.currentTarget)) { selectNode(id, false); return; } } selectNode(id, event.detail === 0); }} onPointerDown={(event) => { if (tool === "select" && !activeIntent) startNode(event, id); }}
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
          {(nodeState(id) === "invalid" || nodeState(id) === "incomplete") && <span className="absolute end-1 top-1 max-w-[110px] truncate rounded bg-panel px-1 text-[9px] font-semibold text-ink" title={t(nodeState(id) === "invalid" ? "canvasInvalidState" : "canvasIncompleteState")}>{t(nodeState(id) === "invalid" ? "canvasInvalidState" : "canvasIncompleteState")}</span>}
          {(outputs[id] ?? []).map((output, index) => <span key={output.id} className="absolute left-0 right-0 flex items-center justify-between gap-1 border-t border-outline px-3 text-[11px] leading-3" style={{ top: NODE_CARD_BASE_HEIGHT + index * NODE_CARD_OUTPUT_HEIGHT, height: NODE_CARD_OUTPUT_HEIGHT }} title={outputName(output)}>
            <span className="shrink-0 text-[9px] text-ink-muted">{t("canvasOutput")}</span><span className="truncate">{outputName(output)}{!output.edge && output.kind !== "add" ? ` · ${t("canvasDisconnected")}` : ""}</span>
          </span>)}
        </button>)}
        {nodes.map(({ id, text }) => {
          const rows = outputs[id] ?? [], at = positions[id]!;
          const input = nodeCardCenter("left", rows.length);
          // Labels stay below card surfaces; handles keep their own interactive layer.
          return <div key={`ports-${id}`} className="pointer-events-none absolute" style={{ left: at.x, top: at.y }}>
            {id !== "questions" && <span className="absolute w-7 whitespace-nowrap text-right text-[9px] leading-3 text-ink-muted" style={{ left: -42, top: input.y - 6 }}>{t("canvasInput")}</span>}
            {id !== "questions" && <button type="button" data-canvas-input={id} className="absolute flex size-[18px] min-h-0 items-center justify-center rounded-full border-2 border-primary bg-panel p-0 [pointer-events:auto] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" style={{ left: -9, top: input.y - 9, zIndex: draggingNodes.includes(id) ? 5 : 2 }} aria-label={`${t("canvasInput")}: ${text}`} title={`${t("canvasInput")}: ${text}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => { if (intent) applyIntent(intent, id); else selectNode(id); }}>‹</button>}
            {rows.map((output, index) => { const port = nodeCardPorts(rows.length)[index]!; if (output.kind === "default") return null; return <button key={output.id} type="button" data-canvas-output={output.id} data-output-node={id} data-output-kind={output.kind} data-output-connected={!!output.edge}
              className={`canvas-edge-handle absolute flex size-[18px] min-h-0 items-center justify-center rounded-full border-2 border-primary p-0 text-[11px] [pointer-events:auto] [touch-action:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${output.edge ? "bg-primary text-primary-foreground" : "bg-panel text-primary"}`}
              style={{ left: port.x - 9, top: port.y - 9, zIndex: draggingNodes.includes(id) ? 5 : 2 }} aria-label={`${t("canvasOutput")}: ${text} · ${outputName(output)}`} title={`${t("canvasOutput")}: ${outputName(output)}`}
              onContextMenu={(event) => { if (output.edge) openMenu(event, undefined, output.edge); else { event.preventDefault(); event.stopPropagation(); openConnection(output.intent, event.currentTarget, { from: id, output }); } }}
              onClick={(event) => { if (event.detail === 0) openConnection(output.intent, event.currentTarget, { from: id, output }); }}
              onPointerDown={(event) => { event.stopPropagation(); if (event.button !== 0 || tool !== "select") return; if (!canConnect) { openConnection(output.intent, event.currentTarget, { from: id, output }); return; } event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); connectionDraft.current = draft; connectionOrigin.current = event.currentTarget; dragEdge.current = { intent: output.intent, visual: { from: id, output }, draft, start: { x: event.clientX, y: event.clientY }, moved: false, pointerId: event.pointerId }; setActiveConnection(null); }}
              onPointerMove={(event) => { const active = dragEdge.current; if (!active || !event.currentTarget.hasPointerCapture(event.pointerId)) return; active.moved ||= crossedDragThreshold(active.start, { x: event.clientX, y: event.clientY }); if (!active.moved) return; setEdgePointer(pointerOnBoard(event)); const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-canvas-node], [data-canvas-input]"); const targetId = target?.getAttribute("data-canvas-node") ?? target?.getAttribute("data-canvas-input") ?? ""; setHoverTarget(targetId); setPointerCandidate(targetId); }}
              onPointerUp={finishEdge} onPointerCancel={cancelConnection} onLostPointerCapture={() => { if (dragEdge.current) cancelConnection(); }}>
              {output.kind === "add" ? "+" : "›"}
            </button>; })}
          </div>;
        })}
        {marquee && <div className="canvas-marquee absolute pointer-events-none border-2 border-primary bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" style={{ left: Math.min(marquee.start.x, marquee.end.x), top: Math.min(marquee.start.y, marquee.end.y), width: Math.abs(marquee.end.x - marquee.start.x), height: Math.abs(marquee.end.y - marquee.start.y) }} />}
        </div>
      </div>
    </div>
    </div>
    {children(<>
    <div className="canvas-context-actions flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-outline bg-panel px-3 py-2 text-sm text-ink shadow-[0_5px_16px_color-mix(in_srgb,var(--text)_10%,transparent)]" role="status">{selectedEdge ? <span>{t("canvasPolicyEdit")}</span> : dragPosition || selectedCount || selected ? <span className="canvas-layout-state" data-layout-only="true">{t("canvasLayoutOnly")}</span> : null}<span>{dragPosition ? `${dragPosition.x}, ${dragPosition.y}` : selectedCount ? t("canvasSelectedCount").replace("{count}", String(selectedCount)) : nodes.find((node) => node.id === selected)?.text ?? t("canvasLayoutOnly")}</span>{selected && !inspectorOpen && tool === "select" && <button type="button" onClick={(event) => { if (!openModelNode(selected, event.currentTarget)) onReveal(selected); }}>{selected.startsWith("model::") ? t("canvasOpenModel") : t("canvasOpenDetails")}</button>}{selectedEdge && <button type="button" disabled={!canConnect} onClick={(event) => openConnection({ kind: "reconnect", edge: selectedEdge }, event.currentTarget)}>{t("canvasReconnect")}</button>}{fitMode && <span>{t(fitMode === "board" ? "canvasFitBoardStatus" : fitMode === "group" ? "canvasFitGroupStatus" : "canvasFitNodeStatus")}</span>}</div>
    <details className="my-2 rounded-lg border border-outline bg-panel p-3 text-ink border-t border-outline py-[0.4rem]"><summary className="cursor-pointer font-[620] text-sm font-medium text-ink-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">{t("canvasHelpTitle")}</summary><p className="mt-2 text-xs text-ink-muted">{t("canvasHelp")}</p></details>
    <div className="grid gap-2 text-sm text-ink"><details className="rounded-lg border border-outline bg-panel p-3 border-t border-outline py-[0.4rem]"><summary className="cursor-pointer font-[620] font-medium focus-visible:outline-2 focus-visible:outline-primary">{t("canvasNodeList")}</summary><ul className="mt-2 space-y-1">{nodes.map((node) => <li key={node.id}><button className="min-h-9 rounded-md px-2 text-left text-ink hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-primary" type="button" onClick={(event) => { if (!openModelNode(node.id, event.currentTarget)) onReveal(node.id); }}>{node.text}</button></li>)}</ul></details>
    <details className="rounded-lg border border-outline bg-panel p-3 border-t border-outline py-[0.4rem]"><summary className="cursor-pointer font-[620] font-medium focus-visible:outline-2 focus-visible:outline-primary">{t("canvasEdgeList")}</summary><ol className="mt-2 space-y-2">{edges.map((edge) => <li key={`${edge.from}-${edge.kind}-${edge.to}`}>
      <span>{edgeDescription(edge)}</span>{" "}<button className="min-h-9 rounded-md border border-outline bg-panel px-2 text-ink hover:border-primary hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-primary" type="button" onClick={(event) => openConnection({ kind: "reconnect", edge }, event.currentTarget)}>{t("canvasSelectConnection")}</button>
    </li>)}</ol>
      <label className="grid gap-1 text-xs text-ink-muted">{t("canvasAddPoolEdge")} <select className="min-h-9 rounded-md border border-outline bg-panel px-2 text-ink" value={keyboardPool} disabled={!canConnect} onChange={(event) => { setKeyboardPool(event.target.value); setKeyboardModel(""); }}><option value="">{t("chooseLabel")}</option>{config.labels.filter((label) => label.resolution === "tag").map((label) => <option key={label.tag} value={`zone::${label.tag}`}>{label.name}</option>)}</select></label>
      <select className="min-h-9 rounded-md border border-outline bg-panel px-2 text-ink" aria-label={t("model")} value={keyboardModel} disabled={!canConnect || !keyboardPool} onChange={(event) => setKeyboardModel(event.target.value)}><option value="">{t("model")}</option>{config.models.filter((model) => !draft.models[model.id]?.tags.includes(keyboardPool.slice(6))).map((model) => <option key={model.id} value={`model::${model.id}`}>{model.id}</option>)}</select>
      <button className="min-h-9 rounded-md border border-outline bg-panel px-2 text-ink hover:border-primary hover:bg-panel-muted" type="button" disabled={!canConnect || !keyboardPool || !keyboardModel} onClick={() => applyPool(keyboardPool, keyboardModel)}>{t("canvasConnect")}</button>
      {keyboardPool && <label className="grid gap-1 text-xs text-ink-muted">{t("canvasCheckTarget")} <select className="min-h-9 rounded-md border border-outline bg-panel px-2 text-ink" value={keyboardCandidate} onChange={(event) => setKeyboardCandidate(event.target.value)}><option value="">{t("canvasTarget")}</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.text}</option>)}</select></label>}
      {keyboardPool && keyboardCandidate && <p role="status">{(() => { const result = classifyConnection(draft, config, { kind: "new-pool", from: keyboardPool }, keyboardCandidate); return result.reason ? connectionReasonText(t, result.reason) : t("canvasTargetAllowed"); })()}</p>}
    </details></div>
    </>)}
  </section>;
}
