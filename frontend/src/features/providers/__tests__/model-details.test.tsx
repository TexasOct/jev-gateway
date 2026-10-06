import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelDetails } from "../models/ModelDetails";
import { providerFixture } from "../../../../tests/fixtures/provider-management";
import { en } from "@/shared/i18n/en";
import { zhCN } from "@/shared/i18n/zh-CN";

describe("configured model details", () => {
  for (const messages of [en, zhCN]) it(`projects retained configured values without credential references: ${messages.mmConfiguredDetails}`, () => {
    const model = providerFixture().models[0]!;
    model.quality = 2.5;
    model.cost.cache_read_per_million = 0;
    const html = renderToStaticMarkup(<ModelDetails id="configured-detail" model={model} connectionLabel="Fixture provider" t={(key) => messages[key]} editDisabled onEdit={() => { throw new Error("Rendering must not edit"); }} />);
    expect(html).toContain(messages.mmConfiguredDetails);
    expect(html).toContain("Fixture provider");
    expect(html).toContain("2.5");
    expect(html).toContain(messages.mmDetailUnknown);
    expect(html).toContain(messages.mmCacheRead);
    expect(html).not.toContain(messages.pmLimitUnknown);
    expect(html).toContain("disabled");
    expect(html).not.toContain("FIXTURE_KEY");
    expect(html).not.toContain("fixture/existing");
    expect(html).not.toContain("Sources and evidence");
  });
});
