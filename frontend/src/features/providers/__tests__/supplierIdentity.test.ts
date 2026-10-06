import { describe, expect, it } from "vitest";
import { newSupplierIdentity } from "../suppliers/supplierIdentity";

describe("supplier instance identities", () => {
  it("allocates independent instances of one brand and avoids credential consumers", () => {
    const profiles = [
      { id: "deepseek", display_name: "Personal", api_key_env: "DEEPSEEK_API_KEY" },
      { id: "deepseek-2", api_key_env: "JEV_DEEPSEEK_3_API_KEY", param_env: { token: "JEV_DEEPSEEK_3_API_KEY_2" } },
    ];
    expect(newSupplierIdentity("deepseek", profiles, "JEV_DEEPSEEK_3_API_KEY_3")).toEqual({ id: "deepseek-3", api_key_env: expect.stringMatching(/^JEV_DEEPSEEK_3_[A-F0-9]{32}_API_KEY$/) });
  });
  it("does not derive identities from display names and creates legal custom references", () => {
    const profiles = [{ id: "supplier", display_name: "First", api_key_env: "JEV_SUPPLIER_API_KEY" }];
    const first = newSupplierIdentity("supplier", profiles);
    profiles[0]!.display_name = "Renamed";
    const next = newSupplierIdentity("supplier", profiles);
    expect(next.id).toEqual(first.id);
    expect(next.api_key_env).not.toEqual(first.api_key_env);
    expect(newSupplierIdentity("供应商", []).id).toEqual("supplier");
    expect(newSupplierIdentity("123_proxy", []).api_key_env).toMatch(/^[A-Z_][A-Z0-9_]*$/);
  });
});
