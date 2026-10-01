import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/shared/api/client";
import type { RoutingActivityPayload } from "@/shared/api/types";
import { ACTIVITY_REQUEST_TIMEOUT_MS, activityFreshFor, mayReadActivity } from "./activity-gates";

const ACTIVITY_POLL_INTERVAL_MS = 3_000;

export function useRouteActivity(active: boolean, needsKey: boolean, onUnauthorized: () => void) {
  const [activity, setActivity] = useState<RoutingActivityPayload | null>(null);
  const [activityError, setActivityError] = useState(false);
  const [activitySequence, setActivitySequence] = useState(0);
  const [activityPollKick, setActivityPollKick] = useState(0);
  const activityGeneration = useRef(0);
  const activitySampleGeneration = useRef(0);
  const activityRequest = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);
  const activityFreshnessTimer = useRef<number | null>(null);

  const clearActivityFreshnessTimer = useCallback(() => {
    if (activityFreshnessTimer.current === null) return;
    window.clearTimeout(activityFreshnessTimer.current);
    activityFreshnessTimer.current = null;
  }, []);

  const clearRoutingActivity = useCallback((failed: boolean) => {
    activitySampleGeneration.current += 1;
    clearActivityFreshnessTimer();
    setActivity(null);
    setActivityError(failed);
  }, [clearActivityFreshnessTimer]);

  const stop = useCallback((failed: boolean) => {
    activityGeneration.current += 1;
    activityRequest.current?.controller.abort();
    clearRoutingActivity(failed);
  }, [clearRoutingActivity]);

  const retry = useCallback(() => {
    stop(false);
    setActivityPollKick((kick) => kick + 1);
  }, [stop]);

  const restart = useCallback(() => {
    stop(false);
    setActivitySequence((sequence) => sequence + 1);
    setActivityPollKick((kick) => kick + 1);
  }, [stop]);

  const loadRoutingActivity = useCallback((): Promise<void> => {
    if (!mayReadActivity(document.visibilityState, active, needsKey)) return Promise.resolve();
    const current = activityRequest.current;
    if (current !== null) return current.promise;

    const generation = ++activityGeneration.current;
    const dispatchedAt = performance.now();
    const controller = new AbortController();
    let timeout = 0;
    const timedOut = new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => {
        controller.abort();
        reject(new Error("Routing activity request timed out"));
      }, ACTIVITY_REQUEST_TIMEOUT_MS);
    });
    const promise = (async () => {
      try {
        const payload = await Promise.race([api.routingActivity(controller.signal), timedOut]);
        if (generation !== activityGeneration.current || controller.signal.aborted) return;
        if (!payload.complete) {
          clearRoutingActivity(true);
          return;
        }

        const freshFor = activityFreshFor(dispatchedAt, performance.now());
        if (freshFor <= 0) {
          clearRoutingActivity(true);
          return;
        }
        clearActivityFreshnessTimer();
        const sampleGeneration = ++activitySampleGeneration.current;
        setActivity(payload);
        setActivityError(false);
        activityFreshnessTimer.current = window.setTimeout(() => {
          if (sampleGeneration !== activitySampleGeneration.current) return;
          clearRoutingActivity(true);
        }, freshFor);
      } catch (caught) {
        if (generation !== activityGeneration.current) return;
        clearRoutingActivity(true);
        if (caught instanceof ApiError && caught.status === 401) {
          onUnauthorized();
          stop(true);
        }
      } finally {
        window.clearTimeout(timeout);
        if (activityRequest.current?.controller === controller) activityRequest.current = null;
      }
    })();
    activityRequest.current = { controller, promise };
    return promise;
  }, [active, clearActivityFreshnessTimer, clearRoutingActivity, needsKey, onUnauthorized, stop]);

  useEffect(() => {
    if (!active || needsKey) return;
    let disposed = false;
    let timer: number | null = null;
    let tickRunning = false;
    let tickQueued = false;

    const tick = async () => {
      const current = activityRequest.current;
      if (current !== null) await current.promise;
      if (disposed || document.visibilityState !== "visible") return;
      await loadRoutingActivity();
    };

    const requestTick = () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (tickRunning) {
        tickQueued = true;
        return;
      }
      tickRunning = true;
      void tick().finally(() => {
        tickRunning = false;
        if (disposed || document.visibilityState !== "visible") return;
        if (tickQueued) {
          tickQueued = false;
          requestTick();
          return;
        }
        timer = window.setTimeout(requestTick, ACTIVITY_POLL_INTERVAL_MS);
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        requestTick();
        return;
      }
      tickQueued = false;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      stop(true);
    };

    document.addEventListener("visibilitychange", onVisibility);
    requestTick();
    return () => {
      disposed = true;
      tickQueued = false;
      activityGeneration.current += 1;
      activityRequest.current?.controller.abort();
      if (timer !== null) window.clearTimeout(timer);
      clearRoutingActivity(true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, activityPollKick, clearRoutingActivity, loadRoutingActivity, needsKey, stop]);

  return { activity, activityError, activitySequence, retry, restart, stop };
}
