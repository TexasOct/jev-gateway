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
import { useCallback, useMemo, useState } from "react";

import { api } from "../api";
import RoutingCanvas from "./RoutingCanvas";
import { changeLabelMembership } from "./canvas";
import type { RuleLayoutMutation } from "./canvas";
import type { ConfigurationPayload, LabelRow, RoutingOverlayPayload } from "../api";
import { useTranslation } from "../i18n";
import {
  addCriterion, addQuestion, addRule, diffSummary, draftFromConfiguration, labelMembers,
  moveRule, removeCriterion, removeQuestion, removeRule, renameCriterion, renameQuestion,
  setPriority, setRuleChoice, setFallback, setQuestion, toggleRuleCriterion,
  toggleRuleQuestion, toOverlayPayload, unassignedModels, workflowEdges,
} from "./draft";
import type { DraftDiff, ModelDraft, RoutingDraft, WorkflowEdge } from "./draft";

interface EditorProps {
  config: ConfigurationPayload;
  onReloaded: () => Promise<void>;
  onError: (message: string) => void;
}

const POOL_ID = "pool";

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
  return <ul className="diff">
    {questions.map((change) => <li key={`question-${change.subject}`}>{t("questions")}: {change.subject}: {change.before || t("none")} → {change.after || t("none")}</li>)}
    {rules.map((change, index) => <li key={`rule-${index}`}>{change.subject === "rule count" ? t("ruleOrderFirstMatch") : `${t("rule")} ${change.subject}`}: {change.before || t("none")} → {change.after || t("none")}</li>)}
    {fallback.map((change) => <li key={change.subject}>{t("fallback")}: {change.before || t("none")} → {change.after || t("none")}</li>)}
    {models.map((change, index) => <li key={`model-${index}`}>{t("model")} {change.subject}: {change.before || t("none")} → {change.after || t("none")}</li>)}
  </ul>;
}

function WorkflowConnection({ edge, target, onSelect }: { edge: WorkflowEdge; target: string; onSelect: (node: string) => void }) {
  const { t } = useTranslation();
  return <button type="button" className={`workflow-connection ${edge.kind}`} onClick={() => onSelect(edge.to)}>
    <svg viewBox="0 0 36 24" width="36" height="24" aria-hidden="true"><path d="M2 12 H30 M25 7 L31 12 L25 17" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
    <span>{edge.kind === "pool" ? t("modelPool") : edge.kind === "match" ? t("match") : t("unmatched")}: {target}</span>
  </button>;
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
    <li ref={setNodeRef} style={style} className="rule-row">
      <button
        type="button"
        className="handle"
        aria-label={t("reorderRule").replace("{index}", String(index + 1)).replace("{total}", String(total))}
        {...attributes}
        {...listeners}
        disabled={disabled}
      >
        ⠿
      </button>
      <span className="rule-index">{index + 1}</span>
      <span className="rule-condition">{describeRule(rule, t)}</span>
      <label>
        {t("label")}
        <select
          value={rule.select.label ?? ""}
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
              {name}
            </option>
          ))}
        </select>
      </label>
      <span className="move-buttons">
        <button
          type="button"
          disabled={disabled || index === 0}
          onClick={() => onMove(index - 1)}
          aria-label={t("moveRuleEarlier").replace("{index}", String(index + 1))}
        >
          ↑
        </button>
        <button
          type="button"
          disabled={disabled || index === total - 1}
          onClick={() => onMove(index + 1)}
          aria-label={t("moveRuleLater").replace("{index}", String(index + 1))}
        >
          ↓
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
    <div ref={setNodeRef} style={style} className={`chip${isDragging ? " dragging" : ""}`}>
      <button
        type="button"
        className="chip-handle"
        aria-label={t("moveModel").replace("{model}", model.id)}
        {...listeners}
        {...attributes}
        disabled={disabled || membershipLocked}
      >
        {model.id}
      </button>
      <label>
        {t("addToLabel")}
        <select
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
        <button type="button" disabled={disabled || membershipLocked} onClick={() => onMembership(source, false)}
          aria-label={t("removeModelFromLabel").replace("{model}", model.id).replace("{label}", source)}>
          {t("remove")}
        </button>
      )}
      {foreign.length === 0 ? null : (
        <span className="meta chip-tags" title={t("otherStrategyTags")}>
          {foreign.join(" ")}
        </span>
      )}
      <label className="chip-priority">
        {t("priority")}
        <input
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
    <div ref={setNodeRef} className={`zone${isOver ? " over" : ""}`}>
      <h4>{title}</h4>
      {subtitle === undefined ? null : <div className="meta">{subtitle}</div>}
      {children}
    </div>
  );
}

