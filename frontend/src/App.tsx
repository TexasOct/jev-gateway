import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

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
import {
  DEFAULT_SEED,
  applyPalette,
  buildPalette,
  contrastRows,
  normalizeSeed,
} from "./theme/palette";
import type { Palette } from "./theme/palette";

type View = "monitoring" | "configuration";
type SchemePreference = "system" | "light" | "dark";

const OBSERVED_CONDITIONS: Record<string, string> = {
  no_recent_data: "No recent data",
  all_observed_attempts_succeeded: "All observed attempts succeeded",
  mixed_outcomes: "Mixed outcomes",
  all_observed_attempts_failed: "All observed attempts failed",
};

const PROVIDER_COLUMNS = [
  "Provider",
  "Key",
  "Attempts",
  "Completed",
  "Succeeded",
  "Failed",
  "Incomplete",
  "Avg. duration",
  "Latest result",
  "Observed",
];

function formatStamp(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === 0) return "Not recorded";
  return new Date(seconds * 1000).toLocaleString();
}

function storageNote(payload: {
  evidence_available: boolean;
  storage: { error?: string | null };
}): string {
  if (payload.evidence_available) {
    return "Retained evidence available. Values are best effort and may be incomplete.";
  }
  const error = payload.storage.error;
  return error === null || error === undefined
    ? "Retained evidence is unavailable. Live session state is still shown."
    : `Retained evidence is unavailable: ${error}`;
}

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

function providerCells(row: ProviderRow): string[] {
  return [
    `${row.id} (${row.type})`,
    row.has_api_key ? "Resolved" : "Not resolved",
    row.attempts === null ? "Not recorded" : String(row.attempts),
    row.completed === null ? "Not recorded" : String(row.completed),
    row.succeeded === null ? "Not recorded" : String(row.succeeded),
    row.failed === null ? "Not recorded" : String(row.failed),
    row.incomplete_evidence === null ? "Not recorded" : String(row.incomplete_evidence),
    row.average_latency_ms === null ? "Not recorded" : `${row.average_latency_ms.toFixed(1)} ms`,
    row.last_outcome_at === null
      ? "Not recorded"
      : `${formatStamp(row.last_outcome_at)} (${row.last_outcome_ok ? "succeeded" : "failed"})`,
    row.observed_condition === null
      ? "Evidence unavailable"
      : (OBSERVED_CONDITIONS[row.observed_condition] ?? row.observed_condition),
  ];
}

