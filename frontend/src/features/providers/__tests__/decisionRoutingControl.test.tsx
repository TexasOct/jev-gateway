import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProviderConfiguration, ProviderProfile } from "@/shared/api/types";
import { en } from "@/shared/i18n/en";
import { zhCN } from "@/shared/i18n/zh-CN";
import { DecisionRoutingControl } from "../suppliers/DecisionRoutingControl";

const provider: ProviderProfile = {
  id: "judge", has_api_key: true, protocol: "system_one", api_key_env: "PRIVATE_REFERENCE", api_base: "https://fixture.example/evaluate",
};
const decision: ProviderConfiguration["decision"] = {
  enabled: false, default_provider: null, timeout_seconds: 5,
  providers: [provider],
};

describe("decision routing readiness", () => {
  for (const copy of [en, zhCN]) {
    it("explains disabled routing and permits explicit enabling with a configured credential", () => {
      const html = renderToStaticMarkup(<DecisionRoutingControl decision={decision} disabled={false} onToggle={() => {}} t={(key) => copy[key]} />);
      expect(html).toContain(copy.pmDecisionDisabled);
      expect(html).toContain(copy.pmDecisionEnable);
      expect(html).not.toContain("disabled=");
      expect(html).not.toContain("PRIVATE_REFERENCE");
    });
    it.each(["provider", "credential"] as const)("blocks enabling without a %s", (missing) => {
      const configuration = { ...decision, providers: missing === "provider" ? [] : [{ ...provider, has_api_key: false }] };
      const html = renderToStaticMarkup(<DecisionRoutingControl decision={configuration} disabled={false} onToggle={() => {}} t={(key) => copy[key]} />);
      expect(html).toContain(copy[missing === "provider" ? "pmDecisionNeedsProvider" : "pmDecisionNeedsCredential"]);
      expect(html).toContain("disabled=");
    });
    it("allows disabling after credential loss and honors write locks", () => {
      const configuration = { ...decision, enabled: true, providers: [{ ...provider, has_api_key: false }] };
      const unlocked = renderToStaticMarkup(<DecisionRoutingControl decision={configuration} disabled={false} onToggle={() => {}} t={(key) => copy[key]} />);
      expect(unlocked).toContain(copy.pmDecisionDisable);
      expect(unlocked).not.toContain("disabled=");
      const locked = renderToStaticMarkup(<DecisionRoutingControl decision={configuration} disabled onToggle={() => {}} t={(key) => copy[key]} />);
      expect(locked).toContain("disabled=");
    });
  }
});
