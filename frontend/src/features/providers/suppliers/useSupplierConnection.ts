import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWorkspaceActive } from "@/shared/navigation/workspace-activity";
import { api, ApiError } from "@/shared/api/client";
import type { ProviderConnectionResult, ProviderKind, ProviderSelector } from "@/shared/api/types";

export type SupplierConnectionResult = ProviderConnectionResult;
export const connectionStatusKeys = {
  success: "spTestSuccess", authentication_error: "spTestAuthentication",
  address_error: "spTestAddress", network_error: "spTestNetwork",
  unsupported: "spTestUnsupported", incomplete: "spTestIncomplete",
} as const;

export async function probeSupplierConnection(selector: ProviderSelector, kind: ProviderKind, signal?: AbortSignal): Promise<SupplierConnectionResult> {
  if (kind === "decision") {
    return { provider_id: "provider_id" in selector ? selector.provider_id : selector.provider.id, status: "unsupported", scope: "model_listing", model_count: null, warnings: [] };
  }
  return api.testProviderConnection(selector, signal);
}

export function useSupplierConnection(onUnauthorized?: () => void, configurationGeneration = 0) {
  const enabled = useWorkspaceActive();
  const enabledRef = useRef(enabled);
  const [result, setResult] = useState<SupplierConnectionResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) { ++generation.current; controller.current?.abort(); }
    const requests = generation;
    return () => { enabledRef.current = false; ++requests.current; controller.current?.abort(); };
  }, [enabled]);
  useEffect(() => { if (!enabled) void Promise.resolve().then(() => setPending(false)); }, [enabled]);
  const reset = useCallback(() => {
    ++generation.current;
    controller.current?.abort();
    setResult(null); setError(null); setPending(false);
  }, []);
  useLayoutEffect(() => {
    const invalidated = ++generation.current;
    controller.current?.abort();
    void Promise.resolve().then(() => {
      if (generation.current === invalidated) { setResult(null); setError(null); setPending(false); }
    });
  }, [configurationGeneration]);
  useEffect(() => () => { ++generation.current; controller.current?.abort(); }, []);
  const test = useCallback(async (selector: ProviderSelector, kind: ProviderKind) => {
    if (!enabledRef.current) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const request = ++generation.current;
    setResult(null); setError(null);
    setPending(true);
    try {
      const response = await probeSupplierConnection(selector, kind, active.signal);
      if (request === generation.current && !active.signal.aborted) setResult(response);
    } catch (caught) {
      if (request === generation.current && !active.signal.aborted) {
        const status = caught instanceof ApiError ? caught.status : 0;
        setError(status);
        if (status === 401) onUnauthorized?.();
      }
    } finally {
      if (request === generation.current) setPending(false);
    }
  }, [onUnauthorized]);
  return { result, error, pending, reset, test, statusKey: result ? connectionStatusKeys[result.status] : null };
}
