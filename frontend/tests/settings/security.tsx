import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider, useLocale } from "@/shared/i18n";
import { api } from "@/shared/api/client";
import { useProviderManagement } from "@/features/providers/shared/useProviderManagement";
import { AccessSecurity } from "@/features/settings/AccessSecurity";
import "@/styles/index.css";

const unauthorized = () => {};
const refresh = async () => { await api.configuration(); };

export function Fixture() {
  const manager = useProviderManagement(true, unauthorized, refresh);
  const { t } = useLocale();
  const [visible, setVisible] = useState(true);
  return <main className="mx-auto grid max-w-xl gap-4 p-4">
    <button onClick={() => { if (!manager.navigationGuardRef.current || manager.navigationGuardRef.current()) setVisible(false); }}>Leave settings</button>
    <button onClick={() => setVisible(true)}>Open settings</button>
    {visible && <AccessSecurity manager={manager} t={t} />}
  </main>;
}

createRoot(document.getElementById("root")!).render(<LocaleProvider><Fixture /></LocaleProvider>);
