import { afterEach, describe, expect, it, vi } from "vitest";

import { api, setCredential } from "./client";
import type { StrategiesPayload } from "./types";

afterEach(() => {
  setCredential(null);
  vi.unstubAllGlobals();
});

describe("registered strategies read", () => {
  it.each([
    "short", "a".repeat(8193), " fixture-management-key", "fixture-management-key ",
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
    setCredential("fixture-management-key");
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
