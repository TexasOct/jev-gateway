import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setCredential } from "@/shared/api/client";

afterEach(() => { vi.unstubAllGlobals(); setCredential(null); });
describe("provider management API", () => {
  it("uses gateway auth from the shared client and sends the fixed mutation shape", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ valid: true }) }); vi.stubGlobal("fetch", fetch);
    setCredential("synthetic-gateway-key");
    const payload = { expected_revision: "r1", operations: [{ action: "upsert" as const, kind: "llm" as const, provider: { id: "a", type: "openai", api_base: "https://example.test/v1" }, credential: { action: "set" as const, value: "synthetic-provider-key" } }] };
    await api.validateProviders(payload); await api.saveProviders(payload);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual(["/v1/provider-configuration/validate", "/v1/provider-configuration"]);
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic-gateway-key");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });
  it("posts candidate selectors and metadata lists without putting secrets in a URL", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }); vi.stubGlobal("fetch", fetch);
    const selector = { provider: { id: "a", type: "openai", api_base: "https://example.test/v1", allow_private_network: false }, credential: { action: "set" as const, value: "synthetic-key" } };
    await api.discoverModels(selector); await api.providerMetadata({ provider_id: "a", upstream_models: ["m"], refresh: true });
    expect(fetch.mock.calls[0]![0]).toBe("/v1/provider-discovery");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(selector);
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ provider_id: "a", upstream_models: ["m"], refresh: true });
  });
  it("sends the new gateway key only in a write body and uses the current key for authorization", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ valid: true, applied: true }) }); vi.stubGlobal("fetch", fetch);
    setCredential("synthetic-old-gateway-key");
    const payload = { expected_revision: "r1", credential: { action: "set" as const, value: "synthetic-new-gateway-key" } };
    await api.saveGatewayCredential(payload);
    expect(fetch.mock.calls[0]![0]).toBe("/v1/gateway-credential");
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic-old-gateway-key");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });
  it("retries a stale unauthorized read with the new memory-only credential", async () => {
    let release!: (value: unknown) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue({ ok: true, status: 200, json: async () => ({ revision: "new" }) });
    vi.stubGlobal("fetch", fetch);
    setCredential("synthetic-old-key");
    const pending = api.providerConfiguration();
    setCredential("synthetic-new-key");
    release({ ok: false, status: 401 });
    await expect(pending).resolves.toEqual({ revision: "new" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new Headers(fetch.mock.calls[1]![1].headers).get("Authorization")).toBe("Bearer synthetic-new-key");
  });
  it("does not repeat a credential write when an old request is unauthorized", async () => {
    let release!: (value: unknown) => void;
    const fetch = vi.fn().mockImplementation(() => new Promise((resolve) => { release = resolve; })); vi.stubGlobal("fetch", fetch);
    setCredential("synthetic-old-key");
    const pending = api.saveGatewayCredential({ expected_revision: "r1", credential: { action: "set", value: "synthetic-submitted-key" } });
    setCredential("synthetic-new-key");
    release({ ok: false, status: 401, json: async () => ({ error: { message: "Unauthorized" } }) });
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("defers a read's early 401 until successful rotation installs the submitted key", async () => {
    let releaseRead!: (value: unknown) => void;
    let releaseWrite!: (value: unknown) => void;
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { releaseWrite = resolve; }))
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ revision: "new" }) });
    vi.stubGlobal("fetch", fetch);
    setCredential("synthetic-old-key");
    let settled = false;
    const read = api.providerConfiguration();
    const observed = read.then(() => { settled = true; }, () => { settled = true; });
    const write = api.saveGatewayCredential({ expected_revision: "r1", credential: { action: "set", value: "synthetic-new-key" } });
    releaseRead({ ok: false, status: 401, json: async () => ({ error: { message: "Unauthorized" } }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    releaseWrite({ ok: true, status: 200, json: async () => ({ valid: true, applied: true }) });
    await write;
    await expect(read).resolves.toEqual({ revision: "new" });
    await observed;
    expect(fetch.mock.calls.map((call) => call[0])).toEqual(["/v1/provider-configuration", "/v1/gateway-credential", "/v1/provider-configuration"]);
    expect(new Headers(fetch.mock.calls[2]![1].headers).get("Authorization")).toBe("Bearer synthetic-new-key");
  });
  it("preserves normal unauthorized handling when the pending rotation fails", async () => {
    let releaseRead!: (value: unknown) => void;
    let releaseWrite!: (value: unknown) => void;
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { releaseWrite = resolve; }));
    vi.stubGlobal("fetch", fetch);
    setCredential("synthetic-old-key");
    const read = expect(api.providerConfiguration()).rejects.toMatchObject({ status: 401 });
    const write = expect(api.saveGatewayCredential({ expected_revision: "r1", credential: { action: "set", value: "synthetic-new-key" } })).rejects.toMatchObject({ status: 500 });
    releaseRead({ ok: false, status: 401, json: async () => ({ error: { message: "Unauthorized" } }) });
    releaseWrite({ ok: false, status: 500, json: async () => ({ error: { message: "Write failed" } }) });
    await Promise.all([read, write]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
