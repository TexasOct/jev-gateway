/**
 * Visual routing workspace with a first-match routing canvas and inspector.
 *
 * The first matching rule wins. Model chips move between label columns, which adds or removes that
 * label's tag on the model. Dragging a chip onto a label adds that tag; dragging
 * it back to the unassigned pool removes the tag it came from. A model may serve
 * several labels, which is what the current catalog does, so adding a second
 * label keeps the first and the chip shows every tag it carries.
 *
 * Label order is not draggable: label scores must increase and the first label
 * must score 0. Pool rank inside a label comes from the selection mode with
 * priority as a tiebreak, so priority is a number field and the resulting order
 * is displayed read-only with its reason.
 */

import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable,
  useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";

import { api, ApiError } from "@/shared/api/client";
import { useWorkspaceActive } from "@/shared/navigation/workspace-activity";
import { useWorkspaceFrames } from "@/shared/navigation/useWorkspaceFrames";
import { useLocale } from "@/shared/i18n";
import { formatRouteLabel } from "@/shared/i18n/route-label";
import { matrixChoiceLabel } from "@/shared/routing/choice-label";
import ConfiguredRouteFlow from "./ConfiguredRouteFlow";
import RoutingCanvas from "./RoutingCanvas";
import { canvasAvailableRect, changeLabelMembership, handoffInspectorFocus, inspectorFallbackPosition, inspectorPosition, pageViewport, reconcileRuleSelection, visibleCanvasRect } from "./model/canvas";
import type { RuleLayoutMutation } from "./model/canvas";
import type { ConfigurationPayload, LabelRow, RoutingOverlayPayload } from "@/shared/api/types";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import {
  addCriterion, addQuestion, addRule, diffSummary, draftFromConfiguration, incompleteLabels, invalidQuestions, labelMembers,
  moveRule, removeCriterion, removeQuestion, removeRule, renameCriterion, renameQuestion,
  setPriority, setRuleChoice, setFallback, setQuestion, toggleRuleCriterion,
  toggleRuleQuestion, toOverlayPayload, unassignedModels, workflowEdges,
} from "./model/draft";
import type { DraftDiff, ModelDraft, RoutingDraft, WorkflowEdge } from "./model/draft";
import { selectionCaption } from "./model/selection";

interface EditorProps {
  config: ConfigurationPayload;
  error?: string | null;
  onReloaded: () => Promise<void>;
  onError: (message: string) => void;
  informationOpen?: boolean;
  onInformationOpenChange?: (open: boolean) => void;
  /** True for policy drafts, unfinished add/rename inputs, and unsaved layout work (drag,
   * viewport debounce, queued/in-flight PUTs). Layout work autosaves without applying policy.
   * Parent navigation/beforeunload guards must retain the editor while this is true. */
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onUnauthorized?: () => void;
}

const POOL_ID = "pool";
const actionButtonClass = "min-h-9 rounded-md border-outline bg-panel px-3 text-ink hover:border-primary hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const primaryButtonClass = "min-h-9 rounded-md px-3";

function ruleId(index: number): string { return `rule-${index}`; }
function chipId(modelId: string, source: string): string { return `chip::${modelId}::${source}`; }
function parseChip(id: string): { modelId: string; source: string } | null {
  const parts = id.split("::");
  return parts.length === 3 && parts[1] && parts[2] ? { modelId: parts[1], source: parts[2] } : null;
}
function zoneId(tag: string): string { return `zone::${tag}`; }
function parseZone(id: string): string | null {
  const parts = id.split("::");
  return parts.length === 2 ? parts[1] ?? null : null;
}
function foreignTags(model: ModelDraft, config: ConfigurationPayload): string[] {
  const own = new Set(config.labels.map((label) => label.tag));
  return model.tags.filter((tag) => !own.has(tag));
}

function describeRule(rule: RoutingDraft["rules"][number], t: ReturnType<typeof useTranslation>["t"]): string {
  const conditions = Object.entries(rule.when)
    .map(([key, value]) => `${key} = ${Array.isArray(value) ? value.join(` ${t("or")} `) : String(value)}`)
    .join(`, ${t("and")} `);
  return `${conditions} → ${rule.select.label ?? t("unboundLabel")}`;
}

function DiffList({ diff, t }: { diff: DraftDiff; t: ReturnType<typeof useTranslation>["t"] }) {
  const { questions, rules, fallback, models } = diff;
  return <ul className="my-2 ml-5 list-disc space-y-1 text-ink-muted [overflow-wrap:anywhere]">
    {questions.map((change) => <li key={`question-${change.subject}`}>{t("questions")}: {change.subject}: {change.before || t("none")} → {change.after || t("none")}</li>)}
    {rules.map((change, index) => <li key={`rule-${index}`}>{change.subject === "rule count" ? t("ruleOrderFirstMatch") : `${t("rule")} ${change.subject}`}: {change.before || t("none")} → {change.after || t("none")}</li>)}
    {fallback.map((change) => <li key={change.subject}>{t("fallback")}: {change.before || t("none")} → {change.after || t("none")}</li>)}
    {models.map((change, index) => <li key={`model-${index}`}>{t("model")} {change.subject}: {change.before || t("none")} → {change.after || t("none")}</li>)}
  </ul>;
}

function WorkflowConnection({ edge, target, onSelect }: { edge: WorkflowEdge; target: string; onSelect: (node: string) => void }) {
  const { t } = useTranslation();
  return <Button variant="outline" size="sm" className={`workflow-connection min-h-9 whitespace-normal text-left ${edge.kind === "unmatched" ? "[&>svg>path]:[stroke-dasharray:4_4]" : ""}`} onClick={() => onSelect(edge.to)}>
    <svg viewBox="0 0 36 24" width="36" height="24" aria-hidden="true"><path d="M2 12 H30 M25 7 L31 12 L25 17" className={edge.kind === "unmatched" ? "[stroke-dasharray:4_4]" : ""} fill="none" stroke="currentColor" strokeWidth="2" /></svg>
    <span>{edge.kind === "default" ? t("inheritedDefaultPath").replace("{label}", formatRouteLabel("default", t, { defaulted: true })) : edge.kind === "pool" ? t("modelPool") : edge.kind === "match" ? t("match") : t("unmatched")}: {target}</span>
  </Button>;
}

function ChoiceFields({ choice, labels, selections, onChoice }: {
  choice: RoutingDraft["fallback"]; labels: LabelRow[]; selections: string[];
  onChoice: (patch: Partial<RoutingDraft["fallback"]>) => void;
}) {
  const { t } = useTranslation();
  return <>
    <label>{t("label")}<select value={matrixChoiceLabel(choice, labels[0]?.name) ?? ""} onChange={(event) => onChoice({ label: event.target.value })}>
      <option value="">{t("unboundLabel")}</option>{labels.map((label) => <option key={label.name} value={label.name}>{label.name}</option>)}
    </select></label>
    <details className="border-t border-outline pt-2"><summary className="cursor-pointer text-xs text-ink-muted">{t("canvasAdvancedChoice")}</summary><label>{t("selection")}<select value={choice.selection ?? ""} onChange={(event) => onChoice({ selection: event.target.value || undefined })}>
      <option value="">{t("inheritedSelection")}</option>{selections.map((value) => <option key={value} value={value}>{selectionCaption(value, t)}</option>)}
    </select></label></details>
  </>;
}

