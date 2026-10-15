import { afterEach, expect, it, vi } from "vitest";
import { api, setCredential } from "./client";

afterEach(() => { vi.unstubAllGlobals(); setCredential(null); });
it("preserves live defaults and binds retained cursors and slash session IDs to their scope", async () => {
  const paths: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    paths.push(path);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic-key");
    return new Response("{}", { status: 200 });
  }));
  setCredential("synthetic-key");
  await api.sessions();
  await api.sessions("signed+live");
  await api.sessions(undefined, undefined, "retained");
  await api.sessions("signed+retained", undefined, "retained");
  await api.sessionRequests("client/session", "scope+cursor", undefined, "retained");
  expect(paths).toEqual(["/v1/routing/sessions", "/v1/routing/sessions?cursor=signed%2Blive", "/v1/routing/sessions?scope=retained", "/v1/routing/sessions?scope=retained&cursor=signed%2Bretained", "/v1/routing/sessions/client%2Fsession/requests?scope=retained&cursor=scope%2Bcursor"]);
});
it("submits diagnostics only through the explicit authenticated decision endpoint", async () => {
  const fetch = vi.fn(async (path: string, init: RequestInit) => {
    expect(path).toBe("/v1/decision-connection-test");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ provider_id: "judge" });
    return new Response(JSON.stringify({ status: "accepted", generation_tested: false }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  expect(fetch).not.toHaveBeenCalled();
  await expect(api.testDecisionConnection({ provider_id: "judge" })).resolves.toMatchObject({ generation_tested: false });
  expect(fetch).toHaveBeenCalledTimes(1);
});
