import { useCallback, useState } from "react";
import type { useLocale } from "@/shared/i18n";
import { DEFAULT_SEED, normalizeSeed } from "@/shared/theme/palette";
import { Pencil } from "lucide-react";

type Translate = ReturnType<typeof useLocale>["t"];

export interface AppearanceViewProps {
  seed: string;
  locale: "en" | "zh-CN";
  onLocaleChange: (locale: "en" | "zh-CN") => void;
  schemePreference: "system" | "light" | "dark";
  onSchemeChange: (scheme: "system" | "light" | "dark") => void;
  notice: string | null;
  loading?: boolean;
  error?: string | null;
  onSeedChange: (seed: string) => void;
  t: Translate;
}

const PRESETS = [
  { seed: DEFAULT_SEED, label: "themeBlue" },
  { seed: "#16856b", label: "themeGreen" },
  { seed: "#c45b36", label: "themeTerracotta" },
] as const;

export default function AppearanceView({
  seed,
  locale,
  onLocaleChange,
  schemePreference,
  onSchemeChange,
  notice,
  loading = false,
  error = null,
  onSeedChange,
  t,
}: AppearanceViewProps) {
  const selectedSeed = normalizeSeed(seed) ?? DEFAULT_SEED;
  const [pickerDraft, setPickerDraft] = useState<{ seed: string; value: string } | null>(null);
  const pickerSeed = pickerDraft?.seed === selectedSeed ? pickerDraft.value : selectedSeed;
  const controlsDisabled = loading;
  const customSelected = !PRESETS.some(({ seed: preset }) => preset === selectedSeed);
  const bindPicker = useCallback((input: HTMLInputElement | null) => {
    if (input === null) return;
    // React's color-input onChange also fires for native input previews.
    const onChange = () => {
      if (input.disabled) return;
      setPickerDraft(null);
      onSeedChange(input.value);
    };
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  }, [onSeedChange]);

  return (
    <section aria-label={t("appearance")} aria-busy={loading} className="min-w-0">
      <ul className="m-0 list-none divide-y divide-outline rounded-lg border border-outline bg-panel p-0">
        <li className="grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1fr)] sm:items-center">
          <label htmlFor="settings-language" className="text-sm font-medium text-ink">{t("language")}</label>
          <select id="settings-language" aria-label={t("language")} data-settings-language value={locale} onChange={(event) => onLocaleChange(event.target.value as "en" | "zh-CN")} className="min-h-9 w-full rounded-md border border-outline bg-panel py-2 ps-2 pe-4 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <option value="en">{t("english")}</option>
            <option value="zh-CN">{t("chinese")}</option>
          </select>
        </li>
        <li className="grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1fr)] sm:items-center">
          <label htmlFor="settings-color-scheme" className="text-sm font-medium text-ink">{t("colorScheme")}</label>
          <select id="settings-color-scheme" aria-label={t("colorScheme")} data-settings-scheme value={schemePreference} onChange={(event) => onSchemeChange(event.target.value as "system" | "light" | "dark")} className="min-h-9 w-full rounded-md border border-outline bg-panel py-2 ps-2 pe-4 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <option value="system">{t("system")}</option>
            <option value="light">{t("light")}</option>
            <option value="dark">{t("dark")}</option>
          </select>
        </li>
        <li className="grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1fr)] sm:items-start">
          <span className="pt-2 text-sm font-medium text-ink">{t("themeColor")}</span>
          <div className="grid min-w-0 gap-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("themeColor")}>
              {PRESETS.map(({ seed: preset, label }) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={`${t(label)} ${preset}`}
                  aria-pressed={selectedSeed === preset}
                  title={`${t(label)} ${preset}`}
                  disabled={controlsDisabled}
                  onClick={() => onSeedChange(preset)}
                  className="grid size-9 shrink-0 place-items-center rounded-full border-0 p-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2 aria-pressed:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: preset }}
                />
              ))}
              <label data-custom-color data-selected={customSelected} title={t("chooseColor")} className="relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-[conic-gradient(#ef4444,#eab308,#22c55e,#06b6d4,#6366f1,#d946ef,#ef4444)] focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-primary data-[selected=true]:ring-2 data-[selected=true]:ring-primary data-[selected=true]:ring-offset-2 data-[selected=true]:ring-offset-panel has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50">
                <Pencil aria-hidden="true" focusable="false" className="pointer-events-none size-4 text-white drop-shadow" />
                <input
                  ref={bindPicker}
                  className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0"
                  type="color"
                  aria-label={t("chooseColor")}
                  title={t("chooseColor")}
                  value={pickerSeed}
                  disabled={controlsDisabled}
                  onInput={(event) => setPickerDraft({ seed: selectedSeed, value: event.currentTarget.value })}
                />
              </label>
            </div>
            {loading ? <p className="m-0 text-xs text-ink-muted" role="status">{t("loading")}</p> : null}
            {error ? <p className="m-0 break-words rounded-sm border-l-[3px] border-negative bg-panel-muted px-3 py-2.5 text-sm [overflow-wrap:anywhere]" role="alert">{error}</p> : null}
            {notice ? <p className="m-0 break-words rounded-sm border-l-[3px] border-primary bg-panel-muted px-3 py-2.5 text-sm [overflow-wrap:anywhere]" role="status">{notice}</p> : null}
          </div>
        </li>
      </ul>
    </section>
  );
}
