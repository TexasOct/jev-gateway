import { useEffect, useRef, useState } from "react";
import type { PolicyCatalog, RoutingActivityPayload, SessionsPayload } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { activePaths, configuredModels, connectorAnchors, connectorPath, pathForModel, routeDestinations, strategyChoices, validActivity } from "../model/route-activity";
import { distributeSessions } from "../model/strategy-distribution";
import type { StrategiesPayload, StrategyDistribution } from "../model/strategy-distribution";

interface Props {
  strategies?: StrategiesPayload | null;
  policyCatalog?: PolicyCatalog | null;
  strategyError?: boolean;
  activity?: RoutingActivityPayload | null;
  activityError?: boolean;
  activitySequence?: number;
  motionPaused?: boolean;
  sessionsComplete?: boolean;
  locale: "en" | "zh-CN";
  sessions: SessionsPayload | null;
  sessionPageError: boolean;
  monitoringError: boolean;
  providerError?: boolean;
  onRetrySessions: () => void;
  onRetryMonitoring: () => void;
  t: ReturnType<typeof useLocale>["t"];
}

export function StrategyDistribution({ strategies = null, policyCatalog = null, strategyError = false, activity = null, activityError = false, activitySequence = 0, motionPaused = false, sessionsComplete = false, locale, sessions, sessionPageError, monitoringError, providerError = false, onRetrySessions, onRetryMonitoring, t }: Props) {
  const [activeStrategy, setActiveStrategy] = useState<string | null>(null);
  const [instanceState, setInstanceState] = useState<{ sequence: number; id: string; changed: boolean } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [pathAnchors, setPathAnchors] = useState<{ incoming: string; targets: string[] }>({ incoming: "", targets: [] });
  const mapRef = useRef<HTMLDivElement | null>(null);
  const sampleValid = !activityError && validActivity(activity);
  const instanceChanged = instanceState?.sequence === activitySequence && instanceState.changed;

  useEffect(() => {
    if (!sampleValid || !activity) return;
    const id = activity.instance_id;
    queueMicrotask(() => setInstanceState((current) => {
      if (current?.sequence !== activitySequence) return { sequence: activitySequence, id, changed: false };
      if (current.changed || current.id === id) return current;
      return { ...current, changed: true };
    }));
  }, [activity, sampleValid, activitySequence]);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const element = mapRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const root = element.getBoundingClientRect();
      const stacked = window.matchMedia?.("(max-width: 760px)").matches ?? false;
      const nodeRect = (selector: string) => element.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
      const source = nodeRect("[data-route-source]");
      const strategy = nodeRect("[data-route-strategy]");
      if (!source || !strategy) return;
      const incoming = connectorAnchors(root, source, strategy, stacked);
      const targets = [...element.querySelectorAll<HTMLElement>("[data-route-target]")].map((node) => {
        const branch = connectorAnchors(root, strategy, node.getBoundingClientRect(), stacked);
        return connectorPath(branch.start, branch.end, stacked);
      });
      setMapSize({ width: root.width, height: root.height });
      setPathAnchors({ incoming: connectorPath(incoming.start, incoming.end, stacked), targets });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll("[data-route-source], [data-route-strategy], [data-route-target]").forEach((node) => observer.observe(node));
    const viewport = window.matchMedia?.("(max-width: 760px)");
    viewport?.addEventListener("change", measure);
    measure();
    return () => {
      viewport?.removeEventListener("change", measure);
      observer.disconnect();
    };
  }, [strategies, activeStrategy, locale, activity, sessions]);

  const sessionStorageUnavailable = sessions !== null && (sessions.storage.enabled === false || Boolean(sessions.storage.error));
  const distribution = distributeSessions(strategies?.data ?? [], sessions ? [sessions] : [], sessionsComplete && !sessionPageError && !monitoringError && !sessionStorageUnavailable);
  const activityFresh = sampleValid && !instanceChanged && (
    instanceState?.sequence !== activitySequence || instanceState.id === activity?.instance_id
  );
  const visiblePaths = activePaths(activityFresh && activity ? activity : null);
  const observedPaths = visiblePaths;
  const choices = strategyChoices(strategies?.data ?? [], observedPaths);
  const selectedChoice = choices.find((choice) => choice.name === activeStrategy)
    ?? choices.find((choice) => choice.name === strategies?.default) ?? choices[0];
  const selectedStrategy = strategies?.data.find((strategy) => strategy.name === selectedChoice?.name);
  const selectedStrategyName = selectedChoice?.name;
  const selectedDistribution = distribution.strategies.find((strategy) => strategy.name === selectedStrategyName);
  const destinations = routeDestinations(selectedDistribution?.destinations ?? [], observedPaths.filter((path) => path.strategy === selectedStrategyName), configuredModels(selectedStrategy, policyCatalog));
  const activityForModel = (modelId: string | null) => activityFresh && pathForModel(visiblePaths, selectedStrategyName, modelId);
  const unknownTarget = destinations.some((item) => item.source !== "model");
  const copy = (en: string, zh: string) => locale === "zh-CN" ? zh : en;
  const readState = monitoringError ? copy("Read failed", "读取失败")
    : sessions === null ? copy("Loading", "读取中")
    : sessionStorageUnavailable ? copy("Storage unavailable", "存储不可用")
    : sessionPageError ? copy("Partial", "部分")
    : providerError ? copy("Provider data unavailable", "服务商数据不可用")
    : distribution.complete ? copy("Complete", "已完成")
    : copy("Loading", "读取中");
  return (
    <section className="monitoring-home relative col-span-full min-w-0 overflow-hidden rounded-xl border border-outline bg-panel p-5 max-[600px]:p-3" aria-labelledby="monitoring-home-title">
        <div className="monitoring-home-heading flex items-start justify-between gap-5 max-[760px]:grid">
          <div>
            <p className="m-0 text-xs text-ink-muted">{copy("Current sessions", "当前会话")}</p>
            <h2 id="monitoring-home-title" className="my-1 text-[clamp(1.5rem,3vw,2.1rem)] tracking-[-0.035em]">{copy("Strategy routes", "策略路由")}</h2>
            <p className="mt-1 text-sm text-ink-muted">{copy("Latest route per session.", "按会话最近路由计数。")}</p>
          </div>
          <span className="monitoring-read-state shrink-0 rounded-full border border-outline px-[0.65rem] py-[0.4rem] text-xs text-ink-muted" role="status">{readState}</span>
        </div>
        {strategyError ? <p role="alert">{copy("Could not list registered strategies.", "无法列出已注册策略。")}</p> : null}
        {strategies === null && !strategyError ? <p role="status">{copy("Loading registered strategies…", "正在读取已注册策略…")}</p> : null}
        {strategies?.data.length === 0 ? <p>{copy("No registered strategies returned.", "未返回已注册策略。")}</p> : null}
        {choices.length > 0 ? <>
          <div className="monitoring-strategy-tabs flex w-fit max-w-full gap-2 overflow-x-auto py-2" role="group" aria-label={copy("Strategies", "策略")}>
            {choices.map((choice) => {
              const count = distribution.strategies.find((entry) => entry.name === choice.name)?.count ?? 0;
              const selected = selectedStrategyName === choice.name;
              return <button key={choice.name} type="button" aria-pressed={selected} className={`monitoring-strategy-tab flex min-h-10 w-[min(13rem,75vw)] max-w-[min(13rem,75vw)] shrink-0 cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "border-primary bg-panel-muted font-semibold text-primary shadow-xs" : "border-outline bg-panel text-ink-muted hover:border-primary hover:text-ink"}`} onClick={() => setActiveStrategy(choice.name)}>
                <span className="min-w-0 truncate">{choice.name}{choice.retired ? <span className="ml-1 text-xs text-ink-muted">{copy("removed", "已移除")}</span> : null}</span><small className="shrink-0 text-xs text-ink-muted tabular-nums">{choice.retired ? "—" : distribution.complete ? count : count > 0 ? `${count}+` : "—"}</small>
              </button>;
            })}
          </div>
          <div className="monitoring-route-map relative grid min-h-[190px] grid-cols-[minmax(130px,0.8fr)_minmax(180px,1fr)_minmax(240px,1.5fr)] items-center gap-[clamp(1.5rem,4vw,4rem)] rounded-xl border border-outline bg-panel-muted p-4 max-[760px]:grid-cols-[minmax(0,1fr)] max-[760px]:gap-8" aria-label={copy("Observed session route", "观察到的会话路由")} ref={mapRef}>
            <div className="monitoring-map-node relative z-[1] grid min-w-0 gap-[0.45rem] rounded-md border border-outline bg-panel p-[0.85rem] max-[760px]:w-full" data-route-source><span className="text-[0.8rem] text-ink-muted [overflow-wrap:anywhere]">{copy("Current sessions", "当前会话")}</span><strong className="[overflow-wrap:anywhere]">{distribution.complete ? distribution.sessions.length : "…"}</strong></div>
            <div className="monitoring-map-node monitoring-map-strategy relative z-[1] grid min-w-0 gap-[0.45rem] rounded-md border border-primary bg-panel p-[0.85rem] max-[760px]:w-full" data-route-strategy><span className="text-xs text-ink-muted">{selectedChoice?.retired ? copy("Removed", "已移除") : copy("Strategy", "策略")}</span><strong className="[overflow-wrap:anywhere]">{selectedStrategyName}</strong><span className="line-clamp-2 text-xs text-ink-muted">{selectedChoice?.retired ? copy("Activity", "活动") : selectedStrategy?.description ?? ""}</span></div>
            <div className="monitoring-branch-svg pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true" style={{ width: mapSize.width, height: mapSize.height }}>
                <svg viewBox={`0 0 ${Math.max(1, mapSize.width)} ${Math.max(1, mapSize.height)}`} preserveAspectRatio="none" className="size-full overflow-visible">
                  <path className="monitoring-branch-base fill-none stroke-outline stroke-[1.4] [vector-effect:non-scaling-stroke]" d={pathAnchors.incoming} />
                  {pathAnchors.targets.map((path, index) => {
                    const target = destinations[index];
                    const active = target?.source === "model" && activityForModel(target.id);
                    return <g key={`${target?.source}:${target?.id}:${index}`}><path className="monitoring-branch-base fill-none stroke-outline stroke-[1.4] [vector-effect:non-scaling-stroke]" d={path} />{active ? <path className={`monitoring-branch-active fill-none stroke-primary stroke-[2.5] [stroke-linecap:round] [vector-effect:non-scaling-stroke] ${motionPaused || reducedMotion ? "static opacity-90 [stroke-dasharray:none] animate-none" : "[stroke-dasharray:0.08_0.13] animate-[monitoring-route-flow_2.2s_linear_infinite] motion-reduce:animate-none motion-reduce:[stroke-dasharray:none]"}`} d={path} pathLength="1" /> : null}</g>;
                  })}
                </svg>
              </div>
            <div className="monitoring-destinations relative z-[1] grid min-w-0 content-center gap-2 max-[760px]:w-full max-[760px]:pt-1">
              <p className="m-0 text-xs font-medium text-ink-muted">{copy("Routes", "路由")}</p>
              <div className="monitoring-activity-state flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted" role="status">
                {instanceChanged ? copy("Process changed", "进程已变更") : !activityFresh ? copy("Activity unavailable", "活动不可用") : copy("In flight", "进行中")}
                {unknownTarget ? <span>{copy("Unknown route", "未知路由")}</span> : null}

              </div>
              {destinations.map((target) => <div className="monitoring-destination group flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-outline bg-panel px-[0.7rem] py-[0.55rem] data-[active=true]:border-primary" data-route-target={target.id ?? "unknown"} data-route-unknown={target.source !== "model" || undefined} data-active={(target.source === "model" && activityForModel(target.id)) || undefined} key={`${target.source}:${target.id}`}>
                <div className="grid min-w-0 gap-[0.2rem]"><strong className="[overflow-wrap:anywhere]">{target.id ?? copy("Unknown model / route", "模型 / 路由未知")}</strong><small className="text-xs text-ink-muted">{target.activityOnly ? copy("Activity", "活动") : target.configured ? target.count === 0 ? distribution.complete ? copy("Configured · no sessions", "已配置 · 无会话") : copy("Configured · partial", "已配置 · 部分") : copy("Configured · selected", "已配置 · 已选择") : target.source === "model" ? copy("Selected", "已选择") : target.source === "route" ? copy("Recorded · model unknown", "已记录 · 模型未知") : copy("Unknown", "未知")}</small></div>
                <span className="shrink-0 text-lg font-bold tabular-nums text-primary">{target.activityOnly || (target.configured && target.count === 0) ? "—" : `${target.count}${distribution.complete ? "" : "+"}`}</span>
                {target.source === "model" ? <small className="monitoring-path-status basis-full text-xs text-ink-muted group-data-[active=true]:text-primary">{!activityFresh ? copy("Activity unknown", "活动状态未知") : activityForModel(target.id) ? copy("Active", "活跃") : copy("No activity observed", "未观察到活动")}</small> : null}
              </div>)}
              {selectedStrategy && !policyCatalog ? <p className="m-0 border-l-2 border-outline p-[0.6rem] text-xs text-ink-muted">{copy("Configured possibilities unavailable; catalog model data could not be read.", "无法读取目录模型数据，已配置的候选模型暂不可用。")}</p> : null}
              {selectedStrategy?.kind && !["auto", "policy", "decision", "decision_matrix"].includes(selectedStrategy.kind) ? <p className="m-0 border-l-2 border-outline p-[0.6rem] text-xs text-ink-muted">{copy("Configured model possibilities are unavailable for this strategy kind.", "此策略类型无法显示已配置的候选模型。")}</p> : null}
              {selectedDistribution?.count === 0 ? <p className="m-0 border-l-2 border-outline p-[0.6rem] text-xs text-ink-muted">{distribution.complete ? copy("No live sessions for this strategy.", "此策略没有活动会话。") : copy("No sessions observed yet; the page walk is incomplete.", "尚未观察到会话；分页读取尚未完成。")}</p> : null}
            </div>
          </div>
          {distribution.unattributed.count > 0 ? <p className="monitoring-attribution mt-2 text-xs text-ink-muted">{copy("Unknown strategy", "策略未知")}: {distribution.unattributed.count}{distribution.complete ? "" : "+"} {copy("live sessions", "个活动会话")}</p> : null}
          {distribution.unregistered.map((entry: StrategyDistribution) => <p className="monitoring-attribution mt-2 text-xs text-ink-muted" key={entry.name}>{copy("Unregistered strategy in session data", "会话数据中的未注册策略")}: {entry.name} · {entry.count}{distribution.complete ? "" : "+"}</p>)}
        </> : null}
        {sessionPageError || (sessions !== null && (sessions.storage.enabled === false || Boolean(sessions.storage.error))) ? <Button variant="outline" onClick={onRetrySessions}>{t("retryPage")}</Button> : null}
        {monitoringError || strategyError ? <Button variant="outline" onClick={onRetryMonitoring}>{t("retryPage")}</Button> : null}
      </section>
  );
}
