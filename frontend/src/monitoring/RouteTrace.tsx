import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { RetainedRequest } from "../api";
import { adjacentEvidenceLinks, locateRouteProgress } from "./route-trace";
import { playbackStages } from "./route-playback";
import { useLocale } from "../i18n";

type StageKey = "request" | "decision" | "upstream_request" | "outcome";
type Stage = { key: StageKey; value: Record<string, unknown> | null };
type PlaybackState = "ready" | "playing" | "paused" | "completed";
type Point = { x: number; y: number };
type Link = { d: string; available: boolean; start: Point; end: Point };

interface Props {
  item: RetainedRequest | null;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PLAYBACK_DURATION = 3600;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeEvidence(stage: Stage): Record<string, unknown> | null {
  const value = stage.value;
  if (value === null) return null;
  const allowed: Record<StageKey, readonly string[]> = {
    request: ["request_id", "received_at", "strategy", "requested_model", "endpoint", "client", "stream", "max_tokens", "has_tools", "has_vision", "wants_json", "prompt_chars", "prompt_tokens", "conversation_tokens", "turn_index", "content_captured", "prompt_digest"],
    decision: ["decision_id", "strategy", "config_hash", "route", "provider", "upstream_model", "label", "reason", "mode", "turn_index", "switched_from", "blocked_by", "reasoning_effort", "reasoning_effort_source", "created_at"],
    upstream_request: ["provider", "model", "stream", "content_captured", "created_at"],
    outcome: ["ok", "finish_reason", "prompt_tokens", "completion_tokens", "total_tokens", "cost_usd", "latency_ms", "returned_model", "error_type", "recorded_at"],
  };
  return Object.fromEntries(allowed[stage.key].filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}

function outcomeClass(value: Record<string, unknown> | null): "success" | "failure" | "unknown" {
  if (value?.["ok"] === true) return "success";
  if (value?.["ok"] === false) return "failure";
  return "unknown";
}

function stageSummary(stage: Stage, t: ReturnType<typeof useLocale>["t"], formatDateTime: ReturnType<typeof useLocale>["formatDateTime"]): string {
  const value = stage.value;
  if (value === null) return t("traceUnavailable");
  if (stage.key === "request") {
    const endpoint = typeof value["endpoint"] === "string" ? value["endpoint"] : t("traceRequest");
    const receivedAt = typeof value["received_at"] === "number" ? formatDateTime(value["received_at"]) : null;
    return receivedAt === null ? endpoint : `${endpoint} · ${receivedAt}`;
  }
  if (stage.key === "decision") {
    const strategy = typeof value["strategy"] === "string" ? value["strategy"] : t("strategyUnavailable");
    const label = typeof value["label"] === "string" ? value["label"] : t("labelUnavailable");
    const provider = typeof value["provider"] === "string" ? value["provider"] : t("providerUnavailable");
    const model = typeof value["upstream_model"] === "string" ? value["upstream_model"] : t("notRecorded");
    return `${strategy} · ${label} · ${provider}/${model}`;
  }
  if (stage.key === "upstream_request") {
    const provider = typeof value["provider"] === "string" ? value["provider"] : t("providerUnavailable");
    const model = typeof value["model"] === "string" ? value["model"] : t("notRecorded");
    return `${provider} · ${model}`;
  }
  if (value["ok"] === true) return t("traceSucceeded");
  if (value["ok"] === false) {
    const errorType = typeof value["error_type"] === "string" ? value["error_type"] : null;
    return errorType === null ? t("traceFailed") : `${t("traceFailed")} · ${errorType}`;
  }
  return t("traceUnknown");
}

export function RouteTrace({ item }: Props) {
  const { t, formatDateTime } = useLocale();
  const rootRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<number | null>(null);
  const frameGenerationRef = useRef(0);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const playbackStateRef = useRef<PlaybackState>("ready");
  const [playbackState, setPlaybackState] = useState<PlaybackState>("ready");
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches);
  const [geometry, setGeometry] = useState<{ width: number; height: number; links: Link[] }>({ width: 0, height: 0, links: [] });
  const traceInstanceId = useId();

  const stages = useMemo<Stage[]>(() => [
    { key: "request", value: asRecord(item?.request) },
    { key: "decision", value: asRecord(item?.decision) },
    { key: "upstream_request", value: asRecord(item?.upstream_request) },
    { key: "outcome", value: asRecord(item?.outcome) },
  ], [item]);
  const evidenceStages = useMemo(() => stages.map((stage) => safeEvidence(stage)), [stages]);

  const stopFrame = useCallback(() => {
    frameGenerationRef.current += 1;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const resetPlayback = useCallback(() => {
    stopFrame();
    elapsedRef.current = 0;
    startedAtRef.current = 0;
    setProgress(0);
    playbackStateRef.current = "ready";
    setPlaybackState("ready");
  }, [stopFrame]);

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => {
      setReducedMotion(query.matches);
      if (query.matches && playbackStateRef.current === "playing") {
        frameGenerationRef.current += 1;
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        playbackStateRef.current = "paused";
        setPlaybackState("paused");
      } else if (!query.matches && playbackStateRef.current === "paused") {
        const button = rootRef.current?.querySelector<HTMLButtonElement>(".trace-primary");
        button?.focus();
      }
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    const list = root?.querySelector<HTMLOListElement>(".trace-stage-list");
    if (!root || !svg || !list) return;

    const updateGeometry = () => {
      const svgBox = svg.getBoundingClientRect();
      const elements = [...list.querySelectorAll<HTMLElement>("[data-trace-index]")];
      const rects = elements.map((element) => element.getBoundingClientRect());
      const points = rects.map((rect) => ({
        x: rect.left + rect.width / 2 - svgBox.left,
        y: rect.top + rect.height / 2 - svgBox.top,
      }));
      const links: Link[] = [];
      const availableLinks = adjacentEvidenceLinks(stages.map((stage) => stage.value !== null));
      for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        const fromRect = rects[index];
        const toRect = rects[index + 1];
        const stage = stages[index];
        const nextStage = stages[index + 1];
        if (!from || !to || !fromRect || !toRect || !stage || !nextStage) continue;
        const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
        const startX = horizontal ? from.x + (to.x > from.x ? fromRect.width / 2 : -fromRect.width / 2) : from.x;
        const startY = horizontal ? from.y : from.y + (to.y > from.y ? fromRect.height / 2 : -fromRect.height / 2);
        const endX = horizontal ? to.x - (to.x > from.x ? toRect.width / 2 : -toRect.width / 2) : to.x;
        const endY = horizontal ? to.y : to.y - (to.y > from.y ? toRect.height / 2 : -toRect.height / 2);
        links.push({
          d: `M ${startX} ${startY} L ${endX} ${endY}`,
          available: availableLinks[index] === true,
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
        });
      }
      setGeometry({ width: svgBox.width, height: svgBox.height, links });
    };

    updateGeometry();
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(root);
    observer.observe(list);
    window.addEventListener("resize", updateGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateGeometry);
    };
  }, [stages]);

