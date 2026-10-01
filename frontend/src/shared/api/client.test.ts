import { afterEach, describe, expect, it, vi } from "vitest";

import { api, setCredential } from "./client";
import type { StrategiesPayload } from "./types";

afterEach(() => {
  setCredential(null);
  vi.unstubAllGlobals();
});

describe("registered strategies read", () => {
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