export default function RoutingEditor({ config, onReloaded, onError }: EditorProps) {
  const [draft, setDraft] = useState<RoutingDraft>(() => draftFromConfiguration(config));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverWarnings, setServerWarnings] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>("questions");
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
  const writeDisabled = !config.write_available;
  const editDisabled = writeDisabled || busy || review !== null || resetReview;
  const edges = workflowEdges(draft, config);
  const addableQuestions = Object.entries(draft.questions).filter(([, question]) => Object.keys(question.criteria).length > 0);
  const addableLabels = config.labels.filter((label) => label.resolution === "models"
    ? label.models.some((id) => Object.hasOwn(draft.models, id))
    : config.models.some((model) => draft.models[model.id]?.tags.includes(label.tag)));
  const selectedRuleIndex = selectedNode.startsWith("rule-") ? Number(selectedNode.slice(5)) : -1;
  const selectedRuleExists = Number.isInteger(selectedRuleIndex) && selectedRuleIndex >= 0 && selectedRuleIndex < draft.rules.length;
  const updateRuleDraft = useCallback((next: RoutingDraft, mutation?: RuleLayoutMutation) => {
    if (next === draft) return;
    setDraft(next);
    if (mutation) setTopology((current) => ({ serial: (current?.serial ?? 0) + 1, mutation }));
  }, [draft]);
  const applyRuleMove = (from: number, to: number) => updateRuleDraft(moveRule(draft, from, to), { kind: "move", from, to });
  const applyRuleRemoval = (index: number) => {
    const next = removeRule(draft, index);
    updateRuleDraft(next, { kind: "remove", index });
    setSelectedNode("questions");
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
    if (writeDisabled || busy || !diff.changed) return;
    setBusy(true);
    setServerWarnings([]);
    const payload = toOverlayPayload(draft, config);
    const reviewedDiff = diffSummary(draft, config);
    void (async () => {
      try {
        const result = await api.validateConfiguration(payload);
        if (!result.valid) throw new Error(t("invalidConfiguration"));
        setReview({ payload, diff: reviewedDiff, warnings: result.warnings.map((warning) => tr("validationWarning", { code: warning.code, message: warning.message })) });
        setAcknowledged(false);
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    })();
  }, [writeDisabled, busy, diff.changed, draft, config, t, tr, onError]);

  const save = useCallback(() => {
    if (review === null || busy || writeDisabled || (review.warnings.length > 0 && !acknowledged)) return;
    setBusy(true);
    void (async () => {
      try {
        const response = await api.applyConfiguration(review.payload);
        setServerWarnings(response.warnings.map((warning) => tr("validationWarning", { code: warning.code, message: warning.message })));
        setNotice(t("routingApplied"));
        setReview(null);
        await onReloaded();
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    })();
  }, [review, busy, writeDisabled, acknowledged, onError, onReloaded, t, tr]);

  const reset = useCallback(() => {
    if (writeDisabled || busy || !resetReview) return;
    setBusy(true);
    void (async () => {
      try {
        await api.resetConfiguration();
        setResetReview(false);
        setNotice(t("overlayRemoved"));
        setServerWarnings([]);
        await onReloaded();
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    })();
  }, [onError, onReloaded, t, writeDisabled, busy, resetReview]);

  return (
    <section className="panel" style={{ gridColumn: "1 / -1" }}>
      <h2>{t("configuration")}</h2>
      <div className="meta">
        {t("strategy")} <code>{config.strategy}</code> {t("from")} <code>{config.baseline_source}</code>
      </div>
      <div className="meta">
        {config.overlay.applied
          ? tr("overlayApplied", { path: config.overlay.path })
          : t("noOverlay")}
      </div>
      {config.overlay.error === null ? null : (
        <div className="notice warn">{tr("overlayUnreadable", { error: config.overlay.error })}</div>
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="workflow-workspace">
          <div className="workflow-board">
            <h3>{t("routingWorkflow")}</h3>
            <RoutingCanvas draft={draft} config={config} disabled={editDisabled} selected={selectedNode}
              onSelect={setSelectedNode} onDraft={updateRuleDraft} onError={onError} topology={topology} />
          </div>
          <aside className="workflow-inspector" aria-label={t("nodeInspector")}>
            <div className="meta">{t("strategy")} <code>{config.strategy}</code></div>
        <details className="workflow-advanced">
          <summary>{t("advancedFallback")}</summary>
          <p className="meta">{t("firstMatch")}</p>
        <nav className="workflow-nav" aria-label={t("workflowNodes")}>
          <button type="button" onClick={() => setSelectedNode("questions")}>{t("questions")}</button>
          {draft.rules.map((_rule, index) => <button type="button" key={ruleId(index)} onClick={() => setSelectedNode(ruleId(index))}>{t("rule")} {index + 1}</button>)}
          <button type="button" onClick={() => setSelectedNode("fallback")}>{t("fallback")}</button>
          {config.labels.map((label) => <button type="button" key={label.tag} onClick={() => setSelectedNode(zoneId(label.tag))}>{tr("labelPool", { label: label.name })}</button>)}
        </nav>
        <ol className="workflow-chain" aria-label={t("orderedWorkflow")}>
          {draft.rules.map((rule, index) => <li key={`workflow-${index}`}><button type="button" onClick={() => setSelectedNode(ruleId(index))}><strong>{t("rule")} {index + 1}</strong><span>{describeRule(rule, t)}</span></button><div className="workflow-edges">{edges.filter((edge) => edge.from === ruleId(index)).map((edge) => <WorkflowConnection key={`${edge.kind}-${edge.to}`} edge={edge} onSelect={setSelectedNode} target={edge.kind === "match" ? config.labels.find((label) => zoneId(label.tag) === edge.to)?.name ?? t("unboundLabel") : edge.to === "fallback" ? t("fallback") : `${t("rule")} ${index + 2}`} />)}</div></li>)}
          <li><button type="button" onClick={() => setSelectedNode("fallback")}><strong>{t("fallback")}</strong><span>{draft.fallback.label ?? t("unboundLabel")} ({draft.fallback.selection ?? t("defaultSelection")})</span></button><div className="workflow-edges">{edges.filter((edge) => edge.from === "fallback").map((edge) => <WorkflowConnection key={edge.to} edge={edge} onSelect={setSelectedNode} target={draft.fallback.label ?? t("unboundLabel")} />)}</div></li>
        </ol>
        <div className="workflow-pools">{config.labels.map((label) => <div key={label.tag}><button type="button" onClick={() => setSelectedNode(zoneId(label.tag))}>{tr("labelPool", { label: label.name })}</button>{edges.filter((edge) => edge.from === zoneId(label.tag)).map((edge) => <WorkflowConnection key={edge.to} edge={edge} onSelect={setSelectedNode} target={edge.to.slice("model::".length)} />)}</div>)}</div>
        </details>
        <div className="workflow-edit" aria-live="polite">
          {selectedNode === "questions" ? <fieldset disabled={editDisabled}><legend>{t("questionDefinitions")}</legend>{Object.entries(draft.questions).map(([name, question]) => <div key={name}><label>{t("questionName")}<input value={questionNames[name] ?? name} onChange={(event) => setQuestionNames((current) => ({ ...current, [name]: event.target.value }))} /></label><button type="button" disabled={!questionNames[name] || (questionNames[name] !== name && Object.hasOwn(draft.questions, questionNames[name] ?? ""))} onClick={() => { setDraft((current) => renameQuestion(current, name, questionNames[name]!)); setQuestionNames({}); }}>{t("rename")}</button><button type="button" disabled={Object.keys(draft.questions).length <= 1 || draft.rules.some((rule) => Object.hasOwn(rule.when, name) && Object.keys(rule.when).length === 1)} onClick={() => setDraft((current) => removeQuestion(current, name))}>{t("remove")}</button><label>{t("instructions")}<textarea value={question.instructions} onChange={(event) => setDraft((current) => setQuestion(current, name, { ...question, instructions: event.target.value }))} /></label><div>{Object.entries(question.criteria).map(([criterion, description]) => <div key={criterion}><label>{t("criterionKey")}<input value={criterionNames[`${name}::${criterion}`] ?? criterion} onChange={(event) => setCriterionNames((current) => ({ ...current, [`${name}::${criterion}`]: event.target.value }))} /></label><button type="button" disabled={!criterionNames[`${name}::${criterion}`] || (criterionNames[`${name}::${criterion}`] !== criterion && Object.hasOwn(question.criteria, criterionNames[`${name}::${criterion}`] ?? ""))} onClick={() => { setDraft((current) => renameCriterion(current, name, criterion, criterionNames[`${name}::${criterion}`]!)); setCriterionNames({}); }}>{t("rename")}</button><button type="button" disabled={Object.keys(question.criteria).length <= 2 || draft.rules.some((rule) => { const value = rule.when[name]; return (Array.isArray(value) ? value.length === 1 && value[0] === criterion : value === criterion) && Object.keys(rule.when).length === 1; })} onClick={() => setDraft((current) => removeCriterion(current, name, criterion))}>{t("remove")}</button><label>{t("criterionDescription")}<input value={description} onChange={(event) => setDraft((current) => setQuestion(current, name, { ...question, criteria: { ...question.criteria, [criterion]: event.target.value } }))} /></label></div>)}</div><label>{t("newCriterion")}<input value={newCriteria[name] ?? ""} onChange={(event) => setNewCriteria((current) => ({ ...current, [name]: event.target.value }))} /></label><button type="button" onClick={() => { setDraft((current) => addCriterion(current, name, newCriteria[name] ?? "")); setNewCriteria((current) => ({ ...current, [name]: "" })); }}>{t("add")}</button></div>)}<label>{t("newQuestion")}<input value={newQuestion} onChange={(event) => setNewQuestion(event.target.value)} /></label><button type="button" onClick={() => { setDraft((current) => addQuestion(current, newQuestion)); setNewQuestion(""); }}>{t("add")}</button></fieldset> : null}
          {selectedNode === "fallback" ? <fieldset disabled={editDisabled}><legend>{t("unmatchedFallback")}</legend><label>{t("label")}<select value={draft.fallback.label ?? ""} onChange={(event) => setDraft((current) => setFallback(current, { label: event.target.value }))}>{config.labels.map((label) => <option key={label.name} value={label.name}>{label.name}</option>)}</select></label><label>{t("selection")}<select value={draft.fallback.selection ?? ""} onChange={(event) => setDraft((current) => setFallback(current, { selection: event.target.value || undefined }))}><option value="">{t("defaultSelection")}</option>{selections.map((selection) => <option key={selection} value={selection}>{selection}</option>)}</select></label></fieldset> : null}
          {selectedRuleExists ? (() => { const index = selectedRuleIndex; const rule = draft.rules[index]; return rule ? <fieldset disabled={editDisabled}><legend>{t("rule")} {index + 1}</legend><button type="button" disabled={editDisabled} onClick={() => applyRuleRemoval(index)}>{t("deleteRule")}</button>{Object.entries(draft.questions).map(([question, definition]) => { const selected = rule.when[question]; const values = selected === undefined ? [] : Array.isArray(selected) ? selected : [selected]; return <fieldset key={question}><legend>{question}</legend><label><input type="checkbox" checked={selected !== undefined} disabled={editDisabled || (selected !== undefined && Object.keys(rule.when).length === 1)} onChange={(event) => setDraft((current) => toggleRuleQuestion(current, index, question, event.target.checked))} />{t("includeQuestion")}</label>{Object.keys(definition.criteria).map((criterion) => <label key={criterion}><input type="checkbox" disabled={editDisabled || selected === undefined} checked={values.includes(criterion)} onChange={(event) => setDraft((current) => toggleRuleCriterion(current, index, question, criterion, event.target.checked))} />{criterion}</label>)}</fieldset>; })}<label>{t("label")}<select value={rule.select.label ?? ""} onChange={(event) => setDraft((current) => setRuleChoice(current, index, { label: event.target.value }))}>{config.labels.map((label) => <option key={label.name} value={label.name}>{label.name}</option>)}</select></label><label>{t("selection")}<select value={rule.select.selection ?? ""} onChange={(event) => setDraft((current) => setRuleChoice(current, index, { selection: event.target.value || undefined }))}><option value="">{t("defaultSelection")}</option>{selections.map((selection) => <option key={selection} value={selection}>{selection}</option>)}</select></label><button type="button" disabled={editDisabled || index === 0} onClick={() => applyRuleMove(index, index - 1)}>{t("moveEarlier")}</button><button type="button" disabled={editDisabled || index === draft.rules.length - 1} onClick={() => applyRuleMove(index, index + 1)}>{t("moveLater")}</button></fieldset> : null; })() : null}
          {selectedNode.startsWith("model::") ? (() => { const model = draft.models[selectedNode.slice(7)]; return model ? <fieldset disabled={editDisabled}><legend>{t("model")} {model.id}</legend><label>{t("priority")}<input type="number" value={model.priority} onChange={(event) => { const priority = Number.parseInt(event.target.value, 10); if (Number.isFinite(priority)) setDraft((current) => setPriority(current, model.id, priority)); }} /></label>{config.labels.map((label) => <label key={label.tag}><input type="checkbox" disabled={editDisabled || label.resolution === "models"} checked={label.resolution === "models" ? label.models.includes(model.id) : model.tags.includes(label.tag)} onChange={(event) => updateMembership(model.id, label.tag, event.target.checked)} />{label.name}{label.resolution === "models" ? ` (${t("explicitModelsReadOnly")})` : ""}</label>)}</fieldset> : null; })() : null}
          {selectedNode.startsWith("zone::") ? (() => { const label = config.labels.find((item) => zoneId(item.tag) === selectedNode); return label ? <fieldset disabled={editDisabled}><legend>{tr("labelPool", { label: label.name })}</legend>{label.resolution === "models" ? <p>{t("explicitModelsReadOnly")}</p> : null}{config.models.map((item) => <label key={item.id}><input type="checkbox" disabled={editDisabled || label.resolution === "models"} checked={label.resolution === "models" ? label.models.includes(item.id) : draft.models[item.id]?.tags.includes(label.tag) ?? false} onChange={(event) => updateMembership(item.id, label.tag, event.target.checked)} />{item.id}</label>)}</fieldset> : null; })() : null}
        </div>
        <fieldset className="rule-add" disabled={editDisabled}>
          {addableQuestions.length === 0 || addableLabels.length === 0 ? <p className="meta">{t("noValidRuleOptions")}</p> : null}
          <legend>{t("addRule")}</legend>
          <label>{t("questionName")}<select value={newRuleQuestion} onChange={(event) => { setNewRuleQuestion(event.target.value); setNewRuleCriterion(""); }}>
            <option value="">{t("chooseQuestion")}</option>{addableQuestions.map(([name]) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <label>{t("criterionKey")}<select value={newRuleCriterion} disabled={!newRuleQuestion} onChange={(event) => setNewRuleCriterion(event.target.value)}>
            <option value="">{t("chooseCriterion")}</option>{Object.keys(draft.questions[newRuleQuestion]?.criteria ?? {}).map((name) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <label>{t("label")}<select value={newRuleLabel} onChange={(event) => setNewRuleLabel(event.target.value)}>
            <option value="">{t("chooseLabel")}</option>{addableLabels.map((label) => <option key={label.tag} value={label.name}>{label.name}</option>)}
          </select></label>
          <button type="button" disabled={editDisabled || !newRuleQuestion || !newRuleCriterion || !newRuleLabel} onClick={() => {
            const index = draft.rules.length;
            const next = addRule(draft, config, newRuleQuestion, newRuleCriterion, newRuleLabel);
            if (next === draft) return;
            updateRuleDraft(next, { kind: "insert", index });
            setSelectedNode(`rule-${index}`);
          }}>{t("addRule")}</button>
        </fieldset>
        <details className="workflow-advanced">
          <summary>{t("advancedEditors")}</summary>
        <h3>{t("ruleOrderFirstMatch")}</h3>
        <SortableContext
          items={draft.rules.map((_rule, index) => ruleId(index))}
          strategy={verticalListSortingStrategy}
        >
          <ol className="rules">
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

        <h3>{t("labelMembership")}</h3>
        <p className="meta">{t("dropChipHelp")}</p>
        <div className="board">
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
              title={tr("labelScore", { label: label.name, score: String(label.score) })}
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
          </aside>
        </div>
      </DndContext>

      <details className="workflow-advanced">
        <summary>{t("advancedPoolOrder")}</summary>
      <h3>{t("savedPoolOrder")}</h3>
      <p className="meta">
        {t("savedPoolDescription")}
      </p>
      <div className="table-wrap">
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
      <h3>{t("pendingChanges")}</h3>
      {diff.changed ? (
        <DiffList diff={diff} t={t} />
      ) : (
        <div className="empty">{t("noPendingChanges")}</div>
      )}
      {review === null ? null : <div className="notice" role="status"><h4>{t("reviewChanges")}</h4><DiffList diff={review.diff} t={t} />{review.warnings.map((warning) => <div className="notice warn" key={warning}>{warning}</div>)}{review.warnings.length > 0 ? <label><input type="checkbox" disabled={writeDisabled || busy} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{t("acknowledgeWarnings")}</label> : null}</div>}
      {resetReview ? <div className="notice warn" role="status">{t("resetReviewPrompt")}</div> : null}
      <div className="workflow-toolbar">
        <strong>{t("pendingChanges")}: {diff.changed ? t("reviewChanges") : t("noPendingChanges")}</strong>
        {review === null ? <button type="button" onClick={startReview} disabled={writeDisabled || busy || resetReview || !diff.changed}>{t("reviewChanges")}</button> : <><button type="button" onClick={save} disabled={writeDisabled || busy || (review.warnings.length > 0 && !acknowledged)}>{t("confirmAndSave")}</button><button type="button" onClick={() => setReview(null)} disabled={busy}>{t("backToEditing")}</button></>}
        <button
          type="button"
          onClick={() => {
            setDraft(draftFromConfiguration(config));
            setNotice(null);
            setReview(null);
          }}
          disabled={writeDisabled || busy || review !== null || !diff.changed}
        >
          {t("cancel")}
        </button>
        {resetReview ? <><button type="button" onClick={reset} disabled={writeDisabled || busy}>{t("confirmReset")}</button><button type="button" onClick={() => setResetReview(false)} disabled={busy}>{t("backToEditing")}</button></> : <button type="button" onClick={() => setResetReview(true)} disabled={writeDisabled || busy || review !== null || !config.overlay.applied}>{t("resetBaseline")}</button>}
      </div>
    </section>
  );
}
