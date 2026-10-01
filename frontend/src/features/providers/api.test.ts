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
});
