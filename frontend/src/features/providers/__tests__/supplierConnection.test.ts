import { describe, expect, it, vi } from "vitest";
import type { SupplierConnectionResult } from "../suppliers/useSupplierConnection";
import { connectionStatusKeys, probeSupplierConnection } from "../suppliers/useSupplierConnection";
import { en } from "@/shared/i18n/en";
import { zhCN } from "@/shared/i18n/zh-CN";

const { probe } = vi.hoisted(() => ({ probe: vi.fn() }));
vi.mock("@/shared/api/client", () => ({ api: { testProviderConnection: probe }, ApiError: class extends Error {} }));

describe("supplier connection probe", () => {
  it.each(Object.keys(connectionStatusKeys) as SupplierConnectionResult["status"][])("preserves %s and its model-list scope without any write", async (status) => {
    probe.mockReset();
    const response = { provider_id: "fixture", status, scope: "model_listing" as const, model_count: status === "success" ? 2 : 0, warnings: [] };
    probe.mockResolvedValue(response);
    const selector = { provider: { id: "fixture", type: "openai", api_base: "https://example.test/v1", api_key_env: "FIXTURE_KEY" }, credential: { action: "set" as const, value: "synthetic-key" } };
    const signal = new AbortController().signal;
    expect(await probeSupplierConnection(selector, "llm", signal)).toEqual(response);
    expect(probe).toHaveBeenCalledExactlyOnceWith(selector, signal);
    expect(en[connectionStatusKeys[status]]).toBeTruthy();
    expect(zhCN[connectionStatusKeys[status]]).toBeTruthy();
    expect(en.spTestScope).toContain("exactly the model-list endpoint");
    expect(en.spTestScope).toContain("does not establish generation readiness");
  });
  it("does not claim remote success or send a decision credential to an LLM probe", async () => {
    probe.mockReset();
    expect(await probeSupplierConnection({ provider_id: "judge" }, "decision")).toMatchObject({ status: "unsupported", scope: "model_listing", model_count: null });
    expect(probe).not.toHaveBeenCalled();
  });
  it("preserves API errors for the hook's safe HTTP-status feedback", async () => {
    probe.mockRejectedValueOnce(new Error("synthetic-private-message"));
    await expect(probeSupplierConnection({ provider_id: "fixture" }, "llm")).rejects.toThrow("synthetic-private-message");
  });
});
