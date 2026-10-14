import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";
import { workflowConfiguration } from "../fixtures/configuration";
import type { WorkflowWritePayload } from "../../src/shared/api/types";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

function fixture(): ProviderFixtureState {
  return { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
}

for (const [locale, copy] of [["en", en], ["zh-CN", zhCN]] as const) {
  test(`strategy provider selection stays separate from enablement and can be cleared in ${locale}`, async ({ page, context }) => {
    const state = fixture();
    const catalog = structuredClone(workflowConfiguration);
    const choices = state.configuration.decision.providers.map(({ id, display_name, model }) => ({ id, display_name: display_name ?? null, model: model ?? null }));
    catalog.decision_providers = choices;
    const provider = choices[0]!;
    const writes: WorkflowWritePayload[] = [];
    const validations: WorkflowWritePayload[] = [];
    await installProviderFixture(context, state);
    await page.route("**/v1/routing/configuration**", async (route) => {
      const request = route.request();
      if (request.method() === "GET") return route.fulfill({ json: catalog });
      const body = request.postDataJSON() as WorkflowWritePayload;
      expect(body.strategy).toBe(catalog.strategy);
      if (new URL(request.url()).pathname.endsWith("/validate")) {
        validations.push(body);
        return route.fulfill({ json: { valid: true, warnings: [] } });
      }
      expect(request.method()).toBe("PUT");
      writes.push(body);
      catalog.definition = structuredClone(body.definition);
      catalog.config_hash = `saved-${writes.length}`;
      return route.fulfill({ json: { applied: true, warnings: [] } });
    });
    await page.setViewportSize({ width: locale === "en" ? 1280 : 320, height: 720 });
    await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: copy.strategyEditor, exact: true }).click();
    const selector = page.getByRole("combobox", { name: copy.workflowDecisionProvider, exact: true });
    await expect(page.getByText(copy.workflowDecisionProviderNote, { exact: true })).toBeVisible();
    await selector.selectOption(provider.id);
    await page.getByRole("button", { name: copy.reviewChanges, exact: true }).click();
    await page.getByRole("button", { name: copy.confirmAndSave, exact: true }).click();
    await expect(page.locator(".workflow-toolbar[data-policy-draft]")).toHaveAttribute("data-policy-draft", "unchanged");
    expect(writes[0]?.definition.decision_provider).toBe(provider.id);
    expect(state.configuration.decision.enabled).toBe(false);
    expect(state.writes).toEqual([]);

    await page.getByRole("button", { name: copy.providerModels, exact: true }).click();
    await page.getByRole("button", { name: copy.pmDecision, exact: true }).click();
    await page.getByRole("button", { name: copy.pmDecisionEnable, exact: true }).click();
    await expect(page.getByRole("region", { name: copy.pmDecisionRouting, exact: true })).toContainText(copy.pmDecisionEnabled);
    expect(state.writes[0]?.operations).toEqual([{ action: "set_decision_enabled", enabled: true }]);
    await page.getByRole("button", { name: copy.strategyEditor, exact: true }).click();
    await expect(selector).toHaveValue(provider.id);
    await selector.selectOption("");
    await page.getByRole("button", { name: copy.reviewChanges, exact: true }).click();
    await page.getByRole("button", { name: copy.confirmAndSave, exact: true }).click();
    await expect(page.locator(".workflow-toolbar[data-policy-draft]")).toHaveAttribute("data-policy-draft", "unchanged");
    expect(writes).toHaveLength(2);
    expect(writes[1]?.definition).not.toHaveProperty("decision_provider");
    expect(validations).toEqual(writes);
    expect(state.configuration.decision.enabled).toBe(true);
    expect(state.writes).toHaveLength(1);
    await page.reload();
    await page.getByRole("button", { name: copy.strategyEditor, exact: true }).click();
    await expect(selector).toHaveValue("");
    expect(state.unexpected ?? []).toEqual([]);
  });

  test(`decision routing can be explicitly enabled and disabled in ${locale}`, async ({ page, context }) => {
    const state = fixture();
    await installProviderFixture(context, state);
    await page.setViewportSize({ width: locale === "en" ? 1280 : 320, height: 720 });
    await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: copy.providerModels, exact: true }).click();
    await page.getByRole("button", { name: copy.pmDecision, exact: true }).click();
    const control = page.getByRole("region", { name: copy.pmDecisionRouting, exact: true });
    await expect(control).toContainText(copy.pmDecisionDisabled);
    await control.getByRole("button", { name: copy.pmDecisionEnable, exact: true }).click();
    await expect(control).toContainText(copy.pmDecisionEnabled);
    expect(state.validations).toEqual(state.writes);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]?.operations).toEqual([{ action: "set_decision_enabled", enabled: true }]);
    await control.getByRole("button", { name: copy.pmDecisionDisable, exact: true }).click();
    await expect(control).toContainText(copy.pmDecisionDisabled);
    expect(state.writes).toHaveLength(2);
    expect(state.writes[1]?.operations).toEqual([{ action: "set_decision_enabled", enabled: false }]);
    expect(state.configuration.decision.enabled).toBe(false);
    expect(state.unexpected ?? []).toEqual([]);
  });
}

for (const missing of ["provider", "credential", "write_permission"] as const) {
  test(`decision enable is blocked without ${missing}`, async ({ page, context }) => {
    const state = fixture();
    if (missing === "provider") state.configuration.decision.providers = [];
    if (missing === "credential") state.configuration.decision.providers[0]!.has_api_key = false;
    if (missing === "write_permission") state.configuration.write_available = false;
    await installProviderFixture(context, state);
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.providerModels, exact: true }).click();
    await page.getByRole("button", { name: en.pmDecision, exact: true }).click();
    await expect(page.getByRole("button", { name: en.pmDecisionEnable, exact: true })).toBeDisabled();
    await expect(page.getByRole("region", { name: en.pmDecisionRouting, exact: true })).toContainText(
      missing === "provider" ? en.pmDecisionNeedsProvider : missing === "credential" ? en.pmDecisionNeedsCredential : en.pmDecisionDisabled,
    );
    expect(state.validations).toEqual([]);
    expect(state.writes).toEqual([]);
  });
}

test("held decision validation locks repeat submission and a rejected write retains disabled state", async ({ page, context }) => {
  const state = fixture();
  let release!: () => void;
  state.delayValidation = () => new Promise<void>((resolve) => { release = resolve; });
  state.rejectWrite = 500;
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.providerModels, exact: true }).click();
  await page.getByRole("button", { name: en.pmDecision, exact: true }).click();
  const enable = page.getByRole("button", { name: en.pmDecisionEnable, exact: true });
  await enable.click();
  await expect.poll(() => !!release).toBe(true);
  await expect(enable).toBeDisabled();
  expect(state.writes).toEqual([]);
  release();
  await expect(page.getByRole("alert")).toContainText(en.pmError);
  await expect(enable).toBeEnabled();
  expect(state.configuration.decision.enabled).toBe(false);
  expect(state.writes).toHaveLength(1);
  expect(state.unexpected ?? []).toEqual([]);
});
