import { afterEach, describe, expect, it, vi } from "vitest";

import { api, hasCredential, setCredential } from "./client";
import type { StrategiesPayload } from "./types";

afterEach(() => {
  setCredential(null);
  vi.unstubAllGlobals();
});

describe("registered strategies read", () => {
  it.each([
    "short", "a".repeat(8193), " fixture-management-key", "fixture-management-key ",
    "fixture interior space", "fixture-management-\u00a0key",
    "fixture-密钥-management", "fixture-management-\tkey", "fixture-management-\x00key",
    "fixture-management-\nkey", "fixture-management-\rkey", "fixture-management-\x7fkey",
  ])("rejects invalid setup keys before any POST (case %#)", async (key) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.initialize("fixture", key)).rejects.toMatchObject({ code: "invalid_setup_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bootstraps with only the revision and supplied key, then authenticates reads from memory", async () => {
    const status = { required: true, local_setup_available: true, revision: "fixture", has_providers: false, has_models: false, routing_ready: false, next_step: "gateway_key" };
    const calls: Array<{ path: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      calls.push({ path, init });
      return { ok: true, json: async () => status };
    }));
    await expect(api.setup()).resolves.toEqual(status);
    expect(new Headers(calls[0]!.init.headers).has("Authorization")).toBe(false);
    await api.initialize("fixture", "fixture-management-key");
    expect(calls[1]!.path).toBe("/v1/setup");
    expect(calls[1]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ expected_revision: "fixture", api_key: "fixture-management-key" });
    expect(new Headers(calls[1]!.init.headers).has("Authorization")).toBe(false);
    expect(hasCredential()).toBe(true);
    await api.setup();
    expect(new Headers(calls[2]!.init.headers).get("Authorization")).toBe("Bearer fixture-management-key");
  });
  it("uses the existing authenticated read endpoint without changing persistence", async () => {
    const payload: StrategiesPayload = {
      object: "list",
      default: "task_aware",
      data: [{ name: "task_aware", description: null, policy: {} }],
    };
    const fetchMock = vi.fn(async (_path: string, init: RequestInit) => {
      expect(init.cache).toBe("no-store");
      expect(new Headers(init.headers).get("Authorization")).toBe(
        "Bearer example-key",
      );
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal("fetch", fetchMock);
    setCredential("example-key");

    await expect(api.strategies()).resolves.toEqual(payload);
    await expect(api.policy()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/routing/strategies",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/routing/policy",
      expect.any(Object),
    );
  });
});

describe("managed gateway credential activation", () => {
  it.each(["setup", "gateway"] as const)("waits for %s activation before retrying an early unauthorized read", async (endpoint) => {
    const key = "fixture-rotated-management-key";
    setCredential("fixture-previous-key");
    let releaseWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const headers: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      if (init.method === "POST" || init.method === "PUT") {
        expect(path).toBe(endpoint === "setup" ? "/v1/setup" : "/v1/gateway-credential");
        expect(JSON.parse(String(init.body))).toEqual(endpoint === "setup" ? { expected_revision: "fixture", api_key: key } : { expected_revision: "fixture", credential: { action: "set", value: key } });
        await pendingWrite;
        return new Response(JSON.stringify({ revision: "activated" }), { status: 200 });
      }
      const authorization = new Headers(init.headers).get("Authorization")!;
      headers.push(authorization);
      return authorization === `Bearer ${key}`
        ? new Response(JSON.stringify({ revision: "activated" }), { status: 200 })
        : new Response(JSON.stringify({ error: { code: "invalid_api_key" } }), { status: 401 });
    }));
    const write = endpoint === "setup" ? api.initialize("fixture", key) : api.saveGatewayCredential({ expected_revision: "fixture", credential: { action: "set", value: key } });
    let settled = false;
    const read = api.setup().then((result) => { settled = true; return result; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(headers).toEqual(["Bearer fixture-previous-key"]);
    releaseWrite();
    await write;
    await expect(read).resolves.toEqual({ revision: "activated" });
    expect(headers).toEqual(["Bearer fixture-previous-key", `Bearer ${key}`]);
  });

  it.each(["setup", "gateway"] as const)("keeps the active key when a %s write fails and exposes the unauthorized read", async (endpoint) => {
    setCredential("fixture-previous-key");
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => new Response(JSON.stringify({ error: { code: init.method ? "revision_conflict" : "invalid_api_key" } }), { status: init.method ? 409 : 401 })));
    const write = endpoint === "setup" ? api.initialize("fixture", "fixture-rejected-key") : api.saveGatewayCredential({ expected_revision: "fixture", credential: { action: "set", value: "fixture-rejected-key" } });
    await expect(write).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
    await expect(api.setup()).rejects.toMatchObject({ status: 401, code: "invalid_api_key" });
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1]![1]?.headers).get("Authorization")).toBe("Bearer fixture-previous-key");
  });

  it("never replays an unauthorized provider mutation across credential activation", async () => {
    setCredential("fixture-previous-key");
    let releaseWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const fetchMock = vi.fn(async (path: string) => {
      if (path === "/v1/gateway-credential") {
        await pendingWrite;
        return new Response(JSON.stringify({ revision: "activated" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { code: "invalid_api_key" } }), { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const write = api.saveGatewayCredential({ expected_revision: "fixture", credential: { action: "set", value: "fixture-next-key" } });
    await expect(api.saveProviders({ expected_revision: "fixture", operations: [{ action: "set_default_model", model: null }] })).rejects.toMatchObject({ status: 401 });
    releaseWrite();
    await write;
    expect(fetchMock.mock.calls.filter(([path]) => path === "/v1/provider-configuration")).toHaveLength(1);
  });
});
