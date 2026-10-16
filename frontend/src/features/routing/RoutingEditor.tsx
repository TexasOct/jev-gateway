/** Named workflow drafts, protected policy writes, and node inspection. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, GitBranch, LoaderCircle, Plus, RotateCcw, Settings2, Trash2, X } from "lucide-react";

import { api, ApiError } from "@/shared/api/client";
import { useWorkspaceActive } from "@/shared/navigation/workspace-activity";
import { useWorkspaceFrames } from "@/shared/navigation/useWorkspaceFrames";
import { matrixChoiceLabel } from "@/shared/routing/choice-label";
import RoutingCanvas from "./RoutingCanvas";
import { DecisionRoutingControl } from "@/features/providers/suppliers/DecisionRoutingControl";
import type { CanvasHistoryScope } from "./model/history-scope";
import { canvasAvailableRect, changeLabelMembership, handoffInspectorFocus, inspectorFallbackPosition, inspectorPosition, pageViewport, reconcileRuleSelection, visibleCanvasRect } from "./model/canvas";
import type { RuleLayoutMutation } from "./model/canvas";
import type { ConfigurationPayload, ProviderConfiguration, LabelRow, WorkflowWritePayload, StrategiesPayload } from "@/shared/api/types";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { NativeSelect, NativeSelectOption } from "@/shared/ui/native-select";
import { Textarea } from "@/shared/ui/textarea";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/Dialog";
import {
  addCriterion, addQuestion, diffSummary, draftFromConfiguration, incompleteLabels, invalidQuestions, labelMembers,
  moveRule, removeCriterion, removeQuestion, removeRule, renameCriterion, renameQuestion,
  setRuleChoice, setFallback, setQuestion, toggleRuleCriterion,
  toggleRuleQuestion, toWorkflowPayload, addModelNode, removeModelNode, workflowModels,
} from "./model/draft";
import type { DraftDiff, RoutingDraft } from "./model/draft";
import { selectionCaption } from "./model/selection";

interface EditorProps {
  decisionConfiguration?: ProviderConfiguration | null;
  decisionPending?: boolean;
  decisionReadError?: boolean;
  decisionWriteError?: boolean;
  decisionRefreshFailed?: boolean;
  onRetryDecisionRead?: () => void;
  onRetryDecisionCatalog?: () => void;
  onSetDecisionEnabled?: (enabled: boolean) => void;
  historyScope?: CanvasHistoryScope;
  discardEpoch?: number;
  config: ConfigurationPayload;
  error?: string | null;
  onReloaded: (current: () => boolean, strategy?: string) => Promise<boolean | void>;
  onError: (message: string | null) => void;
  /** True for policy drafts, unfinished add/rename inputs, and unsaved layout work (drag,
   * viewport debounce, queued/in-flight PUTs). Layout work autosaves without applying policy.
   * Parent navigation/beforeunload guards must retain the editor while this is true. */
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onUnauthorized?: () => void;
  /** Open the shared model editor Dialog for a canvas model node's exact identity. */
  onOpenModel?: (identity: { provider: string; upstream: string }) => boolean;
}

function zoneId(tag: string): string { return `zone::${tag}`; }

function DiffList({ diff, t }: { diff: DraftDiff; t: ReturnType<typeof useTranslation>["t"] }) {
  const { decisionProvider, questions, rules, fallback, models } = diff;
  return <ul className="my-2 ml-5 list-disc space-y-1 text-ink-muted [overflow-wrap:anywhere]">
    {decisionProvider.map((change) => <li key="decision-provider">{t("workflowDecisionProvider")}: {change.before} → {change.after}</li>)}
    {questions.map((change) => <li key={`question-${change.subject}`}>{t("questions")}: {change.subject}: {change.before || t("none")} → {change.after || t("none")}</li>)}
    {rules.map((change, index) => <li key={`rule-${index}`}>{change.subject === "rule count" ? t("ruleOrderFirstMatch") : `${t("rule")} ${change.subject}`}: {change.before || t("none")} → {change.after || t("none")}</li>)}
    {fallback.map((change) => <li key={change.subject}>{t("fallback")}: {change.before || t("none")} → {change.after || t("none")}</li>)}
    {models.map((change, index) => <li key={`model-${index}`}>{t("model")} {change.subject}: {change.before || t("none")} → {change.after || t("none")}</li>)}
  </ul>;
}

function ChoiceFields({ choice, labels, selections, onChoice }: {
  choice: RoutingDraft["fallback"]; labels: LabelRow[]; selections: string[];
  onChoice: (patch: Partial<RoutingDraft["fallback"]>) => void;
}) {
  const { t } = useTranslation();
  return <>
    <label>{t("label")}<NativeSelect value={matrixChoiceLabel(choice, labels[0]?.name) ?? ""} onChange={(event) => onChoice({ label: event.target.value })}>
      <NativeSelectOption value="">{t("unboundLabel")}</NativeSelectOption>{labels.map((label) => <NativeSelectOption key={label.name} value={label.name}>{label.name}</NativeSelectOption>)}
    </NativeSelect></label>
    <details className="border-t border-outline pt-2"><summary className="cursor-pointer text-xs text-ink-muted">{t("canvasAdvancedChoice")}</summary><label>{t("selection")}<NativeSelect value={choice.selection ?? ""} onChange={(event) => onChoice({ selection: event.target.value || undefined })}>
      <NativeSelectOption value="">{t("inheritedSelection")}</NativeSelectOption>{selections.map((value) => <NativeSelectOption key={value} value={value}>{selectionCaption(value, t)}</NativeSelectOption>)}
    </NativeSelect></label></details>
  </>;
}

