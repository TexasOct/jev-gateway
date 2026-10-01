import type { SessionRow, SessionsPayload } from "@/shared/api/types.js";
import { appendUnique } from "./pagination.js";

export interface RegisteredStrategy {
  name: string;
  description?: string | null;
  kind?: string;
  policy?: Record<string, unknown>;
}

export interface StrategiesPayload {
  object: "list";
  default: string;
  data: RegisteredStrategy[];
}

export interface ObservedDestination {
  id: string | null;
  source: "model" | "route" | "unknown";
  count: number;
}

export interface StrategyDistribution {
  name: string;
  count: number;
  destinations: ObservedDestination[];
}

export interface SessionDistribution {
  complete: boolean;
  sessions: SessionRow[];
  strategies: StrategyDistribution[];
  unattributed: StrategyDistribution;
  unregistered: StrategyDistribution[];
}

function destination(session: SessionRow): Pick<ObservedDestination, "id" | "source"> {
  if (session.provider?.trim() && session.upstream_model?.trim()) {
    return { id: `${session.provider}/${session.upstream_model}`, source: "model" };
  }
  if (session.route?.trim()) return { id: session.route, source: "route" };
  return { id: null, source: "unknown" };
}

function group(name: string, sessions: SessionRow[]): StrategyDistribution {
  const destinations = new Map<string, ObservedDestination>();
  for (const session of sessions) {
    const target = destination(session);
    const key = JSON.stringify([target.source, target.id]);
    const existing = destinations.get(key);
    if (existing) existing.count += 1;
    else destinations.set(key, { ...target, count: 1 });
  }
  return { name, count: sessions.length, destinations: [...destinations.values()] };
}

/** Page walks are best effort: dedupe by stable session ID and never call an unfinished walk a zero. */
export function distributeSessions(
  registered: readonly RegisteredStrategy[],
  pages: readonly SessionsPayload[],
  complete: boolean,
): SessionDistribution {
  const sessions = pages.reduce<SessionRow[]>((current, page) => appendUnique(current, page.data, (row) => row.session_id), []);
  const byStrategy = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const name = session.strategy?.trim() || "";
    const rows = byStrategy.get(name) ?? [];
    rows.push(session);
    byStrategy.set(name, rows);
  }
  const strategies = registered.map(({ name }) => group(name, byStrategy.get(name) ?? []));
  const known = new Set(registered.map(({ name }) => name));
  return {
    complete: complete && pages.length > 0 && pages[pages.length - 1]?.has_more === false,
    sessions,
    strategies,
    unattributed: group("", byStrategy.get("") ?? []),
    unregistered: [...byStrategy].flatMap(([name, rows]) => name !== "" && !known.has(name) ? [group(name, rows)] : []),
  };
}
