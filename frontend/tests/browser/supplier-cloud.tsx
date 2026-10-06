import { useCallback } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider, useLocale } from "../../src/shared/i18n";
import { ProviderView } from "../../src/features/providers/suppliers/ProviderView";
import { useProviderManagement } from "../../src/features/providers/shared/useProviderManagement";
import "../../src/styles/index.css";

export function Harness() {
  const { t, setLocale } = useLocale();
  const noUnauthorized = useCallback(() => {}, []);
  const refresh = useCallback(async () => {}, []);
  const manager = useProviderManagement(true, noUnauthorized, refresh);
  return <main className="min-h-screen bg-canvas p-4 text-ink">
    <button onClick={() => setLocale("zh-CN")}>中文</button>
    <button onClick={() => setLocale("en")}>English</button>
    <button onClick={() => manager.navigationGuardRef.current?.()}>Leave workspace</button>
    <ProviderView manager={manager} t={t} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<LocaleProvider><Harness /></LocaleProvider>);
