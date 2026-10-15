import type { ReactNode } from "react";
import { MessageSquareText, Route, CheckCircle2, CircleHelp } from "lucide-react";
import type { RetainedRequest } from "@/shared/api/types";
import { useLocale } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import { RouteTrace } from "./RouteTrace";
import { classificationLabel, modelName, record, routingReason, text } from "../model/routing-reason";

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return <div className="min-w-0 rounded-md border border-outline bg-panel p-3 [overflow-wrap:anywhere]"><dt className="mb-1 text-xs font-medium text-ink-muted">{title}</dt><dd className="m-0 text-sm leading-relaxed">{children}</dd></div>;
}
function LongText({ value }: { value: string }) {
  return <div className="min-w-0 space-y-3 [overflow-wrap:anywhere]">{value.split(/(```[\s\S]*?```)/g).map((part, index) => part.startsWith("```")
    ? <pre key={index} tabIndex={0} className="m-0 max-w-full rounded-md border border-outline bg-code p-3 text-xs leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}</pre>
    : <p key={index} className="m-0 max-w-[85ch] whitespace-pre-wrap text-sm leading-7">{part}</p>)}</div>;
}
function MessageContent({ content }: { content: unknown }) {
  const { t } = useLocale();
  if (typeof content === "string") return <LongText value={content} />;
  if (Array.isArray(content)) return <div className="space-y-3">{content.map((part, index) => {
    const block = record(part);
    if (typeof block?.["text"] === "string") return <LongText key={index} value={block["text"]} />;
    return <p key={index} className="text-xs text-ink-muted [overflow-wrap:anywhere]">{text(block?.["type"]) ?? t("notRecorded")} · {t("contentMissing")}</p>;
  })}</div>;
  return <p className="text-sm text-ink-muted">{t("contentMissing")}</p>;
}
export function ContextSnapshot({ item }: { item: RetainedRequest }) {
  const { t, locale } = useLocale();
  const request = item.request;
  const messages = Array.isArray(request["messages"]) ? request["messages"].map(record).filter((value) => value !== null) : [];
  const captured = request["content_captured"];
  const prompt = text(request["prompt"]);
  return <section className="context-snapshot min-w-0 border-t border-outline pt-5" aria-label={t("recordedContext")}>
    <h3 className="mb-1 flex items-center gap-2 text-base"><MessageSquareText aria-hidden="true" className="size-4 text-primary" />{t("recordedContext")}</h3>
    <p className="mb-2 text-xs leading-5 text-ink-muted">{t("snapshotNote")}</p>
    <p className="mb-4 text-xs leading-5 text-ink-muted">{t("replyCaptureLimit")}</p>
    {captured === false ? <p role="status" className="rounded-md border border-dashed border-outline p-4 text-sm text-ink-muted">{t("contentNotCaptured")}</p>
      : <>
        {captured !== true && <p className="mb-3 text-xs text-ink-muted">{t("captureUnknown")}</p>}
        {!messages.length && !prompt ? <p role="status" className="rounded-md border border-dashed border-outline p-4 text-sm text-ink-muted">{t("contentMissing")}</p> : null}
        {!messages.length && prompt ? <article className="rounded-md border border-outline p-4"><h4 className="mb-2 text-xs text-ink-muted">{locale === "en" ? "Recorded prompt · message roles unavailable" : "已记录的提示 · 消息角色未记录"}</h4><LongText value={prompt} /></article> : null}
        <div className="grid min-w-0 gap-3">{messages.map((message, index) => {
          const role = text(message["role"]) ?? t("evidenceUnknown");
          const heading = `${String(index + 1).padStart(2, "0")} · ${role}${text(message["name"]) ? ` · ${message["name"]}` : ""}`;
          const toolCalls = message["tool_calls"] ?? message["function_call"];
          const body = <><MessageContent content={message["content"]} />{toolCalls != null && <pre tabIndex={0} className="mt-3 max-w-full rounded-md bg-code p-3 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify(toolCalls, null, 2)}</pre>}</>;
          return ["system", "developer", "tool", "function"].includes(role)
            ? <details key={index} className="min-w-0 rounded-md border border-outline bg-panel-muted p-3"><summary className="cursor-pointer py-1 text-xs font-semibold text-ink-muted">{heading}</summary><div className="mt-3">{body}</div></details>
            : <article key={index} data-message-role={role} className={`min-w-0 rounded-md border border-outline p-4 ${role === "user" ? "bg-panel-muted" : "bg-panel"}`}><h4 className="mb-3 text-xs font-semibold text-ink-muted">{heading}</h4>{body}</article>;
        })}</div>
        {request["tools"] != null && <details className="mt-3 min-w-0 rounded-md border border-outline p-3"><summary className="cursor-pointer text-xs font-semibold">{locale === "en" ? "Recorded tool definitions" : "已记录的工具定义"}</summary><pre tabIndex={0} className="mt-3 max-w-full text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify(request["tools"], null, 2)}</pre></details>}
        {messages.length || prompt ? <p className="mt-3 text-xs text-ink-muted">{t("truncationUnknown")}</p> : null}
      </>}
  </section>;
}
export function RequestDetails({ item }: { item: RetainedRequest }) {
  const { t, locale, formatDateTime } = useLocale();
  const unknown = t("evidenceUnknown");
  const decision = item.decision;
  const evidence = decision?.routing_evidence;
  const classification = evidence?.classification;
  const context = decision?.config_context;
  const config = context?.status === "available" ? context : null;
  const rule = config?.strategy.rules.find((candidate) => candidate.index === evidence?.matched_rule_index);
  const outcome = item.outcome;
  const ok = outcome?.["ok"];
  const result = ok === true ? t("succeeded") : ok === false ? t("failed") : t("traceUnknown");
  const resultClass = ok === true ? "text-positive" : ok === false ? "text-negative" : "text-ink-muted";
  const branch = evidence?.rule_status;
  const pool = evidence?.pool;
  const model = modelName(decision) ?? unknown;
  const label = text(decision?.["label"]);
  const copy = (en: string, zh: string) => locale === "en" ? en : zh;
  const number = (value: unknown, suffix = "") => typeof value === "number" && Number.isFinite(value) ? `${value}${suffix}` : unknown;
  return <article className="request-detail min-w-0 space-y-5" aria-label={t("requestDetail")}>
    <header className="min-w-0 border-b border-outline pb-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted"><span className="[overflow-wrap:anywhere]">{String(item.request["request_id"])} · {formatDateTime(typeof item.request["received_at"] === "number" ? item.request["received_at"] : null)}</span><Badge variant="outline" className={resultClass}>{t("recordedResult")}: {result}</Badge></div>
      <h3 className="mb-2 flex items-center gap-2 text-base"><Route aria-hidden="true" className="size-4 shrink-0 text-primary" />{t("whyThisModel")}</h3>
      <p className="routing-reason m-0 text-base font-medium leading-7 [overflow-wrap:anywhere]">{routingReason(decision, t, locale)}</p>
      <p className="mt-2 mb-0 text-sm text-ink-muted [overflow-wrap:anywhere]">{model}{label ? ` · ${t("label")}: ${label}` : ""}</p>
      {decision?.["defaulted"] === true && <p className="mt-2 text-sm font-medium text-primary">{t("globalModelDefault")}</p>}
      {label === "default" && decision?.["defaulted"] === false && <p className="mt-2 text-xs text-ink-muted">{t("literalDefaultLabel")}</p>}
    </header>
    <dl className="m-0 grid min-w-0 grid-cols-2 gap-2 max-[600px]:grid-cols-1">
      <Fact title={t("classificationEvidence")}><span className={branch === "classifier_fallback" ? "text-caution" : ""}>{classificationLabel(classification?.status, locale, unknown)}</span>{classification?.provider_id && <div className="text-xs text-ink-muted">{classification.provider_id}</div>}</Fact>
      <Fact title={t("ruleEvidence")}>{branch === "matched" ? `${t("rule")} ${evidence?.matched_rule_index ?? unknown}` : branch === "classifier_fallback" ? t("fallbackRecorded") : branch === "accepted_unmatched" ? copy("Strategy default · no rule matched", "策略默认分支 · 未命中规则") : branch === "manual" ? t("manualReason") : branch === "session_reuse" ? t("sessionReuseReason") : branch === "classified" ? t("classifiedReason") : branch === "policy" ? t("policyReason") : unknown}</Fact>
      <Fact title={t("modelEvidence")}><span>{model}</span><div className="mt-1 text-xs text-ink-muted">{pool ? `${pool.source ?? unknown} · ${pool.label ?? unknown} · ${pool.selection ?? unknown}` : unknown}</div>{pool && <details className="mt-2 text-xs"><summary className="cursor-pointer font-medium">{t("candidateModels")} · {pool.candidates.length}</summary><ul className="mt-2 mb-0 max-h-64 overflow-auto pl-4">{pool.candidates.map(candidate => <li key={candidate}>{candidate}</li>)}</ul></details>}</Fact>
      <Fact title={t("replyEvidence")}><span className={`flex items-center gap-1 ${resultClass}`}>{ok === true ? <CheckCircle2 aria-hidden="true" className="size-3.5" /> : <CircleHelp aria-hidden="true" className="size-3.5" />}{result}</span><span className="text-xs text-ink-muted">{ok !== true && ok !== false ? t("upstreamUnknown") : `${copy("Recorded duration", "记录耗时")}: ${number(outcome?.["latency_ms"], " ms")}`}</span>{text(outcome?.["error_type"]) && <div className="text-xs text-negative">{String(outcome!["error_type"])}</div>}</Fact>
    </dl>
    <div className="grid min-w-0 gap-3 text-sm">
      <div><h4 className="mb-1 text-xs font-semibold text-ink-muted">{t("acceptedAnswers")}</h4>{classification?.answers && Object.keys(classification.answers).length ? <dl className="m-0 flex flex-wrap gap-2">{Object.entries(classification.answers).map(([question, answer]) => <div key={question} className="rounded-md border border-outline bg-panel-muted px-3 py-2 [overflow-wrap:anywhere]"><dt className="text-xs text-ink-muted">{question}</dt><dd className="m-0 font-medium">{answer.choice}</dd>{config?.strategy.questions[question]?.criteria[answer.choice] && <p className="mt-1 mb-0 text-xs text-ink-muted">{config.strategy.questions[question]!.criteria[answer.choice]}</p>}</div>)}</dl> : <p className="m-0 text-xs text-ink-muted">{unknown}</p>}</div>
      {classification?.attempts?.length ? <details className="border-t border-outline pt-2"><summary className="cursor-pointer text-xs font-semibold">{t("providerAttempts")} · {classification.attempts.length}</summary><ul className="mt-2 grid gap-2 p-0">{classification.attempts.map((attempt, index) => <li key={index} className="list-none text-xs [overflow-wrap:anywhere]">{attempt.provider_id} · {classificationLabel(attempt.status, locale, unknown)}{attempt.http_status !== null ? ` · HTTP ${attempt.http_status}` : ""} · {number(attempt.elapsed_ms, " ms")}</li>)}</ul></details> : null}
      <details className="recorded-config min-w-0 border-t border-outline pt-2"><summary className="cursor-pointer py-1 text-xs font-semibold">{t("recordedConfiguration")}</summary>
        {config ? <div className="mt-3 grid min-w-0 gap-3 text-xs [overflow-wrap:anywhere]">
          <p className="m-0">{config.config_hash} · {config.strategy.name} · {config.strategy.kind} · {config.strategy.mode ?? unknown}</p>
          <p className="m-0">{t("strategySource")}: {text(decision?.strategy_source) ?? unknown} · {copy("Classification enabled at recording", "记录时分类已启用")}: {config.decision_enabled === true ? t("resolvedYes") : config.decision_enabled === false ? t("resolvedNo") : unknown}</p>
          {rule ? <div><strong>{t("rule")} {rule.index}</strong><p className="mt-1 mb-0">{Object.entries(rule.when).map(([key, values]) => `${key} = ${Array.isArray(values) ? values.join(" / ") : values}`).join(" · ")}</p><p className="mt-1 mb-0">→ {rule.select.label ?? rule.select.tier ?? unknown} · {rule.select.selection ?? config.strategy.selection ?? unknown}</p></div> : null}
          <p className="m-0">{t("fallback")}: {config.strategy.fallback.label ?? config.strategy.fallback.tier ?? unknown} · {config.strategy.fallback.selection ?? config.strategy.selection ?? unknown}</p>
          <p className="m-0">{t("configuredModels")}: {pool?.label && config.strategy.labels[pool.label] ? config.strategy.labels[pool.label]!.models.join(" · ") || copy("Empty", "空") : unknown}</p>
          <p className="m-0">{t("globalModelDefault")}: {config.defaults.default_model ?? unknown}</p>
          <details><summary className="cursor-pointer">{copy("All recorded rules and questions", "全部已记录规则与问题")}</summary><pre tabIndex={0} className="mt-2 max-w-full bg-code p-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify({ questions: config.strategy.questions, rules: config.strategy.rules }, null, 2)}</pre></details>
        </div> : <p className="mt-2 text-xs text-ink-muted">{t("configUnavailable")}</p>}
      </details>
    </div>
    <ContextSnapshot item={item} />
    <details className="border-t border-outline pt-3"><summary className="cursor-pointer py-1 text-xs font-semibold text-ink-muted">{t("illustrativePlayback")}</summary><div className="mt-3"><RouteTrace key={String(item.request["request_id"])} item={item} /></div></details>
    <details className="border-t border-outline pt-3"><summary className="cursor-pointer py-1 text-xs font-semibold text-ink-muted">{t("rawEvidence")}</summary><div className="mt-2">{([['inboundRequest', item.request], ['routingDecision', item.decision], ['upstreamRequest', item.upstream_request], ['outcome', item.outcome]] as const).map(([name, value]) => <details key={name} className="mt-2"><summary className="cursor-pointer text-xs">{t(name)}</summary><pre tabIndex={0} className="mt-2 max-h-96 max-w-full overflow-auto rounded-md bg-code p-3 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{value == null ? unknown : JSON.stringify(value, null, 2)}</pre></details>)}</div></details>
  </article>;
}
