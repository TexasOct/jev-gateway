import path from "node:path";
import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

for (const locale of ["en", "zh-CN"] as const) {
  test(`explicit synthetic decision diagnostics are safe and independent of enablement (${locale})`, async ({ page, context }) => {
    const words = locale === "en" ? en : zhCN;
    const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
    const probes: unknown[] = [];
    let release!: () => void;
    await installProviderFixture(context, state);
    await page.route("**/v1/decision-connection-test", async route => {
      probes.push(route.request().postDataJSON());
      await new Promise<void>(resolve => { release = resolve; });
      return route.fulfill({ json: { provider_id: "judge", scope: "decision_classification", synthetic: true, generation_tested: false, decision_enabled: false, status: "http_error", http_status: 404, elapsed_ms: 12, answers: {} } });
    });
    await page.setViewportSize({ width: locale === "en" ? 1280 : 320, height: 900 });
    await page.addInitScript(value => localStorage.setItem("jev-dashboard-locale", value), locale);
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: words.providerModels, exact: true }).click();
    await page.getByRole("button", { name: words.pmDecision, exact: true }).click();
    expect(probes).toEqual([]);
    const control = page.getByRole("region", { name: words.pmDecisionRouting, exact: true });
    await expect(control).toContainText(words.pmDecisionDisabled);
    await control.getByRole("button", { name: words.decisionTest, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => probes.length).toBe(1);
    await expect(control.getByRole("button", { name: words.decisionTestPending, exact: true })).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(probes).toHaveLength(1);
    release();
    await expect(control.getByRole("status").filter({ hasText: words.decisionTestFailed })).toContainText("HTTP 404");
    await expect(control).toContainText(words.pmDecisionDisabled);
    expect(probes).toEqual([{ provider_id: "judge" }]);
    expect(state.configuration.decision.enabled).toBe(false);
    expect(state.writes).toEqual([]);
    expect(state.validations).toEqual([]);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("retired diagnostic authorization and success cannot affect another mounted view", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  let release!: () => void;
  let probes = 0;
  await page.route("**/v1/decision-connection-test", async route => {
    ++probes;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 401, json: { error: { message: "Synthetic retired authentication" } } }).catch(() => undefined);
  });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.providerModels, exact: true }).click();
  await page.getByRole("button", { name: en.pmDecision, exact: true }).click();
  await page.getByRole("button", { name: en.decisionTest, exact: true }).click();
  await expect.poll(() => probes).toBe(1);
  await page.getByRole("button", { name: en.pmLLM, exact: true }).click();
  release();
  await expect(page.getByRole("button", { name: en.pmLLM, exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: en.pmDecision, exact: true }).click();
  await expect(page.getByRole("button", { name: en.decisionTest, exact: true })).toBeEnabled();
  await expect(page.getByText(en.decisionTestError, { exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("current diagnostic 401 suspends, reconnect resets pending ownership and a new synthetic test can pass", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  let calls = 0;
  await page.route("**/v1/decision-connection-test", async route => {
    if (++calls === 1) return route.fulfill({ status: 401, json: { error: { message: "Synthetic current authorization" } } });
    return route.fulfill({ json: { provider_id: "judge", scope: "decision_classification", synthetic: true, generation_tested: false, decision_enabled: false, status: "accepted", http_status: 200, elapsed_ms: 8, answers: { connectivity: { choice: "ready" } } } });
  });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.providerModels, exact: true }).click();
  await page.getByRole("button", { name: en.pmDecision, exact: true }).click();
  await page.getByRole("button", { name: en.decisionTest, exact: true }).click();
  await expect(page.getByRole("button", { name: en.connect, exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: en.apiKey, exact: true }).fill("synthetic-classification-reconnect");
  await page.getByRole("button", { name: en.connect, exact: true }).click();
  await expect(page.getByRole("button", { name: en.decisionTest, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: en.decisionTest, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: en.decisionTestAccepted })).toContainText("connectivity: ready");
  expect(calls).toBe(2);
  expect(state.configuration.decision.enabled).toBe(false);
  expect(state.writes).toEqual([]);
});

test("strategy readiness uses the real global switch and its diagnostic dialog returns keyboard focus", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  let probes = 0;
  await page.route("**/v1/decision-connection-test", async route => {
    ++probes;
    return route.fulfill({ json: { provider_id: "judge", scope: "decision_classification", synthetic: true, generation_tested: false, decision_enabled: false, status: "accepted", http_status: 200, elapsed_ms: 5, answers: { connectivity: { choice: "ready" } } } });
  });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: en.classificationOff })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: en.classificationProviderReady })).toBeVisible();
  const trigger = page.getByRole("button", { name: en.decisionManage, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: en.pmDecisionRouting, exact: true });
  await expect(dialog).toBeVisible();
  expect(probes).toBe(0);
  await dialog.getByRole("button", { name: en.decisionTest, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("status").filter({ hasText: en.decisionTestAccepted })).toBeVisible();
  await page.screenshot({ path: path.resolve("../.trellis/tasks/10-15-routing-session-inspector/research/ui-screenshots/after-strategy-diagnostic.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await trigger.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  expect(probes).toBe(1);
  expect(state.writes).toEqual([]);
  expect(state.configuration.decision.enabled).toBe(false);
});
