import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { useProviderManagement } from "../../src/features/providers/shared/useProviderManagement";
import { useSupplierConnection } from "../../src/features/providers/suppliers/useSupplierConnection";
import { WorkspaceActivity } from "../../src/shared/navigation/workspace-activity";
import { ProviderModels } from "../../src/features/providers/models/ProviderModels";
import { LocaleProvider, useLocale } from "../../src/shared/i18n";
import type { ProviderManagement } from "../../src/features/providers/shared/useProviderManagement";

export function Consumer({ manager }: { manager: ProviderManagement }) {
  const probe = useSupplierConnection(manager.onUnauthorized);
  const { t } = useLocale();
  return <>
    <button onClick={() => void probe.test({ provider_id: "fixture" }, "llm")}>Probe</button>
    <output data-probe>{JSON.stringify({ pending: probe.pending, result: probe.result, error: probe.error })}</output>
    <ProviderModels providerId="fixture" selector={{ provider_id: "fixture" }} manager={manager} t={t} onDirtyChange={() => undefined} />
  </>;
}
export function Harness() {
  const [active, setActive] = useState(true);
  const [refreshes, setRefreshes] = useState(0);
  const unauthorized = useCallback(() => setActive(false), []);
  const refresh = useCallback(async () => { setRefreshes((value) => value + 1); }, []);
  const manager = useProviderManagement(active, unauthorized, refresh);
  return <LocaleProvider>
    <button onClick={() => setActive(false)}>Suspend</button><button onClick={() => setActive(true)}>Resume</button>
    <button onClick={() => void manager.load()}>Reload</button>
    <button onClick={() => void manager.save([{ action: "set_default_model", model: "fixture/existing" }])}>Write default</button>
    <button onClick={() => void manager.save([{ action: "upsert", kind: "llm", provider: { id: "fixture", display_name: "Changed", type: "openai", api_base: "https://new.example.test/v1", api_key_env: "FIXTURE_KEY" }, credential: { action: "keep" } }])}>Write supplier</button>
    <output data-manager>{JSON.stringify({ active, pending: manager.pending, revision: manager.configuration?.revision, evidence: manager.evidence.map((item) => item.upstream_model), source: manager.sourceResponse && { generation: manager.sourceResponse.generation, upstreamModels: manager.sourceResponse.upstreamModels }, catalogRefreshFailed: manager.catalogRefreshFailed, refreshes })}</output>
    <WorkspaceActivity.Provider value={active}><Consumer manager={manager} /></WorkspaceActivity.Provider>
  </LocaleProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
