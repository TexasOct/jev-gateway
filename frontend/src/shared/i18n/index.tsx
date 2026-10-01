import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { en } from "./en";
import { zhCN } from "./zh-CN";

const LOCALE_STORAGE_KEY = "jev-dashboard-locale";
export type Locale = "en" | "zh-CN";
type Messages = Record<string, string>;

const messages = { en, "zh-CN": zhCN } satisfies Record<Locale, Messages>;

export function hasMatchingMessageKeys(dictionary: Record<string, Messages>): boolean {
  const englishKeys = Object.keys(dictionary.en ?? {}).sort();
  const chineseKeys = Object.keys(dictionary["zh-CN"] ?? {}).sort();
  return englishKeys.length > 0 && englishKeys.length === chineseKeys.length && englishKeys.every((key, index) => key === chineseKeys[index]);
}

function resolveLocale(value: string | null | undefined): Locale | null {
  return value === "en" || value === "zh-CN" ? value : null;
}

function preferredLocale(languages: readonly string[]): Locale {
  return languages.some((language) => language.toLowerCase() === "zh-cn" || language.toLowerCase().startsWith("zh-"))
    ? "zh-CN"
    : "en";
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof typeof en) => string;
  formatDateTime: (seconds: number | null | undefined) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function initialLocale(): Locale {
  try {
    const stored = resolveLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
    if (stored !== null) return stored;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return preferredLocale(typeof navigator === "undefined" ? [] : navigator.languages);
}

function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // The selected language still applies for this page if storage is unavailable.
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    t: (key) => messages[locale][key] ?? messages.en[key],
    formatDateTime: (seconds) => seconds === null || seconds === undefined || seconds === 0
      ? messages[locale].notRecorded
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(seconds * 1000)),
  }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (context === null) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}

function useTranslation() {
  return useLocale();
}

export { LocaleProvider, useLocale, useTranslation, messages };