function JsonBlock({ name, value }: { name: string; value: unknown }) {
  return (
    <details>
      <summary>{name}</summary>
      <pre>{value === null || value === undefined ? "Not recorded" : JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function RequestCard({ item }: { item: RetainedRequest }) {
  const request = item.request;
  const requestId = typeof request["request_id"] === "string" ? request["request_id"] : "unknown request";
  const receivedAt = typeof request["received_at"] === "number" ? request["received_at"] : null;
  const outcome = item.outcome;
  const status =
    outcome === null
      ? "pending or rejected"
      : outcome["ok"] === true
        ? "succeeded"
        : "failed";
  const statusClass =
    outcome === null ? "meta" : outcome["ok"] === true ? "status-ok" : "status-bad";
  return (
    <article className="card">
      <h3>{formatStamp(receivedAt)}</h3>
      <div className="meta">
        {requestId} · <span className={statusClass}>{status}</span>
      </div>
      <JsonBlock name="1. Inbound request" value={item.request} />
      <JsonBlock name="2. Routing decision" value={item.decision} />
      <JsonBlock name="3. LiteLLM request" value={item.upstream_request} />
      <JsonBlock name="Outcome" value={item.outcome} />
    </article>
  );
}

function ContrastTable({ palette }: { palette: Palette }) {
  const rows = contrastRows(palette);
  return (
    <div className="table-wrap">
      <table className="contrast-table">
        <thead>
          <tr>
            <th>Pair</th>
            <th>Ratio</th>
            <th>Target</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td data-label="Pair">{row.label}</td>
              <td className="ratio" data-label="Ratio">
                {row.ratio.toFixed(2)}:1
              </td>
              <td className="ratio" data-label="Target">
                {row.target}:1
              </td>
              <td data-label="Result" className={row.pass ? "pass" : "fail"}>
                {row.pass ? "pass" : "below target"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Swatches({ palette }: { palette: Palette }) {
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
          {label}
          <code>{value}</code>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("monitoring");
  const [needsKey, setNeedsKey] = useState(!hasCredential());
  const [keyDraft, setKeyDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProvidersPayload | null>(null);
  const [sessions, setSessions] = useState<SessionsPayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionRequestsPayload | null>(null);
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
        setError("Authentication required. Enter the gateway API key to continue.");
        return;
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  const loadTheme = useCallback(async () => {
    const payload = await api.theme();
    const normalized = normalizeSeed(payload.seed);
    if (normalized !== null) {
      setSeed(normalized);
      setSavedSeed(normalized);
    }
  }, []);

  const loadMonitoring = useCallback(async () => {
    const [providerPayload, sessionPayload] = await Promise.all([
      api.providers(),
      api.sessions(),
    ]);
    setProviders(providerPayload);
    setSessions(sessionPayload);
  }, []);

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
      await loadMonitoring();
      await loadConfiguration();
      await loadTheme();
    });
  }, [loadConfiguration, loadMonitoring, loadTheme, run]);

  const reloadConfiguration = useCallback(async () => {
    await run(async () => {
      await loadConfiguration();
      await loadMonitoring();
    });
  }, [loadConfiguration, loadMonitoring, run]);

  const selectSession = useCallback(
    (sessionId: string) => {
      setSelected(sessionId);
      void run(async () => {
        setDetail(await api.sessionRequests(sessionId));
      });
    },
    [run],
  );

  const connect = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (keyDraft.trim() === "") {
        setError("Enter the gateway API key.");
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
    [keyDraft, loadMonitoring, loadTheme, run],
  );

  const openView = useCallback(
    (next: View) => {
      setView(next);
      if (needsKey || next !== "configuration") return;
      void run(loadConfiguration);
    },
    [loadConfiguration, needsKey, run],
  );

  const saveTheme = useCallback(() => {
    const normalized = normalizeSeed(seed);
    if (normalized === null) {
      setNotice("Enter a color such as #3b66d9.");
      return;
    }
    void run(async () => {
      const payload = await api.saveTheme(normalized);
      const stored = normalizeSeed(payload.seed) ?? normalized;
      setSeed(stored);
      setSavedSeed(stored);
      setNotice("Theme seed saved.");
    });
  }, [run, seed]);

  const resetTheme = useCallback(() => {
    void run(async () => {
      await api.resetTheme();
      setSeed(DEFAULT_SEED);
      setSavedSeed(DEFAULT_SEED);
      setNotice("Theme reset to the default seed.");
    });
  }, [run]);

  const writeDisabled = configuration !== null && !configuration.write_available;

  return (
    <>
      <header>
        <div className="title">
          <h1>JEV gateway</h1>
          <div className="subtitle">Live process state and retained routing evidence</div>
        </div>
        <nav className="toolbar" aria-label="Views">
          <button
            type="button"
            aria-pressed={view === "monitoring"}
            onClick={() => openView("monitoring")}
          >
            Monitoring
          </button>
          <button
            type="button"
            aria-pressed={view === "configuration"}
            onClick={() => openView("configuration")}
          >
            Configuration
          </button>
        </nav>
        <div className="toolbar">
          <label>
            Theme
            <select
              value={schemePreference}
              onChange={(event) =>
                setSchemePreference(event.target.value as SchemePreference)
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          {needsKey ? null : (
            <button type="button" onClick={() => void refresh()}>
              Refresh
            </button>
          )}
        </div>
      </header>

      <main className={view === "monitoring" ? "split" : undefined}>
        {needsKey ? (
          <section className="panel">
            <h2>Connect</h2>
            <p className="meta">
              The gateway keeps credentials in this page's memory only. Nothing is written to
              storage or the URL.
            </p>
            <form className="form-row" onSubmit={connect}>
              <input
                type="password"
                value={keyDraft}
                autoComplete="off"
                aria-label="Gateway API key"
                placeholder="Gateway API key"
                onChange={(event) => setKeyDraft(event.target.value)}
              />
              <button type="submit">Connect</button>
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
              <h2>Current sessions</h2>
              <div className="meta">
                {sessions === null ? "Loading…" : storageNote(sessions)}
              </div>
              <div className="sessions">
                {sessions === null || sessions.data.length === 0 ? (
                  <div className="empty">No live sessions.</div>
                ) : (
                  sessions.data.map((session: SessionRow) => {
                    const latest = session.latest_request ?? null;
                    const preview =
                      latest === null
                        ? "No retained request"
                        : latest.content_captured === true
                          ? (latest.prompt ?? "Empty user message")
                          : "Content not captured";
                    const status =
                      latest === null
                        ? "pending"
                        : latest.ok === true
                          ? "succeeded"
                          : latest.ok === false
                            ? "failed"
                            : "pending";
                    return (
                      <button
                        key={session.session_id}
                        type="button"
                        className={`session${session.session_id === selected ? " active" : ""}`}
                        aria-pressed={session.session_id === selected}
                        onClick={() => selectSession(session.session_id)}
                      >
                        <span className="route">{session.route ?? "Route unavailable"}</span>
                        <span className="meta">{session.session_id}</span>
                        <span className="meta">{preview}</span>
                        <span className="meta">
                          {[
                            session.strategy ?? "strategy unavailable",
                            session.label ?? "label unavailable",
                            session.provider && session.upstream_model
                              ? `${session.provider}/${session.upstream_model}`
                              : "provider unavailable",
                            `${session.turn_count ?? 0} turns`,
                            status,
                          ].join(" · ")}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="panel">
              <h2>{selected === null ? "Select a session" : selected}</h2>
              <div className="meta">
                {detail === null ? "No session selected." : storageNote(detail)}
              </div>
              <div className="timeline">
                {detail === null ? (
                  <div className="empty">Choose a live session to inspect retained requests.</div>
                ) : detail.requests.length === 0 ? (
                  <div className="empty">No retained requests for this live session.</div>
                ) : (
                  detail.requests.map((item, index) => (
                    <RequestCard key={`${index}`} item={item} />
                  ))
                )}
              </div>
            </section>

            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              <h2>Retained outcomes, last 15 minutes</h2>
              <p className="meta">
                Best-effort retained evidence, not provider health. Missing outcomes are incomplete
                evidence, never active requests or concurrency.
              </p>
              <div className="meta">
                {providers === null ? "Loading…" : storageNote(providers)}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {PROVIDER_COLUMNS.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {providers === null || providers.providers.length === 0 ? (
                      <tr>
                        <td colSpan={PROVIDER_COLUMNS.length} className="empty">
                          No configured providers.
                        </td>
                      </tr>
                    ) : (
                      providers.providers.map((row) => (
                        <tr key={row.id}>
                          {providerCells(row).map((cell, index) => (
                            <td key={PROVIDER_COLUMNS[index] ?? String(index)} data-label={PROVIDER_COLUMNS[index]}>
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
        ) : (
          <>
            <section className="panel">
              <h2>Theme seed</h2>
              <p className="meta">
                Only the seed is stored. The palette and contrast measurements are derived in the
                browser with chroma-js.
              </p>
              {notice === null ? null : <div className="notice">{notice}</div>}
              {writeDisabled ? (
                <div className="notice warn">
                  Configuration writes are disabled because gateway.api_key_env is not configured.
                </div>
              ) : null}
              <div className="form-row">
                <input
                  type="color"
                  aria-label="Seed color"
                  value={activePalette.accent}
                  onChange={(event) => setSeed(event.target.value)}
                />
                <input
                  type="text"
                  aria-label="Seed color hex"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
                <button type="button" onClick={saveTheme} disabled={writeDisabled}>
                  Save seed
                </button>
                <button type="button" onClick={resetTheme} disabled={writeDisabled}>
                  Reset to default
                </button>
              </div>
              <div className="meta">
                Saved seed: <code>{savedSeed}</code>
              </div>
              <Swatches palette={activePalette} />
            </section>

            <section className="panel">
              <h2>Measured contrast ({resolvedScheme})</h2>
              <ContrastTable palette={activePalette} />
            </section>

            {configuration === null ? (
              <section className="panel" style={{ gridColumn: "1 / -1" }}>
                <h2>Routing configuration</h2>
                <div className="empty">Loading…</div>
              </section>
            ) : (
              <RoutingEditor
                key={configuration.config_hash}
                config={configuration}
                onReloaded={reloadConfiguration}
                onError={setError}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
