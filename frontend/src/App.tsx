import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ApiError, api, hasCredential, setCredential } from "./api";
import type {
  ConfigurationPayload,
  ProviderRow,
  ProvidersPayload,
  RetainedRequest,
  SessionRequestsPayload,
  SessionRow,
  SessionsPayload,
} from "./api";
import RoutingEditor from "./config/RoutingEditor";
import { useLocale } from "./i18n";
import { VirtualList } from "./monitoring/VirtualList";
import { appendUnique } from "./monitoring/pagination";
import {
  DEFAULT_SEED,
  applyPalette,
  buildPalette,
  contrastRows,
  normalizeSeed,
} from "./theme/palette";
import type { Palette } from "./theme/palette";

type View = "monitoring" | "strategy" | "appearance";
type SchemePreference = "system" | "light" | "dark";

const PROVIDER_COLUMNS = ["provider", "key", "attempts", "completed", "successful", "unsuccessful", "incomplete", "avgDuration", "latestResult", "observed"] as const;

const DARK_QUERY = "(prefers-color-scheme: dark)";
const CONTRAST_LABELS = {
  "body text on page": "contrastBodyPage", "body text on panel": "contrastBodyPanel",
  "muted text on page": "contrastMutedPage", "accent text on page": "contrastAccentPage",
  "label on accent": "contrastLabelAccent", "panel border": "contrastPanelBorder",
  "success status": "contrastSuccess", "failure status": "contrastFailure",
  "warning status": "contrastWarning",
} as const;
const SWATCH_LABELS = {
  accent: "paletteAccent", "accent hover": "paletteAccentHover", surface: "paletteSurface",
  "surface alt": "paletteSurfaceAlt", code: "paletteCode", border: "paletteBorder",
  success: "paletteSuccess", failure: "paletteFailure", warning: "paletteWarning",
} as const;

function subscribeToSystemScheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function systemSchemeIsDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

function storageNote(payload: { evidence_available: boolean; storage: { error?: string | null } }, t: ReturnType<typeof useLocale>["t"]): string {
  if (payload.evidence_available) return t("evidenceAvailable");
  const error = payload.storage.error;
  return error === null || error === undefined
    ? t("evidenceLiveOnly")
    : `${t("evidenceUnavailable")}: ${error}`;
}

function providerCells(row: ProviderRow, t: ReturnType<typeof useLocale>["t"], formatDateTime: ReturnType<typeof useLocale>["formatDateTime"]): string[] {
  return [
    `${row.id} (${row.type})`,
    row.has_api_key ? t("resolvedYes") : t("resolvedNo"),
    row.attempts === null ? t("notRecorded") : String(row.attempts),
    row.completed === null ? t("notRecorded") : String(row.completed),
    row.succeeded === null ? t("notRecorded") : String(row.succeeded),
    row.failed === null ? t("notRecorded") : String(row.failed),
    row.incomplete_evidence === null ? t("notRecorded") : String(row.incomplete_evidence),
    row.average_latency_ms === null ? t("notRecorded") : `${row.average_latency_ms.toFixed(1)} ms`,
    row.last_outcome_at === null
      ? t("notRecorded")
      : `${formatDateTime(row.last_outcome_at)} (${row.last_outcome_ok ? t("succeeded") : t("failed")})`,
    row.observed_condition === null
      ? t("evidenceUnavailable")
      : ({
          no_recent_data: t("noRecentData"),
          all_observed_attempts_succeeded: t("allSucceeded"),
          mixed_outcomes: t("mixedOutcomes"),
          all_observed_attempts_failed: t("allFailed"),
        }[row.observed_condition] ?? row.observed_condition),
  ];
}

