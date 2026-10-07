import { test, expect } from "../fixtures/provider-browser";
import { configuredModelEdit, openProviderModels } from "../fixtures/open-provider-models";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";

test("independent current evidence retains actual upstream ID", async ({ page, context }, info) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await openProviderModels(page, "fixture");
  await configuredModelEdit(page, "fixture", "existing").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Refresh metadata sources", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await dialog.getByText("Sources and evidence", { exact: true }).click();
  const evidence = JSON.parse(await dialog.locator("[data-current-evidence]").innerText());
  await info.attach("current-evidence.json", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("current-evidence.png") });
  expect(state.metadataSelectors?.[0]).toMatchObject({ upstream_models: ["existing"] });
  expect(evidence.upstream_model).toBe("existing");
});

test("independent filtered selection preserves hidden choices and clear selection", async ({ page, context }) => {
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await openProviderModels(page, "fixture", { importModels: true });
  await page.getByRole("button", { name: "Fetch upstream models", exact: true }).click();
  await expect.poll(() => state.metadataCalls).toBe(1);
  await page.getByLabel("Search fetched models").fill("alpha");
  await page.getByRole("button", { name: "Select all visible unconfigured models" }).click();
  await page.getByLabel("Search fetched models").fill("beta");
  await page.getByRole("button", { name: "Select all visible unconfigured models" }).click();
  await expect(page.getByRole("button", { name: "Confirm and import selected models (2)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(page.getByRole("button", { name: /Confirm and import selected/ })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

for (const width of [320, 1280]) test(`independent web modal wheel footer ${width}`, async ({ page, context }, info) => {
  await page.setViewportSize({ width, height: 640 });
  const state: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  state.configuration.models[0]!.routing_overlay_fields = [];
  await installProviderFixture(context, state);
  await page.goto("/dashboard/");
  await openProviderModels(page, "fixture");
  const trigger = configuredModelEdit(page, "fixture", "existing");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.mouse.move(width / 2, 320);
  await page.mouse.wheel(0, 1800);
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  const box = await save.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(640);
  expect(await save.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`independent-wheel-${width}.png`) });
  const focusSteps: unknown[] = [];
  for (let i = 0; i < 35; i++) {
    await page.keyboard.press("Shift+Tab");
    const step = await page.evaluate(() => ({ tag: document.activeElement?.tagName, html: document.activeElement?.outerHTML.slice(0, 500), modal: document.querySelector('[role="dialog"][aria-modal="true"]')?.contains(document.activeElement) }));
    focusSteps.push(step);
    await info.attach("reverse-focus.json", { body: JSON.stringify(focusSteps), contentType: "application/json" });
    expect(step.modal).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(state.writes).toEqual([]);
});