export default function RoutingEditor({ historyScope, discardEpoch = 0, config, error, onReloaded, onError, onDirtyChange, onPendingChange, onUnauthorized, onOpenModel, decisionConfiguration, decisionPending = false, onSetDecisionEnabled, decisionReadError = false, decisionWriteError = false, decisionRefreshFailed = false, onRetryDecisionRead, onRetryDecisionCatalog }: EditorProps) {
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
  const [strategies, setStrategies] = useState<StrategiesPayload["data"]>([]);
  const [decisionReadinessOpen, setDecisionReadinessOpen] = useState(false);
  const [strategySettingsOpen, setStrategySettingsOpen] = useState(false);
  const [strategyAction, setStrategyAction] = useState<"create" | "delete" | null>(null);
  const [strategyName, setStrategyName] = useState("");
  const [modelChooser, setModelChooser] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [editingQuestion, setEditingQuestion] = useState("");
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let current = true;
    void api.strategies(controller.signal).then((payload) => {
      if (current) setStrategies(payload.data);
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
  const [policyRecovery, setPolicyRecovery] = useState<"applied" | "reset" | "unknown" | "reset-unknown" | null>(null);
  const [readConfirmed, setReadConfirmed] = useState(false);
  const operation = useRef(0);
  const recoveryStrategy = useRef(config.strategy);
  const recoveryCrud = useRef(false);
  const strategySelectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (active) return;
    const owner = ++operation.current;
    queueMicrotask(() => { if (owner === operation.current) setBusy(false); });
  }, [active]);
  const [serverWarnings, setServerWarnings] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState(() => historyScope?.hashes.get(config.strategy) === config.config_hash ? historyScope.cursors.get(config.strategy)?.selected ?? "" : "");
  const [selectedNodes, setSelectedNodes] = useState<string[]>(() => historyScope?.hashes.get(config.strategy) === config.config_hash ? historyScope.cursors.get(config.strategy)?.selection ?? [] : []);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [nodeDragging, setNodeDragging] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [inspectorAt, setInspectorAt] = useState<(NonNullable<ReturnType<typeof inspectorPosition>> & { fallback: boolean }) | null>(null);
  const [revealNode, setRevealNode] = useState<{ id: string; serial: number } | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
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
    setSelectedNodes([]); setSelectedNode(id); setInspectorOpen(true);
    setRevealNode((current) => ({ id, serial: (current?.serial ?? 0) + 1 }));
  };
  const selectLayoutNodes = (ids: string[]) => {
    if (ids.length !== 1 || ids[0] !== selectedNode) handoffFocus();
    setSelectedNodes(ids);
    if (ids.length === 1) { setSelectedNode(ids[0]!); setInspectorOpen(true); }
    else { setSelectedNode(""); setInspectorOpen(false); }
  };
  const selectCanvasNode = (id: string, focusInspector = false) => {
    if (id !== selectedNode) handoffFocus();
    setSelectedNodes([]);
    setSelectedNode(id);
    setInspectorOpen(true);
    if (focusInspector) requestAnimationFrame(() => { if (activeRef.current) requestAnimationFrame(() => { if (activeRef.current) inspectorRef.current?.querySelector("button")?.focus({ preventScroll: true }); }); });
  };
  const closeInspector = () => {
    handoffFocus();
    setInspectorOpen(false);
  };
  const [review, setReview] = useState<{ payload: WorkflowWritePayload; warnings: string[]; diff: DraftDiff } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [resetReview, setResetReview] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [topology, setTopology] = useState<{ serial: number; mutation: RuleLayoutMutation } | null>(null);
  const [newCriteria, setNewCriteria] = useState<Record<string, string>>({});
  const [questionNames, setQuestionNames] = useState<Record<string, string>>({});
  const [criterionNames, setCriterionNames] = useState<Record<string, string>>({});
  const admittedDiscard = useRef(discardEpoch);
  useLayoutEffect(() => {
    if (admittedDiscard.current === discardEpoch) return;
    admittedDiscard.current = discardEpoch;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      setDraft(draftFromConfiguration(config)); setHistoryBoundary((value) => value + 1); setDiscardBoundary((value) => value + 1);
      setSelectedNode(""); setSelectedNodes([]); setInspectorOpen(false);
      setQuestionNames({}); setCriterionNames({}); setNewCriteria({}); setNewQuestion(""); setReview(null); setResetReview(false);
    });
    return () => { current = false; };
  }, [discardEpoch, config]);
  const { t } = useTranslation();
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

  const diff = diffSummary(draft, config);
  const pendingFields = !!newQuestion || Object.values(newCriteria).some(Boolean) || Object.entries(questionNames).some(([name, value]) => value !== name) || Object.entries(criterionNames).some(([name, value]) => name.slice(name.indexOf("::") + 2) !== value);
  const dirty = diff.changed || pendingFields || layoutDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  useEffect(() => { onPendingChange?.(busy || layoutDirty || policyRecovery !== null); }, [busy, layoutDirty, policyRecovery, onPendingChange]);
  useEffect(() => () => { onPendingChange?.(false); }, [onPendingChange]);
  const incompleteNodes = incompleteLabels(draft, config);
  const incomplete = incompleteNodes.length > 0;
  const questionErrors = invalidQuestions(draft);
  const writeDisabled = !active || !config.write_available;
  const policyReadOnly = config.editable === false || config.definition?.kind !== "decision_matrix";
  const canvasDisabled = writeDisabled || busy || policyRecovery !== null || review !== null || resetReview;
  const editDisabled = canvasDisabled || policyReadOnly;
  const setEditableDraft = (next: Parameters<typeof setDraft>[0]) => {
    if (!editDisabled) setDraft(next);
  };
  useLayoutEffect(() => {
    if (!active || !busy) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.matches(":disabled")) focused.closest<HTMLElement>('[data-slot="dialog-content"]')?.focus({ preventScroll: true });
  }, [active, busy]);
  useEffect(() => {
    if (!readConfirmed) return;
    const generation = activityGeneration.current;
    queueMicrotask(() => {
      if (!activeRef.current || generation !== activityGeneration.current) return;
      // Same-hash reads also confirm the server snapshot (for an unknown write outcome).
      setDraft(draftFromConfiguration(config));
      setHistoryBoundary(value => value + 1);
      setPolicyRecovery(null); setReadConfirmed(false); setReview(null); setResetReview(false);
      setStrategyAction(null); setStrategyName(""); recoveryCrud.current = false;
      setNewQuestion("");
      setNewCriteria({}); setQuestionNames({}); setCriterionNames({});
      setSelectedNode(""); setSelectedNodes([]); setInspectorOpen(false);
    });
  }, [readConfirmed, config]);
  const addableQuestions = Object.entries(draft.questions).filter(([, question]) => Object.keys(question.criteria).length > 0);
  const addableLabels = config.labels.filter((label) => label.resolution === "tag" ||
    label.models.some((id) => Object.hasOwn(draft.models, id)));
  // Future AI proposal composition belongs at this boundary: a proposal must enter
  // the ordinary draft, validation, review and explicit apply flow. No prompt UI or payload exists here.
  const selectedRuleIndex = selectedNode.startsWith("rule-") ? Number(selectedNode.slice(5)) : -1;
  const selectedRuleExists = Number.isInteger(selectedRuleIndex) && selectedRuleIndex >= 0 && selectedRuleIndex < draft.rules.length;
  const updateRuleDraft = useCallback((next: RoutingDraft, mutation?: RuleLayoutMutation) => {
    if (policyReadOnly || next === draft) return;
    setDraft(next);
    const addedQuestion = Object.keys(next.questions).find((name) => !Object.hasOwn(draft.questions, name));
    if (addedQuestion) setEditingQuestion(addedQuestion);
    if (mutation) {
      setTopology((current) => ({ serial: (current?.serial ?? 0) + 1, mutation }));
      setSelectedNode((id) => reconcileRuleSelection(id, mutation));
      setSelectedNodes((ids) => ids.map((id) => reconcileRuleSelection(id, mutation)).filter(Boolean));
    }
  }, [draft, policyReadOnly]);
  const applyRuleMove = (from: number, to: number) => updateRuleDraft(moveRule(draft, from, to), { kind: "move", from, to });
  const applyRuleRemoval = (index: number) => {
    const next = removeRule(draft, index);
    updateRuleDraft(next, { kind: "remove", index });
    selectEditorNode("questions");
  };

  const updateMembership = (modelId: string, tag: string, member: boolean) => {
    const next = changeLabelMembership(draft, config, modelId, tag, member);
    if (next !== null) { setEditableDraft(next); return; }
    // A refused edit is either an inert explicit-list target or the last resolved
    // member of a tag pool. Explain the actual restriction instead of a generic one.
    const label = config.labels.find((item) => item.tag === tag);
    const lastMember = !member && label?.resolution === "tag" && draft.models[modelId]?.tags.includes(tag) === true
      && labelMembers(draft, config, label).length <= 1;
    onError(t(lastMember ? "canvasReason_lastMember" : "canvasInvalidConnection"));
  };

  const startReview = useCallback(() => {
    if (writeDisabled || !config.definition || config.editable === false || busy || policyRecovery !== null || layoutDirty || pendingFields || !diff.changed || incompleteLabels(draft, config).length || invalidQuestions(draft).length) return;
    setBusy(true);
    setServerWarnings([]);
    const payload = toWorkflowPayload(draft, config);
    const reviewedDiff = diffSummary(draft, config);
    const generation = activityGeneration.current;
    const owner = ++operation.current;
    const current = () => activeRef.current && generation === activityGeneration.current && owner === operation.current;
    void (async () => {
      try {
        const result = await api.validateConfiguration(payload, config.strategy);
        if (!current()) return;
        if (!result.valid) throw new Error(t("invalidConfiguration"));
        setReview({ payload, diff: reviewedDiff, warnings: result.warnings.map((warning) => tr("validationWarning", { code: warning.code, message: warning.message })) });
        setAcknowledged(false);
      } catch (caught) {
        if (current()) reportFailure(caught);
      } finally {
        if (current()) setBusy(false);
      }
    })();
  }, [writeDisabled, busy, policyRecovery, layoutDirty, pendingFields, diff.changed, draft, config, t, tr, reportFailure]);

  const save = useCallback(() => {
    if (review === null || busy || policyRecovery !== null || layoutDirty || writeDisabled || (review.warnings.length > 0 && !acknowledged)) return;
    setBusy(true);
    onError(null);
    const generation = activityGeneration.current;
    const owner = ++operation.current;
    const current = () => activeRef.current && generation === activityGeneration.current && owner === operation.current;
    void (async () => {
      let committed = false;
      try {
        const response = await api.applyConfiguration(review.payload, review.payload.strategy);
        if (!current()) return;
        committed = true;
        recoveryStrategy.current = review.payload.strategy;
        setPolicyRecovery("applied");
        setServerWarnings(response.warnings.map((warning) => tr("validationWarning", { code: warning.code, message: warning.message })));
        setNotice(t("routingApplied"));
        setReview(null);
        await onReloaded(current, review.payload.strategy);
        if (current()) setReadConfirmed(true);
      } catch (caught) {
        if (current()) {
          if (!committed && !(caught instanceof ApiError)) { setPolicyRecovery("unknown"); setReview(null); }
          reportFailure(caught);
        }
      } finally {
        if (current()) setBusy(false);
      }
    })();
  }, [review, busy, policyRecovery, layoutDirty, writeDisabled, acknowledged, reportFailure, onReloaded, onError, t, tr]);

  const retryPolicyRead = useCallback(() => {
    if (!activeRef.current || busy || policyRecovery === null) return;
    setBusy(true); onError(null);
    const generation = activityGeneration.current, owner = ++operation.current;
    const current = () => activeRef.current && generation === activityGeneration.current && owner === operation.current;
    void (async () => {
      try {
        let strategy = recoveryStrategy.current;
        if (recoveryCrud.current) {
          const list = await api.strategies();
          if (!current()) return;
          if (strategyAction === "delete" && !list.data.some((item) => item.name === config.strategy)) {
            historyScope?.histories.remove(config.strategy); historyScope?.hashes.delete(config.strategy); historyScope?.cursors.delete(config.strategy);
          }
          strategy = list.data.find((item) => item.name === strategy)?.name
            ?? list.data.find((item) => item.name === config.strategy)?.name
            ?? list.data.find((item) => item.editable)?.name
            ?? list.default;
        }
        await onReloaded(current, strategy); if (current()) setReadConfirmed(true);
      }
      catch (caught) { if (current()) reportFailure(caught); }
      finally { if (current()) setBusy(false); }
    })();
  }, [busy, policyRecovery, onReloaded, onError, reportFailure, config.strategy, historyScope, strategyAction]);

  const reset = useCallback(() => {
    if (writeDisabled || policyReadOnly || busy || policyRecovery !== null || layoutDirty || !resetReview) return;
    setBusy(true);
    onError(null);
    const generation = activityGeneration.current;
    const owner = ++operation.current;
    const current = () => activeRef.current && generation === activityGeneration.current && owner === operation.current;
    void (async () => {
      let confirmed = false;
      try {
        await api.resetConfiguration(config.strategy);
        if (!current()) return;
        confirmed = true;
        recoveryStrategy.current = config.strategy;
        setPolicyRecovery("reset");
        setResetReview(false);
        setNotice(t("overlayRemoved"));
        setServerWarnings([]);
        await onReloaded(current, config.strategy);
        if (current()) setReadConfirmed(true);
      } catch (caught) {
        if (current()) {
          if (!confirmed && !(caught instanceof ApiError)) {
            setPolicyRecovery("reset-unknown");
            setResetReview(false);
          }
          reportFailure(caught);
        }
      } finally {
        if (current()) setBusy(false);
      }
    })();
  }, [reportFailure, onReloaded, onError, t, writeDisabled, policyReadOnly, busy, policyRecovery, layoutDirty, resetReview, config.strategy]);

  const changeStrategy = (name: string, action?: "create" | "delete") => {
    if (!activeRef.current || busy || layoutDirty || policyRecovery !== null || (action && writeDisabled)) return;
    if (!action && name === config.strategy) return;
    if (dirty && !window.confirm(t("strategyDiscard"))) return;
    const generation = activityGeneration.current, owner = ++operation.current;
    const current = () => activeRef.current && generation === activityGeneration.current && owner === operation.current;
    recoveryStrategy.current = name;
    recoveryCrud.current = !!action;
    setBusy(true); onPendingChange?.(true); onError(null);
    void (async () => {
      let committed = false;
      try {
        if (action === "create") { await api.createStrategy(name); committed = true; }
        if (action === "delete") { await api.deleteStrategy(config.strategy); committed = true; }
        if (!current()) return;
        if (action === "delete") {
          historyScope?.histories.remove(config.strategy); historyScope?.hashes.delete(config.strategy); historyScope?.cursors.delete(config.strategy);
        }
        // A committed CRUD operation needs a read before another mutation, too.
        if (action) setPolicyRecovery("applied");
        const admitted = await onReloaded(current, name);
        // The accepted read can remount this editor before its continuation runs.
        if (dirty && (admitted === true || (admitted === undefined && current()))) {
          historyScope?.histories.remove(config.strategy); historyScope?.cursors.delete(config.strategy);
        }
        if (current()) {
          setReadConfirmed(true); setStrategyAction(null); setStrategyName("");
        }
      } catch (caught) {
        if (current()) {
          if (action && (committed || !(caught instanceof ApiError))) setPolicyRecovery("unknown");
          reportFailure(caught);
        }
      } finally { if (current()) setBusy(false); }
    })();
  };
  const mountedModels = workflowModels(draft, config);
  const chooserModels = config.models.filter((model) => !mountedModels.some((item) => item.id === model.id)
    && `${model.provider} ${model.upstream_model} ${model.id}`.toLocaleLowerCase().includes(modelQuery.toLocaleLowerCase()));
  const canChooseModel = !!config.definition && config.editable !== false && !editDisabled;

  const configuredDecision = decisionConfiguration?.decision;
  const selectedDecisionProvider = configuredDecision?.providers.find((provider) => provider.id === (draft.decisionProvider ?? configuredDecision.default_provider))
    ?? (!draft.decisionProvider ? configuredDecision?.providers[0] : undefined);
  const heading = <>
      {config.models.length === 0 ? <p role="status" className="text-sm text-ink-muted">{t("setupEmptyModels")}</p> : null}
      <div className="strategy-controls flex min-w-0 items-center gap-1">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 hover:bg-panel-muted">
            <GitBranch className="size-4 shrink-0 text-ink-muted" aria-hidden="true" focusable="false" />
            <span className="sr-only">{t("strategy")}</span>
            <NativeSelect className="border-transparent bg-transparent font-semibold shadow-none" ref={strategySelectRef} value={config.strategy} disabled={busy || layoutDirty || policyRecovery !== null || !active} onChange={(event) => changeStrategy(event.target.value)}>
              {!strategies.some((item) => item.name === config.strategy) && <NativeSelectOption value={config.strategy}>{config.strategy}</NativeSelectOption>}
              {strategies.filter((item) => item.editable).map((item) => <NativeSelectOption key={item.name} value={item.name}>{item.name}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon" aria-label={t("workflowCreate")} title={t("workflowCreate")} disabled={writeDisabled || busy || layoutDirty || policyRecovery !== null} onClick={() => setStrategyAction("create")}><Plus aria-hidden="true" focusable="false" /></Button>
            <Button variant="ghost" size="icon" className="text-ink-muted" aria-label={t("workflowDelete")} title={!config.deletable ? t("workflowDefaultProtected") : t("workflowDelete")} disabled={writeDisabled || busy || layoutDirty || policyRecovery !== null || !config.deletable} onClick={() => setStrategyAction("delete")}><Trash2 aria-hidden="true" focusable="false" /></Button>
            <Button variant="ghost" size="icon" aria-label={t("strategySettings")} title={t("strategySettings")} onClick={() => setStrategySettingsOpen(true)}><Settings2 aria-hidden="true" focusable="false" /></Button>
          </div>
        </div>
      {error ? <div className="notice warn" role="alert">{error}</div> : null}
      {policyRecovery !== null && <div className="notice warn bg-panel text-ink" role="status"><span className="block">{t(policyRecovery === "applied" ? "routingSavedReadPending" : policyRecovery === "reset" ? "routingResetReadPending" : "routingWriteUnknown")}</span> <Button variant="outline" disabled={busy || !active} onClick={retryPolicyRead}>{t("routingRetryRead")}</Button></div>}
      {pendingFields && <p className="notice warn" role="status">{t("canvasPendingFields")}</p>}
      {incomplete && <div className="notice warn" role="status"><span>{t("canvasIncompleteDraft")}</span> <Button variant="outline" size="sm" type="button" onClick={() => selectEditorNode(incompleteNodes[0] ?? "fallback")}>{t("canvasRepair")}</Button></div>}
      {questionErrors.map(({ name, reason }) => <div key={name} className="notice warn" role="status"><span>{name}: {t(({ type: "canvasQuestionTypeError", criteria: "canvasQuestionCriteriaError", instructions: "canvasQuestionInstructionsError", criterionName: "canvasQuestionCriterionNameError", criterionDescription: "canvasQuestionCriterionDescriptionError" } as const)[reason])}</span> <Button variant="outline" size="sm" type="button" onClick={() => { setEditingQuestion(name); selectEditorNode("questions"); }}>{t("canvasRepair")}</Button>{reason === "type" && <Button variant="outline" size="sm" type="button" disabled={editDisabled} onClick={() => { const question = draft.questions[name]; if (question) setEditableDraft(setQuestion(draft, name, { ...question, type: "choice" })); setEditingQuestion(name); selectEditorNode("questions"); }}>{t("canvasUseChoice")}</Button>}</div>)}
      {config.overlay.error === null ? null : (
        <div className="notice warn" role="alert"><span>{tr("overlayUnreadable", { error: config.overlay.error })}</span> <span>{t("canvasOverlayRepair")}</span> <Button variant="outline" size="sm" type="button" disabled={writeDisabled || policyReadOnly || busy || policyRecovery !== null || layoutDirty || review !== null} onClick={() => setResetReview(true)}>{t("resetBaseline")}</Button></div>
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

  const actions = <div className="workflow-toolbar flex flex-nowrap items-center gap-1 border-t border-outline pt-1 [&>button]:min-h-10" data-policy-draft={diff.changed ? "pending" : "unchanged"}>
    <span className="mr-auto" />
    <Button variant="ghost" size="icon" className="text-ink-muted" type="button" aria-label={t("discardChanges")} title={t("discardChanges")} onClick={() => {
      setDraft(draftFromConfiguration(config)); setHistoryBoundary((value) => value + 1); setDiscardBoundary((value) => value + 1);
      setQuestionNames({}); setCriterionNames({}); setNewCriteria({}); setNewQuestion(""); selectLayoutNodes([]); setNotice(null); setReview(null);
    }} disabled={writeDisabled || busy || policyRecovery !== null || review !== null || !dirty}><X aria-hidden="true" focusable="false" /></Button>
    <Button variant="ghost" size="icon" className="text-ink-muted" type="button" aria-label={t("resetBaseline")} title={t("resetBaseline")} onClick={() => setResetReview(true)} disabled={writeDisabled || policyReadOnly || busy || policyRecovery !== null || layoutDirty || review !== null || !config.overlay.applied}><RotateCcw aria-hidden="true" focusable="false" /></Button>
    <Button className="h-10 px-2 has-[>svg]:px-2 disabled:border-transparent disabled:bg-panel-muted disabled:text-ink-muted disabled:opacity-100" type="button" aria-label={t("reviewChanges")} onClick={startReview} disabled={writeDisabled || !config.definition || config.editable === false || busy || policyRecovery !== null || layoutDirty || pendingFields || resetReview || review !== null || !diff.changed || incomplete || questionErrors.length > 0}>{layoutDirty ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" focusable="false" /> : <Check aria-hidden="true" focusable="false" />}{layoutDirty ? t("canvasSavingLayout") : t("reviewChanges")}</Button>
  </div>;

  return (
    <section className="workflow-workspace relative flex-1 isolate min-w-0 min-h-0 overflow-hidden" ref={workspaceRef} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      if (inspectorOpen) { event.preventDefault(); event.stopPropagation(); closeInspector(); }
    }}>
            <RoutingCanvas historyScope={historyScope} heading={heading} actions={actions} draft={draft} config={config} disabled={canvasDisabled} policyDisabled={policyReadOnly} selected={selectedNode} selection={selectedNodes}
               onSelect={selectCanvasNode} onSelection={selectLayoutNodes} onDraft={updateRuleDraft} onAddModel={() => setModelChooser(true)} canAddModel={canChooseModel} onError={onError} topology={topology}
               onUnauthorized={onUnauthorized}
              inspectorOpen={inspectorOpen} onAnchor={setAnchor} revealNode={revealNode} onReveal={selectEditorNode}
              onOpenModel={onOpenModel}
              onDraggingChange={setNodeDragging}
              onLayoutDirtyChange={setLayoutDirty}
              historyBoundary={historyBoundary}
              discardBoundary={discardBoundary}
              canAddRule={addableQuestions.length > 0 && addableLabels.length > 0}
              >
          {() => <>
          {inspectorOpen && selectedNodes.length <= 1 && <aside className="workflow-inspector absolute z-[6] flex w-[min(340px,calc(100vw-24px))] max-h-[460px] flex-col overflow-hidden rounded-lg border border-outline bg-panel shadow-[0_8px_28px_color-mix(in_srgb,var(--text)_16%,transparent)] data-[fallback=true]:z-10" ref={inspectorRef} data-fallback={inspectorAt?.fallback} style={{ left: inspectorAt?.x, top: inspectorAt?.y, width: inspectorAt?.width, height: inspectorAt?.height, visibility: inspectorAt && !nodeDragging ? "visible" : "hidden" }} aria-label={t("nodeInspector")}>
            <header className="inspector-heading flex items-center justify-between gap-2 border-b border-outline p-3"><div className="grid min-w-0 gap-1"><h3 className="text-sm font-semibold text-ink">{selectedRuleExists ? `${t("rule")} ${selectedRuleIndex + 1}` : selectedNode === "questions" ? t("questionDefinitions") : selectedNode === "fallback" ? t("canvasFailureRoute") : t("nodeInspector")}</h3><span className="text-xs text-ink-muted">{diff.changed ? t("pendingChanges") : t("noPendingChanges")}</span></div><Button variant="ghost" size="icon" type="button" title={t("closeInspector")} aria-label={t("closeInspector")} onClick={closeInspector}><X aria-hidden="true" focusable="false" /></Button></header>
        <div className="inspector-body min-h-0 flex-1 overflow-y-auto p-3 text-[13px] text-ink">
        <p className="mb-3 text-xs text-ink-muted">{selectedRuleExists ? t("ruleOrderFirstMatch") : selectedNode === "questions" ? t("canvasQuestionEntry") : selectedNode === "fallback" ? t("unmatchedFallback") : selectedNode.startsWith("zone::") ? t("modelPool") : t("model")}</p>
        {selectedNodes.length <= 1 && <div className="workflow-edit space-y-3 [&>fieldset]:border-0 [&>fieldset]:p-0 [&_fieldset_fieldset]:border-0 [&_label]:grid [&_label]:gap-2 [&_label]:text-xs [&_label]:text-ink-muted [&_label:has(input[type=checkbox])]:flex [&_label:has(input[type=checkbox])]:items-center [&_label:has(input[type=checkbox])]:gap-2" aria-live="polite">
          {selectedNode === "questions" ? <fieldset className="grid min-w-0 gap-3 border-0 p-0 disabled:opacity-70" disabled={editDisabled}>
            <legend className="sr-only">{t("questionDefinitions")}</legend>
            {Object.keys(draft.questions).length > 1 && <label>{t("canvasEditQuestion")}<NativeSelect value={Object.hasOwn(draft.questions, editingQuestion) ? editingQuestion : Object.keys(draft.questions)[0]} onChange={(event) => setEditingQuestion(event.target.value)}>{Object.keys(draft.questions).map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></label>}
            {Object.entries(draft.questions).filter(([name]) => name === (Object.hasOwn(draft.questions, editingQuestion) ? editingQuestion : Object.keys(draft.questions)[0])).map(([name, question]) => <div key={name} className="grid gap-3 border-b border-outline pb-3">
              <label>{t("questionName")}<Input value={questionNames[name] ?? name} onChange={(event) => setQuestionNames((current) => ({ ...current, [name]: event.target.value }))} /></label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" type="button" disabled={!questionNames[name] || (questionNames[name] !== name && Object.hasOwn(draft.questions, questionNames[name] ?? ""))} onClick={() => { setEditableDraft((current) => renameQuestion(current, name, questionNames[name]!)); setEditingQuestion(questionNames[name]!); setQuestionNames({}); }}>{t("rename")}</Button>
                <Button variant="outline" type="button" disabled={Object.keys(draft.questions).length <= 1 || draft.rules.some((rule) => Object.hasOwn(rule.when, name) && Object.keys(rule.when).length === 1)} onClick={() => setEditableDraft((current) => removeQuestion(current, name))}>{t("remove")}</Button>
              </div>
              <label>{t("instructions")}<Textarea value={question.instructions} onChange={(event) => setEditableDraft((current) => setQuestion(current, name, { ...question, instructions: event.target.value }))} /></label>
              <div className="grid gap-3">{Object.entries(question.criteria).map(([criterion, description]) => <div key={criterion} className="grid gap-2">
                <label>{t("criterionKey")}<Input value={criterionNames[`${name}::${criterion}`] ?? criterion} onChange={(event) => setCriterionNames((current) => ({ ...current, [`${name}::${criterion}`]: event.target.value }))} /></label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" type="button" disabled={!criterionNames[`${name}::${criterion}`] || (criterionNames[`${name}::${criterion}`] !== criterion && Object.hasOwn(question.criteria, criterionNames[`${name}::${criterion}`] ?? ""))} onClick={() => { setEditableDraft((current) => renameCriterion(current, name, criterion, criterionNames[`${name}::${criterion}`]!)); setCriterionNames({}); }}>{t("rename")}</Button>
                  <Button variant="outline" type="button" disabled={Object.keys(question.criteria).length <= 2 || draft.rules.some((rule) => { const value = rule.when[name]; return (Array.isArray(value) ? value.length === 1 && value[0] === criterion : value === criterion) && Object.keys(rule.when).length === 1; })} onClick={() => setEditableDraft((current) => removeCriterion(current, name, criterion))}>{t("remove")}</Button>
                </div>
                <label>{t("criterionDescription")}<Input value={description} onChange={(event) => setEditableDraft((current) => setQuestion(current, name, { ...question, criteria: { ...question.criteria, [criterion]: event.target.value } }))} /></label>
              </div>)}</div>
              <label>{t("newCriterion")}<Input value={newCriteria[name] ?? ""} onChange={(event) => setNewCriteria((current) => ({ ...current, [name]: event.target.value }))} /></label>
              <Button variant="outline" type="button" onClick={() => { setEditableDraft((current) => addCriterion(current, name, newCriteria[name] ?? "")); setNewCriteria((current) => ({ ...current, [name]: "" })); }}>{t("add")}</Button>
            </div>)}
            <label>{t("newQuestion")}<Input value={newQuestion} onChange={(event) => setNewQuestion(event.target.value)} /></label>
            <Button variant="outline" type="button" onClick={() => { setEditableDraft((current) => addQuestion(current, newQuestion)); setEditingQuestion(newQuestion); setNewQuestion(""); }}>{t("add")}</Button>
          </fieldset> : null}
          {selectedNode === "fallback" && <fieldset className="grid min-w-0 gap-3 rounded-lg border border-outline p-3 disabled:opacity-70" disabled={editDisabled}>
            <legend>{t("unmatchedFallback")}</legend>
            <ChoiceFields choice={draft.fallback} labels={config.labels} selections={selections} onChoice={(patch) => setEditableDraft((current) => setFallback(current, patch))} />
          </fieldset>}
          {selectedRuleExists && (() => {
            const index = selectedRuleIndex, rule = draft.rules[index]!;
            return <fieldset className="grid min-w-0 gap-3 rounded-lg border border-outline p-3 disabled:opacity-70" disabled={editDisabled}>
              <legend className="sr-only">{t("rule")} {index + 1}</legend>
              <section aria-label={t("canvasDestination")} className="space-y-2 border-b border-outline pb-3"><h4 className="text-xs font-semibold">{t("canvasDestination")}</h4><ChoiceFields choice={rule.select} labels={config.labels} selections={selections} onChoice={(patch) => setEditableDraft((current) => setRuleChoice(current, index, patch))} /></section>
              <section aria-label={t("canvasConditions")} className="space-y-3"><h4 className="text-xs font-semibold">{t("canvasAllConditions")}</h4><p className="text-xs leading-5 text-ink-muted">{t("canvasConditionsHint")}</p>{Object.entries(draft.questions).map(([question, definition]) => {
                const selected = rule.when[question], values = selected === undefined ? [] : Array.isArray(selected) ? selected : [selected];
                return <fieldset key={question} className="min-w-0 space-y-2 rounded-md bg-panel-muted p-3"><legend className="mb-2 text-xs font-semibold">{question}</legend>
                  <label><Checkbox checked={selected !== undefined} disabled={editDisabled || (selected !== undefined && Object.keys(rule.when).length === 1)} onChange={(event) => setEditableDraft((current) => toggleRuleQuestion(current, index, question, event.target.checked))} />{t("includeQuestion")}</label>
                  <details className="text-xs text-ink-muted"><summary className="cursor-pointer py-1">{t("instructions")}</summary><p className="whitespace-pre-wrap break-words py-2 leading-5">{definition.instructions}</p></details>
                  {selected !== undefined && <p className="text-xs text-ink-muted">{t("canvasAnyValue")}</p>}
                  {Object.entries(definition.criteria).map(([criterion, description]) => <label key={criterion} className="rounded py-1"><Checkbox aria-label={criterion} disabled={editDisabled || selected === undefined || (values.length === 1 && values.includes(criterion))} checked={values.includes(criterion)} onChange={(event) => setEditableDraft((current) => toggleRuleCriterion(current, index, question, criterion, event.target.checked))} /><span className="grid min-w-0 gap-0.5"><span className="font-medium text-ink [overflow-wrap:anywhere]">{criterion}</span><span className="text-xs leading-4 text-ink-muted [overflow-wrap:anywhere]">{description}</span></span></label>)}
                </fieldset>;
              })}</section>
              <div className="flex flex-wrap items-center gap-1 border-t border-outline pt-2">
                <Button variant="ghost" type="button" disabled={editDisabled || index === 0} onClick={() => applyRuleMove(index, index - 1)}>{t("moveEarlier")}</Button>
                <Button variant="ghost" type="button" disabled={editDisabled || index === draft.rules.length - 1} onClick={() => applyRuleMove(index, index + 1)}>{t("moveLater")}</Button>
                <Button variant="ghost" size="icon" className="ml-auto text-destructive" type="button" aria-label={t("deleteRule")} title={t("deleteRule")} disabled={editDisabled} onClick={() => applyRuleRemoval(index)}><Trash2 aria-hidden="true" focusable="false" /></Button>
              </div>
            </fieldset>;
          })()}
          {selectedNode.startsWith("model::") ? (() => { const model = mountedModels.find((item) => item.id === selectedNode.slice(7)); return model ? <fieldset className="grid min-w-0 gap-3 border-0 p-0 disabled:opacity-70"><legend>{t("model")} {model.id}</legend>
            <Button variant="outline" disabled={busy || layoutDirty || decisionPending || policyRecovery !== null} onClick={() => onOpenModel?.({ provider: model.provider, upstream: model.upstream_model })}>{t("canvasOpenModel")}</Button>
            <Button variant="outline" disabled={editDisabled} onClick={() => { handoffFocus(); setEditableDraft(removeModelNode(draft, config, model.id)); setSelectedNode(""); setInspectorOpen(false); workspaceRef.current?.querySelector<HTMLElement>(".routing-canvas-scroll")?.focus(); }}>{t("workflowRemoveModel")}</Button>
            {config.labels.map((label) => <label key={label.tag}><Checkbox disabled={editDisabled} checked={labelMembers(draft, config, label).some((item) => item.id === model.id)} onChange={(event) => updateMembership(model.id, label.tag, event.target.checked)} />{label.name}</label>)}
          </fieldset> : null; })() : null}
          {selectedNode.startsWith("zone::") ? (() => { const label = config.labels.find((item) => zoneId(item.tag) === selectedNode); return label ? <fieldset className="grid min-w-0 gap-3 border-0 p-0 disabled:opacity-70" disabled={editDisabled}><legend>{tr("labelPool", { label: label.name })}</legend>{mountedModels.map((item) => <label key={item.id}><Checkbox disabled={editDisabled} checked={labelMembers(draft, config, label).some((model) => model.id === item.id)} onChange={(event) => updateMembership(item.id, label.tag, event.target.checked)} />{item.id}</label>)}</fieldset> : null; })() : null}
        </div>}</div></aside>}
      </>}
      </RoutingCanvas>
      {strategySettingsOpen && <Dialog title={t("strategySettings")} fallbackFocusRef={strategySelectRef} onClose={() => setStrategySettingsOpen(false)} footer={<Button variant="outline" onClick={() => setStrategySettingsOpen(false)}>{t("backToEditing")}</Button>}>
        {config.definition && <div className="grid min-w-0 gap-3">
          <label className="grid min-w-0 gap-1 text-xs text-ink-muted">
            <span>{t("workflowDecisionProvider")}</span>
            <NativeSelect aria-label={t("workflowDecisionProvider")} value={draft.decisionProvider ?? ""} disabled={editDisabled} onChange={(event) => setEditableDraft((current) => ({ ...current, decisionProvider: event.target.value || undefined }))}>
              <NativeSelectOption value="">{t("workflowDecisionProviderDefault")}</NativeSelectOption>
              {(config.decision_providers ?? []).map((provider) => <NativeSelectOption key={provider.id} value={provider.id}>{provider.display_name || provider.id}{provider.model ? ` · ${provider.model}` : ""}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <p className="m-0 text-xs text-ink-muted">{t("workflowDecisionProviderNote")}</p>
          <div role="status" className="grid gap-1 text-xs">
            <span className={configuredDecision?.enabled ? "text-positive" : "text-ink-muted"}>{configuredDecision ? t(configuredDecision.enabled ? "classificationOn" : "classificationOff") : t("decisionReadinessUnknown")}</span>
            {selectedDecisionProvider && <span className="text-ink-muted">{selectedDecisionProvider.id} · {t(selectedDecisionProvider.has_api_key ? "classificationProviderReady" : "classificationProviderMissing")}</span>}
            <Button variant="outline" className="justify-self-start" onClick={() => { setStrategySettingsOpen(false); setDecisionReadinessOpen(true); }}>{t("decisionManage")}</Button>
          </div>
          {decisionReadError && <div role="alert" className="text-xs text-caution">{t("decisionReadinessUnknown")} <Button variant="outline" size="sm" onClick={onRetryDecisionRead}>{t("routingRetryRead")}</Button></div>}
          {decisionWriteError && <p role="alert" className="m-0 text-xs text-caution">{t("pmError")}</p>}
          {decisionRefreshFailed && <div role="alert" className="text-xs text-caution">{t("pmRefreshFailed")} <Button variant="outline" size="sm" disabled={decisionPending} onClick={onRetryDecisionCatalog}>{t("pmRetryCatalog")}</Button></div>}
        </div>}
      </Dialog>}
      {decisionReadinessOpen && <Dialog title={t("pmDecisionRouting")} fallbackFocusRef={strategySelectRef} onClose={() => setDecisionReadinessOpen(false)} footer={<Button variant="outline" onClick={() => setDecisionReadinessOpen(false)}>{t("cancel")}</Button>}>
        {configuredDecision ? <DecisionRoutingControl decision={{ ...configuredDecision, providers: selectedDecisionProvider ? [selectedDecisionProvider] : [] }} disabled={editDisabled || dirty || layoutDirty || decisionPending || decisionReadError || decisionRefreshFailed || !decisionConfiguration?.write_available || !onSetDecisionEnabled} onToggle={() => onSetDecisionEnabled?.(!configuredDecision.enabled)} t={t} diagnostic onUnauthorized={onUnauthorized} configurationGeneration={decisionConfiguration?.revision} /> : <p role="status">{t("decisionReadinessUnknown")}</p>}
        <p className="mt-3 text-xs text-ink-muted">{t("decisionSelectionNote")}</p>
      </Dialog>}
      {review && <Dialog title={t("reviewChanges")} fallbackFocusRef={strategySelectRef} onClose={() => { if (!busy) setReview(null); }} footer={<>
        <Button onClick={save} disabled={writeDisabled || busy || policyRecovery !== null || layoutDirty || incomplete || questionErrors.length > 0 || (review.warnings.length > 0 && !acknowledged)}>{t("confirmAndSave")}</Button>
        <Button variant="outline" disabled={busy} onClick={() => setReview(null)}>{t("backToEditing")}</Button>
      </>}><DiffList diff={review.diff} t={t} />{error && <p role="alert">{error}</p>}{review.warnings.map((warning) => <p key={warning}>{warning}</p>)}{review.warnings.length > 0 && <label><Checkbox disabled={busy} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{t("acknowledgeWarnings")}</label>}</Dialog>}
      {resetReview && <Dialog title={t("resetBaseline")} fallbackFocusRef={strategySelectRef} onClose={() => { if (!busy) setResetReview(false); }} footer={<><Button onClick={reset} disabled={writeDisabled || busy || policyRecovery !== null || layoutDirty}>{t("confirmReset")}</Button><Button variant="outline" disabled={busy} onClick={() => setResetReview(false)}>{t("backToEditing")}</Button></>}><p>{t("resetReviewPrompt")}</p>{error && <p role="alert">{error}</p>}</Dialog>}
      {strategyAction && <Dialog title={t(strategyAction === "create" ? "workflowCreate" : "workflowDelete")} fallbackFocusRef={strategySelectRef} onClose={() => { if (!busy) setStrategyAction(null); }} footer={<>
        <Button disabled={writeDisabled || busy || policyRecovery !== null || (strategyAction === "create" ? !strategyName : !config.deletable)} onClick={() => changeStrategy(strategyAction === "create" ? strategyName : strategies.find((item) => item.editable && item.name !== config.strategy && item.name === config.runtime_default)?.name ?? strategies.find((item) => item.editable && item.name !== config.strategy)?.name ?? "task_aware", strategyAction)}>{t(strategyAction === "create" ? "workflowCreate" : "workflowDelete")}</Button>
        {policyRecovery !== null && <Button variant="outline" disabled={busy || !active} onClick={retryPolicyRead}>{t("routingRetryRead")}</Button>}
        <Button variant="outline" disabled={busy} onClick={() => setStrategyAction(null)}>{t("cancel")}</Button>
      </>}>{strategyAction === "create" ? <label className="grid gap-2">{t("workflowName")}<Input value={strategyName} maxLength={80} disabled={busy || policyRecovery !== null} onChange={(event) => setStrategyName(event.target.value)} /></label> : <p>{t("workflowDeletePrompt")}</p>}{error && <p role="alert">{error}</p>}</Dialog>}
      {modelChooser && <Dialog title={t("workflowChooseModel")} fallbackFocusRef={strategySelectRef} onClose={() => setModelChooser(false)} footer={<Button variant="outline" onClick={() => setModelChooser(false)}>{t("cancel")}</Button>}>
        <label className="grid gap-2">{t("workflowModelSearch")}<Input value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} /></label>
        <ul className="mt-3 grid gap-2">{chooserModels.map((model) => <li key={model.id}><Button variant="outline" className="h-auto w-full justify-between whitespace-normal [overflow-wrap:anywhere]" disabled={editDisabled} onClick={() => {
          setEditableDraft(addModelNode(draft, config, model.id)); setModelChooser(false); setModelQuery(""); setInspectorOpen(false);
          setRevealNode((value) => ({ id: `model::${model.id}`, serial: (value?.serial ?? 0) + 1 }));
        }}><span>{model.provider} / {model.upstream_model}</span><span>{t("add")}</span></Button></li>)}</ul>
        {!chooserModels.length && <p>{t("workflowNoModels")}</p>}
      </Dialog>}
    </section>
  );
}