function RuleRow({
  index,
  total,
  rule,
  labels,
  selections,
  onChoice,
  onMove,
  disabled,
}: {
  index: number;
  total: number;
  rule: RoutingDraft["rules"][number];
  labels: LabelRow[];
  selections: string[];
  onChoice: (patch: { label?: string; selection?: string }) => void;
  onMove: (to: number) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ruleId(index),
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 rounded-lg border border-outline bg-panel p-2 text-ink md:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto]">
      <button
        type="button"
        className="cursor-grab rounded-md px-2 py-1 text-ink-muted hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={t("reorderRule").replace("{index}", String(index + 1)).replace("{total}", String(total))}
        {...attributes}
        {...listeners}
        disabled={disabled}
      >
        <span className="inline-flex w-2.5 items-center justify-center align-middle"><GripVertical className="pointer-events-none size-4 shrink-0" aria-hidden="true" focusable="false" /></span>
      </button>
      <span className="rule-index">{index + 1}</span>
      <span className="rule-condition">{describeRule(rule, t)}</span>
      <label>
        {t("label")}
        <select
          value={matrixChoiceLabel(rule.select, labels[0]?.name) ?? ""}
          disabled={disabled}
          onChange={(event) => onChoice({ label: event.target.value })}
        >
          {labels.map((label) => (
            <option key={label.name} value={label.name}>
              {label.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("selection")}
        <select
          value={rule.select.selection ?? ""}
          disabled={disabled}
          onChange={(event) => onChoice({ selection: event.target.value })}
        >
          <option value="">{t("defaultSelection")}</option>
          {selections.map((name) => (
            <option key={name} value={name}>
        {selectionCaption(name, t)}
            </option>
          ))}
        </select>
      </label>
      <span className="flex gap-1">
        <button
          type="button"
          disabled={disabled || index === 0}
          onClick={() => onMove(index - 1)}
          aria-label={t("moveRuleEarlier").replace("{index}", String(index + 1))}
        >
          <span className="inline-flex w-[11px] items-center justify-center align-middle"><ArrowUp className="pointer-events-none size-4 shrink-0" aria-hidden="true" focusable="false" /></span>
        </button>
        <button
          type="button"
          disabled={disabled || index === total - 1}
          onClick={() => onMove(index + 1)}
          aria-label={t("moveRuleLater").replace("{index}", String(index + 1))}
        >
          <span className="inline-flex w-[11px] items-center justify-center align-middle"><ArrowDown className="pointer-events-none size-4 shrink-0" aria-hidden="true" focusable="false" /></span>
        </button>
      </span>
    </li>
  );
}

function ModelChip({
  model,
  source,
  config,
  onPriority,
  onMembership,
  disabled,
  membershipLocked,
}: {  model: ModelDraft;
  source: string;
  config: ConfigurationPayload;
  onPriority: (priority: number) => void;
  onMembership: (tag: string, member: boolean) => void;
  disabled: boolean;
  membershipLocked?: boolean;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: chipId(model.id, source),
    disabled: disabled || membershipLocked,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 3 }
    : undefined;
  const foreign = foreignTags(model, config);
  return (
    <div ref={setNodeRef} style={style} className={`mb-2 grid min-w-0 gap-2 rounded-lg border border-outline bg-panel p-3 text-ink${isDragging ? " shadow-lg" : ""}`}>
      <button
        type="button"
        className="w-full rounded-md border-0 bg-transparent p-0 text-left font-semibold text-ink focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={t("moveModel").replace("{model}", model.id)}
        {...listeners}
        {...attributes}
        disabled={disabled || membershipLocked}
      >
        {model.id}
      </button>
      <label>
        {t("addToLabel")}
        <select className="min-h-9 rounded-md border border-outline bg-panel px-2 text-ink"
          value=""
          disabled={disabled || membershipLocked}
          aria-label={t("addModelToLabel").replace("{model}", model.id)}
          onChange={(event) => onMembership(event.target.value, true)}
        >
          <option value="">{t("chooseLabel")}</option>
          {config.labels.filter((label) => label.resolution === "tag" && !model.tags.includes(label.tag)).map((label) => (
            <option key={label.tag} value={label.tag}>{label.name}</option>
          ))}
        </select>
      </label>
      {source === POOL_ID ? null : (
        <button className="min-h-9 rounded-md border border-outline bg-panel px-2 text-ink hover:border-primary" type="button" disabled={disabled || membershipLocked} onClick={() => onMembership(source, false)}
          aria-label={t("removeModelFromLabel").replace("{model}", model.id).replace("{label}", source)}>
          {t("remove")}
        </button>
      )}
      {foreign.length === 0 ? null : (
        <span className="break-words text-xs text-ink-muted" title={t("otherStrategyTags")}>
          {foreign.join(" ")}
        </span>
      )}
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        {t("priority")}
        <input className="min-h-8 w-20 rounded-md border border-outline bg-panel px-2 text-ink"
          type="number"
          value={model.priority}
          disabled={disabled}
          aria-label={t("priorityForModel").replace("{model}", model.id)}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            if (Number.isFinite(parsed)) onPriority(parsed);
          }}
        />
      </label>
    </div>
  );
}

function DropZone({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`min-h-18 rounded-xl border border-dashed p-3 ${isOver ? "border-primary bg-primary/5" : "border-outline bg-panel-muted"}`}>
      <h4 className="mb-2 text-sm font-semibold text-ink">{title}</h4>
      {subtitle === undefined ? null : <div className="meta">{subtitle}</div>}
      {children}
    </div>
  );
}

