import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/en";
import { ProviderView } from "../suppliers/ProviderView";
import type { ProviderManagement } from "../shared/useProviderManagement";
import type { ProviderConfiguration } from "@/shared/api/types";

const configuration: ProviderConfiguration = {
  revision: "fixture", write_available: true,
  gateway: { api_key_env: "FIXTURE_GATEWAY_KEY", has_api_key: true }, gateway_bootstrap_available: false,
  providers: [{ id: "fixture", display_name: "Fixture supplier", type: "openai", api_base: "https://example.test/v1", api_key_env: "FIXTURE_KEY" }],
  decision: { enabled: false, default_provider: null, timeout_seconds: 1, providers: [] },
  models: [], presets: [], provider_types: ["openai"], decision_protocols: ["system_one"],
};
function manager() {
  return { configuration, pending: false, loading: false, error: null, navigationGuardRef: { current: null } } as ProviderManagement;
}
describe("supplier workspace ownership", () => {
  it("embeds configured models and disclosed discovery under their supplier", () => {
    const html = renderToStaticMarkup(<ProviderView manager={manager()} t={(key) => en[key]} />);
    expect(html).toContain("Supplier connections");
    expect(html).toContain("Configured models: 0");
    expect(html).toContain("Discover and import models");
    expect(html).toContain("Fetch upstream models");
    expect(html).not.toContain("Gateway access key");
    expect(html).not.toContain("FIXTURE_GATEWAY_KEY");
    expect(html).not.toContain("FIXTURE_KEY");
  });
  it("offers no standalone model navigation or details button", () => {
    const html = renderToStaticMarkup(<ProviderView manager={manager()} t={(key) => en[key]} />);
    expect(html).toContain("Configured models: 0");
    expect(html).not.toContain("Manage models");
    expect(html).not.toContain("View details");
  });
});
