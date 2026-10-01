import type { SessionRequestsPayload, SessionsPayload } from "@/shared/api/types";

const session = (n: number) => ({
  session_id: `session-${n}`,
  route: "balanced",
  provider: "fixture-provider",
  upstream_model: "fixture-model",
  strategy: "balanced",
  label: "default",
  turn_count: 1,
  updated_at: 1_700_000_000 + n,
  latest_request: { request_id: `request-${n}`, received_at: 1_700_000_000 + n, ok: true, content_captured: false },
});

export const sessionsPageOne: SessionsPayload = {
  storage: { enabled: true }, evidence_available: true,
  data: Array.from({ length: 10 }, (_, index) => session(index + 1)),
  page_size: 10, next_cursor: "fixture-page-2", has_more: true,
};
export const sessionsPageTwo: SessionsPayload = {
  storage: { enabled: true }, evidence_available: true,
  data: Array.from({ length: 10 }, (_, index) => session(index + 11)),
  page_size: 10, next_cursor: null, has_more: false,
};

export const emptyDetail: SessionRequestsPayload = {
  session: { session_id: "session-1" }, storage: { enabled: true }, evidence_available: true,
  requests: [], page_size: 8, next_cursor: null, has_more: false,
};

export function sessionRequestsPageOne(sessionId: string): SessionRequestsPayload {
  return {
    session: { session_id: sessionId }, storage: { enabled: true }, evidence_available: true,
    requests: Array.from({ length: 8 }, (_, index) => ({
      request: { request_id: `request-${index + 1}`, received_at: 1_700_000_100 + index },
      decision: { strategy: "balanced", label: "default" },
      upstream_request: { model: "fixture-model", marker: index },
      outcome: { ok: true },
    })),
    page_size: 8, next_cursor: "fixture-request-page-2", has_more: true,
  };
}

export function sessionRequestsPageTwo(sessionId: string): SessionRequestsPayload {
  return {
    session: { session_id: sessionId }, storage: { enabled: true }, evidence_available: true,
    requests: Array.from({ length: 8 }, (_, index) => ({
      request: { request_id: `request-${index + 9}`, received_at: 1_700_000_200 + index },
      decision: { strategy: "balanced", label: "default" },
      upstream_request: { model: "fixture-model", marker: index + 8 },
      outcome: { ok: index !== 2 },
    })),
    page_size: 8, next_cursor: null, has_more: false,
  };
}

export function sessionDetail(id: string): SessionRequestsPayload {
  const n = Number(id.replace("session-", "")) || 1;
  return {
    session: { session_id: id }, storage: { enabled: true }, evidence_available: true,
    requests: [{
      request: { request_id: `request-${n}`, received_at: 1_700_000_000 + n },
      decision: { strategy: "balanced", label: "default" },
      upstream_request: null,
      outcome: { ok: true },
    }], page_size: 8, next_cursor: null, has_more: false,
  };
}