  const tickRef = useRef<(now: number, generation: number) => void>(() => {});

  useEffect(() => () => {
    stopFrame();
    playbackStateRef.current = "ready";
  }, [stopFrame]);

  const tick = useCallback((now: number, generation: number): void => {
    if (playbackStateRef.current !== "playing" || generation !== frameGenerationRef.current) return;
    const elapsed = Math.max(0, Math.min(now - startedAtRef.current, PLAYBACK_DURATION));
    elapsedRef.current = elapsed;
    const next = elapsed / PLAYBACK_DURATION;
    setProgress(next);
    if (next >= 1) {
      frameRef.current = null;
      playbackStateRef.current = "completed";
      setPlaybackState("completed");
      return;
    }
    frameRef.current = requestAnimationFrame((time) => tickRef.current(time, generation));
  }, []);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  function replay(): void {
    if (!item) return;
    if (reducedMotion) {
      stopFrame();
      playbackStateRef.current = "completed";
      setPlaybackState("completed");
      return;
    }
    if (playbackState !== "paused") {
      elapsedRef.current = 0;
      setProgress(0);
    }
    startedAtRef.current = performance.now() - elapsedRef.current;
    playbackStateRef.current = "playing";
    setPlaybackState("playing");
    stopFrame();
    const generation = frameGenerationRef.current;
    frameRef.current = requestAnimationFrame((time) => tick(time, generation));
  }

  function pause(): void {
    if (playbackState !== "playing") return;
    // Freeze the last rendered frame, including a click between two frames.
    stopFrame();
    playbackStateRef.current = "paused";
    setPlaybackState("paused");
  }

  function reset(): void {
    resetPlayback();
  }

