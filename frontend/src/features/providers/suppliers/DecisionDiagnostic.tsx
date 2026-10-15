import { useLayoutEffect, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import { api, ApiError } from "@/shared/api/client";
import type { DecisionConnectionResult, ProviderSelector } from "@/shared/api/types";
import type { useLocale } from "@/shared/i18n";
import { useWorkspaceActive } from "@/shared/navigation/workspace-activity";
import { Button } from "@/shared/ui/button";

type Props = {
  selector: ProviderSelector | null;
  configurationGeneration?: string | number;
  disabled?: boolean;
  onUnauthorized?: () => void;
  t: ReturnType<typeof useLocale>["t"];
};
export function DecisionDiagnostic({ selector, configurationGeneration = 0, disabled = false, onUnauthorized, t }: Props) {
  const active = useWorkspaceActive();
  // This is memory-only ownership, never a storage/log/UI value. Candidate secrets
  // participate in invalidation so a result cannot certify edited credentials.
  const owner = JSON.stringify([selector, configurationGeneration]);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const admitted = useRef(false);
  const [state, setState] = useState<{ owner: string; pending: boolean; result: DecisionConnectionResult | null; error: boolean } | null>(null);
  useLayoutEffect(() => {
    const requests = generation;
    admitted.current = active;
    const invalidated = ++generation.current;
    void Promise.resolve().then(() => { if (generation.current === invalidated) setState(null); });
    controller.current?.abort();
    lock.current = false;
    return () => { admitted.current = false; ++requests.current; controller.current?.abort(); lock.current = false; };
  }, [owner, active]);
  const current = active && state?.owner === owner ? state : null;
  const pending = current?.pending === true;
  const test = async () => {
    if (!selector || disabled || !admitted.current || lock.current) return;
    lock.current = true;
    const operation = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setState({ owner, pending: true, result: null, error: false });
    try {
      const result = await api.testDecisionConnection(selector, abort.signal);
      if (operation === generation.current && !abort.signal.aborted) setState({ owner, pending: false, result, error: false });
    } catch (caught) {
      if (operation === generation.current && !abort.signal.aborted) {
        setState({ owner, pending: false, result: null, error: true });
        if (caught instanceof ApiError && caught.status === 401) onUnauthorized?.();
      }
    } finally { if (operation === generation.current) lock.current = false; }
  };
  const result = current?.result;
  return <div className="decision-diagnostic grid min-w-0 gap-2">
    <Button variant="outline" className="min-h-11 max-w-full justify-self-start whitespace-normal text-left" disabled={disabled || !selector || pending || !active} onClick={() => void test()}><FlaskConical aria-hidden="true" className="size-4 shrink-0" />{t(pending ? "decisionTestPending" : "decisionTest")}</Button>
    <p className="m-0 text-xs leading-5 text-ink-muted">{t("decisionTestNote")}</p>
    {result && <p role="status" className={`m-0 text-xs leading-5 [overflow-wrap:anywhere] ${result.status === "accepted" ? "text-positive" : "text-caution"}`}>{t(result.status === "accepted" ? "decisionTestAccepted" : "decisionTestFailed")} · {result.provider_id} · {result.status}{result.http_status !== null ? ` · HTTP ${result.http_status}` : ""} · {result.elapsed_ms} ms{result.answers.connectivity ? ` · connectivity: ${result.answers.connectivity.choice}` : ""}<span className="block text-ink-muted">{t(result.decision_enabled ? "pmDecisionEnabled" : "pmDecisionDisabled")}</span></p>}
    {current?.error && <p role="alert" className="m-0 text-xs text-caution">{t("decisionTestError")}</p>}
  </div>;
}
