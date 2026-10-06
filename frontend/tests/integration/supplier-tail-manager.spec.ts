import { test, expect } from "@playwright/test";
import { installProviderFixture, providerFixture, type ProviderFixtureState } from "../fixtures/provider-management";

test("default 409 still requires an explicit successful reload before another validation", async ({ page, context }) => {
  const fixture: ProviderFixtureState = { configuration: providerFixture(), writes: [], validations: [], selectors: [] };
  await installProviderFixture(context, fixture);
  await page.goto("/dashboard/tests/integration/async-boundaries.html");
  await expect(page.locator("[data-manager]")).toContainText('"revision":"r1"');
  fixture.configuration.revision = "external-default-revision";
  await page.getByRole("button", { name: "Write default", exact: true }).click();
  await expect.poll(() => fixture.validations.length).toBe(1);
  await expect(page.locator("[data-manager]")).toContainText('"pending":false');
  await page.getByRole("button", { name: "Write default", exact: true }).click();
  expect(fixture.validations).toHaveLength(1);
  fixture.rejectRead = 500;
  const failedRead = page.waitForResponse((response) => response.url().endsWith("/v1/provider-configuration"));
  await page.getByRole("button", { name: "Reload", exact: true }).click(); await failedRead;
  await page.getByRole("button", { name: "Write default", exact: true }).click();
  expect(fixture.validations).toHaveLength(1);
  fixture.rejectRead = undefined;
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.locator("[data-manager]")).toContainText('"revision":"external-default-revision"');
  await page.getByRole("button", { name: "Write default", exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.validations.at(-1)?.expected_revision).toBe("external-default-revision");
});
