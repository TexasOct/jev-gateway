import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/shared/api/client";
import { useLocale } from "@/shared/i18n";
import { applyPalette, buildPalette, DEFAULT_SEED, normalizeSeed } from "@/shared/theme/palette";
const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeToSystemScheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function systemSchemeIsDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

type Run = (work: () => Promise<void>) => Promise<void>;
type Translate = ReturnType<typeof useLocale>["t"];
export type SchemePreference = "system" | "light" | "dark";

export function useDashboardTheme(run: Run, t: Translate) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [savedSeed, setSavedSeed] = useState(DEFAULT_SEED);
  const savedSeedRef = useRef(DEFAULT_SEED);
  const [schemePreference, setSchemePreference] = useState<SchemePreference>("system");
  const [notice, setNotice] = useState<string | null>(null);
  const [themeLoading, setThemeLoading] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [themeWritePending, setThemeWritePending] = useState(false);
  const themeWriteBusy = useRef(false);
  const queuedThemeSeed = useRef<string | null>(null);
  const saveThemeRef = useRef<(nextSeed?: string) => void>(() => {});
  const themeReadGeneration = useRef(0);
  const systemDark = useSyncExternalStore(subscribeToSystemScheme, systemSchemeIsDark);

  const palette = useMemo(() => buildPalette(seed), [seed]);
  const resolvedScheme: "light" | "dark" =
    schemePreference === "system" ? (systemDark ? "dark" : "light") : schemePreference;
  const activePalette = resolvedScheme === "dark" ? palette.dark : palette.light;

  useEffect(() => {
    applyPalette(activePalette, document.documentElement);
  }, [activePalette]);

  const loadTheme = useCallback(async () => {
    if (themeWriteBusy.current) return;
    const generation = ++themeReadGeneration.current;
    setThemeLoading(true);
    setThemeError(null);
    setNotice(null);
    try {
      const payload = await api.theme();
      if (generation !== themeReadGeneration.current) return;
      const normalized = normalizeSeed(payload.seed);
      if (normalized !== null) {
        setSeed(normalized);
        setSavedSeed(normalized);
        savedSeedRef.current = normalized;
      }
    } catch (caught) {
      if (generation !== themeReadGeneration.current) return;
      const message = caught instanceof Error ? caught.message : String(caught);
      setThemeError(message);
      throw caught;
    } finally {
      if (generation === themeReadGeneration.current) setThemeLoading(false);
    }
  }, []);

  const saveTheme = useCallback((nextSeed: string = seed) => {
    const normalized = normalizeSeed(nextSeed);
    if (themeWriteBusy.current) {
      if (normalized !== null) queuedThemeSeed.current = normalized;
      return;
    }
    setNotice(null);
    setThemeError(null);
    queuedThemeSeed.current = null;
    if (normalized === null) {
      setNotice(t("invalidSeed"));
      return;
    }
    themeWriteBusy.current = true;
    ++themeReadGeneration.current;
    setSeed(normalized);
    setThemeLoading(false);
    setThemeWritePending(true);
    void run(async () => {
      try {
        const payload = await api.saveTheme(normalized);
        const stored = normalizeSeed(payload.seed) ?? normalized;
        setSeed(stored);
        setSavedSeed(stored);
        savedSeedRef.current = stored;
        setNotice(t("themeSaved"));
      } catch (caught) {
        setThemeError(caught instanceof Error ? caught.message : String(caught));
        throw caught;
      } finally {
        themeWriteBusy.current = false;
        setThemeWritePending(false);
        const queuedSeed = queuedThemeSeed.current;
        queuedThemeSeed.current = null;
        if (queuedSeed !== null && queuedSeed !== savedSeedRef.current) {
          queueMicrotask(() => saveThemeRef.current(queuedSeed));
        }
      }
    });
  }, [run, seed, t]);
  useEffect(() => {
    saveThemeRef.current = saveTheme;
  }, [saveTheme]);

  const resetTheme = useCallback(() => {
    if (themeWriteBusy.current) return;
    setNotice(null);
    setThemeError(null);
    themeWriteBusy.current = true;
    ++themeReadGeneration.current;
    setThemeLoading(false);
    setThemeWritePending(true);
    void run(async () => {
      try {
        await api.resetTheme();
        setSeed(DEFAULT_SEED);
        setSavedSeed(DEFAULT_SEED);
        savedSeedRef.current = DEFAULT_SEED;
        setNotice(t("themeReset"));
      } catch (caught) {
        setThemeError(caught instanceof Error ? caught.message : String(caught));
        throw caught;
      } finally {
        themeWriteBusy.current = false;
        setThemeWritePending(false);
      }
    });
  }, [run, t]);

  const changeSeed = useCallback((nextSeed: string) => {
    setSeed(nextSeed);
    setNotice(null);
    setThemeError(null);
  }, []);
  const clearNotice = useCallback(() => setNotice(null), []);

  return {
    seed, savedSeed, schemePreference, setSchemePreference, activePalette,
    resolvedScheme, notice, themeLoading, themeError, themeWritePending,
    loadTheme, saveTheme, resetTheme, changeSeed, clearNotice,
  };
}