function JsonBlock({ name, value, empty }: { name: string; value: unknown; empty: string }) {
  return (
    <details>
      <summary>{name}</summary>
      <pre>{value === null || value === undefined ? empty : JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function RequestCard({ item, t, formatDateTime }: { item: RetainedRequest; t: ReturnType<typeof useLocale>["t"]; formatDateTime: ReturnType<typeof useLocale>["formatDateTime"] }) {
  const request = item.request;
  const requestId = typeof request["request_id"] === "string" ? request["request_id"] : t("unknownRequest");
  const receivedAt = typeof request["received_at"] === "number" ? request["received_at"] : null;
  const outcome = item.outcome;
  const status =
    outcome === null
      ? t("pendingOrRejected")
      : outcome["ok"] === true
        ? t("succeeded")
        : t("failed");
  const statusClass =
    outcome === null ? "meta" : outcome["ok"] === true ? "status-ok" : "status-bad";
  return (
    <article className="card">
      <h3>{formatDateTime(receivedAt)}</h3>
      <div className="meta">
        {requestId} · <span className={statusClass}>{status}</span>
      </div>
      <JsonBlock name={t("inboundRequest")} value={item.request} empty={t("notRecorded")} />
      <JsonBlock name={t("routingDecision")} value={item.decision} empty={t("notRecorded")} />
      <JsonBlock name={t("upstreamRequest")} value={item.upstream_request} empty={t("notRecorded")} />
      <JsonBlock name={t("outcome")} value={item.outcome} empty={t("notRecorded")} />
    </article>
  );
}

function ContrastTable({ palette, t }: { palette: Palette; t: ReturnType<typeof useLocale>["t"] }) {
  const rows = contrastRows(palette);
  return (
    <div className="table-wrap">
      <table className="contrast-table">
        <thead>
          <tr>
            <th>{t("pair")}</th>
            <th>{t("ratio")}</th>
            <th>{t("target")}</th>
            <th>{t("result")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td data-label={t("pair")}>{t(CONTRAST_LABELS[row.label as keyof typeof CONTRAST_LABELS] ?? "pair")}</td>
              <td className="ratio" data-label={t("ratio")}>
                {row.ratio.toFixed(2)}:1
              </td>
              <td className="ratio" data-label={t("target")}>
                {row.target}:1
              </td>
              <td data-label={t("result")} className={row.pass ? "pass" : "fail"}>
                {row.pass ? t("pass") : t("belowTarget")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Swatches({ palette, t }: { palette: Palette; t: ReturnType<typeof useLocale>["t"] }) {
  const variables = [
    ["accent", palette.accent],
    ["accent hover", palette.accentHover],
    ["surface", palette.surface],
    ["surface alt", palette.surfaceAlt],
    ["code", palette.codeBg],
    ["border", palette.border],
    ["success", palette.good],
    ["failure", palette.bad],
    ["warning", palette.warn],
  ] as const;
  return (
    <div className="swatches">
      {variables.map(([label, value]) => (
        <div className="swatch" key={label}>
          <span className="chip" style={{ background: value }} />
          {t(SWATCH_LABELS[label])}
          <code>{value}</code>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const { locale, setLocale, t, formatDateTime } = useLocale();
  const [view, setView] = useState<View>("monitoring");
  const [needsKey, setNeedsKey] = useState(!hasCredential());
  const [keyDraft, setKeyDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProvidersPayload | null>(null);
  const [sessions, setSessions] = useState<SessionsPayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionRequestsPayload | null>(null);
  const [sessionPageError, setSessionPageError] = useState(false);
  const [detailPageError, setDetailPageError] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sessionListEpoch, setSessionListEpoch] = useState(0);
  const [detailListEpoch, setDetailListEpoch] = useState(0);
  const sessionGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const sessionBusy = useRef(false);
  const detailBusy = useRef(false);
  const detailAbort = useRef<AbortController | null>(null);
  const [configuration, setConfiguration] = useState<ConfigurationPayload | null>(null);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [savedSeed, setSavedSeed] = useState(DEFAULT_SEED);
  const [schemePreference, setSchemePreference] = useState<SchemePreference>("system");
  const [notice, setNotice] = useState<string | null>(null);
  const systemDark = useSyncExternalStore(subscribeToSystemScheme, systemSchemeIsDark);

  const palette = useMemo(() => buildPalette(seed), [seed]);
  const resolvedScheme: "light" | "dark" =
    schemePreference === "system" ? (systemDark ? "dark" : "light") : schemePreference;
  const activePalette = resolvedScheme === "dark" ? palette.dark : palette.light;

  useEffect(() => {
    applyPalette(activePalette, document.documentElement);
  }, [activePalette]);

  const run = useCallback(async (work: () => Promise<void>) => {
    try {
      await work();
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setCredential(null);
        setNeedsKey(true);
        setError(t("authRequired"));
        return;
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [t]);

  const loadTheme = useCallback(async () => {
    const payload = await api.theme();
    const normalized = normalizeSeed(payload.seed);
    if (normalized !== null) {
      setSeed(normalized);
      setSavedSeed(normalized);
    }
  }, []);

  const loadMonitoring = useCallback(async () => {
    const generation = ++sessionGeneration.current;
    sessionBusy.current = false;
    setSessionLoading(false);
    setSessionPageError(false);
    setSessionListEpoch(generation);
    const [providerPayload, sessionPayload] = await Promise.all([
      api.providers(),
      api.sessions(),
    ]);
    if (generation === sessionGeneration.current) {
      setProviders(providerPayload);
      setSessions(sessionPayload);
    }
  }, []);

  const loadMoreSessions = useCallback(async () => {
    if (!sessions?.has_more || !sessions.next_cursor || sessionBusy.current) return;
    sessionBusy.current = true;
    setSessionLoading(true);
    const generation = sessionGeneration.current;
    try {
      const page = await api.sessions(sessions.next_cursor);
      if (generation === sessionGeneration.current) {
        setSessions((current) => current && ({ ...page, data: appendUnique(current.data, page.data, (row) => row.session_id) }));
        setSessionPageError(false);
      }
    } catch (caught) {
      if (generation === sessionGeneration.current) {
        setSessionPageError(true);
        if (caught instanceof ApiError && caught.status === 401) {
          setCredential(null);
          setNeedsKey(true);
        }
      }
    } finally {
      if (generation === sessionGeneration.current) {
        sessionBusy.current = false;
        setSessionLoading(false);
      }
    }
  }, [sessions]);

  const loadMoreDetail = useCallback(async () => {
    if (!selected || !detail?.has_more || !detail.next_cursor || detailBusy.current) return;
    detailBusy.current = true;
    setDetailLoading(true);
    const generation = detailGeneration.current;
    const controller = new AbortController();
    detailAbort.current = controller;
    try {
      const page = await api.sessionRequests(selected, detail.next_cursor, controller.signal);
      if (generation === detailGeneration.current) {
        setDetail((current) => current && ({ ...page, requests: appendUnique(current.requests, page.requests, (row) => String(row.request["request_id"])) }));
        setDetailPageError(false);
      }
    } catch (caught) {
      if (generation === detailGeneration.current && !controller.signal.aborted) {
        setDetailPageError(true);
        if (caught instanceof ApiError && caught.status === 401) {
          setCredential(null);
          setNeedsKey(true);
        }
      }
    } finally {
      if (generation === detailGeneration.current) {
        detailBusy.current = false;
        setDetailLoading(false);
      }
    }
  }, [detail, selected]);

  const loadConfiguration = useCallback(async () => {
    setConfiguration(await api.configuration());
  }, []);

  useEffect(() => {
    // Deferred one microtask on purpose: the react-hooks compiler rule rejects an
    // effect body that can reach a state setter synchronously, and this is the
    // mount-time load that decides whether the connect form is needed.
    void Promise.resolve().then(() => run(async () => {
      await loadMonitoring();
      await loadTheme();
      setNeedsKey(false);
    }));
  }, [loadMonitoring, loadTheme, run]);

  const refresh = useCallback(async () => {
    await run(async () => {
      detailAbort.current?.abort();
      const generation = ++detailGeneration.current;
      detailBusy.current = false;
      setDetailLoading(false);
      setDetailPageError(false);
      setDetailListEpoch(generation);
      setDetail(null);
      await loadMonitoring();
      if (selected !== null) {
        const controller = new AbortController();
        detailAbort.current = controller;
        const page = await api.sessionRequests(selected, undefined, controller.signal);
        if (generation === detailGeneration.current) setDetail(page);
      }
      await loadConfiguration();
      await loadTheme();
    });
  }, [loadConfiguration, loadMonitoring, loadTheme, run, selected]);

  const reloadConfiguration = useCallback(async () => {
    await run(async () => {
      await loadConfiguration();
      await loadMonitoring();
    });
  }, [loadConfiguration, loadMonitoring, run]);

  const selectSession = useCallback(
    (sessionId: string) => {
      detailAbort.current?.abort();
      const generation = ++detailGeneration.current;
      detailBusy.current = false;
      setDetailLoading(false);
      setSelected(sessionId);
      setDetail(null);
      setDetailPageError(false);
      setDetailListEpoch(generation);
      void run(async () => {
        const controller = new AbortController();
        detailAbort.current = controller;
        try {
          const page = await api.sessionRequests(sessionId, undefined, controller.signal);
          if (generation === detailGeneration.current) setDetail(page);
        } catch (caught) {
          if (!controller.signal.aborted) throw caught;
        }
      });
    },
    [run],
  );

  const connect = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (keyDraft.trim() === "") {
        setError(t("enterApiKey"));
        return;
      }
      setCredential(keyDraft.trim());
      setKeyDraft("");
      setNeedsKey(false);
      setNotice(null);
      void run(async () => {
        await loadMonitoring();
        await loadTheme();
      });
    },
    [keyDraft, loadMonitoring, loadTheme, run, t],
  );

  const openView = useCallback(
    (next: View) => {
      setView(next);
      if (needsKey) return;
      if (next === "strategy") void run(loadConfiguration);
      if (next === "appearance") void run(loadTheme);
    },
    [loadConfiguration, loadTheme, needsKey, run],
  );

  const saveTheme = useCallback(() => {
    const normalized = normalizeSeed(seed);
    if (normalized === null) {
      setNotice(t("invalidSeed"));
      return;
    }
    void run(async () => {
      const payload = await api.saveTheme(normalized);
      const stored = normalizeSeed(payload.seed) ?? normalized;
      setSeed(stored);
      setSavedSeed(stored);
      setNotice(t("themeSaved"));
    });
  }, [run, seed, t]);

  const resetTheme = useCallback(() => {
    void run(async () => {
      await api.resetTheme();
      setSeed(DEFAULT_SEED);
      setSavedSeed(DEFAULT_SEED);
      setNotice(t("themeReset"));
    });
  }, [run, t]);

  const writeDisabled = configuration !== null && !configuration.write_available;

  return (
    <>
      <header>
        <div className="title">
          <h1>JEV gateway</h1>
          <div className="subtitle">{locale === "zh-CN" ? "进程实时状态与保留的路由证据" : "Live process state and retained routing evidence"}</div>
        </div>
        <nav className="toolbar" aria-label={locale === "zh-CN" ? "视图" : "Views"}>
          <button
            type="button"
            aria-pressed={view === "monitoring"}
            onClick={() => openView("monitoring")}
          >
            {t("monitoring")}
          </button>
          <button
            type="button"
            aria-pressed={view === "strategy"}
            onClick={() => openView("strategy")}
          >
            {t("strategyEditor")}
          </button>
          <button
            type="button"
            aria-pressed={view === "appearance"}
            onClick={() => openView("appearance")}
          >
            {t("theme")}
          </button>
        </nav>
        <div className="toolbar">
          <label>
            {t("theme")}
            <select
              value={schemePreference}
              onChange={(event) =>
                setSchemePreference(event.target.value as SchemePreference)
              }
            >
              <option value="system">{t("system")}</option>
              <option value="light">{t("light")}</option>
              <option value="dark">{t("dark")}</option>
            </select>
          </label>
          <label>
            {t("language")}
            <select value={locale} onChange={(event) => setLocale(event.target.value as "en" | "zh-CN")}>
              <option value="en">{t("english")}</option>
              <option value="zh-CN">{t("chinese")}</option>
            </select>
          </label>
          {needsKey ? null : (
            <button type="button" onClick={() => void refresh()}>
              {t("refresh")}
            </button>
          )}
        </div>
      </header>

      <main className={view === "monitoring" ? "split" : undefined}>
        {needsKey ? (
          <section className="panel">
            <h2>{t("connect")}</h2>
            <p className="meta">
              {t("credentialNote")}
            </p>
            <form className="form-row" onSubmit={connect}>
              <input
                type="password"
                value={keyDraft}
                autoComplete="off"
                aria-label={t("apiKey")}
                placeholder={t("apiKey")}
                onChange={(event) => setKeyDraft(event.target.value)}
              />
              <button type="submit">{t("connect")}</button>
            </form>
          </section>
        ) : null}

        {error === null ? null : (
          <section className="panel">
            <div className="notice warn">{error}</div>
          </section>
        )}

        {view === "monitoring" ? (
          <>
            <section className="panel">
              <h2>{t("currentSessions")}</h2>
              <div className="meta">
                {sessions === null ? t("loading") : storageNote(sessions, t)}
              </div>
              <VirtualList
                key={sessionListEpoch}
                className="sessions"
                label={t("currentSessions")}
                items={sessions?.data ?? []}
                rowHeight={132}
                getKey={(session) => session.session_id}
                hasMore={Boolean(sessions?.has_more && !sessionPageError)}
                loading={sessionLoading}
                onMore={() => void loadMoreSessions()}
                footer={sessionPageError ? <button type="button" onClick={() => { setSessionPageError(false); void loadMoreSessions(); }}>{t("retryPage")}</button> : sessions?.data.length === 0 ? <div className="empty">{sessions === null ? t("loading") : t("noLiveSessions")}</div> : null}
                render={(session: SessionRow) => {
                  const latest = session.latest_request ?? null;
                  const status = latest === null ? t("pending") : latest.ok === true ? t("succeeded") : latest.ok === false ? t("failed") : t("pending");
                  return <button
                    type="button"
                    className={`session${session.session_id === selected ? " active" : ""}`}
                    aria-pressed={session.session_id === selected}
                    onClick={() => selectSession(session.session_id)}
                  >
                    <span className="route">{session.route ?? t("routeUnavailable")}</span>
                    <span className="meta">{session.session_id}</span>
                    <span className="meta">{session.first_request_at == null ? t("unknownFirstRequest") : formatDateTime(session.first_request_at)}</span>
                    <span className="meta">{[
                      session.strategy ?? t("strategyUnavailable"), session.label ?? t("labelUnavailable"),
                      session.provider && session.upstream_model ? `${session.provider}/${session.upstream_model}` : t("providerUnavailable"),
                      `${session.turn_count ?? 0} ${t("turns")}`, status,
                    ].join(" · ")}</span>
                  </button>;
                }}
              />
            </section>

            <section className="panel">
              <h2>{selected === null ? t("selectSession") : selected}</h2>
              <div className="meta">
                {detail === null ? t("noSessionSelected") : storageNote(detail, t)}
              </div>
              <VirtualList
                key={`${selected ?? "none"}-${detailListEpoch}`}
                className="timeline"
                label={t("selectSession")}
                items={detail?.requests ?? []}
                rowHeight={360}
                getKey={(item) => String(item.request["request_id"])}
                hasMore={Boolean(detail?.has_more && !detailPageError)}
                loading={detailLoading}
                onMore={() => void loadMoreDetail()}
                footer={detailPageError ? <button type="button" onClick={() => { setDetailPageError(false); void loadMoreDetail(); }}>{t("retryPage")}</button> : detail === null ? <div className="empty">{t("inspectRequests")}</div> : detail.requests.length === 0 ? <div className="empty">{t("noRetainedRequests")}</div> : null}
                render={(item) => <RequestCard item={item} t={t} formatDateTime={formatDateTime} />}
              />
            </section>

            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              <h2>{t("retainedOutcomes")}</h2>
              <p className="meta">{t("evidenceCaveat")}</p>
              <div className="meta">
                {providers === null ? t("loading") : storageNote(providers, t)}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {PROVIDER_COLUMNS.map((key) => (
                        <th key={key}>{t(key)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {providers === null || providers.providers.length === 0 ? (
                      <tr>
                        <td colSpan={PROVIDER_COLUMNS.length} className="empty">
                          {t("noConfiguredProviders")}
                        </td>
                      </tr>
                    ) : (
                      providers.providers.map((row) => (
                        <tr key={row.id}>
                          {providerCells(row, t, formatDateTime).map((cell, index) => (
                            <td key={PROVIDER_COLUMNS[index] ?? String(index)} data-label={t(PROVIDER_COLUMNS[index] ?? "provider")}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : view === "appearance" ? (
          <>
            <section className="panel">
              <h2>{t("themeSeed")}</h2>
              <p className="meta">{t("themeDerived")}</p>
              {notice === null ? null : <div className="notice">{notice}</div>}
              {writeDisabled ? (
                <div className="notice warn">
                  {t("writesDisabled")}
                </div>
              ) : null}
              <div className="form-row">
                <input
                  type="color"
                  aria-label={t("seedColor")}
                  value={activePalette.accent}
                  onChange={(event) => setSeed(event.target.value)}
                />
                <input
                  type="text"
                  aria-label={t("seedColorHex")}
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
                <button type="button" onClick={saveTheme} disabled={writeDisabled}>
                  {t("saveSeed")}
                </button>
                <button type="button" onClick={resetTheme} disabled={writeDisabled}>
                  {t("resetDefault")}
                </button>
              </div>
              <div className="meta">
                {t("savedSeed")} <code>{savedSeed}</code>
              </div>
              <Swatches palette={activePalette} t={t} />
            </section>

            <section className="panel">
              <h2>{t("measuredContrast")} ({t(resolvedScheme)})</h2>
              <ContrastTable palette={activePalette} t={t} />
            </section>

          </>
        ) : configuration === null ? (
          <section className="panel">
            <h2>{t("configuration")}</h2>
            <div className="empty">{t("loading")}</div>
          </section>
        ) : (
          <RoutingEditor
            key={configuration.config_hash}
            config={configuration}
            onReloaded={reloadConfiguration}
            onError={setError}
          />
        )}
      </main>
    </>
  );
}