  const outcome = stages[3]?.value ?? null;
  const status = outcomeClass(outcome);
  const normalizedProgress = Math.max(0, Math.min(progress, 1));
  const routePosition = locateRouteProgress(
    geometry.links.map((link) => Math.hypot(link.end.x - link.start.x, link.end.y - link.start.y)),
    geometry.links.map((link) => link.available),
    normalizedProgress,
  );
  const stageState = playbackStages(stages.map((stage) => stage.value !== null), routePosition, playbackState);
  const activeIndex = stageState.activeIndex;
  const packetSegment = routePosition?.segmentIndex ?? -1;
  const packetFraction = routePosition?.segmentProgress ?? 0;
  const currentPoint = geometry.links[packetSegment]?.start;
  const nextPoint = geometry.links[packetSegment]?.end;
  const packetVisible = (playbackState === "playing" || playbackState === "paused" || (reducedMotion && normalizedProgress > 0)) && packetSegment >= 0 && currentPoint !== undefined && nextPoint !== undefined;
  const packetStyle: CSSProperties | undefined = packetVisible && currentPoint && nextPoint
    ? {
        left: currentPoint.x + (nextPoint.x - currentPoint.x) * packetFraction,
        top: currentPoint.y + (nextPoint.y - currentPoint.y) * packetFraction,
      }
    : undefined;
  const outcomeLabel = status === "success" ? t("traceSucceeded") : status === "failure" ? t("traceFailed") : t("traceUnknown");
  const statusText = playbackState === "playing" ? t("tracePlaying") : playbackState === "paused" ? t("tracePaused") : playbackState === "completed" ? t("traceCompleted") : item ? t("traceReady") : t("traceChooseRequest");

  return (
    <section ref={rootRef} id={traceInstanceId} className="route-trace" aria-label={t("traceTitle")}>
      <div className="route-trace-heading">
        <div>
          <h3>{t("traceTitle")}</h3>
          <p className="meta">{item ? String(item.request["request_id"] ?? t("unknownRequest")) : t("traceChooseRequest")}</p>
        </div>
        <span className={`trace-outcome trace-outcome-${status}`}>{outcomeLabel}</span>
      </div>
      <div className={`trace-stage-area ${reducedMotion ? "trace-stage-area-reduced" : ""}`}>
        <svg ref={svgRef} className="trace-connections" width={geometry.width} height={geometry.height} viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
          {geometry.links.map((link, index) => (
            <path key={index} className={link.available ? "trace-segment" : "trace-segment trace-segment-gap"} d={link.d} />
          ))}
        </svg>
        <ol className="trace-stage-list">
          {stages.map((stage, index) => {
            const present = stage.value !== null;
            const active = present && index === activeIndex;
            const visited = present && stageState.visited.includes(index);
            const label = stage.key === "request" ? t("traceRequest") : stage.key === "decision" ? t("traceDecision") : stage.key === "upstream_request" ? t("traceUpstream") : t("traceOutcome");
            return (
              <li className={`trace-stage${present ? "" : " trace-stage-missing"}${active ? " trace-stage-active" : ""}${visited ? " trace-stage-visited" : ""}`} data-trace-index={index} aria-current={active ? "step" : undefined} key={stage.key}>
                <span className="trace-stage-index">{visited ? "✓ " : ""}{String(index + 1).padStart(2, "0")}</span>
                <strong>{label}</strong>
                <span className="trace-stage-summary">{stageSummary(stage, t, formatDateTime)}</span>
                <details>
                  <summary>{t("traceInspectEvidence")}</summary>
                  <pre tabIndex={0}>{evidenceStages[index] === null ? t("traceUnavailable") : JSON.stringify(evidenceStages[index], null, 2)}</pre>
                </details>
              </li>
            );
          })}
        </ol>
        {packetVisible && packetStyle ? <span key={packetSegment} className="trace-packet" data-trace-segment={packetSegment} aria-hidden="true" style={packetStyle} /> : null}
      </div>
      <div className="trace-toolbar">
        <div className="trace-controls">
          <button type="button" className="trace-primary" disabled={!item || playbackState === "playing"} onClick={replay}>
            {playbackState === "paused" ? t("traceResume") : playbackState === "completed" ? t("traceReplayAgain") : t("traceReplay")}
          </button>
          <button type="button" disabled={!item || playbackState !== "playing"} onClick={pause}>{t("tracePause")}</button>
          <button type="button" disabled={!item || playbackState === "ready"} onClick={reset}>{t("traceReset")}</button>
        </div>
        <p className="trace-live-status" role="status" aria-live="polite" aria-atomic="true">{statusText}</p>
      </div>
      <p className="trace-footnote">{t("traceIllustrativeNote")}</p>
    </section>
  );
}
