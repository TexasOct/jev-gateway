import { useEffect, useMemo, useState } from "react";
import type { ConfigurationPayload } from "@/shared/api/types";
import type { RoutingDraft } from "./model/draft";
import { projectConfiguredRouteFlow } from "./model/configured-route-flow";
import type { ConfiguredBranch } from "./model/configured-route-flow";
import { messages } from "@/shared/i18n";
import { formatRouteLabel } from "@/shared/i18n/route-label";

export interface ConfiguredRouteFlowProps {
  draft: RoutingDraft;
  config: ConfigurationPayload;
  locale: "en" | "zh-CN";
  /** Optional initial focus; selection remains local and never changes policy. */
  initialSelectedBranchId?: string | null;
  /** Useful for deterministic static rendering; otherwise follows the OS preference. */
  reducedMotion?: boolean;
}

const copy = {
  en: {
    title: "Configured route",
    draft: "Draft policy preview",
    applied: "Draft policy preview · matches the currently applied policy",
    note: "Possible paths in the draft. This view does not show recorded requests or provider status.",
    questions: "Questions considered",
    noQuestions: "No questions configured",
    rule: "Rule",
    fallback: "Fallback",
    match: "If matched",
    unmatched: "Otherwise, check the next rule",
    fallbackNext: "Otherwise, use fallback",
    pool: "Eligible model pool",
    member: "Pool member",
    noMembers: "No configured pool members",
    unbound: "No label selected",
    choose: "Choose a rule or fallback to trace its configured path.",
    first: "Questions enter the first rule.",
    direct: "Questions lead directly to fallback.",
    skip: "Earlier rules do not match in this example path.",
    chosen: "The selected rule matches and selects the label pool",
    final: "No rule matches, so fallback selects the label pool",
    selection: "Selection mode",
    membership: "Listed models belong to the pool. This does not imply simultaneous requests or a chosen model.",
    missingPool: "This branch has no resolved label pool in the draft.",
  },
  "zh-CN": {
    title: "配置路由",
    draft: "策略草稿预览",
    applied: "策略草稿预览 · 与当前已应用策略一致",
    note: "这里展示草稿中的可能路径，不展示已记录请求或服务商状态。",
    questions: "参与判断的问题",
    noQuestions: "未配置问题",
    rule: "规则",
    fallback: "兜底",
    match: "匹配时",
    unmatched: "否则检查下一条规则",
    fallbackNext: "否则进入兜底",
    pool: "可选模型池",
    member: "模型池成员",
    noMembers: "模型池没有已配置成员",
    unbound: "未选择标签",
    choose: "选择规则或兜底，查看配置中的路径。",
    first: "问题进入第一条规则。",
    direct: "问题直接进入兜底。",
    skip: "此示例路径中，前面的规则均未匹配。",
    chosen: "选中的规则匹配后进入标签模型池",
    final: "所有规则均未匹配，兜底进入标签模型池",
    selection: "选择模式",
    membership: "所列模型是模型池成员，不表示同时请求或已选定某个模型。",
    missingPool: "草稿中此分支没有可解析的标签模型池。",
  },
} as const;

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function useReducedMotion(override: boolean | undefined): boolean {
  const [preferred, setPreferred] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MOTION_QUERY).matches);
  useEffect(() => {
    if (override !== undefined || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOTION_QUERY);
    const update = () => setPreferred(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [override]);
  return override ?? preferred;
}

/** A read-only explanation. The editor remains the sole draft and write owner. */
export default function ConfiguredRouteFlow({ draft, config, locale, initialSelectedBranchId = null, reducedMotion: motionOverride }: ConfiguredRouteFlowProps) {
  const text = copy[locale];
  const shared = messages[locale];
  const defaultPath = shared.inheritedDefaultPath.replace("{label}", formatRouteLabel("default", () => shared.defaultRouteLabel, { defaulted: true }));
  const projection = useMemo(() => projectConfiguredRouteFlow(draft, config), [draft, config]);
  const reducedMotion = useReducedMotion(motionOverride);
  const [selection, setSelection] = useState<{ id: string; draft: RoutingDraft; config: ConfigurationPayload; revision: number } | null>(() => initialSelectedBranchId ? { id: initialSelectedBranchId, draft, config, revision: 0 } : null);
  // A changed draft cannot retain a trace of a previous policy. The identity guard
  // drops it on the first render, while the effect clears the old selection state.
  const active = selection?.draft === draft && selection.config === config ? projection.branches.find((branch) => branch.id === selection.id) : undefined;
  // When policy inputs change, the identity guard hides the prior selection on
  // this render. A new click captures the new draft/configuration identities.
  const select = (id: string) => setSelection((previous) => ({ id, draft, config, revision: (previous?.revision ?? 0) + 1 }));
  const selectedEdges = new Set(active?.path.map((edge) => `${edge.from}|${edge.to}|${edge.kind}`) ?? []);
  const isSelected = (from: string, to: string, kind: string) => selectedEdges.has(`${from}|${to}|${kind}`);
  const motionKey = `${selection?.revision ?? 0}-${reducedMotion ? "static" : "motion"}`;

  function wire(from: string, to: string, kind: "context" | "unmatched" | "match" | "default", label: string, branchId?: string) {
    const highlighted = isSelected(from, to, kind) && (branchId === undefined || active?.id === branchId);
    return <div className="flex min-h-7 items-center gap-2" aria-label={label} key={`${from}-${to}-${kind}`}>
      <svg viewBox="0 0 48 22" width="48" height="22" className="shrink-0" aria-hidden="true">
        <path key={highlighted ? motionKey : "idle"} d="M 2 11 H 42 L 37 6 M 42 11 L 37 16" className={`fill-none [stroke-linecap:round] [stroke-linejoin:round] [vector-effect:non-scaling-stroke] ${highlighted ? "stroke-primary stroke-[2.5] [transition:stroke_140ms_ease,stroke-width_140ms_ease]" : "stroke-outline stroke-[1.5] [transition:stroke_140ms_ease,stroke-width_140ms_ease]"} ${kind === "unmatched" ? "[stroke-dasharray:3_3]" : ""} ${highlighted && !reducedMotion ? "animate-[configured-route-trace_900ms_ease-out_1_both]" : ""} motion-reduce:transition-none motion-reduce:animate-none`} data-flow-state={highlighted ? "active" : "idle"} data-flow-kind={kind} data-flow-motion={highlighted && !reducedMotion ? "tracing" : undefined} />
      </svg>
      <span className={`text-xs ${highlighted ? "text-primary" : "text-ink-muted"}`}>{label}</span>
    </div>;
  }

  function pool(branch: ConfiguredBranch) {
    return <div className="min-w-0 rounded-xl border border-outline bg-panel-muted p-3">
      <span className="text-xs text-ink-muted">{text.pool}</span>
      <p className="mt-1 break-words text-sm font-semibold text-ink">{branch.label ?? text.unbound}</p>
      {branch.selection && <p className="mt-1 text-xs text-ink-muted">{text.selection}: {branch.selection}</p>}
      {branch.defaulted && <p className="mt-2 text-xs text-primary">{defaultPath}</p>}
      {branch.models.length ? <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={branch.defaulted ? defaultPath : text.member}>{branch.models.map((model) => <li key={model} className="max-w-full break-all rounded-md border border-outline bg-panel px-2 py-1 text-xs text-ink">{model}</li>)}</ul> : <p className="mt-2 text-xs text-ink-muted">{text.noMembers}</p>}
      {branch.defaulted && <p className="mt-2 text-xs text-ink-muted">{shared.inheritedDefaultHelp}</p>}
      {branch.incomplete && <p className="mt-2 text-xs text-ink-muted">{shared.emptyTagPath}</p>}
    </div>;
  }

  return <section className="my-3 min-w-0 rounded-xl border border-outline bg-panel p-3 text-ink sm:p-4" aria-label={text.title}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold">{text.title}</h3>
      <span className="rounded-md border border-outline bg-panel-muted px-2 py-1 text-xs text-ink-muted" aria-label={projection.changed ? text.draft : text.applied}>{projection.changed ? text.draft : text.applied}</span>
    </div>
    <p className="mt-2 text-xs text-ink-muted">{text.note}</p>
    <div className="mt-4 min-w-0 rounded-xl border border-outline bg-panel-muted p-3">
      <h4 className="text-xs font-semibold text-ink">{text.questions}</h4>
      {projection.questions.length ? <ul className="mt-2 flex flex-wrap gap-2">{projection.questions.map((question) => <li key={question.name} className="min-w-0 max-w-full rounded-md border border-outline bg-panel px-2 py-1 text-xs text-ink"><strong className="break-words">{question.name}</strong>{question.instructions && <span className="ml-2 break-words text-ink-muted">{question.instructions}</span>}<span className="block break-words text-ink-muted">{question.criteria.map((criterion) => `${criterion.name}: ${criterion.description}`).join(" · ")}</span></li>)}</ul> : <p className="mt-2 text-xs text-ink-muted">{text.noQuestions}</p>}
    </div>
    <div className="mt-2">{wire("questions", projection.branches[0]?.id ?? "fallback", "context", projection.branches[0]?.order ? text.first : text.direct)}</div>
    <ol className="min-w-0">
      {projection.branches.map((branch, index) => <li key={branch.id} className="min-w-0">
        <div className={`my-2 grid min-w-0 gap-2 rounded-xl border p-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center ${active?.id === branch.id ? "border-primary bg-panel-muted" : "border-outline"}`}>
          <button type="button" onClick={() => select(branch.id)} aria-pressed={active?.id === branch.id} className="min-h-10 min-w-0 rounded-md border border-outline bg-panel px-3 py-2 text-left text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <span className="font-semibold">{branch.order === null ? text.fallback : `${text.rule} ${branch.order}`}</span>
            {branch.conditions.map(({ question, values }) => <span key={question} className="block break-words text-xs text-ink-muted">{question} = {values.join(" | ")}</span>)}
          </button>
          {branch.poolId ? wire(branch.id, branch.poolId, "match", text.match) : <span className="text-xs text-ink-muted">{text.missingPool}</span>}
          {pool(branch)}
        </div>
        {branch.defaulted && branch.poolId && wire(branch.poolId, `model::${branch.models[0]}`, "default", defaultPath, branch.id)}
        {index < projection.branches.length - 1 && wire(branch.id, projection.branches[index + 1]!.id, "unmatched", index === projection.branches.length - 2 ? text.fallbackNext : text.unmatched)}
      </li>)}
    </ol>
    <div className="mt-3 rounded-xl border border-outline bg-panel-muted p-3 text-xs leading-5 text-ink" role="status" aria-live="polite">
      {active ? <>
        <p>{active.order === null ? text.final : text.chosen}{active.label ? `: ${active.label}.` : "."}</p>
        {active.path.some((edge) => edge.kind === "unmatched") && <p>{text.skip}</p>}
        {active.poolId === null && <p>{text.missingPool}</p>}
        <p>{active.defaulted ? shared.inheritedDefaultHelp : active.incomplete ? shared.emptyTagPath : text.membership}</p>
      </> : <p>{text.choose}</p>}
    </div>
  </section>;
}