export default function RoutingEditor({ config, error, onReloaded, onError, informationOpen, onInformationOpenChange, onDirtyChange, onPendingChange, onUnauthorized }: EditorProps) {
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
  const reportFailure = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 401) onUnauthorized?.();
    onError(caught instanceof Error ? caught.message : String(caught));
  }, [onError, onUnauthorized]);
  const [strategyMetadata, setStrategyMetadata] = useState<{ strategy: string; description: string | null } | null>(null);
  const strategyDescription = strategyMetadata?.strategy === config.strategy ? strategyMetadata.description : null;
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let current = true;
    void api.strategies(controller.signal).then((payload) => {
      if (current) setStrategyMetadata({ strategy: config.strategy, description: payload.data.find((strategy) => strategy.name === config.strategy)?.description ?? null });
    }).catch((caught: unknown) => {
      if (current) reportFailure(caught);
    });
    return () => { current = false; controller.abort(); };
  }, [active, config.strategy, reportFailure]);
  const [draft, setDraft] = useState<RoutingDraft>(() => draftFromConfiguration(config));
  const [historyBoundary, setHistoryBoundary] = useState(0);
  const [discardBoundary, setDiscardBoundary] = useState(0);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef(0);
  useEffect(() => {
    if (active) return;
    const owner = ++operation.current;
    queueMicrotask(() => { if (owner === operation.current) setBusy(false); });
  }, [active]);
  const [serverWarnings, setServerWarnings] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState("");
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [nodeDragging, setNodeDragging] = useState(false);
  const [localInformationOpen, setLocalInformationOpen] = useState(false);
  const infoOpen = informationOpen ?? localInformationOpen;
  const setInfoOpen = useCallback((open: boolean) => {
    setLocalInformationOpen(open);
    onInformationOpenChange?.(open);
  }, [onInformationOpenChange]);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [inspectorAt, setInspectorAt] = useState<(NonNullable<ReturnType<typeof inspectorPosition>> & { fallback: boolean }) | null>(null);
  const [revealNode, setRevealNode] = useState<{ id: string; serial: number } | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const ruleFormRef = useRef<HTMLFieldSetElement>(null);
  const drawerBodyRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);
  const openDrawerAt = useCallback((target: "rule" | "review") => {
    setInfoOpen(true);
    requestAnimationFrame(() => {
      if (!activeRef.current) return;
      const body = drawerBodyRef.current;
      const item = target === "rule" ? ruleFormRef.current : reviewRef.current;
      if (body && item) body.scrollTop += item.getBoundingClientRect().top - body.getBoundingClientRect().top;
      (item?.querySelector<HTMLElement>("select, input, button") ?? item)?.focus({ preventScroll: true });
    });
  }, [setInfoOpen, requestAnimationFrame]);
  const handoffFocus = () => {
    const workspace = workspaceRef.current;
    const canvas = workspace?.querySelector<HTMLElement>(".routing-canvas-scroll") ?? null;
    const node = [...(workspace?.querySelectorAll<HTMLButtonElement>("[data-canvas-node]") ?? [])]
      .find((item) => item.dataset.canvasNode === selectedNode) ?? null;
    handoffInspectorFocus(inspectorRef.current, node, canvas, canvas ? canvasAvailableRect(canvas) : null);
  };
  const selectEditorNode = (id: string) => {
    handoffFocus();
    setAnchor(null);
    setInfoOpen(false);
    setSelectedNodes([]); setSelectedNode(id); setInspectorOpen(true);
    setRevealNode((current) => ({ id, serial: (current?.serial ?? 0) + 1 }));
  };
  const selectLayoutNodes = (ids: string[]) => {
    if (ids.length !== 1 || ids[0] !== selectedNode) handoffFocus();
    setSelectedNodes(ids);
    if (ids.length === 1) { setSelectedNode(ids[0]!); setInspectorOpen(true); setInfoOpen(false); }
    else { setSelectedNode(""); setInspectorOpen(false); }
  };
  const selectCanvasNode = (id: string, focusInspector = false) => {
    if (id !== selectedNode) handoffFocus();
    setSelectedNodes([]);
    setSelectedNode(id);
    setInspectorOpen(true);
    setInfoOpen(false);
    if (focusInspector) requestAnimationFrame(() => { if (activeRef.current) requestAnimationFrame(() => { if (activeRef.current) inspectorRef.current?.querySelector("button")?.focus({ preventScroll: true }); }); });
  };
  const closeInspector = () => {
    handoffFocus();
    setInspectorOpen(false);
  };
  const [review, setReview] = useState<{ payload: RoutingOverlayPayload; warnings: string[]; diff: DraftDiff } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [resetReview, setResetReview] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newRuleQuestion, setNewRuleQuestion] = useState("");
  const [newRuleCriterion, setNewRuleCriterion] = useState("");
  const [newRuleLabel, setNewRuleLabel] = useState("");
  const [topology, setTopology] = useState<{ serial: number; mutation: RuleLayoutMutation } | null>(null);
  const [newCriteria, setNewCriteria] = useState<Record<string, string>>({});
  const [questionNames, setQuestionNames] = useState<Record<string, string>>({});
  const [criterionNames, setCriterionNames] = useState<Record<string, string>>({});
  const { t } = useTranslation();
  const { locale } = useLocale();
  const updateInspectorPosition = useCallback(() => {
    if (!activeRef.current) return;
    const workspace = workspaceRef.current;
    const panel = inspectorRef.current;
    if (!workspace || !panel) return;
    const bounds = workspace.getBoundingClientRect();
    const canvas = workspace.querySelector<HTMLElement>(".routing-canvas-scroll");
    const available = canvas && canvasAvailableRect(canvas);
    const position = anchor && available ? inspectorPosition(anchor, available, { width: 340, height: 460 }) : null;
    const fallback = inspectorFallbackPosition(available, visibleCanvasRect(bounds, pageViewport()) ?? bounds);
    const next = position ?? fallback;
    setInspectorAt({ ...next, x: next.x - bounds.left, y: next.y - bounds.top, fallback: !position });
  }, [anchor]);
  useLayoutEffect(() => {
    if (!active || !inspectorOpen || nodeDragging) return;
    updateInspectorPosition();
    const observer = new ResizeObserver(updateInspectorPosition);
    if (inspectorRef.current) observer.observe(inspectorRef.current);
    if (workspaceRef.current) observer.observe(workspaceRef.current);
    workspaceRef.current?.querySelectorAll("[data-canvas-occlusion]").forEach((element) => observer.observe(element));
    window.addEventListener("resize", updateInspectorPosition);
    window.addEventListener("scroll", updateInspectorPosition, true);
    window.visualViewport?.addEventListener("resize", updateInspectorPosition);
    window.visualViewport?.addEventListener("scroll", updateInspectorPosition);
    return () => { observer.disconnect(); window.removeEventListener("resize", updateInspectorPosition); window.removeEventListener("scroll", updateInspectorPosition, true); window.visualViewport?.removeEventListener("resize", updateInspectorPosition); window.visualViewport?.removeEventListener("scroll", updateInspectorPosition); };
  }, [active, inspectorOpen, nodeDragging, anchor, updateInspectorPosition]);
  const tr = useCallback((key: Parameters<typeof t>[0], values: Record<string, string> = {}) =>
    Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key)), [t]);

  const selections = useMemo(() => {
    const found = new Set<string>();
    for (const rule of config.rules) {
      if (rule.select.selection !== undefined) found.add(rule.select.selection);
    }
    for (const name of ["cheapest_adequate", "quality_first", "balanced"]) found.add(name);
    return [...found].sort();
  }, [config.rules]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const diff = diffSummary(draft, config);
  const pendingFields = !!(newQuestion || newRuleQuestion || newRuleCriterion || newRuleLabel) || Object.values(newCriteria).some(Boolean) || Object.entries(questionNames).some(([name, value]) => value !== name) || Object.entries(criterionNames).some(([name, value]) => name.slice(name.indexOf("::") + 2) !== value);
  const dirty = diff.changed || pendingFields || layoutDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  useEffect(() => { onPendingChange?.(busy || layoutDirty); }, [busy, layoutDirty, onPendingChange]);
  useEffect(() => () => { onPendingChange?.(false); }, [onPendingChange]);
  const incompleteNodes = incompleteLabels(draft, config);
  const incomplete = incompleteNodes.length > 0;
  const questionErrors = invalidQuestions(draft);
  const writeDisabled = !active || !config.write_available;
  const editDisabled = writeDisabled || busy || review !== null || resetReview;
  const edges = workflowEdges(draft, config);
  const addableQuestions = Object.entries(draft.questions).filter(([, question]) => Object.keys(question.criteria).length > 0);
  const addableLabels = config.labels.filter((label) => label.resolution === "tag" ||
    label.models.some((id) => Object.hasOwn(draft.models, id)));
  // Future AI proposal composition belongs at this boundary: a proposal must enter
  // the ordinary draft, validation, review and explicit apply flow. No prompt UI or payload exists here.
  const selectedRuleIndex = selectedNode.startsWith("rule-") ? Number(selectedNode.slice(5)) : -1;
  const selectedRuleExists = Number.isInteger(selectedRuleIndex) && selectedRuleIndex >= 0 && selectedRuleIndex < draft.rules.length;
  const updateRuleDraft = useCallback((next: RoutingDraft, mutation?: RuleLayoutMutation) => {
    if (next === draft) return;
    setDraft(next);
    if (mutation) {
      setTopology((current) => ({ serial: (current?.serial ?? 0) + 1, mutation }));
      setSelectedNode((id) => reconcileRuleSelection(id, mutation));
      setSelectedNodes((ids) => ids.map((id) => reconcileRuleSelection(id, mutation)).filter(Boolean));
    }
  }, [draft]);
  const applyRuleMove = (from: number, to: number) => updateRuleDraft(moveRule(draft, from, to), { kind: "move", from, to });
  const applyRuleRemoval = (index: number) => {
    const next = removeRule(draft, index);
    updateRuleDraft(next, { kind: "remove", index });
    selectEditorNode("questions");
  };

  const updateMembership = (modelId: string, tag: string, member: boolean) => {
    const next = changeLabelMembership(draft, config, modelId, tag, member);
    if (next === null) onError(t("canvasInvalidConnection"));
    else setDraft(next);
  };

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over === null ? null : String(event.over.id);
      if (overId === null || editDisabled) return;

      if (activeId.startsWith("rule-")) {
        const from = Number.parseInt(activeId.slice("rule-".length), 10);
        const to = Number.parseInt(overId.slice("rule-".length), 10);
        if (Number.isFinite(from) && Number.isFinite(to)) {
          updateRuleDraft(moveRule(draft, from, to), { kind: "move", from, to });
        }
        return;
      }

      const chip = parseChip(activeId);
      const tag = parseZone(overId);
      if (chip === null || tag === null) return;
      if (chip.source !== POOL_ID && config.labels.find((label) => label.tag === chip.source)?.resolution === "models") return;
      if (tag !== POOL_ID && config.labels.find((label) => label.tag === tag)?.resolution !== "tag") return;
      setDraft((current) => {
        if (tag === POOL_ID) {
          // Back to the pool: drop the tag this chip was dragged out of.
          const next = chip.source === POOL_ID
            ? current
            : changeLabelMembership(current, config, chip.modelId, chip.source, false);
          if (next === null) onError(t("canvasInvalidConnection"));
          return next ?? current;
        }
        return changeLabelMembership(current, config, chip.modelId, tag, true) ?? current;
      });
    },
    [editDisabled, config, onError, t, draft, updateRuleDraft],
  );

  const startReview = useCallback(() => {
    if (writeDisabled || busy || layoutDirty || pendingFields || !diff.changed || incompleteLabels(draft, config).length || invalidQuestions(draft).length) return;
    setBusy(true);
    setServerWarnings([]);
    const payload = toOverlayPayload(draft, config);
    const reviewedDiff = diffSummary(draft, config);
    const generation = activityGeneration.current;
    const owner = ++operation.current;
    const current = () => activeRef.current && generation === activityGeneration.current && owner === operation.current;
    void (async () => {
      try {
        const result = await api.validateConfiguration(payload);
        if (!current()) return;
        if (!result.valid) throw new Error(t("invalidConfiguration"));
        setReview({ payload, diff: reviewedDiff, warnings: result.warnings.map((warning) => tr("validationWarning", { code: warning.code, message: warning.message })) });
        setAcknowledged(false);
        openDrawerAt("review");
      } catch (caught) {
        if (current()) reportFailure(caught);
      } finally {
        if (current()) setBusy(false);
      }
    })();
  }, [writeDisabled, busy, layoutDirty, pendingFields, diff.changed, draft, config, t, tr, reportFailure, openDrawerAt]);

  const save = useCallback(() => {
    if (review === null || busy || layoutDirty || writeDisabled || (review.warnings.length > 0 && !acknowledged)) return;
    setBusy(true);
    const generation = activityGeneration.current;
    const owner = ++operation.current;
    const current = () => activeRef.current && generation === activityGeneration.current && owner === operation.current;
    void (async () => {
      try {
        const response = await api.applyConfiguration(review.payload);
        if (!current()) return;
        setServerWarnings(response.warnings.map((warning) => tr("validationWarning", { code: warning.code, message: warning.message })));
        setNotice(t("routingApplied"));
        setHistoryBoundary((value) => value + 1);
        setReview(null);
        setInfoOpen(false);
        await onReloaded();
      } catch (caught) {
        if (current()) reportFailure(caught);
      } finally {
        if (current()) setBusy(false);
      }
    })();
  }, [review, busy, layoutDirty, writeDisabled, acknowledged, reportFailure, onReloaded, t, tr, setInfoOpen]);

  const reset = useCallback(() => {
    if (writeDisabled || busy || layoutDirty || !resetReview) return;
    setBusy(true);
    const generation = activityGeneration.current;
    const owner = ++operation.current;
    const current = () => activeRef.current && generation === activityGeneration.current && owner === operation.current;
    void (async () => {
      try {
        await api.resetConfiguration();
        if (!current()) return;
        setResetReview(false);
        setNotice(t("overlayRemoved"));
        setHistoryBoundary((value) => value + 1);
        setServerWarnings([]);
        await onReloaded();
      } catch (caught) {
        if (current()) reportFailure(caught);
      } finally {
        if (current()) setBusy(false);
      }
    })();
  }, [reportFailure, onReloaded, t, writeDisabled, busy, layoutDirty, resetReview]);

  const heading = <>
      {config.models.length === 0 ? <p role="status" className="text-sm text-ink-muted">{t("setupEmptyModels")}</p> : null}
      <header className="workspace-heading flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span className="meta text-xs text-ink-muted">{t("routingWorkflow")}</span>
          <h2 className="text-[17px] font-semibold text-ink">{config.strategy}</h2>
          <details className="text-xs text-ink-muted">
            <summary className="cursor-pointer">{t("ruleOrderFirstMatch")}</summary>
            {strategyDescription ? <p className="mt-1">{strategyDescription}</p> : <p className="mt-1">{t("canvasQuestionEntry")}</p>}
            <p className="mt-1">{t("from")} <code>{config.baseline_source}</code> · {config.overlay.applied ? t("overlayApplied") : t("noOverlay")}</p>
          </details>
        </div>
        <span className="workspace-status max-w-full rounded-md border border-outline bg-panel-muted px-2 py-1 text-xs text-ink-muted [overflow-wrap:anywhere]" role="status" data-policy-draft={diff.changed ? "pending" : "unchanged"}>
          {busy ? t(review || resetReview ? "canvasApplyingPolicy" : "canvasValidatingPolicy") : pendingFields ? t("canvasIncompleteState") : incomplete || questionErrors.length > 0 ? t("canvasInvalidState") : review ? t("reviewChanges") : diff.changed ? t("pendingChanges") : t("noPendingChanges")}
        </span>
      </header>
      {error ? <div className="notice warn" role="alert">{error}</div> : null}
      {pendingFields && <p className="notice warn" role="status">{t("canvasPendingFields")}</p>}
      {incomplete && <div className="notice warn" role="status"><span>{t("canvasIncompleteDraft")}</span> <button type="button" onClick={() => selectEditorNode(incompleteNodes[0] ?? "fallback")}>{t("canvasRepair")}</button></div>}
      {questionErrors.map(({ name, reason }) => <div key={name} className="notice warn" role="status"><span>{name}: {t(({ type: "canvasQuestionTypeError", criteria: "canvasQuestionCriteriaError", instructions: "canvasQuestionInstructionsError", criterionName: "canvasQuestionCriterionNameError", criterionDescription: "canvasQuestionCriterionDescriptionError" } as const)[reason])}</span> <button type="button" onClick={() => selectEditorNode("questions")}>{t("canvasRepair")}</button>{reason === "type" && <button type="button" disabled={editDisabled} onClick={() => { const question = draft.questions[name]; if (question) setDraft(setQuestion(draft, name, { ...question, type: "choice" })); selectEditorNode("questions"); }}>{t("canvasUseChoice")}</button>}</div>)}
      {config.overlay.error === null ? null : (
        <div className="notice warn" role="alert"><span>{tr("overlayUnreadable", { error: config.overlay.error })}</span> <span>{t("canvasOverlayRepair")}</span> <button type="button" disabled={writeDisabled || busy || layoutDirty || review !== null} onClick={() => { setResetReview(true); openDrawerAt("review"); }}>{t("resetBaseline")}</button></div>
      )}
      {writeDisabled ? (
        <div className="notice warn">
          {t("routingEditsDisabled")}
        </div>
      ) : null}
      {notice === null ? null : <div className="notice">{notice}</div>}
      {serverWarnings.map((warning) => (
        <div className="notice warn" key={warning}>
          {warning}
        </div>
      ))}
      {config.warnings.length === 0 ? null : (
        <div className="notice warn">
          {config.warnings.map((warning) => (
            <div key={`${warning.code}-${warning.label ?? ""}`}>{tr("validationWarning", { code: warning.code, message: warning.message })}</div>
          ))}
        </div>
      )}
  </>;

  return (
    <section className="workflow-workspace relative flex-1 isolate min-w-0 min-h-0 overflow-hidden" ref={workspaceRef} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      if (inspectorOpen) { event.preventDefault(); event.stopPropagation(); closeInspector(); }
      else if (infoOpen) { event.preventDefault(); setInfoOpen(false); drawerToggleRef.current?.focus({ preventScroll: true }); }
    }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <RoutingCanvas heading={heading} draft={draft} config={config} disabled={editDisabled} selected={selectedNode} selection={selectedNodes}
               onSelect={selectCanvasNode} onSelection={selectLayoutNodes} onDraft={updateRuleDraft} onError={onError} topology={topology}
               onUnauthorized={onUnauthorized}
              inspectorOpen={inspectorOpen} onAnchor={setAnchor} revealNode={revealNode} onReveal={selectEditorNode}
              onDraggingChange={setNodeDragging}
              onLayoutDirtyChange={setLayoutDirty}
              historyBoundary={historyBoundary}
              discardBoundary={discardBoundary}
              canAddRule={addableQuestions.length > 0 && addableLabels.length > 0}
              >
          {(canvasInformation: ReactNode) => <>
          {inspectorOpen && selectedNodes.length <= 1 && <aside className="workflow-inspector absolute z-[6] flex w-[min(340px,calc(100vw-24px))] max-h-[460px] flex-col overflow-hidden rounded-lg border border-outline bg-panel shadow-[0_8px_28px_color-mix(in_srgb,var(--text)_16%,transparent)] data-[fallback=true]:z-10" ref={inspectorRef} data-fallback={inspectorAt?.fallback} style={{ left: inspectorAt?.x, top: inspectorAt?.y, width: inspectorAt?.width, height: inspectorAt?.height, visibility: inspectorAt && !nodeDragging ? "visible" : "hidden" }} aria-label={t("nodeInspector")}>
            <header className="inspector-heading flex items-center justify-between gap-2 border-b border-outline bg-panel-muted p-3"><h3 className="text-sm font-semibold text-ink">{t("nodeInspector")}</h3><Button variant="outline" className={actionButtonClass} type="button" title={t("closeInspector")} aria-label={t("closeInspector")} onClick={closeInspector}><span className="inline-flex w-[9px] items-center justify-center"><X aria-hidden="true" focusable="false" /></span></Button></header>
        <div className="inspector-body min-h-0 flex-1 overflow-y-auto p-3 text-[13px] text-ink">
        <p className="mb-3 border-s-2 border-primary bg-panel-muted p-2 text-xs text-ink-muted">{t("reviewChanges")} · {diff.changed ? t("pendingChanges") : t("noPendingChanges")}</p>
        <p className="mb-3 text-xs text-ink-muted">{selectedRuleExists ? t("ruleOrderFirstMatch") : selectedNode === "questions" ? t("canvasQuestionEntry") : selectedNode === "fallback" ? t("unmatchedFallback") : selectedNode.startsWith("zone::") ? t("modelPool") : t("priority")}</p>
        {selectedNodes.length <= 1 && <div className="workflow-edit space-y-3 [&>fieldset]:border-0 [&>fieldset]:p-0 [&_fieldset_fieldset]:border-0 [&_fieldset_fieldset]:p-0 [&_label]:grid [&_label]:gap-1 [&_label]:text-xs [&_label]:text-ink-muted [&_label:has(input[type=checkbox])]:flex [&_label:has(input[type=checkbox])]:items-center [&_label:has(input[type=checkbox])]:gap-2 [&_input:not([type=checkbox])]:min-h-9 [&_input:not([type=checkbox])]:rounded-md [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-outline [&_input:not([type=checkbox])]:bg-panel [&_input:not([type=checkbox])]:px-2 [&_textarea]:min-h-20 [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-outline [&_textarea]:bg-panel [&_textarea]:p-2 [&_select]:min-h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-outline [&_select]:bg-panel [&_select]:px-2" aria-live="polite">
          {selectedNode === "questions" ? <fieldset className="grid min-w-0 gap-3 rounded-lg border border-outline p-3 disabled:opacity-70 [&_label]:grid [&_label]:gap-1 [&_label]:text-xs [&_label]:text-ink-muted [&_input:not([type=checkbox])]:min-h-9 [&_input:not([type=checkbox])]:rounded-md [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-outline [&_input:not([type=checkbox])]:bg-panel [&_input:not([type=checkbox])]:px-2 [&_textarea]:min-h-20 [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-outline [&_textarea]:bg-panel [&_textarea]:p-2 [&_select]:min-h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-outline [&_select]:bg-panel [&_select]:px-2" disabled={editDisabled}><legend>{t("questionDefinitions")}</legend>{Object.entries(draft.questions).map(([name, question]) => <div key={name}><label>{t("questionName")}<input value={questionNames[name] ?? name} onChange={(event) => setQuestionNames((current) => ({ ...current, [name]: event.target.value }))} /></label><button type="button" disabled={!questionNames[name] || (questionNames[name] !== name && Object.hasOwn(draft.questions, questionNames[name] ?? ""))} onClick={() => { setDraft((current) => renameQuestion(current, name, questionNames[name]!)); setQuestionNames({}); }}>{t("rename")}</button><button type="button" disabled={Object.keys(draft.questions).length <= 1 || draft.rules.some((rule) => Object.hasOwn(rule.when, name) && Object.keys(rule.when).length === 1)} onClick={() => setDraft((current) => removeQuestion(current, name))}>{t("remove")}</button><label>{t("instructions")}<textarea value={question.instructions} onChange={(event) => setDraft((current) => setQuestion(current, name, { ...question, instructions: event.target.value }))} /></label><div>{Object.entries(question.criteria).map(([criterion, description]) => <div key={criterion}><label>{t("criterionKey")}<input value={criterionNames[`${name}::${criterion}`] ?? criterion} onChange={(event) => setCriterionNames((current) => ({ ...current, [`${name}::${criterion}`]: event.target.value }))} /></label><button type="button" disabled={!criterionNames[`${name}::${criterion}`] || (criterionNames[`${name}::${criterion}`] !== criterion && Object.hasOwn(question.criteria, criterionNames[`${name}::${criterion}`] ?? ""))} onClick={() => { setDraft((current) => renameCriterion(current, name, criterion, criterionNames[`${name}::${criterion}`]!)); setCriterionNames({}); }}>{t("rename")}</button><button type="button" disabled={Object.keys(question.criteria).length <= 2 || draft.rules.some((rule) => { const value = rule.when[name]; return (Array.isArray(value) ? value.length === 1 && value[0] === criterion : value === criterion) && Object.keys(rule.when).length === 1; })} onClick={() => setDraft((current) => removeCriterion(current, name, criterion))}>{t("remove")}</button><label>{t("criterionDescription")}<input value={description} onChange={(event) => setDraft((current) => setQuestion(current, name, { ...question, criteria: { ...question.criteria, [criterion]: event.target.value } }))} /></label></div>)}</div><label>{t("newCriterion")}<input value={newCriteria[name] ?? ""} onChange={(event) => setNewCriteria((current) => ({ ...current, [name]: event.target.value }))} /></label><button type="button" onClick={() => { setDraft((current) => addCriterion(current, name, newCriteria[name] ?? "")); setNewCriteria((current) => ({ ...current, [name]: "" })); }}>{t("add")}</button></div>)}<label>{t("newQuestion")}<input value={newQuestion} onChange={(event) => setNewQuestion(event.target.value)} /></label><button type="button" onClick={() => { setDraft((current) => addQuestion(current, newQuestion)); setNewQuestion(""); }}>{t("add")}</button></fieldset> : null}
          {selectedNode === "fallback" && <fieldset className="grid min-w-0 gap-3 rounded-lg border border-outline p-3 disabled:opacity-70" disabled={editDisabled}>
            <legend>{t("unmatchedFallback")}</legend>
            <ChoiceFields choice={draft.fallback} labels={config.labels} selections={selections} onChoice={(patch) => setDraft((current) => setFallback(current, patch))} />
          </fieldset>}
          {selectedRuleExists && (() => {
            const index = selectedRuleIndex, rule = draft.rules[index]!;
            return <fieldset className="grid min-w-0 gap-3 rounded-lg border border-outline p-3 disabled:opacity-70" disabled={editDisabled}>
              <legend>{t("rule")} {index + 1}</legend>
              <button type="button" disabled={editDisabled} onClick={() => applyRuleRemoval(index)}>{t("deleteRule")}</button>
              <section aria-label={t("canvasConditions")} className="space-y-2"><h4 className="text-xs font-semibold">{t("canvasConditions")}</h4>{Object.entries(draft.questions).map(([question, definition]) => {
                const selected = rule.when[question], values = selected === undefined ? [] : Array.isArray(selected) ? selected : [selected];
                return <fieldset key={question} className="min-w-0 space-y-2"><legend className="mb-2 text-xs font-semibold">{question}</legend>
                  <label><input type="checkbox" checked={selected !== undefined} disabled={editDisabled || (selected !== undefined && Object.keys(rule.when).length === 1)} onChange={(event) => setDraft((current) => toggleRuleQuestion(current, index, question, event.target.checked))} />{t("includeQuestion")}</label>
                  {Object.keys(definition.criteria).map((criterion) => <label key={criterion}><input type="checkbox" disabled={editDisabled || selected === undefined} checked={values.includes(criterion)} onChange={(event) => setDraft((current) => toggleRuleCriterion(current, index, question, criterion, event.target.checked))} />{criterion}</label>)}
                </fieldset>;
              })}</section>
              <section aria-label={t("canvasDestination")} className="space-y-2 border-t border-outline pt-2"><h4 className="text-xs font-semibold">{t("canvasDestination")}</h4><ChoiceFields choice={rule.select} labels={config.labels} selections={selections} onChoice={(patch) => setDraft((current) => setRuleChoice(current, index, patch))} /></section>
              <button type="button" disabled={editDisabled || index === 0} onClick={() => applyRuleMove(index, index - 1)}>{t("moveEarlier")}</button>
              <button type="button" disabled={editDisabled || index === draft.rules.length - 1} onClick={() => applyRuleMove(index, index + 1)}>{t("moveLater")}</button>
            </fieldset>;
          })()}
          {selectedNode.startsWith("model::") ? (() => { const model = draft.models[selectedNode.slice(7)]; return model ? <fieldset className="grid min-w-0 gap-3 rounded-lg border border-outline p-3 disabled:opacity-70 [&_label]:grid [&_label]:gap-1 [&_label]:text-xs [&_label]:text-ink-muted [&_input:not([type=checkbox])]:min-h-9 [&_input:not([type=checkbox])]:rounded-md [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-outline [&_input:not([type=checkbox])]:bg-panel [&_input:not([type=checkbox])]:px-2 [&_textarea]:min-h-20 [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-outline [&_textarea]:bg-panel [&_textarea]:p-2 [&_select]:min-h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-outline [&_select]:bg-panel [&_select]:px-2" disabled={editDisabled}><legend>{t("model")} {model.id}</legend><label>{t("priority")}<input type="number" value={model.priority} onChange={(event) => { const priority = Number.parseInt(event.target.value, 10); if (Number.isFinite(priority)) setDraft((current) => setPriority(current, model.id, priority)); }} /></label>{config.labels.map((label) => <label key={label.tag}><input type="checkbox" disabled={editDisabled || label.resolution === "models"} checked={label.resolution === "models" ? label.models.includes(model.id) : model.tags.includes(label.tag)} onChange={(event) => updateMembership(model.id, label.tag, event.target.checked)} />{label.name}{label.resolution === "models" ? ` (${t("explicitModelsReadOnly")})` : ""}</label>)}</fieldset> : null; })() : null}
          {selectedNode.startsWith("zone::") ? (() => { const label = config.labels.find((item) => zoneId(item.tag) === selectedNode); return label ? <fieldset className="grid min-w-0 gap-3 rounded-lg border border-outline p-3 disabled:opacity-70 [&_label]:grid [&_label]:gap-1 [&_label]:text-xs [&_label]:text-ink-muted [&_input:not([type=checkbox])]:min-h-9 [&_input:not([type=checkbox])]:rounded-md [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-outline [&_input:not([type=checkbox])]:bg-panel [&_input:not([type=checkbox])]:px-2 [&_textarea]:min-h-20 [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-outline [&_textarea]:bg-panel [&_textarea]:p-2 [&_select]:min-h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-outline [&_select]:bg-panel [&_select]:px-2" disabled={editDisabled}><legend>{tr("labelPool", { label: label.name })}</legend>{label.resolution === "models" ? <p>{t("explicitModelsReadOnly")}</p> : null}{config.models.map((item) => <label key={item.id}><input type="checkbox" disabled={editDisabled || label.resolution === "models"} checked={label.resolution === "models" ? label.models.includes(item.id) : draft.models[item.id]?.tags.includes(label.tag) ?? false} onChange={(event) => updateMembership(item.id, label.tag, event.target.checked)} />{item.id}</label>)}</fieldset> : null; })() : null}
        </div>}</div></aside>}
      <section className="workflow-drawer absolute bottom-0 left-0 right-0 z-[8] grid max-h-[min(48%,36rem)] grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)] border-t border-outline bg-panel shadow-[0_-3px_14px_color-mix(in_srgb,var(--text)_10%,transparent)] max-[900px]:grid-cols-[minmax(0,1fr)] max-[900px]:grid-rows-[auto_minmax(0,1fr)_auto] max-[600px]:max-h-[min(44%,20rem)] max-[600px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-[600px]:grid-rows-[auto_minmax(0,1fr)] [&>.workflow-toolbar]:max-[900px]:col-start-1 [&>.workflow-toolbar]:max-[900px]:row-start-3 [&>.workflow-toolbar]:max-[900px]:border-t [&>.workflow-toolbar]:max-[600px]:col-start-2 [&>.workflow-toolbar]:max-[600px]:row-start-1 [&>.workflow-drawer-heading>span]:max-[900px]:hidden [&>.workflow-drawer-heading>span]:max-[600px]:hidden" data-canvas-occlusion="bottom" aria-label={t("canvasInformation")}>
        <div className="workflow-drawer-heading flex min-w-0 items-center gap-2 border-b border-outline bg-panel p-2 max-[600px]:min-h-12 max-[600px]:overflow-x-auto max-[600px]:overflow-y-hidden max-[600px]:overscroll-x-contain max-[600px]:[scrollbar-width:thin] max-[600px]:p-[0.2rem_0.45rem] [&>span]:truncate [&>span]:max-[900px]:hidden [&>button]:flex-none max-[900px]:[&>button]:col-span-1 max-[600px]:[&>button]:min-h-10 max-[600px]:[&>button]:w-full max-[600px]:[&>button]:min-w-0 max-[600px]:[&>button]:[overflow-wrap:anywhere]">
          <Button variant="outline" className={actionButtonClass} type="button" ref={drawerToggleRef} aria-expanded={infoOpen} aria-controls="routing-information" onClick={() => setInfoOpen(!infoOpen)}><span><span className="inline-flex w-[7px] items-center justify-center align-middle">{infoOpen ? <ChevronDown aria-hidden="true" focusable="false" /> : <ChevronUp aria-hidden="true" focusable="false" />}</span> {t("canvasInformation")}</span></Button>
          <span className="meta text-xs text-ink-muted" role="status">{diff.changed ? t("pendingChanges") : t("noPendingChanges")}</span>
        </div>
      <div id="routing-information" className="workflow-info col-start-1 row-start-2 min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain p-3 text-ink max-[600px]:col-span-2" ref={drawerBodyRef} hidden={!infoOpen}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted" role="status"><span className={`rounded-md border border-outline bg-panel-muted px-2 py-1 ${diff.changed ? "font-semibold text-primary" : ""}`} data-policy-draft={diff.changed ? "pending" : "unchanged"}>{t("reviewChanges")}: {diff.changed ? t("pendingChanges") : t("noPendingChanges")}</span><span className="rounded-md border border-outline bg-panel-muted px-2 py-1">{t("canvasLayoutOnly")}</span></div>
        {canvasInformation}
        <ConfiguredRouteFlow draft={draft} config={config} locale={locale} />
        <div className="text-xs text-ink-muted">{t("strategy")} <code>{config.strategy}</code> {t("from")} <code className="rounded bg-panel-muted px-1 text-ink">{config.baseline_source}</code></div>
        <div className="text-xs text-ink-muted">{config.overlay.applied ? tr("overlayApplied", { path: config.overlay.path }) : t("noOverlay")}</div>
        <div className="my-3 rounded-xl border border-outline bg-panel-muted p-3">
          <h3 className="text-sm font-semibold text-ink">{t("workflowNodes")}</h3>
          <p className="my-1 text-xs text-ink-muted">{t("firstMatch")}</p>
          <nav className="flex flex-wrap gap-2 overflow-x-auto py-2" aria-label={t("workflowNodes")}>
          <button type="button" onClick={() => selectEditorNode("questions")}>{t("editQuestions")}</button>
          {draft.rules.map((_rule, index) => <button type="button" key={ruleId(index)} onClick={() => selectEditorNode(ruleId(index))}>{t("editRule")} {index + 1}</button>)}
          <button type="button" onClick={() => selectEditorNode("fallback")}>{t("editFallback")}</button>
          {config.labels.map((label) => <button type="button" key={label.tag} onClick={() => selectEditorNode(zoneId(label.tag))}>{`${t("editLabelPool")}: ${label.name}`}</button>)}
          </nav>
        </div>
        <details className="my-3 rounded-xl border border-outline bg-panel p-3 border-t border-outline py-[0.4rem]">
          <summary className="cursor-pointer font-[620] text-[13px] font-semibold text-ink hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("advancedFallback")}</summary>
        <ol className="ml-5 list-decimal space-y-3" aria-label={t("orderedWorkflow")}>
          {draft.rules.map((rule, index) => <li key={`workflow-${index}`}><button type="button" onClick={() => selectEditorNode(ruleId(index))}><strong>{t("rule")} {index + 1}</strong><span>{describeRule(rule, t)}</span></button><div className="my-2 flex flex-wrap gap-2">{edges.filter((edge) => edge.from === ruleId(index)).map((edge) => <WorkflowConnection key={`${edge.kind}-${edge.to}`} edge={edge} onSelect={selectEditorNode} target={edge.to.startsWith("zone::") ? config.labels.find((label) => zoneId(label.tag) === edge.to)?.name ?? t("unboundLabel") : `${t("rule")} ${index + 2}`} />)}</div><div className="workflow-edit-actions"><button type="button" onClick={() => selectEditorNode(ruleId(index))}>{t("editRule")}</button><button type="button" onClick={() => selectEditorNode("questions")}>{t("editQuestions")}</button></div></li>)}
          <li><button type="button" onClick={() => selectEditorNode("fallback")}><strong>{t("fallback")}</strong><span>{draft.fallback.label || t("unboundLabel")} ({selectionCaption(draft.fallback.selection, t)})</span></button><div className="my-2 flex flex-wrap gap-2">{edges.filter((edge) => edge.from === "fallback").map((edge) => <WorkflowConnection key={edge.to} edge={edge} onSelect={selectEditorNode} target={draft.fallback.label || t("unboundLabel")} />)}</div><div className="workflow-edit-actions"><button type="button" onClick={() => selectEditorNode("fallback")}>{t("editFallback")}</button></div></li>
        </ol>
        <div className="my-3 grid gap-3 border-s-2 border-outline ps-3">{config.labels.map((label) => <div key={label.tag}><button type="button" onClick={() => selectEditorNode(zoneId(label.tag))}>{tr("labelPool", { label: label.name })}</button>{edges.filter((edge) => edge.from === zoneId(label.tag)).map((edge) => <WorkflowConnection key={edge.to} edge={edge} onSelect={selectEditorNode} target={edge.to.slice("model::".length)} />)}</div>)}</div>
        </details>
        <fieldset className="rule-add grid min-w-0 gap-3 rounded-xl border border-outline bg-panel p-3 text-ink [&_label]:grid [&_label]:gap-1 [&_label]:text-xs [&_label]:text-ink-muted [&_select]:min-h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-outline [&_select]:bg-panel [&_select]:px-2" ref={ruleFormRef} disabled={editDisabled}>
          <legend>{t("addRule")}</legend>
          <p className="text-xs text-ink-muted">{t("ruleOrderFirstMatch")}</p>
          {addableQuestions.length === 0 || addableLabels.length === 0 ? <p className="text-xs text-ink-muted">{t("noValidRuleOptions")}</p> : null}
          <label className="grid gap-1 text-xs text-ink-muted">{t("questionName")}<select className="min-h-9 rounded-md border border-outline bg-panel px-2 text-ink" value={newRuleQuestion} onChange={(event) => { setNewRuleQuestion(event.target.value); setNewRuleCriterion(""); }}>
            <option value="">{t("chooseQuestion")}</option>{addableQuestions.map(([name]) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <label className="grid gap-1 text-xs text-ink-muted">{t("criterionKey")}<select className="min-h-9 rounded-md border border-outline bg-panel px-2 text-ink" value={newRuleCriterion} disabled={!newRuleQuestion} onChange={(event) => setNewRuleCriterion(event.target.value)}>
            <option value="">{t("chooseCriterion")}</option>{Object.keys(draft.questions[newRuleQuestion]?.criteria ?? {}).map((name) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <label className="grid gap-1 text-xs text-ink-muted">{t("label")}<select className="min-h-9 rounded-md border border-outline bg-panel px-2 text-ink" value={newRuleLabel} onChange={(event) => setNewRuleLabel(event.target.value)}>
            <option value="">{t("chooseLabel")}</option>{addableLabels.map((label) => <option key={label.tag} value={label.name}>{label.name}</option>)}
          </select></label>
          <button type="button" disabled={editDisabled || !newRuleQuestion || !newRuleCriterion || !newRuleLabel} onClick={() => {
            const index = draft.rules.length;
            const next = addRule(draft, config, newRuleQuestion, newRuleCriterion, newRuleLabel);
            if (next === draft) return;
            updateRuleDraft(next, { kind: "insert", index });
            setInfoOpen(false);
            selectEditorNode(`rule-${index}`);
          }}>{t("addRule")}</button>
        </fieldset>
        <details className="my-3 rounded-xl border border-outline bg-panel p-3 border-t border-outline py-[0.4rem]">
          <summary className="cursor-pointer font-[620] text-[13px] font-semibold text-ink hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("advancedEditors")}</summary>
        <h3 className="my-2 text-sm font-semibold text-ink">{t("ruleOrderFirstMatch")}</h3>
        <SortableContext
          items={draft.rules.map((_rule, index) => ruleId(index))}
          strategy={verticalListSortingStrategy}
        >
          <ol className="my-2 grid gap-2 p-0">
            {draft.rules.map((rule, index) => (
              <RuleRow
                key={ruleId(index)}
                index={index}
                disabled={editDisabled}
                total={draft.rules.length}
                rule={rule}
                labels={config.labels}
                selections={selections}
                onChoice={(patch) =>
                  setDraft((current) => setRuleChoice(current, index, patch))
                }
                onMove={(to) => applyRuleMove(index, to)}
              />
            ))}
          </ol>
        </SortableContext>

        <h3 className="my-2 text-sm font-semibold text-ink">{t("labelMembership")}</h3>
        <p className="text-xs text-ink-muted">{t("membershipPriorityHelp")} {t("dropChipHelp")}</p>
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
          <DropZone
            id={zoneId(POOL_ID)}
            title={t("unassigned")}
            subtitle={t("notBoundToLabel")}
          >
            {unassignedModels(draft, config).map((model) => (
              <ModelChip
                key={chipId(model.id, POOL_ID)}
                model={model}
                source={POOL_ID}
                disabled={editDisabled}
                config={config}
                onPriority={(priority) =>
                  setDraft((current) => setPriority(current, model.id, priority))
                }
                onMembership={(tag, member) =>
                  updateMembership(model.id, tag, member)
                }
              />
            ))}
          </DropZone>
          {config.labels.map((label) => (
            <DropZone
              key={label.tag}
              id={zoneId(label.tag)}
              title={Number.isFinite(label.score) ? tr("labelScore", { label: label.name, score: String(label.score) }) : label.name}
              subtitle={
                label.resolution === "models"
                  ? t("explicitModelsReadOnly")
                  : tr("tag", { tag: label.tag })
              }
            >
              {(label.resolution === "models" ? label.models.map((id) => draft.models[id]).filter((model): model is ModelDraft => model !== undefined) : labelMembers(draft, config, label)).map((model) => (
                <ModelChip
                  key={chipId(model.id, label.tag)}
                  model={model}
                  source={label.tag}
                  disabled={editDisabled}
                  membershipLocked={label.resolution === "models"}
                  config={config}
                  onPriority={(priority) =>
                    setDraft((current) => setPriority(current, model.id, priority))
                  }
                  onMembership={(tag, member) =>
                    updateMembership(model.id, tag, member)
                  }
                />
              ))}
              {(label.resolution === "models" ? label.models : labelMembers(draft, config, label)).length === 0 ? (
                <div className="empty">{t("noModelsInLabel")}</div>
              ) : null}
            </DropZone>
          ))}
        </div>
        </details>
      <details className="my-3 rounded-xl border border-outline bg-panel p-3 border-t border-outline py-[0.4rem]">
        <summary className="cursor-pointer font-[620] text-[13px] font-semibold text-ink hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("advancedPoolOrder")}</summary>
      <h3 className="my-2 text-sm font-semibold text-ink">{t("savedPoolOrder")}</h3>
      <p className="meta">
        {t("savedPoolDescription")}
      </p>
      <div className="overflow-x-auto rounded-lg border border-outline">
        <table>
          <thead>
            <tr>
              <th>{t("label")}</th>
              <th>{t("rank")}</th>
              <th>{t("model")}</th>
              <th>{t("entry")}</th>
            </tr>
          </thead>
          <tbody>
            {config.labels.map((label) => {
              return label.models.map((modelId, position) => (
                <tr key={`${label.name}-${modelId}`}>
                  <td data-label={t("label")}>{label.name}</td>
                  <td data-label={t("rank")}>{position + 1}</td>
                  <td data-label={t("model")}>{modelId}</td>
                  <td data-label={t("entry")}>{t("rankedByServer")}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      </details>
      <details className="my-3 rounded-xl border border-outline bg-panel p-3 border-t border-outline py-[0.4rem]">
      <summary className="cursor-pointer font-[620] text-[13px] font-semibold text-ink hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("pendingChanges")}</summary>
      {diff.changed ? (
        <DiffList diff={diff} t={t} />
      ) : (
        <div className="text-ink-muted [overflow-wrap:anywhere]">{t("noPendingChanges")}</div>
      )}
      </details>
      <div ref={reviewRef} tabIndex={-1}>
      {review === null ? null : <div className="notice" role="status"><h4>{t("reviewChanges")}</h4><DiffList diff={review.diff} t={t} />{review.warnings.map((warning) => <div className="notice warn" key={warning}>{warning}</div>)}{review.warnings.length > 0 ? <label><input type="checkbox" disabled={writeDisabled || busy} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{t("acknowledgeWarnings")}</label> : null}</div>}
      {resetReview ? <div className="notice warn" role="status">{t("resetReviewPrompt")}</div> : null}
      </div>
      </div>
      <div className="workflow-toolbar flex flex-wrap items-center gap-2 border-outline bg-panel p-2 max-[900px]:col-start-1 max-[900px]:row-start-3 max-[900px]:border-t max-[600px]:col-start-2 max-[600px]:row-start-1 max-[600px]:flex-nowrap max-[600px]:overflow-x-auto max-[600px]:overflow-y-hidden max-[600px]:overscroll-x-contain max-[600px]:gap-[0.35rem] max-[600px]:min-h-12 max-[600px]:p-[0.25rem_0.45rem] max-[600px]:border-t-0 max-[600px]:border-l max-[600px]:[touch-action:pan-x] max-[600px]:[scrollbar-width:thin] max-[600px]:[&>button]:min-h-10 max-[600px]:[&>button]:flex-none max-[600px]:[&>button]:whitespace-nowrap max-[600px]:[scrollbar-width:thin] max-[600px]:[&>button]:min-h-10 max-[600px]:[&>button]:flex-none max-[600px]:[&>button]:whitespace-nowrap">
        {review === null ? <Button className={primaryButtonClass} type="button" onClick={startReview} disabled={writeDisabled || busy || layoutDirty || pendingFields || resetReview || !diff.changed || incomplete || questionErrors.length > 0}>{t("reviewChanges")}</Button> : <><Button className={primaryButtonClass} type="button" onClick={save} disabled={writeDisabled || busy || layoutDirty || incomplete || questionErrors.length > 0 || (review.warnings.length > 0 && !acknowledged)}>{t("confirmAndSave")}</Button><Button variant="outline" className={actionButtonClass} type="button" onClick={() => setReview(null)} disabled={busy}>{t("backToEditing")}</Button></>}
        <Button variant="outline"
          className={actionButtonClass}
          type="button"
          onClick={() => {
            setDraft(draftFromConfiguration(config));
            setHistoryBoundary((value) => value + 1);
            setDiscardBoundary((value) => value + 1);
            setQuestionNames({}); setCriterionNames({}); setNewCriteria({});
            setNewQuestion(""); setNewRuleQuestion(""); setNewRuleCriterion(""); setNewRuleLabel("");
            selectLayoutNodes([]);
            setNotice(null);
            setReview(null);
          }}
          disabled={writeDisabled || busy || review !== null || !dirty}
        >
          {t("cancel")}
        </Button>
        {resetReview ? <><Button variant="outline" className={actionButtonClass} type="button" onClick={reset} disabled={writeDisabled || busy || layoutDirty}>{t("confirmReset")}</Button><Button variant="outline" className={actionButtonClass} type="button" onClick={() => setResetReview(false)} disabled={busy}>{t("backToEditing")}</Button></> : <Button variant="outline" className={actionButtonClass} type="button" onClick={() => { setResetReview(true); openDrawerAt("review"); }} disabled={writeDisabled || busy || layoutDirty || review !== null || !config.overlay.applied}>{t("resetBaseline")}</Button>}
      </div>
      </section>
      </>}
      </RoutingCanvas>
      </DndContext>
    </section>
  );
}
