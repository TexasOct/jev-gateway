import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { api } from "../api";
import type { CanvasLayout, ConfigurationPayload } from "../api";
import { useTranslation } from "../i18n";
import { BOARD_HEIGHT, BOARD_WIDTH, compatibleTargets, connectPoolEdge, defaultPosition, disconnectPoolEdge, reconcileRuleLayout, reconnectEdge, validLayout } from "./canvas";
import type { RuleLayoutMutation } from "./canvas";
import type { Position } from "./canvas";
import { workflowEdges } from "./draft";
import type { RoutingDraft, WorkflowEdge } from "./draft";

interface Props {
  draft: RoutingDraft;
  config: ConfigurationPayload;
  disabled: boolean;
  selected: string;
  onSelect: (id: string) => void;
  onDraft: (draft: RoutingDraft, mutation?: RuleLayoutMutation) => void;
  onError: (message: string) => void;
  topology: { serial: number; mutation: RuleLayoutMutation } | null;
}

const emptyLayout = (): CanvasLayout => ({ version: 1, nodes: {}, viewport: { x: 0, y: 0 } });
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

export default function RoutingCanvas({ draft, config, disabled, selected, onSelect, onDraft, onError, topology }: Props) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<CanvasLayout>(emptyLayout);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const dragEdge = useRef<WorkflowEdge | { from: string; kind: "new-pool" } | null>(null);
  const [edgePointer, setEdgePointer] = useState<Position | null>(null);
  const [keyboardEdge, setKeyboardEdge] = useState<number | null>(null);
  const [keyboardTarget, setKeyboardTarget] = useState("");
  const [keyboardPool, setKeyboardPool] = useState("");
  const [keyboardModel, setKeyboardModel] = useState("");
  const [edgeChoice, setEdgeChoice] = useState<WorkflowEdge | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const dragNode = useRef<{ id: string; x: number; y: number; start: Position } | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef(layout);
  const savedLayout = useRef(layout);
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const writeRevision = useRef(0);
  const writeGeneration = useRef(0);
  const writePending = useRef(false);
  const restoringViewport = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    let alive = true;
    aliveRef.current = true;
    void api.canvasLayout().then((loaded) => {
      if (!alive) return;
      if (validLayout(loaded)) {
        layoutRef.current = loaded;
        savedLayout.current = loaded;
        setLayout(loaded);
        setLayoutError(loaded.read_error ? "unreadable" : null);
        restoringViewport.current = true;
        requestAnimationFrame(() => {
          if (surface.current) {
            surface.current.scrollLeft = loaded.viewport.x;
            surface.current.scrollTop = loaded.viewport.y;
          }
          requestAnimationFrame(() => { restoringViewport.current = false; });
        });
      } else setLayoutError("unreadable");
      setLoaded(true);
    }).catch((error: unknown) => { if (alive) { setLayoutError(error instanceof Error ? error.message : String(error)); setLoaded(true); } });
    return () => { alive = false; aliveRef.current = false; if (scrollTimer.current) clearTimeout(scrollTimer.current); };
  }, []);

  const nodes = useMemo(() => [
    { id: "questions", text: t("questions") },
    ...draft.rules.map((_, index) => ({ id: `rule-${index}`, text: `${t("rule")} ${index + 1}` })),
    { id: "fallback", text: t("fallback") },
    ...config.labels.map((label) => ({ id: `zone::${label.tag}`, text: label.name })),
    ...config.models.map((model) => ({ id: `model::${model.id}`, text: model.id })),
  ], [draft.rules, config.labels, config.models, t]);
  const edges = workflowEdges(draft, config);
  const validNodeIds = new Set(nodes.map((node) => node.id));
  const activeEdgeChoice = edgeChoice && validNodeIds.has(edgeChoice.from) && validNodeIds.has(edgeChoice.to) &&
    edges.some((edge) => edge.from === edgeChoice.from && edge.to === edgeChoice.to && edge.kind === edgeChoice.kind)
    ? edgeChoice : null;
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

  const persistRef = useRef<(next: CanvasLayout) => void>(() => undefined);
  const persist = (next: CanvasLayout) => {
    if (!canEdit) return;
    const generation = writeGeneration.current;
    const revision = ++writeRevision.current;
    writeChain.current = writeChain.current.then(async () => {
      if (generation !== writeGeneration.current) return;
      writePending.current = true;
      await api.saveCanvasLayout(next);
      writePending.current = false;
      savedLayout.current = next;
      if (aliveRef.current && generation === writeGeneration.current && revision === writeRevision.current) setLayoutError(null);
    }).catch((error: unknown) => {
      writePending.current = false;
      if (aliveRef.current && generation === writeGeneration.current) {
        writeGeneration.current += 1;
        writeRevision.current += 1;
        if (scrollTimer.current) clearTimeout(scrollTimer.current);
        layoutRef.current = savedLayout.current;
        setLayout(savedLayout.current);
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
  const move = (id: string, at: Position, save: boolean) => {
    if (!Object.hasOwn(layoutRef.current.nodes, id) && Object.keys(layoutRef.current.nodes).length >= 256) {
      setLayoutError(t("canvasLayoutFull"));
      return;
    }
    const next = { ...layoutRef.current, nodes: { ...layoutRef.current.nodes,
      [id]: { x: clamp(at.x, Math.min(9790, Math.max(boardWidth - 210, 0))), y: clamp(at.y, Math.min(9915, Math.max(boardHeight - 85, 0))) } } };
    layoutRef.current = next;
    setLayout(next);
    if (save) persist(next);
  };
  const discardLayout = () => {
    if (writePending.current) return;
    writeGeneration.current += 1;
    writeRevision.current += 1;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    layoutRef.current = savedLayout.current;
    setLayout(savedLayout.current);
  };
  const startNode = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || !canEdit) return;
    dragNode.current = { id, x: event.clientX, y: event.clientY, start: positions[id]! };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragNodeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragNode.current;
    if (drag) {
      if (event.clientX !== drag.x || event.clientY !== drag.y) event.preventDefault();
      move(drag.id, { x: drag.start.x + event.clientX - drag.x, y: drag.start.y + event.clientY - drag.y }, false);
    }
  };
  const stopNode = () => {
    if (dragNode.current) {
      dragNode.current = null;
      persist(layoutRef.current);
    }
  };
  const removeEdge = (edge: WorkflowEdge) => {
    const next = disconnectPoolEdge(draft, config, edge);
    if (next === null) onError(t("canvasInvalidConnection"));
    else onDraft(next);
    setKeyboardEdge(null);
  };
  const applyEdge = (edge: WorkflowEdge, target: string) => {
    const next = reconnectEdge(draft, config, edge, target);
    if (next === null) onError(t("canvasInvalidConnection"));
    else if (next !== draft) {
      let mutation: RuleLayoutMutation | undefined;
      if (edge.kind === "unmatched" && edge.from.startsWith("rule-") && target.startsWith("rule-")) {
        const sourceIndex = Number(edge.from.slice(5));
        const targetIndex = Number(target.slice(5));
        mutation = { kind: "move", from: targetIndex, to: sourceIndex + 1 };
      }
      onDraft(next, mutation);
    }
    dragEdge.current = null;
    setKeyboardEdge(null);
    setKeyboardTarget("");
    setEdgePointer(null);
    setEdgeChoice(null);
  };
  const applyPool = (source: string, target: string) => {
    const next = connectPoolEdge(draft, config, source, target);
    if (next === null) onError(t("canvasInvalidConnection"));
    else onDraft(next);
    dragEdge.current = null;
    setEdgePointer(null);
    setKeyboardModel("");
  };
  const pointerOnBoard = (event: ReactPointerEvent<SVGCircleElement>): Position => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect || !surface.current) return { x: 0, y: 0 };
    return {
      x: event.clientX - rect.left + surface.current.scrollLeft,
      y: event.clientY - rect.top + surface.current.scrollTop,
    };
  };
  const finishEdge = (event: ReactPointerEvent<SVGCircleElement>) => {
    const active = dragEdge.current;
    if (!active) return;
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-canvas-node]");
    const target = element?.getAttribute("data-canvas-node") ?? "";
    if (target) {
      if (active.kind === "new-pool") applyPool(active.from, target);
      else applyEdge(active, target);
    }
    dragEdge.current = null;
    setEdgePointer(null);
  };
  const selectNode = (id: string) => {
    if (activeEdgeChoice && canEdit) {
      applyEdge(activeEdgeChoice, id);
      return;
    }
    onSelect(id);
  };
  const edgeDescription = (edge: WorkflowEdge) => `${edge.from} ${edge.kind === "context" ? t("firstMatch") : edge.kind === "match" ? t("match") : edge.kind === "unmatched" ? t("unmatched") : t("modelPool")} ${edge.to}`;
  return <section className="canvas-section" aria-label={t("routingCanvas")}>
    <h3>{t("routingCanvas")}</h3>
    <p className="meta">{t("canvasHelp")}</p>
    {activeEdgeChoice && <p className="notice" role="status">{t("canvasTarget")} <button type="button" onClick={() => setEdgeChoice(null)}>{t("cancel")}</button></p>}
    {layoutError && <p className="notice warn" role="status">{layoutError === "unreadable" ? t("canvasLayoutUnreadable") : layoutError}{canEdit && <button type="button" onClick={() => { setLayoutError(null); persist(layoutRef.current); }}>{t("canvasRetryLayout")}</button>}{loaded && <button type="button" onClick={discardLayout}>{t("canvasDiscardLayout")}</button>}</p>}
    <div className="routing-canvas-scroll" ref={surface} tabIndex={0} aria-label={t("routingCanvas")}
      onScroll={(event) => {
        if (!canEdit || restoringViewport.current || layoutError === "unreadable") return;
        const viewport = { x: clamp(event.currentTarget.scrollLeft, 10000), y: clamp(event.currentTarget.scrollTop, 10000) };
        const next = { ...layoutRef.current, viewport };
        layoutRef.current = next;
        if (scrollTimer.current) clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => persist(layoutRef.current), 450);
      }}>
      <div className="routing-canvas-board" style={{ width: boardWidth, height: boardHeight }}>
        <svg className="routing-canvas-lines" width={boardWidth} height={boardHeight} aria-hidden="true">
          {edges.map((edge, index) => {
            const from = positions[edge.from]; const to = positions[edge.to];
            if (!from || !to) return null;
            const sibling = edges.slice(0, index).filter((item) => item.from === edge.from).length;
            const sx = from.x + 190; const sy = from.y + 15 + sibling * 13;
            const tx = to.x; const ty = to.y + 28;
            return <g key={`${edge.from}:${edge.kind}:${edge.to}`}>
              <path d={`M ${sx} ${sy} C ${sx + 70} ${sy}, ${tx - 70} ${ty}, ${tx} ${ty}`} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={edge.kind === "unmatched" ? "6 5" : undefined} />
              {edge.kind !== "context" && <circle cx={sx} cy={sy} r="9" className="canvas-edge-handle"
                onPointerDown={(event) => { if (!canEdit || edge.kind === "pool" && !disconnectPoolEdge(draft, config, edge)) return; event.currentTarget.setPointerCapture(event.pointerId); dragEdge.current = edge; setEdgePointer({ x: sx, y: sy }); }}
                onPointerMove={(event) => { if (dragEdge.current) setEdgePointer(pointerOnBoard(event)); }}
                onPointerUp={finishEdge} onPointerCancel={() => { dragEdge.current = null; setEdgePointer(null); }} />}
              <title>{edgeDescription(edge)} #{index + 1}</title>
            </g>;
          })}
          {config.labels.filter((label) => label.resolution === "tag").map((label) => {
            const from = positions[`zone::${label.tag}`];
            if (!from) return null;
            return <circle key={`add-${label.tag}`} cx={from.x + 190} cy={from.y + 8} r="9"
              className="canvas-edge-handle canvas-add-handle"
              onPointerDown={(event) => { if (!canEdit) return; event.currentTarget.setPointerCapture(event.pointerId); dragEdge.current = { from: `zone::${label.tag}`, kind: "new-pool" }; setEdgePointer({ x: from.x + 190, y: from.y + 8 }); }}
              onPointerMove={(event) => { if (dragEdge.current) setEdgePointer(pointerOnBoard(event)); }}
              onPointerUp={finishEdge} onPointerCancel={() => { dragEdge.current = null; setEdgePointer(null); }}>
              <title>{t("canvasAddPoolEdge")} {label.name}</title>
            </circle>;
          })}
          {edgePointer && <circle cx={edgePointer.x} cy={edgePointer.y} r="7" className="canvas-edge-preview" />}
        </svg>
        {nodes.map(({ id, text }) => <button key={id} type="button" data-canvas-node={id}
          className={`routing-canvas-node${selected === id ? " selected" : ""}`}
          style={{ left: positions[id]?.x ?? 0, top: positions[id]?.y ?? 0 }}
          onClick={() => selectNode(id)} onPointerDown={(event) => { if (!edgeChoice) startNode(event, id); }}
          onPointerMove={dragNodeMove} onPointerUp={stopNode} onPointerCancel={stopNode}
          onKeyDown={(event) => {
            if (!canEdit || !event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const at = positions[id]!;
            move(id, { x: at.x + (event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0),
              y: at.y + (event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0) }, true);
          }}>
          {text}
        </button>)}
      </div>
    </div>
    <details><summary>{t("canvasNodeList")}</summary><ul>{nodes.map((node) => <li key={node.id}><button type="button" onClick={() => { selectNode(node.id); const at = positions[node.id]!; surface.current?.scrollTo({ left: Math.max(0, at.x - 70), top: Math.max(0, at.y - 70) }); }}>{node.text}</button></li>)}</ul></details>
    <details><summary>{t("canvasEdgeList")}</summary><ol>{edges.map((edge, index) => <li key={`${edge.from}-${edge.kind}-${edge.to}`}>
      <span>{edgeDescription(edge)}</span>{" "}<button type="button" disabled={!canEdit || compatibleTargets(draft, config, edge).length === 0} onClick={() => { setKeyboardEdge(index); setKeyboardTarget(""); setEdgeChoice(edge); }}>{t("canvasReconnect")}</button>{edge.kind === "pool" && <button type="button" disabled={!canEdit || !disconnectPoolEdge(draft, config, edge)} onClick={() => removeEdge(edge)}>{t("remove")}</button>}
      {keyboardEdge === index && <><select aria-label={t("canvasTarget")} value={keyboardTarget} onChange={(event) => setKeyboardTarget(event.target.value)}><option value="">{t("canvasTarget")}</option>{compatibleTargets(draft, config, edge).map((id) => <option key={id} value={id}>{nodes.find((node) => node.id === id)?.text ?? id}</option>)}</select><button type="button" disabled={!keyboardTarget} onClick={() => applyEdge(edge, keyboardTarget)}>{t("canvasConnect")}</button><button type="button" onClick={() => { setKeyboardEdge(null); setEdgeChoice(null); }}>{t("cancel")}</button></>}
    </li>)}</ol>
      <label>{t("canvasAddPoolEdge")} <select value={keyboardPool} disabled={!canEdit} onChange={(event) => { setKeyboardPool(event.target.value); setKeyboardModel(""); }}><option value="">{t("chooseLabel")}</option>{config.labels.filter((label) => label.resolution === "tag").map((label) => <option key={label.tag} value={`zone::${label.tag}`}>{label.name}</option>)}</select></label>
      <select aria-label={t("model")} value={keyboardModel} disabled={!canEdit || !keyboardPool} onChange={(event) => setKeyboardModel(event.target.value)}><option value="">{t("model")}</option>{config.models.filter((model) => !draft.models[model.id]?.tags.includes(keyboardPool.slice(6))).map((model) => <option key={model.id} value={`model::${model.id}`}>{model.id}</option>)}</select>
      <button type="button" disabled={!canEdit || !keyboardPool || !keyboardModel} onClick={() => applyPool(keyboardPool, keyboardModel)}>{t("canvasConnect")}</button>
    </details>
  </section>;
}
